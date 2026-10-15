# Skyhøj Parkour – realistic runner specification

The game (`/home/user/Parkour/game.js`, Three.js r160) currently draws the player with a toy-like
capsule figure (`buildCharacter` / `animateCharacter`, search `function buildCharacter`). The owner
asked: **"manden skal være mere realistisk"** (the man must be more realistic). Replace it with a
realistic, well-proportioned, well-animated adult parkour runner – procedural geometry only (no
external models/textures/network), standard Three.js r160 classes only (no addons such as
BufferGeometryUtils/GLTFLoader – they are not loaded).

**Do NOT edit game.js.** Write `<SCRATCH>/character/character.js`, a classic script defining

```js
window.createCharacterModule = function (THREE) {
  // constants you need (copied from game.js CFG – do not read CFG):
  const RADIUS = 0.42;      // the root is the physics body centre; the FEET are at y = -0.42
  const RUN_SPEED = 9;      // m/s full run
  const HANG_DROP = 1.72;   // when hanging, the hands are 1.72 m above the root
  const WALL_GAP = 0.47;    // … and the ledge is 0.47 m in front of the root (towards local −Z)
  function build() { … return rig; }
  function animate(rig, s, dt) { … }
  return { build, animate };
};
```

The file will later be pasted into game.js (it becomes `CHARACTER = createCharacterModule(THREE)`),
so: clean readable code, short **Danish** comments, no console.log, ≤ 1400 lines.

## Rig contract (what the engine uses)

`build()` returns an object with at least:
- `root` (THREE.Group) – the engine sets `root.position` to the body centre every frame, and toggles
  `root.visible`.
- `inner` (THREE.Group, child of root, `rotation.order = 'YXZ'`) – the engine sets `inner.rotation.y`
  = facing (the figure looks along its local **−Z**) and `inner.rotation.x` = board pitch on the
  skateboard, and `inner.visible` (hidden when the camera is very close). Everything visible hangs
  under `inner`.
- `hands`: `[left, right]` Object3Ds placed in the palms (the rope attaches to `hands[1]`, chalk dust
  is emitted from both; the engine calls `getWorldPosition` on them).
- `setChalk(k)` – k ∈ 0..1, whitens palms/fingers (chalk), 0 = clean skin.
- `board` – the skateboard Group (child of inner), hidden unless `s.mode` is `skate`/`grind`. Build a
  proper board: maple deck with kicked nose/tail (concave optional), black grip tape, metal trucks,
  4 urethane wheels; length ≈ 0.8 m; deck top ≈ 0.11 m above the feet line; board along local Z.

Keep your own per-rig animation memory on the rig object (e.g. `rig._st = {…}`) – several rigs can
exist at once (the preview lines up 5–6 copies).

Shadows: set `castShadow = true` on body meshes. Materials: create per `build()` call is fine.
Budget: ≤ 70 meshes, ≤ 40k triangles for the whole figure (+board).

## Animation state `s` (passed every frame, `dt` in seconds)

```
mode: 'idle' | 'run' | 'air' | 'hang' | 'climb' | 'rope' | 'skate' | 'grind'
speed (m/s horizontal), vy (vertical velocity), grounded (bool), runPhase (radians, advances with
speed – you may instead integrate your own distance-driven phase from speed*dt), time (s),
squash (0..1 landing impact, decays), flipT (-1 = none, 0..1 = double-jump flip progress, 0.5 s),
chalk (0..1), hangKind: 'ledge' | 'bar' | 'zip' | null, shimmy (-1..1 sideways movement while
hanging), climbT (0..1 mantle progress, 0.42 s total), push (bool, skate push), lean (-1..1 skate
turn), crouch (0..1 skate crouch/ollie charge),
grip (0..1 grip stamina – tremble below ~0.3), turnRate (rad/s, + = turning left),
surface: 'ice' | 'conveyor' | null,
gripLocal {x,y,z} | null – where the hands hold, in the inner (facing) frame: ledge ≈ (0, 1.72, −0.47),
  bar/zip ≈ (0, 1.72, 0) (may shift sideways while shimmying on a bar),
gripTangent {x,y,z} | null – direction along the ledge/bar in the inner frame (place the hands ±0.2 m
  along it; for a bar this can point forward (bar along the body's view) – rotate the hang pose so the
  palms grip it naturally),
ropeDir {x,y,z} | null – unit vector from the chest towards the rope hook (inner frame),
aimLocal {x,y,z} – camera look direction (inner frame) – turn the head toward it subtly,
gear: { gloves, chalk, rope, helmet } – owned equipment to show on the body: fingerless climbing gloves,
  chalk bag on the belt/hip, a coiled rope over the shoulder, a helmet + knee pads on the skate level.
```

