// Uniform-grid spatial hash for agent neighbour queries. Rebuilt every tick;
// cell arrays are reused so rebuilding does not allocate.

export class SpatialHash {
  readonly cell: number;
  private readonly minX: number;
  private readonly minZ: number;
  private readonly cols: number;
  private readonly rows: number;
  private readonly cells: number[][];

  constructor(minX: number, minZ: number, maxX: number, maxZ: number, cell: number) {
    this.cell = cell;
    this.minX = minX;
    this.minZ = minZ;
    this.cols = Math.ceil((maxX - minX) / cell) + 1;
    this.rows = Math.ceil((maxZ - minZ) / cell) + 1;
    this.cells = [];
    for (let i = 0; i < this.cols * this.rows; i++) this.cells.push([]);
  }

  clear(): void {
    for (const c of this.cells) c.length = 0;
  }

  private cx(x: number): number {
    const c = Math.floor((x - this.minX) / this.cell);
    return c < 0 ? 0 : c >= this.cols ? this.cols - 1 : c;
  }

  private cz(z: number): number {
    const c = Math.floor((z - this.minZ) / this.cell);
    return c < 0 ? 0 : c >= this.rows ? this.rows - 1 : c;
  }

  insert(id: number, x: number, z: number): void {
    this.cells[this.cz(z) * this.cols + this.cx(x)].push(id);
  }

  /** Appends ids in cells overlapping the query circle to `out` (caller filters by exact distance). */
  query(x: number, z: number, r: number, out: number[]): number[] {
    out.length = 0;
    const x0 = this.cx(x - r), x1 = this.cx(x + r);
    const z0 = this.cz(z - r), z1 = this.cz(z + r);
    for (let j = z0; j <= z1; j++) {
      for (let i = x0; i <= x1; i++) {
        const c = this.cells[j * this.cols + i];
        for (let k = 0; k < c.length; k++) out.push(c[k]);
      }
    }
    return out;
  }
}
