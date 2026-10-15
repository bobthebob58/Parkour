/* =====================================================================
   10. BANEOBJEKTER I DRIFT
   ===================================================================== */
const PORTAL_FRAG = /* glsl */`
  uniform float uTime; uniform vec3 uColA; uniform vec3 uColB;
  varying vec2 vUv;
  void main() {
    vec2 c = vUv - 0.5;
    float r = length(c) * 2.0;
    float a = atan(c.y, c.x);
    float sw = sin(a * 5.0 + r * 11.0 - uTime * 4.5) * 0.5 + 0.5;
    float sw2 = sin(a * 3.0 - r * 7.0 + uTime * 3.0) * 0.5 + 0.5;
    vec3 col = mix(uColA, uColB, sw * 0.7 + sw2 * 0.3) * (0.45 + 0.75 * (1.0 - r));
    col += vec3(0.9, 0.95, 1.0) * pow(1.0 - r, 6.0) * 0.6;
    float alpha = smoothstep(1.0, 0.82, r) * (0.35 + 0.4 * sw);
    gl_FragColor = vec4(col, alpha);
  }`;

const _tq = new THREE.Quaternion();

class Level {
  constructor(index, defOverride) {
    this.index = index;
    this.def = defOverride || LEVELS[index];
    this.data = buildLevelData(this.def);
    this.theme = THEMES[this.def.theme] || THEMES.day;
    this.group = new THREE.Group();
    this.platforms = [];
    this.anchors = [];
    this.coins = [];
    this.bars = [];
    this.zips = [];
    this.gusts = [];
    this.winds = [];
    this.vents = [];
    this.chains = [];
    this.rayMeshes = [];      // kamera-kollision, reb-sigte og skygge
    this.disposables = [];
    this.time = 0;
    this.checkpoint = null;   // seneste kontrolpunkt (platform), man genstarter fra
    this.bodyToPlat = new Map();
    const ctx = makeKitContext(this);
    this.kit = (WORLD_KITS[this.def.kit] || WORLD_KITS.sten).create(ctx);
    this.fallbackKit = this.def.kit && this.def.kit !== 'sten' ? WORLD_KITS.sten.create(ctx) : this.kit;
    this.build();
    scene.add(this.group);
  }

  geo(g) { this.disposables.push(g); return g; }

  build() {
    for (const p of this.data.plats) this.buildPlatform(p);
    for (const b of this.data.bars) this.buildBar(b);
    for (const w of this.data.winds) this.winds.push({ def: w, emit: 0 });
    for (const z of this.data.zips) this.buildZip(z);
    for (const g of this.data.gusts) this.gusts.push({ def: g, emit: 0, f: fwdVec(g.yaw), r: rightVec(g.yaw) });
    for (const a of this.data.anchors) this.buildAnchor(a);
    for (const c of this.data.coins) this.buildCoin(c);
    if (this.kit.decor) {
      const d = this.kit.decor(this.data);
      if (d) this.group.add(d);
    }
    for (const plat of this.platforms) if (plat.def.cp) this.buildCheckpoint(plat);
    this.buildStartDecor();
    this.buildPortal();
  }

  // Lad sættet tegne objektet; sæt skygger og registrér de faste flader
  adopt(obj, plat) {
    let solids = 0;
    obj.traverse((o) => {
      if (!o.isMesh) return;
      if (!o.userData.noCastShadow) o.castShadow = true;
      o.receiveShadow = true;
      if (o.userData.solid) {
        solids++;
        if (plat) { o.userData.plat = plat; this.rayMeshes.push(o); }
      }
    });
    return solids;
  }

