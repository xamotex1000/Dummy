// The arena: physics, dummies, projectiles, damage, and the run's flow.
// Overlays (title, routes, work orders, cards, game over) are pushed on top.
//
// A run: pick a starter weapon, then three acts of five floors. Floors 1-4
// are chosen from a route of tickets; floor 5 is the act boss.

import { World } from '../../engine/physics.js';
import { PivotBody } from '../../engine/pivot.js';
import { Particles } from '../../engine/particles.js';
import { RNG } from '../../engine/rng.js';
import { clamp } from '../../engine/math.js';
import { Dummy } from '../dummy.js';
import { WEAPONS, weaponDamageMult } from '../weapons.js';
import { makeRound, makeRoute, primaryProgress, secondaryEvent, secondaryComplete } from '../objectives.js';
import { starterOffer, starterTrapOffer } from '../cards.js';
import { Run } from '../run.js';
import { VARIANTS, ACTS } from '../variants.js';
import { StatusSystem } from '../statuses.js';
import { Entrance } from '../entrances.js';
import { Gore } from '../gore.js';
import { Heart, newHeartRecord } from '../heart.js';
import { settings } from '../settings.js';
import { applyTree, payRun } from '../meta.js';
import { saveRun, loadRun, clearRun } from '../save.js';
import { recordScore, runScore } from '../scores.js';
import { TRAPS, createTrap, mountById } from '../traps.js';
import {
  spawnGrenade, spawnAnvil, spawnVortex, updateProjectiles, drawProjectile,
  projectileImpact, projectileContact, activeVortexes, collapseVortex,
} from '../projectiles.js';
import { Sfx } from '../sfx.js';
import { Hud } from '../hud.js';
import { buildBackground } from '../background.js';
import { computeLayout } from '../layout.js';
import { drawHeldWeapon } from '../icons.js';
import { C, F, font } from '../theme.js';
import {
  TitleOverlay, IntroOverlay, ClearOverlay, CardOverlay, GameOverOverlay, SecondWindOverlay,
  PauseOverlay, RouteOverlay, ActOverlay, VictoryOverlay,
} from './overlays.js';

const GRAVITY = 1900;
// Damage from the arena itself: it hurts dummies but isn't the player's.
const ENV = new Set(['vent']);

function load(key) {
  try {
    return Number(localStorage.getItem(key)) || 0;
  } catch {
    return 0;
  }
}

function save(key, v) {
  try {
    localStorage.setItem(key, String(v));
  } catch {
    /* storage is optional */
  }
}

// Per-region damage and a damage trace feed the results sheet.
const newStats = () => ({ damage: 0, kills: 0, severs: 0, impact: 0, maxHit: 0, reactions: 0, trapDamage: 0, elapsed: 0, regions: {}, trace: [], traceAcc: 0, traceLast: 0, heart: newHeartRecord() });
const TRACE_STEP = 0.25;

// Distinct damage sources within this window stack the chain multiplier.
const CHAIN_WINDOW = 2;
const CHAIN_STEP = 0.15;

export class PlayScene {
  constructor(engine) {
    this.engine = engine;
    this.input = engine.input;
    this.dt = engine.step;
    this.world = new World({ gravity: GRAVITY, iterations: 10 });
    this.world.onImpact = (p, speed) => this.onImpact(p, speed);
    this.world.onContact = (a, b, speed) => this.onContact(a, b, speed);
    this.particles = new Particles(1400);
    this.gore = new Gore(this);
    this.heart = new Heart();
    this.sfx = new Sfx(engine.audio);
    this.hud = new Hud(this);
    this.status = new StatusSystem(this);
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
    this.node = null;
    this.stats = newStats();
    this.timeLeft = 0;
    this.state = 'title';
    this.weaponId = 'hands';
    this.grabbed = null;
    this.handTap = null;
    this.held = null; // the gripped weapon's PivotBody, when the hand is in the arena
    this.facing = 1; // which way held weapons point: toward the nearest dummy
    this.pointerOwner = null;
    this.beam = null;
    this.vent = null;
    this.combo = { count: 0, t: 0 };
    this.stamp = null;
    this.theme = 'cell';
    this.entrance = new Entrance(this, 'cell');
    this.awaitingEntry = false; // the clock waits until the first dummy is in
    this.machine = []; // live trap instances built from run.traps
    this.chain = new Map(); // damage source -> last time it landed a hit
    this.bestDepth = load('crash-test-best');
    this.wins = load('crash-test-wins');
    this.layout = computeLayout(engine.width, engine.height);
    // The pointer in world units, refreshed every tick.
    this.ptr = { x: 0, y: 0, lastX: 0, lastY: 0, vx: 0, vy: 0, speed: 0 };
  }

  get bounds() {
    return this.world.bounds;
  }

  // ---------------------------------------------------------------- layout

  resize(w, h) {
    const L = (this.layout = computeLayout(w, h));
    this.world.bounds = { left: 0, top: 0, right: L.worldW, bottom: L.worldH };
    this.particles.floorY = L.worldH;
    this.bg = buildBackground(L, this.engine.renderer.dpr, this.theme);
    this.hud.layout();
  }

  setTheme(theme) {
    if (theme === this.theme) return;
    this.theme = theme;
    this.entrance = new Entrance(this, theme);
    this.bg = buildBackground(this.layout, this.engine.renderer.dpr, theme);
  }

  // Screen pixels to world units.
  toWorld(x, y) {
    const L = this.layout;
    return { x: (x - L.arena.x) / L.k, y: (y - L.arena.y) / L.k };
  }

  inArena(x, y) {
    const A = this.layout.arena;
    return x >= A.x && x <= A.x + A.w && y >= A.y && y <= A.y + A.h;
  }

  syncPointer() {
    const p = this.input.pointer;
    const k = this.layout.k;
    const cur = this.toWorld(p.x, p.y);
    const last = this.toWorld(p.lastX, p.lastY);
    Object.assign(this.ptr, { x: cur.x, y: cur.y, lastX: last.x, lastY: last.y, vx: p.vx / k, vy: p.vy / k, speed: p.speed / k });
  }

  pause() {
    if (this.state !== 'playing' || this.engine.top() !== this) return;
    this.releaseGrab(false);
    this.handTap = null;
    this.pointerOwner = null;
    this.engine.push(new PauseOverlay(this));
  }

