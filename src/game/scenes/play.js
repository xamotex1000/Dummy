// The arena: physics, dummies, projectiles, damage, and the round lifecycle.
// Overlays (title, work order, cards, game over) are pushed on top of it.

import { World, Point } from '../../engine/physics.js';
import { Particles } from '../../engine/particles.js';
import { RNG } from '../../engine/rng.js';
import { clamp } from '../../engine/math.js';
import { Dummy } from '../dummy.js';
import { WEAPONS, weaponDamageMult } from '../weapons.js';
import { makeRound, primaryProgress, secondaryEvent, secondaryComplete } from '../objectives.js';
import { Run } from '../run.js';
import { Sfx } from '../sfx.js';
import { Hud } from '../hud.js';
import { buildBackground } from '../background.js';
import { drawWeaponIcon } from '../icons.js';
import { C, F, font } from '../theme.js';
import { TitleOverlay, IntroOverlay, ClearOverlay, CardOverlay, GameOverOverlay, SecondWindOverlay } from './overlays.js';

const BEST_KEY = 'dummy-run-best';

function loadBest() {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    return 0;
  }
}

function saveBest(v) {
  try {
    localStorage.setItem(BEST_KEY, String(v));
  } catch {
    /* storage is optional */
  }
}

const newStats = () => ({ damage: 0, kills: 0, severs: 0, impact: 0, maxHit: 0 });

export class PlayScene {
  constructor(engine) {
    this.engine = engine;
    this.input = engine.input;
    this.dt = engine.step;
    this.world = new World({ gravity: 1900, iterations: 10 });
    this.world.onImpact = (p, speed) => this.onImpact(p, speed);
    this.world.onContact = (a, b, speed) => this.onContact(a, b, speed);
    this.particles = new Particles(1200);
    this.sfx = new Sfx(engine.audio);
    this.hud = new Hud(this);
    this.rng = new RNG(Date.now());
    this.dummies = [];
    this.projectiles = [];
    this.timers = [];
    this.spawnQueue = [];
    this.trail = [];
    this.cd = {};
    this.time = 0;
    this.run = null;
    this.round = null;
    this.stats = newStats();
    this.timeLeft = 0;
    this.state = 'title';
    this.weaponId = 'hands';
    this.grabbed = null;
    this.handTap = null;
    this.flameAt = null;
    this.pointerOwner = null;
    this.combo = { count: 0, t: 0 };
    this.stamp = null;
    this.bestRound = loadBest();
    this.layout = { w: 1, h: 1, hudH: 104, barH: 84, barTop: 1, floorY: 1, arenaTop: 104 };
    this.scale = 1;
  }

  // ---------------------------------------------------------------- layout

  resize(w, h) {
    const hudH = 104;
    const barH = clamp(Math.round(h * 0.11), 70, 92);
    const floorH = 14;
    this.layout = { w, h, hudH, barH, barTop: h - barH, floorY: h - barH - floorH, arenaTop: hudH };
    const L = this.layout;
    this.world.bounds = { left: 0, top: L.arenaTop, right: w, bottom: L.floorY };
    this.particles.floorY = L.floorY;
    this.scale = clamp(Math.min((L.floorY - L.arenaTop) / 520, w / 330), 0.45, 1.2);
    this.bg = buildBackground(w, h, L, this.engine.renderer.dpr);
    this.hud.layout();
  }

  // ------------------------------------------------------------- lifecycle

  showTitle() {
    this.state = 'title';
    this.clearArena();
    this.spawnDummy();
    this.engine.push(new TitleOverlay(this));
  }

  newRun() {
    const seed = (Date.now() ^ (Math.random() * 1e9)) >>> 0;
    this.run = new Run(seed);
    this.rng = new RNG(seed);
    this.weaponId = 'hands';
    this.hud.layout();
    this.startRound();
  }

  startRound() {
    this.clearArena();
    this.round = makeRound(this.run, this.rng);
    this.stats = newStats();
    this.timeLeft = this.round.time;
    this.combo = { count: 0, t: 0 };
    this.stamp = null;
    if (!this.run.weapons[this.weaponId]) this.weaponId = 'hands';
    this.hud.layout();
    this.spawnDummy();
    this.state = 'intro';
    this.engine.push(new IntroOverlay(this));
  }

  beginPlay() {
    this.state = 'playing';
    this.hud.showHint(WEAPONS[this.weaponId].hint);
  }