## What "realistic" means here (from the design plan – implement as much as possible)

See `<SCRATCH>/dev/briefs/character.json` for the full list. Priorities, in order:
1. **Proportions & anatomy**: 1.80 m tall, ~7.5 heads, shoulders wider than hips, hips at ~0.95 m,
   long legs, neck + trapezius, tapered torso (LatheGeometry flattened front/back), real joint
   hierarchy (pelvis › spine › chest › neck › head; shoulder › upper arm › forearm › hand with palm,
   thumb and 4 two-segment fingers; hip › thigh › shin › foot with toe pivot), joint spheres hiding gaps.
   Feet must stand exactly on y = −0.42 in idle/run contact.
2. **Run cycle** that doesn't slide: phase from distance (stride ≈ 2.2 m at 9 m/s); contact/down/passing/
   up; arms counter-swing with ~90° elbows; shoulder/hip counter-rotation; pelvis bob twice per cycle;
   torso lean with speed; blend idle → jog → sprint smoothly; bank into turns (turnRate × speed).
3. **Air**: anticipation is not possible (no pre-jump event) – instead: takeoff extension when vy > 6,
   knee tuck near apex, legs reaching down when falling (vy < −6), arms for balance; landing squash
   (bend knees, scaled by `squash`). **Double jump (flipT 0..1) = a proper forward somersault** around the
   body's centre of mass (rotate a pivot ~0.9 m above the feet, full 360° over flipT, tucked).
4. **Hands**: hanging pose with two-bone IK so both palms sit exactly at gripLocal ± 0.2·gripTangent
   (elbows bend naturally); fingers curled around the edge/bar; ledge = braced hang (feet against the
   wall at about z −0.3, knees bent), bar/zip = free hang (legs dangling, pendulum lag after the catch);
   shimmy = hand-over-hand alternation; climb (climbT) = mantle: pull chest to edge, elbow up, knee on
   the edge, stand; low grip (< 0.3) → arms tremble, fingers slip a little; chalk → white palms.
   Rope: one hand above the other along ropeDir, body aligned with the rope, legs together trailing.
5. **Skateboard**: sideways stance on the board (board along local Z, rider faces local +X or −X with
   head turned forward), knees bent, arms out; `push` = back foot pushing the ground; `lean` banks the
   rider; `crouch` = ollie crouch / pop; air on board (grounded false) = knees up + one-hand indy grab when
   in the air > 0.25 s; grind = low crouch, arms wide.
6. **Life & materials**: breathing in idle, weight shifts, blinking eyes (sclera + iris), brows, nose,
   ears, short clumped hair; hoodie with hood + drawstrings + pocket, joggers, sneakers with white midsole;
   MeshPhysicalMaterial with `sheen` for fabric, warm skin with slight sheen; a subtle rim light feel via
   emissive or sheen so he reads against dark skies; simple spring secondary motion for hood/drawstrings/
   chalk bag/rope coil.

Colour identity: keep the existing palette so screenshots/docs stay recognisable – red-orange hoodie
(#e4472d-ish), navy joggers, white sneakers, a yellow headband/sweatband accent.

## Verify (mandatory)

```
cd <SCRATCH>/harness && GAME_DIR=/home/user/Parkour Q=debug CHAR_FILE=<SCRATCH>/character/character.js \
  OUT=<SCRATCH>/preview/char timeout 400 node run.js preview-char.js
```

Saves `char-a-run-{side,front}.png` (idle + 4 run phases), `char-b-air-*` (rise, fall, flip 0.3,
flip 0.65, landing squash), `char-c-hands-*` (ledge hang, ledge shimmy, bar hang, climb 0.35, climb 0.8,
rope), `char-d-skate-*` (stand, push, lean, ollie crouch in air, grind) and `char-z-closeup.png`,
and prints `ERRORS`. Look at every image with the Read tool; iterate (≥ 3 rounds) until it looks like a
believable athletic person in every pose: feet on the ground line, hands exactly at the grip point
in hang poses (the preview places the grip at (0, 1.72, −0.47) for ledges), no detached limbs,
no intersecting body parts, readable silhouette. Syntax-check with
`node -e "new Function(require('fs').readFileSync('<file>','utf8'))"`. `ERRORS` must be `none`.
Run only ONE preview process at a time (the machine is shared by many agents). The software
renderer is slow (~1–3 FPS); use timeout 900; `W=960 H=540` speeds up iteration rounds.
When done write `<SCRATCH>/character/summary.json`: `{"file","meshes","tris","lines","features":[...],"knownIssues"}`.

Also run the live-game check: `CHAR_FILE=… node run.js <SCRATCH>/harness/char-live.js` (if it exists)
which plays a few seconds of real movement with your character.
