// Weapon definitions. Each weapon reacts to press / hold / release on the
// arena and talks to the play scene through a small set of helpers
// (hitAt, hitSwipe, push, dealDamage, fx*, sfx...).

import { clamp, closestOnSegment } from '../engine/math.js';
import { drawWeaponIcon } from './icons.js';
import { C } from './theme.js';

export const WEAPON_ORDER = ['hands', 'bat', 'knife', 'pistol', 'grenade', 'flame', 'anvil'];
export const MAX_LEVEL = 5;

// Levels 2 and 3 grant the weapon's perks; 4 and 5 add raw damage.
export const weaponDamageMult = (level) => 1 + 0.3 * Math.max(0, level - 3);

export function nextUpgrade(id, level) {
  const def = WEAPONS[id];
  if (level >= MAX_LEVEL) return null;
  if (level + 1 <= 3) return def.perks[level - 1];
  return { name: 'Tuned Up', desc: `${def.name} damage +30%.` };
}

function pistolShot(sc, x, y) {
  const hit = sc.hitAt(x, y, 4);
  sc.fxMuzzle(x, y);
  sc.sfx.shot();
  sc.shake(0.12);
  if (!hit) {
    sc.fxSparks(x, y, 5, C.paperDim);
    return;
  }
  const dir = sc.awayDir(hit.dummy, x, y);
  sc.push(hit, dir.x * 900, dir.y * 900 - 150);
  sc.dealDamage(hit.dummy, hit.seg, sc.level('pistol') >= 2 ? 18 : 11, 'pistol', { x: hit.x, y: hit.y });
  sc.fxFluff(hit.x, hit.y, 6, 1);
  sc.fxSparks(hit.x, hit.y, 6, C.gold);
}