  buildPlatform(p) {
    const plat = {
      def: p, type: p.type, mesh: null, body: null,
      grip: p.type === 'ice' ? CFG.grip.ice : CFG.grip.normal,
      icy: p.type === 'ice' || p.v === 'ice' || p.slick, // glatte kanter: grebet slipper dobbelt så hurtigt
      state: 'solid', timer: 0, fallVel: 0, squash: 0,
    };
    const pose = platformPose(p);
    const visual = this.kit.platform(p) || this.fallbackKit.platform(p);
    const mesh = new THREE.Group();
    mesh.add(visual);
    if (!this.adopt(visual, plat)) {
      // Sættet glemte at markere en fast flade: tilføj en usynlig, så kamera og reb stadig virker
      const g = p.shape === 'cyl' ? new THREE.CylinderGeometry(p.w / 2, p.w / 2, p.h, 16)
        : new THREE.BoxGeometry(p.w, p.h, p.type === 'ramp' ? p.slopeLen : p.d);
      const hidden = new THREE.Mesh(this.geo(g), new THREE.MeshBasicMaterial({ visible: false }));
      hidden.userData.solid = true;
      hidden.userData.plat = plat;
      mesh.add(hidden);
      this.rayMeshes.push(hidden);
    }
    this.buildLip(p, plat, mesh);
    mesh.position.copy(pose.pos);
    mesh.quaternion.copy(pose.quat);
    this.group.add(mesh);
    plat.mesh = mesh;
    plat.baseQuat = pose.quat.clone();

    // Fysik
    const kin = p.kin;
    const body = new CANNON.Body({
      mass: 0,
      type: kin ? CANNON.Body.KINEMATIC : CANNON.Body.STATIC,
      material: MAT_WORLD,
      collisionFilterGroup: kin ? G_KINEMATIC : G_STATIC,
      collisionFilterMask: G_PLAYER,
    });
    if (p.shape === 'cyl') body.addShape(new CANNON.Cylinder(p.w / 2, p.w / 2, p.h, 20));
    else body.addShape(new CANNON.Box(new CANNON.Vec3(p.w / 2, p.h / 2, (p.type === 'ramp' ? p.slopeLen : p.d) / 2)));
    body.position.set(pose.pos.x, pose.pos.y, pose.pos.z);
    body.quaternion.set(pose.quat.x, pose.quat.y, pose.quat.z, pose.quat.w);
    if (p.type === 'rot') body.angularVelocity.set(0, p.spd, 0);
    world.addBody(body);
    plat.body = body;
    plat.base = body.position.clone();
    this.bodyToPlat.set(body.id, plat);

    // Vindmøllearm(e)
    if (p.type === 'spin') {
      const armGroup = new THREE.Group();
      const barBody = new CANNON.Body({
        mass: 0, type: CANNON.Body.KINEMATIC, material: MAT_WORLD,
        collisionFilterGroup: G_KINEMATIC, collisionFilterMask: G_PLAYER,
      });
      const arms = p.cross ? 2 : 1;
      for (let i = 0; i < arms; i++) {
        // Sættet kan tegne sin egen arm (lokal X langs armen, 0,36 høj og 0,45 dyb)
        const bar = (this.kit.spinArm && this.kit.spinArm(p)) || new THREE.Mesh(this.geo(boxGeometry(p.bar, 0.36, 0.45, 2)), MAT.stripes);
        bar.rotation.y = (i * Math.PI) / 2;
        bar.traverse((o) => { if (o.isMesh) o.castShadow = true; });
        armGroup.add(bar);
        const q = new CANNON.Quaternion().setFromEuler(0, (i * Math.PI) / 2, 0);
        barBody.addShape(new CANNON.Box(new CANNON.Vec3(p.bar / 2, 0.18, 0.225)), new CANNON.Vec3(), q);
      }
      barBody.position.set(p.x, p.top + 0.5, p.z);
      barBody.angularVelocity.set(0, p.spd, 0);
      world.addBody(barBody);
      armGroup.position.set(p.x, p.top + 0.5, p.z);
      this.group.add(armGroup);
      plat.bar = { body: barBody, mesh: armGroup };
      this.bodyToPlat.set(barBody.id, { type: 'bar', parent: plat, body: barBody });
    }
    // Kæder fra pendulplatformens hjørner op til ophænget
    if (p.swing) {
      const cw = p.w * 0.42, cd = p.d * 0.42;
      for (const [cx, cz] of [[-cw, -cd], [cw, -cd], [-cw, cd], [cw, cd]]) {
        const local = new THREE.Vector3(cx, p.h / 2, cz).applyQuaternion(plat.baseQuat);
        const chain = new THREE.Mesh(this.geo(new THREE.CylinderGeometry(0.035, 0.035, 1, 6, 1, true).translate(0, 0.5, 0)), MAT.hub);
        chain.castShadow = true;
        this.group.add(chain);
        this.chains.push({ plat, local, pivot: new THREE.Vector3(plat.base.x + local.x, plat.base.y + local.y + p.swing.len, plat.base.z + local.z), mesh: chain });
      }
    }
    if (p.type === 'vent') this.vents.push({ plat, emit: 0 });
    this.platforms.push(plat);
  }

