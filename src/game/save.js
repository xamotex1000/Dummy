// Run saves: the run is written to the browser between floors (on the act
// screen and the route choice), so a closed tab or a quit to title can pick
// up where it left off. A run that ends deletes its save.

const KEY = 'crash-test-save';
const VERSION = 1;

// `at` is where to resume: 'act' or 'route'.
export function saveRun(run, at) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ v: VERSION, at, savedAt: Date.now(), run }));
  } catch {
    /* storage is optional */
  }
}

export function loadRun() {
  try {
    const data = JSON.parse(localStorage.getItem(KEY) || 'null');
    return data?.v === VERSION && data.run ? data : null;
  } catch {
    return null;
  }
}

export function clearRun() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* storage is optional */
  }
}
