// Measure what the physics allows, using the planner bot on many tiny synthetic levels.
const { planner } = require('./bot.js');
module.exports = async (page, h) => {
  await page.waitForFunction(() => window.skyhoj && window.skyhoj.game.state === 'menu', null, { timeout: 60000 });
  const run = async (segs, inv, extra = {}) => {
    const def = { name: 'm', kit: 'sten', theme: 'day', reward: 0, segs: [{ t: 'start', w: 10, d: 10 }, { g: 3, w: 6, d: 8 }, ...segs, { t: 'finish', g: 3, w: 10, d: 10 }], ...extra };
    const r = await page.evaluate(planner, { def, levelNo: 0, inv, opts: { verbose: false, maxTries: 60, debugStage: -1, noGrab: process.env.NOGRAB || '' } });
    return /RESULT: PASS/.test(r.report);
  };
  const maxGap = async (dy, inv, lo, hi, step, target = { w: 5, d: 5 }) => {
    let best = null;
    for (let g = lo; g <= hi + 1e-9; g += step) {
      const ok = await run([{ g: +g.toFixed(2), dy, ...target }], inv);
      if (ok) best = +g.toFixed(2); else if (best !== null && g > best + 1.01) break;
    }
    return best;
  };
  const out = [];
  const what = (process.env.WHAT || 'jump,dbl,bars,vent,bounce').split(',');
  if (what.includes('jump')) for (const dy of [-4, -2, -1, 0, 1, 1.5, 2, 2.5, 3]) out.push(`jump dy=${dy}: max gap ${await maxGap(dy, [], 4, 10.5, 0.25)}`);
  if (what.includes('dbl')) for (const dy of [-2, 0, 1, 2, 3, 4, 5]) out.push(`double dy=${dy}: max gap ${await maxGap(dy, ['double'], 8, 16, 0.5)}`);
  if (what.includes('bars')) {
    for (const sp of [1.6, 2.0, 2.4, 2.8, 3.2, 3.6, 4.0, 4.4, 4.8]) {
      const ok = await run([{ t: 'bar', at: 1.2, y: 2.4, len: 3, ang: 90, x: -1.5 }, { t: 'bar', at: 1.2 + sp, y: 2.4, len: 3, ang: 90, x: -1.5 }, { t: 'bar', at: 1.2 + 2 * sp, y: 2.4, len: 3, ang: 90, x: -1.5 }, { g: 2.4 + 2 * sp, w: 5, d: 5 }], []);
      out.push(`perpendicular bars spacing ${sp}: ${ok ? 'OK' : 'fail'}`);
    }
  }
  if (what.includes('bars') || what.includes('ladder')) {
    for (const dyb of [-1, 0.6, 1.2, 1.5, 1.8]) {
      const ok = await run([{ t: 'bar', at: 1.2, y: 2.4, len: 3, ang: 90, x: -1.5 }, { t: 'bar', at: 1.5, y: 2.4 + dyb, len: 3, ang: 90, x: -1.5 }, { g: 3.5, w: 5, d: 5, dy: dyb }], []);
      out.push(`bar to bar height diff ${dyb} (0.3 m apart): ${ok ? 'OK' : 'fail'}`);
    }
    for (const g of [3, 4, 5, 6, 7]) {
      const ok = await run([{ t: 'bar', at: 1.2, y: 2.4, len: 3, ang: 90, x: -1.5 }, { g, w: 5, d: 5 }], []);
      out.push(`bar (1.2 m out) then platform gap ${g}: ${ok ? 'OK' : 'fail'}`);
    }
  }
  if (what.includes('vent')) for (const lift of [5, 7, 9, 11, 13]) {
    let best = null;
    for (const dy of [2, 4, 6, 8, 10, 12, 14]) { if (await run([{ t: 'vent', g: 3, w: 3, d: 3, lift }, { g: 3, w: 5, d: 5, dy }], [])) best = dy; }
    out.push(`vent lift ${lift}: max dy ${best}`);
  }
  if (what.includes('bounce')) for (const pow of [14, 18, 22, 26]) {
    let best = null;
    for (const dy of [0, 2, 4, 6, 8, 10]) for (const g of [3, 6, 9, 12]) { if (await run([{ t: 'bounce', g: 3, w: 3, d: 3, pow }, { g, w: 5, d: 5, dy }], [])) { if (!best || dy > best.dy || (dy === best.dy && g > best.g)) best = { dy, g }; } }
    out.push(`bounce pow ${pow}: best ${JSON.stringify(best)}`);
  }
  console.log(out.join('\n'));
};
