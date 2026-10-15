/* =====================================================================
   VERDENSSÆT 'starfield' – Himlens ende (bane 10)
   Rummets kant: små meteorer med glødende krystalårer, jern-nikkel-
   klumper, kometis og farvede mineraler, en satellit med solpaneler,
   gitterstænger, stjerner som krogpunkter, planeter og en tåge.
   ===================================================================== */
(function () {
  'use strict';

  window.SKYHOJ_THEMES.starfield = {
    top: '#03020c', horizon: '#2a1650', bottom: '#1c0a24', sunElev: 28, sunAz: 35, sunColor: '#d6e0ff', sunInt: 2.4,
    hemiSky: '#8a7ad8', hemiInt: 1.0, fog: '#120a26', fogNear: 140, fogFar: 950, cloud: '#3a2a66', clouds: 0, stars: 1,
    stone: '#9a94b0', exposure: 1.22, lavaGlow: 1.1, moon: false,
  };

  window.SKYHOJ_KITS.starfield = {
    id: 'starfield',
    name: 'Himlens ende',
    variants: {
      crystal: 'Meteor med glødende cyan krystalårer og krystaller under (standard for p). Kasse/cyl w 1-4',
      iron: 'Jern-nikkel-meteor: metallisk, Widmanstätten-mønster i toppen. Kasse/cyl w 1-4',
      comet: 'Kometis: blåhvid, frostet, med en svag hale af støv (standard for bevægelige). w 1-4',
      mineral: 'Farvestribet mineral (lilla/orange lag). Kasse/cyl w 1-4',
      deck: 'Satellittens hviledæk: lyst metal med lysende kanter og solpaneler under (standard for start/finish). w 4-12',
      moon: 'Lille måneklippe: grå-lilla med kratere. shape:"cyl" w 1-3',
    },
    barVariants: 'Stænger er lette rumgitter (rør med skrå afstivere). Krogpunkter er stjerner. Svævebaner er lysende kabler.',
    create(ctx) {
      const { THREE } = ctx;
      const L = window.SKYHOJ_KITLIB(ctx);
      const PI = Math.PI, TAU = L.TAU, tr = L.tr;
      const rng = ctx.mulberry32(1000 + ctx.levelIndex);
      const anim = { spin: [], twinkle: [] };

      const rockTex = (base, spots) => L.tex(256, (g, S) => { L.fill(g, S, S, base); L.speckle(g, S, S, spots, 600, 1, 6, rng); });
      const veins = L.tex(256, (g, S) => { L.fill(g, S, S, '#000'); L.cracks(g, S, S, '#4ff6ff', 10, rng, 4); L.cracks(g, S, S, '#c8fbff', 6, rng, 1.5); });
      const widman = L.tex(256, (g, S) => {
        L.fill(g, S, S, '#6c6a70'); g.lineWidth = 2;
        for (let i = 0; i < 70; i++) {
          const a = [0, PI / 3, -PI / 3][i % 3], x = rng() * S, y = rng() * S, l = 30 + rng() * 80;
          g.strokeStyle = rng() < 0.5 ? '#8f8c94' : '#4c4a50';
          g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
        }
      });
      const bands = L.tex(256, (g, S) => {
        const cols = ['#5b2a7a', '#c45a2a', '#7a3a8a', '#e09040', '#3a1a5a', '#a04a6a'];
        for (let y = 0; y < S; y += 12) { g.fillStyle = cols[Math.floor(rng() * cols.length)]; g.fillRect(0, y, S, 12 + rng() * 10); }
        L.speckle(g, S, S, ['#ffffff', '#000000'], 200, 1, 3, rng);
      });
      const deckTex = L.tex(256, (g, S) => {
        L.fill(g, S, S, '#c8ccd8'); g.strokeStyle = '#8a90a0'; g.lineWidth = 3;
        for (let i = 0; i <= S; i += 64) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, S); g.moveTo(0, i); g.lineTo(S, i); g.stroke(); }
        g.fillStyle = '#5a6070'; for (let i = 32; i < S; i += 64) for (let j = 32; j < S; j += 64) { g.beginPath(); g.arc(i, j, 4, 0, TAU); g.fill(); }
      });
      const panelTex = L.tex(128, (g, S) => {
        L.fill(g, S, S, '#152a6a'); g.strokeStyle = '#7a9ae0'; g.lineWidth = 2;
        for (let i = 0; i <= S; i += 16) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, S); g.moveTo(0, i); g.lineTo(S, i); g.stroke(); }
      });
      const M = {
        crystalTop: L.std({ map: rockTex('#3a3448', ['#4c4460', '#26202f']), roughness: 0.85, emissive: '#3ff0ff', emissiveMap: veins, emissiveIntensity: 1.2 }),
        crystalSide: L.std({ map: rockTex('#2e2a3a', ['#423a52', '#1a1622']), roughness: 0.9, emissive: '#2ad8ff', emissiveMap: veins, emissiveIntensity: 0.8 }),
        ironTop: L.std({ map: widman, roughness: 0.32, metalness: 0.9 }),
        ironSide: L.std({ map: rockTex('#4a4448', ['#6a6266', '#2a2628', '#7a4a30']), roughness: 0.5, metalness: 0.75 }),
        comet: L.phys({ map: rockTex('#d8eaff', ['#ffffff', '#a8c8f0']), roughness: 0.25, clearcoat: 0.6, emissive: '#1a3a6a', emissiveIntensity: 0.25 }),
        mineral: L.std({ map: bands, roughness: 0.6, metalness: 0.15 }),
        moon: L.std({ map: rockTex('#8a8498', ['#6a6478', '#a8a2b8', '#5a5468']), roughness: 0.95 }),
        deck: L.std({ map: deckTex, roughness: 0.4, metalness: 0.6 }),
        deckSide: L.std({ color: '#7a8090', roughness: 0.35, metalness: 0.8, emissive: '#2a6aff', emissiveIntensity: 0.25 }),
        panel: L.std({ map: panelTex, roughness: 0.25, metalness: 0.6, emissive: '#0a1a50', emissiveIntensity: 0.6 }),
        truss: L.std({ color: '#c8ccd6', roughness: 0.3, metalness: 0.9 }),
        crystal: L.phys({ color: '#7ff6ff', roughness: 0.05, transmission: 0.4, thickness: 0.5, emissive: '#2ad0ff', emissiveIntensity: 0.9 }),
        star: L.std({ color: '#fff4c8', emissive: '#ffd860', emissiveIntensity: 2.6, roughness: 0.3 }),
        cable: L.std({ color: '#9fe8ff', emissive: '#4fd8ff', emissiveIntensity: 1.2 }),
        crackGlow: L.std({ map: rockTex('#3a2a2a', ['#2a1a1a', '#4a3030']), roughness: 0.9, emissive: '#ff6a20', emissiveMap: veins, emissiveIntensity: 1.4 }),
      };
      const variantOf = (p) => p.v || (p.type === 'start' || p.type === 'finish' ? 'deck' : p.type === 'crumble' ? 'crumble'
        : p.kin || p.type === 'ice' ? 'comet' : ['crystal', 'iron', 'mineral', 'crystal'][p.index % 4]);
      const looks = {
        crystal: [M.crystalTop, M.crystalSide], iron: [M.ironTop, M.ironSide], comet: [M.comet, M.comet],
        mineral: [M.mineral, M.mineral], deck: [M.deck, M.deckSide], moon: [M.moon, M.moon], crumble: [M.crackGlow, M.crackGlow],
      };

      return {
        ventColor: '#a8f4ff',
        platform(p) {
          const g = new THREE.Group();
          const v = variantOf(p), [top, side] = looks[v] || looks.crystal;
          g.add(L.block(p, { top, side }, 1.5, { segments: v === 'deck' ? 40 : 9 }));
          if (v === 'deck') {
            // solpaneler og antenne under dækket (inden for fodaftrykket)
            const dep = L.depth(p, 4);
            if (dep > 1) {
              const core = L.pillar(p, M.deckSide, dep, Math.min(p.w, p.d) * 0.3);
              if (core) g.add(core);
              const pan = new THREE.Mesh(tr(new THREE.BoxGeometry(p.w * 0.95, 0.06, Math.min(p.d, p.w) * 0.4)), M.panel);
              pan.position.y = -p.h / 2 - dep * 0.6;
              g.add(pan);
            }
          } else {
            // ru meteorklippe under den flade top
            const r = (p.shape === 'cyl' ? p.w : Math.min(p.w, p.d)) * 0.5;
            const dep = L.depth(p, r * 2.4 + 1);
            if (dep > 0.4) {
              const rock = new THREE.Mesh(tr(ctx.rockGeometry(r, dep, p.seed)), side);
              rock.position.y = -p.h / 2 - dep / 2 + 0.02;
              if (p.shape !== 'cyl') rock.scale.set(p.w / (2 * r) * 0.95, 1, p.d / (2 * r) * 0.95);
              g.add(rock);
              if (v === 'crystal') { // krystaller, der stikker ned/ud under kanten
                const n = 3 + Math.floor(p.seed % 3);
                for (let i = 0; i < n; i++) {
                  const c = new THREE.Mesh(tr(new THREE.OctahedronGeometry(0.25 + (p.seed % 7) * 0.04, 0)), M.crystal);
                  const a = i / n * TAU + p.seed;
                  c.position.set(Math.cos(a) * r * 0.45, -p.h / 2 - dep * (0.3 + 0.15 * i / n), Math.sin(a) * r * 0.45);
                  c.scale.set(0.7, 1.8, 0.7);
                  g.add(c);
                }
              }
            }
          }
          if (p.type === 'spin') anim.spin.push(g);
          return g;
        },
        spinArm(p) { // solpanel-arm på satellitten
          const g = new THREE.Group();
          const rod = new THREE.Mesh(tr(new THREE.BoxGeometry(p.bar, 0.12, 0.12)), M.truss);
          g.add(rod);
          for (const sx of [-1, 1]) {
            const pan = new THREE.Mesh(tr(new THREE.BoxGeometry(p.bar * 0.4, 0.05, 0.9)), M.panel);
            pan.position.x = sx * p.bar * 0.28;
            g.add(pan);
          }
          return g;
        },
        bar(b) { // rumgitter
          const g = new THREE.Group();
          g.add(L.barMesh(b, M.truss));
          const n = Math.max(2, Math.round(b.len / 0.6));
          const strut = tr(new THREE.CylinderGeometry(0.018, 0.018, 0.5, 6));
          for (let i = 0; i < n; i++) {
            const s = new THREE.Mesh(strut, M.truss);
            s.position.set(-b.len / 2 + (i + 0.5) * b.len / n, 0.2, 0);
            s.rotation.z = i % 2 ? 0.7 : -0.7;
            g.add(s);
          }
          const top = new THREE.Mesh(tr(new THREE.CylinderGeometry(0.025, 0.025, b.len, 6).rotateZ(PI / 2)), M.truss);
          top.position.y = 0.4;
          g.add(top);
          return g;
        },
        anchor() { // stjerne
          const g = new THREE.Group();
          const s = new THREE.Mesh(tr(new THREE.OctahedronGeometry(0.32, 0)), M.star);
          const s2 = s.clone(); s2.rotation.set(PI / 4, PI / 4, 0); s2.scale.setScalar(0.8);
          g.add(s, s2);
          anim.twinkle.push(g);
          return g;
        },
        zip(z) {
          const a = new THREE.Vector3(z.ax, z.ay, z.az), b = new THREE.Vector3(z.bx, z.by, z.bz);
          return L.tube([a, b], 0.035, M.cable, 8);
        },
        decor(data) {
          const root = new THREE.Group();
          const b = data.bounds, R0 = b.radius + 80;
          // Planeter (ingen tåge – de er langt væk)
          const planet = (r, cols, x, y, z, ring) => {
            const t = L.tex(256, (g, S) => {
              for (let yy = 0; yy < S; yy += 8) { g.fillStyle = cols[Math.floor(rng() * cols.length)]; g.fillRect(0, yy, S, 8 + rng() * 14); }
            });
            const m = new THREE.Mesh(tr(new THREE.SphereGeometry(r, 48, 24)), L.std({ map: t, roughness: 0.9, fog: false, emissive: cols[0], emissiveIntensity: 0.15 }));
            m.material.fog = false;
            m.position.set(x, y, z);
            root.add(m);
            if (ring) {
              const rg = new THREE.Mesh(tr(new THREE.RingGeometry(r * 1.4, r * 2.1, 64)), tr(new THREE.MeshBasicMaterial({ color: ring, transparent: true, opacity: 0.55, side: THREE.DoubleSide, fog: false, depthWrite: false })));
              rg.position.copy(m.position); rg.rotation.set(1.2, 0.3, 0.2);
              root.add(rg);
            }
            anim.spin.push(m);
          };
          planet(180, ['#c46a3a', '#e8a060', '#8a4a2a', '#f2c890'], b.cx + 900, b.maxY + 220, b.cz - 700, '#e8d0a8');
          planet(90, ['#3a6ac8', '#6aa0e8', '#2a3a8a'], b.cx - 700, b.maxY + 160, b.cz + 500, null);
          planet(40, ['#8a8a9a', '#b0b0c0', '#6a6a7a'], b.cx + 300, b.maxY + 90, b.cz + 650, null);
          // Tåge: store, svagt lysende flader
          for (let i = 0; i < 5; i++) {
            const neb = L.tex(256, (g, S) => {
              const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
              gr.addColorStop(0, ['rgba(180,80,255,0.5)', 'rgba(60,160,255,0.45)', 'rgba(255,90,170,0.4)'][i % 3]);
              gr.addColorStop(1, 'rgba(0,0,0,0)');
              g.fillStyle = gr; g.fillRect(0, 0, S, S);
            }, { repeat: false });
            const m = new THREE.Mesh(tr(new THREE.PlaneGeometry(900, 600)), tr(new THREE.MeshBasicMaterial({ map: neb, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending })));
            const a = i / 5 * TAU;
            m.position.set(b.cx + Math.cos(a) * 1500, b.maxY + 100 + i * 60, b.cz + Math.sin(a) * 1500);
            m.lookAt(b.cx, b.maxY, b.cz);
            root.add(m);
          }
          // Asteroider rundt om banen
          const ast = [];
          L.place(data, rng, 90, R0, R0 + 400, b.minY - 60, b.maxY + 60, 15, (x, y, z) => ast.push({ x, y, z, s: 1.5 + rng() * 9, rx: rng() * 3, ry: rng() * 3 }));
          root.add(L.instanced(new THREE.DodecahedronGeometry(1, 0), M.ironSide, ast));
          // Ekstra stjerner tæt på (glimtende)
          const pos = [];
          for (let i = 0; i < 1500; i++) { const a = rng() * TAU, e = (rng() - 0.3) * PI, r = 1600; pos.push(b.cx + Math.cos(a) * Math.cos(e) * r, b.maxY + Math.sin(e) * r, b.cz + Math.sin(a) * Math.cos(e) * r); }
          const stars = L.points(pos, '#ffffff', 1.6, 0.9);
          root.add(stars); anim.twinkle.push(stars);
          return root;
        },
        update(dt, t) {
          for (const s of anim.spin) s.rotation.y += dt * 0.05;
          for (const s of anim.twinkle) if (s.material) s.material.opacity = 0.7 + Math.sin(t * 3) * 0.2; else s.rotation.y = t * 1.2;
        },
      };
    },
  };
})();
