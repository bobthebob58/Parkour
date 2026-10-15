export const meta = {
  name: 'skyhoj-kits',
  description: 'Build Skyhøj Parkour world kits / runner: builder → independent visual critic → fixer, per item',
  phases: [
    { title: 'Build', detail: 'one artist agent per world kit (or the runner)' },
    { title: 'Critique', detail: 'independent critic renders fresh screenshots and lists problems' },
    { title: 'Fix', detail: 'fix every major + minor problem, re-verify' },
  ],
}

const SCR = '/tmp/claude-0/-home-user-Parkour/eaa922d6-d00f-5fe4-a15d-da7efe1299c2/scratchpad'

const NOTES = {
  meadow: 'level 1 "Himmelengen" – dawn meadow farm islands (turf, soil cones with roots and waterfalls, plank bridges, hay bales, red barn, windmill, sheep, apple tree, standing stones, hot-air balloon). No grey stone anywhere.',
  skatemesa: 'level 6 "Solbanen" – the SKATEBOARD level: desert sandstone mesas, concrete road decks with painted lines, plywood kickers (type ramp), grind rails (type rail), glowing chevron boost pads (type boost), quarter pipes, cacti, arches, camper van, neon "RUL!" sign, huge low sun. ≈700 m course ridden at speed – scenery must hold up.',
  rooftops: 'level 2 "Højhustagene" – sunny day city rooftops: tar/gravel roofs with parapets on tall buildings with window grids (respect ctx.freeBelow!), water towers, AC boxes, window-washer gondola (vertical mover), yellow scaffolding pipes as bars, gondola cable zipline, antennas, helipad, rooftop gardens, laundry lines.',
  neoncity: 'level 12 "Neonbyen" – NIGHT neon city: flying cars/buses as moving platforms (p with p.move), moving walkways (conveyor), rooftop updraft vents, neon-sign frames as bars, power-cable ziplines, hovering drones as rope anchors (anchor() decoration), holographic billboard, rain sheen. Must look clearly different from rooftops (day).',
  candy: 'level 3 "Slikøerne" – candy islands: donuts with frosting and sprinkles, chocolate bars, macarons, wafer bridges, lollipop discs, wedding-cake tiers, marshmallow/jelly bounce pads, cracked biscuit crumble platforms, candy-cane bars, licorice trapeze, chocolate waterfall, cotton-candy clouds, gummy bears.',
  jungle: 'level 8 "Junglekronerne" – jungle canopy: giant mother tree trunk, fungus shelves, branch stubs, branch bars, vine trapezes, mushroom/leaf bounce pads, dead-branch crumble, treehouse decks and zipline, glowing seed pods as rope anchors (anchor() decoration), mist, birds, waterfalls.',
  glacier: 'level 4 "Gletsjeren" – glacier: snow-capped tops on dark rock, glossy translucent ice with icicles, blue frosty icy ledges, cracking thin-ice crumble sheets, rotating ice floes (rot), frozen waterfall, igloos, snowy pines, red research station with antenna, snowfall.',
  crystalspire: 'level 15 "Nordlystårnet" – THE GRAND FINALE: giant crystal-and-gold spire under an aurora at night; glass and frosted-glass platforms, rotating gold rings (rot) and gold arms (spin, spinArm), chandelier pendulums (swing) / trapezes, light-beam updrafts (vents + data.winds), shattering glass crumble, ziplines from outer pillars, floating souvenir props from earlier worlds orbiting as decoration. The course spirals around a central tower: draw the tower in decor() at data.bounds centre, kept clear of the course with ctx.clearOfCourse.',
  harbor: 'level 5 "Luftskibshavnen" – sunny airship harbour: white piers with blue railings (railings only BELOW top level / outside), wicker balloon baskets that rise/sink (p with p.move y – must look like a basket under a balloon, balloon high above), zeppelin gondola decks sliding sideways, cargo crates on crane hooks (swing), rotating mooring-mast top (rot), moving mooring bar under a drifting airship (bar with b.move – draw the airship ≥2.5 m above), cargo-cable zipline, lighthouse, gulls, flags.',
  stormships: 'level 9 "Stormskibene" – a fleet of flying sailing ships in a thunderstorm: bobbing decks (p.move y), swinging anchors (swing), yardarm ladders (bars), rigging trapezes, crumbling planks, capstan spinners (spin + spinArm), wet slick gunwales, mast-top rope anchors, sails, lanterns, lightning flashes, rain. Dark and dramatic, clearly different from the bright harbour.',
  clockwork: 'level 7 "Tandhjulsfabrikken" – brass/copper clockwork factory: conveyor belts (animated), cog turntables (rot – must look like toothed gears), pistons (p.move y), steam vents, crane-arm spinners (spin + spinArm), rusty crumbling grates, copper-pipe bars, crane-hook trapeze, giant clock face with moving hands, steam, warm lamp light.',
  volcano: 'level 13 "Vulkanen" – volcano: basalt hex columns rising/sinking (p.move y), cooled lava crust plates that crack (crumble), geyser bounce pads, heat vents, HOT ledges (slick – set slickColor to a glowing orange), chain hang bars, lava falls, ash, glowing cracks, crater rim. The engine lava sea at y=-50 must stay visible.',
  starfield: 'level 10 "Himlens ende" – edge of space: tiny meteor/shard platforms (1–1.4 m), crumbling meteorites, drifting shards, a satellite with rotating solar-panel arms (spin + spinArm), truss monkey bars, star rope anchors (anchor() decoration), a tiny moon, nebula and planets, theme.clouds = 0. The small rocks must NOT look like the generic grey stone: glowing crystal veins, iron-nickel metal, comet ice, colourful minerals.',
  temple: 'level 11 "Kirsebærtemplet" – cherry-blossom pagoda temple: pagoda eaves as grab ledges, rotating top pagoda tier (rot), torii gates and bamboo as monkey bars, lantern-string zipline, koi pond, temple bell as rope anchor (anchor() decoration), moon gate, stone lanterns, falling petals.',
  skyreef: 'level 14 "Himmelhavet" – an underwater-like coral reef floating in the sky: table corals, jellyfish bounce pads that move up/down (bounce with p.move), manta rays and turtles as moving platforms (p with p.move must look like the animal), bubble-column updrafts (draw data.winds as bubble columns), whale-skeleton ribs as monkey bars, current conveyor, kelp trapezes, pearls as rope anchors, giant clam, caustic light, fish schools.',
}

