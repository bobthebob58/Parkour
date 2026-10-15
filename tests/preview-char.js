// Preview a character module: CHAR_FILE=/abs/path.js OUT=/abs/dir node run.js preview-char.js
// The file must define window.createCharacterModule = function (THREE) { return { build, animate }; }
const path = require('path'), fs = require('fs');
module.exports = async (page, h) => {
  await page.waitForFunction(() => window.skyhoj && window.skyhoj.game.state === 'menu', null, { timeout: 60000 });
  if (process.env.CHAR_FILE) await page.addScriptTag({ path: process.env.CHAR_FILE });
  const out = process.env.OUT || path.join(__dirname, '..', 'preview');
  fs.mkdirSync(out, { recursive: true });
  const sets = {
    'a-run': [ { mode: 'idle' }, { mode: 'run', speed: 9, runPhase: 0 }, { mode: 'run', speed: 9, runPhase: Math.PI / 2 }, { mode: 'run', speed: 9, runPhase: Math.PI }, { mode: 'run', speed: 9, runPhase: Math.PI * 1.5 } ],
    'b-air': [ { mode: 'air', vy: 8, grounded: false }, { mode: 'air', vy: -10, grounded: false }, { mode: 'air', vy: 4, grounded: false, flipT: 0.3 }, { mode: 'air', vy: 0, grounded: false, flipT: 0.65 }, { mode: 'idle', squash: 0.4 } ],
    'c-hands': [ { mode: 'hang', hangKind: 'ledge', yOffset: 0 }, { mode: 'hang', hangKind: 'ledge', shimmy: 1, time: 0.3 }, { mode: 'hang', hangKind: 'bar', shimmy: 1, time: 0.6 }, { mode: 'climb', climbT: 0.35 }, { mode: 'climb', climbT: 0.8 }, { mode: 'rope' } ],
    'd-skate': [ { mode: 'skate', speed: 0 }, { mode: 'skate', speed: 10, push: true, time: 0.1 }, { mode: 'skate', speed: 12, lean: 1 }, { mode: 'skate', speed: 12, crouch: 1, grounded: false }, { mode: 'grind', speed: 12 } ],
  };
  const ok = await page.evaluate(() => {
    const S = window.skyhoj;
    if (window.createCharacterModule) S.setCharacter(window.createCharacterModule(window.THREE));
    S.startLevel(0);
    S.debug.freeze = true;
    document.getElementById('hud').classList.add('hidden');
    return !!window.createCharacterModule;
  });
  console.log('custom character loaded:', ok);
  for (const [name, states] of Object.entries(sets)) {
    for (const view of ['side', 'front']) {
      await page.evaluate(({ states, view }) => {
        const S = window.skyhoj;
        S.lineup(states.map((s) => ({ ...s, facing: view === 'side' ? -Math.PI / 2 : 0 })), 1.7);
        const sp = S.level.spawn;
        // Referencer: en kant/stang der hvor hænderne skal holde (hænge-stillinger)
        const T = window.THREE;
        if (window.__marks) for (const m of window.__marks) S.scene.remove(m);
        window.__marks = [];
        window.__lineup.forEach((rig, i) => {
          const st = states[i];
          if (st.mode !== 'hang' && !(st.mode === 'climb' && st.climbT < 0.5)) return;
          const isBar = st.hangKind === 'bar';
          const geo = isBar ? new T.CylinderGeometry(0.06, 0.06, 1.2, 10).rotateZ(Math.PI / 2) : new T.BoxGeometry(1.2, 0.5, 0.6);
          const m = new T.Mesh(geo, new T.MeshStandardMaterial({ color: isBar ? '#9aa4b2' : '#8a7f72', roughness: 0.8 }));
          const local = new T.Vector3(0, 1.72 - (isBar ? 0 : 0.25), isBar ? 0 : -0.47 - 0.3).applyEuler(new T.Euler(0, rig.inner.rotation.y, 0));
          m.position.copy(rig.root.position).add(local);
          m.rotation.y = rig.inner.rotation.y;
          S.scene.add(m);
          window.__marks.push(m);
        });
        S.camTo(sp.x, sp.y + 0.9, sp.z + 8.2, sp.x, sp.y + 0.5, sp.z);
      }, { states, view });
      await h.wait(1600);
      const file = path.join(out, `char-${name}-${view}.png`);
      await page.screenshot({ path: file });
      console.log('saved', file);
    }
  }
  // close-up portrait
  await page.evaluate(() => { const S = window.skyhoj; S.lineup([{ mode: 'idle' }]); const sp = S.level.spawn; S.camTo(sp.x + 0.9, sp.y + 1.2, sp.z + 2.2, sp.x, sp.y + 0.8, sp.z); });
  await h.wait(1600);
  await page.screenshot({ path: path.join(out, 'char-z-closeup.png') });
  const errs = h.logs.filter((l) => l.startsWith('[pageerror]') || (l.startsWith('[error]') && !l.includes('Failed to load resource')));
  console.log('ERRORS', errs.length ? errs.join('\n') : 'none');
};
