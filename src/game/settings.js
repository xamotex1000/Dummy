// Player settings, kept between sessions. Storage is optional: without it
// the defaults hold for the session.

const KEY = 'crash-test-settings';

const DEFAULTS = {
  // Blood that splashes and stains the cell. Off swaps it for foam and plastic.
  gore: true,
  // Credits from every run buy permanent facility upgrades.
  rogueLite: false,
};

function read() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}');
  } catch {
    return {};
  }
}

export const settings = { ...DEFAULTS, ...read() };

export function setSetting(key, value) {
  settings[key] = value;
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* storage is optional */
  }
}
