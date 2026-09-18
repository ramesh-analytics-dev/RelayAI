/** Mulberry32 — small, fast, deterministic seeded PRNG. */

export class RNG {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  uniform(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  randint(min: number, max: number): number {
    return Math.floor(this.uniform(min, max + 1));
  }

  choice<T>(arr: T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }

  choices<T>(items: T[], weights: number[]): T {
    const total = weights.reduce((a, b) => a + b, 0);
    let r = this.next() * total;
    for (let i = 0; i < items.length; i++) {
      r -= weights[i];
      if (r <= 0) return items[i];
    }
    return items[items.length - 1];
  }

  round(val: number, decimals: number = 0): number {
    const f = Math.pow(10, decimals);
    return Math.round(val * f) / f;
  }
}