  // Desktop: losing focus mid-round pauses instead of burning the clock.
  blur() {
    this.pause();
  }

  quitToTitle() {
    for (const s of this.engine.scenes.slice()) if (s !== this) this.engine.remove(s);
    this.run = null;
    this.machine = [];
    this.round = null;
    this.hud.layout();
    this.showTitle();
  }

  // ------------------------------------------------------------- run flow

  showTitle() {
    this.state = 'title';
    this.setTheme('cell');
    this.world.gravity = GRAVITY;
    this.clearArena();
    this.queueDummy();
    this.engine.push(new TitleOverlay(this));
  }

  // Picks up a saved run where it was saved: the act screen or the route.
  continueRun() {
    const data = loadRun();
    if (!data) return this.newRun();
    const run = Object.assign(new Run(data.run.seed), data.run);
    this.run = run;
    this.rng = new RNG((run.seed ^ Math.imul(run.depth, 7919) ^ data.savedAt) >>> 0);
    this.round = null;
    this.weaponId = 'hands';
    this.hud.layout();
    this.rebuildMachine();
    if (data.at === 'act') this.showAct();
    else {
      this.setTheme(run.actDef.theme);
      this.world.gravity = GRAVITY * run.actDef.gravity;
      this.showRoute();
    }
  }

  newRun() {
    clearRun();
    const seed = (Date.now() ^ (Math.random() * 1e9)) >>> 0;
    this.run = new Run(seed);
    this.rng = new RNG(seed);
    const run = this.run;
    if (settings.rogueLite) applyTree(run);
    this.round = null;
    this.state = 'between';
    this.weaponId = 'hands';
    this.hud.layout();
    // Starting picks: a weapon and a trap, or two of each with the tree.
    const steps = [];
    const weaponPick = (title, subtitle) => (next) => new CardOverlay(this, {
      offer: starterOffer(this.rng).filter((c) => !run.weapons[c.icon]),
      title, subtitle, rerolls: false, onDone: next,
    });
    const trapPick = (title, subtitle) => (next) => new CardOverlay(this, {
      offer: starterTrapOffer(this.rng).filter((c) => !run.trapLevel(c.trap)),
      title, subtitle, rerolls: false, onDone: next,
    });
    steps.push(weaponPick('CHOOSE YOUR TOOL', 'Pick the weapon you start with. Your hands are always free.'));
    if (run.extraStarter) steps.push(weaponPick('SPARE HOLSTER', 'Your facility upgrades allow a second starting weapon.'));
    steps.push(trapPick('INSTALL YOUR FIRST TRAP', 'Traps run on their own. You will place it on the next screen.'));
    if (run.extraTrap) steps.push(trapPick('SECOND INSTALL', 'Your facility upgrades allow a second starting trap.'));
    const finish = () => {
      for (const id of run.owned) if (id !== 'hands') run.weapons[id].level = Math.max(run.weapons[id].level, run.startLevel);
      if (run.prewired && run.traps[0]) run.trapLevels[run.traps[0].id] += 1;
      this.rebuildMachine();
      this.showAct();
    };
    const runSteps = (i) => (i < steps.length ? this.engine.push(steps[i](() => runSteps(i + 1))) : finish());
    runSteps(0);
  }

  rebuildMachine() {
    this.machine = this.run ? this.run.traps.map((t) => createTrap(t.id, t.mount, this.run.trapLevel(t.id))) : [];
    this.syncMachine();
  }

  // Mount positions follow the arena size; levels follow upgrades.
  syncMachine() {
    for (const t of this.machine) {
      t.m = mountById(this.bounds, t.mountId);
      t.level = this.run.trapLevel(t.id);
    }
  }

  // How many different things have hit something in the last couple of seconds.
  get chainCount() {
    return this.chain.size;
  }

  chainBonus() {
    return Math.max(0, this.chainCount - 1) * (CHAIN_STEP + (this.run?.chainStep ?? 0));
  }

  showAct() {
    saveRun(this.run, 'act');
    this.state = 'between';
    this.setTheme(this.run.actDef.theme);
    this.world.gravity = GRAVITY * this.run.actDef.gravity;
    this.engine.push(new ActOverlay(this, () => this.showRoute()));
  }

  showRoute() {
    saveRun(this.run, 'route');
    this.state = 'between';
    const route = makeRoute(this.run, this.rng);
    this.engine.push(new RouteOverlay(this, route, (node) => this.chooseNode(node)));
  }

  chooseNode(node) {
    if (node.type === 'workshop') {
      this.run.workshopUsed = this.run.actIndex;
      this.engine.push(new CardOverlay(this, {
        kinds: ['upgrade'],
        count: 4,
        title: 'WORKSHOP',
        subtitle: 'No dummy this floor. Upgrade one weapon.',
        onDone: () => this.nextFloor(),
      }));
      return;
    }
    this.node = node;
    this.startRound(node.round);
  }

  startRound(round) {
    this.clearArena();
    this.round = round;
    this.run.lastPrimary = round.primary.type;
    this.stats = newStats();
    this.heart.reset();
    this.chain.clear();
    this.rebuildMachine();
    this.timeLeft = round.time;
    this.combo = { count: 0, t: 0 };
    this.stamp = null;
    this.vent = round.env.vents ? { phase: 'idle', t: 2.5, x: 0, tt: 0, acc: 0 } : null;
    this.setTheme(this.run.actDef.theme);
    this.world.gravity = GRAVITY * round.env.gravity;
    if (!this.run.weapons[this.weaponId]) this.weaponId = 'hands';
    this.hud.layout();
    this.state = 'intro';
    this.engine.push(new IntroOverlay(this));
  }

  // Dummies come in through the act's entrance once the player is ready.
  beginPlay() {
    this.state = 'playing';
    this.awaitingEntry = true;
    this.spawnWave(this.round.dummy.count);
    this.hud.showHint(WEAPONS[this.weaponId].hint);
  }

