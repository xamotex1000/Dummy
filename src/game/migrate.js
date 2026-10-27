// The game used to be called Dummy Run and kept its saved data under
// `dummy-run-*` keys. Copy anything there to the `crash-test-*` keys once,
// before the modules that read them load, so progress carries over.

const KEYS = ['settings', 'meta', 'save', 'scores', 'reactions', 'best', 'wins'];

try {
  for (const k of KEYS) {
    const old = localStorage.getItem(`dummy-run-${k}`);
    if (old !== null && localStorage.getItem(`crash-test-${k}`) === null) localStorage.setItem(`crash-test-${k}`, old);
    localStorage.removeItem(`dummy-run-${k}`);
  }
} catch {
  /* storage is optional */
}
