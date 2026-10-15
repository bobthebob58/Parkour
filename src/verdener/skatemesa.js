/* =====================================================================
   VERDENSSÆT 'skatemesa' – Solbanen (bane 6, skateboardbanen)
   En motorvej i himlen hen over ørkenens mesaer: glatte betondæk med
   malede striber og kantsten, krydsfinér-kickers, gelændere og autoværn
   til grinds, lysende boostpuder med chevroner, kaktusser, klippebuer,
   graffiti, en campingvogn, et neonskilt og en enorm lav sol.
   ===================================================================== */
(function () {
  'use strict';

  window.SKYHOJ_THEMES.skatemesa = {
    top: '#3a6ac0', horizon: '#ffc890', bottom: '#e09060', sunElev: 9, sunAz: 0, sunColor: '#ffc078', sunInt: 3.2,
    hemiSky: '#ffd8b0', hemiInt: 0.95, fog: '#f0b888', fogNear: 120, fogFar: 820, cloud: '#ffe0c8', clouds: 0.45, stars: 0,
    stone: '#e0b890', exposure: 1.05, lavaGlow: 0.95,
  };

  window.SKYHOJ_KITS.skatemesa = {
    id: 'skatemesa',
    name: 'Solbanen',
    variants: {
      road: 'Betonvej med gul midterstribe og hvide kanter på en sandstensmesa (standard for p). Kasse w 5-12, d 6-40',
      plaza: 'Skateplaza af glat beton med graffiti-felter (standard for start/finish). w 8-16',
      bowl: 'Betonbowl-kant: lyseblå malet beton med metalkant (coping). Kasse/cyl w 6-14',
      stairs: 'Trappesæt-top: beton med trinkanter malet gule. Kasse w 4-8',
      mesa: 'Rå sandstenstop med lag (brug sparsomt mellem vejstykker). Kasse/cyl w 4-12',
    },
    barVariants: 'Rails (type rail) er stålrør på stolper (gelænder) eller autoværn; kickers (ramp) er krydsfinér med metalkant; boost-puder har lysende chevroner.',
    create(ctx) {
      const { THREE } = ctx;
      const L = window.SKYHOJ_KITLIB(ctx);
      const PI = Math.PI, TAU = L.TAU, tr = L.tr;
      const rng = ctx.mulberry32(600 + ctx.levelIndex);
      const anim = { boosts: [], signs: [] };

      const concrete = L.tex(256, (g, S) => { L.fill(g, S, S, '#c8c2b8'); L.speckle(g, S, S, ['#b8b2a8', '#d8d2c8', '#a8a298'], 1400, 1, 2, rng); g.strokeStyle = 'rgba(90,80,70,0.35)'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, S - 1); g.lineTo(S, S - 1); g.stroke(); });
      const road = L.tex(256, (g, S) => {
        L.fill(g, S, S, '#4a4a50'); L.speckle(g, S, S, ['#5a5a60', '#3a3a40', '#6a6a70'], 1800, 1, 2, rng);
        g.fillStyle = '#ffd23a'; g.fillRect(S / 2 - 6, 0, 12, S * 0.55);
        g.fillStyle = '#f4f4f0'; g.fillRect(10, 0, 8, S); g.fillRect(S - 18, 0, 8, S);
      }, { repeat: true });
      const sandstone = L.tex(256, (g, S) => {
        for (let y = 0; y < S; y += 6 + Math.floor(rng() * 10)) { g.fillStyle = ['#c8683a', '#d87a48', '#b85a30', '#e08a58', '#a84a28'][Math.floor(rng() * 5)]; g.fillRect(0, y, S, 16); }
        L.speckle(g, S, S, ['#f0a070', '#8a3a20'], 500, 1, 3, rng);
      });
      const plywood = L.tex(256, (g, S) => {
        L.fill(g, S, S, '#d8b078'); g.globalAlpha = 0.35;
        for (let i = 0; i < 40; i++) { g.strokeStyle = '#a87a48'; g.lineWidth = 2; g.beginPath(); g.ellipse(rng() * S, rng() * S, 40 + rng() * 60, 6 + rng() * 10, 0, 0, TAU); g.stroke(); }
        g.globalAlpha = 1; g.fillStyle = '#6a5040'; for (let y = 0; y < S; y += 128) g.fillRect(0, y, S, 3);
      });
      const chevron = L.tex(256, (g, S) => {
        L.fill(g, S, S, '#1a1a24');
        g.fillStyle = '#3affea';
        for (const y0 of [20, 100, 180]) { g.beginPath(); g.moveTo(S / 2, y0); g.lineTo(S * 0.9, y0 + 50); g.lineTo(S * 0.7, y0 + 50); g.lineTo(S / 2, y0 + 22); g.lineTo(S * 0.3, y0 + 50); g.lineTo(S * 0.1, y0 + 50); g.closePath(); g.fill(); }
      });
      const graffiti = L.tex(512, (g, S) => {
        L.fill(g, S, S, '#c8c2b8'); L.speckle(g, S, S, ['#b8b2a8', '#d8d2c8'], 2000, 1, 2, rng);
        const cols = ['#ff3a8a', '#3ac8ff', '#ffd23a', '#7a3aff', '#3aff8a'];
        for (let i = 0; i < 6; i++) { g.fillStyle = cols[i % 5]; g.globalAlpha = 0.85; g.font = `bold ${60 + rng() * 60}px sans-serif`; g.save(); g.translate(rng() * S * 0.7, 80 + rng() * S * 0.8); g.rotate((rng() - 0.5) * 0.6); g.fillText(['RUL!', 'SOL', 'OLLIE', 'GRIND', 'SKYHØJ', 'KICK'][i], 0, 0); g.restore(); }
        g.globalAlpha = 1;
      });
      const bowlTex = L.tex(256, (g, S) => { L.fill(g, S, S, '#8ac8e8'); L.speckle(g, S, S, ['#7ab8d8', '#9ad8f8'], 900, 1, 2, rng); });
      const stairsTex = L.tex(256, (g, S) => { L.fill(g, S, S, '#c8c2b8'); g.fillStyle = '#ffd23a'; for (let y = 0; y < S; y += 64) g.fillRect(0, y, S, 10); });
      const M = {
        road: L.std({ map: road, roughness: 0.75 }),
        concrete: L.std({ map: concrete, roughness: 0.8 }),
        graffiti: L.std({ map: graffiti, roughness: 0.8 }),
        sandstone: L.std({ map: sandstone, bumpMap: sandstone, bumpScale: 1.5, roughness: 0.95 }),
        plywood: L.std({ map: plywood, roughness: 0.7 }),
        chevron: L.std({ map: chevron, roughness: 0.4, emissive: '#3affea', emissiveMap: chevron, emissiveIntensity: 1.6 }),
        bowl: L.std({ map: bowlTex, roughness: 0.6 }),
        stairs: L.std({ map: stairsTex, roughness: 0.8 }),
        steel: L.std({ color: '#c8ccd4', roughness: 0.2, metalness: 1 }),
        rail: L.std({ color: '#d8dce4', roughness: 0.15, metalness: 1 }),
        guard: L.std({ color: '#a8acb4', roughness: 0.35, metalness: 0.9 }),
        cactus: L.std({ color: '#4a8a3a', roughness: 0.8 }),
        van: L.std({ color: '#e8e0c8', roughness: 0.5 }),
        vanStripe: L.std({ color: '#e86a3a', roughness: 0.5 }),
        neon: L.std({ color: '#ff3a8a', emissive: '#ff3a8a', emissiveIntensity: 2.6 }),
        sun: tr(new THREE.MeshBasicMaterial({ color: '#ffd890', fog: false, transparent: true, opacity: 0.95 })),
        crack: L.std({ map: L.tex(256, (g, S) => { L.fill(g, S, S, '#b8b2a8'); L.cracks(g, S, S, '#4a4440', 18, rng, 3); }), roughness: 0.85 }),
      };
      const variantOf = (p) => p.v || (p.type === 'start' || p.type === 'finish' ? 'plaza' : p.type === 'crumble' ? 'crack' : 'road');

      return {
        ventColor: '#ffffff',
        platform(p) {
          const g = new THREE.Group();
          const v = variantOf(p), minD = Math.min(p.w, p.d);
          if (p.type === 'ramp') { // krydsfinér-kicker med metalkant og stivere under
            g.add(L.block(p, { top: M.plywood, side: M.plywood }, 2));
            const lip = new THREE.Mesh(tr(new THREE.CylinderGeometry(0.06, 0.06, p.w, 8).rotateZ(PI / 2)), M.steel);
            lip.position.set(0, p.h / 2, -p.slopeLen / 2); g.add(lip);
            return g;
          }
          if (p.type === 'rail') { // gelænder på stolper
            g.add(L.block(p, { top: M.rail, side: M.rail }, 1));
            const n = Math.max(2, Math.round(p.d / 3));
            for (let i = 0; i <= n; i++) {
              const post = new THREE.Mesh(tr(new THREE.CylinderGeometry(0.04, 0.05, 1.4, 8)), M.guard);
              post.position.set(0, -0.75, -p.d / 2 + i * p.d / n); g.add(post);
            }
            return g;
          }
          if (p.type === 'boost') {
            g.add(L.block(p, { top: M.chevron, side: M.steel }, p.w, { tileTop: false }));
            anim.boosts.push(g);
            const u = L.pillar(p, M.sandstone, 20, 0.1, 4); if (u) g.add(u);
            return g;
          }
          const top = v === 'plaza' ? M.graffiti : v === 'bowl' ? M.bowl : v === 'stairs' ? M.stairs : v === 'mesa' ? M.sandstone : v === 'crack' ? M.crack : M.road;
          const tile = v === 'road' ? p.w : v === 'plaza' ? 8 : 3;
          g.add(L.block(p, { top, side: M.concrete }, tile, { sideTile: Math.max(1, p.h) }));
          if (v === 'bowl') { const cop = new THREE.Mesh(tr(p.shape === 'cyl' ? new THREE.TorusGeometry(p.w / 2, 0.07, 6, 32).rotateX(PI / 2) : new THREE.BoxGeometry(p.w + 0.1, 0.12, p.d + 0.1)), M.steel); cop.position.y = p.h / 2 - 0.1; g.add(cop); }
          // sandstensmesa under vejen (lagdelt klippe)
          const mesa = L.pillar(p, M.sandstone, 60, 0, 6);
          if (mesa) g.add(mesa);
          return g;
        },
        bar(b) { return L.barMesh(b, M.rail); },
        decor(data) {
          const root = new THREE.Group();
          const b = data.bounds, R0 = b.radius * 0.2 + 30;
          // Den enorme lave sol ret frem
          const sun = new THREE.Mesh(tr(new THREE.CircleGeometry(160, 48)), M.sun);
          const last = data.plats[data.plats.length - 1], first = data.plats[0];
          const dx = last.x - first.x, dz = last.z - first.z, dl = Math.hypot(dx, dz) || 1;
          sun.position.set(last.x + dx / dl * 1500, b.maxY + 60, last.z + dz / dl * 1500);
          sun.lookAt(first.x, b.maxY, first.z); root.add(sun);
          // Mesaer, klippesøjler og buer langs ruten
          const buttes = [];
          L.place(data, rng, 70, R0, b.radius + 320, ctx.lavaY, ctx.lavaY, 18, (x, y, z) => {
            // nær banen holdes toppen under vejen (så den ikke spærrer for udsigten); langt væk må de rage op
            const far = ctx.clearOfCourse(x, b.maxY, z, 70);
            const r = 10 + rng() * 30;
            const top = far ? b.maxY - 10 + rng() * 60 : b.minY - 6 - rng() * 20;
            const h = top - ctx.lavaY;
            buttes.push({ x, y: y + h / 2, z, sx: r, sy: h, sz: r * (0.6 + rng() * 0.8), ry: rng() * TAU });
          });
          root.add(L.instanced(new THREE.CylinderGeometry(0.85, 1, 1, 7), M.sandstone, buttes));
          L.place(data, rng, 5, R0 + 60, b.radius + 260, b.minY - 20, b.minY - 20, 30, (x, y, z, a) => {
            const arch = new THREE.Mesh(tr(new THREE.TorusGeometry(30, 7, 8, 24, PI)), M.sandstone);
            arch.position.set(x, y, z); arch.rotation.y = a; root.add(arch);
          });
          // Kaktusser og en campingvogn på mesatoppe ved siden af vejen
          const cact = [];
          L.place(data, rng, 60, 8, b.radius + 80, b.minY - 2, b.maxY, 6, (x, y, z) => cact.push({ x, y, z, sx: 0.5, sy: 3 + rng() * 3, sz: 0.5 }));
          root.add(L.instanced(new THREE.CylinderGeometry(1, 1, 1, 8), M.cactus, cact));
          L.place(data, rng, 1, 30, b.radius, b.minY, b.minY + 10, 12, (x, y, z) => {
            const van = new THREE.Group(); van.position.set(x, y, z);
            const body = new THREE.Mesh(tr(new THREE.BoxGeometry(3, 2.6, 6.5)), M.van); body.position.y = 1.6; van.add(body);
            const stripe = new THREE.Mesh(tr(new THREE.BoxGeometry(3.05, 0.4, 6.55)), M.vanStripe); stripe.position.y = 1.4; van.add(stripe);
            root.add(van);
          });
          // Neonskiltet "RUL!" på en mast
          L.place(data, rng, 2, 20, b.radius, b.maxY - 5, b.maxY + 5, 10, (x, y, z) => {
            const sign = new THREE.Group(); sign.position.set(x, y, z); sign.lookAt(b.cx, y, b.cz);
            const pole = new THREE.Mesh(tr(new THREE.CylinderGeometry(0.3, 0.3, 30, 8)), M.guard); pole.position.y = -15; sign.add(pole);
            const tex = L.tex(256, (g, S) => { L.fill(g, S, S, '#140a20'); g.fillStyle = '#ff3a8a'; g.font = 'bold 110px sans-serif'; g.fillText('RUL!', 12, 165); }, { repeat: false, h: 256 });
            const board = new THREE.Mesh(tr(new THREE.PlaneGeometry(10, 10)), L.std({ map: tex, emissive: '#ff3a8a', emissiveMap: tex, emissiveIntensity: 2 }));
            board.position.y = 4; sign.add(board); root.add(sign); anim.signs.push(board);
          });
          return root;
        },
        update(dt, t) {
          M.chevron.map.offset.y = -(t * 1.6) % 1;
          for (const s of anim.signs) s.material.emissiveIntensity = Math.sin(t * 7) > -0.7 ? 2 : 0.4;
        },
      };
    },
  };
})();
