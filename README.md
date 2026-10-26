# Dummy Run

A proof-of-concept roguelike inspired by *Kick the Buddy*. You fight through three acts of test dummies, picking your route between floors, drafting weapons and mods, and combining fire, ice, shocks, nails and blasts into reactions.

Everything runs on a small custom engine written for this project: plain JavaScript and Canvas 2D, with no libraries and no build step.

## Run it

ES modules need to be served over HTTP (opening the file directly won't work):

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

It's designed desktop-first and adapts down to phones:

- **Desktop (900px wide and up):** a clipboard sidebar holds the floor, timer, work order, bonus, your arsenal and the cards you've taken. The arena fills the rest of the screen. Menus and card drafts sit over the arena, so the sidebar stays readable while you choose.
- **Phone, portrait:** a top strip with the work order, and a weapon rack along the bottom.
- **Phone, landscape:** a two-row strip, and the arena zooms in so the dummy stays readable.

The arena is simulated in fixed world units (580 tall) and scaled to fit the screen, so physics and weapon tuning feel the same at any size.

| Desktop | Phone | Action |
| --- | --- | --- |
| Click | Tap | Punch, fire guns, drop a grenade or anvil |
| Move | Drag | Swing held weapons (bat, knife, chainsaw) from the grip |
| Drag | Drag | Grab and throw with Hands |
| 1–6, Q/E, mouse wheel | Weapon rack | Switch weapon |
| Esc or P | Pause button | Pause (also happens automatically when the window loses focus) |
| Space / Enter | Tap | Confirm dialogs |
| 1–6, R | Tap | Pick a card or ticket, reroll |

## How a run works

- **Structure.** Pick a starting weapon from three (Hands are always free), then fight through **three acts of five floors**. Floor 5 of each act is a boss. Beat act 3 to win the run, then keep going in endless mode if you like.
- **Acts** change the arena:
  - **Padded Cell:** normal.
  - **Crash Lab:** low gravity.
  - **Furnace:** flame vents erupt from the floor and set anything above them burning.
- **Routes.** Before each floor you pick the next job from three tickets:
  - **Standard:** a normal dummy; reward is a card pick.
  - **Elite:** a tougher variant with more health and less time; reward is a rare-weighted pick with an extra choice.
  - **Crate:** a random twist (Zero-G, Glass Dummies, Swarm, Blackout); reward is a new weapon.
  - **Workshop:** no fight; upgrade one weapon. Once per act.
- **Dummy variants.** Different ones reward different weapons:
  - **Runts:** small, and come in pairs.
  - **Rubber Dummy:** takes a quarter of impact damage.
  - **Riot Dummy:** helmet and vest soak 60% until broken.
  - **Balloon Dummy:** floats until you pop its head.
  - **Asbestos Dummy:** fireproof, but shatters easily.
  - **Self-Stitcher:** heals unless bleeding.
- **Bosses.**
  - **Big Buddy:** 4.5x health.
  - **Riot Captain:** huge and armored.
  - **Hydra King:** splits into two Hydra Spawn, which each split into two Runts.
- **Objectives.** Each floor has a primary objective and a timer (40s, 60s for bosses):
  - deal X damage
  - destroy X dummies
  - deal X impact damage
  - tear off X limbs
  - land one X+ hit
  - trigger X reactions
- **Bonus condition (optional).** If you clear the floor without breaking it, you get an extra card pick:
  - only hit one body part
  - don't use your favorite weapon
  - don't destroy any dummy
  - finish with time to spare
  - stick to one weapon
  - no impact damage
  - trigger a reaction
- **Arsenal.** You carry up to 6 weapons including Hands. Taking a seventh asks which one to drop.
- **Cards.**
  - **Weapons:** unlocks, plus upgrades (two perks per weapon, then +30% damage per level).
  - **Dummy mods.**
  - **Perks:** damage, crit, time, combo, rerolls, Second Wind, and reaction perks like Chemistry Set, Catalyst and Chain Reaction.
  - **Trade-offs.**

## Reactions

Status effects combine when they meet on the same dummy:

| Reaction | How |
| --- | --- |
| Shatter | Blunt hit (Hands, Bat, Anvil, an impact or a blast) on a frozen part: triple damage, and frozen limbs snap off |
| Steam Burst | Burn a frozen part, or freeze a burning one |
| Overload | Shock a burning part: it explodes |
| Conductor | Shock a nailed dummy: current arcs through every nail |
| Superconduct | Shock a frozen part: the charge jumps to every dummy |
| Singularity | An explosion inside an active vortex collapses it violently |
| Tear Away | A nailed limb pulled hard enough (a hit, a throw, a blast) rips off |
| Inferno | An explosion on a burning dummy sets everything nearby alight |

Reactions you've found are saved in the browser and listed in the pause menu, with hints for the rest.

## Impact damage

Throwing the dummy into walls is deliberately modest:

- Shaking a dummy you're holding does nothing.
- Each dummy takes at most one impact every 0.3s, rather than one per body part.
- Every bounce after a hit or throw is worth half the one before.
- Each impact is capped.
- Thrown impacts deal 60% damage.
- Rubber dummies take a quarter.

## Weapons

| Weapon | Input | Notes |
| --- | --- | --- |
| Hands | Click/tap to punch, drag to grab and throw | Always carried |
| Bat | Held: move it through the dummy | Hangs from the handle and whips. Blunt, so it shatters frozen parts |
| Knife | Held: move it through the dummy | Held by the hilt. Cuts bleed and tear limbs off quickly |
| Chainsaw | Held: hold to run the motor | Grinds whatever the blade touches, heavy bleeding |
| Pistol | Held: press to fire, hold for auto-fire | Shoots along the barrel. Recoil kicks it up |
| Nail Gun | Held: press to fire | Nails parts to the wall. Pull a nailed limb hard enough and it tears off |
| Taser | Held: press with the prongs on a dummy | Shocks, makes it spasm, and jumps to nearby dummies |
| Freeze Ray | Held: hold to fire the beam | Freezes parts solid |
| Rocket | Held: press to fire | Rockets explode on contact. Heavy recoil |
| Flamer | Held: hold to spray | Fire jets out of the nozzle and sets parts burning |
| Grenade | Click/tap to drop | Area damage plus a big shove |
| Vortex | Click/tap to drop | Pulls everything in, then implodes |
| Anvil | Click/tap to drop from the ceiling | Heavy single hits |

### Held weapons

Everything except Hands, Grenade, Vortex and Anvil is a physical object gripped at the handle. Your pointer is the hand. Each weapon is a rigid rod hinged at the hand (`engine/pivot.js`):

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
    dummy.js         15-point ragdoll, variants (armor, balloon, regen...), hit tests, severing
    variants.js      dummy variants, the three acts, crate twists
    statuses.js      bleed / burn / freeze / shock / nails, and the reactions between them
    reactions.js     reaction list, codex discovery storage
    projectiles.js   grenades, anvils, rockets, vortexes
    weapons.js       weapon definitions (input handlers, held-weapon physics config, perks)
    objectives.js    objectives, bonus conditions, round and route generation
    cards.js         card pool, rarity weights, offers
    run.js           state that persists across a run
    hud.js           desktop sidebar, or a top strip + weapon rack on phones
    layout.js        desktop-first screen layout and the world-unit scale
    background.js    pre-rendered backdrop per act
    icons.js         vector weapon icons and grip-origin held weapon sprites
    sfx.js, theme.js
    scenes/play.js   the arena: damage pipeline, physics callbacks, run flow, act hazards
    scenes/overlays.js  title, routes, acts, work order, results, cards, pause + codex, run end
  main.js
```

How the main pieces fit together:

- **Damage pipeline.** Weapons call `PlayScene.dealDamage(dummy, segment, amount, weaponId, {kind})`.
  - `kind` is `hit`, `blast`, `impact`, `dot`, `grind` or `reaction`.
  - It first gives the status system a chance to react (Shatter), then applies run modifiers, armor and the dummy's response.
  - Finally it records the event: round stats, per-weapon totals and the bonus check.
  - Damage from the arena itself (Furnace vents) hurts dummies but never counts for or against you.
- **Statuses and reactions** live in `statuses.js`. Weapons go through scene helpers (`addBurn`, `addChill`, `addShock`, `addNail`, `addBleed`), and each reaction is rate-limited per dummy so combos can't loop.
- **Tear Away** reads `Stick.strain` from the physics step: how stretched a stick was before the solver corrected it.
- **Adding content.** Each of these is a single entry:
  - a weapon: `WEAPONS`
  - a dummy variant: `VARIANTS`
  - an act: `ACTS`
  - an objective: `PRIMARY`
  - a bonus condition: `SECONDARY`, plus a case in `secondaryEvent`
  - a card: `STATIC_CARDS`
  - a reaction: `REACTIONS`, plus the trigger in `statuses.js`

In the browser console, `window.dummyRun` exposes `{ engine, play }` for poking at state.
