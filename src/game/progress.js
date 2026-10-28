// Long-term goals that apply in every mode: the Safety Rating ladder (win at
// a rating to unlock the next) and certifications, achievements that each
// unlock a rig mod into the pool. Saved in the browser.

const KEY = 'crash-test-progress';

export const MAX_RATING = 10;

// Each rating adds its rule on top of the ones below it.
export const RATINGS = [
  { name: 'Standard', desc: 'The test as designed.' },
  { name: 'Rating 1', desc: 'Dummies have 10% more health.' },
  { name: 'Rating 2', desc: 'Elites come with two affixes.' },
  { name: 'Rating 3', desc: 'A third of ordinary dummies come with an affix.' },
  { name: 'Rating 4', desc: 'Every floor is 4 seconds shorter.' },
  { name: 'Rating 5', desc: 'Bosses get an affix and 20% more health.' },
  { name: 'Rating 6', desc: 'Supply Room prices are 30% higher.' },
  { name: 'Rating 7', desc: 'Card picks show one card fewer.' },
  { name: 'Rating 8', desc: 'Dummies repair themselves when left alone.' },
  { name: 'Rating 9', desc: 'No Second Winds.' },
  { name: 'Rating 10', desc: 'Every floor has a crate twist.' },
];

// What each certification asks for, and the mod it unlocks (see mods.js).
export const CERTS = {
  pyro: { name: 'Pyrotechnician', desc: 'Deal 1,500 fire damage in one run.', mod: 'pyromaniac' },
  cryo: { name: 'Cryogenicist', desc: 'Shatter 10 frozen parts in one run.', mod: 'absoluteZero' },
  volt: { name: 'Electrician', desc: 'Shock dummies 40 times in one run.', mod: 'stormCell' },
  machine: { name: 'Automation Engineer', desc: 'Have your traps deal 3,000 damage in one run.', mod: 'assemblyLine' },
  surgeon: { name: 'Surgeon', desc: 'Tear off 25 limbs in one run.', mod: 'adrenalPump' },
  demo: { name: 'Demolitionist', desc: 'Destroy 3 dummies with a single explosion.', mod: 'shrapnel' },
  chemist: { name: 'Chemist', desc: 'Discover all 8 reactions.', mod: 'blackBox' },
  certified: { name: 'Certified', desc: 'Win a run.', mod: 'monomania' },
  rating5: { name: 'Safety Inspector', desc: 'Win a run at Safety Rating 5 or higher.', mod: 'resonance' },
  specialist: { name: 'Specialist', desc: 'Reach the second tier in any discipline.', mod: 'specialist' },
  generalist: { name: 'Generalist', desc: 'Have 6 different disciplines in play.', mod: 'occupancy' },
  perfect: { name: 'Perfect Act', desc: 'Meet every secondary objective in an act.', mod: 'glassJaw' },
  rush: { name: 'Rush Job', desc: 'Clear a floor in under 10 seconds.', mod: 'domino' },
  handsOnly: { name: 'Bare Knuckles', desc: 'Beat a boss with only Hands and traps.', mod: 'teslaGloves' },
  collector: { name: 'Collector', desc: 'Own 8 rig mods in one run.', mod: 'overclockedMachine' },
  bigshot: { name: 'Big Shot', desc: 'Land a single hit of 150 damage or more.', mod: 'electromagnet' },
};

export const CERT_IDS = Object.keys(CERTS);

function read() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}');
  } catch {
    return {};
  }
}

const saved = read();
export const progress = {
  maxRating: saved.maxRating ?? 0,
  rating: saved.rating ?? 0,
  certs: new Set((saved.certs ?? []).filter((id) => CERTS[id])),
  daily: saved.daily ?? {},
};

function write() {
  try {
    localStorage.setItem(KEY, JSON.stringify({ maxRating: progress.maxRating, rating: progress.rating, certs: [...progress.certs], daily: progress.daily }));
  } catch {
    /* storage is optional */
  }
}

export function setRating(r) {
  progress.rating = Math.max(0, Math.min(progress.maxRating, r));
  write();
}

// A win at `rating` opens the next one.
export function unlockRating(rating) {
  if (rating + 1 > progress.maxRating && rating < MAX_RATING) {
    progress.maxRating = rating + 1;
    write();
    return true;
  }
  return false;
}

// Returns true the first time a certification is earned.
export function earnCert(id) {
  if (progress.certs.has(id)) return false;
  progress.certs.add(id);
  write();
  return true;
}

// The best daily score per date.
export function recordDaily(date, score) {
  if ((progress.daily[date] ?? 0) >= score) return false;
  progress.daily[date] = score;
  write();
  return true;
}
