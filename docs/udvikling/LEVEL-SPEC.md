# Skyhøj Parkour – level authoring specification

You design ONE level (sometimes two) of the 15-level Danish 3D parkour game in
`/home/user/Parkour/game.js` (Three.js + cannon-es). A level is pure data: a JSON object with a list
of segments that the engine (`buildLevelData` in game.js – read it) turns into platforms and helpers.
Its look comes from a world kit (written by artists in `<SCR>/kits/<kit>.js`), its sky from the
kit's theme. **Do NOT edit game.js, the kits or the harness.** You write
`<SCR>/levels/L<NN>.json` (NN = 01..15) and prove it with the planner bot.

The game owner asked (Danish): more varied levels; **longer jumps where the hands must catch and
hold on**; buyable double jump; chalk only improves the hands' grip; not just hopping on stones –
come up with good ideas; 15 levels; one level on a skateboard. The approved design for every level
(world, sky, mechanics, set pieces, hands moments, difficulty) is in `<SCR>/dev/design-plan.json`
(`result.levels[i]`) and `<SCR>/dev/briefs/<kit>.json`. Follow it closely: implement every named
set piece – they are what makes each level memorable – then fill the rest with varied, fun flow.

## Level object

```json
{ "name": "Himmelengen", "kit": "meadow", "theme": "meadow", "reward": 20,
  "needsRope": false, "needsDouble": false, "chalkTip": false, "skate": false,
  "segs": [ … ] }
```
- `name`: Danish level name from the plan. `kit` = `theme` = the kit id.
- `reward`: L1..L15 = 20, 25, 30, 35, 40, 45, 50, 55, 60, 70, 75, 80, 85, 90, 100.
- `needsRope`: true for L8–L15 (the rope must really be required: at least one gap that cannot be
  crossed without it). `needsDouble`: true for L11–L15 (same: at least one gap that requires it).
- `chalkTip`: true for L4 (shows the chalk shop tip). `skate`: true only for L6.

## Segments (the DSL – read `buildLevelData` to confirm details)

The course is a chain. A cursor walks along a **heading** (starts towards −Z). Each **platform**
segment is placed `g` metres after the previous platform's edge (edge to edge, measured along the
heading), centred on the heading line (+ `x` lateral offset, + = right), with its top `dy` higher
than the previous top.

Platform keys: `t` (type, default `"p"`), `g` (gap, default 3), `w` (width across), `d` (depth
along), `h` (thickness; default from size), `dy`, `x`, `turn` (degrees, applied BEFORE placing this
platform, + = right turn; changes the heading for the rest of the course), `yaw` (extra visual
rotation in degrees – also rotates the physics box), `shape: "cyl"` (round, diameter `w`),
`v` (kit variant name – see the kit's summary), `coin: true` (a coin 1.3 m above it),
`grab: true` (marks a designed hand-catch ledge: stronger chalk lip), `slick: true` (wet/hot/frosty
edge: grip drains 2×), `cp: true` (checkpoint – see below), `hint: "Dansk tekst"` (a pop-up the
first time you land on it), `mv: {ax, amp, per, ph}` (ANY platform moves: `ax` "x" sideways / "y"
up-down / "z" along the course, amplitude m, period s, phase 0..1), `sw: {ax, len, amp, per, ph}`
(any platform swings like a pendulum, `amp` in degrees).

Types: `start` (first segment, big), `finish` (last segment, big; the portal stands on it), `p`
(normal), `ice` (slippery floor + icy ledge), `crumble` (falls 0.55 s after you land, comes back after
~3 s), `move` (classic moving plate; keys `ax, amp, per, ph` at top level), `swing` (pendulum plate;
`len, amp, per, ph, ax`), `bounce` (springs you up with `pow` m/s, default 18), `spin` (disc with a
rotating knock-back arm; `spd` rad/s, `cross: true` for 2 arms), `conveyor` (belt, `spd` m/s, negative =
against you; `ax: "x"` = sideways), `rot` (turntable cylinder, `spd` rad/s), `vent` (updraft grate:
`lift` metres, `pow`, `pulse` (period s, 0 = always on), `duty`, `ph`), and skate-only `ramp`
(`len`, `rise`), `rail` (grind rail, `len`), `boost` (`spd`).

**Helpers** are placed relative to the previous PLATFORM (they do not move the cursor; the next
platform's `g` still counts from that platform's edge): `at` = metres out from its edge along the
heading, `x` = lateral offset, `y` = height above its top.
- `{"t":"bar", "at", "y", "x", "len", "ang", "r", "v", "mv":{…}, "sw":{"len","amp","per","ph","ax"}}` – a
  hang bar. It STARTS at (at, x) and runs `len` metres in direction heading+`ang` (ang 0 = straight
  ahead along the course → monkey bar you move along with W; ang 90 = to the right → a rung across
  the course: use `x: -len/2` to centre it). `sw` makes a trapeze (swings from ropes), `mv` a moving
  bar. Bars are at `y` 2.2–2.8 above the platform you jump from (hands reach ≈2.1 m above the feet
  standing; a jump adds ≈2.3 m).
- `{"t":"zip", "at", "y", "x", "len", "drop", "ang"}` – zipline cable from (at, x, y) running `len`
  metres along heading+ang, dropping `drop` metres. You catch it with the hands, slide down
  (accelerates), and let go automatically at the end (or Space). **The end must be ≈2.2 m above the
  landing platform's top and over or just before it.**
- `{"t":"anchor", "at", "y", "x", "ax", "amp", "per"}` – rope hook (needs the rope).
- `{"t":"coin", "at", "y", "x"}` – a floating coin (5 coins each).
- `{"t":"wind", "at", "x", "y", "r", "h", "pow"}` – an updraft column (bottom at `y` relative to the
  previous top, default −8; height `h`; radius `r`).
- Do NOT use `gust` (rejected by the design).

## What the runner can do (measured with the real physics – see <SCR>/dev/MEASURED.md)

Run 9 m/s, jump 10.5 m/s (≈2.3 m high), gravity 24. Hands catch ledges automatically when the
player falls past an edge (window ≈0.55 m, reach ≈0.95 m; chalk +0.4 m), then W/Space climbs up.
Bars catch automatically too; Space+direction leaps to the next bar/platform (≈6.5 m/s forward,
5 m/s up), Space alone hops straight up (for vertically stacked bars), S drops. Grip lasts ≈4.2 s
on a ledge, ≈5.5 s on a bar (×0.77 while moving; ×2 drain on icy/slick ledges); it refills on the
ground. Double jump: a second jump in the air (9.8 m/s), resets on landing/grab/rope.
Exact gap tables: `<SCR>/dev/MEASURED.md` (max plain gap per height difference, double jump, bar
spacing, vent/bounce heights). Use them while designing, then prove it with the bot.

## Design rules (from the approved plan)

- Gap budget: plain jumps ≤ 7 m (comfortable), hand catches 8.5–9.3 m same height / 8–8.5 m to +1 m /
  6.5–7.5 m to +1.5–2 m, double jump 10–13 m, double + catch 13–14.5 m, rope 15–30 m (≤ 40 m only for
  long-rope shortcuts). Stay a little inside the measured maxima for mandatory jumps (≥ 0.4 m margin)
  except on the deliberately hard levels (L5, L10, L15).
- Grip budget (mandatory hanging between rests, WITHOUT chalk or gloves): dry ledge shimmy ≤ 5 m, icy
  ledge shimmy ≤ 2.5 m, monkey bars ≤ 9 m. Chalk is never required. From L4 on, add an optional
  chalk-only coin route (about twice those limits) and from L4 a coin cache behind a double-jump
  shortcut (optional).
- Inventory: L1–L7 must be beatable with NO items. L8–L10 with rope only. L11–L15 with rope + double.
- Every level has hands moments (except L6 skate): catch-jumps, shimmies, bars, zips, trapezes.
- Variety: no long stretch of identical platforms; mix sizes, shapes (`cyl`!), heights, turns (use
  `turn` to make S-curves, zig-zags, spirals – a level is NOT a straight line), variants and
  mechanics. Use the kit's variants so the world reads as its theme (see the kit summary).
- Platforms must not overlap each other or the course's flight paths (the bot warns about overlaps;
  spirals need enough height between laps: ≥ 5 m).
