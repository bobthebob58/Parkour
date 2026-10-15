/* =====================================================================
   VERDENSSÆT 'clockwork' – Tandhjulsfabrikken (bane 7)
   En kæmpe svævende urværksfabrik i sepiafarvet smog: nittede messing- og
   kobberplader, sorte jernbjælker, tandhjul som drejeskiver, stempler,
   transportbånd med kædetræk, rustne riste, kranarme og dampventiler.
   Bagved tårner et uhret op med blottede tandhjul og en lysende skive.
   ===================================================================== */
(function () {
  'use strict';

  // Sepia-smog: brun top, ravgul horisont, bleg appelsinsol bag røgen, tæt tåge
  window.SKYHOJ_THEMES.clockwork = {
    top: '#6b5a45', horizon: '#c9944f', bottom: '#8f6a3e', sunElev: 14, sunAz: -35, sunColor: '#ffbf80', sunInt: 2.5,
    hemiSky: '#ecd2a6', hemiInt: 1.05, fog: '#a98258', fogNear: 34, fogFar: 430, cloud: '#b08a5e', clouds: 0.9, stars: 0,
    stone: '#b89a6e', exposure: 1.14, lavaGlow: 1.25,
  };

  window.SKYHOJ_KITS.clockwork = {
    id: 'clockwork',
    name: 'Tandhjulsfabrikken',
    variants: {
      plate: 'Nittet messingplade (standard for p/start). Kasse w 2-8, d 2-12, cyl w 3-8. Stålfod og rør under',
      girder: 'Sort jernbjælke med gult/sort sikkerhedsbort. Lange kasser: w 1.5-3, d 5-14',
      crate: 'Trækasse med jernbånd (cyl = tønde med jernringe). Kasse w 2.5-5, d 2.5-5, cyl w 2.5-4',
      boiler: 'Kobberkedel med nittebånd og dæksel, på ben. cyl w 3-8 (kasse w 3-6 også fint)',
      furnace: 'Ovn: sort jern med glødende sprækker og ovnmund på siden. Kasse eller cyl w 3-8',
      catwalk: 'Jerngangbro i ternet tråd-plade, lyse kanter. Kasse w 1.5-3, d 4-14',
      gear: 'Fast tandhjul (drejer ikke) med tænder og eger. KUN shape:"cyl" w 4-10',
      piston: 'Messing-stempelhoved på krom-stempelstang og bælg. Kasse eller cyl w 2.5-6 (også standard for lodret mv)',
    },
    barVariants: {
      pipe: 'Kobber-dampør med messingkoblinger og flanger (standard for stænger)',
      rod: 'Sort jernstang med messingmuffer',
      hook: 'Kranåg med opadbøjede kroge og sjækler (standard for trapez)',
    },
    create(ctx) {
      const { THREE } = ctx;
      const PI = Math.PI, TAU = PI * 2, clamp = ctx.clamp;
      const tr = (o) => ctx.track(o);
      const V3 = THREE.Vector3;
      const anim = { gears: [], belts: [], uniforms: [], spin: [], hands: [], cogs: [], flick: [], needles: [] };

      /* ---------- Teksturer (tegnes først, når de bruges) ---------- */
      const texCache = {};
      const canvasTex = (key, S, paint) => {
        if (texCache[key]) return texCache[key];
        const c = ctx.makeCanvas(S), g = c.getContext('2d');
        paint(g, S, ctx.mulberry32(key.length * 131 + S));
        return (texCache[key] = tr(ctx.toTexture(c)));
      };
      // Lysmodulation med sømløs støj
      const grain = (g, S, amt, cells, seed) => {
        const img = g.getImageData(0, 0, S, S), d = img.data, n = ctx.tileNoise(S, cells, 4, ctx.mulberry32(seed));
        for (let i = 0; i < S * S; i++) {
          const k = 1 + (n[i] - 0.5) * 2 * amt;
          d[i * 4] *= k; d[i * 4 + 1] *= k; d[i * 4 + 2] *= k;
        }
        g.putImageData(img, 0, 0);
      };
      const rivet = (g, x, y, rad) => {
        g.fillStyle = 'rgba(0,0,0,0.4)'; g.beginPath(); g.arc(x + 1.2, y + 1.6, rad, 0, TAU); g.fill();
        const gr = g.createRadialGradient(x - rad * 0.35, y - rad * 0.4, rad * 0.1, x, y, rad);
        gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.55, '#b9b2a4'); gr.addColorStop(1, '#6e6659');
        g.fillStyle = gr; g.beginPath(); g.arc(x, y, rad, 0, TAU); g.fill();
      };
      const blot = (g, x, y, rad, col) => {
        const gr = g.createRadialGradient(x, y, 0, x, y, rad);
        gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      };
      // Nittede plader (neutral lys: farves af materialet) – 2×2 plader på 4 m
      const paintPlate = (g, S, r) => {
        const P = S / 2;
        for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
          const x0 = i * P, y0 = j * P, k = 0.86 + r() * 0.16;
          g.fillStyle = `rgb(${232 * k | 0},${222 * k | 0},${204 * k | 0})`; g.fillRect(x0, y0, P, P);
          for (let n = 0; n < 70; n++) {
            g.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)';
            g.fillRect(x0, y0 + r() * P, P, 1 + r() * 1.5);
          }
          g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(x0 + 4, y0 + 4, P - 8, 3); g.fillRect(x0 + 4, y0 + 4, 3, P - 8);
          g.fillStyle = 'rgba(40,25,10,0.45)'; g.fillRect(x0 + 4, y0 + P - 7, P - 8, 3); g.fillRect(x0 + P - 7, y0 + 4, 3, P - 8);
          for (let n = 0; n < 8; n++) {
            const t = 24 + n * ((P - 48) / 7);
            rivet(g, x0 + t, y0 + 17, 4.2); rivet(g, x0 + t, y0 + P - 17, 4.2);
            if (n > 0 && n < 7) { rivet(g, x0 + 17, y0 + t, 4.2); rivet(g, x0 + P - 17, y0 + t, 4.2); }
          }
        }
        g.fillStyle = '#2a1d12';
        for (const o of [0, P]) { g.fillRect(o - 2, 0, 4, S); g.fillRect(0, o - 2, S, 4); }
        g.fillRect(S - 2, 0, 2, S); g.fillRect(0, S - 2, S, 2);
        for (let n = 0; n < 12; n++) blot(g, r() * S, r() * S, 30 + r() * 60, 'rgba(60,35,12,0.30)');
        for (let n = 0; n < 9; n++) { // rustnedløb
          const x = r() * S, y = r() * S * 0.5, gr = g.createLinearGradient(0, y, 0, y + 150);
          gr.addColorStop(0, 'rgba(110,60,25,0.32)'); gr.addColorStop(1, 'rgba(110,60,25,0)');
          g.fillStyle = gr; g.fillRect(x, y, 3 + r() * 5, 150);
        }
        g.strokeStyle = 'rgba(255,255,255,0.22)'; g.lineWidth = 1;
        for (let n = 0; n < 36; n++) { const x = r() * S, y = r() * S, a = r() * PI; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * 26, y + Math.sin(a) * 26); g.stroke(); }
        grain(g, S, 0.14, 6, 5);
      };
      // Én nittet sidepanel (S px = platformens tykkelse)
      const paintPanel = (g, S, r) => {
        g.fillStyle = '#d8cfbd'; g.fillRect(0, 0, S, S);
        for (let n = 0; n < 40; n++) { g.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)'; g.fillRect(0, r() * S, S, 1 + r()); }
        g.fillStyle = 'rgba(255,255,255,0.55)'; g.fillRect(0, 0, S, 7);
        g.fillStyle = 'rgba(40,25,10,0.5)'; g.fillRect(0, S - 9, S, 9);
        g.fillStyle = '#2a1d12'; g.fillRect(0, 0, 3, S); g.fillRect(S - 3, 0, 3, S);
        g.fillStyle = 'rgba(40,25,10,0.35)'; g.fillRect(0, S * 0.5 - 2, S, 3);
        for (let n = 0; n < 4; n++) { const x = 24 + n * ((S - 48) / 3); rivet(g, x, 24, 5); rivet(g, x, S - 26, 5); rivet(g, x, S * 0.5 + 22, 4); }
        for (let n = 0; n < 6; n++) blot(g, r() * S, r() * S, 30 + r() * 40, 'rgba(70,40,15,0.3)');
        grain(g, S, 0.12, 4, 9);
      };
      // Ternet jernplade (1 m)
      const paintTread = (g, S, r) => {
        g.fillStyle = '#8a8680'; g.fillRect(0, 0, S, S);
        const st = S / 8;
        for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) {
          const cx = i * st + st / 2, cy = j * st + st / 2, a = (i + j) % 2 ? PI / 4 : -PI / 4;
          g.save(); g.translate(cx, cy); g.rotate(a);
          g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(-st * 0.4 + 1.5, -st * 0.1 + 2, st * 0.8, st * 0.2);
          g.fillStyle = '#d9d4c8'; g.fillRect(-st * 0.4, -st * 0.1, st * 0.8, st * 0.2);
          g.fillStyle = 'rgba(255,255,255,0.6)'; g.fillRect(-st * 0.4, -st * 0.1, st * 0.8, 2);
          g.restore();
        }
        for (let n = 0; n < 6; n++) blot(g, r() * S, r() * S, 40 + r() * 40, 'rgba(30,20,10,0.35)');
        grain(g, S, 0.18, 5, 3);
      };
      // Rusten rist med revner og rødglødende sprækker
      const paintGrate = (g, S, r) => {
        g.fillStyle = '#120d0a'; g.fillRect(0, 0, S, S);
        const pitch = S / 12;
        for (let j = 0; j < 12; j++) for (let i = 0; i < 12; i++) {
          if (r() < 0.07) continue; // rustet hul
          const k = 0.7 + r() * 0.5;
          g.fillStyle = `rgb(${150 * k | 0},${78 * k | 0},${38 * k | 0})`;
          g.fillRect(i * pitch, j * pitch + 3, pitch, 7); g.fillRect(i * pitch + 3, j * pitch, 7, pitch);
          g.fillStyle = 'rgba(255,190,120,0.35)'; g.fillRect(i * pitch, j * pitch + 3, pitch, 2);
        }
        g.fillStyle = '#4a2a18'; g.fillRect(0, 0, S, 14); g.fillRect(0, S - 14, S, 14); g.fillRect(0, 0, 14, S); g.fillRect(S - 14, 0, 14, S);
        for (let n = 0; n < 16; n++) blot(g, r() * S, r() * S, 30 + r() * 60, 'rgba(120,50,15,0.4)');
        for (let c = 0; c < 4; c++) { // revner: mørk kerne med glødende kant
          let x = r() * S, y = r() * S, a = r() * TAU;
          const pts = [[x, y]];
          for (let s = 0; s < 9; s++) { a += (r() - 0.5) * 1.2; x += Math.cos(a) * 34; y += Math.sin(a) * 34; pts.push([x, y]); }
          for (const [wd, col] of [[11, 'rgba(255,110,30,0.55)'], [6, 'rgba(255,200,90,0.9)'], [3, '#0a0605']]) {
            g.strokeStyle = col; g.lineWidth = wd; g.lineJoin = 'round'; g.beginPath();
            pts.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py))); g.stroke();
          }
        }
        grain(g, S, 0.16, 8, 11);
      };
      // Olieglat stålplade med regnbueskær
      const paintOil = (g, S, r) => {
        const n1 = ctx.tileNoise(S, 4, 4, ctx.mulberry32(21)), n2 = ctx.tileNoise(S, 3, 3, ctx.mulberry32(22));
        const img = g.createImageData(S, S), d = img.data;
        for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
          const i = y * S + x, m = clamp((n2[i] - 0.4) * 4, 0, 1), h = n1[i] * 3.2;
          const br = 0.32 + 0.05 * Math.sin(y * 1.7 + n1[i] * 12);
          d[i * 4] = 255 * (br * 0.8 + m * 0.34 * (0.5 + 0.5 * Math.cos(TAU * h)));
          d[i * 4 + 1] = 255 * (br * 0.9 + m * 0.34 * (0.5 + 0.5 * Math.cos(TAU * (h + 0.33))));
          d[i * 4 + 2] = 255 * (br * 1.05 + m * 0.4 * (0.5 + 0.5 * Math.cos(TAU * (h + 0.67))));
          d[i * 4 + 3] = 255;
        }
        g.putImageData(img, 0, 0);
        g.fillStyle = 'rgba(255,255,255,0.12)';
        for (let n = 0; n < 8; n++) { g.beginPath(); g.ellipse(r() * S, r() * S, 20 + r() * 40, 5 + r() * 8, r() * PI, 0, TAU); g.fill(); }
      };
      const paintWood = (g, S, r) => {
        const pw = S / 8;
        for (let i = 0; i < 8; i++) {
          const k = 0.8 + r() * 0.3;
          g.fillStyle = `rgb(${214 * k | 0},${170 * k | 0},${118 * k | 0})`; g.fillRect(i * pw, 0, pw, S);
          for (let n = 0; n < 24; n++) {
            g.strokeStyle = r() < 0.5 ? 'rgba(80,45,15,0.22)' : 'rgba(255,230,190,0.12)'; g.lineWidth = 1 + r() * 1.4;
            const x = i * pw + 4 + r() * (pw - 8); g.beginPath(); g.moveTo(x, 0);
            for (let y = 0; y <= S; y += 32) g.lineTo(x + Math.sin(y * 0.02 + n) * 2.5, y); g.stroke();
          }
          if (r() < 0.6) { g.fillStyle = 'rgba(70,38,12,0.55)'; g.beginPath(); g.ellipse(i * pw + pw / 2, r() * S, 6, 11, 0, 0, TAU); g.fill(); }
          g.fillStyle = 'rgba(20,10,4,0.8)'; g.fillRect(i * pw, 0, 3, S);
          g.fillStyle = 'rgba(20,10,4,0.5)'; g.fillRect(i * pw, (i % 2) * S * 0.5 + S * 0.25 - 1, pw, 3);
        }
        grain(g, S, 0.12, 6, 13);
      };
      // Transportbånd: gummi med messingkløfter og pile. Fremad (−Z) = opad i billedet. rot: vandret bånd
      const paintBelt = (rot) => (g, S) => {
        g.save();
        if (rot) { g.translate(S, 0); g.rotate(PI / 2); }
        g.fillStyle = '#2b2622'; g.fillRect(0, 0, S, S);
        for (let y = 0; y < S; y += 8) { g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(0, y, S, 2); }
        const n = 8, st = S / n;
        for (let i = 0; i < n; i++) {
          const y = i * st;
          g.fillStyle = '#c79a4c'; g.fillRect(0, y + 2, S, st * 0.34);
          g.fillStyle = 'rgba(255,255,230,0.55)'; g.fillRect(0, y + 2, S, 3);
          g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(0, y + 2 + st * 0.34, S, 3);
          if (i % 2 === 0) { // pil, der peger i kørselsretningen
            g.fillStyle = '#e8b830'; g.beginPath();
            g.moveTo(S * 0.5, y + st * 0.55); g.lineTo(S * 0.66, y + st * 1.45); g.lineTo(S * 0.5, y + st * 1.12); g.lineTo(S * 0.34, y + st * 1.45); g.closePath(); g.fill();
          }
        }
        g.restore();
      };
      // Drivkæde (rullekæde) på bæltets side – bevæger sig vandret
      const paintChain = (g, S) => {
        g.fillStyle = '#3a2e24'; g.fillRect(0, 0, S, S);
        for (let y = 0; y < S; y += 6) { g.fillStyle = 'rgba(255,255,255,0.04)'; g.fillRect(0, y, S, 1); }
        const n = 8, st = S / n, y0 = S * 0.36, hh = S * 0.28;
        g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(0, y0 - 6, S, hh + 12);
        for (let i = 0; i < n; i++) {
          const x = i * st;
          g.fillStyle = i % 2 ? '#b9b3a6' : '#8d877b';
          g.beginPath(); g.roundRect(x + 2, y0, st * 0.62, hh, hh * 0.45); g.fill();
          g.fillStyle = 'rgba(255,255,255,0.45)'; g.fillRect(x + 6, y0 + 3, st * 0.5, 3);
          g.fillStyle = '#1b1612'; g.beginPath(); g.arc(x + 2 + st * 0.12, y0 + hh / 2, 4, 0, TAU); g.arc(x + 2 + st * 0.5, y0 + hh / 2, 4, 0, TAU); g.fill();
        }
      };
      // Urskive: messing, elfenbensskive, romertal – bruges som målplatform og som tårnets skive
      const paintDial = (g, S) => {
        const c = S / 2;
        g.fillStyle = '#b9923f'; g.fillRect(0, 0, S, S);
        for (let n = 0; n < 40; n++) { g.fillStyle = n % 2 ? 'rgba(255,240,190,0.06)' : 'rgba(60,35,5,0.07)'; g.fillRect(0, n * S / 40, S, 3); }
        for (const [x, y] of [[26, 26], [S - 26, 26], [26, S - 26], [S - 26, S - 26]]) rivet(g, x, y, 9);
        const ring = (rad, col) => { g.fillStyle = col; g.beginPath(); g.arc(c, c, rad, 0, TAU); g.fill(); };
        ring(c - 4, '#5b3d14'); ring(c - 14, '#d9b45a'); ring(c - 26, '#7a5420');
        const face = g.createRadialGradient(c, c, 20, c, c, c - 28);
        face.addColorStop(0, '#f6eed8'); face.addColorStop(1, '#dccfa8');
        g.fillStyle = face; g.beginPath(); g.arc(c, c, c - 28, 0, TAU); g.fill();
        g.strokeStyle = '#2b1d0e';
        for (let i = 0; i < 60; i++) {
          const a = (i / 60) * TAU, big = i % 5 === 0, r1 = c - 52 - (big ? 22 : 0), r2 = c - 38;
          g.lineWidth = big ? 6 : 2;
          g.beginPath(); g.moveTo(c + Math.sin(a) * r1, c - Math.cos(a) * r1); g.lineTo(c + Math.sin(a) * r2, c - Math.cos(a) * r2); g.stroke();
        }
        g.fillStyle = '#2b1d0e'; g.font = `bold ${S * 0.085}px Georgia, serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
        const rom = ['XII', 'I', 'II', 'III', 'IIII', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * TAU, rr = c - 100;
          g.save(); g.translate(c + Math.sin(a) * rr, c - Math.cos(a) * rr); g.rotate(a); g.fillText(rom[i], 0, 0); g.restore();
        }
        g.strokeStyle = 'rgba(120,80,20,0.4)'; g.lineWidth = 2;
        for (let i = 0; i < 24; i++) { const a = (i / 24) * TAU; g.beginPath(); g.moveTo(c + Math.sin(a) * 36, c - Math.cos(a) * 36); g.lineTo(c + Math.sin(a) * 74, c - Math.cos(a) * 74); g.stroke(); }
        ring(30, '#a47a2c'); ring(22, '#e3c06a'); ring(9, '#4a3210');
      };
      const paintHazard = (g, S) => {
        g.fillStyle = '#1d1a17'; g.fillRect(0, 0, S, S);
        g.fillStyle = '#e2ad1c';
        for (let i = -2; i < 6; i++) {
          g.beginPath(); g.moveTo(i * S / 2, 0); g.lineTo(i * S / 2 + S / 4, 0); g.lineTo(i * S / 2 + S / 4 - S, S); g.lineTo(i * S / 2 - S, S); g.closePath(); g.fill();
        }
      };
      const T = {
        plate: () => canvasTex('plate', 512, paintPlate),
        panel: () => canvasTex('panel', 256, paintPanel),
        tread: () => canvasTex('tread', 256, paintTread),
        grate: () => canvasTex('grate', 512, paintGrate),
        oil: () => canvasTex('oil', 512, paintOil),
        wood: () => canvasTex('wood', 512, paintWood),
        beltZ: () => canvasTex('beltZ', 256, paintBelt(false)),
        beltX: () => canvasTex('beltX', 256, paintBelt(true)),
        chain: () => canvasTex('chain', 256, paintChain),
        dial: () => canvasTex('dial', 512, paintDial),
        hazard: () => canvasTex('hazard', 128, paintHazard),
      };

      /* ---------- Materialer ---------- */
      const matCache = {};
      const std = (o) => new THREE.MeshStandardMaterial(o);
      const mat = (key) => matCache[key] || (matCache[key] = tr(MATS[key]()));
      const metalMap = (map, color, rough, metal, bump = 1.4) => std({ map: T[map](), bumpMap: T[map](), bumpScale: bump, color, roughness: rough, metalness: metal });
      const decalOpts = { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 };
      const MATS = {
        brassTop: () => metalMap('plate', '#ecc064', 0.42, 0.55),
        brassSide: () => metalMap('panel', '#d8aa52', 0.5, 0.6),
        copperTop: () => metalMap('plate', '#e69468', 0.4, 0.55),
        copperSide: () => metalMap('panel', '#c8764a', 0.45, 0.6),
        ironSide: () => metalMap('panel', '#6c6865', 0.5, 0.7),
        ironTop: () => metalMap('plate', '#8c8782', 0.5, 0.6),
        ironDark: () => metalMap('panel', '#3b3836', 0.55, 0.75),
        darkPlate: () => metalMap('plate', '#47423e', 0.5, 0.7),
        patina: () => metalMap('plate', '#8fc9ae', 0.5, 0.45),
        tread: () => metalMap('tread', '#c9c3b8', 0.5, 0.65, 2.2),
        grate: () => metalMap('grate', '#ffffff', 0.85, 0.35, 2.4),
        oilTop: () => new THREE.MeshPhysicalMaterial({ map: T.oil(), color: '#d8e4ff', roughness: 0.12, metalness: 0.55, clearcoat: 1, clearcoatRoughness: 0.05 }),
        oilSide: () => metalMap('panel', '#2e3948', 0.25, 0.85),
        wood: () => std({ map: T.wood(), bumpMap: T.wood(), bumpScale: 1.2, color: '#f0d2a4', roughness: 0.85, metalness: 0 }),
        woodDark: () => std({ map: T.wood(), color: '#a88458', roughness: 0.9, metalness: 0 }),
        dial: () => std({ map: T.dial(), roughness: 0.5, metalness: 0.35 }),
        dialGlow: () => std({ map: T.dial(), roughness: 0.6, metalness: 0.1, emissive: '#ffb050', emissiveMap: T.dial(), emissiveIntensity: 0.75 }),
        hazard: () => std({ map: T.hazard(), roughness: 0.6, metalness: 0.3, ...decalOpts }),
        decalDark: () => std({ color: '#26211e', roughness: 0.7, metalness: 0.5, ...decalOpts }),
        decalBrass: () => std({ color: '#f0c660', roughness: 0.3, metalness: 0.9, ...decalOpts }),
        decalHot: () => new THREE.MeshBasicMaterial({ color: '#ff7a22', ...decalOpts }),
        decalLamp: () => new THREE.MeshBasicMaterial({ color: '#ffd890', ...decalOpts }),
        pipe: () => std({ color: '#cf7a4a', roughness: 0.28, metalness: 0.95 }),
        brass: () => std({ color: '#e6b650', roughness: 0.3, metalness: 0.95 }),
        chrome: () => std({ color: '#d5d8dc', roughness: 0.14, metalness: 1 }),
        iron: () => std({ color: '#2f2d2c', roughness: 0.45, metalness: 0.85 }),
        rust: () => std({ color: '#7d4a2c', roughness: 0.9, metalness: 0.4 }),
        rubber: () => std({ color: '#1f1b19', roughness: 0.9, metalness: 0.1 }),
        red: () => std({ color: '#b3261e', roughness: 0.45, metalness: 0.4 }),
        lamp: () => new THREE.MeshBasicMaterial({ color: '#ffcf84' }),
        glowHot: () => new THREE.MeshBasicMaterial({ color: '#ff8424' }),
        window: () => new THREE.MeshBasicMaterial({ color: '#ffb256' }),
      };

      /* ---------- Geometri-hjælpere ---------- */
      // Samler mange små dele pr. materiale i få meshes (få draw calls)
      const mk = () => {
        const parts = new Map();
        const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new V3(), s = new V3();
        return {
          add(m, geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
            const g = geo.index ? geo.toNonIndexed() : geo.clone();
            m4.compose(v.set(x, y, z), q.setFromEuler(e.set(rx, ry, rz)), s.set(sx, sy, sz));
            g.applyMatrix4(m4);
            if (!parts.has(m)) parts.set(m, []);
            parts.get(m).push(g);
          },
          build(group, cast = true) {
            for (const [m, list] of parts) {
              let n = 0;
              for (const g of list) n += g.attributes.position.count;
              const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
              let o = 0;
              for (const g of list) {
                pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3);
                if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
                o += g.attributes.position.count;
              }
              const geo = new THREE.BufferGeometry();
              geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
              geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
              geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
              const mesh = new THREE.Mesh(tr(geo), m);
              if (!cast || m.isMeshBasicMaterial || m.userData.flat) mesh.userData.noCastShadow = true;
              group.add(mesh);
            }
            return group;
          },
        };
      };
      const scaleUV = (g, k) => { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * k, uv.getY(i) * k); return g; };
      const flatQuad = (w, d, tile = 1) => { const g = new THREE.PlaneGeometry(w, d).rotateX(-PI / 2); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / tile, uv.getY(i) * d / tile); return g; };
      const flatRing = (r0, r1, seg, tile = 1, a0 = 0, aLen = TAU) => scaleUV(new THREE.RingGeometry(r0, r1, seg, 1, a0, aLen).rotateX(-PI / 2), (2 * r1) / tile);
      // Fladt omrids (Shape) som dekal
      const flatShape = (pts) => new THREE.ShapeGeometry(new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)))).rotateX(-PI / 2);
      // Tandhjul: omrids med tænder (tip Rt, rod Rr), eger og nav. Aksen er z (før evt. rotation)
      const gearGeo = (Rt, Rr, n, depth, spokes = 0, hub = 0) => {
        const s = new THREE.Shape(), st = TAU / n, pt = (a, r) => new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r);
        const out = [];
        for (let i = 0; i < n; i++) { const c = i * st; out.push(pt(c - 0.5 * st, Rr), pt(c - 0.27 * st, Rr), pt(c - 0.15 * st, Rt), pt(c + 0.15 * st, Rt), pt(c + 0.27 * st, Rr)); }
        s.setFromPoints(out);
        for (let k = 0; k < spokes; k++) {
          const a0 = (k / spokes) * TAU + 0.12, a1 = ((k + 1) / spokes) * TAU - 0.12, ri = hub * 1.35, ro = Rr * 0.8, h = new THREE.Path(), pts = [];
          for (let i = 0; i <= 5; i++) pts.push(pt(a0 + (a1 - a0) * i / 5, ro));
          for (let i = 5; i >= 0; i--) pts.push(pt(a0 + (a1 - a0) * i / 5, ri));
          h.setFromPoints(pts); s.holes.push(h);
        }
        return new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 3 });
      };
      // Tilfældig forskydning af teksturen, så ens plader ikke ligner hinanden (kun på top og sider vandret)
      const jitterUV = (geo, r) => {
        const uv = geo.attributes.uv, nor = geo.attributes.normal, du = r(), dv = r();
        for (let i = 0; i < uv.count; i++) {
          const top = Math.abs(nor.getY(i)) > 0.5;
          uv.setXY(i, uv.getX(i) + du, uv.getY(i) + (top ? dv : 0));
        }
      };

      /* ---------- Platformens dele ---------- */
      const upMover = (p) => !!(p.move && p.move.axis[1] > 0.9);
      const VAR = { plate: 1, girder: 1, crate: 1, boiler: 1, furnace: 1, catwalk: 1, gear: 1, piston: 1 };
      const lookOf = (p) => {
        const free = p.type === 'p' || p.type === 'start' || p.type === 'finish';
        if (free && p.v && VAR[p.v]) return p.v === 'gear' && p.shape !== 'cyl' ? 'plate' : p.v;
        if (free) return p.type === 'finish' ? 'dial' : upMover(p) ? 'piston' : 'plate';
        if (p.type === 'move') return upMover(p) ? 'piston' : 'trolley';
        return { ice: 'oil', crumble: 'rust', swing: 'hung', bounce: 'spring', spin: 'turn', conveyor: 'belt', rot: 'cog', vent: 'vent', ramp: 'ramp', rail: 'rail', boost: 'boost' }[p.type] || 'plate';
      };
      const beltMats = {}; // pr. signeret fart: delte teksturer, der rulles i update
      const beltSet = (p) => {
        const ax = p.beltAx === 'x' ? 'X' : 'Z', key = ax + p.belt;
        if (beltMats[key]) return beltMats[key];
        const sg = p.belt < 0 ? -1 : 1, tile = 2;
        const mine = (src, sx, sy, sideTile) => {
          const t = src.clone(); t.needsUpdate = true; t.repeat.set(sx, sy); tr(t);
          return t;
        };
        const topT = mine(T['belt' + ax](), ax === 'X' ? sg : 1, ax === 'Z' ? sg : 1);
        // Kæden: på siderne, der vender langs kørselsretningen (±X for Z-bånd, ±Z for X-bånd)
        const chR = mine(T.chain(), sg, 1), chL = mine(T.chain(), -sg, 1);
        const mm = (t) => tr(std({ map: t, bumpMap: t, bumpScale: 1.6, roughness: 0.5, metalness: 0.7 }));
        const set = {
          top: tr(std({ map: topT, bumpMap: topT, bumpScale: 1.8, roughness: 0.6, metalness: 0.3 })),
          chainR: mm(chR), chainL: mm(chL), tile, ax,
        };
        anim.belts.push({ top: topT, chains: [chR, chL], v: Math.abs(p.belt), tile, ax, sideTile: 1 });
        return (beltMats[key] = set);
      };

      // Fyld-dekaler: mørke tandhuller, eger og nav oven på et drejeligt tandhjul
      const cogDecals = (B, R, n, tooth, top) => {
        const st = TAU / n;
        for (let i = 0; i < n; i++) {
          const c = i * st + st / 2;
          B.add(mat('decalDark'), flatRing(R - tooth - 0.02, R + 0.005, 4, 1, c - st * 0.27, st * 0.54), 0, top + 0.012, 0);
        }
        B.add(mat('decalDark'), flatRing(R - tooth - 0.1, R - tooth - 0.02, 64), 0, top + 0.012, 0);
        const spokes = n > 14 ? 6 : 5;
        for (let k = 0; k < spokes; k++) {
          const a = (k / spokes) * TAU + st * 0.25, ri = R * 0.2, ro = R - tooth - 0.35, wd = Math.max(0.22, R * 0.07);
          const dx = Math.cos(a), dz = -Math.sin(a), nx = dz, nz = -dx;
          B.add(mat('decalDark'), flatShape([
            [dx * ri + nx * wd, -(dz * ri + nz * wd) * 0 + (-(dz * ri + nz * wd))], [dx * ro + nx * wd * 0.6, -(dz * ro + nz * wd * 0.6)],
            [dx * ro - nx * wd * 0.6, -(dz * ro - nz * wd * 0.6)], [dx * ri - nx * wd, -(dz * ri - nz * wd)],
          ]), 0, top + 0.012, 0);
        }
        B.add(mat('decalBrass'), flatRing(0.001, Math.max(0.5, R * 0.16), 40), 0, top + 0.016, 0);
        B.add(mat('decalDark'), flatRing(Math.max(0.5, R * 0.16), Math.max(0.5, R * 0.16) + 0.08, 40), 0, top + 0.016, 0);
        B.add(mat('decalDark'), flatRing(0.001, Math.max(0.18, R * 0.05), 20), 0, top + 0.02, 0);
      };

      return {
        ventColor: '#f3ead8',
        slickColor: '#7fd8ff',

        platform(p) {
          const grp = new THREE.Group(), B = mk(), look = lookOf(p), r = ctx.mulberry32(p.seed);
          const cyl = p.shape === 'cyl', R = p.w / 2, w = p.w, h = p.h, d = cyl ? p.w : p.type === 'ramp' ? p.slopeLen : p.d, top = h / 2;
          const big = p.type === 'start' || p.type === 'finish';
          const drop = ['ramp', 'rail', 'boost'].includes(p.type) ? 0 : Math.max(0, ctx.freeBelow(p) - (p.move && p.move.amp ? p.move.amp : 0));
          const minD = Math.min(w, d);
          // Hovedlegemet (det fysiske volumen)
          const body = (topM, sideM, botM, tile, sideTile, geoFix) => {
            let geo, ms;
            if (cyl) { geo = ctx.cylGeometry(R, h, tile, { segments: 48 }); ms = [sideM, topM, botM]; }
            else { geo = ctx.boxGeometry(w, h, d, tile, { sideTile }); ms = [sideM, sideM, topM, botM, sideM, sideM]; }
            if (geoFix) geoFix(geo); else jitterUV(geo, r);
            const m = new THREE.Mesh(tr(geo), ms);
            m.userData.solid = true;
            grp.add(m);
            return m;
          };
          // Nedhængende underdel: aftagende kasser/kegle + rør + lampe. Alt ligger inden for fodaftrykket
          const hopper = (depth, sideM, withPipes = true) => {
            if (depth < 0.7) return;
            const y0 = -h / 2;
            if (cyl) {
              B.add(sideM, scaleUV(new THREE.CylinderGeometry(R * 0.96, R * 0.42, depth, 28, 1, true), 1), 0, y0 - depth / 2, 0);
              B.add(mat('brass'), new THREE.TorusGeometry(R * 0.96, 0.05, 6, 40).rotateX(PI / 2), 0, y0 - 0.03, 0);
              B.add(mat('brass'), new THREE.TorusGeometry(R * 0.42, 0.05, 6, 28).rotateX(PI / 2), 0, y0 - depth, 0);
            } else {
              let sw = w, sd = d, y = y0;
              const steps = depth > 2.2 ? 3 : 2, hh = depth / steps;
              for (let i = 0; i < steps; i++) {
                sw = Math.max(0.6, sw * 0.8 - 0.1); sd = Math.max(0.6, sd * 0.8 - 0.1);
                B.add(sideM, ctx.boxGeometry(sw, hh, sd, 2, { sideTile: 2 }), 0, y - hh / 2, 0);
                B.add(mat('brass'), ctx.boxGeometry(sw + 0.04, 0.07, sd + 0.04, 1), 0, y - 0.035, 0);
                y -= hh;
              }
            }
            if (withPipes && minD > 2.6) {
              const L = depth * (0.8 + r() * 0.5), px = cyl ? R * 0.62 : w / 2 - 0.42, pz = cyl ? 0 : d / 2 - 0.42, sgn = r() < 0.5 ? -1 : 1;
              const pr = 0.11;
              B.add(mat('pipe'), new THREE.CylinderGeometry(pr, pr, L, 10), sgn * px, y0 - L / 2, cyl ? 0 : pz * sgn);
              for (let k = 0.2; k < L; k += 0.7) B.add(mat('brass'), new THREE.CylinderGeometry(pr * 1.45, pr * 1.45, 0.07, 10), sgn * px, y0 - k, cyl ? 0 : pz * sgn);
              B.add(mat('brass'), new THREE.SphereGeometry(pr * 1.3, 10, 8), sgn * px, y0 - L, cyl ? 0 : pz * sgn);
            }
            if (depth > 1.2) { // varm hængelampe i bunden
              B.add(mat('lamp'), new THREE.SphereGeometry(0.13, 10, 8), 0, y0 - depth - 0.1, 0);
              B.add(mat('iron'), new THREE.CylinderGeometry(0.05, 0.05, 0.25, 6), 0, y0 - depth + 0.04, 0);
            }
          };
          // Sikkerhedsbort rundt langs kanten (flade dekaler)
          const hazardFrame = (bw = 0.3) => {
            const y = top + 0.012;
            if (cyl) B.add(mat('hazard'), flatRing(R - bw, R - 0.01, 56, 0.5), 0, y, 0);
            else {
              B.add(mat('hazard'), flatQuad(w - 0.02, bw, 0.5), 0, y, -d / 2 + bw / 2 + 0.01);
              B.add(mat('hazard'), flatQuad(w - 0.02, bw, 0.5), 0, y, d / 2 - bw / 2 - 0.01);
              B.add(mat('hazard'), flatQuad(bw, d - 2 * bw - 0.04, 0.5), -w / 2 + bw / 2 + 0.01, y, 0);
              B.add(mat('hazard'), flatQuad(bw, d - 2 * bw - 0.04, 0.5), w / 2 - bw / 2 - 0.01, y, 0);
            }
          };
          // Stempelstang med bælg under en plade
          const pistonRod = () => {
            const L = clamp(Math.min(drop - 0.3, 6), 0, 6);
            if (L < 1) return;
            const rb = clamp(minD * 0.17, 0.22, 0.55), y0 = -h / 2;
            const prof = [];
            for (let i = 0; i <= 14; i++) prof.push(new THREE.Vector2(rb * (i % 2 ? 0.8 : 1.05), i * 0.11));
            B.add(mat('ironDark'), new THREE.LatheGeometry(prof, 20), 0, y0 - 1.54, 0);
            B.add(mat('brass'), new THREE.CylinderGeometry(rb * 1.25, rb * 1.25, 0.14, 20), 0, y0 - 0.07, 0);
            B.add(mat('chrome'), new THREE.CylinderGeometry(rb * 0.5, rb * 0.5, L - 1.4, 14), 0, y0 - 1.55 - (L - 1.4) / 2, 0);
            B.add(mat('brass'), new THREE.CylinderGeometry(rb * 0.85, rb * 0.85, 0.3, 16), 0, y0 - L - 0.05, 0);
            B.add(mat('lamp'), new THREE.SphereGeometry(0.1, 8, 6), 0, y0 - L - 0.28, 0);
          };

          switch (look) {
            case 'dial': { // målplatform: urskive
              const geo = cyl ? ctx.cylGeometry(R, h, 4, { segments: 56 }) : ctx.boxGeometry(w, h, d, 4, { sideTile: h });
              const uv = geo.attributes.uv, nor = geo.attributes.normal, pos = geo.attributes.position;
              for (let i = 0; i < uv.count; i++) if (nor.getY(i) > 0.5) uv.setXY(i, pos.getX(i) / w + 0.5, 0.5 - pos.getZ(i) / d);
              const m = new THREE.Mesh(tr(geo), cyl ? [mat('brassSide'), mat('dial'), mat('ironSide')] : [mat('brassSide'), mat('brassSide'), mat('dial'), mat('ironSide'), mat('brassSide'), mat('brassSide')]);
              m.userData.solid = true; grp.add(m);
              hopper(Math.min(drop, clamp(minD * 0.7, 2, 6)), mat('ironDark'));
              break;
            }
            case 'girder': {
              body(mat('tread'), mat('ironSide'), mat('ironDark'), 1, h);
              hazardFrame(0.24);
              const dd = Math.min(drop, 2.2);
              if (dd > 0.6) {
                B.add(mat('ironDark'), ctx.boxGeometry(w * 0.34, dd, d * 0.97, 1.5, { sideTile: 1.5 }), 0, -h / 2 - dd / 2, 0);
                B.add(mat('ironDark'), ctx.boxGeometry(w * 0.8, 0.16, d * 0.97, 1.5), 0, -h / 2 - dd + 0.08, 0);
                for (let z = -d / 2 + 1; z < d / 2 - 0.5; z += 2.2) B.add(mat('brass'), ctx.boxGeometry(w * 0.36, dd * 0.9, 0.08, 1), 0, -h / 2 - dd / 2, z);
              }
              break;
            }
            case 'catwalk': {
              body(mat('tread'), mat('ironSide'), mat('ironDark'), 1, h);
              const dd = Math.min(drop, 1.6);
              if (dd > 0.5) {
                const n = Math.max(2, Math.round(d / 2.4));
                for (let i = 0; i <= n; i++) B.add(mat('ironDark'), ctx.boxGeometry(w * 0.9, dd, 0.14, 1), 0, -h / 2 - dd / 2, -d / 2 + 0.2 + (i * (d - 0.4)) / n);
                B.add(mat('pipe'), new THREE.CylinderGeometry(0.07, 0.07, d * 0.96, 8).rotateX(PI / 2), 0, -h / 2 - dd, 0);
              }
              break;
            }
            case 'crate': {
              if (cyl) { // tønde
                const m = body(mat('wood'), mat('woodDark'), mat('woodDark'), 2, 2);
                m.geometry.attributes.uv && (m.geometry.attributes.uv.needsUpdate = true);
                for (const y of [-h / 2 + 0.1, 0, h / 2 - 0.1]) B.add(mat('iron'), new THREE.CylinderGeometry(R + 0.004, R + 0.004, 0.09, 40, 1, true), 0, y, 0);
                hopper(Math.min(drop, 1.2), mat('woodDark'), false);
              } else {
                body(mat('wood'), mat('woodDark'), mat('woodDark'), 2, 2);
                const t = 0.06;
                for (const sx of [-1, 1]) for (const z of [-d * 0.36, d * 0.36]) B.add(mat('iron'), ctx.boxGeometry(0.02, h, 0.22, 1), sx * (w / 2 + 0.004), 0, z);
                for (const sz of [-1, 1]) for (const x of [-w * 0.36, w * 0.36]) B.add(mat('iron'), ctx.boxGeometry(0.22, h, 0.02, 1), x, 0, sz * (d / 2 + 0.004));
                for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.add(mat('iron'), flatQuad(0.5, 0.5, 1), sx * (w / 2 - 0.26), top + 0.012, sz * (d / 2 - 0.26));
                B.add(mat('iron'), flatQuad(w - 0.04, 0.2, 1), 0, top + 0.012, 0);
                void t;
                if (drop > 0.8) for (const sx of [-1, 1]) B.add(mat('woodDark'), ctx.boxGeometry(0.34, 0.45, d * 0.96, 1), sx * (w / 2 - 0.35), -h / 2 - 0.225, 0);
              }
              break;
            }
            case 'boiler': {
              body(mat('copperTop'), mat('copperSide'), mat('ironDark'), 3, h);
              const lid = cyl ? R : minD / 2;
              B.add(mat('decalBrass'), cyl ? flatRing(R - 0.34, R - 0.18, 56) : flatQuad(w - 0.3, d - 0.3, 1), 0, top + 0.012, 0);
              B.add(mat('decalDark'), cyl ? flatRing(R - 0.18, R - 0.1, 56) : flatQuad(w - 0.5, d - 0.5, 1), 0, top + 0.014, 0);
              B.add(mat('decalBrass'), flatRing(0.01, Math.min(0.9, lid * 0.38), 36), 0, top + 0.02, 0);
              B.add(mat('decalDark'), flatRing(Math.min(0.9, lid * 0.38), Math.min(0.9, lid * 0.38) + 0.07, 36), 0, top + 0.024, 0);
              if (cyl) for (const y of [-h / 2 + 0.18, h / 2 - 0.18]) B.add(mat('brass'), new THREE.CylinderGeometry(R + 0.004, R + 0.004, 0.12, 48, 1, true), 0, y, 0);
              // ben
              const dd = Math.min(drop, clamp(minD * 0.8, 1.2, 3.6));
              if (dd > 0.7) for (const [lx, lz] of cyl ? [[0.6, 0.6], [-0.6, 0.6], [0.6, -0.6], [-0.6, -0.6]].map(([a, b]) => [a * R * 0.8, b * R * 0.8]) : [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => [a * (w / 2 - 0.35), b * (d / 2 - 0.35)]))
                B.add(mat('ironDark'), new THREE.CylinderGeometry(0.1, 0.17, dd, 8), lx, -h / 2 - dd / 2, lz);
              break;
            }
            case 'furnace': {
              body(mat('darkPlate'), mat('ironDark'), mat('ironDark'), 3, h);
              // glødende ristspalter i toppen
              const slit = mat('decalHot');
              if (cyl) for (let i = 0; i < 5; i++) { const x = (i - 2) * R * 0.3, L = Math.sqrt(Math.max(0.05, R * R * 0.7 - x * x)) * 1.5; B.add(slit, flatQuad(0.09, L, 1), x, top + 0.012, 0); }
              else { const n = Math.max(3, Math.floor(w / 0.75)); for (let i = 0; i < n; i++) B.add(slit, flatQuad(0.09, d * 0.7, 1), (i - (n - 1) / 2) * (w * 0.78 / n), top + 0.012, 0); }
              B.add(mat('decalDark'), cyl ? flatRing(R - 0.3, R - 0.04, 56) : flatQuad(w - 0.06, d - 0.06, 1), 0, top + 0.008, 0);
              // ovnmund i siden (fladt glødende felt lige uden på væggen)
              if (!cyl && h > 0.8) B.add(slit, flatShape([[-w * 0.22, 0], [w * 0.22, 0], [w * 0.22, h * 0.34], [0, h * 0.5], [-w * 0.22, h * 0.34]]).rotateX(PI / 2).rotateY(0), 0, -h / 2 + 0.1, d / 2 + 0.01);
              if (cyl && h > 0.8) B.add(slit, flatShape([[-R * 0.2, 0], [R * 0.2, 0], [R * 0.2, h * 0.34], [0, h * 0.5], [-R * 0.2, h * 0.34]]).rotateX(PI / 2), 0, -h / 2 + 0.1, R + 0.012);
              hopper(Math.min(drop, clamp(minD * 0.8, 1.4, 4)), mat('ironDark'));
              B.add(mat('glowHot'), cyl ? new THREE.CylinderGeometry(R * 0.4, R * 0.4, 0.05, 16) : ctx.boxGeometry(w * 0.4, 0.05, d * 0.4, 1), 0, -h / 2 - Math.min(drop, clamp(minD * 0.8, 1.4, 4)) - 0.02, 0);
              break;
            }
            case 'gear': {
              const n = clamp(Math.round(R * 3) + 6, 10, 30), tooth = clamp(R * 0.15, 0.25, 0.55), cap = 0.2;
              const gb = gearGeo(R, R - tooth, n, h - cap, 0, 0).rotateX(-PI / 2).translate(0, -h / 2, 0);
              scaleUV(gb, 0.4);
              const mg = new THREE.Mesh(tr(gb), [mat('darkPlate'), mat('brassSide')]);
              mg.userData.solid = true; grp.add(mg);
              const cp = new THREE.Mesh(tr(ctx.cylGeometry(R, cap, 4, { segments: 56 })), [mat('brassSide'), mat('brassTop'), mat('brassSide')]);
              cp.position.y = h / 2 - cap / 2; cp.userData.solid = true; grp.add(cp);
              cogDecals(B, R, n, tooth, top);
              break;
            }
            case 'piston': {
              body(mat('brassTop'), mat('brassSide'), mat('ironDark'), 4, h);
              B.add(cyl ? mat('decalDark') : mat('decalDark'), cyl ? flatRing(R - 0.34, R - 0.28, 56) : flatQuad(w - 0.5, d - 0.5, 1), 0, top + 0.012, 0);
              B.add(mat('decalDark'), flatRing(0.01, Math.min(0.5, minD * 0.12), 24), 0, top + 0.014, 0);
              pistonRod();
              break;
            }
            case 'trolley': { // vandret bevægelig plade på hjul
              body(mat('brassTop'), mat('brassSide'), mat('ironDark'), 4, h);
              hazardFrame(0.2);
              const dd = Math.min(drop, 1.3);
              if (dd > 0.6) {
                B.add(mat('ironDark'), ctx.boxGeometry(w * 0.5, 0.22, d * 0.7, 1), 0, -h / 2 - 0.11, 0);
                for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
                  const x = sx * w * 0.3, z = sz * d * 0.28;
                  B.add(mat('ironDark'), ctx.boxGeometry(0.1, dd * 0.6, 0.3, 1), x, -h / 2 - dd * 0.3, z);
                  B.add(mat('iron'), new THREE.CylinderGeometry(0.24, 0.24, 0.14, 16).rotateZ(PI / 2), x, -h / 2 - dd * 0.6, z);
                  B.add(mat('brass'), new THREE.CylinderGeometry(0.08, 0.08, 0.2, 8).rotateZ(PI / 2), x, -h / 2 - dd * 0.6, z);
                }
              }
              break;
            }
            case 'hung': { // pendulplade: ophængsøjer ved hjørnerne (kæderne tegner motoren)
              body(mat('copperTop'), mat('copperSide'), mat('ironDark'), 4, h);
              hazardFrame(0.2);
              for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
                B.add(mat('decalDark'), flatRing(0.001, 0.2, 18), sx * w * 0.42, top + 0.02, sz * d * 0.42);
                B.add(mat('decalBrass'), flatRing(0.001, 0.12, 14), sx * w * 0.42, top + 0.024, sz * d * 0.42);
              }
              hopper(Math.min(drop, 1.2), mat('ironDark'), false);
              break;
            }
            case 'oil': { // olieglat plade: glat som is
              body(mat('oilTop'), mat('oilSide'), mat('ironDark'), 3, h);
              hopper(Math.min(drop, clamp(minD * 0.7, 1.2, 3.5)), mat('oilSide'), false);
              break;
            }
            case 'rust': { // rusten rist med revner
              body(mat('grate'), mat('grate'), mat('rust'), 3, 3);
              const dd = Math.min(drop, 1.4);
              if (dd > 0.5) for (let i = 0; i < 5; i++) {
                const L = (0.3 + r() * 0.9) * dd, x = (r() - 0.5) * (cyl ? R : w) * 0.8, z = (r() - 0.5) * (cyl ? R : d) * 0.8;
                B.add(mat('rust'), new THREE.CylinderGeometry(0.035, 0.05, L, 5), x, -h / 2 - L / 2, z, (r() - 0.5) * 0.4, 0, (r() - 0.5) * 0.4);
              }
              break;
            }
            case 'spring': { // fjederpude: kobberplade med pile og spiralfjeder
              body(mat('copperTop'), mat('copperSide'), mat('ironDark'), 3, h);
              for (let i = 0; i < 2; i++) {
                const cz = (i - 0.5) * Math.min(1.2, minD * 0.34), s = Math.min(1, minD * 0.2);
                B.add(mat('decalBrass'), flatShape([[0, -0.0], [s * 0.9, -s * 0.9], [s * 0.4, -s * 0.9], [s * 0.4, -s * 1.5], [-s * 0.4, -s * 1.5], [-s * 0.4, -s * 0.9], [-s * 0.9, -s * 0.9]].map(([x, y]) => [x, y + s * 0.8])), 0, top + 0.014, cz * 0.9);
              }
              B.add(mat('decalDark'), cyl ? flatRing(R - 0.3, R - 0.22, 48) : flatQuad(w - 0.45, d - 0.45, 1), 0, top + 0.01, 0);
              const dd = Math.min(drop, 2.2);
              if (dd > 0.9) {
                const cr = clamp(minD * 0.26, 0.3, 0.9), turns = 5, pts = [];
                for (let i = 0; i <= turns * 24; i++) { const a = (i / 24) * TAU; pts.push(new V3(Math.cos(a) * cr, -h / 2 - 0.2 - (i / (turns * 24)) * (dd - 0.4), Math.sin(a) * cr)); }
                B.add(mat('chrome'), new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), turns * 24, 0.07, 6), 0, 0, 0);
                B.add(mat('ironDark'), new THREE.CylinderGeometry(cr * 1.5, cr * 1.7, 0.2, 18), 0, -h / 2 - dd + 0.1, 0);
                B.add(mat('ironDark'), new THREE.CylinderGeometry(cr * 1.5, cr * 1.5, 0.12, 18), 0, -h / 2 - 0.08, 0);
              }
              break;
            }
            case 'turn': { // base til kranarm: skive med sikkerhedsring
              body(mat('darkPlate'), mat('ironSide'), mat('ironDark'), 3, h);
              B.add(mat('hazard'), flatRing(R - 0.42, R - 0.12, 56, 0.5), 0, top + 0.012, 0);
              B.add(mat('decalBrass'), flatRing(0.01, 0.55, 28), 0, top + 0.016, 0);
              B.add(mat('decalDark'), flatRing(0.55, 0.62, 28), 0, top + 0.02, 0);
              hopper(Math.min(drop, clamp(minD * 0.7, 1.4, 4)), mat('ironDark'));
              break;
            }
            case 'belt': {
              const bs = beltSet(p), tile = 2;
              let geo;
              if (bs.ax === 'Z') geo = ctx.boxGeometry(w, h, d, tile, { sideTile: tile });
              else geo = ctx.boxGeometry(w, h, d, tile, { sideTile: tile });
              // sider langs kørselsretningen får kæden (UV: tile = h, så kæden fylder siden)
              const uv = geo.attributes.uv, nor = geo.attributes.normal, pos = geo.attributes.position;
              for (let i = 0; i < uv.count; i++) {
                const nx = Math.abs(nor.getX(i)) > 0.5, nz = Math.abs(nor.getZ(i)) > 0.5;
                if ((bs.ax === 'Z' && nx) || (bs.ax === 'X' && nz)) uv.setXY(i, (bs.ax === 'Z' ? -pos.getZ(i) * Math.sign(nor.getX(i) || 1) : pos.getX(i) * Math.sign(nor.getZ(i) || 1)) / h * 1.0 + 0.5, (pos.getY(i) / h) + 0.5);
              }
              const ms = bs.ax === 'Z' ? [bs.chainR, bs.chainL, bs.top, mat('ironDark'), mat('ironSide'), mat('ironSide')]
                : [mat('ironSide'), mat('ironSide'), bs.top, mat('ironDark'), bs.chainR, bs.chainL];
              const m = new THREE.Mesh(tr(geo), ms); m.userData.solid = true; grp.add(m);
              // sikkerhedsbort langs de kanter, der ikke er bånd-ender
              const y = top + 0.012, bw = 0.16;
              if (bs.ax === 'Z') for (const sx of [-1, 1]) B.add(mat('hazard'), flatQuad(bw, d - 0.02, 0.4), sx * (w / 2 - bw / 2 - 0.01), y, 0);
              else for (const sz of [-1, 1]) B.add(mat('hazard'), flatQuad(w - 0.02, bw, 0.4), 0, y, sz * (d / 2 - bw / 2 - 0.01));
              const dd = Math.min(drop, 2.6);
              if (dd > 0.9) {
                for (const sgn of [-1, 1]) for (const k of [-0.36, 0.36]) {
                  const ax = bs.ax === 'Z' ? [sgn * (w / 2 - 0.35), k * d] : [k * w, sgn * (d / 2 - 0.35)];
                  B.add(mat('ironDark'), ctx.boxGeometry(0.18, dd, 0.18, 1), ax[0], -h / 2 - dd / 2, ax[1]);
                }
                B.add(mat('brass'), new THREE.CylinderGeometry(0.34, 0.34, Math.min(1.1, (bs.ax === 'Z' ? w : d) * 0.4), 16).rotateZ(bs.ax === 'Z' ? PI / 2 : 0).rotateX(bs.ax === 'Z' ? 0 : PI / 2), 0, -h / 2 - dd * 0.6, 0);
              }
              break;
            }
            case 'cog': { // drejeskive som tandhjul
              const n = clamp(Math.round(R * 3) + 6, 10, 32), tooth = clamp(R * 0.16, 0.25, 0.6), cap = 0.2;
              const gb = gearGeo(R, R - tooth, n, h - cap, 0, 0).rotateX(-PI / 2).translate(0, -h / 2, 0);
              scaleUV(gb, 0.4);
              const mg = new THREE.Mesh(tr(gb), [mat('darkPlate'), mat('brassSide')]);
              mg.userData.solid = true; grp.add(mg);
              const cp = new THREE.Mesh(tr(ctx.cylGeometry(R, cap, 4, { segments: 56 })), [mat('brassSide'), mat('brassTop'), mat('brassSide')]);
              cp.position.y = h / 2 - cap / 2; cp.userData.solid = true; grp.add(cp);
              cogDecals(B, R, n, tooth, top);
              // aksel og et lille drivhjul under
              const dd = Math.min(drop, clamp(R * 0.9, 1.2, 4));
              if (dd > 0.9) {
                B.add(mat('iron'), new THREE.CylinderGeometry(0.28, 0.34, dd, 14), 0, -h / 2 - dd / 2, 0);
                const sg = gearGeo(R * 0.6, R * 0.6 - tooth * 0.8, Math.max(8, Math.round(n * 0.6)), 0.3).rotateX(-PI / 2);
                B.add(mat('darkPlate'), scaleUV(sg, 0.4), 0, -h / 2 - dd * 0.65, 0);
                B.add(mat('lamp'), new THREE.SphereGeometry(0.12, 8, 6), 0, -h / 2 - dd - 0.05, 0);
              }
              anim.cogs.push(grp);
              break;
            }
            case 'vent': { // damprist: sort plade med lange spalter
              body(mat('darkPlate'), mat('ironSide'), mat('ironDark'), 2, h);
              B.add(mat('decalBrass'), cyl ? flatRing(R - 0.2, R - 0.06, 40) : flatQuad(w - 0.1, d - 0.1, 1), 0, top + 0.008, 0);
              B.add(mat('decalDark'), cyl ? flatRing(0.001, R - 0.2, 40) : flatQuad(w - 0.4, d - 0.4, 1), 0, top + 0.012, 0);
              const n = Math.max(3, Math.floor(minD / 0.5));
              for (let i = 0; i < n; i++) B.add(mat('decalLamp'), flatQuad(0.07, minD * 0.5, 1), (i - (n - 1) / 2) * (minD * 0.62 / n), top + 0.016, 0);
              const dd = Math.min(drop, 4);
              if (dd > 0.8) {
                const pr = clamp(minD * 0.2, 0.2, 0.5);
                B.add(mat('pipe'), new THREE.CylinderGeometry(pr, pr, dd, 14), 0, -h / 2 - dd / 2, 0);
                for (let k = 0.3; k < dd; k += 0.8) B.add(mat('brass'), new THREE.CylinderGeometry(pr * 1.35, pr * 1.35, 0.1, 14), 0, -h / 2 - k, 0);
                B.add(mat('red'), new THREE.TorusGeometry(0.26, 0.035, 6, 14), 0, -h / 2 - dd * 0.55, pr + 0.05, PI / 2 * 0, 0, 0);
              }
              break;
            }
            case 'ramp': {
              body(mat('tread'), mat('ironSide'), mat('ironDark'), 1, 1);
              break;
            }
            case 'rail': {
              const m = new THREE.Mesh(tr(ctx.boxGeometry(w, h, d, 1)), mat('brass')); m.userData.solid = true; grp.add(m);
              break;
            }
            case 'boost': {
              body(mat('ironTop'), mat('ironSide'), mat('ironDark'), 1, 1);
              for (let i = -1; i <= 1; i++) B.add(mat('decalHot'), flatShape([[-w * 0.3, 0.7], [0, 0.1], [w * 0.3, 0.7], [w * 0.3, 1.0], [0, 0.4], [-w * 0.3, 1.0]]), 0, top + 0.014, i * 1.4 - 0.4);
              break;
            }
            default: { // 'plate' og start
              body(mat('brassTop'), mat('brassSide'), mat('ironDark'), 4, h);
              if (p.type === 'start') hazardFrame(0.3);
              else if (r() < 0.45) hazardFrame(0.16);
              const tint = r();
              if (tint < 0.3 && !big) { grp.children[0].material = grp.children[0].material.map((m) => (m === mat('brassTop') ? mat('copperTop') : m === mat('brassSide') ? mat('copperSide') : m)); }
              hopper(Math.min(drop, clamp(minD * (big ? 0.7 : 0.9), 1.4, big ? 7 : 4.5)), mat('ironDark'));
              if (upMover(p)) pistonRod();
            }
          }
          B.build(grp, true);
          return grp;
        },

        /* ---------- Spinner: kranarm i gittervæk ---------- */
        spinArm(p) {
          const g = new THREE.Group(), B = mk(), L = p.bar, hh = 0.18;
          B.add(mat('ironDark'), ctx.boxGeometry(L, 0.07, 0.4, 1), 0, -hh + 0.035, 0);
          B.add(mat('ironDark'), ctx.boxGeometry(L, 0.07, 0.4, 1), 0, hh - 0.035, 0);
          B.add(mat('brass'), new THREE.CylinderGeometry(0.4, 0.4, 0.5, 20), 0, 0, 0);
          B.add(mat('iron'), new THREE.CylinderGeometry(0.17, 0.17, 0.55, 12), 0, -0.26, 0);
          const n = Math.max(6, Math.round(L / 0.55)), seg = L / n;
          for (let i = 0; i < n; i++) {
            const x0 = -L / 2 + i * seg, sl = Math.hypot(seg, 0.3);
            B.add(mat('iron'), new THREE.CylinderGeometry(0.03, 0.03, sl, 5), x0 + seg / 2, 0, 0, 0, 0, (i % 2 ? 1 : -1) * Math.atan2(0.3, seg) + PI / 2 * 0 - (i % 2 ? 1 : -1) * 0 + PI / 2 * 0 + Math.PI / 2 * 0 + (PI / 2) * 0 - PI / 2 * 0 + (i % 2 ? -PI / 2 : PI / 2) * 0 + 0 * 1 + PI / 2 * 0 - (PI / 2) * 0);
          }
          for (const s of [-1, 1]) {
            B.add(mat('hazard'), ctx.boxGeometry(1.1, 0.37, 0.46, 0.5), s * (L / 2 - 0.55), 0, 0);
            B.add(mat('iron'), ctx.boxGeometry(0.5, 0.5, 0.5, 1), s * (L / 2 + 0.05), -0.05, 0);
          }
          B.build(g, true);
          return g;
        },

        /* ---------- Stænger ---------- */
        bar(b) {
          const g = new THREE.Group(), B = mk(), len = b.len, r = b.r, v = b.v === 'rod' || b.v === 'hook' ? b.v : b.swing ? 'hook' : 'pipe';
          const cylX = (rad, l) => new THREE.CylinderGeometry(rad, rad, l, 14).rotateZ(PI / 2);
          B.add(v === 'rod' ? mat('iron') : mat('pipe'), cylX(r, len));
          if (v === 'hook') { // kranåg: sjækler ved rebene og opadbøjede kroge i enderne
            for (const e of [0.15, 0.85]) {
              B.add(mat('brass'), cylX(r * 1.7, 0.22), (e - 0.5) * len, 0, 0);
              B.add(mat('chrome'), new THREE.TorusGeometry(0.11, 0.025, 6, 16), (e - 0.5) * len, 0.16, 0, 0, 0, 0);
            }
            for (const s of [-1, 1]) {
              const pts = [];
              for (let i = 0; i <= 10; i++) { const a = (i / 10) * PI * 0.95; pts.push(new V3(s * (len / 2 + 0.12 - Math.sin(a) * 0.14 * 0.5 + 0.0), Math.sin(a) * 0.32 * 0 + (i / 10) * 0.34 - Math.cos(a) * 0 , 0)); }
              const hook = [new V3(s * len / 2, 0, 0), new V3(s * (len / 2 + 0.14), 0.05, 0), new V3(s * (len / 2 + 0.2), 0.26, 0), new V3(s * (len / 2 + 0.1), 0.42, 0), new V3(s * (len / 2 - 0.06), 0.36, 0)];
              B.add(mat('iron'), new THREE.TubeGeometry(new THREE.CatmullRomCurve3(hook), 14, r * 1.1, 7));
              void pts;
            }
          } else {
            const n = Math.max(1, Math.floor(len / 1.5));
            for (let i = 1; i <= n; i++) {
              const x = -len / 2 + (len * i) / (n + 1);
              B.add(mat('brass'), cylX(r * 1.55, 0.13), x, 0, 0);
              B.add(mat('brass'), cylX(r * 1.2, 0.04), x - 0.1, 0, 0);
              B.add(mat('brass'), cylX(r * 1.2, 0.04), x + 0.1, 0, 0);
            }
            for (const s of [-1, 1]) {
              B.add(mat('brass'), cylX(r * 2.7, 0.05), s * (len / 2 - 0.03), 0, 0);
              B.add(mat('iron'), new THREE.SphereGeometry(r * 1.7, 10, 8), s * (len / 2 + 0.02), 0, 0);
            }
            if (v === 'pipe') { // ventilhjul i den ene ende
              B.add(mat('red'), new THREE.TorusGeometry(0.2, 0.03, 6, 16).rotateY(PI / 2), len / 2 + 0.2, 0, 0);
              B.add(mat('brass'), cylX(0.025, 0.2), len / 2 + 0.1, 0, 0);
              B.add(mat('red'), new THREE.BoxGeometry(0.03, 0.4, 0.03), len / 2 + 0.2, 0, 0);
              B.add(mat('red'), new THREE.BoxGeometry(0.03, 0.03, 0.4), len / 2 + 0.2, 0, 0);
            }
          }
          B.build(g, true);
          return g;
        },

        /* ---------- Svævebane: stålwire med kranmaster ---------- */
        zip(z) {
          const g = new THREE.Group(), B = mk();
          const A = new V3(z.ax, z.ay, z.az), E = new V3(z.bx, z.by, z.bz), dir = E.clone().sub(A), L = dir.length();
          dir.normalize();
          const side = new V3(-dir.z, 0, dir.x).normalize().multiplyScalar(1.1);
          const q = new THREE.Quaternion().setFromUnitVectors(new V3(0, 1, 0), dir);
          const cab = new THREE.Mesh(tr(new THREE.CylinderGeometry(0.03, 0.03, L, 6)), mat('chrome'));
          cab.position.copy(A).addScaledVector(dir, L / 2); cab.quaternion.copy(q);
          g.add(cab);
          for (const [P, up] of [[A, 0.9], [E, 0.9]]) {
            const bx = P.x + side.x, bz = P.z + side.z;
            B.add(mat('ironDark'), new THREE.CylinderGeometry(0.1, 0.16, 4.2, 8), bx, P.y - 3.0 + 1.1 * 0, bz);
            B.add(mat('brass'), new THREE.CylinderGeometry(0.2, 0.2, 0.12, 10), bx, P.y + 0.9 - 0.1, bz);
            B.add(mat('ironDark'), new THREE.BoxGeometry(1.1, 0.12, 0.12), P.x + side.x * 0.5, P.y + 0.9, P.z + side.z * 0.5, 0, Math.atan2(-side.z, side.x), 0);
            B.add(mat('brass'), new THREE.TorusGeometry(0.12, 0.03, 6, 14), P.x, P.y + 0.1, P.z, 0, 0, 0);
            void up;
          }
          B.build(g, true);
          return g;
        },

        /* ---------- Krogpunkt: messing-tandhjul med øje ---------- */
        anchor() {
          const g = new THREE.Group(), cogG = new THREE.Group(), B = mk();
          const gg = gearGeo(0.33, 0.26, 10, 0.12, 4, 0.08).rotateX(-PI / 2).translate(0, -0.06, 0);
          B.add(mat('brass'), scaleUV(gg, 1));
          B.add(mat('iron'), new THREE.CylinderGeometry(0.09, 0.09, 0.2, 10), 0, 0, 0);
          B.build(cogG, true);
          g.add(cogG);
          const eye = new THREE.Mesh(tr(new THREE.TorusGeometry(0.1, 0.03, 6, 14)), mat('chrome'));
          eye.position.y = 0.2; g.add(eye);
          const rod = new THREE.Mesh(tr(new THREE.CylinderGeometry(0.02, 0.02, 0.9, 5)), mat('iron'));
          rod.position.y = 0.6; g.add(rod);
          anim.spin.push(cogG);
          return g;
        },

        /* ---------- Kulisser ---------- */
        decor(data) {
          return buildDecor(data);
        },

        update(dt, t) {
          for (const b of anim.belts) {
            const k = (dt * b.v) / b.tile;
            b.top.offset.y -= b.ax === 'Z' ? k : 0;
            b.top.offset.x -= b.ax === 'X' ? k : 0;
            for (const c of b.chains) c.offset.x -= (dt * b.v) / 1.0 * 0.5;
          }
          for (const s of anim.spin) s.rotation.y = t * 0.8;
          for (const gr of anim.gears) gr.mesh.rotation.z = t * gr.w + gr.ph;
          for (const u of anim.uniforms) u.value = t;
          for (const hnd of anim.hands) hnd.mesh.rotation.z = -t * hnd.w;
          for (const n of anim.needles) n.mesh.rotation.z = n.base + Math.sin(t * n.f + n.ph) * n.amp;
          for (const f of anim.flick) f.material.opacity = f.base * (0.85 + 0.15 * Math.sin(t * 7 + f.ph) * Math.sin(t * 3.1 + f.ph));
        },
      };

      /* ---------- Kulisser (se decor) ---------- */
      function buildDecor(data) {
        return new THREE.Group();
      }
    },
  };
})();
