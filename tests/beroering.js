// Touch-test (telefon og iPad): rigtige berøringer via Chromes touch-hændelser.
// Brug: TOUCH=telefon node run.js beroering.js   (eller TOUCH=ipad)
module.exports = async (page, h) => {
  const results = [];
  const start = Date.now();
  const check = (name, ok, extra = '') => {
    const line = `${ok ? 'OK  ' : 'FAIL'} ${name} ${extra}`;
    results.push(line);
    console.log(`${line} [${Math.round((Date.now() - start) / 1000)} s]`);
  };
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const simWait = async (secs) => { const t0 = await ev(() => skyhoj.level.time); await page.waitForFunction((t) => skyhoj.level.time >= t, t0 + secs, { timeout: 120000, polling: 50 }); };
  const vp = page.viewportSize();

  // Rå touch-hændelser (flere fingre ad gangen). `fingers` er alle fingre, der rører skærmen bagefter.
  const cdp = await page.context().newCDPSession(page);
  const fingers = new Map();
  const send = (type) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: [...fingers.entries()].map(([id, p]) => ({ id, x: p.x, y: p.y })) });
  const down = async (id, x, y) => { fingers.set(id, { x, y }); await send('touchStart'); };
  const move = async (id, x, y) => { fingers.set(id, { x, y }); await send('touchMove'); };
  const up = async (id) => { fingers.delete(id); await send('touchEnd'); };
  const center = async (sel) => ev((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height }; }, sel);
  const tap = async (sel) => { const c = await center(sel); await page.touchscreen.tap(c.x, c.y); };
  // Software-WebGL giver få billeder i sekundet, så en berøring ankommer et stykke simuleret tid for sent.
  // frozen() trykker, mens fysikken står stille, så tidspunktet i spillet bliver præcist.
  const frozen = async (fn) => { await ev(() => { skyhoj.debug.freeze = true; }); await fn(); await ev(() => { skyhoj.debug.freeze = false; }); };
  const freezeWhen = (pred) => page.waitForFunction(new Function(`const ok = (${pred})(); if (ok) skyhoj.debug.freeze = true; return ok;`), null, { timeout: 60000, polling: 20 });
  // Kontroller og vigtig HUD, der ikke må overlappe hinanden
  const CONTROLS = ['#hud-level', '#hud-ability', '#btn-touch-pause', '#hotbar', '#btn-touch-ability', '#btn-touch-jump', '#touch-stick', '#hud-dbl'];
  const overlaps = () => ev((sels) => {
    const R = sels.map((s) => [s, document.querySelector(s)]).filter(([, e]) => e && e.getBoundingClientRect().width > 0).map(([s, e]) => [s, e.getBoundingClientRect()]);
    const out = [];
    for (let i = 0; i < R.length; i++) for (let j = i + 1; j < R.length; j++) {
      const a = R[i][1], b = R[j][1];
      if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) out.push(`${R[i][0]} / ${R[j][0]}`);
    }
    for (const [sel, r] of R) if (r.left < 0 || r.top < 0 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1) out.push(`${sel} uden for skærmen`);
    return out;
  }, CONTROLS);
  const visible = (sel) => ev((s) => { const el = document.querySelector(s); if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; }, sel);

  await page.waitForFunction(() => window.skyhoj && window.skyhoj.game.state === 'menu', null, { timeout: 90000 });

  // 1. Touch-skærm genkendes, og menuen viser touch-styringen
  check('Touch-styring slås til på en touch-skærm', await ev(() => skyhoj.touch.active && document.body.classList.contains('touch')));
  check('Menuen viser touch-vejledning (ikke tastatur)', await visible('.controls-grid.touch-only') && !(await visible('.controls-grid.no-touch')));

  // 2. Tryk på "Nyt spil"
  await tap('#btn-new');
  await page.waitForFunction(() => skyhoj.game.state === 'playing', null, { timeout: 60000 }).catch(() => {});
  check('Tryk på "Nyt spil" starter bane 1', await ev(() => skyhoj.game.state === 'playing' && skyhoj.game.levelIndex === 0));
  check('Knapper og joystick vises', await visible('#btn-touch-jump') && await visible('#btn-touch-ability') && await visible('#btn-touch-pause') && await visible('#touch-stick'));
  check('Tastaturhjælpen er skjult', !(await visible('#help-hint')));
  check('Opløsningen er begrænset på touch', await ev(() => skyhoj.renderer.getPixelRatio() <= 1.5), `(pixelRatio ${await ev(() => skyhoj.renderer.getPixelRatio())})`);
  await page.waitForFunction(() => skyhoj.player.grounded, null, { timeout: 60000, polling: 50 });

  // 3. Joysticket: fuldt udslag frem løber, lille udslag går langsomt
  const sx = vp.width * 0.15, sy = vp.height * 0.7;
  const speedWith = async (dy) => {
    await ev(() => skyhoj.restartLevel(false));
    await page.waitForFunction(() => skyhoj.player.grounded, null, { timeout: 60000, polling: 50 });
    await frozen(async () => { await down(1, sx, sy); await move(1, sx, sy + dy); });
    await simWait(0.6);
    const v = await ev(() => { const b = skyhoj.player.body; return { s: Math.hypot(b.velocity.x, b.velocity.z), z: b.position.z, st: { ...skyhoj.input.stick } }; });
    await up(1);
    await simWait(0.4);
    return v;
  };
  const z0 = await ev(() => { skyhoj.restartLevel(false); return skyhoj.player.body.position.z; });
  const full = await speedWith(-60);
  check('Joysticket frem flytter spilleren fremad', full.z < z0 - 1, `(z ${z0.toFixed(2)} -> ${full.z.toFixed(2)})`);
  check('Fuldt udslag løber (ca. 9 m/s)', full.s > 7.5, `(${full.s.toFixed(1)} m/s, stick y ${full.st.y.toFixed(2)})`);
  const half = await speedWith(-24);
  check('Lille udslag går langsommere (analogt)', half.s > 0.5 && half.s < full.s * 0.7, `(${half.s.toFixed(1)} m/s)`);
  check('Slip joysticket: ingen bevægelse og ingen hængende taster', await ev(() => !skyhoj.input.stick.active && !skyhoj.input.keys.KeyW && !skyhoj.input.keys.KeyS));
  const ov1 = await overlaps();
  check('Ingen kontroller overlapper (liggende)', ov1.length === 0, ov1.join(', '));

  // 3b. En tommelfinger tæt ved kanten giver ikke udslag af sig selv (fx "tilbage" = slip en stang)
  await frozen(() => down(1, sx, vp.height - 12));
  const edge = await ev(() => ({ y: skyhoj.input.stick.y, s: skyhoj.input.keys.KeyS }));
  await frozen(() => up(1));
  check('Tryk tæt ved kanten giver intet udslag', Math.abs(edge.y) < 0.01 && !edge.s, `(y ${edge.y.toFixed(2)})`);

  // 3c. Holder man joysticket, mens man dør i lavaen, virker det igen efter genstarten
  await ev(() => skyhoj.restartLevel(false));
  await page.waitForFunction(() => skyhoj.player.grounded, null, { timeout: 60000, polling: 50 });
  await frozen(async () => { await down(1, sx, sy); await move(1, sx, sy - 60); });
  await ev(() => skyhoj.die());
  await page.waitForFunction(() => skyhoj.game.state === 'playing', null, { timeout: 60000, polling: 50 });
  await page.waitForFunction(() => skyhoj.player.grounded, null, { timeout: 60000, polling: 50 });
  await move(1, sx, sy - 62);
  await simWait(0.5);
  const afterDeath = await ev(() => { const v = skyhoj.player.body.velocity; return Math.hypot(v.x, v.z); });
  await frozen(() => up(1));
  await ev(() => skyhoj.restartLevel(false)); // tilbage til start (han er løbet et stykke)
  check('Joysticket virker efter døden uden at løfte tommelfingeren', afterDeath > 5, `(${afterDeath.toFixed(1)} m/s)`);

  // 4. HOP: kort tryk hopper; holdt nede hopper højere
  const jumpHeight = async (holdSecs) => {
    await page.waitForFunction(() => skyhoj.player.grounded, null, { timeout: 60000, polling: 50 });
    await simWait(0.2);
    const y0 = await ev(() => skyhoj.player.body.position.y);
    const c = await center('#btn-touch-jump');
    // Et kort tryk: ned og op, mens fysikken står stille; ellers hold knappen i holdSecs
    await frozen(async () => { await down(5, c.x, c.y); if (holdSecs === 0) await up(5); });
    let maxY = y0, released = holdSecs === 0;
    const t0 = await ev(() => skyhoj.level.time);
    while (true) {
      const s = await ev(() => ({ t: skyhoj.level.time, y: skyhoj.player.body.position.y }));
      maxY = Math.max(maxY, s.y);
      if (!released && s.t >= t0 + holdSecs) { await up(5); released = true; }
      if (s.t >= t0 + 0.9) break;
    }
    if (!released) await up(5);
    return maxY - y0;
  };
  const hTap = await jumpHeight(0);
  check('Tryk på HOP hopper', hTap > 0.5, `(+${hTap.toFixed(2)} m)`);
  const hHold = await jumpHeight(0.5);
  check('HOP holdt nede hopper højere', hHold > 1.8 && hHold > hTap + 0.3, `(+${hHold.toFixed(2)} m mod +${hTap.toFixed(2)} m)`);

  // 5. Dobbelthop: andet tryk i luften
  await ev(() => { skyhoj.abilities.owned.double = true; });
  await page.waitForFunction(() => skyhoj.player.grounded, null, { timeout: 60000, polling: 50 });
  await simWait(0.2);
  const yd = await ev(() => skyhoj.player.body.position.y);
  const cj = await center('#btn-touch-jump');
  await frozen(() => down(5, cj.x, cj.y));
  await freezeWhen('() => skyhoj.player.body.velocity.y < 1 && !skyhoj.player.grounded');  // toppen af hoppet
  await up(5); await down(5, cj.x, cj.y);
  await ev(() => { skyhoj.debug.freeze = false; });
  let peak = yd;
  const td = await ev(() => skyhoj.level.time);
  while ((await ev(() => skyhoj.level.time)) < td + 0.8) peak = Math.max(peak, await ev(() => skyhoj.player.body.position.y));
  await up(5);
  check('Dobbelthop med andet tryk på HOP', peak - yd > 3.2, `(top +${(peak - yd).toFixed(2)} m)`);
  await ev(() => { skyhoj.abilities.owned.double = false; });

  // 6. Kameraet: træk i højre side drejer; samtidig joystick (to fingre)
  const yaw0 = await ev(() => skyhoj.cam.yaw), pitch0 = await ev(() => skyhoj.cam.pitch);
  const lx = vp.width * 0.65, ly = vp.height * 0.45;
  await down(2, lx, ly);
  for (let i = 1; i <= 5; i++) await move(2, lx + i * 30, ly + i * 8);
  const yaw1 = await ev(() => skyhoj.cam.yaw), pitch1 = await ev(() => skyhoj.cam.pitch);
  check('Træk i højre side drejer kameraet', Math.abs(yaw1 - yaw0) > 0.3 && pitch1 > pitch0, `(yaw ${(yaw1 - yaw0).toFixed(2)}, pitch ${(pitch1 - pitch0).toFixed(2)})`);
  await down(1, sx, sy);
  await move(1, sx, sy - 60);
  await move(2, lx + 250, ly + 40);
  const both = await ev(() => ({ stick: skyhoj.input.stick.active && skyhoj.input.stick.y < -0.5, yaw: skyhoj.cam.yaw }));
  check('Joystick og kamera virker samtidig (to fingre)', both.stick && Math.abs(both.yaw - yaw1) > 0.05);
  await up(2); await up(1);
  check('Fingrene slipper: kamera og joystick frigives', await ev(() => !skyhoj.input.touchLook && !skyhoj.input.stick.active));

  // 7. Evner: tryk på ikonet i hotbaren, så på EVNE-knappen
  await ev(() => { skyhoj.abilities.owned.chalk = true; skyhoj.renderHotbar(); });
  await tap('#hotbar [data-slot="chalk"]');
  check('Tryk på et ikon vælger evnen', await ev(() => skyhoj.abilities.selected === 'chalk'));
  await tap('#btn-touch-ability');
  check('EVNE-knappen bruger evnen (kridt)', await ev(() => skyhoj.abilities.chalkActive > 0));
  // Et tryk på selve skærmen må ikke bruge evnen (browserens "falske" museklik)
  await ev(() => { skyhoj.abilities.chalkActive = 0; skyhoj.abilities.chalkCooldown = 0; });
  await page.touchscreen.tap(vp.width * 0.6, vp.height * 0.4);
  await h.wait(300);
  check('Tryk på skærmen bruger ikke evnen ved en fejl', await ev(() => skyhoj.abilities.chalkActive === 0));
  await ev(() => { skyhoj.abilities.owned.chalk = false; skyhoj.selectAbility('none'); });

  // 8. Hænderne: hop mod en for høj kant, joysticket frem klatrer op
  await ev(() => {
    skyhoj.playDef({ name: 'Greb', kit: 'sten', theme: 'day', reward: 0, segs: [
      { t: 'start', w: 10, d: 10 }, { g: 0.5, w: 6, d: 6, dy: 3.2 }, { t: 'finish', g: 3, w: 10, d: 10 }] });
    const S = skyhoj, L = S.level, wall = L.platforms[1], b = S.player.body;
    b.position.set(wall.body.position.x, L.platforms[0].def.top + 0.45, wall.body.position.z + wall.def.d / 2 + 2.2);
    b.velocity.set(0, 0, 0); S.cam.yaw = 0; S.cam.pitch = 0.2;
  });
  await simWait(0.3);
  await frozen(async () => { await down(1, sx, sy); await move(1, sx, sy - 60); });
  await simWait(0.15);
  await frozen(() => down(5, cj.x, cj.y));
  // En vagt i siden noterer hvert billede, om han har grebet og stået oppe på kanten. Testen kigger kun
  // sjældent (langsom software-WebGL), og med joysticket frem løber han videre ud over platformen bagefter.
  await ev(() => {
    const S = skyhoj, g = window.__greb = { grabbed: false, climbed: false, log: [] };
    const f = () => {
      const P = S.player;
      if (P.hang) g.grabbed = true;
      if (g.grabbed && P.grounded && P.groundPlat === S.level.platforms[1]) g.climbed = true;
      // Spor til fejlsøgning: hvad sker der, mens han hænger?
      if (P.hang && g.log.length < 40) {
        const h = P.hang, st = S.input.stick, k = S.input.keys;
        g.log.push(`t${S.level.time.toFixed(2)} ${h.kind} age${(h.age || 0).toFixed(2)} climb${h.climb ? h.climb.t.toFixed(2) : '-'} grip${P.grip.toFixed(2)} stick${st.active ? st.y.toFixed(2) : 'off'} W${k.KeyW ? 1 : 0} yaw${S.cam.yaw.toFixed(2)} ${S.game.state}`);
      }
      if (!g.climbed) requestAnimationFrame(f);
    };
    requestAnimationFrame(f);
  });
  let grabbed = false, climbed = false;
  const tg = await ev(() => skyhoj.level.time);
  while ((await ev(() => skyhoj.level.time)) < tg + 3) {
    const g = await ev(() => window.__greb);
    if (g.grabbed && !grabbed) { grabbed = true; await up(5); }
    if (g.climbed) { climbed = true; break; }
  }
  if (fingers.has(5)) await up(5);
  await up(1);
  check('Hænderne griber kanten', grabbed);
  const greb = await ev(() => { const P = skyhoj.player; return { log: window.__greb.log.slice(-8).join(' | '), pos: [P.body.position.x, P.body.position.y, P.body.position.z].map((v) => v.toFixed(1)).join(','), plat: skyhoj.level.platforms.indexOf(P.groundPlat), state: skyhoj.game.state }; });
  check('Joysticket frem klatrer op over kanten', climbed, climbed ? '' : `(${greb.state}, pos ${greb.pos}, plat ${greb.plat}; ${greb.log})`);

  // 9. Skateboardbanen: joysticket giver fart og styrer trinløst
  const skateIdx = await ev(() => skyhoj.LEVELS.findIndex((d) => d.skate));
  await ev((i) => { skyhoj.startLevel(i); }, skateIdx);
  await h.wait(600);
  await page.waitForFunction(() => skyhoj.player.grounded, null, { timeout: 60000, polling: 50 });
  check('EVNE-knappen er skjult på skateboardet', !(await visible('#btn-touch-ability')));
  await down(1, sx, sy);
  await move(1, sx + 30, sy - 60);
  const h0 = await ev(() => skyhoj.player.skate.heading);
  await simWait(1.0);
  const sk = await ev(() => { const v = skyhoj.player.body.velocity; return { s: Math.hypot(v.x, v.z), h: skyhoj.player.skate.heading }; });
  await up(1);
  check('Joysticket frem sætter fart på skateboardet', sk.s > 5, `(${sk.s.toFixed(1)} m/s)`);
  check('Joysticket til siden styrer skateboardet', Math.abs(sk.h - h0) > 0.05, `(kurs ${(sk.h - h0).toFixed(2)} rad)`);

  // 10. Pause-knappen og menuerne med fingrene
  await tap('#btn-touch-pause');
  check('Pause-knappen pauser spillet', await ev(() => skyhoj.game.state === 'paused'));
  await tap('#btn-resume');
  check('Tryk på "Fortsæt" genoptager', await ev(() => skyhoj.game.state === 'playing'));

  // 11. Tekster: ingen tastatur- eller musetaster i tips og beskeder på touch
  const bad = await ev(() => {
    const re = /venstreklik|højreklik|mellemrum|WASD|scroll|A\/D|\(B\)|(^|[\s(·!.–-])[WS]([\s:).,!]|$)/i;
    const texts = [];
    for (const d of skyhoj.LEVELS) for (const s of d.segs) if (s.hint) texts.push(s.hint);
    for (const v of Object.values(skyhoj.T)) if (typeof v === 'string') texts.push(v);
    return texts.map((t) => skyhoj.forTouch(t)).filter((t) => re.test(t));
  });
  check('Alle tips og beskeder er skrevet om til touch', bad.length === 0, bad.slice(0, 3).join(' | '));

  // 12. Telefon på højkant: forslag om at dreje skærmen, som kan springes over
  if (vp.width < 900) {
    await page.setViewportSize({ width: vp.height, height: vp.width });
    await h.wait(400);
    check('Højkant: "Drej skærmen" vises', await visible('#rotate-hint'));
    await page.waitForFunction(() => skyhoj.game.state === 'paused', null, { timeout: 20000, polling: 50 }).catch(() => {});
    check('Drejes telefonen midt i en bane, sættes spillet på pause', await ev(() => skyhoj.game.state === 'paused'));
    await tap('#btn-rotate-ok');
    check('"Spil alligevel" skjuler forslaget', !(await visible('#rotate-hint')));
    await tap('#btn-resume');
    await h.wait(300);
    const ov2 = await overlaps();
    check('Ingen kontroller overlapper (højkant)', ov2.length === 0, ov2.join(', '));
    await page.setViewportSize(vp);
  }

  const errors = h.logs.filter((l) => l.startsWith('[pageerror]') || (l.startsWith('[error]') && !l.includes('Failed to load resource')));
  check('Ingen JavaScript-fejl i konsollen', errors.length === 0, errors.join(' | '));
  console.log(`${results.filter((r) => r.startsWith('OK')).length}/${results.length} kontroller OK`);
  if (results.some((r) => r.startsWith('FAIL'))) throw new Error('Touch-test fejlede');
};
