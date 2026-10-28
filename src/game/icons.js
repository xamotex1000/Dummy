// Vector weapon icons, drawn in a 100x100 box centered on (0,0).

import { roundRectPath } from '../engine/renderer.js';
import { C } from './theme.js';

export function drawWeaponIcon(ctx, id, x, y, size, { angle = 0, closed = false, alpha = 1 } = {}) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(size / 100, size / 100);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.lineWidth = 6;
  ctx.strokeStyle = C.ink;
  const fillStroke = (fill) => {
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.stroke();
  };

  switch (id) {
    case 'hands':
      if (closed) {
        roundRectPath(ctx, -28, -22, 56, 48, 16);
        fillStroke(C.paper);
        ctx.beginPath();
        for (const fx of [-14, 0, 14]) {
          ctx.moveTo(fx, -22);
          ctx.lineTo(fx, -6);
        }
        ctx.stroke();
        roundRectPath(ctx, -30, 0, 36, 14, 7);
        fillStroke(C.paper);
      } else {
        const fingers = [[-24, 30], [-11, 38], [2, 36], [15, 28]];
        for (const [fx, h] of fingers) {
          roundRectPath(ctx, fx, -h + 2, 12, h + 8, 6);
          fillStroke(C.paper);
        }
        ctx.save();
        ctx.translate(-26, 10);
        ctx.rotate(-0.7);
        roundRectPath(ctx, -18, -6, 26, 13, 6);
        fillStroke(C.paper);
        ctx.restore();
        roundRectPath(ctx, -26, -4, 54, 40, 14);
        fillStroke(C.paper);
      }
      break;

    case 'bat':
      ctx.rotate(-Math.PI / 4);
      ctx.beginPath();
      ctx.moveTo(-44, -4);
      ctx.lineTo(-8, -6);
      ctx.lineTo(38, -12);
      ctx.arc(38, 0, 12, -Math.PI / 2, Math.PI / 2);
      ctx.lineTo(-8, 6);
      ctx.lineTo(-44, 4);
      ctx.closePath();
      fillStroke(C.wood);
      ctx.beginPath();
      ctx.arc(-46, 0, 7, 0, Math.PI * 2);
      fillStroke(C.wood);
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(60,30,10,0.45)';
      ctx.beginPath();
      ctx.moveTo(0, -2);
      ctx.lineTo(34, -5);
      ctx.stroke();
      break;

    case 'sledge':
      ctx.rotate(-Math.PI / 4);
      roundRectPath(ctx, -48, -5, 78, 10, 4);
      fillStroke(C.wood);
      roundRectPath(ctx, 22, -24, 28, 48, 4);
      fillStroke(C.iron);
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.beginPath();
      ctx.moveTo(28, -18);
      ctx.lineTo(28, 18);
      ctx.stroke();
      break;

    case 'shotgun':
      ctx.rotate(-0.2);
      roundRectPath(ctx, -14, -20, 64, 9, 3);
      fillStroke(C.iron);
      roundRectPath(ctx, -14, -11, 56, 8, 3);
      fillStroke(C.iron);
      roundRectPath(ctx, 8, -6, 24, 9, 3);
      fillStroke('#7a4a2a');
      ctx.beginPath();
      ctx.moveTo(-14, -20);
      ctx.lineTo(-50, -10);
      ctx.lineTo(-50, 12);
      ctx.lineTo(-14, -3);
      ctx.closePath();
      fillStroke('#7a4a2a');
      break;

    case 'knife':
      ctx.rotate(-Math.PI / 4);
      ctx.beginPath();
      ctx.moveTo(-2, -9);
      ctx.lineTo(52, -9);
      ctx.quadraticCurveTo(30, 12, -2, 9);
      ctx.closePath();
      fillStroke(C.steel);
      roundRectPath(ctx, -42, -8, 40, 16, 5);
      fillStroke('#3a2a20');
      ctx.fillStyle = C.paperDim;
      for (const rx of [-30, -14]) {
        ctx.beginPath();
        ctx.arc(rx, 0, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      break;

    case 'pistol':
      ctx.rotate(-0.15);
      roundRectPath(ctx, -38, -26, 76, 22, 5);
      fillStroke(C.iron);
      ctx.beginPath();
      ctx.moveTo(-34, -6);
      ctx.lineTo(-10, -6);
      ctx.lineTo(-4, 34);
      ctx.lineTo(-28, 34);
      ctx.closePath();
      fillStroke('#3d3229');
      ctx.beginPath();
      ctx.arc(2, 2, 10, 0, Math.PI);
      ctx.stroke();
      break;

    case 'grenade':
      ctx.beginPath();
      ctx.ellipse(0, 10, 27, 31, 0, 0, Math.PI * 2);
      fillStroke(C.olive);
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(20,30,10,0.55)';
      ctx.beginPath();
      ctx.moveTo(-27, 10);
      ctx.lineTo(27, 10);
      ctx.moveTo(0, -20);
      ctx.lineTo(0, 40);
      ctx.stroke();
      ctx.lineWidth = 6;
      ctx.strokeStyle = C.ink;
      roundRectPath(ctx, -10, -32, 20, 13, 3);
      fillStroke('#9aa0a6');
      ctx.beginPath();
      ctx.moveTo(8, -28);
      ctx.quadraticCurveTo(26, -24, 22, 8);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(-18, -32, 8, 0, Math.PI * 2);
      ctx.stroke();
      break;

    case 'flame': {
      const flame = (s, fill) => {
        ctx.beginPath();
        ctx.moveTo(0, -48 * s);
        ctx.quadraticCurveTo(36 * s, -6 * s, 30 * s, 20 * s);
        ctx.quadraticCurveTo(22 * s, 46 * s, 0, 46 * s);
        ctx.quadraticCurveTo(-22 * s, 46 * s, -30 * s, 20 * s);
        ctx.quadraticCurveTo(-34 * s, -4 * s, -12 * s, -20 * s);
        ctx.quadraticCurveTo(-4 * s, -6 * s, 0, -48 * s);
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();
      };
      flame(1, C.fire);
      ctx.stroke();
      ctx.save();
      ctx.translate(0, 14);
      flame(0.55, C.gold);
      ctx.restore();
      break;
    }

    case 'chainsaw':
      ctx.rotate(-0.4);
      roundRectPath(ctx, -2, -9, 50, 18, 9);
      fillStroke(C.steel);
      ctx.fillStyle = C.ink;
      for (let x = 4; x < 46; x += 7) {
        ctx.beginPath();
        ctx.moveTo(x, -9);
        ctx.lineTo(x + 3, -14);
        ctx.lineTo(x + 6, -9);
        ctx.fill();
      }
      roundRectPath(ctx, -44, -18, 44, 34, 8);
      fillStroke('#e8862a');
      ctx.beginPath();
      ctx.arc(-26, -18, 12, Math.PI, 0);
      ctx.stroke();
      break;

    case 'nailgun':
      roundRectPath(ctx, -40, -26, 74, 24, 6);
      fillStroke('#e7b931');
      roundRectPath(ctx, 30, -20, 12, 12, 3);
      fillStroke(C.iron);
      ctx.beginPath();
      ctx.moveTo(-30, -2);
      ctx.lineTo(-8, -2);
      ctx.lineTo(-4, 34);
      ctx.lineTo(-26, 34);
      ctx.closePath();
      fillStroke(C.ink);
      roundRectPath(ctx, 0, -2, 30, 10, 3);
      fillStroke(C.paperDim);
      break;

    case 'taser':
      roundRectPath(ctx, -38, -16, 62, 26, 8);
      fillStroke('#e7d431');
      ctx.fillStyle = C.ink;
      ctx.fillRect(-30, -10, 10, 14);
      ctx.beginPath();
      ctx.moveTo(-28, 10);
      ctx.lineTo(-10, 10);
      ctx.lineTo(-8, 36);
      ctx.lineTo(-26, 36);
      ctx.closePath();
      fillStroke(C.ink);
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(24, -9);
      ctx.lineTo(42, -9);
      ctx.moveTo(24, 3);
      ctx.lineTo(42, 3);
      ctx.stroke();
      ctx.strokeStyle = C.volt;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(44, -10);
      ctx.lineTo(38, -3);
      ctx.lineTo(46, -1);
      ctx.lineTo(40, 6);
      ctx.stroke();
      break;

    case 'freeze':
      roundRectPath(ctx, -40, -24, 64, 26, 10);
      fillStroke('#e9f3f7');
      ctx.strokeStyle = C.ice;
      ctx.lineWidth = 5;
      for (const x of [-24, -12, 0]) {
        ctx.beginPath();
        ctx.moveTo(x, -24);
        ctx.lineTo(x, 2);
        ctx.stroke();
      }
      ctx.strokeStyle = C.ink;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(24, -20);
      ctx.lineTo(44, -28);
      ctx.lineTo(44, 6);
      ctx.lineTo(24, -2);
      ctx.closePath();
      fillStroke(C.ice);
      ctx.beginPath();
      ctx.moveTo(-30, 2);
      ctx.lineTo(-10, 2);
      ctx.lineTo(-6, 34);
      ctx.lineTo(-26, 34);
      ctx.closePath();
      fillStroke(C.iron);
      break;

    case 'rocket':
      ctx.rotate(-0.3);
      roundRectPath(ctx, -46, -14, 84, 24, 6);
      fillStroke('#6f7d55');
      ctx.beginPath();
      ctx.moveTo(38, -10);
      ctx.lineTo(50, -2);
      ctx.lineTo(38, 6);
      ctx.closePath();
      fillStroke(C.bad);
      ctx.beginPath();
      ctx.moveTo(-10, 10);
      ctx.lineTo(4, 10);
      ctx.lineTo(6, 32);
      ctx.lineTo(-8, 32);
      ctx.closePath();
      fillStroke(C.ink);
      break;

    case 'vortex':
      ctx.beginPath();
      ctx.arc(0, 0, 30, 0, Math.PI * 2);
      fillStroke('#3b2257');
      ctx.strokeStyle = C.vortex;
      ctx.lineWidth = 6;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(0, 0, 8 + i * 7, i * 2.1, i * 2.1 + 3.4);
        ctx.stroke();
      }
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, 4, 0, Math.PI * 2);
      ctx.fill();
      break;

    case 'anvil':
      ctx.beginPath();
      ctx.moveTo(-50, -22);
      ctx.quadraticCurveTo(-30, -6, -14, -6);
      ctx.lineTo(-14, 6);
      ctx.lineTo(-28, 28);
      ctx.lineTo(32, 28);
      ctx.lineTo(18, 6);
      ctx.lineTo(18, -6);
      ctx.lineTo(42, -6);
      ctx.lineTo(42, -24);
      ctx.lineTo(-36, -24);
      ctx.closePath();
      fillStroke(C.iron);
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath();
      ctx.moveTo(-30, -19);
      ctx.lineTo(36, -19);
      ctx.stroke();
      break;
  }
  ctx.restore();
}

