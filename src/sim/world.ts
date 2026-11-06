// The authoritative simulation. Pure data + systems; no rendering. A future
// multiplayer server can run exactly this with player intents from the network.

import { CONFIG } from '../config';
import { Rng } from '../core/rng';
import { SpatialHash } from '../core/spatialHash';
import type { Vec3 } from '../core/vec';
import { buildGrandStation, type MapLayout } from '../world/mapData';
import { CollisionWorld } from '../world/collision';
import { NavGraph } from '../world/navGraph';
import { civilianAppearance, spyAppearances } from './appearance';
import { Contracts } from './contracts';
import { fireShot } from './combat';
import { endDisguise, segmentInSmoke, updateSmoke, useDisguise, useScanner, useSmoke } from './gadgets';
import { bodyHeight, stepMovement } from './movement';
import { killPoints, killRelation } from './scoring';
import { addSuspicion, updateSuspicion } from './suspicion';
import { emptyIntent, type Agent, type Appearance, type Noise, type SimEvent, type Smoke, type SpyIntent } from './types';
import { canSee } from '../ai/perception';
import { civilianThink, panic, standUp } from '../ai/civilianBrain';
import { followPath, clearGoal } from '../ai/steering';
import { SpyBrain } from '../ai/spyBrain';

export const BOT_NAMES = ['Kestrel', 'Marlow', 'Juniper', 'Sable', 'Cobalt', 'Wren', 'Ashby', 'Fenwick', 'Linden', 'Hollis'];

export interface WorldOptions {
  seed?: number;
  spies?: number;
  civilians?: number;
  /** Include a human-controlled player (spy index 0). */
  withPlayer?: boolean;
  layout?: MapLayout;
}

const M = CONFIG.movement;
const AI_DIVISOR = Math.round(CONFIG.sim.tickRate / CONFIG.sim.aiRate);

export class World {
  readonly layout: MapLayout;
  readonly col: CollisionWorld;
  readonly nav: NavGraph;
  readonly rng: Rng;
  readonly hash: SpatialHash;
  readonly contracts: Contracts;
  readonly agents: Agent[] = [];
  readonly spies: Agent[] = [];
  readonly player: Agent | null;
  readonly brains = new Map<number, SpyBrain>();
  readonly smokes: Smoke[] = [];
  readonly noises: Noise[] = [];
  /** Events produced since the last drain. */
  events: SimEvent[] = [];
  readonly poiOccupant: Int32Array;
  time = 0;
  tick = 0;
  timeLeft: number = CONFIG.match.roundSeconds;
  over = false;
  private readonly nbr: number[] = [];
  private readonly lastTargets = new Map<number, number>();

