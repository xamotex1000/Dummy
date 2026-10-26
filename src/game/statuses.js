// Status effects on dummies (bleed, burn, chill/frozen, shock, nails) and the
// reactions that fire when two of them meet. The play scene owns one of
// these and weapons reach it through the scene's addBurn/addBleed/... helpers.

import { REACTIONS, loadDiscovered, saveDiscovered } from './reactions.js';
import { C } from './theme.js';

// Hits that count as blunt for shattering frozen parts.
const BLUNT = new Set(['hands', 'bat', 'anvil']);

export class StatusSystem {
  constructor(sc) {
    this.sc = sc;
    this.discovered = loadDiscovered();
    this.cooldowns = new Map();
  }

  get run() {
    return this.sc.run;
  }

  duration(t) {
    return t * (this.run?.statusMult ?? 1);
  }

  // ------------------------------------------------------------- applying

  bleed(d, seg, dps, dur, weapon) {
    const key = 'bleed:' + seg.name;
    const st = d.statuses.get(key);
    dur = this.duration(dur);
    if (st) {
      st.dps = Math.min(dps * 4, st.dps + dps * 0.5);
      st.t = Math.max(st.t, dur);
    } else {
      d.statuses.set(key, { kind: 'bleed', seg, dps, t: dur, weapon, acc: 0 });
    }
  }

  burn(d, seg, dps, dur, weapon) {
    if (!d.alive) return;
    if (d.traits.fireproof) {
      if (this.sc.ready('fireproof' + d.id, 1.2)) this.sc.fxText(d.segCenter(seg).x, d.segCenter(seg).y - 20, 'FIREPROOF', C.paperDim, 14);
      return;
    }
    if (seg.frozen > 0) {
      this.steam(d, seg, weapon);
      return;
    }
    const key = 'burn:' + seg.name;
    const st = d.statuses.get(key);
    dur = this.duration(dur);
    if (st) {
      st.dps = Math.max(st.dps, dps);
      st.t = Math.max(st.t, dur);
    } else {
      d.statuses.set(key, { kind: 'burn', seg, dps, t: dur, weapon, acc: 0, spread: 0 });
    }
  }

  // Chill builds up; at 1 the part freezes solid.
  chill(d, seg, amount, weapon) {
    if (!d.alive || seg.frozen > 0) {
      if (seg.frozen > 0) seg.frozen = Math.max(seg.frozen, 1);
      return;
    }
    seg.chill += amount * (d.traits.fireproof ? 1.5 : 1);
    if (seg.chill < 1) return;
    seg.chill = 0;
    if (d.statuses.has('burn:' + seg.name)) {
      d.statuses.delete('burn:' + seg.name);
      this.steam(d, seg, weapon);
      return;
    }
    seg.frozen = this.duration(this.sc.level('freeze') >= 2 ? 6 : 4);
    const c = d.segCenter(seg);
    this.sc.fxShards(c.x, c.y, 6);
    this.sc.sfx.freeze();
  }

  shock(d, weapon, seg, { chain = true } = {}) {
    if (!d.alive) return;
    d.shockT = Math.max(d.shockT, this.duration(1.4));
    if (!chain) return;
    // Overload: a burning part blows up.
    for (const [key, st] of d.statuses) {
      if (st.kind !== 'burn') continue;
      if (!this.react('overload', d)) break;
      d.statuses.delete(key);
      const c = d.segCenter(st.seg);
      this.announce('overload', c.x, c.y, weapon);
      this.sc.explode(c.x, c.y, 95, 26, weapon, { noReactions: true, size: 0.6 });
      break;
    }
    // Conductor: current runs through every nail.
    if (d.nails.length && this.react('conductor', d)) {
      const c = d.center();
      this.announce('conductor', c.x, c.y, weapon);
      let prev = seg ? d.segCenter(seg) : c;
      for (const n of d.nails) {
        this.sc.fxArc(prev.x, prev.y, n.x, n.y);
        prev = n;
        this.reactionDamage(d, d.segForPoint(n.p), 14, weapon, n.x, n.y);
        if (!d.alive) break;
      }
    }
    // Superconduct: a frozen part relays the charge to every dummy.
    if (d.alive && d.segs.some((s) => s.frozen > 0) && this.react('superconduct', d)) {
      const c = d.center();
      this.announce('superconduct', c.x, c.y, weapon);
      for (const o of this.sc.dummies) {
        if (!o.alive) continue;
        const oc = o.center();
        if (o !== d) this.sc.fxArc(c.x, c.y, oc.x, oc.y);
        this.shock(o, weapon, null, { chain: false });
        this.reactionDamage(o, o.segMap.torso, 16, weapon, oc.x, oc.y);
      }
    }
  }