  // Kalkhvid, slidt kant på alt, man kan gribe fat i (blå frostkant, hvis den er glat)
  buildLip(p, plat, mesh) {
    if (NO_LEDGE.has(p.type) || !p.lip || Math.min(p.w, p.d) < 0.5) return;
    const mat = plat.icy ? (this.kit.slickColor && !(p.type === 'ice' || p.v === 'ice') ? this.slickMat() : MAT.lipIcy) : p.grab ? MAT.lipGrab : MAT.lipFaint;
    const strong = plat.icy || p.grab;
    const tw = strong ? 0.16 : 0.1, drop = strong ? 0.14 : 0.08, y0 = p.h / 2 + 0.008;
    let g;
    if (p.shape === 'cyl') {
      const R = p.w / 2;
      const ring = new THREE.RingGeometry(Math.max(0.05, R - tw), R + 0.01, 48, 1).rotateX(-Math.PI / 2).translate(0, y0, 0);
      const band = new THREE.CylinderGeometry(R + 0.012, R + 0.012, drop, 48, 1, true).translate(0, y0 - drop / 2, 0);
      const lipG = new THREE.Group();
      lipG.add(new THREE.Mesh(this.geo(ring), mat), new THREE.Mesh(this.geo(band), mat));
      lipG.traverse((o) => { o.userData.noCastShadow = true; });
      mesh.add(lipG);
      return;
    }
    const hw = p.w / 2, hd = p.d / 2, e = 0.012, pos = [];
    const quad = (a, b, c, d) => pos.push(...a, ...b, ...c, ...a, ...c, ...d);
    // Top-ramme: forkant/bagkant i fuld længde, siderne afkortet så hjørnerne ikke overlapper
    quad([-hw, y0, -hd], [hw, y0, -hd], [hw, y0, -hd + tw], [-hw, y0, -hd + tw]);
    quad([-hw, y0, hd - tw], [hw, y0, hd - tw], [hw, y0, hd], [-hw, y0, hd]);
    quad([-hw, y0, -hd + tw], [-hw + tw, y0, -hd + tw], [-hw + tw, y0, hd - tw], [-hw, y0, hd - tw]);
    quad([hw - tw, y0, -hd + tw], [hw, y0, -hd + tw], [hw, y0, hd - tw], [hw - tw, y0, hd - tw]);
    // Smalle bånd ned ad siderne
    const yb = y0 - drop;
    quad([-hw, yb, -hd - e], [hw, yb, -hd - e], [hw, y0, -hd - e], [-hw, y0, -hd - e]);
    quad([hw, yb, hd + e], [-hw, yb, hd + e], [-hw, y0, hd + e], [hw, y0, hd + e]);
    quad([-hw - e, yb, hd], [-hw - e, yb, -hd], [-hw - e, y0, -hd], [-hw - e, y0, hd]);
    quad([hw + e, yb, -hd], [hw + e, yb, hd], [hw + e, y0, hd], [hw + e, y0, -hd]);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const m = new THREE.Mesh(this.geo(geo), mat);
    m.userData.noCastShadow = true;
    mesh.add(m);
  }

  slickMat() {
    if (!this._slickMat) {
      this._slickMat = MAT.lipIcy.clone();
      this._slickMat.color.set(this.kit.slickColor);
      this.disposables.push(this._slickMat);
    }
    return this._slickMat;
  }

  buildBar(b) {
    const visual = (this.kit.bar && this.kit.bar(b)) || this.fallbackKit.bar(b);
    this.adopt(visual, null);
    // Hvide gribebånd: samme signal på alle stænger i alle verdener
    if (b.len >= 0.6) {
      const tapeGeo = this.geo(new THREE.CylinderGeometry(b.r + 0.014, b.r + 0.014, 0.11, 12).rotateZ(Math.PI / 2));
      const n = Math.max(2, Math.round(b.len / 0.7));
      for (let i = 0; i < n; i++) {
        const tape = new THREE.Mesh(tapeGeo, MAT.gripTape);
        tape.position.x = -b.len / 2 + (b.len * (i + 0.5)) / n;
        visual.add(tape);
      }
    }
    visual.position.set(b.x, b.y, b.z);
    visual.rotation.y = Math.atan2(-b.dz, b.dx); // lokal X langs stangen
    this.group.add(visual);
    const bar = {
      def: b, mesh: visual,
      a0: new THREE.Vector3(b.x - (b.dx * b.len) / 2, b.y, b.z - (b.dz * b.len) / 2),
      a: new THREE.Vector3(b.x - (b.dx * b.len) / 2, b.y, b.z - (b.dz * b.len) / 2),
      dir: new THREE.Vector3(b.dx, 0, b.dz),
      vel: new THREE.Vector3(), ropes: [],
    };
    if (b.swing) { // trapezets reb op til ophænget
      for (const e of [0.15, 0.85]) {
        const rope = new THREE.Mesh(this.geo(new THREE.CylinderGeometry(0.025, 0.025, 1, 6, 1, true).translate(0, 0.5, 0)), MAT.rope);
        this.group.add(rope);
        bar.ropes.push({ e, mesh: rope, pivot: new THREE.Vector3(bar.a0.x + b.dx * b.len * e, b.y + b.swing.len, bar.a0.z + b.dz * b.len * e) });
      }
    }
    this.bars.push(bar);
  }

