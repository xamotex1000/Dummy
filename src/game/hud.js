// Top work-order strip (round, timer, objectives) and the bottom weapon rack.

import { roundRectPath } from '../engine/renderer.js';
import { clamp } from '../engine/math.js';
import { drawWeaponIcon } from './icons.js';
import { WEAPONS } from './weapons.js';
import { describeProgress, primaryProgress } from './objectives.js';
import { C, F, font } from './theme.js';

export class Hud {
  constructor(scene) {
    this.sc = scene;
    this.buttons = [];
    this.hint = null;
    this.secPulse = 0;
  }

  layout() {
    const sc = this.sc;
    const L = sc.layout;
    const owned = sc.run ? sc.run.owned : ['hands', 'bat'];
    const n = owned.length;
    const gap = 8;
    const bw = Math.min(76, (L.w - 24 - gap * (n - 1)) / n);
    const bh = L.barH - 18;
    const total = n * bw + (n - 1) * gap;
    const x0 = (L.w - total) / 2;
    this.buttons = owned.map((id, i) => ({ id, x: x0 + i * (bw + gap), y: L.barTop + 9, w: bw, h: bh }));
  }

  isUi(x, y) {
    const L = this.sc.layout;
    return y >= L.barTop || y < L.hudH;
  }

  press(x, y) {
    for (const b of this.buttons) {
      if (x >= b.x - 4 && x <= b.x + b.w + 4 && y >= b.y - 8 && y <= b.y + b.h + 8) {
        this.sc.selectWeapon(b.id);
        return;
      }
    }
  }

  showHint(text) {
    this.hint = { text, t: 3 };
  }

  update(dt) {
    if (this.hint) {
      this.hint.t -= dt;
      if (this.hint.t <= 0) this.hint = null;
    }
    this.secPulse = Math.max(0, this.secPulse - dt);
  }

  render(ctx) {
    this.renderTop(ctx);
    this.renderBar(ctx);
    this.renderHint(ctx);
    this.renderCombo(ctx);
  }

