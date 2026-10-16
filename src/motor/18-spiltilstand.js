/* =====================================================================
   18. SPILTILSTAND OG HOVEDLØKKE
   ===================================================================== */
const game = {
  state: 'loading', levelIndex: 0, savedLevel: 0, coins: 0, levelCoins: 0, deaths: 0,
  totalTime: 0, levelTime: 0, sound: true, deadTimer: 0, portalTimer: 0, shopReturn: 'menu',
  highest: 0, best: {},
};
const FIRST_ROPE_LEVEL = () => LEVELS.findIndex((d) => d.needsRope);
let level = null;

function loadLevel(i) {
  releaseRope(false);
  abilities.target = null;
  if (level) level.dispose();
  game.levelIndex = i;
  level = new Level(i);
  applyTheme(level.theme);
  buildClouds(level.data.bounds);
  level.reset();
  respawnPlayer();
  cam.yaw = -level.data.startHeading;
  cam.pitch = 0.3;
  cam.curDist = CFG.camera.dist;
  renderHotbar(); // skjules på skateboardbanen
  resetQualityFloor();
}

function startLevel(i) {
  loadLevel(i);
  game.levelTime = 0;
  game.levelCoins = 0;
  abilities.chalkActive = 0;
  abilities.chalkCooldown = 0;
  clearToasts();
  setState('playing');
  showBanner();
  const def = level.def;
  setTimeout(() => {
    if (game.state !== 'playing' || game.levelIndex !== i) return;
    if (def.skate) toast(T.toastSkate, 'gold', 7000);
    else if (def.needsRope && !abilities.owned.rope) toast(T.toastNeedRope, 'bad', 7000);
    else if (def.needsDouble && !abilities.owned.double) toast(T.toastNeedDouble, 'bad', 7000);
    else if (i === FIRST_ROPE_LEVEL()) toast(T.toastRopeHint, 'gold', 7000);
    else if (def.chalkTip && !abilities.owned.chalk) toast(T.tipChalk, 'gold', 6000);
  }, 1400);
}

function restartLevel(manual) {
  releaseRope(false);
  level.setCheckpoint(null);
  level.reset();
  respawnPlayer();
  cam.yaw = -level.data.startHeading;
  game.levelTime = 0;
  game.levelCoins = 0;
  abilities.chalkActive = 0;
  if (manual) toast(T.toastRestart, '', 1400);
}

// Genstart fra det seneste kontrolpunkt (banens tid, mønter og bevægelser fortsætter)
function respawnAtCheckpoint() {
  releaseRope(false);
  for (const plat of level.platforms) if (plat.type === 'crumble' && plat.state !== 'solid') level.restoreCrumble(plat);
  const cp = level.checkpoint, c = cp.body.position, b = player.body;
  respawnPlayer();
  b.position.set(c.x, c.y + cp.def.h / 2 + CFG.player.radius + 0.05, c.z);
  b.previousPosition.copy(b.position);
  b.velocity.set(cp.body.velocity.x, Math.max(0, cp.body.velocity.y), cp.body.velocity.z);
  const next = level.platforms[cp.def.index + 1];
  const h = next ? next.def.heading : cp.def.heading;
  player.facing = -h;
  if (player.skate) player.skate.heading = h;
  cam.yaw = -h;
  cam.target.set(b.position.x, b.position.y + CFG.camera.height - CFG.player.radius, b.position.z);
  abilities.chalkActive = 0;
}

function die() {
  if (game.state !== 'playing') return;
  game.deaths++;
  game.deadTimer = 1.3;
  releaseRope(false);
  player.hang = null;
  if (player.skate) player.skate.grind = null;
  const b = player.body;
  player.deathPos.copy(b.position);
  setState('dead');
  player.model.root.visible = false;
  player.blob.visible = false;
  audio.play('death');
  const fl = $('flash');
  fl.classList.remove('on');
  void fl.offsetWidth;
  fl.classList.add('on');
  for (let i = 0; i < 3; i++) {
    particles.burst(b.position.x, CFG.lavaY + 0.3, b.position.z, 22, { color: i ? '#ff7a1a' : '#ffd24a', speed: 7, up: 2.2, size: 0.55, life: 1.1, grav: 14, drag: 0.5, spread: 1 });
  }
  cam.shake = 0.6;
  toast(T.toastDeath, 'bad', 2600);
  saveGame();
}

