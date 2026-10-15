// Gennemspiller alle 15 baner med planlægningsrobotten (rigtig fysik) og tjekker kravene:
//   - banen skal kunne klares med netop det udstyr, den kræver (reb fra bane 8, dobbelthop fra bane 11)
//   - uden det krævede udstyr skal den være umulig
//   - uden kantgreb (hænderne kan ikke gribe kanter) skal banerne 2-10 (undtagen skatebanen) være umulige
// Brug: node run.js alle-baner.js   (LEVELS=3,7 begrænser til bestemte baner)
const { planner } = require('./bot.js');
module.exports = async (page, h) => {
  await page.waitForFunction(() => window.skyhoj && window.skyhoj.game.state === 'menu', null, { timeout: 90000 });
  const n = await page.evaluate(() => window.skyhoj.LEVELS.length);
  const only = process.env.LEVELS ? process.env.LEVELS.split(',').map(Number) : Array.from({ length: n }, (_, i) => i + 1);
  const rows = [];
  let bad = 0;
  const play = async (levelNo, inv, noGrab = '', maxTries = 60) => {
    const r = await page.evaluate(planner, { def: null, levelNo, inv, opts: { verbose: false, maxTries, debugStage: -1, noGrab } });
    return /RESULT: PASS/.test(r.report);
  };
  for (const no of only) {
    const def = await page.evaluate((i) => { const d = window.skyhoj.LEVELS[i]; return { name: d.name, rope: !!d.needsRope, dbl: !!d.needsDouble, skate: !!d.skate }; }, no - 1);
    const inv = [def.rope ? 'rope' : null, def.dbl ? 'double' : null].filter(Boolean);
    const ok = await play(no, inv);
    let line = `Bane ${String(no).padStart(2)} ${def.name.padEnd(20)} [${inv.join(',') || 'intet udstyr'}]: ${ok ? 'BESTÅET' : 'FEJL'}`;
    if (!ok) bad++;
    if (def.rope || def.dbl) {
      const less = def.dbl ? ['rope'] : [];
      const without = await play(no, less, '', 30);
      line += ` · uden ${def.dbl ? 'dobbelthop' : 'reb'}: ${without ? 'MULIG (fejl!)' : 'umulig ✓'}`;
      if (without) bad++;
    }
    if (no >= 2 && no <= 10 && !def.skate) {
      const noHands = await play(no, inv, 'ledge', 30);
      line += ` · uden kantgreb: ${noHands ? 'MULIG (fejl!)' : 'umulig ✓'}`;
      if (noHands) bad++;
    }
    rows.push(line);
    console.log(line);
  }
  if (bad) throw new Error(`${bad} krav ikke opfyldt`);
};