  clearRound() {
    const round = this.round;
    this.state = 'cleared';
    this.releaseGrab(false);
    secondaryComplete(round.secondary, this.timeLeft);
    this.run.totals.cleared++;
    if (round.secondary.state === 'done') this.run.totals.bonuses++;
    if (round.number > this.bestRound) {
      this.bestRound = round.number;
      saveBest(this.bestRound);
    }
    this.stamp = { text: 'CLEARED', t: 0, color: C.good };
    this.sfx.clear();
    this.engine.slowMo(0.3, 0.5);
    this.later(1.1, () => this.engine.push(new ClearOverlay(this)));
  }

  // Called by the clear overlay: bonus card first, then the regular pick.
  afterClear() {
    const queue = [];
    if (this.round.secondary.state === 'done') queue.push(true);
    if (this.round.cardAfter) queue.push(false);
    const next = () => {
      if (!queue.length) {
        this.run.round++;
        this.startRound();
        return;
      }
      const bonus = queue.shift();
      this.engine.push(new CardOverlay(this, { bonus, onDone: next }));
    };
    next();
  }

  failRound() {
    this.state = 'failed';
    this.releaseGrab(false);
    this.stamp = { text: "TIME'S UP", t: 0, color: C.bad };
    this.sfx.fail();
    this.later(1.1, () => {
      if (this.run.lives > 0) {
        this.engine.push(new SecondWindOverlay(this));
      } else {
        this.engine.push(new GameOverOverlay(this));
      }
    });
  }

  retryRound() {
    this.run.lives--;
    this.startRound();
  }

  clearArena() {
    for (const d of this.dummies) d.destroy();
    for (const p of this.projectiles) p.p.dead = true;
    this.dummies = [];
    this.projectiles = [];
    this.spawnQueue = [];
    this.timers = [];
    this.trail = [];
    this.grabbed = null;
    this.handTap = null;
  }

  later(t, fn) {
    this.timers.push({ t, fn });
  }

  // ----------------------------------------------------------------- spawning

  spawnDummy(x) {
    const L = this.layout;
    const rd = this.round?.dummy ?? { hp: 100, scale: 1 };
    const s = this.scale * rd.scale;
    const run = this.run;
    const margin = 60 * s;
    x = x ?? L.w / 2 + this.rng.range(-0.12, 0.12) * L.w;
    x = clamp(x, margin, Math.max(margin, L.w - margin));
    const y = L.arenaTop + 126 * s;
    const d = new Dummy(this.world, x, y, {
      scale: s,
      hp: rd.hp,
      limbFragility: run?.limbFragility ?? 1,
      bounce: run?.bounce ?? 0.25,
      boss: !!this.round?.boss,
    });
    this.dummies.push(d);
    return d;
  }

  spawnGrenade(x, y, { cluster = false, radius = 1, fuse = 1.3, mini = false } = {}) {
    const s = this.scale;
    const p = new Point(x, y, { r: (mini ? 6 : 9) * s, mass: 0.6, bounce: 0.45, friction: 0.7, group: 'proj' });
    const g = { kind: 'grenade', p, fuse, maxFuse: fuse, cluster, mini, R: 120 * s * radius * (mini ? 0.55 : 1), dmg: mini ? 16 : 40, radius };
    p.proj = g;
    p.setVelocity(this.rng.range(-60, 60), -200, this.dt);
    this.world.addPoint(p);
    this.projectiles.push(g);
    return g;
  }

  spawnAnvil(x) {
    const L = this.layout;
    const s = this.scale;
    x = clamp(x, 30 * s, L.w - 30 * s);
    const p = new Point(x, L.arenaTop + 30 * s, { r: 24 * s, mass: 12, bounce: 0.08, friction: 0.4, gravityScale: 1.7, group: 'proj' });
    const a = { kind: 'anvil', p, life: 3.2, hits: {} };
    p.proj = a;
    p.setVelocity(0, 400, this.dt);
    this.world.addPoint(p);
    this.projectiles.push(a);
    this.sfx.whoosh();
    return a;
  }

  // ------------------------------------------------------------ weapon API

  level(id) {
    return this.run ? this.run.level(id) : 1;
  }

  ready(key, cooldown) {
    if ((this.cd[key] ?? -1) > this.time) return false;
    this.cd[key] = this.time + cooldown;
    return true;
  }

  shake(amount) {
    this.engine.renderer.shake(amount);
  }

  hitAt(x, y, pad = 0) {
    let best = null;
    for (const d of this.dummies) {
      const h = d.hitPoint(x, y, pad);
      if (h && (!best || h.d < best.d)) best = h;
    }
    return best;
  }

