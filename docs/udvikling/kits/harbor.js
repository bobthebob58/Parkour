/* =====================================================================
   VERDENSSÆT 'harbor' – Luftskibshavnen (bane 5)
   Solrig havn i skyerne: hvide moler med blå kanter, kurve under
   balloner, zeppelin-gondoler, fragtkasser i kranwirer, fortøjnings-
   master, luftskibe, et fyrtårn, måger og vimpler.
   ===================================================================== */
(function () {
  'use strict';

  window.SKYHOJ_THEMES.harbor = {
    top: '#2f7fe0', horizon: '#bfe4ff', bottom: '#e6d4b8', sunElev: 48, sunAz: 25, sunColor: '#fff6e4', sunInt: 3.3,
    hemiSky: '#cfe6ff', hemiInt: 1.0, fog: '#cde6fa', fogNear: 120, fogFar: 760, cloud: '#ffffff', clouds: 1, stars: 0,
    stone: '#e8e0d4', exposure: 1.0, lavaGlow: 0.75,
  };

  window.SKYHOJ_KITS.harbor = {
    id: 'harbor',
    name: 'Luftskibshavnen',
    variants: {
      pier: 'Hvid mole: lyse planker, blå kant og pæle ned i skyerne (standard for p). Kasse w 3-10, d 3-20',
      basket: 'Flettet ballonkurv med en ballon højt over (standard for bevægelige op/ned). Kasse/cyl w 2.5-4',
      gondola: 'Zeppelin-gondol: hvidt dæk med messinglister og en luftskibsballon over (standard for bevægelige sidelæns). Kasse w 3-6',
      crate: 'Fragtkasse af træ med jernbeslag og krankrog (standard for swing). Kasse w 2-4',
      mast: 'Fortøjningsmast: rund rødhvid top på en gittermast (standard for rot/cyl). shape:"cyl" w 3-6',
      lighthouse: 'Fyrtårnets top: rødhvid ring med lanterne (standard for finish). w 6-12',
      dock: 'Havnekaj med bolsjestribede fortøjningspullerter (standard for start). w 8-12',
    },
    barVariants: 'Stænger er messing-fortøjningsrør (bevægelige stænger har et lille luftskib over sig). Svævebaner er fragtkabler med en blok. Krogpunkter er messingringe på bøjer.',
    create(ctx) {
      const { THREE } = ctx;
      const L = window.SKYHOJ_KITLIB(ctx);
      const PI = Math.PI, TAU = L.TAU, tr = L.tr;
      const rng = ctx.mulberry32(500 + ctx.levelIndex);
      const anim = { flags: [], blimps: [], gulls: null };

      const deck = L.tex(256, (g, S) => {
        for (let x = 0; x < S; x += 28) { g.fillStyle = ['#efe6d6', '#e6dccb', '#f4ede0'][(x / 28) % 3]; g.fillRect(x, 0, 28, S); g.fillStyle = '#b8ac98'; g.fillRect(x, 0, 2, S); }
        g.fillStyle = '#8a7a66'; for (let y = 16; y < S; y += 64) for (let x = 12; x < S; x += 28) g.fillRect(x, y, 3, 3);
      });
      const blueSide = L.tex(128, (g, S) => { L.fill(g, S, S, '#f2f0ea'); g.fillStyle = '#2a6ac8'; g.fillRect(0, 0, S, 26); g.fillStyle = '#1c4a90'; g.fillRect(0, 26, S, 4); });
      const wicker = L.tex(128, (g, S) => {
        L.fill(g, S, S, '#b8864a');
        for (let y = 0; y < S; y += 8) for (let x = (y / 8) % 2 ? 0 : 8; x < S; x += 16) { g.fillStyle = '#d8a866'; g.fillRect(x, y, 12, 6); g.fillStyle = '#8a5a2a'; g.fillRect(x, y + 6, 12, 2); }
      });
      const crateTex = L.tex(128, (g, S) => {
        L.fill(g, S, S, '#a8784a'); g.fillStyle = '#8a5a30';
        for (let y = 0; y < S; y += 21) g.fillRect(0, y, S, 2);
        g.strokeStyle = '#6a4424'; g.lineWidth = 10; g.strokeRect(4, 4, S - 8, S - 8);
        g.beginPath(); g.moveTo(8, 8); g.lineTo(S - 8, S - 8); g.stroke();
      });
      const stripes = L.tex(128, (g, S) => { for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#ffffff' : '#d8342a'; g.fillRect(0, i * S / 8, S, S / 8); } });
      const crack = L.tex(256, (g, S) => {
        for (let x = 0; x < S; x += 28) { g.fillStyle = ['#c8b8a0', '#bcaa90'][(x / 28) % 2]; g.fillRect(x, 0, 28, S); }
        L.cracks(g, S, S, '#5a4a38', 14, rng, 3);
      });
      const M = {
        deck: L.std({ map: deck, roughness: 0.7 }),
        side: L.std({ map: blueSide, roughness: 0.6 }),
        white: L.std({ color: '#f4f2ee', roughness: 0.5 }),
        wicker: L.std({ map: wicker, bumpMap: wicker, bumpScale: 1.5, roughness: 0.85 }),
        crate: L.std({ map: crateTex, roughness: 0.8 }),
        stripes: L.std({ map: stripes, roughness: 0.5 }),
        brass: L.std({ color: '#d8a845', roughness: 0.25, metalness: 0.9 }),
        iron: L.std({ color: '#4a4e58', roughness: 0.45, metalness: 0.8 }),
        rope: L.std({ color: '#c8a46a', roughness: 0.85 }),
        canvas: L.std({ color: '#f2ece0', roughness: 0.75 }),
        red: L.std({ color: '#d8342a', roughness: 0.5 }),
        blue: L.std({ color: '#2a6ac8', roughness: 0.5 }),
        cracked: L.std({ map: crack, roughness: 0.85 }),
        lamp: L.std({ color: '#fff4c8', emissive: '#ffe08a', emissiveIntensity: 2 }),
        balloon: [L.std({ color: '#ffcc33', roughness: 0.6 }), L.std({ color: '#ff6a4a', roughness: 0.6 }), L.std({ color: '#4ac0ff', roughness: 0.6 }), L.std({ color: '#7ad06a', roughness: 0.6 })],
        bounce: L.std({ color: '#ff8a3a', roughness: 0.5, emissive: '#ff5a10', emissiveIntensity: 0.15 }),
      };
      const variantOf = (p) => p.v || (p.type === 'start' ? 'dock' : p.type === 'finish' ? 'lighthouse' : p.type === 'crumble' ? 'old'
        : p.swing ? 'crate' : p.type === 'rot' || p.type === 'spin' ? 'mast' : p.move ? (p.move.axis[1] > 0.9 ? 'basket' : 'gondola') : 'pier');

      // En lille zeppeliner (brugt over gondoler, bevægelige stænger og i kulissen)
      const blimp = (len, mat) => {
        const g = new THREE.Group();
        const body = new THREE.Mesh(tr(new THREE.SphereGeometry(1, 24, 14)), mat);
        body.scale.set(len * 0.5, len * 0.16, len * 0.16); g.add(body);
        for (let k = 0; k < 4; k++) {
          const fin = new THREE.Mesh(tr(new THREE.BoxGeometry(len * 0.12, len * 0.14, 0.08)), M.red);
          fin.position.x = -len * 0.42; fin.rotation.x = k * PI / 2; fin.translateY(len * 0.1); g.add(fin);
        }
        return g;
      };

      return {
        ventColor: '#ffffff',
        platform(p) {
          const g = new THREE.Group();
          const v = variantOf(p), minD = Math.min(p.w, p.d);
          if (v === 'basket') {
            g.add(L.block(p, { top: M.wicker, side: M.wicker }, 1.5));
            const bal = new THREE.Mesh(tr(new THREE.SphereGeometry(minD * 0.9, 20, 14)), M.balloon[p.index % 4]);
            bal.position.y = p.h / 2 + 3.2 + minD * 0.9; bal.scale.y = 1.2; bal.userData.noCastShadow = true;
            g.add(bal);
            for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { // reb op til ballonen (ved hjørnerne, uden for gangarealet)
              const r = L.tube([new THREE.Vector3(sx * p.w * 0.48, p.h / 2, sz * (p.shape === 'cyl' ? p.w : p.d) * 0.48), new THREE.Vector3(sx * minD * 0.4, p.h / 2 + 3.4, sz * minD * 0.4)], 0.02, M.rope, 2);
              g.add(r);
            }
          } else if (v === 'gondola') {
            g.add(L.block(p, { top: M.deck, side: M.white }, 2));
            const z = blimp(Math.max(p.w, p.d) * 2.2, M.canvas);
            z.position.y = p.h / 2 + 5 + p.w * 0.35; z.rotation.y = PI / 2;
            g.add(z);
            const keel = L.under(p, M.brass, 0.8, { tip: 0.6 }); if (keel) g.add(keel);
          } else if (v === 'crate') {
            g.add(L.block(p, { top: M.crate, side: M.crate }, minD, { tileTop: false }));
            const hook = new THREE.Mesh(tr(new THREE.TorusGeometry(0.25, 0.06, 8, 16, PI * 1.4)), M.iron);
            hook.position.y = -p.h / 2 - 0.3; g.add(hook);
          } else if (v === 'mast') {
            g.add(L.block(p, { top: M.deck, side: M.stripes }, 2, { sideTile: p.h }));
            const lat = L.pillar(p, M.iron, 18, p.w * 0.38, 2); if (lat) g.add(lat);
          } else if (v === 'lighthouse') {
            g.add(L.block(p, { top: M.deck, side: M.stripes }, 3, { sideTile: p.h }));
            const tower = L.pillar(p, M.stripes, 30, minD * 0.15, 6); if (tower) g.add(tower);
          } else if (v === 'old') { // smuldrende: gamle, revnede planker
            g.add(L.block(p, { top: M.cracked, side: M.cracked }, 2));
          } else if (p.type === 'bounce') {
            g.add(L.block(p, { top: M.bounce, side: M.blue }, 2));
          } else { // mole/kaj
            g.add(L.block(p, { top: M.deck, side: M.side }, 2, { sideTile: Math.max(1, p.h) }));
            const dep = L.depth(p, 14);
            if (dep > 1) { // pæle ned i skyerne
              const legs = [];
              const nx = Math.max(2, Math.round(p.w / 3)), nz = Math.max(2, Math.round((p.shape === 'cyl' ? p.w : p.d) / 3));
              for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) {
                const x = (i / (nx - 1) - 0.5) * p.w * 0.85, z = (k / (nz - 1) - 0.5) * (p.shape === 'cyl' ? p.w : p.d) * 0.85;
                if (p.shape === 'cyl' && Math.hypot(x, z) > p.w * 0.45) continue;
                legs.push({ x, y: -p.h / 2 - dep / 2, z, sx: 1, sy: dep, sz: 1 });
              }
              g.add(L.instanced(new THREE.CylinderGeometry(0.16, 0.16, 1, 8), M.white, legs, true));
            }
          }
          if (p.type === 'conveyor') g.children[0].material = [M.side, M.side, L.std({ map: L.beltTex('#3a3e46', '#4a4e58', '#ffcc33'), roughness: 0.8 }), M.side, M.side, M.side];
          if (p.type === 'vent') g.children[0].material = [M.side, M.side, L.std({ map: L.grateTex('#2a2e36', '#c8ccd8'), roughness: 0.5, metalness: 0.6 }), M.side, M.side, M.side];
          return g;
        },
        bar(b) {
          const g = new THREE.Group();
          g.add(L.barMesh(b, M.brass));
          if (b.move) { const z = blimp(Math.max(6, b.len * 1.6), M.canvas); z.position.y = 3.2; g.add(z); }
          return g;
        },
        anchor() {
          const g = new THREE.Group();
          const buoy = new THREE.Mesh(tr(new THREE.SphereGeometry(0.3, 16, 12)), M.red);
          const band = new THREE.Mesh(tr(new THREE.TorusGeometry(0.3, 0.06, 8, 20)), M.white);
          band.rotation.x = PI / 2;
          g.add(buoy, band);
          return g;
        },
        zip(z) {
          const g = new THREE.Group();
          const a = new THREE.Vector3(z.ax, z.ay, z.az), b = new THREE.Vector3(z.bx, z.by, z.bz);
          g.add(L.tube([a, b], 0.04, M.iron, 8));
          for (const p of [a, b]) {
            const post = new THREE.Mesh(tr(new THREE.CylinderGeometry(0.15, 0.2, 4.4, 8)), M.stripes);
            post.position.set(p.x, p.y - 1.9, p.z); g.add(post);
          }
          return g;
        },
        decor(data) {
          const root = new THREE.Group();
          const b = data.bounds, R0 = b.radius + 50;
          const cols = [M.canvas, M.balloon[0], M.balloon[2], M.red];
          L.place(data, rng, 12, R0, R0 + 260, b.minY, b.maxY + 40, 25, (x, y, z, a, i) => { // luftskibe i trafik
            const len = 30 + rng() * 50, s = blimp(len, cols[i % cols.length]);
            s.position.set(x, y, z); s.rotation.y = rng() * TAU;
            root.add(s); anim.blimps.push({ m: s, sp: 2 + rng() * 3, a });
          });
          L.place(data, rng, 18, R0, R0 + 200, b.minY - 10, b.maxY + 20, 15, (x, y, z, a, i) => { // varmluftballoner
            const bal = new THREE.Mesh(tr(new THREE.SphereGeometry(4 + rng() * 3, 16, 12)), M.balloon[i % 4]);
            bal.position.set(x, y, z); bal.scale.y = 1.25;
            const bk = new THREE.Mesh(tr(new THREE.BoxGeometry(2, 1.6, 2)), M.wicker); bk.position.y = -7.5;
            bal.add(bk); root.add(bal);
          });
          // Fyrtårnet og havnebygninger på en stor ø bag målet
          const fin = data.plats[data.plats.length - 1];
          const dir = Math.atan2(fin.z - b.cz, fin.x - b.cx);
          const ix = b.cx + Math.cos(dir) * (R0 + 120), iz = b.cz + Math.sin(dir) * (R0 + 120);
          const isle = L.lathe([[0.01, -60], [40, -20], [60, 0], [62, 2], [0.01, 2]], L.std({ color: '#7aa860', roughness: 0.95 }), 32);
          isle.position.set(ix, b.minY - 12, iz); root.add(isle);
          const lh = L.lathe([[6, 0], [4.5, 40], [5.5, 41], [5.5, 44], [3.5, 44]], M.stripes, 24);
          lh.position.set(ix, b.minY - 10, iz); root.add(lh);
          const lamp = new THREE.Mesh(tr(new THREE.SphereGeometry(3.2, 16, 12)), M.lamp); lamp.position.set(ix, b.minY + 37, iz); root.add(lamp);
          for (let i = 0; i < 6; i++) {
            const h = new THREE.Mesh(tr(new THREE.BoxGeometry(10, 8 + rng() * 6, 8)), i % 2 ? M.white : M.balloon[i % 4]);
            h.position.set(ix + Math.cos(i) * 30, b.minY - 6, iz + Math.sin(i) * 30); root.add(h);
          }
          // Måger
          const pos = [];
          for (let i = 0; i < 60; i++) pos.push(b.cx + (rng() - 0.5) * b.radius * 2, b.maxY + 10 + rng() * 30, b.cz + (rng() - 0.5) * b.radius * 2);
          anim.gulls = L.points(pos, '#ffffff', 4, 1);
          root.add(anim.gulls);
          return root;
        },
        update(dt, t) {
          for (const s of anim.blimps) { s.m.position.x += Math.cos(s.a + PI / 2) * s.sp * dt; s.m.position.z += Math.sin(s.a + PI / 2) * s.sp * dt; s.m.rotation.y = -(s.a + PI / 2); }
          if (anim.gulls) { anim.gulls.rotation.y = t * 0.02; anim.gulls.position.y = Math.sin(t * 0.5) * 2; }
        },
      };
    },
  };
})();
