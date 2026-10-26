// Pre-rendered padded-cell backdrop: quilted wall, button tufts, rubber mat.
// Drawn in screen pixels over the arena rectangle from the layout.

import { C } from './theme.js';

export function buildBackground(L, dpr) {
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(L.w * dpr));
  cv.height = Math.max(1, Math.round(L.h * dpr));
  const ctx = cv.getContext('2d');
  ctx.scale(dpr, dpr);

  const { x: left, y: top, w: aw, h: ah } = L.arena;
  const right = left + aw;
  const bottom = L.floorPx;
  const H = bottom - top;

  ctx.save();
  ctx.beginPath();
  ctx.rect(left, top, aw, H);
  ctx.clip();
  ctx.fillStyle = C.wall;
  ctx.fillRect(left, top, aw, H);

  // Quilting: two families of diagonal seams, each drawn as a dark/light pair
  // so the padding reads as puffy. Cell size follows the world scale.
  const cell = 62 * L.k;
  const seam = (offset, color, width) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    for (let k = left - H - cell; k < right + H + cell; k += cell) {
      ctx.moveTo(k + offset, top);
      ctx.lineTo(k + H + offset, bottom);
      ctx.moveTo(k + offset, top);
      ctx.lineTo(k - H + offset, bottom);
    }
    ctx.stroke();
  };
  seam(1.5, C.wallLight, 3);
  seam(0, C.wallDark, 2);

  // Button tufts sit where seams cross.
  const half = cell / 2;
  const tuft = Math.max(2.5, 3.5 * L.k);
  for (let i = -2; left + i * half < right + cell; i++) {
    for (let j = 0; j * half < H + cell; j++) {
      if ((i + j) % 2 !== 0) continue;
      const x = left + i * half;
      const y = top + j * half;
      ctx.fillStyle = C.tuft;
      ctx.beginPath();
      ctx.arc(x, y, tuft, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = C.wallLight;
      ctx.beginPath();
      ctx.arc(x - tuft * 0.3, y - tuft * 0.3, tuft * 0.35, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const cx = left + aw / 2;
  const cy = top + H / 2;
  const vignette = ctx.createRadialGradient(cx, cy, Math.min(aw, H) * 0.2, cx, cy, Math.max(aw, H) * 0.75);
  vignette.addColorStop(0, 'rgba(20,26,20,0)');
  vignette.addColorStop(1, 'rgba(20,26,20,0.38)');
  ctx.fillStyle = vignette;
  ctx.fillRect(left, top, aw, H);

  const base = ctx.createLinearGradient(0, bottom - 40, 0, bottom);
  base.addColorStop(0, 'rgba(20,26,20,0)');
  base.addColorStop(1, 'rgba(20,26,20,0.28)');
  ctx.fillStyle = base;
  ctx.fillRect(left, bottom - 40, aw, 40);
  ctx.restore();

  // Rubber floor mat with ribbing.
  const matBottom = top + ah;
  ctx.fillStyle = C.mat;
  ctx.fillRect(left, bottom, aw, matBottom - bottom);
  ctx.fillStyle = C.matEdge;
  ctx.fillRect(left, bottom, aw, 2);
  ctx.strokeStyle = 'rgba(0,0,0,0.18)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let x = left + 6; x < right; x += 10) {
    ctx.moveTo(x, bottom + 5);
    ctx.lineTo(x, matBottom - 3);
  }
  ctx.stroke();
  return cv;
}
