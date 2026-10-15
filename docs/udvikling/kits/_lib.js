/* =====================================================================
   Fælles værktøjskasse for verdenssættene: teksturer på lærred,
   platformblokke, underbygninger der holder sig inden for fodaftrykket,
   kulisser der holder banen fri, og små geometrihjælpere.
   Brug: const L = window.SKYHOJ_KITLIB(ctx) inde i create(ctx).
   ===================================================================== */
(function () {
  'use strict';
  window.SKYHOJ_KITLIB = function (ctx) {
    const { THREE } = ctx;
    const TAU = Math.PI * 2;
    const tr = (o) => ctx.track(o);
    const L = { TAU, tr };

    // ---- Materialer
    L.std = (o) => tr(new THREE.MeshStandardMaterial(o));
    L.phys = (o) => tr(new THREE.MeshPhysicalMaterial(o));
    L.basic = (o) => tr(new THREE.MeshBasicMaterial(o));
    L.glow = (color, opacity = 0.8) => tr(new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending }));

    // ---- Teksturer: tegn på et lærred og lav en gentagende tekstur
    L.tex = (size, paint, opts = {}) => {
      const c = ctx.makeCanvas(size, opts.h || size), g = c.getContext('2d');
      paint(g, size, opts.h || size);
      return tr(ctx.toTexture(c, { srgb: opts.srgb !== false, repeat: opts.repeat !== false }));
    };
    // Prikket støj (sten, sand, frosting …) i et sæt farver
    L.speckle = (g, w, h, colors, n, rMin, rMax, rng) => {
      for (let i = 0; i < n; i++) {
        g.fillStyle = colors[Math.floor(rng() * colors.length)];
        g.globalAlpha = 0.25 + rng() * 0.55;
        g.beginPath();
        g.arc(rng() * w, rng() * h, rMin + rng() * (rMax - rMin), 0, TAU);
        g.fill();
      }
      g.globalAlpha = 1;
    };
    // Revner (smuldrende platforme viser altid revner)
    L.cracks = (g, w, h, color, n, rng, width = 3) => {
      g.strokeStyle = color; g.lineCap = 'round'; g.lineJoin = 'round';
      for (let i = 0; i < n; i++) {
        let x = rng() * w, y = rng() * h, a = rng() * TAU;
        g.lineWidth = width * (0.6 + rng() * 0.8);
        g.beginPath(); g.moveTo(x, y);
        for (let k = 0; k < 7; k++) { a += (rng() - 0.5) * 1.3; x += Math.cos(a) * w * 0.08; y += Math.sin(a) * h * 0.08; g.lineTo(x, y); }
        g.stroke();
      }
    };
    L.fill = (g, w, h, color) => { g.fillStyle = color; g.fillRect(0, 0, w, h); };
    L.grad = (g, w, h, stops, vertical = true) => {
      const gr = vertical ? g.createLinearGradient(0, 0, 0, h) : g.createLinearGradient(0, 0, w, 0);
      stops.forEach(([o, c]) => gr.addColorStop(o, c));
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    };
    // Gitter (ventiler) og bånd med pile (transportbånd)
    L.grateTex = (bg, bar) => L.tex(128, (g, S) => {
      L.fill(g, S, S, bg); g.fillStyle = bar;
      for (let i = 0; i < S; i += 16) { g.fillRect(i, 0, 5, S); g.fillRect(0, i, S, 5); }
    });
    L.beltTex = (bg, stripe, arrow) => L.tex(128, (g, S) => {
      L.fill(g, S, S, bg); g.fillStyle = stripe;
      for (let y = 0; y < S; y += 16) g.fillRect(0, y, S, 3);
      g.fillStyle = arrow;
      for (const y0 of [24, 88]) { g.beginPath(); g.moveTo(64, y0); g.lineTo(100, y0 + 30); g.lineTo(82, y0 + 30); g.lineTo(64, y0 + 14); g.lineTo(46, y0 + 30); g.lineTo(28, y0 + 30); g.closePath(); g.fill(); }
    });

    // ---- Platformens hovedkrop (præcis kollisionskassen); markeres som fast flade
    L.block = (p, mats, tile = 2, opts = {}) => {
      const depth = p.type === 'ramp' ? p.slopeLen : p.d;
      const g = p.shape === 'cyl'
        ? ctx.cylGeometry(p.w / 2, p.h, tile, { tileTop: opts.tileTop !== false, segments: opts.segments || 40 })
        : ctx.boxGeometry(p.w, p.h, depth, tile, { tileTop: opts.tileTop !== false, sideTile: opts.sideTile || tile });
      const side = mats.side, top = mats.top || side, bottom = mats.bottom || side;
      const m = new THREE.Mesh(tr(g), p.shape === 'cyl' ? [side, top, bottom] : [side, side, top, bottom, side, side]);
      m.userData.solid = true;
      return m;
    };
    // Hvor dybt må noget hænge under platformen (holder resten af banen fri)
    L.depth = (p, want) => Math.max(0, Math.min(want, ctx.freeBelow(p)));
    // Tilspidset underbygning (kegle/pyramide) inden for fodaftrykket
    L.under = (p, mat, want, opts = {}) => {
      const depth = L.depth(p, want);
      if (depth < 0.4) return null;
      const seg = p.shape === 'cyl' ? (opts.segments || 24) : 4;
      const tip = opts.tip ?? 0.08;
      const g = new THREE.CylinderGeometry(1, tip, depth, seg, opts.rows || 4, false);
      if (p.shape !== 'cyl') g.rotateY(Math.PI / 4);
      const k = p.shape === 'cyl' ? p.w / 2 * 0.97 : 0.97 / Math.SQRT2;
      g.scale(p.shape === 'cyl' ? k : p.w * k, 1, p.shape === 'cyl' ? k : p.d * k);
      if (opts.jitter) {
        const P = g.attributes.position, rng = ctx.mulberry32(p.seed);
        for (let i = 0; i < P.count; i++) {
          const y = P.getY(i);
          if (y > depth / 2 - 0.01) continue;
          const f = 1 + (rng() - 0.5) * opts.jitter;
          P.setX(i, P.getX(i) * f); P.setZ(i, P.getZ(i) * f);
        }
        g.computeVertexNormals();
      }
      g.translate(0, -p.h / 2 - depth / 2 + 0.01, 0);
      return new THREE.Mesh(tr(g), mat);
    };
    // Lodret søjle/bygning under platformen (samme fodaftryk, evt. lidt indrykket)
    L.pillar = (p, mat, want, inset = 0, tile = 2) => {
      const depth = L.depth(p, want);
      if (depth < 0.4) return null;
      const g = p.shape === 'cyl'
        ? ctx.cylGeometry(Math.max(0.1, p.w / 2 - inset), depth, tile, { tileTop: false })
        : ctx.boxGeometry(Math.max(0.1, p.w - inset * 2), depth, Math.max(0.1, p.d - inset * 2), tile, { tileTop: false });
      g.translate(0, -p.h / 2 - depth / 2, 0);
      return new THREE.Mesh(tr(g), mat);
    };

    // ---- Kulisser: find steder, der ikke ligger i banen
    L.place = (data, rng, n, rMin, rMax, yMin, yMax, margin, fn) => {
      const b = data.bounds;
      let made = 0;
      for (let i = 0; i < n * 6 && made < n; i++) {
        const a = rng() * TAU, r = rMin + rng() * (rMax - rMin);
        const x = b.cx + Math.cos(a) * r, z = b.cz + Math.sin(a) * r, y = yMin + rng() * (yMax - yMin);
        if (!ctx.clearOfCourse(x, y, z, margin)) continue;
        fn(x, y, z, a, made++);
      }
      return made;
    };
    // Mange ens ting i ét draw call
    L.instanced = (geo, mat, list, castShadow = false) => {
      const m = new THREE.InstancedMesh(tr(geo), mat, Math.max(1, list.length));
      const o = new THREE.Object3D();
      list.forEach((t, i) => {
        o.position.set(t.x, t.y, t.z);
        o.rotation.set(t.rx || 0, t.ry || 0, t.rz || 0);
        const s = t.s || 1;
        o.scale.set(t.sx || s, t.sy || s, t.sz || s);
        o.updateMatrix();
        m.setMatrixAt(i, o.matrix);
      });
      m.count = list.length;
      m.castShadow = castShadow;
      m.userData.noCastShadow = !castShadow;
      return m;
    };
    // Rør/kabel langs en kurve
    L.tube = (pts, r, mat, seg = 40) => new THREE.Mesh(tr(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), seg, r, 8)), mat);
    // Drejet profil (vaser, svampe, lanterner …): pts = [[r, y], …]
    L.lathe = (pts, mat, seg = 24) => new THREE.Mesh(tr(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg)), mat);
    // Stjernehimmel/partikler som punkter langt væk (uden tåge)
    L.points = (positions, color, size, opacity = 1) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      return new THREE.Points(tr(g), tr(new THREE.PointsMaterial({ color, size, sizeAttenuation: false, transparent: true, opacity, fog: false, depthWrite: false })));
    };
    // En stang (cylinder langs lokal X)
    L.barMesh = (b, mat, r = b.r) => new THREE.Mesh(tr(new THREE.CylinderGeometry(r, r, b.len, 12).rotateZ(Math.PI / 2)), mat);
    return L;
  };
})();