  hitSwipe(x0, y0, x1, y1, pad = 0) {
    const hits = [];
    for (const d of this.dummies) {
      const h = d.hitSwipe(x0, y0, x1, y1, pad);
      if (h) hits.push(h);
    }
    return hits;
  }

  push(hit, vx, vy) {
    hit.dummy.impulse(hit.seg, hit.t ?? 0.5, vx, vy, this.dt);
  }

  // Direction pointing from the strike point through the dummy's middle.
  awayDir(dummy, x, y) {
    const c = dummy.center();
    let dx = c.x - x, dy = c.y - y;
    let d = Math.hypot(dx, dy);
    if (d < 8) {
      dx = x < this.layout.w / 2 ? 1 : -1;
      dy = -0.4;
      d = Math.hypot(dx, dy);
    }
    return { x: dx / d, y: dy / d };
  }

  grab(hit, x, y) {
    const p = hit.t < 0.5 ? hit.seg.a : hit.seg.b;
    p.pinned = true;
    this.grabbed = { dummy: hit.dummy, p, ox: p.x - x, oy: p.y - y };
    hit.dummy.lastHitBy = 'hands';
    hit.dummy.lastHitT = this.time;
  }

  releaseGrab(throwIt) {
    const g = this.grabbed;
    if (!g) return;
    g.p.pinned = false;
    if (throwIt) {
      const ptr = this.input.pointer;
      const sp = Math.hypot(ptr.vx, ptr.vy);
      const k = sp > 4200 ? 4200 / sp : 1;
      g.p.setVelocity(ptr.vx * k * 1.1, ptr.vy * k * 1.1, this.dt);
      g.dummy.lastHitT = this.time;
      if (sp > 900) this.sfx.whoosh();
    }
    this.grabbed = null;
  }

  updateGrab() {
    const g = this.grabbed;
    if (!g) return;
    if (!g.dummy.alive) {
      g.p.pinned = false;
      this.grabbed = null;
      return;
    }
    const ptr = this.input.pointer;
    g.ox *= 0.8;
    g.oy *= 0.8;
    const L = this.layout;
    const tx = clamp(ptr.x + g.ox, g.p.r, L.w - g.p.r);
    const ty = clamp(ptr.y + g.oy, L.arenaTop + g.p.r, L.floorY - g.p.r);
    g.p.px = g.p.x;
    g.p.py = g.p.y;
    g.p.x = tx;
    g.p.y = ty;
    g.dummy.lastHitBy = 'hands';
    g.dummy.lastHitT = this.time;
  }

  addBleed(dummy, seg, dps, duration, weapon) {
    const key = 'bleed:' + seg.name;
    const st = dummy.statuses.get(key);
    if (st) {
      st.dps = Math.min(dps * 4, st.dps + dps * 0.5);
      st.t = Math.max(st.t, duration);
    } else {
      dummy.statuses.set(key, { kind: 'bleed', seg, dps, t: duration, weapon, acc: 0 });
    }
  }

  addBurn(dummy, seg, dps, duration, weapon) {
    const key = 'burn:' + seg.name;
    const st = dummy.statuses.get(key);
    if (st) {
      st.dps = Math.max(st.dps, dps);
      st.t = Math.max(st.t, duration);
    } else {
      dummy.statuses.set(key, { kind: 'burn', seg, dps, t: duration, weapon, acc: 0, spread: 0 });
    }
  }

  addTrail(x, y) {
    this.trail.push({ x, y, t: this.time });
  }

  // ---------------------------------------------------------------- damage

  comboBonus() {
    return Math.min(0.6, this.combo.count * 0.05);
  }

