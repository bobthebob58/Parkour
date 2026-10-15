/* =====================================================================
   VERDENSSÆT 'skyreef' – Himmelhavet (bane 14)
   Et koralrev, der svæver i himlen som under vand: bordkoraller,
   gopler som springpuder, mantaer og skildpadder som bevægelige
   platforme, boblesøjler, et hvalskelet med ribben som stænger,
   tang som trapez, perler som krogpunkter, kæmpemusling og fisk.
   ===================================================================== */
(function () {
  'use strict';

  window.SKYHOJ_THEMES.skyreef = {
    top: '#0a5a8a', horizon: '#5ad8d8', bottom: '#2a8aa0', sunElev: 62, sunAz: 0, sunColor: '#d8fff8', sunInt: 2.6,
    hemiSky: '#8af0f0', hemiInt: 1.15, fog: '#3aa8b8', fogNear: 50, fogFar: 460, cloud: '#c8fff8', clouds: 0.6, stars: 0,
    stone: '#e8d8c8', exposure: 1.1, lavaGlow: 0.9,
  };

  window.SKYHOJ_KITS.skyreef = {
    id: 'skyreef',
    name: 'Himmelhavet',
    variants: {
      coral: 'Bordkoral: flad, rosa-orange plade med polypper på en koralstamme (standard for p). Kasse/cyl w 2-8',
      brain: 'Hjernekoral: rund, bugtet, grøngul (standard for cyl). shape:"cyl" w 2-5',
      manta: 'Mantarokke: mørkeblå ryg med lys bug og vinger (standard for sidelæns bevægelige). Kasse w 3-6',
      turtle: 'Havskildpadde: skjoldet er platformen (standard for bevægelige frem/tilbage). Kasse/cyl w 3-5',
      vertebra: 'Hvirvel i hvalskelettet: benhvid, porøs (standard for smalle). Kasse w 1.5-3',
      clam: 'Kæmpemusling med perlemor (standard for finish). w 6-12',
      sand: 'Sandbanke med muslingeskaller og søstjerner (standard for start). w 6-12',
    },
    barVariants: 'Stænger er hvalribben (buede ben); trapez er tang. Svævebaner er strømme af bobler langs en tangsnor. Krogpunkter er perler.',
    create(ctx) {
      const { THREE } = ctx;
      const L = window.SKYHOJ_KITLIB(ctx);
      const PI = Math.PI, TAU = L.TAU, tr = L.tr;
      const rng = ctx.mulberry32(1400 + ctx.levelIndex);
      const anim = { jelly: [], fish: [], kelp: [], bubbles: [] };

      const coralTop = L.tex(256, (g, S) => { L.fill(g, S, S, '#ff9a7a'); L.speckle(g, S, S, ['#ffd0b8', '#e86a5a', '#fff0e0'], 900, 1.5, 3.5, rng); });
      const coralSide = L.tex(256, (g, S) => { L.grad(g, S, S, [[0, '#ff8a6a'], [1, '#c84a5a']]); L.speckle(g, S, S, ['#ffb89a', '#a83a4a'], 400, 1, 3, rng); });
      const brain = L.tex(256, (g, S) => {
        L.fill(g, S, S, '#c8d06a'); g.strokeStyle = '#8a9a3a'; g.lineWidth = 6;
        for (let i = 0; i < 26; i++) { let x = rng() * S, y = rng() * S, a = rng() * TAU; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 12; k++) { a += (rng() - 0.5) * 1.6; x += Math.cos(a) * 12; y += Math.sin(a) * 12; g.lineTo(x, y); } g.stroke(); }
      });
      const sand = L.tex(256, (g, S) => { L.fill(g, S, S, '#f0dcb0'); L.speckle(g, S, S, ['#e0c898', '#fff0d0', '#c8b080'], 1500, 1, 2.5, rng); });
      const bone = L.tex(256, (g, S) => { L.fill(g, S, S, '#efe6d6'); L.speckle(g, S, S, ['#d8ccb8', '#c8bca8', '#fffaf0'], 900, 1, 3, rng); });
      const nacre = L.tex(256, (g, S) => {
        const gr = g.createLinearGradient(0, 0, S, S);
        ['#f8e8ff', '#c8f0ff', '#fff0d8', '#e8d0ff'].forEach((c, i) => gr.addColorStop(i / 3, c));
        g.fillStyle = gr; g.fillRect(0, 0, S, S);
      });
      const mantaTex = L.tex(256, (g, S) => { L.fill(g, S, S, '#1e3a5a'); L.speckle(g, S, S, ['#e8f4ff', '#3a5a7a'], 200, 2, 6, rng); });
      const shell = L.tex(256, (g, S) => {
        L.fill(g, S, S, '#7a5a2a'); g.strokeStyle = '#c8a050'; g.lineWidth = 5;
        for (let y = 0; y < S + 50; y += 50) for (let x = (y / 50) % 2 ? 30 : 0; x < S + 60; x += 60) { g.beginPath(); for (let k = 0; k <= 6; k++) { const a = k / 6 * TAU; g.lineTo(x + Math.cos(a) * 28, y + Math.sin(a) * 28); } g.stroke(); }
      });
      const crackBone = L.tex(256, (g, S) => { L.fill(g, S, S, '#d8ccb8'); L.cracks(g, S, S, '#6a5a48', 14, rng, 3); });
      const M = {
        coralTop: L.std({ map: coralTop, bumpMap: coralTop, bumpScale: 2, roughness: 0.85 }),
        coralSide: L.std({ map: coralSide, roughness: 0.85 }),
        brain: L.std({ map: brain, bumpMap: brain, bumpScale: 3, roughness: 0.8 }),
        sand: L.std({ map: sand, roughness: 0.95 }),
        bone: L.std({ map: bone, bumpMap: bone, bumpScale: 1.5, roughness: 0.8 }),
        crackBone: L.std({ map: crackBone, roughness: 0.85 }),
        nacre: L.phys({ map: nacre, roughness: 0.15, metalness: 0.3, clearcoat: 1, iridescence: 0.8 }),
        clamShell: L.std({ color: '#7a6a8a', roughness: 0.6 }),
        manta: L.std({ map: mantaTex, roughness: 0.5 }),
        belly: L.std({ color: '#f0f4f8', roughness: 0.6 }),
        shell: L.std({ map: shell, roughness: 0.5 }),
        skin: L.std({ color: '#6a9a5a', roughness: 0.7 }),
        jelly: L.phys({ color: '#ffa8f0', roughness: 0.2, transmission: 0.3, thickness: 0.4, emissive: '#ff6ad8', emissiveIntensity: 0.5, transparent: true, opacity: 0.9 }),
        tentacle: L.std({ color: '#ffb8f0', emissive: '#ff6ad8', emissiveIntensity: 0.6, transparent: true, opacity: 0.7 }),
        kelp: L.std({ color: '#3a8a3a', roughness: 0.6 }),
        pearl: L.phys({ color: '#fff8f0', roughness: 0.1, clearcoat: 1, emissive: '#c8f0ff', emissiveIntensity: 0.4 }),
        fish: [L.std({ color: '#ffb23a', roughness: 0.4 }), L.std({ color: '#3ab8ff', roughness: 0.4 }), L.std({ color: '#ff5a8a', roughness: 0.4 })],
        bubble: tr(new THREE.MeshBasicMaterial({ color: '#e8ffff', transparent: true, opacity: 0.5, depthWrite: false })),
        caustic: L.glow('#aaffff', 0.25),
      };
      const variantOf = (p) => p.v || (p.type === 'start' ? 'sand' : p.type === 'finish' ? 'clam' : p.type === 'crumble' ? 'crumbly'
        : p.type === 'bounce' ? 'jelly' : p.move ? (p.move.axis[1] > 0.9 ? 'jelly' : p.move.axis[0] !== 0 && Math.abs(p.move.axis[0]) + Math.abs(p.move.axis[2]) > 0.5 && p.index % 2 ? 'turtle' : 'manta')
          : p.shape === 'cyl' ? 'brain' : Math.min(p.w, p.d) < 2.5 ? 'vertebra' : 'coral');

      return {
        ventColor: '#e8ffff',
        platform(p) {
          const g = new THREE.Group();
          const v = variantOf(p), minD = Math.min(p.w, p.d);
          if (v === 'jelly') { // glødende gople – toppen er klokken
            g.add(L.block(p, { top: M.jelly, side: M.jelly }, 2, { segments: 24 }));
            const n = 8;
            for (let i = 0; i < n; i++) {
              const a = i / n * TAU, r = minD * 0.32;
              const t = new THREE.Mesh(tr(new THREE.CylinderGeometry(0.05, 0.02, 3 + (i % 3), 5)), M.tentacle);
              t.position.set(Math.cos(a) * r, -p.h / 2 - 1.8, Math.sin(a) * r); g.add(t); anim.jelly.push(t);
            }
          } else if (v === 'manta') {
            g.add(L.block(p, { top: M.manta, side: M.manta }, minD, { tileTop: false }));
            const belly = L.under(p, M.belly, 0.6, { tip: 0.7 }); if (belly) g.add(belly);
            const tail = new THREE.Mesh(tr(new THREE.CylinderGeometry(0.06, 0.02, p.d * 0.8, 6).rotateX(PI / 2)), M.manta);
            tail.position.set(0, -0.1, p.d / 2 + p.d * 0.4); g.add(tail);
          } else if (v === 'turtle') {
            g.add(L.block(p, { top: M.shell, side: M.shell }, minD, { tileTop: false, segments: 16 }));
            const body = L.under(p, M.skin, 0.8, { tip: 0.75 }); if (body) g.add(body);
            for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
              const fl = new THREE.Mesh(tr(new THREE.SphereGeometry(0.4, 10, 8)), M.skin);
              fl.scale.set(1.6, 0.3, 0.8); fl.position.set(sx * p.w * 0.4, -p.h / 2 - 0.3, sz * (p.shape === 'cyl' ? p.w : p.d) * 0.4); g.add(fl);
            }
          } else if (v === 'clam') {
            g.add(L.block(p, { top: M.nacre, side: M.clamShell }, p.shape === 'cyl' ? p.w : minD, { tileTop: false }));
            const half = L.under(p, M.clamShell, 3, { tip: 0.3, segments: 18 }); if (half) g.add(half);
          } else if (v === 'sand') {
            g.add(L.block(p, { top: M.sand, side: M.coralSide }, 3));
            const u = L.under(p, M.coralSide, 8, { jitter: 0.3 }); if (u) g.add(u);
          } else if (v === 'vertebra' || v === 'crumbly') {
            g.add(L.block(p, { top: v === 'crumbly' ? M.crackBone : M.bone, side: v === 'crumbly' ? M.crackBone : M.bone }, 1.5));
            if (v === 'vertebra') { const u = L.under(p, M.bone, 1.4, { tip: 0.4 }); if (u) g.add(u); }
          } else if (v === 'brain') {
            g.add(L.block(p, { top: M.brain, side: M.brain }, 2, { segments: 24 }));
            const u = L.under(p, M.brain, p.w * 0.6, { tip: 0.3, segments: 24 }); if (u) g.add(u);
          } else { // bordkoral på en stamme
            g.add(L.block(p, { top: M.coralTop, side: M.coralSide }, 2));
            const stem = L.pillar(p, M.coralSide, 8 + minD, minD * 0.38, 2); if (stem) g.add(stem);
          }
          if (p.type === 'conveyor') g.children[0].material = [M.coralSide, M.coralSide, L.std({ map: L.beltTex('#2a7aa0', '#5ab8d8', '#e8ffff'), roughness: 0.5 }), M.coralSide, M.coralSide, M.coralSide];
          if (p.type === 'vent') g.children[0].material = [M.coralSide, M.coralSide, L.std({ map: L.grateTex('#8a4a4a', '#ffd0b8'), roughness: 0.8 }), M.coralSide, M.coralSide, M.coralSide];
          return g;
        },
        bar(b) {
          const g = new THREE.Group();
          if (b.swing) { g.add(L.barMesh(b, M.kelp, b.r * 1.2)); return g; }
          g.add(L.barMesh(b, M.bone, b.r * 1.15)); // hvalribben: buede ben ned fra stangens ender
          for (const sx of [-1, 1]) {
            const rib = new THREE.Mesh(tr(new THREE.TorusGeometry(1.2, 0.09, 6, 16, PI / 2)), M.bone);
            rib.position.set(sx * b.len / 2, -1.2, 0); rib.rotation.set(0, sx > 0 ? 0 : PI, 0); g.add(rib);
          }
          return g;
        },
        anchor() { // perle i en lille musling
          const g = new THREE.Group();
          g.add(new THREE.Mesh(tr(new THREE.SphereGeometry(0.3, 18, 14)), M.pearl));
          return g;
        },
        zip(z) {
          const g = new THREE.Group();
          const a = new THREE.Vector3(z.ax, z.ay, z.az), b = new THREE.Vector3(z.bx, z.by, z.bz);
          g.add(L.tube([a, b], 0.05, M.kelp, 8));
          return g;
        },
        decor(data) {
          const root = new THREE.Group();
          const b = data.bounds, R0 = b.radius + 30;
          // Boblesøjler (opvind) synlige som bobler
          for (const w of data.winds) {
            const pos = [];
            for (let i = 0; i < 120; i++) { const a = rng() * TAU, r = Math.sqrt(rng()) * w.r; pos.push(w.x + Math.cos(a) * r, w.y + rng() * w.h, w.z + Math.sin(a) * r); }
            const pts = L.points(pos, '#ffffff', 4, 0.8); pts.material.fog = true;
            root.add(pts); anim.bubbles.push({ m: pts, h: w.h });
          }
          // Koralrev-øer og tang rundt om banen
          const reefs = [], kelp = [];
          L.place(data, rng, 50, R0, R0 + 240, b.minY - 30, b.maxY, 12, (x, y, z) => {
            const s = 3 + rng() * 8;
            reefs.push({ x, y, z, sx: s * 1.6, sy: s, sz: s * 1.4, ry: rng() * TAU });
            for (let k = 0; k < 3; k++) kelp.push({ x: x + (rng() - 0.5) * s, y: y + s * 0.8 + 6, z: z + (rng() - 0.5) * s, sx: 0.5, sy: 12 + rng() * 10, sz: 0.5 });
          });
          root.add(L.instanced(new THREE.DodecahedronGeometry(1, 1), M.coralSide, reefs));
          const kelpMesh = L.instanced(new THREE.CylinderGeometry(0.3, 0.6, 1, 6), M.kelp, kelp);
          root.add(kelpMesh); anim.kelp.push(kelpMesh);
          // Hvalskelet i baggrunden
          const wx = b.cx + R0 + 60, wz = b.cz;
          const spine = L.tube([new THREE.Vector3(wx - 60, b.maxY + 30, wz), new THREE.Vector3(wx, b.maxY + 40, wz), new THREE.Vector3(wx + 60, b.maxY + 28, wz)], 1.6, M.bone, 30);
          root.add(spine);
          for (let i = -6; i <= 6; i++) {
            const rib = new THREE.Mesh(tr(new THREE.TorusGeometry(12, 0.8, 6, 20, PI)), M.bone);
            rib.position.set(wx + i * 8, b.maxY + 36, wz); rib.rotation.set(0, PI / 2, PI); root.add(rib);
          }
          // Fiskestimer
          for (let s = 0; s < 6; s++) {
            const school = new THREE.Group();
            const cx = b.cx + (rng() - 0.5) * b.radius * 1.6, cy = b.minY + rng() * (b.maxY - b.minY + 20), cz = b.cz + (rng() - 0.5) * b.radius * 1.6;
            if (!ctx.clearOfCourse(cx, cy, cz, 10)) continue;
            const list = [];
            for (let i = 0; i < 25; i++) list.push({ x: (rng() - 0.5) * 8, y: (rng() - 0.5) * 4, z: (rng() - 0.5) * 8, sx: 0.6, sy: 0.35, sz: 0.2 });
            school.add(L.instanced(new THREE.SphereGeometry(1, 8, 6), M.fish[s % 3], list));
            school.position.set(cx, cy, cz); root.add(school); anim.fish.push({ g: school, cx, cz, r: 6 + rng() * 10, ph: rng() * TAU });
          }
          // Lysstriber fra overfladen (kaustik)
          for (let i = 0; i < 10; i++) {
            const beam = new THREE.Mesh(tr(new THREE.PlaneGeometry(6, 200)), M.caustic);
            beam.position.set(b.cx + (rng() - 0.5) * b.radius * 2, b.maxY + 40, b.cz + (rng() - 0.5) * b.radius * 2);
            beam.rotation.set(0, rng() * PI, 0.2); beam.userData.noCastShadow = true; root.add(beam);
          }
          return root;
        },
        update(dt, t) {
          for (let i = 0; i < anim.jelly.length; i++) anim.jelly[i].rotation.x = Math.sin(t * 2 + i) * 0.2;
          for (const f of anim.fish) { const a = t * 0.3 + f.ph; f.g.position.x = f.cx + Math.cos(a) * f.r; f.g.position.z = f.cz + Math.sin(a) * f.r; f.g.rotation.y = -a; }
          for (const bb of anim.bubbles) bb.m.position.y = (t * 3) % (bb.h * 0.3);
          for (const k of anim.kelp) k.rotation.z = Math.sin(t * 0.8) * 0.01;
        },
      };
    },
  };
})();
