// Procedural canvas textures (no image files), including "live" ones that
// redraw themselves: the departure board, station clocks and platform LEDs.

import * as THREE from 'three';

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function tex(c: HTMLCanvasElement, repeat = true, srgb = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

let seed = 1;
function rnd(): number {
  seed = (seed * 16807) % 2147483647;
  return seed / 2147483647;
}

function noise(ctx: CanvasRenderingContext2D, w: number, h: number, amount: number, s: number): void {
  seed = s;
  const img = ctx.getImageData(0, 0, w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rnd() - 0.5) * amount;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

function veins(g: CanvasRenderingContext2D, x0: number, y0: number, size: number, color: string, count: number): void {
  g.strokeStyle = color;
  for (let v = 0; v < count; v++) {
    g.lineWidth = 0.6 + rnd() * 1.4;
    g.beginPath();
    let x = x0 + rnd() * size, y = y0 + rnd() * size;
    g.moveTo(x, y);
    const ang = rnd() * Math.PI * 2;
    for (let k = 0; k < 14; k++) {
      x += Math.cos(ang + (rnd() - 0.5) * 1.6) * size * 0.08;
      y += Math.sin(ang + (rnd() - 0.5) * 1.6) * size * 0.08;
      g.lineTo(x, y);
    }
    g.stroke();
  }
}

/** Polished marble checker with brass inlay lines. One repeat = 2×2 tiles. */
export function floorTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(512, 512);
  seed = 5;
  const tiles = [['#5d574e', '#2a2724'], ['#2a2724', '#5d574e']];
  for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
    const light = tiles[y][x] === '#5d574e';
    const grad = g.createLinearGradient(x * 256, y * 256, x * 256 + 256, y * 256 + 256);
    grad.addColorStop(0, light ? '#635c52' : '#2d2a27');
    grad.addColorStop(1, light ? '#544e46' : '#252220');
    g.fillStyle = grad;
    g.fillRect(x * 256, y * 256, 256, 256);
    veins(g, x * 256, y * 256, 256, light ? 'rgba(220,210,190,0.18)' : 'rgba(150,140,120,0.12)', 6);
  }
  noise(g, 512, 512, 10, 7);
  g.strokeStyle = 'rgba(190,150,80,0.55)';
  g.lineWidth = 3;
  for (let i = 0; i <= 512; i += 256) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 512); g.stroke();
    g.beginPath(); g.moveTo(0, i); g.lineTo(512, i); g.stroke();
  }
  // Small brass diamonds at the tile corners.
  g.fillStyle = 'rgba(200,160,90,0.8)';
  for (const [x, y] of [[0, 0], [256, 0], [0, 256], [256, 256], [512, 0], [0, 512], [512, 512], [512, 256], [256, 512]]) {
    g.beginPath(); g.moveTo(x, y - 10); g.lineTo(x + 10, y); g.lineTo(x, y + 10); g.lineTo(x - 10, y); g.closePath(); g.fill();
  }
  return tex(c);
}

export function corridorTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(512, 512);
  seed = 9;
  g.fillStyle = '#2e241d';
  g.fillRect(0, 0, 512, 512);
  // Herringbone parquet.
  const w = 32, l = 128;
  for (let y = -l; y < 512 + l; y += w) {
    for (let x = -l; x < 512 + l; x += l) {
      const off = ((y / w) % 4) * w;
      g.fillStyle = `hsl(26, ${26 + rnd() * 8}%, ${15 + rnd() * 7}%)`;
      g.save();
      g.translate(x + off, y);
      g.fillRect(1, 1, l - 2, w - 2);
      g.restore();
    }
  }
  noise(g, 512, 512, 12, 11);
  return tex(c);
}

