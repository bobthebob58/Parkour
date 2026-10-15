export const meta = {
  name: 'skyhoj-levels2',
  description: 'Design Skyhøj Parkour levels (2 per agent), each proven with the planner bot',
  phases: [{ title: 'Design', detail: 'level designers, bot-proven' }],
}
const SCR = '/tmp/claude-0/-home-user-Parkour/eaa922d6-d00f-5fe4-a15d-da7efe1299c2/scratchpad'
const pad = (n) => String(n).padStart(2, '0')
const KIT = ['meadow', 'rooftops', 'candy', 'glacier', 'harbor', 'skatemesa', 'clockwork', 'jungle', 'stormships', 'starfield', 'temple', 'neoncity', 'volcano', 'skyreef', 'crystalspire']
const inv = (n) => (n >= 11 ? 'rope,double' : n >= 8 ? 'rope' : '')
const BOT = (n, extra = '') => `cd ${SCR}/harness && GAME_DIR=/home/user/Parkour Q=debug LEVEL_FILE=${SCR}/levels/L${pad(n)}.json INV=${inv(n)} VERBOSE=1 ${extra}timeout 1500 node run.js bot2.js`
const checks = (n) => [
  `${BOT(n)} → must print RESULT: PASS`,
  n >= 11 ? `same with INV=rope (no double jump) → must FAIL` : n >= 8 ? `same with INV= (no rope) → must FAIL` : null,
  n >= 2 && n !== 6 ? `same with NOGRAB=ledge (hands cannot catch ledges) → must FAIL (proves some long jumps need the hands)` : null,
].filter(Boolean).join('\n   - ')

const SCHEMA = {
  type: 'object',
  properties: {
    levels: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          level: { type: 'number' }, file: { type: 'string' },
          botResult: { type: 'string' }, requirementChecks: { type: 'string' },
          platforms: { type: 'number' }, coins: { type: 'number' }, checkpoints: { type: 'number' },
          lengthM: { type: 'number' }, routeTimeS: { type: 'number' },
          setPieces: { type: 'string' }, knownIssues: { type: 'string' },
        },
        required: ['level', 'file', 'botResult', 'requirementChecks', 'setPieces', 'knownIssues'],
      },
    },
  },
  required: ['levels'],
}

const prompt = (ns) => `Context: Danish browser game "Skyhøj Parkour" (3D parkour over a lava sea; engine /home/user/Parkour/game.js – never edit it, the kits or ${SCR}/harness). SCR = ${SCR}. The owner asked: more varied levels ("banerne skal være mere forskellige"), longer jumps where the hands must catch and hold on, buyable double jump, chalk only helps the hands, not just hopping on stones ("kom på nogle gode ideer selv"), 15 levels, one skateboard level. 8 level designers + 9 artists work in parallel on a 4-CPU machine: run only ONE bot process at a time. Your files: ${ns.map((n) => `${SCR}/levels/L${pad(n)}.json`).join(', ')}; scratch in ${SCR}/work/L${pad(ns[0])}/ only. If a file already exists (interrupted earlier run), review and finish it. Work efficiently: grep game.js for what you need.

You are a senior level designer. Design ${ns.map((n) => `**level ${n}** (kit "${KIT[n - 1]}")`).join(' and ')}.
1. Read the binding spec ${SCR}/dev/LEVEL-SPEC.md and the measured physics ${SCR}/dev/MEASURED.md (use these numbers!).
2. Read the approved design: ${SCR}/dev/design-plan.json → result.levels[${ns.map((n) => n - 1).join('] and result.levels[')}] (world, mechanics, layout, set pieces, hands moments, difficulty) and result.rationale (gap & grip budgets, acts), plus the kit briefs ${ns.map((n) => `${SCR}/dev/briefs/${KIT[n - 1]}.json`).join(', ')}. Read buildLevelData in game.js for the exact DSL. Working examples of every mechanic: ${SCR}/dev/testlevels/*.json.
3. Write each level file. Implement every named set piece of the plan faithfully, the planned length and flow (turns, height changes, spirals – never a straight line), hands moments, checkpoints, coins (incl. optional double-jump / chalk routes from L4), Danish hints at first-time mechanics (correct æøå). The world art is being built right now, so leave "v" out; instead give every segment a "look" string describing what it is in this world ("hay bale", "barn roof", "plank bridge", "flying bus roof" …) – a later dressing pass maps it to the kit's variants. Choose shapes (cyl vs box) and sizes that fit what it depicts.
4. Prove each level (one bot at a time):
   - ${'${CHECKS}'}
   Use the VERBOSE per-stage parameters to confirm each set piece is played as intended (catch-jumps caught by the hands, trapezes/zips/bars used, no unintended shortcut skipping a set piece). Fix and re-run until all checks hold.
5. Return the structured result (one entry per level, honest knownIssues).`

const groups = (args && args.groups) || []
const results = await pipeline(groups, (ns) => agent(
  prompt(ns).replace('${CHECKS}', ns.map((n) => `Level ${n}:\n   - ${checks(n)}`).join('\n   - ')),
  { label: `design:${ns.map((n) => 'L' + pad(n)).join('+')}`, phase: 'Design', schema: SCHEMA, model: 'sonnet' }))
return { results }
