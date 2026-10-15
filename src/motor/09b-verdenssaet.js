/* =====================================================================
   9b. VERDENS-SÆT (world kits)
   Hver bane kan have sit eget udseende. Et sæt er ren grafik: fysikken er
   altid kasser/cylindre, som banebyggeren bestemmer. Kontrakten:
     WORLD_KITS[id] = { id, name, create(ctx) -> {
       platform(p) -> Object3D   (påkrævet; lokalt koordinatsystem, se nedenfor)
       bar(b)      -> Object3D   (valgfri; stang langs lokal X, længde b.len)
       anchor()    -> Object3D   (valgfri; krogpunkt til rebet)
       decor(data) -> Object3D   (valgfri; baggrund i verdenskoordinater)
       update(dt, t)             (valgfri; animation hver frame)
       ventColor                 (valgfri; farve på opvindens partikler)
     } }
   platform(p): origo = centrum af kollisionslegemet. Kasse: p.w langs X,
   p.h langs Y (top i +p.h/2), p.d langs Z (banens retning er -Z). Cylinder:
   diameter p.w. Rampe: kasse p.w x p.h x p.slopeLen (motoren hælder den).
   Mesh'er, der viser selve det faste legeme, markeres userData.solid = true.
   Intet må stikke mere end 4 cm op over toppen inden for fodaftrykket.
   ===================================================================== */
const WORLD_KITS = {};
window.SKYHOJ_KITS = WORLD_KITS;
window.SKYHOJ_THEMES = THEMES;
const SHARED_GPU = new Set(); // delte materialer/teksturer, der aldrig må frigives sammen med en bane

function markSharedGpu() {
  for (const m of Object.values(MAT)) SHARED_GPU.add(m);
  for (const t of Object.values(TEX)) (Array.isArray(t) ? t : [t]).forEach((x) => SHARED_GPU.add(x));
}

// Hjælpere til sættenes kulisser: hold banen fri, og find ud af, hvor dybt noget må hænge ned under en platform
function courseHelpers(data) {
  const pr = (p) => (p.shape === 'cyl' ? p.w / 2 : Math.hypot(p.w, p.d) / 2);
  const segs = [];
  for (let i = 0; i + 1 < data.plats.length; i++) {
    const a = data.plats[i], b = data.plats[i + 1];
    segs.push({ ax: a.x, az: a.z, ay: a.top, ar: pr(a), bx: b.x, bz: b.z, by: b.top, br: pr(b) });
  }
  for (const b of data.bars) {
    segs.push({ ax: b.x - (b.dx * b.len) / 2, az: b.z - (b.dz * b.len) / 2, ay: b.y - 2, ar: 1.5, bx: b.x + (b.dx * b.len) / 2, bz: b.z + (b.dz * b.len) / 2, by: b.y - 2, br: 1.5 });
  }
  for (const z of data.zips) segs.push({ ax: z.ax, az: z.az, ay: z.ay - 2, ar: 1.5, bx: z.bx, bz: z.bz, by: z.by - 2, br: 1.5 });
  return {
    // true, hvis punktet (x, y, z) ligger mindst `margin` meter fra banens "korridor" (platforme, stænger, svævebaner)
    clearOfCourse(x, y, z, margin = 4) {
      for (const s of segs) {
        const dx = s.bx - s.ax, dz = s.bz - s.az, L2 = dx * dx + dz * dz;
        const t = L2 > 0 ? clamp(((x - s.ax) * dx + (z - s.az) * dz) / L2, 0, 1) : 0;
        const cy = s.ay + (s.by - s.ay) * t;
        if (y < cy - 9 || y > cy + 12) continue;
        const r = s.ar + (s.br - s.ar) * t + margin;
        const hx = s.ax + dx * t - x, hz = s.az + dz * t - z;
        if (hx * hx + hz * hz < r * r) return false;
      }
      return true;
    },
    // Hvor mange meter under platformens bund er der frit (før en anden del af banen eller lavaen)?
    freeBelow(p) {
      const bottom = p.top - p.h, rp = pr(p);
      let free = bottom - CFG.lavaY + 2;
      for (const q of data.plats) {
        if (q === p || q.top >= bottom) continue;
        if (Math.hypot(q.x - p.x, q.z - p.z) < rp + pr(q) + 2.5) free = Math.min(free, bottom - (q.top + 4.5));
      }
      return Math.max(0, free);
    },
  };
}

function makeKitContext(level) {
  return {
    ...courseHelpers(level.data),
    lavaY: CFG.lavaY,
    THREE, TEX, MAT, DEG, clamp, lerp, damp, mulberry32,
    rng: mulberry32(4242 + level.index * 131),
    boxGeometry, cylGeometry, rockGeometry, makeCanvas, toTexture, paintPixels, tileNoise, textTexture,
    fwdVec, rightVec,
    theme: level.theme,
    levelIndex: level.index,
    levelName: level.def.name,
    track: (o) => { level.disposables.push(o); return o; },
  };
}