  nail(d, p, dur) {
    if (!d.alive) return;
    const existing = d.nails.find((n) => n.p === p);
    if (existing) {
      existing.t = Math.max(existing.t, dur);
      return;
    }
    if (this.sc.grabbed?.p === p) this.sc.releaseGrab(false);
    p.pinned = true;
    p.px = p.x;
    p.py = p.y;
    d.nails.push({ p, x: p.x, y: p.y, t: dur });
  }

  unnail(d, n) {
    n.p.pinned = false;
    d.nails.splice(d.nails.indexOf(n), 1);
  }

  // ------------------------------------------------------- hit modifiers

  // Called by dealDamage before a hit lands. Returns a damage multiplier and
  // whether a frozen limb should snap off.
  onHit(d, seg, weapon, kind) {
    if (seg.frozen > 0 && (BLUNT.has(weapon) || kind === 'impact' || kind === 'blast') && this.react('shatter', d, 0.1)) {
      seg.frozen = 0;
      const c = d.segCenter(seg);
      this.announce('shatter', c.x, c.y, weapon);
      this.sc.fxShards(c.x, c.y, 18);
      this.sc.sfx.shatter();
      const brittle = this.sc.level('freeze') >= 3 ? 2 : 1;
      return { mult: 3 * brittle * (d.traits.fireproof ? 1.5 : 1) * this.reactionMult(), sever: true };
    }
    return { mult: 1, sever: false };
  }

  // Called for every dummy caught in an explosion. Returns a damage multiplier.
  onBlast(d, x, y, R, weapon) {
    let burning = false;
    for (const st of d.statuses.values()) if (st.kind === 'burn') burning = true;
    if (!burning || !this.react('inferno', d)) return 1;
    this.announce('inferno', x, y, weapon);
    for (const seg of d.segs) {
      const c = d.segCenter(seg);
      if (Math.hypot(c.x - x, c.y - y) < R * 1.3) this.burn(d, seg, 10, 4, weapon);
    }
    return 1.5 * this.reactionMult();
  }

  // ---------------------------------------------------------------- tick

  tick(d, dt) {
    const sc = this.sc;
    if (!d.alive) {
      d.statuses.clear();
      for (const n of d.nails.slice()) this.unnail(d, n);
      for (const seg of d.segs) seg.frozen = 0;
      return;
    }

    for (const seg of d.segs) {
      seg.chill = Math.max(0, seg.chill - dt * 0.35);
      if (seg.frozen > 0) {
        seg.frozen -= dt;
        // Frozen parts are stiff: they shed most of their motion.
        for (const p of seg.a === seg.b ? [seg.a] : [seg.a, seg.b]) {
          if (p.pinned) continue;
          p.px = p.x - (p.x - p.px) * 0.8;
          p.py = p.y - (p.y - p.py) * 0.8;
        }
      }
    }

    // Shocked dummies spasm.
    if (d.shockT > 0) {
      for (const p of d.pointList) {
        if (!p.pinned) p.addVelocity(sc.rng.range(-120, 120), sc.rng.range(-140, 100), dt);
      }
    }

    this.tickNails(d, dt);

    for (const [key, st] of d.statuses) {
      st.t -= dt;
      st.acc += dt;
      const c = d.segCenter(st.seg);
      if (st.kind === 'burn') {
        st.seg.char = Math.min(1, st.seg.char + dt * 0.15);
        if (sc.rng.chance(0.5)) {
          sc.particles.spawn({
            kind: 'fire', x: c.x + sc.rng.range(-st.seg.r, st.seg.r), y: c.y + sc.rng.range(-st.seg.r, st.seg.r),
            vx: sc.rng.range(-20, 20), vy: sc.rng.range(-140, -60), size: sc.rng.range(4, 8) * d.s,
            color: C.fire, color2: C.fire2, life: sc.rng.range(0.25, 0.5),
          });
        }
        if (sc.level('flame') >= 3) {
          st.spread += dt;
          if (st.spread > 0.5) {
            st.spread = 0;
            for (const other of d.segs) {
              if (other === st.seg || d.statuses.has('burn:' + other.name)) continue;
              const oc = d.segCenter(other);
              if (Math.hypot(oc.x - c.x, oc.y - c.y) < 50 * d.s && sc.rng.chance(0.35)) this.burn(d, other, st.dps, 2.5, st.weapon);
            }
          }
        }
      } else if (sc.rng.chance(0.12)) {
        sc.particles.spawn({ kind: 'dot', x: c.x, y: c.y, vx: sc.rng.range(-30, 30), vy: 0, gravity: 1400, size: 2.4 * d.s, color: C.blood, life: 0.7, bounce: 0 });
      }
      if (st.acc >= 0.3) {
        st.acc -= 0.3;
        sc.dealDamage(d, st.seg, st.dps * 0.3, st.weapon, { kind: 'dot' });
        if (!d.alive) return;
      }
      if (st.t <= 0) d.statuses.delete(key);
    }
  }