const BUILD_SCHEMA = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    file: { type: 'string' },
    summaryFile: { type: 'string' },
    meshes: { type: 'number' },
    tris: { type: 'number' },
    lines: { type: 'number' },
    previewDir: { type: 'string' },
    rounds: { type: 'number', description: 'number of preview/fix rounds done' },
    knownIssues: { type: 'string' },
  },
  required: ['id', 'file', 'previewDir', 'rounds', 'knownIssues'],
}
const CRITIC_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['pass', 'needs-fixes'] },
    issues: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['major', 'minor'] },
          area: { type: 'string' },
          problem: { type: 'string' },
          evidence: { type: 'string', description: 'screenshot file / code line' },
          suggestion: { type: 'string' },
        },
        required: ['severity', 'area', 'problem', 'suggestion'],
      },
    },
    strengths: { type: 'string' },
  },
  required: ['verdict', 'issues'],
}

const isChar = (id) => id === 'character'
const fileOf = (id) => (isChar(id) ? `${SCR}/character/character.js` : `${SCR}/kits/${id}.js`)
const previewCmd = (id) => isChar(id)
  ? `cd ${SCR}/harness && GAME_DIR=/home/user/Parkour Q=debug CHAR_FILE=${SCR}/character/character.js OUT=${SCR}/preview/char timeout 900 node run.js preview-char.js   (and char-live.js the same way)`
  : `cd ${SCR}/harness && GAME_DIR=/home/user/Parkour Q=debug KIT_FILE=${SCR}/kits/${id}.js KIT_ID=${id} OUT=${SCR}/preview/${id} timeout 900 node run.js preview-kit.js`

