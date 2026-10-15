# Skyhøj Parkour – World Kit specification

The game (`/home/user/Parkour/game.js`, Three.js r160 + cannon-es) builds every level from
a list of segments → platforms/bars/ziplines/anchors (physics is fixed: boxes and cylinders).
A **world kit** decides what those things LOOK like, plus the scenery and the sky theme.
Read `game.js` section "WORLD_KITS.sten" (search `WORLD_KITS.sten = {`) – it is the reference
kit and the fallback. Also read `makeKitContext`, `courseHelpers`, `Level.buildPlatform`,
`Level.buildBar`, `Level.buildZip`, `Level.buildAnchor`, `buildLevelData` and `THEMES`.

**Do NOT edit game.js.** You write standalone kit files only.

## File format

One file per kit: `<SCRATCH>/kits/<id>.js`, a self-contained classic script (no imports):

```js
(function () {
  'use strict';
  window.SKYHOJ_THEMES.<id> = { ...sky theme... };
  window.SKYHOJ_KITS.<id> = {
    id: '<id>', name: '<Danish name>',
    variants: { hay: 'upright hay bale – use shape:"cyl", w 3-5', barn: '…' },  // documentation for level authors
    create(ctx) {
      // per-level state (materials, textures, caches) lives here – created fresh for every level
      return { platform(p) {…}, bar(b) {…}, zip(z) {…}, anchor(a) {…}, spinArm(p) {…},
               decor(data) {…}, update(dt, t) {…}, ventColor: '#…', slickColor: '#…' };
    },
  };
})();
```

All code must use `ctx.THREE` (never globals other than `window.SKYHOJ_*`). The file will
later be pasted verbatim into game.js, so it must be clean, readable, commented in **Danish**
(short comments, same tone as game.js), no console.log, no external assets (procedural
geometry + CanvasTextures only), no network. Size budget: **≤ 900 lines per kit** (aim 400-700).

## The sky theme (`window.SKYHOJ_THEMES[id]`)

