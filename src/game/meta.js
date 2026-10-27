// Rogue-lite progress: every run that ends pays out credits, and credits buy
// nodes on the progression tree (tree.js), applied when a new run starts.
// Only used with the rogue-lite setting on; the plain roguelike starts
// every run cold. Saved in the browser.

import { TREE, node } from './tree.js';

const KEY = 'dummy-run-meta';

// What the old flat upgrade shop charged, so its purchases can be refunded.
const OLD_COSTS = { funding: [40, 80, 140], overtime: [50, 100, 160], toolkit: [90], prewired: [90], shortlist: [180], insurance: [160], salvage: [70, 150] };

function read() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}');
  } catch {
    return {};
  }
}

const saved = read();
export const meta = { credits: saved.credits ?? 0, owned: new Set((saved.owned ?? []).filter((id) => node(id))) };
meta.owned.add('start');

function write() {
  try {
    localStorage.setItem(KEY, JSON.stringify({ credits: meta.credits, owned: [...meta.owned] }));
  } catch {
    /* storage is optional */
  }
}

// The flat shop became the tree: refund what was spent there.
if (saved.levels) {
  for (const [id, lv] of Object.entries(saved.levels)) meta.credits += (OLD_COSTS[id] ?? []).slice(0, lv).reduce((a, b) => a + b, 0);
  write();
}

// owned: bought. open: next to an owned node, so it can be bought.
// hinted: next to an open node; shown only as an undiscovered marker.
// hidden: not drawn at all.
export function nodeState(id) {
  if (meta.owned.has(id)) return 'owned';
  const n = node(id);
  if (n.links.some((m) => meta.owned.has(m))) return 'open';
  if (n.links.some((m) => node(m).links.some((k) => meta.owned.has(k)))) return 'hinted';
  return 'hidden';
}

export function buyNode(id) {
  const n = node(id);
  if (nodeState(id) !== 'open' || meta.credits < n.cost) return false;
  meta.credits -= n.cost;
  meta.owned.add(id);
  write();
  return true;
}

export const ownedCount = () => meta.owned.size;
export const nodeCount = () => TREE.nodes.length;

// Owned nodes, applied to a fresh run.
export function applyTree(run) {
  for (const id of meta.owned) node(id)?.apply(run);
}

export const creditBonus = () => [...meta.owned].reduce((sum, id) => sum + (node(id)?.credits ?? 0), 0);

// What the run has earned so far: floors, secondaries and reactions, plus a
// bonus for finishing the series.
export function runCredits(run) {
  const t = run.totals;
  const base = t.cleared * 10 + t.bonuses * 5 + t.reactions * 2 + (run.won ? 100 : 0);
  return Math.round(base * (1 + creditBonus()));
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
