// AI spy: Blend → Search → Stalk → Strike, plus Evade and Flee.
// The brain does not know which body is its target; it keeps a belief weight
// per observed agent, updated from scanner pulses, visible suspicion (the red
// outline its target shows when exposed) and behavioural tells seen up close.

import { CONFIG } from '../config';
import { dirToYaw, moveTowardAngle, wrapAngle } from '../core/vec';
import { headCenterY } from '../sim/combat';
import { scanInfo, useDisguise, useScanner, useSmoke, type DistanceBand } from '../sim/gadgets';
import { eyeHeight } from '../sim/movement';
import type { Agent } from '../sim/types';
import type { World } from '../sim/world';
import { pickPoi, standUp, startActivity } from './civilianBrain';
import { canSee, lineOfSight } from './perception';
import { clearGoal, setGoal } from './steering';

const A = CONFIG.spyAI;
const SCAN_COS = Math.cos((A.scanConeDeg * Math.PI) / 180);

export type BotState = 'blend' | 'search' | 'stalk' | 'strike' | 'evade' | 'flee';

interface ScanMemory {
  x: number;
  z: number;
  dx: number;
  dz: number;
  band: DistanceBand;
  dist: number;
  dy: number;
  time: number;
  /** The estimated spot has been walked to; now blend in around it. */
  reached: boolean;
}

export class SpyBrain {
  state: BotState = 'blend';
  readonly skill: { reaction: number; bodyAcc: number; headChance: number; observe: number };
  readonly belief = new Map<number, number>();
  chosen = -1;
  confidence = 0;
  targetId = -1;
  private scan: ScanMemory | null = null;
  private stateTime = 0;
  private idleTimer = 0;
  private idling = false;
  private strikeId = -1;
  private retaliating = false;
  private aimTimer = 0;
  private lostSight = 0;
  private strikeVisible = true;
  private visCheck = 0;
  private readonly follow = new Map<number, number>();
  private evadeCd = 0;
  private scanDelay: number;
  private repathTimer = 0;
  private readonly nbr: number[] = [];
  private readonly w: World;
  private readonly a: Agent;

  constructor(w: World, a: Agent) {
    this.w = w;
    this.a = a;
    const r = w.rng;
    const k = r.next(); // overall skill 0..1
    this.skill = {
      reaction: A.reactionMax - (A.reactionMax - A.reactionMin) * k + r.range(-0.05, 0.05),
      bodyAcc: A.bodyAccMin + (A.bodyAccMax - A.bodyAccMin) * (0.5 * k + 0.5 * r.next()),
      headChance: A.headMin + (A.headMax - A.headMin) * r.next(),
      observe: A.observeMin + (A.observeMax - A.observeMin) * r.next(),
    };
    this.scanDelay = r.range(A.firstScanMin, A.firstScanMax);
  }

  private setState(s: BotState): void {
    if (this.state !== s) {
      this.state = s;
      this.stateTime = 0;
    }
  }

  onRespawn(): void {
    this.state = 'blend';
    this.stateTime = 0;
    this.strikeId = -1;
    this.retaliating = false;
    this.idling = false;
    this.belief.clear();
    this.follow.clear();
    this.chosen = -1;
    this.confidence = 0;
    this.scan = null;
    this.scanDelay = this.w.rng.range(1.5, 6);
    this.a.spy!.intent.aim = false;
  }

  onSpyDisguised(spyId: number): void {
    if (spyId === this.targetId) {
      // Lose the lock on the target.
      const b = this.belief.get(spyId);
      if (b !== undefined) this.belief.set(spyId, b * 0.08);
      if (this.state === 'stalk' || (this.state === 'strike' && !this.retaliating && this.strikeId === spyId)) {
        this.endStrike();
        this.setState('search');
      }
    }
  }

