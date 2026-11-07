// Player settings persisted to localStorage (wrapped in try/catch: storage may be unavailable).

import type { QualitySetting } from '../render/renderer';

export interface Settings {
  sensitivity: number;
  fov: number;
  volume: number;
  quality: QualitySetting;
  /** The first-run briefing and first-match tips have been seen. */
  tutorialDone: boolean;
}

const KEY = 'double-agent.settings.v1';

export const DEFAULT_SETTINGS: Settings = {
  sensitivity: 1,
  fov: 75,
  volume: 0.8,
  quality: 'auto',
  tutorialDone: false,
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<Settings> & { seenHowTo?: boolean };
    const s = { ...DEFAULT_SETTINGS, ...parsed };
    // Older saves only knew "seenHowTo".
    if (parsed.tutorialDone === undefined && parsed.seenHowTo) s.tutorialDone = true;
    delete (s as Partial<Settings> & { seenHowTo?: boolean }).seenHowTo;
    if (!['auto', 'low', 'medium', 'high'].includes(s.quality)) s.quality = 'auto';
    s.sensitivity = clampNum(s.sensitivity, 0.2, 3, 1);
    s.fov = clampNum(s.fov, 60, 100, 75);
    s.volume = clampNum(s.volume, 0, 1, 0.8);
    return s;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable — settings just won't persist */
  }
}

function clampNum(v: unknown, lo: number, hi: number, def: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : def;
}
