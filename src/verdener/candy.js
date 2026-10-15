/* =====================================================================
   VERDENSSÆT 'candy' – Slikøerne (bane 3)
   Kæmpe slik i en pastelhimmel: donuts med glasur og krymmel, chokolade-
   plader, macarons, vaffelbroer, slikkepinde, bryllupskage, skumfiduser og
   gelé. Bagved hælder en kæmpekop chokolade ud i havet mellem candyfloss-skyer.
   ===================================================================== */
(function () {
  'use strict';

  // Pastel-eftermiddag: lyserød zenit, mintgrøn horisont, blød sol
  window.SKYHOJ_THEMES.candy = {
    top: '#f7a8d8', horizon: '#b8f5e0', bottom: '#f4c9de', sunElev: 40, sunAz: -35, sunColor: '#fff0f6', sunInt: 2.7,
    hemiSky: '#ffe2f3', hemiInt: 1.05, fog: '#f2dcef', fogNear: 110, fogFar: 680, cloud: '#ffd0ec', clouds: 0.85, stars: 0,
    stone: '#f2d6e4', exposure: 1.04, lavaGlow: 0.85,
  };

  window.SKYHOJ_KITS.candy = {
    id: 'candy',
    name: 'Slikøerne',
    variants: {
      donut: 'Donut: lyserød glasur med krymmel, syltetøj i midten, gylden dej med rund bund. shape:"cyl" w 3-9 (kasse = aflang donut, w 2-4, d 4-10)',
      choc: 'Chokoladeplade med tern i et farvet papir med guldfolie. Kasse w 2-6, d 2-12 (cyl = chokoladetærte i kiksebund, w 3-8)',
      macaron: 'Macaron i pastel (skal, fod, creme). Stables nedad, hvis der er plads under. shape:"cyl" w 2.5-6 (kasse = firkantet macaron, 3-5)',
      cake: 'Bryllupskage-etage: elfenbensfondant, lyserød glasurkant med dryp, guirlander, bånd og perler; aftagende etager nedenunder. shape:"cyl" w 6-14 (kasse 6-12)',
      wafer: 'Vaffelbro: vaffelmønster på toppen, lag af vaffel og creme på siden. Kasse w 2-4, d 4-20 (lange broer)',
      lolly: 'Slikkepind: blank regnbuespiral på toppen og en hvid pind nedenunder. shape:"cyl" w 3-7 (kasse = spiralflise)',
      marsh: 'Skumfidus i pastel med flormelis og rund bund (også standard for runde springpuder). cyl eller kasse, w 2-6',
      jelly: 'Gennemsigtig gelé/vingummi med sukkertop og mørk kerne (standard for firkantede springpuder). Kasse w 2-5 (cyl også)',
    },
    barVariants: {
      cane: 'Rød-hvid bolsjestok med krog i +X-enden (standard for stænger)',
      licorice: 'Snoet rød lakrids (standard for trapez)',
      wafer: 'Vaffelrør med chokoladespiral',
    },
    create(ctx) {
      const { THREE } = ctx;
      const PI = Math.PI, TAU = PI * 2, BEV = 0.03;
      const tr = (o) => ctx.track(o);
      const V3 = THREE.Vector3;

      /* ---------- Teksturer (tegnes først, når de bruges; max 12) ---------- */
      const texCache = {};
      const canvasTex = (key, w, h, paint) => {
        if (texCache[key]) return texCache[key];
        const c = ctx.makeCanvas(w, h), g = c.getContext('2d');
        paint(g, w, h, ctx.mulberry32(key.length * 977 + w + h));
        return (texCache[key] = tr(ctx.toTexture(c)));
      };
      // Pixel for pixel: fn(x, y, c) skriver [r, g, b] (0..255) i c
      const pixels = (g, w, h, fn) => {
        const img = g.createImageData(w, h), d = img.data, c = [0, 0, 0];
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          fn(x, y, c);
          const i = (y * w + x) * 4;
          d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
        }
        g.putImageData(img, 0, 0);
      };
      // Tegn noget, så det også gentages over kanten (sømløs flise)
      const wrap = (W, H, x, y, m, fn) => {
        for (const dx of [-W, 0, W]) for (const dy of (H ? [-H, 0, H] : [0])) {
          if (x + dx > -m && x + dx < W + m && y + dy > -m && y + dy < (H || 1e9) + m) fn(x + dx, y + dy);
        }
      };
      const line = (g, x0, y0, x1, y1) => { g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); };
      const SPR = ['#ffffff', '#ffe14d', '#4fc3ff', '#6ee0a0', '#b38cff', '#ff7a4d', '#ff3f7f'];
      // Et krymmel-stykke med skygge og glans
      const sprinkle = (g, x, y, a, len, wd, col) => {
        const dx = (Math.cos(a) * len) / 2, dy = (Math.sin(a) * len) / 2;
        g.lineCap = 'round';
        g.lineWidth = wd; g.strokeStyle = 'rgba(120,30,70,0.3)'; line(g, x - dx + 1.5, y - dy + 2, x + dx + 1.5, y + dy + 2);
        g.strokeStyle = col; line(g, x - dx, y - dy, x + dx, y + dy);
        g.lineWidth = wd * 0.32; g.strokeStyle = 'rgba(255,255,255,0.55)'; line(g, x - dx * 0.7 - 1, y - dy * 0.7 - 1, x + dx * 0.7 - 1, y + dy * 0.7 - 1);
      };
      // Glasur-dryp: lyserødt bånd fra toppen med dråber, der hænger ned (gentages vandret)
      const drips = (g, W, H, y0, n, maxLen, col, r) => {
        const ds = [];
        for (let i = 0; i < n; i++) ds.push([((i + r() * 0.6) / n) * W, 10 + r() * 14, r() * maxLen]);
        for (const [col2, oy] of [['rgba(120,40,70,0.3)', 4], [col, 0]]) {
          g.fillStyle = col2;
          g.fillRect(0, 0, W, y0 + oy);
          for (const [x, wd, len] of ds) wrap(W, 0, x, 0, wd, (px) => {
            g.fillRect(px - wd / 2, y0 - 2 + oy, wd, len);
            g.beginPath(); g.arc(px, y0 + len + oy, wd / 2, 0, TAU); g.fill();
          });
        }
        g.fillStyle = 'rgba(255,255,255,0.22)'; g.fillRect(0, 0, W, y0 * 0.35);
      };
      const T = {
        // Lyserød glasur med krymmel (donuts, start/mål) – flise 2,4 m
        frost: () => canvasTex('frost', 512, 512, (g, S, _, r) => {
          g.fillStyle = '#f59fc9'; g.fillRect(0, 0, S, S);
          for (let i = 0; i < 70; i++) {
            const x = r() * S, y = r() * S, rad = 20 + r() * 60, lt = r() < 0.55;
            wrap(S, S, x, y, rad, (px, py) => {
              const gr = g.createRadialGradient(px, py, 0, px, py, rad);
              gr.addColorStop(0, lt ? 'rgba(255,228,242,0.35)' : 'rgba(214,96,152,0.2)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
              g.fillStyle = gr; g.fillRect(px - rad, py - rad, rad * 2, rad * 2);
            });
          }
          for (let i = 0; i < 190; i++) {
            const x = r() * S, y = r() * S, a = r() * PI, len = 16 + r() * 12, col = SPR[Math.floor(r() * SPR.length)];
            wrap(S, S, x, y, 20, (px, py) => sprinkle(g, px, py, a, len, 6, col));
          }
        }),
        // Chokoladetern med fas (2 x 2 tern pr. flise)
        choc: () => canvasTex('choc', 512, 512, (g, S, _, r) => pixels(g, S, S, (x, y, c) => {
          const lx = x & 255, ly = y & 255, m = Math.min(lx, 255 - lx, ly, 255 - ly), n = (r() - 0.5) * 6;
          let k = 0;
          if (m < 7) k = -0.55;
          else if (m < 36) k = (m === lx || m === ly ? 0.45 : -0.4) * (1 - (m - 7) / 29);
          else if (m > 58 && m < 63) k = 0.12; else if (m >= 63 && m < 67) k = -0.12;
          c[0] = 98 + k * 80 + n; c[1] = 55 + k * 50 + n * 0.6; c[2] = 34 + k * 34 + n * 0.4;
        })),
        // Vaffelgitter (4 x 4 lommer pr. flise)
        wafer: () => canvasTex('wafer', 256, 256, (g, S, _, r) => pixels(g, S, S, (x, y, c) => {
          const lx = x & 63, ly = y & 63, e = Math.min(lx, 63 - lx, ly, 63 - ly);
          let v;
          if (e < 8) v = 1.02 - e * 0.01 + (lx < 3 || ly < 3 ? 0.06 : 0);
          else v = 0.72 + Math.min(1, (e - 8) / 10) * 0.06 - (lx < 15 || ly < 15 ? 0.09 : 0);
          v += (r() - 0.5) * 0.05;
          c[0] = 240 * v; c[1] = 188 * v; c[2] = 112 * v;
        })),
        // Vaffel-lag og creme (siden af vaffelbroer; v går over hele højden)
        waferSide: () => canvasTex('waferSide', 256, 256, (g, S, _, r) => pixels(g, S, S, (x, y, c) => {
          const yy = y + Math.sin(x * 0.07) * 1.5, layer = Math.floor((yy / S) * 9), wafer = layer % 2 === 0;
          const n = (r() - 0.5) * 14;
          if (wafer) { const rib = (x & 15) < 3 ? 18 : 0; c[0] = 226 + rib + n; c[1] = 168 + rib + n; c[2] = 96 + n; }
          else if (layer % 4 === 1) { c[0] = 247 + n; c[1] = 230 + n; c[2] = 204 + n; } else { c[0] = 196 + n; c[1] = 140 + n; c[2] = 96 + n; }
        })),
        // Lagkage set fra siden: glasur, bund, syltetøj, creme, chokoladebund (start/mål)
        sponge: () => canvasTex('sponge', 512, 256, (g, W, H, r) => {
          const L = [[30, [243, 206, 134]], [44, [214, 38, 79]], [58, [255, 244, 228]], [128, [122, 66, 40]], [142, [255, 244, 228]], [256, [243, 206, 134]]];
          pixels(g, W, H, (x, y, c) => {
            const yy = y + Math.sin(x * 0.05) * 2 + Math.sin(x * 0.013 + 1) * 3;
            const col = (L.find((l) => yy < l[0]) || L[L.length - 1])[1], n = (r() - 0.5) * 16;
            c[0] = col[0] + n; c[1] = col[1] + n; c[2] = col[2] + n;
          });
          g.fillStyle = 'rgba(90,50,20,0.25)';
          for (let i = 0; i < 700; i++) { const x = r() * W, y = r() * H; g.beginPath(); g.ellipse(x, y, 1 + r() * 2.5, 1 + r() * 1.5, 0, 0, TAU); g.fill(); }
          drips(g, W, H, 22, 12, 34, '#f59fc9', r);
        }),
        // Revnet kiks med prikhuller (smuldreplatforme) – hele toppen er én kiks
        biscuit: () => canvasTex('biscuit', 512, 512, (g, S, _, r) => {
          const nz = ctx.tileNoise(128, 6, 3, r);
          pixels(g, S, S, (x, y, c) => {
            const v = 0.92 + (nz[(y >> 2) * 128 + (x >> 2)] - 0.5) * 0.4 + (r() - 0.5) * 0.06;
            c[0] = 230 * v; c[1] = 172 * v; c[2] = 98 * v;
          });
          for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) {
            const x = 43 + i * 85, y = 43 + j * 85;
            g.fillStyle = 'rgba(255,230,180,0.5)'; g.beginPath(); g.arc(x + 1.5, y + 1.5, 7, 0, TAU); g.fill();
            g.fillStyle = 'rgba(110,60,20,0.75)'; g.beginPath(); g.arc(x, y, 6, 0, TAU); g.fill();
          }
          g.lineCap = 'round'; g.lineJoin = 'round';
          const crack = (x, y, a, steps, wd) => {
            const pts = [[x, y]];
            for (let s = 0; s < steps; s++) { a += (r() - 0.5) * 0.9; x += Math.cos(a) * 18; y += Math.sin(a) * 18; pts.push([x, y]); }
            for (const [col, w, o] of [['rgba(255,226,170,0.55)', wd * 0.5, 2.5], ['rgba(64,30,8,0.95)', wd, 0]]) {
              g.strokeStyle = col; g.lineWidth = w; g.beginPath();
              pts.forEach(([px, py], i) => (i ? g.lineTo(px + o, py + o) : g.moveTo(px + o, py + o))); g.stroke();
            }
            return pts;
          };
          for (let k = 0; k < 5; k++) {
            const side = k % 4, t = 0.2 + r() * 0.6;
            const [x, y] = [[t * S, 0], [S, t * S], [t * S, S], [0, t * S]][side];
            const pts = crack(x, y, Math.atan2(S / 2 - y, S / 2 - x) + (r() - 0.5) * 0.6, 10 + Math.floor(r() * 6), 7);
            const b = pts[3 + Math.floor(r() * 4)];
            crack(b[0], b[1], r() * TAU, 5, 4);
          }
          for (let i = 0; i < 160; i++) { g.fillStyle = r() < 0.5 ? 'rgba(255,240,210,0.6)' : 'rgba(120,70,30,0.4)'; g.fillRect(r() * S, r() * S, 2, 2); }
        }),
        // Donutside: glasur med dryp foroven, gylden dej med lys ring, mørkere bund
        donut: () => canvasTex('donut', 512, 256, (g, W, H, r) => {
          pixels(g, W, H, (x, y, c) => {
            const t = y / H, ring = Math.exp(-(((t - 0.62) / 0.07) ** 2)), dk = Math.max(0, (t - 0.72) / 0.28), n = (r() - 0.5) * 10;
            c[0] = 216 - dk * 50 + ring * 26 + n; c[1] = 146 - dk * 48 + ring * 62 + n; c[2] = 74 - dk * 30 + ring * 76 + n;
          });
          drips(g, W, H, 86, 9, 60, '#f59fc9', r);
          for (let i = 0; i < 30; i++) {
            const x = r() * W, y = 8 + r() * 66;
            wrap(W, 0, x, y, 16, (px) => sprinkle(g, px, y, r() * PI, 12, 5, SPR[Math.floor(r() * SPR.length)]));
          }
        }),
        // Bryllupskagens side: glasurkant, guirlander med perler, rosetter og satinbånd
        cake: () => canvasTex('cake', 512, 256, (g, W, H, r) => {
          g.fillStyle = '#fbf2e8'; g.fillRect(0, 0, W, H);
          for (let x = 0; x < W; x += 8) { g.fillStyle = `rgba(200,170,150,${0.03 + r() * 0.04})`; g.fillRect(x, 0, 4, H); }
          drips(g, W, H, 26, 14, 36, '#f7aed0', r);
          for (let i = 0; i < 4; i++) {
            const x0 = i * 128;
            for (const [col, wd] of [['#e58fbf', 9], ['rgba(255,255,255,0.6)', 2.5]]) {
              g.strokeStyle = col; g.lineWidth = wd; g.beginPath(); g.moveTo(x0, 100); g.quadraticCurveTo(x0 + 64, 172, x0 + 128, 100); g.stroke();
            }
            for (let k = 1; k < 10; k++) {
              const t = k / 10, px = x0 + 128 * t, py = 100 + 2 * t * (1 - t) * 72;
              g.fillStyle = '#fffaf4'; g.beginPath(); g.arc(px, py + 9, 3.5, 0, TAU); g.fill();
            }
            g.fillStyle = '#f06ea9'; g.beginPath(); g.arc(x0, 98, 13, 0, TAU); g.fill();
            g.strokeStyle = '#ffc2dc'; g.lineWidth = 3; g.beginPath(); g.arc(x0, 98, 7, 0.5, 5.5); g.stroke();
          }
          g.fillStyle = '#c7a3ec'; g.fillRect(0, 200, W, 26);
          g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(0, 205, W, 6);
          g.fillStyle = 'rgba(90,50,140,0.35)'; g.fillRect(0, 200, W, 2); g.fillRect(0, 224, W, 2);
        }),
        // Slikkepindens spiral (hele fladen, ikke tilet)
        swirl: () => canvasTex('swirl', 512, 512, (g, S) => {
          const pal = [[255, 92, 160], [255, 247, 251], [100, 222, 188], [255, 247, 251], [255, 214, 70], [255, 247, 251], [176, 132, 255], [255, 247, 251]];
          pixels(g, S, S, (x, y, c) => {
            const dx = x - 255.5, dy = y - 255.5, rr = Math.hypot(dx, dy) / 256;
            const f = ((Math.atan2(dy, dx) / TAU + 1) * 8 + rr * 6) % 8, i = Math.floor(f), sh = 1 - rr * 0.14;
            const col = rr > 0.95 || rr < 0.045 ? pal[1] : pal[i];
            c[0] = col[0] * sh; c[1] = col[1] * sh; c[2] = col[2] * sh;
          });
        }),
        // Bolsjestribe på skrå (stænger, skinner, pæle) – én flise pr. omkreds
        stripe: () => canvasTex('stripe', 128, 128, (g, S, _, r) => pixels(g, S, S, (x, y, c) => {
          const t = ((x + y) & 127) / 128, n = (r() - 0.5) * 6;
          const col = t < 0.3 ? [214, 30, 52] : (t > 0.46 && t < 0.52) || (t > 0.8 && t < 0.86) ? [240, 104, 146] : [252, 247, 242];
          c[0] = col[0] + n; c[1] = col[1] + n; c[2] = col[2] + n;
        })),
        // Sukker/flormelis: fin gråskala-støj med glimt (farves af materialet)
        sugar: () => canvasTex('sugar', 256, 256, (g, S, _, r) => pixels(g, S, S, (x, y, c) => {
          const q = r();
          const v = q < 0.012 ? 255 : q < 0.022 ? 196 : 226 + (r() - 0.5) * 26;
          c[0] = c[1] = c[2] = v;
        })),
        // Sur regnbuestrimmel med pile mod kørselsretningen (transportbånd)
        belt: () => canvasTex('belt', 256, 256, (g, S, _, r) => {
          ['#ff4d6d', '#ff9f43', '#ffe14d', '#5fdc7a', '#4fb6ff', '#b07cff'].forEach((col, i) => { g.fillStyle = col; g.fillRect((i * S) / 6, 0, S / 6 + 1, S); });
          for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(255,255,255,${0.3 + r() * 0.5})`; g.fillRect(r() * S, r() * S, 1 + r() * 2, 1 + r() * 2); }
          g.fillStyle = 'rgba(255,255,255,0.85)';
          for (const y of [64, 192]) {
            g.beginPath(); g.moveTo(60, y - 34); g.lineTo(128, y + 18); g.lineTo(196, y - 34); g.lineTo(196, y - 6);
            g.lineTo(128, y + 46); g.lineTo(60, y - 6); g.closePath(); g.fill();
          }
          g.fillStyle = '#2a1820'; g.fillRect(0, 0, 10, S); g.fillRect(S - 10, 0, 10, S);
        }),
      };

      /* ---------- Materialer (deles mellem platformene i banen) ---------- */
      const mats = {};
      const mat = (key, make) => mats[key] || (mats[key] = tr(make()));
      const std = (o) => new THREE.MeshStandardMaterial(o);
      const phys = (o) => new THREE.MeshPhysicalMaterial(o);
      const DEC = { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 };
      const SHELL = ['#f79cc2', '#9fe3c0', '#c6a8f5', '#f8e08a', '#f9b48d'];
      const MARSH = ['#fff6fa', '#ffd2e7', '#d2f6ea', '#fff0c2', '#e4dbff'];
      const JELLY = ['#ff2d55', '#2fcf6f', '#ff8a1f', '#ffc61a', '#a64dff'];
      const WRAP = ['#e8457c', '#3c7ee0', '#8b4fd0', '#1fa6a0'];
      const M = {
        frost: () => mat('frost', () => std({ map: T.frost(), roughness: 0.48 })),
        donut: () => mat('donut', () => std({ map: T.donut(), roughness: 0.55 })),
        jam: () => mat('jam', () => phys({ color: '#d0144a', roughness: 0.1, clearcoat: 1, ...DEC })),
        chocTop: () => mat('chocTop', () => std({ map: T.choc(), bumpMap: T.choc(), bumpScale: 3, roughness: 0.34 })),
        choc: () => mat('choc', () => std({ color: '#5a2f1d', roughness: 0.28 })),
        foil: () => mat('foil', () => std({ color: '#f0c050', map: T.sugar(), metalness: 1, roughness: 0.3 })),
        wrap: (i) => mat('wrap' + i, () => std({ color: WRAP[i], roughness: 0.62 })),
        white: () => mat('white', () => std({ color: '#fbf6ef', roughness: 0.6 })),
        shell: (i) => mat('shell' + i, () => std({ color: SHELL[i], map: T.sugar(), roughness: 0.72 })),
        cream: () => mat('cream', () => std({ color: '#fff4e2', roughness: 0.6 })),
        fondant: () => mat('fondant', () => std({ color: '#fff7ef', map: T.sugar(), roughness: 0.55 })),
        cakeSide: () => mat('cakeSide', () => std({ map: T.cake(), roughness: 0.5 })),
        pearl: () => mat('pearl', () => phys({ color: '#fffaf2', roughness: 0.2, clearcoat: 1 })),
        pink: () => mat('pink', () => std({ color: '#f7a3cc', roughness: 0.45, ...DEC })),
        waferTop: () => mat('waferTop', () => std({ map: T.wafer(), bumpMap: T.wafer(), bumpScale: 2, roughness: 0.8 })),
        waferSide: () => mat('waferSide', () => std({ map: T.waferSide(), roughness: 0.75 })),
        swirl: () => mat('swirl', () => phys({ map: T.swirl(), roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.08 })),
        candy: () => mat('candy', () => phys({ color: '#ff74b0', roughness: 0.2, clearcoat: 1 })),
        stick: () => mat('stick', () => std({ color: '#f8f3ea', roughness: 0.7 })),
        marsh: (i) => mat('marsh' + i, () => phys({ color: MARSH[i], map: T.sugar(), roughness: 0.9, sheen: 1, sheenColor: '#ffffff', sheenRoughness: 0.5 })),
        jelly: (i) => mat('jelly' + i, () => phys({ color: JELLY[i], roughness: 0.15, clearcoat: 1, transparent: true, opacity: 0.8, emissive: JELLY[i], emissiveIntensity: 0.12 })),
        jellyTop: (i) => mat('jellyTop' + i, () => phys({ color: new THREE.Color(JELLY[i]).lerp(new THREE.Color('#ffffff'), 0.35), map: T.sugar(), roughness: 0.6, clearcoat: 0.4 })),
        jellyCore: (i) => mat('jellyCore' + i, () => std({ color: new THREE.Color(JELLY[i]).multiplyScalar(0.5), roughness: 0.4, emissive: JELLY[i], emissiveIntensity: 0.2 })),
        bisTop: () => mat('bisTop', () => std({ map: T.biscuit(), bumpMap: T.biscuit(), bumpScale: 3, roughness: 0.9 })),
        bisSide: () => mat('bisSide', () => std({ map: T.biscuit(), color: '#d9a670', roughness: 0.9 })),
        glassTop: () => mat('glassTop', () => phys({ map: ctx.TEX.iceTop, color: '#a8f4ea', roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.03 })),
        glass: () => mat('glass', () => phys({ color: '#7fe6da', roughness: 0.05, clearcoat: 1, transparent: true, opacity: 0.72 })),
        licorice: () => mat('licorice', () => std({ color: '#231419', roughness: 0.35 })),
        stripe: () => mat('stripe', () => phys({ map: T.stripe(), roughness: 0.25, clearcoat: 0.8 })),
        licRed: () => mat('licRed', () => std({ map: T.stripe(), color: '#8a1020', roughness: 0.38 })),
        roll: () => mat('roll', () => std({ map: T.stripe(), color: '#d8a066', roughness: 0.55 })),
        sponge: () => mat('sponge', () => std({ map: T.sponge(), roughness: 0.75 })),
        cone: () => mat('cone', () => std({ map: T.wafer(), color: '#eab070', roughness: 0.8 })),
        ventTop: () => mat('ventTop', () => std({ map: T.wafer(), color: '#9a6040', roughness: 0.7, emissive: '#ff5fb0', emissiveIntensity: 0.12 })),
        glow: () => mat('glow', () => new THREE.MeshBasicMaterial({ map: ctx.TEX.glow, color: '#ff8fd6', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })),
        icing: () => mat('icing', () => std({ color: '#ffffff', roughness: 0.45, ...DEC })),
        chevron: () => mat('chev', () => std({ color: '#fff3a0', emissive: '#ffcf3a', emissiveIntensity: 1.2, ...DEC })),
        cello: () => mat('cello', () => phys({ color: '#ffffff', transparent: true, opacity: 0.5, roughness: 0.1, clearcoat: 1, iridescence: 1 })),
      };

      /* ---------- Geometri: omrids trukket gennem en profil ---------- */
      // Omrids i XZ indrykket s meter: cirkel eller kasse med runde hjørner (lukket: sidste = første)
      function ring(p, L, s) {
        const out = [];
        if (p.shape === 'cyl') {
          const R = Math.max(0.01, p.w / 2 - s), n = ctx.clamp(Math.round(p.w * 6), 24, 64);
          for (let k = 0; k <= n; k++) { const a = (k / n) * TAU; out.push(R * Math.cos(a), R * Math.sin(a)); }
          return out;
        }
        const hx = Math.max(0.01, p.w / 2 - s), hz = Math.max(0.01, L / 2 - s), rc = Math.min(0.09 + s * 0.6, hx, hz);
        const C = [[hx - rc, hz - rc], [rc - hx, hz - rc], [rc - hx, rc - hz], [hx - rc, rc - hz]];
        for (let c = 0; c < 4; c++) for (let k = 0; k <= 3; k++) {
          const a = ((c + k / 3) * PI) / 2;
          out.push(C[c][0] + rc * Math.cos(a), C[c][1] + rc * Math.sin(a));
        }
        out.push(out[0], out[1]);
        return out;
      }
      // Massivt legeme. bands: [{ m: materialindeks, pts: [[indryk, y], ...] (oppefra og ned),
      //   vr: [vTop, vBund] (normaliseret) eller vt: meter pr. flise, ut: meter pr. flise rundt }]
      // top/bot: { m, uv(x, z) } -> flad låg-flade (toppen i første bånds første punkt)
      function solid(p, L, bands, top, bot) {
        const pos = [], uv = [], idx = [], grp = [], rows = [];
        const o = ring(p, L, 0), n = o.length / 2, cum = [0];
        for (let k = 1; k < n; k++) cum.push(cum[k - 1] + Math.hypot(o[2 * k] - o[2 * k - 2], o[2 * k + 1] - o[2 * k - 1]));
        const per = cum[n - 1];
        let last = null;
        for (const b of bands) {
          const v0 = pos.length / 3, i0 = idx.length, reps = Math.max(1, Math.round(per / (b.ut || 1))), d = [0];
          for (let j = 1; j < b.pts.length; j++) d.push(d[j - 1] + Math.hypot(b.pts[j][0] - b.pts[j - 1][0], b.pts[j][1] - b.pts[j - 1][1]));
          const tot = d[d.length - 1] || 1;
          b.pts.forEach(([s, y], j) => {
            const r = ring(p, L, s), v = b.vr ? b.vr[0] + (b.vr[1] - b.vr[0]) * (d[j] / tot) : -d[j] / (b.vt || 1);
            rows.push(pos.length / 3);
            for (let k = 0; k < n; k++) { pos.push(r[2 * k], y, r[2 * k + 1]); uv.push((cum[k] / per) * reps, v); }
            last = { r, y };
          });
          for (let j = 0; j + 1 < b.pts.length; j++) for (let k = 0; k + 1 < n; k++) {
            const a = v0 + j * n + k, c = a + n;
            idx.push(a, a + 1, c, a + 1, c + 1, c);
          }
          grp.push([i0, idx.length - i0, b.m]);
        }
        const cap = (r, y, c, up) => {
          const v0 = pos.length / 3, i0 = idx.length;
          pos.push(0, y, 0); uv.push(...c.uv(0, 0));
          for (let k = 0; k < n; k++) { pos.push(r[2 * k], y, r[2 * k + 1]); uv.push(...c.uv(r[2 * k], r[2 * k + 1])); }
          for (let k = 1; k < n; k++) (up ? idx.push(v0, v0 + k + 1, v0 + k) : idx.push(v0, v0 + k, v0 + k + 1));
          grp.push([i0, idx.length - i0, c.m]);
        };
        if (top) cap(ring(p, L, bands[0].pts[0][0]), bands[0].pts[0][1], top, true);
        if (bot && last) cap(last.r, last.y, bot, false);
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
        g.setIndex(idx);
        for (const [s, c, m] of grp) g.addGroup(s, c, m);
        g.computeVertexNormals();
        const nr = g.attributes.normal; // samme normal på begge sider af sømmen
        for (const a of rows) {
          const b = a + n - 1, x = nr.getX(a) + nr.getX(b), y = nr.getY(a) + nr.getY(b), z = nr.getZ(a) + nr.getZ(b), l = Math.hypot(x, y, z) || 1;
          nr.setXYZ(a, x / l, y / l, z / l); nr.setXYZ(b, x / l, y / l, z / l);
        }
        return tr(g);
      }
      // Hjælpere til profiler og UV'er
      const side = (h2, bev, yBot) => [[bev, h2], [0, h2 - bev], [0, yBot]];
      const bowl = (y0, dep, sh, s0 = 0) => {
        const pts = [];
        for (let i = 0; i <= 5; i++) { const a = ((i / 5) * PI) / 2; pts.push([s0 + sh * (1 - Math.cos(a)), y0 - dep * Math.sin(a)]); }
        return pts;
      };
      const world = (m, t) => ({ m, uv: (x, z) => [x / t, -z / t] });
      const norm = (m, p, L) => ({ m, uv: (x, z) => [x / p.w + 0.5, 0.5 - z / L] });
      const fixed = (m, u, v) => ({ m, uv: () => [u, v] });
      const half = (p, L) => (p.shape === 'cyl' ? p.w / 2 : Math.min(p.w, L) / 2);
      // Skaler en cylinders/rørs UV, så bolsjestriben får rigtige proportioner
      const scaleUV = (g, su, sv) => { const a = g.attributes.uv; for (let i = 0; i < a.count; i++) a.setXY(i, a.getX(i) * su, a.getY(i) * sv); return g; };
      const flat = (geo, m, y) => { const d = new THREE.Mesh(tr(geo.rotateX(-PI / 2)), m); d.position.y = y; d.userData.noCastShadow = true; return d; };

      /* ---------- Udseender (et pr. variant/type) ---------- */
      // Hvert udseende giver { mats, top, main: [bånd], under: [bånd], bot, extra(g) }
      const LOOK = {
        donut(p, L, F) {
          const h2 = p.h / 2, R = half(p, L), dep = Math.min(F, p.h * 0.6, R * 0.7), k = dep > 0.15 ? p.h / (p.h + dep * 1.25) : 1;
          return {
            mats: [M.frost(), M.donut()], top: world(0, 2.4), bot: fixed(1, 0.5, 0.02),
            main: [{ m: 1, pts: side(h2, BEV, -h2), vr: [1, 1 - k], ut: 2.2 }],
            under: dep > 0.15 ? [{ m: 1, pts: bowl(-h2, dep, Math.min(R * 0.55, dep * 1.3)), vr: [1 - k, 0], ut: 2.2 }] : null,
            extra(g) { if (p.shape === 'cyl' && R >= 1.2) g.add(flat(new THREE.CircleGeometry(R * 0.26, 36), M.jam(), h2 + 0.004)); },
          };
        },
        choc(p, L, F) {
          const H = p.h, h2 = H / 2, R = half(p, L), rr = ctx.mulberry32(p.seed);
          if (p.shape === 'cyl') { // chokoladetærte i kiksebund
            const dep = Math.min(F, H * 0.3);
            return {
              mats: [M.chocTop(), M.choc(), M.bisSide()], top: world(0, 1.8), bot: world(2, 1),
              main: [{ m: 1, pts: side(h2, BEV, h2 - 0.3 * H), vt: 1, ut: 1 }, { m: 2, pts: [[0, h2 - 0.3 * H], [0, -h2]], vt: 1, ut: 1 }],
              under: dep > 0.1 ? [{ m: 2, pts: bowl(-h2, dep, R * 0.2), vt: 1, ut: 1 }] : null,
            };
          }
          const nx = Math.max(1, Math.round(p.w / 0.9)), nz = Math.max(1, Math.round(L / 0.9)), y = (f) => h2 - f * H;
          return {
            mats: [M.chocTop(), M.choc(), M.foil(), M.wrap(Math.floor(rr() * WRAP.length)), M.white()],
            top: { m: 0, uv: (x, z) => [((x / p.w + 0.5) * nx) / 2, ((0.5 - z / L) * nz) / 2] }, bot: fixed(3, 0, 0),
            main: [
              { m: 1, pts: side(h2, BEV, y(0.42)), vt: 1, ut: 1 }, { m: 2, pts: [[0, y(0.42)], [0, y(0.5)]], vt: 0.4, ut: 0.4 },
              { m: 3, pts: [[0, y(0.5)], [0, y(0.7)]], vt: 1, ut: 1 }, { m: 4, pts: [[0, y(0.7)], [0, y(0.79)]], vt: 1, ut: 1 },
              { m: 3, pts: [[0, y(0.79)], [0, -h2]], vt: 1, ut: 1 },
            ],
          };
        },
        macaron(p, L, F) {
          const H = p.h, h2 = H / 2, R = half(p, L), rr = ctx.mulberry32(p.seed), c1 = Math.floor(rr() * 5), c2 = (c1 + 1 + Math.floor(rr() * 4)) % 5;
          // En macaron: skal, fod, creme, fod, skal (fra y0 og Hm ned, indrykket s0)
          const mac = (y0, Hm, s0, m) => {
            const y = (f) => y0 - f * Hm, f = s0 + 0.035, c = s0 + Math.min(0.07, R * 0.05);
            return [
              { m, pts: [[s0 + BEV, y0], [s0, y0 - BEV], [s0, y(0.4)], [s0 + 0.02, y(0.43)], [f, y(0.47)], [c, y(0.47)]], vt: 1.2, ut: 1.2 },
              { m: 2, pts: [[c, y(0.47)], [c, y(0.63)]], vt: 1, ut: 1 },
              { m, pts: [[c, y(0.63)], [f, y(0.63)], [s0 + 0.02, y(0.67)], [s0, y(0.7)], [s0, y(1)]], vt: 1.2, ut: 1.2 },
            ];
          };
          const stack = p.v === 'macaron' && !p.move && !p.swing && F > H * 0.95;
          const H2 = H * 0.75, s2 = R * 0.12, dep = Math.min(F - (stack ? H2 : 0), H * 0.35);
          let under = [];
          if (stack) under = [{ m: 1, pts: [[0, -h2], [s2 + BEV, -h2]], vt: 1, ut: 1 }, ...mac(-h2, H2, s2, 1)];
          if (dep > 0.12) under.push({ m: stack ? 1 : 0, pts: bowl(stack ? -h2 - H2 : -h2, dep, R * 0.4, stack ? s2 : 0), vt: 1.2, ut: 1.2 });
          return { mats: [M.shell(c1), M.shell(c2), M.cream()], top: world(0, 1.2), bot: world(stack ? 1 : 0, 1.2), main: mac(h2, H, 0, 0), under };
        },
        cake(p, L, F) {
          const H = p.h, h2 = H / 2, R = half(p, L), under = [];
          let y = -h2, s = 0, used = 0;
          for (let k = 1; k <= 3; k++) { // aftagende etager nedenunder (som en omvendt lagkage)
            const hk = H * 0.75, sk = R * 0.17 * k;
            if (used + hk > F || sk > R * 0.6) break;
            under.push({ m: 0, pts: [[s, y], [sk + BEV, y]], vt: 1.6, ut: 1.6 }, { m: 1, pts: side(y, BEV, y - hk).map(([a, b]) => [a + sk, b]), vr: [1, 0], ut: 2.4 });
            y -= hk; s = sk; used += hk;
          }
          return {
            mats: [M.fondant(), M.cakeSide()], top: world(0, 1.6), bot: world(0, 1.6),
            main: [{ m: 1, pts: side(h2, BEV, -h2), vr: [1, 0], ut: 2.4 }], under,
            extra(g) {
              // Perlekant forneden (stikker højst 3 cm ud) og en lyserød glasurring på toppen
              const r = ring(p, L, 0.05), pts = [];
              let acc = 0;
              for (let k = 1; k < r.length / 2; k++) {
                const x = r[2 * k], z = r[2 * k + 1], d = Math.hypot(x - r[2 * k - 2], z - r[2 * k - 1]);
                for (acc += d; acc > 0.17; acc -= 0.17) { const t = 1 - acc / d; pts.push([r[2 * k - 2] + (x - r[2 * k - 2]) * t, z + (r[2 * k - 1] - z) * (1 - t)]); }
              }
              const im = new THREE.InstancedMesh(tr(new THREE.SphereGeometry(0.08, 8, 6)), M.pearl(), pts.length), o = new THREE.Object3D();
              pts.forEach(([x, z], i) => { o.position.set(x, -h2 + 0.085, z); o.updateMatrix(); im.setMatrixAt(i, o.matrix); });
              g.add(im);
              if (p.shape === 'cyl' && R > 1.5) g.add(flat(new THREE.RingGeometry(R - 0.5, R - 0.24, 64), M.pink(), h2 + 0.004));
            },
          };
        },
        wafer(p, L) {
          const h2 = p.h / 2;
          return { mats: [M.waferTop(), M.waferSide()], top: world(0, 0.8), bot: world(0, 0.8), main: [{ m: 1, pts: side(h2, 0.02, -h2), vr: [1, 0], ut: 1.2 }] };
        },
        lolly(p, L, F) {
          const h2 = p.h / 2, R = half(p, L), len = Math.min(F, 6 + R);
          return {
            mats: [M.swirl(), M.candy()], top: norm(0, p, L), bot: world(1, 1),
            main: [{ m: 1, pts: side(h2, 0.035, -h2), vt: 1, ut: 1 }],
            extra(g) {
              if (len < 0.6) return;
              const rs = ctx.clamp(R * 0.07, 0.08, 0.2), st = new THREE.Mesh(tr(new THREE.CylinderGeometry(rs, rs, len, 12)), M.stick());
              st.position.y = -h2 - len / 2;
              g.add(st);
            },
          };
        },
        marsh(p, L, F) {
          const H = p.h, h2 = H / 2, R = half(p, L), i = Math.floor(ctx.mulberry32(p.seed)() * 5), dep = Math.min(F, H * 0.3);
          return {
            mats: [M.marsh(i)], top: world(0, 1.4), bot: world(0, 1.4),
            main: [{ m: 0, pts: [[0.03, h2], [0.006, h2 - 0.03], [0, h2 - 0.08], [0, -h2]], vt: 1.4, ut: 1.4 }],
            under: dep > 0.1 ? [{ m: 0, pts: bowl(-h2, dep, Math.min(R * 0.3, dep * 1.2)), vt: 1.4, ut: 1.4 }] : null,
          };
        },
        jelly(p, L) {
          const H = p.h, h2 = H / 2, i = Math.floor(ctx.mulberry32(p.seed)() * 5);
          return {
            mats: [M.jellyTop(i), M.jelly(i)], top: world(0, 1), bot: world(1, 1),
            main: [{ m: 1, pts: [[0.035, h2], [0.004, h2 - 0.03], [0, h2 - 0.08], [0, -h2 + 0.08], [0.05, -h2]], vt: 1, ut: 1 }],
            extra(g) { // mørk kerne inde i geléen giver dybde
              const k = 0.62, geo = p.shape === 'cyl' ? new THREE.CylinderGeometry((p.w / 2) * k, (p.w / 2) * k, H * k, 24) : new THREE.BoxGeometry(p.w * k, H * k, L * k);
              const core = new THREE.Mesh(tr(geo), M.jellyCore(i));
              core.userData.noCastShadow = true;
              g.add(core);
            },
          };
        },
        biscuit(p, L) {
          const h2 = p.h / 2;
          return { mats: [M.bisTop(), M.bisSide()], top: norm(0, p, L), bot: world(1, 1), main: [{ m: 1, pts: side(h2, 0.025, -h2), vt: 1, ut: 1 }] };
        },
        glass(p, L, F) { // sukkerglas (glat som is)
          const h2 = p.h / 2, R = half(p, L), dep = Math.min(F, 1.8, R);
          return {
            mats: [M.glassTop(), M.glass()], top: world(0, 2), bot: world(1, 1),
            main: [{ m: 1, pts: side(h2, 0.02, -h2), vt: 1, ut: 1 }],
            extra(g) { // hængende sukkerkrystaller under
              if (dep < 0.4) return;
              const rr = ctx.mulberry32(p.seed + 3);
              for (let i = 0; i < 5; i++) {
                const a = rr() * TAU, d = rr() * R * 0.5, len = dep * (0.5 + rr() * 0.5), cr = Math.min(R * 0.25, 0.2 + rr() * 0.3);
                const c = new THREE.Mesh(tr(new THREE.ConeGeometry(cr, len, 5).rotateX(PI)), M.glass());
                c.position.set(Math.cos(a) * d, -h2 - len / 2, Math.sin(a) * d);
                c.userData.noCastShadow = true;
                g.add(c);
              }
            },
          };
        },
        belt(p, L) {
          const h2 = p.h / 2, tex = tr(T.belt().clone()), tile = 1.6;
          tex.needsUpdate = true;
          belts.push({ tex, spd: (p.belt || 3) / tile });
          const ax = p.beltAx === 'x';
          return {
            mats: [tr(std({ map: tex, roughness: 0.6 })), M.licorice(), M.stripe()], bot: world(1, 1),
            top: { m: 0, uv: ax ? (x, z) => [z / L + 0.5, -x / tile] : (x, z) => [x / p.w + 0.5, z / tile] },
            main: [{ m: 2, pts: [[0.02, h2], [0, h2 - 0.02], [0, h2 - 0.14]], vt: 0.5, ut: 0.5 }, { m: 1, pts: [[0, h2 - 0.14], [0, -h2]], vt: 1, ut: 1 }],
          };
        },
        vent(p, L) {
          const h2 = p.h / 2;
          return {
            mats: [M.ventTop(), M.choc()], top: world(0, 0.5), bot: world(1, 1), main: [{ m: 1, pts: side(h2, 0.02, -h2), vt: 1, ut: 1 }],
            extra(g) { const gl = flat(new THREE.PlaneGeometry(p.w * 0.95, L * 0.95), M.glow(), h2 + 0.02); g.add(gl); },
          };
        },
        block(p, L, F) { // start/mål: lagkage på et vaffelbæger
          const h2 = p.h / 2, R = half(p, L), hc = Math.min(F, R * 2.2, 14);
          return {
            mats: [M.frost(), M.sponge(), M.choc()], top: world(0, 2.4), bot: world(2, 1),
            main: [{ m: 1, pts: side(h2, 0.04, -h2), vr: [1, 0], ut: 2.6 }],
            extra(g) {
              if (hc < 2) return;
              const rc = R * 0.9, cone = new THREE.Mesh(tr(scaleUV(new THREE.ConeGeometry(rc, hc, 28, 1, true), (TAU * rc) / 0.8, Math.hypot(rc, hc) / 0.8).rotateX(PI)), M.cone());
              cone.position.y = -h2 - hc / 2;
              const dip = new THREE.Mesh(tr(new THREE.CylinderGeometry(rc * 0.99, rc * 0.91, hc * 0.09, 28)), M.choc());
              dip.position.y = -h2 - hc * 0.045;
              g.add(cone, dip);
            },
          };
        },
        ramp(p, L) {
          const h2 = p.h / 2;
          return { mats: [M.chocTop(), M.choc()], top: world(0, 1.8), bot: world(1, 1), main: [{ m: 1, pts: side(h2, 0.02, -h2), vt: 1, ut: 1 }] };
        },
        rail(p, L, F) {
          const h2 = p.h / 2, len = Math.min(F, 1.4);
          return {
            mats: [M.stripe()], top: world(0, 0.4), bot: world(0, 0.4), main: [{ m: 0, pts: [[0, h2], [0, -h2]], vt: 0.4, ut: 0.4 }],
            extra(g) {
              if (len < 0.3) return;
              const geo = tr(new THREE.CylinderGeometry(0.05, 0.05, len, 8));
              for (let z = -L / 2 + 0.6; z <= L / 2 - 0.5; z += 2.5) { const s = new THREE.Mesh(geo, M.licorice()); s.position.set(0, -h2 - len / 2, z); g.add(s); }
            },
          };
        },
      };
      LOOK.boost = (p, L) => {
        const s = LOOK.jelly(p, L), core = s.extra;
        s.extra = (g) => { // lysende chevroner, der peger fremad (-Z)
          core(g);
          const w = Math.min(p.w * 0.32, 1.2), sh = new THREE.Shape();
          sh.moveTo(-w, 0.35); sh.lineTo(0, -0.35); sh.lineTo(w, 0.35); sh.lineTo(w, 0.75); sh.lineTo(0, 0.05); sh.lineTo(-w, 0.75);
          for (let i = -1; i <= 1; i++) {
            const c = flat(new THREE.ShapeGeometry(sh), M.chevron(), p.h / 2 + 0.005);
            c.geometry.rotateY(PI); c.position.z = i * Math.min(1.3, L * 0.28) - 0.2;
            g.add(c);
          }
        };
        return s;
      };
      const VARS = ['donut', 'choc', 'macaron', 'cake', 'wafer', 'lolly', 'marsh', 'jelly'];
      function lookOf(p) {
        const v = VARS.includes(p.v) ? p.v : null;
        switch (p.type) {
          case 'start': case 'finish': return v || 'block';
          case 'ice': return 'glass';
          case 'crumble': return 'biscuit';
          case 'bounce': return v === 'marsh' || v === 'jelly' ? v : p.shape === 'cyl' ? 'marsh' : 'jelly';
          case 'conveyor': return 'belt';
          case 'vent': case 'ramp': case 'rail': case 'boost': return p.type;
          case 'move': return v || 'macaron';
          case 'swing': return v || 'choc';
          case 'rot': return v || 'lolly';
          default: return v || (p.shape === 'cyl' ? 'donut' : 'choc');
        }
      }

      const belts = [], spinners = [];
      let anim = null;
      // Bolsjestang langs X (stænger, vindmøllearme): rør + afrundede ender
      function caneRod(len, r, m, hook) {
        const g = new THREE.Group();
        const rod = new THREE.Mesh(tr(scaleUV(new THREE.CylinderGeometry(r, r, len, 16, 1, true), 1, len / (TAU * r)).rotateZ(PI / 2)), m);
        g.add(rod);
        const capGeo = tr(new THREE.SphereGeometry(r, 14, 8, 0, TAU, 0, PI / 2));
        const c0 = new THREE.Mesh(capGeo, m);
        c0.rotation.z = PI / 2; c0.position.x = -len / 2;
        g.add(c0);
        if (hook) { // bolsjestokkens krog hænger ned i +X-enden
          const R = Math.max(0.16, r * 3.2);
          g.add(new THREE.Mesh(tr(scaleUV(new THREE.TorusGeometry(R, r, 10, 16, PI), (PI * R) / (TAU * r), 1).rotateZ(-PI / 2).translate(len / 2, -R, 0)), m));
        } else {
          const c1 = new THREE.Mesh(capGeo, m);
          c1.rotation.z = -PI / 2; c1.position.x = len / 2;
          g.add(c1);
        }
        return g;
      }
      // Sammensmeltning af flere geometrier (med hver sin matrix) til én
      function merge(list) {
        let n = 0;
        const parts = list.map(([geo, m]) => { const g = geo.index ? geo.toNonIndexed() : geo; if (g !== geo) geo.dispose(); g.applyMatrix4(m); n += g.attributes.position.count; return g; });
        const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
        let o = 0;
        for (const g of parts) {
          pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3);
          if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
          o += g.attributes.position.count; g.dispose();
        }
        const out = new THREE.BufferGeometry();
        out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
        out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
        return tr(out);
      }
      const mtx = (x, y, z, sx, sy, sz, rz = 0) => new THREE.Matrix4().compose(new V3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new V3(0, 0, 1), rz), new V3(sx, sy, sz));
      // Candyfloss-sky: en klump kugler (bruges over bevægelige stænger)
      const puffGeo = (rr, n, S) => merge(Array.from({ length: n }, (_, i) => {
        const a = (i / n) * TAU, d = i ? S * (0.35 + rr() * 0.3) : 0, s = S * (i ? 0.38 + rr() * 0.2 : 0.6);
        return [new THREE.IcosahedronGeometry(1, 2), mtx(Math.cos(a) * d, (rr() - 0.3) * S * 0.3, Math.sin(a) * d * 0.6, s, s * 0.85, s)];
      }));

      return {
        ventColor: '#ff9bd5',
        slickColor: '#7ff5e4',

        platform(p) {
          const L = p.type === 'ramp' ? p.slopeLen : p.d;
          const F = p.type === 'ramp' || p.type === 'boost' ? 0 : Math.min(ctx.freeBelow(p), 14);
          const look = lookOf(p), s = LOOK[look](p, L, F);
          const g = new THREE.Group(), hasUnder = s.under && s.under.length;
          const main = new THREE.Mesh(solid(p, L, s.main, s.top, hasUnder ? null : s.bot), s.mats);
          main.userData.solid = true;
          g.add(main);
          if (hasUnder) g.add(new THREE.Mesh(solid(p, L, s.under, null, s.bot), s.mats));
          if (s.extra) s.extra(g);
          if (p.type === 'bounce') { // pyntet glasurring: "land her"
            const r = half(p, L) * 0.55;
            g.add(flat(new THREE.RingGeometry(r * 0.78, r, 40), M.icing(), p.h / 2 + 0.005), flat(new THREE.CircleGeometry(r * 0.22, 24), M.icing(), p.h / 2 + 0.005));
          }
          if (p.type === 'spin') { // pebermyntepæl som nav under armen
            const hub = new THREE.Mesh(tr(scaleUV(new THREE.CylinderGeometry(0.24, 0.28, 0.8, 16), 1, 0.8 / (TAU * 0.26))), M.stripe());
            hub.position.y = p.h / 2 + 0.4;
            g.add(hub);
          }
          if (p.move || p.swing) { // lyserød svæveglød under bevægelige stykker
            const gl = flat(new THREE.PlaneGeometry(1, 1), M.glow(), -p.h / 2 - 0.2);
            gl.rotation.x = PI / 2; gl.scale.set(p.w * 1.3, L * 1.3, 1);
            g.add(gl);
          }
          return g;
        },

        spinArm(p) {
          return caneRod(p.bar, 0.19, M.stripe(), false);
        },

        bar(b) {
          const look = ['cane', 'licorice', 'wafer'].includes(b.v) ? b.v : b.swing ? 'licorice' : 'cane';
          const m = look === 'cane' ? M.stripe() : look === 'licorice' ? M.licRed() : M.roll();
          const g = caneRod(b.len, b.r, m, look === 'cane' && !b.swing);
          if (b.move) { // en candyfloss-sky bærer stangen (mindst 2,5 m over)
            const cloud = new THREE.Mesh(puffGeo(ctx.mulberry32(b.index + 5), 6, 1.4), mat('cloudBar', () => std({ color: '#ffc8ea', roughness: 1 })));
            cloud.position.y = 3.6; cloud.userData.noCastShadow = true;
            g.add(cloud);
            for (const sx of [-0.4, 0.4]) {
              const s = new THREE.Mesh(tr(new THREE.CylinderGeometry(0.025, 0.025, 3.2, 6)), M.licorice());
              s.position.set(sx * b.len, 1.6, 0);
              g.add(s);
            }
          }
          return g;
        },

        zip(z) {
          // Lakridssnøre mellem to bolsjestokke; stokkene står lidt uden for enderne og går opad
          const g = new THREE.Group(), A = new V3(z.ax, z.ay, z.az), B = new V3(z.bx, z.by, z.bz);
          const dir = B.clone().sub(A), len = dir.length();
          dir.divideScalar(len);
          const P0 = A.clone().addScaledVector(dir, -0.6), P1 = B.clone().addScaledVector(dir, 0.6);
          const cable = new THREE.Mesh(tr(new THREE.CylinderGeometry(0.035, 0.035, len + 1.2, 8)), M.licorice());
          cable.position.copy(P0).add(P1).multiplyScalar(0.5);
          cable.quaternion.setFromUnitVectors(new V3(0, 1, 0), dir);
          g.add(cable);
          const yaw = Math.atan2(-dir.z, dir.x);
          for (const [P, s] of [[P0, -1], [P1, 1]]) {
            const post = new THREE.Group(), r = 0.12, hgt = 2.6;
            post.add(new THREE.Mesh(tr(scaleUV(new THREE.CylinderGeometry(r, r, hgt, 14), 1, hgt / (TAU * r)).translate(0, hgt / 2 - 0.25, 0)), M.stripe()));
            const R = 0.42, hook = new THREE.Mesh(tr(scaleUV(new THREE.TorusGeometry(R, r, 10, 16, PI), (PI * R) / (TAU * r), 1).translate(-R * s, hgt - 0.25, 0)), M.stripe());
            post.add(hook);
            post.position.copy(P); post.rotation.y = yaw;
            g.add(post);
          }
          return g;
        },

        anchor(a) {
          // Indpakket pebermyntebolsje i ringens plan (drejer langsomt)
          const g = new THREE.Group(), spin = new THREE.Group();
          const disc = new THREE.Mesh(tr(new THREE.CylinderGeometry(0.26, 0.26, 0.14, 28).rotateX(PI / 2)), [M.candy(), M.swirl(), M.swirl()]);
          spin.add(disc);
          for (const s of [-1, 1]) {
            const tw = new THREE.Mesh(tr(new THREE.ConeGeometry(0.12, 0.2, 10).rotateZ((s * PI) / 2)), M.cello());
            tw.position.x = s * 0.37; tw.userData.noCastShadow = true;
            spin.add(tw);
          }
          g.add(spin);
          spinners.push(spin);
          return g;
        },

        decor(data) {
          return buildDecor(data);
        },

        update(dt, t) {
          for (const b of belts) b.tex.offset.y += b.spd * dt;
          for (const s of spinners) s.rotation.z += dt * 0.8;
          if (anim) anim(dt, t);
        },
      };

      /* ---------- Kulisser: kop med chokoladevandfald, candyfloss, slikøer ---------- */
      function buildDecor(data) {
        const root = new THREE.Group(), b = data.bounds, rng = ctx.mulberry32(9100 + ctx.levelIndex * 7), lava = ctx.lavaY;
        const R0 = b.radius, cx = b.cx, cz = b.cz, o = new THREE.Object3D(), col = new THREE.Color();
        const at = (a, r) => [cx + Math.cos(a) * r, cz + Math.sin(a) * r];
        const start = data.plats[0], fw = ctx.fwdVec(data.startHeading), aFwd = Math.atan2(fw.z, fw.x);
        // Stedet er frit, hvis det ligger langt nok fra banen
        const free = (x, y, z, m) => ctx.clearOfCourse(x, y, z, m);

        // --- Kæmpekoppen, der hælder chokolade ud (foran-højre for starten) ---
        const aCup = aFwd + 0.55, [kx, kz] = [start.x + Math.cos(aCup) * (R0 + 70), start.z + Math.sin(aCup) * (R0 + 70)];
        const cupY = b.maxY + 26, toC = new V3(cx - kx, 0, cz - kz).normalize();
        const cup = new THREE.Group(), tilt = new THREE.Group();
        cup.position.set(kx, cupY, kz); cup.rotation.y = Math.atan2(-toC.z, toC.x);
        tilt.rotation.z = -0.62;
        cup.add(tilt); root.add(cup);
        const porcelain = std({ color: '#c4f2e2', roughness: 0.22 }), inner = std({ color: '#fffafc', roughness: 0.2, side: THREE.DoubleSide });
        const gold = std({ color: '#f2c45a', metalness: 1, roughness: 0.25 }), chocLiq = std({ color: '#5e2e1a', roughness: 0.15 });
        const prof = [[0.01, 0], [6, 0], [7, 0.8], [9.5, 3.5], [12.3, 9], [14, 15], [14.5, 18]].map(([x, y]) => new THREE.Vector2(x, y));
        tilt.add(new THREE.Mesh(tr(new THREE.LatheGeometry(prof, 48)), porcelain));
        const inProf = [[0.01, 1.2], [8, 1.4], [11.6, 9], [13.4, 15], [13.9, 18]].map(([x, y]) => new THREE.Vector2(x, y));
        tilt.add(new THREE.Mesh(tr(new THREE.LatheGeometry(inProf, 48)), inner));
        const rim = new THREE.Mesh(tr(new THREE.TorusGeometry(14.2, 0.45, 10, 64).rotateX(PI / 2)), gold);
        rim.position.y = 18; tilt.add(rim);
        const surf = new THREE.Mesh(tr(new THREE.CircleGeometry(13.1, 48).rotateX(-PI / 2)), chocLiq);
        surf.position.y = 14.5; tilt.add(surf);
        const handle = new THREE.Mesh(tr(new THREE.TorusGeometry(4.6, 1.1, 12, 28, PI * 1.25).rotateZ(-PI * 0.62)), porcelain);
        handle.position.set(-14.6, 9.5, 0); tilt.add(handle);
        for (let i = 0; i < 9; i++) { // lyserøde prikker på koppen
          const d = new THREE.Mesh(tr(new THREE.CircleGeometry(1.3, 20)), std({ color: '#ff9fcf', roughness: 0.3 }));
          const a = (i / 9) * TAU + 0.3, y = 6 + (i % 3) * 3.6, rr = 9.4 + (y - 3.5) * 0.48;
          d.position.set(Math.cos(a) * (rr + 0.08), y, Math.sin(a) * (rr + 0.08)); d.lookAt(Math.cos(a) * 40, y, Math.sin(a) * 40);
          tilt.add(d);
        }
        const saucer = new THREE.Mesh(tr(new THREE.LatheGeometry([[0.01, -1.2], [10, -1.2], [19, 0.4], [21, 1.4], [20.6, 1.6], [10, 0], [0.01, 0]].map(([x, y]) => new THREE.Vector2(x, y)), 48)), std({ color: '#ffc3df', roughness: 0.25 }));
        saucer.position.set(-4, -5, 0); saucer.rotation.z = -0.15; cup.add(saucer);
        // Chokoladestrålen fra kopkanten ned i havet
        cup.updateMatrixWorld(true);
        const lip = new V3(14.6, 17.6, 0).applyMatrix4(tilt.matrixWorld), down = lava + 0.6;
        const P = (f, dy) => new V3(lip.x + toC.x * f, dy, lip.z + toC.z * f);
        const curve = new THREE.CatmullRomCurve3([lip.clone(), P(3.5, lip.y - 2.2), P(6.5, lip.y - 8), P(8.3, lip.y - 22), P(9, (lip.y + down) / 2), P(9.2, down)]);
        const flowTex = tr(T.sugar().clone());
        flowTex.needsUpdate = true; flowTex.repeat.set(3, 8);
        const flowMat = std({ color: '#6b3420', map: flowTex, roughness: 0.16, emissive: '#2a1008', emissiveIntensity: 0.3 });
        root.add(new THREE.Mesh(tr(new THREE.TubeGeometry(curve, 90, 2.3, 14, false)), flowMat));
        const end = P(9.2, down + 0.6);
        const pool = new THREE.Mesh(tr(new THREE.CircleGeometry(15, 48).rotateX(-PI / 2)), chocLiq);
        pool.position.copy(end); root.add(pool);
        const ripples = [0, 1, 2].map((i) => {
          const m = new THREE.Mesh(tr(new THREE.RingGeometry(0.8, 1, 48).rotateX(-PI / 2)), new THREE.MeshBasicMaterial({ color: '#9a5a36', transparent: true, depthWrite: false }));
          m.position.copy(end).y += 0.1 + i * 0.02; root.add(m);
          return m;
        });
        const foam = new THREE.InstancedMesh(tr(new THREE.IcosahedronGeometry(1, 1)), std({ color: '#8a4a2a', roughness: 0.3 }), 14);
        for (let i = 0; i < 14; i++) {
          const a = (i / 14) * TAU, d = 2.5 + rng() * 2.5, s = 0.8 + rng() * 1.4;
          o.position.set(end.x + Math.cos(a) * d, end.y + rng() * 0.8, end.z + Math.sin(a) * d); o.scale.set(s, s * 0.7, s); o.updateMatrix();
          foam.setMatrixAt(i, o.matrix);
        }
        root.add(foam);

        // --- Candyfloss-skyer: i horisonten, under banen og tre på pinde ---
        const clusters = [];
        for (let i = 0; i < 12; i++) { const a = rng() * TAU, [x, z] = at(a, R0 + 90 + rng() * 260); clusters.push([x, b.maxY + 8 + rng() * 55, z, 10 + rng() * 14, 9]); }
        for (let i = 0; i < 9; i++) { const a = rng() * TAU, [x, z] = at(a, rng() * (R0 + 100)); clusters.push([x, lava + 20 + rng() * 10, z, 8 + rng() * 8, 7]); }
        const sticks = [];
        for (let i = 0; i < 3; i++) {
          const a = aFwd + PI * (0.6 + i * 0.4) + rng() * 0.4, [x, z] = at(a, R0 + 120 + rng() * 120), y = b.maxY + 18 + rng() * 22;
          clusters.push([x, y, z, 14 + rng() * 6, 12]); sticks.push([x, y, z]);
        }
        const nPuff = clusters.reduce((s, c) => s + c[4], 0);
        const floss = new THREE.InstancedMesh(tr(new THREE.IcosahedronGeometry(1, 2)), std({ color: '#ffffff', roughness: 1, emissive: '#3a2a3a', emissiveIntensity: 0.25 }), nPuff);
        const FL = ['#ffc4e6', '#ffb3dc', '#dcc8ff', '#c8e6ff', '#ffd9ef'];
        let k = 0;
        for (const [x, y, z, S, n] of clusters) for (let i = 0; i < n; i++) {
          const a = rng() * TAU, d = i ? S * (0.3 + rng() * 0.45) : 0, s = S * (i ? 0.32 + rng() * 0.22 : 0.55);
          o.position.set(x + Math.cos(a) * d, y + (rng() - 0.4) * S * 0.35, z + Math.sin(a) * d); o.scale.set(s, s * 0.82, s); o.updateMatrix();
          floss.setMatrixAt(k, o.matrix); floss.setColorAt(k++, col.set(FL[Math.floor(rng() * FL.length)]));
        }
        root.add(floss);
        for (const [x, y, z] of sticks) {
          const h = y - lava, st = new THREE.Mesh(tr(new THREE.CylinderGeometry(0.9, 1.6, h, 12)), M.stick());
          st.position.set(x, lava + h / 2 - 6, z); root.add(st);
        }

        // --- Slikøer med gumdrops, vingummibamser, slikkepinde og bolsjestokke ---
        const DROP = ['#ff4f7b', '#ffb84d', '#ffe14d', '#5fdc7a', '#4fb6ff', '#b07cff', '#ff7ad9'];
        const drops = [], bears = [], lollies = [], canes = [];
        const islandMats = [M.frost(), std({ color: '#c9f3e2', map: T.sugar(), roughness: 0.5 }), std({ color: '#fff0b8', map: T.sugar(), roughness: 0.5 })];
        const brownie = std({ color: '#6a3a26', roughness: 0.9, map: T.sugar() });
        for (let i = 0, made = 0; i < 14 && made < 6; i++) {
          const a = (made / 6) * TAU + aFwd + rng() * 0.5, Ri = 9 + rng() * 8, [x, z] = at(a, R0 + 45 + rng() * 110);
          const y = b.minY - 4 + rng() * (b.maxY - b.minY + 14);
          if (!free(x, y, z, Ri + 10)) continue;
          made++;
          const isl = new THREE.Group();
          isl.position.set(x, y, z);
          const body = new THREE.Mesh(tr(scaleUV(new THREE.CylinderGeometry(Ri, Ri, 3.2, 40, 1), Math.round((TAU * Ri) / 2.6), 1)), [M.sponge(), islandMats[made % 3], M.choc()]);
          body.geometry.attributes.uv.array.forEach(() => {});
          isl.add(body);
          const rock = new THREE.Mesh(tr(ctx.rockGeometry(Ri * 0.95, Ri * 1.3, made * 13 + 1)), brownie);
          rock.position.y = -1.6 - Ri * 0.65; isl.add(rock);
          root.add(isl);
          const topY = y + 1.6;
          for (let j = 0; j < 12; j++) { const aa = rng() * TAU, d = Math.sqrt(rng()) * Ri * 0.85; drops.push([x + Math.cos(aa) * d, topY, z + Math.sin(aa) * d, 0.9 + rng() * 1.2]); }
          for (let j = 0; j < 3; j++) { const aa = rng() * TAU, d = rng() * Ri * 0.7; bears.push([x + Math.cos(aa) * d, topY, z + Math.sin(aa) * d, 1.3 + rng() * 1.0, rng() * TAU]); }
          for (let j = 0; j < 2; j++) { const aa = rng() * TAU, d = Ri * (0.3 + rng() * 0.5); lollies.push([x + Math.cos(aa) * d, topY, z + Math.sin(aa) * d, 5 + rng() * 3, 1.6 + rng() * 0.8, rng() * TAU]); }
          canes.push([x + Ri * 0.5, topY, z - Ri * 0.3, 0.65, rng() * TAU]);
        }
        // Kæmpebamser, der vader i havet, og kæmpe-slikkepinde/-stokke, der rejser sig af det
        for (let i = 0; i < 4; i++) { const a = aFwd + PI * 0.3 + i * 1.4 + rng() * 0.5, [x, z] = at(a, R0 + 120 + rng() * 140), s = 14 + rng() * 8; bears.push([x, lava - s * 0.5, z, s, Math.atan2(cx - x, cz - z)]); }
        for (let i = 0; i < 5; i++) { const a = aFwd + 0.9 + i * 1.25 + rng() * 0.4, [x, z] = at(a, R0 + 150 + rng() * 200); lollies.push([x, lava, z, b.maxY - lava + 25 + rng() * 40, 10 + rng() * 6, Math.atan2(cx - x, cz - z)]); }
        for (let i = 0; i < 4; i++) { const a = aFwd + 2.2 + i * 1.5 + rng() * 0.5, [x, z] = at(a, R0 + 130 + rng() * 180); canes.push([x, lava - 10, z, 6 + rng() * 3, rng() * TAU]); }

        const sugar = std({ color: '#ffffff', map: T.sugar(), roughness: 0.6 });
        const dropGeo = tr(new THREE.LatheGeometry([[0.01, 0], [0.5, 0], [0.5, 0.06], [0.47, 0.3], [0.38, 0.55], [0.22, 0.72], [0.01, 0.78]].map(([x, y]) => new THREE.Vector2(x, y)), 14));
        const dropsM = new THREE.InstancedMesh(dropGeo, sugar, drops.length);
        drops.forEach(([x, y, z, s], i) => { o.position.set(x, y, z); o.rotation.set(0, 0, 0); o.scale.setScalar(s); o.updateMatrix(); dropsM.setMatrixAt(i, o.matrix); dropsM.setColorAt(i, col.set(DROP[i % DROP.length])); });
        root.add(dropsM);
        // Vingummibamse af kugler (krop, hoved, ører, snude, arme, ben); ca. 1,9 m høj ved skala 1
        const bearGeo = merge([
          [0, 0.78, 0, 0.5, 0.62, 0.42, 0], [0, 1.5, 0, 0.38, 0.36, 0.36, 0], [-0.27, 1.8, 0, 0.13, 0.13, 0.1, 0], [0.27, 1.8, 0, 0.13, 0.13, 0.1, 0],
          [0, 1.43, 0.3, 0.17, 0.13, 0.12, 0], [-0.47, 1.02, 0.06, 0.16, 0.25, 0.16, -0.5], [0.47, 1.02, 0.06, 0.16, 0.25, 0.16, 0.5],
          [-0.26, 0.24, 0.08, 0.2, 0.25, 0.22, 0], [0.26, 0.24, 0.08, 0.2, 0.25, 0.22, 0],
        ].map(([x, y, z, sx, sy, sz, rz]) => [new THREE.SphereGeometry(1, 12, 9), mtx(x, y, z, sx, sy, sz, rz)]));
        const bearM = new THREE.InstancedMesh(bearGeo, phys({ color: '#ffffff', roughness: 0.18, clearcoat: 1, transparent: true, opacity: 0.88 }), bears.length);
        bears.forEach(([x, y, z, s, yaw], i) => { o.position.set(x, y, z); o.rotation.set(0, yaw, 0); o.scale.setScalar(s); o.updateMatrix(); bearM.setMatrixAt(i, o.matrix); bearM.setColorAt(i, col.set(JELLY[i % JELLY.length])); });
        root.add(bearM);
        // Slikkepinde: pind + spiralskive (instanser)
        const stickM = new THREE.InstancedMesh(tr(new THREE.CylinderGeometry(1, 1, 1, 8).translate(0, 0.5, 0)), M.stick(), lollies.length);
        const discM = new THREE.InstancedMesh(tr(new THREE.CylinderGeometry(1, 1, 0.22, 36).rotateX(PI / 2)), [M.candy(), M.swirl(), M.swirl()], lollies.length);
        lollies.forEach(([x, y, z, h, r, yaw], i) => {
          const rs = Math.max(0.12, r * 0.07);
          o.position.set(x, y, z); o.rotation.set(0, yaw, 0); o.scale.set(rs, h, rs); o.updateMatrix(); stickM.setMatrixAt(i, o.matrix);
          o.position.y = y + h; o.scale.setScalar(r); o.updateMatrix(); discM.setMatrixAt(i, o.matrix);
        });
        root.add(stickM, discM);
        // Bolsjestok: lige stykke + halvcirkel-krog som rør
        const caneCurve = new THREE.Curve();
        caneCurve.getPoint = (t, out = new V3()) => {
          const s = t * (8 + PI * 1.5);
          if (s < 8) return out.set(0, s, 0);
          const f = (s - 8) / 1.5;
          return out.set(1.5 - 1.5 * Math.cos(f), 8 + 1.5 * Math.sin(f), 0);
        };
        const caneGeo = tr(scaleUV(new THREE.TubeGeometry(caneCurve, 40, 0.42, 12, false), (8 + PI * 1.5) / (TAU * 0.42), 1));
        const caneM = new THREE.InstancedMesh(caneGeo, M.stripe(), canes.length);
        canes.forEach(([x, y, z, s, yaw], i) => { o.position.set(x, y, z); o.rotation.set(0, yaw, 0); o.scale.setScalar(s); o.updateMatrix(); caneM.setMatrixAt(i, o.matrix); });
        root.add(caneM);

        // --- Krymmel-glimt i luften (holdt fri af selve banen) ---
        const sp = [], sc = [];
        for (let i = 0; i < 900 && sp.length < 520; i++) {
          const x = cx + (rng() - 0.5) * R0 * 2.2, y = b.minY - 12 + rng() * (b.maxY - b.minY + 40), z = cz + (rng() - 0.5) * R0 * 2.2;
          if (!free(x, y, z, 2)) continue;
          sp.push(x, y, z); col.set(SPR[Math.floor(rng() * SPR.length)]); sc.push(col.r, col.g, col.b);
        }
        const spGeo = tr(new THREE.BufferGeometry());
        spGeo.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
        spGeo.setAttribute('color', new THREE.Float32BufferAttribute(sc, 3));
        const sparkles = new THREE.Points(spGeo, new THREE.PointsMaterial({ size: 0.55, map: ctx.TEX.glow, vertexColors: true, transparent: true, depthWrite: false, opacity: 0.95 }));
        root.add(sparkles);

        // --- Opvind som stigende sodabobler ---
        const bub = [];
        for (const w of data.winds) for (let i = 0; i < 40; i++) {
          const a = rng() * TAU, d = Math.sqrt(rng()) * w.r;
          bub.push({ x: w.x + Math.cos(a) * d, z: w.z + Math.sin(a) * d, y0: w.y, h: w.h, f: rng(), v: 0.15 + rng() * 0.2 });
        }
        let bubPts = null;
        if (bub.length) {
          const g = tr(new THREE.BufferGeometry());
          g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(bub.length * 3), 3));
          bubPts = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.35, map: ctx.TEX.glow, color: '#ffd6f0', transparent: true, depthWrite: false }));
          bubPts.frustumCulled = false;
          root.add(bubPts);
        }

        // --- Himlen: pastel-regnbue langt væk og en blød glorie om solen ---
        const rbGeo = tr(new THREE.RingGeometry(560, 660, 96, 6, 0, PI)), rc = [];
        const RB = ['#c7a8ff', '#9fd0ff', '#a8f0c8', '#fff3a0', '#ffc89a', '#ff9fc0'].map((c) => new THREE.Color(c));
        const rp = rbGeo.attributes.position;
        for (let i = 0; i < rp.count; i++) { const t = (Math.hypot(rp.getX(i), rp.getY(i)) - 560) / 100, c = RB[ctx.clamp(Math.floor(t * 5.999), 0, 5)]; rc.push(c.r, c.g, c.b); }
        rbGeo.setAttribute('color', new THREE.Float32BufferAttribute(rc, 3));
        const rainbow = new THREE.Mesh(rbGeo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.32, fog: false, depthWrite: false, side: THREE.DoubleSide }));
        const aRb = aFwd + 0.15, [rx, rz] = at(aRb, 1300);
        rainbow.position.set(rx, lava - 80, rz); rainbow.lookAt(cx, lava - 80, cz);
        root.add(rainbow);
        const th = ctx.theme, el = (th.sunElev * PI) / 180, az = (th.sunAz * PI) / 180;
        const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: ctx.TEX.glow, color: '#ffe6f4', transparent: true, opacity: 0.55, fog: false, depthWrite: false }));
        halo.position.set(cx + Math.sin(az) * Math.cos(el) * 1500, Math.sin(el) * 1500, cz - Math.cos(az) * Math.cos(el) * 1500);
        halo.scale.set(520, 520, 1);
        root.add(halo);
        for (const m of [floss, dropsM, bearM, stickM, discM, caneM, foam]) m.frustumCulled = false;

        // Animation: strømmende chokolade, ringe i plaskebassinet, svævende skyer og glimt, bobler
        anim = (dt, t) => {
          flowTex.offset.x -= dt * 0.45;
          ripples.forEach((m, i) => {
            const f = (t * 0.35 + i / 3) % 1;
            m.scale.setScalar(4 + f * 16); m.material.opacity = 0.55 * (1 - f);
          });
          floss.position.y = Math.sin(t * 0.25) * 1.2;
          sparkles.rotation.y = Math.sin(t * 0.05) * 0.03;
          sparkles.position.y = Math.sin(t * 0.4) * 0.8;
          if (bubPts) {
            const a = bubPts.geometry.attributes.position;
            bub.forEach((q, i) => { const f = (q.f + t * q.v) % 1; a.setXYZ(i, q.x + Math.sin(t + i) * 0.15, q.y0 + f * q.h, q.z); });
            a.needsUpdate = true;
          }
        };
        return root;
      }
    },
  };
})();
