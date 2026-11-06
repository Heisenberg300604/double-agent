// Title / How to Play / Settings / Pause / End-of-round screens.

import type { Settings } from './settings';
import type { ScoreRow } from './hud';

export type MenuId = 'title' | 'howto' | 'settings' | 'pause' | 'end' | null;

export interface MenuHandlers {
  play(): void;
  resume(): void;
  quit(): void;
  again(): void;
  howtoDone(): void;
  settingsChanged(s: Settings): void;
}

const IDS: Exclude<MenuId, null>[] = ['title', 'howto', 'settings', 'pause', 'end'];

export class Menus {
  current: MenuId = null;
  /** Where Back / Got it returns to. */
  private returnTo: MenuId = 'title';
  private settings: Settings;
  private readonly h: MenuHandlers;

  constructor(settings: Settings, handlers: MenuHandlers) {
    this.settings = settings;
    this.h = handlers;
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
    }
  }

  /** Show How to Play as the pre-match briefing (Got it starts the match). */
  briefing(): void {
    this.returnTo = null;
    this.show('howto');
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