  dealDamage(dummy, seg, base, weaponId, { kind = 'hit', x, y, limbMult = 1 } = {}) {
    if (!dummy.alive || base <= 0) return 0;
    const run = this.run;
    let amt = base * weaponDamageMult(this.level(weaponId));
    let crit = false;
    if (run) {
      amt *= run.dmgMult;
      if (seg.group === 'head') amt *= run.headMult;
      if (kind === 'impact') amt *= run.impactMult;
      if (kind !== 'dot' && this.rng.chance(run.critChance)) {
        amt *= run.critMult;
        crit = true;
      }
      if (run.combo && kind !== 'dot') {
        this.combo.count++;
        this.combo.t = 1.2;
        amt *= 1 + this.comboBonus();
      }
      if (run.adrenaline && this.state === 'playing' && this.timeLeft <= 10) amt *= 2;
    }

    const res = dummy.applyDamage(seg, amt, { limbMult });
    if (kind !== 'dot') {
      dummy.lastHitBy = weaponId;
      dummy.lastHitT = this.time;
    }

    const c = x === undefined ? dummy.segCenter(seg) : { x, y };
    this.fxNumber(c.x, c.y, amt, crit, kind);
    if (amt >= 30) {
      this.engine.hitStop(0.05);
      this.shake(0.25);
    }

    if (this.state === 'playing' && run) {
      const st = this.stats;
      st.damage += amt;
      if (kind === 'impact') st.impact += amt;
      if (kind !== 'dot') st.maxHit = Math.max(st.maxHit, amt);
      run.totals.damage += amt;
      run.weaponDamage[weaponId] = (run.weaponDamage[weaponId] ?? 0) + amt;
      this.bonusEvent('damage', { group: seg.group, weapon: weaponId, kind });
    }
    if (res.severed) this.onSever(dummy, res.severed);
    if (res.killed) this.onKill(dummy, weaponId);
    return amt;
  }

  bonusEvent(type, ev) {
    if (!this.round || this.state !== 'playing') return;
    if (secondaryEvent(this.round.secondary, type, ev)) {
      this.sfx.bonusFail();
      this.hud.secPulse = 0.6;
    }
  }

  onSever(dummy, key) {
    const limb = dummy.limbs[key];
    const j = limb.joint;
    this.fxFluff(j.x, j.y, 18, 1.4);
    this.fxText(j.x, j.y - 20, 'RIPPED', C.paper, 18);
    this.sfx.rip();
    this.shake(0.2);
    const c = dummy.center();
    const dx = j.x - c.x, dy = j.y - c.y;
    const d = Math.hypot(dx, dy) || 1;
    j.addVelocity((dx / d) * 600, (dy / d) * 600 - 300, this.dt);
    if (this.state === 'playing' && this.run) {
      this.stats.severs++;
      this.run.totals.severs++;
    }
  }

  onKill(dummy, weaponId) {
    const c = dummy.center();
    dummy.die(this.dt);
    if (this.grabbed?.dummy === dummy) this.releaseGrab(false);
    this.fxFluff(c.x, c.y, 46, 2.4);
    for (let i = 0; i < 2; i++) {
      this.particles.spawn({ kind: 'dot', x: dummy.points.head.x, y: dummy.points.head.y, vx: this.rng.range(-400, 400), vy: this.rng.range(-700, -300), gravity: 1600, size: 4.5 * dummy.s, color: C.button, life: 1.6, bounce: 0.5 });
    }
    this.fxText(c.x, c.y - 50 * dummy.s, 'DESTROYED', C.gold, 24);
    this.sfx.pop();
    this.shake(0.45);
    this.engine.slowMo(0.35, 0.25);

    if (this.state === 'playing' && this.run) {
      this.stats.kills++;
      this.run.totals.kills++;
      this.bonusEvent('kill', {});
      if (this.run.shatter) {
        this.later(0.05, () => this.explode(c.x, c.y, 150 * this.scale, 30, weaponId, { silentSize: 0.7 }));
      }
      if (!this.round.boss) {
        const alive = this.dummies.filter((d) => d.alive).length + this.spawnQueue.reduce((n, q) => n + q.count, 0);
        const count = this.rng.chance(this.run.hydraChance) ? 2 : 1;
        const room = Math.max(0, 4 - alive);
        if (room > 0) this.spawnQueue.push({ t: 0.9, count: Math.min(count, room) });
      }
    }
  }

  explode(x, y, R, dmg, weaponId, { silentSize = 1 } = {}) {
    for (const d of this.dummies) {
      if (!d.alive) continue;
      const n = d.nearest(x, y);
      if (n.d < R) this.dealDamage(d, n.seg, dmg * (0.35 + 0.65 * (1 - n.d / R)), weaponId, { x: n.x, y: n.y });
    }
    const reach = R * 1.5;
    for (const p of this.world.points) {
      if (p.pinned) continue;
      const dx = p.x - x, dy = p.y - y;
      const d = Math.hypot(dx, dy);
      if (d >= reach || d < 0.01) continue;
      const f = 1900 * (1 - d / reach) * (p.proj?.kind === 'anvil' ? 0.1 : 1);
      p.addVelocity((dx / d) * f, (dy / d) * f - f * 0.25, this.dt);
    }
    for (const d of this.dummies) {
      if (d.alive) {
        const n = d.nearest(x, y);
        if (n.d < reach) {
          d.lastHitBy = weaponId;
          d.lastHitT = this.time;
        }
      }
    }
    this.fxExplosion(x, y, R);
    this.sfx.boom(silentSize);
    this.shake(0.55 * silentSize);
    this.engine.hitStop(0.04);
  }

