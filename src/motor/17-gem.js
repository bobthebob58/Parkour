/* =====================================================================
   17. GEM / INDLÆS
   ===================================================================== */
const SAVE_KEY = 'skyhoj-parkour-v1';
function saveGame() {
  if (debug.quiet) return;
  storage.set(SAVE_KEY, JSON.stringify({
    v: 1, level: game.savedLevel, coins: game.coins, owned: abilities.owned, selected: abilities.selected,
    deaths: game.deaths, totalTime: Math.round(game.totalTime), sound: game.sound,
    highest: game.highest, best: game.best,
  }));
}
function loadSave() {
  const raw = storage.get(SAVE_KEY);
  if (!raw) return null;
  try {
    const s = JSON.parse(raw);
    if (!s || s.v !== 1) return null;
    return s;
  } catch (e) { return null; }
}
function applySave(s) {
  game.coins = s ? s.coins | 0 : 0;
  game.deaths = s ? s.deaths | 0 : 0;
  game.totalTime = s ? +s.totalTime || 0 : 0;
  game.savedLevel = s ? clamp(s.level | 0, 0, LEVELS.length) : 0;
  abilities.owned = { chalk: false, rope: false, chalkbag: false, longrope: false, double: false, gloves: false, ...(s ? s.owned : {}) };
  game.highest = s ? clamp(s.highest | 0, 0, LEVELS.length - 1) : 0;
  game.best = (s && s.best) || {};
  abilities.selected = s && s.selected && (s.selected === 'none' || abilities.owned[s.selected]) ? s.selected : 'none';
  abilities.chalkActive = 0;
  abilities.chalkCooldown = 0;
  renderHotbar();
}

