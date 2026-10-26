// Dummy variants and the three acts of a run. Variants change how a dummy
// takes punishment, so different weapons shine against different ones.

export const VARIANTS = {
  standard: { name: 'Test Dummy', desc: 'Regular burlap and stuffing.' },
  runt: { name: 'Runts', desc: 'Small, light, and they come in pairs.', scale: 0.72, hpMult: 0.5, count: 2 },
  rubber: { name: 'Rubber Dummy', desc: 'Bounces everywhere and takes a quarter of impact damage.', bounce: 0.78, impactMult: 0.25, color: '#cf6d4c' },
  armored: { name: 'Riot Dummy', desc: 'Helmet and vest soak 60% of hits until they break.', armor: 0.25 },
  balloon: { name: 'Balloon Dummy', desc: 'A helium head keeps it floating. Pop the head to drop it.', balloon: true },
  fireproof: { name: 'Asbestos Dummy', desc: 'Immune to fire. Ice shatters it easily.', fireproof: true, color: '#c8c2ad' },
  regen: { name: 'Self-Stitcher', desc: 'Heals itself unless it is bleeding.', regen: 0.05, color: '#a9b86a' },

  bigBuddy: { name: 'Big Buddy', desc: 'Four and a half times the stuffing.', scale: 1.35, hpMult: 4.5, boss: true },
  riotCaptain: { name: 'Riot Captain', desc: 'Huge, armored, and very patient.', scale: 1.35, hpMult: 3.4, armor: 0.3, boss: true },
  hydraKing: { name: 'Hydra King', desc: 'Splits into two when destroyed, and those split again.', scale: 1.4, hpMult: 2.2, splits: 'hydraSpawn', boss: true },
  hydraSpawn: { name: 'Hydra Spawn', desc: '', scale: 1, hpMult: 0.7, splits: 'runtSpawn', color: '#b98a6a' },
  runtSpawn: { name: 'Runt', desc: '', scale: 0.72, hpMult: 0.35, color: '#b98a6a' },
};

// Kills needed to finish a dummy that splits (itself plus every child).
export function totalKills(variant) {
  const v = VARIANTS[variant];
  return 1 + (v.splits ? 2 * totalKills(v.splits) : 0);
}

export const ACTS = [
  {
    name: 'Padded Cell',
    blurb: 'Where every dummy starts. Soft walls, normal gravity.',
    theme: 'cell',
    gravity: 1,
    roster: ['standard', 'standard', 'runt', 'rubber'],
    elite: ['rubber', 'armored'],
    boss: 'bigBuddy',
  },
  {
    name: 'Crash Lab',
    blurb: 'Low gravity. Dummies float, and throws fly a long way.',
    theme: 'lab',
    gravity: 0.6,
    roster: ['standard', 'runt', 'balloon', 'rubber', 'armored'],
    elite: ['armored', 'balloon', 'regen'],
    boss: 'riotCaptain',
  },
  {
    name: 'Furnace',
    blurb: 'Flame vents erupt from the floor. Anything above them burns.',
    theme: 'furnace',
    gravity: 1,
    vents: true,
    roster: ['standard', 'fireproof', 'regen', 'balloon', 'runt'],
    elite: ['armored', 'regen', 'fireproof'],
    boss: 'hydraKing',
  },
];

export const FLOORS_PER_ACT = 5;

// Crate twists: a random rule change for one round.
export const TWISTS = {
  lowgrav: { name: 'Zero-G Drill', desc: 'Gravity drops to a third for this round.' },
  glass: { name: 'Glass Dummies', desc: 'Dummies have 40% less health, but you get 12 seconds less.' },
  swarm: { name: 'Swarm', desc: 'Runts only, and more of them.' },
  blackout: { name: 'Blackout', desc: 'The lights are out. You only see near your hand.' },
};