  buildZip(z) {
    let visual = this.kit.zip && this.kit.zip(z);
    if (!visual) {
      visual = new THREE.Group();
      const len3 = Math.hypot(z.len, z.drop);
      const cable = new THREE.Mesh(this.geo(new THREE.CylinderGeometry(0.03, 0.03, len3, 6)), MAT.hook);
      cable.position.set((z.bx - z.ax) / 2, (z.by - z.ay) / 2, (z.bz - z.az) / 2);
      cable.quaternion.setFromUnitVectors(AXIS_Y, new THREE.Vector3(z.bx - z.ax, z.by - z.ay, z.bz - z.az).normalize());
      visual.add(cable);
      for (const [px, py, pz] of [[0, 0, 0], [z.bx - z.ax, z.by - z.ay, z.bz - z.az]]) {
        const pole = new THREE.Mesh(this.geo(new THREE.CylinderGeometry(0.1, 0.12, 3, 10)), MAT.hub);
        pole.position.set(px, py + 0.2, pz);
        visual.add(pole);
      }
      visual.position.set(z.ax, z.ay, z.az);
    }
    this.adopt(visual, null);
    this.group.add(visual);
    const handle = new THREE.Mesh(this.geo(new THREE.TorusGeometry(0.16, 0.035, 8, 16)), MAT.anchor);
    this.group.add(handle);
    const d3 = new THREE.Vector3(z.bx - z.ax, z.by - z.ay, z.bz - z.az);
    const len3 = d3.length();
    this.zips.push({ def: z, mesh: visual, handle, a: new THREE.Vector3(z.ax, z.ay, z.az), dir3: d3.divideScalar(len3), len3, dir: new THREE.Vector3(z.dx, 0, z.dz), s: 0.3 });
  }

  ventActive(plat) {
    const d = plat.def;
    return !d.pulse || ((this.time / d.pulse + d.ph) % 1) < d.duty;
  }
  gustActive(g) {
    const d = g.def;
    return ((this.time / d.per + d.ph) % 1) < d.duty;
  }

