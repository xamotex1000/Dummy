// Rig mods: passive upgrades for the rest of a run, from elite and boss
// rewards, the Supply Room and incidents. Each mod is a set of hooks the
// play scene calls:
//
//   mult(h)            damage multiplier for a hit (see `h` below)
//   onHit(sc, h)       after a direct hit lands (not ticks or reactions)
//   onKill(sc, d)      a dummy was destroyed
//   onSever(sc, d)     a limb came off
//   onReaction(sc)     a reaction fired
//   onRoundStart(sc)   the dummies are on their way in
//   onClear(sc)        the floor was cleared
//   beforeFail(sc)     the clock ran out; return true to keep going
//   tick(sc, dt)       every tick while playing
//   onApply(run)       once, when the mod is taken
//   status(kind)       duration multiplier for 'burn', 'shock' or 'bleed'
//   chill              multiplier on how fast parts freeze
//
// A hit `h` is { d, seg, tags, kind, sustained, weaponId, trap, status }.
// Mods with `cert` stay out of the pool until that certification is earned.

import { DISCIPLINES } from './tags.js';

const permit = (tag, name) => ({
  name, rarity: 'common', tags: [tag], permit: tag, badge: `+1 ${DISCIPLINES[tag].short}`,
  desc: `Counts as one more ${DISCIPLINES[tag].name} source.`,
  onApply: (run) => { run.tagBonus[tag] = (run.tagBonus[tag] ?? 0) + 1; },
});

