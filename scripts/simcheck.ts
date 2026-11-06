import { World } from '../src/sim/world';
const seed = Number(process.argv[2] ?? 1);
const w = new World({ seed, withPlayer: false });
const dt = 1/60;
const t0 = performance.now();
let kills = 0, civ = 0, targetKills = 0, other=0, hunter=0;
const stateCounts: Record<string, number> = {};
let tick = 0;
while (!w.over) {
  w.step(dt);
  tick++;
  for (const e of w.drainEvents()) {
    if (e.type === 'kill') { kills++; if (e.relation==='civilian') civ++; if (e.relation==='target') targetKills++; if (e.relation==='other') other++; if (e.relation==='hunter') hunter++; }
  }
  if (tick % 60 === 0) for (const b of w.brains.values()) stateCounts[b.state] = (stateCounts[b.state] ?? 0) + 1;
  if (!w.contracts.isValid()) { console.log('INVALID CHAIN'); break; }
}
const t1 = performance.now();
console.log('seed', seed, 'sim ms', (t1-t0).toFixed(0), 'kills', kills, 'target', targetKills, 'hunter', hunter, 'other', other, 'civ', civ);
console.log('states', stateCounts);
console.log(w.spyRanking().map(s => `${s.spy!.name}:${s.spy!.score}(${s.spy!.kills}/${s.spy!.deaths})`).join(' '));
