// Rogue-lite progress: every run that ends pays out credits, and credits buy
// permanent facility upgrades that apply when a new run starts. Only used
// with the rogue-lite setting on; the plain roguelike starts every run cold.

const KEY = 'dummy-run-meta';

// Each upgrade has a cost per level; its length is the max level.
export const UPGRADES = [
  { id: 'funding', name: 'Research Funding', desc: 'Start each run with +1 reroll.', costs: [40, 80, 140], apply: (run, lv) => { run.rerolls += lv; } },
  { id: 'overtime', name: 'Overtime Clause', desc: 'Every floor gets +3 seconds on the clock.', costs: [50, 100, 160], apply: (run, lv) => { run.timeBonus += 3 * lv; } },
  { id: 'toolkit', name: 'Calibrated Tools', desc: 'Your starting weapon begins at level 2.', costs: [90], apply: (run) => { run.toolkit = true; } },
  { id: 'prewired', name: 'Pre-Wired Cell', desc: 'Your first trap begins at level 2.', costs: [90], apply: (run) => { run.prewired = true; } },
  { id: 'shortlist', name: 'Longer Shortlist', desc: 'One more card to choose from on every pick.', costs: [180], apply: (run) => { run.choices += 1; } },
  { id: 'insurance', name: 'Insurance Policy', desc: 'Start each run with a Second Wind.', costs: [160], apply: (run) => { run.lives += 1; } },
  { id: 'salvage', name: 'Salvage Rights', desc: '+25% credits from every run.', costs: [70, 150], apply: () => {} },
];

function read() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}');
  } catch {
    return {};
  }
}

export const meta = { credits: 0, levels: {}, ...read() };

function write() {
  try {
    localStorage.setItem(KEY, JSON.stringify(meta));
  } catch {
    /* storage is optional */
  }
}

export const upgradeLevel = (id) => meta.levels[id] ?? 0;

export function upgradeCost(u) {
  return u.costs[upgradeLevel(u.id)] ?? null;
}

export function buyUpgrade(u) {
  const cost = upgradeCost(u);
  if (cost === null || meta.credits < cost) return false;
  meta.credits -= cost;
  meta.levels[u.id] = upgradeLevel(u.id) + 1;
  write();
  return true;
}

// Owned upgrades, applied to a fresh run.
export function applyUpgrades(run) {
  for (const u of UPGRADES) {
    const lv = upgradeLevel(u.id);
    if (lv) u.apply(run, lv);
  }
}

// What the run has earned so far: floors, secondaries and reactions, plus a
// bonus for finishing the series.
export function runCredits(run) {
  const t = run.totals;
  const base = t.cleared * 10 + t.bonuses * 5 + t.reactions * 2 + (run.won ? 100 : 0);
  return Math.round(base * (1 + 0.25 * upgradeLevel('salvage')));
}

// Pays out what the run earned since the last payout (a won run that keeps
// going into endless is paid at the win and again when it ends).
export function payRun(run) {
  const due = runCredits(run) - (run.paid ?? 0);
  if (due <= 0) return 0;
  run.paid = (run.paid ?? 0) + due;
  meta.credits += due;
  write();
  return due;
}
