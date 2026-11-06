// Fixed-capacity object pool. Items are recycled oldest-first when full so
// effects never allocate in the frame loop.

export class Pool<T extends { active: boolean }> {
  readonly items: T[];
  private cursor = 0;

  constructor(capacity: number, factory: () => T) {
    this.items = [];
    for (let i = 0; i < capacity; i++) this.items.push(factory());
  }

  acquire(): T {
    for (let n = 0; n < this.items.length; n++) {
      const i = (this.cursor + n) % this.items.length;
      if (!this.items[i].active) {
        this.cursor = (i + 1) % this.items.length;
        this.items[i].active = true;
        return this.items[i];
      }
    }
    // Pool exhausted: recycle the next slot.
    const it = this.items[this.cursor];
    this.cursor = (this.cursor + 1) % this.items.length;
    it.active = true;
    return it;
  }

  forEachActive(fn: (item: T) => void): void {
    for (const it of this.items) if (it.active) fn(it);
  }

  clear(): void {
    for (const it of this.items) it.active = false;
  }
}
