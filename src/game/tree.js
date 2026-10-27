// The rogue-lite progression tree: one charter node in the middle, six
// branches out in every direction, bridges between neighbouring branches,
// a keystone at the end of each branch and an outer ring of directorate
// upgrades joining the keystones.
//
// Nodes sit on rings around the charter. Each one applies to a fresh run;
// some also raise the credits every run pays (`credits`).

const RING = 96;

export const BRANCHES = [
  { id: 'funding', name: 'FUNDING', angle: -90, glyph: '$' },
  { id: 'clock', name: 'CLOCK', angle: -30, glyph: 'T' },
  { id: 'arsenal', name: 'ARSENAL', angle: 30, glyph: 'W' },
  { id: 'machine', name: 'MACHINE', angle: 90, glyph: 'M' },
  { id: 'subject', name: 'SUBJECT', angle: 150, glyph: 'S' },
  { id: 'lab', name: 'LAB', angle: 210, glyph: '+' },
];

const COST = { 1: 25, 2: 50, 3: 90, 4: 140, 5: 240, bridge: 110, outer: 380 };

// A perk granted by the tree also leaves the card pool.
const perk = (id, field) => (r) => {
  r[field] = true;
  r.cardCounts[id] = 99;
};

// Per branch: [slot, name, desc, apply, extra]. Slots: 1, 2, 3a/3b (the
// split), 4a/4b, 5 (keystone).
const BRANCH_NODES = {
  funding: [
    ['1', 'Petty Cash', 'Start each run with +1 reroll.', (r) => { r.rerolls += 1; }],
    ['2', 'Grant Application', '+15% credits from every run.', () => {}, { credits: 0.15 }],
    ['3a', 'Research Budget', 'Start each run with +1 reroll.', (r) => { r.rerolls += 1; }],
    ['3b', 'Sponsorship', '+15% credits from every run.', () => {}, { credits: 0.15 }],
    ['4a', 'Endowment', 'Start each run with +2 rerolls.', (r) => { r.rerolls += 2; }],
    ['4b', 'Venture Capital', '+25% credits from every run.', () => {}, { credits: 0.25 }],
    ['5', 'Blank Cheque', 'Every boss you beat pays out 2 rerolls.', (r) => { r.bossRerolls += 2; }],
  ],
  clock: [
    ['1', 'Overtime Clause', 'Every floor gets +3 seconds.', (r) => { r.timeBonus += 3; }],
    ['2', 'Union Break', 'Every floor gets +3 seconds.', (r) => { r.timeBonus += 3; }],
    ['3a', 'Adrenaline Clause', 'Start with Adrenaline: double damage in the last 10 seconds.', perk('adrenaline', 'adrenaline')],
    ['3b', 'Flexible Hours', 'Every floor gets +4 seconds.', (r) => { r.timeBonus += 4; }],
    ['4a', 'Combo Clause', 'Start with Combo Counter: quick hits build up to +60% damage.', perk('combo', 'combo')],
    ['4b', 'Time Dilation', 'Every floor gets +5 seconds.', (r) => { r.timeBonus += 5; }],
    ['5', 'Overclocked', '+20% damage while more than half the clock is left.', (r) => { r.overclock = true; }],
  ],
  arsenal: [
    ['1', 'Calibrated Tools', 'Your starting weapon begins at level 2.', (r) => { r.startLevel = Math.max(r.startLevel, 2); }],
    ['2', 'Sharpened', '+8% weapon damage.', (r) => { r.weaponMult *= 1.08; }],
    ['3a', 'Spare Holster', 'Pick a second starting weapon.', (r) => { r.extraStarter = true; }],
    ['3b', 'Hollow Points', '+5% critical hit chance.', (r) => { r.critChance += 0.05; }],
    ['4a', 'Heavy Gauge', '+12% weapon damage.', (r) => { r.weaponMult *= 1.12; }],
    ['4b', 'Critical Mass', 'Critical hits deal +0.5x more.', (r) => { r.critMult += 0.5; }],
    ['5', 'Master Armorer', 'Starting weapons begin at level 3.', (r) => { r.startLevel = 3; }],
  ],
  machine: [
    ['1', 'Pre-Wired Cell', 'Your first trap begins one level higher.', (r) => { r.prewired = true; }],
    ['2', 'Lubricant', '+10% trap damage.', (r) => { r.trapMult *= 1.1; }],
    ['3a', 'Second Install', 'Install a second starting trap.', (r) => { r.extraTrap = true; }],
    ['3b', 'Overvolt', '+15% trap damage.', (r) => { r.trapMult *= 1.15; }],
    ['4a', 'Chain Logic', 'Each source in a chain adds 5% more.', (r) => { r.chainStep += 0.05; }],
    ['4b', 'Hardened Mounts', 'New traps start at level 2.', (r) => { r.trapStartLevel = 2; }],
    ['5', 'Full Automation', 'Traps deal +40% damage, your weapons 15% less.', (r) => { r.trapMult *= 1.4; r.weaponMult *= 0.85; }],
  ],
  subject: [
    ['1', 'Cheap Stitching', 'Dummies have 5% less health.', (r) => { r.dummyHpMult *= 0.95; }],
    ['2', 'Brittle Seams', 'Limbs tear off 15% more easily.', (r) => { r.limbFragility *= 1.15; }],
    ['3a', 'Glass Jaw', 'Head hits deal +15% damage.', (r) => { r.headMult *= 1.15; }],
    ['3b', 'Thin Burlap', 'Dummies have 8% less health.', (r) => { r.dummyHpMult *= 0.92; }],
    ['4a', 'Hydra Sample', '+10% chance a destroyed dummy comes back as two.', (r) => { r.hydraChance += 0.1; }],
    ['4b', 'Loose Joints', 'Limbs tear off 20% more easily.', (r) => { r.limbFragility *= 1.2; }],
    ['5', 'Defective Batch', 'Destroyed dummies explode.', perk('shatter', 'shatter')],
  ],
  lab: [
    ['1', 'Field Notes', 'Status effects (burn, bleed, chill, shock) +10%.', (r) => { r.statusMult *= 1.1; }],
    ['2', 'Reaction Research', 'Reactions deal +15% damage.', (r) => { r.reactionMult *= 1.15; }],
    ['3a', 'Insurance Policy', 'Start each run with a Second Wind.', (r) => { r.lives += 1; }],
    ['3b', 'Catalyst', 'Status effects +15%.', (r) => { r.statusMult *= 1.15; }],
    ['4a', 'Longer Shortlist', 'One more card to choose from on every pick.', (r) => { r.choices += 1; }],
    ['4b', 'Chemistry Set', 'Reactions deal +25% damage.', (r) => { r.reactionMult *= 1.25; }],
    ['5', 'Chain Reaction', 'Every reaction also sets off a small blast.', perk('chainreact', 'chainReaction')],
  ],
};