export function concreteTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#5a5b5e';
  g.fillRect(0, 0, 256, 256);
  noise(g, 256, 256, 30, 3);
  seed = 4;
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(0,0,0,${0.03 + rnd() * 0.05})`;
    g.beginPath();
    g.arc(rnd() * 256, rnd() * 256, 4 + rnd() * 20, 0, Math.PI * 2);
    g.fill();
  }
  g.strokeStyle = 'rgba(0,0,0,0.35)';
  g.lineWidth = 2;
  g.strokeRect(0, 0, 256, 256);
  return tex(c);
}

/** Panelled wall: wainscot panels below, plaster with faint seams above. Tinted by vertex colour. */
export function wallTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#8a8a8a';
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = 'rgba(0,0,0,0.16)';
  g.fillRect(0, 0, 256, 4);
  g.fillRect(0, 0, 4, 256);
  g.strokeStyle = 'rgba(255,255,255,0.08)';
  g.lineWidth = 2;
  g.strokeRect(24, 24, 208, 208);
  g.strokeStyle = 'rgba(0,0,0,0.18)';
  g.strokeRect(28, 28, 200, 200);
  noise(g, 256, 256, 12, 5);
  return tex(c, true, false);
}

// ------------------------------------------------------------------ sign atlas
export const SIGNS = [
  'TICKETS', 'CAFÉ', 'NEWS & TOBACCO', 'BOOKSELLER', 'FLORIST', 'BAKERY', 'LEFT LUGGAGE', 'PLATFORMS  →',
  'WAY OUT', 'GRAND STATION', 'PLATFORM 1', 'PLATFORM 2', 'PLATFORM 3', 'WATCHMAKER', 'TELEGRAMS', 'CHEMIST',
  'WAITING ROOM', 'RESTAURANT', 'LOCKERS', 'RESTROOMS', 'TAILOR', 'SWEETS', 'TOBACCONIST', 'NORTHGATE',
] as const;
export type SignName = (typeof SIGNS)[number];
const ATLAS_COLS = 3, ATLAS_ROWS = 8;

/** UV rectangle [u0, v0, u1, v1] of a sign in the atlas. */
export function signUV(name: SignName): [number, number, number, number] {
  const i = Math.max(0, SIGNS.indexOf(name));
  const col = i % ATLAS_COLS, row = Math.floor(i / ATLAS_COLS);
  const u0 = col / ATLAS_COLS, u1 = (col + 1) / ATLAS_COLS;
  const v1 = 1 - row / ATLAS_ROWS, v0 = 1 - (row + 1) / ATLAS_ROWS;
  return [u0 + 0.002, v0 + 0.004, u1 - 0.002, v1 - 0.004];
}

export function signAtlasTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(1536, 512);
  const cw = 1536 / ATLAS_COLS, ch = 512 / ATLAS_ROWS;
  SIGNS.forEach((name, i) => {
    const x = (i % ATLAS_COLS) * cw, y = Math.floor(i / ATLAS_COLS) * ch;
    const platform = name.startsWith('PLATFORM') || name === 'WAY OUT';
    g.fillStyle = platform ? '#14233a' : '#17120d';
    g.fillRect(x, y, cw, ch);
    g.strokeStyle = platform ? '#d9e2ee' : '#c9a25a';
    g.lineWidth = 3;
    g.strokeRect(x + 5, y + 5, cw - 10, ch - 10);
    g.fillStyle = platform ? '#eef3f8' : '#f0d9a0';
    g.font = `${platform ? 'bold ' : ''}34px Georgia, serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(name, x + cw / 2, y + ch / 2 + 2);
  });
  const t = tex(c, false);
  return t;
}

// ------------------------------------------------------------------ live textures
const DESTS = ['NORTHGATE', 'HALVERN BAY', 'CASTLEMERE', 'ORRIN FIELDS', 'SALTWORTH', 'KINGS VALE', 'ASHCOMBE', 'MIRELOW', 'BRANDISH CROSS', 'WESTERLY'];

