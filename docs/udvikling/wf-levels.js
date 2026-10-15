export const meta = {
  name: 'skyhoj-levels',
  description: 'Author Skyhøj Parkour levels: designer (bot-proven) → independent playtest critic → fixer (→ re-critic)',
  phases: [
    { title: 'Design', detail: 'one level designer per level, proven with the planner bot' },
    { title: 'Playtest', detail: 'independent critic replays with the bot and reviews against the plan' },
    { title: 'Fix', detail: 'fix every issue and re-prove' },
  ],
}

const SCR = '/tmp/claude-0/-home-user-Parkour/eaa922d6-d00f-5fe4-a15d-da7efe1299c2/scratchpad'
const pad = (n) => String(n).padStart(2, '0')
const KIT = ['meadow', 'rooftops', 'candy', 'glacier', 'harbor', 'skatemesa', 'clockwork', 'jungle', 'stormships', 'starfield', 'temple', 'neoncity', 'volcano', 'skyreef', 'crystalspire']
const inv = (n) => (n >= 11 ? 'rope,double' : n >= 8 ? 'rope' : '')

const LEVEL_SCHEMA = {
  type: 'object',
  properties: {
    level: { type: 'number' },
    file: { type: 'string' },
    botResult: { type: 'string', description: 'RESULT line with the required inventory' },
    requirementChecks: { type: 'string', description: 'RESULT lines without rope/double (must FAIL where required) and with NOGRAB=ledge' },
    platforms: { type: 'number' },
    helpers: { type: 'string' },
    coins: { type: 'number' },
    checkpoints: { type: 'number' },
    lengthM: { type: 'number' },
    routeTimeS: { type: 'number' },
    setPieces: { type: 'string' },
    knownIssues: { type: 'string' },
  },
  required: ['level', 'file', 'botResult', 'requirementChecks', 'setPieces', 'knownIssues'],
}
const CRITIC_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['pass', 'needs-fixes'] },
    botResult: { type: 'string' },
    issues: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['major', 'minor'] },
          where: { type: 'string', description: 'segment index / set piece' },
          problem: { type: 'string' },
          suggestion: { type: 'string' },
        },
        required: ['severity', 'where', 'problem', 'suggestion'],
      },
    },
    strengths: { type: 'string' },
  },
  required: ['verdict', 'botResult', 'issues'],
}

const SHARED = (n) => `Context: Danish browser game "Skyhøj Parkour" (3D parkour over a lava sea; engine /home/user/Parkour/game.js – never edit it, the kits or ${SCR}/harness). SCR = ${SCR}. The owner asked: more varied levels ("banerne skal være mere forskellige"), longer jumps where the hands must catch and hold on, buyable double jump, chalk only helps the hands, not just hopping on stones ("kom på nogle gode ideer selv"), 15 levels, one skateboard level. ~6 level designers + ~11 artists work in parallel on a 4-CPU machine: run only ONE bot process at a time, timeout 1500. Your files: ${SCR}/levels/L${pad(n)}.json and scratch in ${SCR}/work/L${pad(n)}/ only.`

const BOT = (n, extra = '') => `cd ${SCR}/harness && GAME_DIR=/home/user/Parkour Q=debug LEVEL_FILE=${SCR}/levels/L${pad(n)}.json INV=${inv(n)} VERBOSE=1 ${extra}timeout 1500 node run.js bot2.js`

const designPrompt = (n) => `${SHARED(n)}

You are a senior level designer. Design **level ${n}** (kit "${KIT[n - 1]}").
1. Read the binding spec ${SCR}/dev/LEVEL-SPEC.md and the measured physics ${SCR}/dev/MEASURED.md.
2. Read the approved design: ${SCR}/dev/design-plan.json → result.levels[${n - 1}] (world, mechanics, layout, set pieces, hands moments, difficulty ${'' /* */}), result.rationale (gap budget, grip budget, acts) and the kit brief ${SCR}/dev/briefs/${KIT[n - 1]}.json. Read buildLevelData in game.js to understand the DSL exactly. Look at ${SCR}/dev/testlevels/*.json for working examples of every mechanic.
3. Write ${SCR}/levels/L${pad(n)}.json. Implement every named set piece of the plan faithfully, the planned length/flow (turns! heights! variety!), hands moments, checkpoints, coins (incl. optional routes), Danish hints at first-time mechanics. The world kit (art) is being built right now, so leave "v" out; instead add a "look" string to each segment describing what it should look like in this world (e.g. "look": "hay bale", "barn roof", "plank bridge") – a later dressing pass maps it to the kit's variants. Choose shapes (cyl vs box) and sizes that fit the world (hay bales are cylinders, etc.).
4. Prove it: ${BOT(n)}. Iterate until RESULT: PASS. ${n >= 8 ? `Then prove the requirements: with INV=${n >= 11 ? 'rope' : ''} (without ${n >= 11 ? 'double jump' : 'the rope'}) it must FAIL.` : ''} ${n !== 6 && n >= 2 ? 'Also run with NOGRAB=ledge (hands cannot catch ledges): it must FAIL – proving that some long jumps really need the hands.' : ''} The bot reports per-stage parameters (VERBOSE) – use them to check that each set piece is played as intended (e.g. the catch-jumps are caught by the hands, the trapeze is used), not skipped by an unintended shortcut.
5. Return the structured result with honest knownIssues.`