Same fields as the entries in `THEMES` in game.js:
`top, horizon, bottom` (sky gradient), `sunElev, sunAz` (degrees), `sunColor, sunInt` (directional
light, keep 1.6–3.4), `hemiSky, hemiInt`, `fog, fogNear, fogFar` (keep fogFar ≥ 380),
`cloud` (cloud sprite tint), `clouds` (0..1 amount of the engine's cloud sprites; 0 for space),
`stars` (0..1), `moon` (bool), `stone` (tint of the shared stone material), `exposure` (0.95–1.3),
`lavaGlow` (0.8–1.7). Match the level's sky description from your brief. Extra sky dressing
(aurora, planets, nebula, sun halo, lightning…) goes in `decor()` with `fog: false`,
`depthWrite: false` materials placed 600–1800 m away (camera far plane is 2600).

## Platforms: `platform(p)` → THREE.Object3D

The returned object is placed at the **centre of the physics box** and rotated with it, so in
local space: the walkable top is the plane **y = +p.h/2**, the footprint is **x ∈ ±p.w/2**
(across the course), **z ∈ ±p.d/2** (local −Z = forward along the course). Cylinders
(`p.shape === 'cyl'`) have radius `p.w/2`. Ramps (`type 'ramp'`) are a tilted box: length along
local Z is `p.slopeLen` (not p.d), the frame is already pitched.

Hard rules (players must be able to trust what they see):
1. The visual top surface must coincide with y = +h/2 over the whole footprint (±3 cm). Nothing
   non-physical may stick up above the top inside the footprint or within 0.6 m outside it
   (flat decals ≤ 3 cm are fine). No railings, posts, plants, props on top of platforms.
2. Side walls should be flush with the footprint edge from the top down at least `p.h`
   (the hands hang on that edge; the body leans on that wall). Under-structures may continue
   further down (buildings, trunks, soil cones, stilts, columns) but must **stay inside the
   footprint** (they may taper inward, never stick out) and must not go deeper than
   `ctx.freeBelow(p)` metres below the box bottom (`p.top - p.h`) – deeper would cut through
   other parts of the course. Never extend below `ctx.lavaY`.
3. Mark the main body mesh(es) that approximate the collision box with `mesh.userData.solid = true`
   (used for camera collision, rope aiming, blob shadow). Do NOT mark under-structures or decor solid.
   Exactly the physics box volume, more or less.
4. Mark glows/transparent bits with `userData.noCastShadow = true`.
5. Return `null` only if you really cannot draw something → the stone fallback is used (ugly; avoid).

You must give every platform type a look that fits your world (the level design only uses some,
but authors may use any): `start`, `finish` (big, 10×10ish; the engine adds the start sign and the
portal), `p` (normal), `ice` (slippery – must read as ice/glass/wet-slick), `crumble`
(**must show cracks**; the engine shakes and drops it), `move` / `swing` (classic moving plates;
`p.move` / `p.swing` set; **any** type may also have `p.move`/`p.swing`/`p.kin` – e.g. a basket
that rises), `bounce` (springy – engine squashes the mesh), `spin` (a base disc; the engine draws
the rotating arm(s) 0.5 m above the top – you may supply `spinArm(p)`: one arm along local X,
length `p.bar`, ~0.36 tall × 0.45 deep, centred), `conveyor` (belt: things are carried along
local −Z at `p.belt` m/s, or along +X if `p.beltAx === 'x'`; animate a texture offset in
`update`), `rot` (turntable cylinder; rotates), `vent` (updraft grate – engine emits particles in
`ventColor`; `p.pulse` > 0 means it switches on/off), `ramp` (skate ramp/kicker), `rail`
(grind rail, w 0.16, h 0.12, long along Z), `boost` (skate boost pad – glowing chevrons pointing −Z).

Platform fields you can read: `type, shape, w, d, h, top, yaw, heading, index, seed` (int, use it
for deterministic per-platform randomness via `ctx.mulberry32(p.seed)`), `v` (variant string or
null), `grab` (true = a designed hand-catch ledge), `slick` (wet/hot/frosty edge: grip drains 2×),
`dbl`, `rope`, `move`, `swing`, `kin`, ramp: `top0, rise, pitch, slopeLen`; spin: `spd, cross, bar`;
conveyor: `belt, beltAx`; vent: `lift, power, pulse`; boost: `boost`; rot: `spd`; bounce: `pow`.

**Variants** (`p.v`): define a handful (3–8) of named looks the level authors can pick per
platform to make the level varied (e.g. meadow: `bridge`, `hay`, `barn`, `hill`, `porch`).
Document each in the `variants` object: what it looks like + which `shape` and size range it
suits. Unknown/null variant → your default look for that type. Variants are purely visual.

The engine ALWAYS adds, on top of your art (do not draw these yourself):
- a faint worn chalk-white lip on every grabbable top edge (stronger for `grab`), a blue frosty
  rim for icy/slick edges (override the slick colour with `slickColor`, e.g. hot orange in a volcano);
- white grip-tape bands on every hang bar; ropes from a trapeze bar up to its pivot;
- a glowing cyan ring around every rope anchor; the zipline handle; coins; start sign; portal.

## Bars: `bar(b)` → Object3D, centred on the bar, local X along the bar

`b.len, b.r` (radius, default 0.06), `b.v` (variant), `b.swing` (trapeze: hangs from ropes –
the engine draws the ropes), `b.move` (a moving bar, e.g. under a drifting airship; you may draw
the carrier ABOVE the bar, at least 2.5 m up, not solid). The bar itself must be a cylinder of
radius ≈ b.r along local X from −len/2 to +len/2 (end caps/brackets OK). Bars are where the hands
grab, so they must read clearly (scaffold pipe, candy cane, branch, torii beam, chain…).

## Ziplines: `zip(z)` → Object3D in WORLD coordinates

From `(z.ax, z.ay, z.az)` (top, where hands start) to `(z.bx, z.by, z.bz)` (bottom). Draw the cable
exactly on that line plus end posts/anchors that do not block the ride (posts go below or beside the
line end, never across the path). Return `null` to use the default.

## Anchors: `anchor(a)` → Object3D at the origin, radius ≤ 0.5 m

The inner decoration inside the engine's cyan ring (radius 0.62): a seed pod, a star, a drone, a
pearl, a temple bell… It may extend upward (e.g. a drone's rotors or a bell's rope going up) but keep
the ring readable. `a.move` set → it moves (drones).

## Scenery: `decor(data)` → Object3D (or null), WORLD coordinates

`data = { plats, bars, zips, anchors, coins, winds, gusts, bounds:{cx,cz,radius,minY,maxY} }`.
This is where most of the world's character lives: distant landmarks, floating islands, buildings,
creatures, weather, sky dressing. Rules:
- Use `ctx.clearOfCourse(x, y, z, margin)` (true = far enough from the course corridor) for every
  object you place near the course; nothing may sit in the jump path or look like a platform you could
  land on. Big landmarks go at `bounds.radius + 40 … + 400` from `(bounds.cx, bounds.cz)`.
- Keep the lava sea visible (no opaque ground planes over it; things may rise out of / float above it).
- Draw `data.winds` (updraft columns) if you want them visible (bubbles, light beams, steam columns).
- Use `THREE.InstancedMesh` for repeated things (trees, windows, sheep, crystals). Budget per level
  for everything your kit makes: **≤ 700 draw calls, ≤ 350k triangles**. Decor should mostly NOT cast
  shadows (`castShadow` false), except a few nearby objects.
- Animate in `update(dt, t)` (windmill, blinking lights, waving kelp, snowfall). Keep it cheap
  (no per-frame allocations, no per-frame geometry rebuilds).

## Context `ctx`

`THREE, TEX, MAT, DEG, clamp, lerp, damp, mulberry32, rng` (seeded per level),
`boxGeometry(w,h,d,tile,{tileTop,sideTile})` and `cylGeometry(r,h,tile,{tileTop,segments})`
(UVs in world metres; material order box: [side,side,top,bottom,side,side], cyl: [side,top,bottom]),
`rockGeometry(radius,depth,seed)` (downward rock cone), `makeCanvas(w,h)`, `toTexture(canvas,{srgb,repeat})`,
`paintPixels(size, fn)`, `tileNoise`, `textTexture`, `fwdVec(h)`, `rightVec(h)`, `theme`, `levelIndex`,
`levelName`, `track(obj)` (register geometry/material/texture for disposal), `clearOfCourse`,
`freeBelow`, `lavaY`.

GPU memory: everything you create must be either attached to the returned objects or passed through
`ctx.track()`. Create materials/textures **inside `create()`** (cache them per level there; share
between platforms). You may use the shared `MAT.*`/`TEX.*` (read-only – never mutate them).
Canvas textures: ≤ 512×512 each, ≤ 12 per kit.

## Look & quality bar

Stylised-realistic, bright and readable, like a polished indie 3D platformer: rich procedural
CanvasTextures (noise, planks, bricks, frosting, moss…), bevel-ish silhouettes (Lathe/Extrude
geometry, chamfered boxes), MeshStandardMaterial / MeshPhysicalMaterial with sensible roughness,
emissive accents for night worlds. **Each world must look completely different from the others –
NOT grey stone blocks.** Platforms must still read as "you can stand here" (flat, clearly lit tops,
contrasting with the background). Danger reads as danger (cracks, glowing heat, ice shine).

## Verify your work (mandatory)

Preview tool (headless Chromium, software GL – slow, ~1–3 FPS, be patient, timeout 400 s):

```
cd <SCRATCH>/harness && GAME_DIR=/home/user/Parkour Q=debug KIT_FILE=<SCRATCH>/kits/<id>.js KIT_ID=<id> \
  OUT=<SCRATCH>/preview/<id> timeout 400 node run.js preview-kit.js
```

It builds a showcase level with every platform type (plus a moving bar, slick and grab ledges,
zipline, trapeze, anchor, skate pieces) in your kit + theme, followed by a row with every variant
you declared (box + cylinder of each), and saves 7 screenshots (`<id>-1-oversigt.png`,
`2-start` (follow camera with the runner), `3-taet`, `4-nedefra`, `5-panorama`, `6-baglaens`,
`7-varianter`) and prints `KIT INFO` (meshes/triangles) and `ERRORS`.
Many agents share the 4 CPUs: for quick iteration rounds add `W=960 H=540` (faster), use full
resolution for the final round. Use `timeout 900`.
Look at every screenshot with the Read tool, fix what looks wrong, repeat (at least 2 rounds).
`ERRORS` must be `none`. Also syntax-check: `node -e "new Function(require('fs').readFileSync('<file>','utf8'))"`.
Run only ONE preview process at a time (the machine is shared with other agents).

When done, also write `<SCRATCH>/kits/<id>.summary.json`:
`{"id","name","variants":[{"name","types","shape","sizes","look"}],"barVariants","themeSummary","decorSummary","meshes","tris","knownIssues"}`
– the variants list is what the level authors will read, so give precise guidance (types, box/cyl,
size ranges, look).