  // ------------------------------------------------------- physics callbacks

  onImpact(p, speed) {
    if (p.proj) {
      if (p.proj.kind === 'anvil' && speed > 400) {
        this.sfx.clang();
        this.fxDust(p.x, p.y + p.r, 10);
        this.shake(0.25);
      } else if (p.proj.kind === 'grenade' && speed > 200) {
        this.sfx.tick();
      }
      return;
    }
    const d = p.owner;
    if (!d) return;
    if (speed > 320) {
      this.fxDust(p.x, p.y, Math.min(6, Math.floor(speed / 400)));
      this.sfx.thud(Math.min(1, speed / 2200));
    }
    if (!d.alive || speed < 650 || p.impactCd > 0) return;
    // Only blame impacts on the player if they recently hit or threw the dummy.
    if (!d.lastHitBy || this.time - d.lastHitT > 3) return;
    p.impactCd = 0.12;
    let dmg = (speed - 650) * 0.022;
    if (d.lastHitBy === 'hands' && this.level('hands') >= 3) dmg *= 1.5;
    this.dealDamage(d, d.segForPoint(p), dmg, d.lastHitBy, { kind: 'impact', x: p.x, y: p.y });
  }

  onContact(a, b, speed) {
    const proj = a.proj ? a : b.proj ? b : null;
    const other = proj === a ? b : a;
    if (!proj || !other.owner) return;
    const kind = proj.proj.kind;
    const d = other.owner;
    if (kind === 'grenade') {
      if (speed > 200) this.sfx.tick();
      return;
    }
    if (kind !== 'anvil' || speed < 300 || !d.alive) return;
    const hits = proj.proj.hits;
    if ((hits[d.id] ?? -1) > this.time) return;
    hits[d.id] = this.time + 0.5;
    const dmg = (30 + speed * 0.012) * (this.level('anvil') >= 3 ? 1.8 : 1);
    this.dealDamage(d, d.segForPoint(other), dmg, 'anvil', { x: other.x, y: other.y });
    other.addVelocity(0, Math.min(1500, speed * 0.6), this.dt);
    this.fxFluff(other.x, other.y, 10, 1.2);
    this.sfx.clang();
    this.sfx.punch();
    this.shake(0.35);
  }

  // ------------------------------------------------------------------ input

  selectWeapon(id) {
    if (!this.run?.weapons[id] && this.run) return;
    if (this.weaponId === id) return;
    this.releaseGrab(false);
    this.handTap = null;
    this.weaponId = id;
    this.sfx.select();
    if (this.state === 'playing') this.hud.showHint(WEAPONS[id].hint);
  }

  handleInput(dt) {
    const p = this.input.pointer;
    for (const key of this.input.keysPressed) {
      const idx = Number(key) - 1;
      const owned = this.run?.owned ?? [];
      if (idx >= 0 && idx < owned.length) this.selectWeapon(owned[idx]);
    }
    const W = WEAPONS[this.weaponId];
    if (p.pressed) {
      if (this.hud.isUi(p.x, p.y)) {
        this.pointerOwner = 'ui';
        this.hud.press(p.x, p.y);
      } else {
        this.pointerOwner = 'arena';
        W.press?.(this, p.x, p.y);
      }
    }
    if (p.down && this.pointerOwner === 'arena') {
      W.hold?.(this, p.lastX, p.lastY, p.x, p.y, dt);
    }
    if (p.released) {
      if (this.pointerOwner === 'arena') W.release?.(this, p.x, p.y);
      this.pointerOwner = null;
    }
  }

  // ----------------------------------------------------------------- update

