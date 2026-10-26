// Weapon definitions. Each weapon reacts to press / hold / release on the
// arena and talks to the play scene through a small set of helpers
// (hitAt, hitSwipe, push, dealDamage, fx*, sfx...). Weapons with a `held`
// block are physical objects gripped at the handle; `heldUpdate` runs every
// tick the hand is in the arena.

import { clamp, lerp, segmentDistance } from '../engine/math.js';
import { spawnRocket } from './projectiles.js';
import { drawWeaponIcon } from './icons.js';
import { C } from './theme.js';

export const WEAPON_ORDER = ['hands', 'bat', 'knife', 'chainsaw', 'pistol', 'nailgun', 'taser', 'freeze', 'rocket', 'flame', 'grenade', 'vortex', 'anvil'];
export const MAX_LEVEL = 5;
// Hands plus five: a full arsenal means dropping something to take a new one.
export const MAX_SLOTS = 6;
// What a run can start with (besides Hands).
export const STARTERS = ['bat', 'knife', 'pistol', 'nailgun', 'taser', 'chainsaw'];

// Levels 2 and 3 grant the weapon's perks; 4 and 5 add raw damage.
export const weaponDamageMult = (level) => 1 + 0.3 * Math.max(0, level - 3);

export function nextUpgrade(id, level) {
  const def = WEAPONS[id];
  if (level >= MAX_LEVEL) return null;
  if (level + 1 <= 3) return def.perks[level - 1];
  return { name: 'Tuned Up', desc: `${def.name} damage +30%.` };
}

// ------------------------------------------------------------ held weapons
//
// Bat, knife, pistol and flamer are held by the grip. The play scene keeps a
// PivotBody for the current one (see `held` below) that swings around the
// hand; these helpers turn its pose into hits.

// World position and direction of a gun's muzzle (guns flip to stay upright).
export function muzzleOf(held, m) {
  const flip = Math.cos(held.angle) < 0 ? -1 : 1;
  const p = held.pointAt(m.x, m.y * flip);
  return { x: p.x, y: p.y, ux: Math.cos(held.angle), uy: Math.sin(held.angle) };
}

function segVelocity(seg, dt) {
  return {
    x: (seg.a.x - seg.a.px + seg.b.x - seg.b.px) / (2 * dt),
    y: (seg.a.y - seg.a.py + seg.b.y - seg.b.py) / (2 * dt),
  };
}

// Sweep the striking part of a melee weapon from last tick's pose to this
// one, so a fast whip can't pass through the dummy between frames. Damage
// uses the speed of the exact point on the weapon that made contact.
function meleeSweep(sc, id, held, cfg, onHit) {
  const { s0, s1, pad, minSpeed, cooldown, bounce } = cfg;
  const tip = held.pointAt(s1);
  const prevTip = held.pointAt(s1, 0, held.prevAngle, held.px, held.py);
  const travel = Math.hypot(tip.x - prevTip.x, tip.y - prevTip.y);
  if (travel / sc.dt > 700) sc.addTrail(tip.x, tip.y);
  const steps = clamp(Math.ceil(travel / 10), 1, 8);
  for (const d of sc.dummies) {
    if (!d.alive) continue;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const ang = lerp(held.prevAngle, held.angle, t);
      const hx = lerp(held.px, held.x, t);
      const hy = lerp(held.py, held.y, t);
      const a = held.pointAt(s0, 0, ang, hx, hy);
      const b = held.pointAt(s1, 0, ang, hx, hy);
      const hit = d.hitSwipe(a.x, a.y, b.x, b.y, pad);
      if (!hit) continue;
      const v = held.velocityAt(s0 + hit.s * (s1 - s0));
      const sv = segVelocity(hit.seg, sc.dt);
      const rvx = v.x - sv.x;
      const rvy = v.y - sv.y;
      const sp = Math.hypot(rvx, rvy);
      if (sp >= minSpeed && sc.ready(id + d.id, cooldown)) {
        onHit(hit, sp, { x: rvx / sp, y: rvy / sp });
        held.spin *= bounce; // the weapon rebounds (bat) or slices on (knife)
      } else if (sp > 30) {
        // A slow contact just shoves: you can nudge or prop the dummy up.
        const k = Math.min(1, 360 / sp) * 0.35;
        sc.push(hit, rvx * k, rvy * k);
      }
      break;
    }
  }
}

