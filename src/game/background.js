// Pre-rendered arena backdrops, one per act: the padded cell (quilted wall,
// button tufts), the crash lab (white tiles, hazard-striped floor) and the
// furnace (riveted steel, glowing grate). Drawn in screen pixels over the
// arena rectangle from the layout.

import { C } from './theme.js';

const THEMES = {
  cell: { wall: C.wall, floor: C.mat, edge: C.matEdge, vignette: 'rgba(20,26,20,0.38)' },
  lab: { wall: '#e4e8ea', floor: '#2f3236', edge: '#f2c230', vignette: 'rgba(30,40,50,0.28)' },
  furnace: { wall: '#3a3230', floor: '#1f1a18', edge: '#ff7a1f', vignette: 'rgba(10,5,0,0.55)' },
};

export function buildBackground(L, dpr, theme = 'cell') {
  const T = THEMES[theme] ?? THEMES.cell;
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(L.w * dpr));
  cv.height = Math.max(1, Math.round(L.h * dpr));
  const ctx = cv.getContext('2d');
  ctx.scale(dpr, dpr);

  const { x: left, y: top, w: aw, h: ah } = L.arena;
  const bottom = L.floorPx;
  const H = bottom - top;

  ctx.save();
  ctx.beginPath();
  ctx.rect(left, top, aw, H);
  ctx.clip();
  ctx.fillStyle = T.wall;
  ctx.fillRect(left, top, aw, H);
  if (theme === 'lab') drawTiles(ctx, L, left, top, aw, H);
  else if (theme === 'furnace') drawPlates(ctx, L, left, top, aw, H);
  else drawQuilt(ctx, L, left, top, aw, H);

  const cx = left + aw / 2;
  const cy = top + H / 2;
  const vignette = ctx.createRadialGradient(cx, cy, Math.min(aw, H) * 0.2, cx, cy, Math.max(aw, H) * 0.75);
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, T.vignette);
  ctx.fillStyle = vignette;
  ctx.fillRect(left, top, aw, H);

  const base = ctx.createLinearGradient(0, bottom - 40, 0, bottom);
  base.addColorStop(0, 'rgba(0,0,0,0)');
  base.addColorStop(1, theme === 'furnace' ? 'rgba(255,110,30,0.25)' : 'rgba(20,26,20,0.28)');
  ctx.fillStyle = base;
  ctx.fillRect(left, bottom - 40, aw, 40);
  ctx.restore();

  // Floor.
  const matBottom = top + ah;
  ctx.fillStyle = T.floor;
  ctx.fillRect(left, bottom, aw, matBottom - bottom);
  if (theme === 'lab') {
    // Hazard stripes.
    ctx.save();
    ctx.beginPath();
    ctx.rect(left, bottom, aw, matBottom - bottom);
    ctx.clip();
    ctx.fillStyle = '#f2c230';
    for (let x = left - 40; x < left + aw + 40; x += 28) {
      ctx.beginPath();
      ctx.moveTo(x, bottom);
      ctx.lineTo(x + 14, bottom);
      ctx.lineTo(x + 14 - 20, matBottom);
      ctx.lineTo(x - 20, matBottom);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  } else {
    ctx.strokeStyle = theme === 'furnace' ? 'rgba(255,120,40,0.35)' : 'rgba(0,0,0,0.18)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = left + 6; x < left + aw; x += 10) {
      ctx.moveTo(x, bottom + 5);
      ctx.lineTo(x, matBottom - 3);
    }
    ctx.stroke();
  }
  ctx.fillStyle = T.edge;
  ctx.fillRect(left, bottom, aw, 2);
  return cv;
}

// Quilting: two families of diagonal seams, each a dark/light pair so the
// padding reads as puffy, with button tufts where they cross.
function drawQuilt(ctx, L, left, top, aw, H) {
  const right = left + aw;
  const bottom = top + H;
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
}

// Lab: square white tiles with grout lines and a measuring stripe.
function drawTiles(ctx, L, left, top, aw, H) {
  const cell = 48 * L.k;
  ctx.strokeStyle = '#c9d0d4';
  ctx.lineWidth = Math.max(1, 1.5 * L.k);
  ctx.beginPath();
  for (let x = left; x <= left + aw; x += cell) {
    ctx.moveTo(x, top);
    ctx.lineTo(x, top + H);
  }
  for (let y = top + H; y >= top; y -= cell) {
    ctx.moveTo(left, y);
    ctx.lineTo(left + aw, y);
  }
  ctx.stroke();
  // A height chart along the wall, like a crash-test backdrop.
  const y0 = top + H * 0.35;
  ctx.fillStyle = 'rgba(20,24,28,0.12)';
  ctx.fillRect(left, y0, aw, 4 * L.k);
  ctx.fillStyle = 'rgba(20,24,28,0.25)';
  for (let x = left; x < left + aw; x += cell / 2) ctx.fillRect(x, y0 - 6 * L.k, 2, 16 * L.k);
}

// Furnace: riveted steel plates.
function drawPlates(ctx, L, left, top, aw, H) {
  const pw = 150 * L.k;
  const ph = 100 * L.k;
  for (let y = top + H; y > top - ph; y -= ph) {
    const row = Math.round((top + H - y) / ph);
    for (let x = left - (row % 2) * pw * 0.5; x < left + aw; x += pw) {
      ctx.fillStyle = (row + Math.round(x / pw)) % 2 ? '#423834' : '#3a312d';
      ctx.fillRect(x + 2, y - ph + 2, pw - 4, ph - 4);
      ctx.fillStyle = '#5a4c45';
      for (const [rx, ry] of [[8, 8], [pw - 8, 8], [8, ph - 8], [pw - 8, ph - 8]]) {
        ctx.beginPath();
        ctx.arc(x + rx, y - ph + ry, Math.max(1.5, 2.5 * L.k), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}
