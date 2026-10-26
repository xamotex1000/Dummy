// Round generation: a primary objective you must finish before the clock
// runs out, plus an optional bonus condition that pays out an extra card.

import { WEAPONS } from './weapons.js';

const round10 = (v) => Math.max(10, Math.round(v / 10) * 10);
const round5 = (v) => Math.round(v / 5) * 5;

export const PRIMARY = {
  damage(r) {
    const target = round10(110 * Math.pow(1.3, r - 1));
    return { type: 'damage', target, label: `Deal ${target} damage`, hint: 'Any damage from any weapon counts.' };
  },
  kills(r) {
    const target = 1 + Math.floor(r / 3);
    return {
      type: 'kills', target,
      label: target === 1 ? 'Destroy a dummy' : `Destroy ${target} dummies`,
      hint: 'Empty its health bar. A fresh one drops in after each.',
    };
  },
  impact(r) {
    const target = round10(60 * Math.pow(1.25, r - 2));
    return { type: 'impact', target, label: `Deal ${target} impact damage`, hint: 'Slam it into the walls, floor or ceiling. Grab and throw works.' };
  },
  severs(r) {
    const target = Math.min(4, 1 + Math.floor((r - 1) / 3));
    return {
      type: 'severs', target,
      label: target === 1 ? 'Tear off a limb' : `Tear off ${target} limbs`,
      hint: 'Focus one arm or leg until the stitching gives.',
    };
  },
  bigHit(r) {
    const target = round5(22 + r * 3);
    return { type: 'bigHit', target, label: `Land one ${target}+ damage hit`, hint: 'Fast swings, hard throws and anvils hit hardest.' };
  },
};

export const SECONDARY = [
  {
    id: 'onlyPart',
    ok: () => true,
    make: ({ primary }, rng) => {
      const group = rng.pick(primary.type === 'severs' ? ['arms', 'legs'] : ['head', 'torso', 'arms', 'legs']);
      return { group, label: `Only hit the ${group}` };
    },
  },
  {
    id: 'banWeapon',
    ok: ({ run }) => run.owned.length >= 2,
    make: ({ run }) => {
      const weapon = run.favoriteWeapon();
      return { weapon, label: `Don't use ${WEAPONS[weapon].phrase}` };
    },
  },
  {
    id: 'noKill',
    ok: ({ primary }) => primary.type !== 'kills' && primary.type !== 'boss',
    make: () => ({ label: "Don't destroy the dummy" }),
  },
  {
    id: 'speed',
    ok: () => true,
    make: ({ time }) => {
      const seconds = Math.round(time * 0.4);
      return { seconds, label: `Finish with ${seconds}s to spare` };
    },
  },
  {
    id: 'oneWeapon',
    ok: ({ run }) => run.owned.length >= 2,
    make: () => ({ weapon: null, label: 'Stick to one weapon' }),
  },
  {
    id: 'noImpact',
    ok: ({ primary }) => primary.type !== 'impact',
    make: () => ({ label: 'No impact damage' }),
  },
];

export function makeRound(run, rng) {
  const r = run.round;
  const boss = r % 5 === 0;
  let primary;
  if (boss) {
    primary = { type: 'boss', target: 1, label: 'Destroy the Big Buddy', hint: 'Five times the stuffing. No replacements.' };
  } else {
    const pool = r === 1 ? ['damage'] : r === 2 ? ['damage', 'kills', 'impact'] : Object.keys(PRIMARY);
    const choices = pool.length > 1 ? pool.filter((t) => t !== run.lastPrimary) : pool;
    primary = PRIMARY[rng.pick(choices)](r);
  }
  run.lastPrimary = primary.type;

  const time = Math.max(15, (boss ? 55 : 40) + run.timeBonus);
  const ctx = { primary, run, time };
  const def = rng.pick(SECONDARY.filter((s) => s.ok(ctx)));
  const secondary = { id: def.id, state: 'active', ...def.make(ctx, rng) };

  let hp = 100 * Math.pow(1.16, r - 1) * run.dummyHpMult * (boss ? 5 : 1);
  // Keeping the dummy alive has to be possible while still dealing the damage.
  if (secondary.id === 'noKill' && primary.type === 'damage') hp = Math.max(hp, primary.target * 1.3);

  return {
    number: r,
    boss,
    primary,
    secondary,
    time,
    dummy: { hp: Math.round(hp), scale: boss ? 1.35 : 1 },
    cardAfter: r % 2 === 1 || boss,
  };
}

export function primaryProgress(round, stats) {
  switch (round.primary.type) {
    case 'damage': return stats.damage;
    case 'kills':
    case 'boss': return stats.kills;
    case 'impact': return stats.impact;
    case 'severs': return stats.severs;
    case 'bigHit': return stats.maxHit;
  }
  return 0;
}

// Feed a gameplay event to the bonus condition. Returns true if it just failed.
export function secondaryEvent(sec, type, ev) {
  if (sec.state !== 'active') return false;
  let fail = false;
  switch (sec.id) {
    case 'onlyPart':
      fail = type === 'damage' && ev.group !== sec.group;
      break;
    case 'banWeapon':
      fail = type === 'damage' && ev.weapon === sec.weapon;
      break;
    case 'noKill':
      fail = type === 'kill';
      break;
    case 'oneWeapon':
      if (type === 'damage') {
        if (!sec.weapon) {
          sec.weapon = ev.weapon;
          sec.label = `Stick to one weapon (${WEAPONS[ev.weapon].name})`;
        } else {
          fail = ev.weapon !== sec.weapon;
        }
      }
      break;
    case 'noImpact':
      fail = type === 'damage' && ev.kind === 'impact';
      break;
  }
  if (fail) sec.state = 'failed';
  return fail;
}

export function secondaryComplete(sec, timeLeft) {
  if (sec.state !== 'active') return;
  sec.state = sec.id === 'speed' && timeLeft < sec.seconds ? 'failed' : 'done';
}

export function describeProgress(round, stats) {
  const p = Math.floor(primaryProgress(round, stats));
  const t = round.primary.target;
  if (round.primary.type === 'bigHit') return `best ${p} / ${t}`;
  return `${Math.min(p, t)} / ${t}`;
}

