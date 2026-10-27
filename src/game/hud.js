// In-game HUD. Desktop gets a clipboard sidebar (round, timer, work order,
// bonus, arsenal); narrow screens get a top strip and a bottom weapon rack.

import { roundRectPath, wrapText } from '../engine/renderer.js';
import { clamp } from '../engine/math.js';
import { drawWeaponIcon } from './icons.js';
import { WEAPONS } from './weapons.js';
import { describeProgress, primaryProgress } from './objectives.js';
import { VARIANTS, TWISTS } from './variants.js';
import { TRAPS, TRAP_ORDER, drawTrapIcon } from './traps.js';
import { C, F, font } from './theme.js';

function setSpacing(ctx, px) {
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${px}px`;
}

function label(ctx, text, x, y, color, align = 'left') {
  ctx.font = font(12, F.body, 700);
  ctx.fillStyle = color;
  ctx.textAlign = align;
  setSpacing(ctx, 1.5);
  ctx.fillText(text, x, y);
  setSpacing(ctx, 0);
}

const inRect = (r, x, y) => r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

export class Hud {
  constructor(scene) {
    this.sc = scene;
    this.buttons = [];
    this.pauseBtn = null;
    this.hint = null;
    this.secPulse = 0;
    this.hoverId = null;
  }

  get L() {
    return this.sc.layout;
  }

  // Weapon buttons are laid out here; the sidebar rows are sized during render
  // because they depend on how much room the work order took.
  layout() {
    const L = this.L;
    if (L.mode === 'wide') {
      this.pauseBtn = { x: L.sideW - 22 - 36, y: 20, w: 36, h: 30 };
      return;
    }
    const owned = this.owned();
    const n = owned.length;
    const gap = L.mode === 'short' ? 6 : 8;
    const bw = Math.min(76, (L.w - 24 - gap * (n - 1)) / n);
    const bh = L.barH - (L.mode === 'short' ? 12 : 18);
    const total = n * bw + (n - 1) * gap;
    const x0 = (L.w - total) / 2;
    this.buttons = owned.map((id, i) => ({ id, x: x0 + i * (bw + gap), y: L.barTop + (L.barH - bh) / 2, w: bw, h: bh }));
    this.pauseBtn = { x: L.w - 14 - 32, y: 8, w: 32, h: 26 };
  }

  owned() {
    return this.sc.run ? this.sc.run.owned : ['hands', 'bat'];
  }

  isUi(x, y) {
    const L = this.L;
    if (L.mode === 'wide') return x < L.sideW;
    return y >= L.barTop || y < L.hudH;
  }

  canPause() {
    return this.sc.state === 'playing';
  }

  // True when (x, y) is over something clickable, for the hover cursor.
  hoverAt(x, y) {
    this.hoverId = null;
    for (const b of this.buttons) {
      if (inRect(b, x, y)) {
        this.hoverId = b.id;
        return true;
      }
    }
    return this.canPause() && inRect(this.pauseBtn, x, y);
  }

  press(x, y) {
    if (this.canPause() && inRect(this.pauseBtn, x, y)) {
      this.sc.pause();
      return;
    }
    for (const b of this.buttons) {
      if (x >= b.x - 4 && x <= b.x + b.w + 4 && y >= b.y - 4 && y <= b.y + b.h + 4) {
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
    if (this.L.mode === 'wide') {
      this.renderSidebar(ctx);
    } else {
      this.renderStrip(ctx);
      this.renderBar(ctx);
      this.renderHint(ctx);
    }
    this.renderCombo(ctx);
    this.renderChain(ctx);
  }

  // ------------------------------------------------------------ shared bits

  bonusStatus() {
    const sc = this.sc;
    const sec = sc.round.secondary;
    if (sec.state === 'failed') return ['FAILED', C.bad];
    if (sec.state === 'done') return ['DONE', C.good];
    if (sec.id === 'speed') {
      const ok = sc.timeLeft >= sec.seconds;
      return ok ? [`${Math.ceil(sc.timeLeft - sec.seconds)}s margin`, C.paperDim] : ['TOO SLOW', C.bad];
    }
    if (sec.id === 'reaction') return sec.got ? ['GOT ONE', C.good] : ['NEEDED', C.paperDim];
    return ['ON TRACK', C.paperDim];
  }

  timerColor() {
    const sc = this.sc;
    const low = sc.timeLeft < 10 && sc.state === 'playing';
    return low ? (Math.floor(sc.timeLeft * 4) % 2 ? C.bad : C.paper) : C.gold;
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

  bar(ctx, x, y, w, h, frac, color) {
    ctx.fillStyle = C.inkSoft;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w * clamp(frac, 0, 1), h);
  }

  pauseButton(ctx) {
    const b = this.pauseBtn;
    if (!b || !this.canPause()) return;
    roundRectPath(ctx, b.x, b.y, b.w, b.h, 6);
    ctx.fillStyle = this.hoverPause ? C.inkLine : C.inkSoft;
    ctx.fill();
    ctx.fillStyle = C.paper;
    const bw = 4, bh = b.h * 0.45;
    ctx.fillRect(b.x + b.w / 2 - bw - 2, b.y + (b.h - bh) / 2, bw, bh);
    ctx.fillRect(b.x + b.w / 2 + 2, b.y + (b.h - bh) / 2, bw, bh);
  }

  stitch(ctx, x0, y0, x1, y1) {
    ctx.strokeStyle = C.inkLine;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  weaponPips(ctx, id, x, y, color) {
    const lvl = this.sc.run ? this.sc.run.level(id) : 1;
    for (let k = 0; k < lvl; k++) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x - k * 7, y, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  bannedWeapon() {
    const sec = this.sc.round?.secondary;
    return sec?.id === 'banWeapon' && sec.state === 'active' ? sec.weapon : null;
  }

  // ---------------------------------------------------------------- sidebar

  renderSidebar(ctx) {
    const sc = this.sc;
    const L = this.L;
    const W = L.sideW;
    const pad = 22;
    const inner = W - pad * 2;
    const p = sc.input.pointer;
    this.hoverPause = p.type === 'mouse' && inRect(this.pauseBtn, p.x, p.y);

    ctx.fillStyle = C.ink;
    ctx.fillRect(0, 0, W, L.h);
    this.stitch(ctx, W - 5, 0, W - 5, L.h);

    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.font = font(20, F.display, 400);
    ctx.fillStyle = C.paper;
    ctx.fillText('DUMMY RUN', pad, 44);
    this.pauseButton(ctx);
    this.stitch(ctx, pad, 66, W - pad, 66);

    const round = sc.round;
    if (!sc.run || sc.state === 'title') {
      this.buttons = [];
      return;
    }
    let y;
    if (!round || sc.state === 'between') {
      y = this.renderRunHeader(ctx, pad, inner);
    } else {
      y = this.renderOrder(ctx, pad, inner);
    }
    this.renderArsenal(ctx, y, pad, inner);
  }

  // Between floors: where the run is, instead of a stale work order.
  renderRunHeader(ctx, pad, inner) {
    const run = this.sc.run;
    let y = 106;
    ctx.textAlign = 'left';
    ctx.font = font(24, F.display, 400);
    ctx.fillStyle = C.paper;
    ctx.fillText(`ACT ${run.act} · FLOOR ${run.floor}`, pad, y, inner);
    y += 26;
    ctx.font = font(16, F.body, 600);
    ctx.fillStyle = C.muted;
    ctx.fillText(`${run.actDef.name}${run.loop ? ` · endless ${run.loop}` : ''}`, pad, y, inner);
    y += 18;
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = i < run.floor - 1 ? C.good : i === run.floor - 1 ? C.gold : C.inkSoft;
      roundRectPath(ctx, pad + i * ((inner + 6) / 5), y, (inner + 6) / 5 - 6, 6, 3);
      ctx.fill();
    }
    y += 24;
    this.stitch(ctx, pad, y, pad + inner, y);
    return y;
  }

  renderOrder(ctx, pad, inner) {
    const sc = this.sc;
    const L = this.L;
    const W = L.sideW;
    const round = sc.round;

    // Floor and clock.
    let y = 106;
    ctx.font = font(24, F.display, 400);
    ctx.fillStyle = C.paper;
    const roundText = `FLOOR ${round.act}-${round.floor}`;
    ctx.fillText(roundText, pad, y);
    let cx = pad + ctx.measureText(roundText).width + 10;
    if (round.boss) cx = this.chip(ctx, 'BOSS', cx, y - 17, C.bad, C.ink) + 6;
    if (sc.run.lives > 0) this.chip(ctx, `1UP x${sc.run.lives}`, cx, y - 17, C.gold, C.ink);
    ctx.textAlign = 'right';
    ctx.font = font(32, F.display, 400);
    ctx.fillStyle = this.timerColor();
    ctx.fillText(`${Math.ceil(Math.max(0, sc.timeLeft))}s`, W - pad, y + 2);
    y += 16;
    this.bar(ctx, pad, y, inner, 6, sc.timeLeft / round.time, sc.timeLeft < 10 ? C.bad : C.gold);
    y += 26;
    ctx.textAlign = 'left';
    ctx.font = font(15, F.body, 600);
    ctx.fillStyle = C.muted;
    const twist = round.twist ? ` · ${TWISTS[round.twist].name}` : '';
    ctx.fillText(`${sc.run.actDef.name} · ${VARIANTS[round.variant].name}${twist}`, pad, y, inner);

    // Work order.
    const stats = sc.stats;
    const prog = primaryProgress(round, stats) / round.primary.target;
    y += 40;
    label(ctx, 'WORK ORDER', pad, y, C.muted);
    ctx.font = font(15, F.body, 600);
    ctx.textAlign = 'right';
    ctx.fillStyle = prog >= 1 ? C.good : C.paperDim;
    ctx.fillText(describeProgress(round, stats), W - pad, y);
    y += 28;
    ctx.textAlign = 'left';
    ctx.font = font(21, F.body, 700);
    ctx.fillStyle = C.paper;
    ctx.fillText(round.primary.label, pad, y, inner);
    y += 12;
    this.bar(ctx, pad, y, inner, 6, prog, prog >= 1 ? C.good : C.paper);
    y += 26;
    ctx.font = font(15, F.body, 500);
    ctx.fillStyle = C.muted;
    for (const ln of wrapText(ctx, round.primary.hint, inner).slice(0, 2)) {
      ctx.fillText(ln, pad, y);
      y += 19;
    }

    // Bonus.
    const sec = round.secondary;
    y += 18;
    const tagColor = sec.state === 'failed' ? C.bad : sec.state === 'done' ? C.good : C.accent;
    label(ctx, 'BONUS · OPTIONAL', pad, y, tagColor);
    const [status, statusColor] = this.bonusStatus();
    if (this.secPulse > 0) ctx.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(this.secPulse * 18));
    ctx.font = font(15, F.body, 700);
    ctx.textAlign = 'right';
    ctx.fillStyle = statusColor;
    ctx.fillText(status, W - pad, y);
    ctx.globalAlpha = 1;
    y += 26;
    ctx.textAlign = 'left';
    ctx.font = font(19, F.body, 700);
    ctx.fillStyle = sec.state === 'failed' ? C.muted : C.paper;
    const secLines = wrapText(ctx, sec.label, inner).slice(0, 2);
    for (const ln of secLines) {
      ctx.fillText(ln, pad, y);
      if (sec.state === 'failed') {
        ctx.fillStyle = C.bad;
        ctx.fillRect(pad - 2, y - 7, ctx.measureText(ln).width + 4, 2);
        ctx.fillStyle = C.muted;
      }
      y += 23;
    }
    ctx.font = font(14, F.body, 500);
    ctx.fillStyle = C.muted;
    ctx.fillText('Reward: one extra card pick', pad, y);
    y += 18;
    this.stitch(ctx, pad, y, W - pad, y);
    return y;
  }

  renderArsenal(ctx, y, pad, inner) {
    const sc = this.sc;
    const L = this.L;
    const W = L.sideW;

    // Arsenal.
    y += 30;
    label(ctx, 'ARSENAL', pad, y, C.muted);
    if (sc.input.finePointer) label(ctx, `1-${this.owned().length} · WHEEL`, W - pad, y, C.inkLine, 'right');
    y += 12;
    const owned = this.owned();
    const footer = 70;
    const rowH = clamp((L.h - y - footer - 46) / owned.length, 30, 46);
    const banned = this.bannedWeapon();
    this.buttons = owned.map((id, i) => ({ id, x: pad - 8, y: y + i * rowH, w: inner + 16, h: rowH - 4 }));
    this.buttons.forEach((b, i) => {
      const def = WEAPONS[b.id];
      const sel = sc.weaponId === b.id;
      const hover = this.hoverId === b.id && !sel;
      if (sel || hover) {
        roundRectPath(ctx, b.x, b.y, b.w, b.h, 8);
        ctx.fillStyle = sel ? C.paper : C.inkSoft;
        ctx.fill();
        if (sel) {
          ctx.fillStyle = C.accent;
          ctx.fillRect(b.x, b.y + 6, 4, b.h - 12);
        }
      }
      const mid = b.y + b.h / 2;
      roundRectPath(ctx, b.x + 12, mid - 10, 20, 20, 5);
      ctx.fillStyle = sel ? C.paperDim : C.inkSoft;
      ctx.fill();
      ctx.font = font(13, F.body, 700);
      ctx.textAlign = 'center';
      ctx.fillStyle = sel ? C.paperInk : C.muted;
      ctx.fillText(String(i + 1), b.x + 22, mid + 5);
      drawWeaponIcon(ctx, b.id, b.x + 56, mid, Math.min(34, b.h * 0.8), { alpha: banned === b.id ? 0.35 : 1 });
      ctx.textAlign = 'left';
      ctx.font = font(18, F.body, 700);
      ctx.fillStyle = sel ? C.paperInk : banned === b.id ? C.muted : C.paper;
      ctx.fillText(def.name, b.x + 84, mid + 6);
      if (banned === b.id) {
        ctx.font = font(12, F.body, 700);
        ctx.fillStyle = C.bad;
        ctx.textAlign = 'right';
        ctx.fillText('BANNED', b.x + b.w - 12, mid + 4);
      } else {
        this.weaponPips(ctx, b.id, b.x + b.w - 14, mid, sel ? C.accent : C.gold);
      }
    });
    y += owned.length * rowH + 10;

    // Hint for the hovered or selected weapon.
    const shown = WEAPONS[this.hoverId ?? sc.weaponId];
    ctx.font = font(15, F.body, 500);
    ctx.fillStyle = C.paperDim;
    ctx.textAlign = 'left';
    for (const ln of wrapText(ctx, shown.hint, inner).slice(0, 3)) {
      if (y > L.h - footer + 6) break;
      ctx.fillText(ln, pad, y + 6);
      y += 19;
    }

    // The machine: installed traps by type.
    const run = sc.run;
    const types = TRAP_ORDER.filter((id) => run.traps.some((t) => t.id === id));
    if (types.length && y + 40 < L.h - footer) {
      y += 24;
      label(ctx, 'MACHINE', pad, y, C.muted);
      y += 8;
      for (const id of types) {
        if (y + 24 > L.h - footer) break;
        const count = run.traps.filter((t) => t.id === id).length;
        drawTrapIcon(ctx, id, pad + 12, y + 12, 22);
        ctx.font = font(16, F.body, 700);
        ctx.textAlign = 'left';
        ctx.fillStyle = C.paper;
        ctx.fillText(count > 1 ? `${TRAPS[id].name} x${count}` : TRAPS[id].name, pad + 32, y + 18, inner - 80);
        for (let k = 0; k < run.trapLevel(id); k++) {
          ctx.fillStyle = C.gold;
          ctx.beginPath();
          ctx.arc(pad + inner - 2 - k * 7, y + 12, 2.4, 0, Math.PI * 2);
          ctx.fill();
        }
        y += 26;
      }
    }

    // Cards taken this run, if there's room above the footer.
    if (run.taken.length && y + 60 < L.h - footer) {
      y += 24;
      label(ctx, 'THIS RUN', pad, y, C.muted);
      y += 22;
      const counts = new Map();
      for (const name of run.taken) counts.set(name, (counts.get(name) ?? 0) + 1);
      ctx.font = font(15, F.body, 600);
      ctx.textAlign = 'left';
      for (const [name, n] of counts) {
        if (y > L.h - footer + 4) break;
        ctx.fillStyle = C.paperDim;
        ctx.fillText(n > 1 ? `${name}  x${n}` : name, pad, y, inner);
        y += 20;
      }
    }

    // Footer: run summary and keys.
    this.stitch(ctx, pad, L.h - footer + 18, W - pad, L.h - footer + 18);
    ctx.font = font(14, F.body, 600);
    ctx.fillStyle = C.muted;
    ctx.fillText(`Cards ${run.taken.length}  ·  Rerolls ${run.rerolls}  ·  Spares ${run.lives}`, pad, L.h - 26);
    if (sc.input.finePointer) {
      ctx.textAlign = 'right';
      ctx.fillText('ESC pause', W - pad, L.h - 26);
    }
  }

  // ------------------------------------------------------- compact (phones)

  renderStrip(ctx) {
    const sc = this.sc;
    const L = this.L;
    const pad = 14;
    const p = sc.input.pointer;
    this.hoverPause = p.type === 'mouse' && inRect(this.pauseBtn, p.x, p.y);
    ctx.fillStyle = C.ink;
    ctx.fillRect(0, 0, L.w, L.hudH);
    this.stitch(ctx, 0, L.hudH - 4, L.w, L.hudH - 4);

    const round = sc.round;
    if (!round || sc.state === 'title') return;
    this.pauseButton(ctx);
    const right = L.w - pad - (this.canPause() ? 42 : 0);
    const stats = sc.stats;
    const prog = primaryProgress(round, stats) / round.primary.target;
    const sec = round.secondary;
    const [status, statusColor] = this.bonusStatus();
    const tagColor = sec.state === 'failed' ? C.bad : sec.state === 'done' ? C.good : C.accent;
    ctx.textBaseline = 'alphabetic';

    if (L.mode === 'short') {
      // Two rows: round + objective + clock, then the bonus.
      ctx.textAlign = 'left';
      ctx.font = font(15, F.display, 400);
      ctx.fillStyle = C.paper;
      const rt = `${round.act}-${round.floor}`;
      ctx.fillText(rt, pad, 22);
      let x = pad + ctx.measureText(rt).width + 10;
      ctx.font = font(16, F.body, 700);
      ctx.fillText(round.primary.label, x, 22);
      ctx.textAlign = 'right';
      ctx.font = font(20, F.display, 400);
      ctx.fillStyle = this.timerColor();
      ctx.fillText(`${Math.ceil(Math.max(0, sc.timeLeft))}s`, right, 23);
      const tw = ctx.measureText('00s').width + 14;
      ctx.font = font(15, F.body, 600);
      ctx.fillStyle = prog >= 1 ? C.good : C.paperDim;
      ctx.fillText(describeProgress(round, stats), right - tw, 22);
      this.bar(ctx, pad, 29, L.w - pad * 2, 3, sc.timeLeft / round.time, C.gold);
      this.bar(ctx, pad, 34, L.w - pad * 2, 3, prog, prog >= 1 ? C.good : C.paper);
      x = this.chip(ctx, 'BONUS', pad, 41, tagColor, C.ink);
      ctx.font = font(15, F.body, 600);
      ctx.textAlign = 'left';
      ctx.fillStyle = sec.state === 'failed' ? C.muted : C.paper;
      ctx.fillText(sec.label, x + 8, 54);
      ctx.textAlign = 'right';
      ctx.font = font(14, F.body, 700);
      ctx.fillStyle = statusColor;
      ctx.fillText(status, L.w - pad, 54);
      return;
    }

    // Three rows: round + clock, objective, bonus.
    ctx.textAlign = 'left';
    ctx.fillStyle = C.paper;
    ctx.font = font(19, F.display, 400);
    const roundText = `FLOOR ${round.act}-${round.floor}`;
    ctx.fillText(roundText, pad, 28);
    let x = pad + ctx.measureText(roundText).width + 10;
    if (round.boss) x = this.chip(ctx, 'BOSS', x, 13, C.bad, C.ink) + 6;
    if (sc.run.lives > 0) this.chip(ctx, `1UP x${sc.run.lives}`, x, 13, C.gold, C.ink);
    ctx.textAlign = 'right';
    ctx.font = font(22, F.display, 400);
    ctx.fillStyle = this.timerColor();
    ctx.fillText(`${Math.ceil(Math.max(0, sc.timeLeft))}s`, right, 29);
    const barW = L.w - pad * 2;
    this.bar(ctx, pad, 39, barW, 5, sc.timeLeft / round.time, sc.timeLeft < 10 ? C.bad : C.gold);

    ctx.textAlign = 'left';
    ctx.fillStyle = C.paper;
    ctx.font = font(18, F.body, 700);
    ctx.fillText(round.primary.label, pad, 64);
    ctx.textAlign = 'right';
    ctx.font = font(16, F.body, 600);
    ctx.fillStyle = prog >= 1 ? C.good : C.paperDim;
    ctx.fillText(describeProgress(round, stats), L.w - pad, 64);
    this.bar(ctx, pad, 70, barW, 4, prog, prog >= 1 ? C.good : C.paper);

    const tx = this.chip(ctx, 'BONUS', pad, 80, tagColor, C.ink);
    ctx.textAlign = 'left';
    ctx.font = font(16, F.body, 600);
    ctx.fillStyle = sec.state === 'failed' ? C.muted : C.paper;
    ctx.fillText(sec.label, tx + 8, 93);
    if (this.secPulse > 0) ctx.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(this.secPulse * 18));
    ctx.textAlign = 'right';
    ctx.font = font(15, F.body, 700);
    ctx.fillStyle = statusColor;
    ctx.fillText(status, L.w - pad, 93);
    ctx.globalAlpha = 1;
  }

  renderBar(ctx) {
    const sc = this.sc;
    const L = this.L;
    ctx.fillStyle = C.ink;
    ctx.fillRect(0, L.barTop, L.w, L.h - L.barTop);
    const banned = this.bannedWeapon();
    this.buttons.forEach((b, i) => {
      const def = WEAPONS[b.id];
      const sel = sc.weaponId === b.id;
      roundRectPath(ctx, b.x, b.y, b.w, b.h, 10);
      ctx.fillStyle = sel ? C.paper : this.hoverId === b.id ? C.inkLine : C.inkSoft;
      ctx.fill();
      if (sel) {
        ctx.strokeStyle = C.accent;
        ctx.lineWidth = 3;
        ctx.stroke();
      }
      const showName = b.h >= 52;
      const iconSize = Math.min(b.w, b.h) * (showName ? 0.56 : 0.66);
      drawWeaponIcon(ctx, b.id, b.x + b.w / 2, b.y + b.h / 2 - (showName ? 7 : 0), iconSize, { alpha: banned === b.id ? 0.4 : 1 });
      ctx.textBaseline = 'alphabetic';
      if (showName) {
        ctx.textAlign = 'center';
        ctx.font = font(12, F.body, 700);
        ctx.fillStyle = sel ? C.paperInk : C.paperDim;
        ctx.fillText(def.name.toUpperCase(), b.x + b.w / 2, b.y + b.h - 6);
      }
      this.weaponPips(ctx, b.id, b.x + b.w - 8, b.y + 8, sel ? C.accent : C.gold);
      if (b.w > 48 && sc.input.finePointer) {
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
    const L = this.L;
    ctx.globalAlpha = clamp(this.hint.t / 0.4, 0, 1);
    ctx.font = font(15, F.body, 600);
    const w = Math.min(L.w - 32, ctx.measureText(this.hint.text).width + 24);
    const x = (L.w - w) / 2;
    const y = L.floorPx - 44;
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

  // The chain multiplier, top right of the arena.
  renderChain(ctx) {
    const sc = this.sc;
    const n = sc.chainCount;
    if (n < 2 || sc.state !== 'playing') return;
    const A = this.L.arena;
    const x = A.x + A.w - 16;
    const y = A.y + 38;
    ctx.textAlign = 'right';
    ctx.font = font(26 + Math.min(14, n * 2), F.display, 400);
    ctx.lineWidth = 5;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(14,17,13,0.85)';
    const label = `CHAIN x${n}`;
    ctx.strokeText(label, x, y);
    ctx.fillStyle = n >= 5 ? C.accent : n >= 3 ? C.gold : C.paper;
    ctx.fillText(label, x, y);
    ctx.font = font(15, F.body, 700);
    const sub = `+${Math.round(sc.chainBonus() * 100)}% to everything`;
    ctx.strokeText(sub, x, y + 20);
    ctx.fillStyle = C.paper;
    ctx.fillText(sub, x, y + 20);
  }

  renderCombo(ctx) {
    const sc = this.sc;
    if (!sc.run?.combo || sc.combo.count < 2 || sc.state !== 'playing') return;
    const A = this.L.arena;
    ctx.globalAlpha = clamp(sc.combo.t / 0.3, 0, 1);
    ctx.textAlign = 'left';
    ctx.font = font(22, F.display, 400);
    ctx.fillStyle = C.accent;
    ctx.fillText(`x${sc.combo.count}`, A.x + 16, A.y + 34);
    ctx.font = font(14, F.body, 700);
    ctx.fillStyle = C.ink;
    ctx.fillText(`COMBO +${Math.round(sc.comboBonus() * 100)}%`, A.x + 16, A.y + 52);
    ctx.globalAlpha = 1;
  }
}
