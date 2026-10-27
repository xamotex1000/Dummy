// The high score table: the ten best runs on record, as a report sheet.

import { topScores } from '../scores.js';
import { C } from '../theme.js';
import { Overlay, HEAD, FOOT, TODAY, report, fields, section, text, mono, caption, rule, dim, paragraph } from './sheet.js';

export class ScoresOverlay extends Overlay {
  // `highlight` is a score id to mark, such as the run that just ended.
  constructor(play, highlight = null) {
    super(play);
    this.blocksUpdate = true;
    this.highlight = highlight;
    this.done = { x: 0, y: 0, w: 0, h: 46, onClick: () => this.close() };
    this.buttons = [this.done];
    this.keys = { escape: this.done.onClick, enter: this.done.onClick, r: this.done.onClick };
  }

  render(ctx) {
    const a = this.appear;
    dim(ctx, this.frame, a * 1.1);
    ctx.save();
    ctx.globalAlpha = a;
    const v = this.fit(ctx, [
      { key: 'full', w: 600, draw: (x, y, w, h) => this.body(ctx, x, y, w, h, false) },
      { key: 'short', w: 640, draw: (x, y, w, h) => this.body(ctx, x, y, w, h, true) },
    ]);
    this.sheet(ctx, v.key, v.w, v.draw, false);
    ctx.restore();
  }

  body(ctx, x, y, w, h, short) {
    const play = this.play;
    const lx = x + 18;
    const inner = w - 36;
    const list = topScores();
    report(ctx, x, y, w, h, 'TEST RECORDS', { tone: C.ctYellow, kicker: `HALL OF RECORDS  ·  ${TODAY}`, form: short ? null : 'FORM CT-20 · TEST RECORDS' });
    let cy = y + HEAD + 12;
    if (!short) {
      fields(ctx, lx, cy, inner, [
        { label: 'HIGH SCORE', value: list[0] ? list[0].score.toLocaleString('en-US') : '-', color: '#2f7d43' },
        { label: 'CERTIFIED RUNS', value: String(play.wins) },
        { label: 'RUNS ON RECORD', value: `${list.length}/10` },
      ]);
      cy += 40 + 30;
    } else {
      cy += 18;
    }
    section(ctx, lx, cy, inner, 1, 'TOP TEN RUNS');
    cy += 10;

    // Columns as fractions of the width; narrow sheets drop the weapon and date.
    const narrow = inner < 460;
    const cols = [
      { key: 'rank', label: 'RANK', at: 0 },
      { key: 'score', label: 'SCORE', at: 0.1 },
      { key: 'floor', label: 'FLOOR', at: narrow ? 0.34 : 0.27 },
      { key: 'result', label: 'RESULT', at: narrow ? 0.5 : 0.38 },
      ...(narrow ? [] : [{ key: 'weapon', label: 'FAVORITE', at: 0.58 }]),
      { key: 'mode', label: 'MODE', at: narrow ? 0.8 : 0.76 },
      ...(narrow ? [] : [{ key: 'date', label: 'DATE', at: 1, right: true }]),
    ];
    const rowH = short ? 19 : 24;
    cy += 14;
    for (const c of cols) caption(ctx, c.label, lx + inner * c.at, cy, { align: c.right ? 'right' : 'left' });
    cy += 4;
    rule(ctx, lx, lx + inner, cy, C.formInk);
    if (!list.length) {
      cy += 28;
      text(ctx, 'No runs on record yet. Finish a run to file the first one.', lx, cy, 15, { weight: 500, color: C.formMuted, maxWidth: inner });
      cy += 12;
    }
    list.forEach((e, i) => {
      const top = cy;
      cy += rowH;
      if (e.id === this.highlight) {
        ctx.fillStyle = 'rgba(242,194,0,0.4)';
        ctx.fillRect(lx - 6, top + 2, inner + 12, rowH);
      }
      const result = e.won ? (e.loop ? `ENDLESS ${e.loop}` : 'CERTIFIED') : 'TERMINATED';
      const vals = {
        rank: `#${i + 1}`,
        score: e.score.toLocaleString('en-US'),
        floor: e.loop ? `${e.floor} E${e.loop}` : e.floor,
        result,
        weapon: e.weapon,
        mode: e.mode === 'ROGUE-LITE' ? 'LITE' : 'LIKE',
        date: e.date,
      };
      const base = top + rowH - (short ? 5 : 7);
      for (const c of cols) {
        const color = c.key === 'result' ? (e.won ? '#2f7d43' : C.pen) : c.key === 'rank' && i === 0 ? '#2f7d43' : C.formInk;
        const font = c.key === 'weapon' ? { weight: 600 } : null;
        if (font) text(ctx, vals.weapon, lx + inner * c.at, base, 14, { ...font, maxWidth: inner * 0.17 });
        else mono(ctx, vals[c.key], lx + inner * c.at, base, short ? 11 : 12, { weight: c.key === 'score' || c.key === 'rank' ? 700 : 500, color, align: c.right ? 'right' : 'left' });
      }
      rule(ctx, lx, lx + inner, cy + 2, C.ruleSoft);
    });
    cy += 18;
    if (!short) {
      cy += paragraph(ctx, 'Score: 1,000 per floor, 250 per secondary, 50 per reaction, 20 per dummy, damage / 10, and 5,000 for certifying the series.', lx, cy, inner, 12, 15, { color: C.formMuted }) + 2;
    }
    Object.assign(this.done, { x: lx, y: cy, w: inner });
    this.drawButton(ctx, this.done, 'DONE', { key: 'ESC' });
    return cy + this.done.h + 14 + (short ? 0 : FOOT) - y;
  }
}