const SHARED = `Context: Danish browser game "Skyhøj Parkour" (3D parkour over a lava sea; Three.js r160 + cannon-es; engine in /home/user/Parkour/game.js). SCR = ${SCR}. The owner asked for a more realistic runner ("manden skal være mere realistisk"), much more varied levels and "not just jumping on stones everywhere – come up with good ideas yourself". 15 worlds + the runner are being built by ~16 agents in parallel on a 4-CPU machine: run only ONE preview process at a time, use timeout 900, W=960 H=540 for quick rounds (full res for the final one), retry once on timeout. Never edit /home/user/Parkour/game.js or files in ${SCR}/harness (shared); put scratch scripts in ${SCR}/work/<id>/.`

const buildPrompt = (id) => isChar(id) ? `${SHARED}

You are a senior character artist/animator. Build the realistic player character.
1. Read the binding spec ${SCR}/dev/CHARACTER-SPEC.md and the design notes ${SCR}/dev/briefs/character.json.
2. Study game.js: buildCharacter, animateCharacter, updatePlayerVisual (how state s is filled), replaceCharacter, the debug "lineup" helper, hangFrame/pinHang/placeClimb, doubleJump (flipT), skateControl.
3. Write ${SCR}/character/character.js (window.createCharacterModule(THREE) → { build, animate }) incl. the skateboard model and the gear (gloves, chalk bag, rope coil, helmet + knee pads).
4. Verify: ${previewCmd(id)}. Inspect every screenshot with Read; iterate at least 3 rounds until every pose looks like a believable athletic adult (feet planted on the ground line in idle/run, hands exactly on the grey ledge/bar markers in hang poses, real somersault, natural sideways skate stance on a real board). ERRORS must be "none".
5. Write ${SCR}/character/summary.json. Return the structured result (honest knownIssues).`
  : `${SHARED}

You are a senior technical artist. Build the world kit **${id}**: ${NOTES[id]}
1. Read the binding spec ${SCR}/dev/KIT-SPEC.md and your design brief ${SCR}/dev/briefs/${id}.json (world look, sky, scenery, the level's mechanics and set pieces = the platform types your level uses).
2. Study game.js: WORLD_KITS.sten (reference kit + fallback), makeKitContext/courseHelpers, Level.buildPlatform/buildLip/buildBar/buildZip/buildAnchor, buildLevelData, THEMES, applyTheme.
3. Write ${fileOf(id)} (theme + kit + variants) per the spec. Make it gorgeous, distinctive and readable – this world must look like nothing else in the game. Implement the specific props from the brief (platform art per type and variant, bar art, anchors, scenery landmarks, animated details).
4. Verify: ${previewCmd(id)}. Inspect all 7 screenshots with Read, fix problems (top surface height, props on top of platforms, under-structures sticking out of the footprint, floating/detached parts, ugly or stretched textures, unreadable platforms, scenery in the course, any type falling back to grey stone, budgets, errors) and re-run. At least 3 rounds. ERRORS must be "none".
5. Write ${SCR}/kits/${id}.summary.json per the spec. Return the structured result (honest knownIssues).`

