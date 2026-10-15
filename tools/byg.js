#!/usr/bin/env node
// Bygger game.js ud fra kildefilerne i src/.  Ret ALDRIG i game.js direkte – ret i src/ og kør:
//
//   node tools/byg.js           skriver game.js
//   node tools/byg.js --tjek    ændrer intet; fejler, hvis game.js ikke svarer til src/ (bruges af CI)
//
// src/motor/*.js    motoren, ét afsnit pr. fil (stykker af én stor funktion – ikke selvstændige moduler)
// src/baner/L*.json banerne som data; samles til `const LEVELS = [...]` efter src/motor/04-baner.js
// src/verdener/*.js _lib.js + ét verdenssæt pr. bane; indsættes efter src/motor/09b-verdenssaet.js
// src/figur/figur.js løberen (window.createCharacterModule); indsættes midt i afsnit 11
//
// Verdenssættene kommer i den rækkefølge, banerne bruger dem (ubrugte sæt til sidst, alfabetisk).
// Nye baner (src/baner/L16.json …) og nye sæt (src/verdener/<id>.js) kommer automatisk med.
const fs = require('fs');
const path = require('path');

const ROD = path.resolve(__dirname, '..');
const SRC = path.join(ROD, 'src');
const UD = path.join(ROD, 'game.js');
const laes = (...p) => fs.readFileSync(path.join(SRC, ...p), 'utf8');

const VERDENER_START = '/* ===== VERDENSSÆT START (genereret – se dokumentationen) ===== */';
const VERDENER_SLUT = '/* ===== VERDENSSÆT SLUT ===== */';
const FIGUR_START = '/* ===== FIGUR START ===== */';
const FIGUR_SLUT = '/* ===== FIGUR SLUT ===== */';
const STREG = '// ----------------------------------------------------------------';

// Kompakt, læsbar JS-værdi (nøgler uden anførselstegn, hvor det er muligt)
function jsVaerdi(v) {
  if (Array.isArray(v)) return '[' + v.map(jsVaerdi).join(', ') + ']';
  if (v !== null && typeof v === 'object') {
    const dele = Object.entries(v).map(([k, x]) => `${/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(k) ? k : JSON.stringify(k)}: ${jsVaerdi(x)}`);
    return dele.length ? '{ ' + dele.join(', ') + ' }' : '{}';
  }
  if (typeof v === 'string') return "'" + v.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
  return JSON.stringify(v); // tal, true/false, null
}

// Én bane som JS. Segmenternes "look" er kun designnoter og kommer ikke med i spillet.
function baneJs(i, bane) {
  const linjer = [`  // ------------------------------------------------------------------ ${i + 1}`, '  {'];
  for (const [k, x] of Object.entries(bane)) if (k !== 'segs' && k !== 'notes') linjer.push(`    ${k}: ${jsVaerdi(x)},`);
  linjer.push('    segs: [');
  for (const seg of bane.segs) {
    const { look, ...rest } = seg;
    linjer.push(`      ${jsVaerdi(rest)},`);
  }
  linjer.push('    ],', '  },');
  return linjer.join('\n');
}

function byg() {
  const banefiler = fs.readdirSync(path.join(SRC, 'baner')).filter((f) => /^L\d+\.json$/.test(f)).sort();
  const baner = banefiler.map((f) => JSON.parse(laes('baner', f)));
  const banerJs = 'const LEVELS = [\n' + baner.map((b, i) => baneJs(i, b)).join('\n') + '\n];\n\n';

  const alleSaet = fs.readdirSync(path.join(SRC, 'verdener')).filter((f) => f.endsWith('.js') && f !== '_lib.js').map((f) => f.slice(0, -3));
  const brugte = [...new Set(baner.map((b) => b.kit).filter((k) => alleSaet.includes(k)))];
  const raekkefoelge = brugte.concat(alleSaet.filter((k) => !brugte.includes(k)).sort());
  const verdenerJs = [
    VERDENER_START,
    '/* =====================================================================\n   9c. VERDENERNE – ét verdenssæt (og ét himmeltema) pr. bane\n   ===================================================================== */',
    `${STREG} fælles værktøjskasse\n${laes('verdener', '_lib.js').trim()}`,
    ...raekkefoelge.map((k) => `${STREG} ${k}\n${laes('verdener', k + '.js').trim()}`),
    VERDENER_SLUT,
  ].join('\n\n') + '\n\n';

  const figur = laes('figur', 'figur.js').trim()
    .replace(/window\.createCharacterModule\s*=\s*function\s*\(THREE\)/, 'function createCharacterModule(THREE)')
    .replace(/\};\s*$/, '}');
  const figurJs = `${FIGUR_START}\n${figur}\n\nlet CHARACTER = createCharacterModule(THREE);\n${FIGUR_SLUT}\n\n`;

  const motor = (f) => laes('motor', f);
  return [
    motor('00-start.js'), motor('01-konfiguration.js'), motor('02-tekster.js'), motor('03-temaer.js'),
    motor('04-baner.js'), banerJs,
    motor('05-hjaelpefunktioner.js'), motor('06-teksturer.js'), motor('07-scene.js'), motor('08-fysik.js'),
    motor('09-banebygger.js'), motor('09b-verdenssaet.js'), verdenerJs,
    motor('10-baneobjekter.js'), motor('11a-spilleren.js'), figurJs, motor('11b-spilleren.js'),
    motor('12-input.js'), motor('13-kamera.js'), motor('14-evner.js'), motor('15-lyd.js'),
    motor('16-brugerflade.js'), motor('17-gem.js'), motor('18-spiltilstand.js'),
  ].join('');
}

const ny = byg();
if (process.argv.includes('--tjek')) {
  const gammel = fs.existsSync(UD) ? fs.readFileSync(UD, 'utf8') : '';
  if (gammel !== ny) {
    console.error('game.js svarer ikke til src/. Kør "node tools/byg.js" og commit game.js.');
    process.exit(1);
  }
  console.log('game.js er bygget fra src/ og opdateret.');
} else {
  fs.writeFileSync(UD, ny);
  console.log(`game.js bygget: ${ny.split('\n').length - 1} linjer, ${Math.round(ny.length / 1024)} KB`);
}
