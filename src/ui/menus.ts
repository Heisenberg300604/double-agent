// Title / How to Play / Settings / Pause / End-of-round screens.

import type { Settings } from './settings';
import type { ScoreRow } from './hud';

export type MenuId = 'title' | 'howto' | 'briefing' | 'settings' | 'pause' | 'end' | null;

export interface MenuHandlers {
  play(): void;
  /** Practice: no hunters, a target that stands still, ends at the first kill. */
  practice(): void;
  resume(): void;
  quit(): void;
  again(): void;
  howtoDone(): void;
  /** The first-run briefing (all four cards) was finished: start the match. */
  briefingDone(): void;
  settingsChanged(s: Settings): void;
}

const IDS: Exclude<MenuId, null>[] = ['title', 'howto', 'briefing', 'settings', 'pause', 'end'];

export class Menus {
  current: MenuId = null;
  /** Where Back / Got it returns to. */
  private returnTo: MenuId = 'title';
  private settings: Settings;
  private readonly h: MenuHandlers;
  /** The explainer cards from the title screen, reused by the briefing and How to Play. */
  private readonly cards: HTMLElement[];
  private briefStep = 0;

  constructor(settings: Settings, handlers: MenuHandlers) {
    this.settings = settings;
    this.h = handlers;
    this.cards = [...document.querySelectorAll<HTMLElement>('#explainer-cards .xcard')];
    const howto = document.getElementById('howto-cards')!;
    const grid = document.createElement('div');
    grid.className = 'cards';
    for (const c of this.cards) grid.appendChild(c.cloneNode(true));
    howto.appendChild(grid);
    // Touch-only devices: say politely that the game needs a mouse and keyboard.
    try {
      if (matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches) {
        document.getElementById('touch-note')!.classList.remove('hidden');
      }
    } catch {
      /* matchMedia unavailable */
    }
    document.querySelectorAll<HTMLButtonElement>('[data-action]').forEach((b) => {
      b.addEventListener('click', () => this.action(b.dataset.action!));
    });
    const bind = (id: string, out: string, key: 'sensitivity' | 'fov' | 'volume', fmt: (v: number) => string): void => {
      const input = document.getElementById(id) as HTMLInputElement;
      const o = document.getElementById(out)!;
      input.value = String(this.settings[key]);
      o.textContent = fmt(this.settings[key]);
      input.addEventListener('input', () => {
        this.settings[key] = Number(input.value);
        o.textContent = fmt(this.settings[key]);
        this.h.settingsChanged(this.settings);
      });
    };
    bind('set-sens', 'out-sens', 'sensitivity', (v) => v.toFixed(2));
    bind('set-fov', 'out-fov', 'fov', (v) => `${v}°`);
    bind('set-vol', 'out-vol', 'volume', (v) => `${Math.round(v * 100)}%`);
    const q = document.getElementById('set-quality') as HTMLSelectElement;
    q.value = this.settings.quality;
    q.addEventListener('change', () => {
      this.settings.quality = q.value as Settings['quality'];
      this.h.settingsChanged(this.settings);
    });
  }

  private action(a: string): void {
    switch (a) {
      case 'play': return this.h.play();
      case 'practice': return this.h.practice();
      case 'resume': return this.h.resume();
      case 'quit': return this.h.quit();
      case 'again': return this.h.again();
      case 'howto':
        this.returnTo = this.current;
        return this.show('howto');
      case 'howto-done':
        if (this.returnTo === 'title' || this.returnTo === 'pause') return this.show(this.returnTo);
        return this.h.howtoDone();
      case 'settings':
        this.returnTo = this.current;
        return this.show('settings');
      case 'settings-back':
        return this.show(this.returnTo ?? 'title');
      case 'brief-next':
        if (this.briefStep >= this.cards.length - 1) return this.h.briefingDone();
        this.briefStep++;
        return this.renderBrief();
      case 'brief-back':
        if (this.briefStep === 0) return this.show('title');
        this.briefStep--;
        return this.renderBrief();
    }
  }

  /** First run: step through the four illustrated cards, then start the match. */
  briefing(): void {
    this.briefStep = 0;
    this.show('briefing');
    this.renderBrief();
  }

  private renderBrief(): void {
    const host = document.getElementById('brief-card')!;
    host.replaceChildren(this.cards[this.briefStep].cloneNode(true));
    document.querySelectorAll('#brief-dots i').forEach((d, i) => d.classList.toggle('on', i === this.briefStep));
    const next = document.querySelector<HTMLButtonElement>('#menu-briefing [data-action="brief-next"]')!;
    next.textContent = this.briefStep === this.cards.length - 1 ? 'Start mission' : 'Next';
    next.focus({ preventScroll: true });
  }

  show(id: MenuId): void {
    this.current = id;
    for (const m of IDS) document.getElementById(`menu-${m}`)!.classList.toggle('hidden', m !== id);
    const first = id ? document.querySelector<HTMLButtonElement>(`#menu-${id} button.primary`) : null;
    first?.focus({ preventScroll: true });
  }

  showEnd(rows: (ScoreRow & { rank: number })[], me: ScoreRow, rank: number, total: number, targetKills: number): void {
    document.getElementById('end-result')!.textContent = rank === 1 ? 'Mission accomplished' : 'Round over';
    document.getElementById('end-title')!.textContent = rank === 1 ? 'YOU WIN' : `YOU PLACED ${rank} OF ${total}`;
    document.getElementById('end-stats')!.innerHTML = [
      [me.score, 'Score'], [targetKills, 'Targets'], [me.deaths, 'Deaths'], [me.civ, 'Civilians'],
    ].map(([v, l]) => `<div><b>${v}</b><span>${l}</span></div>`).join('');
    document.getElementById('end-table')!.innerHTML = rows
      .map((r) => `<tr class="${r.me ? 'me' : ''}"><td>${r.rank}</td><td>${r.name}</td><td class="num">${r.kills}</td><td class="num">${r.deaths}</td><td class="num">${r.civ}</td><td class="num">${r.score}</td></tr>`)
      .join('');
    this.show('end');
  }
}
