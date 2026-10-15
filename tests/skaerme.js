// Skærmbilleder af portalen, døden i lavaen og menuskærmene (bane fuldført, butik, pause, sejr, hovedmenu).
// Action-billeder fra selve banerne tages af fysik-botten: SHOTS=../docs/images LEVEL=8 node run.js bot.js
// ONLY=portal,lava,skaerme,menu begrænser til bestemte billeder.
module.exports = async (page, h) => {
  await page.waitForFunction(() => window.skyhoj && window.skyhoj.game.state === 'menu', null, { timeout: 60000 });
  const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
  const want = (n) => !only || only.includes(n);

  await page.evaluate(() => {
    const S = window.skyhoj;
    const dt = S.CFG.fixedDt;
    window.H = {
      S,
      step(n) { for (let i = 0; i < n; i++) S.fixedStep(dt); },
      snap() { for (let i = 0; i < 40; i++) S.updateCamera(0.05); S.camera.updateMatrixWorld(); },
      start(i, owned = { chalk: true, double: true, rope: true }) {
        S.debug.freeze = false; S.debug.freeCam = false;
        for (const k of Object.keys(S.abilities.owned)) S.abilities.owned[k] = false;
        Object.assign(S.abilities.owned, owned);
        S.startLevel(i);
        S.renderHotbar();
        this.hideToasts();
      },
      // stil spilleren på platform i (data-koordinater), et stykke fra midten væk fra punktet "away"
      place(i, away, back) {
        const p = S.level.data.plats[i];
        const dx = p.x - away.x, dz = p.z - away.z, L = Math.hypot(dx, dz) || 1;
        S.player.body.position.set(p.x + dx / L * back, p.top + S.CFG.player.radius + 0.02, p.z + dz / L * back);
        S.player.body.velocity.set(0, 0, 0);
        S.player.facing = Math.atan2(dx, dz);
      },
      yawTo(x, z) { const b = S.player.body.position; S.cam.yaw = Math.atan2(-(x - b.x), -(z - b.z)); },
      hideToasts() { document.getElementById('toasts').innerHTML = ''; document.getElementById('level-banner').classList.add('hidden'); },
    };
  });

  // ---------- Portalen for enden af bane 1 ----------
  if (want('portal')) {
    await page.evaluate(() => {
      const { S } = H;
      H.start(0);
      const D = S.level.data.plats, n = D.length;
      H.place(n - 1, D[n - 2], -3.2);
      H.step(10);
      const P = S.level.portal.center;
      H.yawTo(P.x, P.z);
      S.cam.yaw += 0.35; S.cam.pitch = 0.12;
      S.game.levelCoins = 30;
      H.snap();
      S.debug.freeze = true;
    });
    await h.wait(1500);
    await page.evaluate(() => H.hideToasts());
    await h.shot('portal.jpg');
  }

  // ---------- Død i lavaen ----------
  if (want('lava')) {
    await page.evaluate(() => {
      const { S } = H;
      H.start(1);
      const p = S.level.data.plats[6];
      S.player.body.position.set(p.x + 6, -30, p.z); S.player.body.velocity.set(0, -30, 0);
      S.cam.pitch = 0.75;
      for (let i = 0; i < 200 && S.game.state === 'playing'; i++) H.step(1);
      for (let i = 0; i < 10; i++) S.particles.update(1 / 60);
      H.snap();
      S.debug.freeze = true;
    });
    await h.wait(250);
    await h.shot('lava-doed.jpg');
  }

  // ---------- Bane fuldført, butik, pause og sejr ----------
  if (want('skaerme')) {
    await page.evaluate(() => {
      const { S } = H;
      S.applySave(null);
      H.start(2, {});
      S.game.coins = 120; S.game.levelCoins = 25; S.game.levelTime = 83;
      S.completeLevel();
    });
    await h.wait(3000);
    await h.shot('skaerm-bane-fuldfoert.jpg');
    await page.evaluate(() => { const { S } = H; S.abilities.owned.chalk = true; S.game.coins = 215; S.openShop('complete'); });
    await h.wait(3000);
    await h.shot('skaerm-butik.jpg');
    await page.evaluate(() => { const { S } = H; H.start(4); S.debug.freeze = true; });
    await h.wait(600);
    await page.evaluate(() => { H.hideToasts(); H.S.setState('paused'); });
    await h.wait(3000);
    await h.shot('skaerm-pause.jpg');
    await page.evaluate(() => {
      const { S } = H; S.debug.freeze = false; H.start(S.LEVELS.length - 1);
      S.game.totalTime = 3412; S.game.deaths = 112; S.game.levelCoins = 30; S.completeLevel();
    });
    await h.wait(3000);
    await h.shot('skaerm-sejr.jpg');
  }

  if (want('menu')) {
    await page.evaluate(() => { const { S } = H; S.debug.freeze = false; S.applySave(null); S.loadLevel(0); S.setState('menu'); });
    await h.wait(2500);
    await h.shot('skaerm-hovedmenu.jpg');
  }
};