  update(dt, isTop) {
    this.time += dt;
    this.flameAt = null;
    if (this.state === 'playing') this.timeLeft -= dt;
    if (this.state === 'playing' && isTop) {
      this.handleInput(dt);
    } else if (this.pointerOwner) {
      this.releaseGrab(false);
      this.handTap = null;
      this.pointerOwner = null;
    }
    this.updateGrab();

    for (const d of this.dummies) this.tickStatuses(d, dt);
    this.world.step(dt);
    this.updateProjectiles(dt);

    for (const d of this.dummies) d.update(dt);
    this.dummies = this.dummies.filter((d) => !d.gone);

    for (let i = this.spawnQueue.length - 1; i >= 0; i--) {
      const q = this.spawnQueue[i];
      q.t -= dt;
      if (q.t > 0) continue;
      this.spawnQueue.splice(i, 1);
      if (this.state !== 'playing') continue;
      const L = this.layout;
      if (q.count === 1) this.spawnDummy();
      else for (let k = 0; k < q.count; k++) this.spawnDummy(L.w * (0.3 + 0.4 * k));
    }

    for (let i = this.timers.length - 1; i >= 0; i--) {
      const t = this.timers[i];
      t.t -= dt;
      if (t.t <= 0) {
        this.timers.splice(i, 1);
        t.fn();
      }
    }

    this.trail = this.trail.filter((t) => this.time - t.t < 0.14);
    this.particles.update(dt);
    this.hud.update(dt);
    if (this.combo.t > 0) {
      this.combo.t -= dt;
      if (this.combo.t <= 0) this.combo.count = 0;
    }
    if (this.stamp) this.stamp.t += dt;

    if (this.state === 'playing') {
      if (primaryProgress(this.round, this.stats) >= this.round.primary.target) this.clearRound();
      else if (this.timeLeft <= 0) {
        this.timeLeft = 0;
        this.failRound();
      }
    }
  }

  tickStatuses(d, dt) {
    if (!d.alive) {
      d.statuses.clear();
      return;
    }
    for (const [key, st] of d.statuses) {
      st.t -= dt;
      st.acc += dt;
      const c = d.segCenter(st.seg);
      if (st.kind === 'burn') {
        st.seg.char = Math.min(1, st.seg.char + dt * 0.15);
        if (this.rng.chance(0.5)) {
          this.particles.spawn({
            kind: 'fire', x: c.x + this.rng.range(-st.seg.r, st.seg.r), y: c.y + this.rng.range(-st.seg.r, st.seg.r),
            vx: this.rng.range(-20, 20), vy: this.rng.range(-140, -60), size: this.rng.range(4, 8) * d.s,
            color: C.fire, color2: C.fire2, life: this.rng.range(0.25, 0.5),
          });
        }
        if (this.level('flame') >= 3) {
          st.spread += dt;
          if (st.spread > 0.5) {
            st.spread = 0;
            for (const other of d.segs) {
              if (other === st.seg || d.statuses.has('burn:' + other.name)) continue;
              const oc = d.segCenter(other);
              if (Math.hypot(oc.x - c.x, oc.y - c.y) < 50 * d.s && this.rng.chance(0.35)) {
                this.addBurn(d, other, st.dps, 2.5, st.weapon);
              }
            }
          }
        }
      } else if (this.rng.chance(0.12)) {
        this.particles.spawn({ kind: 'dot', x: c.x, y: c.y, vx: this.rng.range(-30, 30), vy: 0, gravity: 1400, size: 2.4 * d.s, color: C.blood, life: 0.7, bounce: 0 });
      }
      if (st.acc >= 0.3) {
        st.acc -= 0.3;
        this.dealDamage(d, st.seg, st.dps * 0.3, st.weapon, { kind: 'dot' });
        if (!d.alive) return;
      }
      if (st.t <= 0) d.statuses.delete(key);
    }
  }

  updateProjectiles(dt) {
    for (const pr of this.projectiles) {
      if (pr.kind === 'grenade') {
        pr.fuse -= dt;
        if (pr.fuse <= 0 && !pr.p.dead) {
          pr.p.dead = true;
          this.explode(pr.p.x, pr.p.y, pr.R, pr.dmg, 'grenade', { silentSize: pr.mini ? 0.5 : 1 });
          if (pr.cluster && !pr.mini) {
            for (let i = 0; i < 3; i++) {
              const g = this.spawnGrenade(pr.p.x, pr.p.y - 6, { mini: true, fuse: 0.45 + i * 0.12, radius: pr.radius });
              g.p.setVelocity(this.rng.range(-420, 420), this.rng.range(-700, -400), dt);
            }
          }
        }
      } else if (pr.kind === 'anvil') {
        pr.life -= dt;
        if (pr.life <= 0) pr.p.dead = true;
      }
    }
    this.projectiles = this.projectiles.filter((pr) => !pr.p.dead);
  }

  // --------------------------------------------------------------- effects

