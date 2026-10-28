// Incidents: route stops with no dummy, just a report and a choice. Each
// option either resolves on the spot, or hands off to a card or mod pick
// through the play scene (sc.pickCards / sc.pickMod).
//
// An option is { label, desc, cost, ok(sc), pick(sc) }. `cost` is scrap,
// paid when it's picked. `pick` returns { text, next(done) }: the text
// shown afterwards, and anything to open before moving on.

import { MODS, MOD_IDS, PERMITS, addMod } from './mods.js';
import { DISCIPLINES, DISCIPLINE_IDS } from './tags.js';
import { WEAPONS } from './weapons.js';

const randomMod = (sc, rarity) => {
  const pool = MOD_IDS.filter((id) => !sc.run.mods.includes(id) && !MODS[id].cert && (!rarity || MODS[id].rarity === rarity));
  return pool.length ? sc.rng.pick(pool) : null;
};

const giveMod = (sc, id) => {
  if (!id) return 'Nothing left to give.';
  addMod(sc.run, id);
  return `Rig mod installed: ${MODS[id].name}. ${MODS[id].desc}`;
};

export const INCIDENTS = {
  spill: {
    title: 'Coolant Spill',
    text: 'A coolant line burst over the test cell. Liquid nitrogen is pooling on the floor and the drains are frozen shut.',
    options: () => [
      {
        label: 'Bottle it', desc: 'Gain Liquid Nitrogen. Every floor loses 3 seconds while the drains thaw.',
        ok: (sc) => !sc.run.mods.includes('nitrogen'),
        pick: (sc) => { sc.run.timeBonus -= 3; return { text: giveMod(sc, 'nitrogen') }; },
      },
      { label: 'Mop it up', desc: '+20 scrap for the cleanup.', pick: (sc) => { sc.addScrap(20); return { text: 'The floor is dry. Someone left a tip.' }; } },
    ],
  },
  crate: {
    title: 'Unmarked Crate',
    text: 'A crate with no paperwork is sitting by the loading dock. It hums slightly.',
    options: () => [
      {
        label: 'Pry it open', desc: 'Pick a new weapon.',
        ok: (sc) => !sc.run.slotsFull,
        pick: () => ({ text: 'Inside: something heavy, oiled and very much not on the inventory.', next: (sc, done) => sc.pickCards({ kinds: ['weapon'], title: 'UNMARKED CRATE', subtitle: 'No paperwork. Take one.' }, done) }),
      },
      { label: 'Sell it unopened', desc: '+35 scrap.', pick: (sc) => { sc.addScrap(35); return { text: 'Sold to a man in a van. No questions asked.' }; } },
    ],
  },
  union: {
    title: 'Union Rep',
    text: 'The union wants the dummies on longer shifts. In exchange, they want the dummies to be a bit sturdier.',
    options: () => [
      { label: 'Sign the overtime deal', desc: 'Every floor gets 4 more seconds. Dummies have 10% more health.', pick: (sc) => { sc.run.timeBonus += 4; sc.run.dummyHpMult *= 1.1; return { text: 'Signed in triplicate. The clock runs a little slower now.' }; } },
      { label: 'Show them the door', desc: '+1 reroll.', pick: (sc) => { sc.run.rerolls += 1; return { text: 'They leave a pamphlet. It makes a good coaster.' }; } },
    ],
  },
  donor: {
    title: 'Anonymous Donor',
    text: 'Someone wants to fund the program. They have strong opinions about how tough the dummies should be.',
    options: () => [
      { label: 'Take the money', desc: '+60 scrap. Dummies have 15% more health.', pick: (sc) => { sc.addScrap(60); sc.run.dummyHpMult *= 1.15; return { text: 'The cheque clears. The next batch of dummies is noticeably beefier.' }; } },
      { label: 'Decline politely', desc: 'Nothing changes.', pick: () => ({ text: 'Integrity intact. Wallet unchanged.' }) },
    ],
  },
  wiring: {
    title: 'Exposed Wiring',
    text: 'A junction box behind the cell is sparking. You could put that current to use.',
    options: () => [
      {
        label: 'Rewire your gear', desc: 'Pay 25 scrap: gain Copper Wiring.', cost: 25,
        ok: (sc) => !sc.run.mods.includes('copper'),
        pick: (sc) => ({ text: giveMod(sc, 'copper') }),
      },
      { label: 'Tape it up', desc: '+10 scrap from the spare parts.', pick: (sc) => { sc.addScrap(10); return { text: 'Taped, labelled, and only slightly on fire.' }; } },
    ],
  },
  accident: {
    title: 'Lab Accident',
    text: 'Something in the machine room caught fire overnight. The traps survived. Mostly.',
    options: () => [
      {
        label: 'Salvage the machine', desc: 'Every trap type you have gains a level. A random weapon loses one.',
        ok: (sc) => sc.run.traps.length > 0,
        pick: (sc) => {
          const run = sc.run;
          for (const id of new Set(run.traps.map((t) => t.id))) run.trapLevels[id] = Math.min(5, run.trapLevels[id] + 1);
          const weapons = run.owned.filter((id) => id !== 'hands' && run.weapons[id].level > 1);
          let lost = '';
          if (weapons.length) {
            const id = sc.rng.pick(weapons);
            run.weapons[id].level -= 1;
            lost = ` Your ${WEAPONS[id].name} took the hit and dropped a level.`;
          }
          sc.rebuildMachine();
          return { text: `The machine came back stronger.${lost}` };
        },
      },
      { label: 'File a report', desc: 'Take a card pick for the paperwork.', pick: () => ({ text: 'Report filed. Compensation enclosed.', next: (sc, done) => sc.pickCards({ title: 'COMPENSATION', subtitle: 'For your trouble.' }, done) }) },
    ],
  },
  inspector: {
    title: 'Surprise Inspection',
    text: 'An inspector wants to see the paperwork, the cell and, ideally, something impressive.',
    options: () => [
      { label: 'Show them around', desc: 'Gain a random common rig mod.', pick: (sc) => ({ text: giveMod(sc, randomMod(sc, 'common')) }) },
      {
        label: 'Grease the wheels', desc: 'Pay 30 scrap: pick a rare or better rig mod.', cost: 30,
        pick: () => ({ text: 'The inspector finds everything in order, and leaves a gift.', next: (sc, done) => sc.pickMod({ boss: true, title: 'INSPECTOR’S GIFT' }, done) }),
      },
    ],
  },
  vending: {
    title: 'Vending Machine',
    text: 'The break-room vending machine has been modified to take scrap. Its glass is very dirty.',
    options: () => [
      {
        label: 'Feed it 20 scrap', desc: 'Half the time it pays out a rig mod.', cost: 20,
        pick: (sc) => (sc.rng.chance(0.5) ? { text: `Clunk. ${giveMod(sc, randomMod(sc))}` } : { text: 'It hums, flashes, and keeps the scrap.' }),
      },
      { label: 'Shake it', desc: 'Sometimes scrap falls out.', pick: (sc) => { if (sc.rng.chance(0.4)) { sc.addScrap(25); return { text: '25 scrap rattles out of the tray.' }; } return { text: 'Nothing. A warning sticker peels off.' }; } },
      { label: 'Walk away', desc: 'Nothing changes.', pick: () => ({ text: 'Probably wise.' }) },
    ],
  },
  recall: {
    title: 'Product Recall',
    text: 'A batch of dummies failed quality control. They are cheaper to test, and the paperwork takes ages.',
    options: () => [
      { label: 'Test the defects', desc: 'Dummies have 12% less health. Every floor loses 4 seconds.', pick: (sc) => { sc.run.dummyHpMult *= 0.88; sc.run.timeBonus -= 4; return { text: 'The defects arrive. They squeak.' }; } },
      { label: 'Send them back', desc: '+25 scrap refund.', pick: (sc) => { sc.addScrap(25); return { text: 'Refund issued. Mostly in scrap.' }; } },
    ],
  },
  calibration: {
    title: 'Calibration Day',
    text: 'The workshop has a free slot today. The technicians will tune anything, for a price.',
    options: () => [
      {
        label: 'Tune a weapon', desc: 'Pay 25 scrap: pick a weapon upgrade.', cost: 25,
        pick: () => ({ text: 'The workbench is yours.', next: (sc, done) => sc.pickCards({ filter: (c) => c.id.startsWith('up_'), count: 3, title: 'CALIBRATION', subtitle: 'One weapon upgrade.' }, done) }),
      },
      {
        label: 'Tune the machine', desc: 'Pay 25 scrap: pick a trap upgrade.', cost: 25,
        ok: (sc) => sc.run.traps.length > 0,
        pick: () => ({ text: 'The machine room is yours.', next: (sc, done) => sc.pickCards({ filter: (c) => c.id.startsWith('tup_'), count: 3, title: 'CALIBRATION', subtitle: 'One trap upgrade.' }, done) }),
      },
      { label: 'Skip it', desc: 'Nothing changes.', pick: () => ({ text: 'The technicians go back to their crossword.' }) },
    ],
  },
  coinToss: {
    title: 'Coin Toss',
    text: 'A technician bets you can’t call a coin toss. The stakes: half your scrap.',
    ok: (run) => run.scrap >= 10,
    options: () => [
      {
        label: 'Call heads', desc: 'Win: your scrap grows by half again. Lose: it halves.',
        pick: (sc) => {
          const run = sc.run;
          if (sc.rng.chance(0.5)) {
            const won = Math.min(100, Math.ceil(run.scrap / 2));
            sc.addScrap(won);
            return { text: `Heads. You win ${won} scrap.` };
          }
          run.scrap = Math.floor(run.scrap / 2);
          return { text: 'Tails. The technician pockets half your scrap.' };
        },
      },
      { label: 'Don’t bet', desc: 'Nothing changes.', pick: () => ({ text: 'The technician looks disappointed.' }) },
    ],
  },
  seminar: {
    title: 'Training Seminar',
    text: 'A seminar on test methodology. There are three tracks. You can attend one.',
    options: (sc) => {
      const permits = DISCIPLINE_IDS.map((t) => PERMITS[t]).filter((id) => !sc.run.mods.includes(id));
      return sc.rng.weightedSample(permits, 3, () => 1).map((id) => ({
        label: `${DISCIPLINES[MODS[id].tags[0]].name} track`, desc: `Gain ${MODS[id].name}: ${MODS[id].desc.toLowerCase()}`,
        pick: (s) => ({ text: giveMod(s, id) }),
      }));
    },
  },
};

export const INCIDENT_IDS = Object.keys(INCIDENTS);

// The options for an incident, with `ok` worked out against the run.
export function incidentOptions(sc, id) {
  return INCIDENTS[id].options(sc).map((o) => ({ ...o, available: (o.ok?.(sc) ?? true) && (sc.run.scrap >= (o.cost ?? 0)) }));
}