  constructor(opts: WorldOptions = {}) {
    this.rng = new Rng(opts.seed ?? CONFIG.seed);
    this.layout = opts.layout ?? buildGrandStation();
    this.col = new CollisionWorld(this.layout);
    this.nav = new NavGraph(this.layout, this.col);
    const b = this.layout.bounds;
    this.hash = new SpatialHash(b.minX, b.minZ, b.maxX, b.maxZ, 4);
    this.contracts = new Contracts(this.rng);
    this.poiOccupant = new Int32Array(this.layout.pois.length).fill(-1);
    for (let i = 0; i < 8; i++) {
      this.smokes.push({ active: false, phase: 'flying', x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, timer: 0, radius: 0, owner: -1 });
    }

    const spyCount = Math.max(CONFIG.match.minSpies, Math.min(CONFIG.match.maxSpies, opts.spies ?? CONFIG.match.spies));
    const civCount = opts.civilians ?? CONFIG.match.civilians;
    const looks = spyAppearances(this.rng, spyCount);
    const spawns = this.rng.shuffle([...this.layout.spawns]);
    const withPlayer = opts.withPlayer ?? true;

    for (let i = 0; i < spyCount; i++) {
      const isPlayer = withPlayer && i === 0;
      const sp = spawns[i % spawns.length];
      const a = this.makeAgent('spy', looks[i], sp.x, sp.y, sp.z, isPlayer);
      a.spy = {
        name: isPlayer ? 'You' : BOT_NAMES[(i - (withPlayer ? 1 : 0)) % BOT_NAMES.length],
        score: 0, kills: 0, deaths: 0, civKills: 0, targetKills: 0,
        suspicion: 0, proximityTimer: 0,
        drawn: false, drawTimer: 0, holsterTimer: 0, aiming: false,
        ammo: CONFIG.weapon.magSize, reloadTimer: 0, fireCooldown: 0, firePending: false,
        cdScanner: 0, cdDisguise: 0, cdSmoke: 0, scanTimer: 0, disguiseTimer: 0,
        revealTimer: 0, respawnTimer: 0,
        seenBy: new Map(), lastAttacker: -1, lastAttackTime: -100, running: false,
        intent: emptyIntent(),
      };
      a.maxSpeed = M.walkSpeed;
      this.spies.push(a);
    }
    this.player = withPlayer ? this.spies[0] : null;

    for (let i = 0; i < civCount; i++) {
      const node = this.randomGroundNode();
      const n = this.nav.nodes[node];
      const a = this.makeAgent('civilian', civilianAppearance(this.rng), n.x + this.rng.range(-0.5, 0.5), n.y, n.z + this.rng.range(-0.5, 0.5), false);
      a.civ = { state: 'wander', timer: 0, poi: -1 };
      a.maxSpeed = this.rng.range(CONFIG.civilian.minSpeed, CONFIG.civilian.maxSpeed);
      a.y = this.col.groundHeight(a.x, a.z, n.y + 0.1);
    }

    for (const s of this.spies) {
      if (!s.isPlayer) this.brains.set(s.id, new SpyBrain(this, s));
      if (this.player) s.yaw = this.rng.range(-Math.PI, Math.PI);
    }
    this.contracts.init(this.spies.map((s) => s.id));
    this.syncContracts();
  }

  private makeAgent(kind: Agent['kind'], look: Appearance, x: number, y: number, z: number, isPlayer: boolean): Agent {
    const a: Agent = {
      id: this.agents.length, kind, isPlayer,
      x, y, z, px: x, py: y, pz: z, vx: 0, vy: 0, vz: 0,
      yaw: this.rng.range(-Math.PI, Math.PI), pitch: 0, prevYaw: 0,
      wantX: 0, wantZ: 0, wantJump: false, faceYaw: NaN, speed: 0, maxSpeed: M.walkSpeed,
      crouch: false, onGround: true, pose: 'stand', seatX: 0, seatY: 0, seatZ: 0,
      animPhase: this.rng.range(0, 6.28), alive: true, health: CONFIG.health.max, deadTime: 0,
      appearance: look, baseAppearance: look,
      path: null, pathIndex: 0, goalX: 0, goalY: 0, goalZ: 0, hasGoal: false,
      laneOffset: this.rng.range(-0.55, 0.55), stuckTimer: 0, progressX: x, progressZ: z,
      occupiedPoi: -1, spy: null, civ: null,
    };
    a.prevYaw = a.yaw;
    this.agents.push(a);
    return a;
  }

  randomGroundNode(): number {
    for (;;) {
      const i = this.rng.int(this.nav.nodes.length);
      if (this.nav.inMain(i) && this.nav.nodes[i].poi < 0) return i;
    }
  }

  emit(e: SimEvent): void {
    this.events.push(e);
  }

  drainEvents(): SimEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  setPlayerIntent(it: SpyIntent): void {
    if (!this.player) return;
    Object.assign(this.player.spy!.intent, it);
  }

  // ------------------------------------------------------------------ POIs
  claimPoi(a: Agent, poi: number): void {
    this.releasePoi(a);
    this.poiOccupant[poi] = a.id;
    a.occupiedPoi = poi;
  }

  releasePoi(a: Agent): void {
    if (a.occupiedPoi >= 0 && this.poiOccupant[a.occupiedPoi] === a.id) this.poiOccupant[a.occupiedPoi] = -1;
    a.occupiedPoi = -1;
  }

