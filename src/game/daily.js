// The daily test: one seeded run per calendar day, the same for everyone
// that day. It runs at a fixed Safety Rating with two mutators from the
// list below, ignores the rogue-lite tree, and keeps its own best score.

export const DAILY_RATING = 2;

export const MUTATORS = {
  doubleTrouble: { name: 'Double Trouble', desc: 'One more dummy comes in each floor.', apply: (r) => { r.extraDummies += 1; } },
  glass: { name: 'Glass Dummies', desc: 'Dummies have 40% less health, and floors are 8 seconds shorter.', apply: (r) => { r.dummyHpMult *= 0.6; r.timeBonus -= 8; } },
  heavyMachinery: { name: 'Heavy Machinery', desc: 'Traps deal +50%, weapons 25% less.', apply: (r) => { r.trapMult *= 1.5; r.weaponMult *= 0.75; } },
  bargainBin: { name: 'Bargain Bin', desc: 'Supply Room prices are halved.', apply: (r) => { r.priceMult *= 0.5; } },
  overtime: { name: 'Overtime', desc: 'Floors get 10 more seconds, but dummies have 50% more health.', apply: (r) => { r.timeBonus += 10; r.dummyHpMult *= 1.5; } },
  brittle: { name: 'Brittle Batch', desc: 'Limbs tear off twice as easily.', apply: (r) => { r.limbFragility *= 2; } },
  payday: { name: 'Payday', desc: 'Start with 60 scrap, and scrap income is doubled.', apply: (r) => { r.scrap += 60; r.scrapMult += 1; } },
  critical: { name: 'Critical Mass', desc: '+15% crit chance, and crits deal 3.5x.', apply: (r) => { r.critChance += 0.15; r.critMult = 3.5; } },
};

export const MUTATOR_IDS = Object.keys(MUTATORS);

// A stable 32-bit seed from a date string.
export function dailySeed(date) {
  let h = 2166136261;
  for (const ch of `crash-test-${date}`) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export const today = () => new Date().toISOString().slice(0, 10);
