/* =====================================================================
   VERDENSSÆT 'glacier' – Gletsjeren (bane 4)
   Frostgråt vejr over drivende gletsjerblokke: sne på mørk klippe, blank
   gennemsigtig is med istapper, tyndt is der revner, roterende isflager,
   igloer, snedækkede graner og en rød forskningsstation med antenne ved
   det frosne vandfald. Bagved: enorme gletsjere og en kæmpe isbjergs-bue.
   ===================================================================== */
(function () {
  'use strict';

  // Frost-overskyet: bleg blå himmel, hvid horisont, kold blå dis
  window.SKYHOJ_THEMES.glacier = {
    top: '#a9c4dc', horizon: '#eef4fa', bottom: '#c6d9e8', sunElev: 26, sunAz: -35, sunColor: '#f6faff', sunInt: 2.3,
    hemiSky: '#dcecfa', hemiInt: 1.15, fog: '#cfe0ef', fogNear: 70, fogFar: 540, cloud: '#f4f8fc', clouds: 0.95, stars: 0,
    stone: '#7d8b9a', exposure: 1.05, lavaGlow: 0.85,
  };

  window.SKYHOJ_KITS.glacier = {
    id: 'glacier',
    name: 'Gletsjeren',
    variants: {
      rock: 'Bar mørk klippeknold med sneplamper (godt greb). Kasse w 2.5-6, d 2.5-8 eller shape:"cyl" w 2.5-6. Standard for t:"p" er ellers snedækket klippe.',
      ice: 'Blank, gennemsigtig blå is med istapper under (glat kant). Kasse w 3-8 eller cyl w 3-7. Samme udseende som t:"ice".',
      waterfall: 'Frosset vandfald: lodrette ismønstre, hvid-blå top og istapsøjler nedenunder. Kasse w 3-8, d 2-5, h 0.8-1.6 (til stablede afsatser).',
      floe: 'Flydende isflage af revnede plader med en iskøl under. shape:"cyl" w 4-8 (standard for t:"rot") eller kasse w 3-7.',
      igloo: 'Tag af snefliser (iglo-blokke) med tyk snetop. Kasse eller cyl, w 3-7, h 1-2.',
      deck: 'Rødt forskningsstationsdæk af diamantplade med ravgul kant på ståltårne (standard for t:"finish"). Kasse w 3-12, d 3-12.',
      plank: 'Ekspeditionens plankegang med snestøv på pæle. Lange kasser w 2-3.5, d 4-12.',
      overhang: 'Tyk snedækket klippeudhæng med lange, tætte istapper under (til istappe-shimmy). Kasse w 4-10, d 2-5, h 1.2-2.',
    },
    barVariants: {
      ice: 'Frossen istap-stang: blank blå is med rimfrost-bånd og iskugler i enderne (standard)',
      steel: 'Forskningsstationens stålrør med orange bånd og rim',
      pine: 'Frosset grangren med småkviste',
    },
    create(ctx) {
      const { THREE } = ctx;
      const PI = Math.PI, TAU = PI * 2, V3 = THREE.Vector3;
      const tr = (o) => ctx.track(o);
      const rnd = ctx.mulberry32, clamp = ctx.clamp, lerp = ctx.lerp;
      const hex = (h) => new THREE.Color(h);
      const WHITE = hex('#ffffff');

      /* ---------- Teksturer (tegnes først, når de bruges; max 12) ---------- */
      const texC = {};
      const tex = (key, paint, opt) => texC[key] || (texC[key] = tr(ctx.toTexture(paint(), opt)));
      const crackData = (S, rng, n, step, wmax) => { // revner som tilfældige vandringer (alfakanal)
        const c = ctx.makeCanvas(S), g = c.getContext('2d');
        g.strokeStyle = '#fff'; g.lineCap = 'round';
        for (let k = 0; k < n; k++) {
          let x = S * 0.1 + rng() * S * 0.8, y = S * 0.1 + rng() * S * 0.8, a = rng() * TAU;
          g.lineWidth = 0.7 + rng() * wmax; g.beginPath(); g.moveTo(x, y);
          for (let s = 0; s < 16; s++) {
            a += (rng() - 0.5) * 1.2; x += Math.cos(a) * step; y += Math.sin(a) * step;
            if (x < 10 || x > S - 10) a = PI - a;
            if (y < 10 || y > S - 10) a = -a;
            g.lineTo(x, y);
          }
          g.stroke();
        }
        return g.getImageData(0, 0, S, S).data;
      };
      // Sne: bløde driver, vindrifler og glimt
      const snowTex = () => tex('snow', () => {
        const S = 512, r = rnd(11), a = ctx.tileNoise(S, 4, 4, r), b = ctx.tileNoise(S, 28, 2, r), c = ctx.tileNoise(S, 128, 1, r);
        return ctx.paintPixels(S, (x, y, px) => {
          const i = y * S + x, rip = 0.5 + 0.5 * Math.sin((x / S) * TAU * 7 + a[i] * 16);
          const v = 0.95 + (a[i] - 0.5) * 0.16 + (b[i] - 0.5) * 0.05 - rip * 0.03, sp = c[i] > 0.9 ? 0.1 : 0;
          px[0] = v - 0.05 + sp; px[1] = v - 0.018 + sp; px[2] = v + 0.03 + sp; px[3] = 0.5;
        }).col;
      });
      // Mørk klippe med lag og sne i fordybninger; band = snekant øverst (til lodrette vægge)
      const rockPaint = (S, band) => {
        const r = rnd(band ? 23 : 29), a = ctx.tileNoise(S, 3, 5, r), b = ctx.tileNoise(S, 14, 3, r), c = ctx.tileNoise(S, 70, 2, r);
        return ctx.paintPixels(S, (x, y, px) => {
          const i = y * S + x, strata = 0.5 + 0.5 * Math.sin((y / S) * TAU * 4 + a[i] * 9);
          let v = 0.2 + a[i] * 0.2 + strata * 0.05 + (c[i] - 0.5) * 0.1, sn = clamp((a[i] - 0.64) * 10, 0, 1), e = 0;
          if (Math.abs(b[i] - 0.5) < 0.011) v -= 0.09;
          if (band) {
            const edge = 74 + 18 * Math.sin((TAU * 3 * x) / S + 1) + 13 * Math.sin((TAU * 7 * x) / S + 2.4) + 8 * Math.sin((TAU * 13 * x) / S + 4.1) + (c[i] - 0.5) * 14;
            if (y < edge) { sn = 1; e = clamp((y - (edge - 16)) / 16, 0, 1); } else v *= 0.6 + 0.4 * clamp((y - edge) / 40, 0, 1);
          }
          const w = 0.95 - e * 0.1;
          px[0] = lerp(v * 0.95, w - 0.05, sn); px[1] = lerp(v, w - 0.015, sn); px[2] = lerp(v * 1.12, w + 0.03, sn); px[3] = 0.5;
        }).col;
      };
      const rockTex = () => tex('rock', () => rockPaint(512, false));
      const wallTex = () => tex('wall', () => rockPaint(512, true));
      const iceTopTex = () => tex('iceTop', () => {
        const S = 512, r = rnd(31), n = ctx.tileNoise(S, 4, 5, r), f = ctx.tileNoise(S, 36, 2, r), cr = crackData(S, r, 22, 16, 1.6);
        return ctx.paintPixels(S, (x, y, px) => {
          const i = y * S + x, c = cr[i * 4 + 3] / 255, bub = f[i] > 0.84 ? 0.1 : 0;
          px[0] = 0.5 + n[i] * 0.22 + c * 0.4 + bub; px[1] = 0.78 + n[i] * 0.14 + c * 0.2 + bub; px[2] = 0.97; px[3] = 0.5;
        }).col;
      });
      // Lodrette istræk med rimfrost øverst (y=0 er toppen af væggen)
      const iceSideTex = () => tex('iceSide', () => {
        const S = 512, r = rnd(37), n = ctx.tileNoise(S, 6, 4, r), f = ctx.tileNoise(S, 48, 2, r);
        return ctx.paintPixels(S, (x, y, px) => {
          const i = y * S + x, st = 0.5 + 0.5 * Math.sin((x / S) * TAU * 9 + n[i] * 7 + f[i] * 2), dep = y / S;
          const frost = clamp(1 - dep / 0.12, 0, 1), bub = f[i] > 0.86 ? 0.14 : 0;
          px[0] = lerp(0.36 + st * 0.12 + n[i] * 0.1 + bub, 0.92, frost);
          px[1] = lerp(0.66 + st * 0.12 + bub * 0.7, 0.97, frost);
          px[2] = lerp(0.93 - dep * 0.08, 1, frost); px[3] = 0.5;
        }).col;
      });
      // Pakis: hvide plader adskilt af mørkeblå revner (tilet Voronoi)
      const floeTex = () => tex('floe', () => {
        const S = 512, r = rnd(41), pts = [], nz = ctx.tileNoise(S, 8, 3, r);
        for (let i = 0; i < 11; i++) pts.push([r() * S, r() * S, i % 3]);
        const cols = [[0.95, 0.98, 1], [0.8, 0.92, 0.99], [0.88, 0.94, 0.98]];
        return ctx.paintPixels(S, (x, y, px) => {
          let d1 = 1e9, d2 = 1e9, id = 0;
          for (const [cx, cy, k] of pts) {
            for (let ox = -S; ox <= S; ox += S) for (let oy = -S; oy <= S; oy += S) {
              const d = (x - cx - ox) * (x - cx - ox) + (y - cy - oy) * (y - cy - oy);
              if (d < d1) { d2 = d1; d1 = d; id = k; } else if (d < d2) d2 = d;
            }
          }
          const gap = Math.sqrt(d2) - Math.sqrt(d1), seam = clamp(gap / 9, 0, 1), c = cols[id], sh = 0.94 + (nz[y * S + x] - 0.5) * 0.18;
          const hi = clamp(1 - Math.abs(gap - 12) / 6, 0, 1) * 0.12;   // lys kant lige uden for revnen
          px[0] = lerp(0.12, c[0] * sh + hi, seam); px[1] = lerp(0.36, c[1] * sh + hi, seam); px[2] = lerp(0.66, c[2] * sh + hi * 0.5, seam); px[3] = 0.5;
        }).col;
      });
      // Rød diamantplade (stationens stål)
      const deckTex = () => tex('deck', () => {
        const S = 256, r = rnd(53), n = ctx.tileNoise(S, 6, 3, r);
        return ctx.paintPixels(S, (x, y, px) => {
          const u = (x % 32) / 32 - 0.5, v = (y % 32) / 32 - 0.5, row = ((x >> 5) + (y >> 5)) & 1;
          const l = row ? Math.abs(u * 0.5 + v) : Math.abs(u * 0.5 - v), dia = l < 0.1 && Math.abs(u) < 0.42 && Math.abs(v) < 0.42 ? 1 : 0;
          const k = 0.62 + (n[y * S + x] - 0.5) * 0.25 + dia * 0.12;
          px[0] = k * 0.96; px[1] = k * 0.2; px[2] = k * 0.16; px[3] = 0.5;
        }).col;
      });
      // Plankegang med snestøv i fugerne (planker langs v)
      const woodTex = () => tex('wood', () => {
        const S = 256, r = rnd(61), n = ctx.tileNoise(S, 5, 4, r), g2 = ctx.tileNoise(S, 48, 1, r);
        return ctx.paintPixels(S, (x, y, px) => {
          const i = y * S + x, pl = x % 64, shade = 0.78 + (((x >> 6) * 37) % 7) * 0.035;
          let k = (0.36 + (n[i] - 0.5) * 0.2 + (0.5 + 0.5 * Math.sin((x / S) * TAU * 28 + n[i] * 9)) * 0.07) * shade;
          if (pl < 3 || pl > 61) k *= 0.35;
          const sn = pl < 5 || pl > 59 ? 0.5 : g2[i] > 0.78 ? 0.7 : 0;
          px[0] = lerp(k * 1.25, 0.9, sn); px[1] = lerp(k * 0.82, 0.94, sn); px[2] = lerp(k * 0.52, 0.98, sn); px[3] = 0.5;
        }).col;
      });
      // Sneblokke (iglo-sten) med blå fuger
      const brickTex = () => tex('brick', () => {
        const S = 256, r = rnd(67), n = ctx.tileNoise(S, 8, 3, r);
        return ctx.paintPixels(S, (x, y, px) => {
          const row = y >> 5, xo = (x + (row & 1) * 32) % 64, id = ((x + (row & 1) * 32) >> 6) + row * 7;
          const sh = 0.9 + ((id * 53) % 9) * 0.012 + (n[y * S + x] - 0.5) * 0.08;
          if (xo < 3 || y % 32 < 3) { px[0] = 0.55; px[1] = 0.72; px[2] = 0.9; } else { px[0] = sh - 0.04; px[1] = sh; px[2] = sh + 0.05; }
          px[3] = 0.5;
        }).col;
      });
      const beltTex = () => tex('belt', () => { // snekat-bælte med hvide pile (op på lærredet = frem langs -Z)
        const c = ctx.makeCanvas(128, 256), g = c.getContext('2d');
        g.fillStyle = '#23272e'; g.fillRect(0, 0, 128, 256);
        g.fillStyle = '#3a4048'; for (let y = 0; y < 256; y += 16) g.fillRect(0, y, 128, 4);
        g.fillStyle = '#f2f6fa';
        for (const y0 of [34, 162]) {
          g.beginPath(); g.moveTo(64, y0); g.lineTo(104, y0 + 40); g.lineTo(84, y0 + 40); g.lineTo(64, y0 + 20);
          g.lineTo(44, y0 + 40); g.lineTo(24, y0 + 40); g.closePath(); g.fill();
        }
        return c;
      });
      const grateTex = () => tex('grate', () => { // varmeventil: sort rist over glødende bund
        const c = ctx.makeCanvas(128), g = c.getContext('2d'), r = rnd(71);
        g.fillStyle = '#16191e'; g.fillRect(0, 0, 128, 128);
        for (let y = 0; y < 128; y += 16) for (let x = 0; x < 128; x += 16) {
          g.fillStyle = `rgb(${200 + r() * 55 | 0},${70 + r() * 60 | 0},20)`; g.fillRect(x + 5, y + 5, 11, 11);
        }
        g.fillStyle = '#6d7a88'; for (let i = 0; i < 128; i += 16) { g.fillRect(i, 0, 5, 128); g.fillRect(0, i, 128, 5); }
        return c;
      });
      const cushionTex = () => tex('cushion', () => { // oppustelig redningspude med hvide pile
        const c = ctx.makeCanvas(256), g = c.getContext('2d');
        g.fillStyle = '#c94a10'; g.fillRect(0, 0, 256, 256);
        const gr = g.createRadialGradient(128, 128, 10, 128, 128, 140); gr.addColorStop(0, '#ff9a3c'); gr.addColorStop(1, '#e8651a');
        g.fillStyle = gr; g.fillRect(14, 14, 228, 228);
        g.setLineDash([10, 8]); g.strokeStyle = '#fff1d8'; g.lineWidth = 3; g.strokeRect(24, 24, 208, 208);
        g.setLineDash([]); g.fillStyle = 'rgba(255,255,255,0.92)';
        for (let k = 0; k < 2; k++) {
          const y0 = 150 - k * 56;
          g.beginPath(); g.moveTo(78, y0 + 34); g.lineTo(128, y0 - 12); g.lineTo(178, y0 + 34); g.lineTo(160, y0 + 44);
          g.lineTo(128, y0 + 14); g.lineTo(96, y0 + 44); g.closePath(); g.fill();
        }
        return c;
      }, { repeat: false });

      /* ---------- Materialer ---------- */
      const M = {};
      const mat = (k, f) => M[k] || (M[k] = tr(f()));
      const std = (o) => new THREE.MeshStandardMaterial(o);
      // Fresnel-glans (kant lyser op) på is
      const fresnel = (m, color, pw, k) => {
        const c = hex(color);
        m.onBeforeCompile = (s) => {
          s.uniforms.uRim = { value: c };
          s.fragmentShader = s.fragmentShader.replace('void main() {', 'uniform vec3 uRim;\nvoid main() {').replace('#include <emissivemap_fragment>',
            `#include <emissivemap_fragment>\n totalEmissiveRadiance += uRim * pow(1.0 - saturate(abs(dot(normalize(normal), normalize(vViewPosition)))), ${pw.toFixed(1)}) * ${k.toFixed(2)};`);
        };
        m.customProgramCacheKey = () => `fres${pw}${k}`;
        return m;
      };
      const ice = (k, map, o) => mat(k, () => fresnel(new THREE.MeshPhysicalMaterial({
        map, transparent: true, roughness: 0.1, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.06, depthWrite: true, ...o,
      }), '#bfeaff', 2.2, 0.9));
      const MT = {
        snow: () => mat('snow', () => std({ map: snowTex(), vertexColors: true, roughness: 0.9 })),
        wall: () => mat('wall', () => std({ map: wallTex(), roughness: 0.92 })),
        rock: () => mat('rock', () => std({ map: rockTex(), vertexColors: true, roughness: 0.93 })),
        rockFlat: () => mat('rockFlat', () => std({ map: rockTex(), vertexColors: true, roughness: 0.93, flatShading: true })),
        iceTop: () => ice('iceTop', iceTopTex(), { vertexColors: true, color: '#e6f6ff', opacity: 0.9, emissive: '#2a78b8', emissiveIntensity: 0.3 }),
        iceSide: () => ice('iceSide', iceSideTex(), { color: '#dff4ff', opacity: 0.86, emissive: '#2a78b8', emissiveIntensity: 0.34 }),
        iceBulb: () => ice('iceBulb', iceSideTex(), { vertexColors: true, color: '#d6efff', opacity: 0.82, flatShading: true, emissive: '#2a78b8', emissiveIntensity: 0.3 }),
        fall: () => ice('fall', iceSideTex(), { color: '#f2fbff', opacity: 0.92, emissive: '#5aa2d8', emissiveIntensity: 0.3 }),
        icicle: () => ice('icicle', null, { color: '#cfeeff', opacity: 0.8, emissive: '#3b8fd0', emissiveIntensity: 0.4 }),
        floe: () => mat('floe', () => std({ map: floeTex(), vertexColors: true, roughness: 0.28, metalness: 0.05, emissive: '#1b4a78', emissiveIntensity: 0.12 })),
        thinTop: () => mat('thinTop', () => std({ map: floeTex(), vertexColors: true, roughness: 0.4, color: '#f4f9ff', emissive: '#274f7a', emissiveIntensity: 0.18 })),
        core: () => mat('core', () => std({ color: '#14558f', roughness: 0.4, emissive: '#0a3a6e', emissiveIntensity: 0.6 })),
        deck: () => mat('deck', () => std({ map: deckTex(), vertexColors: true, roughness: 0.55, metalness: 0.45 })),
        lift: () => mat('lift', () => std({ map: deckTex(), vertexColors: true, roughness: 0.5, metalness: 0.6, color: '#8aa2bd' })),
        wood: () => mat('wood', () => std({ map: woodTex(), vertexColors: true, roughness: 0.85 })),
        brick: () => mat('brick', () => std({ map: brickTex(), vertexColors: true, roughness: 0.85, flatShading: true })),
        steel: () => mat('steel', () => std({ color: '#7d8895', roughness: 0.4, metalness: 0.85 })),
        dark: () => mat('dark', () => std({ color: '#2c3440', roughness: 0.5, metalness: 0.6 })),
        orange: () => mat('orange', () => std({ color: '#e8651a', roughness: 0.55 })),
        grate: () => mat('grate', () => std({ map: grateTex(), roughness: 0.5, metalness: 0.5, emissive: '#ff7a1a', emissiveMap: grateTex(), emissiveIntensity: 0.5 })),
        belt: () => mat('belt', () => std({ map: beltTex(), roughness: 0.85 })),
        boost: () => mat('boost', () => std({ map: beltTex(), roughness: 0.4, emissive: '#38c8ff', emissiveMap: beltTex(), emissiveIntensity: 1.3 })),
        cushion: () => mat('cushion', () => std({ map: cushionTex(), vertexColors: true, roughness: 0.55 })),
        vertex: () => mat('vertex', () => std({ vertexColors: true, roughness: 0.75, flatShading: true })),
      };

      /* ---------- Geometri-hjælpere ---------- */
      const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new V3(), _s = new V3();
      const xf = (g, x = 0, y = 0, z = 0, ry = 0, sx = 1, sy = sx, sz = sx, rx = 0, rz = 0) => { // flyt/drej/skalér geometri
        _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz));
        return g.applyMatrix4(_m);
      };
      const paint = (g, c) => { // ensfarvet vertexfarve (ikke-indekseret)
        const q = g.index ? g.toNonIndexed() : g, n = q.attributes.position.count, a = new Float32Array(n * 3), k = hex(c);
        for (let i = 0; i < n; i++) { a[i * 3] = k.r; a[i * 3 + 1] = k.g; a[i * 3 + 2] = k.b; }
        q.setAttribute('color', new THREE.BufferAttribute(a, 3));
        return q;
      };
      const merge = (list) => {
        const parts = list.map((g) => (g.index ? g.toNonIndexed() : g));
        let n = 0;
        for (const q of parts) n += q.attributes.position.count;
        const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2), col = new Float32Array(n * 3).fill(1);
        let o = 0;
        for (const q of parts) {
          const A = q.attributes;
          pos.set(A.position.array, o * 3);
          if (A.normal) nor.set(A.normal.array, o * 3);
          if (A.uv) uv.set(A.uv.array, o * 2);
          if (A.color) col.set(A.color.array, o * 3);
          o += A.position.count;
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
        g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
        return g;
      };
      const mesh = (g, m, o = {}) => { // net med sporing, evt. solid / ingen skygge
        const x = new THREE.Mesh(tr(g), m);
        if (o.solid) x.userData.solid = true;
        if (o.ns) x.userData.noCastShadow = true;
        return x;
      };
      const seg = (a, b, r, rs = 8) => { // cylinder mellem to punkter
        const d = new V3().subVectors(b, a), g = new THREE.CylinderGeometry(r, r, d.length(), rs);
        g.applyQuaternion(_q.setFromUnitVectors(new V3(0, 1, 0), d.clone().normalize()));
        return g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
      };
      const dropGroup = (g, k) => { // fjern en gruppe (toppen tegnes separat)
        const idx = Array.from(g.index.array), grp = g.groups[k];
        idx.splice(grp.start, grp.count); g.setIndex(idx); g.clearGroups();
        return g;
      };
      // Vægge (u i meter, v målt nedad fra toppen) + bund; ingen top
      const sidesGeo = (p, d, tU, tV, off) => {
        const cyl = p.shape === 'cyl', hy = p.h / 2;
        const g = dropGroup(cyl ? new THREE.CylinderGeometry(p.w / 2, p.w / 2, p.h, 40, 1) : new THREE.BoxGeometry(p.w, p.h, d), cyl ? 1 : 2);
        const P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv;
        for (let i = 0; i < P.count; i++) {
          const x = P.getX(i), y = P.getY(i), z = P.getZ(i), nx = N.getX(i), nz = N.getZ(i);
          if (Math.abs(N.getY(i)) > 0.5) { U.setXY(i, x / tU, z / tV); continue; }
          const u = cyl ? (U.getX(i) * TAU * (p.w / 2)) / tU : Math.abs(nx) > 0.5 ? (-nx * z) / tU : (nz * x) / tU;
          U.setXY(i, u + off, 1 - (hy - y) / tV);
        }
        return g;
      };
      // Toppen: 3x3-gitter (kasse) eller skive+ring (cyl) med kantfarve i vertexfarver; UV i meter (fit = hele fladen)
      const topGeo = (p, d, tU, tV, band, cIn, cEdge, off, fit) => {
        const cyl = p.shape === 'cyl', R = p.w / 2;
        let g;
        if (cyl) {
          const b = Math.min(band, R * 0.45);
          g = merge([new THREE.CircleGeometry(R - b, 40), new THREE.RingGeometry(R - b, R, 40, 1)]).rotateX(-PI / 2);
        } else {
          const bx = Math.min(band, p.w * 0.45), bz = Math.min(band, d * 0.45);
          g = new THREE.PlaneGeometry(p.w, d, 3, 3).rotateX(-PI / 2);
          const P = g.attributes.position;
          for (let i = 0; i < P.count; i++) {
            const x = P.getX(i), z = P.getZ(i);
            P.setX(i, Math.abs(x) < p.w * 0.4 ? Math.sign(x) * (p.w / 2 - bx) : x);
            P.setZ(i, Math.abs(z) < d * 0.4 ? Math.sign(z) * (d / 2 - bz) : z);
          }
        }
        const P = g.attributes.position, C = g.attributes.color, U = g.attributes.uv;
        for (let i = 0; i < P.count; i++) {
          const x = P.getX(i), z = P.getZ(i);
          const edge = cyl ? Math.hypot(x, z) > R - 1e-3 : Math.abs(Math.abs(x) - p.w / 2) < 1e-4 || Math.abs(Math.abs(z) - d / 2) < 1e-4;
          const c = edge ? cEdge : cIn;
          C.setXYZ(i, c.r, c.g, c.b);
          U.setXY(i, x / tU + (fit ? 0.5 : off), -z / tV + (fit ? 0.5 : off * 0.7));
        }
        return g.translate(0, p.h / 2, 0);
      };
      // Klippeknold/iskøl under pladen: smalner nedad og bliver inden for fodaftrykket
      const bulb = (p, d, depth, rng, S, c0, c1, tile) => {
        const R = 5, g = new THREE.CylinderGeometry(1, 0.02, depth, S, R, true).translate(0, -depth / 2, 0);
        const P = g.attributes.position, U = g.attributes.uv, col = new Float32Array(P.count * 3), jit = [];
        const rx = (p.w / 2) * 0.9, rz = ((p.shape === 'cyl' ? p.w : d) / 2) * 0.9;
        for (let i = 0; i < P.count; i++) {
          const ring = Math.floor(i / (S + 1)), k = (i % (S + 1)) % S, key = ring * S + k, t = ring / R;
          if (jit[key] === undefined) jit[key] = ring === 0 ? 1 : 0.76 + rng() * 0.24;
          const f = Math.pow(1 - t, 0.8) * jit[key], a = Math.atan2(P.getZ(i), P.getX(i)), c = c0.clone().lerp(c1, Math.pow(t, 0.7));
          P.setXYZ(i, Math.cos(a) * rx * f, -depth * t, Math.sin(a) * rz * f);
          U.setXY(i, ((k / S) * TAU * rx) / tile, (-depth * t) / tile);
          col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
        }
        g.setAttribute('color', new THREE.BufferAttribute(col, 3));
        return g;
      };
      // Istapper langs undersidens kant (spids nedad)
      const icicles = (p, d, rng, perM, maxLen, rMax) => {
        const cyl = p.shape === 'cyl', hw = p.w / 2 - 0.12, hd = d / 2 - 0.12, per = cyl ? TAU * hw : 4 * (hw + hd), n = Math.round(per * perM), list = [];
        for (let i = 0; i < n; i++) {
          let x, z;
          if (cyl) { const a = rng() * TAU; x = Math.cos(a) * hw; z = Math.sin(a) * hw; } else {
            const t = rng() * per, s = hw * 2, e = hd * 2;
            if (t < s) { x = -hw + t; z = -hd; } else if (t < s + e) { x = hw; z = -hd + (t - s); } else if (t < 2 * s + e) { x = hw - (t - s - e); z = hd; } else { x = -hw; z = hd - (t - 2 * s - e); }
          }
          const len = 0.25 + Math.pow(rng(), 1.4) * maxLen, r = 0.04 + rng() * rMax;
          list.push(xf(new THREE.ConeGeometry(r, len, 5, 1, true).rotateX(PI).translate(0, -len / 2, 0), x, -p.h / 2 + 0.03, z));
        }
        return n ? merge(list) : null;
      };
      // Ståltårne under dækket / pæle under plankegangen
      const legs = (p, d, depth, r, along) => {
        const list = [], hw = p.w / 2 - 0.45, hd = d / 2 - 0.45, cyl = p.shape === 'cyl';
        const pts = cyl ? [0.785, 2.356, 3.927, 5.498].map((a) => [Math.cos(a) * (p.w / 2 - 0.55), Math.sin(a) * (p.w / 2 - 0.55)]) : [[-hw, -hd], [hw, -hd], [-hw, hd], [hw, hd]];
        if (along && !cyl) for (let z = -hd + 2.2; z < hd - 0.8; z += 2.2) pts.push([-hw, z], [hw, z]);
        for (const [x, z] of pts) list.push(xf(new THREE.CylinderGeometry(r, r * 0.7, depth, 8), x, -p.h / 2 - depth / 2 + 0.02, z));
        if (!cyl) { // tværafstivning øverst
          list.push(xf(new THREE.BoxGeometry(p.w - 0.9, 0.1, 0.1), 0, -p.h / 2 - Math.min(depth * 0.45, 1.2), -hd));
          list.push(xf(new THREE.BoxGeometry(p.w - 0.9, 0.1, 0.1), 0, -p.h / 2 - Math.min(depth * 0.45, 1.2), hd));
        }
        return merge(list);
      };
      const glowGeo = new THREE.PlaneGeometry(1, 1).rotateX(PI / 2);

      /* ---------- Udseende pr. platformtype / variant ---------- */
      const SNOWEDGE = hex('#a9c3dd'), STYLES = {
        snow: () => ({ side: MT.wall(), tU: 2, tV: 2, top: MT.snow(), tile: 3, band: 0.45, cIn: WHITE, cEdge: SNOWEDGE, under: 'rock', ici: [0.35, 0.9, 0.06] }),
        rock: () => ({ side: MT.rock(), tU: 3, tV: 3, top: MT.rock(), tile: 3, band: 0.35, cIn: WHITE, cEdge: hex('#8a97a6'), under: 'rock', ici: [0.2, 0.5, 0.05] }),
        ice: () => ({ side: MT.iceSide(), tU: 2, tV: 2, top: MT.iceTop(), tile: 3, band: 0.4, cIn: hex('#f2fbff'), cEdge: hex('#7fcfff'), under: 'ice', core: true, ici: [0.9, 1.7, 0.1] }),
        waterfall: () => ({ side: MT.fall(), tU: 3, tV: 3, top: MT.iceTop(), tile: 4, band: 0.4, cIn: hex('#fafdff'), cEdge: hex('#a8dcff'), under: 'column', core: true, ici: [0.8, 1.4, 0.09] }),
        floe: (p) => ({ side: MT.iceSide(), tU: 2, tV: 2, top: MT.floe(), tile: p.shape === 'cyl' ? p.w : 4, band: 0.35, cIn: WHITE, cEdge: hex('#9fd3f2'), under: 'ice', keel: 1, core: false, ici: [0.3, 0.8, 0.08] }),
        igloo: () => ({ side: MT.brick(), tU: 2, tV: 2, top: MT.snow(), tile: 3, band: 0.5, cIn: WHITE, cEdge: SNOWEDGE, under: 'dome' }),
        deck: () => ({ side: MT.deck(), tU: 2, tV: 2, top: MT.deck(), tile: 2, band: 0.4, cIn: WHITE, cEdge: hex('#e9b026'), under: 'stilts', ici: [0.2, 0.5, 0.04] }),
        plank: () => ({ side: MT.wood(), tU: 2, tV: 2, top: MT.wood(), tile: 2, band: 0.3, cIn: WHITE, cEdge: hex('#d8c8b0'), under: 'piles', ici: [0.3, 0.7, 0.05] }),
        overhang: () => ({ side: MT.wall(), tU: 2, tV: 2, top: MT.snow(), tile: 3, band: 0.45, cIn: WHITE, cEdge: SNOWEDGE, under: null, ici: [1.8, 2.2, 0.1] }),
        thin: () => ({ side: MT.iceSide(), tU: 1.6, tV: 2, top: MT.thinTop(), tile: 1.5, band: 0.3, cIn: hex('#f4fbff'), cEdge: hex('#7fb4e0'), under: null, ici: [0.7, 0.6, 0.06] }),
        lift: () => ({ side: MT.lift(), tU: 2, tV: 2, top: MT.lift(), tile: 2, band: 0.4, cIn: WHITE, cEdge: hex('#c9d7e6'), under: 'glow' }),
        cushion: () => ({ side: MT.orange(), tU: 2, tV: 2, top: MT.cushion(), tile: 1, band: 0.2, cIn: WHITE, cEdge: hex('#ffd9a8'), under: null, fit: true }),
        belt: (p) => ({ side: MT.dark(), tU: 2, tV: 2, top: MT.belt(), tile: p.w, tileV: p.w * 2, band: 0.12, cIn: WHITE, cEdge: hex('#9aa8b8'), under: null }),
        vent: () => ({ side: MT.dark(), tU: 2, tV: 2, top: MT.grate(), tile: 1.5, band: 0.2, cIn: WHITE, cEdge: hex('#c9d7e6'), under: null }),
        ramp: () => ({ side: MT.wall(), tU: 2, tV: 2, top: MT.snow(), tile: 3, band: 0.3, cIn: WHITE, cEdge: SNOWEDGE, under: null }),
        boost: () => ({ side: MT.dark(), tU: 2, tV: 2, top: MT.boost(), tile: 2, band: 0.1, cIn: WHITE, cEdge: WHITE, under: null }),
        rail: () => ({ side: MT.steel(), tU: 2, tV: 2, top: MT.steel(), tile: 2, band: 0.02, cIn: WHITE, cEdge: WHITE, under: null }),
      };
      const styleFor = (p) => {
        const v = p.v;
        switch (p.type) {
          case 'ice': return v === 'waterfall' || v === 'floe' ? v : 'ice';
          case 'crumble': return 'thin';
          case 'move': case 'swing': return 'lift';
          case 'bounce': return 'cushion';
          case 'conveyor': return 'belt';
          case 'vent': return 'vent';
          case 'rot': return v && STYLES[v] ? v : 'floe';
          case 'finish': return v && STYLES[v] ? v : 'deck';
          case 'ramp': case 'boost': case 'rail': return p.type;
          default: return v && STYLES[v] ? v : 'snow';
        }
      };
      const beltPlats = [];

      /* ---------- Platform ---------- */
      const platform = (p) => {
        const name = styleFor(p), st = STYLES[name](p), g = new THREE.Group(), rng = ctx.mulberry32(p.seed + 5);
        const cyl = p.shape === 'cyl', d = p.type === 'ramp' ? p.slopeLen : p.d, off = rng(), hy = p.h / 2;
        const fb = Math.max(0, ctx.freeBelow(p) - 0.4), minDim = Math.min(p.w, d);
        g.add(mesh(sidesGeo(p, d, st.tU, st.tV, off), st.side, { solid: true }));
        g.add(mesh(topGeo(p, d, st.tile, st.tileV || st.tile, st.band, st.cIn, st.cEdge, off, st.fit), st.top, { solid: true }));
        if (st.core) { // mørk iskerne giver dybde i den gennemsigtige is
          const cg = cyl ? new THREE.CylinderGeometry(p.w / 2 - 0.1, p.w / 2 - 0.1, p.h - 0.14, 28) : new THREE.BoxGeometry(p.w - 0.2, p.h - 0.14, d - 0.2);
          g.add(mesh(cg.translate(0, -0.07, 0), MT.core(), { ns: true }));
        }
        let depth = 0;
        if (st.under === 'rock' || st.under === 'ice' || st.under === 'dome' || st.under === 'column') {
          depth = Math.min(clamp(minDim * (st.keel ? 0.9 : 1.1), 1.8, 7), fb);
          if (depth > 0.7) {
            if (st.under === 'column') { // frosne vandfaldssøjler
              const list = [], n = 3 + Math.floor(rng() * 3);
              for (let i = 0; i < n; i++) {
                const len = Math.min(depth, 1.5 + rng() * 3.5), r = 0.25 + rng() * 0.3;
                const x = (rng() - 0.5) * (p.w - 1.6), z = (rng() - 0.5) * (d - 1.6);
                list.push(xf(new THREE.ConeGeometry(r, len, 7, 1, true).rotateX(PI).translate(0, -len / 2, 0), x, -hy + 0.03, z));
              }
              g.add(mesh(merge(list), MT.icicle(), { ns: true }));
            } else {
              const ic = st.under === 'ice', c0 = hex(ic ? '#f2fbff' : st.under === 'dome' ? '#f4f8ff' : '#dfe9f4'), c1 = hex(ic ? '#5fb4e8' : st.under === 'dome' ? '#9bb6d4' : '#39424e');
              const b = mesh(bulb(p, d, depth, rng, ic ? 7 : 9, c0, c1, 3), ic ? MT.iceBulb() : st.under === 'dome' ? MT.brick() : MT.rockFlat(), { ns: ic });
              b.position.y = -hy + 0.03;
              g.add(b);
            }
          }
        } else if (st.under === 'stilts' || st.under === 'piles') {
          depth = Math.min(clamp(minDim * 0.9, 1.6, 5.5), fb);
          if (depth > 0.8) g.add(mesh(legs(p, d, depth, st.under === 'stilts' ? 0.11 : 0.15, st.under === 'piles'), st.under === 'stilts' ? MT.steel() : MT.wood()));
        } else if (st.under === 'glow') { // antigrav-glød under stationens løfteplader
          const gl = new THREE.Mesh(glowGeo, tr(new THREE.MeshBasicMaterial({ map: ctx.TEX.glow, color: '#9fe4ff', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
          gl.scale.set(p.w * 1.3, 1, d * 1.3); gl.position.y = -hy - 0.15; gl.userData.noCastShadow = true;
          g.add(gl);
        }
        if (st.ici && fb > 0.5) {
          const ig = icicles(p, d, rng, st.ici[0], Math.min(st.ici[1], fb * 0.8), st.ici[2]);
          if (ig) g.add(mesh(ig, MT.icicle(), { ns: true }));
        }
        if (p.type === 'conveyor') beltPlats.push(p);
        return g;
      };

      /* ---------- Stænger, anker, svævebane, vindmøllearm ---------- */
      const anchors = [];
      const bar = (b) => {
        const v = b.v || 'ice', L = b.len, r = b.r, g = new THREE.Group(), rng = rnd(Math.round(b.x * 31 + b.z * 17 + L * 7) | 0);
        const rod = (rr, m) => g.add(mesh(new THREE.CylinderGeometry(rr, rr, L, 14).rotateZ(PI / 2), m));
        if (v === 'steel') {
          rod(r, MT.steel());
          const list = [];
          for (let x = -L / 2 + 0.3; x < L / 2; x += 0.9) list.push(paint(xf(new THREE.CylinderGeometry(r * 1.25, r * 1.25, 0.12, 12).rotateZ(PI / 2), x), '#ee7b1c'));
          for (const s of [-1, 1]) list.push(paint(xf(new THREE.BoxGeometry(0.08, r * 7, r * 7), (s * L) / 2), '#c43a2a'));
          g.add(mesh(merge(list), MT.vertex()));
        } else if (v === 'pine') {
          rod(r, mat('bark', () => std({ color: '#5a4030', roughness: 0.95 })));
          const list = [];
          for (let x = -L / 2 + 0.4; x < L / 2 - 0.2; x += 0.7 + rng() * 0.5) {
            const s = rng() < 0.5 ? 1 : -1;
            list.push(paint(xf(new THREE.ConeGeometry(r * 0.5, 0.45, 5).rotateZ(-s * 1.2), x, -0.05, s * 0.2), '#3f6a4c'));
            list.push(paint(xf(new THREE.SphereGeometry(r * 1.15, 6, 4).scale(1.8, 0.45, 1), x + 0.2, r * 0.9, 0), '#f4f8ff'));
          }
          g.add(mesh(merge(list), MT.vertex()));
        } else {
          rod(r, ice('barIce', null, { color: '#cfeeff', opacity: 0.88, emissive: '#3b8fd0', emissiveIntensity: 0.45 }));
          const list = [];
          for (let x = -L / 2 + 0.35; x < L / 2; x += 0.8) list.push(paint(xf(new THREE.CylinderGeometry(r * 1.4, r * 1.4, 0.07, 10).rotateZ(PI / 2), x), '#f4faff'));
          for (const s of [-1, 1]) {
            list.push(paint(xf(new THREE.IcosahedronGeometry(r * 3.2, 1), (s * L) / 2, 0, 0, 0, 1, 1.1, 1), '#e6f6ff'));
            for (let i = 0; i < 3; i++) { const len = 0.3 + rng() * 0.6; list.push(paint(xf(new THREE.ConeGeometry(0.05, len, 5).rotateX(PI).translate(0, -len / 2, 0), (s * L) / 2 + (rng() - 0.5) * 0.2, -r * 2.2, (rng() - 0.5) * 0.2), '#d6f0ff')); }
          }
          for (let i = 0; i < 3; i++) { const len = 0.2 + rng() * 0.5; list.push(paint(xf(new THREE.ConeGeometry(0.04, len, 5).rotateX(PI).translate(0, -len / 2, 0), (rng() - 0.5) * L * 0.7, -r, 0), '#d6f0ff')); }
          g.add(mesh(merge(list), mat('frost', () => std({ vertexColors: true, roughness: 0.3, emissive: '#2a6fa8', emissiveIntensity: 0.25 }))));
        }
        return g;
      };
      // Anker: iskrystal med seks spidser (snefnug)
      const anchor = () => {
        const g = new THREE.Group(), list = [paint(xf(new THREE.OctahedronGeometry(0.17, 0), 0, 0, 0, 0, 1, 1.6, 1), '#c8f1ff')];
        for (let i = 0; i < 3; i++) {
          list.push(paint(xf(new THREE.BoxGeometry(0.78, 0.045, 0.06), 0, 0, 0, (i * PI) / 3), '#e8f8ff'));
          for (const s of [-1, 1]) list.push(paint(xf(new THREE.OctahedronGeometry(0.07, 0), Math.cos((i * PI) / 3) * s * 0.39, 0, -Math.sin((i * PI) / 3) * s * 0.39), '#9fdcff'));
        }
        const m = mesh(merge(list), mat('crystal', () => std({ vertexColors: true, roughness: 0.15, emissive: '#68c8ff', emissiveIntensity: 0.9, flatShading: true })), { ns: true });
        g.add(m); anchors.push(g);
        return g;
      };
      const zip = (z) => {
        const g = new THREE.Group(), a = new V3(z.ax, z.ay, z.az), e = new V3(z.bx, z.by, z.bz), dir = new V3().subVectors(e, a);
        const side = new V3(-dir.z, 0, dir.x).normalize().multiplyScalar(0.7), list = [seg(a, e, 0.035, 6)];
        for (const [end, sg] of [[a, 1], [e, 1]]) {
          const top = end.clone().add(side.clone().multiplyScalar(sg)).add(new V3(0, -0.35, 0)), foot = top.clone().add(new V3(0, -3.6, 0));
          list.push(paint(seg(foot, top, 0.11), '#d83a2a'), paint(seg(top, end, 0.06), '#7d8895'));
          for (let k = 0; k < 3; k++) list.push(paint(seg(foot.clone().lerp(top, 0.15 + k * 0.28), foot.clone().lerp(top, 0.25 + k * 0.28), 0.118), '#f4f4f4'));
        }
        g.add(mesh(merge(list.map((q, i) => (i === 0 ? paint(q, '#aab6c4') : q))), MT.vertex()));
        return g;
      };
      const spinArm = (p) => { // isbjælke med røde ender og aksel ned mod soklen
        const L = p.bar, g = new THREE.Group(), list = [];
        list.push(paint(new THREE.BoxGeometry(L - 1.0, 0.36, 0.45), '#bfe6fb'));
        for (const s of [-1, 1]) {
          list.push(paint(xf(new THREE.BoxGeometry(0.52, 0.38, 0.47), (s * (L - 0.52)) / 2), '#d83a2a'));
          list.push(paint(xf(new THREE.BoxGeometry(0.1, 0.39, 0.48), (s * (L - 0.52)) / 2 - s * 0.14), '#f4f4f4'));
          for (let i = 0; i < 4; i++) { const len = 0.25 + ((i * 37) % 5) * 0.08; list.push(paint(xf(new THREE.ConeGeometry(0.05, len, 5).rotateX(PI).translate(0, -len / 2, 0), s * (0.7 + i * 0.9), -0.17, 0.08 * (i % 2 ? 1 : -1)), '#d6f0ff')); }
        }
        list.push(paint(xf(new THREE.CylinderGeometry(0.2, 0.26, 0.55, 14), 0, -0.32, 0), '#4a5460'));
        g.add(mesh(merge(list), MT.vertex()));
        return g;
      };

      /* ---------- Kulisser ---------- */
      const timeU = [];
      // Sne/glimt, der ombrydes rundt om kameraet (hele bevægelsen sker i shaderen)
      const flakes = (n, box, size, color, fall, sparkle) => {
        const rng = rnd(n + 7), pos = new Float32Array(n * 3), seed = new Float32Array(n);
        for (let i = 0; i < n; i++) { pos[i * 3] = rng() * box.x; pos[i * 3 + 1] = rng() * box.y; pos[i * 3 + 2] = rng() * box.z; seed[i] = rng(); }
        const geo = tr(new THREE.BufferGeometry());
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
        const u = { uTime: { value: 0 }, uBox: { value: box }, uSize: { value: size }, uCol: { value: hex(color) }, uFall: { value: fall }, uSpark: { value: sparkle ? 1 : 0 } };
        const m = tr(new THREE.ShaderMaterial({
          uniforms: u, transparent: true, depthWrite: false, fog: false, blending: sparkle ? THREE.AdditiveBlending : THREE.NormalBlending,
          vertexShader: `uniform float uTime; uniform vec3 uBox; uniform float uSize; uniform float uFall; uniform float uSpark; attribute float aSeed; varying float vA;
            void main() {
              vec3 p = position;
              p.y -= uTime * uFall * (0.6 + aSeed);
              p.x += sin(uTime * 0.7 + aSeed * 40.0) * 1.4 + uTime * 0.9;
              p.z += cos(uTime * 0.55 + aSeed * 31.0) * 1.2;
              vec3 rel = mod(p - cameraPosition + uBox * 0.5, uBox) - uBox * 0.5;
              vec4 mv = viewMatrix * vec4(cameraPosition + rel, 1.0);
              gl_Position = projectionMatrix * mv;
              float dist = -mv.z;
              gl_PointSize = clamp(uSize * (0.6 + aSeed) * 620.0 / max(dist, 1.0), 1.5, 10.0);
              vA = (1.0 - smoothstep(0.35, 0.5, length(rel / uBox))) * smoothstep(0.5, 3.0, dist);
              if (uSpark > 0.5) vA *= pow(0.5 + 0.5 * sin(uTime * (2.0 + aSeed * 5.0) + aSeed * 60.0), 3.0);
            }`,
          fragmentShader: `uniform vec3 uCol; varying float vA;
            void main() { float a = smoothstep(0.5, 0.1, length(gl_PointCoord - 0.5)) * vA; if (a < 0.01) discard; gl_FragColor = vec4(uCol, a * 0.9); }`,
        }));
        const pts = new THREE.Points(geo, m);
        pts.frustumCulled = false; pts.userData.noCastShadow = true; timeU.push(u.uTime);
        return pts;
      };
      // Skybokse (instanserede, skærmvendte tåge-/skyklatter, ét kald)
      const puffs = (items, texture, fade) => {
        const n = items.length, A = new Float32Array(n * 4), B = new Float32Array(n * 4), base = new THREE.PlaneGeometry(1, 1);
        items.forEach((it, i) => { A.set([it[0], it[1], it[2], it[3]], i * 4); B.set([it[4], it[5], it[6], it[7]], i * 4); });
        const geo = tr(new THREE.InstancedBufferGeometry());
        geo.index = base.index; geo.setAttribute('position', base.attributes.position); geo.setAttribute('uv', base.attributes.uv);
        geo.setAttribute('aPos', new THREE.InstancedBufferAttribute(A, 4)); geo.setAttribute('aTint', new THREE.InstancedBufferAttribute(B, 4));
        geo.instanceCount = n;
        const m = tr(new THREE.ShaderMaterial({
          uniforms: { uMap: { value: texture }, uFade: { value: new THREE.Vector2(fade[0], fade[1]) } }, transparent: true, depthWrite: false, fog: false,
          vertexShader: `attribute vec4 aPos; attribute vec4 aTint; varying vec2 vUv; varying vec4 vT; varying float vD;
            void main() { vec4 mv = viewMatrix * vec4(aPos.xyz, 1.0); vD = -mv.z; mv.xy += position.xy * aPos.w; vUv = uv; vT = aTint; gl_Position = projectionMatrix * mv; }`,
          fragmentShader: `uniform sampler2D uMap; uniform vec2 uFade; varying vec2 vUv; varying vec4 vT; varying float vD;
            void main() { float a = texture2D(uMap, vUv).a * vT.a * smoothstep(uFade.x, uFade.y, vD); gl_FragColor = vec4(vT.rgb, a);
              #include <tonemapping_fragment>
              #include <colorspace_fragment>
            }`,
        }));
        const o = new THREE.Mesh(geo, m);
        o.frustumCulled = false; o.userData.noCastShadow = true;
        return o;
      };
      // Takket ismassiv: flere kegler med terrasser, farver fra mørk klippe til sne
      const massif = (seed, R, H) => {
        const rng = rnd(seed), list = [];
        for (let pk = 0; pk < 3; pk++) {
          const r = R * (pk ? 0.45 + rng() * 0.3 : 1), h = H * (pk ? 0.5 + rng() * 0.35 : 1), S = 11, L = 9;
          const g = new THREE.ConeGeometry(1, 1, S, L, true), P = g.attributes.position, col = new Float32Array(P.count * 3), jit = [];
          for (let i = 0; i < P.count; i++) {
            const ring = Math.floor(i / (S + 1)), k = (i % (S + 1)) % S, key = ring * S + k;
            if (jit[key] === undefined) jit[key] = 0.78 + rng() * 0.44;
            const t = 1 - ring / L, a = Math.atan2(P.getZ(i), P.getX(i)), terr = 1 + 0.16 * Math.sin(t * TAU * 3.2 + pk);
            const rr = Math.pow(1 - t, 0.85) * jit[key] * terr * r, jy = (jit[key] - 1) * 0.1 * h * (ring > 0 ? 1 : 0);
            P.setXYZ(i, Math.cos(a) * rr, t * h + jy, Math.sin(a) * rr);
            const c = hex(t < 0.2 ? '#46566a' : t < 0.55 ? '#8fc4ea' : '#f4f9ff').lerp(WHITE, (jit[key] - 0.78) * 0.5);
            col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
          }
          g.setAttribute('color', new THREE.BufferAttribute(col, 3));
          list.push(xf(g, pk ? (rng() - 0.5) * R * 1.3 : 0, 0, pk ? (rng() - 0.5) * R * 1.3 : 0));
        }
        return merge(list);
      };
      const pineGeo = () => merge([ // lav-poly gran med snetunge grene
        paint(xf(new THREE.CylinderGeometry(0.18, 0.26, 1.4, 6), 0, 0.7, 0), '#4a3626'),
        ...[[2.1, 1.7, 0.9], [1.7, 1.5, 2.1], [1.25, 1.3, 3.2]].map(([r, h, y], i) => {
          const g = new THREE.ConeGeometry(r, h, 7, 1, true).translate(0, y, 0).toNonIndexed(), P = g.attributes.position, a = new Float32Array(P.count * 3);
          for (let k = 0; k < P.count; k++) { const t = (P.getY(k) - (y - h / 2)) / h, c = hex('#2d5a42').lerp(hex('#eef5ff'), clamp(t * 1.5 - 0.1 + i * 0.1, 0, 1)); a[k * 3] = c.r; a[k * 3 + 1] = c.g; a[k * 3 + 2] = c.b; }
          g.setAttribute('color', new THREE.BufferAttribute(a, 3));
          return g;
        }),
      ]);
      const pieceList = (list, g, c, x, y, z, ry = 0, sx = 1, sy = sx, sz = sx) => list.push(paint(xf(g, x, y, z, ry, sx, sy, sz), c));

      const decor = (data) => {
        const root = new THREE.Group(), b = data.bounds, plats = data.plats, rng = rnd(ctx.levelIndex * 977 + 13), th = ctx.theme;
        const last = plats[plats.length - 1], first = plats[0], lavaY = ctx.lavaY, snowY = [];
        for (let y = b.minY - 12; y <= b.maxY + 12; y += 8) snowY.push(y);
        const clearAt = (x, z, m) => snowY.every((y) => ctx.clearOfCourse(x, y, z, m));
        const add = (o) => { root.add(o); return o; };

        // Sne og glimt
        add(flakes(4500, new V3(70, 40, 70), 0.055, '#ffffff', 1.5, false));
        add(flakes(1400, new V3(110, 50, 110), 0.05, '#cfeaff', 0.25, true));

        // Gletsjermassiver rundt om, med fod i lavaen
        const gm = mesh(merge(Array.from({ length: 14 }, (_, i) => {
          for (let tries = 0, D = b.radius + 90 + rng() * 150; ; tries++, D += 40) {
            const ang = (i / 14) * TAU + rng() * 0.35, R = 40 + rng() * 55, H = 75 + rng() * 105, x = b.cx + Math.cos(ang) * D, z = b.cz + Math.sin(ang) * D;
            if (clearAt(x, z, R * 0.8 + 10) || tries > 6) return xf(massif(31 + i * 17, R, H), x, lavaY - 8, z, rng() * TAU);
          }
        })), mat('massif', () => std({ vertexColors: true, flatShading: true, roughness: 0.55, emissive: '#1a3a5a', emissiveIntensity: 0.14 })));
        add(gm);

        // Kæmpe isbjergs-bue bagved (i forlængelse af startretningen)
        {
          const ang = first.heading + 0.5, D = b.radius + 270, g = new THREE.TorusGeometry(1, 0.34, 10, 28, PI);
          const P = g.attributes.position, col = new Float32Array(P.count * 3), j = [];
          for (let i = 0; i < P.count; i++) {
            const key = Math.round(P.getX(i) * 40) + ',' + Math.round(P.getY(i) * 40) + ',' + Math.round(P.getZ(i) * 40);
            if (j[key] === undefined) j[key] = 0.9 + rng() * 0.22;
            const k = j[key], c = hex('#5a8fc4').lerp(hex('#f2f8ff'), clamp(P.getY(i) * 0.9 + (k - 1), 0, 1));
            P.setXYZ(i, P.getX(i) * 125 + (k - 1) * 12, P.getY(i) * 135 + (k - 1) * 10, P.getZ(i) * 62 * k);
            col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
          }
          g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.computeVertexNormals();
          const arch = mesh(g, mat('arch', () => std({ vertexColors: true, flatShading: true, roughness: 0.3, emissive: '#2a6fa8', emissiveIntensity: 0.22 })), { ns: true });
          const fw = new V3(Math.sin(ang), 0, -Math.cos(ang));
          arch.position.set(b.cx + fw.x * D, lavaY - 6, b.cz + fw.z * D); arch.rotation.y = -ang + PI / 2 + 0.4;
          add(arch);
        }

        // Klippe med frossent vandfald og forskningsstation bag målet
        const pines = [];
        let station = null;
        for (const da of [0, 0.5, -0.5, 1, -1, 1.6, -1.6, PI]) {
          const hd = last.heading + da, f = ctx.fwdVec(hd), dist = Math.max(last.w, last.d) / 2 + 32;
          const cx = last.x + f.x * dist, cz = last.z + f.z * dist;
          if (!clearAt(cx, cz, 24) && da !== PI) continue;
          const W = 46, Dp = 34, top = last.top - 1.4, Hc = top - lavaY + 6, yaw = -hd, root2 = new THREE.Group();
          root2.position.set(cx, 0, cz); root2.rotation.y = yaw; // lokal -Z = væk fra banen
          const bg = new THREE.BoxGeometry(W, Hc, Dp, 9, 8, 5), P = bg.attributes.position, col = new Float32Array(P.count * 3);
          for (let i = 0; i < P.count; i++) {
            const x = P.getX(i), y = P.getY(i), z = P.getZ(i), edge = Math.abs(y) > Hc / 2 - 0.1 ? 0 : 1, n = Math.sin(x * 0.7 + z * 0.4) * Math.cos(y * 0.35 + x * 0.2);
            P.setXYZ(i, x + n * 2.2 * edge * (Math.abs(x) < W / 2 - 0.1 ? 1 : 0.3), y, z + n * 1.8 * (z > 0 ? edge : 0.2));
            const c = hex(y > Hc / 2 - 0.3 ? '#f4f9ff' : '#3f4b5a').lerp(hex('#aebfd0'), clamp(n * 0.4 + 0.2, 0, 0.5) * (y > Hc / 2 - 0.3 ? 0 : 1));
            col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
          }
          bg.setAttribute('color', new THREE.BufferAttribute(col, 3)); bg.computeVertexNormals();
          const cliff = mesh(bg, MT.vertex(), {}); cliff.position.y = lavaY - 6 + Hc / 2; root2.add(cliff);
          // frosset vandfald på forsiden: ribber af isrør, tapet af en flade og et forhæng af istapper foroven
          const wl = [], zf = Dp / 2 + 1.2;
          for (let i = 0; i < 22; i++) {
            const x = -W * 0.3 + (i / 21) * W * 0.6 + (rng() - 0.5) * 1.2, len = Hc * (0.55 + rng() * 0.4), r = 1.2 + rng() * 1.1;
            wl.push(xf(new THREE.ConeGeometry(r, len, 7, 1, true).rotateX(PI).translate(0, -len / 2, 0), x, top, zf + rng() * 1.2, rng() * TAU));
          }
          for (let i = 0; i < 40; i++) { const len = 1.5 + rng() * 4, x = -W / 2 + rng() * W; wl.push(xf(new THREE.ConeGeometry(0.3 + rng() * 0.3, len, 5, 1, true).rotateX(PI).translate(0, -len / 2, 0), x, top - 0.4, zf - 0.5 + rng())); }
          const fall = mesh(merge(wl), MT.fall(), { ns: true }); fall.position.y = 0; root2.add(fall);
          const sheet = new THREE.Mesh(tr(new THREE.PlaneGeometry(W * 0.62, Hc * 0.9, 1, 1)), tr(new THREE.MeshStandardMaterial({ map: iceSideTex(), color: '#eaf7ff', emissive: '#4a95d0', emissiveIntensity: 0.3, roughness: 0.2 })));
          sheet.position.set(0, top - Hc * 0.45, zf - 0.4); root2.add(sheet);
          root.add(root2);
          // stationen oven på klippen
          const sl = [], wl2 = [], t0 = top, s0 = -4;
          const cabin = (x, z, w, h, d, cw, cr) => {
            pieceList(sl, new THREE.BoxGeometry(w, h, d), cw, x, t0 + h / 2, z);
            pieceList(sl, new THREE.BoxGeometry(w + 0.7, 0.3, d + 0.7), cr, x, t0 + h + 0.15, z);
            pieceList(sl, new THREE.BoxGeometry(w + 0.5, 0.25, d + 0.5), '#f4f9ff', x, t0 + h + 0.4, z);
            for (let k = 0; k < Math.floor(w / 2.6); k++) wl2.push(xf(new THREE.PlaneGeometry(1.1, 0.9), x - w / 2 + 1.5 + k * 2.6, t0 + h * 0.58, z + d / 2 + 0.02));
          };
          cabin(-8, s0, 11, 4.2, 6.5, '#c4281e', '#f2f4f6'); cabin(6, s0 + 2, 8, 3.2, 4.5, '#eef2f6', '#c4281e'); cabin(-1, s0 - 8, 6, 3, 4, '#c4281e', '#2f3640');
          for (let i = 0; i < 5; i++) pieceList(sl, new THREE.CylinderGeometry(0.55, 0.55, 1.2, 10), i % 2 ? '#c4281e' : '#2d5aa0', -14 + (i % 3) * 1.2, t0 + 0.6, -9 + Math.floor(i / 3) * 1.3);
          for (let i = 0; i < 3; i++) pieceList(sl, new THREE.BoxGeometry(1.5, 1.2, 1.5), '#8a6a44', 12 + i * 1.7, t0 + 0.6 + (i === 2 ? 1.2 : 0), -4.5);
          for (let k = 0; k < 8; k++) pieceList(sl, new THREE.CylinderGeometry(1.0 - k * 0.07, 1.06 - k * 0.07, 3.4, 8), k % 2 ? '#f4f4f4' : '#d83a2a', 16, t0 + 1.7 + k * 3.4, -12 + 0); // antennemast
          pieceList(sl, new THREE.SphereGeometry(2.2, 14, 6, 0, TAU, 0, 1.0), '#f2f4f6', 16, t0 + 29, -12, 0.6, 1, 1, 1); // parabol
          const stationMesh = mesh(merge(sl), MT.vertex(), {}); stationMesh.position.set(0, 0, 0); root2.add(stationMesh);
          const win = mesh(merge(wl2), mat('win', () => std({ color: '#ffe2a0', emissive: '#ffcf70', emissiveIntensity: 1.2, side: THREE.DoubleSide })), { ns: true });
          win.rotation.y = 0; root2.add(win);
          for (const s of [-1, 1]) { // rødt blinklys og lysende kugle på mastetoppen
            const ball = new THREE.Mesh(tr(new THREE.SphereGeometry(0.45, 10, 8)), tr(std({ color: '#ff3a2a', emissive: '#ff2010', emissiveIntensity: 1.5 })));
            ball.position.set(16, t0 + 30.2 + (s > 0 ? 0 : -0.01), -12); ball.userData.noCastShadow = true;
            if (s > 0) { root2.add(ball); station = ball; }
          }
          // sne omkring ved stationen
          for (let i = 0; i < 9; i++) pines.push([cx + Math.cos(yaw) * (-18 + i * 4.4) - Math.sin(yaw) * (-8 + rng() * 14), top, cz + Math.sin(yaw) * (-18 + i * 4.4) * -1 + Math.cos(yaw) * (-8 + rng() * 14), 0.9 + rng() * 0.5]);
          break;
        }
        add(new THREE.Group());

        const dec = { station, rotors: [] };
        decorState.station = station;
        return root;
      };
      const decorState = {};
      return {
        ventColor: '#eaf6ff',
        platform, bar, anchor, zip, spinArm, decor,
        update(dt, t) {
          for (const u of timeU) u.value = t;
          for (const p of beltPlats) { const tx = M.belt && M.belt.map; if (tx) tx.offset.y -= (dt * p.belt) / (p.w * 2) / beltPlats.length; }
          for (const a of anchors) a.rotation.y = t * 0.6;
          if (decorState.station) decorState.station.material.emissiveIntensity = Math.sin(t * 3) > 0.4 ? 2 : 0.15;
        },
      };
    },
  };
})();