  // ------------------------------------------------------------------ noise / smoke
  addNoise(x: number, y: number, z: number, kind: Noise['kind'], source: number): void {
    this.noises.push({ x, y, z, kind, source, time: this.time });
    const r = kind === 'shot' ? CONFIG.civilian.panicShotRadius : CONFIG.civilian.panicBodyRadius;
    this.hash.query(x, z, r, this.nbr);
    for (const id of this.nbr) {
      const a = this.agents[id];
      if (!a.civ || !a.alive) continue;
      if (Math.hypot(a.x - x, a.z - z) <= r && Math.abs(a.y - y) < 4) panic(this, a, x, z);
    }
  }

  panicCivilian(a: Agent, x: number, z: number): void {
    panic(this, a, x, z);
  }

  smokeBlocks(ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean {
    return segmentInSmoke(this.smokes, ax, ay, az, bx, by, bz);
  }

  acquireSmoke(): Smoke | null {
    for (const s of this.smokes) if (!s.active) return s;
    return null;
  }

  onDisguise(spyId: number): void {
    for (const brain of this.brains.values()) brain.onSpyDisguised(spyId);
  }

  // ------------------------------------------------------------------ contracts
  private syncContracts(): void {
    for (const s of this.spies) {
      const t = this.contracts.targetOf(s.id);
      if (this.lastTargets.get(s.id) !== t) {
        this.lastTargets.set(s.id, t);
        this.emit({ type: 'contract', spy: s.id, target: t });
      }
    }
  }

  /** Was the spy seen by any spy other than `except` within the window? */
  private witnessed(spy: Agent, except: number): boolean {
    for (const [obs, t] of spy.spy!.seenBy) {
      if (obs === except) continue;
      const o = this.agents[obs];
      if (!o.alive) continue;
      if (this.time - t <= CONFIG.score.unseenWindow) return true;
    }
    return false;
  }

  killAgent(victim: Agent, killer: Agent | null, headshot: boolean): void {
    if (!victim.alive) return;
    victim.alive = false;
    victim.health = 0;
    victim.deadTime = 0;
    standUp(this, victim);
    victim.pose = 'dead';
    clearGoal(victim);
    this.releasePoi(victim);
    this.addNoise(victim.x, victim.y, victim.z, 'body', victim.id);

    let relation: 'target' | 'hunter' | 'other' | 'civilian' | 'none' = 'none';
    let points = 0;
    let unseen = false;
    const killerSpy = killer && killer.spy ? killer : null;

    if (victim.spy) {
      victim.spy.deaths++;
      victim.spy.respawnTimer = CONFIG.match.respawnSeconds;
      victim.spy.drawn = false;
      victim.spy.aiming = false;
      victim.spy.scanTimer = 0;
      if (victim.spy.disguiseTimer > 0) endDisguise(this, victim);
      if (killerSpy && killerSpy !== victim) {
        const rel = killRelation(this.contracts.targetOf(killerSpy.id), this.contracts.targetOf(victim.id), killerSpy.id, victim.id, true);
        unseen = rel === 'target' && !this.witnessed(killerSpy, victim.id);
        points = killPoints(rel, headshot, unseen);
        relation = rel;
        killerSpy.spy!.kills++;
        if (rel === 'target') killerSpy.spy!.targetKills++;
        killerSpy.spy!.score += points;
        this.contracts.onKill(killerSpy.id, victim.id);
      } else {
        this.contracts.remove(victim.id);
      }
      this.syncContracts();
    } else if (killerSpy) {
      relation = 'civilian';
      points = killPoints('civilian', headshot, false);
      killerSpy.spy!.score += points;
      killerSpy.spy!.civKills++;
      killerSpy.spy!.revealTimer = CONFIG.score.revealSeconds;
      this.emit({ type: 'reveal', spy: killerSpy.id });
    }
    this.emit({
      type: 'kill', killer: killer ? killer.id : -1, victim: victim.id, victimKind: victim.kind,
      relation, points, headshot, unseen,
    });
  }

  /** Spawn point far from living spies (randomised among the good ones). */
  pickSpawn(selfId: number): Vec3 {
    const scored = this.layout.spawns.map((sp) => {
      let minD = Infinity;
      for (const s of this.spies) {
        if (!s.alive || s.id === selfId) continue;
        minD = Math.min(minD, Math.hypot(s.x - sp.x, s.z - sp.z) + Math.abs(s.y - sp.y));
      }
      return { sp, d: minD + this.rng.next() * 6 };
    });
    scored.sort((a, b) => b.d - a.d);
    const good = scored.filter((s) => s.d >= CONFIG.match.spawnMinDistance);
    const pool = good.length >= 3 ? good.slice(0, Math.max(3, Math.floor(good.length / 2))) : scored.slice(0, 1);
    return this.rng.pick(pool).sp;
  }

  private respawnSpy(a: Agent): void {
    const sp = this.pickSpawn(a.id);
    const s = a.spy!;
    a.x = a.px = sp.x;
    a.y = a.py = this.col.groundHeight(sp.x, sp.z, sp.y + 0.1);
    a.z = a.pz = sp.z;
    a.vx = a.vy = a.vz = 0;
    a.alive = true;
    a.health = CONFIG.health.max;
    a.pose = 'stand';
    a.crouch = false;
    a.onGround = true;
    a.appearance = a.baseAppearance;
    a.faceYaw = NaN;
    s.suspicion = 0;
    s.proximityTimer = 0;
    s.ammo = CONFIG.weapon.magSize;
    s.reloadTimer = 0;
    s.drawn = false;
    s.aiming = false;
    s.firePending = false;
    s.revealTimer = 0;
    s.disguiseTimer = 0;
    s.seenBy.clear();
    s.lastAttacker = -1;
    this.contracts.insertRandom(a.id);
    this.syncContracts();
    this.brains.get(a.id)?.onRespawn();
    this.emit({ type: 'respawn', agent: a.id });
  }

  private respawnCivilian(a: Agent): void {
    let node = this.randomGroundNode();
    if (this.player) {
      for (let i = 0; i < 10; i++) {
        const n = this.nav.nodes[node];
        if (Math.hypot(n.x - this.player.x, n.z - this.player.z) > 18) break;
        node = this.randomGroundNode();
      }
    }
    const n = this.nav.nodes[node];
    a.x = a.px = n.x;
    a.y = a.py = n.y;
    a.z = a.pz = n.z;
    a.alive = true;
    a.health = CONFIG.health.max;
    a.pose = 'stand';
    a.appearance = a.baseAppearance = civilianAppearance(this.rng);
    a.faceYaw = NaN;
    a.maxSpeed = this.rng.range(CONFIG.civilian.minSpeed, CONFIG.civilian.maxSpeed);
    a.civ!.state = 'wander';
    a.civ!.timer = 0;
    clearGoal(a);
    this.emit({ type: 'respawn', agent: a.id });
  }

  // ------------------------------------------------------------------ spy actions
  private applySpyIntent(a: Agent, dt: number): void {
    const s = a.spy!;
    const it = s.intent;
    const W = CONFIG.weapon;
    if (!a.alive) {
      it.fire = it.reload = it.scanner = it.disguise = it.smoke = it.jump = false;
      return;
    }
    if (a.isPlayer) {
      a.yaw = it.yaw;
      a.pitch = it.pitch;
      a.crouch = it.mode === 'crouch';
      const speed = it.mode === 'run' ? M.runSpeed : it.mode === 'crouch' ? M.crouchSpeed : M.walkSpeed;
      a.maxSpeed = speed;
      const ml = Math.hypot(it.moveX, it.moveZ);
      const k = ml > 1 ? 1 / ml : 1;
      a.wantX = it.moveX * k * speed;
      a.wantZ = it.moveZ * k * speed;
      a.wantJump = it.jump;
      s.running = it.mode === 'run' && ml > 0.1 && a.speed > M.walkSpeed + 0.4;
    } else {
      s.running = a.speed > M.walkSpeed + 0.8;
    }

    // Weapon.
    s.fireCooldown = Math.max(0, s.fireCooldown - dt);
    if (s.reloadTimer > 0) {
      s.reloadTimer -= dt;
      if (s.reloadTimer <= 0) {
        s.reloadTimer = 0;
        s.ammo = W.magSize;
      }
    }
    s.aiming = it.aim;
    if (s.aiming) {
      if (!s.drawn) {
        s.drawn = true;
        s.drawTimer = W.drawTime;
      }
      s.holsterTimer = W.holsterDelayAfterAim;
    }
    if (it.fire) {
      if (!s.drawn) {
        s.drawn = true;
        s.drawTimer = W.drawTime;
      }
      s.firePending = true;
      s.holsterTimer = Math.max(s.holsterTimer, W.holsterDelayAfterFire);
    }
    if (s.drawn) {
      if (s.drawTimer > 0) s.drawTimer -= dt;
      if (!s.aiming) {
        s.holsterTimer -= dt;
        if (s.holsterTimer <= 0 && !s.firePending && s.reloadTimer <= 0) s.drawn = false;
      }
    }
    if (s.firePending && s.drawTimer <= 0 && s.fireCooldown <= 0) {
      s.firePending = false;
      if (s.reloadTimer > 0) {
        // ignore while reloading
      } else if (s.ammo <= 0) {
        s.reloadTimer = W.reloadTime;
        this.emit({ type: 'reload', spy: a.id });
      } else {
        s.ammo--;
        s.fireCooldown = W.fireInterval;
        s.holsterTimer = W.holsterDelayAfterFire;
        fireShot(this, a);
        if (s.ammo === 0) {
          s.reloadTimer = W.reloadTime;
          this.emit({ type: 'reload', spy: a.id });
        }
      }
    }
    if (it.reload && s.ammo < W.magSize && s.reloadTimer <= 0) {
      s.reloadTimer = W.reloadTime;
      this.emit({ type: 'reload', spy: a.id });
    }

    // Gadgets.
    if (it.scanner) useScanner(this, a);
    if (it.disguise) useDisguise(this, a);
    if (it.smoke) useSmoke(this, a);
    it.fire = it.reload = it.scanner = it.disguise = it.smoke = false;
  }

  private updateSpyTimers(a: Agent, dt: number): void {
    const s = a.spy!;
    s.cdScanner = Math.max(0, s.cdScanner - dt);
    s.cdDisguise = Math.max(0, s.cdDisguise - dt);
    s.cdSmoke = Math.max(0, s.cdSmoke - dt);
    s.scanTimer = Math.max(0, s.scanTimer - dt);
    s.revealTimer = Math.max(0, s.revealTimer - dt);
    if (s.disguiseTimer > 0) {
      s.disguiseTimer -= dt;
      if (s.disguiseTimer <= 0) endDisguise(this, a);
    }
  }

  // ------------------------------------------------------------------ main step
  step(dt: number): void {
    if (this.over) return;
    this.tick++;
    this.time += dt;
    this.timeLeft = Math.max(0, this.timeLeft - dt);

    for (const a of this.agents) {
      a.px = a.x;
      a.py = a.y;
      a.pz = a.z;
      a.prevYaw = a.yaw;
    }

    // Spatial hash.
    this.hash.clear();
    for (const a of this.agents) if (a.alive) this.hash.insert(a.id, a.x, a.z);

    // AI thinking, staggered so each agent thinks at aiRate.
    const thinkDt = AI_DIVISOR * dt;
    for (let i = 0; i < this.agents.length; i++) {
      if ((i + this.tick) % AI_DIVISOR !== 0) continue;
      const a = this.agents[i];
      if (a.civ) civilianThink(this, a, thinkDt);
      else if (!a.isPlayer) this.brains.get(a.id)?.think(thinkDt);
    }
    for (const brain of this.brains.values()) brain.act(dt);

    // Spy actions (weapons, gadgets, player movement intent).
    for (const s of this.spies) {
      this.updateSpyTimers(s, dt);
      this.applySpyIntent(s, dt);
    }

    // Path following + separation for AI agents.
    for (const a of this.agents) {
      if (!a.alive || a.isPlayer) continue;
      if (a.pose === 'sit') {
        a.wantX = a.wantZ = 0;
        continue;
      }
      if (a.hasGoal) followPath(this, a, a.maxSpeed, dt);
      else {
        a.wantX = 0;
        a.wantZ = 0;
      }
      this.applySeparation(a);
    }

    // Movement.
    for (const a of this.agents) {
      const jumped = stepMovement(a, this.col, dt, this.layout.bounds);
      if (jumped && a.spy) {
        addSuspicion(a.spy, CONFIG.suspicion.jump);
        this.emit({ type: 'jump', agent: a.id });
      }
    }
    if (this.player && this.player.alive) this.pushPlayerOutOfCrowd(this.player);

    // Suspicion.
    for (const s of this.spies) {
      if (!s.alive) continue;
      const sp = s.spy!;
      updateSuspicion(sp, {
        running: sp.running, drawn: sp.drawn, aiming: sp.aiming, nearSpy: this.nearOtherSpy(s),
        cover: sp.running && this.inPanickingCrowd(s),
      }, dt);
    }

    // Smoke.
    for (const sm of this.smokes) if (sm.active) updateSmoke(this, sm, dt);

    // Witness tracking for the unseen bonus (10 Hz).
    if (this.tick % AI_DIVISOR === 0) this.updateWitnesses();

    // Deaths and respawns.
    for (const a of this.agents) {
      if (a.alive) continue;
      a.deadTime += dt;
      if (a.spy) {
        a.spy.respawnTimer -= dt;
        if (a.spy.respawnTimer <= 0) this.respawnSpy(a);
      } else if (a.deadTime >= CONFIG.match.civilianRespawnSeconds) {
        this.respawnCivilian(a);
      }
    }

    // Forget old noises.
    while (this.noises.length && this.time - this.noises[0].time > 1.5) this.noises.shift();

    if (this.timeLeft <= 1e-6) {
      this.timeLeft = 0;
      this.over = true;
      this.emit({ type: 'roundEnd' });
    }
  }

  private applySeparation(a: Agent): void {
    const R = M.separationRadius;
    this.hash.query(a.x, a.z, R, this.nbr);
    let sx = 0, sz = 0;
    for (const id of this.nbr) {
      if (id === a.id) continue;
      const o = this.agents[id];
      if (!o.alive || Math.abs(o.y - a.y) > 1) continue;
      const dx = a.x - o.x, dz = a.z - o.z;
      const d2 = dx * dx + dz * dz;
      if (d2 >= R * R) continue;
      const d = Math.sqrt(d2);
      if (d < 1e-4) {
        sx += (a.id % 2 ? 1 : -1) * 0.5;
        continue;
      }
      const k = (1 - d / R) / d;
      sx += dx * k;
      sz += dz * k;
    }
    a.wantX += sx * M.separationStrength;
    a.wantZ += sz * M.separationStrength;
  }

  private pushPlayerOutOfCrowd(p: Agent): void {
    const R = CONFIG.body.radius * 2;
    this.hash.query(p.x, p.z, R, this.nbr);
    for (const id of this.nbr) {
      if (id === p.id) continue;
      const o = this.agents[id];
      if (!o.alive || Math.abs(o.y - p.y) > 1.2) continue;
      const dx = p.x - o.x, dz = p.z - o.z;
      const d = Math.hypot(dx, dz);
      if (d >= R || d < 1e-4) continue;
      p.x += (dx / d) * (R - d);
      p.z += (dz / d) * (R - d);
    }
    this.col.resolveCircle(p, CONFIG.body.radius, bodyHeight(p));
  }

  private nearOtherSpy(a: Agent): boolean {
    const R = CONFIG.suspicion.proximityRadius;
    for (const o of this.spies) {
      if (o === a || !o.alive) continue;
      if (Math.abs(o.y - a.y) < 1.5 && Math.hypot(o.x - a.x, o.z - a.z) < R) return true;
    }
    return false;
  }

  private inPanickingCrowd(a: Agent): boolean {
    const R = CONFIG.suspicion.coverRadius;
    this.hash.query(a.x, a.z, R, this.nbr);
    for (const id of this.nbr) {
      const o = this.agents[id];
      if (o.civ && o.alive && o.civ.state === 'panic' && Math.hypot(o.x - a.x, o.z - a.z) < R) return true;
    }
    return false;
  }

  private updateWitnesses(): void {
    for (const s of this.spies) {
      if (!s.alive) continue;
      for (const o of this.spies) {
        if (o === s || !o.alive) continue;
        if (canSee(this, o, s)) s.spy!.seenBy.set(o.id, this.time);
      }
    }
  }

  // ------------------------------------------------------------------ queries
  spyRanking(): Agent[] {
    return [...this.spies].sort((a, b) => b.spy!.score - a.spy!.score || b.spy!.kills - a.spy!.kills);
  }
}
