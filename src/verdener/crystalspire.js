/* =====================================================================
   VERDENSSÆT 'crystalspire' – Nordlystårnet (bane 15, finalen)
   Et kæmpe tårn af krystal og guld under nordlyset: glas- og frost-
   glasplatforme, guldringe og guldarme, lysekroner, lysstråler,
   splintrende glas, master med svævebaner og svævende souvenirs fra
   alle de tidligere verdener.
   ===================================================================== */
(function () {
  'use strict';

  window.SKYHOJ_THEMES.crystalspire = {
    top: '#050a22', horizon: '#1e3a6a', bottom: '#1a1a3a', sunElev: 45, sunAz: -20, sunColor: '#c8e0ff', sunInt: 2.2,
    hemiSky: '#8ab0ff', hemiInt: 1.15, fog: '#16244a', fogNear: 90, fogFar: 700, cloud: '#2a3a6a', clouds: 0.35, stars: 1,
    stone: '#c8d0e8', exposure: 1.25, lavaGlow: 1.0, moon: true,
  };

  window.SKYHOJ_KITS.crystalspire = {
    id: 'crystalspire',
    name: 'Nordlystårnet',
    variants: {
      glass: 'Klart krystalglas med guldkant og lysende facetter under (standard for p). Kasse/cyl w 2-8',
      frost: 'Frostglas: matblåt og glat (brug til ice / slick). Kasse/cyl w 2-6',
      gold: 'Guldplade med gravering (standard for rot/spin og bevægelige). Kasse/cyl w 3-10',
      prism: 'Prisme: regnbuefarvet krystal (kronens kapitel). Kasse/cyl w 2-5',
      balcony: 'Hvilebalkon i hvid marmor med guld (standard for start). w 6-12',
      crown: 'Tårnets krone: guldring med lysende krystaller (standard for finish). w 8-14',
    },
    barVariants: 'Stænger er guldrør med krystalknopper; trapez er lysekroner. Svævebaner er lysende guldkabler. Krogpunkter er svævende krystaller.',
    create(ctx) {
      const { THREE } = ctx;
      const L = window.SKYHOJ_KITLIB(ctx);
      const PI = Math.PI, TAU = L.TAU, tr = L.tr;
      const rng = ctx.mulberry32(1500 + ctx.levelIndex);
      const anim = { aurora: [], orbit: [], gems: [] };

      const engraved = L.tex(256, (g, S) => {
        L.fill(g, S, S, '#d8a840'); g.strokeStyle = '#a87a20'; g.lineWidth = 3;
        for (let r = 20; r < S; r += 40) { g.beginPath(); g.arc(S / 2, S / 2, r, 0, TAU); g.stroke(); }
        for (let k = 0; k < 12; k++) { const a = k / 12 * TAU; g.beginPath(); g.moveTo(S / 2, S / 2); g.lineTo(S / 2 + Math.cos(a) * S, S / 2 + Math.sin(a) * S); g.stroke(); }
      });
      const marble = L.tex(256, (g, S) => { L.fill(g, S, S, '#f2f0f6'); g.strokeStyle = 'rgba(150,150,190,0.5)'; g.lineWidth = 2; for (let i = 0; i < 14; i++) { let x = rng() * S, y = 0; g.beginPath(); g.moveTo(x, y); while (y < S) { x += (rng() - 0.5) * 30; y += 20; g.lineTo(x, y); } g.stroke(); } });
      const frostTex = L.tex(256, (g, S) => { L.fill(g, S, S, '#b8d8ff'); L.speckle(g, S, S, ['#ffffff', '#9ac0f0'], 900, 1, 4, rng); });
      const shards = L.tex(256, (g, S) => { L.fill(g, S, S, '#9ad0ff'); L.cracks(g, S, S, '#ffffff', 16, rng, 2.5); });
      const auroraTex = L.tex(256, (g, S) => {
        const gr = g.createLinearGradient(0, 0, 0, S);
        gr.addColorStop(0, 'rgba(120,60,255,0)'); gr.addColorStop(0.4, 'rgba(80,255,170,0.6)'); gr.addColorStop(0.75, 'rgba(60,200,255,0.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr; g.fillRect(0, 0, S, S);
        g.globalCompositeOperation = 'destination-in';
        for (let x = 0; x < S; x += 4) { g.fillStyle = `rgba(0,0,0,${0.4 + 0.6 * Math.abs(Math.sin(x * 0.05))})`; g.fillRect(x, 0, 4, S); }
      }, { repeat: true });
      const M = {
        glass: L.phys({ color: '#d8f4ff', roughness: 0.04, transmission: 0.6, thickness: 1, ior: 1.45, clearcoat: 1, transparent: true, opacity: 0.92 }),
        glassSide: L.phys({ color: '#a8d8ff', roughness: 0.08, transmission: 0.5, thickness: 1, emissive: '#3a7aff', emissiveIntensity: 0.25, transparent: true, opacity: 0.9 }),
        frost: L.phys({ map: frostTex, roughness: 0.35, clearcoat: 0.6, emissive: '#2a5aaa', emissiveIntensity: 0.2 }),
        gold: L.std({ map: engraved, roughness: 0.3, metalness: 0.55, emissive: '#6a4a10', emissiveIntensity: 0.35 }),
        goldPlain: L.std({ color: '#f0c050', roughness: 0.25, metalness: 0.6, emissive: '#6a4a10', emissiveIntensity: 0.3 }),
        marble: L.std({ map: marble, roughness: 0.35 }),
        shards: L.phys({ map: shards, roughness: 0.1, clearcoat: 1, emissive: '#5aa0ff', emissiveIntensity: 0.3 }),
        prism: L.phys({ color: '#ffffff', roughness: 0.03, iridescence: 1, iridescenceIOR: 1.6, clearcoat: 1, emissive: '#ff8af0', emissiveIntensity: 0.15 }),
        gem: L.std({ color: '#8af0ff', emissive: '#4ad8ff', emissiveIntensity: 1.8, roughness: 0.2 }),
        tower: L.phys({ color: '#9ac8ff', roughness: 0.1, emissive: '#2a4aaa', emissiveIntensity: 0.35, clearcoat: 1 }),
        aurora: tr(new THREE.MeshBasicMaterial({ map: auroraTex, transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending })),
        candle: L.std({ color: '#fff4d0', emissive: '#ffd890', emissiveIntensity: 2.2 }),
        souvenir: [L.std({ color: '#ffcc33', roughness: 0.6 }), L.std({ color: '#ff9ec4', roughness: 0.6 }), L.std({ color: '#5aa040', roughness: 0.7 }), L.std({ color: '#b3261e', roughness: 0.5 }), L.std({ color: '#3a8aff', roughness: 0.4 })],
      };
      const variantOf = (p) => p.v || (p.type === 'start' ? 'balcony' : p.type === 'finish' ? 'crown' : p.type === 'crumble' ? 'shatter'
        : p.type === 'ice' || p.slick ? 'frost' : p.type === 'rot' || p.type === 'spin' || p.kin ? 'gold' : 'glass');

      return {
        ventColor: '#c8f0ff',
        slickColor: '#bfe8ff',
        platform(p) {
          const g = new THREE.Group();
          const v = variantOf(p), minD = Math.min(p.w, p.d);
          if (v === 'glass' || v === 'prism') {
            g.add(L.block(p, { top: v === 'prism' ? M.prism : M.glass, side: M.glassSide }, 2, { segments: 12 }));
            const rim = new THREE.Mesh(tr(p.shape === 'cyl' ? new THREE.TorusGeometry(p.w / 2, 0.06, 6, 24).rotateX(PI / 2) : new THREE.BoxGeometry(p.w + 0.04, 0.1, p.d + 0.04)), M.goldPlain);
            rim.position.y = -p.h / 2 + 0.05; g.add(rim);
            const facet = L.under(p, M.glassSide, minD * 0.9, { tip: 0.02, segments: 6 }); if (facet) g.add(facet);
          } else if (v === 'frost') {
            g.add(L.block(p, { top: M.frost, side: M.frost }, 2, { segments: 12 }));
            const facet = L.under(p, M.frost, minD * 0.7, { tip: 0.02, segments: 6 }); if (facet) g.add(facet);
          } else if (v === 'gold') {
            g.add(L.block(p, { top: M.gold, side: M.goldPlain }, p.shape === 'cyl' ? p.w : minD, { tileTop: false }));
          } else if (v === 'balcony') {
            g.add(L.block(p, { top: M.marble, side: M.marble }, 3));
            const u = L.under(p, M.goldPlain, 1.5, { tip: 0.6 }); if (u) g.add(u);
          } else if (v === 'crown') {
            g.add(L.block(p, { top: M.gold, side: M.goldPlain }, p.shape === 'cyl' ? p.w : minD, { tileTop: false }));
            for (let i = 0; i < 10; i++) { // krystaller rundt om kanten (under topniveau)
              const a = i / 10 * TAU, r = (p.shape === 'cyl' ? p.w : minD) / 2;
              const c = new THREE.Mesh(tr(new THREE.OctahedronGeometry(0.35, 0)), M.gem);
              c.position.set(Math.cos(a) * r * 0.85, -p.h / 2 - 0.5, Math.sin(a) * r * 0.85); c.scale.y = 2.2; g.add(c);
            }
            const u = L.under(p, M.tower, 6, { tip: 0.3, segments: 8 }); if (u) g.add(u);
          } else { // splintrende glas
            g.add(L.block(p, { top: M.shards, side: M.shards }, 2));
          }
          if (p.swing) { // lysekrone: lys under platformen
            for (let i = 0; i < 6; i++) { const a = i / 6 * TAU, c = new THREE.Mesh(tr(new THREE.SphereGeometry(0.14, 8, 6)), M.candle); c.position.set(Math.cos(a) * minD * 0.35, -p.h / 2 - 0.35, Math.sin(a) * minD * 0.35); g.add(c); }
          }
          if (p.type === 'conveyor') g.children[0].material = [M.goldPlain, M.goldPlain, L.std({ map: L.beltTex('#3a5aa0', '#5a7ac0', '#ffe08a'), roughness: 0.3, metalness: 0.5 }), M.goldPlain, M.goldPlain, M.goldPlain];
          if (p.type === 'vent') g.children[0].material = [M.goldPlain, M.goldPlain, L.std({ map: L.grateTex('#1a2a5a', '#e8b84a'), roughness: 0.3, metalness: 0.8, emissive: '#4ad8ff', emissiveIntensity: 0.4 }), M.goldPlain, M.goldPlain, M.goldPlain];
          if (p.type === 'bounce') g.children[0].material = [M.glassSide, M.glassSide, M.prism, M.glassSide, M.glassSide, M.glassSide];
          return g;
        },
        spinArm(p) {
          const g = new THREE.Group();
          g.add(new THREE.Mesh(tr(new THREE.BoxGeometry(p.bar, 0.3, 0.4)), M.goldPlain));
          for (const sx of [-1, 1]) { const c = new THREE.Mesh(tr(new THREE.OctahedronGeometry(0.3, 0)), M.gem); c.position.x = sx * p.bar / 2; g.add(c); }
          return g;
        },
        bar(b) {
          const g = new THREE.Group();
          g.add(L.barMesh(b, M.goldPlain));
          for (const sx of [-1, 1]) { const k = new THREE.Mesh(tr(new THREE.OctahedronGeometry(b.r * 2.5, 0)), M.gem); k.position.x = sx * b.len / 2; g.add(k); }
          if (b.swing) { // lysekrone over trapezen
            const ring = new THREE.Mesh(tr(new THREE.TorusGeometry(b.len * 0.35, 0.05, 6, 24).rotateX(PI / 2)), M.goldPlain); ring.position.y = 1.2; g.add(ring);
            for (let i = 0; i < 6; i++) { const a = i / 6 * TAU, c = new THREE.Mesh(tr(new THREE.SphereGeometry(0.1, 8, 6)), M.candle); c.position.set(Math.cos(a) * b.len * 0.35, 1.3, Math.sin(a) * b.len * 0.35); g.add(c); }
          }
          return g;
        },
        anchor() {
          const g = new THREE.Group();
          const c = new THREE.Mesh(tr(new THREE.OctahedronGeometry(0.34, 0)), M.gem); c.scale.y = 1.6; g.add(c); anim.gems.push(c);
          return g;
        },
        zip(z) {
          const g = new THREE.Group();
          const a = new THREE.Vector3(z.ax, z.ay, z.az), b = new THREE.Vector3(z.bx, z.by, z.bz);
          g.add(L.tube([a, b], 0.04, M.gem, 8));
          for (const p of [a, b]) { const post = new THREE.Mesh(tr(new THREE.CylinderGeometry(0.15, 0.2, 4.4, 8)), M.goldPlain); post.position.set(p.x, p.y - 1.9, p.z); g.add(post); }
          return g;
        },
        decor(data) {
          const root = new THREE.Group();
          const b = data.bounds;
          // Det centrale tårn: tilspidset krystal fra lavaen til over kronen (holdt fri af banen)
          let tr0 = 30;
          for (const p of data.plats) tr0 = Math.min(tr0, Math.hypot(p.x - b.cx, p.z - b.cz) - Math.max(p.w, p.d) / 2 - 4);
          const R = Math.max(3, Math.min(tr0, 26));
          if (R > 3) {
            const tower = L.lathe([[R, ctx.lavaY - 2], [R * 0.95, b.minY], [R * 0.7, (b.minY + b.maxY) / 2], [R * 0.45, b.maxY + 10], [0.01, b.maxY + 60]], M.tower, 8);
            tower.position.set(b.cx, 0, b.cz); root.add(tower);
            for (let i = 0; i < 6; i++) { // guldbånd om tårnet
              const y = b.minY + (b.maxY - b.minY) * i / 5, rr = R * (0.95 - 0.5 * i / 5);
              const band = new THREE.Mesh(tr(new THREE.TorusGeometry(rr + 0.3, 0.4, 6, 32).rotateX(PI / 2)), M.goldPlain);
              band.position.set(b.cx, y, b.cz); root.add(band);
            }
          }
          // Nordlys: store bånd højt oppe, der bølger
          for (let i = 0; i < 4; i++) {
            const g = new THREE.PlaneGeometry(1400, 260, 40, 1);
            const P = g.attributes.position;
            for (let k = 0; k < P.count; k++) P.setZ(k, Math.sin(P.getX(k) * 0.006 + i) * 120);
            const m = new THREE.Mesh(tr(g), M.aurora);
            m.position.set(b.cx + (i - 1.5) * 200, b.maxY + 260 + i * 40, b.cz - 500 + i * 300);
            m.rotation.y = i * 0.6; root.add(m); anim.aurora.push(m);
          }
          // Svævende souvenirs fra de tidligere verdener i kredsløb (kun pynt)
          const shapes = [new THREE.CylinderGeometry(1.5, 1.5, 2.5, 16), new THREE.TorusGeometry(1.4, 0.6, 10, 20), new THREE.ConeGeometry(1.4, 2.6, 4), new THREE.BoxGeometry(2.2, 2.2, 2.2), new THREE.SphereGeometry(1.4, 14, 10)];
          for (let i = 0; i < 18; i++) {
            const m = new THREE.Mesh(tr(shapes[i % shapes.length]), M.souvenir[i % M.souvenir.length]);
            const r = b.radius + 30 + rng() * 60, y = b.minY + rng() * (b.maxY - b.minY + 30), a = rng() * TAU;
            if (!ctx.clearOfCourse(b.cx + Math.cos(a) * r, y, b.cz + Math.sin(a) * r, 10)) continue;
            root.add(m); anim.orbit.push({ m, r, y, a, cx: b.cx, cz: b.cz, sp: 0.03 + rng() * 0.04 });
          }
          // Krystalspir rundt om (i det fjerne)
          const spires = [];
          L.place(data, rng, 30, b.radius + 120, b.radius + 420, ctx.lavaY, ctx.lavaY, 20, (x, y, z) => { const h = 60 + rng() * 160, r = 4 + rng() * 10; spires.push({ x, y: y + h / 2, z, sx: r, sy: h, sz: r, ry: rng() * TAU }); });
          root.add(L.instanced(new THREE.ConeGeometry(1, 1, 6), M.tower, spires));
          return root;
        },
        update(dt, t) {
          for (const a of anim.aurora) { a.material.opacity = 0.7 + Math.sin(t * 0.5) * 0.3; a.position.x += Math.sin(t * 0.2) * dt * 4; }
          for (const o of anim.orbit) { o.a += o.sp * dt; o.m.position.set(o.cx + Math.cos(o.a) * o.r, o.y + Math.sin(t + o.a) * 2, o.cz + Math.sin(o.a) * o.r); o.m.rotation.y += dt * 0.5; }
          for (const g of anim.gems) g.rotation.y = t * 1.5;
        },
      };
    },
  };
})();
