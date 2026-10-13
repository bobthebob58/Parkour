// Staged action screenshots: each mechanic is set up with the real physics, frozen and captured.
module.exports = async (page, h) => {
  await page.waitForFunction(() => window.skyhoj && window.skyhoj.game.state === 'menu', null, { timeout: 60000 });
  const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
  const want = (n) => !only || only.includes(n);

  // shared helpers installed in the page
  await page.evaluate(() => {
    const S = window.skyhoj;
    const dt = S.CFG.fixedDt;
    window.H = {
      S,
      step(n) { for (let i = 0; i < n; i++) S.fixedStep(dt); },
      secs(t) { this.step(Math.round(t / dt)); },
      snap() { for (let i = 0; i < 40; i++) S.updateCamera(0.05); S.camera.updateMatrixWorld(); },
      center(p) { const b = p.body.position; return { x: b.x, y: p.def.top + (b.y - p.base.y), z: b.z }; },
      start(i, owned = { chalk: true, rope: true }) {
        S.debug.freeze = false; S.debug.freeCam = false;
        Object.assign(S.abilities.owned, owned);
        S.startLevel(i);
        S.renderHotbar();
        document.getElementById('level-banner').classList.add('hidden');
        document.getElementById('toasts').innerHTML = '';
      },
      place(plat, towards, back = 0.5, lateral = 0) {
        const c = this.center(plat);
        const dx = towards.x - c.x, dz = towards.z - c.z, L = Math.hypot(dx, dz) || 1;
        const b = S.player.body;
        b.position.set(c.x - dx / L * back - dz / L * lateral, c.y + S.CFG.player.radius + 0.02, c.z - dz / L * back + dx / L * lateral);
        b.velocity.set(0, 0, 0);
        S.player.facing = Math.atan2(-dx, -dz);
      },
      yawTo(x, z) { const b = S.player.body.position; S.cam.yaw = Math.atan2(-(x - b.x), -(z - b.z)); },
      key(code, on) { S.input.keys[code] = on; if (on) S.onKeyPress(code); },
      clearKeys() { for (const k of Object.keys(S.input.keys)) S.input.keys[k] = false; },
      // steer the gameplay camera so the crosshair points at p
      aimAt(p) {
        for (let k = 0; k < 60; k++) {
          this.snap();
          const c = S.camera.position;
          const want = { x: p.x - c.x, y: p.y - c.y, z: p.z - c.z };
          const L = Math.hypot(want.x, want.y, want.z);
          const yawWant = Math.atan2(-want.x, -want.z);
          let dy = yawWant - S.cam.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
          S.cam.yaw += dy * 0.6;
          const fwd = new S.camera.position.constructor(); S.camera.getWorldDirection(fwd);
          const elevWant = Math.asin(want.y / L), elevNow = Math.asin(fwd.y);
          S.cam.pitch = Math.max(S.CFG.camera.minPitch, Math.min(S.CFG.camera.maxPitch, S.cam.pitch - (elevWant - elevNow) * 0.6));
        }
        this.snap();
      },
      hideToasts() { document.getElementById('toasts').innerHTML = ''; document.getElementById('level-banner').classList.add('hidden'); },
    };
  });

  // ---------- Rope: aiming at an anchor ----------
  if (want('sigte')) {
    await page.evaluate(() => {
      const { S } = H;
      H.start(7);
      S.selectAbility('rope');
      const L = S.level, from = L.platforms[3], to = L.platforms[4];
      H.place(from, H.center(to), -1.0);
      H.step(20);
      H.yawTo(H.center(to).x, H.center(to).z);
      S.cam.yaw -= 0.25; S.cam.pitch = 0.12;
      H.snap();
      S.debug.freeze = true;
    });
    await h.wait(1500);
    await page.evaluate(() => H.hideToasts());
    await h.shot('reb-sigte.jpg');
  }

  // ---------- Rope: mid-swing ----------
  if (want('sving')) {
    await page.evaluate(() => {
      const { S } = H;
      H.start(7);
      S.selectAbility('rope');
      const L = S.level, from = L.platforms[3], to = L.platforms[4];
      const tc = H.center(to);
      H.place(from, tc, 0.8);
      H.step(10);
      H.yawTo(tc.x, tc.z);
      H.key('KeyW', true);
      let jumped = false, hooked = false;
      for (let i = 0; i < 600; i++) {
        const b = S.player.body.position;
        if (!jumped && S.player.grounded && Math.hypot(b.x - H.center(from).x, b.z - H.center(from).z) > 1.5) { H.key('Space', true); jumped = true; }
        if (jumped && !hooked && S.player.body.velocity.y < 3) {
          const a = L.anchors[0];
          S.camera.position.set(b.x, b.y + 1.5, b.z); S.camera.lookAt(a.pos); S.camera.updateMatrixWorld();
          S.fireRope(); hooked = !!S.abilities.rope;
        }
        H.step(1);
        if (hooked && S.player.body.position.y < L.platforms[3].def.top - 1.5) break;
      }
      H.key('Space', false);
      // side-on camera so the rope and arc are visible
      S.cam.yaw = -to.def.heading - Math.PI / 2 + 0.35;
      S.cam.pitch = 0.12;
      S.abilities.ropeShoot = 1;
      H.snap();
      S.debug.freeze = true;
    });
    await h.wait(1600);
    await page.evaluate(() => H.hideToasts());
    await h.shot('reb-sving.jpg');
  }

  // ---------- Chalk on ice ----------
  if (want('kridt')) {
    await page.evaluate(() => {
      const { S } = H;
      H.start(3);
      S.selectAbility('chalk');
      const L = S.level, from = L.platforms[2], to = L.platforms[3];
      H.place(from, H.center(to), 1.5);
      H.step(10);
      S.useAbility();
      H.yawTo(H.center(to).x, H.center(to).z);
      S.cam.yaw += 0.5; S.cam.pitch = 0.25;
      H.step(30);
      H.snap();
      S.debug.freeze = true;
    });
    await h.wait(400);
    await h.shot('kridt-paa-is.jpg');
  }

  // ---------- Moving platforms, mid-jump ----------
  if (want('bevaegelse')) {
    await page.evaluate(() => {
      const { S } = H;
      H.start(4);
      const L = S.level, from = L.platforms[2], to = L.platforms[3];
      H.place(from, H.center(to), 0.4);
      H.step(5);
      H.key('KeyW', true);
      for (let i = 0; i < 240; i++) {
        H.yawTo(H.center(to).x, H.center(to).z);
        const b = S.player.body.position, c = H.center(from);
        if (S.player.grounded && Math.hypot(b.x - c.x, b.z - c.z) > 1.1) { H.key('Space', true); }
        H.step(1);
        if (!S.player.grounded && S.player.body.velocity.y < 1.5 && S.player.body.velocity.y > 0) break;
      }
      H.clearKeys();
      S.cam.yaw += 0.7; S.cam.pitch = 0.35;
      H.snap();
      S.debug.freeze = true;
    });
    await h.wait(1500);
    await page.evaluate(() => H.hideToasts());
    await h.shot('bevaegelige-platforme.jpg');
  }

  // ---------- Windmill (spinner) ----------
  if (want('vindmoelle')) {
    await page.evaluate(() => {
      const { S } = H;
      H.start(6);
      const L = S.level, spin = L.platforms[1], next = L.platforms[2];
      H.place(spin, H.center(next), 1.2, 1.0);
      H.step(2);
      H.key('Space', true);
      H.step(30);
      H.key('Space', false);
      H.yawTo(H.center(next).x, H.center(next).z);
      S.cam.yaw -= 0.9; S.cam.pitch = 0.42;
      H.snap();
      S.debug.freeze = true;
    });
    await h.wait(1500);
    await page.evaluate(() => H.hideToasts());
    await h.shot('vindmoelle.jpg');
  }

  // ---------- Bounce pad launch ----------
  if (want('springpude')) {
    await page.evaluate(() => {
      const { S } = H;
      H.start(2);
      const L = S.level, pad = L.platforms[2], up = L.platforms[3];
      H.place(L.platforms[1], H.center(pad), 0.5);
      H.step(5);
      H.key('KeyW', true);
      let bounced = false;
      for (let i = 0; i < 600; i++) {
        H.yawTo(H.center(bounced ? up : pad).x, H.center(bounced ? up : pad).z);
        const b = S.player.body.position, c = H.center(L.platforms[1]);
        if (!bounced && S.player.grounded && S.player.groundPlat === L.platforms[1] && Math.hypot(b.x - c.x, b.z - c.z) > 2.1) H.key('Space', true);
        H.step(1);
        if (S.player.body.velocity.y > 12) bounced = true;
        if (bounced && S.player.body.velocity.y < 9) break;
      }
      H.clearKeys();
      S.cam.yaw += 1.35; S.cam.pitch = 0.62;
      H.snap();
      S.debug.freeze = true;
    });
    await h.wait(1500);
    await page.evaluate(() => H.hideToasts());
    await h.shot('springpude.jpg');
  }

  // ---------- Crumbling stones ----------
  if (want('smuldre')) {
    await page.evaluate(() => {
      const { S } = H;
      H.start(5);
      const L = S.level, c1 = L.platforms[1], c2 = L.platforms[2];
      H.place(c1, H.center(c2), 0.6);
      H.step(30);                     // stands on it -> starts shaking
      H.key('KeyW', true);
      for (let i = 0; i < 300; i++) {
        H.yawTo(H.center(c2).x, H.center(c2).z);
        const b = S.player.body.position, c = H.center(c1);
        if (S.player.grounded && S.player.groundPlat === c1 && Math.hypot(b.x - c.x, b.z - c.z) > 1.1) H.key('Space', true);
        H.step(1);
        if (S.player.groundPlat === c2) break;
      }
      H.clearKeys();
      H.secs(0.35);
      S.cam.yaw = -c2.def.heading + Math.PI * 0.62; S.cam.pitch = 0.3;
      H.snap();
      S.debug.freeze = true;
    });
    await h.wait(1500);
    await page.evaluate(() => H.hideToasts());
    await h.shot('smuldrende-sten.jpg');
  }

  // ---------- Portal at the end of level 1 ----------
  if (want('portal')) {
    await page.evaluate(() => {
      const { S } = H;
      H.start(0);
      const L = S.level, fin = L.platforms[L.platforms.length - 1], prev = L.platforms[L.platforms.length - 2];
      H.place(fin, H.center(prev), -3.6);
      H.step(10);
      const P = L.portal.center;
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

  // ---------- Death in the lava ----------
  if (want('lava')) {
    await page.evaluate(() => {
      const { S } = H;
      H.start(1);
      const L = S.level, p = L.platforms[6];
      const b = S.player.body;
      const c = H.center(p);
      b.position.set(c.x + 6, -30, c.z); b.velocity.set(0, -30, 0);
      S.cam.pitch = 0.75;
      for (let i = 0; i < 200 && S.game.state === 'playing'; i++) H.step(1);
      for (let i = 0; i < 10; i++) S.particles.update(1 / 60);
      H.snap();
      S.debug.freeze = true;
    });
    await h.wait(250);
    await h.shot('lava-doed.jpg');
  }

  // ---------- Level complete + shop + pause + victory ----------
  if (want('skaerme')) {
    await page.evaluate(() => {
      const { S } = H;
      S.applySave(null);
      H.start(2, { chalk: false, rope: false });
      S.game.coins = 120; S.game.levelCoins = 25; S.game.levelTime = 83;
      S.completeLevel();
    });
    await h.wait(3000);
    await h.shot('skaerm-bane-fuldfoert.jpg');
    await page.evaluate(() => { const { S } = H; S.abilities.owned.chalk = true; S.game.coins = 175; S.openShop('complete'); });
    await h.wait(3000);
    await h.shot('skaerm-butik.jpg');
    await page.evaluate(() => { const { S } = H; H.start(4); S.debug.freeze = true; });
    await h.wait(600);
    await page.evaluate(() => { H.hideToasts(); H.S.setState('paused'); });
    await h.wait(3000);
    await h.shot('skaerm-pause.jpg');
    await page.evaluate(() => { const { S } = H; S.debug.freeze = false; H.start(9); S.game.totalTime = 2531; S.game.deaths = 87; S.game.levelCoins = 30; S.completeLevel(); });
    await h.wait(3000);
    await h.shot('skaerm-sejr.jpg');
  }

  if (want('menu')) {
    await page.evaluate(() => { const { S } = H; S.debug.freeze = false; S.applySave(null); S.loadLevel(0); S.setState('menu'); });
    await h.wait(2500);
    await h.shot('skaerm-hovedmenu.jpg');
  }
};
