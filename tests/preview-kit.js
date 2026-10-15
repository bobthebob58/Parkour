// Preview a world kit: KIT_FILE=/abs/path.js KIT_ID=rooftops THEME=day OUT=/abs/dir node run.js preview-kit.js
// Injects the kit file, builds the showcase level (every platform type) and saves 4 screenshots + stats.
const path = require('path'), fs = require('fs');
module.exports = async (page, h) => {
  await page.waitForFunction(() => window.skyhoj && window.skyhoj.game.state === 'menu', null, { timeout: 60000 });
  if (process.env.KIT_FILE) await page.addScriptTag({ path: process.env.KIT_FILE });
  const id = process.env.KIT_ID || 'sten';
  const theme = process.env.THEME || (await page.evaluate((id) => (window.SKYHOJ_THEMES[id] ? id : 'day'), id));
  const out = process.env.OUT || path.join(__dirname, '..', 'preview');
  fs.mkdirSync(out, { recursive: true });
  const info = await page.evaluate(({ id, theme }) => {
    const S = window.skyhoj;
    if (!S.WORLD_KITS[id]) return { error: 'kit not registered: ' + id };
    // Showcase + en række med sættets varianter (box og cylinder) før målet
    const def = S.showcaseDef(id, theme);
    const fin = def.segs.pop();
    const vars = Object.keys(S.WORLD_KITS[id].variants || {});
    def.segs.push({ turn: 90, g: 4, w: 6, d: 6 });
    for (const v of vars) {
      def.segs.push({ g: 3, w: 5, d: 5, v, coin: true });
      def.segs.push({ g: 3, w: 4, shape: 'cyl', v });
    }
    def.segs.push(fin);
    window.__varCount = Math.max(1, vars.length);
    const data = S.playDef(def);
    const plats = data.plats;
    S.debug.freeze = false;
    document.getElementById('toasts').innerHTML = '';
    let tris = 0, meshes = 0;
    S.level.group.traverse((o) => { if (o.isMesh) { meshes++; const g = o.geometry; tris += (g.index ? g.index.count : g.attributes.position.count) / 3; } });
    return { plats: plats.length, meshes, tris: Math.round(tris), solids: S.level.rayMeshes.length };
  }, { id, theme });
  console.log('KIT INFO', JSON.stringify(info));
  if (info.error) return;
  const views = [
    ['1-oversigt', (S) => { const d = S.level.data.plats; const a = d[3], b = d[10]; S.camTo(a.x + 22, a.top + 16, a.z + 10, b.x, b.top - 2, b.z); }],
    ['2-start', (S) => { S.debug.freeCam = false; document.getElementById('hud').classList.add('hidden'); }],
    ['3-taet', (S) => { const p = S.level.data.plats[6]; S.camTo(p.x + 7, p.top + 4, p.z + 6, p.x, p.top, p.z - 3); }],
    ['4-nedefra', (S) => { const p = S.level.data.plats[9]; S.camTo(p.x + 14, p.top - 8, p.z + 12, p.x, p.top - 2, p.z - 6); }],
    ['5-panorama', (S) => { const b = S.level.data.bounds; S.camTo(b.cx + b.radius * 1.1, b.maxY + 35, b.cz + b.radius * 0.9, b.cx, b.minY - 4, b.cz); }],
    ['7-varianter', (S) => { const d = S.level.data.plats, n = d.length, k = window.__varCount || 1; const f = d[n - 1 - 2 * k], l = d[n - 2]; const cx = (f.x + l.x) / 2, cz = (f.z + l.z) / 2, cy = (f.top + l.top) / 2; const span = Math.hypot(l.x - f.x, l.z - f.z); S.camTo(cx, cy + 6 + span * 0.15, cz + 8 + span * 0.55, cx, cy - 1, cz); }],
    ['6-baglaens', (S) => { const d = S.level.data.plats; const a = d[d.length - 1], b = d[d.length - 8]; S.camTo(a.x - 6, a.top + 6, a.z - 14, b.x, b.top, b.z); }],
  ];
  for (const [name, fn] of views) {
    await page.evaluate(`(${fn.toString()})(window.skyhoj)`);
    await h.wait(name === '2-start' ? 3000 : 2200);
    const file = path.join(out, `${id}-${name}.png`);
    await page.screenshot({ path: file });
    console.log('saved', file);
  }
  const errs = h.logs.filter((l) => l.startsWith('[pageerror]') || (l.startsWith('[error]') && !l.includes('Failed to load resource')));
  console.log('ERRORS', errs.length ? errs.join('\n') : 'none');
};