// Between branch i and i + 1, at ring 3.7.
const BRIDGES = [
  ['Paid Overtime', 'Every floor gets +2 seconds, and +5% credits.', (r) => { r.timeBonus += 2; }, { credits: 0.05 }],
  ['Quick Draw', '+5% weapon damage and +2 seconds per floor.', (r) => { r.weaponMult *= 1.05; r.timeBonus += 2; }],
  ['Hybrid Rig', '+6% weapon and trap damage.', (r) => { r.weaponMult *= 1.06; r.trapMult *= 1.06; }],
  ['Stress Test', 'Wall impacts deal +10% damage.', (r) => { r.impactMult *= 1.1; }],
  ['Autopsy', 'Status effects +10%, dummies 3% less health.', (r) => { r.statusMult *= 1.1; r.dummyHpMult *= 0.97; }],
  ['Liability Waiver', '+10% credits and +1 reroll.', (r) => { r.rerolls += 1; }, { credits: 0.1 }],
];

// Between keystone i and i + 1, at ring 6.
const OUTER = [
  ['Federal Contract', '+40% credits from every run.', () => {}, { credits: 0.4 }],
  ['Bullet Time', 'Every floor gets +8 seconds, and +10% weapon damage.', (r) => { r.timeBonus += 8; r.weaponMult *= 1.1; }],
  ['Integrated Systems', '+20% weapon and trap damage.', (r) => { r.weaponMult *= 1.2; r.trapMult *= 1.2; }],
  ['Crumple Zone', 'Dummies have 15% less health and limbs tear 25% more easily.', (r) => { r.dummyHpMult *= 0.85; r.limbFragility *= 1.25; }],
  ['Second Opinion', 'One more Second Wind every run.', (r) => { r.lives += 1; }],
  ['Executive Board', 'One more card on every pick, and +2 rerolls.', (r) => { r.choices += 1; r.rerolls += 2; }],
];

