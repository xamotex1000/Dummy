# Dummy Run

A proof-of-concept roguelike inspired by *Kick the Buddy*. You beat up a burlap test dummy to meet each round's work order before the clock runs out, and draft cards between rounds to build up your arsenal and bend the rules.

Everything runs on a small custom engine written for this project: plain JavaScript and Canvas 2D, with no libraries and no build step.

## Run it

ES modules need to be served over HTTP (opening the file directly won't work):

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

It's designed desktop-first and adapts down to phones:

- **Desktop (900px wide and up):** a clipboard sidebar holds the round, timer, work order, bonus, your arsenal and the cards you've taken. The arena fills the rest of the screen. Menus and card drafts sit over the arena, so the sidebar stays readable while you choose.
- **Phone, portrait:** a top strip with the work order, and a weapon rack along the bottom.
- **Phone, landscape:** a two-row strip, and the arena zooms in so the dummy stays readable.

The arena is simulated in fixed world units (580 tall) and scaled to fit the screen, so physics and weapon tuning feel the same at any size.

| Desktop | Phone | Action |
| --- | --- | --- |
| Click | Tap | Punch, fire guns, drop a grenade or anvil |
| Move | Drag | Swing held weapons (bat, knife) from the grip |
| Drag | Drag | Grab and throw with Hands |
| 1–7, Q/E, mouse wheel | Weapon rack | Switch weapon |
| Esc or P | Pause button | Pause (also happens automatically when the window loses focus) |
| Space / Enter | Tap | Confirm dialogs |
| 1–5, R | Tap | Pick a card, reroll |

## How a run works

- **Rounds.** Each round gives you a **primary objective** and a timer (40s base, 55s for bosses). Finish the objective to clear the round. If time runs out, the run is over.
  - Deal X damage
  - Destroy X dummies
  - Deal X impact damage (slam it into walls, the floor or the ceiling)
  - Tear off X limbs
  - Land a single hit of X+ damage
  - Every 5th round is a **boss**: the Big Buddy, with 5x health and no replacements
- **Bonus condition (optional).** Every round also rolls one modifier. If you clear the round without breaking it, you get an extra card pick right away.
  - Only hit the {head / torso / arms / legs}
  - Don't use {your most-used weapon}
  - Don't destroy the dummy
  - Finish with N seconds to spare
  - Stick to one weapon
  - No impact damage
- **Cards.** You pick 1 of 3 after round 1, every other round after that, and after each boss. Bonus picks lean toward rarer cards.
  - **New weapon**: Knife, Pistol, Grenade, Flamer, Anvil
  - **Upgrade**: each weapon has two perks (levels 2 and 3), then +30% damage per level up to level 5
  - **Dummy mods**: less health, Hydra Stuffing (a destroyed dummy can be replaced by two), Loose Seams, Rubber Filling, Bullseye Button, Volatile Fluff (destroyed dummies explode)
  - **Perks**: +damage, crit chance, +time, combo counter, adrenaline, an extra card choice, rerolls, Second Wind (one retry)
  - **Trade-offs**: Blood Pact (+50% damage, shorter rounds), Reinforced Dummy (tougher dummies, but rerolls and crit)

Targets and dummy health both scale each round, so the cards you take are what carry you deeper.

## Weapons

| Weapon | Input | Notes |
| --- | --- | --- |
| Hands | Click/tap to punch, drag to grab and throw | Throws are the main source of impact damage |
| Bat | Held: move it through the dummy | Hangs from the handle and whips. Damage scales with how fast the barrel connects |
| Knife | Held: move it through the dummy | Held by the hilt. Cuts bleed and tear limbs off quickly |
| Pistol | Held: press to fire, hold for auto-fire | Shoots along the barrel. Recoil kicks it up |
| Grenade | Click/tap to drop | Area damage plus a big shove |
| Flamer | Held: hold to spray | Fire jets out of the nozzle and sets parts burning |
| Anvil | Click/tap to drop from the ceiling | Heavy single hits |

### Held weapons

The bat, knife, pistol and flamer are physical objects gripped at the handle. Your pointer is the hand. Each weapon is a rigid rod hinged at the hand (`engine/pivot.js`):

- **What moves it:** gravity, and the pseudo-force from your hand's acceleration. A fast flick makes the far end lag and then whip through.
- **Wrist spring:** pulls the weapon toward a resting pose that faces the nearest dummy. Guns are held level, so the wrist cancels their weight; the bat hangs and swings.
- **Floor:** the weapon rests on the floor and bounces off it. When the floor is in the way, it swings back to rest over the top.
- **Melee hits:** the striking part is swept from last tick's pose to this one, so fast swings can't skip past the dummy between frames. Damage uses the speed of the exact point on the weapon that hit, relative to the body part it hit. A slow contact only shoves.
- **Guns:** shots are raycast from the muzzle along the barrel. Recoil adds spin and the wrist settles it.

On desktop the weapon follows the mouse while it's over the arena. On a phone it appears under your finger while you touch the arena.

## Code layout

```
src/
  engine/            generic, game-agnostic
    core.js          fixed-timestep loop, scene stack, hit-stop / slow-mo
    physics.js       Verlet points + distance constraints, wall and point collisions
    pivot.js         rigid rod hinged at a moving pivot (held weapons)
    renderer.js      DPR-aware canvas, trauma screen shake, path helpers
    input.js         unified mouse/touch pointer with smoothed swipe velocity
    audio.js         WebAudio synth (noise bursts + oscillators, no audio files)
    particles.js     particle system (sparks, fluff, fire, smoke, rings, damage numbers)
    rng.js           seeded RNG (mulberry32) with weighted sampling
    math.js          segment distance, easing, color mixing
  game/
    dummy.js         15-point ragdoll, per-segment hit tests, limb severing, death
    weapons.js       weapon definitions (input handlers, held-weapon physics config, perks)
    objectives.js    primary objectives, bonus conditions, round generation
    cards.js         card pool, rarity weights, offers
    run.js           state that persists across a run
    hud.js           desktop sidebar, or a top strip + weapon rack on phones
    layout.js        desktop-first screen layout and the world-unit scale
    background.js    pre-rendered padded-cell backdrop
    icons.js         vector weapon icons and grip-origin held weapon sprites
    sfx.js, theme.js
    scenes/play.js   the arena: damage pipeline, physics callbacks, round lifecycle
    scenes/overlays.js  title, work order, results, card draft, pause, game over
  main.js
```

How the main pieces fit together:

- **Damage pipeline.** Weapons call `PlayScene.dealDamage(dummy, segment, amount, weaponId, {kind})`. That applies run modifiers (weapon level, head multiplier, crits, combo, adrenaline), tells the dummy, and records the hit as an event: round stats, per-weapon totals for the run, and the bonus-condition check.
- **Impact damage.** The physics world reports wall hits along with their speed. A hit only counts if the player touched that dummy in the last 3 seconds, so the drop-in at the start of a round never counts. The damage is credited to whichever weapon sent it flying.
- **Adding content.** A new weapon is one entry in `WEAPONS`, a new objective is one function in `PRIMARY`, a new bonus condition is one entry in `SECONDARY` plus a case in `secondaryEvent`, and a new card is one line in `STATIC_CARDS`.

In the browser console, `window.dummyRun` exposes `{ engine, play }` for poking at state.
