// Disciplines: every weapon and trap belongs to one or two. Each owned weapon
// (Hands aside) and each installed trap counts as a source for its
// disciplines; two sources unlock a discipline's first tier, four its
// second. Six different disciplines in play at once earns the Generalist
// bonus. Mods can add sources or lower the second tier to three.
//
// What a hit counts as comes from its source plus how it landed: impacts are
// Kinetic, explosions Blast, burn ticks Fire and bleed ticks Blade.

export const DISCIPLINES = {
  blunt: {
    name: 'Blunt', short: 'BLU', color: '#d08a46',
    tiers: ['Blunt hits deal +25%.', 'Every fourth blunt hit is a Concussion: 2.5x damage.'],
  },
  blade: {
    name: 'Blade', short: 'BLD', color: '#e0505a',
    tiers: ['Blade hits +15%, bleeding +50%.', 'Blade hits tear limbs off 60% faster.'],
  },
  ballistic: {
    name: 'Ballistic', short: 'BAL', color: '#9aa6b2',
    tiers: ['Ballistic hits deal +25%.', 'Ballistic hits have a 35% chance to ricochet for 1.6x.'],
  },
  fire: {
    name: 'Fire', short: 'FIR', color: '#ff8a1f',
    tiers: ['Burns last 50% longer and deal +25%.', 'Burning dummies take +20% from everything.'],
  },
  cryo: {
    name: 'Cryo', short: 'CRY', color: '#8fd3ff',
    tiers: ['Parts freeze 50% faster; cryo damage +25%.', 'Frozen parts take +50% from everything.'],
  },
  volt: {
    name: 'Volt', short: 'VLT', color: '#7cf7ff',
    tiers: ['Shocks last 50% longer and deal +30%.', 'Shocked dummies take +20% from everything.'],
  },
  blast: {
    name: 'Blast', short: 'BLS', color: '#f2d04a',
    tiers: ['Explosions are 20% bigger and deal +20%.', 'Explosions deal +30% and throw twice as hard.'],
  },
  kinetic: {
    name: 'Kinetic', short: 'KIN', color: '#6fd38f',
    tiers: ['Impact damage +40%.', 'Each bounce keeps 75% of the last, not half, and impacts hit harder.'],
  },
};

export const DISCIPLINE_IDS = Object.keys(DISCIPLINES);

// Weapons by id, traps as 'trap:<id>'.
const SOURCE_TAGS = {
  hands: ['blunt', 'kinetic'],
  bat: ['blunt'],
  sledge: ['blunt', 'kinetic'],
  knife: ['blade'],
  chainsaw: ['blade'],
  pistol: ['ballistic'],
  shotgun: ['ballistic', 'kinetic'],
  nailgun: ['ballistic'],
  taser: ['volt'],
  freeze: ['cryo'],
  rocket: ['blast', 'ballistic'],
  flame: ['fire'],
  grenade: ['blast'],
  vortex: ['kinetic', 'blast'],
  anvil: ['blunt', 'kinetic'],
  'trap:spring': ['kinetic'],
  'trap:spinner': ['blunt'],
  'trap:fan': ['kinetic'],
  'trap:flamejet': ['fire'],
  'trap:saw': ['blade'],
  'trap:tesla': ['volt'],
  'trap:cryo': ['cryo'],
  'trap:turret': ['ballistic'],
  'trap:crusher': ['blunt'],
  'trap:pendulum': ['blade'],
  'trap:mine': ['blast'],
  'trap:rail': ['volt'],
  // Rig sources.
  storm: ['volt'],
};

const NONE = [];

export const sourceTags = (id) => SOURCE_TAGS[id] ?? NONE;
export const trapTags = (trapId) => SOURCE_TAGS['trap:' + trapId] ?? NONE;

// What a single hit counts as.
export function hitTags(weaponId, kind, status) {
  const tags = new Set(sourceTags(weaponId));
  if (kind === 'impact') tags.add('kinetic');
  if (kind === 'blast') tags.add('blast');
  if (status === 'burn') {
    tags.clear();
    tags.add('fire');
  } else if (status === 'bleed') {
    tags.clear();
    tags.add('blade');
  }
  return tags;
}

// Sources per discipline for a run, and the tier each one has reached.
export function synergy(run) {
  const counts = Object.fromEntries(DISCIPLINE_IDS.map((t) => [t, 0]));
  for (const id of run.owned) if (id !== 'hands') for (const t of sourceTags(id)) counts[t]++;
  for (const trap of run.traps) for (const t of trapTags(trap.id)) counts[t]++;
  for (const [t, n] of Object.entries(run.tagBonus ?? {})) counts[t] += n;
  // Specialist Badge: the strongest discipline counts one higher.
  if (run.specialist) {
    const best = DISCIPLINE_IDS.reduce((a, b) => (counts[b] > counts[a] ? b : a));
    if (counts[best] > 0) counts[best]++;
  }
  const second = run.resonance ? 3 : 4;
  const tiers = Object.fromEntries(DISCIPLINE_IDS.map((t) => [t, counts[t] >= second ? 2 : counts[t] >= 2 ? 1 : 0]));
  const spread = DISCIPLINE_IDS.filter((t) => counts[t] > 0).length;
  return { counts, tiers, second, spread, generalist: spread >= 6 };
}
