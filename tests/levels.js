// Screenshots of every level: start view (gameplay camera + HUD) and a drone overview.
module.exports = async (page, h) => {
  await page.waitForFunction(() => window.skyhoj && window.skyhoj.game.state === 'menu', null, { timeout: 60000 });
  const only = process.env.LEVELS ? process.env.LEVELS.split(',').map(Number) : Array.from({ length: 15 }, (_, i) => i + 1);
  const mode = process.env.MODE || 'both';
  for (const n of only) {
    const tag = String(n).padStart(2, '0');
    await page.evaluate((i) => {
      const S = window.skyhoj;
      S.abilities.owned.chalk = true; S.abilities.owned.rope = true; S.abilities.owned.double = true;
      S.debug.freeCam = false; S.debug.freeze = false;
      S.startLevel(i);
      document.getElementById('level-banner').classList.add('hidden');
      document.getElementById('toasts').innerHTML = '';
    }, n - 1);
    if (mode !== 'overview') {
      await h.wait(1800);
      await page.evaluate(() => { document.getElementById('level-banner').classList.add('hidden'); document.getElementById('toasts').innerHTML = ''; });
      await h.shot(`bane-${tag}-start.jpg`);
    }
    if (mode !== 'start') {
      await page.evaluate(() => {
        const S = window.skyhoj, L = S.level, d = L.data;
        S.debug.freeCam = true;
        document.getElementById('hud').classList.add('hidden');
        const ps = d.plats;
        const k = Math.floor(ps.length * 0.3);
        const p = ps[k], h = p.heading;
        const f = { x: Math.sin(h), z: -Math.cos(h) }, r = { x: Math.cos(h), z: Math.sin(h) };
        S.camera.position.set(p.x - f.x * 22 + r.x * 9, p.top + 15, p.z - f.z * 22 + r.z * 9);
        const q = ps[Math.min(ps.length - 1, k + 4)];
        S.camera.lookAt(q.x, q.top - 2, q.z);
        S.camera.updateMatrixWorld();
        
      });
      await h.wait(2200);
      await h.shot(`bane-${tag}-oversigt.jpg`);
      await page.evaluate(() => { document.getElementById('hud').classList.remove('hidden'); });
    }
  }
};
