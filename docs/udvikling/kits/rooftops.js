/* =====================================================================
   VERDENSSÆT 'rooftops' – Højhustagene (bane 2)
   Solrig dag over byen: tagpap og grus med betonkant, glasfacader der
   fortsætter ned i dis og lava, vandtårne på ben, aircondition-kasser,
   et vinduespudser-lift på master, gule stilladsrør, en byggeplads med
   tårnkran, helipad, tagterrasser, vasketøjssnore og en flyvemaskine-stribe.
   ===================================================================== */
(function () {
  'use strict';

  // Skarp middag: dybblå zenit, bleg horisont, høj sol
  window.SKYHOJ_THEMES.rooftops = {
    top: '#2f7fe0', horizon: '#bfe3ff', bottom: '#d3e3ef', sunElev: 65, sunAz: 28, sunColor: '#fff7ea', sunInt: 3.3,
    hemiSky: '#cfe4ff', hemiInt: 0.95, fog: '#c4dcf0', fogNear: 130, fogFar: 780, cloud: '#ffffff', clouds: 1, stars: 0,
    stone: '#cfcac2', exposure: 1.0, lavaGlow: 0.85,
  };

  window.SKYHOJ_KITS.rooftops = {
    id: 'rooftops',
    name: 'Højhustagene',
    variants: {
      tar: 'Tagpap og grus med betonkant og facade ned i dybet (standard for p/start). Kasse 5-10 x 5-10, cyl w 5-9',
      terrace: 'Træterrasse med lyse planker og sort kant. Kasse 5-9 x 4-8 (cyl w 5-8)',
      garden: 'Taghave: græs med blomsterbede og fliser, plantekasse-sider. Kasse 5-9 x 5-9 (cyl w 5-8)',
      helipad: 'Helipad: mørkt asfaltdæk, gul kant og gult H (standard for finish). Cyl w 8-13 eller kasse 8-12 x 8-12',
      tank: 'Vandtårn på stålben: planketønde med jernbånd og stållåg. shape:"cyl" w 3-6 (kasse = stålcistern)',
      ac: 'Aircondition-kasse med riste og blæsere (trin op, ingen bygning under). Kasse 2-4 x 2-4, h 1-2.2',
      hut: 'Trappehus med hvidt tag og dør. Kasse 3-6 x 3-6, h 1.5-3',
      site: 'Byggeplads: rå betonplade med armeringsnet, gul kant og skelet med stillads nedenunder. Kasse 4-8 x 4-8',
    },
    barVariants: {
      pipe: 'Gult stilladsrør med sorte koblinger (standard) – bære-master går ned i dybet',
      galv: 'Galvaniseret stålrør (koldt grå)',
    },
    create(ctx) {
      const { THREE } = ctx;
      const PI = Math.PI, TAU = PI * 2;
      const tr = (o) => ctx.track(o);
      const V3 = THREE.Vector3;
      const Z = new V3(0, 1, 0);

      /* ---------- Teksturer (max 12, tegnes først, når de bruges) ---------- */
      const tex = {};
      const canvasTex = (key, w, h, paint) => {
        if (tex[key]) return tex[key];
        const c = ctx.makeCanvas(w, h), g = c.getContext('2d');
        paint(g, w, h, ctx.mulberry32(key.length * 7919 + w));
        return (tex[key] = tr(ctx.toTexture(c)));
      };
      const px = (g, w, h, fn) => { // pixel for pixel: fn(x, y, c) skriver [r,g,b] 0..255
        const img = g.createImageData(w, h), d = img.data, c = [0, 0, 0];
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          fn(x, y, c);
          const i = (y * w + x) * 4;
          d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
        }
        g.putImageData(img, 0, 0);
      };
      const T = {
        // Tagpap med grus og sømme (flise 3 m)
        tar: () => canvasTex('tar', 512, 512, (g, S, _, r) => {
          const n1 = ctx.tileNoise(S, 5, 4, r), n2 = ctx.tileNoise(S, 32, 2, r);
          px(g, S, S, (x, y, c) => {
            const v = 0.2 + n1[y * S + x] * 0.16 + n2[y * S + x] * 0.1;
            c[0] = v * 250; c[1] = v * 255; c[2] = v * 266;
          });
          for (let i = 0; i < 900; i++) { // grus
            const lt = r() < 0.7, k = 150 + r() * 80;
            g.fillStyle = lt ? `rgba(${k},${k},${k + 6},0.7)` : 'rgba(10,10,14,0.5)';
            g.beginPath(); g.arc(r() * S, r() * S, 1 + r() * 1.8, 0, TAU); g.fill();
          }
          for (let k = 0; k < 3; k++) { // tagpapsømme hver meter
            const y = Math.round((k * S) / 3);
            g.fillStyle = 'rgba(12,13,16,0.6)'; g.fillRect(0, y, S, 5);
            g.fillStyle = 'rgba(255,255,255,0.13)'; g.fillRect(0, y + 5, S, 2);
          }
          g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(40, 60, 180, 90); // lappede reparationer
          g.fillStyle = 'rgba(0,0,0,0.07)'; g.fillRect(300, 250, 140, 120);
          for (let i = 0; i < 4; i++) { // vandpletter
            const x = r() * S, y = r() * S, rad = 25 + r() * 40;
            const gr = g.createRadialGradient(x, y, 0, x, y, rad);
            gr.addColorStop(0, 'rgba(150,175,200,0.28)'); gr.addColorStop(1, 'rgba(150,175,200,0)');
            g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
          }
        }),
        // Beton (kanter, trappehus, byggeplads) – flise 2 m
        concrete: () => canvasTex('concrete', 256, 256, (g, S, _, r) => {
          const n = ctx.tileNoise(S, 6, 4, r);
          px(g, S, S, (x, y, c) => {
            const v = 0.74 + n[y * S + x] * 0.26 + (r() - 0.5) * 0.05;
            c[0] = v * 232; c[1] = v * 230; c[2] = v * 224;
          });
          for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(60,58,54,0.25)'; g.fillRect(r() * S, r() * S, 1 + r() * 2, 1 + r() * 2); }
          g.fillStyle = 'rgba(70,68,64,0.35)'; g.fillRect(0, 0, S, 2); g.fillRect(0, 0, 2, S);
        }),
        // Blå reflekterende glasfacade (flise 8 x 8 m = 4 ruder x 2 etager)
        glass: () => canvasTex('glass', 512, 512, (g, S, _, r) => {
          g.fillStyle = '#c4d2de'; g.fillRect(0, 0, S, S);
          for (let cx = 0; cx < 4; cx++) for (let fl = 0; fl < 2; fl++) {
            const x0 = cx * 128 + 4, y0 = fl * 256 + 4, w = 120, hg = 184, k = r();
            const gr = g.createLinearGradient(0, y0, 0, y0 + hg);
            if (k < 0.2) { gr.addColorStop(0, '#f0f9ff'); gr.addColorStop(1, '#8ec6f2'); } // sky-sky
            else if (k < 0.34) { gr.addColorStop(0, '#5d7a96'); gr.addColorStop(1, '#2b445e'); } // mørkt kontor
            else { gr.addColorStop(0, '#7cbcf4'); gr.addColorStop(1, '#2c74c4'); }
            g.fillStyle = gr; g.fillRect(x0, y0, w, hg);
            if (k > 0.34 && k < 0.44) { // oplyst kontor
              g.fillStyle = 'rgba(255,226,150,0.5)'; g.fillRect(x0, y0, w, hg);
              g.fillStyle = 'rgba(120,80,30,0.25)'; for (let y = y0 + 6; y < y0 + hg; y += 9) g.fillRect(x0, y, w, 3);
            }
            g.fillStyle = 'rgba(255,255,255,0.22)'; // solglimt
            g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0 + 70, y0); g.lineTo(x0, y0 + 110); g.fill();
            g.fillStyle = '#2a5a82'; g.fillRect(x0, y0 + hg, w, 64); // brystning
            g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(x0, y0 + hg, w, 3);
          }
        }),
        // Kontorfacade med bånd-vinduer (flise 8 x 8 m, 2 etager)
        office: () => canvasTex('office', 512, 512, (g, S, _, r) => {
          const n = ctx.tileNoise(S, 8, 3, r);
          px(g, S, S, (x, y, c) => { const v = 0.82 + n[y * S + x] * 0.16; c[0] = v * 226; c[1] = v * 218; c[2] = v * 200; });
          for (let fl = 0; fl < 2; fl++) {
            const y0 = fl * 256 + 66, hw = 150;
            for (let cx = 0; cx < 4; cx++) {
              const k = r(), gr = g.createLinearGradient(0, y0, 0, y0 + hw);
              gr.addColorStop(0, k < 0.3 ? '#ffe9b0' : '#5b8aa2'); gr.addColorStop(1, k < 0.3 ? '#e8b868' : '#1f3a4c');
              g.fillStyle = gr; g.fillRect(cx * 128 + 5, y0, 118, hw);
              g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(cx * 128 + 5, y0, 118, 18);
              if (k > 0.55) { g.fillStyle = 'rgba(255,255,255,0.35)'; for (let y = y0 + 20; y < y0 + 90; y += 7) g.fillRect(cx * 128 + 8, y, 112, 2); }
            }
            g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(0, y0 + hw, S, 5);
          }
        }),
        // Murstensfacade med vinduer (flise 4 x 4 m)
        brick: () => canvasTex('brick', 512, 512, (g, S, _, r) => {
          g.fillStyle = '#cdbfa8'; g.fillRect(0, 0, S, S);
          for (let row = 0; row < 48; row++) {
            const y = row * (S / 48), off = row % 2 ? 16 : 0;
            for (let x = -32; x < S; x += 32) {
              const k = 0.8 + r() * 0.35;
              g.fillStyle = `rgb(${168 * k | 0},${82 * k | 0},${58 * k | 0})`;
              g.fillRect(x + off + 1, y + 1, 30, S / 48 - 2);
            }
          }
          for (let cx = 0; cx < 2; cx++) for (let cy = 0; cy < 2; cy++) {
            const x = cx * 256 + 58, y = cy * 256 + 36;
            g.fillStyle = '#e9e4d8'; g.fillRect(x - 8, y - 12, 156, 14); g.fillRect(x - 6, y + 188, 152, 12);
            g.fillStyle = '#f4f1e8'; g.fillRect(x, y, 140, 190);
            const k = r(), gr = g.createLinearGradient(0, y, 0, y + 190);
            gr.addColorStop(0, k < 0.3 ? '#eac47c' : '#7fb0d6'); gr.addColorStop(1, k < 0.3 ? '#b8854a' : '#2f5d86');
            g.fillStyle = gr; g.fillRect(x + 8, y + 8, 124, 174);
            g.fillStyle = 'rgba(255,255,255,0.25)'; g.beginPath(); g.moveTo(x + 8, y + 8); g.lineTo(x + 70, y + 8); g.lineTo(x + 8, y + 90); g.fill();
            g.fillStyle = '#f4f1e8'; g.fillRect(x + 66, y + 8, 8, 174); g.fillRect(x + 8, y + 84, 124, 8);
          }
        }),
        // Terrassebrædder (flise 2 m)
        deck: () => canvasTex('deck', 256, 256, (g, S, _, r) => {
          for (let i = 0; i < 14; i++) {
            const x = (i * S) / 14, w = S / 14, k = 0.62 + r() * 0.32;
            g.fillStyle = `rgb(${176 * k | 0},${124 * k | 0},${80 * k | 0})`; g.fillRect(x, 0, w, S);
            for (let j = 0; j < 7; j++) { g.fillStyle = `rgba(60,36,18,${0.1 + r() * 0.18})`; g.fillRect(x + r() * w, 0, 1, S); }
            g.fillStyle = 'rgba(30,18,10,0.65)'; g.fillRect(x, 0, 2, S);
            const y = r() * S; g.fillStyle = 'rgba(30,18,10,0.6)'; g.fillRect(x, y, w, 2);
            g.fillStyle = 'rgba(40,40,40,0.7)'; g.fillRect(x + w / 2 - 1, 20, 2, 2); g.fillRect(x + w / 2 - 1, S - 20, 2, 2);
          }
        }),
        // Græsplæne med blomster og fliser (flise 4 m)
        lawn: () => canvasTex('lawn', 512, 512, (g, S, _, r) => {
          const n = ctx.tileNoise(S, 7, 4, r);
          px(g, S, S, (x, y, c) => {
            const v = n[y * S + x], st = Math.floor(x / 64) % 2 ? 0.06 : -0.02;
            c[0] = 70 + v * 50 + st * 120 + (r() - 0.5) * 12; c[1] = 128 + v * 70 + st * 160 + (r() - 0.5) * 14; c[2] = 52 + v * 30;
          });
          g.fillStyle = '#b9b4a8'; // fliser i midten
          for (let y = 0; y < S; y += 64) { g.fillStyle = '#aaa59a'; g.fillRect(224, y + 2, 64, 60); g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(226, y + 3, 60, 4); }
          const cols = ['#ffffff', '#ffe14d', '#ff6aa8', '#ff5a3c', '#c58cff'];
          for (let k = 0; k < 9; k++) {
            const cx = r() * S, cy = r() * S, col = cols[k % 5];
            for (let i = 0; i < 26; i++) {
              const a = r() * TAU, d = r() * 26; g.fillStyle = col;
              g.beginPath(); g.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 2 + r() * 1.5, 0, TAU); g.fill();
            }
          }
        }),
        // Helipad-dekal (gennemsigtig): gul ring, hjørner og H
        helipad: () => canvasTex('helipad', 512, 512, (g) => {
          g.strokeStyle = '#f7c600'; g.lineWidth = 22; g.beginPath(); g.arc(256, 256, 214, 0, TAU); g.stroke();
          g.lineWidth = 6; g.beginPath(); g.arc(256, 256, 238, 0, TAU); g.stroke();
          g.fillStyle = '#f7c600';
          g.fillRect(150, 140, 44, 232); g.fillRect(318, 140, 44, 232); g.fillRect(150, 232, 212, 48);
        }),
        // Rådnet tag med brædder, huller og revner (flise 2,4 m)
        crumble: () => canvasTex('crumble', 512, 512, (g, S, _, r) => {
          const n = ctx.tileNoise(S, 10, 3, r);
          px(g, S, S, (x, y, c) => {
            const row = Math.floor(y / 56), k = 0.5 + ((row * 37) % 5) * 0.08 + n[y * S + x] * 0.35;
            c[0] = 128 * k; c[1] = 104 * k; c[2] = 82 * k;
          });
          for (let row = 0; row < 10; row++) {
            const y = row * 56; g.fillStyle = 'rgba(14,10,6,0.85)'; g.fillRect(0, y, S, 4);
            const x = r() * S; g.fillRect(x, y, 3, 56);
            if (r() < 0.3) { g.fillStyle = '#0c0a08'; g.fillRect(r() * 380, y + 4, 60 + r() * 70, 40); } // manglende stykke
          }
          g.strokeStyle = '#0a0806'; g.lineCap = 'round';
          for (let k = 0; k < 4; k++) { // revner
            let x = r() * S, y = r() * S; g.lineWidth = 4 + r() * 3; g.beginPath(); g.moveTo(x, y);
            for (let i = 0; i < 9; i++) { x += (r() - 0.5) * 70; y += 28 + r() * 30; g.lineTo(x, y); }
            g.stroke();
          }
        }),
        // Tern-stålplade (flise 1,2 m)
        steel: () => canvasTex('steel', 256, 256, (g, S) => {
          g.fillStyle = '#8c959e'; g.fillRect(0, 0, S, S);
          for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
            for (const [dx, dy, a] of [[4, 4, 0.8], [12, 12, -0.8]]) {
              g.save(); g.translate(x * 16 + dx, y * 16 + dy); g.rotate(((x + y) % 2 ? a : -a));
              g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(-4, -1, 8, 3);
              g.fillStyle = 'rgba(255,255,255,0.55)'; g.fillRect(-4, -2, 8, 2); g.restore();
            }
          }
        }),
        // Ventilationsrist (flise 1 m)
        louvre: () => canvasTex('louvre', 128, 128, (g, S) => {
          g.fillStyle = '#23282e'; g.fillRect(0, 0, S, S);
          for (let y = 0; y < S; y += 10) {
            g.fillStyle = '#b9c1c8'; g.fillRect(0, y, S, 6);
            g.fillStyle = '#e6ebef'; g.fillRect(0, y, S, 2);
          }
        }),
        // Gummibånd med gule pile (flise 2 m)
        belt: () => canvasTex('belt', 128, 256, (g, S, H) => {
          g.fillStyle = '#25282c'; g.fillRect(0, 0, S, H);
          g.fillStyle = '#3a3f46'; for (let y = 0; y < H; y += 8) g.fillRect(0, y, S, 2);
          g.fillStyle = '#f2b705';
          for (const y0 of [30, 158]) {
            g.beginPath(); g.moveTo(64, y0); g.lineTo(108, y0 + 46); g.lineTo(86, y0 + 46); g.lineTo(64, y0 + 22);
            g.lineTo(42, y0 + 46); g.lineTo(20, y0 + 46); g.closePath(); g.fill();
          }
        }),
      };

      /* ---------- Materialer ---------- */
      const mats = {};
      const std = (key, o) => mats[key] || (mats[key] = tr(new THREE.MeshStandardMaterial(o)));
      const M = {
        tar: () => std('tar', { map: T.tar(), roughness: 0.95 }),
        concrete: (c = '#ffffff') => std('conc' + c, { map: T.concrete(), color: c, roughness: 0.9 }),
        coping: () => std('coping', { map: T.concrete(), color: '#a7a39a', roughness: 0.9, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
        copingCol: (c) => std('cop' + c, { color: c, roughness: 0.7, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
        deck: (c = '#ffffff') => std('deck' + c, { map: T.deck(), color: c, roughness: 0.85 }),
        steel: (c = '#ffffff') => std('steel' + c, { map: T.steel(), color: c, roughness: 0.42, metalness: 0.6 }),
        dark: () => std('dark', { color: '#2a2f36', roughness: 0.55, metalness: 0.6 }),
        yellow: () => std('yellow', { color: '#f2bf14', roughness: 0.42, metalness: 0.25 }),
        paint: (c) => std('p' + c, { color: c, roughness: 0.6, metalness: 0.15 }),
        vcol: () => std('vcol', { vertexColors: true, roughness: 0.7, metalness: 0.15 }),
        decal: () => std('decal', { vertexColors: true, roughness: 0.6, metalness: 0.1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
      };
      const FAC = { // facade-typer: [materiale, flisestørrelse, brystningsfarve]
        glass: () => [std('glass', { map: T.glass(), roughness: 0.14, metalness: 0.6 }), 8, M.concrete('#9fb7cc')],
        office: () => [std('office', { map: T.office(), roughness: 0.55, metalness: 0.1 }), 8, M.concrete('#e4dcc8')],
        brick: () => [std('brick', { map: T.brick(), roughness: 0.85 }), 4, M.concrete('#c8745a')],
      };
      const FKINDS = ['glass', 'office', 'glass', 'brick', 'glass'];

      /* ---------- Geometri-hjælpere ---------- */
      // Slå mange små dele (med farve pr. del) sammen til ét mesh
      const merge = (parts) => {
        let n = 0;
        const gs = parts.map((p) => { const g = p.g.index ? p.g.toNonIndexed() : p.g; n += g.attributes.position.count; return g; });
        const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2), cl = new Float32Array(n * 3);
        let o = 0;
        gs.forEach((g, i) => {
          const cnt = g.attributes.position.count, c = parts[i].c;
          pos.set(g.attributes.position.array, o * 3);
          if (g.attributes.normal) nor.set(g.attributes.normal.array, o * 3);
          if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
          for (let k = 0; k < cnt; k++) { cl[(o + k) * 3] = c ? c.r : 1; cl[(o + k) * 3 + 1] = c ? c.g : 1; cl[(o + k) * 3 + 2] = c ? c.b : 1; }
          o += cnt;
          if (g !== parts[i].g) g.dispose();
          parts[i].g.dispose();
        });
        const out = new THREE.BufferGeometry();
        out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
        out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
        out.setAttribute('color', new THREE.BufferAttribute(cl, 3));
        return tr(out);
      };
      const C = {}; const cc = (h) => C[h] || (C[h] = new THREE.Color(h));
      const B = (w, h, d, x, y, z, c, ry = 0) => ({ g: new THREE.BoxGeometry(w, h, d).rotateY(ry).translate(x, y, z), c: cc(c) });
      const Cy = (rt, rb, h, x, y, z, c, seg = 10) => ({ g: new THREE.CylinderGeometry(rt, rb, h, seg).translate(x, y, z), c: cc(c) });
      const Bm = (a, b, r, c, seg = 5) => { // rør mellem to punkter
        const d = new V3().subVectors(b, a), len = d.length();
        const g = new THREE.CylinderGeometry(r, r, len, seg).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(Z, d.normalize()));
        const m = new V3().addVectors(a, b).multiplyScalar(0.5);
        return { g: g.translate(m.x, m.y, m.z), c: cc(c) };
      };
      const P3 = (x, y, z) => new V3(x, y, z);
      const mesh = (geo, mat, noShadow) => { const m = new THREE.Mesh(geo, mat); if (noShadow) m.userData.noCastShadow = true; return m; };
      const shiftUV = (geo, du, dv) => {
        const uv = geo.attributes.uv;
        for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) + du, uv.getY(i) + dv);
        return geo;
      };

      // Betonkant: flad ring langs toppen + smalt bånd ned ad siden (flugter med fodaftrykket)
      const copingGeo = (p, cw, drop) => {
        const y0 = p.h / 2 + 0.004, e = 0.004;
        if (p.shape === 'cyl') {
          const R = p.w / 2;
          return merge([
            { g: new THREE.RingGeometry(Math.max(0.05, R - cw), R, 48, 1).rotateX(-PI / 2).translate(0, y0, 0) },
            { g: new THREE.CylinderGeometry(R + e, R + e, drop, 48, 1, true).translate(0, y0 - drop / 2, 0) },
          ]);
        }
        const hw = p.w / 2, hd = p.d / 2, pos = [], yb = y0 - drop;
        const quad = (a, b, c, d) => pos.push(...a, ...b, ...c, ...a, ...c, ...d);
        quad([-hw, y0, -hd], [hw, y0, -hd], [hw, y0, -hd + cw], [-hw, y0, -hd + cw]);
        quad([-hw, y0, hd - cw], [hw, y0, hd - cw], [hw, y0, hd], [-hw, y0, hd]);
        quad([-hw, y0, -hd + cw], [-hw + cw, y0, -hd + cw], [-hw + cw, y0, hd - cw], [-hw, y0, hd - cw]);
        quad([hw - cw, y0, -hd + cw], [hw, y0, -hd + cw], [hw, y0, hd - cw], [hw - cw, y0, hd - cw]);
        quad([-hw, yb, -hd - e], [hw, yb, -hd - e], [hw, y0, -hd - e], [-hw, y0, -hd - e]);
        quad([hw, yb, hd + e], [-hw, yb, hd + e], [-hw, y0, hd + e], [hw, y0, hd + e]);
        quad([-hw - e, yb, hd], [-hw - e, yb, -hd], [-hw - e, y0, -hd], [-hw - e, y0, hd]);
        quad([hw + e, yb, -hd], [hw + e, yb, hd], [hw + e, y0, hd], [hw + e, y0, -hd]);
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.computeVertexNormals();
        return tr(g);
      };

      // Legeme med tekstur-UV i meter (solid = det faste legeme)
      const body = (p, top, side, bot, tile, sideTile, tileTop = true) => {
        const D = p.type === 'ramp' ? p.slopeLen : p.d;
        const m = p.shape === 'cyl'
          ? new THREE.Mesh(tr(ctx.cylGeometry(p.w / 2, p.h, tile, { tileTop })), [side, top, bot])
          : new THREE.Mesh(tr(ctx.boxGeometry(p.w, p.h, D, tile, { tileTop, sideTile })), [side, side, top, bot, side, side]);
        m.userData.solid = true;
        return m;
      };
      // Flade dekaler (≤ 3 cm over toppen)
      const decalMesh = (parts, y) => { const m = mesh(merge(parts), M.decal(), true); m.position.y = y; return m; };
      const discPart = (r, x, z, c, seg = 24, a0 = 0, al = TAU) => ({ g: new THREE.CircleGeometry(r, seg, a0, al).rotateX(-PI / 2).translate(x, 0, z), c: cc(c) });
      const ringPart = (r0, r1, c, seg = 32) => ({ g: new THREE.RingGeometry(r0, r1, seg).rotateX(-PI / 2), c: cc(c) });
      const flatBox = (w, d, x, z, c, ry = 0) => ({ g: new THREE.BoxGeometry(w, 0.004, d).rotateY(ry).translate(x, 0, z), c: cc(c) });

      /* ---------- Skelet med stillads (byggeplads), lokale/verdens-koordinater ---------- */
      const skeleton = (parts, cx, cz, w, d, yTop, yBot, inset = 0.9) => {
        const hw = w / 2 - inset, hd = d / 2 - inset, cs = '#aaa69e';
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(B(0.4, yTop - yBot, 0.4, cx + sx * hw, (yTop + yBot) / 2, cz + sz * hd, cs));
        for (let y = yTop - 1.4; y > yBot; y -= 3.6) parts.push(B(hw * 2, 0.3, hd * 2, cx, y, cz, '#b4b0a8'));
        // stillads: standere, rækværk, planker og diagonaler langs alle fire sider
        const sides = [[-w / 2 + 0.12, -d / 2 + 0.12, w / 2 - 0.12, -d / 2 + 0.12], [w / 2 - 0.12, -d / 2 + 0.12, w / 2 - 0.12, d / 2 - 0.12],
          [w / 2 - 0.12, d / 2 - 0.12, -w / 2 + 0.12, d / 2 - 0.12], [-w / 2 + 0.12, d / 2 - 0.12, -w / 2 + 0.12, -d / 2 + 0.12]];
        sides.forEach(([x0, z0, x1, z1], si) => {
          const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / 2.4));
          for (let i = 0; i <= n; i++) {
            const x = cx + x0 + ((x1 - x0) * i) / n, z = cz + z0 + ((z1 - z0) * i) / n;
            parts.push(Cy(0.045, 0.045, yTop - yBot, x, (yTop + yBot) / 2, z, '#f2bf14', 5));
          }
          for (let y = yTop - 1.0; y > yBot; y -= 2.0) {
            parts.push(Bm(P3(cx + x0, y, cz + z0), P3(cx + x1, y, cz + z1), 0.04, '#f2bf14'));
            if (((y + 1000) / 2 | 0) % 2 === si % 2) parts.push(Bm(P3(cx + x0, y, cz + z0), P3(cx + x0 + (x1 - x0) / n, y - 2, cz + z0 + (z1 - z0) / n), 0.03, '#f2bf14'));
            if (Math.round(y) % 4 === 0) parts.push(B(Math.abs(x1 - x0) > 0.1 ? len : 0.9, 0.05, Math.abs(x1 - x0) > 0.1 ? 0.9 : len, cx + (x0 + x1) / 2, y + 0.02, cz + (z0 + z1) / 2, '#a9824f'));
          }
        });
      };

      /* ---------- Bygningsskaft under taget (inden for fodaftrykket) ---------- */
      const shaft = (g, p, kind) => {
        const bottomY = p.top - p.h, rnd = ctx.mulberry32(p.seed);
        const depth = Math.min(ctx.freeBelow(p) - 0.8, bottomY - ctx.lavaY - 0.15, 58);
        if (depth < 2) return;
        const [fm, tile] = FAC[kind]();
        const inset = 0.06;
        let geo;
        if (p.shape === 'cyl') geo = ctx.cylGeometry(p.w / 2 - inset, depth, tile, { tileTop: false });
        else geo = ctx.boxGeometry(p.w - inset * 2, depth, p.d - inset * 2, tile, { tileTop: false });
        shiftUV(tr(geo), rnd() * 4, -depth / tile + 1);
        const bot = M.concrete('#6a6a6a');
        const m = new THREE.Mesh(geo, p.shape === 'cyl' ? [fm, bot, bot] : [fm, fm, bot, bot, fm, fm]);
        m.position.y = -p.h / 2 - depth / 2;
        g.add(m);
        return depth;
      };

      /* ---------- Platformer ---------- */
      const belts = [];
      // Hvilket udseende hører til platformen?
      const look = (p) => {
        const t = p.type, v = p.v;
        const map = { ice: 'glass', crumble: 'crumble', move: 'gondola', swing: 'gondola', bounce: 'cushion', spin: 'disc', conveyor: 'belt', rot: 'turn', vent: 'vent', ramp: 'ramp', rail: 'rail', boost: 'boost' };
        if (map[t]) return map[t];
        if (v && ['tar', 'terrace', 'garden', 'helipad', 'tank', 'ac', 'hut', 'site'].includes(v)) return v;
        if (t === 'finish') return 'helipad';
        return 'tar';
      };

      const platform = (p) => {
        const g = new THREE.Group(), H = p.h, cyl = p.shape === 'cyl', kind = FKINDS[p.seed % FKINDS.length], k = look(p);
        const W = p.w, D = p.d, R = W / 2, top = H / 2;
        const [, , par] = FAC[kind]();
        let main, cope = null, deep = true;
        switch (k) {
          case 'terrace':
            main = body(p, M.deck(), par, M.concrete('#777'), 2, 2);
            cope = [M.copingCol('#2b2f35'), 0.22, 0.1];
            break;
          case 'garden':
            main = body(p, std('lawn', { map: T.lawn(), roughness: 0.95 }), M.deck('#8a6a4a'), M.concrete('#777'), 4, 1.6);
            cope = [M.copingCol('#6b4a2e'), 0.26, 0.14];
            break;
          case 'helipad': {
            main = body(p, M.tar(), par, M.concrete('#777'), 3, 2);
            cope = [M.copingCol('#f2bf14'), 0.34, 0.2];
            const s = Math.min(W, cyl ? W : D) * 0.96;
            const dec = mesh(tr(new THREE.PlaneGeometry(s, s).rotateX(-PI / 2)), std('hp', { map: T.helipad(), transparent: true, depthWrite: false, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), true);
            dec.position.y = top + 0.012;
            g.add(dec);
            const lights = []; // kantlys (flade)
            const n = cyl ? 20 : 4 + 2 * Math.round(W + D);
            for (let i = 0; i < n; i++) {
              let x, z;
              if (cyl) { x = Math.cos((i / n) * TAU) * (R - 0.62); z = Math.sin((i / n) * TAU) * (R - 0.62); }
              else { const t = (i / n) * 4, e = Math.floor(t), f = t - e; const a = [[-1, -1], [1, -1], [1, 1], [-1, 1]][e], b = [[1, -1], [1, 1], [-1, 1], [-1, -1]][e]; x = (a[0] + (b[0] - a[0]) * f) * (W / 2 - 0.62); z = (a[1] + (b[1] - a[1]) * f) * (D / 2 - 0.62); }
              lights.push(discPart(0.07, x, z, i % 2 ? '#fff6c0' : '#7dffa0', 8));
            }
            g.add(decalMesh(lights, top + 0.016));
            break;
          }
          case 'tank': {
            main = body(p, M.steel('#dfe6ec'), M.deck('#7c6a58'), M.dark(), 2, 2);
            const hat = [];
            const rr = (cyl ? R : Math.min(W, D) / 2) * 0.55;
            hat.push(ringPart(rr * 0.82, rr, '#4b525a'), discPart(rr * 0.3, 0, 0, '#454c54', 16));
            for (let i = 0; i < 8; i++) hat.push(discPart(0.06, Math.cos((i / 8) * TAU) * rr * 0.91, Math.sin((i / 8) * TAU) * rr * 0.91, '#2a2f36', 6));
            g.add(decalMesh(hat, top + 0.012));
            break;
          }
          case 'ac': {
            main = body(p, M.steel('#d8dde2'), std('louv', { map: T.louvre(), roughness: 0.5, metalness: 0.4 }), M.dark(), 1.2, 1);
            const cells = Math.max(1, Math.round(Math.max(W, D) / 1.6)), cl = Math.max(W, D) / cells, rr = Math.min(cl, Math.min(W, D)) * 0.4, hat = [];
            for (let i = 0; i < cells; i++) {
              const x = W >= D ? -W / 2 + cl * (i + 0.5) : 0, z = W >= D ? 0 : -D / 2 + cl * (i + 0.5);
              hat.push(discPart(rr, x, z, '#1b2025', 24), ringPart(rr * 0.9, rr * 1.04, '#c4ccd3', 24));
              for (let j = 0; j < 3; j++) hat.push(flatBox(rr * 1.9, 0.05, x, z, '#8a949d', (j * PI) / 3));
              hat[hat.length - 1].g.translate(0, 0.003, 0);
            }
            g.add(decalMesh(hat.map((h, i) => (h.g.translate(0, 0, 0), h)), top + 0.014));
            deep = false;
            break;
          }
          case 'hut': {
            main = body(p, M.concrete('#f3f5f6'), M.concrete('#ddd6c6'), M.concrete('#777'), 2.4, 2);
            cope = [M.copingCol('#9a968e'), 0.2, 0.12];
            const dh = Math.min(H * 0.9, 1.9), dw = 0.9;
            const door = mesh(tr(new THREE.PlaneGeometry(dw, dh)), M.paint('#3a4a5a'), true);
            door.position.set(0, -H / 2 + dh / 2 + 0.02, D / 2 + 0.008);
            const fr = mesh(tr(new THREE.PlaneGeometry(dw + 0.12, dh + 0.06)), M.paint('#e9e9e4'), true);
            fr.position.set(0, door.position.y + 0.02, D / 2 + 0.004);
            g.add(fr, door);
            if (!cyl) { // rist på siden
              const lv = mesh(tr(new THREE.PlaneGeometry(Math.min(1.2, D * 0.5), Math.min(0.5, H * 0.5))), std('louvh', { map: T.louvre(), roughness: 0.6 }), true);
              lv.rotation.y = PI / 2; lv.position.set(W / 2 + 0.008, 0, 0); g.add(lv);
            }
            break;
          }
          case 'site': {
            main = body(p, M.concrete('#9a968e'), M.concrete('#b0aca4'), M.concrete('#666'), 3, 2);
            cope = [M.copingCol('#f2bf14'), 0.3, 0.2];
            const rb = [], rr = ctx.mulberry32(p.seed + 5);
            for (let x = -W / 2 + 0.7; x < W / 2 - 0.5; x += 0.4) rb.push(flatBox(0.014, D - 1.2, x, 0, '#5a3a2a'));
            for (let z = -D / 2 + 0.7; z < D / 2 - 0.5; z += 0.4) rb.push(flatBox(W - 1.2, 0.014, 0, z, '#6a4636'));
            for (let i = 0; i < 3; i++) rb.push(flatBox(0.6 + rr(), 0.6 + rr(), (rr() - 0.5) * (W - 2), (rr() - 0.5) * (D - 2), '#b88a4e', rr() * 3));
            g.add(decalMesh(rb, top + 0.012));
            break;
          }
          case 'glass': { // 'ice': glastag/ovenlys – glat og blank
            const gl = tr(new THREE.MeshPhysicalMaterial({ map: T.glass(), color: '#eaf8ff', roughness: 0.04, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.03, emissive: '#2c78b8', emissiveIntensity: 0.22 }));
            main = body(p, gl, M.steel('#d6e0e8'), M.dark(), 3.2, 1.2);
            break;
          }
          case 'crumble': {
            main = body(p, std('crumble', { map: T.crumble(), roughness: 0.95 }), std('crumble', { map: T.crumble(), roughness: 0.95 }), M.dark(), 2.4, 1.4);
            deep = false;
            const rr = ctx.mulberry32(p.seed + 3), cr = [];
            for (let i = 0; i < 3; i++) { // revner som flade striber
              let x = (rr() - 0.5) * (W - 1.2), z = -D / 2 + 0.3 + rr() * 0.5; const pts = [];
              for (let j = 0; j < 7; j++) { pts.push([x, z]); x += (rr() - 0.5) * 1.2; z += (D - 0.6) / 7 * (0.7 + rr() * 0.6); }
              for (let j = 0; j + 1 < pts.length; j++) {
                const [x0, z0] = pts[j], [x1, z1] = pts[j + 1], L = Math.hypot(x1 - x0, z1 - z0);
                cr.push(flatBox(0.1 + rr() * 0.07, L + 0.06, (x0 + x1) / 2, (z0 + z1) / 2, '#0a0806', Math.atan2(x1 - x0, z1 - z0)));
              }
            }
            if (!cyl) g.add(decalMesh(cr, top + 0.01));
            const jo = [];
            for (let i = -1; i <= 1; i += 2) jo.push(B(0.18, 0.3, D - 0.2, i * W * 0.28, -H / 2 - 0.15, 0, '#4a3a2c'));
            jo.push(B(W - 0.2, 0.22, 0.18, 0, -H / 2 - 0.12, 0, '#3e3024'));
            g.add(mesh(merge(jo), M.vcol()));
            break;
          }
          case 'gondola': { // vinduespudser-kurv: ternplade, hvid skrog med gul bånd
            main = body(p, M.steel('#e8edf0'), M.paint('#f1f3f2'), M.dark(), 1.2, 1.2);
            cope = [M.copingCol('#f2bf14'), 0.2, 0.18];
            deep = false;
            const parts = [B(W - 0.1, 0.1, D - 0.1, 0, -H / 2 - 0.06, 0, '#3a4048')];
            const ax = p.move && p.move.axis && Math.abs(p.move.axis[1]) > 0.5;
            if (ax) for (const sx of [-1, 1]) { // skinneføring: arm ud til masten (under bunden)
              parts.push(B(0.7, 0.07, 0.34, sx * (W / 2 + 0.3), -H / 2 - 0.12, 0, '#f2bf14'));
              parts.push(B(0.2, 0.34, 0.34, sx * (W / 2 + 0.62), -H / 2 + 0.04, 0, '#2a2f36'));
            }
            g.add(mesh(merge(parts), M.vcol()));
            break;
          }
          case 'cushion': { // luftpude: orange vinyl med sømme
            main = body(p, M.paint('#ff7a1a'), M.paint('#e85a10'), M.dark(), 2, 2);
            cope = [M.copingCol('#ffd24a'), 0.12, 0.06];
            const dc = [ringPart(Math.min(W, cyl ? W : D) * 0.22, Math.min(W, cyl ? W : D) * 0.26, '#fff0c8', 32), discPart(Math.min(W, cyl ? W : D) * 0.1, 0, 0, '#fff0c8', 16)];
            g.add(decalMesh(dc, top + 0.012));
            g.add(mesh(tr(new THREE.CylinderGeometry(Math.min(R, W / 2) * 0.55, Math.min(R, W / 2) * 0.4, 0.9, 12)), M.dark(), false)).children[g.children.length - 1].position.y = -H / 2 - 0.45;
            deep = false;
            break;
          }
          case 'disc': { // spinnerens base
            main = body(p, M.steel('#c8d0d6'), M.dark(), M.dark(), 1.4, 1.4);
            g.add(decalMesh([ringPart(R * 0.82, R * 0.94, '#f2bf14', 40), discPart(0.4, 0, 0, '#2a2f36', 16)], top + 0.012));
            const hub = mesh(tr(new THREE.CylinderGeometry(0.22, 0.3, 0.7, 14)), M.dark());
            hub.position.y = top + 0.35; g.add(hub);
            break;
          }
          case 'belt': {
            const bt = T.belt().clone(); bt.needsUpdate = true;
            if (p.beltAx === 'x') { bt.center.set(0.5, 0.5); bt.rotation = PI / 2; }
            const bm = tr(new THREE.MeshStandardMaterial({ map: bt, roughness: 0.8 }));
            belts.push({ p, tex: bt });
            main = body(p, bm, M.dark(), M.dark(), 2, 1.2);
            const e = [flatBox(0.14, D, -W / 2 + 0.08, 0, '#f2bf14'), flatBox(0.14, D, W / 2 - 0.08, 0, '#f2bf14')];
            g.add(decalMesh(e, top + 0.008));
            break;
          }
          case 'turn': { // drejeskive: gul/hvide kiler så rotationen kan ses
            main = body(p, M.steel('#bfc7ce'), M.dark(), M.dark(), 1.4, 1.4);
            const wd = [];
            for (let i = 0; i < 6; i++) wd.push(discPart(R * 0.93, 0, 0, '#f2bf14', 8, (i * TAU) / 6, TAU / 12));
            wd.push(discPart(R * 0.14, 0, 0, '#2a2f36', 16));
            g.add(decalMesh(wd, top + 0.012));
            deep = false;
            break;
          }
          case 'vent':
            main = body(p, std('vent', { map: T.louvre(), roughness: 0.5, metalness: 0.4 }), M.steel('#aab3bb'), M.dark(), 0.9, 1);
            break;
          case 'ramp': case 'rail': case 'boost': {
            main = body(p, k === 'rail' ? M.yellow() : M.deck('#c9a373'), k === 'boost' ? M.dark() : M.steel('#9aa3ab'), M.dark(), 2, 1.2);
            if (k === 'boost') {
              const ch = [];
              for (let i = 0; i < 3; i++) ch.push({ g: new THREE.ConeGeometry(Math.min(W, 4) * 0.28, 0.6, 3).rotateX(-PI / 2).scale(1, 0.003 / 0.6, 1).translate(0, 0, -p.d * 0.3 + i * p.d * 0.3), c: cc('#ff9b1a') });
              g.add(decalMesh(ch, top + 0.012));
            }
            deep = false;
            break;
          }
          default: // 'tar' (standard)
            main = body(p, M.tar(), par, M.concrete('#777'), 3, 2);
            cope = [M.coping(), 0.3, 0.16];
        }
        if (main.material[0] === par && !cope) cope = [M.coping(), 0.3, 0.16];
        g.add(main);
        if (cope) g.add(mesh(copingGeo(p, cope[1], cope[2]), cope[0], true));
        // Bygning/ben under taget (ikke på ting der bevæger sig eller klemmes)
        if (deep && !p.kin) {
          if (k === 'tank') { // vandtårn: tønde, ben med krydsafstivning, så bygning
            const rr = cyl ? R : Math.min(W, D) / 2, parts = [];
            const tankH = 2.0;
            const mb = cyl ? new THREE.CylinderGeometry(rr * 0.985, rr * 0.985, tankH, 28, 1, true) : new THREE.BoxGeometry(W * 0.985, tankH, D * 0.985);
            const bm = new THREE.Mesh(tr(mb.translate(0, -H / 2 - tankH / 2, 0)), M.deck('#7c6a58'));
            g.add(bm);
            for (const yy of [0.35, 1.0, 1.65]) { // jernbånd
              parts.push(cyl ? { g: new THREE.CylinderGeometry(rr * 0.99, rr * 0.99, 0.09, 28, 1, true).translate(0, -H / 2 - yy, 0), c: cc('#2f343a') } : B(W * 0.99, 0.09, D * 0.99, 0, -H / 2 - yy, 0, '#2f343a'));
            }
            const y0 = -H / 2 - tankH, y1 = y0 - 4.0, lx = (cyl ? rr : W / 2) * 0.82, lz = (cyl ? rr : D / 2) * 0.82, sh = 0.84;
            for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
              const f = cyl ? 0.7071 : 1;
              parts.push(Bm(P3(sx * lx * f, y0, sz * lz * f), P3(sx * lx * f * sh, y1, sz * lz * f * sh), 0.1, '#47505a', 6));
            }
            for (const [a, b] of [[-1, -1, 1, -1], [1, -1, 1, 1], [1, 1, -1, 1], [-1, 1, -1, -1]].map((q) => [[q[0], q[1]], [q[2], q[3]]])) {
              const f = cyl ? 0.7071 : 1;
              parts.push(Bm(P3(a[0] * lx * f, y0 - 0.2, a[1] * lz * f), P3(b[0] * lx * f * sh, y1 + 0.3, b[1] * lz * f * sh), 0.04, '#6a747e'));
              parts.push(Bm(P3(b[0] * lx * f, y0 - 0.2, b[1] * lz * f), P3(a[0] * lx * f * sh, y1 + 0.3, a[1] * lz * f * sh), 0.04, '#6a747e'));
            }
            const sl = cyl ? new THREE.CylinderGeometry(rr * 0.78, rr * 0.78, 0.4, 24) : new THREE.BoxGeometry(W * 0.78, 0.4, D * 0.78);
            const slab = new THREE.Mesh(tr(sl), M.concrete('#777')); slab.position.y = y1 - 0.2; g.add(slab);
            g.add(mesh(merge(parts), M.vcol()));
            // bygningen under: lidt smallere end tårnets fodaftryk
            const sub = Object.assign({}, p, { w: p.w * 0.7, d: p.d * 0.7, h: 0, top: p.top + (y1 - 0.4 + H / 2), seed: p.seed });
            const sg = new THREE.Group(); const dp = shaft(sg, Object.assign(sub, { h: 0 }), kind);
            if (dp) { sg.position.y = y1 - 0.4 + H / 2; g.add(sg); }
          } else if (k === 'site') {
            const dp = Math.min(ctx.freeBelow(p) - 0.8, p.top - p.h - ctx.lavaY - 0.15, 52);
            if (dp > 3) {
              const parts = [];
              skeleton(parts, 0, 0, W, D, -H / 2, -H / 2 - dp);
              g.add(mesh(merge(parts), M.vcol()));
              if (!cyl) {
                const net = mesh(tr(new THREE.BoxGeometry(W - 0.2, dp * 0.55, D - 0.2)), tr(new THREE.MeshBasicMaterial({ color: '#3e8f4a', transparent: true, opacity: 0.4, depthWrite: false })), true);
                net.position.y = -H / 2 - dp * 0.3; g.add(net);
              }
            }
          } else shaft(g, p, kind);
        } else if (deep && p.kin === false) shaft(g, p, kind);
        return g;
      };

      /* ---------- Stænger: gule stilladsrør med koblinger ---------- */
      const bar = (b) => {
        const g = new THREE.Group(), galv = b.v === 'galv';
        const pipe = new THREE.Mesh(tr(new THREE.CylinderGeometry(b.r, b.r, b.len, 14).rotateZ(PI / 2)), galv ? std('galv', { color: '#aab4be', roughness: 0.35, metalness: 0.85 }) : M.yellow());
        g.add(pipe);
        const parts = [];
        const nodes = [-b.len / 2, b.len / 2];
        for (let x = -b.len / 2 + 1.8; x < b.len / 2 - 0.9; x += 2.4) nodes.push(x);
        for (const x of nodes) parts.push({ g: new THREE.CylinderGeometry(b.r * 1.7, b.r * 1.7, 0.12, 10).rotateZ(PI / 2).translate(x, 0, 0), c: cc('#2b3036') });
        for (const sx of [-1, 1]) parts.push({ g: new THREE.SphereGeometry(b.r * 1.15, 8, 6).translate(sx * (b.len / 2 + 0.02), 0, 0), c: cc('#2b3036') });
        g.add(mesh(merge(parts), M.vcol()));
        return g;
      };

      /* ---------- Svævebane: stålwire med gule master ved siden af ---------- */
      const zip = (z) => {
        const g = new THREE.Group();
        const A = P3(z.ax, z.ay, z.az), Bp = P3(z.bx, z.by, z.bz), dir = new V3().subVectors(Bp, A).normalize();
        const side = new V3(-dir.z, 0, dir.x).normalize().multiplyScalar(0.95);
        const parts = [Bm(A, Bp, 0.028, '#323840', 6)];
        for (const [P, drop] of [[A, 5.5], [Bp, 4.2]]) {
          const base = P.clone().add(side);
          parts.push(Bm(P3(base.x, P.y - drop, base.z), P3(base.x, P.y + 0.45, base.z), 0.1, '#f2bf14', 8));
          parts.push(Bm(P3(base.x, P.y + 0.3, base.z), P3(P.x, P.y + 0.06, P.z), 0.05, '#f2bf14', 6));
          parts.push({ g: new THREE.SphereGeometry(0.1, 8, 6).translate(P.x, P.y + 0.04, P.z), c: cc('#2b3036') });
          parts.push(Bm(P3(base.x, P.y - drop * 0.5, base.z), P3(base.x - side.x * 1.2, P.y - drop * 0.9, base.z - side.z * 1.2), 0.05, '#aab3bb', 5));
        }
        g.add(mesh(merge(parts), M.vcol()));
        return g;
      };

      /* ---------- Anker: kranhage med blok ---------- */
      const anchor = () => {
        const g = new THREE.Group(), parts = [];
        parts.push(B(0.34, 0.2, 0.24, 0, 0.18, 0, '#f2bf14'), Cy(0.04, 0.04, 1.4, 0, 1.0, 0, '#3a4048', 6));
        parts.push({ g: new THREE.TorusGeometry(0.15, 0.04, 6, 14, PI * 1.5).rotateX(PI / 2).translate(0, -0.06, 0), c: cc('#cfd6dc') });
        g.add(mesh(merge(parts), M.vcol()));
        return g;
      };

      /* ---------- Spinner-arm: gul/sort advarselsbom ---------- */
      const spinArm = (p) => {
        const parts = [], n = Math.max(4, Math.round(p.bar / 0.6)), sl = p.bar / n;
        for (let i = 0; i < n; i++) parts.push(B(sl, 0.36, 0.45, -p.bar / 2 + sl * (i + 0.5), 0, 0, i % 2 ? '#2a2f36' : '#f2bf14'));
        return mesh(merge(parts), M.vcol());
      };

      /* ---------- Kulisse ---------- */
      let blink = [], haze = [];
      const decor = (data) => {
        const root = new THREE.Group();
        const R = ctx.mulberry32(9100 + data.plats.length * 17), bd = data.bounds, plats = data.plats;
        // Banens "skygge" i planen: cirkler vi skal holde os fra
        const discs = plats.map((p) => ({ x: p.x, z: p.z, r: p.shape === 'cyl' ? p.w / 2 : Math.hypot(p.w, p.d) / 2, y: p.top }));
        for (const b of data.bars) for (const f of [-0.5, 0, 0.5]) discs.push({ x: b.x + b.dx * b.len * f, z: b.z + b.dz * b.len * f, r: 2.5, y: b.y });
        for (const z of data.zips) for (const f of [0, 0.5, 1]) discs.push({ x: z.ax + (z.bx - z.ax) * f, z: z.az + (z.bz - z.az) * f, r: 2.5, y: z.ay });
        const clear = (x, z, r, m = 4) => discs.every((d) => Math.hypot(x - d.x, z - d.z) > r + d.r + m);
        const nearest = (x, z) => { let best = 1e9, y = 0; for (const d of discs) { const e = Math.hypot(x - d.x, z - d.z) - d.r; if (e < best) { best = e; y = d.y; } } return { d: best, y }; };

        const placed = [], clutter = [], lawns = [], roofs = [], walls = { glass: [], office: [], brick: [] };
        const addWall = (arr, x0, z0, x1, z1, y0, y1, tile, uo) => { // ét væg-stykke med UV i meter
          const ex = x1 - x0, ez = z1 - z0, L = Math.hypot(ex, ez);
          arr.push([x0, z0, x1, z1, y0, y1, tile, uo, L]);
        };
        const addBuilding = (x, z, w, d, yTop, kind) => {
          const yBot = ctx.lavaY - 3, tile = FAC[kind]()[1], uo = R() * 5;
          const hx = w / 2, hz = d / 2;
          addWall(walls[kind], x - hx, z - hz, x + hx, z - hz, yBot, yTop, tile, uo);
          addWall(walls[kind], x + hx, z - hz, x + hx, z + hz, yBot, yTop, tile, uo + 1.3);
          addWall(walls[kind], x + hx, z + hz, x - hx, z + hz, yBot, yTop, tile, uo + 2.1);
          addWall(walls[kind], x - hx, z + hz, x - hx, z - hz, yBot, yTop, tile, uo + 3.7);
          roofs.push([x, z, w, d, yTop]);
          // betonkant rundt om taget
          const pc = '#c4c0b6';
          clutter.push(B(w, 0.7, 0.3, x, yTop + 0.35, z - hz + 0.15, pc), B(w, 0.7, 0.3, x, yTop + 0.35, z + hz - 0.15, pc),
            B(0.3, 0.7, d - 0.6, x - hx + 0.15, yTop + 0.35, z, pc), B(0.3, 0.7, d - 0.6, x + hx - 0.15, yTop + 0.35, z, pc));
        };
        const roofProps = (x, z, w, d, yTop, big, far) => {
          const n = Math.floor(R() * 4);
          for (let i = 0; i < n; i++) { // aircondition
            const px = x + (R() - 0.5) * (w - 4), pz = z + (R() - 0.5) * (d - 4), sc = 0.8 + R() * 1.2;
            clutter.push(B(2.2 * sc, 1.3 * sc, 1.4 * sc, px, yTop + 0.65 * sc, pz, '#aeb7bf'), Cy(0.55 * sc, 0.55 * sc, 0.04, px, yTop + 1.32 * sc, pz, '#1d2227', 12));
          }
          if (R() < 0.34) { // vandtårn
            const px = x + (R() - 0.5) * (w - 8), pz = z + (R() - 0.5) * (d - 8), s = 0.8 + R() * 0.5;
            clutter.push(Cy(1.6 * s, 1.6 * s, 3.2 * s, px, yTop + (2.8 + 1.6) * s, pz, '#7a6652', 14), Cy(0.1, 1.75 * s, 1.1 * s, px, yTop + (4.4 + 3.2 * 0.5 + 0.55) * s - 0.5 * s, pz, '#4f565e', 14));
            for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) clutter.push(Bm(P3(px + sx * 1.3 * s, yTop, pz + sz * 1.3 * s), P3(px + sx * 1.3 * s, yTop + 2.9 * s, pz + sz * 1.3 * s), 0.09, '#4a525b'));
          }
          if (R() < 0.3 && w > 12) { // trappehus
            const px = x + (R() - 0.5) * (w - 9), pz = z + (R() - 0.5) * (d - 9);
            clutter.push(B(4.5, 3.0, 4, px, yTop + 1.5, pz, '#d9d3c5'), B(4.9, 0.25, 4.4, px, yTop + 3.1, pz, '#9a968e'), B(0.9, 1.9, 0.06, px, yTop + 0.97, pz + 2.03, '#3a4a5a'));
          }
          if (R() < 0.16 && w > 16) { // solpaneler
            const px = x + (R() - 0.5) * (w - 12), pz = z + (R() - 0.5) * (d - 10);
            for (let i = 0; i < 5; i++) clutter.push({ g: new THREE.BoxGeometry(2.4, 0.08, 1.5).rotateX(-0.45).translate(px + (i - 2) * 2.6, yTop + 0.75, pz), c: cc('#1c3a68') });
          }
          if (R() < (far ? 0.4 : 0.26)) { // antenne med rød lampe
            const px = x + (R() - 0.5) * (w - 6), pz = z + (R() - 0.5) * (d - 6), hgt = 7 + R() * (big ? 30 : 14);
            clutter.push(Cy(0.07, 0.16, hgt, px, yTop + hgt / 2, pz, '#aab2ba', 5));
            for (let j = 1; j < 4; j++) clutter.push(B(1.6 - j * 0.3, 0.07, 0.07, px, yTop + (hgt * j) / 4.4, pz, '#9aa2aa'));
            if (R() < 0.8) blink.push({ x: px, y: yTop + hgt + 0.2, z: pz, ph: R() * TAU });
          }
          if (R() < 0.12 && w > 14) { // taghave
            const px = x + (R() - 0.5) * (w - 8), pz = z + (R() - 0.5) * (d - 8);
            lawns.push([px, pz, Math.min(w - 4, 9), Math.min(d - 4, 7), yTop + 0.06]);
            for (let i = 0; i < 4; i++) clutter.push({ g: new THREE.IcosahedronGeometry(0.9 + R() * 0.9, 0).translate(px + (R() - 0.5) * 6, yTop + 1.4 + R(), pz + (R() - 0.5) * 4), c: cc(R() < 0.5 ? '#3f8f3c' : '#5aa845') }, B(0.18, 1.2, 0.18, px, yTop + 0.6, pz, '#5a4030'));
          }
          if (R() < 0.13 && w > 12) { // vasketøjssnor
            const px = x + (R() - 0.5) * (w - 10), pz = z + (R() - 0.5) * (d - 8), L = 5.5;
            clutter.push(B(0.08, 2.2, 0.08, px - L / 2, yTop + 1.1, pz, '#6a5a4a'), B(0.08, 2.2, 0.08, px + L / 2, yTop + 1.1, pz, '#6a5a4a'), B(L, 0.02, 0.02, px, yTop + 2.1, pz, '#e8e8e8'));
            for (let i = 0; i < 7; i++) clutter.push(B(0.5 + R() * 0.3, 0.6 + R() * 0.3, 0.02, px - L / 2 + 0.5 + i * 0.7, yTop + 1.75, pz, ['#ff5a5a', '#fff', '#5aa0ff', '#ffd24a', '#7ad07a'][i % 5]));
          }
        };

        // Skyline: bygninger uden om banen (nær: lidt under banen; fjern: høje tårne i diset)
        for (let i = 0, n = 0; i < 900 && n < 150; i++) {
          const a = R() * TAU, far = i > 380, rad = 18 + Math.pow(R(), far ? 0.8 : 1.5) * (bd.radius + (far ? 620 : 150));
          const x = bd.cx + Math.cos(a) * rad, z = bd.cz + Math.sin(a) * rad;
          const w = (far ? 22 : 13) + R() * (far ? 40 : 20), d = (far ? 22 : 13) + R() * (far ? 40 : 20), r = Math.hypot(w, d) / 2;
          if (!clear(x, z, r, 3.5) || placed.some((q) => Math.hypot(x - q.x, z - q.z) < (r + q.r) * 0.82 + 1.5)) continue;
          const ne = nearest(x, z), tall = ne.d > 55 && R() < 0.45;
          const yTop = tall ? ne.y + 8 + R() * (40 + Math.min(120, ne.d * 0.25)) : ne.y - 5 - R() * 30;
          const kind = FKINDS[Math.floor(R() * FKINDS.length)];
          placed.push({ x, z, r }); n++;
          addBuilding(x, z, w, d, yTop, kind);
          roofProps(x, z, w, d, yTop, tall, far);
          if (n === 7 || n === 26) { // helipad på et par tage
            clutter.push({ g: new THREE.CylinderGeometry(Math.min(w, d) * 0.4, Math.min(w, d) * 0.4, 0.15, 28).translate(x, yTop + 0.08, z), c: cc('#4a4f55') });
            roofs.pad = (roofs.pad || []).concat([[x, yTop + 0.17, z, Math.min(w, d) * 0.8]]);
          }
        }

        // Byggeplads med skelet, stillads og tårnkran (ét sted tæt på banen)
        let site = null;
        for (let i = 0; i < 300 && !site; i++) {
          const a = R() * TAU, rad = bd.radius * 0.4 + R() * (bd.radius * 0.7 + 60), x = bd.cx + Math.cos(a) * rad, z = bd.cz + Math.sin(a) * rad;
          if (clear(x, z, 24, 14) && placed.every((q) => Math.hypot(x - q.x, z - q.z) > q.r + 26)) site = [x, z];
        }
        if (site) {
          const [sx, sz] = site, ne = nearest(sx, sz), roof = ne.y + 6 + R() * 8, parts = [];
          skeleton(parts, sx, sz, 22, 18, roof, ctx.lavaY - 2, 1.6);
          for (let y = roof - 1.4; y > roof - 14; y -= 3.6) parts.push(B(18.4, 0.3, 14.4, sx, y, sz, '#b4b0a8'));
          // tårnkran
          const mx = sx + 15, mz = sz + 2, yb = ctx.lavaY - 2, yt = roof + 34, ylow = roof + 33;
          for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) parts.push(B(0.35, yt - yb, 0.35, mx + dx * 1.1, (yt + yb) / 2, mz + dz * 1.1, '#f2bf14'));
          for (let y = yb; y < yt; y += 3.4) {
            parts.push(B(2.4, 0.16, 0.16, mx, y, mz - 1.1, '#f2bf14'), B(2.4, 0.16, 0.16, mx, y, mz + 1.1, '#f2bf14'), B(0.16, 0.16, 2.4, mx - 1.1, y, mz, '#f2bf14'), B(0.16, 0.16, 2.4, mx + 1.1, y, mz, '#f2bf14'));
            parts.push(Bm(P3(mx - 1.1, y, mz - 1.1), P3(mx + 1.1, y + 3.4, mz - 1.1), 0.07, '#f2bf14'), Bm(P3(mx + 1.1, y, mz + 1.1), P3(mx - 1.1, y + 3.4, mz + 1.1), 0.07, '#f2bf14'));
          }
          const jib = 40, cjib = 13;
          parts.push(B(jib + cjib, 0.3, 0.3, mx + (jib - cjib) / 2, ylow + 2.6, mz, '#f2bf14'), B(jib + cjib, 0.2, 0.2, mx + (jib - cjib) / 2, ylow + 0.8, mz, '#f2bf14'));
          for (let x = -cjib; x < jib; x += 2.6) parts.push(Bm(P3(mx + x, ylow + 0.8, mz), P3(mx + x + 1.3, ylow + 2.6, mz), 0.06, '#f2bf14'), Bm(P3(mx + x + 1.3, ylow + 2.6, mz), P3(mx + x + 2.6, ylow + 0.8, mz), 0.06, '#f2bf14'));
          parts.push(B(2.2, 2.0, 2.0, mx - 1.8, ylow + 0.5, mz, '#e8e8e4'), B(3, 1.8, 2.4, mx - cjib + 1.5, ylow + 0.9, mz, '#6e747c'), B(0.3, 5, 0.3, mx, ylow + 5.2, mz, '#f2bf14'));
          parts.push(Bm(P3(mx, ylow + 7.6, mz), P3(mx + jib, ylow + 2.6, mz), 0.04, '#cfd5da'), Bm(P3(mx, ylow + 7.6, mz), P3(mx - cjib, ylow + 2.6, mz), 0.04, '#cfd5da'));
          parts.push(Bm(P3(mx + jib * 0.7, ylow + 0.6, mz), P3(mx + jib * 0.7, ylow - 14, mz), 0.025, '#222'), B(0.7, 0.3, 0.7, mx + jib * 0.7, ylow - 14.2, mz, '#f2bf14'));
          for (let i = 0; i < 6; i++) parts.push(B(5, 0.18, 0.18, mx + jib * 0.7, ylow - 14.7 - i * 0.2, mz + (i - 2.5) * 0.18, '#d8b13a'));
          blink.push({ x: mx, y: yt + 8, z: mz, ph: 0.5 });
          root.add(mesh(merge(parts), M.vcol()));
        }

        // Saml og byg meshes: facader, tage, tagpynt
        const wallGeo = (list) => {
          const pos = [], nor = [], uv = [];
          for (const [x0, z0, x1, z1, y0, y1, tile, uo, L] of list) {
            const ex = (x1 - x0) / L, ez = (z1 - z0) / L, nx = ez, nz = -ex;
            const V = [[x0, y0, z0, 0, y0], [x1, y0, z1, L, y0], [x1, y1, z1, L, y1], [x0, y1, z0, 0, y1]];
            for (const i of [0, 2, 1, 0, 3, 2]) {
              const v = V[i]; pos.push(v[0], v[1], v[2]); nor.push(nx, 0, nz); uv.push(v[3] / tile + uo, 1 + (v[4] - y1) / tile);
            }
          }
          const g = new THREE.BufferGeometry();
          g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
          g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
          g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
          return tr(g);
        };
        for (const kd of ['glass', 'office', 'brick']) if (walls[kd].length) root.add(mesh(wallGeo(walls[kd]), FAC[kd]()[0]));
        const rp = [];
        for (const [x, z, w, d, y] of roofs) rp.push({ g: new THREE.PlaneGeometry(w, d).rotateX(-PI / 2).translate(x, y + 0.02, z) });
        if (rp.length) {
          const g = merge(rp), pos = g.attributes.position, uv = g.attributes.uv;
          for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / 3, pos.getZ(i) / 3);
          root.add(mesh(g, M.tar()));
        }
        for (const [x, z, w, d, y] of lawns) {
          const g = tr(new THREE.PlaneGeometry(w, d).rotateX(-PI / 2).translate(x, y, z)), uv = g.attributes.uv;
          for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / 4, uv.getY(i) * d / 4);
          root.add(mesh(g, std('lawn', { map: T.lawn(), roughness: 0.95 }), true));
        }
        for (const [x, y, z, s] of roofs.pad || []) { // helipad-dekal på fjerne tage
          const m = mesh(tr(new THREE.PlaneGeometry(s, s).rotateX(-PI / 2)), std('hp', { map: T.helipad(), transparent: true, depthWrite: false, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), true);
          m.position.set(x, y + 0.02, z); root.add(m);
        }
        if (clutter.length) root.add(mesh(merge(clutter), M.vcol()));

        // Stilladsmaster under stængerne og skinner til vinduesliften
        const masts = [];
        for (const b of data.bars) {
          if (b.swing || b.move) continue;
          const pl = plats[b.after], hd = pl ? pl.heading : 0, f = ctx.fwdVec(hd);
          const along = Math.abs(b.dx * f.x + b.dz * f.z) > 0.7, nx = -b.dz, nz = b.dx;
          const e = [-1, 1].map((s) => {
            const x = b.x + (b.dx * b.len * s) / 2, z = b.z + (b.dz * b.len * s) / 2;
            return along ? [x + nx * 0.8, z + nz * 0.8, x, z] : [x + b.dx * s * 0.5, z + b.dz * s * 0.5, x, z];
          });
          const yb = Math.max(ctx.lavaY + 0.2, b.y - 58);
          for (const [x, z, x0, z0] of e) {
            masts.push(Bm(P3(x, yb, z), P3(x, b.y + 0.15, z), 0.05, '#f2bf14', 6), Bm(P3(x0, b.y, z0), P3(x, b.y, z), 0.04, '#f2bf14'));
            masts.push({ g: new THREE.CylinderGeometry(0.075, 0.075, 0.1, 8).translate(x, b.y, z), c: cc('#2b3036') });
          }
          const dd = Math.hypot(e[1][0] - e[0][0], e[1][1] - e[0][1]);
          if (dd < 5.6) for (let y = b.y; y > yb + 1; y -= 3) {
            masts.push(Bm(P3(e[0][0], y, e[0][1]), P3(e[1][0], y - 3, e[1][1]), 0.03, '#f2bf14', 4), Bm(P3(e[1][0], y, e[1][1]), P3(e[0][0], y - 3, e[0][1]), 0.03, '#f2bf14', 4), Bm(P3(e[0][0], y, e[0][1]), P3(e[1][0], y, e[1][1]), 0.03, '#f2bf14', 4));
          }
          else for (let y = b.y - 5; y > yb + 1; y -= 5) for (const [x, z] of e) masts.push(B(0.12, 0.12, 0.12, x, y, z, '#2b3036'));
        }
        for (const p of plats) { // vinduesliftens master
          if (!p.move || Math.abs(p.move.axis[1]) < 0.5) continue;
          const rv = ctx.rightVec(p.yaw), amp = p.move.amp, yt = p.top + amp + 5, yb = Math.max(ctx.lavaY + 0.2, p.top - amp - 60);
          for (const s of [-1, 1]) {
            const x = p.x + rv.x * s * (p.w / 2 + 0.62), z = p.z + rv.z * s * (p.w / 2 + 0.62);
            masts.push(B(0.16, yt - yb, 0.16, x, (yt + yb) / 2, z, '#f2bf14'), B(0.4, 0.4, 0.4, x, yt + 0.2, z, '#2b3036'));
            for (let y = yb; y < yt; y += 1.0) masts.push(B(0.2, 0.05, 0.2, x, y, z, '#2b3036'));
            blink.push({ x, y: yt + 0.7, z, ph: s * 1.3 });
          }
        }
        if (masts.length) root.add(mesh(merge(masts), M.vcol()));

        // Opvindssøjler som damp
        for (const w of data.winds) {
          const m = mesh(tr(new THREE.CylinderGeometry(w.r, w.r * 0.8, w.h, 16, 1, true)), tr(new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide })), true);
          m.position.set(w.x, w.y + w.h / 2, w.z); root.add(m);
        }

        // Blinkende røde lamper (tre faser)
        const sm = [0, 1, 2].map(() => tr(new THREE.SpriteMaterial({ map: ctx.TEX.glow, color: '#ff3a2a', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })));
        const bl = blink; blink = [];
        for (const b of bl) { const s = new THREE.Sprite(sm[Math.floor(b.ph * 3) % 3]); s.position.set(b.x, b.y, b.z); s.scale.set(2.4, 2.4, 1); root.add(s); }
        blink = sm;

        // Dis-lag omkring bygningernes fødder, så skyline falder ud i dis (lavaen kan stadig ses)
        haze = [];
        for (const [y, op, sz] of [[ctx.lavaY + 10, 0.5, 2400], [ctx.lavaY + 26, 0.3, 2000]]) {
          const mt = tr(new THREE.MeshBasicMaterial({ map: ctx.TEX.glow, color: '#d0e5f6', transparent: true, opacity: op, depthWrite: false, fog: false }));
          const m = mesh(tr(new THREE.PlaneGeometry(sz, sz).rotateX(-PI / 2)), mt, true);
          m.position.set(bd.cx, y, bd.cz); m.renderOrder = -1; root.add(m);
        }

        // Flyvemaskine-stribe høj oppe og ende på bane 3's candyskyer fjernt i horisonten
        const cm = tr(new THREE.MeshBasicMaterial({ map: ctx.TEX.glow, color: '#ffffff', transparent: true, opacity: 0.6, depthWrite: false, fog: false }));
        const trail = mesh(tr(new THREE.PlaneGeometry(1400, 14)), cm, true);
        trail.position.set(bd.cx - 300, 520, bd.cz - 900); trail.rotation.set(0.2, 0.5, 0); trail.lookAt(bd.cx, 380, bd.cz); trail.rotateZ(0.1);
        const tr2 = mesh(tr(new THREE.PlaneGeometry(900, 5)), cm, true); tr2.position.copy(trail.position); tr2.quaternion.copy(trail.quaternion); tr2.translateY(5); tr2.translateZ(1);
        root.add(trail, tr2);
        const last = plats[plats.length - 1], fw = ctx.fwdVec(last.heading);
        for (let i = 0; i < 9; i++) {
          const sp = new THREE.Sprite(tr(new THREE.SpriteMaterial({ map: ctx.TEX.clouds[i % 3], color: i % 2 ? '#ffc2e6' : '#bff2e2', transparent: true, depthWrite: false, fog: false, opacity: 0.5 })));
          const d = 1150 + R() * 250, side = (R() - 0.5) * 700;
          sp.position.set(last.x + fw.x * d - fw.z * side, 160 + R() * 150, last.z + fw.z * d + fw.x * side);
          sp.scale.set(360 + R() * 260, 200 + R() * 120, 1); root.add(sp);
        }
        return root;
      };

      return {
        ventColor: '#eef6ff',
        platform, bar, zip, anchor, spinArm, decor,
        update(dt, t) {
          for (const b of belts) { const s = b.p.belt / 2; if (b.p.beltAx === 'x') b.tex.offset.x -= dt * s; else b.tex.offset.y -= dt * s; }
          for (let i = 0; i < blink.length; i++) blink[i].opacity = 0.15 + 0.85 * Math.pow(Math.max(0, Math.sin(t * 2.4 + i * 2.1)), 3);
        },
      };
    },
  };
})();