  // ---------------------------------------------------------------- 10 Hz
  think(dt: number): void {
    const a = this.a, s = a.spy!, w = this.w;
    if (!a.alive) return;
    this.stateTime += dt;
    this.evadeCd -= dt;
    this.scanDelay -= dt;
    this.repathTimer -= dt;

    const tgt = w.contracts.targetOf(a.id);
    if (tgt !== this.targetId) {
      this.targetId = tgt;
      this.belief.clear();
      this.chosen = -1;
      this.confidence = 0;
      this.scan = null;
      this.scanDelay = Math.min(this.scanDelay, w.rng.range(1, 4));
      if ((this.state === 'stalk' || this.state === 'strike') && !this.retaliating) {
        this.endStrike();
        this.setState('search');
      }
    }

    // Shoot back at whoever shoots us.
    if (s.lastAttacker >= 0 && w.time - s.lastAttackTime < A.retaliateTime) {
      const att = w.agents[s.lastAttacker];
      if (att.alive && att !== a && !(this.state === 'strike' && this.strikeId === att.id)) {
        if (Math.hypot(att.x - a.x, att.z - a.z) < 30 && lineOfSight(w, a, att)) {
          this.beginStrike(att.id, true);
          return;
        }
      }
    }

    this.observe(dt);

    switch (this.state) {
      case 'strike':
        return; // handled per tick in act()
      case 'flee':
        if (this.stateTime > A.fleeTime) this.setState('search');
        return;
      case 'evade':
        if (this.stateTime > A.evadeTime || (!a.hasGoal && this.stateTime > 2)) this.setState('search');
        return;
      default:
        this.decide(dt);
    }
  }

  private observe(dt: number): void {
    const a = this.a, w = this.w;
    const tgt = this.targetId;
    // Passive decay of everything first.
    for (const [id, v] of this.belief) {
      const nv = v * (1 - 0.03 * dt);
      if (nv < 0.01 || !w.agents[id].alive) this.belief.delete(id);
      else this.belief.set(id, nv);
    }
    // Threat tracking for evasion.
    let threat = -1;

    // Hearing: a silenced shot within range marks the shooter as a spy.
    for (const n of w.noises) {
      if (n.kind !== 'shot' || n.source === a.id || w.time - n.time > dt + 1e-6) continue;
      if (Math.hypot(n.x - a.x, n.z - a.z) > CONFIG.perception.hearShot) continue;
      if (tgt >= 0 && w.agents[n.source].alive) this.addBelief(n.source, A.suspiciousGain * 0.75);
    }

    w.hash.query(a.x, a.z, CONFIG.perception.range, this.nbr);
    for (const id of this.nbr) {
      if (id === a.id) continue;
      const o = w.agents[id];
      if (!o.alive) continue;
      const dx = o.x - a.x, dz = o.z - a.z;
      const d = Math.hypot(dx, dz);
      if (d > CONFIG.perception.range) continue;

      // Noticing a follower uses peripheral awareness (LOS within 10 m, no cone).
      if (d < A.noticeRadius && o.speed > 0.5) {
        const toMe = (-dx * o.vx - dz * o.vz) / (d * (o.speed || 1));
        const sameWay = a.speed > 0.5 ? (o.vx * a.vx + o.vz * a.vz) / (o.speed * a.speed) : 0;
        if ((toMe > 0.5 || sameWay > 0.7) && lineOfSight(w, a, o)) {
          const f = (this.follow.get(id) ?? 0) + dt * (o.spy ? 1 : A.civilianFollowWeight);
          this.follow.set(id, f);
          if (f > A.followNotice) threat = id;
        } else {
          this.decayFollow(id, dt);
        }
      } else {
        this.decayFollow(id, dt);
      }
      if (o.spy && o.spy.drawn && d < 15 && id !== this.strikeId && lineOfSight(w, a, o)) threat = id;

      if (tgt < 0) continue;
      const visible = canSee(w, a, o);
      if (!visible) {
        // Hearing: running footsteps nearby.
        if (o.spy && o.spy.running && d < CONFIG.perception.hearRun) this.addBelief(id, A.suspiciousGain * 0.5 * dt);
        continue;
      }
      const isTarget = id === tgt;
      let wgt = this.belief.get(id) ?? 0;
      if (o.spy && o.spy.suspicion >= CONFIG.suspicion.exposed) {
        wgt += (isTarget ? A.outlineGain : A.suspiciousGain) * dt;
        if (!isTarget && d < 12 && o.spy.suspicion > 85) threat = threat < 0 ? id : threat;
      }
      if (o.spy && o.spy.revealTimer > 0) wgt += A.suspiciousGain * dt;
      if (isTarget && d < A.observeRange && o.spy!.disguiseTimer <= 0) {
        const blend = w.blendBonus(o) !== 'none' ? A.blendObserveFactor : 1;
        wgt += this.skill.observe * (d < 10 ? 2 : 1) * blend * dt;
      }
      if (!isTarget) wgt *= 1 - A.decayPerSecond * dt;
      if (wgt > 0.01) this.belief.set(id, Math.min(6, wgt));
    }

    // Confidence.
    let best = -1, bestW = 0, sum = 0;
    for (const [id, v] of this.belief) {
      sum += v;
      if (v > bestW) {
        bestW = v;
        best = id;
      }
    }
    this.chosen = best;
    this.confidence = best >= 0 ? bestW / (sum + A.unknownPrior) : 0;

    if (threat >= 0 && this.evadeCd <= 0 && this.state !== 'strike' && this.state !== 'stalk' && threat !== this.chosen) {
      this.startEvade(threat);
    }
  }