function swing(sc, id, x0, y0, x1, y1, opts) {
  const sp = sc.ptr.speed;
  if (sp < opts.minSpeed) return;
  const dl = Math.hypot(x1 - x0, y1 - y0);
  if (dl < 0.5) return;
  const dir = { x: (x1 - x0) / dl, y: (y1 - y0) / dl };
  for (const hit of sc.hitSwipe(x0, y0, x1, y1, opts.pad)) {
    if (!sc.ready(id + hit.dummy.id, opts.cooldown)) continue;
    opts.onHit(hit, sp, dir);
  }
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
    hint: 'Swipe across the dummy. Faster swings hit harder.',
    desc: 'Swipe to swing. Damage scales with swing speed.',
    unlockRarity: 'common',
    perks: [
      { name: 'Nail Bat', desc: 'Bat hits make the dummy bleed.' },
      { name: 'Home Run', desc: 'Very fast swings deal double damage.' },
    ],
    hold(sc, x0, y0, x1, y1) {
      sc.addTrail(x1, y1);
      swing(sc, 'bat', x0, y0, x1, y1, {
        minSpeed: 380, pad: 10, cooldown: 0.22,
        onHit(hit, sp, dir) {
          const homeRun = sc.level('bat') >= 3 && sp > 2600;
          const dmg = clamp(sp * 0.011, 4, 42) * (homeRun ? 2 : 1);
          const force = Math.min(sp * 0.6, 2300);
          sc.push(hit, dir.x * force, dir.y * force);
          sc.dealDamage(hit.dummy, hit.seg, dmg, 'bat', { x: hit.x, y: hit.y });
          if (sc.level('bat') >= 2) sc.addBleed(hit.dummy, hit.seg, 3, 3, 'bat');
          sc.fxHit(hit.x, hit.y, dir, dmg / 25);
          sc.sfx.bat(dmg / 40);
          if (homeRun) sc.fxText(hit.x, hit.y - 34, 'HOME RUN', C.gold, 20);
        },
      });
    },
    cursor(ctx, sc, x, y) {
      const p = sc.ptr;
      const ang = p.speed > 120 ? Math.atan2(p.vy, p.vx) + Math.PI * 0.25 : -0.3;
      drawWeaponIcon(ctx, 'bat', x, y, 70, { angle: ang, alpha: 0.95 });
    },
  },

  knife: {
    name: 'Knife',
    phrase: 'the knife',
    hint: 'Slash across the dummy to cut it. Cuts keep bleeding.',
    desc: 'Slash to cut. Cuts bleed and tear limbs off fast.',
    unlockRarity: 'common',
    perks: [
      { name: 'Serrated Edge', desc: 'Bleeding lasts twice as long.' },
      { name: 'Surgeon', desc: 'Cuts tear limbs off twice as fast.' },
    ],
    hold(sc, x0, y0, x1, y1) {
      sc.addTrail(x1, y1);
      swing(sc, 'knife', x0, y0, x1, y1, {
        minSpeed: 260, pad: 4, cooldown: 0.13,
        onHit(hit, sp, dir) {
          const dmg = clamp(sp * 0.005, 2, 14);
          sc.push(hit, dir.x * Math.min(sp * 0.15, 500), dir.y * Math.min(sp * 0.15, 500));
          sc.dealDamage(hit.dummy, hit.seg, dmg, 'knife', { x: hit.x, y: hit.y, limbMult: sc.level('knife') >= 3 ? 2 : 1 });
          sc.addBleed(hit.dummy, hit.seg, 3.5, sc.level('knife') >= 2 ? 6 : 3, 'knife');
          sc.fxFluff(hit.x, hit.y, 3, 0.6);
          sc.fxSparks(hit.x, hit.y, 3, C.blood);
          sc.sfx.slash();
        },
      });
    },
    cursor(ctx, sc, x, y) {
      const p = sc.ptr;
      const ang = p.speed > 120 ? Math.atan2(p.vy, p.vx) + Math.PI * 0.25 : 0;
      drawWeaponIcon(ctx, 'knife', x, y, 52, { angle: ang, alpha: 0.95 });
    },
  },

  pistol: {
    name: 'Pistol',
    phrase: 'the pistol',
    hint: 'Tap to shoot where you aim. Hold to keep firing.',
    desc: 'Tap to shoot. Precise, good for targeting one body part.',
    unlockRarity: 'common',
    perks: [
      { name: 'Hollow Points', desc: 'Shots deal +60% damage.' },
      { name: 'Double Tap', desc: 'Every shot fires twice.' },
    ],
    press(sc, x, y) {
      sc.pistolHeld = 0;
      if (!sc.ready('pistol', 0.14)) return;
      pistolShot(sc, x, y);
      if (sc.level('pistol') >= 3) sc.later(0.09, () => pistolShot(sc, x, y));
    },
    hold(sc, x0, y0, x1, y1, dt) {
      sc.pistolHeld = (sc.pistolHeld ?? 0) + dt;
      if (sc.pistolHeld < 0.3 || !sc.ready('pistol', 0.2)) return;
      pistolShot(sc, x1, y1);
      if (sc.level('pistol') >= 3) sc.later(0.09, () => pistolShot(sc, x1, y1));
    },
    cursor(ctx, sc, x, y) {
      ctx.strokeStyle = C.bad;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, 12, 0, Math.PI * 2);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        ctx.moveTo(x + dx * 6, y + dy * 6);
        ctx.lineTo(x + dx * 18, y + dy * 18);
      }
      ctx.stroke();
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
    hint: 'Hold near the dummy to set it alight. Fire keeps burning.',
    desc: 'Hold to spray fire. Burning parts take damage over time.',
    unlockRarity: 'rare',
    perks: [
      { name: 'Napalm', desc: 'Burns last twice as long.' },
      { name: 'Wildfire', desc: 'Fire spreads to nearby body parts.' },
    ],
    hold(sc, x0, y0, x1, y1) {
      sc.flameAt = { x: x1, y: y1 };
      sc.fxFlame(x1, y1);
      sc.sfx.burn();
      if (!sc.ready('flame', 0.08)) return;
      const R = 46;
      for (const d of sc.dummies) {
        if (!d.alive) continue;
        for (const seg of d.segs) {
          const c = closestOnSegment(x1, y1, seg.a.x, seg.a.y, seg.b.x, seg.b.y);
          const dist = Math.hypot(x1 - c.x, y1 - c.y) - seg.r;
          if (dist > R) continue;
          sc.addBurn(d, seg, 8, sc.level('flame') >= 2 ? 5 : 2.5, 'flame');
          const dx = c.x - x1, dy = c.y - y1;
          const dl = Math.hypot(dx, dy) || 1;
          d.impulse(seg, c.t, (dx / dl) * 90, (dy / dl) * 90 - 60, sc.dt);
        }
      }
    },
    cursor(ctx, sc, x, y, down) {
      if (!down) drawWeaponIcon(ctx, 'flame', x, y, 26, { alpha: 0.6 });
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
