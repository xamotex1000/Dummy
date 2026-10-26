// Small math helpers shared by the engine and the game.

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const easeOutCubic = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
export const easeOutBack = (t) => {
  t = clamp(t, 0, 1);
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

// Closest point on segment AB to point P. `t` is the 0..1 position along AB.
export function closestOnSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1) : 0;
  return { x: ax + dx * t, y: ay + dy * t, t };
}

// Closest points between segments A0A1 and B0B1 (Ericson, Real-Time Collision Detection 5.1.9).
// Returns the distance, the parameters s (on A) and t (on B), and the closest point on B.
export function segmentDistance(a0x, a0y, a1x, a1y, b0x, b0y, b1x, b1y) {
  const d1x = a1x - a0x, d1y = a1y - a0y;
  const d2x = b1x - b0x, d2y = b1y - b0y;
  const rx = a0x - b0x, ry = a0y - b0y;
  const a = d1x * d1x + d1y * d1y;
  const e = d2x * d2x + d2y * d2y;
  const f = d2x * rx + d2y * ry;
  const EPS = 1e-8;
  let s, t;
  if (a <= EPS && e <= EPS) {
    s = 0; t = 0;
  } else if (a <= EPS) {
    s = 0; t = clamp(f / e, 0, 1);
  } else {
    const c = d1x * rx + d1y * ry;
    if (e <= EPS) {
      t = 0; s = clamp(-c / a, 0, 1);
    } else {
      const b = d1x * d2x + d1y * d2y;
      const denom = a * e - b * b;
      s = denom !== 0 ? clamp((b * f - c * e) / denom, 0, 1) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = clamp(-c / a, 0, 1); }
      else if (t > 1) { t = 1; s = clamp((b - c) / a, 0, 1); }
    }
  }
  const cax = a0x + d1x * s, cay = a0y + d1y * s;
  const cbx = b0x + d2x * t, cby = b0y + d2y * t;
  return { d: Math.hypot(cax - cbx, cay - cby), s, t, x: cbx, y: cby };
}

export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// Mix two [r,g,b] arrays and return a CSS color string.
export function mixRgb(a, b, t) {
  t = clamp(t, 0, 1);
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)},${Math.round(a[1] + (b[1] - a[1]) * t)},${Math.round(a[2] + (b[2] - a[2]) * t)})`;
}