  private decayFollow(id: number, dt: number): void {
    const f = this.follow.get(id);
    if (f === undefined) return;
    const nf = f - dt * 0.7;
    if (nf <= 0) this.follow.delete(id);
    else this.follow.set(id, nf);
  }

  private addBelief(id: number, amount: number): void {
    this.belief.set(id, Math.min(6, (this.belief.get(id) ?? 0) + amount));
  }

  private applyScan(): void {
    const a = this.a, w = this.w;
    const info = scanInfo(w, a);
    if (!info) return;
    this.scan = { x: a.x, z: a.z, dx: info.dx, dz: info.dz, band: info.band, dist: info.dist, dy: info.dy, time: w.time, reached: false };
    const lo = info.band === 'near' ? 0 : info.band === 'mid' ? CONFIG.gadgets.scanner.near - 3 : CONFIG.gadgets.scanner.mid - 3;
    const hi = info.band === 'near' ? CONFIG.gadgets.scanner.near + 3 : info.band === 'mid' ? CONFIG.gadgets.scanner.mid + 3 : 999;
    w.hash.query(a.x, a.z, CONFIG.perception.range, this.nbr);
    for (const id of this.nbr) {
      if (id === a.id) continue;
      const o = w.agents[id];
      if (!o.alive || !canSee(w, a, o)) continue;
      const dx = o.x - a.x, dz = o.z - a.z;
      const d = Math.hypot(dx, dz) || 1;
      const consistent = (dx * info.dx + dz * info.dz) / d > SCAN_COS && d >= lo && d <= hi;
      const v = this.belief.get(id) ?? 0;
      if (consistent) this.belief.set(id, Math.min(6, Math.max(v, 0.3) * 1.3));
      else if (v > 0) this.belief.set(id, v * 0.25);
    }
  }

  private decide(dt: number): void {
    const a = this.a, s = a.spy!, w = this.w;

    // Scanner use when it's safe and we're unsure.
    if (this.targetId >= 0 && s.cdScanner <= 0 && this.scanDelay <= 0 && s.suspicion < A.scanSuspicionLimit && this.confidence < A.confidence) {
      if (useScanner(w, a)) this.applyScan();
    }

    const chosen = this.chosen >= 0 ? w.agents[this.chosen] : null;
    if (chosen && chosen.alive && this.confidence >= A.confidence) {
      const d = Math.hypot(chosen.x - a.x, chosen.z - a.z) + Math.abs(chosen.y - a.y);
      if (d <= A.stalkRange) {
        this.stopIdle();
        this.setState('stalk');
        const visible = canSee(w, a, chosen, A.strikeRange + 2);
        if (d < A.strikeRange && visible && this.confidence >= A.strikeConfidence && w.time > A.openingGrace) {
          this.beginStrike(chosen.id, false);
          return;
        }
        // Keep a walking-pace tail; close in when far.
        if (d > A.stalkMin || !visible) {
          if (this.repathTimer <= 0 || !a.hasGoal) {
            setGoal(w, a, chosen.x, chosen.y, chosen.z);
            this.repathTimer = 1;
          }
        } else {
          clearGoal(a);
          a.faceYaw = dirToYaw(chosen.x - a.x, chosen.z - a.z) + w.rng.range(-0.6, 0.6);
        }
        a.maxSpeed = d > A.strikeRange ? A.hurrySpeed : CONFIG.movement.walkSpeed;
        return;
      }
      // Too far: head toward them.
      this.setState('search');
      this.stopIdle();
      a.maxSpeed = A.hurrySpeed;
      if (this.repathTimer <= 0 || !a.hasGoal) {
        setGoal(w, a, chosen.x, chosen.y, chosen.z);
        this.repathTimer = 2;
      }
      return;
    }

    if (this.scan && w.time - this.scan.time < A.scanMemory) {
      this.setState('search');
      const sc = this.scan;
      if (this.idling) {
        this.blend(dt, 12);
        // Scan the crowd in the direction the scanner pointed.
        if (a.pose !== 'sit' && w.rng.chance(0.08)) a.faceYaw = dirToYaw(sc.dx, sc.dz) + w.rng.range(-0.7, 0.7);
      } else if (!a.hasGoal) {
        const poi = a.occupiedPoi >= 0 ? w.layout.pois[a.occupiedPoi] : null;
        const atPoi = !!poi && Math.hypot(a.x - poi.x, a.z - poi.z) < 1.2;
        if (atPoi || (sc.reached && w.rng.chance(A.searchBlendChance))) {
          // Act like a commuter around here for a bit: a bench, the paper, the board.
          this.blend(dt, 12, A.searchBlendMin, A.searchBlendMax);
        } else {
          // Wander around where the scanner pointed, looking at people.
          sc.reached = true;
          w.releasePoi(a);
          const est = sc.band === 'near' ? Math.min(sc.dist, 8) : sc.band === 'mid' ? 26 : 55;
          const gx = sc.x + sc.dx * est + w.rng.range(-4, 4);
          const gz = sc.z + sc.dz * est + w.rng.range(-4, 4);
          const gy = Math.abs(sc.dy) > 2.5 ? a.y + sc.dy : a.y;
          if (Math.hypot(gx - a.x, gz - a.z) > 4) {
            setGoal(w, a, gx, gy, gz);
            // Cover long distances briskly (still under the running-suspicion threshold).
            a.maxSpeed = sc.band === 'near' ? CONFIG.movement.walkSpeed : A.hurrySpeed;
          } else {
            this.blend(dt, 10);
          }
        }
      }
      return;
    }

    this.setState('blend');
    this.blend(dt, A.blendRadius);
  }

