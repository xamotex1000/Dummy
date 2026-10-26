// Everything that persists across rounds of a single run.

import { WEAPON_ORDER } from './weapons.js';

export class Run {
  constructor(seed) {
    this.seed = seed;
    this.round = 1;
    this.weapons = { hands: { level: 1 }, bat: { level: 1 } };

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
    this.lastPrimary = null;
    this.totals = { damage: 0, kills: 0, severs: 0, cleared: 0, bonuses: 0 };
  }

  get owned() {
    return WEAPON_ORDER.filter((id) => this.weapons[id]);
  }

  level(id) {
    return this.weapons[id]?.level ?? 0;
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
}
