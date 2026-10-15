export const meta = {
  name: 'skyhoj-kits2',
  description: 'Build Skyhøj Parkour world kits (2 per agent) / the realistic runner, each self-verified with screenshots',
  phases: [{ title: 'Build', detail: 'one artist agent per group, self-verifying with the preview tools' }],
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

const SCHEMA = {
  type: 'object',
  properties: {
    files: { type: 'array', items: { type: 'string' } },
    kitInfo: { type: 'string', description: 'KIT INFO / mesh+tri numbers per kit (or character)' },
    rounds: { type: 'number' },
    knownIssues: { type: 'string' },
  },
  required: ['files', 'kitInfo', 'rounds', 'knownIssues'],
}

const SHARED = `Context: Danish browser game "Skyhøj Parkour" (3D parkour over a lava sea; Three.js r160 + cannon-es; engine /home/user/Parkour/game.js). SCR = ${SCR}. The owner asked for a more realistic runner ("manden skal være mere realistisk"), much more varied levels and "not just jumping on stones everywhere – come up with good ideas yourself". 15 worlds + the runner are built by 9 agents in parallel on a 4-CPU machine: run only ONE preview process at a time, timeout 900, use W=960 H=540 for quick rounds and full resolution for the final round, retry once on timeout. Never edit /home/user/Parkour/game.js or files in ${SCR}/harness (shared); scratch scripts go in ${SCR}/work/<id>/. An earlier attempt was interrupted: if your output file already exists, review it critically and improve/finish it instead of starting over. Work efficiently: read only the game.js parts you need (grep for them), don't re-read large files repeatedly.`

const kitPrompt = (ids) => `${SHARED}

You are a senior technical artist. Build the world kits ${ids.map((id) => `**${id}** (${NOTES[id]})`).join(' and ')}. Make the worlds clearly different from each other and from every other world.
1. Read the binding spec ${SCR}/dev/KIT-SPEC.md and the design briefs ${ids.map((id) => `${SCR}/dev/briefs/${id}.json`).join(', ')}.
2. Study game.js (grep): WORLD_KITS.sten (reference kit + fallback), makeKitContext/courseHelpers, Level.buildPlatform/buildLip/buildBar/buildZip/buildAnchor, buildLevelData, THEMES, applyTheme.
3. Write ${ids.map((id) => `${SCR}/kits/${id}.js`).join(' and ')} (theme + kit + variants) per the spec: gorgeous, distinctive, readable; implement the brief's specific props (platform art per type and variant, bar art, anchors, landmarks, animated details).
4. Verify each kit: cd ${SCR}/harness && GAME_DIR=/home/user/Parkour Q=debug KIT_FILE=${SCR}/kits/<id>.js KIT_ID=<id> OUT=${SCR}/preview/<id> timeout 900 node run.js preview-kit.js — inspect all 7 screenshots with Read; fix top-surface height, props on top of platforms, under-structures outside the footprint, detached parts, stretched/ugly textures, unreadable platforms, scenery in the course, grey-stone fallbacks, budgets, errors. Be your own harsh art director: at least 3 rounds per kit; ERRORS must be "none".
5. Write ${ids.map((id) => `${SCR}/kits/${id}.summary.json`).join(' and ')} per the spec. Return the structured result (honest knownIssues).`

const charPrompt = `${SHARED}

You are a senior character artist/animator. Build the realistic player character.
1. Read the binding spec ${SCR}/dev/CHARACTER-SPEC.md and the notes ${SCR}/dev/briefs/character.json.
2. Study game.js (grep): buildCharacter, animateCharacter, updatePlayerVisual (how state s is filled), replaceCharacter, the debug "lineup" helper, hangFrame/pinHang/placeClimb, doubleJump (flipT), skateControl.
3. Write ${SCR}/character/character.js (window.createCharacterModule(THREE) → { build, animate }) incl. the skateboard model and gear (gloves, chalk bag, rope coil, helmet + knee pads).
4. Verify: cd ${SCR}/harness && GAME_DIR=/home/user/Parkour Q=debug CHAR_FILE=${SCR}/character/character.js OUT=${SCR}/preview/char timeout 900 node run.js preview-char.js (and char-live.js the same way). Inspect every screenshot with Read; iterate ≥ 4 rounds as your own harsh critic until every pose looks like a believable athletic adult (feet planted on the ground line in idle/run, hands exactly on the grey ledge/bar markers in hang poses, a real somersault, natural sideways skate stance on a real board, no detached limbs or intersections). ERRORS must be "none".
5. Write ${SCR}/character/summary.json. Return the structured result (honest knownIssues).`

const groups = (args && args.groups) || []
const results = await pipeline(groups, (g) => g[0] === 'character'
  ? agent(charPrompt, { label: 'build:character', phase: 'Build', schema: SCHEMA })
  : agent(kitPrompt(g), { label: `build:${g.join('+')}`, phase: 'Build', schema: SCHEMA, model: 'sonnet' }))
return { results }
