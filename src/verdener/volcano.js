/* =====================================================================
   VERDENSSÆT 'volcano' – Vulkanen (bane 13)
   Basaltsøjler, afkølet lavaskorpe med glødende revner, gejsere,
   varmeventiler, varme kanter, kæder og lavafald under en askehimmel.
   ===================================================================== */
(function () {
  'use strict';

  // Askehimmel: mørk røg foroven, glødende orange horisont, svag sol gennem røgen
  window.SKYHOJ_THEMES.volcano = {
    top: '#1c1416', horizon: '#c4512a', bottom: '#5a1e14', sunElev: 22, sunAz: -40, sunColor: '#ffb27a', sunInt: 2.2,
    hemiSky: '#b08070', hemiInt: 0.95, fog: '#5c2c22', fogNear: 60, fogFar: 520, cloud: '#6b4a44', clouds: 0.75, stars: 0,
    stone: '#9a8a84', exposure: 1.12, lavaGlow: 1.7,
  };

  window.SKYHOJ_KITS.volcano = {
    id: 'volcano',
    name: 'Vulkanen',
    variants: {
      hex: 'Sekskantet basaltsøjle med søjler ned i dybet (standard for p). shape:"cyl" w 2-5 (kasse = firkantet basaltblok)',
      crust: 'Afkølet lavaskorpe: sort, ru top med glødende revner. Kasse w 3-8, h 0.5-1',
      ledge: 'Klippehylde i vulkanens flanke: ru basalt med en glødende sprække under. Kasse w 2-6, d 2-4',
      obsidian: 'Blankt sort obsidian-glas (ser glat ud – brug til ice eller slick). Kasse/cyl w 2-5',
      rim: 'Kraterkant: rødbrun, svovlgul skorpe og glødende runer (standard for finish). w 8-12',
      plaza: 'Askeplads af mørk basalt med fliser (standard for start). w 8-12',
    },
    barVariants: 'Stænger er tunge jernkæder (led på led). Svævebaner er kæder. Krogpunkter er glødende ildsten.',
    create(ctx) {
      const { THREE } = ctx;
      const L = window.SKYHOJ_KITLIB(ctx);
      const PI = Math.PI, TAU = L.TAU, tr = L.tr;
      const rng = ctx.mulberry32(1300 + ctx.levelIndex);
      const anim = { flows: [], embers: [], smoke: [] };

      // ---- Teksturer
      const basaltTop = L.tex(256, (g, S) => {
        L.fill(g, S, S, '#3a3433');
        L.speckle(g, S, S, ['#4b4442', '#2a2524', '#5a514e'], 500, 1, 5, rng);
        g.strokeStyle = '#211c1c'; g.lineWidth = 3; // sekskantmønster
        for (let y = 0; y < S + 40; y += 37) for (let x = (y / 37) % 2 ? 21 : 0; x < S + 40; x += 42) {
          g.beginPath();
          for (let k = 0; k <= 6; k++) { const a = k / 6 * TAU; g.lineTo(x + Math.cos(a) * 21, y + Math.sin(a) * 21); }
          g.stroke();
        }
      });
      const basaltSide = L.tex(256, (g, S) => {
        L.grad(g, S, S, [[0, '#4a4240'], [1, '#2c2625']]);
        g.fillStyle = '#1f1a1a';
        for (let x = 0; x < S; x += 24 + Math.floor(rng() * 10)) g.fillRect(x, 0, 3, S);
        L.speckle(g, S, S, ['#5b5350', '#231e1d'], 300, 1, 4, rng);
      });
      const crackTex = L.tex(256, (g, S) => {
        L.fill(g, S, S, '#000000');
        L.cracks(g, S, S, '#ff6a1a', 14, rng, 5);
        L.cracks(g, S, S, '#ffd27a', 8, rng, 2);
      });
      const crustTop = L.tex(256, (g, S) => {
        L.fill(g, S, S, '#2a2322');
        L.speckle(g, S, S, ['#3d3433', '#1a1514', '#4a3d38'], 700, 1, 6, rng);
        L.cracks(g, S, S, '#120e0d', 18, rng, 4);
      });
      const sulfur = L.tex(256, (g, S) => {
        L.fill(g, S, S, '#7a3f22');
        L.speckle(g, S, S, ['#e8c547', '#c98a2b', '#5a2a18', '#f2dc6a'], 600, 2, 9, rng);
      });
      const runes = L.tex(256, (g, S) => {
        L.fill(g, S, S, '#000000');
        g.strokeStyle = '#ff8a2a'; g.lineWidth = 6; g.beginPath(); g.arc(S / 2, S / 2, S * 0.42, 0, TAU); g.stroke();
        g.lineWidth = 4;
        for (let k = 0; k < 8; k++) {
          const a = k / 8 * TAU, x = S / 2 + Math.cos(a) * S * 0.33, y = S / 2 + Math.sin(a) * S * 0.33;
          g.beginPath(); g.moveTo(x - 8, y - 10); g.lineTo(x + 8, y); g.lineTo(x - 6, y + 10); g.stroke();
        }
      }, { repeat: false });
      const flowTex = L.tex(128, (g, S) => {
        L.grad(g, S, S, [[0, '#ffdd77'], [0.4, '#ff7a1a'], [1, '#b52a08']], false);
        g.globalAlpha = 0.5;
        for (let i = 0; i < 40; i++) { g.fillStyle = rng() < 0.5 ? '#ffe9a0' : '#8a1a04'; g.fillRect(rng() * S, rng() * S, 2 + rng() * 10, 10 + rng() * 40); }
        g.globalAlpha = 1;
      });

      // ---- Materialer
      const M = {
        basaltTop: L.std({ map: basaltTop, bumpMap: basaltTop, bumpScale: 1.5, roughness: 0.92 }),
        basaltSide: L.std({ map: basaltSide, bumpMap: basaltSide, bumpScale: 2, roughness: 0.95 }),
        glowSide: L.std({ map: basaltSide, roughness: 0.9, emissive: '#ff5a10', emissiveMap: crackTex, emissiveIntensity: 1.4 }),
        crust: L.std({ map: crustTop, roughness: 0.95, emissive: '#ff5a10', emissiveMap: crackTex, emissiveIntensity: 1.6 }),
        crustSide: L.std({ map: crustTop, roughness: 0.95, emissive: '#ff4a08', emissiveMap: crackTex, emissiveIntensity: 1.1 }),
        sulfur: L.std({ map: sulfur, bumpMap: sulfur, bumpScale: 1.2, roughness: 0.85 }),
        obsidian: L.phys({ color: '#0d0b10', roughness: 0.05, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.03 }),
        obsidianSide: L.phys({ color: '#1a1420', roughness: 0.12, metalness: 0.3, clearcoat: 1 }),
        rim: L.std({ map: sulfur, roughness: 0.8, emissive: '#ff7a20', emissiveMap: runes, emissiveIntensity: 1.6 }),
        iron: L.std({ color: '#3a3330', roughness: 0.55, metalness: 0.85 }),
        hotIron: L.std({ color: '#5a3020', roughness: 0.5, metalness: 0.7, emissive: '#ff4a10', emissiveIntensity: 0.35 }),
        steam: tr(new THREE.MeshBasicMaterial({ map: ctx.TEX.glow, color: '#ffd8b0', transparent: true, opacity: 0.35, depthWrite: false })),
        flow: tr(new THREE.MeshBasicMaterial({ map: flowTex, transparent: true, opacity: 0.95, fog: false })),
        ember: L.std({ color: '#2a1a14', roughness: 0.7, emissive: '#ff6a18', emissiveIntensity: 2.2 }),
      };
      const variantOf = (p) => {
        if (p.v) return p.v;
        if (p.type === 'start') return 'plaza';
        if (p.type === 'finish') return 'rim';
        if (p.type === 'crumble') return 'crust';
        if (p.type === 'ice') return 'obsidian';
        return p.shape === 'cyl' ? 'hex' : 'ledge';
      };

      // Sekskantet basaltsøjle (indskrevet i cylinderen – toppen ligger inden for fodaftrykket)
      const hexColumn = (p, topMat, sideMat) => {
        const R = p.w / 2;
        const g = new THREE.CylinderGeometry(R, R, p.h, 6, 1);
        const m = new THREE.Mesh(tr(g), [sideMat, topMat, sideMat]);
        m.userData.solid = true;
        return m;
      };

      return {
        ventColor: '#ffb58a',
        slickColor: '#ff7a2a',
        platform(p) {
          const g = new THREE.Group();
          const v = variantOf(p);
          let main;
          switch (p.type) {
            case 'bounce': { // gejser: svovlgul kegle med et damphul
              main = L.block(p, { top: M.sulfur, side: M.basaltSide }, 2);
              const vent = new THREE.Mesh(tr(new THREE.CircleGeometry(Math.min(p.w, p.d) * 0.22, 24).rotateX(-PI / 2)), M.ember);
              vent.position.y = p.h / 2 + 0.02;
              g.add(vent);
              const puff = new THREE.Sprite(M.steam);
              puff.scale.set(p.w * 0.9, p.w * 1.2, 1); puff.position.y = p.h / 2 + p.w * 0.6;
              g.add(puff); anim.smoke.push(puff);
              break;
            }
            case 'vent': {
              const grate = L.std({ map: L.grateTex('#1a1110', '#4a3a36'), roughness: 0.8, emissive: '#ff5a10', emissiveIntensity: 0.6 });
              main = L.block(p, { top: grate, side: M.basaltSide }, 1);
              break;
            }
            case 'conveyor': { // glødende lavastrøm under en skorpe, der flyder
              main = L.block(p, { top: M.crust, side: M.basaltSide }, 2);
              break;
            }
            case 'spin': case 'rot': main = hexColumn(p, M.basaltTop, M.glowSide); break;
            default:
              if (v === 'hex') main = p.shape === 'cyl' ? hexColumn(p, M.basaltTop, M.basaltSide) : L.block(p, { top: M.basaltTop, side: M.basaltSide }, 2);
              else if (v === 'crust') main = L.block(p, { top: M.crust, side: M.crustSide }, 2);
              else if (v === 'obsidian') main = L.block(p, { top: M.obsidian, side: M.obsidianSide }, 2);
              else if (v === 'rim') main = L.block(p, { top: M.rim, side: M.basaltSide }, p.shape === 'cyl' ? p.w : 2, { tileTop: false });
              else main = L.block(p, { top: M.basaltTop, side: M.basaltSide }, 2);
          }
          g.add(main);
          // Underbygning: basaltsøjler ned i dybet (bevægelige søjler får en kortere stamme)
          const want = p.kin ? 10 : 6 + Math.min(p.w, p.d) * 2;
          if (p.type !== 'crumble' && v !== 'crust') {
            const u = v === 'hex' || p.type === 'spin' || p.type === 'rot'
              ? L.pillar(p, p.kin ? M.glowSide : M.basaltSide, want, 0.04)
              : L.under(p, M.basaltSide, want, { jitter: 0.25 });
            if (u) g.add(u);
          } else {
            const u = L.under(p, M.crustSide, 1.6, { tip: 0.4 });
            if (u) g.add(u);
          }
          return g;
        },
        bar(b) { // tung jernkæde: stang + led
          const g = new THREE.Group();
          g.add(L.barMesh(b, M.iron));
          const n = Math.max(2, Math.round(b.len / 0.32));
          const link = tr(new THREE.TorusGeometry(0.11, 0.03, 6, 12));
          for (let i = 0; i < n; i++) {
            const l = new THREE.Mesh(link, M.hotIron);
            l.position.x = -b.len / 2 + (i + 0.5) * b.len / n;
            l.rotation.y = PI / 2; l.rotation.x = i % 2 ? PI / 2 : 0;
            g.add(l);
          }
          return g;
        },
        anchor() { // glødende ildsten
          const g = new THREE.Group();
          const rock = new THREE.Mesh(tr(new THREE.IcosahedronGeometry(0.34, 0)), M.ember);
          rock.rotation.set(0.4, 0.7, 0.2);
          g.add(rock);
          return g;
        },
        zip(z) { // kæde-svævebane med jernmaster
          const g = new THREE.Group();
          const a = new THREE.Vector3(z.ax, z.ay, z.az), b = new THREE.Vector3(z.bx, z.by, z.bz);
          g.add(L.tube([a, a.clone().lerp(b, 0.5).add(new THREE.Vector3(0, -0.15, 0)), b], 0.045, M.iron, 24));
          for (const p of [a, b]) {
            const post = new THREE.Mesh(tr(new THREE.CylinderGeometry(0.14, 0.2, 4, 8)), M.iron);
            post.position.set(p.x, p.y - 1.7, p.z);
            g.add(post);
          }
          return g;
        },
        decor(data) {
          const root = new THREE.Group();
          const b = data.bounds, R0 = b.radius + 60;
          // Hovedvulkanen bag målet: stor kegle med krater og lavafald
          const fin = data.plats[data.plats.length - 1];
          const dir = Math.atan2(fin.z - b.cz, fin.x - b.cx);
          const vx = b.cx + Math.cos(dir) * (R0 + 220), vz = b.cz + Math.sin(dir) * (R0 + 220);
          const cone = L.lathe([[0.01, 140], [40, 136], [70, 110], [140, 30], [230, -60]], M.basaltSide, 48);
          cone.position.set(vx, ctx.lavaY + 10, vz);
          root.add(cone);
          const glowTop = new THREE.Mesh(tr(new THREE.CircleGeometry(38, 32).rotateX(-PI / 2)), M.flow);
          glowTop.position.set(vx, ctx.lavaY + 147, vz);
          root.add(glowTop);
          for (let k = 0; k < 5; k++) { // lavafald ned ad siden
            const a = dir + PI + (k - 2) * 0.35;
            const flow = new THREE.Mesh(tr(new THREE.PlaneGeometry(14, 150)), M.flow);
            flow.position.set(vx + Math.cos(a) * 90, ctx.lavaY + 75, vz + Math.sin(a) * 90);
            flow.lookAt(b.cx, ctx.lavaY + 75, b.cz);
            flow.rotation.x -= 0.5;
            root.add(flow);
            anim.flows.push(flow);
          }
          // Spidse basalttårne og røgsøjler rundt om banen
          const spireGeo = new THREE.CylinderGeometry(0.5, 1, 1, 6);
          const spires = [];
          L.place(data, rng, 40, R0, R0 + 260, ctx.lavaY + 10, ctx.lavaY + 10, 12, (x, y, z) => {
            const h = 30 + rng() * 90, r = 4 + rng() * 10;
            spires.push({ x, y: y + h / 2, z, sx: r, sy: h, sz: r, ry: rng() * TAU });
          });
          root.add(L.instanced(spireGeo, M.basaltSide, spires));
          L.place(data, rng, 8, R0 + 20, R0 + 200, b.minY - 10, b.minY + 10, 20, (x, y, z) => {
            const s = new THREE.Sprite(M.steam);
            s.scale.set(60, 120, 1); s.position.set(x, y + 40, z);
            root.add(s); anim.smoke.push(s);
          });
          // Flyvende gløder og aske
          const pos = [];
          for (let i = 0; i < 500; i++) pos.push(b.cx + (rng() - 0.5) * b.radius * 3, b.minY - 30 + rng() * 120, b.cz + (rng() - 0.5) * b.radius * 3);
          const embers = L.points(pos, '#ffa040', 2.5, 0.85);
          root.add(embers); anim.embers.push(embers);
          return root;
        },
        update(dt, t) {
          flowTex.offset.y = -t * 0.35;
          for (const s of anim.smoke) s.material.opacity = 0.3 + Math.sin(t * 0.7) * 0.05;
          for (const e of anim.embers) { e.position.y = (t * 1.5) % 30; e.material.opacity = 0.6 + Math.sin(t * 5) * 0.25; }
        },
      };
    },
  };
})();
