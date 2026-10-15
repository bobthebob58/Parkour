// Real-time end-to-end test using real browser input events.
module.exports = async (page, h) => {
  const results = [];
  const check = (name, ok, extra = '') => { results.push(`${ok ? 'OK  ' : 'FAIL'} ${name} ${extra}`); };
  const ev = (fn, arg) => page.evaluate(fn, arg);
  // wait for `secs` of *simulated* time (software rendering runs at a few FPS)
  const simWait = async (secs) => { const t0 = await ev(() => skyhoj.level.time); await page.waitForFunction((t) => skyhoj.level.time >= t, t0 + secs, { timeout: 120000, polling: 50 }); };
  await page.waitForFunction(() => window.skyhoj && window.skyhoj.game.state === 'menu', null, { timeout: 60000 });

  // 1. New game via real click
  await page.click('#btn-new');
  await h.wait(800);
  check('Klik "Nyt spil" starter bane 1', await ev(() => skyhoj.game.state === 'playing' && skyhoj.game.levelIndex === 0));

  // 2. Hold W -> moves forward (-Z)
  const z0 = await ev(() => skyhoj.player.body.position.z);
  await page.keyboard.down('KeyW');
  await simWait(0.35);
  await page.keyboard.up('KeyW');
  const z1 = await ev(() => skyhoj.player.body.position.z);
  check('W flytter spilleren fremad', z1 < z0 - 0.5, `(z ${z0.toFixed(2)} -> ${z1.toFixed(2)})`);

  // 3. Space -> jump (y rises)
  await page.waitForFunction(() => skyhoj.player.grounded, null, { timeout: 60000, polling: 50 });
  await simWait(0.3);
  const y0 = await ev(() => skyhoj.player.body.position.y);
  await page.keyboard.down('Space');
  let maxY = y0;
  const tJ = await ev(() => skyhoj.level.time);
  while ((await ev(() => skyhoj.level.time)) < tJ + 0.6) { maxY = Math.max(maxY, await ev(() => skyhoj.player.body.position.y)); }
  await page.keyboard.up('Space');
  check('Mellemrum hopper', maxY > y0 + 0.8, `(maks. +${(maxY - y0).toFixed(2)} m)`);

  // 3b. No double jump: press space mid-air repeatedly, height must not exceed one jump
  await page.waitForFunction(() => skyhoj.player.grounded, null, { timeout: 60000, polling: 50 });
  await simWait(0.2);
  const yb = await ev(() => skyhoj.player.body.position.y);
  let peak = yb;
  await page.keyboard.down('Space');
  const tS = await ev(() => skyhoj.level.time);
  let k = 0;
  while ((await ev(() => skyhoj.level.time)) < tS + 0.85) {
    if (k++ % 2 === 0) { await page.keyboard.up('Space'); await page.keyboard.down('Space'); } // hamrer på mellemrum i luften
    peak = Math.max(peak, await ev(() => skyhoj.player.body.position.y));
  }
  await page.keyboard.up('Space');
  check('Ingen uendelige hop (kun fra jorden)', peak - yb > 0.3 && peak - yb < 2.6, `(top +${(peak - yb).toFixed(2)} m)`);

  // 4. Right-drag rotates the camera
  await h.wait(1200);
  const yawA = await ev(() => skyhoj.cam.yaw);
  await page.mouse.move(640, 360);
  await page.mouse.down({ button: 'right' });
  for (let i = 0; i < 10; i++) await page.mouse.move(640 + i * 25, 360);
  await page.mouse.up({ button: 'right' });
  const yawB = await ev(() => skyhoj.cam.yaw);
  check('Højreklik + træk drejer kameraet', Math.abs(yawB - yawA) > 0.1, `(yaw ${yawA.toFixed(2)} -> ${yawB.toFixed(2)})`);
  // Moving the mouse without right button must NOT rotate
  const yawC = await ev(() => skyhoj.cam.yaw);
  for (let i = 0; i < 6; i++) await page.mouse.move(400 + i * 30, 300);
  const yawD = await ev(() => skyhoj.cam.yaw);
  check('Musebevægelse uden højreklik drejer ikke', Math.abs(yawD - yawC) < 1e-6);

  // 5. Scroll wheel cycles owned abilities
  await ev(() => { skyhoj.abilities.owned.chalk = true; skyhoj.abilities.owned.rope = true; skyhoj.renderHotbar(); });
  const sel0 = await ev(() => skyhoj.abilities.selected);
  await page.mouse.move(640, 360);
  await page.mouse.wheel(0, 120);
  await h.wait(250);
  const sel1 = await ev(() => skyhoj.abilities.selected);
  await page.mouse.wheel(0, 120);
  await h.wait(250);
  const sel2 = await ev(() => skyhoj.abilities.selected);
  check('Scrollhjul skifter evne', sel0 !== sel1 && sel1 !== sel2, `(${sel0} -> ${sel1} -> ${sel2})`);
  const hotbarSel = await ev(() => document.querySelector('.slot.selected').dataset.slot);
  check('Hotbar viser valgt evne', hotbarSel === sel2, `(${hotbarSel})`);

  // 6. Left click uses chalk
  await page.keyboard.press('Digit2');
  await h.wait(150);
  await page.mouse.click(640, 360, { button: 'left' });
  await h.wait(200);
  const chalk = await ev(() => skyhoj.abilities.chalkActive);
  check('Venstreklik bruger kridt', chalk > 3.5, `(aktiv ${chalk.toFixed(2)} s)`);
  await page.waitForFunction(() => document.getElementById('hud-ability-name').textContent === 'Kridt', null, { timeout: 20000 }).catch(() => {});
  const hudName = await ev(() => document.getElementById('hud-ability-name').textContent);
  check('HUD viser valgt evne', hudName === 'Kridt', `(${hudName})`);

  // 7. Left click with rope at an anchor (first level that needs the rope)
  await ev(() => { skyhoj.startLevel(skyhoj.LEVELS.findIndex((d) => d.needsRope)); });
  await h.wait(500);
  await ev(() => {
    const S = skyhoj, L = S.level, a = L.anchors[0], from = L.platforms[a.def.after];
    const b = S.player.body;
    b.position.set(from.body.position.x, from.def.top + 0.45, from.body.position.z);
    b.velocity.set(0, 0, 0);
    const dx = a.pos.x - b.position.x, dz = a.pos.z - b.position.z;
    S.cam.yaw = Math.atan2(-dx, -dz); S.cam.pitch = 0.15;
    S.selectAbility('rope');
  });
  await page.waitForFunction(() => !!skyhoj.abilities.target, null, { timeout: 20000 }).catch(() => {});
  const hasTarget = await ev(() => !!skyhoj.abilities.target);
  check('Reb: krogpunkt foran låses som mål', hasTarget);
  await page.mouse.click(640, 360, { button: 'left' });
  await h.wait(150);
  check('Venstreklik skyder rebet', await ev(() => !!skyhoj.abilities.rope));
  await page.keyboard.press('Space');
  await h.wait(100);
  check('Mellemrum slipper rebet', await ev(() => !skyhoj.abilities.rope));

  // 7b. Double jump once bought: exactly one extra jump in the air (hold Space, second press near the apex)
  await ev(() => { skyhoj.startLevel(0); skyhoj.abilities.owned.double = true; });
  await h.wait(600);
  await page.waitForFunction(() => skyhoj.player.grounded, null, { timeout: 60000, polling: 50 });
  const yd = await ev(() => skyhoj.player.body.position.y);
  await page.keyboard.down('Space');
  await page.waitForFunction(() => skyhoj.player.body.velocity.y < 1 && !skyhoj.player.grounded, null, { timeout: 60000, polling: 20 });
  await page.keyboard.up('Space'); await page.keyboard.down('Space');
  let peakD = yd;
  const tD = await ev(() => skyhoj.level.time);
  while ((await ev(() => skyhoj.level.time)) < tD + 1.0) {
    peakD = Math.max(peakD, await ev(() => skyhoj.player.body.position.y));
    await page.keyboard.up('Space'); await page.keyboard.down('Space'); // hamrer: kun ét ekstra hop må virke
  }
  await page.keyboard.up('Space');
  check('Dobbelthop: præcis ét ekstra hop i luften', peakD - yd > 3.2 && peakD - yd < 5.5, `(top +${(peakD - yd).toFixed(2)} m)`);
  await ev(() => { skyhoj.abilities.owned.double = false; });

  // 7c. Hands: jump at a ledge that is too high – the hands catch it, W climbs up
  await ev(() => {
    skyhoj.playDef({ name: 'Greb', kit: 'sten', theme: 'day', reward: 0, segs: [
      { t: 'start', w: 10, d: 10 }, { g: 0.5, w: 6, d: 6, dy: 3.2 }, { t: 'finish', g: 3, w: 10, d: 10 }] });
    const S = skyhoj, L = S.level, wall = L.platforms[1], b = S.player.body;
    b.position.set(wall.body.position.x, L.platforms[0].def.top + 0.45, wall.body.position.z + wall.def.d / 2 + 2.2);
    b.velocity.set(0, 0, 0); S.cam.yaw = 0; S.cam.pitch = 0.2;
  });
  await simWait(0.3);
  await page.keyboard.down('KeyW');
  await simWait(0.15);
  await page.keyboard.down('Space');
  let grabbed = false;
  const tG = await ev(() => skyhoj.level.time);
  while ((await ev(() => skyhoj.level.time)) < tG + 3) {
    if (await ev(() => !!skyhoj.player.hang)) { grabbed = true; await page.keyboard.up('Space'); }
    if (grabbed && await ev(() => skyhoj.player.grounded && skyhoj.player.groundPlat === skyhoj.level.platforms[1])) break;
  }
  await page.keyboard.up('Space');
  await page.keyboard.up('KeyW');
  check('Hænderne griber en for høj kant', grabbed);
  check('W klatrer op over kanten', await ev(() => skyhoj.player.grounded && skyhoj.player.groundPlat === skyhoj.level.platforms[1]));

  // 8. Shop with B, close with Escape
  await ev(() => { skyhoj.startLevel(0); });
  await h.wait(400);
  await page.keyboard.press('KeyB');
  await h.wait(300);
  check('B åbner butikken', await ev(() => skyhoj.game.state === 'shop' && !document.getElementById('screen-shop').classList.contains('hidden')));
  // buy something with real click
  await ev(() => { skyhoj.game.coins = 500; skyhoj.abilities.owned.chalkbag = false; skyhoj.renderShop(); });
  await h.wait(100);
  const before = await ev(() => skyhoj.game.coins);
  await page.click('[data-buy="chalkbag"]');
  await h.wait(200);
  const after = await ev(() => skyhoj.game.coins);
  check('Køb i butikken trækker mønter og giver varen', after === before - 100 && await ev(() => skyhoj.abilities.owned.chalkbag), `(${before} -> ${after})`);
  await page.keyboard.press('Escape');
  await h.wait(300);
  check('Escape lukker butikken', await ev(() => skyhoj.game.state === 'playing'));

  // 9. Pause with P, resume by clicking
  await page.keyboard.press('KeyP');
  await h.wait(300);
  check('P pauser', await ev(() => skyhoj.game.state === 'paused'));
  const posP = await ev(() => skyhoj.player.body.position.y);
  await h.wait(500);
  check('Fysikken står stille i pause', Math.abs(posP - await ev(() => skyhoj.player.body.position.y)) < 1e-6);
  await page.click('#btn-resume');
  await h.wait(300);
  check('"Fortsæt" genoptager', await ev(() => skyhoj.game.state === 'playing'));

  // 10. Lava death -> reset
  await ev(() => { const b = skyhoj.player.body; b.position.set(b.position.x + 30, -45, b.position.z); b.velocity.set(0, -20, 0); });
  await page.waitForFunction(() => skyhoj.game.state === 'dead', null, { timeout: 30000 }).catch(() => {});
  check('Lava dræber spilleren', await ev(() => skyhoj.game.state === 'dead' || skyhoj.game.deaths > 0));
  await page.waitForFunction(() => skyhoj.game.state === 'playing', null, { timeout: 90000 }).catch(() => {});
  const back = await ev(() => { const s = skyhoj.level.spawn, b = skyhoj.player.body.position; return Math.hypot(s.x - b.x, s.z - b.z); });
  check('Banen nulstilles til start efter døden', back < 1.5, `(afstand til start ${back.toFixed(2)} m)`);

  // 10b. Checkpoint: after touching one, lava sends you back to it (not to the start)
  await ev(() => {
    skyhoj.playDef({ name: 'Kontrolpunkt', kit: 'sten', theme: 'day', reward: 0, segs: [
      { t: 'start', w: 10, d: 10 }, { g: 3, w: 6, d: 6 }, { g: 3, w: 6, d: 6, cp: true }, { t: 'finish', g: 3, w: 10, d: 10 }] });
    const S = skyhoj, cp = S.level.platforms[2], b = S.player.body;
    b.position.set(cp.body.position.x, cp.def.top + 1, cp.body.position.z); b.velocity.set(0, 0, 0);
  });
  await page.waitForFunction(() => skyhoj.level.checkpoint === skyhoj.level.platforms[2], null, { timeout: 20000 }).catch(() => {});
  check('Kontrolpunkt aktiveres', await ev(() => skyhoj.level.checkpoint === skyhoj.level.platforms[2]));
  await ev(() => { const b = skyhoj.player.body; b.position.set(b.position.x + 30, -45, b.position.z); b.velocity.set(0, -20, 0); });
  await page.waitForFunction(() => skyhoj.game.state === 'dead', null, { timeout: 30000 }).catch(() => {});
  await page.waitForFunction(() => skyhoj.game.state === 'playing', null, { timeout: 90000 }).catch(() => {});
  const cpDist = await ev(() => { const c = skyhoj.level.platforms[2].body.position, b = skyhoj.player.body.position; return Math.hypot(c.x - b.x, c.z - b.z); });
  check('Efter døden genstarter man ved kontrolpunktet', cpDist < 1, `(afstand ${cpDist.toFixed(2)} m)`);
  await ev(() => { skyhoj.startLevel(0); });
  await h.wait(400);

  // 11. Portal -> complete -> next level via click
  const coinsBefore = await ev(() => skyhoj.game.coins);
  await ev(() => { const c = skyhoj.level.portal.center; const b = skyhoj.player.body; b.position.set(c.x, skyhoj.level.portal.top + 0.5, c.z); b.velocity.set(0, 0, 0); });
  await page.waitForFunction(() => skyhoj.game.state === 'complete', null, { timeout: 60000 }).catch(() => {});
  check('Portalen fuldfører banen', await ev(() => skyhoj.game.state === 'complete'));
  const coinsAfter = await ev(() => skyhoj.game.coins);
  const reward1 = await ev(() => skyhoj.LEVELS[0].reward);
  check('Mønter udbetales for banen', coinsAfter - coinsBefore === reward1, `(+${coinsAfter - coinsBefore}, forventet ${reward1})`);
  const saved = await ev(() => JSON.parse(localStorage.getItem('skyhoj-parkour-v1')));
  check('Fremskridt gemmes', saved && saved.level === 1 && saved.coins === coinsAfter, JSON.stringify(saved && { level: saved.level, coins: saved.coins }));
  await page.click('#btn-next');
  await h.wait(800);
  check('"Næste bane" teleporterer til bane 2', await ev(() => skyhoj.game.state === 'playing' && skyhoj.game.levelIndex === 1));
  const bannerTxt = await ev(() => document.getElementById('level-banner-name').textContent);
  const name2 = await ev(() => skyhoj.LEVELS[1].name);
  check('Banebanner vises', bannerTxt === name2, `(${bannerTxt})`);

  // 11b. Skateboard level: W pushes the board
  const skateIdx = await ev(() => skyhoj.LEVELS.findIndex((d) => d.skate));
  if (skateIdx < 0) check('Skatebanen findes', false);
  else {
    await ev((i) => { skyhoj.startLevel(i); }, skateIdx);
    await h.wait(600);
    check('Skatebanen starter på skateboard', await ev(() => !!skyhoj.player.skate));
    await page.keyboard.down('KeyW');
    await simWait(1.2);
    const skSpeed = await ev(() => Math.hypot(skyhoj.player.body.velocity.x, skyhoj.player.body.velocity.z));
    await page.keyboard.up('KeyW');
    check('W sætter fart på skateboardet', skSpeed > 5, `(${skSpeed.toFixed(1)} m/s)`);
  }
  await ev(() => { skyhoj.startLevel(1); });
  await h.wait(400);

  // 12. Reload -> main menu offers "Fortsæt – bane 2"
  await page.reload();
  await page.waitForFunction(() => window.skyhoj && window.skyhoj.game.state === 'menu', null, { timeout: 60000 });
  const cont = await ev(() => { const b = document.getElementById('btn-continue'); return b.classList.contains('hidden') ? null : b.textContent; });
  check('Efter genindlæsning tilbydes "Fortsæt"', cont === 'Fortsæt – bane 2', `(${cont})`);
  await page.click('#btn-continue');
  await h.wait(600);
  check('"Fortsæt" starter bane 2 med gemte mønter', await ev(() => skyhoj.game.levelIndex === 1 && skyhoj.game.coins > 0));

  const errors = h.logs.filter((l) => l.startsWith('[pageerror]') || (l.startsWith('[error]') && !l.includes('Failed to load resource')));
  check('Ingen JavaScript-fejl i konsollen', errors.length === 0, errors.join(' | '));
  console.log(results.join('\n'));
  if (results.some((r) => r.startsWith('FAIL'))) throw new Error('End-to-end-test fejlede');
};
