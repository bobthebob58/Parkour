// Live check of a character module in real gameplay: CHAR_FILE=/abs/path.js OUT=/abs/dir node run.js char-live.js
const path = require('path'), fs = require('fs');
module.exports = async (page, h) => {
  await page.waitForFunction(() => window.skyhoj && window.skyhoj.game.state === 'menu', null, { timeout: 60000 });
  if (process.env.CHAR_FILE) await page.addScriptTag({ path: process.env.CHAR_FILE });
  const out = process.env.OUT || path.join(__dirname, '..', 'preview');
  fs.mkdirSync(out, { recursive: true });
  await page.evaluate(() => {
    const S = window.skyhoj;
    if (window.createCharacterModule) S.setCharacter(window.createCharacterModule(window.THREE));
    S.abilities.owned.chalk = S.abilities.owned.rope = S.abilities.owned.gloves = true;
    S.startLevel(0);
    document.getElementById('toasts').innerHTML = '';
  });
  await h.wait(4000);
  await page.evaluate(() => { window.skyhoj.input.keys.KeyW = true; });
  for (let i = 0; i < 4; i++) {
    await h.wait(3500);
    if (i === 1) await page.evaluate(() => window.skyhoj.onKeyPress('Space'));
    await page.screenshot({ path: path.join(out, `char-live-${i}.png`) });
  }
  await page.evaluate(() => { window.skyhoj.input.keys.KeyW = false; });
  const errs = h.logs.filter((l) => l.startsWith('[pageerror]') || (l.startsWith('[error]') && !l.includes('Failed to load resource')));
  console.log('ERRORS', errs.length ? errs.join('\n') : 'none');
};