  renderTop(ctx) {
    const sc = this.sc;
    const L = sc.layout;
    const pad = 14;
    ctx.fillStyle = C.ink;
    ctx.fillRect(0, 0, L.w, L.hudH);
    // Stitched hem along the bottom edge.
    ctx.strokeStyle = C.inkLine;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.moveTo(0, L.hudH - 4);
    ctx.lineTo(L.w, L.hudH - 4);
    ctx.stroke();
    ctx.setLineDash([]);

    const round = sc.round;
    ctx.textBaseline = 'alphabetic';
    if (!round || sc.state === 'title') return;

    // Row 1: round, lives, timer.
    ctx.textAlign = 'left';
    ctx.fillStyle = C.paper;
    ctx.font = font(19, F.display, 400);
    const roundText = `ROUND ${round.number}`;
    ctx.fillText(roundText, pad, 28);
    let x = pad + ctx.measureText(roundText).width + 10;
    if (round.boss) x = this.chip(ctx, 'BOSS', x, 13, C.bad, C.ink) + 6;
    if (sc.run.lives > 0) this.chip(ctx, `1UP x${sc.run.lives}`, x, 13, C.gold, C.ink);

    const tl = Math.max(0, sc.timeLeft);
    const low = tl < 10 && sc.state === 'playing';
    ctx.textAlign = 'right';
    ctx.font = font(22, F.display, 400);
    ctx.fillStyle = low ? (Math.floor(tl * 4) % 2 ? C.bad : C.paper) : C.gold;
    ctx.fillText(`${Math.ceil(tl)}s`, L.w - pad, 29);

    const barW = L.w - pad * 2;
    ctx.fillStyle = C.inkSoft;
    ctx.fillRect(pad, 37, barW, 5);
    ctx.fillStyle = low ? C.bad : C.gold;
    ctx.fillRect(pad, 37, barW * clamp(tl / round.time, 0, 1), 5);

    // Row 2: primary objective.
    const stats = sc.stats;
    const prog = clamp(primaryProgress(round, stats) / round.primary.target, 0, 1);
    ctx.textAlign = 'left';
    ctx.fillStyle = C.paper;
    ctx.font = font(18, F.body, 700);
    ctx.fillText(round.primary.label, pad, 62);
    ctx.textAlign = 'right';
    ctx.font = font(16, F.body, 600);
    ctx.fillStyle = prog >= 1 ? C.good : C.paperDim;
    ctx.fillText(describeProgress(round, stats), L.w - pad, 62);
    ctx.fillStyle = C.inkSoft;
    ctx.fillRect(pad, 68, barW, 4);
    ctx.fillStyle = prog >= 1 ? C.good : C.paper;
    ctx.fillRect(pad, 68, barW * prog, 4);

    // Row 3: bonus condition.
    const sec = round.secondary;
    ctx.textAlign = 'left';
    const tagColor = sec.state === 'failed' ? C.bad : sec.state === 'done' ? C.good : C.accent;
    const tx = this.chip(ctx, 'BONUS', pad, 80, tagColor, C.ink);
    ctx.font = font(16, F.body, 600);
    ctx.fillStyle = sec.state === 'failed' ? C.muted : C.paper;
    ctx.fillText(sec.label, tx + 8, 93);
    if (sec.state === 'failed') {
      const lw = ctx.measureText(sec.label).width;
      ctx.strokeStyle = C.bad;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(tx + 6, 88);
      ctx.lineTo(tx + 10 + lw, 88);
      ctx.stroke();
    }
    ctx.textAlign = 'right';
    ctx.font = font(15, F.body, 700);
    let status = 'ON TRACK';
    let color = C.paperDim;
    if (sec.state === 'failed') { status = 'FAILED'; color = C.bad; }
    else if (sec.state === 'done') { status = 'DONE'; color = C.good; }
    else if (sec.id === 'speed') {
      const ok = sc.timeLeft >= sec.seconds;
      status = ok ? `${Math.ceil(sc.timeLeft - sec.seconds)}s margin` : 'TOO SLOW';
      color = ok ? C.paperDim : C.bad;
    }
    if (this.secPulse > 0) ctx.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(this.secPulse * 18));
    ctx.fillStyle = color;
    ctx.fillText(status, L.w - pad, 93);
    ctx.globalAlpha = 1;
  }

  chip(ctx, text, x, y, bg, fg) {
    ctx.font = font(11, F.body, 700);
    const w = ctx.measureText(text).width + 12;
    roundRectPath(ctx, x, y, w, 17, 4);
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.fillStyle = fg;
    ctx.textAlign = 'left';
    ctx.fillText(text, x + 6, y + 13);
    return x + w;
  }

  renderBar(ctx) {
    const sc = this.sc;
    const L = sc.layout;
    ctx.fillStyle = C.ink;
    ctx.fillRect(0, L.barTop, L.w, L.h - L.barTop);
    const banned = sc.round?.secondary?.id === 'banWeapon' && sc.round.secondary.state === 'active' ? sc.round.secondary.weapon : null;
    this.buttons.forEach((b, i) => {
      const def = WEAPONS[b.id];
      const sel = sc.weaponId === b.id;
      roundRectPath(ctx, b.x, b.y, b.w, b.h, 10);
      ctx.fillStyle = sel ? C.paper : C.inkSoft;
      ctx.fill();
      if (sel) {
        ctx.strokeStyle = C.accent;
        ctx.lineWidth = 3;
        ctx.stroke();
      }
      const iconSize = Math.min(b.w, b.h) * 0.56;
      drawWeaponIcon(ctx, b.id, b.x + b.w / 2, b.y + b.h / 2 - 7, iconSize, { alpha: banned === b.id ? 0.4 : 1 });
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.font = font(12, F.body, 700);
      ctx.fillStyle = sel ? C.paperInk : C.paperDim;
      ctx.fillText(def.name.toUpperCase(), b.x + b.w / 2, b.y + b.h - 6);

      // Level pips.
      const lvl = sc.run ? sc.run.level(b.id) : 1;
      for (let k = 0; k < lvl; k++) {
        ctx.fillStyle = sel ? C.accent : C.gold;
        ctx.beginPath();
        ctx.arc(b.x + b.w - 8 - k * 6, b.y + 8, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
      if (b.w > 48) {
        ctx.textAlign = 'left';
        ctx.font = font(10, F.body, 600);
        ctx.fillStyle = sel ? C.muted : C.inkLine;
        ctx.fillText(String(i + 1), b.x + 6, b.y + 13);
      }
      if (banned === b.id) {
        ctx.strokeStyle = C.bad;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(b.x + 8, b.y + b.h - 8);
        ctx.lineTo(b.x + b.w - 8, b.y + 8);
        ctx.stroke();
      }
    });
  }

  renderHint(ctx) {
    if (!this.hint || this.sc.state !== 'playing') return;
    const L = this.sc.layout;
    const a = clamp(this.hint.t / 0.4, 0, 1);
    ctx.globalAlpha = a;
    ctx.font = font(15, F.body, 600);
    const w = Math.min(L.w - 32, ctx.measureText(this.hint.text).width + 24);
    const x = (L.w - w) / 2;
    const y = L.floorY - 44;
    roundRectPath(ctx, x, y, w, 30, 15);
    ctx.fillStyle = 'rgba(22,25,21,0.82)';
    ctx.fill();
    ctx.fillStyle = C.paper;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.hint.text, L.w / 2, y + 15, w - 20);
    ctx.textBaseline = 'alphabetic';
    ctx.globalAlpha = 1;
  }

  renderCombo(ctx) {
    const sc = this.sc;
    if (!sc.run?.combo || sc.combo.count < 2 || sc.state !== 'playing') return;
    const L = sc.layout;
    ctx.globalAlpha = clamp(sc.combo.t / 0.3, 0, 1);
    ctx.textAlign = 'left';
    ctx.font = font(22, F.display, 400);
    ctx.fillStyle = C.accent;
    ctx.fillText(`x${sc.combo.count}`, 14, L.arenaTop + 32);
    ctx.font = font(14, F.body, 700);
    ctx.fillStyle = C.ink;
    ctx.fillText(`COMBO +${Math.round(sc.comboBonus() * 100)}%`, 14, L.arenaTop + 50);
    ctx.globalAlpha = 1;
  }
}