  clearRound() {
    const round = this.round;
    this.state = 'cleared';
    this.releaseGrab(false);
    secondaryComplete(round.secondary, this.timeLeft);
    this.run.totals.cleared++;
    if (round.secondary.state === 'done') this.run.totals.bonuses++;
    if (round.number > this.bestDepth) {
      this.bestDepth = round.number;
      save('crash-test-best', this.bestDepth);
    }
    this.stamp = { text: 'CLEARED', t: 0, color: C.good };
    this.sfx.clear();
    this.engine.slowMo(0.3, 0.5);
    this.later(1.1, () => this.engine.push(new ClearOverlay(this)));
  }

  // Called by the clear overlay: the bonus card, then the floor's reward.
  afterClear() {
    const round = this.round;
    const queue = [];
    if (round.secondary.state === 'done') queue.push({ bonus: true, title: 'BONUS CARD', subtitle: 'You hit the bonus. Take one more.' });
    if (round.reward === 'card') queue.push({});
    if (round.reward === 'rare') queue.push({ bonus: true, count: this.run.choices + 1, title: 'ELITE REWARD', subtitle: 'Rarer cards, and one more to choose from.' });
    if (round.reward === 'weapon') queue.push({ kinds: ['weapon'], title: 'WEAPON CRATE', subtitle: 'Pry it open. One new weapon.' });
    if (round.reward === 'boss') queue.push({ bonus: true, title: 'BOSS REWARD', subtitle: `${VARIANTS[round.variant].name} is down. Take your pick.` });
    const next = () => {
      if (queue.length) {
        this.engine.push(new CardOverlay(this, { ...queue.shift(), onDone: next }));
        return;
      }
      const run = this.run;
      if (round.boss) run.rerolls += run.bossRerolls;
      if (round.boss && run.act === ACTS.length && !run.endless) {
        run.won = true;
        this.wins++;
        save('crash-test-wins', this.wins);
        this.endRun();
        this.engine.push(new VictoryOverlay(this));
        return;
      }
      this.nextFloor();
    };
    next();
  }

  nextFloor() {
    if (this.run.advance()) this.showAct();
    else this.showRoute();
  }

  goEndless() {
    this.run.endless = true;
    this.nextFloor();
  }

  failRound() {
    this.state = 'failed';
    this.releaseGrab(false);
    this.stamp = { text: "TIME'S UP", t: 0, color: C.bad };
    this.sfx.fail();
    this.later(1.1, () => {
      if (this.run.lives > 0) this.engine.push(new SecondWindOverlay(this));
      else {
        this.endRun();
        clearRun();
        this.engine.push(new GameOverOverlay(this));
      }
    });
  }

  // The run ends (or is won): rogue-lite credits go into the facility
  // budget, and the run goes on the high score table.
  endRun() {
    const run = this.run;
    run.payout = settings.rogueLite ? payRun(run) : 0;
    run.score = runScore(run);
    run.rank = recordScore(run, settings.rogueLite ? 'ROGUE-LITE' : 'ROGUELIKE');
  }

  // Same ticket, freshly rolled.
  retryRound() {
    this.run.lives--;
    const n = this.node;
    this.startRound(makeRound(this.run, this.rng, { type: n.type, variant: n.variant, twist: n.twist }));
  }

  clearArena() {
    this.gore.clear();
    this.held = null;
    this.entrance.reset();
    this.awaitingEntry = false;
    for (const d of this.dummies) d.destroy();
    for (const p of this.projectiles) p.p.dead = true;
    this.dummies = [];
    this.projectiles = [];
    this.spawnQueue = [];
    this.timers = [];
    this.trail = [];
    this.grabbed = null;
    this.handTap = null;
    this.beam = null;
  }

  later(t, fn) {
    this.timers.push({ t, fn });
  }

  // ----------------------------------------------------------------- spawning

  spawnWave(count) {
    for (let k = 0; k < count; k++) this.queueDummy();
  }

  // Send a dummy in through the entrance (door, hatch or chute).
  queueDummy() {
    const rd = this.round?.dummy ?? { hp: 100, variant: 'standard' };
    this.entrance.enqueue({
      variant: rd.variant,
      hp: rd.hp,
      scale: VARIANTS[rd.variant].scale ?? 1,
      onSpawn: () => {
        this.awaitingEntry = false;
      },
    });
  }

  // Create a dummy right away. `raw` skips keeping it inside the walls, for
  // entrances that start it outside the arena.
  spawnDummy(x, { variant, hp, y, raw = false } = {}) {
    const W = this.bounds.right;
    const rd = this.round?.dummy ?? { hp: 100, variant: 'standard' };
    variant = variant ?? rd.variant;
    const v = VARIANTS[variant];
    const s = v.scale ?? 1;
    const run = this.run;
    const margin = 60 * s;
    x = x ?? W / 2 + this.rng.range(-0.12, 0.12) * Math.min(W, 700);
    if (!raw) x = clamp(x, margin, Math.max(margin, W - margin));
    y = y ?? 126 * s;
    const d = new Dummy(this.world, x, y, {
      scale: s,
      hp: Math.round(hp ?? rd.hp),
      limbFragility: run?.limbFragility ?? 1,
      bounce: run?.bounce ?? 0.25,
      variant,
    });
    // Health before the variant multiplier, so split children can scale from it.
    d.baseHp = (hp ?? rd.hp) / (v.hpMult ?? 1);
    this.dummies.push(d);
    return d;
  }

  spawnGrenade(x, y, opts) {
    return spawnGrenade(this, x, y, opts);
  }

  spawnAnvil(x) {
    return spawnAnvil(this, x);
  }

  spawnVortex(x, y, opts) {
    return spawnVortex(this, x, y, opts);
  }

  // ------------------------------------------------------------ weapon API

  level(id) {
    return this.run ? this.run.level(id) : 1;
  }