function enterPortal() {
  if (game.state !== 'playing') return;
  releaseRope(false);
  setState('portal');
  game.portalTimer = 0.75;
  audio.play('portal');
  $('fade').classList.add('on');
  const c = level.portal.center;
  particles.burst(c.x, c.y, c.z, 60, { color: '#8fe8ff', speed: 7, up: 0.8, size: 0.35, life: 1, grav: 0, drag: 2, spread: 1.5 });
}

function completeLevel() {
  const def = level.def;
  const reward = def.reward;
  const bonus = game.levelCoins;
  game.coins += reward + bonus;
  const last = game.levelIndex >= LEVELS.length - 1;
  game.savedLevel = last ? 0 : game.levelIndex + 1;
  game.highest = Math.max(game.highest, Math.min(LEVELS.length - 1, game.levelIndex + 1));
  const prevBest = game.best[game.levelIndex];
  if (!prevBest || game.levelTime < prevBest) game.best[game.levelIndex] = Math.round(game.levelTime * 10) / 10;
  saveGame();
  $('fade').classList.remove('on');
  if (last) {
    setText('victory-time', formatTime(game.totalTime));
    setText('victory-deaths', String(game.deaths));
    setText('victory-coins', String(game.coins));
    setState('victory');
    return;
  }
  setText('complete-level', String(game.levelIndex + 1));
  setText('complete-name', def.name);
  setText('complete-time', formatTime(game.levelTime));
  setText('complete-reward', `+${reward}`);
  setText('complete-bonus', `+${bonus}`);
  setText('complete-total', String(game.coins));
  const next = game.levelIndex + 1;
  let tip = '';
  const nd = LEVELS[next];
  if (nd.skate) tip = T.tipSkate;
  else if (nd.needsRope && !abilities.owned.rope) tip = T.tipRope;
  else if (nd.needsDouble && !abilities.owned.double) tip = T.tipDouble;
  else if (nd.chalkTip && !abilities.owned.chalk) tip = T.tipChalk;
  else if (next === FIRST_ROPE_LEVEL()) tip = T.tipRopeOwned;
  else if (next === LEVELS.length - 1) tip = T.tipFinal;
  setText('complete-tip', tip);
  setState('complete');
}

function nextLevel() {
  if (game.state !== 'complete') return;
  startLevel(game.levelIndex + 1);
}

// Et fast fysikskridt
function fixedStep(dt) {
  level.fixedUpdate(dt);
  const playing = game.state === 'playing';
  const b = player.body;
  if (playing) {
    abilities.chalkActive = Math.max(0, abilities.chalkActive - dt);
    abilities.chalkCooldown = Math.max(0, abilities.chalkCooldown - dt);
    playerControl(dt);
  } else if (game.state === 'dead') {
    b.position.copy(player.deathPos);
    b.velocity.set(0, 0, 0);
  } else if (player.grounded) {
    b.velocity.x = player.groundVel.x;
    b.velocity.z = player.groundVel.z;
  }
  world.step(dt);
  postStep(dt, playing);
}

