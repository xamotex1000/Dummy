// The Supply Room: spend scrap on cards and rig mods, or on a few services,
// instead of fighting a floor. Stock is rolled when you walk in; Restock
// rolls it again for a price that goes up each time.

import { clamp } from '../../engine/math.js';
import { drawOffer, takeCard } from '../cards.js';
import { modOffer } from '../mods.js';
import { progress } from '../progress.js';
import { C, F } from '../theme.js';
import { Overlay, HEAD, report, mono, measure, dim, keycap, keyW, stampMark, kicker } from './sheet.js';
import { drawCard, PlaceOverlay } from './overlays.js';

const CARD_PRICE = {
  weapon: { common: 35, rare: 50, epic: 70 },
  trap: { common: 30, rare: 45, epic: 65 },
  upgrade: { common: 25, rare: 40, epic: 55 },
  mod: { common: 45, rare: 80, epic: 130 },
};
const OTHER_PRICE = { common: 25, rare: 40, epic: 60 };

export class ShopOverlay extends Overlay {
  constructor(play, onDone) {
    super(play);
    this.blocksUpdate = true;
    this.onDone = onDone;
    this.restocks = 0;
    this.items = [];
    this.stock();
    const run = play.run;
    this.services = [
      { id: 'reroll', name: 'Reroll Token', desc: '+1 reroll for card picks', price: () => this.cost(15), buy: () => { run.rerolls += 1; } },
      { id: 'repair', name: 'Field Repair', desc: 'Gain a Second Wind', price: () => this.cost(90), ok: () => !run.noSecondWind, buy: () => { run.lives += 1; } },
      { id: 'restock', name: 'Restock', desc: 'Roll new stock', price: () => this.cost(12 + this.restocks * 8), buy: () => { this.restocks++; this.stock(); } },
    ].map((s) => ({ ...s, x: 0, y: 0, w: 0, h: 40, onClick: () => this.buyService(s.id) }));
    this.leave = { x: 0, y: 0, w: 0, h: 46, onClick: () => this.close(this.onDone) };
    for (let i = 1; i <= 6; i++) this.keys[String(i)] = () => this.buy(this.items[i - 1]);
    this.keys.escape = this.keys.enter = this.leave.onClick;
    this.keys.r = () => this.buyService('restock');
  }

  cost(base) {
    return Math.max(5, Math.round((base * this.play.run.priceMult) / 5) * 5);
  }

  stock() {
    const play = this.play;
    const run = play.run;
    const cards = drawOffer(run, play.rng, { count: 4, filter: (c) => c.kind !== 'curse' });
    const mods = modOffer(run, play.rng, progress.certs, { count: 2 });
    this.items = [...cards, ...mods].map((card) => ({
      card,
      price: this.cost((CARD_PRICE[card.kind] ?? OTHER_PRICE)[card.rarity] ?? 40),
      sold: false,
      x: 0, y: 0, w: 0, h: 0,
      onClick: () => this.buy(this.items.find((it) => it.card === card)),
    }));
    this.t = Math.min(this.t, 0.2);
  }

  // Why an item can't be bought right now, if it can't.
  blocked(it) {
    if (it.sold) return 'SOLD';
    if (it.card.kind === 'weapon' && this.play.run.slotsFull) return 'ARSENAL FULL';
    if (this.play.run.scrap < it.price) return 'SHORT';
    return null;
  }

  buy(it) {
    if (!it || this.closing >= 0) return;
    const why = this.blocked(it);
    if (why) {
      if (why !== 'SOLD') this.play.sfx.bonusFail();
      return;
    }
    const play = this.play;
    play.run.scrap -= it.price;
    it.sold = true;
    takeCard(play.run, it.card);
    play.sfx.card();
    if (it.card.kind === 'weapon') play.selectWeapon(it.card.icon);
    play.hud.layout();
    // A trap needs a spot before you carry on shopping.
    if (it.card.kind === 'trap') play.engine.push(new PlaceOverlay(play, it.card.trap, () => {}));
  }

  buyService(id) {
    const s = this.services.find((x) => x.id === id);
    if (!s || (s.ok && !s.ok())) return;
    const price = s.price();
    if (this.play.run.scrap < price) {
      this.play.sfx.bonusFail();
      return;
    }
    this.play.run.scrap -= price;
    s.buy();
    this.play.sfx.install();
  }