  fxNumber(x, y, amt, crit, kind) {
    const shown = Math.max(1, Math.round(amt));
    if (kind === 'dot' && this.rng.chance(0.5)) return;
    const size = kind === 'dot' ? 13 : Math.min(34, 15 + amt * 0.45) * (crit ? 1.25 : 1);
    const color = crit ? C.gold : kind === 'dot' ? '#ffb48a' : kind === 'impact' ? C.paper : C.accent;
    this.particles.spawn({
      kind: 'text', text: crit ? `${shown}!` : String(shown), font: font(size, F.display, 400), color,
      x: x + this.rng.range(-8, 8), y: y - 10, vx: this.rng.range(-40, 40), vy: -110, drag: 2.5, life: kind === 'dot' ? 0.6 : 0.9,
      rot: this.rng.range(-0.15, 0.15),
    });
  }

  fxText(x, y, text, color, size = 20) {
    this.particles.spawn({ kind: 'text', text, font: font(size, F.display, 400), color, x, y, vx: 0, vy: -70, drag: 2, life: 1.1 });
  }

  fxHit(x, y, dir, power = 1) {
    const n = Math.round(4 + power * 6);
    for (let i = 0; i < n; i++) {
      const a = Math.atan2(dir.y, dir.x) + this.rng.range(-0.9, 0.9);
      const sp = this.rng.range(200, 600) * (0.6 + power * 0.4);
      this.particles.spawn({ kind: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, size: 2.5, color: C.paper, life: 0.2, drag: 6 });
    }
    this.particles.spawn({ kind: 'ring', x, y, size: 6, grow: 180 * (0.6 + power * 0.4), color: C.paper, life: 0.18 });
    this.fxFluff(x, y, Math.round(2 + power * 3), 0.8);
  }

  fxFluff(x, y, n, spread = 1) {
    for (let i = 0; i < n; i++) {
      const a = this.rng.range(0, Math.PI * 2);
      const sp = this.rng.range(80, 380) * spread;
      this.particles.spawn({
        kind: 'fluff', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 120, gravity: 500, drag: 2.2,
        size: this.rng.range(2.5, 5.5) * this.scale, color: this.rng.chance(0.85) ? C.fluff : C.paperDim, life: this.rng.range(0.6, 1.4), bounce: 0.1,
      });
    }
  }

  fxSparks(x, y, n, color) {
    for (let i = 0; i < n; i++) {
      const a = this.rng.range(0, Math.PI * 2);
      const sp = this.rng.range(150, 500);
      this.particles.spawn({ kind: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, size: 2, color, life: 0.22, drag: 5 });
    }
  }

  fxDust(x, y, n) {
    for (let i = 0; i < n; i++) {
      this.particles.spawn({ kind: 'smoke', x: x + this.rng.range(-8, 8), y, vx: this.rng.range(-90, 90), vy: this.rng.range(-60, -10), size: this.rng.range(3, 7), grow: 18, color: C.wallDark, life: 0.5, drag: 3 });
    }
  }

  fxMuzzle(x, y) {
    this.particles.spawn({ kind: 'ring', x, y, size: 4, grow: 160, color: C.gold, life: 0.12 });
    this.particles.spawn({ kind: 'dot', x, y, size: 10, grow: -60, color: '#fff3b0', life: 0.08 });
  }

  fxFlame(x, y) {
    for (let i = 0; i < 3; i++) {
      this.particles.spawn({
        kind: 'fire', x: x + this.rng.range(-6, 6), y: y + this.rng.range(-6, 6),
        vx: this.rng.range(-90, 90), vy: this.rng.range(-260, -120), drag: 1.5, size: this.rng.range(8, 15) * this.scale,
        color: C.fire, color2: C.fire2, life: this.rng.range(0.25, 0.45),
      });
    }
  }

  fxExplosion(x, y, R) {
    this.particles.spawn({ kind: 'ring', x, y, size: R * 0.2, grow: R * 5, color: C.paper, life: 0.22 });
    this.particles.spawn({ kind: 'dot', x, y, size: R * 0.55, grow: -R * 2, color: '#fff3b0', life: 0.14 });
    for (let i = 0; i < 18; i++) {
      const a = this.rng.range(0, Math.PI * 2);
      const sp = this.rng.range(100, 500);
      this.particles.spawn({ kind: 'fire', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 100, drag: 3, size: this.rng.range(10, 22) * this.scale, color: C.fire, color2: C.fire2, life: this.rng.range(0.3, 0.6) });
    }
    for (let i = 0; i < 10; i++) {
      const a = this.rng.range(0, Math.PI * 2);
      this.particles.spawn({ kind: 'smoke', x, y, vx: Math.cos(a) * 120, vy: Math.sin(a) * 120 - 60, size: this.rng.range(10, 20), grow: 40, color: '#4a4f48', life: this.rng.range(0.6, 1.1), drag: 2 });
    }
    this.fxSparks(x, y, 12, C.gold);
  }