// Standard-sættet: svævende stenøer (bruges også som reserve for alt, et sæt ikke tegner)
WORLD_KITS.sten = {
  id: 'sten',
  name: 'Svævende sten',
  create(ctx) {
    const { THREE, MAT, TEX } = ctx;
    // Transportbånd: gummibånd med pile (tekstur rulles i update)
    let beltTex = null, beltMat = null, grateMat = null;
    const belt = () => {
      if (beltMat) return beltMat;
      const c = ctx.makeCanvas(128, 256), g = c.getContext('2d');
      g.fillStyle = '#26292e'; g.fillRect(0, 0, 128, 256);
      g.fillStyle = '#3a3f46';
      for (let y = 0; y < 256; y += 16) g.fillRect(0, y, 128, 3);
      g.fillStyle = '#f2b705';
      for (const y0 of [40, 168]) {
        g.beginPath(); g.moveTo(64, y0); g.lineTo(104, y0 + 40); g.lineTo(84, y0 + 40); g.lineTo(64, y0 + 20);
        g.lineTo(44, y0 + 40); g.lineTo(24, y0 + 40); g.closePath(); g.fill();
      }
      beltTex = ctx.track(ctx.toTexture(c));
      beltMat = ctx.track(new THREE.MeshStandardMaterial({ map: beltTex, roughness: 0.85 }));
      return beltMat;
    };
    const grate = () => {
      if (grateMat) return grateMat;
      const c = ctx.makeCanvas(128), g = c.getContext('2d');
      g.fillStyle = '#1b1f24'; g.fillRect(0, 0, 128, 128);
      g.fillStyle = '#8a95a3';
      for (let i = 0; i < 128; i += 16) { g.fillRect(i, 0, 5, 128); g.fillRect(0, i, 128, 5); }
      grateMat = ctx.track(new THREE.MeshStandardMaterial({ map: ctx.track(ctx.toTexture(c)), roughness: 0.5, metalness: 0.7 }));
      return grateMat;
    };
    const belts = [];
    return {
      ventColor: '#ffffff',
      platform(p) {
        const group = new THREE.Group();
        let top = MAT.stoneTop, side = MAT.rock, bottom = MAT.rock, tile = 3, tileTop = true, sideTile = 3;
        switch (p.type) {
          case 'ice': top = MAT.iceTop; side = MAT.iceSide; bottom = MAT.iceSide; break;
          case 'crumble': top = MAT.crumble; side = MAT.crumble; bottom = MAT.crumble; tile = 2.5; sideTile = 2.5; break;
          case 'move': case 'swing': top = MAT.metalTop; side = MAT.metalSide; bottom = MAT.metalSide; tileTop = false; sideTile = p.h; break;
          case 'bounce': top = MAT.bounceTop; side = MAT.bounceSide; bottom = MAT.bounceSide; tileTop = false; break;
          case 'conveyor': top = belt(); side = MAT.metalSide; bottom = MAT.metalSide; tile = 2; sideTile = p.h; break;
          case 'vent': top = grate(); side = MAT.metalSide; bottom = MAT.metalSide; tile = 1; sideTile = p.h; break;
          case 'rot': side = MAT.hub; break;
          case 'ramp': case 'rail': case 'boost': top = MAT.metalTop; side = MAT.hub; bottom = MAT.hub; tileTop = false; break;
          default: break;
        }
        const depth = p.type === 'ramp' ? p.slopeLen : p.d;
        let main;
        if (p.shape === 'cyl') main = new THREE.Mesh(ctx.track(ctx.cylGeometry(p.w / 2, p.h, tile, { tileTop })), [side, top, bottom]);
        else main = new THREE.Mesh(ctx.track(ctx.boxGeometry(p.w, p.h, depth, tile, { tileTop, sideTile })), [side, side, top, bottom, side, side]);
        main.userData.solid = true;
        group.add(main);
        if (p.type === 'conveyor') belts.push(p);
        const minDim = Math.min(p.w, p.d);
        if (['p', 'start', 'finish', 'ice', 'spin', 'rot'].includes(p.type) && minDim >= 2.4) {
          const r = minDim * 0.5, dep = ctx.clamp(minDim * 1.2, 2, 10);
          const rock = new THREE.Mesh(ctx.track(ctx.rockGeometry(r, dep, p.seed)), p.type === 'ice' ? MAT.iceSide : MAT.rock);
          rock.position.y = -p.h / 2 - dep / 2 + 0.02;
          if (p.shape !== 'cyl') rock.scale.set((p.w / minDim) * 0.97, 1, (p.d / minDim) * 0.97);
          group.add(rock);
        }
        if (p.type === 'move' || p.type === 'swing') { // antigrav-glød under svævende metalplader
          const glow = new THREE.Mesh(ctx.track(new THREE.PlaneGeometry(1, 1)), ctx.track(new THREE.MeshBasicMaterial({
            map: TEX.glow, color: '#59d8ff', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
          })));
          glow.rotation.x = Math.PI / 2;
          glow.scale.set(p.w * 1.3, p.d * 1.3, 1);
          glow.position.y = -p.h / 2 - 0.15;
          glow.userData.noCastShadow = true;
          group.add(glow);
        }
        if (p.type === 'spin') {
          const hub = new THREE.Mesh(ctx.track(new THREE.CylinderGeometry(0.22, 0.3, 0.8, 16)), MAT.hub);
          hub.position.y = p.h / 2 + 0.4;
          group.add(hub);
        }
        return group;
      },
      bar(b) {
        const m = new THREE.Mesh(ctx.track(new THREE.CylinderGeometry(b.r, b.r, b.len, 12)), MAT.hook);
        m.rotation.z = Math.PI / 2;
        const g = new THREE.Group();
        g.add(m);
        for (const sx of [-1, 1]) { // ophæng i enderne
          const cap = new THREE.Mesh(ctx.track(new THREE.SphereGeometry(b.r * 1.8, 10, 8)), MAT.hub);
          cap.position.x = (sx * b.len) / 2;
          g.add(cap);
        }
        return g;
      },
      update(dt) {
        if (beltTex && belts.length) beltTex.offset.y -= dt * (belts[0].belt / 2);
      },
    };
  },
};

