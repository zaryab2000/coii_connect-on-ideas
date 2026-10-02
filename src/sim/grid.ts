/**
 * Uniform spatial hash backed by typed-array linked lists, rebuilt every simulation step with no
 * allocations. Used for separation, chat pairing and pointer hit tests.
 */
export class SpatialGrid {
  private readonly cols: number;
  private readonly rows: number;
  private readonly heads: Int32Array;
  private next: Int32Array;
  private xs: Float32Array;
  private ys: Float32Array;

  constructor(
    private readonly cellSize: number,
    width: number,
    height: number,
    capacity: number,
  ) {
    this.cols = Math.max(1, Math.ceil(width / cellSize));
    this.rows = Math.max(1, Math.ceil(height / cellSize));
    this.heads = new Int32Array(this.cols * this.rows).fill(-1);
    this.next = new Int32Array(capacity).fill(-1);
    this.xs = new Float32Array(capacity);
    this.ys = new Float32Array(capacity);
  }

  clear(): void {
    this.heads.fill(-1);
  }

  private ensureCapacity(index: number): void {
    if (index < this.next.length) return;
    const size = Math.max(index + 1, this.next.length * 2);
    const next = new Int32Array(size).fill(-1);
    next.set(this.next);
    const xs = new Float32Array(size);
    xs.set(this.xs);
    const ys = new Float32Array(size);
    ys.set(this.ys);
    this.next = next;
    this.xs = xs;
    this.ys = ys;
  }

  private cellOf(x: number, y: number): number {
    const cx = Math.min(this.cols - 1, Math.max(0, Math.floor(x / this.cellSize)));
    const cy = Math.min(this.rows - 1, Math.max(0, Math.floor(y / this.cellSize)));
    return cy * this.cols + cx;
  }

  insert(index: number, x: number, y: number): void {
    this.ensureCapacity(index);
    const cell = this.cellOf(x, y);
    this.xs[index] = x;
    this.ys[index] = y;
    this.next[index] = this.heads[cell] ?? -1;
    this.heads[cell] = index;
  }

  private cellRange(x: number, y: number, radius: number): [number, number, number, number] {
    return [
      Math.max(0, Math.floor((x - radius) / this.cellSize)),
      Math.min(this.cols - 1, Math.floor((x + radius) / this.cellSize)),
      Math.max(0, Math.floor((y - radius) / this.cellSize)),
      Math.min(this.rows - 1, Math.floor((y + radius) / this.cellSize)),
    ];
  }

  /** Calls `visit` for every inserted index within `radius` of (x, y). */
  forEachNear(
    x: number,
    y: number,
    radius: number,
    visit: (index: number, distSq: number) => void,
  ): void {
    const [minCx, maxCx, minCy, maxCy] = this.cellRange(x, y, radius);
    const radiusSq = radius * radius;
    for (let cy = minCy; cy <= maxCy; cy++) {
      for (let cx = minCx; cx <= maxCx; cx++) {
        this.visitCell(cy * this.cols + cx, x, y, radiusSq, visit);
      }
    }
  }

  private visitCell(
    cell: number,
    x: number,
    y: number,
    radiusSq: number,
    visit: (index: number, distSq: number) => void,
  ): void {
    let index = this.heads[cell] ?? -1;
    while (index !== -1) {
      const dx = (this.xs[index] ?? 0) - x;
      const dy = (this.ys[index] ?? 0) - y;
      const distSq = dx * dx + dy * dy;
      if (distSq <= radiusSq) visit(index, distSq);
      index = this.next[index] ?? -1;
    }
  }
}
