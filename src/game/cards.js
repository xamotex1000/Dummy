// The card pool. Cards unlock or upgrade weapons, tweak the dummy, or bend
// the rules of the run. Offers are drawn by rarity weight.

import { WEAPONS, WEAPON_ORDER, nextUpgrade } from './weapons.js';

export const RARITY_WEIGHT = {
  normal: { common: 60, rare: 30, epic: 10 },
  bonus: { common: 35, rare: 45, epic: 20 },
};

export const KIND_LABEL = {
  weapon: 'New weapon',
  upgrade: 'Upgrade',
  dummy: 'Dummy mod',
  perk: 'Perk',
  curse: 'Trade-off',
};

const STATIC_CARDS = [
  { id: 'cheap', kind: 'dummy', rarity: 'common', max: 3, name: 'Cheap Stitching', badge: '-20%', desc: 'Dummies have 20% less health.', apply: (r) => { r.dummyHpMult *= 0.8; } },
  { id: 'hydra', kind: 'dummy', rarity: 'rare', max: 3, name: 'Hydra Stuffing', badge: 'x2', desc: '+35% chance a destroyed dummy is replaced by two.', apply: (r) => { r.hydraChance = Math.min(1, r.hydraChance + 0.35); } },
  { id: 'seams', kind: 'dummy', rarity: 'common', max: 3, name: 'Loose Seams', badge: 'RIP', desc: 'Limbs tear off 40% sooner.', apply: (r) => { r.limbFragility *= 1.4; } },
  { id: 'rubber', kind: 'dummy', rarity: 'common', max: 3, name: 'Rubber Filling', badge: 'BOING', desc: 'Dummies bounce harder and take +60% impact damage.', apply: (r) => { r.impactMult *= 1.6; r.bounce = Math.min(0.75, r.bounce + 0.15); } },
  { id: 'bullseye', kind: 'dummy', rarity: 'common', max: 4, name: 'Bullseye Button', badge: 'HEAD', desc: 'Head hits deal +50% damage.', apply: (r) => { r.headMult += 0.5; } },
  { id: 'shatter', kind: 'dummy', rarity: 'epic', max: 1, name: 'Volatile Fluff', badge: 'POP', desc: 'Destroyed dummies explode and hurt dummies nearby.', apply: (r) => { r.shatter = true; } },
  { id: 'heavy', kind: 'perk', rarity: 'common', max: 99, name: 'Heavy Hands', badge: '+20%', desc: 'All damage +20%.', apply: (r) => { r.dmgMult *= 1.2; } },
  { id: 'crit', kind: 'perk', rarity: 'common', max: 5, name: 'Sharp Eye', badge: 'CRIT', desc: '+8% chance to crit. Crits deal 2.5x damage.', apply: (r) => { r.critChance += 0.08; } },
  { id: 'overtime', kind: 'perk', rarity: 'common', max: 4, name: 'Overtime', badge: '+6s', desc: 'Every round lasts 6 seconds longer.', apply: (r) => { r.timeBonus += 6; } },
  { id: 'combo', kind: 'perk', rarity: 'rare', max: 1, name: 'Combo Counter', badge: 'CHAIN', desc: 'Hits in quick succession build up to +60% damage.', apply: (r) => { r.combo = true; } },
  { id: 'adrenaline', kind: 'perk', rarity: 'rare', max: 1, name: 'Adrenaline', badge: 'LAST 10', desc: 'Damage is doubled in the last 10 seconds of a round.', apply: (r) => { r.adrenaline = true; } },
  { id: 'lucky', kind: 'perk', rarity: 'rare', max: 1, name: 'Lucky Stitch', badge: '+1', desc: 'See one more card at every pick.', apply: (r) => { r.choices += 1; } },
  { id: 'reroll', kind: 'perk', rarity: 'common', max: 99, name: 'Shuffle', badge: 'REROLL', desc: 'Gain 2 rerolls to use on card picks.', apply: (r) => { r.rerolls += 2; } },
  { id: 'secondwind', kind: 'perk', rarity: 'epic', max: 2, name: 'Second Wind', badge: '1UP', desc: 'The next time you fail a round, retry it instead of ending the run.', apply: (r) => { r.lives += 1; } },
  { id: 'bloodpact', kind: 'curse', rarity: 'rare', max: 2, name: 'Blood Pact', badge: '+50%', desc: 'All damage +50%, but rounds are 8 seconds shorter.', apply: (r) => { r.dmgMult *= 1.5; r.timeBonus -= 8; } },
  { id: 'reinforced', kind: 'curse', rarity: 'common', max: 2, name: 'Reinforced Dummy', badge: '+25% HP', desc: 'Dummies have 25% more health. Gain 3 rerolls and +6% crit chance.', apply: (r) => { r.dummyHpMult *= 1.25; r.rerolls += 3; r.critChance += 0.06; } },
];

function weaponCards(run) {
  const cards = [];
  const owned = run.owned.length;
  for (const id of WEAPON_ORDER) {
    const def = WEAPONS[id];
    const level = run.level(id);
    if (!level) {
      cards.push({
        id: 'unlock_' + id, kind: 'weapon', rarity: def.unlockRarity, icon: id,
        name: def.name, desc: def.desc,
        // New toys show up more often while the arsenal is small.
        weight: owned < 4 ? 1.8 : 1,
        apply: (r) => { r.weapons[id] = { level: 1 }; },
      });
      continue;
    }
    const up = nextUpgrade(id, level);
    if (!up) continue;
    cards.push({
      id: 'up_' + id, kind: 'upgrade', rarity: level >= 2 ? 'rare' : 'common', icon: id,
      name: `${def.name}: ${up.name}`, desc: up.desc, badge: `LV ${level + 1}`,
      apply: (r) => { r.weapons[id].level += 1; },
    });
  }
  return cards;
}

export function availableCards(run) {
  const statics = STATIC_CARDS.filter((c) => (run.cardCounts[c.id] ?? 0) < c.max);
  // Blood Pact can't push rounds below 20 seconds.
  const filtered = statics.filter((c) => c.id !== 'bloodpact' || 40 + run.timeBonus - 8 >= 20);
  return [...weaponCards(run), ...filtered];
}

export function drawOffer(run, rng, { bonus = false, exclude = [] } = {}) {
  const weights = bonus ? RARITY_WEIGHT.bonus : RARITY_WEIGHT.normal;
  const pool = availableCards(run).filter((c) => !exclude.includes(c.id));
  return rng.weightedSample(pool, run.choices, (c) => weights[c.rarity] * (c.weight ?? 1));
}

export function takeCard(run, card) {
  card.apply(run);
  run.cardCounts[card.id] = (run.cardCounts[card.id] ?? 0) + 1;
  run.taken.push(card.name);
}