const simulateStates = new Set(['playing', 'dead', 'portal', 'menu', 'complete', 'victory']);
const debug = { freeze: false, freeCam: false, quiet: false, noLedge: false }; // kun til automatiske tests/skærmbilleder (?debug)
let lastT = performance.now(), acc = 0, elapsed = 0;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, Math.max(0, (now - lastT) / 1000));
  lastT = now;
  elapsed += dt;
  updateQuality(dt);
  const s = game.state;
  const simulate = simulateStates.has(s) || (s === 'shop' && (game.shopReturn === 'menu' || game.shopReturn === 'complete'));
  if (simulate && level && !debug.freeze) {
    acc += dt;
    let n = 0;
    while (acc >= CFG.fixedDt && n < CFG.maxSteps) { fixedStep(CFG.fixedDt); acc -= CFG.fixedDt; n++; }
    if (n >= CFG.maxSteps) acc = 0;
  }
  if (s === 'playing') { game.levelTime += dt; game.totalTime += dt; }
  if (s === 'dead') {
    game.deadTimer -= dt;
    if (game.deadTimer <= 0) { if (level.checkpoint) respawnAtCheckpoint(); else restartLevel(false); setState('playing'); }
  }
  if (s === 'portal') {
    game.portalTimer -= dt;
    if (game.portalTimer <= 0) completeLevel();
  }
  if (!level) return;

  // Grafik
  level.update(dt, elapsed);
  updatePlayerVisual(dt, elapsed);
  particles.update(dt);
  if (debug.freeCam) { /* kameraet styres udefra */ }
  else if (s === 'menu' || (s === 'shop' && game.shopReturn === 'menu')) updateMenuCamera(elapsed);
  else updateCamera(dt);
  abilities.target = s === 'playing' && abilities.selected === 'rope' && !abilities.rope ? findRopeTarget() : null;
  updateRopeVisual(dt);
  if (s === 'playing' || s === 'dead' || s === 'portal') updateHud();

  // Miljø følger kameraet / spilleren
  const pb = player.body.position;
  skyGroup.position.copy(camera.position);
  lavaUniforms.uTime.value = elapsed;
  emberUniforms.uTime.value = elapsed;
  emberUniforms.uCenter.value.set(pb.x, 0, pb.z);
  lava.position.x = Math.round(camera.position.x / 50) * 50;
  lava.position.z = Math.round(camera.position.z / 50) * 50;
  const d = sun.userData.dir;
  sun.position.set(pb.x + d.x * 120, pb.y + d.y * 120, pb.z + d.z * 120);
  sun.target.position.set(pb.x, pb.y, pb.z);
  lavaLight.position.set(pb.x, pb.y - 100, pb.z);
  lavaLight.target.position.set(pb.x, pb.y, pb.z);
  for (const c of cloudGroup.children) c.position.x += c.userData.drift * dt * 0.4;
  const pv = player.body.velocity;
  audio.update(pb.y - CFG.lavaY, Math.hypot(pv.x, pv.y, pv.z),
    player.skate && player.grounded && s === 'playing' ? Math.hypot(pv.x, pv.z) : 0);

  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  emberUniforms.uScale.value = h;
  particles.uniforms.uScale.value = h;
});

// ---- Knapper ----
const click = (id, fn) => $(id).addEventListener('click', () => { audio.init(); audio.play('click'); fn(); });
click('btn-continue', () => {
  const s = loadSave();
  startLevel(s ? clamp(s.level, 0, LEVELS.length - 1) : 0);
});
click('btn-new', () => {
  const s = loadSave();
  const hasProgress = s && (s.level > 0 || s.coins > 0 || Object.values(s.owned || {}).some(Boolean));
  if (hasProgress && !newGameArmed) {
    newGameArmed = 1;
    $('btn-new').textContent = forTouch('Sikker? Klik igen – alt nulstilles');
    setTimeout(() => { if (newGameArmed) refreshMenu(); }, 3500);
    return;
  }
  storage.remove(SAVE_KEY);
  applySave(null);
  game.savedLevel = 0;
  saveGame();
  startLevel(0);
});
click('btn-menu-shop', () => openShop('menu'));
click('btn-resume', resumeGame);
click('btn-pause-shop', () => openShop('paused'));
click('btn-restart', () => { restartLevel(true); setState('playing'); });
click('btn-sound', toggleSound);
click('btn-quit', () => {
  saveGame();
  loadLevel(clamp(game.savedLevel, 0, LEVELS.length - 1));
  refreshMenu();
  setState('menu');
});
click('btn-next', nextLevel);
click('btn-complete-shop', () => openShop('complete'));
click('btn-shop-back', closeShop);
click('btn-replay', () => { game.savedLevel = 0; saveGame(); startLevel(0); });
click('btn-victory-menu', () => { loadLevel(0); refreshMenu(); setState('menu'); });
$('shop-items').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-buy]');
  if (btn) buy(btn.dataset.buy);
});
click('btn-levels', () => { renderLevelSelect(); setState('levels'); });
click('btn-levels-back', () => { refreshMenu(); setState('menu'); });
$('level-grid').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-level]');
  if (!btn) return;
  audio.init();
  audio.play('click');
  startLevel(+btn.dataset.level);
});

