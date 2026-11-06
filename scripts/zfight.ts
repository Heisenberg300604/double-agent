// Finds coplanar, same-facing, overlapping faces between rendered boxes (z-fighting).
import { buildGrandStation } from '../src/world/mapData';
const L = buildGrandStation();
const B = L.boxes.filter((b) => b.mat !== 'invisible' && b.shape === 'box');
const C = L.boxes.filter((b) => b.mat !== 'invisible' && b.shape !== 'box');
const ax = ['X', 'Y', 'Z'] as const;
type K = 'minX' | 'maxX' | 'minY' | 'maxY' | 'minZ' | 'maxZ';
let found = 0;
const report = (a: (typeof L.boxes)[0], b: (typeof L.boxes)[0], why: string): void => {
  if (found++ < 40) console.log(why, a.mat, `[${a.minX.toFixed(2)},${a.minY.toFixed(2)},${a.minZ.toFixed(2)}]`, b.mat, `[${b.minX.toFixed(2)},${b.minY.toFixed(2)},${b.minZ.toFixed(2)}]`);
};
for (let i = 0; i < B.length; i++) for (let j = i + 1; j < B.length; j++) {
  const a = B[i], b = B[j];
  for (let k = 0; k < 3; k++) {
    const o = [0, 1, 2].filter((q) => q !== k);
    const ov = o.map((q) => Math.min(a[`max${ax[q]}` as K], b[`max${ax[q]}` as K]) - Math.max(a[`min${ax[q]}` as K], b[`min${ax[q]}` as K]));
    if (ov[0] <= 0.005 || ov[1] <= 0.005) continue;
    for (const side of ['min', 'max'] as const) {
      const key = `${side}${ax[k]}` as K;
      if (Math.abs(a[key] - b[key]) >= 0.002) continue;
      const v = a[key];
      // Ignore faces that are buried: on the floor, in the ceiling, in the outer walls.
      if (k === 1 && (v <= 0.001 || v >= 13.9 || (side === 'min' && v < 0.05))) continue;
      if (k === 0 && (Math.abs(v) >= 39.9)) continue;
      if (k === 2 && (Math.abs(v) >= 24.9)) continue;
      if (a.mat === 'wall' || b.mat === 'wall') continue;
      report(a, b, `${key}`);
    }
  }
}
// Cylinders sharing an axis and radius overlapping in height.
for (let i = 0; i < C.length; i++) for (let j = i + 1; j < C.length; j++) {
  const a = C[i], b = C[j];
  if (a.shape !== b.shape) continue;
  const same = ['minX', 'maxX', 'minZ', 'maxZ'].every((k) => Math.abs(a[k as K] - b[k as K]) < 0.002);
  if (same && Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY) > 0.005) report(a, b, 'cyl-same');
}
console.log('total', found);
