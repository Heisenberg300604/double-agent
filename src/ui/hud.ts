// HTML/CSS HUD overlay. Only touches the DOM when a value actually changes.

import { CONFIG } from '../config';

const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document): T => root.querySelector(sel) as T;

export interface GadgetView {
  cooldown: number;
  max: number;
  active: boolean;
}

export interface HudState {
  timeLeft: number;
  score: number;
  rank: string;
  suspicion: number;
  health: number;
  ammo: number;
  reloading: boolean;
  drawn: boolean;
  aiming: boolean;
  moveSpeed: number;
  gadgets: [GadgetView, GadgetView, GadgetView];
  dossierName: string;
  dossierLines: string[];
  targetDisguised: boolean;
  hasTarget: boolean;
  scanner: { angle: number; band: string; floor: string } | null;
  revealed: boolean;
  /** Interact prompt text (shown as "[G] text"), or null to hide it. */
  prompt: string | null;
  /** Seated or busy with an activity and still getting the blending bonus. */
  blending: boolean;
}

export interface ScoreRow {
  name: string;
  kills: number;
  deaths: number;
  civ: number;
  score: number;
  me: boolean;
}

export class Hud {
  private readonly root = $('#hud');
  private readonly timer = $('#timer');
  private readonly score = $('#scorebox .score');
  private readonly rank = $('#scorebox .rank');
  private readonly susp = $('#susp');
  private readonly suspFill = $('#susp .fill');
  private readonly hp = $('#health');
  private readonly hpFill = $('#health .fill');
  private readonly hpNum = $('#hp-num');
  private readonly ammo = $('#ammo');
  private readonly cross = $('#crosshair');
  private readonly ticks = ['t', 'b', 'l', 'r'].map((k) => $(`#crosshair .${k}`));
  private spread = 10;
  private kickAmt = 0;
  private killT = 0;
  private readonly dot = $('#dot');
  private readonly hit = $('#hitmarker');
  private readonly feed = $('#killfeed');
  private readonly dossier = $('#dossier');
  private readonly dName = $('#dossier-name');
  private readonly dLines = $('#dossier-lines');
  private readonly dWarn = $('#dossier-warn');
  private readonly dStatus = $('#dossier-status');
  private readonly scanner = $('#scanner');
  private readonly scanArrow = $('#scanner .arrow');
  private readonly scanBand = $('#scanner .band');
  private readonly scanFloor = $('#scanner .floor');
  private readonly center = $('#center-msg');
  private readonly revealed = $('#revealed');
  private readonly prompt = $('#interact');
  private readonly promptText = $('#interact .text');
  private readonly death = $('#death');
  private readonly deathBy = $('#death-by');
  private readonly deathTimer = $('#death-timer');
  private readonly board = $('#scoreboard');
  private readonly boardBody = $('#scoreboard tbody');
  private readonly debugEl = $('#debug');
  private readonly toastEl = $('#toast');
  private toastTimer = 0;
  private readonly damageRoot = $('#damage');
  private readonly gadgetEls = ['#g-scan', '#g-disg', '#g-smoke'].map((s) => $(s));
  private readonly cache = new Map<string, string | number | boolean>();
  private hitTimer = 0;
  private centerTimer = 0;
  private readonly dmgEls: HTMLElement[] = [];
  private readonly dmgLife: number[] = [];
  private readonly feedPool: HTMLElement[] = [];