function pistolShot(sc) {
  const held = sc.held;
  if (!held?.active || sc.weaponId !== 'pistol') return;
  const cfg = WEAPONS.pistol.held;
  const m = muzzleOf(held, cfg.muzzle);
  let best = null;
  for (const d of sc.dummies) {
    const h = d.hitSwipe(m.x, m.y, m.x + m.ux * 2400, m.y + m.uy * 2400, 0);
    if (h && (!best || h.s < best.s)) best = h;
  }
  const end = best ?? sc.rayExit(m.x, m.y, m.ux, m.uy);
  sc.fxTracer(m.x, m.y, end.x, end.y);
  sc.fxMuzzle(m.x, m.y);
  sc.sfx.shot();
  sc.shake(0.12);
  // Recoil kicks the barrel up; the wrist spring brings it back down.
  held.kick(-Math.sign(m.ux || 1) * cfg.recoil);
  if (!best) {
    sc.fxSparks(end.x, end.y, 5, C.paperDim);
    return;
  }
  sc.push(best, m.ux * 900, m.uy * 900 - 150);
  sc.dealDamage(best.dummy, best.seg, sc.level('pistol') >= 2 ? 18 : 11, 'pistol', { x: best.x, y: best.y });
  sc.fxFluff(best.x, best.y, 6, 1);
  sc.fxSparks(best.x, best.y, 6, C.gold);
}

function firePistol(sc) {
  pistolShot(sc);
  if (sc.level('pistol') >= 3) sc.later(0.09, () => pistolShot(sc));
}


// First dummy hit along a ray, if any.
function rayHit(sc, x, y, ux, uy, range = 2400) {
  let best = null;
  for (const d of sc.dummies) {
    const h = d.hitSwipe(x, y, x + ux * range, y + uy * range, 0);
    if (h && (!best || h.s < best.s)) best = h;
  }
  return best;
}

function heldGun(sc, id) {
  const held = sc.held;
  if (!held?.active || sc.weaponId !== id) return null;
  return { held, m: muzzleOf(held, WEAPONS[id].held.muzzle) };
}

function fireNails(sc) {
  const g = heldGun(sc, 'nailgun');
  if (!g) return;
  const { held, m } = g;
  const framing = sc.level('nailgun') >= 2;
  const spread = sc.level('nailgun') >= 3 ? [-0.09, 0, 0.09] : [0];
  for (const da of spread) {
    const a = Math.atan2(m.uy, m.ux) + da;
    const ux = Math.cos(a), uy = Math.sin(a);
    const hit = rayHit(sc, m.x, m.y, ux, uy);
    const end = hit ?? sc.rayExit(m.x, m.y, ux, uy);
    sc.particles.spawn({ kind: 'beam', x: m.x, y: m.y, x2: end.x, y2: end.y, size: 1.5, color: C.paperDim, life: 0.07 });
    if (!hit) continue;
    const { dummy: d, seg } = hit;
    const point = seg.a === seg.b || hit.t < 0.5 ? seg.a : seg.b;
    sc.dealDamage(d, seg, framing ? 9 : 6, 'nailgun', { x: hit.x, y: hit.y });
    sc.addNail(d, point, framing ? 12 : 6);
    sc.fxSparks(hit.x, hit.y, 4, C.paperDim);
  }
  sc.sfx.nail();
  held.kick(-Math.sign(m.ux || 1) * WEAPONS.nailgun.held.recoil);
}

