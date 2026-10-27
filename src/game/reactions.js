// Reactions: what happens when two effects meet on the same dummy. The list
// doubles as the codex in the pause menu; discovered ones are remembered in
// this browser.

export const REACTIONS = {
  shatter: { name: 'Shatter', color: '#a8e6ff', hint: 'Freeze a part, then hit it with something blunt.', desc: 'Blunt hits on a frozen part deal triple damage, and frozen limbs snap off.' },
  steam: { name: 'Steam Burst', color: '#f4f7f8', hint: 'Fire meets ice.', desc: 'Burning a frozen part (or freezing a burning one) bursts into scalding steam.' },
  overload: { name: 'Overload', color: '#ffe66b', hint: 'Electricity and fire.', desc: 'Shocking a burning part blows it up.' },
  conductor: { name: 'Conductor', color: '#7cf7ff', hint: 'Metal carries current.', desc: 'Shocking a nailed dummy arcs through every nail.' },
  superconduct: { name: 'Superconduct', color: '#c7b8ff', hint: 'Cold makes current travel further.', desc: 'Shocking a frozen part sends the charge to every dummy.' },
  singularity: { name: 'Singularity', color: '#d48bff', hint: 'Give a vortex something to swallow.', desc: 'An explosion inside a vortex collapses it violently.' },
  tearaway: { name: 'Tear Away', color: '#ff8a8a', hint: 'Pin it down, then pull.', desc: 'A nailed limb pulled hard enough rips clean off.' },
  inferno: { name: 'Inferno', color: '#ff9b3d', hint: 'Fire plus a blast.', desc: 'Explosions on a burning dummy set everything nearby alight.' },
};

export const REACTION_IDS = Object.keys(REACTIONS);

const KEY = 'crash-test-reactions';

export function loadDiscovered() {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || '[]');
    return new Set(Array.isArray(list) ? list.filter((id) => REACTIONS[id]) : []);
  } catch {
    return new Set();
  }
}

export function saveDiscovered(set) {
  try {
    localStorage.setItem(KEY, JSON.stringify([...set]));
  } catch {
    /* storage is optional */
  }
}

// Whether this arsenal can trigger at least one reaction.
export function reactionsPossible(run) {
  const has = (id) => !!run.weapons[id];
  const burn = has('flame') || run.level('rocket') >= 2;
  const blast = has('grenade') || has('rocket');
  return (
    has('freeze') || has('nailgun') ||
    (has('taser') && (burn || has('freeze') || has('nailgun'))) ||
    (has('vortex') && blast) ||
    (burn && blast)
  );
}