  buildAnchor(a) {
    // Ankerpunktet har altid en lysende cyan ring; sættet bestemmer, hvad der sidder i midten
    const group = new THREE.Group();
    if (!this._anchorRingGeo) this._anchorRingGeo = this.geo(new THREE.TorusGeometry(0.62, 0.09, 12, 36));
    const ring = new THREE.Mesh(this._anchorRingGeo, MAT.anchorRing);
    group.add(ring);
    const custom = this.kit.anchor && this.kit.anchor(a);
    if (custom) {
      this.adopt(custom, null);
      group.add(custom);
    } else {
      const inner = new THREE.Mesh(this.geo(new THREE.SphereGeometry(0.2, 16, 12)), MAT.anchor);
      group.add(inner);
    }
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: TEX.glow, color: '#4fe6ff', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.8,
    }));
    glow.scale.set(3.2, 3.2, 1);
    group.add(glow);
    this.disposables.push(glow.material);
    group.position.set(a.x, a.y, a.z);
    this.group.add(group);
    this.anchors.push({ def: a, mesh: group, ring, glow, pos: new THREE.Vector3(a.x, a.y, a.z), vel: new THREE.Vector3(), highlight: 0 });
  }

  buildCoin(c) {
    const group = new THREE.Group();
    const coin = new THREE.Mesh(this.geo(new THREE.CylinderGeometry(0.42, 0.42, 0.09, 28)), MAT.coin);
    coin.rotation.x = Math.PI / 2;
    coin.castShadow = true;
    group.add(coin);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: TEX.glow, color: '#ffd76a', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.55,
    }));
    glow.scale.set(1.8, 1.8, 1);
    group.add(glow);
    this.disposables.push(glow.material);
    const obj = { def: c, mesh: group, collected: false, plat: c.plat !== undefined ? this.platforms[c.plat] : null, pos: new THREE.Vector3(c.x, c.y, c.z), spin: (c.x * 7.13 + c.z * 3.71) % 6 };
    if (obj.plat) obj.offset = new THREE.Vector3(c.x - obj.plat.base.x, c.y - obj.plat.base.y, c.z - obj.plat.base.z);
    group.position.copy(obj.pos);
    this.group.add(group);
    this.coins.push(obj);
  }

  // Kontrolpunkt: en flad, lysende ring på platformen (bliver grøn, når den er nået)
  buildCheckpoint(plat) {
    const d = plat.def, R = Math.min(d.w, d.shape === 'cyl' ? d.w : d.d) * 0.3;
    const mat = new THREE.MeshBasicMaterial({ color: '#e8f2ff', transparent: true, opacity: 0.75, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    this.disposables.push(mat);
    const ring = new THREE.Mesh(this.geo(new THREE.RingGeometry(R * 0.82, R, 48).rotateX(-Math.PI / 2)), mat);
    ring.position.y = d.h / 2 + 0.012;
    const dot = new THREE.Mesh(this.geo(new THREE.CircleGeometry(R * 0.28, 32).rotateX(-Math.PI / 2)), mat);
    dot.position.y = d.h / 2 + 0.012;
    plat.mesh.add(ring, dot);
    plat.cpMat = mat;
  }

  setCheckpoint(plat) {
    if (this.checkpoint === plat) return;
    if (this.checkpoint && this.checkpoint.cpMat) this.checkpoint.cpMat.color.set('#e8f2ff');
    this.checkpoint = plat;
    if (plat && plat.cpMat) plat.cpMat.color.set('#5dff9b');
  }

  buildStartDecor() {
    const p = this.data.plats[0];
    const f = fwdVec(p.heading), r = rightVec(p.heading);
    // "START" malet på platformen
    const startTex = textTexture(['START'], { w: 1024, h: 256, color: 'rgba(255,255,255,0.85)', sizes: [190] });
    this.disposables.push(startTex);
    const decal = new THREE.Mesh(this.geo(new THREE.PlaneGeometry(p.w * 0.7, p.w * 0.175)), new THREE.MeshStandardMaterial({
      map: startTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, roughness: 0.9,
    }));
    this.disposables.push(decal.material);
    decal.rotation.set(-Math.PI / 2, 0, -p.yaw);
    decal.position.set(p.x + f.x * (p.d * 0.22), p.top + 0.01, p.z + f.z * (p.d * 0.22));
    decal.receiveShadow = true;
    this.group.add(decal);

    // Skilt med banenummer og navn
    const signTex = textTexture([`BANE ${this.index + 1}`, this.def.name], {
      w: 1024, h: 512, bg: '#1a2238', color: '#ffffff', sizes: [120, 92],
    });
    this.disposables.push(signTex);
    const sign = new THREE.Group();
    const board = new THREE.Mesh(this.geo(new THREE.BoxGeometry(3.4, 1.7, 0.12)), [
      MAT.signWood, MAT.signWood, MAT.signWood, MAT.signWood,
      new THREE.MeshStandardMaterial({ color: '#6b4a2b', roughness: 0.85 }),
      new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.6, emissive: '#ffffff', emissiveMap: signTex, emissiveIntensity: 0.25 }),
    ]);
    this.disposables.push(board.material[4], board.material[5]);
    board.position.y = 2.3;
    board.castShadow = true;
    sign.add(board);
    for (const sx of [-1.3, 1.3]) {
      const post = new THREE.Mesh(this.geo(new THREE.BoxGeometry(0.14, 2.3, 0.14)), MAT.signWood);
      post.position.set(sx, 1.15, 0.0);
      post.castShadow = true;
      sign.add(post);
    }
    // Skiltet står foran til venstre og vender mod spilleren
    const lateral = -(p.w / 2 - 1.9), ahead = p.d / 2 - 1.2;
    sign.position.set(p.x + f.x * ahead + r.x * lateral, p.top, p.z + f.z * ahead + r.z * lateral);
    sign.rotation.y = -p.yaw + Math.PI + 0.35;
    this.group.add(sign);
  }

  buildPortal() {
    const p = this.data.plats[this.data.plats.length - 1];
    const group = new THREE.Group();
    const R = 2.1;
    const ring = new THREE.Mesh(this.geo(new THREE.TorusGeometry(R, 0.2, 16, 64)), MAT.portalRing);
    ring.castShadow = true;
    group.add(ring);
    const arcs = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const arc = new THREE.Mesh(this.geo(new THREE.TorusGeometry(R + 0.42, 0.07, 8, 32, 1.4)), MAT.anchor);
      arc.rotation.z = (i * Math.PI * 2) / 3;
      arcs.add(arc);
    }
    group.add(arcs);
    const diskMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uColA: { value: new THREE.Color('#2bb8ff') }, uColB: { value: new THREE.Color('#c86bff') } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: PORTAL_FRAG,
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    });
    this.disposables.push(diskMat);
    const disk = new THREE.Mesh(this.geo(new THREE.CircleGeometry(R, 48)), diskMat);
    group.add(disk);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: TEX.glow, color: '#4fb8ff', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.32,
    }));
    glow.scale.set(8, 8, 1);
    this.disposables.push(glow.material);
    group.add(glow);
    // Partikler der kredser om portalen
    const N = 90, pos = new Float32Array(N * 3);
    const prng = mulberry32(5);
    for (let i = 0; i < N; i++) {
      const a = prng() * Math.PI * 2, rr = R * (0.6 + prng() * 0.9);
      pos[i * 3] = Math.cos(a) * rr; pos[i * 3 + 1] = Math.sin(a) * rr; pos[i * 3 + 2] = (prng() - 0.5) * 1.2;
    }
    const pg = this.geo(new THREE.BufferGeometry());
    pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pm = new THREE.PointsMaterial({ color: '#bff3ff', size: 0.12, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    this.disposables.push(pm);
    const sparks = new THREE.Points(pg, pm);
    group.add(sparks);
    const light = new THREE.PointLight('#5fd0ff', 40, 22, 2);
    group.add(light);
    group.position.set(p.x, p.top + R + 0.35, p.z);
    group.rotation.y = -p.yaw;
    this.group.add(group);
    // Lysende cirkel på gulvet
    const floor = new THREE.Mesh(this.geo(new THREE.RingGeometry(R * 0.9, R * 1.25, 48)), new THREE.MeshBasicMaterial({
      color: '#59d8ff', transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending,
      polygonOffset: true, polygonOffsetFactor: -2,
    }));
    this.disposables.push(floor.material);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(p.x, p.top + 0.02, p.z);
    this.group.add(floor);
    this.portal = { group, ring, arcs, disk, diskMat, sparks, glow, light, floor, center: new THREE.Vector3(p.x, p.top + R + 0.35, p.z), top: p.top };
  }

  get spawn() {
    const p = this.data.plats[0];
    const f = fwdVec(p.heading);
    return new THREE.Vector3(p.x - f.x * (p.d * 0.15), p.top + CFG.player.radius + 0.05, p.z - f.z * (p.d * 0.15));
  }

  reset() {
    this.time = 0;
    for (const plat of this.platforms) {
      if (plat.def.move || plat.def.swing) {
        plat.body.position.copy(plat.base);
        plat.body.velocity.set(0, 0, 0);
      }
      if (plat.type === 'rot') {
        const q = plat.baseQuat;
        plat.body.quaternion.set(q.x, q.y, q.z, q.w);
        plat.body.angularVelocity.set(0, plat.def.spd, 0);
      }
      if (plat.type === 'crumble' && plat.state !== 'solid') this.restoreCrumble(plat);
      if (plat.bar) {
        plat.bar.body.quaternion.set(0, 0, 0, 1);
        plat.bar.body.angularVelocity.set(0, plat.def.spd, 0);
      }
    }
    for (const c of this.coins) { c.collected = false; c.mesh.visible = true; c.mesh.scale.setScalar(1); }
    this.fixedUpdate(0);
    this.update(0, 0);
  }

  restoreCrumble(plat) {
    plat.state = 'solid';
    plat.timer = 0;
    plat.fallVel = 0;
    if (!plat.body.world) world.addBody(plat.body);
    plat.mesh.position.set(plat.base.x, plat.base.y, plat.base.z);
    plat.mesh.quaternion.copy(plat.baseQuat);
    plat.mesh.visible = true;
    plat.mesh.scale.setScalar(1);
  }

  triggerCrumble(plat) {
    if (plat.state !== 'solid') return;
    plat.state = 'shaking';
    plat.timer = 0.55;
    audio.play('crack');
  }

  anchorPos(a, t, outPos, outVel) {
    outPos.set(a.def.x, a.def.y, a.def.z);
    outVel.set(0, 0, 0);
    if (a.def.move) {
      const o = moveOffset(a.def.move, t, { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 });
      outPos.x += o.x; outPos.y += o.y; outPos.z += o.z;
      outVel.set(o.vx, o.vy, o.vz);
    }
  }

  // Kaldes før hvert fysikskridt
  fixedUpdate(dt) {
    this.time += dt;
    const t = this.time;
    const o = { x: 0, y: 0, z: 0 };
    for (const plat of this.platforms) {
      if ((plat.def.move || plat.def.swing) && plat.state === 'solid') {
        if (plat.def.move) moveOffset(plat.def.move, t, o);
        else swingOffset(plat.def.swing, t, o);
        const tx = plat.base.x + o.x, ty = plat.base.y + o.y, tz = plat.base.z + o.z;
        if (dt > 0) plat.body.velocity.set((tx - plat.body.position.x) / dt, (ty - plat.body.position.y) / dt, (tz - plat.body.position.z) / dt);
        else plat.body.position.set(tx, ty, tz);
      }
      if (plat.type === 'crumble' && plat.state !== 'solid') {
        plat.timer -= dt;
        if (plat.state === 'shaking' && plat.timer <= 0) {
          plat.state = 'falling';
          plat.timer = 3.2;
          world.removeBody(plat.body);
          if (abilities.rope && abilities.rope.plat === plat) releaseRope(false);
        } else if (plat.state === 'falling' && plat.timer <= 0) {
          // Kommer kun tilbage, hvis spilleren ikke står i vejen
          const pb = player.body.position;
          if (plat.def.kin) { plat.body.position.copy(plat.base); plat.body.velocity.set(0, 0, 0); }
          const near = Math.abs(pb.x - plat.base.x) < plat.def.w / 2 + 1 && Math.abs(pb.z - plat.base.z) < plat.def.d / 2 + 1 &&
            Math.abs(pb.y - plat.def.top) < 2.5;
          if (!near) this.restoreCrumble(plat);
          else plat.timer = 0.3;
        }
      }
    }
    for (const a of this.anchors) this.anchorPos(a, t, a.pos, a.vel);
    for (const bar of this.bars) {
      if (bar.def.swing) swingOffset(bar.def.swing, t, o);
      else if (bar.def.move) moveOffset(bar.def.move, t, o);
      else continue;
      const nx = bar.a0.x + o.x, ny = bar.a0.y + o.y, nz = bar.a0.z + o.z;
      if (dt > 0) bar.vel.set((nx - bar.a.x) / dt, (ny - bar.a.y) / dt, (nz - bar.a.z) / dt);
      bar.a.set(nx, ny, nz);
    }
  }

  // Kaldes hver frame (grafik)
  update(dt, elapsed) {
    for (const plat of this.platforms) {
      if (plat.def.kin && plat.state === 'solid') {
        plat.mesh.position.copy(plat.body.position);
        if (plat.type === 'rot') plat.mesh.quaternion.copy(plat.body.quaternion);
      } else if (plat.type === 'crumble') {
        if (plat.state === 'shaking') {
          const k = 0.06 * (1 - plat.timer / 0.55 + 0.3);
          const c = plat.body.position;
          plat.mesh.position.set(c.x + (Math.random() - 0.5) * k, c.y + (Math.random() - 0.5) * k * 0.5, c.z + (Math.random() - 0.5) * k);
        } else if (plat.state === 'falling') {
          plat.fallVel += 22 * dt;
          plat.mesh.position.y -= plat.fallVel * dt;
          plat.mesh.rotation.x += dt * 0.7;
          plat.mesh.rotation.z += dt * 0.4;
          if (plat.mesh.position.y < CFG.lavaY - 5) plat.mesh.visible = false;
        }
      } else if (plat.type === 'bounce' && plat.squash > 0) {
        plat.squash = Math.max(0, plat.squash - dt * 4);
        const s = 1 - Math.sin(plat.squash * Math.PI) * 0.35;
        plat.mesh.scale.set(1 + (1 - s) * 0.3, s, 1 + (1 - s) * 0.3);
      }
      if (plat.bar) {
        plat.bar.mesh.position.copy(plat.bar.body.position);
        plat.bar.mesh.quaternion.copy(plat.bar.body.quaternion);
      }
    }
    // Pendulernes kæder
    for (const c of this.chains) {
      const bp = c.plat.body.position;
      const from = _v3a.set(bp.x + c.local.x, bp.y + c.local.y, bp.z + c.local.z);
      const dir = _v3b.copy(c.pivot).sub(from);
      const len = dir.length();
      c.mesh.position.copy(from);
      c.mesh.quaternion.setFromUnitVectors(AXIS_Y, dir.divideScalar(len || 1));
      c.mesh.scale.set(1, len, 1);
    }
    for (const bar of this.bars) {
      if (!bar.def.swing && !bar.def.move) continue;
      const b = bar.def;
      bar.mesh.position.set(bar.a.x + (b.dx * b.len) / 2, bar.a.y, bar.a.z + (b.dz * b.len) / 2);
      for (const r of bar.ropes) {
        const from = _v3a.set(bar.a.x + b.dx * b.len * r.e, bar.a.y, bar.a.z + b.dz * b.len * r.e);
        const dir = _v3b.copy(r.pivot).sub(from);
        const len = dir.length();
        r.mesh.position.copy(from);
        r.mesh.quaternion.setFromUnitVectors(AXIS_Y, dir.divideScalar(len || 1));
        r.mesh.scale.set(1, len, 1);
      }
    }
    for (const z of this.zips) {
      const riding = player.hang && player.hang.kind === 'zip' && player.hang.zip === z;
      const s = riding ? player.hang.s3 : z.s;
      z.handle.position.copy(z.a).addScaledVector(z.dir3, s);
      z.handle.position.y -= 0.18;
      z.handle.rotation.y = -Math.atan2(z.dir.z, z.dir.x);
    }
    // Opvind: damp/luft der stiger op
    if (dt > 0) {
      const col = this.kit.ventColor || '#ffffff';
      const cam = camera.position;
      for (const g of this.gusts) {
        const d = g.def;
        if (!this.gustActive(g) || Math.abs(d.x - cam.x) > 90 || Math.abs(d.z - cam.z) > 90) continue;
        g.emit += dt * 40;
        while (g.emit > 1) {
          g.emit--;
          const a = (Math.random() - 0.5) * d.d, b = (Math.random() - 0.5) * d.w;
          particles.emit(d.x + g.f.x * a + g.r.x * b - d.dx * d.w * 0.4, d.y + Math.random() * d.h, d.z + g.f.z * a + g.r.z * b - d.dz * d.w * 0.4,
            d.dx * 14, 0, d.dz * 14, '#e8f4ff', 0.18, 0.7, 0, 0);
        }
      }
      for (const v of this.vents) {
        const bp = v.plat.body.position, d = v.plat.def;
        if (!this.ventActive(v.plat)) continue;
        if (Math.abs(bp.x - cam.x) > 90 || Math.abs(bp.z - cam.z) > 90) continue;
        v.emit += dt * 26;
        const r = Math.min(d.w, d.d) * 0.4;
        while (v.emit > 1) {
          v.emit--;
          const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * r;
          particles.emit(bp.x + Math.cos(a) * rr, bp.y + d.h / 2 + 0.1, bp.z + Math.sin(a) * rr,
            0, 4 + Math.random() * 4, 0, col, 0.35 + Math.random() * 0.4, d.lift / 7, 0, 0.3);
        }
      }
      for (const w of this.winds) {
        const d = w.def;
        if (Math.abs(d.x - cam.x) > 90 || Math.abs(d.z - cam.z) > 90) continue;
        w.emit += dt * 30;
        while (w.emit > 1) {
          w.emit--;
          const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * d.r;
          particles.emit(d.x + Math.cos(a) * rr, d.y + Math.random() * 2, d.z + Math.sin(a) * rr,
            0, 5 + Math.random() * 4, 0, col, 0.3 + Math.random() * 0.35, d.h / 8, 0, 0.3);
        }
      }
    }
    for (const a of this.anchors) {
      a.mesh.position.copy(a.pos);
      a.ring.rotation.y = elapsed * 1.6;
      a.ring.rotation.x = Math.sin(elapsed * 0.8) * 0.4;
      const target = a === abilities.target?.anchor ? 1 : 0;
      a.highlight = damp(a.highlight, target, 12, dt);
      const pulse = 1 + Math.sin(elapsed * 4) * 0.06;
      a.mesh.scale.setScalar(pulse * (1 + a.highlight * 0.35));
      a.glow.material.opacity = 0.65 + a.highlight * 0.35;
    }
    for (const c of this.coins) {
      if (c.collected) {
        if (c.mesh.visible) {
          c.pop = (c.pop || 0) + dt * 5;
          c.mesh.scale.setScalar(Math.max(0, 1 - c.pop));
          c.mesh.position.y += dt * 4;
          if (c.pop >= 1) c.mesh.visible = false;
        }
        continue;
      }
      if (c.plat) {
        if (c.plat.type === 'rot') {
          c.pos.copy(c.offset).applyQuaternion(_tq.copy(c.plat.mesh.quaternion).multiply(_tq2.copy(c.plat.baseQuat).invert())).add(c.plat.mesh.position);
        } else {
          c.pos.copy(c.plat.mesh.position).add(c.offset);
        }
      }
      c.mesh.position.copy(c.pos);
      c.mesh.position.y += Math.sin(elapsed * 2.2 + c.spin) * 0.12;
      c.mesh.rotation.y = elapsed * 2.4 + c.spin;
    }
    if (this.portal) {
      const P = this.portal;
      P.diskMat.uniforms.uTime.value = elapsed;
      P.arcs.rotation.z = elapsed * 1.2;
      P.ring.rotation.z = -elapsed * 0.4;
      P.sparks.rotation.z = elapsed * 0.7;
      const pulse = 1 + Math.sin(elapsed * 3) * 0.05;
      P.glow.scale.set(8 * pulse, 8 * pulse, 1);
      P.light.intensity = 36 + Math.sin(elapsed * 5) * 8;
    }
    if (this.kit.update) this.kit.update(dt, elapsed);
  }

  dispose() {
    for (const plat of this.platforms) {
      if (plat.body.world) world.removeBody(plat.body);
      if (plat.bar) world.removeBody(plat.bar.body);
    }
    scene.remove(this.group);
    // Frigiv alt GPU-indhold, sættet har lavet (men aldrig de delte materialer/teksturer)
    const seen = new Set(this.disposables);
    this.group.traverse((o) => {
      if (o.geometry) seen.add(o.geometry);
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of mats) {
        seen.add(m);
        for (const k of ['map', 'bumpMap', 'normalMap', 'roughnessMap', 'emissiveMap', 'alphaMap', 'aoMap', 'metalnessMap']) {
          if (m[k]) seen.add(m[k]);
        }
      }
    });
    for (const d of seen) if (d && d.dispose && !SHARED_GPU.has(d)) d.dispose();
  }
}
const _v3a = new THREE.Vector3(), _v3b = new THREE.Vector3(), _tq2 = new THREE.Quaternion();

