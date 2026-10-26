// Screen layout. Desktop-first: wide screens get a sidebar beside the arena;
// narrower screens fall back to a top strip and a bottom weapon rack.
//
// The arena itself is simulated in world units (WORLD_H tall) and scaled to
// fit, so physics and weapon tuning feel the same on every screen.

import { clamp } from '../engine/math.js';

export const WORLD_H = 580;

export function computeLayout(w, h) {
  const wide = w >= 900 && h >= 540;
  const short = !wide && h < 540;
  const sideW = wide ? Math.round(clamp(w * 0.24, 290, 350)) : 0;
  const hudH = wide ? 0 : short ? 64 : 104;
  const barH = wide ? 0 : short ? 62 : clamp(Math.round(h * 0.11), 70, 92);
  const matH = wide ? 24 : 14;
  const arena = { x: sideW, y: hudH, w: w - sideW, h: h - hudH - barH };
  const playH = Math.max(1, arena.h - matH);
  // Very wide arenas (landscape phones) zoom in so the dummy stays readable.
  const worldH = arena.w / playH > 2 ? 400 : WORLD_H;
  const k = playH / worldH;
  return {
    mode: wide ? 'wide' : short ? 'short' : 'tall',
    w, h, sideW, hudH, barH, matH,
    barTop: h - barH,
    arena,
    floorPx: arena.y + playH,
    k,
    worldW: arena.w / k,
    worldH,
    // Where overlays center themselves: the arena on desktop, the screen otherwise.
    frame: wide ? arena : { x: 0, y: 0, w, h },
  };
}