export const MODS = {
  // Permits: one more source for a discipline.
  wreckingPermit: permit('blunt', 'Wrecking Permit'),
  butcherLicense: permit('blade', "Butcher's License"),
  firearmsLicense: permit('ballistic', 'Firearms License'),
  pyroPermit: permit('fire', 'Pyrotechnics Permit'),
  coldStorage: permit('cryo', 'Cold Storage License'),
  electricianTicket: permit('volt', "Electrician's Ticket"),
  demolitionPermit: permit('blast', 'Demolition Permit'),
  stuntCoordinator: permit('kinetic', 'Stunt Coordinator'),

  // ------------------------------------------------------------ common
  leadLining: {
    name: 'Lead Lining', rarity: 'common', tags: ['kinetic'], badge: 'THUD',
    desc: 'Impacts deal +40% damage.',
    mult: (h) => (h.kind === 'impact' ? 1.4 : 1),
  },
  thermite: {
    name: 'Thermite Paste', rarity: 'common', tags: ['fire'], badge: 'BURN',
    desc: 'Burning parts take +60% burn damage.',
    mult: (h) => (h.status === 'burn' ? 1.6 : 1),
  },
  nitrogen: {
    name: 'Liquid Nitrogen', rarity: 'common', tags: ['cryo'], badge: 'N2',
    desc: 'Parts freeze 50% faster.',
    chill: 1.5,
  },
  copper: {
    name: 'Copper Wiring', rarity: 'common', tags: ['volt'], badge: 'Cu',
    desc: 'Shocks last twice as long.',
    status: (kind) => (kind === 'shock' ? 2 : 1),
  },
  whetstone: {
    name: 'Whetstone', rarity: 'common', tags: ['blade'], badge: 'EDGE',
    desc: 'Blade hits deal +25%.',
    mult: (h) => (h.tags.has('blade') && !h.status ? 1.25 : 1),
  },
  weightedGloves: {
    name: 'Weighted Gloves', rarity: 'common', tags: ['blunt'], badge: 'x2',
    desc: 'Hands deal double damage.',
    mult: (h) => (h.weaponId === 'hands' ? 2 : 1),
  },
  hollowPoint: {
    name: 'Hollow-Point Rounds', rarity: 'common', tags: ['ballistic', 'blade'], badge: 'BLEED',
    desc: 'Ballistic hits make the part bleed.',
    onHit: (sc, h) => { if (h.tags.has('ballistic')) sc.addBleed(h.d, h.seg, 3, 3, h.weaponId); },
  },
  grease: {
    name: 'Machine Grease', rarity: 'common', tags: [], badge: '+20%',
    desc: 'Traps deal +20% damage.',
    mult: (h) => (h.trap ? 1.2 : 1),
  },
  stopwatch: {
    name: 'Stopwatch', rarity: 'common', tags: [], badge: '+5s',
    desc: 'Every floor gets +5 seconds.',
    onApply: (run) => { run.timeBonus += 5; },
  },
  piggyBank: {
    name: 'Piggy Bank', rarity: 'common', tags: [], badge: 'SCRAP',
    desc: '+10 scrap now, and +1 for every dummy destroyed.',
    onApply: (run) => { run.scrap += 10; },
    onKill: (sc) => { sc.addScrap(1); },
  },
  clipboard: {
    name: 'Clipboard', rarity: 'common', tags: [], badge: '+15',
    desc: 'Meeting a secondary objective pays 15 scrap.',
    onClear: (sc) => { if (sc.round.secondary.state === 'done') sc.addScrap(15); },
  },
  calibration: {
    name: 'Calibration Kit', rarity: 'common', tags: [], badge: 'CRIT',
    desc: '+8% critical hit chance.',
    onApply: (run) => { run.critChance += 0.08; },
  },
  targetPractice: {
    name: 'Target Practice', rarity: 'common', tags: [], badge: 'HEAD',
    desc: 'Head hits deal +30%.',
    mult: (h) => (h.seg.group === 'head' ? 1.3 : 1),
  },

  // -------------------------------------------------------------- rare
  accelerant: {
    name: 'Accelerant', rarity: 'rare', tags: ['blast', 'fire'], badge: 'IGNITE',
    desc: 'Explosions set every part they hit on fire.',
    onHit: (sc, h) => { if (h.kind === 'blast') sc.addBurn(h.d, h.seg, 6, 3, h.weaponId); },
  },
  coldSnap: {
    name: 'Cold Snap', rarity: 'rare', tags: ['cryo'], badge: 'x1.4',
    desc: 'Frozen parts take +40% damage from everything.',
    mult: (h) => (h.seg.frozen > 0 ? 1.4 : 1),
  },
  surgeProtector: {
    name: 'Surge Protector', rarity: 'rare', tags: ['volt'], badge: 'TRAP',
    desc: 'Traps deal +40% to shocked dummies.',
    mult: (h) => (h.trap && h.d.shockT > 0 ? 1.4 : 1),
  },
  airbag: {
    name: 'Airbag', rarity: 'rare', tags: [], badge: '+10s',
    desc: 'Once per floor, when the clock runs out, get 10 more seconds.',
    onRoundStart: (sc) => { sc.modState.airbag = true; },
    beforeFail: (sc) => {
      if (!sc.modState.airbag) return false;
      sc.modState.airbag = false;
      sc.timeLeft = 10;
      sc.hud.showHint('Airbag deployed: 10 more seconds.');
      return true;
    },
  },
  extraHolster: {
    name: 'Extra Holster', rarity: 'rare', tags: [], badge: '+1 SLOT',
    desc: 'Carry one more weapon.',
    onApply: (run) => { run.slots += 1; },
  },
  scrapMagnet: {
    name: 'Scrap Magnet', rarity: 'rare', tags: [], badge: 'x1.5',
    desc: '+50% scrap from everything.',
    onApply: (run) => { run.scrapMult += 0.5; },
  },
  crowdControl: {
    name: 'Crowd Control', rarity: 'rare', tags: [], badge: 'CROWD',
    desc: '+12% damage for every other dummy in the cell.',
    mult: (h) => 1 + 0.12 * Math.max(0, h.alive - 1),
  },
  overtimePact: {
    name: 'Overtime Pact', rarity: 'rare', tags: [], badge: '+12s',
    desc: 'Every floor gets +12 seconds, but dummies have 30% more health.',
    onApply: (run) => { run.timeBonus += 12; run.dummyHpMult *= 1.3; },
  },

  // ----------------------------------------------- unlocked by certification
  pyromaniac: {
    name: 'Pyromaniac', rarity: 'epic', tags: ['fire'], badge: 'FIRE', cert: 'pyro',
    desc: 'Every hit sets the part alight. Nothing can freeze.',
    onHit: (sc, h) => { if (sc.ready('pyro' + h.d.id + h.seg.name, 0.5)) sc.addBurn(h.d, h.seg, 4, 2.5, h.weaponId); },
    onApply: (run) => { run.noFreeze = true; },
  },
  absoluteZero: {
    name: 'Absolute Zero', rarity: 'epic', tags: ['cryo'], badge: '0 K', cert: 'cryo',
    desc: 'Every hit chills the part. Fire deals half damage.',
    onHit: (sc, h) => { sc.addChill(h.d, h.seg, 0.3, h.weaponId); },
    mult: (h) => (h.tags.has('fire') ? 0.5 : 1),
  },
  stormCell: {
    name: 'Storm Cell', rarity: 'epic', tags: ['volt'], badge: 'STORM', cert: 'volt',
    desc: 'Lightning strikes a dummy every 3 seconds.',
    tick: (sc, dt) => {
      sc.modState.storm = (sc.modState.storm ?? 0) + dt;
      if (sc.modState.storm < 3) return;
      sc.modState.storm = 0;
      const live = sc.dummies.filter((d) => d.alive);
      if (!live.length) return;
      const d = sc.rng.pick(live);
      const c = d.center();
      sc.fxArc(c.x + sc.rng.range(-40, 40), 0, c.x, c.y);
      sc.addShock(d, 'storm', d.segMap.torso);
      sc.dealDamage(d, d.segMap.torso, 10, 'storm', { x: c.x, y: c.y });
      sc.sfx.zap();
    },
  },
  assemblyLine: {
    name: 'Assembly Line', rarity: 'epic', tags: [], badge: 'x2 TRAP', cert: 'machine',
    desc: 'Traps deal double damage. Your weapons deal half.',
    mult: (h) => (h.trap ? 2 : h.kind === 'reaction' ? 1 : 0.5),
  },
  adrenalPump: {
    name: 'Adrenal Pump', rarity: 'rare', tags: ['blade'], badge: '+60%', cert: 'surgeon',
    desc: 'For 3 seconds after a limb comes off, +60% damage.',
    onSever: (sc) => { sc.modState.adrenal = sc.time + 3; },
    mult: (h, sc) => (sc.time < (sc.modState.adrenal ?? -1) ? 1.6 : 1),
  },
  shrapnel: {
    name: 'Shrapnel Casing', rarity: 'rare', tags: ['blast', 'blade'], badge: 'FRAG', cert: 'demo',
    desc: 'Explosions make every part they hit bleed.',
    onHit: (sc, h) => { if (h.kind === 'blast') sc.addBleed(h.d, h.seg, 4, 4, h.weaponId); },
  },
  blackBox: {
    name: 'Black Box', rarity: 'rare', tags: [], badge: '+1s', cert: 'chemist',
    desc: 'Reactions deal +40%, and each one adds a second to the clock.',
    mult: (h) => (h.kind === 'reaction' ? 1.4 : 1),
    onReaction: (sc) => { sc.timeLeft += 1; },
  },
  monomania: {
    name: 'Monomania', rarity: 'epic', tags: [], badge: 'ONE', cert: 'certified',
    desc: 'Your most-used weapon deals +80%. Every other weapon deals 30% less.',
    mult: (h, sc) => {
      if (h.trap || h.kind === 'reaction') return 1;
      return h.weaponId === sc.run.favoriteWeapon() ? 1.8 : 0.7;
    },
  },
  resonance: {
    name: 'Resonance', rarity: 'epic', tags: [], badge: '3 = 4', cert: 'rating5',
    desc: 'Second-tier discipline bonuses need three sources, not four.',
    onApply: (run) => { run.resonance = true; },
  },
  specialist: {
    name: 'Specialist Badge', rarity: 'rare', tags: [], badge: '+1 TOP', cert: 'specialist',
    desc: 'Your strongest discipline counts one higher.',
    onApply: (run) => { run.specialist = true; },
  },
  occupancy: {
    name: 'Maximum Occupancy', rarity: 'epic', tags: [], badge: 'x2', cert: 'generalist',
    desc: 'One more dummy comes in each floor, and every dummy has 30% less health.',
    onApply: (run) => { run.extraDummies += 1; run.dummyHpMult *= 0.7; },
  },
  glassJaw: {
    name: 'Glass Jaw Protocol', rarity: 'epic', tags: [], badge: 'x3 HEAD', cert: 'perfect',
    desc: 'Head hits deal triple damage. Everything else deals 20% less.',
    mult: (h) => (h.seg.group === 'head' ? 3 : 0.8),
  },
  domino: {
    name: 'Domino Theory', rarity: 'rare', tags: [], badge: 'STACK', cert: 'rush',
    desc: 'Each dummy destroyed adds +10% damage for the rest of the floor (up to +60%).',
    onRoundStart: (sc) => { sc.modState.domino = 0; },
    onKill: (sc) => { sc.modState.domino = Math.min(6, (sc.modState.domino ?? 0) + 1); },
    mult: (h, sc) => 1 + 0.1 * (sc.modState.domino ?? 0),
  },
  teslaGloves: {
    name: 'Tesla Gloves', rarity: 'rare', tags: ['volt', 'blunt'], badge: 'ZAP', cert: 'handsOnly',
    desc: 'Blunt hits shock the dummy.',
    onHit: (sc, h) => { if (h.tags.has('blunt') && sc.ready('tg' + h.d.id, 1.5)) sc.addShock(h.d, h.weaponId, h.seg); },
  },
  overclockedMachine: {
    name: 'Overclocked Machine', rarity: 'rare', tags: [], badge: '+4%/T', cert: 'collector',
    desc: '+4% damage for every trap installed.',
    mult: (h, sc) => 1 + 0.04 * sc.run.traps.length,
  },
  electromagnet: {
    name: 'Electromagnet', rarity: 'rare', tags: ['volt', 'ballistic'], badge: 'MAG', cert: 'bigshot',
    desc: 'Shocked dummies take +40% ballistic damage.',
    mult: (h) => (h.tags.has('ballistic') && h.d.shockT > 0 ? 1.4 : 1),
  },
};

