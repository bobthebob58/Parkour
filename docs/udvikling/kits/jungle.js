/* =====================================================================
   VERDENSSÆT 'jungle' – Junglekronerne (bane 8)
   Junglens trætoppe: den store modertræstamme, svampehylder, grenstumper,
   trædæk og trætophuse, lianer og grene som stænger, svampe- og
   bladpuder, døde grene, lysende frøkapsler, vandfald og tåge.
   ===================================================================== */
(function () {
  'use strict';

  window.SKYHOJ_THEMES.jungle = {
    top: '#3f8fd0', horizon: '#c8eac0', bottom: '#8ab48a', sunElev: 55, sunAz: 10, sunColor: '#fff4d8', sunInt: 3.0,
    hemiSky: '#c4ecc0', hemiInt: 1.05, fog: '#b8dcb0', fogNear: 70, fogFar: 520, cloud: '#f2fff0', clouds: 0.85, stars: 0,
    stone: '#b8c4a0', exposure: 1.0, lavaGlow: 0.85,
  };

  window.SKYHOJ_KITS.jungle = {
    id: 'jungle',
    name: 'Junglekronerne',
    variants: {
      fungus: 'Svampehylde: halvrund, lys orange-brun med lameller under (standard for cyl). shape:"cyl" w 1.5-4',
      stub: 'Grenstump: bark på siderne, årringe i toppen, gren der fortsætter ind mod stammen. Kasse/cyl w 1.2-3',
      deck: 'Trædæk på grene (standard for p): planker bundet med reb, bladtag under. Kasse w 3-10',
      treehouse: 'Trætophus-balkon: planker, stråtag under, lanterner (standard for start/finish). w 6-12',
      leaf: 'Kæmpe blad som platform. Kasse w 2-5',
      dead: 'Død, grå gren med revner (standard for crumble). Kasse w 1.5-3',
    },
    barVariants: 'Stænger er grene med mos og blade; trapez er lianer. Svævebaner er lianer med blomster. Krogpunkter er lysende frøkapsler.',
    create(ctx) {
      const { THREE } = ctx;
      const L = window.SKYHOJ_KITLIB(ctx);
      const PI = Math.PI, TAU = L.TAU, tr = L.tr;
      const rng = ctx.mulberry32(800 + ctx.levelIndex);
      const anim = { pods: [], falls: [], birds: null };

      const bark = L.tex(256, (g, S) => {
        L.fill(g, S, S, '#6a4a32');
        for (let x = 0; x < S; x += 6 + Math.floor(rng() * 8)) { g.fillStyle = rng() < 0.5 ? '#4e3424' : '#7e5a3e'; g.fillRect(x, 0, 2 + rng() * 4, S); }
        g.globalAlpha = 0.5; L.speckle(g, S, S, ['#5a7a2a', '#7aa03a'], 120, 3, 10, rng); g.globalAlpha = 1;
      });
      const rings = L.tex(256, (g, S) => {
        L.fill(g, S, S, '#c8a070');
        for (let r = S / 2; r > 4; r -= 7) { g.strokeStyle = r % 14 ? '#a87e50' : '#b88e5e'; g.lineWidth = 2; g.beginPath(); g.arc(S / 2, S / 2, r, 0, TAU); g.stroke(); }
      }, { repeat: false });
      const planks = L.tex(256, (g, S) => {
        for (let x = 0; x < S; x += 32) { g.fillStyle = ['#9a7046', '#8a6038', '#a87a4e'][(x / 32) % 3]; g.fillRect(x, 0, 32, S); g.fillStyle = '#4a3020'; g.fillRect(x, 0, 2, S); }
        g.fillStyle = '#c8a46a'; for (let y = 40; y < S; y += 110) g.fillRect(0, y, S, 6);
      });
      const fungus = L.tex(256, (g, S) => {
        L.grad(g, S, S, [[0, '#f2c880'], [1, '#c8823a']]);
        L.speckle(g, S, S, ['#ffe8b8', '#a8602a'], 200, 2, 6, rng);
      });
      const leaf = L.tex(256, (g, S) => {
        L.fill(g, S, S, '#3c8a32'); g.strokeStyle = '#7ac85a'; g.lineWidth = 5;
        g.beginPath(); g.moveTo(S / 2, 0); g.lineTo(S / 2, S); g.stroke(); g.lineWidth = 2;
        for (let y = 10; y < S; y += 24) { g.beginPath(); g.moveTo(S / 2, y); g.lineTo(0, y + 30); g.moveTo(S / 2, y); g.lineTo(S, y + 30); g.stroke(); }
      });
      const dead = L.tex(256, (g, S) => { L.fill(g, S, S, '#8a8478'); L.speckle(g, S, S, ['#a8a294', '#6a6458'], 300, 1, 4, rng); L.cracks(g, S, S, '#3a362e', 16, rng, 3); });
      const falls = L.tex(64, (g, S) => { L.grad(g, S, S, [[0, '#e8f8ff'], [1, '#8ac8e8']], false); g.globalAlpha = 0.6; for (let i = 0; i < 30; i++) { g.fillStyle = '#ffffff'; g.fillRect(rng() * S, rng() * S, 2, 12); } g.globalAlpha = 1; });
      const M = {
        bark: L.std({ map: bark, bumpMap: bark, bumpScale: 2, roughness: 0.95 }),
        rings: L.std({ map: rings, roughness: 0.8 }),
        planks: L.std({ map: planks, roughness: 0.8 }),
        fungus: L.std({ map: fungus, roughness: 0.7 }),
        gills: L.std({ color: '#e8d0a0', roughness: 0.9 }),
        leaf: L.std({ map: leaf, roughness: 0.6, side: THREE.DoubleSide }),
        leafDark: L.std({ color: '#2a6a2a', roughness: 0.75 }),
        moss: L.std({ color: '#5a9a3a', roughness: 0.95 }),
        dead: L.std({ map: dead, roughness: 0.95 }),
        thatch: L.std({ color: '#b89a5a', roughness: 0.95 }),
        rope: L.std({ color: '#c8a46a', roughness: 0.85 }),
        vine: L.std({ color: '#4a7a2a', roughness: 0.8 }),
        pod: L.std({ color: '#c8ff6a', emissive: '#8aff3a', emissiveIntensity: 1.6, roughness: 0.4 }),
        mushroom: L.std({ color: '#e84a4a', roughness: 0.5, emissive: '#a01a1a', emissiveIntensity: 0.1 }),
        dots: L.std({ color: '#fff4e8', roughness: 0.6 }),
        water: tr(new THREE.MeshBasicMaterial({ map: falls, transparent: true, opacity: 0.8, fog: true })),
        flower: L.std({ color: '#ff6aa8', roughness: 0.6, emissive: '#ff3a8a', emissiveIntensity: 0.2 }),
      };
      const variantOf = (p) => p.v || (p.type === 'start' || p.type === 'finish' ? 'treehouse' : p.type === 'crumble' ? 'dead'
        : p.type === 'bounce' ? 'mushroom' : p.shape === 'cyl' ? (p.w <= 3 ? 'stub' : 'fungus') : Math.min(p.w, p.d) <= 2.5 ? 'stub' : 'deck');

      return {
        ventColor: '#e8fff0',
        platform(p) {
          const g = new THREE.Group();
          const v = variantOf(p), minD = Math.min(p.w, p.d);
          if (v === 'fungus') {
            g.add(L.block(p, { top: M.fungus, side: M.fungus }, 2, { segments: 28 }));
            const gl = L.under(p, M.gills, Math.min(1.2, p.w * 0.3), { tip: 0.2, segments: 28 }); if (gl) g.add(gl);
          } else if (v === 'stub') {
            g.add(L.block(p, { top: M.rings, side: M.bark }, p.shape === 'cyl' ? p.w : minD, { tileTop: false, segments: 14 }));
            const s = L.pillar(p, M.bark, 3, minD * 0.12, 2); if (s) g.add(s);
          } else if (v === 'mushroom') { // springpude: rød fluesvamp
            g.add(L.block(p, { top: M.mushroom, side: M.mushroom }, 2, { segments: 24 }));
            for (let i = 0; i < 5; i++) {
              const d = new THREE.Mesh(tr(new THREE.CircleGeometry(minD * 0.07, 10).rotateX(-PI / 2)), M.dots);
              const a = i / 5 * TAU + p.seed; d.position.set(Math.cos(a) * minD * 0.25, p.h / 2 + 0.01, Math.sin(a) * minD * 0.25); g.add(d);
            }
            const stem = L.pillar(p, M.dots, 4, minD * 0.3, 2); if (stem) g.add(stem);
          } else if (v === 'leaf') {
            g.add(L.block(p, { top: M.leaf, side: M.leafDark }, minD, { tileTop: false }));
          } else if (v === 'dead') {
            g.add(L.block(p, { top: M.dead, side: M.dead }, 2));
          } else { // trædæk / trætophus
            g.add(L.block(p, { top: M.planks, side: M.bark }, 2));
            const roof = L.under(p, v === 'treehouse' ? M.thatch : M.leafDark, v === 'treehouse' ? 2.5 : 1.4, { tip: 0.5 }); if (roof) g.add(roof);
            const trunk = L.pillar(p, M.bark, 30, minD * 0.36, 3); if (trunk) { trunk.position.y -= 1; g.add(trunk); }
          }
          if (p.type === 'conveyor') g.children[0].material = [M.bark, M.bark, L.std({ map: L.beltTex('#5a4030', '#6a5040', '#c8ff6a'), roughness: 0.8 }), M.bark, M.bark, M.bark];
          if (p.type === 'vent') g.children[0].material = [M.bark, M.bark, L.std({ map: L.grateTex('#3a2a1a', '#7a9a4a'), roughness: 0.8 }), M.bark, M.bark, M.bark];
          return g;
        },
        bar(b) {
          const g = new THREE.Group();
          g.add(L.barMesh(b, b.swing ? M.vine : M.bark, b.r * 1.1));
          if (!b.swing) {
            const n = Math.max(2, Math.round(b.len / 0.8));
            for (let i = 0; i < n; i++) {
              const l = new THREE.Mesh(tr(new THREE.PlaneGeometry(0.35, 0.18)), M.leaf);
              l.position.set(-b.len / 2 + (i + 0.5) * b.len / n, 0.12, (i % 2 ? 1 : -1) * 0.1); l.rotation.set(-0.6, i, 0.3); g.add(l);
            }
          }
          return g;
        },
        anchor() { // lysende frøkapsel
          const g = new THREE.Group();
          const pod = new THREE.Mesh(tr(new THREE.SphereGeometry(0.28, 14, 10)), M.pod);
          pod.scale.y = 1.4; g.add(pod); anim.pods.push(pod);
          const stem = new THREE.Mesh(tr(new THREE.CylinderGeometry(0.03, 0.03, 1.2, 6)), M.vine); stem.position.y = 0.9; g.add(stem);
          return g;
        },
        zip(z) { // lian med blomster
          const g = new THREE.Group();
          const a = new THREE.Vector3(z.ax, z.ay, z.az), b = new THREE.Vector3(z.bx, z.by, z.bz);
          g.add(L.tube([a, a.clone().lerp(b, 0.5).add(new THREE.Vector3(0, -0.3, 0)), b], 0.05, M.vine, 24));
          const n = Math.max(3, Math.round(a.distanceTo(b) / 3));
          for (let i = 1; i < n; i++) { const f = new THREE.Mesh(tr(new THREE.SphereGeometry(0.12, 8, 6)), M.flower); f.position.copy(a.clone().lerp(b, i / n)); f.position.y += 0.08; g.add(f); }
          return g;
        },
        decor(data) {
          const root = new THREE.Group();
          const b = data.bounds, R0 = b.radius + 40;
          // Kæmpetræer: stammer med store, grønne kroner rundt om banen
          const trunks = [], crowns = [];
          L.place(data, rng, 26, R0, R0 + 260, ctx.lavaY + 10, ctx.lavaY + 10, 16, (x, y, z) => {
            const h = (b.maxY - ctx.lavaY) + 20 + rng() * 40, r = 3 + rng() * 4;
            trunks.push({ x, y: y + h / 2, z, sx: r, sy: h, sz: r });
            for (let k = 0; k < 5; k++) crowns.push({ x: x + (rng() - 0.5) * r * 6, y: y + h + rng() * 8, z: z + (rng() - 0.5) * r * 6, s: r * (2 + rng() * 1.5), sy: r * 1.2 });
          });
          root.add(L.instanced(new THREE.CylinderGeometry(0.8, 1, 1, 9), M.bark, trunks));
          root.add(L.instanced(new THREE.IcosahedronGeometry(1, 1), M.leafDark, crowns));
          // Vandfald fra kronerne og tåge
          L.place(data, rng, 6, R0 + 30, R0 + 180, b.minY, b.maxY, 20, (x, y, z) => {
            const f = new THREE.Mesh(tr(new THREE.PlaneGeometry(8, 80)), M.water);
            f.position.set(x, y - 30, z); f.lookAt(b.cx, y - 30, b.cz); root.add(f); anim.falls.push(f);
          });
          // Fugle
          const pos = [];
          for (let i = 0; i < 40; i++) pos.push(b.cx + (rng() - 0.5) * b.radius * 2, b.maxY + 15 + rng() * 25, b.cz + (rng() - 0.5) * b.radius * 2);
          anim.birds = L.points(pos, '#ff5a3a', 4, 1);
          root.add(anim.birds);
          return root;
        },
        update(dt, t) {
          falls.offset.y = -t * 0.8;
          for (const p of anim.pods) p.material.emissiveIntensity = 1.3 + Math.sin(t * 3) * 0.4;
          if (anim.birds) anim.birds.rotation.y = t * 0.03;
        },
      };
    },
  };
})();
