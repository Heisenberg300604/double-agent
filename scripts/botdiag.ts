import { World } from '../src/sim/world';
const w = new World({ seed: 1, withPlayer: false });
for (let i = 0; i < 60*120; i++) {
  w.step(1/60); w.drainEvents();
  if (i % (60*10) === 0) {
    for (const [id, b] of w.brains) {
      const a = w.agents[id]; const t = w.agents[b.targetId];
      if (!t) continue;
      const d = Math.hypot(t.x-a.x,t.z-a.z).toFixed(0);
      console.log(`t=${(i/60).toFixed(0)} ${a.spy!.name} st=${b.state} d=${d} conf=${b.confidence.toFixed(2)} chosenIsT=${b.chosen===b.targetId} bT=${(b.belief.get(b.targetId)??0).toFixed(2)} nBel=${b.belief.size} sus=${a.spy!.suspicion.toFixed(0)}`);
    }
  }
}