  // ----------------------------------------------------------------- render

  render(ctx, r) {
    const L = this.layout;
    ctx.drawImage(this.bg, 0, 0, L.w, L.h);
    ctx.save();
    ctx.translate(r.ox, r.oy);

    // Stenciled round number on the padding.
    if (this.round && this.state !== 'title') {
      ctx.save();
      ctx.font = font(Math.min(L.w * 0.5, (L.floorY - L.arenaTop) * 0.5), F.display, 400);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(40,52,40,0.08)';
      ctx.fillText(String(this.round.number).padStart(2, '0'), L.w / 2, (L.arenaTop + L.floorY) / 2);
      ctx.restore();
    }

    for (const d of this.dummies) {
      const pelvis = d.points.pelvis;
      const h = clamp((L.floorY - pelvis.y) / 400, 0, 1);
      ctx.fillStyle = `rgba(20,26,20,${0.22 * (1 - h)})`;
      ctx.beginPath();
      ctx.ellipse(pelvis.x, L.floorY + 2, 40 * d.s * (1 - h * 0.5), 6 * d.s, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const d of this.dummies) d.draw(ctx);
    for (const pr of this.projectiles) this.drawProjectile(ctx, pr);
    this.renderTrail(ctx);
    this.particles.render(ctx);
    this.renderCursor(ctx);
    this.renderStamp(ctx);
    ctx.restore();
    this.hud.render(ctx);
  }

  drawProjectile(ctx, pr) {
    const p = pr.p;
    if (pr.kind === 'grenade') {
      const size = (pr.mini ? 18 : 26) * this.scale;
      drawWeaponIcon(ctx, 'grenade', p.x, p.y, size, { angle: (p.x - p.px) * 0.05 });
      const blink = pr.fuse < 0.5 ? Math.floor(pr.fuse * 20) % 2 : Math.floor(pr.fuse * 6) % 2;
      if (blink) {
        ctx.fillStyle = C.bad;
        ctx.beginPath();
        ctx.arc(p.x, p.y - size * 0.35, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (pr.kind === 'anvil') {
      ctx.globalAlpha = clamp(pr.life / 0.4, 0, 1);
      drawWeaponIcon(ctx, 'anvil', p.x, p.y, p.r * 2.4);
      ctx.globalAlpha = 1;
    }
  }

  renderTrail(ctx) {
    if (this.trail.length < 2) return;
    const knife = this.weaponId === 'knife';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let i = 1; i < this.trail.length; i++) {
      const a = this.trail[i - 1], b = this.trail[i];
      const age = (this.time - b.t) / 0.14;
      ctx.globalAlpha = clamp(1 - age, 0, 1) * 0.7;
      ctx.strokeStyle = knife ? '#ffffff' : C.paperDim;
      ctx.lineWidth = (knife ? 3 : 12) * (1 - age * 0.6);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  renderCursor(ctx) {
    if (this.state !== 'playing') return;
    const p = this.input.pointer;
    if (!p.inside || this.hud.isUi(p.x, p.y)) return;
    if (p.type !== 'mouse' && !p.down) return;
    WEAPONS[this.weaponId].cursor?.(ctx, this, p.x, p.y, p.down);
  }

  renderStamp(ctx) {
    if (!this.stamp) return;
    const L = this.layout;
    const t = this.stamp.t;
    const k = t < 0.15 ? 2.2 - (t / 0.15) * 1.2 : 1;
    ctx.save();
    ctx.translate(L.w / 2, (L.arenaTop + L.floorY) / 2);
    ctx.rotate(-0.12);
    ctx.scale(k, k);
    ctx.globalAlpha = clamp(t / 0.1, 0, 1);
    ctx.font = font(Math.min(64, L.w * 0.13), F.display, 400);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const w = ctx.measureText(this.stamp.text).width + 36;
    ctx.strokeStyle = this.stamp.color;
    ctx.lineWidth = 6;
    ctx.strokeRect(-w / 2, -44, w, 88);
    ctx.fillStyle = this.stamp.color;
    ctx.fillText(this.stamp.text, 0, 4);
    ctx.restore();
  }
}

