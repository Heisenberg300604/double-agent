// Procedural canvas textures (no image files).

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
  t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

function noise(ctx: CanvasRenderingContext2D, w: number, h: number, amount: number, seed: number): void {
  let s = seed;
  const rnd = (): number => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  const img = ctx.getImageData(0, 0, w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rnd() - 0.5) * amount;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

/** Large marble-ish checker tiles for the concourse. One repeat = 2 tiles. */
export function floorTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  const cols = ['#4a4640', '#2b2926'];
  for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
    g.fillStyle = cols[(x + y) % 2];
    g.fillRect(x * 128, y * 128, 128, 128);
  }
  g.strokeStyle = 'rgba(176,141,74,0.35)';
  g.lineWidth = 2;
  for (let i = 0; i <= 256; i += 128) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 256); g.stroke();
    g.beginPath(); g.moveTo(0, i); g.lineTo(256, i); g.stroke();
  }
  noise(g, 256, 256, 14, 7);
  return tex(c);
}

export function corridorTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#3a3029';
  g.fillRect(0, 0, 256, 256);
  // Wooden parquet planks.
  for (let y = 0; y < 256; y += 32) {
    const off = (y / 32) % 2 ? 64 : 0;
    for (let x = -64; x < 256; x += 128) {
      g.fillStyle = `hsl(25, 28%, ${17 + ((x + y) % 5)}%)`;
      g.fillRect(x + off + 1, y + 1, 126, 30);
    }
  }
  noise(g, 256, 256, 12, 11);
  return tex(c);
}

export function concreteTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(128, 128);
  g.fillStyle = '#56575a';
  g.fillRect(0, 0, 128, 128);
  noise(g, 128, 128, 26, 3);
  g.strokeStyle = 'rgba(0,0,0,0.25)';
  g.strokeRect(0, 0, 128, 128);
  return tex(c);
}

export function wallTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(128, 128);
  g.fillStyle = '#7a7a7a';
  g.fillRect(0, 0, 128, 128);
  // Panel seams.
  g.fillStyle = 'rgba(0,0,0,0.18)';
  g.fillRect(0, 0, 128, 3);
  g.fillRect(0, 0, 3, 128);
  noise(g, 128, 128, 10, 5);
  return tex(c, true, false);
}

export function boardTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(512, 256);
  g.fillStyle = '#0c0d0f';
  g.fillRect(0, 0, 512, 256);
  g.fillStyle = '#e8b64c';
  g.font = 'bold 26px monospace';
  g.fillText('DEPARTURES', 18, 36);
  g.font = '20px monospace';
  const rows = [
    ['08:12', 'NORTHGATE', '1', 'ON TIME'],
    ['08:20', 'HALVERN BAY', '2', 'ON TIME'],
    ['08:34', 'CASTLEMERE', '1', 'DELAYED'],
    ['08:41', 'ORRIN FIELDS', '2', 'ON TIME'],
    ['08:55', 'SALTWORTH', '1', 'BOARDING'],
    ['09:03', 'KINGS VALE', '2', 'ON TIME'],
  ];
  rows.forEach((r, i) => {
    const y = 76 + i * 30;
    g.fillStyle = '#f2d17a';
    g.fillText(r[0], 18, y);
    g.fillText(r[1], 100, y);
    g.fillText(r[2], 330, y);
    g.fillStyle = r[3] === 'DELAYED' ? '#d9a441' : '#9fd3a8';
    g.fillText(r[3], 380, y);
  });
  return tex(c, false);
}

export function clockTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#1b1712';
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#efe6cf';
  g.beginPath();
  g.arc(128, 128, 110, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#b08d4a';
  g.lineWidth = 8;
  g.stroke();
  g.fillStyle = '#1b1712';
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    g.save();
    g.translate(128 + Math.sin(a) * 92, 128 - Math.cos(a) * 92);
    g.rotate(a);
    g.fillRect(-3, -9, 6, 18);
    g.restore();
  }
  g.lineCap = 'round';
  g.lineWidth = 7;
  g.beginPath(); g.moveTo(128, 128); g.lineTo(128 + 45, 128 - 30); g.stroke();
  g.lineWidth = 4;
  g.beginPath(); g.moveTo(128, 128); g.lineTo(128 - 10, 128 - 80); g.stroke();
  return tex(c, false);
}

/** Radial soft blob (for shadows and smoke puffs). */
export function softCircleTexture(inner = 'rgba(0,0,0,0.9)', outer = 'rgba(0,0,0,0)'): THREE.CanvasTexture {
  const [c, g] = canvas(64, 64);
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, inner);
  grad.addColorStop(1, outer);
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
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