// Udstilling af alle platformtyper i et verdens-sæt (bruges af udviklerværktøjer og tests)
function showcaseDef(kit, theme) {
  return {
    name: 'Udstilling', kit, theme, reward: 0,
    segs: [
      { t: 'start', w: 10, d: 10 },
      { g: 3, w: 6, d: 6 },
      { t: 'ice', g: 3, w: 4, d: 4 },
      { t: 'crumble', g: 3, w: 4, d: 4 },
      { t: 'move', g: 3, w: 4, d: 4, ax: 'x', amp: 0.001, per: 4 },
      { t: 'bounce', g: 3, w: 4, d: 4 },
      { t: 'spin', g: 3, w: 5, spd: 0.4 },
      { t: 'conveyor', g: 3, w: 4, d: 6, spd: 3 },
      { t: 'rot', g: 3, w: 6, spd: 0.25 },
      { t: 'vent', g: 3, w: 3, d: 3, lift: 6 },
      { t: 'swing', g: 3, w: 4, d: 3, len: 6, amp: 0.001 },
      { t: 'bar', at: 1, y: 2.6, len: 4 },
      { g: 6, w: 4, shape: 'cyl' },
      { t: 'zip', at: -1, y: 3.4, len: 14, drop: 0.8 },
      { g: 12, w: 6, d: 6 },
      { t: 'bar', at: 2, y: 2.4, len: 3, ang: 90, x: -1.5, sw: { len: 5, amp: 25, per: 3 } },
      { t: 'gust', at: 3, w: 6, d: 6, h: 10, y: -2, pow: 12 },
      { t: 'vent', g: 6, w: 3, d: 3, lift: 6, pulse: 3, duty: 0.5 },
      { t: 'anchor', at: 2, y: 6 },
      { g: 4, w: 6, d: 6, v: 'big' },
      { g: 3, w: 4, d: 4, grab: true, dy: 1 },
      { g: 3, w: 4, d: 4, slick: true },
      { t: 'bounce', g: 3, w: 4, d: 4, mv: { ax: 'y', amp: 0.001, per: 3 } },
      { t: 'bar', at: 1, y: 2.6, len: 3, mv: { ax: 'x', amp: 0.001, per: 4 } },
      { g: 5, w: 6, d: 6 },
      { t: 'ramp', g: 3, w: 4, len: 6, rise: 2 },
      { t: 'boost', g: 0, w: 4, d: 6 },
      { t: 'rail', g: 2, len: 8 },
      { t: 'finish', g: 3, w: 10, d: 10 },
    ],
  };
}

