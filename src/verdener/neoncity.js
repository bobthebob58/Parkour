/* =====================================================================
   VERDENSSÆT 'neoncity' – Neonbyen (bane 12)
   Neonby om natten: tagterrasser med neonkanter, flyvende biler og
   busser som bevægelige platforme, rullebånd, tagventiler, neonskilte
   som stænger, el-kabler som svævebaner, droner som krogpunkter,
   hologrammer, regnvåde tage og et hav af oplyste skyskrabere.
   ===================================================================== */
(function () {
  'use strict';

  window.SKYHOJ_THEMES.neoncity = {
    top: '#060414', horizon: '#3a1a5a', bottom: '#2a0a2a', sunElev: 50, sunAz: 160, sunColor: '#b8a8ff', sunInt: 1.6,
    hemiSky: '#7a5ad8', hemiInt: 1.15, fog: '#1e1236', fogNear: 60, fogFar: 520, cloud: '#3a2a5a', clouds: 0.5, stars: 0.4,
    stone: '#a8a0c0', exposure: 1.28, lavaGlow: 1.3,
  };

  window.SKYHOJ_KITS.neoncity = {
    id: 'neoncity',
    name: 'Neonbyen',
    variants: {
      roof: 'Regnvådt tag med neonkant og en oplyst skyskraber under (standard for p). Kasse w 4-12',
      car: 'Flyvende bil: blank karrosseri, forlygter og blå jetglød under (standard for sidelæns bevægelige). Kasse w 2.5-4, d 4-6',
      bus: 'Flyvende bus: lang, gul med oplyste vinduer. Kasse w 3-4, d 8-14',
      billboard: 'Hologram-reklameskilt (standard for finish): toppen er en lysende platform. w 6-12',
      helipad: 'Landingsplads med H og blinkende lys (standard for start og cyl). w 4-12',
      sign: 'Neonskiltets top (standard for smalle platforme). Kasse w 1.5-3',
    },
    barVariants: 'Stænger er neonrør (pink/cyan) i metalrammer. Svævebaner er el-kabler. Krogpunkter er droner med propeller.',
    create(ctx) {
      const { THREE } = ctx;
      const L = window.SKYHOJ_KITLIB(ctx);
      const PI = Math.PI, TAU = L.TAU, tr = L.tr;
      const rng = ctx.mulberry32(1200 + ctx.levelIndex);
      const anim = { drones: [], cars: [], neon: [], holo: [] };
      const NEON = ['#ff3ab8', '#3af6ff', '#ffd23a', '#8a5aff'];

      const roofTex = L.tex(256, (g, S) => {
        L.fill(g, S, S, '#22202c'); L.speckle(g, S, S, ['#2e2c3a', '#16141e', '#3a3848'], 900, 1, 3, rng);
        g.globalAlpha = 0.25; for (let i = 0; i < 12; i++) { g.fillStyle = NEON[i % 4]; g.beginPath(); g.ellipse(rng() * S, rng() * S, 20 + rng() * 30, 6, rng() * PI, 0, TAU); g.fill(); } g.globalAlpha = 1;
      });
      const windows = L.tex(256, (g, S) => {
        L.fill(g, S, S, '#121020');
        for (let y = 6; y < S; y += 16) for (let x = 6; x < S; x += 14) { const r = rng(); g.fillStyle = r < 0.45 ? '#1a1830' : r < 0.75 ? '#ffd890' : r < 0.9 ? '#8ae8ff' : '#ff7ad0'; g.fillRect(x, y, 8, 10); }
      });
      const heli = L.tex(256, (g, S) => {
        L.fill(g, S, S, '#2a2836'); g.strokeStyle = '#ffd23a'; g.lineWidth = 10; g.beginPath(); g.arc(S / 2, S / 2, S * 0.4, 0, TAU); g.stroke();
        g.fillStyle = '#ffd23a'; g.fillRect(S * 0.32, S * 0.3, 18, S * 0.4); g.fillRect(S * 0.6, S * 0.3, 18, S * 0.4); g.fillRect(S * 0.32, S * 0.47, S * 0.36, 16);
      }, { repeat: false });
      const holoTex = L.tex(256, (g, S) => {
        L.grad(g, S, S, [[0, '#3af6ff'], [1, '#ff3ab8']]);
        g.fillStyle = 'rgba(255,255,255,0.5)'; g.font = 'bold 60px sans-serif'; g.fillText('NEON', 40, 150);
        g.fillStyle = 'rgba(0,0,0,0.25)'; for (let y = 0; y < S; y += 6) g.fillRect(0, y, S, 2);
      }, { repeat: false });
      const busTex = L.tex(128, (g, S) => { L.fill(g, S, S, '#ffc83a'); g.fillStyle = '#6ad8ff'; for (let x = 6; x < S; x += 24) g.fillRect(x, 30, 18, 30); g.fillStyle = '#2a2a2a'; g.fillRect(0, 90, S, 8); });
      const crackTex = L.tex(256, (g, S) => { L.fill(g, S, S, '#2a2834'); L.cracks(g, S, S, '#ff3ab8', 10, rng, 3); L.cracks(g, S, S, '#0a0810', 10, rng, 3); });
      const M = {
        roof: L.phys({ map: roofTex, roughness: 0.25, clearcoat: 0.9, clearcoatRoughness: 0.15 }),
        building: L.std({ map: windows, roughness: 0.6, emissive: '#ffffff', emissiveMap: windows, emissiveIntensity: 0.9 }),
        concrete: L.std({ color: '#3a3848', roughness: 0.8 }),
        heli: L.std({ map: heli, roughness: 0.6 }),
        car: [L.phys({ color: '#e83a6a', roughness: 0.2, metalness: 0.6, clearcoat: 1 }), L.phys({ color: '#3a8aff', roughness: 0.2, metalness: 0.6, clearcoat: 1 }), L.phys({ color: '#f2f2f6', roughness: 0.2, metalness: 0.5, clearcoat: 1 })],
        bus: L.std({ map: busTex, roughness: 0.4, emissive: '#3a2a00', emissiveIntensity: 0.3 }),
        jet: L.glow('#3af6ff', 0.85),
        holo: tr(new THREE.MeshBasicMaterial({ map: holoTex, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false })),
        frame: L.std({ color: '#5a5868', roughness: 0.35, metalness: 0.9 }),
        dark: L.std({ color: '#141220', roughness: 0.5, metalness: 0.6 }),
        light: L.std({ color: '#ffffff', emissive: '#fff4d8', emissiveIntensity: 2 }),
        red: L.std({ color: '#ff3a3a', emissive: '#ff2a2a', emissiveIntensity: 2 }),
        cracked: L.std({ map: crackTex, roughness: 0.6, emissive: '#ff3ab8', emissiveMap: crackTex, emissiveIntensity: 0.8 }),
        neon: NEON.map((c) => L.std({ color: c, emissive: c, emissiveIntensity: 2.4, roughness: 0.3 })),
      };
      const variantOf = (p) => p.v || (p.type === 'start' ? 'helipad' : p.type === 'finish' ? 'billboard' : p.type === 'crumble' ? 'crumble'
        : p.move && p.move.axis[1] < 0.5 ? (p.d >= 8 || p.w >= 8 ? 'bus' : 'car') : p.shape === 'cyl' ? 'helipad' : Math.min(p.w, p.d) < 3 ? 'sign' : 'roof');
      // Neonkant langs toppen (ligger på siden, lige under kanten)
      const neonRim = (p, mat) => {
        const g = p.shape === 'cyl' ? new THREE.TorusGeometry(p.w / 2 + 0.02, 0.05, 6, 40).rotateX(PI / 2)
          : new THREE.BoxGeometry(p.w + 0.08, 0.1, (p.type === 'ramp' ? p.slopeLen : p.d) + 0.08);
        const m = new THREE.Mesh(tr(g), mat);
        m.position.y = p.h / 2 - 0.25;
        if (p.shape !== 'cyl') m.scale.set(1, 1, 1);
        return m;
      };

      return {
        ventColor: '#c8a8ff',
        platform(p) {
          const g = new THREE.Group();
          const v = variantOf(p), minD = Math.min(p.w, p.d), neon = M.neon[p.index % 4];
          if (v === 'car' || v === 'bus') {
            const body = v === 'bus' ? M.bus : M.car[p.index % 3];
            g.add(L.block(p, { top: M.roof, side: body }, 2));
            const cab = L.under(p, body, 0.9, { tip: 0.75 }); if (cab) g.add(cab);
            const jet = new THREE.Mesh(tr(new THREE.CircleGeometry(minD * 0.4, 16).rotateX(PI / 2)), M.jet);
            jet.position.y = -p.h / 2 - 1; jet.userData.noCastShadow = true; g.add(jet);
            for (const sx of [-1, 1]) { const l = new THREE.Mesh(tr(new THREE.SphereGeometry(0.15, 8, 6)), M.light); l.position.set(sx * p.w * 0.35, 0, -p.d / 2 - 0.05); g.add(l); }
          } else if (v === 'billboard') {
            g.add(L.block(p, { top: M.roof, side: M.dark }, 2));
            g.add(neonRim(p, neon));
            const holo = new THREE.Mesh(tr(new THREE.PlaneGeometry(p.w, p.w * 0.5)), M.holo);
            holo.position.set(0, -p.h / 2 - p.w * 0.3, (p.shape === 'cyl' ? p.w : p.d) / 2 + 0.05); g.add(holo);
            const tower = L.pillar(p, M.building, 50, minD * 0.2, 6); if (tower) g.add(tower);
          } else if (v === 'crumble') {
            g.add(L.block(p, { top: M.cracked, side: M.dark }, 2));
          } else {
            const top = v === 'helipad' ? M.heli : M.roof;
            g.add(L.block(p, { top, side: M.concrete }, v === 'helipad' ? (p.shape === 'cyl' ? p.w : minD) : 3, { tileTop: v !== 'helipad' }));
            g.add(neonRim(p, neon));
            if (!p.kin) { const tower = L.pillar(p, M.building, 60, 0.05, 8); if (tower) g.add(tower); }
          }
          if (p.type === 'conveyor') g.children[0].material = [M.dark, M.dark, L.std({ map: L.beltTex('#1a1828', '#2a2838', '#3af6ff'), roughness: 0.4, emissive: '#3af6ff', emissiveIntensity: 0.2 }), M.dark, M.dark, M.dark];
          if (p.type === 'vent') g.children[0].material = [M.concrete, M.concrete, L.std({ map: L.grateTex('#0a0814', '#8a5aff'), roughness: 0.4, emissive: '#8a5aff', emissiveIntensity: 0.4 }), M.concrete, M.concrete, M.concrete];
          if (p.type === 'bounce') g.children[0].material = [M.concrete, M.concrete, M.neon[0], M.concrete, M.concrete, M.concrete];
          return g;
        },
        bar(b) { // neonrør i metalramme
          const g = new THREE.Group();
          g.add(L.barMesh(b, M.neon[(b.index || 0) % 2 ? 1 : 0], b.r));
          for (const sx of [-1, 1]) { const f = new THREE.Mesh(tr(new THREE.BoxGeometry(0.1, 0.6, 0.1)), M.frame); f.position.set(sx * b.len / 2, 0.25, 0); g.add(f); }
          return g;
        },
        anchor(a) { // drone
          const g = new THREE.Group();
          g.add(new THREE.Mesh(tr(new THREE.BoxGeometry(0.5, 0.14, 0.5)), M.dark));
          const eye = new THREE.Mesh(tr(new THREE.SphereGeometry(0.08, 8, 6)), M.red); eye.position.set(0, -0.06, 0.2); g.add(eye);
          for (const [x, z] of [[-0.35, -0.35], [0.35, -0.35], [-0.35, 0.35], [0.35, 0.35]]) {
            const rot = new THREE.Mesh(tr(new THREE.CylinderGeometry(0.18, 0.18, 0.02, 12)), M.jet); rot.position.set(x, 0.1, z); g.add(rot); anim.drones.push(rot);
          }
          return g;
        },
        zip(z) { // el-kabel mellem master
          const g = new THREE.Group();
          const a = new THREE.Vector3(z.ax, z.ay, z.az), b = new THREE.Vector3(z.bx, z.by, z.bz);
          g.add(L.tube([a, a.clone().lerp(b, 0.5).add(new THREE.Vector3(0, -0.35, 0)), b], 0.04, M.dark, 24));
          for (const p of [a, b]) { const post = new THREE.Mesh(tr(new THREE.CylinderGeometry(0.12, 0.16, 4.4, 8)), M.frame); post.position.set(p.x, p.y - 1.9, p.z); g.add(post); }
          return g;
        },
        decor(data) {
          const root = new THREE.Group();
          const b = data.bounds, R0 = b.radius + 30;
          // Skyskrabere med oplyste vinduer (ét draw call) og neontoppe
          const towers = [], tops = [];
          L.place(data, rng, 120, R0, R0 + 360, ctx.lavaY, ctx.lavaY, 10, (x, y, z) => {
            const h = (b.maxY - ctx.lavaY) + rng() * 80 - 10, w = 10 + rng() * 22;
            towers.push({ x, y: y + h / 2, z, sx: w, sy: h, sz: w * (0.7 + rng() * 0.6) });
            if (rng() < 0.4) tops.push({ x, y: y + h + 1, z, sx: w * 0.9, sy: 0.6, sz: 0.6 });
          });
          root.add(L.instanced(new THREE.BoxGeometry(1, 1, 1), M.building, towers));
          root.add(L.instanced(new THREE.BoxGeometry(1, 1, 1), M.neon[0], tops));
          // Flyvende trafik i baner rundt om banen
          L.place(data, rng, 40, R0 + 10, R0 + 200, b.minY - 10, b.maxY + 30, 12, (x, y, z, a) => {
            const c = new THREE.Mesh(tr(new THREE.BoxGeometry(2.5, 1, 5)), M.car[Math.floor(rng() * 3)]);
            const j = new THREE.Mesh(tr(new THREE.PlaneGeometry(2, 4).rotateX(PI / 2)), M.jet); j.position.y = -0.7; c.add(j);
            c.position.set(x, y, z); root.add(c);
            anim.cars.push({ m: c, a, r: Math.hypot(x - b.cx, z - b.cz), sp: (rng() < 0.5 ? 1 : -1) * (0.04 + rng() * 0.05), cx: b.cx, cz: b.cz });
          });
          // Store hologrammer
          L.place(data, rng, 6, R0 + 40, R0 + 220, b.minY, b.maxY + 30, 25, (x, y, z) => {
            const h = new THREE.Mesh(tr(new THREE.PlaneGeometry(30, 16)), M.holo); h.position.set(x, y, z); h.lookAt(b.cx, y, b.cz);
            root.add(h); anim.holo.push(h);
          });
          return root;
        },
        update(dt, t) {
          for (const r of anim.drones) r.rotation.y += dt * 30;
          for (const c of anim.cars) { c.a += c.sp * dt; c.m.position.x = c.cx + Math.cos(c.a) * c.r; c.m.position.z = c.cz + Math.sin(c.a) * c.r; c.m.rotation.y = -c.a + (c.sp > 0 ? 0 : PI); }
          for (const h of anim.holo) h.material.opacity = 0.7 + Math.sin(t * 9) * 0.08;
        },
      };
    },
  };
})();