  constructor() {
    // Film grain: a small procedural noise tile, animated by CSS.
    try {
      const c = document.createElement('canvas');
      c.width = c.height = 160;
      const g = c.getContext('2d')!;
      const img = g.createImageData(160, 160);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = Math.random() * 255;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = 255;
      }
      g.putImageData(img, 0, 0);
      $('#fx-grain').style.backgroundImage = `url(${c.toDataURL()})`;
    } catch {
      /* grain is cosmetic */
    }
    for (let i = 0; i < 4; i++) {
      const d = document.createElement('div');
      d.className = 'dmg';
      this.damageRoot.appendChild(d);
      this.dmgEls.push(d);
      this.dmgLife.push(0);
    }
    for (let i = 0; i < 6; i++) {
      const f = document.createElement('div');
      f.className = 'feed hidden';
      this.feed.appendChild(f);
      this.feedPool.push(f);
    }
  }

  private changed(key: string, v: string | number | boolean): boolean {
    if (this.cache.get(key) === v) return false;
    this.cache.set(key, v);
    return true;
  }

  show(on: boolean): void {
    this.root.classList.toggle('hidden', !on);
  }

  update(s: HudState, dt: number): void {
    const t = Math.ceil(s.timeLeft);
    if (this.changed('time', t)) {
      this.timer.textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
      this.timer.classList.toggle('low', t <= 30);
    }
    if (this.changed('score', s.score)) this.score.textContent = String(s.score);
    if (this.changed('rank', s.rank)) this.rank.textContent = s.rank;

    const sus = Math.round(s.suspicion);
    if (this.changed('sus', sus)) {
      this.suspFill.style.height = `${sus}%`;
      this.susp.classList.toggle('exposed', sus >= CONFIG.suspicion.exposed);
    }
    const hp = Math.max(0, Math.round(s.health));
    if (this.changed('hp', hp)) {
      this.hpFill.style.width = `${hp}%`;
      this.hpNum.textContent = String(hp);
      this.hp.classList.toggle('low', hp <= 45);
    }
    const ammoKey = s.reloading ? 'R' : String(s.ammo);
    if (this.changed('ammo', ammoKey)) {
      this.ammo.innerHTML = s.reloading ? `<span style="font-size:15px">RELOAD</span><small>…</small>` : `${s.ammo}<small>/ ${CONFIG.weapon.magSize}</small>`;
    }
    if (this.changed('drawn', s.drawn)) {
      this.cross.classList.toggle('hidden', !s.drawn);
      this.dot.classList.toggle('hidden', s.drawn);
    }
    if (s.drawn) {
      // Dynamic spread: movement and recoil open it, aiming tightens it.
      this.kickAmt = Math.max(0, this.kickAmt - dt * 5);
      this.killT = Math.max(0, this.killT - dt);
      const target = (s.aiming ? 4 : 9) + Math.min(14, s.moveSpeed * 2.2) + this.kickAmt * 14;
      this.spread += (target - this.spread) * Math.min(1, dt * 14);
      const g = this.spread.toFixed(1);
      this.ticks[0].style.transform = `translate(-50%, calc(-100% - ${g}px))`;
      this.ticks[1].style.transform = `translate(-50%, ${g}px)`;
      this.ticks[2].style.transform = `translate(calc(-100% - ${g}px), -50%)`;
      this.ticks[3].style.transform = `translate(${g}px, -50%)`;
      if (this.changed('aimX', s.aiming)) this.cross.classList.toggle('aim', s.aiming);
      if (this.changed('killX', this.killT > 0)) this.cross.classList.toggle('kill', this.killT > 0);
    }

    s.gadgets.forEach((g, i) => {
      const el = this.gadgetEls[i];
      const pct = g.cooldown > 0 ? Math.round((g.cooldown / g.max) * 100) : 0;
      if (this.changed(`g${i}`, pct)) {
        el.querySelector<HTMLElement>('.cd')!.style.setProperty('--p', `${pct}%`);
        el.classList.toggle('ready', pct === 0);
      }
      const secs = g.cooldown > 0 ? String(Math.ceil(g.cooldown)) : '';
      if (this.changed(`gs${i}`, secs)) el.querySelector('.secs')!.textContent = secs;
      if (this.changed(`ga${i}`, g.active)) el.classList.toggle('active', g.active);
    });

    if (this.changed('dname', s.dossierName)) {
      this.dName.textContent = s.dossierName;
      this.dossier.classList.remove('flash');
      void this.dossier.offsetWidth;
      this.dossier.classList.add('flash');
    }
    const lines = s.dossierLines.join('|');
    if (this.changed('dlines', lines)) this.dLines.innerHTML = s.dossierLines.map((l) => `<li>${l}</li>`).join('');
    if (this.changed('ddis', s.targetDisguised)) this.dWarn.classList.toggle('hidden', !s.targetDisguised);
    if (this.changed('dstat', s.hasTarget)) this.dStatus.textContent = s.hasTarget ? 'ACTIVE' : '—';

    if (this.changed('scan', !!s.scanner)) this.scanner.classList.toggle('hidden', !s.scanner);
    if (s.scanner) {
      this.scanArrow.style.transform = `rotate(${(-s.scanner.angle * 180) / Math.PI}deg)`;
      if (this.changed('band', s.scanner.band)) this.scanBand.textContent = s.scanner.band;
      if (this.changed('floor', s.scanner.floor)) this.scanFloor.textContent = s.scanner.floor;
    }
    if (this.changed('rev', s.revealed)) this.revealed.classList.toggle('hidden', !s.revealed);
    if (this.changed('prompt', s.prompt ?? '')) {
      this.prompt.classList.toggle('hidden', !s.prompt);
      if (s.prompt) this.promptText.textContent = s.prompt;
    }
    if (this.changed('blend', s.blending)) this.susp.classList.toggle('blending', s.blending);

    // Timed elements.
    if (this.hitTimer > 0) {
      this.hitTimer -= dt;
      this.hit.style.opacity = String(Math.max(0, this.hitTimer / 0.25));
    }
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toastEl.classList.add('hidden');
    }
    if (this.centerTimer > 0) {
      this.centerTimer -= dt;
      if (this.centerTimer <= 0) this.center.classList.remove('show');
    }
    for (let i = 0; i < this.dmgEls.length; i++) {
      if (this.dmgLife[i] > 0) {
        this.dmgLife[i] -= dt;
        this.dmgEls[i].style.opacity = String(Math.max(0, this.dmgLife[i] / 1.2));
      }
    }
  }

  crosshairKick(): void {
    this.kickAmt = 1;
  }

  killConfirm(): void {
    this.killT = 0.6;
  }

  hitmarker(headshot: boolean): void {
    this.hitTimer = 0.25;
    this.hit.classList.toggle('head', headshot);
    this.hit.style.opacity = '1';
  }

  /** angle: radians, 0 = straight ahead, positive = to the left. */
  damageFrom(angle: number): void {
    const hurt = $('#fx-hurt');
    hurt.classList.add('on');
    void hurt.offsetWidth;
    hurt.classList.remove('on');
    let idx = 0;
    for (let i = 1; i < this.dmgLife.length; i++) if (this.dmgLife[i] < this.dmgLife[idx]) idx = i;
    this.dmgLife[idx] = 1.2;
    const el = this.dmgEls[idx];
    el.style.transform = `rotate(${(-angle * 180) / Math.PI}deg)`;
    el.style.opacity = '1';
  }

  centerMessage(text: string, bad = false, secs = 2.2): void {
    this.center.textContent = text;
    this.center.classList.toggle('bad', bad);
    this.center.classList.add('show');
    this.centerTimer = secs;
  }

  /** Short contextual tip above the health bar. */
  toast(text: string, secs = 6): void {
    this.toastEl.textContent = text;
    this.toastEl.classList.remove('hidden');
    this.toastTimer = secs;
  }

  killfeed(text: string, kind: 'good' | 'bad' | 'neutral' = 'neutral'): void {
    // Reuse the oldest entry (pooled DOM nodes).
    const el = this.feedPool.shift()!;
    this.feedPool.push(el);
    el.textContent = text;
    el.className = `feed ${kind}`;
    this.feed.appendChild(el);
    const stamp = String(performance.now());
    el.dataset.stamp = stamp;
    window.setTimeout(() => {
      if (el.dataset.stamp === stamp) el.classList.add('fade');
    }, 5000);
    window.setTimeout(() => {
      if (el.dataset.stamp === stamp) el.classList.add('hidden');
    }, 5700);
  }

  clearFeed(): void {
    for (const el of this.feedPool) el.className = 'feed hidden';
  }

  setDeath(show: boolean, by = '', secs = 0): void {
    if (this.changed('death', show)) this.death.classList.toggle('hidden', !show);
    if (show) {
      if (this.changed('deathBy', by)) this.deathBy.textContent = by;
      const s = `Respawning in ${Math.max(0, secs).toFixed(1)}s`;
      this.deathTimer.textContent = s;
    }
  }

  setScoreboard(show: boolean, rows: ScoreRow[] = []): void {
    if (this.changed('board', show)) this.board.classList.toggle('hidden', !show);
    if (!show) return;
    const html = rows
      .map((r) => `<tr class="${r.me ? 'me' : ''}"><td>${r.name}</td><td class="num">${r.kills}</td><td class="num">${r.deaths}</td><td class="num">${r.civ}</td><td class="num">${r.score}</td></tr>`)
      .join('');
    if (this.changed('boardHtml', html)) this.boardBody.innerHTML = html;
  }

  setDebug(text: string | null): void {
    if (this.changed('dbgOn', text !== null)) this.debugEl.classList.toggle('hidden', text === null);
    if (text !== null) this.debugEl.textContent = text;
  }

  reset(): void {
    this.cache.clear();
    this.toastTimer = 0;
    this.toastEl.classList.add('hidden');
    this.clearFeed();
    this.center.classList.remove('show');
    for (const el of this.dmgEls) el.style.opacity = '0';
    this.dmgLife.fill(0);
  }
}
