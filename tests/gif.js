// Frame-by-frame deterministic capture for animated GIFs.
const fs = require('fs');
const path = require('path');
module.exports = async (page, h) => {
  await page.waitForFunction(() => window.skyhoj && window.skyhoj.game.state === 'menu', null, { timeout: 60000 });
  const clip = process.env.CLIP || 'reb';
  const outDir = path.join(__dirname, 'frames-' + clip);
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  const FPS = 12;

  await page.evaluate(({ clip, FPS }) => {
    const S = window.skyhoj, P = S.player, dt = S.CFG.fixedDt;
    const center = (p) => { const b = p.body.position; return { x: b.x, y: p.def.top + (b.y - p.base.y), z: b.z }; };
    const yawTo = (x, z) => { const b = P.body.position; return Math.atan2(-(x - b.x), -(z - b.z)); };
    const key = (c, on) => { S.input.keys[c] = on; if (on) S.onKeyPress(c); };
    S.abilities.owned.rope = true; S.abilities.owned.chalk = true;
    const levelIdx = clip === 'reb' ? 7 : 2;
    S.startLevel(levelIdx);
    document.getElementById('level-banner').classList.add('hidden');
    document.getElementById('toasts').innerHTML = '';
    document.getElementById('help-hint').classList.add('hidden');
    S.debug.freeze = true; S.debug.freeCam = true;
    const L = S.level;
    let idx = clip === 'reb' ? 2 : 0;           // current platform index
    const lastIdx = clip === 'reb' ? 5 : 5;
    // put player on the starting platform
    const start = L.platforms[idx], nxt = L.platforms[idx + 1];
    const c0 = center(start), c1 = center(nxt);
    const d = Math.hypot(c1.x - c0.x, c1.z - c0.z);
    P.body.position.set(c0.x - (c1.x - c0.x) / d * 0.6, c0.y + 0.45, c0.z - (c1.z - c0.z) / d * 0.6);
    P.body.velocity.set(0, 0, 0);
    P.facing = Math.atan2(-(c1.x - c0.x), -(c1.z - c0.z));
    S.cam.yaw = P.facing + (clip === 'reb' ? 1.05 : 0.5);
    S.cam.pitch = clip === 'reb' ? 0.18 : 0.3;
    if (clip === 'reb') S.selectAbility('rope');
    for (let i = 0; i < 20; i++) S.fixedStep(dt);
    for (let i = 0; i < 40; i++) S.updateCamera(0.05);
    let jumped = false, hooked = false, done = false, hold = 0;
    let viewYaw = S.cam.yaw;

    function control() {
      if (done) { S.input.keys.KeyW = false; return; }
      const from = L.platforms[idx], to = L.platforms[idx + 1];
      const tc = center(to), b = P.body.position;
      const wantYaw = yawTo(tc.x, tc.z);
      // camera yaw follows the run direction smoothly (with a side offset for a nicer view)
      const off = clip === 'reb' ? 1.05 : 0.5;
      let dy = wantYaw + off - viewYaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      viewYaw += dy * 0.02;
      // movement basis (WASD is camera-relative) points at the target during the physics step
      S.cam.yaw = wantYaw;
      key('KeyW', true); S.input.keys.KeyW = true;
      if (to.def.rope) {
        const a = L.anchors[0];
        if (!jumped && P.grounded) {
          const fc = center(from);
          const along = (b.x - fc.x) * (tc.x - fc.x) / Math.hypot(tc.x - fc.x, tc.z - fc.z) + (b.z - fc.z) * (tc.z - fc.z) / Math.hypot(tc.x - fc.x, tc.z - fc.z);
          if (along > from.def.d / 2 - 0.5) { key('Space', true); jumped = true; }
        } else if (jumped && !hooked && P.body.velocity.y < 3) {
          S.camera.position.set(b.x, b.y + 1.5, b.z); S.camera.lookAt(a.pos); S.camera.updateMatrixWorld();
          S.fireRope(); hooked = !!S.abilities.rope; S.input.keys.Space = false;
        } else if (hooked && S.abilities.rope) {
          // release when the ballistic arc (with jump-off boost) lands on the target
          let x = b.x, y = b.y - 0.42, z = b.z, vx = P.body.velocity.x, vy = Math.max(P.body.velocity.y, 0) + S.CFG.rope.releaseBoost, vz = P.body.velocity.z;
          let ok = false;
          for (let t = 0; t < 2.5; t += 0.01) { const ny = y + vy * 0.01; vy -= 24 * 0.01; x += vx * 0.01; z += vz * 0.01; if (y >= tc.y && ny < tc.y) { ok = Math.abs(x - tc.x) < 1.2 && Math.abs(z - tc.z) < 1.2; break; } y = ny; }
          if (ok) key('Space', true);
        } else if (S.input.keys.Space && P.body.velocity.y < 2) S.input.keys.Space = false;
      } else if (from.type === 'bounce') {
        // launched by the pad – just keep steering
      } else if (P.grounded && P.groundPlat === from) {
        const fc = center(from);
        const r = Math.min(from.def.w, from.def.d) / 2;
        const along = ((b.x - fc.x) * (tc.x - fc.x) + (b.z - fc.z) * (tc.z - fc.z)) / Math.hypot(tc.x - fc.x, tc.z - fc.z);
        if (along > r - 0.35 && to.type !== 'bounce') key('Space', true);
        if (along > r - 0.25 && to.type === 'bounce') key('Space', true);
      } else if (S.input.keys.Space && P.body.velocity.y < 2) S.input.keys.Space = false;
      if (P.groundPlat === to || (to.type === 'bounce' && P.body.velocity.y > 12)) {
        idx++; jumped = false; hooked = false; S.input.keys.Space = false;
        if (idx >= lastIdx) done = true;
      }
    }
    window.G = {
      tick() {
        const n = Math.round(1 / FPS / dt);
        for (let i = 0; i < n; i++) {
          control();
          S.fixedStep(dt);
          if (done) hold++;
        }
        S.cam.yaw = viewYaw;
        S.updateCamera(1 / FPS);
        document.getElementById('toasts').innerHTML = '';
        return { done: done && hold > n * FPS * 0.6, idx, state: S.game.state };
      },
    };
  }, { clip, FPS });

  let k = 0;
  for (; k < 140; k++) {
    const r = await page.evaluate(() => G.tick());
    // let two animation frames render the new state
    await page.evaluate(() => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res))));
    await page.screenshot({ path: path.join(outDir, `f${String(k).padStart(3, '0')}.png`) });
    if (r.done || r.state !== 'playing') { console.log('end', JSON.stringify(r)); break; }
  }
  console.log('frames', k + 1, 'in', outDir);
};
