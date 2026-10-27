# Crash Test

A proof-of-concept roguelike inspired by *Kick the Buddy*. Over a run you bolt a machine of traps into the cell (springs, spinners, saws, fans, tesla coils, crushers), then feed the dummy into it. You fight through three acts, pick your route between floors, draft weapons, traps and mods, and chain fire, ice, shocks, nails and blasts into reactions.

Everything runs on a small custom engine written for this project: plain JavaScript and Canvas 2D, with no libraries and no build step.

## Run it

ES modules need to be served over HTTP (opening the file directly won't work):

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

It's designed desktop-first and adapts down to phones:

- **Desktop (900px wide and up):** a sidebar holds the floor, timer, test order, secondary objective, your arsenal and the cards you've taken. The arena fills the rest of the screen. Menus and card drafts sit over the arena, so the sidebar stays readable while you choose.
- **Phone, portrait:** a top strip with the test order, and a weapon rack along the bottom.
- **Phone, landscape:** a two-row strip, and the arena zooms in so the dummy stays readable.

Every menu is a crash test report. Test orders come on spec sheets, cards are component sheets with an exhibit photo and a class rating, and each cleared floor files a results sheet. That sheet has an injury assessment that rates each body region G/A/M/P (on this test, P is the goal) a cardiac monitor and a chart-recorder trace of your damage over the round. Results, run-end sheets and card picks come out of a test recorder at the bottom of the screen. They feed up a line at a time and tear off with a ragged edge; press any key or tap to hurry the printer.

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

## Settings

The gear on the pause sheet (or the title screen, or the S key) opens the facility settings. Both settings are saved in the browser.

- **Gore** (on by default). Hits splash blood that pools on the floor, splats on the back wall and runs down the walls. Torn limbs pump from both ends, and destroyed dummies burst. Stains last for the round. Off swaps all of it for stuffing, and bruises turn to grime.
- **Rogue-lite mode** (off by default). Off, it's a straight roguelike: every run starts from scratch. On, every run that ends pays out credits: 10 per floor cleared, 5 per secondary met, 2 per reaction, and 100 for finishing the series. You spend them on the progression tree (below).

## The progression tree

In rogue-lite mode, credits buy nodes on the **Facility Development Plan**, a tree of 54 upgrades around one starting node, the Facility Charter. Open it from settings, the title screen (U) or the run-over sheet. Upgrades apply when a new run starts.

- **Six branches** go out from the charter in every direction: Funding (rerolls, credits), Clock (time, Adrenaline, Combo), Arsenal (weapon damage and level, crits, a second starting weapon), Machine (trap damage and level, chains, a second starting trap), Subject (weaker dummies, limbs, splitting) and Lab (status effects, reactions, Second Wind, more card choices).
- Each branch splits in two at ring 3 and joins again at a **keystone**: Blank Cheque, Overclocked, Master Armorer, Full Automation, Defective Batch and Chain Reaction.
- **Bridges** link neighbouring branches at ring 3.7. An outer ring of six **directorate** upgrades joins the keystones.
- Costs rise outward: 25, 50, 90, 140 and 240 credits per ring, 110 for a bridge and 380 for a directorate upgrade.
- **Undiscovered upgrades are hidden.** You see the nodes you own and the ones next to them, which you can buy. One step further, nodes show only as a "?" marker. Anything beyond that isn't drawn at all.
- Drag to pan, scroll or use + / - to zoom, C to recenter, N to jump to the next node you can buy, and B or Enter to buy it. Tap a node to inspect it. On desktop the side panel totals what your upgrades add up to.
- Purchases from the earlier flat upgrade shop are refunded as credits.

## Saves and records

- **Run saves.** A run saves itself between floors: on the act screen and the route choice. If you close the tab or quit to the title, the title offers **CONTINUE**, which resumes at that floor. NEW RUN asks for a second tap before discarding the save. A run that ends deletes its save.
- **High scores.** Every run that ends goes on a top-ten table (RECORDS on the title or the run-over sheet). Scoring: 1,000 per floor, 250 per secondary, 50 per reaction, 20 per dummy, damage / 10, and 5,000 for certifying the series. A won run that carries on into endless keeps one entry, updated when it ends.
- Settings, rogue-lite progress, saves and records all live in the browser's local storage.

## The cardiac monitor

The dummy has a heart, and the results sheet prints its ECG. Damage, torn limbs, being grabbed and burning push the rate up from about 66 BPM toward 220, and freezing slows it down. Electrocution (taser, tesla coil, Overload and the rest) throws it into ventricular fibrillation for as long as the shock lasts. A destroyed dummy flatlines until the next one comes in.

The monitor shows a six-second lead II rhythm strip of the most telling moment: the first shock if there was one, else the fastest stretch. Under it is the rate over the whole round, with shocks and flatlines shaded, and rest, average and peak rate, V-fib and arrest counts.

Sheets fit themselves to the screen: each one measures its layouts and uses the fullest that fits. Desktop puts injury and cardiac side by side. Short screens drop the damage trace first, then the injury diagram.

## How a run works

- **Structure.** Pick a starting weapon and a first trap from three each (Hands are always free), then fight through **three acts of five floors**. Floor 5 of each act is a boss. Beat act 3 to win the run, then keep going in endless mode if you like.
- **Acts** change the arena:
  - **Padded Cell:** normal.
  - **Crash Lab:** low gravity.
  - **Furnace:** flame vents erupt from the floor and set anything above them burning.
- **Entrances.** Every dummy arrives through the act's entrance, including respawns and the one on the title screen. The clock waits until the first one is in.
  - **Padded Cell:** a steel cell door in the left wall swings open, an orderly's arm lobs the dummy in tumbling, and the door slams.
  - **Crash Lab:** a hazard-striped ceiling hatch flashes, opens its flaps, and the dummy falls through.
  - **Furnace:** a delivery chute in the right wall pops its flap and shoots the dummy out head first.
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

## The machine

Traps are the heart of a run. They bolt onto **8 mount points** (three on the floor, three on the ceiling, one on each wall) and act on their own every round. You start each run with one, more come from cards, and each trap type levels up with its own two perks.

| Trap | Mounts on | What it does |
| --- | --- | --- |
| Spring Pad | Floor | Launches anything that lands on it into the ceiling |
| Spinner | Floor, ceiling, wall | A motorized bat arm. Blunt, so it shatters ice |
| Fan | Floor, wall | On the floor it juggles the dummy in mid-air; on a wall it pins it |
| Flame Jet | Floor, wall | Fires a jet of flame every few seconds |
| Floor Saw | Floor | A circular saw running back and forth on a track |
| Tesla Coil | Floor, ceiling | Zaps the nearest dummy and sets off shock reactions |
| Cryo Sprinkler | Ceiling | Freezes whatever is below it |
| Nail Turret | Wall, ceiling | Tracks the dummy and nails it to the wall |
| Crusher | Ceiling | Slams down on anything that passes beneath it |

Traps work together. A spring pad under a crusher, a cryo sprinkler over a spinner, a tesla coil next to a nail turret: each pair sets off something neither does alone.

**Chain.** Every distinct damage source that has landed a hit in the last 2 seconds adds +15% to all damage. A single weapon stays flat, while a machine with six things going off at once snowballs. The current chain shows in the top-right of the arena.

Trap damage is credited to the trap, so it never breaks weapon bonuses like "Stick to one weapon." Two goals are built around it: the objective *Your traps deal X damage*, and the bonus *Hands off: only traps deal damage*.

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
    traps.js         the machine: mount points and the nine traps
    projectiles.js   grenades, anvils, rockets, vortexes
    entrances.js     per-act spawn animations (cell door, ceiling hatch, chute)
    weapons.js       weapon definitions (input handlers, held-weapon physics config, perks)
    objectives.js    objectives, bonus conditions, round and route generation
    cards.js         card pool, rarity weights, offers
    run.js           state that persists across a run
    settings.js      saved settings (gore, rogue-lite)
    tree.js          the rogue-lite progression tree: nodes, layout, links
    meta.js          rogue-lite credits and owned tree nodes
    save.js          run saves between floors
    scores.js        the high score table
    gore.js          blood droplets, stains and stump spurts
    heart.js         the subject's heart: rate, fibrillation, flatlines
    hud.js           desktop sidebar, or a top strip + weapon rack on phones
    layout.js        desktop-first screen layout and the world-unit scale
    background.js    pre-rendered backdrop per act
    icons.js         vector weapon icons and grip-origin held weapon sprites
    sfx.js, theme.js
    scenes/play.js   the arena: damage pipeline, physics callbacks, run flow, act hazards
    scenes/sheet.js     report paper: primitives, the printer, the Overlay base class
    scenes/overlays.js  title, routes, acts, test order, results, cards, pause + codex, run end, settings
    scenes/tree-overlay.js  the progression tree screen
    scenes/records.js   the high score table screen
  main.js
```

How the main pieces fit together:

- **Damage pipeline.** Weapons call `PlayScene.dealDamage(dummy, segment, amount, weaponId, {kind})`.
  - `kind` is `hit`, `blast`, `impact`, `dot`, `grind` or `reaction`.
  - It first gives the status system a chance to react (Shatter), then applies run modifiers, armor and the dummy's response.
  - Finally it records the event: round stats, per-weapon totals and the bonus check.
  - Damage from the arena itself (Furnace vents) hurts dummies but never counts for or against you.
- **Statuses and reactions** live in `statuses.js`. Weapons go through scene helpers (`addBurn`, `addChill`, `addShock`, `addNail`, `addBleed`), and each reaction is rate-limited per dummy so combos can't loop.
- **Entrances** start each dummy just outside the arena. `Point.passWall` lets its points through that one wall until the whole body is inside, and the arena clip hides the part still outside.
- **Tear Away** reads `Stick.strain` from the physics step: how stretched a stick was before the solver corrected it.
- **Adding content.** Each of these is a single entry:
  - a weapon: `WEAPONS`
  - a trap: `TRAPS`, each with `update` and `draw`
  - a dummy variant: `VARIANTS`
  - an act: `ACTS`
  - an objective: `PRIMARY`
  - a bonus condition: `SECONDARY`, plus a case in `secondaryEvent`
  - a card: `STATIC_CARDS`
  - a reaction: `REACTIONS`, plus the trigger in `statuses.js`

In the browser console, `window.crashTest` exposes `{ engine, play }` for poking at state.
