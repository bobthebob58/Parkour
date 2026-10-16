# Skyhøj Parkour – working notes for Claude

A Danish 3D parkour browser game (Three.js 0.160 + cannon-es 0.20 loaded from jsDelivr by full, pinned URLs in index.html – no import map, so Safari < 16.4 works).
15 levels over a lava sea, one world kit per level, hands that catch ledges/bars, double jump,
skateboard level, rope, chalk, coins and a shop. It must keep working by double-clicking
`index.html` (file://), so `game.js` is a single **classic** script (one IIFE), not ES modules.

## Golden rules

- **Never edit `game.js` by hand.** It is built from `src/`. Edit `src/…`, run `node tools/byg.js`,
  and commit `game.js` together with the source change. CI fails if they differ
  (`node tools/byg.js --tjek`).
- Everything the player sees is **Danish** (UI texts live in `src/motor/02-tekster.js`). README,
  docs and commit messages are Danish too. Never put model names in commits or code.
- Keep library versions pinned (the URLs at the bottom of index.html, `tests/package.json`, and the CDN map in `tests/run.js`). No new runtime deps,
  no build step in the browser.
- One task per session. Commit + push before the session ends; if a task is unfinished, say what
  is done and what is next in the GitHub issue (template: `.github/ISSUE_TEMPLATE/opgave.md`).

## Map – read only the file you need

| Path | What |
|---|---|
| `src/motor/00-start.js` | header + IIFE open (`THREE`, `CANNON` from window) |
| `src/motor/01-konfiguration.js` | `CFG` (physics, hands/grip, chalk, double jump, skate, rope) + `SHOP_ITEMS` |
| `src/motor/02-tekster.js` | all Danish UI strings (`T`) |
| `src/motor/03-temaer.js` | built-in sky themes (kits add their own) |
| `src/motor/04-baner.js` | **comment only**: the level segment format. `const LEVELS` is generated from `src/baner/*.json` |
| `src/motor/05…08` | helpers, procedural textures, renderer/sky/lava/light, physics world |
| `src/motor/09-banebygger.js` | `buildLevelData`: segments → platforms, bars, zips, anchors, coins |
| `src/motor/09b-verdenssaet.js` | world-kit system + default "sten" kit |
| `src/motor/10-baneobjekter.js` | `Level` class at runtime: moving/crumble/spin/conveyor/vent…, portal, checkpoints |
| `src/motor/11a/11b-spilleren.js` | player: body, movement, hands (ledge/bar/zip), double jump, skateboard. The runner model (`src/figur/figur.js`) is inserted between 11a and 11b |
| `src/motor/12b-beroering.js` | touch controls (phone/iPad): analog joystick, camera drag, HOP/EVNE/pause buttons, hotbar taps, `forTouch()` text rewriting (+ `T_TOUCH` in 02), resolution governor |
| `src/motor/12…17` | input, camera, abilities (chalk, rope), WebAudio, UI/HUD/shop, save/load |
| `src/motor/18-spiltilstand.js` | game state, main loop, `debug`, `showcaseDef`, `window.skyhoj` test hooks (only with `?debug`: snapshot/restore, playDef, showcase, camTo …) |
| `src/baner/L01.json … L15.json` | levels as data (`name, kit, theme, reward, needsRope, needsDouble, skate, segs`). `look` fields are design notes, stripped at build |
| `src/verdener/<id>.js` | one world kit per level (registers `window.SKYHOJ_KITS[id]` + `SKYHOJ_THEMES[id]`); `_lib.js` = shared helpers. Order in game.js = order of first use by the levels |
| `src/figur/figur.js` | the realistic runner (`window.createCharacterModule(THREE)` → `{build, animate}`) |
| `tools/byg.js` | builds `game.js`; `tools/artefakt.js` makes the claude.ai artifact page |
| `docs/udvikling/` | specs: `KIT-SPEC.md` (kit contract), `LEVEL-SPEC.md` (level DSL + design rules), `CHARACTER-SPEC.md`, `MEASURED.md` (movement limits). `wf-*.js` and `briefs/` are history from the v2 build |
| `tests/` | Playwright harness (`run.js`), planner bot, e2e, screenshot scripts – see `tests/README.md` |

Find code with grep instead of reading whole files, e.g. `grep -n "function doubleJump" src/motor/*.js`.
New level: add `src/baner/L16.json` (and a kit in `src/verdener/` if it needs a new world); the build
picks them up automatically. The HUD's "/15" comes from `LEVELS.length`.

## Testing (slow – software WebGL)

First time in a session: `cd tests && npm ci` (Chromium is preinstalled in cloud sessions).

| Command (in `tests/`) | Time | Use |
|---|---|---|
| `LEVEL=9 VERBOSE=1 node run.js bot.js` | 1–3 min | planner bot plays one level; `INV=rope,double`, `NOGRAB=ledge` (no ledge catching), `DEBUG_STAGE=k` |
| `LEVEL_FILE=../src/baner/L09.json node run.js bot.js` | 1–3 min | same, straight from the JSON (no build needed) |
| `LEVELS=9 npm run baner` | 2–5 min | requirement checks for one level |
| `npm run baner` | ~20 min | all 15 levels + requirement checks |
| `npm run e2e` | ~10 min | 36 real mouse/keyboard checks |
| `TOUCH=telefon node run.js beroering.js` | ~4 min | touch checks on an emulated phone (`TOUCH=ipad` for iPad) |

- **CI runs all of this on every push/PR** (`.github/workflows/test.yml`: build check, e2e, levels
  in 3 parallel jobs, touch on phone + iPad) in about 4 minutes – far faster than in a session. Test only what you changed
  locally, push, and read the CI result.
- Run long tests in the background and read only the `RESULT`/`BESTÅET`/`FAIL` lines.
- Level requirements (enforced by `tests/alle-baner.js`): rope required from level 8
  (`needsRope`), double jump from level 11 (`needsDouble`); levels 2–5 and 7–10 must be impossible
  without ledge catching. Level 6 is the skateboard level.
- Movement limits for design (from `docs/udvikling/MEASURED.md`): feet-only jump 7.75 m at equal
  height (6.75 m at +1, 5 m at +2, impossible at +3); with a hand catch 10 m (9.25 / 8.75 / 7.75);
  double jump 14 m (≈16 m with catch). Keep ≥ 0.4 m margin on mandatory jumps.

## Screenshots

- `SHOTS=/tmp/s SHOT_MATCH="greb|bar" SHOT_MAX=2 LEVEL=2 node run.js bot.js` – action shots replayed
  from the bot's route. `npm run billeder` (level overviews), `npm run skaerme` (menus/shop/portal),
  `KIT_FILE=../src/verdener/candy.js KIT_ID=candy npm run verden` (kit showcase),
  `npm run figur` (runner poses).
- Images are expensive to look at: combine several into one downscaled contact sheet
  (`python3 tests/sheet.py` or PIL) and view that.

## Publishing the artifact

Live page: https://claude.ai/artifact/NFgvnTyxYD1xj7AyBiSeaa. Rebuild with
`node tools/artefakt.js /tmp/skyhoj-artefakt/index.html`, then publish that file to the same URL
with `files = { "style.css": "style.css", "game.js": "game.js" }` (read the artifact first).

## Keeping sessions cheap

- Don't read `game.js`; read the `src/` file you need. Don't paste big files into prompts.
- Use multi-agent workflows only for genuinely parallel, independent pieces (e.g. several new
  kits). Each agent writes and commits its own file, so a killed run loses one item, not all.
- Prefer one focused task per session, tracked as a GitHub issue.