  /** Behave like a civilian: walk to a POI, linger a little. */
  private blend(dt: number, near: number, minT = 3, maxT = 9): void {
    const a = this.a, w = this.w;
    a.maxSpeed = CONFIG.movement.walkSpeed;
    if (this.idling) {
      this.idleTimer -= dt;
      if (this.idleTimer <= 0) this.stopIdle();
      return;
    }
    if (!a.hasGoal) {
      if (a.occupiedPoi >= 0 && Math.hypot(a.x - w.layout.pois[a.occupiedPoi].x, a.z - w.layout.pois[a.occupiedPoi].z) < 1.2) {
        this.idling = true;
        this.idleTimer = startActivity(w, a, minT, maxT);
      } else {
        w.releasePoi(a);
        a.faceYaw = NaN;
        pickPoi(w, a, near > 0 ? near + 8 : 0);
      }
    }
  }

  private stopIdle(): void {
    if (this.idling || this.a.pose === 'sit') {
      standUp(this.w, this.a);
      this.idling = false;
    }
    this.w.releasePoi(this.a);
    this.a.faceYaw = NaN;
  }

  private startEvade(threat: number): void {
    const a = this.a, w = this.w, s = a.spy!;
    const t = w.agents[threat];
    this.stopIdle();
    this.endStrike();
    this.setState('evade');
    this.evadeCd = A.evadeCooldown;
    this.follow.delete(threat);
    if (s.cdDisguise <= 0) {
      useDisguise(w, a);
    } else if (s.cdSmoke <= 0) {
      a.yaw = dirToYaw(t.x - a.x, t.z - a.z);
      a.pitch = -0.35;
      useSmoke(w, a);
      a.pitch = 0;
    }
    // Escape to somewhere far from the threat, sometimes another floor.
    const wantOtherFloor = w.rng.chance(0.4);
    let best = -1, bestScore = -Infinity;
    for (let i = 0; i < 24; i++) {
      const ni = w.randomGroundNode();
      const n = w.nav.nodes[ni];
      const dSelf = Math.hypot(n.x - a.x, n.z - a.z);
      const dThreat = Math.hypot(n.x - t.x, n.z - t.z);
      let score = dThreat - Math.abs(dSelf - 22) * 0.5;
      if (wantOtherFloor && Math.abs(n.y - a.y) > 2) score += 10;
      if (score > bestScore) {
        bestScore = score;
        best = ni;
      }
    }
    if (best >= 0) {
      const n = w.nav.nodes[best];
      setGoal(w, a, n.x, n.y, n.z, best);
    }
    a.maxSpeed = CONFIG.movement.walkSpeed;
  }

  private beginStrike(id: number, retaliation: boolean): void {
    const a = this.a, w = this.w;
    this.stopIdle();
    clearGoal(a);
    let target = id;
    // Occasional misidentification when not very sure.
    if (!retaliation && this.confidence < A.lowConfidence && w.rng.chance(A.mistakeChance)) {
      const t = w.agents[id];
      w.hash.query(t.x, t.z, 5, this.nbr);
      let bestD = Infinity;
      for (const nid of this.nbr) {
        const o = w.agents[nid];
        if (!o.civ || !o.alive) continue;
        const d = Math.hypot(o.x - a.x, o.z - a.z);
        if (d < bestD && d < A.strikeRange + 2 && lineOfSight(w, a, o)) {
          bestD = d;
          target = nid;
        }
      }
    }
    this.strikeId = target;
    this.retaliating = retaliation;
    this.aimTimer = this.skill.reaction * (retaliation ? 0.8 : 1) + (a.spy!.drawn ? 0 : CONFIG.weapon.drawTime);
    this.lostSight = 0;
    this.strikeVisible = true;
    this.setState('strike');
  }

