/* =====================================================================
   VERDENSSÆT 'meadow' – Himmelengen (bane 1)
   Daggry over svævende gårdøer: græstørv på jordkegler med rødder og
   vandfald, plankebroer, høballer, rød lade, veranda, savet træstamme,
   svampe, vindmølle, får, æbletræ, menhirer, luftballon og morgendis.
   Ingen grå sten nogen steder: kun jord, træ, strå, tegl og mos.
   ===================================================================== */
(function () {
  'use strict';

  // Daggry: bleg blå zenit, fersken horisont, lav varm sol og dis
  window.SKYHOJ_THEMES.meadow = {
    top: '#7fb8e8', horizon: '#ffd9a8', bottom: '#f4c9a0', sunElev: 10, sunAz: 55, sunColor: '#ffd9a6', sunInt: 2.8,
    hemiSky: '#d6e6ff', hemiInt: 1.0, fog: '#f7dcbe', fogNear: 70, fogFar: 560, cloud: '#fff1e2', clouds: 0.9, stars: 0.12,
    stone: '#dcc9a0', exposure: 1.04, lavaGlow: 0.8,
  };

  window.SKYHOJ_KITS.meadow = {
    id: 'meadow',
    name: 'Himmelengen',
    variants: {
      turf: 'Græstørv med blomsterprikker på en jordkegle med rødder og tyndt vandfald (standard for p). Kasse eller shape:"cyl", w 4-12',
      flowers: 'Blomsterengen: som turf, men med tætte valmuer, tusindfryd og kløver. Kasse/cyl, w 4-10',
      bridge: 'Plankebro: planker på tværs, rebsløjfer langs kanten og en bueunderstøtning med hængere. Kasse w 3-6, d 6-20, h 0.4-0.8',
      hay: 'Høballe på ende: rund bale-top med strå-spiral og sejlgarn. shape:"cyl" w 3-5, h 1.5-2.5 (kasse = firkantet bale, w 2-4)',
      barn: 'Rød lade: røde brædder, hvide hjørner, port med kryds, tegltag er platformen. Kasse w 6-10, d 6-10, h 2.5-4.5 (cyl = silo)',
      porch: 'Hvidkantet træveranda med løber (standard for start): kasse w 6-10, d 6-10, h 0.6-2.4',
      hill: 'Bakketop med cirkel af sandfarvede fliser (standard for finish) og et grønt, mosbevokset bakkesæt. w 8-12',
      log: 'Savet træstamme: bark på siderne, årringe i enderne, flad top. Kasse w 1.4-3, d 4-14, h 0.6-1',
    },
    barVariants: {
      fence: 'Skrællet hegnsstolpe med jernmuffer, endeblokke og røde vimpler (standard for stænger og trapez)',
      branch: 'Æblegren med blade, hængende æbler og blomster',
    },
    create(ctx) {
      const { THREE } = ctx;
      const PI = Math.PI, TAU = PI * 2;
      const clamp = ctx.clamp, lerp = ctx.lerp;
      const V3 = THREE.Vector3;
      const tr = (o) => ctx.track(o);
      const rr = (r, a, b) => a + r() * (b - a);

      /* ---------- Teksturer (tegnes først, når de bruges; max 12) ---------- */
      const texCache = {};
      const pix = (g, w, h, fn) => { // pixel for pixel: fn(x, y, c) skriver [r, g, b, (a)] i 0..255
        const img = g.createImageData(w, h), d = img.data, c = [0, 0, 0, 255];
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            fn(x, y, c);
            const i = (y * w + x) * 4;
            d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = c[3]; c[3] = 255;
          }
        }
        g.putImageData(img, 0, 0);
      };
      // Tegn noget, så det også gentages over kanten (sømløs flise)
      const wrap = (w, h, x, y, m, fn) => {
        for (const dx of [-w, 0, w]) for (const dy of [-h, 0, h]) {
          if (x + dx > -m && x + dx < w + m && y + dy > -m && y + dy < h + m) fn(x + dx, y + dy);
        }
      };
      const dot = (g, x, y, r) => { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); };
      const line = (g, x0, y0, x1, y1) => { g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); };

      const PAINT = {
        // Græstørv: lysegrøn med strå, dug og blomster (flise 3 m)
        turf: [512, 512, (g, w, h, r) => {
          const n1 = ctx.tileNoise(w, 4, 4, r), n2 = ctx.tileNoise(w, 14, 2, r);
          pix(g, w, h, (x, y, c) => {
            const i = y * w + x, t = clamp(n1[i] * 1.5 + (n2[i] - 0.5) * 0.6 - 0.25, 0, 1);
            c[0] = lerp(72, 146, t); c[1] = lerp(138, 200, t); c[2] = lerp(46, 80, t);
          });
          g.lineCap = 'round';
          for (let i = 0; i < 4200; i++) {
            const x = r() * w, y = r() * h, a = -PI / 2 + (r() - 0.5) * 1.1, l = rr(r, 4, 10);
            g.strokeStyle = r() < 0.5 ? `rgba(38,98,30,${rr(r, 0.25, 0.5)})` : `rgba(196,238,116,${rr(r, 0.25, 0.55)})`;
            g.lineWidth = rr(r, 1, 1.8);
            wrap(w, h, x, y, 12, (px, py) => line(g, px, py, px + Math.cos(a) * l, py + Math.sin(a) * l));
          }
          // blomsterprikker: tusindfryd, smørblomst, kløver, forglemmigej
          for (let i = 0; i < 150; i++) {
            const x = r() * w, y = r() * h, k = (r() * 4) | 0;
            wrap(w, h, x, y, 6, (px, py) => {
              if (k === 0) {
                g.strokeStyle = '#fffdf2'; g.lineWidth = 1.4;
                for (let q = 0; q < 7; q++) line(g, px, py, px + Math.cos(q * 0.9) * 3.6, py + Math.sin(q * 0.9) * 3.6);
                g.fillStyle = '#ffd23a'; dot(g, px, py, 1.5);
              } else if (k === 1) { g.fillStyle = '#ffd62e'; dot(g, px, py, 2.4); g.fillStyle = '#fff3a0'; dot(g, px - 0.6, py - 0.6, 1); }
              else if (k === 2) { g.fillStyle = '#f08ab4'; dot(g, px, py, 2.6); g.fillStyle = '#c85a8a'; dot(g, px, py, 1.1); }
              else { g.fillStyle = '#7ab2ff'; dot(g, px, py, 1.9); g.fillStyle = '#ffe680'; dot(g, px, py, 0.7); }
            });
          }
          g.fillStyle = 'rgba(255,255,255,0.5)';
          for (let i = 0; i < 120; i++) dot(g, r() * w, r() * h, 0.8);
        }],
        // Græskant + jord til siden af en tørv (flise 2,4 m, græsbåndet øverst)
        turfSide: [512, 512, (g, w, h, r) => {
          const n1 = ctx.tileNoise(w, 5, 4, r);
          pix(g, w, h, (x, y, c) => {
            const t = n1[y * w + x];
            c[0] = lerp(88, 150, t); c[1] = lerp(58, 104, t); c[2] = lerp(34, 64, t);
          });
          g.lineCap = 'round';
          for (let i = 0; i < 70; i++) { // sten i jorden – varme ler-farver, aldrig grå
            const x = r() * w, y = rr(r, 100, h), s = rr(r, 3, 9);
            wrap(w, h, x, y, 12, (px, py) => {
              g.fillStyle = 'rgba(70,40,20,0.45)'; g.beginPath(); g.ellipse(px + 1, py + 1.5, s, s * 0.7, 0, 0, TAU); g.fill();
              g.fillStyle = r() < 0.5 ? '#cfae7e' : '#b98f5e'; g.beginPath(); g.ellipse(px, py, s, s * 0.7, 0, 0, TAU); g.fill();
            });
          }
          g.strokeStyle = 'rgba(190,150,96,0.8)'; // rodtråde
          for (let i = 0; i < 16; i++) {
            const x = r() * w, y0 = 50 + r() * 40, l = rr(r, 40, 150), s = rr(r, -0.4, 0.4);
            g.lineWidth = rr(r, 1.5, 3.2);
            wrap(w, h, x, y0, 30, (px, py) => { g.beginPath(); g.moveTo(px, py); g.bezierCurveTo(px + s * 60, py + l * 0.3, px - s * 40, py + l * 0.6, px + s * 30, py + l); g.stroke(); });
          }
          // græsbånd med frynset kant og hængende totter
          const edge = (x) => 78 + Math.sin(x / w * TAU * 5) * 7 + Math.sin(x / w * TAU * 13 + 1.3) * 5;
          g.fillStyle = 'rgba(30,18,8,0.35)'; // skygge under græsset
          for (let x = 0; x < w; x++) g.fillRect(x, 0, 1, edge(x) + 9);
          for (let x = 0; x < w; x++) {
            const gr = g.createLinearGradient(0, 0, 0, edge(x));
            gr.addColorStop(0, '#9fdc5a'); gr.addColorStop(1, '#4f9a2c');
            g.fillStyle = gr; g.fillRect(x, 0, 1, edge(x));
          }
          for (let i = 0; i < 260; i++) {
            const x = r() * w, l = rr(r, 10, 34);
            g.strokeStyle = r() < 0.5 ? '#3e8a26' : '#b6ea6e'; g.lineWidth = rr(r, 1.2, 2.4);
            wrap(w, h, x, edge(x) - 6, 6, (px, py) => line(g, px, py, px + (r() - 0.5) * 6, py + l));
          }
        }],
        // Jord med lodrette årer, rødder og grønt mos øverst (v 0..1 = hele keglens dybde, ingen gentagelse)
        soil: [512, 512, (g, w, h, r) => {
          const n1 = ctx.tileNoise(w, 4, 4, r), n2 = ctx.tileNoise(w, 12, 3, r);
          pix(g, w, h, (x, y, c) => {
            const i = y * w + x, t = clamp(n1[i] * 1.3 + (n2[i] - 0.5) * 0.7, 0, 1), d = y / h; // d: 0 øverst
            const moss = clamp(1 - (d - 0.1) / 0.22, 0, 1) * clamp(0.55 + n2[i] * 0.9, 0, 1);
            const dark = 1 - 0.32 * d;
            c[0] = lerp(lerp(98, 160, t) * dark, 94, moss); c[1] = lerp(lerp(64, 108, t) * dark, 160, moss); c[2] = lerp(38, 66, t) * dark * (1 - moss * 0.4);
          });
          g.lineCap = 'round';
          for (let i = 0; i < 160; i++) { // lodrette årer
            const x = r() * w, y = r() * h, l = rr(r, 30, 140);
            g.strokeStyle = r() < 0.5 ? `rgba(52,30,14,${rr(r, 0.15, 0.4)})` : `rgba(206,160,104,${rr(r, 0.12, 0.3)})`;
            g.lineWidth = rr(r, 1.5, 5);
            wrap(w, h, x, y, 10, (px, py) => line(g, px, py, px + (r() - 0.5) * 8, py + l));
          }
          for (let i = 0; i < 60; i++) { // varme småsten
            const x = r() * w, y = rr(r, h * 0.2, h), s = rr(r, 2, 6);
            g.fillStyle = r() < 0.5 ? '#c7a574' : '#a9814f'; g.beginPath(); g.ellipse(x, y, s, s * 0.7, 0, 0, TAU); g.fill();
          }
          g.strokeStyle = 'rgba(176,132,80,0.9)'; // rødder
          for (let i = 0; i < 14; i++) {
            const x = r() * w, y0 = r() * h * 0.5, l = rr(r, 80, 220);
            g.lineWidth = rr(r, 2, 4.5);
            wrap(w, h, x, y0, 30, (px, py) => { g.beginPath(); g.moveTo(px, py); g.bezierCurveTo(px + 30, py + l * 0.3, px - 30, py + l * 0.6, px + 10, py + l); g.stroke(); });
          }
        }],
        // Planker på tværs (flise 2,4 m, 12 brædder, forskudte samlinger, søm)
        planks: [512, 512, (g, w, h, r) => {
          const cols = ['#b07d4c', '#a37246', '#bb8a55', '#98683f', '#ad7a49', '#c0905a'];
          const n = 12, bh = h / n;
          for (let i = 0; i < n; i++) {
            const y0 = i * bh;
            let x = -r() * w * 0.6;
            while (x < w) {
              const len = w * rr(r, 0.45, 1);
              g.fillStyle = cols[(r() * cols.length) | 0]; g.fillRect(x, y0, len, bh);
              for (let k = 0; k < 7; k++) { // årer i træet
                const gy = y0 + 3 + r() * (bh - 6);
                g.strokeStyle = `rgba(72,42,20,${rr(r, 0.12, 0.32)})`; g.lineWidth = rr(r, 0.6, 1.5);
                g.beginPath(); g.moveTo(x + 2, gy);
                for (let s = 1; s <= 6; s++) g.lineTo(x + (len * s) / 6, gy + Math.sin(s * 1.3 + k) * 1.3);
                g.stroke();
              }
              if (r() < 0.35) { // knast
                const kx = x + len * rr(r, 0.2, 0.8), ky = y0 + bh * 0.5;
                g.strokeStyle = 'rgba(70,40,18,0.55)'; g.lineWidth = 1.2;
                for (let q = 1; q < 4; q++) { g.beginPath(); g.ellipse(kx, ky, q * 3.2, q * 1.6, 0, 0, TAU); g.stroke(); }
              }
              g.fillStyle = 'rgba(38,26,18,0.85)';
              for (const nx of [x + 7, x + len - 7]) for (const ny of [y0 + bh * 0.28, y0 + bh * 0.72]) dot(g, nx, ny, 1.5);
              g.fillStyle = 'rgba(30,18,10,0.65)'; g.fillRect(x, y0, 2, bh);
              x += len;
            }
            g.fillStyle = 'rgba(30,18,10,0.7)'; g.fillRect(0, y0, w, 2.5);
            g.fillStyle = 'rgba(255,232,190,0.2)'; g.fillRect(0, y0 + 2.5, w, 2);
          }
        }],
        // Bark: vandrette furer (flise 2,4 m)
        bark: [512, 512, (g, w, h, r) => {
          const n1 = ctx.tileNoise(w, 6, 3, r);
          pix(g, w, h, (x, y, c) => {
            const t = n1[y * w + x];
            c[0] = lerp(84, 140, t); c[1] = lerp(56, 98, t); c[2] = lerp(34, 62, t);
          });
          g.lineCap = 'round';
          for (let i = 0; i < 90; i++) {
            const y = r() * h, k = 1 + ((r() * 4) | 0), ph = r() * TAU, am = rr(r, 1.5, 5), x0 = r() * w, l = rr(r, w * 0.3, w * 0.9);
            g.strokeStyle = r() < 0.6 ? `rgba(40,24,12,${rr(r, 0.3, 0.6)})` : `rgba(196,150,96,${rr(r, 0.2, 0.4)})`;
            g.lineWidth = rr(r, 1.5, 4.5);
            wrap(w, h, x0, y, l, (px, py) => {
              g.beginPath(); g.moveTo(px, py);
              for (let s = 1; s <= 12; s++) g.lineTo(px + (l * s) / 12, py + Math.sin(ph + (s / 12) * TAU * k) * am);
              g.stroke();
            });
          }
          g.fillStyle = 'rgba(150,190,100,0.35)'; // lav og mos
          for (let i = 0; i < 26; i++) wrap(w, h, r() * w, r() * h, 20, (px, py) => { g.beginPath(); g.ellipse(px, py, rr(r, 8, 22), rr(r, 4, 9), 0, 0, TAU); g.fill(); });
        }],
        // Rød ladevæg: lodrette brædder (flise 2,4 m)
        red: [512, 512, (g, w, h, r) => {
          const cols = ['#b2382a', '#a23025', '#bf4331', '#a93628'];
          const n = 24, bw = w / n;
          for (let i = 0; i < n; i++) {
            g.fillStyle = cols[(r() * cols.length) | 0]; g.fillRect(i * bw, 0, bw, h);
            for (let k = 0; k < 5; k++) {
              g.strokeStyle = `rgba(80,20,14,${rr(r, 0.12, 0.3)})`; g.lineWidth = 0.8;
              line(g, i * bw + r() * bw, 0, i * bw + r() * bw, h);
            }
            g.fillStyle = 'rgba(40,10,6,0.55)'; g.fillRect(i * bw, 0, 1.6, h);
            g.fillStyle = 'rgba(255,170,140,0.16)'; g.fillRect(i * bw + 1.6, 0, 1.4, h);
          }
          g.fillStyle = 'rgba(40,10,6,0.6)'; // sømrækker
          for (let y = h * 0.1; y < h; y += h * 0.4) for (let i = 0; i < n; i++) dot(g, i * bw + bw / 2, y, 1.3);
        }],
        // Tegltag (flise 2,4 m): skællagte tegl i brunrødt med mos
        roof: [512, 512, (g, w, h, r) => {
          const rows = 16, th = h / rows, tw = w / 12;
          for (let j = 0; j < rows; j++) {
            for (let i = -1; i < 13; i++) {
              const x = i * tw + (j % 2) * tw / 2, y = j * th, k = r();
              g.fillStyle = k < 0.33 ? '#8f3b2b' : k < 0.66 ? '#9d4630' : '#823427';
              g.beginPath(); g.moveTo(x, y); g.lineTo(x + tw, y); g.lineTo(x + tw, y + th * 0.6);
              g.arc(x + tw / 2, y + th * 0.6, tw / 2, 0, PI); g.closePath(); g.fill();
              g.strokeStyle = 'rgba(40,12,8,0.6)'; g.lineWidth = 1.5; g.stroke();
              g.fillStyle = 'rgba(255,190,150,0.14)'; g.fillRect(x + 2, y + 1, tw - 4, 2);
            }
          }
          g.fillStyle = 'rgba(120,160,70,0.28)';
          for (let i = 0; i < 18; i++) wrap(w, h, r() * w, r() * h, 18, (px, py) => { g.beginPath(); g.ellipse(px, py, rr(r, 6, 18), rr(r, 3, 8), 0, 0, TAU); g.fill(); });
        }],
        // Strå (side af høballe): lodrette strå og to sejlgarnsbånd (v 0..1 = ballens højde)
        hay: [512, 512, (g, w, h, r) => {
          const n1 = ctx.tileNoise(w, 5, 3, r);
          pix(g, w, h, (x, y, c) => {
            const t = n1[y * w + x];
            c[0] = lerp(196, 240, t); c[1] = lerp(150, 200, t); c[2] = lerp(56, 92, t);
          });
          g.lineCap = 'round';
          for (let i = 0; i < 2600; i++) {
            const x = r() * w, y = r() * h, l = rr(r, 14, 60);
            g.strokeStyle = r() < 0.5 ? `rgba(150,100,30,${rr(r, 0.2, 0.5)})` : `rgba(255,232,150,${rr(r, 0.25, 0.55)})`;
            g.lineWidth = rr(r, 0.8, 1.8);
            wrap(w, h, x, y, 4, (px, py) => line(g, px, py, px + (r() - 0.5) * 4, py + l));
          }
          for (const y of [h * 0.17, h * 0.83]) { // sejlgarn
            g.fillStyle = 'rgba(60,40,16,0.55)'; g.fillRect(0, y - 6, w, 14);
            g.fillStyle = '#6b4a22'; g.fillRect(0, y - 4, w, 9);
            g.fillStyle = 'rgba(255,220,150,0.5)'; g.fillRect(0, y - 3, w, 2);
          }
        }],
        // Strå-spiral til ballens ender (vises 1:1 over hele toppen)
        hayTop: [512, 512, (g, w, h, r) => {
          g.fillStyle = '#d8aa4c'; g.fillRect(0, 0, w, h);
          g.lineCap = 'round';
          for (let i = 0; i < 1500; i++) {
            const a = r() * TAU, rad = Math.sqrt(r()) * w * 0.5, l = rr(r, 0.06, 0.2);
            g.strokeStyle = r() < 0.5 ? `rgba(140,92,28,${rr(r, 0.25, 0.6)})` : `rgba(255,230,150,${rr(r, 0.3, 0.6)})`;
            g.lineWidth = rr(r, 1, 2.2);
            g.beginPath(); g.arc(w / 2, h / 2, rad, a, a + l); g.stroke();
          }
          for (let k = 1; k < 9; k++) { g.strokeStyle = 'rgba(110,70,20,0.35)'; g.lineWidth = 2; g.beginPath(); g.arc(w / 2, h / 2, k * w * 0.055, 0, TAU); g.stroke(); }
          g.fillStyle = 'rgba(90,56,16,0.55)'; dot(g, w / 2, h / 2, 12);
        }],
        // Vandfald: lodrette lyse strimer med blød kant (flise 5 m)
        fall: [64, 256, (g, w, h, r) => {
          g.clearRect(0, 0, w, h);
          for (let i = 0; i < 24; i++) {
            const x = r() * w, ww = rr(r, 1.5, 5);
            for (let s = 0; s < 6; s++) {
              const y = r() * h, l = rr(r, 30, 110);
              g.fillStyle = `rgba(${r() < 0.4 ? '232,248,255' : '170,215,245'},${rr(r, 0.3, 0.95)})`;
              wrap(w, h, x, y, l, (px, py) => g.fillRect(px - ww / 2, py, ww, l));
            }
          }
          g.globalCompositeOperation = 'destination-in';
          const gr = g.createLinearGradient(0, 0, w, 0);
          gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.28, 'rgba(0,0,0,1)'); gr.addColorStop(0.72, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
          g.fillStyle = gr; g.fillRect(0, 0, w, h);
          g.globalCompositeOperation = 'source-over';
        }],
        // Ballonens baner (12 stykker à 16 px)
        balloon: [192, 64, (g, w, h) => {
          const cols = ['#d8392b', '#fff1d6', '#f2b630', '#fff1d6', '#2f7fc4', '#fff1d6'];
          for (let i = 0; i < 12; i++) { g.fillStyle = cols[i % 6]; g.fillRect(i * 16, 0, 16, h); }
          g.fillStyle = 'rgba(0,0,0,0.12)';
          for (let i = 0; i < 12; i++) g.fillRect(i * 16, 0, 1.5, h);
        }],
        // Morgendis: bløde skyklumper med alpha (flise 380 m)
        mist: [512, 512, (g, w, h, r) => {
          const n1 = ctx.tileNoise(w, 3, 5, r);
          pix(g, w, h, (x, y, c) => {
            const t = n1[y * w + x], a = clamp((t - 0.4) / 0.35, 0, 1);
            c[0] = 255; c[1] = 232 + t * 20; c[2] = 208 + t * 30; c[3] = a * a * (3 - 2 * a) * 215;
          });
        }],
      };
      const T = (k) => {
        if (texCache[k]) return texCache[k];
        const [w, h, fn] = PAINT[k], c = ctx.makeCanvas(w, h), g = c.getContext('2d');
        fn(g, w, h, ctx.mulberry32(k.length * 7919 + k.charCodeAt(0) * 31 + k.charCodeAt(k.length - 1)));
        const t = tr(ctx.toTexture(c));
        if (k === 'soil' || k === 'turfSide') t.wrapT = THREE.ClampToEdgeWrapping;
        return (texCache[k] = t);
      };
      // Roteret kopi (samme billede): lodret ådring til stolper og stænger
      const rotTex = (k) => {
        if (texCache[k + 'R']) return texCache[k + 'R'];
        const t = T(k).clone();
        t.rotation = PI / 2; t.center.set(0.5, 0.5); t.needsUpdate = true;
        return (texCache[k + 'R'] = tr(t));
      };

      /* ---------- Materialer ---------- */
      const std = (o) => new THREE.MeshStandardMaterial(o);
      const matCache = {};
      const MK = {
        turfTop: () => std({ map: T('turf'), roughness: 0.95 }),
        turfSide: () => std({ map: T('turfSide'), roughness: 0.95 }),
        soil: () => std({ map: T('soil'), roughness: 1, side: THREE.DoubleSide }),
        dirt: () => std({ color: '#5b3d24', roughness: 1 }),
        planks: () => std({ map: T('planks'), roughness: 0.82 }),
        planksOld: () => std({ map: T('planks'), color: '#c8aa8a', roughness: 0.95 }),
        planksDark: () => std({ map: T('planks'), color: '#8a7058', roughness: 0.9 }),
        bark: () => std({ map: T('bark'), roughness: 0.95 }),
        barkR: () => std({ map: rotTex('bark'), roughness: 0.95 }),
        red: () => std({ map: T('red'), roughness: 0.8 }),
        roof: () => std({ map: T('roof'), roughness: 0.7 }),
        hay: () => std({ map: T('hay'), roughness: 0.95 }),
        hayTop: () => std({ map: T('hayTop'), roughness: 0.95 }),
        water: () => new THREE.MeshBasicMaterial({ map: T('fall'), transparent: true, depthWrite: false, side: THREE.DoubleSide, opacity: 0.85 }),
        white: () => std({ color: '#f3ead6', roughness: 0.75 }),
        iron: () => std({ color: '#3c3733', roughness: 0.45, metalness: 0.7 }),
        rope: () => std({ color: '#cfae78', roughness: 0.95 }),
        root: () => std({ color: '#8e6a3c', roughness: 1 }),
        iceTop: () => new THREE.MeshPhysicalMaterial({ color: '#bfeaff', roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.03, emissive: '#2a77a8', emissiveIntensity: 0.18 }),
        iceSide: () => std({ color: '#a6dcf4', roughness: 0.14, emissive: '#1f6a96', emissiveIntensity: 0.3 }),
        capRed: () => std({ color: '#d63a2c', roughness: 0.45 }),
        cream: () => std({ color: '#f0e2c2', roughness: 0.7 }),
        vc: () => std({ vertexColors: true, roughness: 0.85 }),
        vcDS: () => std({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide }),
        decal: () => std({ vertexColors: true, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
        glow: () => new THREE.MeshBasicMaterial({ color: '#b6ff5a', transparent: true, opacity: 0.95, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, depthWrite: false }),
      };
      const mat = (k) => matCache[k] || (matCache[k] = tr(MK[k]()));

      /* ---------- Geometri-hjælpere ---------- */
      // Kasse med UV i verdensmeter; siderne har v = 1 øverst (så græsbåndet sidder i toppen)
      const boxG = (w, h, d, o = {}) => {
        const g = new THREE.BoxGeometry(w, h, d);
        const P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv;
        const tt = o.top || 3, st = o.side || 2.4, ox = o.ox || 0, oz = o.oz || 0;
        for (let i = 0; i < P.count; i++) {
          const x = P.getX(i), y = P.getY(i), z = P.getZ(i), nx = N.getX(i), ny = N.getY(i), nz = N.getZ(i);
          let u, v;
          if (Math.abs(ny) > 0.5) { u = x / tt + ox; v = -z / tt + oz; if (o.rot) { const s = u; u = -v; v = s; } }
          else {
            u = (Math.abs(nx) > 0.5 ? -z * nx : x * nz) / st + ox;
            v = 1 + (y - h / 2) / st;
          }
          U.setXY(i, u, v);
        }
        return g;
      };
      const cylG = (r, h, o = {}) => {
        const g = new THREE.CylinderGeometry(r, o.r2 ?? r, h, o.seg || 36, 1);
        const P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv;
        const st = o.side || 2.4, tt = o.top || 3;
        for (let i = 0; i < P.count; i++) {
          if (Math.abs(N.getY(i)) > 0.5) {
            if (o.capNorm) U.setXY(i, P.getX(i) / (2 * r) + 0.5, -P.getZ(i) / (2 * r) + 0.5);
            else U.setXY(i, P.getX(i) / tt + (o.ox || 0), -P.getZ(i) / tt + (o.oz || 0));
          } else {
            U.setXY(i, (U.getX(i) * TAU * r) / st, o.vFull ? (P.getY(i) + h / 2) / h : 1 + (P.getY(i) - h / 2) / st);
          }
        }
        return g;
      };
      // Flet geometrier (position/normal/uv/farve) til én: del = { geo, pos, rot, scl, color, jit, grad }
      const _m = new THREE.Matrix4(), _n = new THREE.Matrix3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _c = new THREE.Color();
      const merge = (parts) => {
        const P = [], N = [], U = [], C = [];
        for (const { geo, pos = [0, 0, 0], rot = [0, 0, 0], scl = [1, 1, 1], color = '#ffffff', jit = 0, grad = 0 } of parts) {
          const g = geo.index ? geo.toNonIndexed() : geo;
          _m.compose(new V3(pos[0], pos[1], pos[2]), _q.setFromEuler(_e.set(rot[0], rot[1], rot[2])), new V3(scl[0], scl[1], scl[2]));
          _n.getNormalMatrix(_m);
          const gp = g.attributes.position, gn = g.attributes.normal, gu = g.attributes.uv;
          g.computeBoundingBox();
          const y0 = g.boundingBox.min.y, y1 = g.boundingBox.max.y;
          _c.set(color);
          for (let i = 0; i < gp.count; i++) {
            const v = new V3(gp.getX(i), gp.getY(i), gp.getZ(i));
            const t = y1 > y0 ? (v.y - y0) / (y1 - y0) : 1;
            v.applyMatrix4(_m);
            const nn = new V3(gn.getX(i), gn.getY(i), gn.getZ(i)).applyMatrix3(_n).normalize();
            P.push(v.x, v.y, v.z); N.push(nn.x, nn.y, nn.z); U.push(gu ? gu.getX(i) : 0, gu ? gu.getY(i) : 0);
            const hsh = Math.sin(v.x * 12.9898 + v.y * 78.233 + v.z * 37.719) * 43758.5453;
            const f = (1 - grad * (1 - t)) * (1 + (hsh - Math.floor(hsh) - 0.5) * jit);
            C.push(_c.r * f, _c.g * f, _c.b * f);
          }
          if (g !== geo) g.dispose();
          geo.dispose();
        }
        const out = new THREE.BufferGeometry();
        out.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
        out.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
        out.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
        out.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
        return out;
      };
      const mesh = (geo, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(tr(geo), m); o.position.set(x, y, z); return o; };
      const FL = 0.012; // dekaler ligger 1,2 cm over toppen
      const disc = (r, x, z, y, color, seg = 12) => ({ geo: new THREE.CircleGeometry(r, seg), pos: [x, y, z], rot: [-PI / 2, 0, 0], color });
      const quadFlat = (w, d, x, z, y, color, ry = 0) => ({ geo: new THREE.PlaneGeometry(w, d), pos: [x, y, z], rot: [-PI / 2, 0, ry], color });
      const boxP = (w, h, d, x, y, z, color, rot) => ({ geo: new THREE.BoxGeometry(w, h, d), pos: [x, y, z], rot: rot || [0, 0, 0], color });
      const cylP = (r1, r2, h, x, y, z, color, seg = 8, rot, extra = {}) => ({ geo: new THREE.CylinderGeometry(r1, r2, h, seg), pos: [x, y, z], rot: rot || [0, 0, 0], color, ...extra });
      const ballP = (r, x, y, z, color, sc = [1, 1, 1], jit = 0, extra = {}) => ({ geo: new THREE.IcosahedronGeometry(r, 1), pos: [x, y, z], scl: sc, color, jit, ...extra });

      /* ---------- Jordkegle (under-konstruktion) med rødder og vandfald ---------- */
      // Overflade-punkt: t 0 (toppen, følger fodaftrykket) til 1 (spidsen), th = vinkel
      const profile = (a, b, depth, o = {}) => {
        const sTop = o.sTop ?? 0.985, e0 = o.e0 ?? 5, w1 = o.wob || [0, 0];
        return (t, th) => {
          const c = Math.cos(th), s = Math.sin(th), e = lerp(e0, 2, Math.min(1, t * 1.8));
          const k = 1 / Math.pow(Math.pow(Math.abs(c) / a, e) + Math.pow(Math.abs(s) / b, e), 1 / e);
          const wob = 1 + (o.wobAmp || 0) * (Math.sin(th * 3 + w1[0]) * 0.6 + Math.sin(th * 7 + w1[1]) * 0.4);
          const sc = sTop * Math.pow(1 - t, o.pow ?? 0.8) * wob;
          return [c * k * sc, -depth * Math.pow(t, 0.9), s * k * sc];
        };
      };
      const coneGeo = (a, b, depth, seed, o = {}) => {
        const R = 8, N = 22, f = profile(a, b, depth, o), r = ctx.mulberry32(seed);
        const jit = [];
        for (let k = 0; k <= R; k++) { jit.push([]); for (let i = 0; i < N; i++) jit[k].push(r()); }
        const pos = [], uv = [], idx = [], circ = (TAU * (a + b)) / 2 * 0.85 / (o.tileU || 4), vS = o.vScale ?? 1;
        for (let k = 0; k <= R; k++) {
          for (let i = 0; i <= N; i++) {
            const t = k / R, q = f(t, (i / N) * TAU), j = jit[k][i % N] - 0.5, s = Math.sin(t * PI);
            pos.push(q[0] * (1 + j * 0.3 * s), q[1] + j * depth * 0.035 * s, q[2] * (1 + j * 0.3 * s));
            uv.push((i / N) * circ, 1 - t * vS);
          }
        }
        for (let k = 0; k < R; k++) {
          for (let i = 0; i < N; i++) {
            const A = k * (N + 1) + i, B = A + 1, C = A + N + 1, D = C + 1;
            idx.push(A, B, C, B, D, C);
          }
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
        g.setIndex(idx);
        g.computeVertexNormals();
        const nrm = g.attributes.normal; // sømmen: samme normal i begge ender af ringen
        for (let k = 0; k <= R; k++) {
          const i0 = k * (N + 1), i1 = i0 + N;
          const x = nrm.getX(i0) + nrm.getX(i1), y = nrm.getY(i0) + nrm.getY(i1), z = nrm.getZ(i0) + nrm.getZ(i1), l = Math.hypot(x, y, z) || 1;
          nrm.setXYZ(i0, x / l, y / l, z / l); nrm.setXYZ(i1, x / l, y / l, z / l);
        }
        return g;
      };
      // Tilspidsede rødder, der kryber ned ad keglens overflade og hænger fri i enden
      const rootsGeo = (f, n, seed) => {
        const r = ctx.mulberry32(seed + 77), parts = [];
        for (let j = 0; j < n; j++) {
          const th0 = r() * TAU, t0 = 0.02 + r() * 0.1, len = 0.4 + r() * 0.4, wob = (r() - 0.5) * 1.2, pts = [];
          for (let s = 0; s <= 7; s++) {
            const q = f(t0 + (len * s) / 7, th0 + wob * Math.sin(s * 0.9 + j) * 0.35);
            pts.push(new V3(q[0], q[1], q[2]));
          }
          const e = pts[pts.length - 1];
          pts.push(new V3(e.x * 0.92, e.y - 0.5 - r() * 0.9, e.z * 0.92));
          const curve = new THREE.CatmullRomCurve3(pts), rad = 0.05 + r() * 0.06, tube = new THREE.TubeGeometry(curve, 24, rad, 5, false);
          const P = tube.attributes.position;
          for (let i = 0; i < P.count; i++) { // tilspidsning
            const ring = Math.floor(i / 6), c = curve.getPointAt(ring / 24), s = 1 - 0.85 * (ring / 24);
            P.setXYZ(i, c.x + (P.getX(i) - c.x) * s, c.y + (P.getY(i) - c.y) * s, c.z + (P.getZ(i) - c.z) * s);
          }
          parts.push({ geo: tube });
        }
        return merge(parts);
      };
      // Tynde vandfald: to krydsede bånd, der falder lodret fra en sprække
      const fallsGeo = (specs) => {
        const parts = [];
        for (const { x, y, z, H, wd, face } of specs) {
          for (let k = 0; k < 2; k++) {
            const g = new THREE.PlaneGeometry(wd, H);
            const uv = g.attributes.uv;
            for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * (H / 5));
            parts.push({ geo: g, pos: [x, y - H / 2, z], rot: [0, face + k * PI / 2, 0] });
          }
        }
        return merge(parts);
      };
      const waterMeshes = []; // alle vandfald deler én tekstur, som rulles i update
      const under = (g, p, o = {}) => {
        const D = p.type === 'ramp' ? p.slopeLen : p.d, k = o.k ?? 1;
        const a = (p.w / 2) * k, b = (p.shape === 'cyl' ? p.w / 2 : D / 2) * k;
        const free = ctx.freeBelow(p), md = Math.min(a, b);
        const dep = Math.min(o.depth ?? clamp(md * 2.3 + 1.5, 3.5, 11), free - 0.4);
        if (dep < 1.2 || md < 0.7) return;
        const po = { e0: p.shape === 'cyl' ? 2 : 5, sTop: o.sTop, vScale: o.vScale, pow: o.pow };
        const r = ctx.mulberry32(p.seed + (o.salt || 0));
        const cone = mesh(coneGeo(a, b, dep, p.seed + (o.salt || 0), po), o.mat || mat('soil'), 0, -p.h / 2 - 0.004, 0);
        g.add(cone);
        const f = profile(a, b, dep, po);
        if (o.roots !== false && md >= 1.4) {
          const rm = mesh(rootsGeo(f, Math.min(6, Math.floor(md * 1.1) + 1), p.seed), mat('root'), 0, -p.h / 2 - 0.004, 0);
          g.add(rm);
        }
        if (o.falls !== false && md >= 1.8 && r() < 0.6) {
          const th = r() * TAU, q = f(0.13, th), depthAt = -q[1];
          const H = Math.min(free - 0.3 - depthAt, dep + 4 + r() * 4);
          if (H > 1.5) {
            const wm = mesh(fallsGeo([{ x: q[0] * 1.0, y: -p.h / 2 + q[1], z: q[2] * 1.0, H, wd: 0.28 + r() * 0.16, face: Math.atan2(q[0], q[2]) }]), mat('water'));
            wm.userData.noCastShadow = true; wm.renderOrder = 2;
            g.add(wm);
            waterMeshes.push(wm);
          }
        }
      };

      // Sprækker i toppen (tværgående revner + huller) – flade dekaler
      const cracks = (g, p, seed, n) => {
        const r = ctx.mulberry32(seed), parts = [], D = p.d;
        for (let c = 0; c < n; c++) {
          let x = rr(r, -p.w * 0.4, p.w * 0.4), z = rr(r, -D * 0.4, D * 0.4), a = r() * TAU;
          for (let s = 0; s < 6; s++) {
            const l = rr(r, 0.35, 0.8), na = a + (r() - 0.5) * 1.3;
            parts.push(quadFlat(0.05 + r() * 0.05, l, x + Math.sin(a) * l / 2, z + Math.cos(a) * l / 2, p.h / 2 + FL, '#241508', a));
            x += Math.sin(a) * l; z += Math.cos(a) * l; a = na;
            if (Math.abs(x) > p.w / 2 || Math.abs(z) > D / 2) break;
          }
        }
        for (let c = 0; c < 3; c++) parts.push(quadFlat(rr(r, 0.3, 0.55), rr(r, 0.12, 0.2), rr(r, -p.w * 0.3, p.w * 0.3), rr(r, -D * 0.3, D * 0.3), p.h / 2 + FL, '#150c05', r() * 0.5));
        g.add(mesh(merge(parts), mat('decal')));
      };

      /* ---------- Platform-bygge ---------- */
      // Hoveddelen (præcis fysikkassen): [sideX, sideX, top, bund, sideZ, sideZ]
      const body = (p, mats, o = {}) => {
        const cyl = p.shape === 'cyl', off = (p.seed % 997) / 997, D = p.type === 'ramp' ? p.slopeLen : p.d;
        const geo = cyl ? cylG(p.w / 2, p.h, { top: o.top, side: o.side, ox: off, oz: off * 1.7, capNorm: o.capNorm, vFull: o.vFull })
          : boxG(p.w, p.h, D, { top: o.top, side: o.side, rot: o.rot, ox: off, oz: off * 1.7 });
        const m = new THREE.Mesh(tr(geo), cyl ? [mats[0], mats[2], mats[3]] : mats);
        m.userData.solid = true;
        return m;
      };
      const S6 = (side, top, bottom) => [side, side, top, bottom || mat('dirt'), side, side];

      const bTurf = (p, g, flowers) => {
        g.add(body(p, S6(mat('turfSide'), mat('turfTop'))));
        under(g, p);
        const r = ctx.mulberry32(p.seed + 5), parts = [], D = p.d, cyl = p.shape === 'cyl';
        const n = flowers ? Math.min(70, Math.round(p.w * D * 1.1)) : Math.min(18, Math.round(p.w * D * 0.12));
        const cols = flowers ? ['#e23a2e', '#fff6e0', '#ffd23a', '#f08ab4', '#9a7ae8'] : ['#fff6e0', '#ffd23a', '#f08ab4'];
        for (let i = 0; i < n; i++) {
          const a = r() * TAU, rad = Math.sqrt(r()), hw = p.w / 2 - 0.35, hd = (cyl ? p.w : D) / 2 - 0.35;
          const x = cyl ? Math.cos(a) * rad * hw : rr(r, -hw, hw), z = cyl ? Math.sin(a) * rad * hd : rr(r, -hd, hd);
          parts.push(disc(rr(r, 0.07, flowers ? 0.15 : 0.11), x, z, p.h / 2 + FL, cols[(r() * cols.length) | 0], 7));
          parts.push(disc(0.035, x, z, p.h / 2 + FL + 0.004, '#ffcf30', 6));
        }
        if (parts.length) { const dm = mesh(merge(parts), mat('decal')); dm.userData.noCastShadow = true; g.add(dm); }
      };

      const bBridge = (p, g) => {
        const D = p.d, h = p.h, w = p.w;
        const side = mat('planks');
        g.add(body(p, [side, side, mat('planks'), mat('planksDark'), side, side], { rot: false, side: 1.6 }));
        const free = ctx.freeBelow(p), r = ctx.mulberry32(p.seed + 9), parts = [], rope = [];
        // rebsløjfer langs kanten (2 cm uden for siden) og knuder ved stolpernes plads
        const n = Math.max(2, Math.round(D / 2.4));
        for (const sx of [-1, 1]) {
          for (let i = 0; i < n; i++) {
            const z0 = -D / 2 + (i * D) / n, z1 = z0 + D / n, pts = [];
            for (let s = 0; s <= 6; s++) pts.push(new V3(sx * (w / 2 + 0.03), h / 2 - 0.2 - Math.sin((s / 6) * PI) * 0.22, z0 + ((z1 - z0) * s) / 6));
            rope.push({ geo: new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, 0.035, 5), color: '#cfae78' });
            parts.push({ geo: new THREE.SphereGeometry(0.075, 7, 6), pos: [sx * (w / 2 + 0.03), h / 2 - 0.2, z0], color: '#b8905a' });
          }
          parts.push({ geo: new THREE.SphereGeometry(0.075, 7, 6), pos: [sx * (w / 2 + 0.03), h / 2 - 0.2, D / 2], color: '#b8905a' });
        }
        g.add(mesh(merge(rope.concat(parts)), mat('vc')));
        if (free > 1.4) { // under: langsliggere, tværbjælker, bue med hængere
          const sag = Math.min(free - 0.6, Math.max(0.9, D * 0.11)), u = [];
          for (const sx of [-1, 1]) {
            u.push(boxP(0.18, 0.26, D - 0.1, sx * (w / 2 - 0.3), -h / 2 - 0.13, 0, '#6e4a2c'));
            const pts = [];
            for (let s = 0; s <= 12; s++) { const t = s / 12; pts.push(new V3(sx * (w / 2 - 0.3), -h / 2 - 0.26 - Math.sin(t * PI) * sag, -D / 2 + 0.2 + t * (D - 0.4))); }
            u.push({ geo: new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.12, 6), color: '#7a5233' });
            for (let i = 1; i < Math.round(D / 1.5); i++) {
              const t = i / Math.round(D / 1.5), dep = Math.sin(t * PI) * sag;
              if (dep > 0.25) u.push(cylP(0.035, 0.035, dep, sx * (w / 2 - 0.3), -h / 2 - 0.26 - dep / 2, -D / 2 + 0.2 + t * (D - 0.4), '#caa56e', 5));
            }
          }
          for (let z = -D / 2 + 0.8; z < D / 2; z += 1.6) u.push(boxP(w - 0.3, 0.14, 0.18, 0, -h / 2 - 0.34, z, '#7d5836'));
          g.add(mesh(merge(u), mat('vc')));
        }
      };

      const bHay = (p, g) => {
        const cyl = p.shape === 'cyl', hay = mat('hay');
        g.add(body(p, S6(hay, mat('hayTop'), mat('hayTop')), { vFull: true, capNorm: true, side: 2.4, top: 2.4 }));
        under(g, p, { k: 0.78, depth: clamp(p.w * 0.35 + 0.8, 1.6, 4), falls: false });
        if (!cyl) { // firkantet bale: sejlgarn om bunden og toppen
          const r = ctx.mulberry32(p.seed), tw = [];
          tw.push(boxP(p.w + 0.03, 0.07, p.d + 0.03, 0, p.h * 0.28, 0, '#6b4a22'), boxP(p.w + 0.03, 0.07, p.d + 0.03, 0, -p.h * 0.28, 0, '#6b4a22'));
          g.add(mesh(merge(tw), mat('vc'))); void r;
        }
      };

      const bBarn = (p, g) => {
        const w = p.w, D = p.d, h = p.h, red = mat('red'), cyl = p.shape === 'cyl';
        g.add(body(p, S6(red, mat('roof'), red), { side: 2.4 }));
        const free = ctx.freeBelow(p), wall = Math.min(Math.max(0, 3.4 - h), free - 1.6);
        const parts = [], hh = h / 2;
        if (wall > 0.3) { // væggen fortsætter ned under taget
          const lower = cyl ? new THREE.Mesh(tr(cylG(w / 2 * 0.998, wall, { side: 2.4, seg: 32 })), red) : new THREE.Mesh(tr(boxG(w * 0.996, wall, D * 0.996, { side: 2.4, ox: 0.3 })), red);
          lower.position.y = -hh - wall / 2; g.add(lower);
        }
        const wh = h + Math.max(wall, 0);
        if (!cyl) {
          for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(boxP(0.15, wh, 0.15, sx * (w / 2 + 0.01), hh - wh / 2, sz * (D / 2 + 0.01), '#f4ecdc'));
          for (const sz of [-1, 1]) parts.push(boxP(w + 0.05, 0.24, 0.05, 0, hh - 0.12, sz * (D / 2 + 0.02), '#f4ecdc'));
          for (const sx of [-1, 1]) parts.push(boxP(0.05, 0.24, D + 0.05, sx * (w / 2 + 0.02), hh - 0.12, 0, '#f4ecdc'));
          // port med kryds på begge gavle
          const dw = Math.min(w * 0.42, 3.2), dh = Math.min(wh - 0.5, 2.8), dy = hh - 0.5 - dh / 2;
          for (const sz of [-1, 1]) {
            const z = sz * (D / 2 + 0.025);
            parts.push(boxP(dw, dh, 0.04, 0, dy, z, '#7a2a1e'), boxP(dw + 0.18, 0.1, 0.06, 0, dy + dh / 2, z, '#f4ecdc'));
            for (const ex of [-1, 1]) parts.push(boxP(0.1, dh, 0.06, ex * (dw / 2), dy, z, '#f4ecdc'));
            for (const dir of [-1, 1]) parts.push(boxP(0.09, Math.hypot(dw, dh) * 0.96, 0.06, 0, dy, z, '#f4ecdc', [0, 0, dir * Math.atan2(dw, dh)]));
          }
        } else {
          for (let i = 0; i < 3; i++) parts.push(cylP(w / 2 + 0.03, w / 2 + 0.03, 0.14, 0, hh - 0.5 - i * Math.max(0.9, wh / 3), 0, '#3a2a22', 28));
        }
        if (parts.length) g.add(mesh(merge(parts), mat('vc')));
        under(g, p, { k: 0.85, depth: clamp(Math.min(w, D) * 0.9, 3, 8), falls: false, mat: mat('soil'), sTop: 0.9, salt: wall > 0 ? 3 : 0 });
        // skråtag: flade tagrygge-streger (≤2 cm) som antydning af tagrygning
        const r2 = ctx.mulberry32(p.seed), line = [];
        for (let z = -D / 2 + 0.5; z < D / 2 - 0.3 && !cyl; z += 1.25) line.push(quadFlat(w - 0.5, 0.05, 0, z, hh + FL, '#5a1e14'));
        if (line.length) g.add(mesh(merge(line), mat('decal'))); void r2;
      };

      const bPorch = (p, g) => {
        const w = p.w, D = p.d, h = p.h, side = mat('planksDark');
        g.add(body(p, S6(side, mat('planks'), mat('planksDark')), { rot: true, side: 2.4 }));
        const r = ctx.mulberry32(p.seed + 2), t = [];
        // hvid kantliste og stolper
        for (const sz of [-1, 1]) t.push(boxP(w + 0.05, 0.2, 0.05, 0, h / 2 - 0.12, sz * (D / 2 + 0.02), '#f4ecdc'));
        for (const sx of [-1, 1]) t.push(boxP(0.05, 0.2, D + 0.05, sx * (w / 2 + 0.02), h / 2 - 0.12, 0, '#f4ecdc'));
        if (p.shape !== 'cyl' && h > 0.5) for (const sx of [-1, 1]) for (const sz of [-1, 1]) t.push(boxP(0.22, h + 1.4, 0.22, sx * (w / 2 - 0.35), -h / 2 - 0.2, sz * (D / 2 - 0.35), '#efe3cf'));
        g.add(mesh(merge(t), mat('vc')));
        // løber (flad dekal) i kløverrødt og fløde
        if (w >= 4 && D >= 4) {
          const rg = [], rw = Math.min(w * 0.55, 3.6), rd = Math.min(D * 0.28, 2.2), z0 = D * 0.28, y = h / 2 + FL;
          rg.push(quadFlat(rw, rd, 0, z0, y, '#b3392b'), quadFlat(rw - 0.3, rd - 0.3, 0, z0, y + 0.004, '#f1e2c0'), quadFlat(rw - 0.6, rd - 0.6, 0, z0, y + 0.008, '#c24a35'));
          for (let i = -2; i <= 2; i++) rg.push(quadFlat(0.08, rd - 0.6, i * (rw - 0.7) / 5, z0, y + 0.012, '#f1e2c0'));
          g.add(mesh(merge(rg), mat('decal')));
        }
        under(g, p, { k: 0.9, falls: true, sTop: 0.93 }); void r;
      };

      const bHill = (p, g) => {
        g.add(body(p, S6(mat('turfSide'), mat('turfTop'))));
        under(g, p, { vScale: 0.55, depth: clamp(Math.min(p.w, p.d) * 1.1 + 2, 4, 12), sTop: 0.99 });
        // cirkel af sandfarvede fliser rundt om portalen
        const r = ctx.mulberry32(p.seed + 4), parts = [], R0 = Math.min(p.w, p.d) * 0.3, y = p.h / 2 + FL, cols = ['#d9bf8c', '#caa874', '#e2c99a', '#bf9a66'];
        const n = Math.round(R0 * 5);
        for (let i = 0; i < n; i++) {
          const a = (i / n) * TAU;
          parts.push(quadFlat(0.55, 0.36, Math.cos(a) * R0, Math.sin(a) * R0, y, cols[(r() * 4) | 0], -a + PI / 2 + (r() - 0.5) * 0.12));
          if (i % 2 === 0) parts.push(quadFlat(0.45, 0.3, Math.cos(a + 0.12) * (R0 + 0.55), Math.sin(a + 0.12) * (R0 + 0.55), y, cols[(r() * 4) | 0], -a + PI / 2));
        }
        const dm = mesh(merge(parts), mat('decal')); dm.userData.noCastShadow = true; g.add(dm);
        const fl = [];
        for (let i = 0; i < 40; i++) {
          const a = r() * TAU, rad = rr(r, R0 + 1.2, Math.min(p.w, p.d) / 2 - 0.4);
          fl.push(disc(rr(r, 0.07, 0.13), Math.cos(a) * rad, Math.sin(a) * rad, y, ['#fff6e0', '#ffd23a', '#f08ab4', '#e23a2e'][(r() * 4) | 0], 7));
        }
        g.add(mesh(merge(fl), mat('decal')));
      };

      const bLog = (p, g) => {
        const w = p.w, D = p.d, h = p.h, bark = mat('bark');
        const cut = mat('planksOld');
        g.add(body(p, [bark, bark, mat('planks'), bark, cut, cut], { side: 1.6, top: 2.4, rot: true }));
        const free = ctx.freeBelow(p), rg = [];
        // årringe i enderne
        const cols = ['#d9b27a', '#b98a54', '#cfa56c', '#a67842', '#c79a60', '#8e6334'];
        for (const sz of [-1, 1]) for (let i = 0; i < 6; i++) {
          rg.push({ geo: new THREE.CircleGeometry(1, 20), pos: [0, 0, sz * (D / 2 + 0.01 + i * 0.002)], rot: [0, sz > 0 ? 0 : PI, 0], scl: [(w / 2) * (1 - i * 0.16), (h / 2) * (1 - i * 0.16), 1], color: cols[i] });
        }
        // bunden rundes af: halv stamme under kassen
        if (free > 0.9) {
          const dp = Math.min(free - 0.4, Math.max(0.4, w * 0.4));
          const hl = new THREE.CylinderGeometry(1, 1, D * 0.98, 16, 1, false, PI * 0.5, PI);
          rg.push({ geo: hl, pos: [0, -h / 2, 0], rot: [0, 0, PI / 2], scl: [dp, 1, w / 2 * 0.96], color: '#6a4a2e' });
        }
        g.add(mesh(merge(rg), mat('vc')));
      };

      // Tætte flader, der kan bruges til de øvrige typer
      const raft = (p, g, top, sideMat) => {
        g.add(body(p, S6(sideMat || mat('planksDark'), top || mat('planks'), mat('planksDark')), { rot: true }));
      };

      const platform = (p) => {
        const g = new THREE.Group();
        const t = p.type, v = p.v, cyl = p.shape === 'cyl', D = p.d;
        const kind = t === 'start' ? (v === 'porch' || !v ? 'porch' : v) : t === 'finish' ? (v || 'hill') : t === 'p' ? (v || 'turf') : null;
        if (kind) {
          switch (kind) {
            case 'porch': bPorch(p, g); break;
            case 'hill': bHill(p, g); break;
            case 'bridge': bBridge(p, g); break;
            case 'hay': bHay(p, g); break;
            case 'barn': bBarn(p, g); break;
            case 'log': bLog(p, g); break;
            case 'flowers': bTurf(p, g, true); break;
            default: bTurf(p, g, false);
          }
          return g;
        }
        switch (t) {
          case 'ice': { // frossen dam: blank is med indfrosne blade og en iset jordkegle
            g.add(body(p, S6(mat('iceSide'), mat('iceTop'), mat('iceSide'))));
            under(g, p, { mat: mat('iceSide'), falls: false, roots: false, k: 0.95 });
            const r = ctx.mulberry32(p.seed), parts = [];
            for (let i = 0; i < 9; i++) parts.push(quadFlat(rr(r, 0.04, 0.07), rr(r, 0.5, 1.4), rr(r, -p.w * 0.4, p.w * 0.4), rr(r, -D * 0.4, D * 0.4), p.h / 2 + FL, '#f4fcff', r() * PI));
            for (let i = 0; i < 6; i++) parts.push(disc(rr(r, 0.1, 0.25), rr(r, -p.w * 0.38, p.w * 0.38), rr(r, -D * 0.38, D * 0.38), p.h / 2 + FL, '#7fb27a', 6));
            g.add(mesh(merge(parts), mat('decal')));
            break;
          }
          case 'crumble': { // tørre, revnede planker med huller
            raft(p, g, mat('planksOld'), mat('planksOld'));
            cracks(g, p, p.seed, Math.max(3, Math.round(p.w * 0.9)));
            const free = ctx.freeBelow(p), u = [];
            for (const sx of [-1, 1]) u.push(boxP(0.16, Math.min(1.2, free), 0.16, sx * (p.w / 2 - 0.4), -p.h / 2 - Math.min(1.2, free) / 2, 0, '#5a4026'));
            g.add(mesh(merge(u), mat('vc')));
            break;
          }
          case 'move': case 'swing': { // tømmerflåde på tønder
            raft(p, g);
            const free = ctx.freeBelow(p), br = Math.min(0.42, free * 0.5), u = [];
            if (br > 0.2) for (const sx of [-1, 1]) {
              u.push(cylP(br, br, D * 0.84, sx * p.w * 0.27, -p.h / 2 - br * 0.75, 0, '#9a6a3a', 14, [PI / 2, 0, 0]));
              for (const z of [-0.3, 0.3]) u.push(cylP(br + 0.02, br + 0.02, 0.1, sx * p.w * 0.27, -p.h / 2 - br * 0.75, z * D, '#3c3733', 14, [PI / 2, 0, 0]));
            }
            if (u.length) g.add(mesh(merge(u), mat('vc')));
            if (t === 'swing') { // flade jernplader, hvor kæderne sidder fast
              const pl = [], cw = p.w * 0.42, cd = D * 0.42;
              for (const [cx, cz] of [[-cw, -cd], [cw, -cd], [-cw, cd], [cw, cd]]) pl.push(disc(0.17, cx, cz, p.h / 2 + FL, '#2e2a27', 10), disc(0.09, cx, cz, p.h / 2 + FL + 0.004, '#8a7f72', 10));
              g.add(mesh(merge(pl), mat('decal')));
            }
            break;
          }
          case 'bounce': { // rød fluesvamp med hvide pletter
            g.add(body(p, S6(mat('capRed'), mat('capRed'), mat('cream'))));
            const r = ctx.mulberry32(p.seed), sp = [], free = ctx.freeBelow(p);
            for (let i = 0; i < 9; i++) {
              const a = r() * TAU, rad = Math.sqrt(r()), hw = p.w / 2 - 0.45;
              sp.push(disc(rr(r, 0.15, 0.4), cyl ? Math.cos(a) * rad * hw : rr(r, -hw, hw), cyl ? Math.sin(a) * rad * hw : rr(r, -(D / 2 - 0.45), D / 2 - 0.45), p.h / 2 + FL, '#fff7e6', 10));
            }
            g.add(mesh(merge(sp), mat('decal')));
            const sl = Math.min(2.4, free - 0.4);
            if (sl > 0.5) {
              const st = new THREE.CylinderGeometry(Math.min(p.w, D) * 0.2, Math.min(p.w, D) * 0.12, sl, 14);
              g.add(mesh(st, mat('cream'), 0, -p.h / 2 - sl / 2, 0));
            }
            break;
          }
          case 'spin': { // rund bræddeskive med nav
            g.add(body(p, S6(mat('planksDark'), mat('planks'), mat('planksDark')), { rot: true }));
            under(g, p, { k: 0.8, falls: false });
            g.add(mesh(new THREE.CylinderGeometry(0.2, 0.28, 0.34, 14), mat('iron'), 0, p.h / 2 + 0.17, 0));
            const rg = [], R = p.w / 2;
            rg.push({ geo: new THREE.RingGeometry(R - 0.34, R - 0.14, 40), pos: [0, p.h / 2 + FL, 0], rot: [-PI / 2, 0, 0], color: '#3c3733' });
            g.add(mesh(merge(rg), mat('decal')));
            break;
          }
          case 'conveyor': { // brædder på rulle: texturen rulles i update
            const top = beltMat(p);
            g.add(body(p, [mat('planksDark'), mat('planksDark'), top, mat('planksDark'), mat('planksDark'), mat('planksDark')], { rot: p.beltAx === 'x' }));
            break;
          }
          case 'rot': { // vognhjul, der drejer
            g.add(body(p, S6(mat('barkR'), mat('planks'), mat('planksDark')), { rot: true, side: 1.6 }));
            const R = p.w / 2, rg = [], y = p.h / 2 + FL;
            rg.push({ geo: new THREE.RingGeometry(R - 0.3, R - 0.04, 48), pos: [0, y, 0], rot: [-PI / 2, 0, 0], color: '#2e2a27' });
            for (let i = 0; i < 4; i++) rg.push(quadFlat(0.2, R * 1.9, 0, 0, y + 0.004, '#3c2a1c', (i * PI) / 4 + 0.0));
            rg.push(disc(0.5, 0, 0, y + 0.008, '#2e2a27', 16), disc(0.28, 0, 0, y + 0.012, '#8e7b5e', 16));
            g.add(mesh(merge(rg), mat('decal')));
            const free = ctx.freeBelow(p), ax = Math.min(1.8, free - 0.3);
            if (ax > 0.4) g.add(mesh(new THREE.CylinderGeometry(0.3, 0.14, ax, 10), mat('barkR'), 0, -p.h / 2 - ax / 2, 0));
            break;
          }
          case 'vent': { // trælameller over en mørk skakt
            g.add(body(p, S6(mat('planksDark'), mat('iron'), mat('planksDark'))));
            const sl = [], y = p.h / 2 + FL;
            for (let z = -D / 2 + 0.28; z < D / 2 - 0.1; z += 0.5) sl.push(quadFlat(p.w - 0.3, 0.26, 0, z, y, '#a9824f'), quadFlat(p.w - 0.3, 0.04, 0, z + 0.15, y + 0.003, '#d8b27a'));
            g.add(mesh(merge(sl), mat('decal')));
            break;
          }
          case 'ramp': { // planke-rampe med køler og vinkelret underbygning
            raft(p, g, mat('planks'), mat('planksDark'));
            const pt = p.pitch, S = p.slopeLen, w = p.w, h = p.h, ref = new THREE.Group();
            ref.rotation.x = -pt; // lodret hjælpeakse
            const yR = -h / 2 * Math.cos(pt) - (S / 2) * Math.sin(pt), yF = yR + S * Math.sin(pt) * 1;
            const zR = -h / 2 * Math.sin(pt) + (S / 2) * Math.cos(pt), zF = -h / 2 * Math.sin(pt) - (S / 2) * Math.cos(pt);
            const sh = new THREE.Shape(); sh.moveTo(zR, yR); sh.lineTo(zF, yR); sh.lineTo(zF, yF - 0.02); sh.lineTo(zR, yR + 0.02);
            const ex = new THREE.ExtrudeGeometry(sh, { depth: 0.12, bevelEnabled: false });
            for (const sx of [-1, 1]) {
              const m = mesh(ex.clone(), mat('planksDark'));
              m.rotation.y = -PI / 2; m.position.x = sx * (w / 2 - 0.08) + 0.06;
              ref.add(m);
            }
            g.add(ref);
            break;
          }
          case 'rail': { // gammel hegnsbjælke på stolper
            const free = ctx.freeBelow(p), lg = Math.min(1.1, free), u = [];
            u.push({ geo: new THREE.CylinderGeometry(0.058, 0.058, D, 10), pos: [0, 0, 0], rot: [PI / 2, 0, 0], color: '#a67842' });
            u.push(cylP(0.075, 0.075, 0.1, 0, 0, -D / 2 + 0.05, '#2e2a27', 10, [PI / 2, 0, 0]), cylP(0.075, 0.075, 0.1, 0, 0, D / 2 - 0.05, '#2e2a27', 10, [PI / 2, 0, 0]));
            for (let z = -D / 2 + 0.6; z < D / 2; z += 2) u.push(boxP(0.1, lg, 0.1, 0, -lg / 2, z, '#6e4a2c'));
            const m = mesh(merge(u), mat('vc'));
            g.add(m);
            const hit = new THREE.Mesh(tr(new THREE.BoxGeometry(p.w, p.h, D)), mat('bark')); hit.visible = false; hit.userData.solid = true; g.add(hit);
            break;
          }
          case 'boost': { // brædder med lysende grønne piletegn
            raft(p, g, mat('planks'), mat('planksDark'));
            const ch = [], n = Math.max(2, Math.floor(D / 1.6)), cw = p.w * 0.36;
            for (let i = 0; i < n; i++) {
              const z = D / 2 - ((i + 0.5) * D) / n, sh = new THREE.Shape();
              sh.moveTo(0, -0.45); sh.lineTo(cw, 0.1); sh.lineTo(cw, 0.4); sh.lineTo(0, -0.1); sh.lineTo(-cw, 0.4); sh.lineTo(-cw, 0.1);
              const gm = new THREE.ShapeGeometry(sh);
              const m = mesh(gm, mat('glow')); m.rotation.x = -PI / 2; m.position.set(0, p.h / 2 + FL, z);
              m.userData.noCastShadow = true; g.add(m);
            }
            break;
          }
          default: bTurf(p, g, false);
        }
        return g;
      };

      /* ---------- Transportbånd: teksturen rulles ---------- */
      const belts = [];
      const beltMat = (p) => {
        const t = T('planks').clone(); t.needsUpdate = true;
        t.center.set(0.5, 0.5); t.repeat.set(Math.max(1, p.w / 2.4), Math.max(1, p.d / 2.4));
        if (p.beltAx === 'x') t.rotation = PI / 2;
        tr(t);
        const m = tr(std({ map: t, roughness: 0.85, color: '#d9c4a4' }));
        belts.push({ t, p });
        return m;
      };

      /* ---------- Stænger, svævebaner, ankre ---------- */
      const bar = (b) => {
        const g = new THREE.Group(), len = b.len, r = b.r, branch = b.v === 'branch';
        const pole = new THREE.CylinderGeometry(r, branch ? r * 1.1 : r, len, 12).rotateZ(PI / 2);
        g.add(mesh(pole, mat('barkR')));
        const u = [];
        if (!branch) {
          for (const sx of [-1, 1]) {
            u.push(cylP(r * 1.55, r * 1.55, 0.1, sx * (len / 2 - 0.22), 0, 0, '#3c3733', 12, [0, 0, PI / 2]));
            u.push(boxP(0.16, 0.2, 0.2, sx * (len / 2 + 0.06), 0, 0, '#8a5a30'));
            u.push(boxP(0.1, 0.85, 0.1, sx * (len / 2 + 0.06), 0.52, 0, '#7a4e2a'));
            u.push({ geo: new THREE.ConeGeometry(0.12, 0.5, 3), pos: [sx * (len / 2 + 0.06) - sx * 0.25, 0.8, 0], rot: [0, 0, sx * PI / 2], color: '#d8392b' });
          }
        } else { // æblegren: kviste, blade og hængende æbler
          const rg = ctx.mulberry32(Math.round(b.x * 31 + b.z * 17 + len * 7));
          for (let i = 0; i < 7; i++) {
            const x = rr(rg, -len / 2 + 0.2, len / 2 - 0.2), up = rg() < 0.5 ? 1 : -0.4, l = rr(rg, 0.3, 0.6), z = rr(rg, -0.25, 0.25);
            u.push(cylP(0.016, 0.028, l, x, up * l * 0.45, z * 0.4, '#5a3b22', 5, [z, 0, -up * 0.35]));
            for (let k = 0; k < 4; k++) u.push({ geo: new THREE.CircleGeometry(rr(rg, 0.09, 0.14), 5), pos: [x + rr(rg, -0.12, 0.12), up * l + rr(rg, -0.06, 0.1), z + rr(rg, -0.12, 0.12)], rot: [rr(rg, -1.3, 1.3), rr(rg, 0, PI), 0], color: ['#5fa83a', '#74bb48', '#4a9430'][k % 3] });
            if (rg() < 0.7) u.push(ballP(0.075, x + 0.03, -0.12 - rg() * 0.08, z, rg() < 0.7 ? '#d63a2c' : '#f0b030', [1, 0.9, 1]));
            if (rg() < 0.4) u.push(disc(0.04, x, z, 0.0, '#ffe6ee', 5));
          }
          u.push(cylP(r * 1.5, r * 1.1, 0.25, -len / 2 + 0.05, 0, 0, '#4e3320', 8, [0, 0, PI / 2]));
        }
        g.add(mesh(merge(u), mat('vcDS')));
        return g;
      };
      const zip = (z) => {
        const g = new THREE.Group(), a = new V3(z.ax, z.ay, z.az), b = new V3(z.bx, z.by, z.bz), d = b.clone().sub(a), L = d.length();
        const cable = mesh(new THREE.CylinderGeometry(0.03, 0.03, L, 6), mat('rope'));
        cable.position.copy(a).addScaledV3 ? 0 : 0;
        cable.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
        cable.quaternion.setFromUnitVectors(new V3(0, 1, 0), d.normalize());
        g.add(cable);
        const side = new V3(z.dz, 0, -z.dx), u = [];
        for (const [e, s] of [[a, 1], [b, -1]]) { // stolpe ved siden af linjen med bom, der ender før linjens start
          const px = e.x + side.x * 1.1, pz = e.z + side.z * 1.1;
          u.push(cylP(0.11, 0.14, 4, px, e.y - 1.6, pz, '#7a4e2a', 8));
          u.push(boxP(0.12, 0.12, 1.1, px - side.x * 0.5, e.y + 0.1, pz - side.z * 0.5, '#6e4a2c', [0, Math.atan2(side.x, side.z), 0]));
          u.push({ geo: new THREE.ConeGeometry(0.16, 0.5, 3), pos: [px - side.x * 0.1, e.y + 0.55 * s, pz - side.z * 0.1], rot: [0, 0, PI / 2], color: s > 0 ? '#d8392b' : '#f2b630' });
        }
        g.add(mesh(merge(u), mat('vc')));
        return g;
      };
      const anchor = () => { // gylden æble med blad
        const g = new THREE.Group();
        const ap = new THREE.Mesh(tr(new THREE.SphereGeometry(0.22, 18, 14)), tr(std({ color: '#e4452b', roughness: 0.3, emissive: '#ff6a20', emissiveIntensity: 0.4 })));
        ap.scale.y = 0.92; g.add(ap);
        g.add(mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.14, 6), mat('barkR'), 0, 0.24, 0));
        const lf = mesh(new THREE.CircleGeometry(0.13, 6), mat('vcDS'), 0.1, 0.3, 0);
        lf.geometry = merge([{ geo: new THREE.CircleGeometry(0.13, 6), color: '#6fbd3f' }]);
        lf.rotation.set(-0.6, 0.4, 0.5); g.add(lf);
        return g;
      };
      const spinArm = (p) => { // vindmøllevinge: bjælke med sejldug
        const L = p.bar, u = [];
        u.push(boxP(L, 0.12, 0.14, 0, 0, 0, '#7a4e2a'));
        const n = Math.max(3, Math.round(L / 0.8));
        for (let i = 0; i < n; i++) {
          const x = -L / 2 + (L * (i + 0.5)) / n;
          u.push(boxP(L / n - 0.06, 0.3, 0.04, x, 0, 0.11, i % 2 ? '#f6ecd6' : '#d8392b'));
          u.push(boxP(0.05, 0.34, 0.1, x - L / n / 2 + 0.03, 0, 0.05, '#5e3f23'));
        }
        const m = mesh(merge(u), mat('vc'));
        const g = new THREE.Group(); g.add(m);
        return g;
      };

      /* ====================================================================
         SCENERI
         ==================================================================== */
      const sunVec = () => {
        const th = ctx.theme, el = th.sunElev * ctx.DEG, az = th.sunAz * ctx.DEG;
        return new V3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
      };
      // Prop-geometrier (flettede, med toppunktsfarver)
      const PROPS = {};
      const prop = (k, mk) => PROPS[k] || (PROPS[k] = tr(mk()));
      const SHEEP = () => merge([
        ballP(0.4, 0, 0.55, 0, '#f6f0e4', [1.25, 0.95, 0.9], 0.18), ballP(0.28, -0.3, 0.7, 0.12, '#f1ead9', [1, 1, 1], 0.2), ballP(0.28, 0.28, 0.66, -0.1, '#f1ead9', [1, 1, 1], 0.2),
        ballP(0.2, 0.5, 0.7, 0, '#3b2f2a', [1.1, 1, 0.9]), ballP(0.08, 0.5, 0.88, 0.16, '#f6f0e4'), ballP(0.08, 0.5, 0.88, -0.16, '#f6f0e4'),
        cylP(0.045, 0.04, 0.4, 0.28, 0.2, 0.2, '#3b2f2a', 5), cylP(0.045, 0.04, 0.4, 0.28, 0.2, -0.2, '#3b2f2a', 5),
        cylP(0.045, 0.04, 0.4, -0.3, 0.2, 0.2, '#3b2f2a', 5), cylP(0.045, 0.04, 0.4, -0.3, 0.2, -0.2, '#3b2f2a', 5),
      ]);
      const TREE = (kind) => () => {
        const parts = [cylP(0.2, 0.34, 2.4, 0, 1.2, 0, '#6a4a2c', 7)];
        if (kind === 'oak') parts.push(ballP(1.7, 0, 3.6, 0, '#4f9a3a', [1, 0.85, 1], 0.3, { grad: 0.4 }), ballP(1.25, 1.1, 3.2, 0.5, '#5aa843', [1, 0.9, 1], 0.3, { grad: 0.4 }), ballP(1.3, -1.0, 3.1, -0.4, '#46893a', [1, 0.9, 1], 0.3, { grad: 0.4 }), ballP(1.1, 0.2, 4.6, -0.3, '#66b34a', [1, 0.9, 1], 0.3, { grad: 0.4 }));
        else if (kind === 'poplar') parts.push(ballP(1.0, 0, 4.6, 0, '#5ea63e', [1, 3.4, 1], 0.25, { grad: 0.35 }));
        else parts.push(ballP(1.2, 0, 1.8, 0, '#559e3c', [1.3, 0.8, 1.3], 0.3, { grad: 0.4 }), ballP(0.9, 0.9, 1.5, 0.4, '#68b24a', [1, 0.8, 1], 0.3, { grad: 0.4 }));
        return merge(parts);
      };
      const FENCE = () => merge([
        boxP(0.14, 1.0, 0.14, -1.1, 0.5, 0, '#8a6038'), boxP(0.14, 1.0, 0.14, 1.1, 0.5, 0, '#8a6038'), boxP(2.4, 0.1, 0.07, 0, 0.78, 0, '#a67842'), boxP(2.4, 0.1, 0.07, 0, 0.45, 0, '#a67842'),
      ]);
      const HAYROLL = () => merge([cylP(0.7, 0.7, 1.1, 0, 0.55, 0, '#dcb050', 12, [0, 0, 0], { jit: 0.2 }), cylP(0.72, 0.72, 0.08, 0, 0.3, 0, '#7a5426', 12), cylP(0.72, 0.72, 0.08, 0, 0.8, 0, '#7a5426', 12)]);
      const BARN = () => { // gårdens lade: røde vægge, hvid port, tegltag, lille silo
        const parts = [boxP(7, 4, 9, 0, 2, 0, '#b2382a', [0, 0, 0]), boxP(7.4, 0.4, 9.4, 0, 4.1, 0, '#f4ecdc')];
        for (const s of [-1, 1]) {
          parts.push({ geo: new THREE.CylinderGeometry(0, 1, 1, 4), pos: [s * 1.82, 5.3, 0], rot: [0, PI / 4, s * 0.0], scl: [0, 0, 0], color: '#000' });
        }
        parts.push({ geo: new THREE.CylinderGeometry(0.01, 4.8, 3.2, 4, 1), pos: [0, 5.75, 0], rot: [0, PI / 4, 0], scl: [0.9, 1, 1.25], color: '#8f3b2b' });
        parts.push(boxP(3, 3, 0.1, 0, 1.6, 4.55, '#f4ecdc'), boxP(2.6, 2.7, 0.12, 0, 1.55, 4.56, '#7a2a1e'), boxP(0.2, 3.3, 0.14, 0, 1.6, 4.58, '#f4ecdc', [0, 0, 0.62]), boxP(0.2, 3.3, 0.14, 0, 1.6, 4.58, '#f4ecdc', [0, 0, -0.62]));
        parts.push(cylP(1.4, 1.4, 7, 5.2, 3.5, -1.8, '#c9b48e', 12), { geo: new THREE.SphereGeometry(1.4, 12, 6, 0, TAU, 0, PI / 2), pos: [5.2, 7, -1.8], color: '#9d4630' });
        return merge(parts);
      };
      const COTTAGE = () => { // lille hvidkalket stuehus med teglsten og blå dør
        const parts = [boxP(7.6, 3.4, 5.6, 0, 1.7, 0, '#f2e6cf', [0, 0, 0]), boxP(7.9, 0.2, 5.9, 0, 3.45, 0, '#6e4a2c')];
        parts.push({ geo: new THREE.CylinderGeometry(0.01, 4.1, 2.6, 4, 1), pos: [0, 4.75, 0], rot: [0, PI / 4, 0], scl: [1.0, 1, 0.78], color: '#a3492f' });
        parts.push(boxP(0.9, 2.2, 0.9, 2.0, 5.9, -0.8, '#b24a30'), boxP(1.05, 0.15, 1.05, 2.0, 7.05, -0.8, '#6e4a2c'));
        parts.push(boxP(1.2, 2.2, 0.1, -1.0, 1.1, 2.85, '#3e7f77'), boxP(1.5, 0.15, 0.2, -1.0, 2.3, 2.9, '#f4ecdc'));
        for (const x of [1.4, 2.8]) parts.push(boxP(1.0, 1.0, 0.1, x, 1.9, 2.85, '#8fc9e6'), boxP(1.2, 0.12, 0.14, x, 1.3, 2.9, '#b3392b'));
        for (const x of [-2.2, 0.4, 2.6]) parts.push(boxP(0.1, 1.0, 1.0, 3.85, 1.9, x * 0.5, '#8fc9e6'));
        for (let i = 0; i < 5; i++) parts.push(ballP(0.12, 1.0 + i * 0.28, 1.4, 2.95, ['#f08ab4', '#ffd23a', '#e23a2e'][i % 3]));
        return merge(parts);
      };
      const MENHIR = () => {
        const g = new THREE.CylinderGeometry(0.5, 0.82, 3.6, 6, 3), P = g.attributes.position;
        for (let i = 0; i < P.count; i++) { const h = Math.sin(P.getX(i) * 7.3 + P.getY(i) * 3.1 + P.getZ(i) * 5.7); P.setX(i, P.getX(i) * (1 + h * 0.07)); P.setZ(i, P.getZ(i) * (1 + h * 0.07)); }
        g.translate(0, 1.8, 0);
        const parts = [{ geo: g, color: '#c4a574', jit: 0.25, grad: 0.35 }, { geo: new THREE.CylinderGeometry(0.55, 0.9, 1.0, 6), pos: [0, 0.5, 0], color: '#6f8f3c', jit: 0.3 }];
        return merge(parts);
      };
      const RUNES = () => merge([boxP(0.06, 0.5, 0.02, 0, 2.2, 0.5, '#8ff5d6'), boxP(0.35, 0.05, 0.02, 0, 2.4, 0.5, '#8ff5d6'), boxP(0.05, 0.3, 0.02, 0.2, 1.8, 0.58, '#8ff5d6'), boxP(0.25, 0.05, 0.02, -0.1, 1.6, 0.6, '#8ff5d6')]);
      const BALLOON = () => {
        const g = new THREE.Group();
        const env = new THREE.Mesh(tr(new THREE.SphereGeometry(1, 24, 16)), tr(std({ map: T('balloon'), roughness: 0.6, side: THREE.FrontSide })));
        env.scale.set(7, 8.5, 7); env.position.y = 9.5; g.add(env);
        const lower = new THREE.Mesh(tr(new THREE.ConeGeometry(2.6, 3.4, 18, 1, true)), env.material);
        lower.rotation.x = PI; lower.position.y = 2.6; g.add(lower);
        const basket = mesh(new THREE.BoxGeometry(2, 1.4, 2), mat('planks'), 0, -1.4, 0); g.add(basket);
        const ro = [];
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) ro.push(cylP(0.04, 0.04, 3.2, sx * 0.9, 1.0, sz * 0.9, '#c8a46a', 4, [sz * 0.25, 0, -sx * 0.25]));
        g.add(mesh(merge(ro), mat('vc')));
        return g;
      };

      // Er (x, z) mindst m meter fra platformens fodaftryk? (rektangel/cirkel)
      const rectDist = (p, x, z) => {
        const dx = x - p.x, dz = z - p.z;
        if (p.shape === 'cyl') return Math.max(0, Math.hypot(dx, dz) - p.w / 2);
        const f = ctx.fwdVec(p.yaw), r = ctx.rightVec(p.yaw), lz = dx * f.x + dz * f.z, lx = dx * r.x + dz * r.z;
        return Math.hypot(Math.max(Math.abs(lx) - p.w / 2, 0), Math.max(Math.abs(lz) - p.d / 2, 0));
      };

      const inst = [], windmills = [], balloons = [], smoke = [], sparkTime = { value: 0 };
      return {
        ventColor: '#fff0c0',
        platform, bar, zip, anchor, spinArm,
        decor(data) {
          const root = new THREE.Group(), plats = data.plats, B = data.bounds, r = ctx.mulberry32(5150 + ctx.levelIndex);
          const lavaY = ctx.lavaY, P0 = plats[0], PL = plats[plats.length - 1];
          // frit for banen? (y = ø-overflade, dep = dybde, m = ekstra margin)
          const free = (x, y, z, rad, dep, m = 8) => {
            for (const p of plats) {
              if (y - dep > p.top + 8 || y + 14 < p.top - 6) continue;
              if (rectDist(p, x, z) < rad + m) return false;
            }
            return true;
          };
          const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), Y = new V3(0, 1, 0);
          const put = (list, x, y, z, s, ry = 0, sy = s) => { M4.compose(new V3(x, y, z), Q.setFromAxisAngle(Y, ry), new V3(s, sy, s)); list.push(M4.clone()); };
          const L = { top: [[], [], []], tree: [], poplar: [], bush: [], sheep: [], fence: [], hay: [], barn: [], menhir: [], runes: [], cottage: [], sky: [] };
          const islands = [];
          const addIsland = (x, y, z, R, o = {}) => {
            const dep = Math.min(R * 0.95 + 5, y - lavaY - 4);
            if (dep < 4) return null;
            const v = (r() * 3) | 0;
            put(L.top[v], x, y, z, R, r() * TAU, dep);
            islands.push({ x, y, z, R, dep, v });
            return islands[islands.length - 1];
          };
          // 1) spredte gårdøer rundt om banen
          const span = Math.max(80, B.radius);
          for (let tries = 0, n = 0; tries < 400 && n < 34; tries++) {
            const base = plats[(r() * plats.length) | 0], a = r() * TAU, dist = rr(r, 28, 60 + span * 0.7);
            const R = rr(r, 7, 26), x = base.x + Math.cos(a) * dist, z = base.z + Math.sin(a) * dist, y = rr(r, base.top - 62, base.top + 24);
            if (y < lavaY + 16 || !free(x, y, z, R, R * 0.95 + 5, 10)) continue;
            if (islands.some((q) => Math.hypot(q.x - x, q.z - z) < q.R + R + 8 && Math.abs(q.y - y) < 26)) continue;
            const isl = addIsland(x, y, z, R);
            if (!isl) continue;
            n++;
            const kind = r(), cnt = (k) => Math.round(k * R / 12);
            const spot = (rad) => { const q = r() * TAU, d = Math.sqrt(r()) * R * rad; return [x + Math.cos(q) * d, z + Math.sin(q) * d]; };
            if (kind < 0.18 && R > 12) { const s = spot(0.4); put(L.barn, s[0], y, s[1], 1.0, r() * TAU); }
            if (kind > 0.8 && R > 11) { const s = spot(0.3); windmills.push({ x: s[0], y, z: s[1], s: 0.7, ry: r() * TAU }); }
            for (let i = 0; i < cnt(5) + 2; i++) { const s = spot(0.85); put(r() < 0.3 ? L.poplar : L.tree, s[0], y, s[1], rr(r, 1.2, 2.2), r() * TAU); }
            for (let i = 0; i < cnt(4); i++) { const s = spot(0.85); put(L.bush, s[0], y, s[1], rr(r, 0.9, 1.6), r() * TAU); }
            const gx = spot(0.5);
            for (let i = 0; i < 2 + cnt(4); i++) put(L.sheep, gx[0] + rr(r, -5, 5), y, gx[1] + rr(r, -5, 5), rr(r, 1.1, 1.5), r() * TAU);
            if (r() < 0.5) for (let i = 0; i < 3; i++) { const s = spot(0.7); put(L.hay, s[0], y, s[1], rr(r, 1.3, 2), r() * TAU); }
            if (r() < 0.55) for (let i = 0; i < 7; i++) { const q = r() * TAU; put(L.fence, x + Math.cos(q) * R * 0.88, y, z + Math.sin(q) * R * 0.88, 1.3, -q + PI / 2); }
          }
          // 2) startens stuehus ved siden af verandaen (på sin egen ø, lavere end banen)
          const place = (p, side, gap, size) => {
            const f = ctx.fwdVec(p.yaw), rv = ctx.rightVec(p.yaw);
            const c = (s) => ({ x: p.x + rv.x * s * (p.w / 2 + gap + size) , z: p.z + rv.z * s * (p.w / 2 + gap + size), yaw: p.yaw + (s > 0 ? -PI / 2 : PI / 2) });
            void f; return c(side);
          };
          for (const side of [-1, 1]) {
            const c = place(P0, side, 0.8, 3.0);
            if (plats.slice(1).every((p) => rectDist(p, c.x, c.z) > 5)) {
              const y = P0.top - 2.6;
              put(L.cottage, c.x, P0.top, c.z, 1.0, -c.yaw);
              addIsland(c.x, y, c.z, 6.2); // hovedøen under huset
              for (let i = 0; i < 4; i++) put(L.sheep, c.x + rr(r, -3, 3), y, c.z + rr(r, 3.4, 5.5), 1.2, r() * TAU);
              smoke.push({ x: c.x + Math.cos(-c.yaw) * 0 + 2.0, y: P0.top + 6.9, z: c.z - 0.8 });
              break;
            }
          }
          // 3) målet: menhir-ring på små øer, æbletræ og vindmølle bagved
          const fF = ctx.fwdVec(PL.yaw), fR = ctx.rightVec(PL.yaw);
          const Rr = Math.max(PL.w, PL.d) / 2 * 1.42 + 2.6;
          for (let i = 0; i < 10; i++) {
            const a = (i / 10) * TAU + 0.2, dx = Math.cos(a), dz = Math.sin(a);
            if (dx * -fF.x + dz * -fF.z > 0.55) continue; // hold indflyvningen fri
            const x = PL.x + dx * Rr, z = PL.z + dz * Rr, y = PL.top - 1.8;
            if (!plats.every((p) => p === PL || rectDist(p, x, z) > 3.2) || !addIsland(x, y, z, 2.3)) continue;
            put(L.menhir, x, y, z, rr(r, 0.9, 1.25), r() * TAU); put(L.runes, x, y, z, 1, 0);
          }
          const tl = [1, -1].map((s) => ({ x: PL.x + fR.x * s * (PL.w / 2 + 6.5) + fF.x * 1.5, z: PL.z + fR.z * s * (PL.w / 2 + 6.5) + fF.z * 1.5 })).find((c) => plats.every((p) => p === PL || rectDist(p, c.x, c.z) > 6));
          if (tl) {
            addIsland(tl.x, PL.top - 2.4, tl.z, 4.4);
            const ap = merge([
              cylP(0.35, 0.5, 3.2, 0, 1.6, 0, '#5e3f25', 8, [0, 0, 0.06]), ...[[0, 4.9, 0, 2.5], [1.8, 4.3, 0.6, 1.9], [-1.7, 4.4, -0.5, 1.9], [0.3, 6.2, -0.4, 1.6], [0.6, 4.4, 1.9, 1.5]].map((q) => ballP(q[3], q[0], q[1], q[2], '#5aa843', [1, 0.85, 1], 0.3, { grad: 0.4 })),
              ...Array.from({ length: 22 }, (_, i) => { const a = i * 2.4, rad = 2.0 + (i % 3) * 0.35; return ballP(0.17, Math.cos(a) * rad, 4.0 + (i % 5) * 0.55, Math.sin(a) * rad, i % 4 ? '#d9352a' : '#f2b630'); }),
            ]);
            const m = mesh(ap, mat('vc')); m.position.set(tl.x, PL.top - 2.4, tl.z); m.userData.noCastShadow = false; m.castShadow = true; root.add(m);
          }
          const mp = { x: PL.x + fF.x * 52 - fR.x * 10, z: PL.z + fF.z * 52 - fR.z * 10 };
          if (addIsland(mp.x, PL.top - 9, mp.z, 17)) windmills.push({ x: mp.x, y: PL.top - 9, z: mp.z, s: 1.5, ry: -PL.yaw + PI, hero: true });
          // 4) ø-instanser (top + kegle i ét net), træer, får, huse …
          const topGeo = (seed) => {
            const g = coneGeo(1, 1, 1, seed * 31 + 7, { e0: 2.2, sTop: 1, wobAmp: 0.12, wob: [seed, seed * 2.3], tileU: 1.4, vScale: 1.0, pow: 0.75 });
            const R = 22, f = profile(1, 1, 1, { e0: 2.2, sTop: 1, wobAmp: 0.12, wob: [seed, seed * 2.3], pow: 0.75 }), P = [], U = [], I = [];
            P.push(0, 0.02, 0); U.push(0, 0);
            for (let i = 0; i <= R; i++) { const q = f(0, (i / R) * TAU); P.push(q[0], 0.02, q[2]); U.push(q[0] * 6, -q[2] * 6); }
            for (let i = 1; i <= R; i++) I.push(0, i + 1, i);
            const t = new THREE.BufferGeometry();
            t.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); t.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
            t.setAttribute('normal', new THREE.Float32BufferAttribute(P.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3)); t.setIndex(I);
            return { cone: g, top: t };
          };
          const imesh = (geo, material, list, shadow = false) => {
            if (!list.length) return null;
            const m = new THREE.InstancedMesh(tr(geo), material, list.length);
            list.forEach((mx, i) => m.setMatrixAt(i, mx));
            m.instanceMatrix.needsUpdate = true; m.frustumCulled = false; m.castShadow = shadow; m.receiveShadow = true;
            root.add(m); return m;
          };
          L.top.forEach((list, i) => {
            const t = topGeo(i + 1);
            imesh(t.cone, mat('soil'), list);
            imesh(t.top, mat('turfTop'), list);
          });
          imesh(prop('tree', TREE('oak')), mat('vc'), L.tree, true);
          imesh(prop('poplar', TREE('poplar')), mat('vc'), L.poplar);
          imesh(prop('bush', TREE('bush')), mat('vc'), L.bush);
          imesh(prop('sheep', SHEEP), mat('vc'), L.sheep);
          imesh(prop('fence', FENCE), mat('vc'), L.fence);
          imesh(prop('hay', HAYROLL), mat('vc'), L.hay);
          imesh(prop('barn', BARN), mat('vc'), L.barn);
          imesh(prop('cottage', COTTAGE), mat('vc'), L.cottage, true);
          imesh(prop('menhir', MENHIR), mat('vc'), L.menhir, true);
          const rm = imesh(prop('runes', RUNES), tr(new THREE.MeshBasicMaterial({ color: '#8ff5d6' })), L.runes);
          if (rm) rm.castShadow = false;
          // vindmøller (den store drejer bag portalen)
          const millTower = prop('mill', () => merge([
            { geo: new THREE.CylinderGeometry(1.6, 2.6, 9, 8), pos: [0, 4.5, 0], color: '#f2e6cf', jit: 0.08 }, { geo: new THREE.ConeGeometry(2.1, 2.8, 8), pos: [0, 10.4, 0], color: '#7a4a2a' },
            boxP(0.9, 1.7, 0.2, 0, 0.85, 2.5, '#3e7f77'), boxP(0.7, 0.9, 0.2, 0, 5.5, 1.9, '#8fc9e6'),
          ]));
          const sail = prop('sail', () => {
            const parts = [boxP(0.5, 0.5, 0.5, 0, 0, 0, '#5e3f23')];
            for (let i = 0; i < 4; i++) {
              const a = (i * PI) / 2, c = Math.cos(a), s = Math.sin(a);
              parts.push(boxP(0.22, 9.4, 0.18, -s * 4.7, c * 4.7, 0, '#6e4a2c', [0, 0, a]));
              parts.push(boxP(1.5, 6.6, 0.06, c * 0.95 - s * 5.3, s * 0.95 + c * 5.3, 0.14, i % 2 ? '#f6ecd6' : '#efe3c8', [0, 0, a]));
              for (let k = 1; k < 5; k++) parts.push(boxP(1.6, 0.1, 0.1, c * 0.95 - s * (1.3 + k * 1.4), s * 0.95 + c * (1.3 + k * 1.4), 0.17, '#7a4e2a', [0, 0, a]));
            }
            return merge(parts);
          });
          for (const w of windmills) {
            const g = new THREE.Group();
            g.add(mesh(millTower.clone(), mat('vc')), (() => { const s = mesh(sail.clone(), mat('vc')); s.position.set(0, 7.2, 3.0); w.sail = s; return s; })());
            g.position.set(w.x, w.y, w.z); g.rotation.y = w.ry; g.scale.setScalar(w.s);
            g.traverse((o) => { if (o.isMesh) o.castShadow = !!w.hero; });
            root.add(g);
          }
          // 5) vandfald fra de fjerne øer ned i dis
          const falls = [];
          for (const q of islands) {
            if (r() < 0.45 && q.R > 9) {
              const th = r() * TAU, H = Math.min(q.dep + 14, q.y - lavaY - 6 + q.dep * 0.1);
              falls.push({ x: q.x + Math.cos(th) * q.R * 0.9, y: q.y - 1.5, z: q.z + Math.sin(th) * q.R * 0.9, H: Math.max(10, H), wd: 0.8 + r() * 1.0, face: th });
            }
          }
          if (falls.length) { const wm = mesh(fallsGeo(falls), mat('water')); wm.userData.noCastShadow = true; wm.renderOrder = 2; root.add(wm); waterMeshes.push(wm); }
          // 6) morgendis under banen (to bløde lag), sol-glød, luftballoner, byens silhuet
          const mistMat = tr(new THREE.MeshBasicMaterial({ map: T('mist'), transparent: true, depthWrite: false, fog: true, opacity: 0.8, side: THREE.DoubleSide }));
          mistMat.map.repeat.set(7, 7);
          for (const [dy, off] of [[-26, 0], [-36, 0.37]]) {
            const m = new THREE.Mesh(tr(new THREE.PlaneGeometry(2600, 2600).rotateX(-PI / 2)), mistMat);
            m.position.set(B.cx, B.minY + dy, B.cz); m.renderOrder = -1; m.userData.off = off; root.add(m);
          }
          const sv = sunVec(), cen = new V3(B.cx, 0, B.cz);
          for (const [sc, op] of [[900, 0.55], [2600, 0.25]]) {
            const sp = new THREE.Sprite(tr(new THREE.SpriteMaterial({ map: ctx.TEX.glow, color: '#ffd7a0', transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending, opacity: op })));
            sp.position.copy(cen).addScaledVector(sv, 1500); sp.scale.set(sc, sc, 1); root.add(sp);
          }
          const bl = prop('balloon', () => new THREE.BufferGeometry());
          void bl;
          for (const [d, side, hh, s] of [[170, 80, 70, 1.6], [-90, -150, 40, 1]]) {
            const b = BALLOON();
            const pos = new V3(PL.x + fF.x * d + fR.x * side, PL.top + hh, PL.z + fF.z * d + fR.z * side);
            b.position.copy(pos); b.scale.setScalar(s * 2.2); b.userData.base = pos.clone(); b.userData.ph = r() * TAU;
            b.traverse((o) => { if (o.isMesh) o.castShadow = false; });
            root.add(b); balloons.push(b);
          }
          // byens silhuet i horisonten bag målet (bane 2)
          const sk = [];
          for (let i = 0; i < 46; i++) {
            const a = Math.atan2(fF.z, fF.x) + rr(r, -0.5, 0.5), d = 1150 + r() * 80, w = rr(r, 14, 38), h = rr(r, 25, 120) * (1 - Math.abs(a - Math.atan2(fF.z, fF.x)) * 0.6);
            M4.compose(new V3(PL.x + Math.cos(a) * d, PL.top - 30 + h / 2, PL.z + Math.sin(a) * d), Q.setFromAxisAngle(Y, -a), new V3(w, h, w * 0.7)); sk.push(M4.clone());
          }
          imesh(new THREE.BoxGeometry(1, 1, 1), tr(new THREE.MeshBasicMaterial({ color: '#c9a6b8', fog: false })), sk);
          // dug og svævende frøuld
          const SP = tr(new THREE.ShaderMaterial({
            uniforms: { uTime: sparkTime }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
            vertexShader: `uniform float uTime; attribute float aPh; varying float vA;
              void main(){ vec3 p = position; p.x += sin(uTime*0.4 + aPh*6.0)*1.5; p.y += sin(uTime*0.6 + aPh*9.0)*1.1; p.z += cos(uTime*0.35 + aPh*5.0)*1.5;
                vec3 c = cameraPosition; p = c + mod(p - c + 45.0, 90.0) - 45.0;
                vA = 0.35 + 0.65 * pow(0.5 + 0.5*sin(uTime*(1.2+aPh*2.0) + aPh*40.0), 3.0);
                vec4 mv = viewMatrix * vec4(p,1.0); gl_PointSize = clamp(90.0 / -mv.z, 1.5, 7.0); gl_Position = projectionMatrix * mv; }`,
            fragmentShader: `varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); gl_FragColor = vec4(vec3(1.0,0.93,0.72), smoothstep(0.5,0.0,d) * vA); }`,
          }));
          const N = 380, sp = new Float32Array(N * 3), ph = new Float32Array(N);
          for (let i = 0; i < N; i++) { sp[i * 3] = r() * 90 - 45; sp[i * 3 + 1] = r() * 90 - 45; sp[i * 3 + 2] = r() * 90 - 45; ph[i] = r(); }
          const sg = tr(new THREE.BufferGeometry());
          sg.setAttribute('position', new THREE.BufferAttribute(sp, 3)); sg.setAttribute('aPh', new THREE.BufferAttribute(ph, 1));
          const pts = new THREE.Points(sg, SP); pts.frustumCulled = false; root.add(pts);
          // skorstensrøg
          for (const sm of smoke) {
            sm.puffs = [];
            for (let i = 0; i < 4; i++) {
              const s = new THREE.Sprite(tr(new THREE.SpriteMaterial({ map: ctx.TEX.glow, color: '#fff3e2', transparent: true, depthWrite: false, opacity: 0.4 })));
              s.userData.t = i / 4; root.add(s); sm.puffs.push(s);
            }
          }
          return root;
        },
        update(dt, t) {
          sparkTime.value = t;
          for (const w of waterMeshes) w.material.map.offset.y = -(t * 0.9) % 1;
          for (const b of belts) if (b.t) b.t.offset.y -= dt * (Math.abs(b.p.belt) / 2.4);
          for (const w of windmills) if (w.sail) w.sail.rotation.z += dt * (w.hero ? 0.5 : 0.35);
          for (const b of balloons) {
            b.position.set(b.userData.base.x + Math.sin(t * 0.04 + b.userData.ph) * 28, b.userData.base.y + Math.sin(t * 0.3 + b.userData.ph) * 2, b.userData.base.z + Math.cos(t * 0.03 + b.userData.ph) * 20);
            b.rotation.y = t * 0.02;
          }
          for (const sm of smoke) for (const s of sm.puffs) {
            s.userData.t = (s.userData.t + dt * 0.12) % 1;
            const k = s.userData.t;
            s.position.set(sm.x + k * 1.6, sm.y + k * 4.5, sm.z); s.scale.setScalar(0.8 + k * 3.2); s.material.opacity = 0.42 * (1 - k);
          }
        },
      };
    },
  };
})();
