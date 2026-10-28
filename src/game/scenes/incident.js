// An incident report: a short story, a few responses, and what came of the
// one you picked.

import { incidentOptions, INCIDENTS } from '../incidents.js';
import { C } from '../theme.js';
import { Overlay, HEAD, FOOT, report, fields, section, text, mono, paragraph, dim, keycap, keyW, stampMark, kicker } from './sheet.js';

export class IncidentOverlay extends Overlay {
  constructor(play, id, onDone) {
    super(play);
    this.id = id;
    this.def = INCIDENTS[id];
    this.onDone = onDone;
    this.options = incidentOptions(play, id).map((o, i) => ({ ...o, x: 0, y: 0, w: 0, h: 0, onClick: () => this.choose(i) }));
    this.result = null;
    this.next = null;
    this.cont = { x: 0, y: 0, w: 0, h: 46, onClick: () => this.finish() };
    this.options.forEach((_, i) => {
      this.keys[String(i + 1)] = () => this.choose(i);
    });
    this.keys.enter = this.keys[' '] = () => this.result && this.finish();
    (play.run.seenIncidents ??= []).push(id);
  }

  choose(i) {
    const o = this.options[i];
    if (this.result || !o?.available) {
      if (o && !o.available) this.play.sfx.bonusFail();
      return;
    }
    const run = this.play.run;
    run.scrap -= o.cost ?? 0;
    const out = o.pick(this.play) ?? {};
    this.result = out.text ?? '';
    this.next = out.next ?? null;
    this.chosen = i;
    this.resultT = this.t;
    this.play.sfx.card();
    this.play.hud.layout();
  }

  finish() {
    const next = this.next;
    this.close(() => (next ? next(this.play, this.onDone) : this.onDone()));
  }

  update(dt, isTop) {
    this.buttons = this.result ? [this.cont] : this.options.filter((o) => o.available);
    super.update(dt, isTop);
  }

  render(ctx) {
    const a = this.appear;
    dim(ctx, this.frame, a * 1.1);
    ctx.save();
    ctx.globalAlpha = a;
    const v = this.fit(ctx, [
      { key: `full:${!!this.result}`, w: 520, draw: (x, y, w, h) => this.body(ctx, x, y, w, h, false) },
      { key: `short:${!!this.result}`, w: 620, draw: (x, y, w, h) => this.body(ctx, x, y, w, h, true) },
    ]);
    this.sheet(ctx, v.key, v.w, v.draw);
    ctx.restore();
  }

  body(ctx, x, y, w, h, short) {
    const play = this.play;
    const run = play.run;
    const lx = x + 18;
    const rx = x + w - 18;
    const inner = w - 36;
    report(ctx, x, y, w, h, 'INCIDENT REPORT', { hazardEdge: true, kicker: kicker(play, run.depth), form: short ? null : 'FORM CT-13 · INCIDENT REPORT' });
    let cy = y + HEAD + 12;
    if (!short) {
      fields(ctx, lx, cy, inner, [
        { label: 'FLOOR', value: `${run.act}-${run.floor}`, flex: 0.8 },
        { label: 'INCIDENT', value: this.def.title.toUpperCase(), flex: 2 },
        { label: 'SCRAP', value: String(run.scrap), color: '#2f7d43' },
      ]);
      cy += 40 + 30;
      section(ctx, lx, cy, inner, 1, 'WHAT HAPPENED');
      cy += 22;
    } else {
      cy += 22;
      text(ctx, this.def.title.toUpperCase(), lx, cy, 18, { weight: 700, spacing: 1 });
      mono(ctx, `SCRAP ${run.scrap}`, rx, cy, 12, { weight: 700, color: '#2f7d43', align: 'right' });
      cy += 18;
    }
    cy += paragraph(ctx, this.def.text, lx, cy + 2, inner, 15, 20, {}) + 14;

    if (!this.result) {
      if (!short) {
        cy += 12;
        section(ctx, lx, cy, inner, 2, 'RESPONSE');
        cy += 10;
      }
      this.options.forEach((o, i) => {
        const top = cy + 6;
        const rowH = short ? 40 : 52;
        Object.assign(o, { x: lx - 6, y: top, w: inner + 12, h: rowH });
        if (o.hover && o.available) {
          ctx.fillStyle = C.ruleSoft;
          ctx.fillRect(o.x, o.y, o.w, o.h);
        }
        ctx.strokeStyle = o.available ? C.formInk : C.rule;
        ctx.lineWidth = 1.25;
        ctx.strokeRect(o.x + 0.5, o.y + 0.5, o.w - 1, o.h - 1);
        const kx = lx + 2;
        if (this.fine) keycap(ctx, String(i + 1), kx, top + rowH / 2);
        const tx = kx + (this.fine ? keyW(ctx, String(i + 1)) + 10 : 4);
        const color = o.available ? C.formInk : C.formMuted;
        text(ctx, o.label, tx, top + (short ? 17 : 21), short ? 15 : 17, { weight: 700, color, maxWidth: inner - 140 });
        text(ctx, o.desc, tx, top + (short ? 33 : 40), 13, { weight: 500, color: C.formMuted, maxWidth: rx - tx - 8 });
        const tag = !o.available ? (o.cost && run.scrap < o.cost ? `NEED ${o.cost} SCRAP` : 'NOT AVAILABLE') : o.cost ? `${o.cost} SCRAP` : '';
        if (tag) mono(ctx, tag, rx - 4, top + (short ? 17 : 21), 11, { weight: 700, color: o.available ? '#2f7d43' : C.pen, align: 'right' });
        cy = top + rowH;
      });
      cy += 18;
    } else {
      cy += 12;
      section(ctx, lx, cy, inner, short ? 2 : 3, 'OUTCOME', { right: this.options[this.chosen].label.toUpperCase() });
      cy += 10;
      cy += paragraph(ctx, this.result, lx, cy + 16, inner, 15, 20, { weight: 600 }) + 22;
      Object.assign(this.cont, { x: lx, y: cy, w: inner });
      this.drawButton(ctx, this.cont, 'FILE AND CONTINUE', { key: 'SPACE', paper: true });
      cy += this.cont.h + 14;
      stampMark(ctx, 'FILED', rx - 50, y + 32, C.pen, this.t - this.resultT - 0.1, 20);
    }
    return cy + (short ? 0 : FOOT) - y;
  }
}