const SLOT = {
  1: { ring: 1, off: 0 },
  2: { ring: 2, off: 0 },
  '3a': { ring: 3, off: -15 },
  '3b': { ring: 3, off: 15 },
  '4a': { ring: 4, off: -12 },
  '4b': { ring: 4, off: 12 },
  5: { ring: 5, off: 0 },
};

function at(angleDeg, ring) {
  const a = (angleDeg * Math.PI) / 180;
  return { x: Math.cos(a) * ring * RING, y: Math.sin(a) * ring * RING };
}

function build() {
  const nodes = [{ id: 'start', name: 'Facility Charter', desc: 'The test program itself. Everything else grows from here.', kind: 'start', cost: 0, x: 0, y: 0, apply: () => {}, links: [] }];
  const byId = new Map([['start', nodes[0]]]);
  const add = (n) => {
    n.links = [];
    nodes.push(n);
    byId.set(n.id, n);
  };
  const link = (a, b) => {
    byId.get(a).links.push(b);
    byId.get(b).links.push(a);
  };
  for (const br of BRANCHES) {
    for (const [slot, name, desc, apply, extra] of BRANCH_NODES[br.id]) {
      const s = SLOT[slot];
      add({ id: `${br.id}.${slot}`, branch: br.id, name, desc, apply, kind: slot === '5' ? 'keystone' : 'node', cost: COST[s.ring], ...at(br.angle + s.off, s.ring), ...extra });
    }
    const id = (slot) => `${br.id}.${slot}`;
    link('start', id(1));
    link(id(1), id(2));
    link(id(2), id('3a'));
    link(id(2), id('3b'));
    link(id('3a'), id('4a'));
    link(id('3b'), id('4b'));
    link(id('4a'), id(5));
    link(id('4b'), id(5));
  }
  BRANCHES.forEach((br, i) => {
    const next = BRANCHES[(i + 1) % BRANCHES.length];
    const [name, desc, apply, extra] = BRIDGES[i];
    add({ id: `bridge.${br.id}`, branch: null, name, desc, apply, kind: 'bridge', cost: COST.bridge, ...at(br.angle + 30, 3.7), ...extra });
    link(`${br.id}.3b`, `bridge.${br.id}`);
    link(`bridge.${br.id}`, `${next.id}.3a`);
    const [oname, odesc, oapply, oextra] = OUTER[i];
    add({ id: `outer.${br.id}`, branch: null, name: oname, desc: odesc, apply: oapply, kind: 'outer', cost: COST.outer, ...at(br.angle + 30, 6), ...oextra });
    link(`${br.id}.5`, `outer.${br.id}`);
    link(`outer.${br.id}`, `${next.id}.5`);
  });
  return { nodes, byId };
}

export const TREE = build();

export const node = (id) => TREE.byId.get(id);

export const branchOf = (n) => BRANCHES.find((b) => b.id === n.branch) ?? null;

// Undirected edges, each listed once.
export const EDGES = TREE.nodes.flatMap((n) => n.links.filter((m) => n.id < m).map((m) => [n.id, m]));
