// Affixes: resistances some dummies come with, to push back on a build that
// leans on one discipline. Elites always roll one; higher Safety Ratings
// add more and hand them to ordinary dummies too. They show on the route
// ticket, so you can steer around them.

export const AFFIXES = {
  insulated: { name: 'Insulated', desc: 'Immune to shocks.', counters: ['volt'] },
  retardant: { name: 'Flame-Retardant', desc: "Can't be set on fire.", counters: ['fire'] },
  antifreeze: { name: 'Antifreeze', desc: "Can't be frozen.", counters: ['cryo'] },
  kevlar: { name: 'Kevlar Lining', desc: 'Blade and ballistic damage -50%.', counters: ['blade', 'ballistic'] },
  absorbers: { name: 'Shock Absorbers', desc: 'Impact damage -70%.', counters: ['kinetic'] },
  shielded: { name: 'Blast Shielding', desc: 'Explosions deal 60% less.', counters: ['blast'] },
  hardened: { name: 'Hardened Shell', desc: 'Blunt damage -40%.', counters: ['blunt'] },
  welded: { name: 'Welded Joints', desc: "Limbs can't be torn off.", counters: [] },
  greased: { name: 'Greased', desc: "Can't be grabbed, and nails slip out fast.", counters: [] },
  grounded: { name: 'Grounded Frame', desc: 'Traps deal 40% less.', counters: [] },
};

export const AFFIX_IDS = Object.keys(AFFIXES);

// Damage multiplier for a hit `h` (see mods.js) on a dummy with affixes.
export function affixMult(d, h) {
  const a = d.affixes;
  if (!a.size) return 1;
  let m = 1;
  if (a.has('kevlar') && (h.tags.has('blade') || h.tags.has('ballistic'))) m *= 0.5;
  if (a.has('absorbers') && h.kind === 'impact') m *= 0.3;
  if (a.has('shielded') && h.kind === 'blast') m *= 0.4;
  if (a.has('hardened') && h.tags.has('blunt')) m *= 0.6;
  if (a.has('grounded') && h.trap) m *= 0.6;
  return m;
}

// `n` affixes that make sense for this round: none that would make the
// objective impossible, and none the variant already has built in.
export function rollAffixes(rng, n, { primary, variant }) {
  if (n <= 0) return [];
  const pool = AFFIX_IDS.filter((id) => {
    if (id === 'welded' && primary.type === 'severs') return false;
    if (id === 'absorbers' && primary.type === 'impact') return false;
    if (id === 'grounded' && primary.type === 'trapDamage') return false;
    if (id === 'retardant' && variant === 'fireproof') return false;
    return true;
  });
  return rng.weightedSample(pool, n, () => 1);
}
