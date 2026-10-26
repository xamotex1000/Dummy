// Seeded random numbers (mulberry32) so runs can be replayed from a seed.

export class RNG {
  constructor(seed = Date.now()) {
    this.seed = seed >>> 0;
    this.state = this.seed;
  }

  next() {
    let a = (this.state = (this.state + 0x6d2b79f5) | 0);
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(lo, hi) {
    return lo + (hi - lo) * this.next();
  }

  int(lo, hi) {
    return Math.floor(this.range(lo, hi + 1));
  }

  chance(p) {
    return this.next() < p;
  }

  pick(list) {
    return list[Math.floor(this.next() * list.length)];
  }

  // Pick `count` distinct items, each weighted by weightOf(item).
  weightedSample(items, count, weightOf) {
    const pool = items.slice();
    const out = [];
    while (out.length < count && pool.length) {
      const weights = pool.map(weightOf);
      const total = weights.reduce((s, w) => s + w, 0);
      if (total <= 0) break;
      let roll = this.next() * total;
      let i = 0;
      while (i < pool.length - 1 && roll >= weights[i]) roll -= weights[i++];
      out.push(pool.splice(i, 1)[0]);
    }
    return out;
  }
}
