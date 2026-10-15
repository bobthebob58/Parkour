/* =====================================================================
   VERDENSSÆT 'temple' – Kirsebærtemplet (bane 11)
   Pagoder med røde lakvægge og tagskæg, stentrapper med mos, buede
   broer, lotusblade, torii-porte og bambus som stænger, lanternesnore,
   tempelklokker, kirsebærtræer og faldende kronblade.
   ===================================================================== */
(function () {
  'use strict';

  window.SKYHOJ_THEMES.temple = {
    top: '#7fb6f0', horizon: '#ffd9e4', bottom: '#f4c2cc', sunElev: 32, sunAz: -55, sunColor: '#fff0dc', sunInt: 3.0,
    hemiSky: '#f0dcea', hemiInt: 1.0, fog: '#f6d6e0', fogNear: 90, fogFar: 600, cloud: '#fff4f8', clouds: 0.8, stars: 0,
    stone: '#d8ccc0', exposure: 1.02, lavaGlow: 0.85,
  };

  window.SKYHOJ_KITS.temple = {
    id: 'temple',
    name: 'Kirsebærtemplet',
    variants: {
      pagoda: 'Pagodeetage: træplanker på toppen, røde lakvægge med guldbånd og mørkt tegltag under (standard for p). Kasse/cyl w 3-10',
      stone: 'Tempeltrappe af lys granit med mos i fugerne. Kasse w 3-8',
      bridge: 'Rød buebro: planker på tværs, røde sider og en bue under. Kasse w 2.5-4, d 6-16',
      lantern: 'Stenlanterne (toro): rund stentop med lys ovenpå siderne. shape:"cyl" w 1.5-3',
      koi: 'Trædæk over en koidam (blåt vand med fisk under). Kasse w 5-10',
      moongate: 'Hvid kalket terrasse med en rund måneport-mosaik i toppen (standard for finish). w 8-12',
      courtyard: 'Tempelgård med grus rivet i bølger (standard for start). w 8-12',
    },
    barVariants: 'Stænger er røde torii-bjælker med sorte ender; b.v "bamboo" giver grøn bambus med led. Svævebaner er snore med papirlanterner. Krogpunkter er tempelklokker.',
    create(ctx) {
      const { THREE } = ctx;
      const L = window.SKYHOJ_KITLIB(ctx);
      const PI = Math.PI, TAU = L.TAU, tr = L.tr;
      const rng = ctx.mulberry32(1100 + ctx.levelIndex);
      const anim = { petals: null, lanterns: [], sway: [] };

      const planks = L.tex(256, (g, S) => {
        for (let y = 0; y < S; y += 32) { g.fillStyle = ['#b07a4a', '#a06a3e', '#bd8656', '#9a643a'][(y / 32) % 4]; g.fillRect(0, y, S, 32); g.fillStyle = '#5a3a20'; g.fillRect(0, y, S, 2); }
        g.globalAlpha = 0.25; for (let i = 0; i < 120; i++) { g.fillStyle = '#4a2a14'; g.fillRect(rng() * S, rng() * S, 20 + rng() * 60, 1); } g.globalAlpha = 1;
      });
      const lacquer = L.tex(256, (g, S) => {
        L.fill(g, S, S, '#b3261e');
        g.fillStyle = '#e8b84a'; g.fillRect(0, 0, S, 18); g.fillStyle = '#7a1410'; g.fillRect(0, 18, S, 6);
        g.fillStyle = '#8f1a14'; for (let x = 0; x < S; x += 64) g.fillRect(x, 24, 10, S);
      });
      const granite = L.tex(256, (g, S) => {
        L.fill(g, S, S, '#cfc6ba'); L.speckle(g, S, S, ['#b8aea0', '#e4dcd2', '#9a9086'], 700, 1, 3, rng);
        g.strokeStyle = '#6f8a3a'; g.lineWidth = 4; for (let i = 0; i <= S; i += 128) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, S); g.moveTo(0, i); g.lineTo(S, i); g.stroke(); }
      });
      const gravel = L.tex(256, (g, S) => {
        L.fill(g, S, S, '#e2dccf'); L.speckle(g, S, S, ['#cfc7b8', '#f2ede2', '#b8b0a0'], 1200, 1, 2.5, rng);
        g.strokeStyle = 'rgba(150,140,120,0.5)'; g.lineWidth = 3;
        for (let y = 8; y < S; y += 16) { g.beginPath(); for (let x = 0; x <= S; x += 8) g.lineTo(x, y + Math.sin(x / S * TAU * 2) * 5); g.stroke(); }
      });
      const moonTex = L.tex(256, (g, S) => {
        L.fill(g, S, S, '#f3eee4');
        g.strokeStyle = '#b3261e'; g.lineWidth = 10; g.beginPath(); g.arc(S / 2, S / 2, S * 0.4, 0, TAU); g.stroke();
        g.fillStyle = '#e8b84a'; g.beginPath(); g.arc(S / 2, S / 2, S * 0.12, 0, TAU); g.fill();
      }, { repeat: false });
      const water = L.tex(256, (g, S) => {
        L.grad(g, S, S, [[0, '#2a7aa0'], [1, '#1a4a70']]);
        for (let i = 0; i < 6; i++) { g.fillStyle = rng() < 0.5 ? '#ff7a2a' : '#ffffff'; g.beginPath(); g.ellipse(rng() * S, rng() * S, 14, 6, rng() * PI, 0, TAU); g.fill(); }
      });
      const cracked = L.tex(256, (g, S) => {
        for (let y = 0; y < S; y += 32) { g.fillStyle = ['#8a6a4a', '#7a5a3a'][(y / 32) % 2]; g.fillRect(0, y, S, 32); }
        L.cracks(g, S, S, '#2a1a10', 16, rng, 3);
      });
      const M = {
        planks: L.std({ map: planks, roughness: 0.75 }),
        lacquer: L.std({ map: lacquer, roughness: 0.35, metalness: 0.1 }),
        roof: L.std({ color: '#2f3640', roughness: 0.55, metalness: 0.3 }),
        granite: L.std({ map: granite, bumpMap: granite, bumpScale: 1, roughness: 0.9 }),
        gravel: L.std({ map: gravel, roughness: 0.95 }),
        moon: L.std({ map: moonTex, roughness: 0.8 }),
        plaster: L.std({ color: '#f3eee4', roughness: 0.9 }),
        water: L.phys({ map: water, roughness: 0.08, clearcoat: 1 }),
        lotus: L.std({ color: '#4caa4a', roughness: 0.55 }),
        lotusSide: L.std({ color: '#2f7a3a', roughness: 0.6 }),
        pink: L.std({ color: '#ff9ec4', roughness: 0.6, emissive: '#ff5a9a', emissiveIntensity: 0.15 }),
        cracked: L.std({ map: cracked, roughness: 0.9 }),
        black: L.std({ color: '#1e1e22', roughness: 0.5 }),
        bamboo: L.std({ color: '#7ab04a', roughness: 0.45 }),
        bambooNode: L.std({ color: '#5a8a34', roughness: 0.5 }),
        bronze: L.std({ color: '#a8743a', roughness: 0.35, metalness: 0.85 }),
        paper: L.std({ color: '#ff5a3a', emissive: '#ff6a2a', emissiveIntensity: 0.8, roughness: 0.7 }),
        paperW: L.std({ color: '#fff4dc', emissive: '#ffd890', emissiveIntensity: 0.7, roughness: 0.7 }),
        rope: L.std({ color: '#c8a46a', roughness: 0.85 }),
        blossom: L.std({ color: '#ffb6d2', roughness: 0.8, emissive: '#ff8ab8', emissiveIntensity: 0.12 }),
        trunk: L.std({ color: '#4a3028', roughness: 0.9 }),
        mountain: L.std({ color: '#8a9ab8', roughness: 1 }),
        snow: L.std({ color: '#f4f6fa', roughness: 0.9 }),
      };
      const variantOf = (p) => p.v || (p.type === 'start' ? 'courtyard' : p.type === 'finish' ? 'moongate' : p.type === 'crumble' ? 'crumble'
        : p.type === 'bounce' ? 'lotus' : p.d >= 6 && p.w <= 4 ? 'bridge' : p.shape === 'cyl' && p.w <= 3 ? 'lantern' : 'pagoda');

      return {
        ventColor: '#ffe6f0',
        platform(p) {
          const g = new THREE.Group();
          const v = variantOf(p);
          const minD = Math.min(p.w, p.d);
          if (v === 'pagoda' || p.type === 'rot' || p.type === 'spin') {
            g.add(L.block(p, { top: M.planks, side: M.lacquer }, 2, { sideTile: p.h }));
            // mørkt tegltag (indenfor fodaftrykket) og en rød stamme under
            const roof = L.under(p, M.roof, Math.min(1.6, minD * 0.4), { tip: 0.55, segments: 4 });
            if (roof) g.add(roof);
            const post = L.pillar(p, M.lacquer, 14, minD * 0.32, 3);
            if (post) { post.position.y -= 1.2; g.add(post); }
          } else if (v === 'stone') {
            g.add(L.block(p, { top: M.granite, side: M.granite }, 2));
            const u = L.under(p, M.granite, 5, { jitter: 0.2 }); if (u) g.add(u);
          } else if (v === 'bridge') {
            g.add(L.block(p, { top: M.planks, side: M.lacquer }, 2, { sideTile: p.h }));
            const dep = L.depth(p, p.d * 0.25);
            if (dep > 0.3) { // bue under broen
              const arch = new THREE.Mesh(tr(new THREE.CylinderGeometry(p.d / 2 * 0.98, p.d / 2 * 0.98, p.w * 0.9, 24, 1, false, -PI / 2, PI).rotateZ(PI / 2).rotateY(PI / 2)), M.lacquer);
              arch.scale.y = dep / (p.d / 2); arch.position.y = -p.h / 2;
              g.add(arch);
            }
          } else if (v === 'lantern') {
            g.add(L.block(p, { top: M.granite, side: M.granite }, 1.5, { segments: 8 }));
            const glow = new THREE.Mesh(tr(new THREE.CylinderGeometry(p.w * 0.3, p.w * 0.3, 0.5, 8)), M.paperW);
            glow.position.y = -p.h / 2 - 0.25; g.add(glow);
            const col = L.pillar(p, M.granite, 6, p.w * 0.32, 2); if (col) { col.position.y -= 0.5; g.add(col); }
          } else if (v === 'koi') {
            g.add(L.block(p, { top: M.planks, side: M.planks }, 2));
            const pond = L.pillar(p, M.water, 0.6, 0.2, 2); if (pond) g.add(pond);
            const u = L.under(p, M.granite, 4, { jitter: 0.2 }); if (u) { u.position.y -= 0.6; g.add(u); }
          } else if (v === 'moongate' || v === 'courtyard') {
            g.add(L.block(p, { top: v === 'moongate' ? M.moon : M.gravel, side: M.plaster }, v === 'moongate' ? (p.shape === 'cyl' ? p.w : Math.min(p.w, p.d)) : 3, { tileTop: v !== 'moongate' }));
            const u = L.under(p, M.granite, 8, { jitter: 0.15 }); if (u) g.add(u);
          } else if (v === 'lotus') { // springpude: et stort lotusblad
            g.add(L.block(p, { top: M.lotus, side: M.lotusSide }, 2, { segments: 24 }));
            const flower = L.lathe([[0.05, 0], [0.35, 0.12], [0.5, 0.35], [0.3, 0.55], [0.01, 0.6]], M.pink, 10);
            flower.position.y = -p.h / 2 - 0.6; flower.rotation.x = PI; g.add(flower);
          } else { // smuldrende: gamle, revnede planker
            g.add(L.block(p, { top: M.cracked, side: M.cracked }, 2));
          }
          if (p.type === 'conveyor') g.children[0].material = [M.lacquer, M.lacquer, L.std({ map: L.beltTex('#5a3a22', '#7a5030', '#e8b84a'), roughness: 0.8 }), M.lacquer, M.lacquer, M.lacquer];
          if (p.type === 'vent') g.children[0].material = [M.granite, M.granite, L.std({ map: L.grateTex('#2a2a30', '#b8a070'), roughness: 0.6 }), M.granite, M.granite, M.granite];
          return g;
        },
        bar(b) {
          const g = new THREE.Group();
          if (b.v === 'bamboo') {
            g.add(L.barMesh(b, M.bamboo));
            const n = Math.max(2, Math.round(b.len / 0.5));
            for (let i = 1; i < n; i++) {
              const node = new THREE.Mesh(tr(new THREE.CylinderGeometry(b.r * 1.25, b.r * 1.25, 0.04, 10).rotateZ(PI / 2)), M.bambooNode);
              node.position.x = -b.len / 2 + i * b.len / n; g.add(node);
            }
          } else { // torii-bjælke
            g.add(L.barMesh(b, M.lacquer, b.r * 1.1));
            for (const sx of [-1, 1]) {
              const cap = new THREE.Mesh(tr(new THREE.BoxGeometry(0.16, b.r * 3, b.r * 3)), M.black);
              cap.position.x = sx * (b.len / 2 - 0.06); g.add(cap);
            }
          }
          return g;
        },
        anchor() { // tempelklokke
          const g = new THREE.Group();
          const bell = L.lathe([[0.01, 0.42], [0.12, 0.4], [0.2, 0.28], [0.24, 0.05], [0.3, -0.12], [0.26, -0.14]], M.bronze, 20);
          bell.position.y = -0.12; g.add(bell);
          return g;
        },
        zip(z) { // lanternesnor
          const g = new THREE.Group();
          const a = new THREE.Vector3(z.ax, z.ay, z.az), b = new THREE.Vector3(z.bx, z.by, z.bz);
          g.add(L.tube([a, b], 0.03, M.rope, 8));
          const n = Math.max(3, Math.round(a.distanceTo(b) / 2.2));
          const lg = tr(new THREE.SphereGeometry(0.24, 12, 8));
          for (let i = 1; i < n; i++) {
            const p = a.clone().lerp(b, i / n);
            const l = new THREE.Mesh(lg, i % 2 ? M.paper : M.paperW);
            l.position.set(p.x, p.y - 0.75, p.z); l.scale.y = 1.3;
            g.add(l); anim.lanterns.push(l);
          }
          for (const p of [a, b]) {
            const post = new THREE.Mesh(tr(new THREE.CylinderGeometry(0.12, 0.14, 4, 8)), M.lacquer);
            post.position.set(p.x, p.y - 1.7, p.z); g.add(post);
          }
          return g;
        },
        decor(data) {
          const root = new THREE.Group();
          const b = data.bounds, R0 = b.radius + 40;
          // Kirsebærtræer på små svævende øer
          const trunks = [], crowns = [];
          L.place(data, rng, 40, R0, R0 + 220, b.minY - 25, b.maxY - 5, 10, (x, y, z) => {
            const s = 1 + rng() * 1.5;
            trunks.push({ x, y: y + 3 * s, z, sx: s, sy: s * 1.2, sz: s, ry: rng() * TAU });
            for (let k = 0; k < 4; k++) crowns.push({ x: x + (rng() - 0.5) * 5 * s, y: y + 7 * s + rng() * 3 * s, z: z + (rng() - 0.5) * 5 * s, s: s * (2.4 + rng() * 1.6) });
            crowns.push({ x, y: y - 1.5 * s, z, s: s * 3.2, sy: s * 1.2, sx: s * 3.6, sz: s * 3.6 }); // ø (grønt græs)
          });
          root.add(L.instanced(new THREE.CylinderGeometry(0.4, 0.7, 6, 7), M.trunk, trunks));
          root.add(L.instanced(new THREE.IcosahedronGeometry(1, 1), M.blossom, crowns));
          // Pagodetårne og torii-porte i det fjerne
          L.place(data, rng, 6, R0 + 120, R0 + 360, b.minY - 40, b.minY - 20, 20, (x, y, z) => {
            const tower = new THREE.Group(); tower.position.set(x, y, z);
            const tiers = 4 + Math.floor(rng() * 3);
            for (let k = 0; k < tiers; k++) {
              const w = 22 - k * 3;
              const body = new THREE.Mesh(tr(new THREE.BoxGeometry(w * 0.7, 7, w * 0.7)), M.lacquer); body.position.y = k * 10 + 3.5;
              const roof = new THREE.Mesh(tr(new THREE.ConeGeometry(w * 0.8, 4, 4).rotateY(PI / 4)), M.roof); roof.position.y = k * 10 + 8.5;
              tower.add(body, roof);
            }
            root.add(tower);
          });
          L.place(data, rng, 8, R0 + 30, R0 + 200, b.minY - 10, b.maxY, 14, (x, y, z, a) => {
            const t = new THREE.Group(); t.position.set(x, y, z); t.rotation.y = -a;
            for (const sx of [-1, 1]) { const c = new THREE.Mesh(tr(new THREE.CylinderGeometry(0.6, 0.7, 14, 10)), M.lacquer); c.position.set(sx * 5, 7, 0); t.add(c); }
            const top = new THREE.Mesh(tr(new THREE.BoxGeometry(15, 1.2, 1.4)), M.black); top.position.y = 14.2;
            const mid = new THREE.Mesh(tr(new THREE.BoxGeometry(12, 0.9, 1)), M.lacquer); mid.position.y = 11.5;
            t.add(top, mid); root.add(t);
          });
          // Bjerge med sne i horisonten
          for (let i = 0; i < 9; i++) {
            const a = i / 9 * TAU + rng() * 0.3, r = b.radius + 700;
            const h = 220 + rng() * 260;
            const m = new THREE.Mesh(tr(new THREE.ConeGeometry(h * 0.9, h, 7)), M.mountain);
            m.position.set(b.cx + Math.cos(a) * r, ctx.lavaY + h / 2 - 20, b.cz + Math.sin(a) * r);
            const cap = new THREE.Mesh(tr(new THREE.ConeGeometry(h * 0.27, h * 0.3, 7)), M.snow);
            cap.position.y = h * 0.36; m.add(cap); root.add(m);
          }
          // Faldende kronblade
          const pos = [];
          for (let i = 0; i < 700; i++) pos.push(b.cx + (rng() - 0.5) * b.radius * 2.4, b.minY + rng() * (b.maxY - b.minY + 40), b.cz + (rng() - 0.5) * b.radius * 2.4);
          anim.petals = L.points(pos, '#ffb0d0', 3, 0.9);
          anim.petals.material.fog = true;
          root.add(anim.petals);
          return root;
        },
        update(dt, t) {
          if (anim.petals) { anim.petals.position.y = -((t * 1.2) % 20); anim.petals.position.x = Math.sin(t * 0.4) * 3; }
          for (let i = 0; i < anim.lanterns.length; i++) anim.lanterns[i].rotation.z = Math.sin(t * 1.5 + i) * 0.12;
        },
      };
    },
  };
})();