  private endStrike(): void {
    this.strikeId = -1;
    this.retaliating = false;
    this.a.spy!.intent.aim = false;
    this.a.faceYaw = NaN;
  }

  private flee(fromX: number, fromZ: number): void {
    const a = this.a, w = this.w;
    this.setState('flee');
    let best = -1, bestScore = -Infinity;
    for (let i = 0; i < 12; i++) {
      const ni = w.randomGroundNode();
      const n = w.nav.nodes[ni];
      const dSelf = Math.hypot(n.x - a.x, n.z - a.z);
      if (dSelf > 25 || Math.abs(n.y - a.y) > 2) continue;
      const score = Math.hypot(n.x - fromX, n.z - fromZ) - dSelf * 0.2;
      if (score > bestScore) {
        bestScore = score;
        best = ni;
      }
    }
    if (best >= 0) {
      const n = w.nav.nodes[best];
      setGoal(w, a, n.x, n.y, n.z, best);
    }
    a.maxSpeed = CONFIG.movement.walkSpeed;
  }

  // ---------------------------------------------------------------- 60 Hz
  act(dt: number): void {
    const a = this.a, w = this.w, s = a.spy!;
    if (!a.alive || this.state !== 'strike') {
      s.intent.aim = false;
      return;
    }
    const t = w.agents[this.strikeId];
    if (!t || !t.alive) {
      const wasTarget = this.strikeId === this.targetId || t?.kind === 'civilian';
      const fx = t ? t.x : a.x, fz = t ? t.z : a.z;
      this.endStrike();
      if (wasTarget || t?.kind === 'spy') {
        this.belief.clear();
        this.flee(fx, fz);
      } else {
        this.setState('search');
      }
      return;
    }
    const dx = t.x - a.x, dz = t.z - a.z;
    const d = Math.hypot(dx, dz);
    const ey = a.y + eyeHeight(a);
    const wantYaw = dirToYaw(dx, dz);
    const wantPitch = Math.atan2(t.y + 1.25 - ey, d);
    a.faceYaw = wantYaw;
    a.yaw = moveTowardAngle(a.yaw, wantYaw, 9 * dt);
    a.pitch += (wantPitch - a.pitch) * Math.min(1, 10 * dt);
    s.intent.aim = true;

    if (++this.visCheck % 6 === 0) this.strikeVisible = lineOfSight(w, a, t);
    if (!this.strikeVisible) {
      this.lostSight += dt;
      if (this.lostSight > A.loseSightTime) {
        this.endStrike();
        this.setState('search');
        setGoal(w, a, t.x, t.y, t.z);
      }
      return;
    }
    this.lostSight = 0;
    if (d > A.strikeRange + 6 && !this.retaliating) {
      this.endStrike();
      this.setState('stalk');
      return;
    }

    this.aimTimer -= dt;
    if (this.aimTimer > 0 || Math.abs(wrapAngle(a.yaw - wantYaw)) > 0.12) return;
    if (s.drawTimer > 0 || s.fireCooldown > 0 || s.reloadTimer > 0) return;
    if (s.ammo <= 0) {
      s.intent.reload = true;
      return;
    }
    // Accuracy roll decides where the shot actually goes.
    let px = t.x, pz = t.z, py: number;
    if (w.rng.chance(this.skill.bodyAcc)) {
      py = w.rng.chance(this.skill.headChance) ? headCenterY(t) : t.y + (t.pose === 'sit' ? 0.8 : 1.15);
    } else {
      const off = w.rng.range(0.55, 1.4) * (w.rng.chance(0.5) ? 1 : -1);
      px += (-dz / (d || 1)) * off;
      pz += (dx / (d || 1)) * off;
      py = t.y + w.rng.range(0.4, 2.2);
    }
    a.yaw = dirToYaw(px - a.x, pz - a.z);
    a.pitch = Math.atan2(py - ey, Math.hypot(px - a.x, pz - a.z));
    s.intent.fire = true;
    this.aimTimer = w.rng.range(0.15, 0.45);
  }
}
