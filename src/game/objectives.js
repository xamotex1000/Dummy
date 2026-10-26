// Round generation. Between floors the player picks the next work order
// from a route of tickets; each ticket is a fully generated round: objective,
// optional bonus, dummy variant, twist and reward.

import { WEAPONS } from './weapons.js';
import { VARIANTS, TWISTS, totalKills } from './variants.js';
import { reactionsPossible } from './reactions.js';

const round10 = (v) => Math.max(10, Math.round(v / 10) * 10);
const round5 = (v) => Math.round(v / 5) * 5;

export const PRIMARY = {
  damage(r) {
    const target = round10(100 * Math.pow(1.2, r - 1));
    return { type: 'damage', target, label: `Deal ${target} damage`, hint: 'Any damage from any weapon counts.' };
  },
  kills(r, extra = 0) {
    const target = 1 + Math.floor(r / 4) + extra;
    return {
      type: 'kills', target,
      label: target === 1 ? 'Destroy a dummy' : `Destroy ${target} dummies`,
      hint: 'Empty its health bar. A fresh one drops in after each.',
    };
  },
  impact(r) {
    const target = round10(40 * Math.pow(1.2, r - 2));
    return { type: 'impact', target, label: `Deal ${target} impact damage`, hint: 'Knock it into walls, floor or ceiling. Each bounce is worth less than the last.' };
  },
  severs(r) {
    const target = Math.min(4, 1 + Math.floor((r - 1) / 4));
    return {
      type: 'severs', target,
      label: target === 1 ? 'Tear off a limb' : `Tear off ${target} limbs`,
      hint: 'Focus one arm or leg until the stitching gives.',
    };
  },
  bigHit(r) {
    const target = round5(20 + r * 2.5);
    return { type: 'bigHit', target, label: `Land one ${target}+ damage hit`, hint: 'Fast swings, anvils, rockets and reactions hit hardest.' };
  },
  reactions(r) {
    const target = 1 + Math.floor(r / 6);
    return {
      type: 'reactions', target,
      label: target === 1 ? 'Trigger a reaction' : `Trigger ${target} reactions`,
      hint: 'Combine effects: fire, ice, shocks, nails and blasts. The pause menu lists what you have found.',
    };
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
    ok: ({ primary }) => !['kills', 'boss'].includes(primary.type),
    make: () => ({ label: "Don't destroy any dummy" }),
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
  {
    id: 'reaction',
    ok: ({ run, primary }) => primary.type !== 'reactions' && reactionsPossible(run),
    make: () => ({ got: false, label: 'Trigger any reaction' }),
  },
];

const REWARD = { standard: 'card', elite: 'rare', crate: 'weapon', boss: 'boss' };

export const REWARD_LABEL = {
  card: 'Card pick',
  rare: 'Rare card pick, +1 choice',
  weapon: 'New weapon pick',
  boss: 'Rare card pick',
};

export function makeRound(run, rng, node) {
  const depth = run.depth;
  const act = run.actDef;
  const type = node.type;
  const v = VARIANTS[node.variant];
  const boss = type === 'boss';
  const count = node.twist === 'swarm' ? 3 : v.count ?? 1;

  let primary;
  if (boss) {
    const target = totalKills(node.variant);
    primary = { type: 'boss', target, label: target > 1 ? `Destroy the ${v.name} and its spawn` : `Destroy the ${v.name}`, hint: v.desc };
  } else {
    let pool = depth <= 1 ? ['damage'] : depth === 2 ? ['damage', 'kills', 'impact'] : ['damage', 'kills', 'impact', 'severs', 'bigHit'];
    if (depth > 2 && reactionsPossible(run)) pool.push('reactions');
    if (node.twist === 'swarm') pool = ['kills'];
    const choices = pool.length > 1 ? pool.filter((t) => t !== run.lastPrimary) : pool;
    const kind = rng.pick(choices);
    primary = kind === 'kills' ? PRIMARY.kills(depth, count - 1) : PRIMARY[kind](depth);
    if (type === 'elite' && ['damage', 'impact'].includes(kind)) {
      primary = PRIMARY[kind](depth + 1);
    }
  }

  let time = (boss ? 60 : 40) + run.timeBonus;
  if (type === 'elite') time -= 5;
  if (node.twist === 'glass') time -= 12;
  time = Math.max(15, time);

  const ctx = { primary, run, time };
  const def = rng.pick(SECONDARY.filter((s) => s.ok(ctx)));
  const secondary = { id: def.id, state: 'active', ...def.make(ctx, rng) };

  let hp = 100 * Math.pow(1.14, depth - 1) * run.dummyHpMult * (v.hpMult ?? 1) * Math.pow(1.5, run.loop);
  if (type === 'elite') hp *= 1.35;
  if (node.twist === 'glass') hp *= 0.6;
  // Keeping the dummy alive has to be possible while still dealing the damage.
  if (secondary.id === 'noKill' && primary.type === 'damage') hp = Math.max(hp, primary.target * 1.3);

  return {
    number: depth,
    act: run.act,
    floor: run.floor,
    type,
    variant: node.variant,
    twist: node.twist ?? null,
    boss,
    primary,
    secondary,
    time,
    dummy: { hp: Math.round(hp), variant: node.variant, scale: v.scale ?? 1, count },
    env: {
      gravity: act.gravity * (node.twist === 'lowgrav' ? 0.35 : 1),
      vents: !!act.vents,
      blackout: node.twist === 'blackout',
    },
    reward: REWARD[type],
  };
}

function makeNode(run, rng, type) {
  const act = run.actDef;
  let variant = type === 'elite' ? rng.pick(act.elite) : rng.pick(act.roster);
  let twist = null;
  if (type === 'crate') {
    twist = rng.pick(Object.keys(TWISTS));
    if (twist === 'swarm') variant = 'runt';
  }
  const node = { type, variant, twist };
  node.round = makeRound(run, rng, node);
  return node;
}

// Three tickets to choose the next floor from (or the act boss).
export function makeRoute(run, rng) {
  if (run.isBossFloor) {
    const node = { type: 'boss', variant: run.actDef.boss, twist: null };
    node.round = makeRound(run, rng, node);
    return [node];
  }
  const types = ['standard'];
  const pool = ['elite', 'crate', 'standard', 'elite', 'crate'];
  if (run.floor >= 2 && run.workshopUsed !== run.actIndex) pool.push('workshop', 'workshop');
  while (types.length < 3) {
    const t = rng.pick(pool);
    if (t === 'standard' || !types.includes(t)) types.push(t);
  }
  return types.map((type) => (type === 'workshop' ? { type } : makeNode(run, rng, type)));
}

export function primaryProgress(round, stats) {
  switch (round.primary.type) {
    case 'damage': return stats.damage;
    case 'kills':
    case 'boss': return stats.kills;
    case 'impact': return stats.impact;
    case 'severs': return stats.severs;
    case 'bigHit': return stats.maxHit;
    case 'reactions': return stats.reactions;
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
    case 'reaction':
      if (type === 'reaction') sec.got = true;
      break;
  }
  if (fail) sec.state = 'failed';
  return fail;
}

export function secondaryComplete(sec, timeLeft) {
  if (sec.state !== 'active') return;
  if (sec.id === 'speed' && timeLeft < sec.seconds) sec.state = 'failed';
  else if (sec.id === 'reaction' && !sec.got) sec.state = 'failed';
  else sec.state = 'done';
}

export function describeProgress(round, stats) {
  const p = Math.floor(primaryProgress(round, stats));
  const t = round.primary.target;
  if (round.primary.type === 'bigHit') return `best ${p} / ${t}`;
  return `${Math.min(p, t)} / ${t}`;
}
