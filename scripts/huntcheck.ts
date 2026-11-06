// Balance probe: how long does a passive (idle) player survive, and how busy are the bots?
import { World } from '../src/sim/world';
import { emptyIntent } from '../src/sim/types';
const idle = emptyIntent();
const firstDeaths: number[] = [];
let totalDeaths = 0, totalKills = 0, civ = 0;
for (let seed = 1; seed <= 6; seed++) {
  const w = new World({ seed, withPlayer: true });
  let first = -1;
  while (!w.over) {
    w.setPlayerIntent(idle);
    w.step(1 / 60);
    for (const e of w.drainEvents()) {
      if (e.type !== 'kill') continue;
      totalKills++;
      if (e.relation === 'civilian') civ++;
      if (e.victim === w.player!.id) { totalDeaths++; if (first < 0) first = w.time; }
    }
  }
  firstDeaths.push(Math.round(first));
}
console.log('first player death (s):', firstDeaths.join(', '));
console.log('player deaths per match:', (totalDeaths / 6).toFixed(1), ' kills per match:', (totalKills / 6).toFixed(1), ' civilian kills per match:', (civ / 6).toFixed(1));