function zap(sc) {
  const g = heldGun(sc, 'taser');
  if (!g || !sc.ready('taser', 0.2)) return;
  const { m } = g;
  sc.fxSparks(m.x, m.y, 5, C.volt);
  sc.sfx.zap();
  let hit = null;
  for (const d of sc.dummies) {
    const h = d.hitSwipe(m.x - m.ux * 14, m.y - m.uy * 14, m.x + m.ux * 6, m.y + m.uy * 6, 10);
    if (h) hit = h;
  }
  if (!hit) {
    sc.fxArc(m.x, m.y, m.x + m.ux * 14, m.y + m.uy * 14);
    return;
  }
  const d = hit.dummy;
  sc.fxArc(m.x, m.y, hit.x, hit.y);
  sc.dealDamage(d, hit.seg, 9, 'taser', { x: hit.x, y: hit.y });
  sc.addShock(d, 'taser', hit.seg);
  // The charge jumps to the nearest other dummies.
  const jumps = sc.level('taser') >= 2 ? 3 : 1;
  const c = d.center();
  const others = sc.dummies
    .filter((o) => o !== d && o.alive)
    .map((o) => ({ o, dist: Math.hypot(o.center().x - c.x, o.center().y - c.y) }))
    .filter((e) => e.dist < 220)
    .sort((a, b) => a.dist - b.dist)
    .slice(0, jumps);
  let from = c;
  for (const { o } of others) {
    const oc = o.center();
    sc.fxArc(from.x, from.y, oc.x, oc.y);
    sc.dealDamage(o, o.segMap.torso, 6, 'taser', { x: oc.x, y: oc.y });
    sc.addShock(o, 'taser', o.segMap.torso);
    from = oc;
  }
}

function freezeBeam(sc) {
  const g = heldGun(sc, 'freeze');
  if (!g) return;
  const { m } = g;
  const cfg = WEAPONS.freeze.held;
  const hit = rayHit(sc, m.x, m.y, m.ux, m.uy, cfg.range);
  const end = hit ?? { x: m.x + m.ux * cfg.range, y: m.y + m.uy * cfg.range };
  sc.beam = { x: m.x, y: m.y, x2: end.x, y2: end.y, t: sc.time };
  sc.sfx.freezeBeam();
  if (!hit) return;
  const d = hit.dummy;
  if (sc.ready('chill' + d.id, 0.1)) sc.addChill(d, hit.seg, sc.level('freeze') >= 2 ? 0.2 : 0.11, 'freeze');
  if (sc.ready('freezeDmg' + d.id, 0.25)) sc.dealDamage(d, hit.seg, 2, 'freeze', { kind: 'grind', x: hit.x, y: hit.y });
  if (sc.rng.chance(0.5)) sc.fxShards(hit.x, hit.y, 1);
}

function fireRocket(sc) {
  const g = heldGun(sc, 'rocket');
  if (!g) return;
  const { held, m } = g;
  spawnRocket(sc, m, held, { napalm: sc.level('rocket') >= 2 });
  sc.fxMuzzle(m.x, m.y);
  sc.shake(0.2);
  held.kick(-Math.sign(m.ux || 1) * WEAPONS.rocket.held.recoil);
}

