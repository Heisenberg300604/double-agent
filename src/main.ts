// Boot + game loop: fixed 60 Hz simulation with interpolated rendering.

import { CONFIG } from './config';
import { Input } from './core/input';
import { FixedStep } from './core/loop';
import { dirToYaw, wrapAngle } from './core/vec';
import { AudioEngine } from './audio/audio';
import { GameRenderer, type CameraPose } from './render/renderer';
import { describeAppearance } from './sim/appearance';
import { bandOf } from './sim/gadgets';
import { eyeHeight } from './sim/movement';
import { ordinal, rankOf } from './sim/scoring';
import { emptyIntent, type Agent, type SimEvent } from './sim/types';
import { World } from './sim/world';
import { Hud, type HudState, type ScoreRow } from './ui/hud';
import { Menus } from './ui/menus';
import { loadSettings, saveSettings, type Settings } from './ui/settings';

type GameState = 'title' | 'playing' | 'paused' | 'ended';

class Game {
  private world: World;
  private readonly renderer: GameRenderer;
  private readonly input: Input;
  private readonly audio = new AudioEngine();
  private readonly hud = new Hud();
  private readonly menus: Menus;
  private settings: Settings;
  private state: GameState = 'title';
  private readonly loop = new FixedStep(CONFIG.sim.tickRate);
  private yaw = 0;
  private pitch = 0;
  private readonly intent = emptyIntent();
  private readonly mouse = { x: 0, y: 0 };
  private lastTime = performance.now();
  private debugOn = false;
  private frameMs = 16;
  private simMs = 0;
  private renderMs = 0;
  private camEye: number = CONFIG.body.eyeHeight;
  private stepDist = 0;
  private deathBy = '';
  private deathCam = 0;
  private attractT = 0;
  private readonly cam: CameraPose = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0 };
  private seed = 0;
  /** One-time contextual tips for new players. */
  private hints = new Set<string>();
  private matchTime = 0;
  private remoteStepTimer = 0;

  constructor() {
    this.settings = loadSettings();
    this.world = this.makeWorld(false);
    const app = document.getElementById('app')!;
    this.renderer = new GameRenderer(app, this.world);
    this.renderer.setQuality(this.settings.quality);
    this.renderer.baseFov = this.settings.fov;
    this.input = new Input(document.body);
    this.input.onLockChange = (locked) => {
      if (!locked && this.state === 'playing') this.pause();
    };
    this.audio.setVolume(this.settings.volume);

    this.menus = new Menus(this.settings, {
      play: () => {
        this.audio.start();
        if (!this.settings.seenHowTo) this.menus.briefing();
        else this.startMatch();
      },
      howtoDone: () => {
        this.settings.seenHowTo = true;
        saveSettings(this.settings);
        this.startMatch();
      },
      resume: () => this.resume(),
      quit: () => this.toTitle(),
      again: () => this.startMatch(),
      settingsChanged: (s) => {
        this.settings = s;
        saveSettings(s);
        this.renderer.baseFov = s.fov;
        this.audio.setVolume(s.volume);
        if (s.quality !== this.renderer.setting) this.renderer.setQuality(s.quality);
      },
    });

    document.addEventListener('pointerdown', () => this.audio.start());
    document.addEventListener('click', () => {
      if (this.state === 'playing' && !this.input.locked) this.input.requestLock();
    });
    // Ctrl (crouch) + W (walk) is the browser's close-tab shortcut: ask before leaving mid-match.
    window.addEventListener('beforeunload', (e) => {
      if (this.state === 'playing' || this.state === 'paused') {
        e.preventDefault();
        e.returnValue = '';
      }
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'playing') this.pause();
      this.audio.suspend(document.hidden);
    });

    document.getElementById('loading')!.remove();
    console.info(`[double-agent] ready in ${Math.round(performance.now())} ms`);
    this.menus.show('title');
    requestAnimationFrame((t) => this.frame(t));
  }

  private makeWorld(withPlayer: boolean): World {
    const params = new URLSearchParams(location.search);
    const fixed = params.get('seed');
    this.seed = fixed ? Number(fixed) : (Math.random() * 1e9) | 0;
    const spies = Number(params.get('spies')) || CONFIG.match.spies;
    const w = new World({ seed: this.seed, withPlayer, spies });
    if (withPlayer) console.info(`[double-agent] match seed ${this.seed} (add ?seed=${this.seed} to replay)`);
    return w;
  }

  // ---------------------------------------------------------------- state changes
  private startMatch(): void {
    this.world = this.makeWorld(true);
    const p = this.world.player!;
    this.yaw = p.yaw;
    this.pitch = 0;
    this.camEye = CONFIG.body.eyeHeight;
    this.loop.reset();
    this.renderer.effects.clear();
    this.hud.reset();
    this.hud.show(true);
    this.menus.show(null);
    this.state = 'playing';
    this.input.clearPresses();
    this.input.requestLock();
    this.hud.centerMessage('Find your target. Blend in.', false, 3);
    this.matchTime = 0;
    this.lastTime = performance.now();
  }

  private pause(): void {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.input.exitLock();
    this.menus.show('pause');
    this.hud.setScoreboard(false);
  }

  private resume(): void {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.menus.show(null);
    this.input.clearPresses();
    this.input.requestLock();
    this.loop.reset();
    this.lastTime = performance.now();
  }

  private toTitle(): void {
    this.state = 'title';
    this.input.exitLock();
    this.hud.show(false);
    this.world = this.makeWorld(false);
    this.renderer.effects.clear();
    this.menus.show('title');
  }

  private endRound(): void {
    this.state = 'ended';
    this.input.exitLock();
    this.hud.setScoreboard(false);
    const w = this.world;
    const ranked = w.spyRanking();
    const entries = ranked.map((s) => ({ id: s.id, score: s.spy!.score }));
    const rows = ranked.map((s) => ({ ...this.scoreRow(s), rank: rankOf(entries, s.id) }));
    const me = w.player!;
    this.menus.showEnd(rows, this.scoreRow(me), rankOf(entries, me.id), ranked.length, me.spy!.targetKills);
    this.audio.killSting(rankOf(entries, me.id) === 1);
  }

  private scoreRow(s: Agent): ScoreRow {
    const sp = s.spy!;
    return { name: s.isPlayer ? 'You' : `Agent ${sp.name}`, kills: sp.kills, deaths: sp.deaths, civ: sp.civKills, score: sp.score, me: s.isPlayer };
  }

  // ---------------------------------------------------------------- frame
  private frame(now: number): void {
    requestAnimationFrame((t) => this.frame(t));
    const dt = Math.min(0.1, (now - this.lastTime) / 1000);
    this.lastTime = now;
    this.frameMs += (dt * 1000 - this.frameMs) * 0.05;
    this.renderer.tickQuality(dt);

    if (this.input.consume('F3')) this.debugOn = !this.debugOn;

    const t0 = performance.now();
    if (this.state === 'playing') {
      this.updateLook();
      const steps = this.loop.advance(dt);
      for (let i = 0; i < steps; i++) {
        this.buildIntent();
        this.world.setPlayerIntent(this.intent);
        this.world.step(this.loop.dt);
        this.handleEvents(this.world.drainEvents());
        if (this.world.over) break;
      }
      if (this.world.over && this.state === 'playing') this.endRound();
    } else if (this.state === 'title') {
      const steps = this.loop.advance(dt);
      for (let i = 0; i < steps; i++) this.world.step(this.loop.dt);
      this.world.drainEvents();
    }
    this.simMs += (performance.now() - t0 - this.simMs) * 0.05;

    this.renderFrame(dt);
  }

  private updateLook(): void {
    this.input.consumeMouse(this.mouse);
    const p = this.world.player!;
    if (!p.alive) return;
    const zoom = p.spy!.aiming ? CONFIG.weapon.fovAim / this.settings.fov : 1;
    const k = 0.0022 * this.settings.sensitivity * zoom;
    this.yaw = wrapAngle(this.yaw - this.mouse.x * k);
    this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch - this.mouse.y * k));
  }

  private buildIntent(): void {
    const it = this.intent;
    const inp = this.input;
    const fwd = (inp.isDown('KeyW') ? 1 : 0) - (inp.isDown('KeyS') ? 1 : 0);
    const str = (inp.isDown('KeyD') ? 1 : 0) - (inp.isDown('KeyA') ? 1 : 0);
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    it.moveX = fx * fwd + rx * str;
    it.moveZ = fz * fwd + rz * str;
    const crouch = inp.isDown('ControlLeft') || inp.isDown('ControlRight') || inp.isDown('KeyC');
    const run = (inp.isDown('ShiftLeft') || inp.isDown('ShiftRight')) && fwd > 0;
    it.mode = crouch ? 'crouch' : run ? 'run' : 'walk';
    it.yaw = this.yaw;
    it.pitch = this.pitch;
    it.aim = inp.rmb;
    it.jump = inp.consume('Space');
    it.fire = inp.consumeClick();
    it.reload = inp.consume('KeyR');
    it.scanner = inp.consume('KeyQ');
    it.disguise = inp.consume('KeyE');
    it.smoke = inp.consume('KeyF');
  }

  // ---------------------------------------------------------------- events → HUD / FX / audio
  private name(id: number): string {
    const a = this.world.agents[id];
    return a.isPlayer ? 'You' : a.spy ? `Agent ${a.spy.name}` : 'a civilian';
  }

  private handleEvents(events: SimEvent[]): void {
    const w = this.world;
    const me = w.player!;
    for (const e of events) {
      switch (e.type) {
        case 'shot': {
          this.renderer.effects.tracer(e.fromX, e.fromY, e.fromZ, e.toX, e.toY, e.toZ);
          const own = e.shooter === me.id;
          const sh = w.agents[e.shooter];
          this.audio.shot(own ? undefined : { x: sh.x, y: sh.y + 1.5, z: sh.z }, own);
          if (own) {
            this.renderer.viewmodel.kick();
            this.pitch = Math.min(1.45, this.pitch + 0.012);
            if (e.hitAgent >= 0) {
              this.hud.hitmarker(e.headshot);
              this.audio.hitTick(e.headshot);
            }
          }
          if (e.hitAgent >= 0) this.renderer.effects.impact(e.toX, e.toY, e.toZ, 0, 0.3, 0, 5);
          break;
        }
        case 'impact':
          this.renderer.effects.impact(e.x, e.y, e.z, e.nx, e.ny, e.nz);
          break;
        case 'damage':
          if (e.victim === me.id) {
            const at = w.agents[e.attacker];
            const ang = wrapAngle(dirToYaw(at.x - me.x, at.z - me.z) - this.yaw);
            this.hud.damageFrom(ang);
            this.audio.hurt();
          }
          break;
        case 'kill':
          this.onKill(e);
          break;
        case 'contract':
          if (e.spy === me.id && e.target >= 0 && me.alive) {
            this.hud.centerMessage('New target assigned');
            this.audio.ping();
          }
          break;
        case 'scanner': {
          this.renderer.effects.ripple(e.x, e.y, e.z);
          if (e.spy === me.id) this.audio.ping();
          break;
        }
        case 'smokeDeploy':
          this.audio.hiss({ x: e.x, y: e.y, z: e.z });
          break;
        case 'reload':
          if (e.spy === me.id) this.audio.reload();
          break;
        case 'disguise':
          if (e.spy === me.id && e.on) this.hud.centerMessage('Disguised — hunters lose your trail');
          if (e.spy === me.id && !e.on) this.hud.centerMessage('Disguise expired');
          break;
        case 'reveal':
          if (e.spy !== me.id) this.hud.killfeed('A spy killed a civilian — marked red for 5s', 'neutral');
          break;
        case 'respawn':
          if (e.agent === me.id) {
            this.yaw = me.yaw;
            this.pitch = 0;
            this.hud.centerMessage('Back in the field');
          }
          break;
        case 'jump':
        case 'smokeThrow':
        case 'roundEnd':
          break;
      }
    }
  }

  private onKill(e: Extract<SimEvent, { type: 'kill' }>): void {
    const me = this.world.player!;
    const pts = (n: number): string => (n >= 0 ? `+${n}` : `−${-n}`);
    if (e.killer === me.id) {
      switch (e.relation) {
        case 'target': {
          const extra = [e.headshot ? 'headshot' : '', e.unseen ? 'unseen' : ''].filter(Boolean).join(', ');
          this.hud.killfeed(`You eliminated your target (${pts(e.points)})${extra ? ` — ${extra}` : ''}`, 'good');
          this.hud.centerMessage('Target eliminated');
          this.audio.killSting(true);
          break;
        }
        case 'hunter':
          this.hud.killfeed(`You eliminated your hunter (${pts(e.points)})`, 'good');
          this.audio.killSting(true);
          break;
        case 'other':
          this.hud.killfeed(`You eliminated the wrong spy (${pts(e.points)})`, 'bad');
          this.audio.killSting(false);
          break;
        case 'civilian':
          this.hud.killfeed(`You killed a civilian (${pts(e.points)})`, 'bad');
          this.hud.centerMessage('Civilian down — you are revealed', true);
          this.audio.killSting(false);
          break;
      }
      return;
    }
    if (e.victim === me.id) {
      const hunter = e.relation === 'target';
      this.deathBy = hunter ? 'Eliminated by your hunter' : `Eliminated by ${this.name(e.killer)}`;
      this.hud.killfeed(hunter ? 'You were eliminated by your hunter' : `You were eliminated by ${this.name(e.killer)}`, 'bad');
      this.deathCam = 0;
      this.audio.killSting(false);
      return;
    }
    this.hud.killfeed(e.victimKind === 'civilian' ? 'A civilian was killed' : 'A spy was eliminated', 'neutral');
  }

  // ---------------------------------------------------------------- render
  private renderFrame(dt: number): void {
    const w = this.world;
    const alpha = this.loop.alpha;
    const me = w.player;
    const outlined: number[] = [];
    const revealed: { x: number; y: number; z: number }[] = [];

    if (me && this.state !== 'title') {
      const tgtId = w.contracts.targetOf(me.id);
      const tgt = tgtId >= 0 ? w.agents[tgtId] : null;
      if (tgt && tgt.alive && tgt.spy!.suspicion >= CONFIG.suspicion.exposed) outlined.push(tgt.id);
      for (const s of w.spies) if (s !== me && s.alive && s.spy!.revealTimer > 0) revealed.push(s);

      // Camera.
      const targetEye = me.alive ? eyeHeight(me) : 0.35;
      this.camEye += (targetEye - this.camEye) * (1 - Math.exp(-(me.alive ? 12 : 4) * dt));
      const bob = me.alive && me.onGround ? Math.sin(me.animPhase * 2) * 0.025 * Math.min(1, me.speed / 2.2) : 0;
      this.cam.x = me.px + (me.x - me.px) * alpha;
      this.cam.y = me.py + (me.y - me.py) * alpha + this.camEye + bob;
      this.cam.z = me.pz + (me.z - me.pz) * alpha;
      this.cam.yaw = this.yaw;
      if (me.alive) {
        this.cam.pitch = this.pitch;
        this.cam.roll = 0;
      } else {
        this.deathCam = Math.min(1, this.deathCam + dt * 1.5);
        this.cam.pitch = this.pitch * (1 - this.deathCam) + 0.5 * this.deathCam;
        this.cam.roll = 0.45 * this.deathCam;
      }
      this.audio.setListener({ x: this.cam.x, y: this.cam.y, z: this.cam.z, yaw: this.yaw });
      this.footsteps(me, dt);
      this.remoteFootsteps(dt);
      this.updateHud(dt, tgt);
      if (this.state === 'playing') this.updateHints(dt, tgt);
    } else {
      // Attract mode: slow pan across the concourse from the balcony.
      this.attractT += dt;
      const a = this.attractT * 0.05;
      this.cam.x = -8 + Math.sin(a) * 10;
      this.cam.y = 10.5;
      this.cam.z = 14;
      this.cam.yaw = Math.sin(a * 0.7) * 0.45;
      this.cam.pitch = -0.42;
      this.cam.roll = 0;
    }

    const sp = me?.spy;
    const playing = this.state !== 'title' && !!me && me.alive;
    const r0 = performance.now();
    this.renderer.render(w, this.cam, {
      dt, alpha,
      hideId: me ? me.id : -1,
      outlined, revealed,
      aiming: playing && !!sp?.aiming,
      drawn: playing && !!sp?.drawn,
      reloading: playing && (sp?.reloadTimer ?? 0) > 0,
      moveSpeed: me?.speed ?? 0,
      showViewmodel: playing,
    });
    this.renderMs += (performance.now() - r0 - this.renderMs) * 0.05;
    this.audio.update(dt);

    if (this.debugOn) {
      const r = this.renderer;
      this.hud.setDebug(
        `FPS ${(1000 / this.frameMs).toFixed(0)} (avg ${r.scaler.averageFps().toFixed(0)})  frame ${this.frameMs.toFixed(2)} ms  sim ${this.simMs.toFixed(2)} ms  render ${this.renderMs.toFixed(2)} ms\n` +
        `draw calls ${r.drawCalls}  tris ${(r.triangles / 1000).toFixed(1)}k  scale ${r.renderScale.toFixed(2)}  quality ${r.setting}/${r.level}\n` +
        `agents ${w.agents.length}  spies ${w.spies.length}  seed ${this.seed}`,
      );
    } else {
      this.hud.setDebug(null);
    }
  }

  private footsteps(me: Agent, dt: number): void {
    if (!me.alive || !me.onGround) return;
    this.stepDist += me.speed * dt;
    const running = me.spy!.running;
    const stride = running ? 1.7 : me.crouch ? 0.9 : 1.25;
    if (this.stepDist > stride) {
      this.stepDist = 0;
      if (!me.crouch) this.audio.footstep(undefined, running);
    }
  }

  private hint(key: string, text: string): void {
    if (this.hints.has(key)) return;
    this.hints.add(key);
    this.hud.toast(text);
  }

  private updateHints(dt: number, tgt: Agent | null): void {
    const me = this.world.player!;
    const s = me.spy!;
    this.matchTime += dt;
    if (!me.alive) return;
    if (this.matchTime > 5 && s.cdScanner === 0 && s.scanTimer === 0) this.hint('scan', 'Press Q to scan — the arrow points to your target.');
    if (s.scanTimer > 0) this.hint('scanned', 'Match the dossier (top right) against people in that direction.');
    if (s.suspicion >= CONFIG.suspicion.exposed) this.hint('exposed', 'You are EXPOSED: your hunter sees you outlined in red. Walk calmly to cool off.');
    if (tgt && tgt.alive && tgt.spy!.suspicion >= CONFIG.suspicion.exposed) this.hint('outline', 'Your target is exposed — the red outline gives them away.');
    if (this.matchTime > 40 && s.cdDisguise === 0) this.hint('gadgets', 'Feel watched? E changes your suit, F throws smoke that blocks sight.');
  }

  private remoteFootsteps(dt: number): void {
    this.remoteStepTimer -= dt;
    if (this.remoteStepTimer > 0) return;
    this.remoteStepTimer = 0.32;
    const me = this.world.player!;
    for (const s of this.world.spies) {
      if (s === me || !s.alive || !s.spy!.running) continue;
      if (Math.hypot(s.x - me.x, s.z - me.z) < CONFIG.perception.hearRun + 2) this.audio.footstep({ x: s.x, y: s.y, z: s.z }, true);
    }
  }

  private updateHud(dt: number, tgt: Agent | null): void {
    const w = this.world;
    const me = w.player!;
    const s = me.spy!;
    const entries = w.spies.map((a) => ({ id: a.id, score: a.spy!.score }));
    const rank = rankOf(entries, me.id);

    let scanner: HudState['scanner'] = null;
    if (s.scanTimer > 0 && tgt) {
      const dx = tgt.x - me.x, dz = tgt.z - me.z;
      const d = Math.hypot(dx, dz);
      const band = bandOf(d);
      const dy = tgt.y - me.y;
      scanner = {
        angle: wrapAngle(dirToYaw(dx, dz) - this.yaw),
        band: band === 'near' ? 'Near · < 15 m' : band === 'mid' ? 'Mid · < 40 m' : 'Far · 40 m +',
        floor: dy > 2.5 ? 'ABOVE YOU' : dy < -2.5 ? 'BELOW YOU' : '',
      };
    }

    const G = CONFIG.gadgets;
    this.hud.update({
      timeLeft: w.timeLeft,
      score: s.score,
      rank: `${ordinal(rank)} / ${w.spies.length}`,
      suspicion: s.suspicion,
      health: me.health,
      ammo: s.ammo,
      reloading: s.reloadTimer > 0,
      drawn: me.alive && s.drawn,
      aiming: s.aiming,
      gadgets: [
        { cooldown: s.cdScanner, max: G.scanner.cooldown, active: s.scanTimer > 0 },
        { cooldown: s.cdDisguise, max: G.disguise.cooldown, active: s.disguiseTimer > 0 },
        { cooldown: s.cdSmoke, max: G.smoke.cooldown, active: false },
      ],
      dossierName: tgt ? `Agent ${tgt.spy!.name}` : 'No target',
      dossierLines: tgt ? describeAppearance(tgt.baseAppearance) : ['Awaiting assignment…'],
      targetDisguised: !!tgt && tgt.spy!.disguiseTimer > 0,
      hasTarget: !!tgt,
      scanner,
      revealed: s.revealTimer > 0,
    }, dt);

    this.hud.setDeath(!me.alive, this.deathBy, s.respawnTimer);
    const showBoard = this.input.isDown('Tab') && this.state === 'playing';
    this.hud.setScoreboard(showBoard, showBoard ? w.spyRanking().map((a) => this.scoreRow(a)) : []);
  }
}

const game = new Game();
// Exposed in dev builds only, for automated browser checks.
if (import.meta.env.DEV) (window as unknown as { __game: Game }).__game = game;