// Held weapons are drawn in a local frame whose origin is the grip: +x runs
// along the weapon, and guns flip vertically when pointing left so they stay
// upright. Units are world units.
export const HELD_FLIPS = { pistol: true, shotgun: true, flame: true, chainsaw: true, nailgun: true, taser: true, freeze: true, rocket: true };

export function drawHeldWeapon(ctx, id, held, { flash = 0 } = {}) {
  ctx.save();
  ctx.translate(held.x, held.y);
  ctx.rotate(held.angle);
  if (HELD_FLIPS[id] && Math.cos(held.angle) < 0) ctx.scale(1, -1);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = C.ink;
  const fillStroke = (fill) => {
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.stroke();
  };

  switch (id) {
    case 'bat':
      ctx.beginPath();
      ctx.moveTo(-2, -3.5);
      ctx.lineTo(28, -4.5);
      ctx.lineTo(84, -10);
      ctx.arc(84, 0, 10, -Math.PI / 2, Math.PI / 2);
      ctx.lineTo(28, 4.5);
      ctx.lineTo(-2, 3.5);
      ctx.closePath();
      fillStroke(C.wood);
      ctx.beginPath();
      ctx.arc(-5, 0, 5.5, 0, Math.PI * 2);
      fillStroke(C.wood);
      ctx.strokeStyle = 'rgba(60,30,10,0.4)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(34, -2);
      ctx.lineTo(82, -5);
      ctx.moveTo(40, 3);
      ctx.lineTo(78, 5);
      ctx.stroke();
      break;

    case 'sledge':
      roundRectPath(ctx, -6, -3.5, 92, 7, 3);
      fillStroke(C.wood);
      roundRectPath(ctx, -4, -4.5, 22, 9, 3);
      fillStroke('#2b2b2b');
      roundRectPath(ctx, 84, -15, 26, 30, 3);
      fillStroke(C.iron);
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(88, -12, 3, 24);
      break;

    case 'shotgun':
      ctx.beginPath();
      ctx.moveTo(-5, -5);
      ctx.lineTo(5, -5);
      ctx.lineTo(8, 14);
      ctx.lineTo(-3, 14);
      ctx.closePath();
      fillStroke('#7a4a2a');
      ctx.beginPath();
      ctx.moveTo(-4, -12);
      ctx.lineTo(-26, -6);
      ctx.lineTo(-26, 4);
      ctx.lineTo(-2, -2);
      ctx.closePath();
      fillStroke('#7a4a2a');
      roundRectPath(ctx, -6, -14, 76, 5, 2);
      fillStroke(C.iron);
      roundRectPath(ctx, -6, -9, 64, 5, 2);
      fillStroke(C.iron);
      roundRectPath(ctx, 24, -5, 24, 6, 2);
      fillStroke('#7a4a2a');
      break;

    case 'knife':
      ctx.beginPath();
      ctx.moveTo(14, -4);
      ctx.lineTo(42, -4);
      ctx.quadraticCurveTo(48, -3.5, 49, -2);
      ctx.quadraticCurveTo(34, 6, 14, 4.5);
      ctx.closePath();
      fillStroke(C.steel);
      roundRectPath(ctx, 10, -7, 4, 14, 1.5);
      fillStroke(C.iron);
      roundRectPath(ctx, -12, -4.5, 22, 9, 3);
      fillStroke('#3a2a20');
      break;

    case 'pistol':
      ctx.beginPath();
      ctx.moveTo(-5, -5);
      ctx.lineTo(5, -5);
      ctx.lineTo(9, 14);
      ctx.lineTo(-3, 14);
      ctx.closePath();
      fillStroke('#3d3229');
      ctx.beginPath();
      ctx.arc(10, -2, 5, 0, Math.PI);
      ctx.stroke();
      roundRectPath(ctx, -8, -15, 42, 10, 2);
      fillStroke(C.iron);
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(-4, -13, 34, 2);
      break;

    case 'flame':
      roundRectPath(ctx, -14, 3, 24, 12, 6);
      fillStroke(C.bad);
      ctx.beginPath();
      ctx.moveTo(-3, -2);
      ctx.lineTo(5, -2);
      ctx.lineTo(7, 12);
      ctx.lineTo(-1, 12);
      ctx.closePath();
      fillStroke('#3d3229');
      roundRectPath(ctx, -10, -10, 38, 11, 4);
      fillStroke(C.iron);
      roundRectPath(ctx, 26, -7, 31, 6, 2);
      fillStroke(C.steel);
      // Pilot light.
      ctx.fillStyle = flash > 0 ? C.gold : C.fire;
      ctx.beginPath();
      ctx.arc(59, -4, 2.5 + Math.random() * 1.2, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'chainsaw':
      roundRectPath(ctx, 18, -5, 56, 10, 5);
      fillStroke(C.steel);
      ctx.fillStyle = C.ink;
      for (let x = 22; x < 72; x += 6) {
        ctx.beginPath();
        ctx.moveTo(x, -5);
        ctx.lineTo(x + 2.5, -8.5);
        ctx.lineTo(x + 5, -5);
        ctx.moveTo(x, 5);
        ctx.lineTo(x + 2.5, 8.5);
        ctx.lineTo(x + 5, 5);
        ctx.fill();
      }
      roundRectPath(ctx, -8, -14, 28, 24, 6);
      fillStroke('#e8862a');
      ctx.beginPath();
      ctx.moveTo(-4, -14);
      ctx.quadraticCurveTo(6, -26, 16, -14);
      ctx.stroke();
      break;

    case 'nailgun':
      roundRectPath(ctx, -10, -17, 46, 14, 4);
      fillStroke('#e7b931');
      roundRectPath(ctx, 34, -12, 6, 6, 1.5);
      fillStroke(C.iron);
      roundRectPath(ctx, 10, -4, 22, 6, 2);
      fillStroke(C.paperDim);
      ctx.beginPath();
      ctx.moveTo(-5, -4);
      ctx.lineTo(5, -4);
      ctx.lineTo(8, 14);
      ctx.lineTo(-3, 14);
      ctx.closePath();
      fillStroke(C.ink);
      break;

    case 'taser':
      roundRectPath(ctx, -6, -10, 40, 12, 4);
      fillStroke('#e7d431');
      ctx.beginPath();
      ctx.moveTo(-4, 0);
      ctx.lineTo(5, 0);
      ctx.lineTo(7, 14);
      ctx.lineTo(-2, 14);
      ctx.closePath();
      fillStroke(C.ink);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(34, -7);
      ctx.lineTo(42, -7);
      ctx.moveTo(34, 1);
      ctx.lineTo(42, 1);
      ctx.stroke();
      if (flash > 0) {
        ctx.strokeStyle = C.volt;
        ctx.beginPath();
        ctx.moveTo(43, -8);
        ctx.lineTo(40, -3);
        ctx.lineTo(44, -2);
        ctx.lineTo(41, 2);
        ctx.stroke();
      }
      break;

    case 'freeze':
      roundRectPath(ctx, -8, -16, 42, 14, 6);
      fillStroke('#e9f3f7');
      ctx.fillStyle = C.ice;
      for (const x of [2, 10, 18]) ctx.fillRect(x, -16, 3, 14);
      ctx.beginPath();
      ctx.moveTo(34, -14);
      ctx.lineTo(50, -18);
      ctx.lineTo(50, 0);
      ctx.lineTo(34, -4);
      ctx.closePath();
      fillStroke(C.ice);
      ctx.beginPath();
      ctx.moveTo(-5, -3);
      ctx.lineTo(5, -3);
      ctx.lineTo(8, 14);
      ctx.lineTo(-3, 14);
      ctx.closePath();
      fillStroke(C.iron);
      break;

    case 'rocket':
      roundRectPath(ctx, -24, -18, 90, 16, 4);
      fillStroke('#6f7d55');
      ctx.fillStyle = C.ink;
      ctx.fillRect(60, -18, 6, 16);
      ctx.fillRect(-24, -18, 5, 16);
      ctx.beginPath();
      ctx.moveTo(-4, -3);
      ctx.lineTo(6, -3);
      ctx.lineTo(8, 14);
      ctx.lineTo(-2, 14);
      ctx.closePath();
      fillStroke(C.ink);
      break;
  }

  // The gloved fist wrapped around the grip.
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = C.ink;
  roundRectPath(ctx, -7, -8, 14, 16, 6);
  ctx.fillStyle = C.paper;
  ctx.fill();
  ctx.stroke();
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (const fx of [-2.5, 2.5]) {
    ctx.moveTo(fx, -8);
    ctx.lineTo(fx, -3);
  }
  ctx.stroke();
  ctx.restore();
}

// The yellow-and-black quadrant marker taped to crash test dummies.
export function drawTarget(ctx, x, y, r, { alpha = 1 } = {}) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  const Q = Math.PI / 2;
  for (let q = 0; q < 4; q++) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.arc(x, y, r, (q - 1) * Q, q * Q);
    ctx.closePath();
    ctx.fillStyle = q % 2 ? C.ctYellow : C.formInk;
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.lineWidth = Math.max(1, r * 0.12);
  ctx.strokeStyle = C.formInk;
  ctx.stroke();
  ctx.restore();
}
