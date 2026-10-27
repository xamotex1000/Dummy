// The test subject's heart, for the cardiac monitor on the results sheet.
// It's one heart for the whole cell: stress from damage, torn limbs, being
// grabbed and burning drives the rate up, and cold slows it. Electrocution
// throws it into fibrillation, and a destroyed dummy flatlines until the
// next one comes in.
//
// Each round records beat times, fibrillation and flatline intervals, and
// the rate every quarter second.

const REST = 66;
const MAX = 220;
const FIB_TAIL = 0.3; // fibrillation outlasts the shock a little
const ARREST = 1.2;

export const newHeartRecord = () => ({ beats: [], fib: [], flat: [], bpm: [] });

// Extend the last interval if this moment continues it, else start one.
function mark(list, t, dt) {
  const last = list[list.length - 1];
  if (last && t - last[1] <= dt * 1.5) last[1] = t;
  else list.push([t, t]);
}

export class Heart {
  constructor() {
    this.reset();
  }

  reset() {
    this.bpm = REST;
    this.stress = 0;
    this.phase = 0;
    this.fibT = 0;
    this.flatT = 0;
    this.acc = 0;
  }

  // Damage and other shocks to the system.
  hit(amount) {
    this.stress = Math.min(6, this.stress + amount / 80);
  }

  arrest() {
    this.flatT = ARREST;
    this.stress *= 0.4;
  }

  // `sc` is the play scene; `rec` the round's record; `t` the round clock.
  update(dt, sc, rec, t, step) {
    let shocked = false, burning = 0, cold = 0;
    for (const d of sc.dummies) {
      if (!d.alive) continue;
      if (d.shockT > 0) shocked = true;
      for (const key of d.statuses.keys()) if (key.startsWith('burn:')) burning++;
      const frozen = d.segs.filter((s) => s.frozen > 0).length / d.segs.length;
      cold = Math.max(cold, frozen);
    }
    if (shocked) this.fibT = Math.max(this.fibT, FIB_TAIL);
    if (sc.grabbed) this.stress += dt * 0.6;
    this.stress += dt * 0.3 * Math.min(4, burning);
    this.stress = Math.min(6, this.stress * Math.exp(-dt * 0.28));

    const target = Math.max(38, Math.min(MAX, REST + 154 * (1 - Math.exp(-this.stress * 0.8)) - cold * 35));
    const rate = target > this.bpm ? 1.6 : 0.6;
    this.bpm += (target - this.bpm) * (1 - Math.exp(-dt * rate));

    if (this.flatT > 0) {
      this.flatT -= dt;
      mark(rec.flat, t, dt);
      this.phase = 0;
      // The next subject comes in rattled.
      if (this.flatT <= 0) this.bpm = Math.max(this.bpm, 95);
    } else if (this.fibT > 0) {
      this.fibT -= dt;
      mark(rec.fib, t, dt);
      this.phase = 0;
      // Coming out of it leaves the heart racing.
      if (this.fibT <= 0) this.stress += 0.8;
    } else {
      this.phase += (dt * this.bpm) / 60;
      if (this.phase >= 1) {
        this.phase -= 1;
        rec.beats.push(t);
      }
    }

    this.acc += dt;
    if (this.acc >= step) {
      this.acc -= step;
      rec.bpm.push(this.flatT > 0 ? 0 : Math.round(this.bpm));
    }
  }
}