  // Level of a weapon, or of a trap type for 'trap:<id>' sources.
  sourceLevel(id) {
    if (id.startsWith('trap:')) return this.run ? this.run.trapLevel(id.slice(5)) : 1;
    return this.level(id);
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
      dx = x < this.bounds.right / 2 ? 1 : -1;
      dy = -0.4;
      d = Math.hypot(dx, dy);
    }
    return { x: dx / d, y: dy / d };
  }

  grab(hit, x, y) {
    const d = hit.dummy;
    const p = hit.t < 0.5 ? hit.seg.a : hit.seg.b;
    const nail = d.nails.find((n) => n.p === p);
    if (nail) this.status.unnail(d, nail);
    p.pinned = true;
    this.grabbed = { dummy: d, p, ox: p.x - x, oy: p.y - y };
    d.lastHitBy = 'hands';
    d.lastHitT = this.time;
  }

  releaseGrab(throwIt) {
    const g = this.grabbed;
    if (!g) return;
    g.p.pinned = false;
    if (throwIt) {
      const ptr = this.ptr;
      const sp = Math.hypot(ptr.vx, ptr.vy);
      const k = sp > 4200 ? 4200 / sp : 1;
      g.p.setVelocity(ptr.vx * k * 1.1, ptr.vy * k * 1.1, this.dt);
      g.dummy.lastHitT = this.time;
      g.dummy.impactChain = 0;
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
    const ptr = this.ptr;
    g.ox *= 0.8;
    g.oy *= 0.8;
    const B = this.bounds;
    const tx = clamp(ptr.x + g.ox, g.p.r, B.right - g.p.r);
    const ty = clamp(ptr.y + g.oy, g.p.r, B.bottom - g.p.r);
    g.p.px = g.p.x;
    g.p.py = g.p.y;
    g.p.x = tx;
    g.p.y = ty;
    g.dummy.lastHitBy = 'hands';
    g.dummy.lastHitT = this.time;
  }

  addBleed(dummy, seg, dps, duration, weapon) {
    this.status.bleed(dummy, seg, dps, duration, weapon);
  }

  addBurn(dummy, seg, dps, duration, weapon) {
    this.status.burn(dummy, seg, dps, duration, weapon);
  }

  addChill(dummy, seg, amount, weapon) {
    this.status.chill(dummy, seg, amount, weapon);
  }

  addShock(dummy, weapon, seg) {
    this.status.shock(dummy, weapon, seg);
  }

  addNail(dummy, point, duration) {
    this.status.nail(dummy, point, duration);
  }

  addTrail(x, y) {
    this.trail.push({ x, y, t: this.time });
  }

  // ---------------------------------------------------------------- damage

  comboBonus() {
    return Math.min(0.6, this.combo.count * 0.05);
  }

  // kind: 'hit' (direct), 'blast' (explosion), 'impact' (hitting a wall),
  // 'dot' (burn/bleed ticks), 'grind' (chainsaw, freeze beam, vortex core)
  // or 'reaction'. Sustained kinds never crit or build combo.
  dealDamage(dummy, seg, base, weaponId, { kind = 'hit', x, y, limbMult = 1, pierce = false } = {}) {
    if (!dummy.alive || base <= 0) return 0;
    const run = this.run;
    const env = ENV.has(weaponId);
    const trap = weaponId.startsWith('trap:');
    const sustained = kind === 'dot' || kind === 'grind';
    let amt = base * weaponDamageMult(this.sourceLevel(weaponId));
    let crit = false;
    if (kind !== 'reaction' && !sustained) {
      const mod = this.status.onHit(dummy, seg, weaponId, kind);
      if (mod.mult !== 1) {
        amt *= mod.mult;
        pierce = true;
        if (mod.sever) limbMult = 1e6;
      }
    }
    if (dummy.shockT > 0 && this.level('taser') >= 3) amt *= 1.25;
    if (run && !env) {
      amt *= run.dmgMult * (trap ? run.trapMult : run.weaponMult);
      if (run.overclock && this.timeLeft > this.round.time / 2) amt *= 1.2;
      if (seg.group === 'head') amt *= run.headMult;
      if (kind === 'impact') amt *= run.impactMult;
      if (!sustained && this.rng.chance(run.critChance)) {
        amt *= run.critMult;
        crit = true;
      }
      if (run.combo && !sustained) {
        this.combo.count++;
        this.combo.t = 1.2;
        amt *= 1 + this.comboBonus();
      }
      if (run.adrenaline && this.state === 'playing' && this.timeLeft <= 10) amt *= 2;
      // Chain: every distinct source that hit in the last couple of seconds
      // adds to everything. One weapon alone stays flat; a busy machine soars.
      if (!sustained) this.chain.set(kind === 'reaction' ? 'reaction' : weaponId, this.time);
      for (const [k, t] of this.chain) if (this.time - t > CHAIN_WINDOW) this.chain.delete(k);
      amt *= 1 + this.chainBonus();
    }

    const res = dummy.applyDamage(seg, amt, { limbMult, pierce });
    const dealt = res.dealt;
    if (!sustained && !env) {
      dummy.lastHitBy = weaponId;
      dummy.lastHitT = this.time;
      if (kind === 'hit' || kind === 'blast') dummy.impactChain = 0;
    }

    const c = x === undefined ? dummy.segCenter(seg) : { x, y };
    this.fxNumber(c.x, c.y, dealt, crit, kind);
    if (!sustained) this.gore.splash(c.x, c.y, Math.min(22, Math.round(dealt / 2)));
    else if (kind === 'grind' && this.rng.chance(0.6)) this.gore.splash(c.x, c.y, 2, { speed: 0.7 });
    if (dealt >= 30) {
      this.engine.hitStop(0.05);
      this.shake(0.25);
    }
    if (res.armorBroken) {
      this.fxText(c.x, c.y - 30, 'ARMOR BROKEN', C.paper, 18);
      this.fxSparks(c.x, c.y, 14, C.paperDim);
      this.sfx.clang();
    }
    if (res.popped) {
      this.fxText(c.x, c.y - 30, 'POP!', C.bad, 24);
      this.sfx.pop();
    }

    if (this.state === 'playing' && run && !env) {
      const st = this.stats;
      st.damage += dealt;
      this.heart.hit(sustained ? dealt * 0.5 : dealt);
      if (kind === 'impact') st.impact += dealt;
      if (!sustained) st.maxHit = Math.max(st.maxHit, dealt);
      const region = seg.limb ?? seg.group;
      st.regions[region] = (st.regions[region] ?? 0) + dealt;
      run.totals.damage += dealt;
      if (trap) {
        st.trapDamage += dealt;
        run.trapDamage[weaponId] = (run.trapDamage[weaponId] ?? 0) + dealt;
      } else {
        run.weaponDamage[weaponId] = (run.weaponDamage[weaponId] ?? 0) + dealt;
      }
      this.bonusEvent('damage', { group: seg.group, weapon: weaponId, kind, trap });
    }
    if (res.severed) this.onSever(dummy, res.severed);
    if (res.killed) this.onKill(dummy, weaponId);
    return dealt;
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
    // Both ends bleed: the torn-off limb and the stump on the body.
    const stump = limb.root[0] && (limb.root[0].a === j ? limb.root[0].b : limb.root[0].a);
    this.gore.splash(j.x, j.y, 18, { spread: Math.PI });
    this.gore.spurt(dummy, j, 1.2);
    if (stump) this.gore.spurt(dummy, stump, 1.8);
    this.fxText(j.x, j.y - 20, 'RIPPED', C.paper, 18);
    this.sfx.rip();
    this.shake(0.2);
    const c = dummy.center();
    const dx = j.x - c.x, dy = j.y - c.y;
    const d = Math.hypot(dx, dy) || 1;
    if (!j.pinned) j.addVelocity((dx / d) * 600, (dy / d) * 600 - 300, this.dt);
    if (this.state === 'playing' && this.run) {
      this.heart.hit(60);
      this.stats.severs++;
      this.run.totals.severs++;
    }
  }

  onKill(dummy, weaponId) {
    const c = dummy.center();
    dummy.die(this.dt);
    if (this.grabbed?.dummy === dummy) this.releaseGrab(false);
    this.fxFluff(c.x, c.y, 46, 2.4);
    this.gore.splash(c.x, c.y, 44, { spread: Math.PI, speed: 1.3 });
    for (let i = 0; i < 2; i++) {
      this.particles.spawn({ kind: 'dot', x: dummy.points.head.x, y: dummy.points.head.y, vx: this.rng.range(-400, 400), vy: this.rng.range(-700, -300), gravity: 1600, size: 4.5 * dummy.s, color: C.button, life: 1.6, bounce: 0.5 });
    }
    this.fxText(c.x, c.y - 50 * dummy.s, 'DESTROYED', C.gold, 24);
    this.sfx.pop();
    this.shake(0.45);
    this.engine.slowMo(0.35, 0.25);

    // Hydra-style variants split into two smaller ones.
    const split = dummy.traits.splits;
    if (split && (this.state === 'playing' || this.state === 'intro')) {
      for (const dir of [-1, 1]) {
        const child = this.spawnDummy(c.x + dir * 40, { variant: split, hp: dummy.baseHp * (VARIANTS[split].hpMult ?? 1), y: Math.max(130, c.y - 40) });
        for (const p of child.pointList) p.addVelocity(dir * 380, -520, this.dt);
      }
      this.fxText(c.x, c.y - 80, 'IT SPLITS', C.bad, 20);
    }

    if (this.state === 'playing' && this.run) {
      this.heart.arrest();
      this.stats.kills++;
      this.run.totals.kills++;
      this.bonusEvent('kill', {});
      if (this.run.shatter) {
        this.later(0.05, () => this.explode(c.x, c.y, 150, 30, weaponId, { size: 0.7, noReactions: true }));
      }
      if (!this.round.boss) {
        const alive = this.dummies.filter((d) => d.alive).length + this.spawnQueue.reduce((n, q) => n + q.count, 0) + this.entrance.queue.length;
        const count = this.rng.chance(this.run.hydraChance) ? 2 : 1;
        const room = Math.max(0, 4 - alive);
        if (room > 0) this.spawnQueue.push({ t: 0.5, count: Math.min(count, room) });
      }
    }
  }

  // Explosions damage and shove everything nearby. Unless told otherwise
  // they can set off Inferno on burning dummies and Singularity in a vortex.
  explode(x, y, R, dmg, weaponId, { size = 1, noReactions = false, fromVortex = false } = {}) {
    for (const d of this.dummies) {
      if (!d.alive) continue;
      const n = d.nearest(x, y);
      if (n.d >= R) continue;
      const mult = noReactions ? 1 : this.status.onBlast(d, x, y, R, weaponId);
      this.dealDamage(d, n.seg, dmg * mult * (0.35 + 0.65 * (1 - n.d / R)), weaponId, { kind: 'blast', x: n.x, y: n.y });
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
      if (d.alive && d.nearest(x, y).d < reach) {
        d.lastHitBy = weaponId;
        d.lastHitT = this.time;
        d.impactChain = 0;
      }
    }
    this.fxExplosion(x, y, R);
    this.sfx.boom(size);
    this.shake(0.55 * size);
    this.engine.hitStop(0.04);
    if (!noReactions && !fromVortex) {
      for (const v of activeVortexes(this)) {
        if (Math.hypot(v.p.x - x, v.p.y - y) < v.R * 0.6) this.later(0.06, () => collapseVortex(this, v, true, weaponId));
      }
    }
  }

  // ------------------------------------------------------- physics callbacks

  // Impact damage, deliberately modest: only after the player knocked the
  // dummy around, never while it's held, one impact per dummy at a time,
  // and each bounce after a hit or throw is worth half the last.
  onImpact(p, speed) {
    if (p.proj) {
      projectileImpact(this, p, speed);
      return;
    }
    const d = p.owner;
    if (!d) return;
    if (speed > 320) {
      this.fxDust(p.x, p.y, Math.min(6, Math.floor(speed / 400)));
      this.sfx.thud(Math.min(1, speed / 2200));
    }
    if (!d.alive || speed < 800 || this.grabbed?.dummy === d) return;
    if (!d.lastHitBy || ENV.has(d.lastHitBy) || this.time - d.lastHitT > 2.5) return;
    if (d.impactUntil > this.time) return;
    d.impactUntil = this.time + 0.3;
    let dmg = Math.min(28, (speed - 800) * 0.016) * Math.pow(0.5, d.impactChain++) * d.impactMult;
    if (d.lastHitBy === 'hands') dmg *= 0.6 * (this.level('hands') >= 3 ? 1.5 : 1);
    if (dmg < 1) return;
    this.dealDamage(d, d.segForPoint(p), dmg, d.lastHitBy, { kind: 'impact', x: p.x, y: p.y });
  }

  onContact(a, b, speed) {
    const proj = a.proj ? a : b.proj ? b : null;
    const other = proj === a ? b : a;
    if (!proj || !other.owner) return;
    projectileContact(this, proj, other, speed);
  }

  // ------------------------------------------------------------------ input

  selectWeapon(id) {
    if (!this.run?.weapons[id] && this.run) return;
    if (this.weaponId === id) return;
    this.releaseGrab(false);
    this.held = null;
    this.handTap = null;
    this.weaponId = id;
    this.sfx.select();
    if (this.state === 'playing') this.hud.showHint(WEAPONS[id].hint);
  }

  // Held weapons swing from the hand. The hand is "in the arena" while a
  // mouse hovers it, or while a finger is down on it (a quick tap can start
  // and end within one tick, so a fresh press counts too).
  updateHeld(dt) {
    const def = WEAPONS[this.weaponId];
    const p = this.input.pointer;
    const touching = p.down || p.pressed;
    const present = def.held && this.inArena(p.x, p.y) && (p.type === 'mouse' ? p.inside : touching) && this.pointerOwner !== 'ui';
    if (!present) {
      if (this.held) this.held.active = false;
      return;
    }
    if (!this.held) this.held = new PivotBody(def.held.body);
    const held = this.held;
    this.updateFacing(this.ptr.x);
    held.rest = def.held.rest(this.facing);
    if (!held.active) {
      held.place(this.ptr.x, this.ptr.y, held.rest);
      held.active = true;
    }
    held.update(this.ptr.x, this.ptr.y, dt, this.world.gravity);
    held.restOnFloor(this.bounds.bottom, held.length, 6);
    def.heldUpdate?.(this, held, dt);
  }

  // Point toward the nearest live dummy, with a little hysteresis so the
  // weapon doesn't flip back and forth when the hand is right above it.
  updateFacing(x) {
    let best = null;
    for (const d of this.dummies) {
      if (!d.alive) continue;
      const c = d.center();
      if (!best || Math.abs(c.x - x) < Math.abs(best.x - x)) best = c;
    }
    if (!best) return;
    const dx = best.x - x;
    if (dx > 24) this.facing = 1;
    else if (dx < -24) this.facing = -1;
  }

  cycleWeapon(dir) {
    const owned = this.run?.owned ?? [];
    if (owned.length < 2) return;
    const i = owned.indexOf(this.weaponId);
    this.selectWeapon(owned[(i + dir + owned.length) % owned.length]);
  }

  handleInput(dt) {
    const input = this.input;
    const p = input.pointer;
    const owned = this.run?.owned ?? [];
    for (const key of input.keysPressed) {
      const idx = Number(key) - 1;
      if (idx >= 0 && idx < owned.length) this.selectWeapon(owned[idx]);
      else if (key === 'q') this.cycleWeapon(-1);
      else if (key === 'e') this.cycleWeapon(1);
      else if (key === 'escape' || key === 'p') {
        this.pause();
        return;
      }
    }
    if (input.wheel) this.cycleWeapon(input.wheel);

    const W = WEAPONS[this.weaponId];
    const wp = this.ptr;
    if (p.pressed) {
      if (this.hud.isUi(p.x, p.y)) {
        this.pointerOwner = 'ui';
        this.hud.press(p.x, p.y);
        if (this.engine.top() !== this) return;
      } else {
        this.pointerOwner = 'arena';
        W.press?.(this, wp.x, wp.y);
      }
    }
    if (p.down && this.pointerOwner === 'arena') {
      W.hold?.(this, wp.lastX, wp.lastY, wp.x, wp.y, dt);
    }
    if (p.released) {
      if (this.pointerOwner === 'arena') W.release?.(this, wp.x, wp.y);
      this.pointerOwner = null;
    }

    // Desktop cursor: hidden over the arena (the weapon is drawn instead).
    if (p.type === 'mouse' && p.inside) {
      if (this.hud.hoverAt(p.x, p.y)) this.engine.cursor = 'pointer';
      else if (this.inArena(p.x, p.y)) this.engine.cursor = 'none';
    } else {
      this.hud.hoverId = null;
    }
  }

  // ----------------------------------------------------------------- update

  update(dt, isTop) {
    this.time += dt;
    this.syncPointer();
    if (this.state === 'playing' && !this.awaitingEntry) {
      this.timeLeft -= dt;
      const st = this.stats;
      st.elapsed += dt;
      st.traceAcc += dt;
      if (st.traceAcc >= TRACE_STEP) {
        st.traceAcc -= TRACE_STEP;
        st.trace.push(st.damage - st.traceLast);
        st.traceLast = st.damage;
      }
      this.heart.update(dt, this, st.heart, st.elapsed, TRACE_STEP);
    }
    if (this.state === 'playing' && isTop) {
      // Move the held weapon first so a press fires from where it is now.
      this.updateHeld(dt);
      this.handleInput(dt);
    } else if (this.pointerOwner) {
      this.releaseGrab(false);
      this.handTap = null;
      this.pointerOwner = null;
    }
    this.updateGrab();
    if (this.state === 'playing') {
      this.updateVent(dt);
      this.syncMachine();
      for (const t of this.machine) TRAPS[t.id].update(t, this, dt);
    }

    for (const d of this.dummies) this.status.tick(d, dt);
    this.world.step(dt);
    updateProjectiles(this, dt);

    this.entrance.update(dt);
    for (const d of this.dummies) {
      d.update(dt);
      d.updateEntry(dt, this.bounds);
    }
    this.dummies = this.dummies.filter((d) => !d.gone);

    for (let i = this.spawnQueue.length - 1; i >= 0; i--) {
      const q = this.spawnQueue[i];
      q.t -= dt;
      if (q.t > 0) continue;
      this.spawnQueue.splice(i, 1);
      if (this.state === 'playing') this.spawnWave(q.count);
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
    this.gore.update(dt);
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

  // Furnace flame vents: a warning glow, then a column of fire.
  updateVent(dt) {
    const v = this.vent;
    if (!v) return;
    const B = this.bounds;
    v.tt -= dt;
    if (v.phase === 'idle') {
      v.t -= dt;
      if (v.t <= 0) {
        v.phase = 'warn';
        v.tt = 0.9;
        v.x = B.right * this.rng.range(0.12, 0.88);
      }
    } else if (v.phase === 'warn' && v.tt <= 0) {
      v.phase = 'erupt';
      v.tt = 1.1;
      this.sfx.boom(0.4);
    } else if (v.phase === 'erupt') {
      for (let i = 0; i < 3; i++) {
        this.particles.spawn({
          kind: 'fire', x: v.x + this.rng.range(-26, 26), y: B.bottom - 4,
          vx: this.rng.range(-40, 40), vy: this.rng.range(-900, -600), drag: 1.2,
          size: this.rng.range(10, 18), color: C.fire, color2: C.fire2, life: this.rng.range(0.3, 0.45),
        });
      }
      v.acc += dt;
      if (v.acc >= 0.15) {
        v.acc = 0;
        for (const d of this.dummies) {
          if (!d.alive) continue;
          for (const seg of d.segs) {
            const c = d.segCenter(seg);
            if (Math.abs(c.x - v.x) < 42 && c.y > B.bottom - 280) {
              this.addBurn(d, seg, 6, 2, 'vent');
              d.impulse(seg, 0.5, 0, -260, this.dt);
            }
          }
        }
      }
      if (v.tt <= 0) {
        v.phase = 'idle';
        v.t = this.rng.range(2.2, 3.8);
      }
    }
  }

  // --------------------------------------------------------------- effects

  fxNumber(x, y, amt, crit, kind) {
    const shown = Math.max(1, Math.round(amt));
    const small = kind === 'dot' || kind === 'grind';
    if (small && this.rng.chance(0.5)) return;
    const size = small ? 13 : Math.min(34, 15 + amt * 0.45) * (crit ? 1.25 : 1);
    const color = crit ? C.gold : kind === 'dot' ? '#ffb48a' : kind === 'impact' ? C.paper : kind === 'reaction' ? C.volt : C.accent;
    this.particles.spawn({
      kind: 'text', text: crit ? `${shown}!` : String(shown), font: font(size, F.display, 400), color,
      x: x + this.rng.range(-8, 8), y: y - 10, vx: this.rng.range(-40, 40), vy: -110, drag: 2.5, life: small ? 0.6 : 0.9,
      rot: this.rng.range(-0.15, 0.15),
    });
  }

  fxText(x, y, text, color, size = 20) {
    this.particles.spawn({ kind: 'text', text, font: font(size, F.display, 400), color, x, y, vx: 0, vy: -70, drag: 2, life: 1.1 });
  }

  fxReaction(x, y, name, color) {
    this.particles.spawn({ kind: 'text', text: name, font: font(30, F.display, 400), color, x, y: y - 24, vx: 0, vy: -55, drag: 1.5, life: 1.5, rot: this.rng.range(-0.08, 0.08) });
    this.particles.spawn({ kind: 'ring', x, y, size: 10, grow: 420, color, life: 0.3 });
    this.particles.spawn({ kind: 'ring', x, y, size: 4, grow: 240, color: C.paper, life: 0.22 });
    this.fxSparks(x, y, 10, color);
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
        size: this.rng.range(2.5, 5.5), color: this.rng.chance(0.85) ? C.fluff : C.paperDim, life: this.rng.range(0.6, 1.4), bounce: 0.1,
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

  fxShards(x, y, n) {
    for (let i = 0; i < n; i++) {
      const a = this.rng.range(0, Math.PI * 2);
      const sp = this.rng.range(120, 520);
      this.particles.spawn({ kind: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 100, gravity: 900, size: 3, color: this.rng.chance(0.5) ? C.ice : '#ffffff', life: 0.5, drag: 2 });
    }
  }

  fxSteam(x, y) {
    for (let i = 0; i < 16; i++) {
      const a = this.rng.range(0, Math.PI * 2);
      this.particles.spawn({ kind: 'smoke', x, y, vx: Math.cos(a) * 160, vy: Math.sin(a) * 160 - 120, size: this.rng.range(8, 16), grow: 50, color: '#e8eef0', life: this.rng.range(0.6, 1.1), drag: 2 });
    }
  }

  // A jagged electric arc between two points.
  fxArc(x0, y0, x1, y1) {
    let px = x0, py = y0;
    const n = 6;
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const nx = i === n ? x1 : x0 + (x1 - x0) * t + this.rng.range(-12, 12);
      const ny = i === n ? y1 : y0 + (y1 - y0) * t + this.rng.range(-12, 12);
      this.particles.spawn({ kind: 'beam', x: px, y: py, x2: nx, y2: ny, size: 3, color: C.volt, life: 0.16 });
      px = nx;
      py = ny;
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

  // A jet of fire out of a muzzle, inheriting some of the hand's motion.
  fxFlameJet(m, held) {
    for (let i = 0; i < 3; i++) {
      const a = Math.atan2(m.uy, m.ux) + this.rng.range(-0.18, 0.18);
      const sp = this.rng.range(380, 560);
      this.particles.spawn({
        kind: 'fire', x: m.x, y: m.y,
        vx: Math.cos(a) * sp + held.vx * 0.3, vy: Math.sin(a) * sp + held.vy * 0.3 - 30,
        drag: 2.2, size: this.rng.range(7, 13), grow: 26,
        color: C.fire, color2: C.fire2, life: this.rng.range(0.3, 0.45),
      });
    }
  }

  fxTracer(x0, y0, x1, y1) {
    this.particles.spawn({ kind: 'beam', x: x0, y: y0, x2: x1, y2: y1, size: 3, color: '#fff3b0', life: 0.09 });
  }

  // Where a ray from (x, y) leaves the arena.
  rayExit(x, y, ux, uy) {
    const B = this.bounds;
    let t = Infinity;
    if (ux > 0) t = Math.min(t, (B.right - x) / ux);
    if (ux < 0) t = Math.min(t, (B.left - x) / ux);
    if (uy > 0) t = Math.min(t, (B.bottom - y) / uy);
    if (uy < 0) t = Math.min(t, (B.top - y) / uy);
    t = Math.max(0, Number.isFinite(t) ? t : 0);
    return { x: x + ux * t, y: y + uy * t };
  }

  fxExplosion(x, y, R) {
    this.particles.spawn({ kind: 'ring', x, y, size: R * 0.2, grow: R * 5, color: C.paper, life: 0.22 });
    this.particles.spawn({ kind: 'dot', x, y, size: R * 0.55, grow: -R * 2, color: '#fff3b0', life: 0.14 });
    for (let i = 0; i < 18; i++) {
      const a = this.rng.range(0, Math.PI * 2);
      const sp = this.rng.range(100, 500);
      this.particles.spawn({ kind: 'fire', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 100, drag: 3, size: this.rng.range(10, 22), color: C.fire, color2: C.fire2, life: this.rng.range(0.3, 0.6) });
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
    const A = L.arena;
    const B = this.bounds;
    ctx.drawImage(this.bg, 0, 0, L.w, L.h);

    // The arena is drawn in world units, clipped to its rectangle.
    ctx.save();
    ctx.beginPath();
    ctx.rect(A.x, A.y, A.w, A.h);
    ctx.clip();
    ctx.translate(A.x + r.ox, A.y + r.oy);
    ctx.scale(L.k, L.k);

    // Stenciled floor number on the wall.
    if (this.round && this.state !== 'title') {
      ctx.save();
      ctx.font = font(Math.min(B.right * 0.45, B.bottom * 0.45), F.display, 400);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = this.theme === 'furnace' ? 'rgba(255,140,60,0.07)' : 'rgba(40,52,40,0.08)';
      ctx.fillText(`${this.round.act}-${this.round.floor}`, B.right / 2, B.bottom / 2);
      ctx.restore();
    }

    this.gore.drawStains(ctx);
    this.renderVent(ctx);
    this.entrance.draw(ctx, 'back');
    this.drawMachine(ctx, 'back');
    for (const d of this.dummies) {
      const pelvis = d.points.pelvis;
      const h = clamp((B.bottom - pelvis.y) / 400, 0, 1);
      ctx.fillStyle = `rgba(20,26,20,${0.22 * (1 - h)})`;
      ctx.beginPath();
      ctx.ellipse(pelvis.x, B.bottom + 2, 40 * d.s * (1 - h * 0.5), 6 * d.s, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const d of this.dummies) d.draw(ctx);
    for (const pr of this.projectiles) drawProjectile(this, ctx, pr);
    this.drawMachine(ctx, 'front');
    this.entrance.draw(ctx, 'front');
    this.renderTrail(ctx);
    this.renderBeam(ctx);
    this.gore.drawDrops(ctx);
    this.particles.render(ctx);
    if (this.round?.env.blackout && this.state !== 'title') this.renderBlackout(ctx);
    this.renderCursor(ctx);
    ctx.restore();

    this.renderStamp(ctx);
    this.hud.render(ctx);
  }

  drawMachine(ctx, layer) {
    if (!this.run || this.state === 'title') return;
    for (const t of this.machine) {
      if (!t.m) t.m = mountById(this.bounds, t.mountId);
      TRAPS[t.id].draw(t, ctx, this, layer);
    }
  }

  renderVent(ctx) {
    const v = this.vent;
    if (!v || v.phase === 'idle' || this.state !== 'playing') return;
    const B = this.bounds;
    const glow = v.phase === 'warn' ? 0.35 + 0.35 * Math.abs(Math.sin(this.time * 14)) : 0.6;
    const g = ctx.createRadialGradient(v.x, B.bottom, 4, v.x, B.bottom, 70);
    g.addColorStop(0, `rgba(255,170,60,${glow})`);
    g.addColorStop(1, 'rgba(255,90,20,0)');
    ctx.fillStyle = g;
    ctx.fillRect(v.x - 70, B.bottom - 70, 140, 70);
    if (v.phase === 'erupt') {
      const col = ctx.createLinearGradient(0, B.bottom, 0, B.bottom - 280);
      col.addColorStop(0, 'rgba(255,150,50,0.35)');
      col.addColorStop(1, 'rgba(255,150,50,0)');
      ctx.fillStyle = col;
      ctx.fillRect(v.x - 34, B.bottom - 280, 68, 280);
    }
  }

  renderBeam(ctx) {
    const b = this.beam;
    if (!b || this.time - b.t > 0.05) return;
    const len = Math.hypot(b.x2 - b.x, b.y2 - b.y) || 1;
    const nx = -(b.y2 - b.y) / len, ny = (b.x2 - b.x) / len;
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(159,220,255,0.55)';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x2, b.y2);
    ctx.stroke();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      const wob = Math.sin(t * 20 + this.time * 40) * 3;
      const x = b.x + (b.x2 - b.x) * t + nx * wob, y = b.y + (b.y2 - b.y) * t + ny * wob;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // Blackout twist: darkness everywhere except a pool of light at the hand.
  renderBlackout(ctx) {
    const B = this.bounds;
    const p = this.input.pointer;
    const lit = p.inside && this.inArena(p.x, p.y);
    const x = lit ? this.ptr.x : B.right / 2;
    const y = lit ? this.ptr.y : B.bottom / 2;
    const g = ctx.createRadialGradient(x, y, 90, x, y, 240);
    g.addColorStop(0, 'rgba(6,8,6,0)');
    g.addColorStop(1, 'rgba(6,8,6,0.95)');
    ctx.fillStyle = g;
    ctx.fillRect(-20, -20, B.right + 40, B.bottom + 60);
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
    if (this.held?.active) {
      drawHeldWeapon(ctx, this.weaponId, this.held, { flash: this.input.pointer.down ? 1 : 0 });
      return;
    }
    const p = this.input.pointer;
    if (!p.inside || !this.inArena(p.x, p.y) || this.hud.isUi(p.x, p.y)) return;
    if (p.type !== 'mouse' && !p.down) return;
    WEAPONS[this.weaponId].cursor?.(ctx, this, this.ptr.x, this.ptr.y, p.down);
  }

  renderStamp(ctx) {
    if (!this.stamp) return;
    const L = this.layout;
    const A = L.arena;
    const t = this.stamp.t;
    const k = t < 0.15 ? 2.2 - (t / 0.15) * 1.2 : 1;
    ctx.save();
    ctx.translate(A.x + A.w / 2, (A.y + L.floorPx) / 2);
    ctx.rotate(-0.12);
    ctx.scale(k, k);
    ctx.globalAlpha = clamp(t / 0.1, 0, 1);
    ctx.font = font(Math.min(72, A.w * 0.13), F.display, 400);
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