export const WEAPONS = {
  hands: {
    name: 'Hands',
    phrase: 'your hands',
    hint: 'Tap to punch. Drag to grab it, then fling it into a wall.',
    desc: 'Punch and throw.',
    perks: [
      { name: 'Iron Knuckles', desc: 'Punches deal double damage and knock harder.' },
      { name: "Pitcher's Arm", desc: 'Thrown dummies take +50% impact damage.' },
    ],
    press(sc, x, y) {
      sc.handTap = { t: 0, moved: 0 };
      const hit = sc.hitAt(x, y, 12);
      if (hit) sc.grab(hit, x, y);
    },
    hold(sc, x0, y0, x1, y1, dt) {
      if (!sc.handTap) return;
      sc.handTap.t += dt;
      sc.handTap.moved += Math.hypot(x1 - x0, y1 - y0);
    },
    release(sc, x, y) {
      const tap = sc.handTap && sc.handTap.t < 0.22 && sc.handTap.moved < 14;
      sc.handTap = null;
      sc.releaseGrab(!tap);
      if (!tap) return;
      const hit = sc.hitAt(x, y, 16);
      if (!hit) {
        sc.sfx.whoosh();
        return;
      }
      if (!sc.ready('hands', 0.07)) return;
      const iron = sc.level('hands') >= 2;
      const k = iron ? 1.5 : 1;
      const dir = sc.awayDir(hit.dummy, x, y);
      sc.push(hit, dir.x * 750 * k, dir.y * 750 * k - 200);
      sc.dealDamage(hit.dummy, hit.seg, iron ? 14 : 7, 'hands', { x: hit.x, y: hit.y });
      sc.fxHit(hit.x, hit.y, dir, 0.8);
      sc.sfx.punch();
    },
    cursor(ctx, sc, x, y, down) {
      drawWeaponIcon(ctx, 'hands', x, y, 40, { closed: down && !!sc.grabbed, alpha: 0.9 });
    },
  },

  bat: {
    name: 'Bat',
    phrase: 'the bat',
    hint: 'Held by the handle. Whip it through the dummy: the faster the barrel moves, the harder it hits.',
    desc: 'Swings from the handle. Damage scales with how fast the barrel hits.',
    unlockRarity: 'common',
    perks: [
      { name: 'Nail Bat', desc: 'Bat hits make the dummy bleed.' },
      { name: 'Home Run', desc: 'Very fast swings deal double damage.' },
    ],
    held: {
      body: { length: 94, com: 0.62, stiffness: 45, damping: 5, gravityComp: 0.4, maxSpin: 48 },
      // Hangs down and forward toward the dummy; moving the hand makes the
      // barrel trail behind and then whip through.
      rest: (facing) => Math.PI / 2 - facing * 0.7,
      strike: { s0: 24, s1: 94, pad: 6, minSpeed: 420, cooldown: 0.2, bounce: -0.3 },
    },
    heldUpdate(sc, held) {
      meleeSweep(sc, 'bat', held, this.held.strike, (hit, sp, dir) => {
        const homeRun = sc.level('bat') >= 3 && sp > 2600;
        const dmg = clamp(sp * 0.011, 4, 42) * (homeRun ? 2 : 1);
        const force = Math.min(sp * 0.6, 2300);
        sc.push(hit, dir.x * force, dir.y * force);
        sc.dealDamage(hit.dummy, hit.seg, dmg, 'bat', { x: hit.x, y: hit.y });
        if (sc.level('bat') >= 2) sc.addBleed(hit.dummy, hit.seg, 3, 3, 'bat');
        sc.fxHit(hit.x, hit.y, dir, dmg / 25);
        sc.sfx.bat(dmg / 40);
        if (homeRun) sc.fxText(hit.x, hit.y - 34, 'HOME RUN', C.gold, 20);
      });
    },
  },

  knife: {
    name: 'Knife',
    phrase: 'the knife',
    hint: 'Held by the hilt. Slice the blade through the dummy. Cuts keep bleeding.',
    desc: 'Held by the hilt. Cuts bleed and tear limbs off fast.',
    unlockRarity: 'common',
    perks: [
      { name: 'Serrated Edge', desc: 'Bleeding lasts twice as long.' },
      { name: 'Surgeon', desc: 'Cuts tear limbs off twice as fast.' },
    ],
    held: {
      body: { length: 49, com: 0.4, stiffness: 150, damping: 15, gravityComp: 0.7, maxSpin: 50 },
      rest: (facing) => (facing > 0 ? 0.3 : Math.PI - 0.3),
      strike: { s0: 14, s1: 49, pad: 3, minSpeed: 280, cooldown: 0.12, bounce: 0.8 },
    },
    heldUpdate(sc, held) {
      meleeSweep(sc, 'knife', held, this.held.strike, (hit, sp, dir) => {
        const dmg = clamp(sp * 0.005, 2, 14);
        const force = Math.min(sp * 0.15, 500);
        sc.push(hit, dir.x * force, dir.y * force);
        sc.dealDamage(hit.dummy, hit.seg, dmg, 'knife', { x: hit.x, y: hit.y, limbMult: sc.level('knife') >= 3 ? 2 : 1 });
        sc.addBleed(hit.dummy, hit.seg, 3.5, sc.level('knife') >= 2 ? 6 : 3, 'knife');
        sc.fxFluff(hit.x, hit.y, 3, 0.6);
        sc.fxSparks(hit.x, hit.y, 3, C.blood);
        sc.sfx.slash();
      });
    },
  },

  pistol: {
    name: 'Pistol',
    phrase: 'the pistol',
    hint: 'Held by the grip, pointing at the dummy. Line the barrel up and press to fire. Hold to keep firing.',
    desc: 'Fires along the barrel. Precise, good for targeting one body part.',
    unlockRarity: 'common',
    perks: [
      { name: 'Hollow Points', desc: 'Shots deal +60% damage.' },
      { name: 'Double Tap', desc: 'Every shot fires twice.' },
    ],
    held: {
      body: { length: 34, com: 0.45, stiffness: 260, damping: 26, gravityComp: 1, maxSpin: 40 },
      rest: (facing) => (facing > 0 ? 0 : Math.PI),
      muzzle: { x: 34, y: -10 },
      recoil: 16,
    },
    press(sc) {
      sc.pistolHeld = 0;
      if (sc.ready('pistol', 0.14)) firePistol(sc);
    },
    hold(sc, x0, y0, x1, y1, dt) {
      sc.pistolHeld = (sc.pistolHeld ?? 0) + dt;
      if (sc.pistolHeld >= 0.3 && sc.ready('pistol', 0.2)) firePistol(sc);
    },
  },

  grenade: {
    name: 'Grenade',
    phrase: 'grenades',
    hint: 'Tap to drop a grenade. It blows after a short fuse.',
    desc: 'Tap to drop. Big area damage and a huge shove.',
    unlockRarity: 'rare',
    perks: [
      { name: 'Cluster', desc: 'Grenades split into three bomblets.' },
      { name: 'Big Boom', desc: 'Blast radius +40%.' },
    ],
    press(sc, x, y) {
      if (sc.projectiles.filter((p) => p.kind === 'grenade').length >= 4) return;
      if (!sc.ready('grenade', 0.35)) return;
      sc.spawnGrenade(x, y, { cluster: sc.level('grenade') >= 2, radius: sc.level('grenade') >= 3 ? 1.4 : 1 });
      sc.sfx.tick();
    },
    cursor(ctx, sc, x, y) {
      drawWeaponIcon(ctx, 'grenade', x, y, 30, { alpha: 0.55 });
    },
  },

  flame: {
    name: 'Flamer',
    phrase: 'the flamer',
    hint: 'Held by the grip. Hold to spray fire out of the nozzle. Burning parts keep taking damage.',
    desc: 'Sprays fire from the nozzle. Burning parts take damage over time.',
    unlockRarity: 'rare',
    perks: [
      { name: 'Napalm', desc: 'Burns last twice as long.' },
      { name: 'Wildfire', desc: 'Fire spreads to nearby body parts.' },
    ],
    held: {
      body: { length: 58, com: 0.4, stiffness: 120, damping: 16, gravityComp: 1, maxSpin: 40 },
      rest: (facing) => (facing > 0 ? 0.12 : Math.PI - 0.12),
      muzzle: { x: 58, y: -4 },
      reach: 150,
    },
    hold(sc) {
      const held = sc.held;
      if (!held?.active) return;
      const cfg = this.held;
      const m = muzzleOf(held, cfg.muzzle);
      sc.fxFlameJet(m, held);
      sc.sfx.burn();
      if (!sc.ready('flame', 0.08)) return;
      const ex = m.x + m.ux * cfg.reach;
      const ey = m.y + m.uy * cfg.reach;
      for (const d of sc.dummies) {
        if (!d.alive) continue;
        for (const seg of d.segs) {
          const r = segmentDistance(m.x, m.y, ex, ey, seg.a.x, seg.a.y, seg.b.x, seg.b.y);
          // The jet widens as it travels.
          if (r.d > seg.r + 8 + 30 * r.s) continue;
          sc.addBurn(d, seg, 8, sc.level('flame') >= 2 ? 5 : 2.5, 'flame');
          d.impulse(seg, r.t, m.ux * 90, m.uy * 90 - 60, sc.dt);
        }
      }
    },
  },

  chainsaw: {
    name: 'Chainsaw',
    phrase: 'the chainsaw',
    hint: 'Held by the handle. Hold to run the motor and grind through whatever the blade touches.',
    desc: 'Hold to run it. Grinds through anything the blade touches and causes heavy bleeding.',
    unlockRarity: 'rare',
    perks: [
      { name: 'Ripper', desc: 'Tears limbs off twice as fast.' },
      { name: 'Overclock', desc: '+60% grinding damage, and the blade drags dummies in.' },
    ],
    held: {
      body: { length: 74, com: 0.5, stiffness: 140, damping: 14, gravityComp: 0.85, maxSpin: 40 },
      rest: (facing) => (facing > 0 ? 0.25 : Math.PI - 0.25),
      strike: { s0: 20, s1: 74, pad: 5, minSpeed: Infinity, cooldown: 0.2, bounce: 1 },
    },
    heldUpdate(sc, held) {
      const cfg = this.held.strike;
      const running = sc.input.pointer.down && sc.pointerOwner === 'arena';
      if (!running) {
        meleeSweep(sc, 'chainsaw', held, cfg, () => {}); // idle: the bar only shoves
        return;
      }
      held.angle += sc.rng.range(-0.025, 0.025); // motor judder
      sc.sfx.saw();
      const over = sc.level('chainsaw') >= 3;
      const a = held.pointAt(cfg.s0);
      const b = held.pointAt(cfg.s1);
      for (const d of sc.dummies) {
        if (!d.alive) continue;
        const hit = d.hitSwipe(a.x, a.y, b.x, b.y, cfg.pad);
        if (!hit) continue;
        sc.fxSparks(hit.x, hit.y, 2, C.gold);
        if (over) {
          const on = held.pointAt(cfg.s0 + hit.s * (cfg.s1 - cfg.s0));
          sc.push(hit, (on.x - hit.x) * 6, (on.y - hit.y) * 6);
        }
        if (!sc.ready('saw' + d.id, 0.1)) continue;
        sc.dealDamage(d, hit.seg, 3.6 * (over ? 1.6 : 1), 'chainsaw', { kind: 'grind', x: hit.x, y: hit.y, limbMult: sc.level('chainsaw') >= 2 ? 2 : 1 });
        sc.addBleed(d, hit.seg, 2, 3, 'chainsaw');
        sc.fxFluff(hit.x, hit.y, 2, 0.8);
      }
    },
  },

  nailgun: {
    name: 'Nail Gun',
    phrase: 'the nail gun',
    hint: 'Held by the grip. Nail parts to the wall, then hit or throw it: nailed limbs tear off.',
    desc: 'Nails dummy parts to the wall. Pull a nailed limb hard enough and it tears off.',
    unlockRarity: 'common',
    perks: [
      { name: 'Framing Nails', desc: 'Nails hold twice as long and deal +50% damage.' },
      { name: 'Nail Storm', desc: 'Fires three nails in a spread.' },
    ],
    held: {
      body: { length: 40, com: 0.45, stiffness: 240, damping: 24, gravityComp: 1, maxSpin: 40 },
      rest: (facing) => (facing > 0 ? 0 : Math.PI),
      muzzle: { x: 40, y: -9 },
      recoil: 8,
    },
    press(sc) {
      sc.nailHeld = 0;
      if (sc.ready('nailgun', 0.16)) fireNails(sc);
    },
    hold(sc, x0, y0, x1, y1, dt) {
      sc.nailHeld = (sc.nailHeld ?? 0) + dt;
      if (sc.nailHeld >= 0.3 && sc.ready('nailgun', 0.22)) fireNails(sc);
    },
  },

  taser: {
    name: 'Taser',
    phrase: 'the taser',
    hint: 'Held by the grip. Touch the prongs to a dummy and press to shock it. The charge jumps.',
    desc: 'Shocks what the prongs touch. Reacts with fire, ice and nails.',
    unlockRarity: 'common',
    perks: [
      { name: 'Chain Lightning', desc: 'Shocks jump to two more dummies.' },
      { name: 'High Voltage', desc: 'Shocked dummies take +25% damage from everything.' },
    ],
    held: {
      body: { length: 42, com: 0.45, stiffness: 200, damping: 20, gravityComp: 1, maxSpin: 40 },
      rest: (facing) => (facing > 0 ? 0.15 : Math.PI - 0.15),
      muzzle: { x: 42, y: -3 },
    },
    press(sc) {
      zap(sc);
    },
    hold(sc) {
      if (sc.ready('taserHold', 0.28)) zap(sc);
    },
  },

  freeze: {
    name: 'Freeze Ray',
    phrase: 'the freeze ray',
    hint: 'Held by the grip. Hold to freeze what the beam touches. Frozen parts shatter under blunt hits.',
    desc: 'Freezes parts solid. Frozen parts shatter under blunt hits and burst into steam when burned.',
    unlockRarity: 'rare',
    perks: [
      { name: 'Deep Freeze', desc: 'Freezes twice as fast and stays frozen longer.' },
      { name: 'Brittle', desc: 'Shatter damage is doubled.' },
    ],
    held: {
      body: { length: 50, com: 0.45, stiffness: 200, damping: 20, gravityComp: 1, maxSpin: 40 },
      rest: (facing) => (facing > 0 ? 0 : Math.PI),
      muzzle: { x: 50, y: -9 },
      range: 420,
    },
    hold(sc) {
      freezeBeam(sc);
    },
  },

  rocket: {
    name: 'Rocket',
    phrase: 'the rocket launcher',
    hint: 'Held by the grip. Press to fire a rocket along the tube. It kicks hard.',
    desc: 'Fires rockets that explode on contact.',
    unlockRarity: 'rare',
    perks: [
      { name: 'Napalm Warhead', desc: 'Explosions leave dummies burning.' },
      { name: 'Twin Tubes', desc: 'Fires two rockets per shot.' },
    ],
    held: {
      body: { length: 66, com: 0.5, stiffness: 150, damping: 16, gravityComp: 1, maxSpin: 40 },
      rest: (facing) => (facing > 0 ? 0 : Math.PI),
      muzzle: { x: 66, y: -10 },
      recoil: 22,
    },
    press(sc) {
      if (!sc.ready('rocket', 1)) return;
      fireRocket(sc);
      if (sc.level('rocket') >= 3) sc.later(0.16, () => fireRocket(sc));
    },
  },

  vortex: {
    name: 'Vortex',
    phrase: 'vortex grenades',
    hint: 'Tap to drop a vortex. It drags everything in, then implodes. Blow something up inside it.',
    desc: 'Drags everything in and implodes. An explosion inside collapses it violently.',
    unlockRarity: 'epic',
    perks: [
      { name: 'Event Horizon', desc: 'Pull radius +35%.' },
      { name: 'Graviton Pulse', desc: 'Vortex damage doubled.' },
    ],
    press(sc, x, y) {
      if (sc.projectiles.filter((p) => p.kind === 'vortex').length >= 2) return;
      if (!sc.ready('vortex', 1.2)) return;
      sc.spawnVortex(x, y, { R: sc.level('vortex') >= 2 ? 335 : 250, power: sc.level('vortex') >= 3 ? 2 : 1 });
    },
    cursor(ctx, sc, x, y) {
      drawWeaponIcon(ctx, 'vortex', x, y, 26, { alpha: 0.55 });
    },
  },

  anvil: {
    name: 'Anvil',
    phrase: 'anvils',
    hint: 'Tap to drop an anvil from the ceiling above that spot.',
    desc: 'Tap to drop from above. Crushing single hits.',
    unlockRarity: 'rare',
    perks: [
      { name: 'Twin Drop', desc: 'Drops two anvils side by side.' },
      { name: 'Tungsten', desc: 'Anvils deal +80% damage.' },
    ],
    press(sc, x) {
      if (sc.projectiles.filter((p) => p.kind === 'anvil').length >= 3) return;
      if (!sc.ready('anvil', 0.6)) return;
      sc.spawnAnvil(x);
      if (sc.level('anvil') >= 2) {
        const off = (x > sc.bounds.right / 2 ? -1 : 1) * 70;
        sc.later(0.12, () => sc.spawnAnvil(x + off));
      }
    },
    cursor(ctx, sc, x) {
      const top = sc.bounds.top;
      ctx.save();
      ctx.strokeStyle = 'rgba(22,25,21,0.35)';
      ctx.setLineDash([6, 8]);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, top + 30);
      ctx.lineTo(x, sc.bounds.bottom);
      ctx.stroke();
      ctx.restore();
      drawWeaponIcon(ctx, 'anvil', x, top + 20, 40, { alpha: 0.5 });
    },
  },
};