  // Nails hold points in place; pull hard enough and they let go, or the
  // limb tears off around them.
  tickNails(d, dt) {
    for (const n of d.nails.slice()) {
      n.t -= dt;
      const p = n.p;
      p.x = p.px = n.x;
      p.y = p.py = n.y;
      // How hard the body is pulling on this nail, from the physics step.
      let strain = 1;
      for (const st of d.sticksByPoint.get(p) ?? []) if (!st.broken) strain = Math.max(strain, st.strain);
      const seg = d.segForPoint(p);
      const limb = seg.limb && !d.limbs[seg.limb].severed ? seg.limb : null;
      if (limb && strain > 1.5 && this.react('tearaway', d, 0.2)) {
        this.unnail(d, n);
        this.announce('tearaway', n.x, n.y, d.lastHitBy ?? 'nailgun');
        d.sever(limb);
        this.sc.onSever(d, limb);
        this.reactionDamage(d, seg, 18, d.lastHitBy ?? 'nailgun', n.x, n.y);
        if (!d.alive) return;
      } else if (n.t <= 0 || strain > 2.2) {
        this.unnail(d, n);
        if (strain > 2.2) this.sc.sfx.tick();
      }
    }
  }

  // ------------------------------------------------------------ reactions

  steam(d, seg, weapon) {
    if (!this.react('steam', d, 0.3)) return;
    seg.frozen = 0;
    d.statuses.delete('burn:' + seg.name);
    const c = d.segCenter(seg);
    this.announce('steam', c.x, c.y, weapon);
    this.sc.fxSteam(c.x, c.y);
    this.reactionDamage(d, seg, 30, weapon, c.x, c.y);
    for (const p of d.pointList) {
      const dx = p.x - c.x, dy = p.y - c.y;
      const dist = Math.hypot(dx, dy) || 1;
      if (dist < 120 && !p.pinned) p.addVelocity((dx / dist) * 600, (dy / dist) * 600 - 300, this.sc.dt);
    }
  }

  reactionMult() {
    return this.run?.reactionMult ?? 1;
  }

  reactionDamage(d, seg, base, weapon, x, y) {
    this.sc.dealDamage(d, seg, base * this.reactionMult(), weapon, { kind: 'reaction', x, y, pierce: true });
  }

  // Rate-limit each reaction per dummy so one combo can't loop forever.
  react(id, d, cooldown = 0.6) {
    const key = id + d.id;
    const t = this.sc.time;
    if ((this.cooldowns.get(key) ?? -1) > t) return false;
    this.cooldowns.set(key, t + cooldown);
    return true;
  }

  // Visuals, sound, stats and discovery for a reaction that just fired.
  announce(id, x, y, weapon) {
    const sc = this.sc;
    const r = REACTIONS[id];
    sc.fxReaction(x, y, r.name.toUpperCase(), r.color);
    sc.sfx.reaction();
    sc.engine.hitStop(0.07);
    sc.shake(0.3);
    if (sc.state === 'playing' && this.run) {
      sc.stats.reactions++;
      this.run.totals.reactions++;
      sc.bonusEvent('reaction', { id, weapon });
    }
    if (!this.discovered.has(id)) {
      this.discovered.add(id);
      saveDiscovered(this.discovered);
      sc.fxText(x, y - 42, 'NEW REACTION', C.gold, 16);
      sc.hud.showHint(`New reaction: ${r.name}. ${r.desc}`);
    }
    if (this.run?.chainReaction) {
      sc.later(0.08, () => sc.explode(x, y, 80, 14, weapon, { noReactions: true, size: 0.4 }));
    }
  }
}
