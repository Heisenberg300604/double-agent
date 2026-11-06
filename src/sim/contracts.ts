// The target chain: a cycle over all living spies. Each spy targets the next
// one in `order`, so everyone has exactly one target and one hunter.

import type { Rng } from '../core/rng';

export class Contracts {
  order: number[] = [];
  private readonly rng: Rng;

  constructor(rng: Rng) {
    this.rng = rng;
  }

  init(ids: readonly number[]): void {
    this.order = this.rng.shuffle([...ids]);
  }

  has(id: number): boolean {
    return this.order.includes(id);
  }

  /** The spy that `id` hunts, or -1 if not in the chain (dead) or alone. */
  targetOf(id: number): number {
    if (this.order.length < 2) return -1;
    const i = this.order.indexOf(id);
    if (i < 0) return -1;
    return this.order[(i + 1) % this.order.length];
  }

  /** The spy hunting `id`, or -1. */
  hunterOf(id: number): number {
    if (this.order.length < 2) return -1;
    const i = this.order.indexOf(id);
    if (i < 0) return -1;
    return this.order[(i - 1 + this.order.length) % this.order.length];
  }

  remove(id: number): void {
    const i = this.order.indexOf(id);
    if (i >= 0) this.order.splice(i, 1);
  }

  /** Insert at a random position (used on respawn). */
  insertRandom(id: number): void {
    if (this.has(id)) return;
    const pos = this.order.length === 0 ? 0 : this.rng.int(this.order.length + 1);
    this.order.splice(pos, 0, id);
  }

  /**
   * Victim leaves the chain; the killer (if a spy in the chain) inherits the
   * victim's target. If that would make the killer target themselves (they
   * killed their own hunter) the killer is reshuffled to a random position.
   */
  onKill(killer: number, victim: number): void {
    const victimTarget = this.targetOf(victim);
    this.remove(victim);
    if (killer < 0 || killer === victim || !this.has(killer)) return;
    if (this.order.length < 2) return;
    if (victimTarget === killer || victimTarget < 0) {
      this.remove(killer);
      this.insertRandom(killer);
      return;
    }
    if (this.targetOf(killer) === victimTarget) return;
    this.remove(killer);
    const ti = this.order.indexOf(victimTarget);
    this.order.splice(ti, 0, killer);
  }

  /** Valid when ids are unique and nobody targets themselves. */
  isValid(): boolean {
    const set = new Set(this.order);
    if (set.size !== this.order.length) return false;
    if (this.order.length < 2) return true;
    // Walking the target links from any member must visit everyone once.
    const start = this.order[0];
    let cur = start;
    const seen = new Set<number>();
    for (let i = 0; i < this.order.length; i++) {
      if (seen.has(cur)) return false;
      seen.add(cur);
      const t = this.targetOf(cur);
      if (t === cur || t < 0) return false;
      cur = t;
    }
    return cur === start && seen.size === this.order.length;
  }
}