- Checkpoints (`cp: true`): put one on a wide, static, safe platform roughly every 120–180 m of course
  (after each set piece/chapter); none on L1–L2 except one midway. Never on crumble/moving platforms.
- Coins: 6–14 bonus coins per level (L6: 20 coins on the racing line), some on the main route as
  guidance, the rest as optional rewards (double-jump shortcuts, chalk routes, hidden corners).
- Length/segments roughly as in the plan (L1 ≈ 200 m … L10 ≈ 650 m, L15 ≈ 750 m). Completion time for
  a good player 1–4 minutes.
- Hints (`hint`): short Danish pop-ups at the first occurrence of a new mechanic (as the plan says),
  e.g. "Hop mod kanten – hænderne griber selv! W: klatr op". Use proper Danish (æ, ø, å).

## Skateboard level (L6)

`skate: true`. The board auto-rolls: W pushes (≤13 m/s), A/D steer, S brakes, Space ollies
(8.6 m/s up); `boost` pads launch to `spd` (default 22 m/s); `ramp` kickers launch you (fast + steep
ramp = big air); landing on a `rail` grinds automatically. Road decks are `p` platforms with g ≈ 0
(contiguous) and slight `dy` downhill; gaps are ollie gaps (≤ ≈7 m at 13 m/s) or kicker gaps (bigger,
use boost before). Turns must be gentle (≤ 25–30° per segment on long decks). No hands moments, no
crumble/bounce. 20 coins on the racing line.

## Prove it with the planner bot (mandatory)

```
cd <SCR>/harness && GAME_DIR=/home/user/Parkour Q=debug LEVEL_FILE=<SCR>/levels/L<NN>.json \
  INV=<items> VERBOSE=1 timeout 1200 node run.js bot2.js
```
`INV`: L1–L7 empty (`INV=`), L8–L10 `INV=rope`, L11–L15 `INV=rope,double`. The bot plays the whole
level with the real physics (it runs, jumps, catches ledges, climbs, moves along bars, leaps, rides
ziplines, trapezes, vents, updrafts, ropes, double jumps, skates), trying timing variants for every
stage, and prints each stage + `RESULT: PASS|FAIL`. On FAIL it tells you the stage, the situation and
the failure reasons per variant (`DEBUG_STAGE=<k>` prints every variant of stage k). Fix the level
(or, if you believe the bot is wrong, explain why in your report – but a level we ship must PASS).
Also prove the item requirements: L8 with `INV=` must FAIL (rope needed), L11 with `INV=rope` must FAIL
(double jump needed) – apply the same check to every level that sets needsRope/needsDouble.

Screenshots of the route in the real kit: add `KITS_DIR=<SCR>/kits SHOTS=<SCR>/preview/L<NN>`
(slow – software rendering on a shared 4-CPU machine; one process at a time, timeout 1800). Look at
them with Read: does the level look like the plan's world, varied and readable?

## Report

Return: file path, bot result line(s) (with and without the required items), number of platforms,
helpers, coins, checkpoints, approximate length and route time, which set pieces you implemented and
how, and honest known issues.