const criticPrompt = (id, built) => `${SHARED}

You are an independent, demanding art director and code reviewer. Another agent just built ${isChar(id) ? 'the realistic runner character' : `the world kit **${id}** (${NOTES[id]})`} in ${fileOf(id)}. Its own report: ${JSON.stringify(built || {}).slice(0, 1500)}.
Your job is to find what is wrong – do not trust the builder's report.
1. Read the binding spec (${isChar(id) ? `${SCR}/dev/CHARACTER-SPEC.md and ${SCR}/dev/briefs/character.json` : `${SCR}/dev/KIT-SPEC.md and ${SCR}/dev/briefs/${id}.json`}).
2. Render fresh screenshots yourself into a NEW folder: ${previewCmd(id).replace(isChar(id) ? `${SCR}/preview/char` : `${SCR}/preview/${id}`, `${SCR}/preview/${id}-critic`)} – full resolution. Look at every image carefully with Read.
3. Read the code: rule violations (${isChar(id) ? 'rig contract, hands not at grip points, feet not on y=-0.42, per-frame allocations, budget ≤70 meshes/40k tris, global state shared between rigs' : 'visual top ≠ y=+h/2, non-physical props above the top or within 0.6 m outside, under-structures wider than the footprint or deeper than ctx.freeBelow, missing userData.solid, GPU resources not tracked, materials created outside create(), per-frame allocations in update(), budgets (≤700 draw calls, ≤350k tris), decor placed without ctx.clearOfCourse, lava sea hidden, unsupported platform types falling back to grey stone, variants that do not render distinctly'}), runtime errors, Danish comments, size limits.
4. Judge the look against the brief: is it beautiful, distinctive, readable (can a player instantly tell where to stand, where to grab, what is dangerous)? Does it match the brief's specific props and sky? Anything that looks placeholder/programmer-art is a major issue.
Return verdict "pass" only if there are no major issues and at most 2 minor ones. Every issue needs a concrete suggestion.`

const fixPrompt = (id, built, crit) => `${SHARED}

You are a senior ${isChar(id) ? 'character artist/animator' : 'technical artist'}. ${isChar(id) ? 'The realistic runner character' : `The world kit **${id}** (${NOTES[id]})`} in ${fileOf(id)} was reviewed by an independent art director. Fix EVERY issue below (majors first), keeping what works. Read the spec (${isChar(id) ? `${SCR}/dev/CHARACTER-SPEC.md` : `${SCR}/dev/KIT-SPEC.md`}) and the brief (${SCR}/dev/briefs/${id}.json) first, then the current file.
Review: ${JSON.stringify(crit).slice(0, 6000)}
Verify with: ${previewCmd(id)} – inspect every screenshot with Read and iterate until each issue is visibly resolved and ERRORS is "none". Update ${isChar(id) ? `${SCR}/character/summary.json` : `${SCR}/kits/${id}.summary.json`}. Return the structured result (knownIssues = anything still not fixed, honestly).`

const items = (args && args.items) || []
const results = await pipeline(
  items,
  (id) => agent(buildPrompt(id), { label: `build:${id}`, phase: 'Build', schema: BUILD_SCHEMA }),
  (built, id) => agent(criticPrompt(id, built), { label: `critic:${id}`, phase: 'Critique', schema: CRITIC_SCHEMA })
    .then((crit) => ({ built, crit })),
  async ({ built, crit }, id) => {
    if (!crit || (crit.verdict === 'pass' && !crit.issues.some((i) => i.severity === 'major'))) return { id, built, crit, fixed: null }
    let fixed = await agent(fixPrompt(id, built, crit), { label: `fix:${id}`, phase: 'Fix', schema: BUILD_SCHEMA })
    let crit2 = null
    if (isChar(id)) {
      // the runner is the hardest piece: one more critique + fix round
      crit2 = await agent(criticPrompt(id, fixed), { label: `critic2:${id}`, phase: 'Critique', schema: CRITIC_SCHEMA })
      if (crit2 && crit2.verdict !== 'pass') fixed = await agent(fixPrompt(id, fixed, crit2), { label: `fix2:${id}`, phase: 'Fix', schema: BUILD_SCHEMA })
    }
    return { id, built, crit, fixed, crit2 }
  },
)
return { results }
