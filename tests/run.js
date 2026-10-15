// Testkører: åbner spillet via file:// i headless Chromium og afvikler et scenarie.
// Biblioteks-URL'erne fra CDN'en (jsDelivr) besvares med de lokale npm-kopier, så
// testene virker offline og altid kører mod præcis de samme versioner som spillet.
//
// Brug:  node run.js <scenarie.js>
// Miljøvariabler:
//   CHROME_PATH  sti til en Chromium (ellers bruges Playwrights egen)
//   W, H         vinduesstørrelse (standard 1280x720)
//   OUT_DIR      hvor skærmbilleder gemmes (standard ../docs/images)
//   LEVELS       f.eks. "1,5,10" – begræns bot/skærmbilleder til bestemte baner
//   TIMEOUT_MS   grænse for klik og andre handlinger (standard 120000)
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const GAME_DIR = path.resolve(__dirname, '..');
const OUT_DIR = process.env.OUT_DIR || path.join(GAME_DIR, 'docs/images');
const NM = path.join(__dirname, 'node_modules');
const CDN_MAP = [
  ['https://cdn.jsdelivr.net/npm/three@0.160.0/', path.join(NM, 'three/')],
  ['https://cdn.jsdelivr.net/npm/cannon-es@0.20.0/', path.join(NM, 'cannon-es/')],
];

async function main() {
  const scenario = require(path.resolve(process.argv[2]));
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || undefined,
    // WebGL via software-rendering, så testene også kører på maskiner uden GPU
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const width = +(process.env.W || 1280), height = +(process.env.H || 720);
  const page = await browser.newPage({ viewport: { width, height } });
  // Software-WebGL holder sidens hovedtråd optaget i lange stræk, og et klik venter på hovedtråden
  // (målt: 4 s pr. klik uden belastning, 12 s under belastning). Playwrights standard på 30 s er for
  // stram på en travl CI-maskine, så handlinger får samme rummelige grænse som testenes andre ventetider.
  page.setDefaultTimeout(+(process.env.TIMEOUT_MS || 120000));
  const logs = [];
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
  await page.route('https://**/*', async (route) => {
    const url = route.request().url();
    for (const [prefix, dir] of CDN_MAP) {
      if (url.startsWith(prefix)) {
        const file = path.join(dir, url.slice(prefix.length).split('?')[0]);
        if (fs.existsSync(file)) {
          return route.fulfill({
            status: 200,
            headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/javascript' },
            body: fs.readFileSync(file),
          });
        }
      }
    }
    return route.continue(); // f.eks. Google Fonts
  });
  const h = {
    shot: async (name) => {
      const out = path.join(OUT_DIR, name);
      fs.mkdirSync(path.dirname(out), { recursive: true });
      const jpeg = name.endsWith('.jpg');
      await page.screenshot({ path: out, type: jpeg ? 'jpeg' : 'png', quality: jpeg ? 85 : undefined });
      console.log('gemt', out);
    },
    wait: (ms) => page.waitForTimeout(ms),
    logs,
  };
  let failed = false;
  try {
    // ?debug giver testene adgang til udvikler-hooks (window.skyhoj)
    await page.goto('file://' + path.join(GAME_DIR, 'index.html') + '?debug');
    await scenario(page, h);
  } catch (e) {
    failed = true;
    console.log('SCENARIE-FEJL', e);
  } finally {
    const errors = logs.filter((l) => l.startsWith('[pageerror]'));
    if (errors.length) console.log('--- fejl i siden ---\n' + errors.join('\n'));
    await browser.close();
  }
  process.exitCode = failed ? 1 : 0;
}
main();