// ---- Opstart ----
function boot() {
  markSharedGpu();
  createPlayer();
  const save = loadSave();
  applySave(save);
  game.sound = save ? save.sound !== false : true;
  audio.enabled = game.sound;
  loadLevel(clamp(game.savedLevel, 0, LEVELS.length - 1));
  refreshMenu();
  // Telefon og tablet: touch-styring (joystick, HOP, EVNE og pause) i stedet for tastatur og mus
  if (prefersTouch()) setTouchMode(true);
  $('screen-loading').classList.add('hidden');
  setState('menu');
  requestAnimationFrame((t) => { lastT = t; frame(t); });

  // Udvikler-hooks til automatiske tests (kun med ?debug i adressen)
  if (/[?&]debug\b/.test(location.search)) {
    window.skyhoj = {
      game, player, abilities, cam, CFG, LEVELS, THEMES, input,
      get level() { return level; },
      buildLevelData, startLevel, loadLevel, completeLevel, die, fireRope, releaseRope, findRopeTarget,
      useAbility, selectAbility, openShop, setState, renderShop, renderHotbar, toast, saveGame, applySave,
      fixedStep, respawnPlayer, onKeyPress, updateCamera, camera, renderer, scene, world, debug, particles,
      emitChalk, enterPortal, restartLevel, tryGrab, releaseHang, hangFrame, WORLD_KITS, renderLevelSelect,
      touch, setTouchMode, forTouch, quality, T,
      get CHARACTER() { return CHARACTER; },
      setLevelDef(i, def) { LEVELS[i] = def; },
      showcaseDef,
      // Gem/gendan hele simulationens tilstand (testrobotten prøver handlinger af og spoler tilbage)
      snapshot() {
        const v3 = (v) => ({ x: v.x, y: v.y, z: v.z });
        const q4 = (q) => ({ x: q.x, y: q.y, z: q.z, w: q.w });
        const b = player.body, P = player, A = abilities;
        const keys = ['grounded', 'wasGrounded', 'groundPlat', 'coyote', 'jumpBuffer', 'jumpCooldown', 'jumping', 'knockCooldown',
          'facing', 'runPhase', 'squash', 'lastVy', 'stepTimer', 'grip', 'grabCooldown', 'airJumps', 'flipT'];
        const pl = {};
        for (const k of keys) pl[k] = P[k];
        return {
          game: { state: game.state, coins: game.coins, levelCoins: game.levelCoins, deaths: game.deaths, deadTimer: game.deadTimer, portalTimer: game.portalTimer, levelTime: game.levelTime },
          body: { p: v3(b.position), v: v3(b.velocity) },
          pl, gv: v3(P.groundVel), gn: v3(P.groundNormal),
          hang: P.hang ? { ...P.hang, climb: P.hang.climb ? { ...P.hang.climb } : null } : null,
          skate: P.skate ? { ...P.skate, grind: P.skate.grind ? { ...P.skate.grind } : null } : null,
          abil: { chalkActive: A.chalkActive, chalkCooldown: A.chalkCooldown, selected: A.selected, ropeShoot: A.ropeShoot, target: A.target,
            rope: A.rope ? { ...A.rope, point: A.rope.point.clone(), vel: A.rope.vel.clone(), local: A.rope.local ? A.rope.local.clone() : null } : null },
          time: level.time, wtime: world.time,
          plats: level.platforms.map((p) => ({ p: v3(p.body.position), v: v3(p.body.velocity), q: q4(p.body.quaternion), w: v3(p.body.angularVelocity),
            inWorld: !!p.body.world, state: p.state, timer: p.timer, fallVel: p.fallVel, squash: p.squash,
            mp: v3(p.mesh.position), mq: q4(p.mesh.quaternion), mvis: p.mesh.visible,
            bar: p.bar ? { q: q4(p.bar.body.quaternion), w: v3(p.bar.body.angularVelocity) } : null })),
          bars: level.bars.map((r) => ({ a: v3(r.a), v: v3(r.vel) })),
          anchors: level.anchors.map((a) => ({ p: v3(a.pos), v: v3(a.vel) })),
          coins: level.coins.map((c) => c.collected),
          cp: level.checkpoint ? level.platforms.indexOf(level.checkpoint) : -1,
        };
      },
      restore(s) {
        const b = player.body, P = player, A = abilities;
        Object.assign(game, s.game);
        b.position.set(s.body.p.x, s.body.p.y, s.body.p.z);
        b.previousPosition.copy(b.position);
        b.velocity.set(s.body.v.x, s.body.v.y, s.body.v.z);
        Object.assign(P, s.pl);
        P.groundVel.set(s.gv.x, s.gv.y, s.gv.z);
        P.groundNormal.set(s.gn.x, s.gn.y, s.gn.z);
        P.hang = s.hang ? { ...s.hang, climb: s.hang.climb ? { ...s.hang.climb } : null } : null;
        P.skate = s.skate ? { ...s.skate, grind: s.skate.grind ? { ...s.skate.grind } : null } : null;
        const r = s.abil.rope;
        Object.assign(A, s.abil, { rope: r ? { ...r, point: r.point.clone(), vel: r.vel.clone(), local: r.local ? r.local.clone() : null } : null });
        level.time = s.time; world.time = s.wtime;
        level.platforms.forEach((p, i) => {
          const o = s.plats[i];
          p.body.position.set(o.p.x, o.p.y, o.p.z); p.body.previousPosition.copy(p.body.position);
          p.body.velocity.set(o.v.x, o.v.y, o.v.z);
          p.body.quaternion.set(o.q.x, o.q.y, o.q.z, o.q.w);
          p.body.angularVelocity.set(o.w.x, o.w.y, o.w.z);
          if (o.inWorld && !p.body.world) world.addBody(p.body);
          if (!o.inWorld && p.body.world) world.removeBody(p.body);
          Object.assign(p, { state: o.state, timer: o.timer, fallVel: o.fallVel, squash: o.squash });
          p.mesh.position.set(o.mp.x, o.mp.y, o.mp.z); p.mesh.quaternion.set(o.mq.x, o.mq.y, o.mq.z, o.mq.w); p.mesh.visible = o.mvis;
          if (o.bar) { p.bar.body.quaternion.set(o.bar.q.x, o.bar.q.y, o.bar.q.z, o.bar.q.w); p.bar.body.angularVelocity.set(o.bar.w.x, o.bar.w.y, o.bar.w.z); }
        });
        level.bars.forEach((r, i) => { r.a.set(s.bars[i].a.x, s.bars[i].a.y, s.bars[i].a.z); r.vel.set(s.bars[i].v.x, s.bars[i].v.y, s.bars[i].v.z); });
        level.anchors.forEach((a, i) => { a.pos.set(s.anchors[i].p.x, s.anchors[i].p.y, s.anchors[i].p.z); a.vel.set(s.anchors[i].v.x, s.anchors[i].v.y, s.anchors[i].v.z); });
        level.coins.forEach((c, i) => { c.collected = s.coins[i]; });
        level.setCheckpoint(s.cp >= 0 ? level.platforms[s.cp] : null);
        if (game.state === 'playing') { $('screen-complete').classList.add('hidden'); }
      },
      // Start en vilkårlig banedefinition (uden at ændre LEVELS permanent)
      playDef(def, slot = 0) {
        const keep = LEVELS[slot];
        LEVELS[slot] = def;
        startLevel(slot);
        LEVELS[slot] = keep;
        document.getElementById('level-banner').classList.add('hidden');
        return level.data;
      },
      setCharacter(impl) { replaceCharacter(impl); },
      // Vis alle platformtyper i et sæt og stil kameraet, så de kan fotograferes
      showcase(kit, theme = 'day') {
        const def = showcaseDef(kit, theme);
        const keep = LEVELS[0];
        LEVELS[0] = def;
        startLevel(0);
        LEVELS[0] = keep;
        document.getElementById('level-banner').classList.add('hidden');
        return level.data.plats.map((p) => ({ type: p.type, x: p.x, z: p.z, top: p.top }));
      },
      camTo(x, y, z, tx, ty, tz) {
        debug.freeCam = true;
        camera.position.set(x, y, z);
        camera.lookAt(tx, ty, tz);
        camera.updateMatrixWorld();
      },
      // Stil flere figurer op i forskellige stillinger (til skærmbilleder af animationerne)
      lineup(states, spacing = 1.6) {
        if (window.__lineup) for (const r of window.__lineup) scene.remove(r.root);
        const sp = level.spawn;
        window.__lineup = states.map((st, i) => {
          const rig = CHARACTER.build();
          rig.inner.rotation.order = 'YXZ';
          rig.root.position.set(sp.x + (i - (states.length - 1) / 2) * spacing, sp.y + (st.yOffset || 0), sp.z);
          rig.inner.rotation.y = st.facing ?? 0;
          scene.add(rig.root);
          const hanging = st.mode === 'hang' || st.mode === 'climb';
          const full = { mode: 'idle', speed: 0, vy: 0, grounded: true, runPhase: 0, time: 0, squash: 0, flipT: -1, chalk: 0,
            hangKind: null, shimmy: 0, climbT: 0, push: false, lean: 0, crouch: 0,
            grip: 1, turnRate: 0, surface: null, aimLocal: { x: 0, y: -0.2, z: -1 },
            gripLocal: hanging ? { x: 0, y: CFG.hang.drop, z: st.hangKind === 'bar' ? 0 : -CFG.hang.wallGap } : null,
            gripTangent: hanging ? { x: 1, y: 0, z: 0 } : null,
            ropeDir: st.mode === 'rope' ? { x: 0, y: 0.94, z: -0.34 } : null,
            gear: { gloves: false, chalk: true, rope: true, helmet: st.mode === 'skate' || st.mode === 'grind' }, ...st };
          for (let k = 0; k < 40; k++) CHARACTER.animate(rig, full, 1 / 30);
          return rig;
        });
        player.model.root.visible = false;
        return window.__lineup.length;
      },
    };
  }
}

const _invQ = new THREE.Quaternion(), _eul = new THREE.Euler(), _cv = new THREE.Vector3();
const fontsReady = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
Promise.race([fontsReady, new Promise((r) => setTimeout(r, 1500))]).then(boot);
})();