const criticPrompt = (n, d) => `${SHARED(n)}

You are an independent, demanding playtester and level-design critic. Another designer just built **level ${n}** (kit "${KIT[n - 1]}") in ${SCR}/levels/L${pad(n)}.json. Their report: ${JSON.stringify(d || {}).slice(0, 2000)}. Do not trust it.
1. Read ${SCR}/dev/LEVEL-SPEC.md, ${SCR}/dev/MEASURED.md, the plan ${SCR}/dev/design-plan.json → result.levels[${n - 1}] + result.rationale, and the level file. Read buildLevelData in game.js so you can mentally place every segment.
2. Re-run the bot yourself: ${BOT(n)}${n >= 8 ? `; and with INV=${n >= 11 ? 'rope' : ''} (must FAIL)` : ''}${n !== 6 && n >= 2 ? '; and NOGRAB=ledge (must FAIL)' : ''}. A FAIL with the right inventory, or a PASS where it must fail, is a major issue.
3. Review: every set piece of the plan present and recognisable? hands moments as planned? difficulty right for its place in the curve (plan difficulty ${n <= 5 ? '1-5 rising' : 'see plan'})? variety (turns, heights, shapes, sizes, mechanics – no long monotone stretches, not a straight line)? rule compliance (gap & grip budgets, chalk never required, checkpoints every 120–180 m on safe static platforms, coins 6–14 (L6: 20), hints in correct Danish, overlaps/clearance, length vs plan, zips end ≈2.2 m above their landing)? Does the bot's route (VERBOSE parameters) reveal unintended shortcuts that skip a set piece, or moments that need frame-perfect timing (only acceptable on L5/L10/L15)? Is it FUN – rhythm, rest spots, a climax at the end?
Return verdict "pass" only with no major issues and at most 2 minor ones. Every issue needs a concrete, actionable suggestion (segment index + what to change).`

const fixPrompt = (n, d, c) => `${SHARED(n)}

You are a senior level designer. **Level ${n}** (kit "${KIT[n - 1]}") in ${SCR}/levels/L${pad(n)}.json was reviewed by an independent playtester. Read ${SCR}/dev/LEVEL-SPEC.md, ${SCR}/dev/MEASURED.md, the plan (${SCR}/dev/design-plan.json → result.levels[${n - 1}]) and the level, then fix EVERY issue (majors first), keeping what works:
${JSON.stringify(c).slice(0, 7000)}
Re-prove: ${BOT(n)} must PASS${n >= 8 ? `, INV=${n >= 11 ? 'rope' : ''} must FAIL` : ''}${n !== 6 && n >= 2 ? ', NOGRAB=ledge must FAIL' : ''}. Return the structured result (knownIssues = anything not fixed, honestly).`

const levels = (args && args.levels) || []
const results = await pipeline(
  levels,
  (n) => agent(designPrompt(n), { label: `design:L${pad(n)}`, phase: 'Design', schema: LEVEL_SCHEMA }),
  (d, n) => agent(criticPrompt(n, d), { label: `playtest:L${pad(n)}`, phase: 'Playtest', schema: CRITIC_SCHEMA }).then((c) => ({ d, c })),
  async ({ d, c }, n) => {
    if (!c || (c.verdict === 'pass' && !c.issues.some((i) => i.severity === 'major'))) return { n, d, c }
    let f = await agent(fixPrompt(n, d, c), { label: `fix:L${pad(n)}`, phase: 'Fix', schema: LEVEL_SCHEMA })
    const c2 = await agent(criticPrompt(n, f), { label: `playtest2:L${pad(n)}`, phase: 'Playtest', schema: CRITIC_SCHEMA })
    if (c2 && (c2.verdict !== 'pass' || c2.issues.some((i) => i.severity === 'major'))) {
      f = await agent(fixPrompt(n, f, c2), { label: `fix2:L${pad(n)}`, phase: 'Fix', schema: LEVEL_SCHEMA })
    }
    return { n, d, c, f, c2 }
  },
)
return { results }