export const MOD_IDS = Object.keys(MODS);

// The permit mod for each discipline.
export const PERMITS = Object.fromEntries(MOD_IDS.filter((id) => MODS[id].permit).map((id) => [MODS[id].permit, id]));

const WEIGHT = {
  normal: { common: 60, rare: 32, epic: 8 },
  boss: { common: 0, rare: 65, epic: 35 },
};

// Mods a run could be offered: not owned, and unlocked.
export function modPool(run, certs) {
  return MOD_IDS.filter((id) => !run.mods.includes(id) && (!MODS[id].cert || certs.has(MODS[id].cert)));
}

export function modCard(id) {
  const m = MODS[id];
  return {
    id: 'mod_' + id, kind: 'mod', mod: id, rarity: m.rarity, name: m.name, desc: m.desc, badge: m.badge, tags: m.tags,
    apply: (run) => addMod(run, id),
  };
}

export function modOffer(run, rng, certs, { count = 3, boss = false } = {}) {
  const w = boss ? WEIGHT.boss : WEIGHT.normal;
  let pool = modPool(run, certs);
  if (boss && pool.some((id) => MODS[id].rarity !== 'common')) pool = pool.filter((id) => MODS[id].rarity !== 'common');
  return rng.weightedSample(pool, count, (id) => w[MODS[id].rarity] || 1).map(modCard);
}

export function addMod(run, id) {
  if (run.mods.includes(id)) return;
  run.mods.push(id);
  MODS[id].onApply?.(run);
}
