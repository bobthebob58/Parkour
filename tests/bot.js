// Deterministic bot: for every level and every transition i -> i+1, place the
// player on platform i and try to reach platform i+1 using the real physics.
module.exports = async (page, h) => {
  await page.waitForFunction(() => window.skyhoj && window.skyhoj.game.state === 'menu', null, { timeout: 60000 });
  const only = process.env.LEVELS ? process.env.LEVELS.split(',').map(Number) : null;
  const res = await page.evaluate(async (only) => {
    const S = window.skyhoj, CFG = S.CFG, P = S.player, A = S.abilities, cam = S.cam;
    const dt = CFG.fixedDt;
    const fwd = (h) => ({ x: Math.sin(h), z: -Math.cos(h) });
    A.owned.rope = true; A.owned.chalk = true;
    const report = [];
    const press = (code) => { S.input.keys[code] = true; S.onKeyPress(code); };
    const release = (code) => { S.input.keys[code] = false; };
    const clearKeys = () => { for (const k of Object.keys(S.input.keys)) S.input.keys[k] = false; };

    function platCenter(plat) {
      const b = plat.body.position;
      return { x: b.x, y: plat.def.top + (b.y - plat.base.y), z: b.z };
    }
    function onPlat(plat) {
      return P.grounded && P.groundPlat === plat;
    }
    function aimYawTo(x, z) {
      const b = P.body.position;
      const dx = x - b.x, dz = z - b.z;
      // camera forward = (-sin yaw, -cos yaw)
      cam.yaw = Math.atan2(-dx, -dz);
    }
    function pointCamAt(target) {
      const b = P.body.position;
      const chest = { x: b.x, y: b.y + 0.8, z: b.z };
      const d = { x: target.x - chest.x, y: target.y - chest.y, z: target.z - chest.z };
      const L = Math.hypot(d.x, d.y, d.z);
      S.camera.position.set(chest.x - d.x / L * 4, chest.y - d.y / L * 4 + 0.6, chest.z - d.z / L * 4);
      S.camera.lookAt(target.x, target.y, target.z);
      S.camera.updateMatrixWorld();
    }
    function placeOn(plat, towards, back) {
      // stand on plat, `back` metres behind its centre relative to the direction to `towards`
      const c = platCenter(plat);
      const dx = towards.x - c.x, dz = towards.z - c.z, L = Math.hypot(dx, dz) || 1;
      const b = P.body;
      b.position.set(c.x - dx / L * back, c.y + CFG.player.radius + 0.02, c.z - dz / L * back);
      b.velocity.set(0, 0, 0);
      P.grounded = false; P.jumpBuffer = 0; P.coyote = 0; P.jumpCooldown = 0; P.jumping = false;
    }
    function step(n = 1) { for (let i = 0; i < n; i++) S.fixedStep(dt); }

    // One attempt at a normal (non-rope) transition. waitT = extra wait before running.
    function attempt(L, i, waitT) {
      const from0 = L.platforms[i], to = L.platforms[i + 1];
      // bounce pads and spinners are taken at speed: start one platform earlier and hop through
      const chain = (from0.type === 'bounce' || from0.type === 'spin') && i > 0;
      const startIdx = chain ? i - 1 : i;
      let from = L.platforms[startIdx];
      let goal = chain ? from0 : to;
      clearKeys();
      S.releaseRope(false);
      if (from.type === 'crumble' && from.state !== 'solid') L.restoreCrumble(from);
      // wait for timing while hovering above the start platform (so it can't crumble / knock us)
      let t = 0;
      while (t < waitT) {
        const c = platCenter(from);
        P.body.position.set(c.x, c.y + 6, c.z); P.body.velocity.set(0, 0, 0);
        step(1); t += dt;
      }
      placeOn(from, platCenter(goal), Math.min(from.def.w, from.def.d) * 0.25);
      step(6);
      if (S.game.state !== 'playing') return 'dead-wait';
      // run towards target, jump near edge
      let jumped = false, time = 0, landed = false;
      press('KeyW');
      while (time < 6) {
        if (P.groundPlat === to) { landed = true; break; }
        if (chain && goal === from0 && (P.groundPlat === from0 || (from0.type === 'bounce' && P.body.position.y > from0.def.top + 1.5 && Math.hypot(P.body.position.x - platCenter(from0).x, P.body.position.z - platCenter(from0).z) < 3))) {
          from = from0; goal = to; jumped = from0.type === 'bounce'; release('Space');
        }
        const tc = platCenter(goal);
        // lead moving targets
        let lead = { x: tc.x, z: tc.z };
        if (goal.type === 'move') lead = { x: tc.x + goal.body.velocity.x * 0.35, z: tc.z + goal.body.velocity.z * 0.35 };
        aimYawTo(lead.x, lead.z);
        if (!jumped) {
          // jump when about to leave the current platform
          const b = P.body.position;
          const fc = platCenter(from);
          const sup = from.def.shape === 'cyl' ? from.def.w / 2 : null;
          let distToEdge;
          if (sup) distToEdge = sup - Math.hypot(b.x - fc.x, b.z - fc.z);
          else {
            // approximate box edge distance along movement
            const yaw = from.def.yaw, f = fwd(yaw), r = { x: Math.cos(yaw), z: Math.sin(yaw) };
            const lx = (b.x - fc.x) * r.x + (b.z - fc.z) * r.z, lz = (b.x - fc.x) * f.x + (b.z - fc.z) * f.z;
            distToEdge = Math.min(from.def.w / 2 - Math.abs(lx), from.def.d / 2 - Math.abs(lz));
          }
          if (from.type === 'bounce') {
            // the pad launches us on contact – just keep running
            if (b.y > from.def.top + 1.5) jumped = true;
          } else if (distToEdge < 0.25 || (from.type === 'spin' && P.groundPlat === from && distToEdge < from.def.w * 0.45) || (!P.grounded && P.coyote > 0 && P.coyote < 0.06)) {
            press('Space');
            jumped = true;
          }
        } else if (S.input.keys.Space && P.body.velocity.y < 2) {
          release('Space');
        }
        if (chain && goal === from0 && jumped && from0.type === 'spin' && P.groundPlat === from0) { from = from0; goal = to; jumped = false; }
        step(1); time += dt;
        if (S.game.state === 'portal') { clearKeys(); S.setState('playing'); return 'ok'; }
        if (S.game.state !== 'playing') { clearKeys(); return 'dead'; }
        if (jumped && P.groundPlat === to) { landed = true; break; }
        if (jumped && P.grounded && P.groundPlat === from && time > 1.5 && from.type !== 'bounce') { clearKeys(); return 'stuck'; }
      }
      clearKeys();
      if (!landed) return 'timeout';
      if (to.type === 'bounce') return 'ok';
      // must still be on it a moment later (ice!)
      step(20);
      if (S.game.state === 'portal') { S.setState('playing'); return 'ok'; }
      if (S.game.state !== 'playing') return 'slid-off';
      return 'ok';
    }


    function willLand(to, variant) {
      const b = P.body.position, v = P.body.velocity;
      let x = b.x, y = b.y - CFG.player.radius, z = b.z;
      let vx = v.x, vy = Math.max(v.y, 0) + CFG.rope.releaseBoost, vz = v.z;
      const c = platCenter(to);
      const half = Math.min(to.def.w, to.def.d) / 2 - 0.35 - variant * 0.1;
      for (let t = 0; t < 2.5; t += 0.01) {
        const ny = y + vy * 0.01; vy -= CFG.gravity * 0.01;
        x += vx * 0.01; z += vz * 0.01;
        if (y >= c.y && ny < c.y) return Math.abs(x - c.x) < half + 0.3 && Math.abs(z - c.z) < half + 0.3;
        y = ny;
      }
      return false;
    }

    // Rope transition: hook successive anchors and release over the target.
    function ropeAttempt(L, i, variant) {
      const from = L.platforms[i], to = L.platforms[i + 1];
      clearKeys();
      S.releaseRope(false);
      const tc0 = platCenter(to), fc0 = platCenter(from);
      const dir = { x: tc0.x - fc0.x, z: tc0.z - fc0.z };
      const DL = Math.hypot(dir.x, dir.z); dir.x /= DL; dir.z /= DL;
      const along = (p) => (p.x - fc0.x) * dir.x + (p.z - fc0.z) * dir.z;
      const anchors = L.anchors.filter(a => { const s = along(a.pos); return s > 0 && s < DL; }).sort((a, b) => along(a.pos) - along(b.pos));
      placeOn(from, tc0, Math.min(from.def.w, from.def.d) * 0.3);
      step(20);
      S.selectAbility('rope');
      let idx = -1, time = 0, jumped = false;
      press('KeyW');
      const targetAlong = along(tc0);
      while (time < 14) {
        const b = P.body.position;
        aimYawTo(tc0.x, tc0.z);
        const s = along(b);
        if (!A.rope) {
          const next = anchors[idx + 1];
          // jump off the edge, then hook the next anchor
          if (!jumped && P.grounded) {
            const edge = along(fc0) + (from.def.d / 2);
            if (s > edge - 0.6) { press('Space'); jumped = true; }
          }
          if (next && !P.grounded && (idx >= 0 || jumped)) {
            const a = next.pos;
            const dist = Math.hypot(a.x - b.x, a.y - (b.y + 0.8), a.z - b.z);
            const ready = idx < 0 ? P.body.velocity.y < 4 + variant : along(b) > along(anchors[idx].pos) - 1 + variant;
            if (dist < CFG.rope.range - 1 && ready) {
              pointCamAt(a);
              const t = S.findRopeTarget();
              if (t && t.anchor === next) { S.fireRope(); idx++; }
            }
          }
        } else {
          release('Space');
          const cur = anchors[idx];
          const next = anchors[idx + 1];
          const v = P.body.velocity;
          const vAlong = v.x * dir.x + v.z * dir.z;
          if (next) {
            // switch to next anchor once we've swung past the current one and are moving forward
            const pastCur = along(b) > along(cur.pos) + 1.5 + variant;
            if (pastCur && vAlong > 2 && v.y > -2) { S.releaseRope(false); }
          } else {
            // release when a ballistic prediction (with the jump-off boost) lands on the target
            if (willLand(to, variant)) press('Space');
          }
        }
        step(1); time += dt;
        if (S.game.state !== 'playing') { clearKeys(); return `dead (anchor ${idx + 1}/${anchors.length})`; }
        if (P.groundPlat === to) { clearKeys(); S.releaseRope(false); step(30); return S.game.state === 'playing' ? 'ok' : 'slid-off'; }
      }
      clearKeys();
      return `timeout (anchor ${idx + 1}/${anchors.length})`;
    }

    for (let li = 0; li < S.LEVELS.length; li++) {
      if (only && !only.includes(li + 1)) continue;
      S.startLevel(li);
      S.setState('playing');
      const L = S.level;
      const fails = [];
      let tries = 0;
      for (let i = 0; i + 1 < L.platforms.length; i++) {
        const to = L.platforms[i + 1];
        let result = 'n/a', ok = false;
        const variants = to.def.rope ? [0, 1, -1, 2, 0.5] : [0, 0.4, 0.8, 1.2, 1.6, 2.0, 2.4, 2.8, 3.2, 3.6, 4.0, 4.4];
        for (const v of variants) {
          tries++;
          if (S.game.state !== 'playing') S.setState('playing');
          result = to.def.rope ? ropeAttempt(L, i, v) : attempt(L, i, v);
          if (S.game.state === 'dead') { S.game.deadTimer = 0; S.setState('playing'); }
          if (result === 'ok') { ok = true; break; }
        }
        if (!ok) fails.push(`${i}->${i + 1} (${L.platforms[i].type}->${to.type}${to.def.rope ? ', REB' : ''}): ${result}`);
      }
      report.push(`Bane ${li + 1}: ${L.platforms.length - 1 - fails.length}/${L.platforms.length - 1} overgange klaret` + (fails.length ? '\n   ' + fails.join('\n   ') : ''));
    }
    return report.join('\n');
  }, only);
  console.log(res);
  if (/^\s{3}\d+->/m.test(res)) throw new Error('Fysik-botten kunne ikke klare alle overgange');
};
