// High scores: the ten best runs, saved in the browser. A run that's won and
// carried on into endless keeps one entry, updated when it finally ends.

import { WEAPONS } from './weapons.js';

const KEY = 'crash-test-scores';
const MAX = 10;

export function runScore(run) {
  const t = run.totals;
  return t.cleared * 1000 + t.bonuses * 250 + t.reactions * 50 + t.kills * 20 + Math.round(t.damage / 10) + (run.won ? 5000 : 0);
}

export function topScores() {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

// Records the run and returns its rank (1 is best), or 0 if it didn't place.
export function recordScore(run, mode) {
  const fav = Object.entries(run.weaponDamage).sort((p, q) => q[1] - p[1])[0]?.[0];
  run.scoreId ??= `${run.seed}-${Date.now()}`;
  const entry = {
    id: run.scoreId,
    score: runScore(run),
    floor: `${run.act}-${run.floor}`,
    won: run.won,
    loop: run.loop,
    mode,
    weapon: fav ? WEAPONS[fav].name : '-',
    date: new Date().toISOString().slice(0, 10),
  };
  const list = topScores().filter((e) => e.id !== entry.id);
  list.push(entry);
  list.sort((a, b) => b.score - a.score);
  const kept = list.slice(0, MAX);
  try {
    localStorage.setItem(KEY, JSON.stringify(kept));
  } catch {
    /* storage is optional */
  }
  return kept.findIndex((e) => e.id === entry.id) + 1;
}
