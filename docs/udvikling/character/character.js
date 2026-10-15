/* =====================================================================
   Skyhøj Parkour – realistisk løber
   Procedural figur af standard Three.js-geometri:
   - led-hierarki: bækken › ryg › bryst › nakke › hoved; skulder › overarm ›
     underarm › hånd (håndflade, tommel, 4 fingre i 2 led); hofte › lår ›
     skinneben › fod › tå
   - to-leds IK for arme og ben, afstandsdrevet løbecyklus (fødderne glider ikke)
   - salto, hænge-, klatre- og rebstillinger, skateboard og udstyr
   Bruges som: CHARACTER = createCharacterModule(THREE)
   ===================================================================== */
window.createCharacterModule = function (THREE) {
  'use strict';
  // Konstanter fra spillets CFG (kopieret – figuren læser ikke CFG)
  const RADIUS = 0.42;      // roden er kroppens centrum; fødderne står 0.42 m under
  const RUN_SPEED = 9;      // fuld løbefart (m/s)
  const HANG_DROP = 1.72;   // hænderne er 1.72 m over roden, når man hænger
  const WALL_GAP = 0.47;    // … og kanten er 0.47 m foran roden (mod lokal −Z)

  // Kroppens mål i meter over fodlinjen (1.80 m høj, ca. 7.5 hoveder)
  const HIP_Y = 0.95, HIP_X = 0.092, THIGH = 0.445, SHIN = 0.42, ANKLE_H = 0.085;
  const UPPER = 0.29, FORE = 0.265;
  const SPINE_Y = 0.09, CHEST_Y = 0.17, NECK_Y = 0.29, HEAD_Y = 0.085;
  const CLAV_X = 0.02, CLAV_Y = 0.22, SHO_X = 0.165, SHO_Y = 0.015, SHO_Z = 0.012;
  const PIVOT_Y = 0.9;      // saltoens drejepunkt over fødderne
  const DECK = 0.11;        // skateboardets dæk over fodlinjen
  const EYE_X = 0.031, EYE_Y = 0.098, EYE_Z = -0.079;

  // ---------- Små hjælpere ----------
  const V2 = THREE.Vector2, V3 = THREE.Vector3, Q = THREE.Quaternion, M4 = THREE.Matrix4;
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
  const frac = (x) => x - Math.floor(x);
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const UPV = new V3(0, 1, 0), DOWN = new V3(0, -1, 0);
  function rng(seed) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }
  function spline(K, w) { // Catmull-Rom gennem jævnt fordelte nøgler (w 0..1)
    const n = K.length - 1, x = clamp(w, 0, 1) * n, i = Math.min(n - 1, Math.floor(x)), t = x - i;
    const p0 = K[Math.max(0, i - 1)], p1 = K[i], p2 = K[i + 1], p3 = K[Math.min(n, i + 2)];
    return 0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (3 * p1 - p0 - 3 * p2 + p3) * t * t * t);
  }

  // ---------- Geometri ----------
  const _m = new M4(), _q = new Q(), _e = new THREE.Euler(), _v = new V3(), _s = new V3();
  function xf(g, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    _m.compose(_v.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz));
    return g.applyMatrix4(_m);
  }
  const lathe = (pts, seg = 16) => new THREE.LatheGeometry(pts.map((p) => new V2(p[0], p[1])), seg);
  const ball = (w = 16, h = 12) => new THREE.SphereGeometry(1, w, h);
  function shape(g, fn) { // flyt hjørnepunkter og genberegn normaler
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { _v.fromBufferAttribute(p, i); fn(_v); p.setXYZ(i, _v.x, _v.y, _v.z); }
    g.computeVertexNormals();
    return g;
  }
  const capsule = (r, len) => new THREE.CapsuleGeometry(r, len, 3, 8).translate(0, -len / 2, 0);
  const plain = (g) => merge([[g, 0xffffff]]);

  // Flet dele sammen til én geometri med punktfarver: [[geometri, farve | fn(v, c)], …]
  const _col = new THREE.Color();
  function merge(parts) {
    let nv = 0, ni = 0;
    for (const [g] of parts) { nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), col = new Float32Array(nv * 3);
    const idx = nv > 65000 ? new Uint32Array(ni) : new Uint16Array(ni);
    let vo = 0, io = 0;
    for (const [g, c] of parts) {
      const P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv, n = P.count, fn = typeof c === 'function';
      if (!fn) _col.set(c === undefined ? 0xffffff : c);
      for (let i = 0; i < n; i++) {
        const k = vo + i;
        _v.fromBufferAttribute(P, i);
        pos[k * 3] = _v.x; pos[k * 3 + 1] = _v.y; pos[k * 3 + 2] = _v.z;
        if (N) { nor[k * 3] = N.getX(i); nor[k * 3 + 1] = N.getY(i); nor[k * 3 + 2] = N.getZ(i); }
        if (U) { uv[k * 2] = U.getX(i); uv[k * 2 + 1] = U.getY(i); }
        if (fn) c(_v, _col, i);
        col[k * 3] = _col.r; col[k * 3 + 1] = _col.g; col[k * 3 + 2] = _col.b;
      }
      if (g.index) for (let i = 0; i < g.index.count; i++) idx[io++] = g.index.getX(i) + vo;
      else for (let i = 0; i < n; i++) idx[io++] = i + vo;
      vo += n;
      g.dispose();
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    out.setIndex(new THREE.BufferAttribute(idx, 1));
    out.computeBoundingSphere();
    return out;
  }

  // Farver (stof-materialerne er hvide; farven ligger i punktfarverne)
  const C = {
    hood: '#e4472d', hoodDk: '#b93723', pocket: '#d33f28', pants: '#26334d', pantsDk: '#1b2438', stripe: '#c9d1e0',
    shoe: '#f3f3f0', sole: '#f7f6f2', outsole: '#38383b', grey: '#c3c8d0', accent: '#ffcf33', cord: '#f0ede6',
  };

  // Stof-normalkort (lille strik-mønster), deles af alle figurer
  let FABRIC_N = null;
  function fabricNormal() {
    if (FABRIC_N || typeof document === 'undefined') return FABRIC_N;
    const S = 64, cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const ctx = cv.getContext('2d'), img = ctx.createImageData(S, S), R = rng(3), h = new Float32Array(S * S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) h[y * S + x] = 0.35 * Math.sin((x / S) * TAU * 8) * Math.sin((y / S) * TAU * 16) + 0.3 * R();
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const dx = h[y * S + ((x + 1) % S)] - h[y * S + ((x + S - 1) % S)], dy = h[((y + 1) % S) * S + x] - h[((y + S - 1) % S) * S + x];
      const l = Math.hypot(dx, dy, 1), k = (y * S + x) * 4;
      img.data[k] = (-dx / l * 0.5 + 0.5) * 255; img.data[k + 1] = (-dy / l * 0.5 + 0.5) * 255; img.data[k + 2] = (1 / l * 0.5 + 0.5) * 255; img.data[k + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    FABRIC_N = new THREE.CanvasTexture(cv);
    FABRIC_N.wrapS = FABRIC_N.wrapT = THREE.RepeatWrapping;
    FABRIC_N.repeat.set(5, 5);
    return FABRIC_N;
  }

  const SKIN = new THREE.Color('#d8a184'), GLOVE = new THREE.Color('#2a2e35'), WHITE = new THREE.Color('#ffffff'), CHALKG = new THREE.Color('#d8d8d4');
  function makeMaterials() {
    const phys = (o) => new THREE.MeshPhysicalMaterial(o);
    const nm = fabricNormal();
    const fabric = (color, sheenColor, rough) => phys({
      color, roughness: rough, sheen: 1, sheenRoughness: 0.55, sheenColor: new THREE.Color(sheenColor),
      vertexColors: true, normalMap: nm, normalScale: new V2(0.35, 0.35),
    });
    const skinM = () => phys({ color: SKIN.clone(), roughness: 0.5, sheen: 0.35, sheenRoughness: 0.45, sheenColor: new THREE.Color('#ffc2a8'), vertexColors: true });
    return {
      skin: skinM(), hand: skinM(),
      hoodie: fabric('#ffffff', '#ffb8a2', 0.86), pants: fabric('#ffffff', '#8796c4', 0.9), cord: fabric('#ffffff', '#ffffff', 0.8),
      glove: fabric(GLOVE.clone(), '#7a8290', 0.8), gear: fabric('#ffffff', '#ffffff', 0.75), rope: fabric('#ffffff', '#a8e6ff', 0.75),
      shoe: phys({ color: '#ffffff', roughness: 0.45, clearcoat: 0.15, vertexColors: true }),
      hair: phys({ color: '#ffffff', roughness: 0.7, sheen: 0.6, sheenRoughness: 0.4, sheenColor: new THREE.Color('#7a5a40'), vertexColors: true }),
      eye: phys({ color: '#f1eee8', roughness: 0.25, clearcoat: 0.6 }),
      iris: phys({ color: '#ffffff', roughness: 0.2, clearcoat: 0.8, vertexColors: true }),
      lips: phys({ color: '#b97668', roughness: 0.45, sheen: 0.3, sheenColor: new THREE.Color('#ffb0a0') }),
      band: fabric('#ffffff', '#fff1b0', 0.8),
      hard: phys({ color: '#ffffff', roughness: 0.38, clearcoat: 0.6, vertexColors: true }),
      deck: phys({ color: '#ffffff', roughness: 0.7, vertexColors: true }),
      metal: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.35, metalness: 0.85, vertexColors: true }),
      wheel: phys({ color: '#ffffff', roughness: 0.4, vertexColors: true }),
    };
  }

  // --- Krop ---
  function pelvisGeo() {
    const g = xf(lathe([[0.03, -0.12], [0.1, -0.108], [0.148, -0.072], [0.165, -0.02], [0.164, 0.05], [0.154, 0.13]], 20), 0, 0, 0, 0, 0, 0, 1, 1, 0.74);
    return merge([[g, C.pants]]);
  }
  function abdomenGeo() {
    const g = xf(lathe([[0.168, -0.14], [0.173, -0.125], [0.172, -0.1], [0.167, -0.05], [0.161, 0.02], [0.158, 0.1], [0.163, 0.17], [0.17, 0.21]], 24), 0, 0, 0, 0, 0, 0, 1, 1, 0.72);
    const inPocket = (v) => v.z < -0.05 && Math.abs(v.x) < 0.098 && v.y > -0.1 && v.y < 0.0;
    shape(g, (v) => { if (inPocket(v)) v.z *= 1.05; });
    return merge([[g, (v, c) => c.set(v.y < -0.112 ? C.hoodDk : inPocket(v) ? (Math.abs(v.x) > 0.085 || v.y > -0.012 ? C.hoodDk : C.pocket) : C.hood)]]);
  }
  function chestGeo() {
    const g = xf(lathe([[0.158, -0.15], [0.17, -0.06], [0.186, 0.03], [0.195, 0.1], [0.198, 0.16], [0.19, 0.2], [0.165, 0.235], [0.128, 0.265], [0.092, 0.29], [0.068, 0.312], [0.058, 0.325]], 24), 0, 0, 0, 0, 0, 0, 1, 1, 0.68);
    const collar = xf(new THREE.TorusGeometry(0.064, 0.014, 6, 20), 0, 0.312, 0.006, Math.PI / 2, 0, 0, 1, 1, 0.9);
    return merge([[g, C.hood], [collar, C.hoodDk]]);
  }
  function hoodGeo() {
    const roll = xf(new THREE.TorusGeometry(0.088, 0.031, 8, 26, Math.PI * 1.7), 0, 0, 0, Math.PI / 2, 0, 0, 1, 1, 0.95).rotateY(1.1);
    const bulk = shape(ball(14, 10), (v) => v.set(v.x * 0.12, v.y * 0.1 - 0.065, v.z * 0.045 + 0.112));
    return merge([[roll, C.hood], [bulk, C.hood]]);
  }
  function stringsGeo() {
    const parts = [];
    for (const x of [-0.033, 0.033]) {
      parts.push([xf(new THREE.CylinderGeometry(0.0035, 0.0035, 0.15, 5), x, -0.075, 0), C.cord]);
      parts.push([xf(new THREE.CylinderGeometry(0.005, 0.0045, 0.022, 6), x, -0.158, 0), '#cfcfcf']);
    }
    return merge(parts);
  }

  // --- Hoved ---
  function headUnit(v, sock = true) { // enhedskugle → hovedform (hovedets lokale rum)
    let x = v.x, y = v.y, z = v.z;
    if (y < 0) x *= 1 - 0.12 * y * y - 0.45 * Math.max(0, -y - 0.62); // smallere hage
    if (y < -0.35 && y > -0.95) x *= 1 + 0.16 * Math.sin(((-y - 0.35) / 0.6) * Math.PI); // kantet kæbe
    if (y < -0.86) y = -0.86 + (y + 0.86) * 0.5;               // flad hage                          // kæben smalner
    if (y < -0.2 && z < 0) z *= 1 + 0.14 * (-y - 0.2);        // hage frem
    z *= z < 0 ? 0.9 : 1.05;                                  // fladt ansigt, rundt baghoved
    if (sock && z < 0) for (const ex of [-0.4, 0.4]) {        // øjenhuler
      const d = Math.hypot(x - ex, y + 0.02);
      if (d < 0.3) z *= 1 - 0.1 * (1 - d / 0.3) ** 2;
    }
    v.set(x * 0.079, y * 0.113 + 0.1, z * 0.1 - 0.012);
  }
  function headGeo() {
    const g = ball(26, 20).rotateY(Math.PI / 2);
    shape(g, (v) => headUnit(v));
    const nose = xf(shape(ball(10, 8), (v) => v.set(v.x * 0.012, v.y * 0.024, v.z * 0.016)), 0, 0.084, -0.1, -0.3, 0, 0);
    const tip = xf(shape(ball(10, 8), (v) => v.set(v.x * 0.0125, v.y * 0.01, v.z * 0.011)), 0, 0.066, -0.108);
    const parts = [[g, (v, c) => {
      const uy = (v.y - 0.1) / 0.113, uz = (v.z + 0.012) / 0.1, ux = v.x / 0.078;
      c.setRGB(1, 1, 1);
      const st = smooth(-0.3, -0.6, uy) * (uz < 0.35 ? 1 : 0);  // skægstubbe
      if (st > 0) c.setRGB(1 - 0.16 * st, 1 - 0.18 * st, 1 - 0.14 * st);
      if (Math.abs(ux) > 0.4 && uy > -0.5 && uy < 0.0 && uz < -0.3) c.setRGB(1, 0.94, 0.92); // kinder
    }], [nose, 0xffffff], [tip, 0xfff4f0]];
    for (const s of [-1, 1]) {
      parts.push([xf(shape(ball(10, 8), (v) => v.set(v.x * 0.009, v.y * 0.028, v.z * 0.018)), s * 0.076, 0.088, 0.01, 0, s * 0.35, 0), 0xf6e4dc]);
    }
    return merge(parts);
  }
  function eyesGeo() { return merge([-1, 1].map((s) => [xf(new THREE.SphereGeometry(0.0125, 14, 10), s * EYE_X, EYE_Y, EYE_Z), 0xffffff])); }
  function irisGeo() {
    const parts = [];
    for (const s of [-1, 1]) {
      parts.push([xf(shape(ball(12, 8), (v) => v.set(v.x * 0.0062, v.y * 0.0062, v.z * 0.0022)), s * EYE_X, EYE_Y, EYE_Z - 0.0112), '#5a3b22']);
      parts.push([xf(shape(ball(10, 6), (v) => v.set(v.x * 0.0027, v.y * 0.0027, v.z * 0.0012)), s * EYE_X, EYE_Y, EYE_Z - 0.0127), '#0b0b0b']);
    }
    return merge(parts);
  }
  function lidsGeo() { // øvre øjenlåg (drejes ned ved blink) med mørk vippekant
    return merge([-1, 1].map((s) => [xf(new THREE.SphereGeometry(0.0136, 14, 6, 0, TAU, 0, Math.PI / 2), s * EYE_X, 0, 0),
      (v, c) => (v.y < 0.0025 ? c.setRGB(0.3, 0.22, 0.2) : c.setRGB(0.97, 0.95, 0.95))]));
  }
  function browsGeo() {
    return merge([-1, 1].map((s) => [xf(new THREE.BoxGeometry(0.032, 0.0065, 0.01), s * 0.033, 0.119, -0.0905, -0.25, -s * 0.25, -s * 0.1), '#2b1d14']));
  }
  function lipsGeo() {
    const up = xf(shape(ball(12, 6), (v) => v.set(v.x * 0.018, v.y * 0.0036, v.z * 0.0065)), 0, 0.036, -0.0872);
    const lo = xf(shape(ball(12, 6), (v) => v.set(v.x * 0.017, v.y * 0.0045, v.z * 0.007)), 0, 0.0285, -0.0862);
    return merge([[up, 0xffffff], [lo, 0xffffff]]);
  }
  function hairGeo() {
    const R = rng(7), parts = [];
    const th = (ux, uz) => 0.15 + smooth(-0.1, -0.6, uz) * (0.42 + 0.1 * Math.abs(ux)) - smooth(0.1, 0.6, uz) * 0.6;
    const cap = ball(28, 18).rotateY(Math.PI / 2);
    shape(cap, (v) => {
      const k = v.y < th(v.x, v.z) ? 0.95 : 1.07 + (R() - 0.5) * 0.025;
      v.multiplyScalar(k);
      headUnit(v, false);
    });
    parts.push([cap, (v, c) => c.set('#2b1d14')]);
    for (let n = 0; n < 46; n++) { // korte, lidt uregelmæssige totter
      const a = R() * TAU, y = 0.25 + R() * 0.75, r = Math.sqrt(1 - y * y);
      _s.set(Math.cos(a) * r, y, Math.sin(a) * r);
      if (_s.y < th(_s.x, _s.z) + 0.12) continue;
      _s.multiplyScalar(1.055); headUnit(_s, false);
      const sz = 0.8 + R() * 0.45, px = _s.x, py = _s.y, pz = _s.z;
      parts.push([xf(new THREE.IcosahedronGeometry(1, 1), px, py, pz, R() * 0.6, a, 0, 0.017 * sz, 0.0075 * sz, 0.021 * sz), R() > 0.5 ? '#2b1d14' : '#33241a']);
    }
    return merge(parts);
  }
  function bandGeo() {
    return merge([[xf(new THREE.CylinderGeometry(1, 1.03, 0.026, 32, 1, true), 0, 0.163, -0.003, -0.12, 0, 0, 0.08, 1, 0.096), C.accent]]);
  }
  function helmetGeo() {
    const g = shape(new THREE.SphereGeometry(1, 26, 12, 0, TAU, 0, Math.PI / 2).rotateY(Math.PI / 2), (v) => v.set(v.x * 0.099, v.y * 0.1, v.z * 0.12));
    xf(g, 0, 0.13, -0.006, -0.22, 0, 0);
    const rim = xf(new THREE.TorusGeometry(1, 0.06, 6, 30), 0, 0.13, -0.006, Math.PI / 2 - 0.22, 0, 0, 0.1, 0.122, 0.1);
    return merge([[g, (v, c) => c.set(Math.abs(v.x) < 0.012 ? C.accent : '#22252b')], [rim, '#15171b']]);
  }

  // --- Arme og hænder ---
  function upperArmGeo(s) {
    const g = xf(lathe([[0.043, -0.295], [0.047, -0.255], [0.051, -0.17], [0.054, -0.09], [0.054, -0.03], [0.046, 0.01], [0.02, 0.03]], 16), 0, 0, 0, 0, 0, 0, 1, 1, 0.94);
    const delt = shape(ball(16, 12), (v) => v.set(v.x * 0.05 + s * 0.004, v.y * 0.062 - 0.035, v.z * 0.052));
    return merge([[g, C.hood], [delt, C.hood]]);
  }
  function foreArmGeo() {
    const g = lathe([[0.034, -0.266], [0.036, -0.252], [0.037, -0.236], [0.041, -0.205], [0.047, -0.12], [0.049, -0.055], [0.046, -0.005], [0.03, 0.03]], 16);
    const elbow = xf(new THREE.SphereGeometry(0.046, 14, 10), 0, 0, 0.002);
    return merge([[g, (v, c) => c.set(v.y < -0.236 ? C.hoodDk : C.hood)], [elbow, C.hood]]);
  }
  function palmGeo(s) {
    const palm = shape(ball(14, 10), (v) => {
      const taper = v.y > 0.3 ? 1 - 0.3 * (v.y - 0.3) / 0.7 : 1;
      v.set(v.x * 0.0165 * (v.x * s > 0 ? 1.05 : 0.95), v.y * 0.05 - 0.052, v.z * 0.041 * taper);
    });
    const wrist = xf(new THREE.CylinderGeometry(0.023, 0.025, 0.035, 12), 0, -0.006, 0, 0, 0, 0, 0.78, 1, 1.18);
    return merge([[palm, 0xffffff], [wrist, 0xffffff]]);
  }
  // [z, y, proksimal, distal, radius, spredning]
  const FINGERS = [[-0.029, -0.094, 0.044, 0.042, 0.0088, 0.12], [-0.0095, -0.099, 0.049, 0.046, 0.009, 0.03],
    [0.0095, -0.097, 0.046, 0.043, 0.0086, -0.05], [0.027, -0.089, 0.036, 0.034, 0.0075, -0.14]];

  // --- Ben og sko ---
  const stripeK = (v, s) => (s * v.x) / Math.max(1e-4, Math.hypot(v.x, v.z)) > 0.94;
  function thighGeo(s) {
    const g = lathe([[0.057, -0.445], [0.061, -0.41], [0.069, -0.32], [0.079, -0.2], [0.087, -0.09], [0.089, -0.02], [0.082, 0.04], [0.05, 0.085]], 18);
    return merge([[g, (v, c) => c.set(stripeK(v, s) ? C.stripe : C.pants)]]);
  }
  function shinGeo(s) {
    const knee = xf(new THREE.SphereGeometry(0.058, 14, 10), 0, 0, -0.004);
    const g = lathe([[0.042, -0.42], [0.044, -0.405], [0.045, -0.385], [0.049, -0.36], [0.057, -0.25], [0.062, -0.14], [0.059, -0.05], [0.056, 0.02]], 18);
    shape(g, (v) => { if (v.z > 0) v.z *= 1 + 0.12 * Math.sin(clamp((v.y + 0.33) / 0.3, 0, 1) * Math.PI); }); // læg
    return merge([[g, (v, c) => c.set(v.y < -0.385 ? C.pantsDk : stripeK(v, s) ? C.stripe : C.pants)], [knee, C.pants]]);
  }
  function kneePadGeo() {
    const g = shape(new THREE.SphereGeometry(1, 14, 10, Math.PI, Math.PI), (v) => v.set(v.x * 0.074, v.y * 0.095 - 0.035, v.z * 0.075 - 0.004));
    return merge([[g, (v, c) => c.set(Math.abs(v.x) < 0.042 && v.y > -0.075 && v.y < 0.01 ? '#6b7280' : '#1e2126')]]);
  }
  function shoeGeo() { // bagdel af skoen (anklen er origo, sålen ved y = −0.085)
    const mid = shape(ball(18, 10), (v) => {
      const y = -0.07 + 0.0155 * clamp(v.y / 0.75, -1, 1);
      v.set(v.x * 0.047 * (v.z > 0.3 ? 1 - 0.25 * (v.z - 0.3) : 1), y, -0.035 + v.z * 0.1);
    });
    const up = shape(ball(20, 14), (v) => {
      let y = v.y;
      if (v.z < 0 && y > 0) y *= 1 + 0.5 * v.z; // lavere foran (vristen)
      v.set(v.x * 0.0445 * (v.z > 0.4 ? 1 - 0.2 * (v.z - 0.4) : 1), Math.max(-0.058, -0.028 + y * 0.052), Math.max(-0.135, -0.035 + v.z * 0.1));
    });
    return merge([[mid, (v, c) => c.set(v.y < -0.08 ? C.outsole : C.sole)], [up, (v, c) => {
      if (Math.abs(v.x) < 0.013 && v.y > -0.012 && v.z < -0.02 && v.z > -0.11) c.set(Math.floor(v.z / 0.013) % 2 ? '#a3a9b2' : C.shoe);
      else if (v.z > 0.05 && v.y > -0.012) c.set(C.accent);
      else if (Math.abs(v.x) > 0.034 && v.y < -0.002 && v.y > -0.05 && v.z < 0.03 && v.z > -0.12) c.set(C.grey);
      else c.set(C.shoe);
    }]]);
  }
  function toeGeo() { // forfod (tå-leddet sidder ved trædepuden)
    const mid = shape(ball(14, 8), (v) => v.set(v.x * 0.047, 0.015 + 0.0155 * clamp(v.y / 0.75, -1, 1), Math.min(0.012, -0.03 + v.z * 0.058)));
    const cap = shape(ball(14, 10), (v) => v.set(v.x * 0.0445, Math.max(0.027, 0.027 + v.y * 0.03), Math.min(0.008, -0.028 + v.z * 0.057)));
    return merge([[mid, (v, c) => c.set(v.y < 0.005 ? C.outsole : C.sole)], [cap, (v, c) => c.set(v.z < -0.072 ? '#e0e3e8' : C.shoe)]]);
  }

  // --- Udstyr ---
  function chalkBagGeo() {
    const bag = lathe([[0.002, -0.118], [0.04, -0.116], [0.051, -0.1], [0.054, -0.05], [0.051, -0.024], [0.055, -0.016], [0.055, -0.004], [0.048, 0.0]], 16);
    const chalk = xf(new THREE.CircleGeometry(0.047, 14), 0, -0.006, 0, -Math.PI / 2, 0, 0);
    const clip = xf(new THREE.BoxGeometry(0.03, 0.03, 0.012), 0, 0.006, -0.05);
    return merge([[bag, (v, c) => c.set(v.y > -0.025 ? '#f2f0ea' : v.y > -0.08 && v.y < -0.066 ? C.accent : '#2d2f36')], [chalk, '#ffffff'], [clip, '#2d2f36']]);
  }
  function ropeCoilGeo() {
    const parts = [];
    // oprullet reb på ryggen: tætte, lidt skæve løkker
    for (let k = 0; k < 9; k++) { // tyk bundt af løkker (to-farvet klatrereb)
      const g = new THREE.TorusGeometry(0.105 + (k % 3) * 0.011, 0.0095, 6, 36);
      xf(g, ((k * 7) % 5 - 2) * 0.004, 0.01 - (k % 4) * 0.006, 0.16 + ((k * 5) % 3) * 0.008, 0.06 + (k % 3) * 0.05, 0, 0.07 * (k - 4), 1, 1.25, 1);
      parts.push([g, k % 3 === 1 ? '#d9e3e8' : k % 2 ? '#1f7896' : '#2c8fb0']);
    }
    const tie = xf(new THREE.TorusGeometry(0.034, 0.013, 6, 14), 0, 0.135, 0.17, 0, Math.PI / 2, 0, 1, 1.5, 1);
    parts.push([tie, '#1f6f8c']);
    return merge(parts);
  }

  // --- Skateboard (langs lokal Z, næsen mod −Z) ---
  function deckGeo() {
    const L = 0.8, W = 0.205, T = 0.013, g = new THREE.BoxGeometry(W, T, L, 8, 1, 40);
    const p = g.attributes.position, n = g.attributes.normal, face = [];
    for (let i = 0; i < p.count; i++) {
      face.push(n.getY(i) > 0.5 ? 1 : n.getY(i) < -0.5 ? -1 : 0);
      let x = p.getX(i), y = p.getY(i);
      const z = p.getZ(i), az = Math.abs(z), end = L / 2 - W / 2;
      if (az > end) { const k = (az - end) / (W / 2); x *= Math.sqrt(Math.max(0.03, 1 - k * k)); }
      y += (az > 0.27 ? ((az - 0.27) / 0.13) ** 2 * 0.055 : 0) + 0.004 * (x / (W / 2)) ** 2; // kick + konkav
      p.setXYZ(i, x, y, z);
    }
    g.computeVertexNormals();
    xf(g, 0, 0.098 + T / 2, 0);
    return merge([[g, (v, c, i) => c.set(face[i] > 0 ? '#1b1b1d' : face[i] < 0 ? C.hood : '#d6b07a')]]);
  }
  function trucksGeo() {
    const parts = [];
    for (const z of [-0.215, 0.215]) {
      parts.push([xf(new THREE.BoxGeometry(0.06, 0.012, 0.075), 0, 0.092, z), '#b9bec6']);
      parts.push([xf(new THREE.CylinderGeometry(0.013, 0.013, 0.022, 10), 0, 0.075, z), C.accent]);
      parts.push([xf(new THREE.BoxGeometry(0.13, 0.024, 0.03), 0, 0.048, z), '#b9bec6']);
      parts.push([xf(new THREE.CylinderGeometry(0.005, 0.005, 0.19, 8), 0, 0.027, z, 0, 0, Math.PI / 2), '#8b9099']);
    }
    return merge(parts);
  }
  function wheelsGeo() {
    const parts = [];
    for (const z of [-0.215, 0.215]) for (const x of [-0.083, 0.083]) {
      const g = lathe([[0.0, -0.016], [0.021, -0.016], [0.027, -0.01], [0.0275, 0.0], [0.027, 0.01], [0.021, 0.016], [0.0, 0.016]], 16);
      parts.push([xf(g, x, 0.027, z, 0, 0, Math.PI / 2), (v, c) => c.set(Math.hypot(v.y - 0.027, v.z - z) < 0.012 ? '#8a8f96' : '#f1ead8')]);
    }
    return merge(parts);
  }

  // =====================================================================
  //   Opbygning af riggen
  // =====================================================================
  function build() {
    const mats = makeMaterials();
    const grp = (parent, x = 0, y = 0, z = 0) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; };
    const add = (parent, geo, mat, shadow = true) => { const m = new THREE.Mesh(geo, mat); m.castShadow = shadow; parent.add(m); return m; };

    const root = new THREE.Group();
    root.name = 'runner';
    const inner = grp(root);
    inner.rotation.order = 'YXZ';
    const tiltG = grp(inner, 0, -RADIUS, 0);            // hældning i sving (om fodlinjen)
    const pivot = grp(tiltG, 0, PIVOT_Y, 0);            // salto / rebhældning / skate-vending
    pivot.rotation.order = 'YXZ';
    const base = grp(pivot, 0, -PIVOT_Y, 0);            // fodlinjen = origo for alle stillinger

    const pelvis = grp(base, 0, HIP_Y, 0);
    add(pelvis, pelvisGeo(), mats.pants);
    const spine = grp(pelvis, 0, SPINE_Y, 0);
    add(spine, abdomenGeo(), mats.hoodie);
    const chest = grp(spine, 0, CHEST_Y, 0);
    const chestMesh = add(chest, chestGeo(), mats.hoodie);
    const hood = grp(chest, 0, 0.27, 0);
    add(hood, hoodGeo(), mats.hoodie);
    const strings = grp(chest, 0, 0.255, -0.112);
    add(strings, stringsGeo(), mats.cord, false);
    const coil = grp(chest, 0, 0, 0);
    add(coil, ropeCoilGeo(), mats.rope);

    const neck = grp(chest, 0, NECK_Y, 0.008);
    add(neck, plain(xf(new THREE.CylinderGeometry(0.05, 0.058, 0.15, 14), 0, 0.03, 0)), mats.skin);
    const head = grp(neck, 0, HEAD_Y, 0);
    add(head, headGeo(), mats.skin);
    add(head, hairGeo(), mats.hair);
    add(head, eyesGeo(), mats.eye, false);
    add(head, irisGeo(), mats.iris, false);
    const lids = grp(head, 0, EYE_Y, EYE_Z);
    add(lids, lidsGeo(), mats.skin, false);
    add(head, browsGeo(), mats.hair, false);
    add(head, lipsGeo(), mats.lips, false);
    const band = add(head, bandGeo(), mats.band);
    const helmet = add(head, helmetGeo(), mats.hard);

    const arms = [];
    for (const s of [-1, 1]) { // venstre (−X) først, så højre (+X)
      const clav = grp(chest, s * CLAV_X, CLAV_Y, 0);
      const up = grp(clav, s * SHO_X, SHO_Y, SHO_Z);
      add(up, upperArmGeo(s), mats.hoodie);
      const lo = grp(up, 0, -UPPER, 0);
      add(lo, foreArmGeo(), mats.hoodie);
      const hand = grp(lo, 0, -FORE, 0);
      const palm = add(hand, palmGeo(s), mats.hand);
      const anchor = grp(hand, -s * 0.012, -0.055, 0);
      const fingers = FINGERS.map(([z, y, l1, l2, r]) => {
        const p = grp(hand, 0, y, z);
        const pm = add(p, plain(capsule(r, l1)), mats.hand, false);
        const d = grp(p, 0, -l1, 0);
        add(d, plain(capsule(r * 0.92, l2)), mats.hand, false);
        return { p, d, pm };
      });
      const tp = grp(hand, -s * 0.007, -0.03, -0.03);
      const tpm = add(tp, plain(capsule(0.0105, 0.04)), mats.hand, false);
      const td = grp(tp, 0, -0.04, 0);
      add(td, plain(capsule(0.0095, 0.032)), mats.hand, false);
      arms.push({ s, clav, up, lo, hand, palm, anchor, fingers, thumb: { p: tp, d: td, pm: tpm } });
    }
    const legs = [];
    for (const s of [-1, 1]) {
      const up = grp(pelvis, s * HIP_X, 0, 0);
      add(up, thighGeo(s), mats.pants);
      const lo = grp(up, 0, -THIGH, 0);
      add(lo, shinGeo(s), mats.pants);
      const pad = add(lo, kneePadGeo(), mats.hard);
      const foot = grp(lo, 0, -SHIN, 0);
      add(foot, shoeGeo(), mats.shoe);
      const toe = grp(foot, 0, -ANKLE_H, -0.135);
      add(toe, toeGeo(), mats.shoe);
      legs.push({ s, up, lo, foot, toe, pad });
    }
    const bag = grp(pelvis, 0.105, 0.105, 0.17);
    add(bag, xf(chalkBagGeo(), 0, -0.02, 0), mats.gear);

    const board = grp(inner, 0, -RADIUS, 0);
    add(board, deckGeo(), mats.deck);
    add(board, trucksGeo(), mats.metal);
    add(board, wheelsGeo(), mats.wheel);
    board.visible = false;

    const rig = {
      root, inner, tiltG, pivot, base, pelvis, spine, chest, chestMesh, hood, strings, coil, neck, head, lids, band, helmet,
      arms, legs, bag, board, mats, hands: [arms[0].anchor, arms[1].anchor],
      setChalk(k) {
        k = clamp(k || 0, 0, 1);
        mats.hand.color.copy(SKIN).lerp(WHITE, k * 0.8);
        mats.glove.color.copy(GLOVE).lerp(CHALKG, k * 0.6);
      },
    };
    rig._st = {
      init: false, w: {}, list: [], pose: newPose(), tmp: newPose(),
      poses: { ground: newPose(), air: newPose(), hang: newPose(), climb: newPose(), rope: newPose(), skate: newPose(), flip: newPose() },
      prev: new V3(), vel: new V3(), velLocal: new V3(), airT: 0, accLean: 0, prevSpeed: 0, lastSpeed: 0, lastGrp: '',
      exert: 0, pushW: 0, swing: 0, swingV: 0, flipAng: 0, flipW: 0, blinkT: 2 + Math.random() * 3, blinkP: 0,
      hood: 0, hoodV: 0, dStr: { d: new V3(0, -1, 0), v: new V3() }, dBag: { d: new V3(0, -1, 0), v: new V3() },
      baseInv: new M4(), mC: new M4(), mI: new M4(), qI: new Q(), gear: '',
    };
    applyGear(rig, { gloves: false, chalk: false, rope: false, helmet: false });
    return rig;
  }

  function applyGear(rig, g) {
    const key = `${!!g.gloves}${!!g.chalk}${!!g.rope}${!!g.helmet}`;
    if (rig._st.gear === key) return;
    rig._st.gear = key;
    const m = rig.mats, hm = g.gloves ? m.glove : m.hand;
    for (const A of rig.arms) { // fingerløse handsker: håndflade og inderste fingerled
      A.palm.material = hm;
      A.thumb.pm.material = hm;
      for (const F of A.fingers) F.pm.material = hm;
    }
    rig.bag.visible = !!g.chalk;
    rig.coil.visible = !!g.rope;
    rig.helmet.visible = !!g.helmet;
    rig.band.visible = !g.helmet;
    for (const L of rig.legs) L.pad.visible = !!g.helmet;
  }

  // =====================================================================
  //   Stillinger: et fast tal-layout, der kan blandes lineært
  // =====================================================================
  const I_YAW = 0, I_TX = 1, I_TZ = 2, I_BANK = 3, I_PEL = 4, I_PROT = 7, I_SPN = 10, I_CHS = 13, I_NCK = 16, I_HED = 19, I_LOOK = 22, I_BREATH = 23;
  // arm: 0-2 mål (håndled), 3-5 albue-retning, 6 rum, 7-10 hånd-kvaternion (inner-rum), 11 vægt,
  //      12-14 håndled (relativt), 15 krumning, 16 tommel, 17 spredning, 18 skulderløft, 19-26 andet mål (+rum, vægt)
  // ben: 0-2 ankel, 3-5 knæ-retning, 6 rum, 7 pitch, 8 yaw, 9 roll, 10 tå
  // rum: 0 = base (fodlinjen), 1 = brystet, 2 = inner (motorens ramme)
  const A0 = 24, AS = 27, L0 = A0 + 2 * AS, LS = 11, NP = L0 + 2 * LS;
  function newPose() { return new Float64Array(NP); }
  const ao = (i) => A0 + i * AS, lo = (i) => L0 + i * LS;
  function setArm(P, i, x, y, z, px, py, pz, space) {
    const o = ao(i);
    P[o] = x; P[o + 1] = y; P[o + 2] = z; P[o + 3] = px; P[o + 4] = py; P[o + 5] = pz; P[o + 6] = space;
  }
  function setArm2(P, i, x, y, z, px, py, pz, space, w) {
    const o = ao(i) + 19;
    P[o] = x; P[o + 1] = y; P[o + 2] = z; P[o + 3] = px; P[o + 4] = py; P[o + 5] = pz; P[o + 6] = space; P[o + 7] = w;
  }
  function setHand(P, i, curl, thumb, spread, shrug = 0, wx = 0, wy = 0, wz = 0) {
    const o = ao(i);
    P[o + 12] = wx; P[o + 13] = wy; P[o + 14] = wz; P[o + 15] = curl; P[o + 16] = thumb; P[o + 17] = spread; P[o + 18] = shrug;
  }
  function setHandAbs(P, i, q, w) { const o = ao(i); P[o + 7] = q.x; P[o + 8] = q.y; P[o + 9] = q.z; P[o + 10] = q.w; P[o + 11] = w; }
  function setLeg(P, i, x, y, z, px, py, pz, space, pitch = 0, yaw = 0, roll = 0, toe = 0) {
    const o = lo(i);
    P[o] = x; P[o + 1] = y; P[o + 2] = z; P[o + 3] = px; P[o + 4] = py; P[o + 5] = pz; P[o + 6] = space;
    P[o + 7] = pitch; P[o + 8] = yaw; P[o + 9] = roll; P[o + 10] = toe;
  }
  function mixPose(P, B, k) { for (let j = 0; j < NP; j++) P[j] += (B[j] - P[j]) * k; }

  // Arm som led-vinkler (bryst-rum): løft frem, ud til siden og albuebøjning
  const SHOULDER = [new V3(-(CLAV_X + SHO_X), CLAV_Y + SHO_Y, SHO_Z), new V3(CLAV_X + SHO_X, CLAV_Y + SHO_Y, SHO_Z)];
  function armFK(P, i, flex, abd, bend, inward = 0) {
    const s = i ? 1 : -1, S = SHOULDER[i], ca = Math.cos(abd), sa = Math.sin(abd);
    const ex = S.x + s * sa * UPPER, ey = S.y - ca * Math.cos(flex) * UPPER, ez = S.z - ca * Math.sin(flex) * UPPER;
    const f2 = flex + bend;
    let fx = s * sa * 0.6 - s * inward, fy = -ca * Math.cos(f2), fz = -ca * Math.sin(f2);
    const fl = Math.hypot(fx, fy, fz) || 1;
    fx /= fl; fy /= fl; fz /= fl;
    const hx = ex + fx * FORE, hy = ey + fy * FORE, hz = ez + fz * FORE;
    let px = ex - (S.x + hx) / 2, py = ey - (S.y + hy) / 2, pz = ez - (S.z + hz) / 2;
    if (px * px + py * py + pz * pz < 1e-5) { px = s * 0.3; py = -0.2; pz = 1; }
    setArm(P, i, hx, hy, hz, px, py, pz, 1);
  }

  // Håndens orientering ud fra fingerretning f og håndfladens normal n (inner-rum)
  const _hx = new V3(), _hy = new V3(), _hz = new V3(), _mb = new M4();
  function handQuat(q, f, n, s) {
    _hy.copy(f).negate().normalize();
    _hx.copy(n).multiplyScalar(-s);
    _hx.addScaledVector(_hy, -_hx.dot(_hy)).normalize();
    _hz.crossVectors(_hx, _hy);
    return q.setFromRotationMatrix(_mb.makeBasis(_hx, _hy, _hz));
  }
  // Fra håndfladens punkt til håndleddet (IK-målet)
  const _anc = new V3();
  function palmToWrist(p, q, s) { _anc.set(-s * 0.012, -0.055, 0).applyQuaternion(q); return p.sub(_anc); }

  // --- Stå og løbe ---
  function idlePose(st, s, P) {
    const t = s.time || 0, ex = st.exert;
    const ws = Math.sin(t * 0.55) * 0.8 + Math.sin(t * 0.23 + 1) * 0.2;     // vægtskift
    const br = Math.sin(t * (1.7 + ex * 1.6)) * (1 + ex * 1.5);              // vejrtrækning
    P[I_PEL] = 0.026 * ws; P[I_PEL + 1] = 0.935 - 0.006 * Math.abs(ws); P[I_PEL + 2] = 0;
    P[I_PROT] = -0.03; P[I_PROT + 1] = 0.05 * ws; P[I_PROT + 2] = 0.045 * ws;
    P[I_SPN] = 0.02 - 0.04 * ex; P[I_SPN + 2] = -0.03 * ws;
    P[I_CHS] = 0.03 + 0.012 * br; P[I_CHS + 2] = -0.02 * ws;
    P[I_NCK] = 0.02; P[I_HED] = -0.03 + 0.01 * br;
    P[I_HED + 1] = 0.22 * Math.sin(t * 0.31) * Math.sin(t * 0.17 + 1);      // kigger rundt
    P[I_LOOK] = 1; P[I_BREATH] = br;
    armFK(P, 0, 0.06 + 0.01 * br, 0.1, 0.28);
    armFK(P, 1, 0.04, 0.1, 0.32);
    setHand(P, 0, 0.45, 0.3, 0.05, 0.03 * br * (1 + 2 * ex));
    setHand(P, 1, 0.5, 0.3, 0.05, 0.03 * br * (1 + 2 * ex));
    setLeg(P, 0, -0.118, ANKLE_H, -0.035, -0.15, 0, -1, 0, 0, 0.13, 0, 0);
    setLeg(P, 1, 0.118, ANKLE_H, 0.045, 0.15, 0, -1, 0, 0, -0.16, 0, 0);
  }

  const _fc = { y: 0, z: 0, pitch: 0, toe: 0 };
  function footCycle(u, D, Ls, zLand, sb, o) {
    const aE = -(0.55 + 0.45 * sb);                         // hælløft ved afsæt
    if (u < D) { // standfase: forfoden står stille på jorden, kroppen glider frem over den
      const q = u / D, a = aE * smooth(0.4, 1, q);
      const bz = zLand - 0.135 + q * Ls;
      o.y = 0.085 * Math.cos(a) - 0.135 * Math.sin(a);
      o.z = bz + 0.085 * Math.sin(a) + 0.135 * Math.cos(a);
      o.pitch = a; o.toe = -a * 0.9;
      return;
    }
    const w = (u - D) / (1 - D);                            // svingfase
    const z0 = zLand - 0.135 + Ls + 0.085 * Math.sin(aE) + 0.135 * Math.cos(aE), y0 = 0.085 * Math.cos(aE) - 0.135 * Math.sin(aE);
    o.z = spline([z0, 0.3 + 0.12 * sb, -0.08 - 0.12 * sb, zLand - 0.05 - 0.07 * sb, zLand], w);
    o.y = spline([y0, 0.24 + 0.3 * sb, 0.34 + 0.14 * sb, 0.15 + 0.05 * sb, ANKLE_H], w);
    o.pitch = spline([aE, -1.15, -0.45, 0.12, 0], w);
    o.toe = -aE * 0.9 * (1 - smooth(0, 0.3, w));
  }
  function runPose(st, s, P) {
    const v = Math.max(0.6, s.speed || 0), sb = smooth(3, RUN_SPEED - 0.5, v);
    const T = TAU / (3 + 1.3 * v);                          // samme takt som spillets runPhase
    const Ls = Math.min(0.85, 0.42 + 0.05 * v);             // forfodens vej under kontakten
    const D = clamp(Ls / (v * T), 0.22, 0.6);               // kontakttid → ingen glidning
    const zLand = -0.36 * Ls, p = frac((s.runPhase || 0) / TAU), c = Math.cos(TAU * p), g = 0.4 + 0.6 * sb;
    for (let i = 0; i < 2; i++) {
      const sgn = i ? 1 : -1;
      footCycle(frac(p + i * 0.5), D, Ls, zLand, sb, _fc);
      setLeg(P, i, sgn * (0.085 - 0.02 * sb), _fc.y, _fc.z, sgn * 0.12, -0.25, -1, 0, _fc.pitch, -sgn * 0.04, 0, _fc.toe);
    }
    const bob = -(0.018 + 0.017 * sb) * Math.cos(TAU * 2 * (p - D / 2)); // lavest midt i standfasen
    P[I_PEL] = 0; P[I_PEL + 1] = 0.925 - 0.035 * sb + bob; P[I_PEL + 2] = -0.02 * sb;
    P[I_PROT] = -(0.05 + 0.1 * sb) - st.accLean; P[I_PROT + 1] = -0.16 * g * c; P[I_PROT + 2] = 0.035 * Math.sin(TAU * p) * g;
    P[I_SPN] = -0.04 - 0.04 * sb; P[I_SPN + 1] = 0.12 * g * c;
    P[I_CHS] = -0.02; P[I_CHS + 1] = 0.14 * g * c;
    P[I_NCK] = 0.05 + 0.08 * sb; P[I_NCK + 1] = -0.08 * g * c; P[I_HED] = 0.04 + 0.08 * sb;
    P[I_LOOK] = 0.6; P[I_BREATH] = 0.5 * Math.sin((s.time || 0) * 5);
    const amp = 0.35 + 0.5 * sb;
    for (let i = 0; i < 2; i++) { // armene svinger modsat benene, albuer ca. 90°
      const a = (i ? 1 : -1) * c;
      armFK(P, i, 0.12 + amp * a, 0.13, 1.45 + 0.35 * a * sb + (1 - sb) * 0.1, 0.12 * Math.max(0, a));
      setHand(P, i, 0.95, 0.55, 0, 0.05 * sb);
    }
  }
  function poseGround(st, s, P) {
    const v = s.speed || 0, t = s.time || 0;
    idlePose(st, s, P);
    const rb = s.mode === 'run' ? smooth(0.3, 2.2, v) : 0;
    if (rb > 0) { st.tmp.fill(0); runPose(st, s, st.tmp); mixPose(P, st.tmp, rb); }
    P[I_BANK] = clamp((s.turnRate || 0) * v * 0.03, -0.35, 0.35) * rb;      // hæld ind i svinget
    const sq = clamp(s.squash || 0, 0, 1);
    if (sq > 0) { // landing: knæene bøjes, overkroppen og armene frem
      P[I_PEL + 1] -= 0.45 * sq; P[I_PEL + 2] += 0.07 * sq;
      P[I_PROT] -= 0.45 * sq; P[I_SPN] -= 0.15 * sq; P[I_CHS] -= 0.1 * sq; P[I_NCK] += 0.25 * sq;
      for (let i = 0; i < 2; i++) { const o = ao(i); P[o + 2] -= 0.22 * sq; P[o + 1] += 0.06 * sq; P[o] *= 1 + 0.4 * sq; }
    }
    if (s.surface === 'ice') { // glat: armene ud, let usikker
      const w1 = Math.sin(t * 7.3), w2 = Math.sin(t * 5.1 + 1);
      for (let i = 0; i < 2; i++) { const o = ao(i); P[o] += (i ? 1 : -1) * (0.2 + 0.05 * w1); P[o + 1] += 0.22 + 0.08 * (i ? w1 : w2); }
      P[I_PEL] += 0.025 * w2; P[I_PROT + 2] += 0.05 * w1;
    } else if (s.surface === 'conveyor') {
      P[I_PEL] += 0.02 * Math.sin(t * 6); P[I_PROT + 2] += 0.04 * Math.sin(t * 6 + 0.5);
    }
  }

  // --- Luft og salto ---
  function poseAir(st, s, P) {
    const vy = s.vy || 0, wU = smooth(1.5, 7, vy), wD = smooth(1.5, 8, -vy), wA = Math.max(0, 1 - wU - wD);
    const m = (u, a, d) => u * wU + a * wA + d * wD;        // afsæt / toppunkt / fald
    P[I_PEL + 1] = m(0.93, 0.88, 0.92); P[I_PEL + 2] = m(0.02, 0.02, 0);
    P[I_PROT] = m(0.02, -0.2, -0.04); P[I_SPN] = m(0.06, -0.12, 0.02); P[I_CHS] = m(0.06, -0.06, 0.06);
    P[I_NCK] = m(-0.05, 0.05, 0.02); P[I_HED] = m(0, 0.1, -0.12);
    P[I_LOOK] = 0.4;
    armFK(P, 0, m(2.2, 0.75, 0.55), m(0.25, 0.45, 0.95), m(0.4, 1.05, 0.95));
    armFK(P, 1, m(1.9, 0.6, 0.35), m(0.3, 0.4, 0.85), m(0.5, 1.15, 1.05));
    for (let i = 0; i < 2; i++) setHand(P, i, m(0.55, 0.7, 0.2), 0.4, m(0.1, 0.1, 0.8), m(0.2, 0, 0.15));
    setLeg(P, 0, -0.1, m(0.2, 0.42, 0.14), m(0.3, 0.06, -0.12), -0.15, m(-0.4, 0.3, -0.2), -1, 0, m(-1.0, -0.55, 0.15));
    setLeg(P, 1, 0.1, m(0.47, 0.45, 0.3), m(-0.08, 0.0, 0.14), 0.15, m(0.2, 0.3, -0.2), -1, 0, m(-0.35, -0.5, -0.35));
  }
  function poseFlip(st, s, P) { // samlet salto: knæ til brystet, hænder om skinnebenene
    P[I_PEL + 1] = 0.86; P[I_PEL + 2] = 0.04;
    P[I_PROT] = -0.35; P[I_SPN] = -0.4; P[I_CHS] = -0.3; P[I_NCK] = -0.25; P[I_HED] = -0.15;
    for (let i = 0; i < 2; i++) {
      const sgn = i ? 1 : -1;
      setLeg(P, i, sgn * 0.1, 0.6, 0.12, sgn * 0.3, 0.6, -1, 0, -0.7, 0, 0, 0);
      setArm(P, i, sgn * 0.16, 0.8, -0.2, sgn, -0.3, 0.3, 0);
      setHand(P, i, 1.2, 0.8, 0, 0.1);
    }
  }

  // --- Hænge i kant / stang / svævebane ---
  const _G = new V3(), _Tn = new V3(), _W = new V3(), _f = new V3(), _n = new V3(), _a = new V3(), _qh = new Q();
  function poseHang(st, s, P) {
    const kind = s.hangKind || 'ledge', bar = kind !== 'ledge', g = s.gripLocal, tg = s.gripTangent;
    _G.set(g ? g.x : 0, g ? g.y : HANG_DROP, g ? g.z : bar ? 0 : -WALL_GAP);
    _Tn.set(tg ? tg.x : 1, tg ? tg.y : 0, tg ? tg.z : 0);
    if (_Tn.x < 0 || (Math.abs(_Tn.x) < 1e-3 && _Tn.z > 0)) _Tn.negate();
    _Tn.normalize();
    _W.set(_Tn.z, 0, -_Tn.x);                               // vandret ind mod kanten
    if (_W.lengthSq() < 1e-6) _W.set(0, 0, -1);
    _W.normalize();
    const grip = clamp(s.grip == null ? 1 : s.grip, 0, 1), trem = clamp((0.3 - grip) / 0.3, 0, 1);
    const tt = s.time || 0, sh = clamp(s.shimmy || 0, -1, 1), ash = Math.abs(sh);
    const jit = trem * Math.sin(tt * 37) * Math.sin(tt * 23 + 1);
    P[I_YAW] = bar ? clamp(Math.atan2(-_Tn.z, _Tn.x), -0.75, 0.75) : 0;   // skuldrene langs stangen
    const gx = _G.x, gy = _G.y + RADIUS, gz = _G.z, sway = -0.05 * sh;
    const half = kind === 'zip' ? 0.09 : 0.2;
    for (let i = 0; i < 2; i++) { // hånd over hånd ved sidelæns bevægelse
      const sgn = i ? 1 : -1, u = frac(tt * 0.8 + (i ? 0.5 : 0));
      let off = sgn * half, lift = 0;
      if (ash > 0.05) { // hånden flyttes hurtigt frem, og glider så tilbage, mens kroppen følger efter
        const mv = u < 0.3, o = mv ? lerp(-1, 1, smooth(0, 0.3, u)) : lerp(1, -1, (u - 0.3) / 0.7);
        off += Math.sign(sh) * 0.07 * o * ash;
        lift = mv ? 0.045 * Math.sin((Math.PI * u) / 0.3) * ash : 0;
      }
      if (bar) { // overhåndsgreb: håndfladen bag stangen, fingrene over den
        _f.copy(UPV).addScaledVector(_W, 0.15);
        _n.copy(_W).addScaledVector(UPV, 0.25);
        _a.copy(_G).addScaledVector(_Tn, off).addScaledVector(_W, -0.05).addScaledVector(UPV, -0.012 + lift);
      } else { // kantgreb: håndfladen ned på kanten, fingrene ind over den
        _f.copy(_W).addScaledVector(UPV, 0.25);
        _n.set(0, -1, 0).addScaledVector(_W, 0.1);
        _a.copy(_G).addScaledVector(_Tn, off).addScaledVector(_W, 0.035).addScaledVector(UPV, 0.008 + lift);
      }
      handQuat(_qh, _f.normalize(), _n.normalize(), sgn);
      palmToWrist(_a, _qh, sgn);
      setArm(P, i, _a.x, _a.y, _a.z, sgn + jit * 0.5, bar ? -0.1 : -0.35, bar ? 0.5 : 0.35, 2);
      setHandAbs(P, i, _qh, 1);
      setHand(P, i, (bar ? 1.35 : 0.4) - 0.35 * trem, bar ? 1.0 : 0.35, 0.05, bar ? 0.75 : 0.5);
    }
    P[I_BREATH] = 0.6 * Math.sin(tt * 2.6);
    P[I_LOOK] = 0.3;
    if (!bar) { // spændt hæng: fødderne mod muren, knæene bøjet
      P[I_PEL] = gx * 0.6 + sway + 0.01 * jit; P[I_PEL + 1] = gy - 0.94 + 0.008 * jit; P[I_PEL + 2] = gz + 0.5;
      P[I_PROT] = -0.26; P[I_SPN] = -0.12; P[I_CHS] = -0.1; P[I_NCK] = 0.25; P[I_HED] = 0.22;
      for (let i = 0; i < 2; i++) {
        const sgn = i ? 1 : -1;
        setLeg(P, i, sgn * 0.16 + sway * 0.5, gy - 1.66 + (i ? 0.06 : 0), gz + 0.17, sgn * 0.5, -0.4, -1, 0, 0.85, -sgn * 0.15, 0, 0.2);
      }
    } else if (kind === 'bar') { // frit hæng: benene dingler
      P[I_PEL] = gx * 0.5 + sway; P[I_PEL + 1] = gy - 1.1; P[I_PEL + 2] = 0.02;
      P[I_PROT] = 0.03; P[I_SPN] = 0.02; P[I_CHS] = 0.08; P[I_NCK] = 0.12; P[I_HED] = 0.1;
      setLeg(P, 0, -0.075 + sway, gy - 1.95, -0.05, -0.1, 0, -1, 0, -0.6, 0.1, 0, 0);
      setLeg(P, 1, 0.075 + sway, gy - 1.98, -0.01, 0.1, 0, -1, 0, -0.65, -0.1, 0, 0);
    } else { // svævebane: to hænder over hovedet, benene trukket op
      P[I_PEL] = gx * 0.5; P[I_PEL + 1] = gy - 1.08; P[I_PEL + 2] = 0.02;
      P[I_PROT] = -0.25; P[I_SPN] = -0.15; P[I_CHS] = 0.02; P[I_NCK] = 0.1;
      for (let i = 0; i < 2; i++) setLeg(P, i, (i ? 1 : -1) * 0.09, gy - 1.55, -0.14, (i ? 1 : -1) * 0.2, 0.4, -1, 0, -0.5, 0, 0, 0);
    }
  }

  // --- Klatre op over kanten (mantle) ---
  const CLK = { // nøgler ved climbT 0, .2, .4, .6, .8, 1 – relativt til kantens hjørne
    py: [-1.06, -0.8, -0.4, 0.33, 0.62, 1.0], pz: [0.45, 0.36, 0.2, 0.05, -0.22, -0.6],
    pel: [-0.22, -0.32, -0.55, -0.6, -0.38, -0.04], spn: [-0.12, -0.2, -0.35, -0.32, -0.15, 0], nck: [0.25, 0.15, -0.05, -0.15, 0.0, 0.0],
    ry: [-1.6, -1.3, -0.78, 0.1, 0.085, 0.145], rz: [0.17, 0.15, 0.12, 0.15, -0.3, -0.62], rp: [0.85, 0.8, 0.3, -1.3, 0, 0],
    ly: [-1.6, -1.42, -1.02, -0.62, 0.24, 0.145], lz: [0.17, 0.17, 0.18, 0.22, -0.02, -0.56], lp: [0.85, 0.85, 0.6, 0.2, -0.5, 0],
  };
  function poseClimb(st, s, P) {
    const t = clamp(s.climbT || 0, 0, 1), k = (K) => spline(K, t);
    // kantens forventede sted (samme kurve som spillets placeClimb)
    const up = smooth(0, 0.6, t), inn = smooth(0.6, 1, t);
    const ey = HANG_DROP - (HANG_DROP + RADIUS + 0.06) * up, ez = -(WALL_GAP * (1 - inn) - 0.6 * inn);
    const hw = 1 - smooth(0.42, 0.62, t);                   // hænderne slipper kanten
    const g = s.gripLocal, gx = g ? g.x : 0, gy = g ? g.y : HANG_DROP, gz = g ? g.z : -WALL_GAP;
    const Lx = gx * hw, Ly = ey + (gy - ey) * hw + RADIUS, Lz = ez + (gz - ez) * hw;
    P[I_PEL] = Lx * 0.5; P[I_PEL + 1] = Ly + k(CLK.py); P[I_PEL + 2] = Lz + k(CLK.pz);
    P[I_PROT] = k(CLK.pel); P[I_SPN] = k(CLK.spn); P[I_CHS] = k(CLK.spn) * 0.6; P[I_NCK] = k(CLK.nck); P[I_HED] = k(CLK.nck) * 0.5;
    P[I_LOOK] = 0.3; P[I_BREATH] = 0.8 * Math.sin((s.time || 0) * 3);
    setLeg(P, 1, 0.11, Ly + k(CLK.ry), Lz + k(CLK.rz), 0.2, -0.3, -1, 0, k(CLK.rp), 0, 0, 0);
    setLeg(P, 0, -0.12, Ly + k(CLK.ly), Lz + k(CLK.lz), -0.3, -0.2, -1, 0, k(CLK.lp), 0, 0, 0);
    for (let i = 0; i < 2; i++) {
      const sgn = i ? 1 : -1;
      armFK(P, i, 0.35, 0.25, 0.5);                         // frie arme (efter slip)
      _f.set(0, 0.25, -1); _n.set(0, -1, -0.1);
      handQuat(_qh, _f.normalize(), _n.normalize(), sgn);
      _a.set(Lx + sgn * 0.2, Ly - RADIUS + 0.008, Lz - 0.035);
      palmToWrist(_a, _qh, sgn);
      const e1 = smooth(0.1, 0.4, t);                       // albuerne op og bagud
      setArm2(P, i, _a.x, _a.y, _a.z, sgn * lerp(1, 0.45, e1), lerp(-0.3, 0.7, e1), lerp(0.35, 1, e1), 2, hw);
      setHandAbs(P, i, _qh, hw);
      setHand(P, i, lerp(0.5, 0.4, hw), 0.4, 0.1, 0.4 * hw);
    }
  }

  // --- Reb: én hånd over den anden langs rebet ---
  function poseRope(st, s, P) {
    const d = s.ropeDir;
    _a.set(d ? d.x : 0, d ? d.y : 0.94, d ? d.z : -0.34).normalize();
    P[I_TX] = clamp(Math.atan2(_a.z, _a.y), -1.1, 1.1) * 0.8;
    P[I_TZ] = clamp(-Math.atan2(_a.x, _a.y), -0.9, 0.9) * 0.8;
    const lv = st.velLocal, trail = clamp(-lv.z * 0.025, -0.25, 0.25), side = clamp(-lv.x * 0.02, -0.15, 0.15);
    P[I_PEL] = side * 0.3; P[I_PEL + 1] = 1.0; P[I_PEL + 2] = 0.04;
    P[I_PROT] = 0.05; P[I_SPN] = 0.05; P[I_CHS] = 0.08; P[I_NCK] = 0.15; P[I_HED] = 0.12;
    P[I_LOOK] = 0.3;
    for (let i = 0; i < 2; i++) { // højre hånd nederst (rebet udgår fra den), venstre over
      const sgn = i ? 1 : -1;
      _f.set(0, 0, -1).addScaledVector(_a, _a.z).normalize(); // fingrene vandret frem, om rebet
      _hy.copy(_f).negate(); _hz.copy(_a).negate();
      _n.crossVectors(_hy, _hz).multiplyScalar(-sgn);
      handQuat(_qh, _f, _n, sgn);
      _G.set(0, 0.8, 0).addScaledVector(_a, i ? 0.6 : 0.84).addScaledVector(_n, -0.016);
      palmToWrist(_G, _qh, sgn);
      setArm(P, i, _G.x, _G.y, _G.z, sgn * 0.8, -0.4, 0.5, 2);
      setHandAbs(P, i, _qh, 1);
      setHand(P, i, 1.5, 1.1, 0, 0.5);
      setLeg(P, i, sgn * 0.055 + side, 0.12, 0.1 + trail, sgn * 0.05, 0, -1, 0, -0.55, 0, 0, 0);
    }
  }

  // --- Skateboard: sidelæns stand (venstre fod forrest), hoved drejet frem ---
  function poseSkate(st, s, P) {
    const grind = s.mode === 'grind', air = s.grounded === false;
    const cr = clamp(s.crouch || 0, 0, 1), lean = clamp(s.lean || 0, -1, 1), pk = st.pushW, tt = s.time || 0;
    const yaw = -Math.PI / 2 + 0.8 * pk;                    // kroppen drejer frem, når der skubbes
    P[I_YAW] = yaw; P[I_BANK] = -lean * 0.2;
    const grab = air ? smooth(0.25, 0.42, st.airT) : 0;     // indy grab på store hop
    const low = 0.2 * cr + (grind ? 0.14 : 0) + (air ? 0.12 : 0) + 0.18 * grab + 0.04 * pk;
    const cz = -0.1 * pk, cy = Math.cos(yaw), sy = Math.sin(yaw);
    P[I_PEL] = -cz * sy; P[I_PEL + 1] = DECK + 0.76 - low; P[I_PEL + 2] = cz * cy;   // over brættets midte
    P[I_PROT] = -0.16 - 0.25 * cr - (grind ? 0.15 : 0) - 0.25 * grab - 0.1 * pk;
    P[I_SPN] = -0.06 - 0.12 * cr - 0.2 * grab; P[I_SPN + 1] = 0.12 * (1 - pk);
    P[I_CHS] = -0.03; P[I_CHS + 1] = 0.15 * (1 - pk);
    P[I_NCK] = 0.08 + 0.15 * cr + 0.15 * grab; P[I_HED] = 0.05;
    P[I_LOOK] = 0.95; P[I_BREATH] = 0.4 * Math.sin(tt * 2);
    const dy = -RADIUS + DECK + ANKLE_H;                    // anklens højde på dækket (inner)
    setLeg(P, 0, -0.05 * (1 - pk), dy, -0.2, 1, 0, -0.3, 2, 0, -Math.PI / 2 + 0.3 + 1.15 * pk, 0, 0);
    // bagerste fod: på halen, eller skubber langs jorden ved siden af brættet
    const ph = frac(tt * 1.6);
    let px = 0.17, py = -RADIUS + ANKLE_H, pz;
    if (ph < 0.55) pz = lerp(-0.1, 0.42, ph / 0.55);
    else { const w = (ph - 0.55) / 0.45; pz = lerp(0.42, -0.1, smooth(0, 1, w)); py += 0.1 * Math.sin(Math.PI * w); }
    px = lerp(-0.05, px, pk); py = lerp(dy, py, pk); pz = lerp(0.23, pz, pk);
    setLeg(P, 1, px, py, pz, 1, 0, 0.3, 2, 0, lerp(-Math.PI / 2 - 0.12, 0.05, pk), 0, 0);
    const wide = grind ? 0.35 : 0;
    armFK(P, 0, 0.35 + 0.4 * cr, 0.95 - 0.45 * cr + wide, 0.35);
    armFK(P, 1, -0.1 + 0.3 * cr, 0.9 - 0.4 * cr + wide, 0.4);
    for (let i = 0; i < 2; i++) setHand(P, i, 0.5, 0.3, 0.3, 0.05);
    if (grab > 0) { // bagerste hånd griber tå-kanten mellem fødderne
      _f.set(0, -1, 0); _n.set(-1, 0, 0);
      handQuat(_qh, _f, _n, 1);
      _a.set(0.1, -RADIUS + DECK - 0.012, 0.03);
      palmToWrist(_a, _qh, 1);
      setArm2(P, 1, _a.x, _a.y, _a.z, 1, 0.3, 0.6, 2, grab);
      setHandAbs(P, 1, _qh, grab);
      P[ao(1) + 15] = lerp(0.5, 1.3, grab);
    }
  }

  // =====================================================================
  //   IK og blanding
  // =====================================================================
  const _P = new V3(), _T = new V3(), _K = new V3(), _d = new V3(), _pp = new V3(), _h = new V3(), _by = new V3(), _bz = new V3();
  const _mA = new M4(), _mB = new M4(), _qa = new Q(), _qb = new Q(), _qc = new Q(), _qLo = new Q(), _qw = new Q(), _qd = new Q(), _qAcc = new Q();
  const _t1 = new V3(), _t2 = new V3(), _p1 = new V3(), _p2 = new V3(), _pl = new V3();
  const _eF = new THREE.Euler(0, 0, 0, 'YXZ');

  // To-leds IK i forælderens rum: øverste led peger mod knæ/albue, nederste mod målet
  function ik(st, up, low, a, b, T, pole, sign, qLowBase) {
    _mA.multiplyMatrices(st.baseInv, up.parent.matrixWorld);
    _qc.setFromRotationMatrix(_mA);
    _mB.copy(_mA).invert();
    _P.copy(up.position);
    _T.copy(T).applyMatrix4(_mB);
    _pp.copy(pole).transformDirection(_mB);
    _d.subVectors(_T, _P);
    let dist = _d.length();
    if (dist < 1e-5) _d.set(0, -1, 0); else _d.divideScalar(dist);
    dist = clamp(dist, Math.abs(a - b) + 1e-3, a + b - 1e-4);
    _pp.addScaledVector(_d, -_pp.dot(_d));
    if (_pp.lengthSq() < 1e-8) _pp.set(0, 0, -1).addScaledVector(_d, _d.z);
    _pp.normalize();
    const ca = clamp((a * a + dist * dist - b * b) / (2 * a * dist), -1, 1), sa = Math.sqrt(1 - ca * ca);
    _K.copy(_P).addScaledVector(_d, a * ca).addScaledVector(_pp, a * sa);
    _T.copy(_P).addScaledVector(_d, dist);
    _h.crossVectors(_d, _pp).multiplyScalar(sign).normalize();   // hængselsaksen = lokal X
    _by.subVectors(_P, _K).normalize(); _bz.crossVectors(_h, _by);
    _qa.setFromRotationMatrix(_mA.makeBasis(_h, _by, _bz));
    _by.subVectors(_K, _T).normalize(); _bz.crossVectors(_h, _by);
    _qb.setFromRotationMatrix(_mA.makeBasis(_h, _by, _bz));
    up.quaternion.copy(_qa);
    low.quaternion.copy(_qa).invert().multiply(_qb);
    qLowBase.copy(_qc).multiply(_qb);
  }
  function convPoint(st, Pm, o, space, out) {
    out.set(Pm[o], Pm[o + 1], Pm[o + 2]);
    if (space === 1) out.applyMatrix4(st.mC); else if (space === 2) out.applyMatrix4(st.mI);
    return out;
  }
  function convDir(st, Pm, o, space, out) {
    out.set(Pm[o], Pm[o + 1], Pm[o + 2]);
    if (space === 1) out.transformDirection(st.mC); else if (space === 2) out.transformDirection(st.mI); else out.normalize();
    return out;
  }
  function addQuat(q, w) { // vægtet kvaternion-sum (samme halvkugle)
    if (_qAcc.x * q.x + _qAcc.y * q.y + _qAcc.z * q.z + _qAcc.w * q.w < 0) w = -w;
    _qAcc.x += q.x * w; _qAcc.y += q.y * w; _qAcc.z += q.z * w; _qAcc.w += q.w * w;
  }
  function solveArm(rig, st, L, i) {
    const A = rig.arms[i], o = ao(i);
    _T.set(0, 0, 0); _pl.set(0, 0, 0); _qAcc.set(0, 0, 0, 0);
    let aw = 0, curl = 0, th = 0, sp = 0, wx = 0, wy = 0, wz = 0;
    for (let j = 0; j < L.length; j += 2) {
      const Pm = L[j], w = L[j + 1], w2 = Pm[o + 26];
      convPoint(st, Pm, o, Pm[o + 6], _t1); convDir(st, Pm, o + 3, Pm[o + 6], _p1);
      if (w2 > 0) { convPoint(st, Pm, o + 19, Pm[o + 25], _t2); convDir(st, Pm, o + 22, Pm[o + 25], _p2); _t1.lerp(_t2, w2); _p1.lerp(_p2, w2); }
      _T.addScaledVector(_t1, w); _pl.addScaledVector(_p1, w);
      const a = Pm[o + 11] * w;
      if (a > 0) { _qa.set(Pm[o + 7], Pm[o + 8], Pm[o + 9], Pm[o + 10]).normalize().premultiply(st.qI); addQuat(_qa, a); aw += a; }
      wx += Pm[o + 12] * w; wy += Pm[o + 13] * w; wz += Pm[o + 14] * w;
      curl += Pm[o + 15] * w; th += Pm[o + 16] * w; sp += Pm[o + 17] * w;
    }
    ik(st, A.up, A.lo, UPPER, FORE, _T, _pl, -1, _qLo);
    _qd.copy(_qLo).multiply(_qw.setFromEuler(_e.set(wx, wy, wz)));
    if (aw > 0.001) { _qAcc.normalize(); _qd.slerp(_qAcc, clamp(aw, 0, 1)); }
    A.hand.quaternion.copy(_qLo).invert().multiply(_qd);
    const s = A.s;
    for (let f = 0; f < 4; f++) {
      const F = A.fingers[f], c = curl * (1 + f * 0.07);
      F.p.rotation.set(FINGERS[f][5] * (0.5 + sp * 1.8), 0, -s * c * 0.95);
      F.d.rotation.z = -s * c * 1.1;
    }
    A.thumb.p.rotation.set(0.75 + 0.2 * th, 0, -s * (0.3 + 0.55 * th));
    A.thumb.d.rotation.z = -s * th * 0.8;
  }
  function solveLeg(rig, st, L, i) {
    const G = rig.legs[i], o = lo(i);
    _T.set(0, 0, 0); _pl.set(0, 0, 0); _qAcc.set(0, 0, 0, 0);
    let toe = 0;
    for (let j = 0; j < L.length; j += 2) {
      const Pm = L[j], w = L[j + 1], sp = Pm[o + 6];
      _T.addScaledVector(convPoint(st, Pm, o, sp, _t1), w);
      _pl.addScaledVector(convDir(st, Pm, o + 3, sp, _p1), w);
      _qa.setFromEuler(_eF.set(Pm[o + 7], Pm[o + 8], Pm[o + 9]));
      if (sp === 2) _qa.premultiply(st.qI);
      addQuat(_qa, w);
      toe += Pm[o + 10] * w;
    }
    ik(st, G.up, G.lo, THIGH, SHIN, _T, _pl, 1, _qLo);
    _qAcc.normalize();
    G.foot.quaternion.copy(_qLo).invert().multiply(_qAcc);
    G.toe.rotation.x = toe;
  }

  // Dinglende ting (snore, kridtpose) følger tyngdekraft + fartvind med fjeder-forsinkelse
  const _qp = new Q(), _dl = new V3();
  function dangle(obj, D, st, dt, zMin, zMax) {
    _t1.set(-st.vel.x * 0.07, -1 - st.vel.y * 0.07, -st.vel.z * 0.07).normalize();
    if (dt > 0) {
      D.v.addScaledVector(_t2.subVectors(_t1, D.d), 60 * dt).multiplyScalar(Math.max(0, 1 - 9 * dt));
      D.d.addScaledVector(D.v, dt).normalize();
    }
    _qp.setFromRotationMatrix(obj.parent.matrixWorld).invert();
    _dl.copy(D.d).applyQuaternion(_qp);
    _dl.z = clamp(_dl.z, zMin, zMax);
    if (_dl.y > -0.2) _dl.y = -0.2;
    obj.quaternion.setFromUnitVectors(DOWN, _dl.normalize());
  }

  const GROUP = { idle: 'ground', run: 'ground', air: 'air', hang: 'hang', climb: 'climb', rope: 'rope', skate: 'skate', grind: 'skate' };
  const MODES = ['ground', 'air', 'hang', 'climb', 'rope', 'skate'];
  const RATE = { ground: 13, air: 9, hang: 20, climb: 28, rope: 14, skate: 12 };
  const BUILD = { ground: poseGround, air: poseAir, hang: poseHang, climb: poseClimb, rope: poseRope, skate: poseSkate };

  // =====================================================================
  //   Animation (kaldes hver frame)
  // =====================================================================
  function animate(rig, s, dt) {
    const st = rig._st;
    dt = clamp(dt || 0, 0, 0.1);
    const mode = s.mode || 'idle', grp = GROUP[mode] || 'ground', speed = s.speed || 0;
    // fart i verden (til fjedre, pendul og reb)
    const rp = rig.root.position;
    if (!st.init) st.prev.copy(rp);
    if (dt > 0) {
      _v.subVectors(rp, st.prev).divideScalar(dt);
      if (_v.lengthSq() > 900) _v.set(0, 0, 0);
      st.vel.lerp(_v, 0.5);
    }
    st.prev.copy(rp);
    st.velLocal.copy(st.vel).applyAxisAngle(UPV, -rig.inner.rotation.y);
    st.airT = s.grounded === false ? st.airT + dt : 0;
    if (dt > 0) st.accLean = damp(st.accLean, clamp(((speed - st.prevSpeed) / dt) * 0.012, -0.1, 0.18), 5, dt);
    st.prevSpeed = speed;
    st.exert = clamp(st.exert + dt * (grp === 'hang' || grp === 'climb' || grp === 'rope' ? 0.12 : speed > 6 ? 0.04 : -0.07), 0, 1);
    st.pushW = damp(st.pushW, s.push && s.grounded !== false ? 1 : 0, 6, dt);
    if (grp === 'hang' && s.hangKind && s.hangKind !== 'ledge') { // pendul efter grebet om stangen
      if (st.lastGrp !== 'hang') st.swingV = clamp(st.lastSpeed * 0.35, 0, 3);
      st.swingV += (-7.5 * Math.sin(st.swing) - 1.6 * st.swingV) * dt;
      st.swing += st.swingV * dt;
    } else { st.swing = damp(st.swing, 0, 6, dt); st.swingV = 0; }
    st.lastSpeed = speed;
    // tilstandsvægte (bløde overgange)
    if (!st.init) { for (const m of MODES) st.w[m] = m === grp ? 1 : 0; st.init = true; } else {
      for (const m of MODES) { st.w[m] = damp(st.w[m], m === grp ? 1 : 0, RATE[grp], dt); if (st.w[m] < 0.003) st.w[m] = 0; }
    }
    st.lastGrp = grp;
    // salto om kroppens tyngdepunkt
    if (s.flipT != null && s.flipT >= 0 && grp === 'air') {
      const f = clamp(s.flipT, 0, 1);
      st.flipAng = -TAU * f * f * (3 - 2 * f);
      st.flipW = smooth(0, 0.12, f) * (1 - smooth(0.8, 1, f));
    } else { st.flipAng = damp(wrap(st.flipAng), 0, 10, dt); st.flipW = damp(st.flipW, 0, 12, dt); }

    // byg og bland stillingerne
    const L = st.list;
    L.length = 0;
    let tot = 0;
    for (const m of MODES) {
      const w = st.w[m] * (1 - st.flipW);
      if (w <= 0) continue;
      const Pm = st.poses[m];
      Pm.fill(0);
      BUILD[m](st, s, Pm);
      L.push(Pm, w); tot += w;
    }
    if (st.flipW > 0.003) { const Pf = st.poses.flip; Pf.fill(0); poseFlip(st, s, Pf); L.push(Pf, st.flipW); tot += st.flipW; }
    for (let j = 1; j < L.length; j += 2) L[j] /= tot;
    const P = st.pose;
    for (let k = 0; k < A0; k++) { let v = 0; for (let j = 0; j < L.length; j += 2) v += L[j][k] * L[j + 1]; P[k] = v; }

    // krop (FK)
    rig.tiltG.rotation.z = P[I_BANK];
    rig.pivot.rotation.set(P[I_TX] + st.flipAng + st.swing, P[I_YAW], P[I_TZ]);
    rig.pelvis.position.set(P[I_PEL], P[I_PEL + 1], P[I_PEL + 2]);
    rig.pelvis.rotation.set(P[I_PROT], P[I_PROT + 1], P[I_PROT + 2]);
    rig.spine.rotation.set(P[I_SPN], P[I_SPN + 1], P[I_SPN + 2]);
    rig.chest.rotation.set(P[I_CHS], P[I_CHS + 1], P[I_CHS + 2]);
    const aim = s.aimLocal, sk = st.w.skate;              // hovedet drejer let mod kameraets sigte
    let ly = 0, lp = 0;
    if (aim) { ly = wrap(Math.atan2(-aim.x, -aim.z) - P[I_YAW]); lp = Math.asin(clamp(aim.y, -1, 1)); }
    const lim = 0.5 + 0.9 * sk;
    ly = clamp(ly * (0.3 + 0.6 * sk), -lim, lim) * P[I_LOOK];
    lp = clamp(lp * 0.3, -0.25, 0.2) * P[I_LOOK];
    rig.neck.rotation.set(P[I_NCK] + lp * 0.4, P[I_NCK + 1] + ly * 0.4, P[I_NCK + 2]);
    rig.head.rotation.set(P[I_HED] + lp * 0.6, P[I_HED + 1] + ly * 0.6, P[I_HED + 2]);
    for (let i = 0; i < 2; i++) {
      let shr = 0;
      for (let j = 0; j < L.length; j += 2) shr += L[j][ao(i) + 18] * L[j + 1];
      rig.arms[i].clav.rotation.z = rig.arms[i].s * shr * 0.3;
    }
    const br = P[I_BREATH];
    rig.chestMesh.scale.set(1 + 0.012 * br, 1 + 0.005 * br, 1 + 0.022 * br);
    rig.root.updateMatrixWorld(true);
    st.baseInv.copy(rig.base.matrixWorld).invert();
    st.mC.multiplyMatrices(st.baseInv, rig.chest.matrixWorld);
    st.mI.multiplyMatrices(st.baseInv, rig.inner.matrixWorld);
    st.qI.setFromRotationMatrix(st.mI);

    // lemmer (IK)
    for (let i = 0; i < 2; i++) solveArm(rig, st, L, i);
    for (let i = 0; i < 2; i++) solveLeg(rig, st, L, i);

    // sekundær bevægelse
    dangle(rig.strings, st.dStr, st, dt, -1, -0.17);
    dangle(rig.bag, st.dBag, st, dt, 0.02, 1);
    const hoodT = clamp(-st.vel.y * 0.02 + speed * 0.012, -0.2, 0.35);
    st.hoodV += ((hoodT - st.hood) * 70 - st.hoodV * 8) * dt;
    st.hood += st.hoodV * dt;
    rig.hood.rotation.x = st.hood;
    rig.coil.rotation.x = -st.hood * 0.25;

    // blink hvert 3.–6. sekund
    st.blinkT -= dt;
    if (st.blinkT <= 0) { st.blinkT = 3 + Math.random() * 3; st.blinkP = 1e-4; }
    let bl = 0;
    if (st.blinkP > 0) { st.blinkP += dt / 0.16; bl = Math.sin(Math.min(1, st.blinkP) * Math.PI); if (st.blinkP >= 1) st.blinkP = 0; }
    rig.lids.rotation.x = lerp(0.62, -0.85, bl);

    // brættet, udstyr og kridt
    rig.board.visible = mode === 'skate' || mode === 'grind';
    rig.board.rotation.z = -clamp(s.lean || 0, -1, 1) * 0.06;
    if (s.gear) applyGear(rig, s.gear);
    rig.setChalk(s.chalk);
  }

  return { build, animate };
};