function hhmm(mins: number): string {
  const h = Math.floor(mins / 60) % 24, m = Math.floor(mins % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Departure board that ticks with station time and flips rows as trains leave. */
export class LiveBoard {
  readonly texture: THREE.CanvasTexture;
  private readonly g: CanvasRenderingContext2D;
  private lastMinute = -1;
  private flip = 0;

  constructor() {
    const [c, g] = canvas(512, 256);
    this.g = g;
    this.texture = tex(c, false);
  }

  /** stationMinutes: minutes since midnight. */
  update(stationMinutes: number, dt: number): void {
    const minute = Math.floor(stationMinutes);
    this.flip = Math.max(0, this.flip - dt);
    if (minute === this.lastMinute && this.flip <= 0) return;
    if (minute !== this.lastMinute) this.flip = 0.6;
    this.lastMinute = minute;
    const g = this.g;
    g.fillStyle = '#0b0c0e';
    g.fillRect(0, 0, 512, 256);
    g.fillStyle = '#1c1a14';
    g.fillRect(0, 0, 512, 46);
    g.fillStyle = '#e8b64c';
    g.font = 'bold 24px monospace';
    g.fillText('DEPARTURES', 16, 31);
    g.textAlign = 'right';
    g.fillText(hhmm(stationMinutes), 496, 31);
    g.textAlign = 'left';
    g.font = '19px monospace';
    // Six upcoming services, every 7 minutes, alternating platforms.
    const base = Math.floor(stationMinutes / 7) * 7 + 7;
    for (let i = 0; i < 6; i++) {
      const t = base + i * 7;
      const idx = Math.floor(t / 7);
      const dest = DESTS[idx % DESTS.length];
      const plat = (idx % 2) + 1;
      const y = 76 + i * 30;
      const due = t - stationMinutes;
      const status = due < 2 ? 'BOARDING' : idx % 5 === 3 ? 'DELAYED' : 'ON TIME';
      if (i === 0 && this.flip > 0) {
        // Split-flap shimmer on the top row while it changes.
        g.fillStyle = `rgba(242,209,122,${0.3 + Math.random() * 0.5})`;
      } else {
        g.fillStyle = '#f2d17a';
      }
      g.fillText(hhmm(t), 16, y);
      g.fillText(dest, 96, y);
      g.fillText(String(plat), 340, y);
      g.fillStyle = status === 'DELAYED' ? '#d98f41' : status === 'BOARDING' ? '#ffffff' : '#9fd3a8';
      g.fillText(status, 382, y);
      g.fillStyle = 'rgba(255,255,255,0.04)';
      g.fillRect(10, y + 8, 492, 1);
    }
    this.texture.needsUpdate = true;
  }
}

/** Analogue clock face; hands follow station time. */
export class LiveClock {
  readonly texture: THREE.CanvasTexture;
  private readonly g: CanvasRenderingContext2D;
  private lastSecond = -1;

  constructor() {
    const [c, g] = canvas(256, 256);
    this.g = g;
    this.texture = tex(c, false);
  }

  update(stationMinutes: number): void {
    const sec = Math.floor(stationMinutes * 60);
    if (sec === this.lastSecond) return;
    this.lastSecond = sec;
    const g = this.g;
    g.fillStyle = '#1b1712';
    g.fillRect(0, 0, 256, 256);
    const face = g.createRadialGradient(128, 118, 10, 128, 128, 112);
    face.addColorStop(0, '#fbf3dd');
    face.addColorStop(1, '#ddd0ae');
    g.fillStyle = face;
    g.beginPath();
    g.arc(128, 128, 110, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#b08d4a';
    g.lineWidth = 9;
    g.stroke();
    g.fillStyle = '#1b1712';
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * Math.PI * 2;
      const big = i % 5 === 0;
      g.save();
      g.translate(128 + Math.sin(a) * 94, 128 - Math.cos(a) * 94);
      g.rotate(a);
      g.fillRect(big ? -3 : -1, big ? -9 : -4, big ? 6 : 2, big ? 18 : 8);
      g.restore();
    }
    const h = (stationMinutes / 60) % 12, m = stationMinutes % 60, s = (stationMinutes * 60) % 60;
    const hand = (ang: number, len: number, width: number, color: string): void => {
      g.strokeStyle = color;
      g.lineWidth = width;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(128 - Math.sin(ang) * 12, 128 + Math.cos(ang) * 12);
      g.lineTo(128 + Math.sin(ang) * len, 128 - Math.cos(ang) * len);
      g.stroke();
    };
    hand((h / 12) * Math.PI * 2, 52, 8, '#1b1712');
    hand((m / 60) * Math.PI * 2, 80, 5, '#1b1712');
    hand((Math.floor(s) / 60) * Math.PI * 2, 86, 2, '#8a2b1e');
    g.fillStyle = '#b08d4a';
    g.beginPath();
    g.arc(128, 128, 6, 0, Math.PI * 2);
    g.fill();
    this.texture.needsUpdate = true;
  }
}

/** Amber dot-matrix platform display with a scrolling message. */
export class LiveLed {
  readonly texture: THREE.CanvasTexture;
  private readonly g: CanvasRenderingContext2D;
  private scroll = 0;
  private acc = 0;

  constructor() {
    const [c, g] = canvas(512, 64);
    this.g = g;
    this.texture = tex(c, false);
  }

  update(stationMinutes: number, dt: number): void {
    this.acc += dt;
    if (this.acc < 1 / 15) return;
    this.scroll += this.acc * 60;
    this.acc = 0;
    const g = this.g;
    g.fillStyle = '#080706';
    g.fillRect(0, 0, 512, 64);
    const next = Math.floor(stationMinutes / 7) * 7 + 7;
    const dest = DESTS[Math.floor(next / 7) % DESTS.length];
    const msg = `${hhmm(next)} ${dest}   ·   CALLING AT ALL STATIONS   ·   PLEASE MIND THE GAP   ·   `;
    g.font = 'bold 30px monospace';
    g.fillStyle = '#ffb63d';
    const w = g.measureText(msg).width;
    const x = 512 - (this.scroll % (w + 512));
    g.fillText(msg, x, 43);
    g.fillText(msg, x + w + 512, 43);
    // Dot-matrix grille.
    g.fillStyle = 'rgba(8,7,6,0.55)';
    for (let y = 0; y < 64; y += 4) g.fillRect(0, y, 512, 1);
    for (let x2 = 0; x2 < 512; x2 += 4) g.fillRect(x2, 0, 1, 64);
    this.texture.needsUpdate = true;
  }
}

/** Radial soft blob (for shadows). */
export function softCircleTexture(inner = 'rgba(0,0,0,0.9)', outer = 'rgba(0,0,0,0)'): THREE.CanvasTexture {
  const [c, g] = canvas(64, 64);
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, inner);
  grad.addColorStop(1, outer);
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return tex(c, false, false);
}

/** White radial glow with a soft falloff (for halos, light pools, smoke). */
export function glowTexture(power = 1): THREE.CanvasTexture {
  const [c, g] = canvas(128, 128);
  const img = g.createImageData(128, 128);
  for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
    const d = Math.hypot(x - 63.5, y - 63.5) / 64;
    const a = Math.max(0, 1 - d);
    const v = Math.pow(a, 2 * power) * 255;
    const i = (y * 128 + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
    img.data[i + 3] = v;
  }
  g.putImageData(img, 0, 0);
  return tex(c, false, false);
}

export function smokePuffTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(64, 64);
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.6)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return tex(c, false, false);
}
