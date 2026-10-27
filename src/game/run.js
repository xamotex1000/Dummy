// Everything that persists across rounds of a single run.

import { WEAPON_ORDER, MAX_SLOTS } from './weapons.js';
import { ACTS, FLOORS_PER_ACT } from './variants.js';

export class Run {
  constructor(seed) {
    this.seed = seed;
    // Where we are: act 1-3, floor 1-5 (5 is the boss), and how many times
    // the acts have looped in endless mode.
    this.act = 1;
    this.floor = 1;
    this.loop = 0;
    this.endless = false;
    this.won = false;
    this.workshopUsed = -1; // act index (with loops) where the workshop was used
    this.weapons = { hands: { level: 1 } };
    // The machine: traps bolted to mount points, and each trap type's level.
    this.traps = [];
    this.trapLevels = {};

    // Player modifiers
    this.dmgMult = 1;
    this.critChance = 0.05;
    this.critMult = 2.5;
    this.timeBonus = 0;
    this.combo = false;
    this.adrenaline = false;
    this.choices = 3;
    this.rerolls = 0;
    this.lives = 0;
    this.statusMult = 1;
    this.reactionMult = 1;
    this.chainReaction = false;

    // Dummy modifiers
    this.dummyHpMult = 1;
    this.hydraChance = 0;
    this.limbFragility = 1;
    this.impactMult = 1;
    this.bounce = 0.25;
    this.headMult = 1;
    this.shatter = false;

    this.cardCounts = {};
    this.taken = [];
    this.weaponDamage = {};
    this.trapDamage = {};
    this.lastPrimary = null;
    this.totals = { damage: 0, kills: 0, severs: 0, cleared: 0, bonuses: 0, reactions: 0 };
  }

  get actDef() {
    return ACTS[(this.act - 1) % ACTS.length];
  }

  get actIndex() {
    return this.loop * ACTS.length + this.act;
  }

  // Overall floor number, used to scale difficulty.
  get depth() {
    return (this.actIndex - 1) * FLOORS_PER_ACT + this.floor;
  }

  get isBossFloor() {
    return this.floor === FLOORS_PER_ACT;
  }

  get owned() {
    return WEAPON_ORDER.filter((id) => this.weapons[id]);
  }

  get slotsFull() {
    return this.owned.length >= MAX_SLOTS;
  }

  level(id) {
    return this.weapons[id]?.level ?? 0;
  }

  trapLevel(id) {
    return this.trapLevels[id] ?? 0;
  }

  trapAt(mountId) {
    return this.traps.find((t) => t.mount === mountId) ?? null;
  }

  // Bolt a trap onto a mount, replacing whatever was there.
  installTrap(id, mountId) {
    this.traps = this.traps.filter((t) => t.mount !== mountId);
    this.traps.push({ id, mount: mountId });
    if (!this.trapLevels[id]) this.trapLevels[id] = 1;
  }

  // The owned weapon that has dealt the most damage this run.
  favoriteWeapon() {
    const owned = this.owned;
    let best = null;
    for (const id of owned) {
      if ((this.weaponDamage[id] ?? 0) > (this.weaponDamage[best] ?? 0)) best = id;
    }
    return best ?? owned[owned.length - 1];
  }

  // Move to the next floor; returns true when that starts a new act.
  advance() {
    this.floor++;
    if (this.floor <= FLOORS_PER_ACT) return false;
    this.floor = 1;
    this.act++;
    if (this.act > ACTS.length) {
      this.act = 1;
      this.loop++;
    }
    return true;
  }
}
