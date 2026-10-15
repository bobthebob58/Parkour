#!/usr/bin/env node
// Laver artefakt-siden til claude.ai: index.html uden <!DOCTYPE>/<html>/<head>/<body> og uden
// charset/viewport (artefakt-tjenesten tilføjer selv det skelet). style.css og game.js
// publiceres som ekstra filer ved siden af siden.
//
//   node tools/artefakt.js [udfil]      (standard: /tmp/skyhoj-artefakt/index.html)
const fs = require('fs');
const path = require('path');

const ROD = path.resolve(__dirname, '..');
const ud = path.resolve(process.argv[2] || '/tmp/skyhoj-artefakt/index.html');
let h = fs.readFileSync(path.join(ROD, 'index.html'), 'utf8');
for (const re of [/<!DOCTYPE html>\s*/i, /<html[^>]*>\s*/i, /<head>\s*/i, /<\/head>\s*/i, /<body>\s*/i, /<\/body>\s*/i,
  /<\/html>\s*/i, /<meta charset="UTF-8">\s*/i, /<meta name="viewport"[^>]*>\s*/i]) h = h.replace(re, '');
fs.mkdirSync(path.dirname(ud), { recursive: true });
fs.writeFileSync(ud, h.trim() + '\n');
console.log(`Artefakt-side skrevet: ${ud}`);
console.log(`Publicér den med files = { "style.css": "${path.join(ROD, 'style.css')}", "game.js": "${path.join(ROD, 'game.js')}" }`);
