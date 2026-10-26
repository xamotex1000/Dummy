// Pre-rendered padded-cell backdrop: quilted wall, button tufts, rubber mat.

import { C } from './theme.js';

export function buildBackground(w, h, L, dpr) {
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(w * dpr));
  cv.height = Math.max(1, Math.round(h * dpr));
  const ctx = cv.getContext('2d');
  ctx.scale(dpr, dpr);

  const top = L.arenaTop;
  const bottom = L.floorY;
  ctx.fillStyle = C.wall;
  ctx.fillRect(0, 0, w, bottom);

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, top, w, bottom - top);
  ctx.clip();

  // Quilting: two families of diagonal seams, each drawn as a dark/light pair
  // so the padding reads as puffy.
  const cell = Math.max(48, Math.min(72, w / 6));
  const H = bottom - top;
  const seam = (offset, color, width) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    for (let k = -H - cell; k < w + H + cell; k += cell) {
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
  for (let i = -2; i * half < w + cell; i++) {
    for (let j = 0; j * half < H + cell; j++) {
      if ((i + j) % 2 !== 0) continue;
      const x = i * half;
      const y = top + j * half;
      ctx.fillStyle = C.tuft;
      ctx.beginPath();
      ctx.arc(x, y, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = C.wallLight;
      ctx.beginPath();
      ctx.arc(x - 1, y - 1, 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const vignette = ctx.createRadialGradient(w / 2, (top + bottom) / 2, Math.min(w, H) * 0.2, w / 2, (top + bottom) / 2, Math.max(w, H) * 0.75);
  vignette.addColorStop(0, 'rgba(20,26,20,0)');
  vignette.addColorStop(1, 'rgba(20,26,20,0.38)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, top, w, H);

  const base = ctx.createLinearGradient(0, bottom - 40, 0, bottom);
  base.addColorStop(0, 'rgba(20,26,20,0)');
  base.addColorStop(1, 'rgba(20,26,20,0.28)');
  ctx.fillStyle = base;
  ctx.fillRect(0, bottom - 40, w, 40);
  ctx.restore();

  // Rubber floor mat with ribbing.
  ctx.fillStyle = C.mat;
  ctx.fillRect(0, bottom, w, L.barTop - bottom);
  ctx.fillStyle = C.matEdge;
  ctx.fillRect(0, bottom, w, 2);
  ctx.strokeStyle = 'rgba(0,0,0,0.18)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let x = 6; x < w; x += 10) {
    ctx.moveTo(x, bottom + 5);
    ctx.lineTo(x, L.barTop - 3);
  }
  ctx.stroke();
  return cv;
}