  // Sheet, shelf grid and service row. The grid uses full cards where there
  // is room, and compact rows otherwise.
  layout() {
    const R = this.frame;
    const sheet = { x: R.x + 12, y: R.y + 12, w: R.w - 24, h: R.h - 24 };
    const lx = sheet.x + 18;
    const inner = sheet.w - 36;
    const gap = 12;
    const bottom = sheet.y + sheet.h - 14;
    Object.assign(this.leave, { x: lx, y: bottom - 46, w: inner });
    const svcY = this.leave.y - 12 - 40;
    const sw = (inner - 2 * 10) / 3;
    this.services.forEach((s, i) => Object.assign(s, { x: lx + i * (sw + 10), y: svcY, w: sw }));
    const top = sheet.y + HEAD + 12;
    const avail = svcY - 14 - top;
    const n = this.items.length || 1;
    const cols = [6, 3, 2, 1].find((c) => (inner - gap * (c - 1)) / c >= 190 || c === 1);
    const rowsCount = Math.ceil(n / cols);
    const w = (inner - gap * (cols - 1)) / cols;
    let h = Math.min(320, (avail - gap * (rowsCount - 1)) / rowsCount);
    const rows = h < 230;
    if (rows) h = clamp(h, 56, 140);
    this.items.forEach((it, i) => Object.assign(it, { x: lx + (i % cols) * (w + gap), y: top + Math.floor(i / cols) * (h + gap), w, h, rows }));
    this.box = { sheet };
  }

  update(dt, isTop) {
    this.layout();
    this.buttons = [...this.items.filter((it) => !it.sold), ...this.services, this.leave];
    super.update(dt, isTop);
  }

  render(ctx) {
    this.layout();
    const { sheet } = this.box;
    const run = this.play.run;
    const a = this.appear;
    dim(ctx, this.frame, a * 1.2);
    ctx.save();
    ctx.globalAlpha = a;
    report(ctx, sheet.x, sheet.y, sheet.w, sheet.h, 'SUPPLY ROOM', { tone: C.ctYellow, kicker: kicker(this.play, run.depth), reserve: 170 });
    mono(ctx, `SCRAP ${run.scrap}`, sheet.x + sheet.w - 18, sheet.y + 33, 16, { weight: 700, color: '#2f7d43', align: 'right' });
    mono(ctx, 'SPEND IT HERE', sheet.x + sheet.w - 18, sheet.y + 48, 9, { weight: 600, color: C.formMuted, align: 'right' });

    this.items.forEach((it, i) => {
      const lift = it.hover && !it.sold ? 6 : 0;
      ctx.save();
      if (it.sold) ctx.globalAlpha *= 0.45;
      drawCard(ctx, it.card, it.x, it.y - lift, it.w, it.h, it.rows, i + 1, { hover: it.hover && !it.sold, keys: false });
      ctx.restore();
      this.priceTag(ctx, it, i, lift);
    });

    for (const s of this.services) {
      const off = s.ok && !s.ok();
      const price = s.price();
      const label = `${s.name.toUpperCase()} · ${price}`;
      this.drawButton(ctx, s, label, { primary: false, paper: true });
      if (off || run.scrap < price) {
        ctx.fillStyle = 'rgba(239,234,223,0.6)';
        ctx.fillRect(s.x, s.y, s.w, s.h);
      }
    }
    this.drawButton(ctx, this.leave, 'LEAVE THE SUPPLY ROOM', { key: 'ESC', paper: true });
    ctx.restore();
  }

  // The price on each shelf item, or why it can't be had.
  priceTag(ctx, it, i, lift) {
    const why = this.blocked(it);
    if (why === 'SOLD') {
      stampMark(ctx, 'SOLD', it.x + it.w / 2, it.y + it.h / 2, C.pen, 1, it.rows ? 16 : 22);
      return;
    }
    const label = why === 'ARSENAL FULL' ? 'ARSENAL FULL' : `${it.price} SCRAP`;
    const w = measure(ctx, label, 12, F.mono, 700) + 14;
    const x = it.x + it.w - w - 8;
    const y = it.y - lift + (it.rows ? 6 : it.h - 52);
    ctx.fillStyle = why ? C.pen : '#2f7d43';
    ctx.fillRect(x, y, w, 20);
    mono(ctx, label, x + w / 2, y + 11, 12, { weight: 700, color: C.paper, align: 'center', baseline: 'middle' });
    if (this.fine) keycap(ctx, String(i + 1), x - keyW(ctx, String(i + 1)) - 6, y + 10);
  }
}
