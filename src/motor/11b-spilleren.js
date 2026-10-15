function createPlayer() {
  const b = new CANNON.Body({
    mass: CFG.player.mass, material: MAT_PLAYER, fixedRotation: true, linearDamping: 0, angularDamping: 1,
    collisionFilterGroup: G_PLAYER, collisionFilterMask: G_STATIC | G_KINEMATIC,
  });
  b.addShape(new CANNON.Sphere(CFG.player.radius));
  b.addShape(new CANNON.Sphere(CFG.player.upperRadius), new CANNON.Vec3(0, CFG.player.upperOffset, 0));
  b.updateMassProperties();
  world.addBody(b);
  player.body = b;
  player.model = CHARACTER.build();
  player.model.inner.rotation.order = 'YXZ';
  scene.add(player.model.root);
  player.blob = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), new THREE.MeshBasicMaterial({
    map: TEX.blob, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4,
  }));
  player.blob.rotation.x = -Math.PI / 2;
  player.blob.renderOrder = 2;
  scene.add(player.blob);
}

// Skift figuren ud (bruges af udviklerværktøjerne)
function replaceCharacter(impl) {
  if (impl) CHARACTER = impl;
  const old = player.model;
  scene.remove(old.root);
  old.root.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  player.model = CHARACTER.build();
  player.model.inner.rotation.order = 'YXZ';
  scene.add(player.model.root);
}

function respawnPlayer() {
  const s = level.spawn, b = player.body;
  b.position.set(s.x, s.y, s.z);
  b.previousPosition.copy(b.position);
  b.velocity.set(0, 0, 0);
  Object.assign(player, {
    grounded: false, wasGrounded: false, groundPlat: null, coyote: 0, jumpBuffer: 0,
    jumpCooldown: 0, jumping: false, knockCooldown: 0, squash: 0, lastVy: 0,
    hang: null, grip: 1, grabCooldown: 0, airJumps: 0, flipT: -1,
  });
  player.skate = level.def.skate ? { heading: level.data.startHeading, grind: null, pushT: 0, lean: 0, crouch: 0, boostT: 0 } : null;
  player.groundVel.set(0, 0, 0);
  player.facing = -level.data.startHeading;
  player.model.root.visible = true;
  cam.target.set(s.x, s.y + CFG.camera.height - CFG.player.radius, s.z);
}

// Ønsket bevægelsesretning ud fra WASD (eller touch-joysticket) og kameraets retning
const wish = new THREE.Vector3();
function readWish() {
  const k = input.keys, st = input.stick;
  // Joysticket er analogt: lidt udslag = gå langsomt, fuldt udslag = løb
  const fwd = st.active ? -st.y : (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0);
  const side = st.active ? st.x : (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);
  const sy = Math.sin(cam.yaw), cy = Math.cos(cam.yaw);
  wish.set(-sy * fwd + cy * side, 0, -cy * fwd - sy * side);
  if (wish.lengthSq() > 1) wish.normalize();
  return wish;
}

// Underlagets friktion (is er glat). Kridt påvirker IKKE fødderne – kun hænderne.
function currentGrip() {
  return player.groundPlat && player.groundPlat.grip !== undefined ? player.groundPlat.grip : CFG.grip.normal;
}

// Kører før hvert fysikskridt
function playerControl(dt) {
  const b = player.body, v = b.velocity, M = CFG.move;
  player.coyote -= dt;
  player.jumpBuffer -= dt;
  player.jumpCooldown -= dt;
  player.knockCooldown -= dt;
  player.grabCooldown -= dt;
  if (player.flipT >= 0) { player.flipT += dt / 0.5; if (player.flipT >= 1) player.flipT = -1; }
  const w = readWish();
  if (player.hang) { if (player.hang.age !== undefined) player.hang.age += dt; hangControl(dt, w); return; }
  if (player.skate) { skateControl(dt); applyAirflow(dt); return; }
  const hasInput = w.x !== 0 || w.z !== 0;

  if (abilities.rope) {
    // svinger i rebet: luftkontrol håndteres i applyRope
  } else if (player.grounded) {
    const gv = player.groundVel;
    const tx = w.x * M.speed + gv.x, tz = w.z * M.speed + gv.z;
    let dx = tx - v.x, dz = tz - v.z;
    const len = Math.hypot(dx, dz);
    const maxD = (hasInput ? M.groundAccel : M.groundDecel) * currentGrip() * dt;
    if (len > maxD) { dx *= maxD / len; dz *= maxD / len; }
    v.x += dx; v.z += dz;
  } else if (hasInput) {
    // Luftkontrol: farten langs input-retningen bevares (momentum fra reb og springpuder),
    // mens sidelæns drift kan styres væk – stramt, men stadig med fart.
    const along = v.x * w.x + v.z * w.z;
    let px = v.x - w.x * along, pz = v.z - w.z * along;
    const add = M.speed - along;
    const a = add > 0 ? Math.min(add, M.airAccel * dt) : 0;
    const perp = Math.hypot(px, pz), cut = M.airAccel * 0.7 * dt;
    const k = perp > cut ? (perp - cut) / perp : 0;
    px *= k; pz *= k;
    v.x = w.x * (along + a) + px;
    v.z = w.z * (along + a) + pz;
  } else {
    const k = Math.max(0, 1 - M.airDrag * dt);
    v.x *= k; v.z *= k;
  }

  // Hop: kun fra jorden (eller lige efter kanten) – og ét dobbelthop i luften, hvis det er købt
  if (player.jumpBuffer > 0 && player.jumpCooldown <= 0 && !abilities.rope) {
    if (player.grounded || player.coyote > 0) {
      v.y = M.jumpVel + Math.max(0, player.groundVel.y);
      player.grounded = false;
      player.coyote = 0;
      player.jumpBuffer = 0;
      player.jumpCooldown = 0.12;
      player.jumping = true;
      player.airJumps = abilities.owned.double ? 1 : 0;
      audio.play('jump');
      const p = b.position;
      particles.burst(p.x, p.y - CFG.player.radius + 0.05, p.z, 6, { color: '#d9d2c4', speed: 2, up: 0.3, size: 0.3, life: 0.5, grav: 0 });
    } else if (player.airJumps > 0) {
      doubleJump(w);
    }
  }
  // Variabel hophøjde
  if (player.jumping && !input.keys.Space && v.y > 0) {
    v.y *= M.jumpCut;
    player.jumping = false;
  }
  if (v.y <= 0) player.jumping = false;

  if (abilities.rope) applyRope(dt, w);
  applyAirflow(dt);
  if (v.y < -M.maxFall) v.y = -M.maxFall;
}

function doubleJump(w) {
  const v = player.body.velocity, D = CFG.dbl;
  v.y = D.vel;
  const hs = Math.hypot(v.x, v.z);
  if (w.x || w.z) { // skift retning i luften, men behold farten
    const sp = Math.max(hs, CFG.move.speed * 0.8);
    v.x = v.x * (1 - D.steer) + w.x * sp * D.steer;
    v.z = v.z * (1 - D.steer) + w.z * sp * D.steer;
  }
  player.airJumps--;
  player.jumpBuffer = 0;
  player.jumpCooldown = 0.12;
  player.jumping = true;
  player.flipT = 0;
  audio.play('dbl');
  const p = player.body.position;
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    particles.emit(p.x, p.y - 0.3, p.z, Math.cos(a) * 4, -0.5, Math.sin(a) * 4, '#dff4ff', 0.28, 0.45, 0, 3);
  }
}

// Opvind fra ventiler og vindsøjler: løfter, til man svæver i toppen
function applyAirflow(dt) {
  const b = player.body, p = b.position, v = b.velocity;
  let accel = 0;
  const feet = p.y - CFG.player.radius;
  for (const vt of level.vents) {
    if (!level.ventActive(vt.plat)) continue;
    const d = vt.plat.def, bp = vt.plat.body.position;
    if (Math.hypot(p.x - bp.x, p.z - bp.z) > Math.min(d.w, d.d) / 2) continue;
    const yy = feet - (bp.y + d.h / 2);
    if (yy < -0.3 || yy > d.lift * 1.6) continue;
    accel = Math.max(accel, CFG.gravity + d.power * (1 - yy / d.lift));
  }
  for (const wd of level.winds) {
    const d = wd.def;
    if (Math.hypot(p.x - d.x, p.z - d.z) > d.r) continue;
    const yy = feet - d.y;
    if (yy < 0 || yy > d.h * 1.6) continue;
    accel = Math.max(accel, CFG.gravity + d.power * (1 - yy / d.h));
  }
  for (const g of level.gusts) { // sidevind
    if (!level.gustActive(g)) continue;
    const d = g.def, rx = p.x - d.x, rz = p.z - d.z;
    if (Math.abs(rx * g.f.x + rz * g.f.z) > d.d / 2 || Math.abs(rx * g.r.x + rz * g.r.z) > d.w / 2) continue;
    if (p.y < d.y || p.y > d.y + d.h) continue;
    const k = player.grounded ? 0.35 : 1; // står man fast, skubber vinden mindre
    v.x += d.dx * d.power * k * dt;
    v.z += d.dz * d.power * k * dt;
  }
  if (accel > 0) {
    v.y += accel * dt;
    v.y *= Math.max(0, 1 - 1.4 * dt);
    if (v.y > CFG.vent.maxUp) v.y = CFG.vent.maxUp;
    player.jumping = false;
  }
}

/* ---------------------------------------------------------------------
   Hænderne: kanter og stænger
   --------------------------------------------------------------------- */
const _hf = { hx: 0, hy: 0, hz: 0, nx: 0, nz: 0, tx: 0, tz: 0, vx: 0, vy: 0, vz: 0 };
const _hq = new THREE.Quaternion(), _hv = new THREE.Vector3(), _hn = new THREE.Vector3();
const _hw = new CANNON.Vec3(), _hr = new CANNON.Vec3();
const smooth01 = (x) => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };

function gripDrain(base) {
  return (base / (abilities.owned.gloves ? CFG.gloves : 1)) * (abilities.chalkActive > 0 ? CFG.chalk.drainMul : 1);
}

function tryGrab() {
  if (player.grabCooldown > 0 || player.grip <= 0.02 || abilities.rope || player.skate) return false;
  const b = player.body, p = b.position, H = CFG.hang;
  if (b.velocity.y > 3.5) return false;
  const chalk = abilities.chalkActive > 0;
  const reach = H.reach + (chalk ? CFG.chalk.reachBonus : 0);
  const win = H.window + (chalk ? CFG.chalk.windowBonus : 0);
  const handY = p.y + H.drop;
  let best = null, bestScore = Infinity;
  for (const plat of level.platforms) {
    if (NO_LEDGE.has(plat.type) || plat.state === 'falling' || !plat.body.world || debug.noLedge) continue;
    const d = plat.def, bp = plat.body.position;
    const dy = bp.y + d.h / 2 - handY;
    if (dy < -win || dy > win * 0.8) continue;
    const half = (d.shape === 'cyl' ? d.w / 2 : Math.hypot(d.w, d.d) / 2) + reach + 0.3;
    const rx = p.x - bp.x, rz = p.z - bp.z;
    if (Math.abs(rx) > half || Math.abs(rz) > half) continue;
    _hq.set(plat.body.quaternion.x, plat.body.quaternion.y, plat.body.quaternion.z, plat.body.quaternion.w).invert();
    _hv.set(rx, 0, rz).applyQuaternion(_hq);
    const lx = _hv.x, lz = _hv.z;
    let c;
    if (d.shape === 'cyl') {
      const dist = Math.hypot(lx, lz) - d.w / 2;
      if (dist <= 0.05 || dist > reach) continue;
      c = { shape: 'cyl', ang: Math.atan2(lz, lx), dist };
    } else {
      const ox = Math.abs(lx) - d.w / 2, oz = Math.abs(lz) - d.d / 2;
      if (ox <= 0.05 && oz <= 0.05) continue; // står over platformen – så lander man i stedet
      const dist = Math.hypot(Math.max(ox, 0), Math.max(oz, 0));
      if (dist > reach) continue;
      if (ox >= oz) {
        const m = Math.min(0.25, d.d / 2);
        c = { shape: 'box', axis: 'x', side: Math.sign(lx) || 1, t: clamp(lz, -d.d / 2 + m, d.d / 2 - m), dist };
      } else {
        const m = Math.min(0.25, d.w / 2);
        c = { shape: 'box', axis: 'z', side: Math.sign(lz) || 1, t: clamp(lx, -d.w / 2 + m, d.w / 2 - m), dist };
      }
    }
    const score = c.dist + Math.abs(dy) * 0.6;
    if (score < bestScore) { bestScore = score; best = { kind: 'ledge', plat, ...c }; }
  }
  const barReach = H.barReach + (chalk ? CFG.chalk.reachBonus * 0.6 : 0);
  for (const bar of level.bars) {
    const dy = bar.a.y - handY;
    if (dy < -win || dy > win * 0.8) continue;
    let s = (p.x - bar.a.x) * bar.dir.x + (p.z - bar.a.z) * bar.dir.z;
    if (s < -barReach || s > bar.def.len + barReach) continue;
    s = clamp(s, 0.25, bar.def.len - 0.25);
    const hd = Math.hypot(p.x - (bar.a.x + bar.dir.x * s), p.z - (bar.a.z + bar.dir.z * s));
    if (hd > barReach) continue;
    const score = hd + Math.abs(dy) * 0.6 - 0.15;
    if (score < bestScore) { bestScore = score; best = { kind: 'bar', bar, s }; }
  }
  for (const z of level.zips) {
    const d = z.def;
    let sh = (p.x - z.a.x) * z.dir.x + (p.z - z.a.z) * z.dir.z; // vandret afstand langs kablet
    if (sh < -barReach || sh > d.len - 1) continue;
    sh = clamp(sh, 0.3, d.len - 1);
    const cy = d.ay - (d.drop * sh) / d.len;
    const dy = cy - handY;
    if (dy < -win || dy > win * 0.8) continue;
    const hd = Math.hypot(p.x - (z.a.x + z.dir.x * sh), p.z - (z.a.z + z.dir.z * sh));
    if (hd > barReach) continue;
    const score = hd + Math.abs(dy) * 0.6 - 0.2;
    if (score < bestScore) { bestScore = score; best = { kind: 'zip', zip: z, s3: (sh / d.len) * z.len3, speed: Math.max(5, Math.hypot(b.velocity.x, b.velocity.z) * 0.8) }; }
  }
  if (!best) return false;
  startHang(best);
  return true;
}

function startHang(c) {
  player.hang = { ...c, climb: null, shimmy: 0, warned: false, age: 0 };
  player.jumping = false;
  player.jumpBuffer = 0;
  player.coyote = 0;
  player.airJumps = abilities.owned.double ? 1 : 0;
  player.flipT = -1;
  audio.play('grab');
  const F = hangFrame(player.hang);
  particles.burst(F.hx, F.hy + 0.05, F.hz, 6, { color: abilities.chalkActive > 0 ? '#ffffff' : '#cfc6b8', speed: 1.2, up: 0.4, size: 0.18, life: 0.5, grav: 2 });
  if (c.kind === 'bar' && player.hints.bar < 2) { player.hints.bar++; toast(T.toastBarHint, 'gold', 3400); }
  if (c.kind === 'zip' && !player.hints.zip) { player.hints.zip = 1; toast(T.toastZipHint, 'gold', 3000); audio.play('zip'); }
  if (c.kind === 'ledge' && player.hints.grab < 2) { player.hints.grab++; toast(T.toastGrabHint, 'gold', 3400); }
  pinHang();
}

// Hvor sidder hænderne lige nu (verdenskoordinater), og hvilken vej vender kanten?
function hangFrame(h) {
  const F = _hf;
  if (h.kind === 'bar') {
    const bar = h.bar;
    F.hx = bar.a.x + bar.dir.x * h.s; F.hy = bar.a.y; F.hz = bar.a.z + bar.dir.z * h.s;
    F.nx = 0; F.nz = 0; F.tx = bar.dir.x; F.tz = bar.dir.z; F.vx = bar.vel.x; F.vy = bar.vel.y; F.vz = bar.vel.z;
    return F;
  }
  if (h.kind === 'zip') {
    const z = h.zip;
    F.hx = z.a.x + z.dir3.x * h.s3; F.hy = z.a.y + z.dir3.y * h.s3; F.hz = z.a.z + z.dir3.z * h.s3;
    F.nx = 0; F.nz = 0; F.tx = z.dir.x; F.tz = z.dir.z;
    F.vx = z.dir3.x * h.speed; F.vy = z.dir3.y * h.speed; F.vz = z.dir3.z * h.speed;
    return F;
  }
  const plat = h.plat, d = plat.def, body = plat.body;
  let lx, lz, nx, nz, tx, tz;
  if (h.shape === 'cyl') {
    const R = d.w / 2, ca = Math.cos(h.ang), sa = Math.sin(h.ang);
    lx = ca * R; lz = sa * R; nx = ca; nz = sa; tx = -sa; tz = ca;
  } else if (h.axis === 'x') {
    lx = (h.side * d.w) / 2; lz = h.t; nx = h.side; nz = 0; tx = 0; tz = 1;
  } else {
    lx = h.t; lz = (h.side * d.d) / 2; nx = 0; nz = h.side; tx = 1; tz = 0;
  }
  _hq.set(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w);
  _hv.set(lx, d.h / 2, lz).applyQuaternion(_hq);
  F.hx = body.position.x + _hv.x; F.hy = body.position.y + _hv.y; F.hz = body.position.z + _hv.z;
  _hn.set(nx, 0, nz).applyQuaternion(_hq); F.nx = _hn.x; F.nz = _hn.z;
  _hn.set(tx, 0, tz).applyQuaternion(_hq); F.tx = _hn.x; F.tz = _hn.z;
  _hr.set(_hv.x, _hv.y, _hv.z);
  body.angularVelocity.cross(_hr, _hw);
  F.vx = body.velocity.x + _hw.x; F.vy = body.velocity.y + _hw.y; F.vz = body.velocity.z + _hw.z;
  return F;
}

// Hold kroppen fast under hænderne (kører både før og efter fysikskridtet)
function pinHang() {
  const h = player.hang;
  if (!h) return;
  const F = hangFrame(h), b = player.body, H = CFG.hang;
  if (h.climb) { placeClimb(F); return; }
  b.position.set(F.hx + F.nx * H.wallGap, F.hy - H.drop, F.hz + F.nz * H.wallGap);
  b.velocity.set(F.vx, F.vy, F.vz);
  if (h.kind === 'ledge') player.facing = Math.atan2(F.nx, F.nz);
  else if (Math.abs(h.shimmy) > 0.2) player.facing = Math.atan2(-F.tx * Math.sign(h.shimmy), -F.tz * Math.sign(h.shimmy));
}

function hangControl(dt, w) {
  const h = player.hang, H = CFG.hang;
  if (h.plat && (h.plat.state === 'falling' || !h.plat.body.world)) { releaseHang('fall'); return; }
  const F = hangFrame(h);
  if (h.climb) {
    h.climb.t = Math.min(1, h.climb.t + dt / H.climbTime);
    placeClimb(F);
    if (h.climb.t >= 1) { player.hang = null; player.grabCooldown = 0.2; player.coyote = 0; }
    return;
  }
  if (h.kind === 'zip') { // svævebanen: glid automatisk nedad, slip med mellemrum eller i bunden
    const z = h.zip;
    h.speed = Math.min(20, h.speed + CFG.gravity * Math.max(0.15, -z.dir3.y) * dt);
    h.s3 += h.speed * dt;
    player.facing = Math.atan2(-z.dir.x, -z.dir.z);
    player.grip = Math.max(0.05, player.grip - gripDrain(H.barDrain * 0.4) * dt);
    if (h.s3 >= z.len3 - 0.4 || player.jumpBuffer > 0) {
      const jump = player.jumpBuffer > 0;
      player.jumpBuffer = 0;
      const v = player.body.velocity;
      player.hang = null;
      player.grabCooldown = 0.5;
      v.set(z.dir3.x * h.speed, z.dir3.y * h.speed + (jump ? 7 : 2.5), z.dir3.z * h.speed);
      if (jump) { player.jumping = true; audio.play('jump'); }
      return;
    }
    pinHang();
    return;
  }
  const along = w.x * F.tx + w.z * F.tz;
  const toward = -(w.x * F.nx + w.z * F.nz);
  let rate = h.kind === 'bar' ? H.barDrain : H.drain;
  if (h.plat && h.plat.icy) rate *= H.iceMul;
  if (Math.abs(along) > 0.3) rate *= H.moveMul;
  player.grip -= gripDrain(rate) * dt;
  if (player.grip <= 0) {
    player.grip = 0;
    releaseHang('slip');
    toast(T.toastSlip, 'bad', 1600);
    audio.play('slip');
    return;
  }
  if (player.grip < 0.3 && !h.warned) { h.warned = true; toast(T.toastGripLow, 'bad', 1800); }
  h.shimmy = 0;
  if (h.kind === 'bar') {
    if (Math.abs(along) > 0.2) {
      h.s = clamp(h.s + along * H.barShimmy * dt, 0.25, h.bar.def.len - 0.25);
      h.shimmy = along;
    }
    if (player.jumpBuffer > 0) { player.jumpBuffer = 0; jumpOffBar(w); return; }
    // S (uden at det flytter en langs stangen) = giv slip
    const k = input.keys;
    if ((k.KeyS || k.ArrowDown) && !(k.KeyW || k.ArrowUp) && Math.abs(along) < 0.3) { releaseHang('drop'); return; }
  } else {
    if (Math.abs(along) > 0.3 && Math.abs(toward) < 0.6) {
      const d = h.plat.def, step = along * H.shimmy * dt;
      if (h.shape === 'cyl') h.ang += step / (d.w / 2);
      else {
        const len = h.axis === 'x' ? d.d : d.w;
        const lim = len / 2 - Math.min(0.25, len / 2);
        h.t = clamp(h.t + step, -lim, lim);
      }
      h.shimmy = along;
    }
    if (player.jumpBuffer > 0 || toward > 0.6) {
      if (h.age >= 0.18) { player.jumpBuffer = 0; startClimb(); return; }
    } else if (toward < -0.6) { releaseHang('drop'); return; }
  }
  pinHang();
}

function startClimb() {
  player.hang.climb = { t: 0 };
  audio.play('climb');
}

// Klatring: først op langs væggen, så ind over kanten
function placeClimb(F) {
  const H = CFG.hang, b = player.body, k = player.hang.climb.t;
  const up = smooth01(k / 0.6), inn = smooth01((k - 0.6) / 0.4);
  const y = F.hy - H.drop + (H.drop + CFG.player.radius + 0.06) * up;
  const out = H.wallGap * (1 - inn) - 0.6 * inn;
  b.position.set(F.hx + F.nx * out, y, F.hz + F.nz * out);
  b.velocity.set(F.vx, F.vy, F.vz);
  player.facing = Math.atan2(F.nx, F.nz);
}

function releaseHang(reason) {
  const h = player.hang;
  if (!h) return;
  const F = hangFrame(h);
  player.hang = null;
  player.grabCooldown = reason === 'jump' ? 0.3 : reason === 'drop' ? 0.5 : reason === 'slip' ? 0.8 : CFG.hang.cooldown;
  const v = player.body.velocity;
  if (reason === 'drop') v.set(F.vx + F.nx * 1.5, Math.min(F.vy, 0) - 1, F.vz + F.nz * 1.5);
  else if (reason === 'slip' || reason === 'fall') v.set(F.vx + F.nx * 0.8, -2, F.vz + F.nz * 0.8);
}

function jumpOffBar(w) {
  // Med retning: et langt fremadspring (til næste stang eller en platform).
  // Uden retning: lige op (til en stang lige over, fx en ræstige i en mast).
  const dir = w.x || w.z, H = CFG.hang;
  // Stangens egen fart (trapez/bevægelig stang) følger med, så man kan kaste sig langt
  const F = hangFrame(player.hang), bvx = F.vx, bvy = F.vy, bvz = F.vz;
  releaseHang('jump');
  player.body.velocity.set(w.x * H.leapFwd + bvx, (dir ? H.leapUp : H.hopUp) + Math.max(0, bvy) * 0.6, w.z * H.leapFwd + bvz);
  player.jumping = true;
  audio.play('jump');
}

/* ---------------------------------------------------------------------
   Skateboard
   --------------------------------------------------------------------- */
function skateControl(dt) {
  const b = player.body, v = b.velocity, S = CFG.skate, k = input.keys, sk = player.skate;
  const steer = input.stick.active ? clamp(input.stick.x / 0.8, -1, 1) // joysticket styrer trinløst
    : (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);
  const pushing = !!(k.KeyW || k.ArrowUp), braking = !!(k.KeyS || k.ArrowDown);
  sk.lean = damp(sk.lean, steer, 8, dt);
  sk.pushT = Math.max(0, sk.pushT - dt);
  sk.crouch = Math.max(0, sk.crouch - dt * 2.5);
  sk.boostT = Math.max(0, sk.boostT - dt);
  if (sk.grind) { grindControl(dt); return; }
  const gv = player.groundVel;
  if (player.grounded) {
    const spd0 = Math.hypot(v.x - gv.x, v.z - gv.z);
    sk.heading += steer * S.turn * clamp(0.5 + spd0 / 14, 0.5, 1) * dt;
    const f = fwdVec(sk.heading);
    const rx = v.x - gv.x, rz = v.z - gv.z;
    let along = rx * f.x + rz * f.z;
    let lx = rx - f.x * along, lz = rz - f.z * along;
    if (along < -2.5) { sk.heading += Math.PI; along = -along; lx = -lx; lz = -lz; } // lander baglæns: vend brættet
    const f2 = fwdVec(sk.heading);
    if (pushing && along < S.maxPush) { along = Math.min(S.maxPush, along + S.push * dt); sk.pushT = 0.35; }
    if (braking) along = Math.max(0, along - S.brake * dt);
    along -= Math.min(Math.max(along, 0), S.roll * dt);
    const plat = player.groundPlat;
    if (plat && plat.type === 'boost' && along < plat.def.boost) {
      along = plat.def.boost;
      if (sk.boostT <= 0) { sk.boostT = 0.6; audio.play('boost'); particles.burst(b.position.x, b.position.y - 0.3, b.position.z, 16, { color: '#7dfcff', speed: 4, up: 0.3, size: 0.3, life: 0.5, grav: 0 }); }
    }
    const kd = Math.exp(-S.lateral * dt);
    lx *= kd; lz *= kd;
    along = Math.min(along, S.maxSpeed);
    v.x = gv.x + f2.x * along + lx;
    v.z = gv.z + f2.z * along + lz;
  } else {
    const dh = steer * S.airTurn * dt;
    sk.heading += dh;
    const c = Math.cos(dh * 0.6), s = Math.sin(dh * 0.6);
    const vx = v.x * c - v.z * s, vz = v.x * s + v.z * c;
    v.x = vx; v.z = vz;
  }
  if (player.jumpBuffer > 0 && player.jumpCooldown <= 0 && (player.grounded || player.coyote > 0)) {
    v.y = S.ollie + Math.max(0, gv.y);
    player.jumpBuffer = 0;
    player.jumpCooldown = 0.15;
    player.grounded = false;
    player.coyote = 0;
    sk.crouch = 1;
    audio.play('ollie');
  }
  if (v.y < -CFG.move.maxFall) v.y = -CFG.move.maxFall;
}

function startGrind(plat) {
  const sk = player.skate, v = player.body.velocity;
  const q = plat.body.quaternion;
  _hq.set(q.x, q.y, q.z, q.w);
  _hn.set(0, 0, -1).applyQuaternion(_hq);
  const along = v.x * _hn.x + v.z * _hn.z;
  sk.grind = { plat, ax: _hn.x, az: _hn.z, dir: along >= 0 ? 1 : -1, speed: Math.max(7, Math.abs(along)) };
  audio.play('grind');
  if (!sk.grindHint) { sk.grindHint = true; toast(T.toastGrind, 'gold', 1000); }
}

function grindControl(dt) {
  const sk = player.skate, g = sk.grind, b = player.body, d = g.plat.def, bp = g.plat.body.position;
  const s = (b.position.x - bp.x) * g.ax + (b.position.z - bp.z) * g.az;
  if (Math.abs(s) > d.d / 2 + 0.05) { sk.grind = null; return; } // kørte ud over enden
  g.speed = Math.max(5, g.speed - CFG.skate.grindFriction * g.speed * dt);
  b.position.set(bp.x + g.ax * s, bp.y + d.h / 2 + CFG.player.radius + 0.01, bp.z + g.az * s);
  b.velocity.set(g.ax * g.dir * g.speed, 0, g.az * g.dir * g.speed);
  sk.heading = Math.atan2(g.ax * g.dir, -g.az * g.dir);
  if (Math.random() < dt * 40) {
    particles.emit(b.position.x, b.position.y - 0.4, b.position.z, (Math.random() - 0.5) * 3, 1.5 + Math.random() * 2, (Math.random() - 0.5) * 3, '#ffd27a', 0.12, 0.35, 12, 0);
  }
  if (player.jumpBuffer > 0) {
    player.jumpBuffer = 0;
    sk.grind = null;
    b.velocity.y = CFG.skate.ollie;
    player.jumpCooldown = 0.2;
    sk.crouch = 1;
    audio.play('ollie');
  }
}

// Kører efter hvert fysikskridt: jordkontakt, transportbånd, springpuder, smuldren, greb, lava, mønter og portal
const _r = new CANNON.Vec3(), _w = new CANNON.Vec3(), _beltDir = new THREE.Vector3();
function postStep(dt, playing) {
  const b = player.body;
  const prevVy = player.lastVy;
  player.wasGrounded = player.grounded;
  let grounded = false, gInfo = null, gBody = null, bestY = 0.5, gnx = 0, gny = 1, gnz = 0;
  for (const c of world.contacts) {
    let other, nx, ny, nz, r;
    if (c.bi === b) { other = c.bj; nx = -c.ni.x; ny = -c.ni.y; nz = -c.ni.z; r = c.rj; }
    else if (c.bj === b) { other = c.bi; nx = c.ni.x; ny = c.ni.y; nz = c.ni.z; r = c.ri; }
    else continue;
    const info = level.bodyToPlat.get(other.id);
    if (!info) continue;
    if (info.type === 'bar' && ny < 0.6) {
      if (playing) knockback(other, nx, nz, r);
      continue;
    }
    if (ny > bestY) { bestY = ny; grounded = true; gInfo = info; gBody = other; _r.copy(r); gnx = nx; gny = ny; gnz = nz; }
  }
  if (player.jumpCooldown > 0 || player.hang) grounded = false;
  player.grounded = grounded;
  player.groundPlat = grounded ? (gInfo.type === 'bar' ? gInfo.parent : gInfo) : null;
  if (grounded) {
    // Underlagets hastighed i kontaktpunktet (v + ω × r) – så man følger med bevægelige platforme
    gBody.angularVelocity.cross(_r, _w);
    player.groundVel.set(gBody.velocity.x + _w.x, gBody.velocity.y + _w.y, gBody.velocity.z + _w.z);
    const gp = player.groundPlat;
    if (gp.type === 'conveyor') { // transportbånd
      _beltDir.set(gp.def.beltAx === 'x' ? 1 : 0, 0, gp.def.beltAx === 'x' ? 0 : -1).applyQuaternion(gp.mesh.quaternion);
      player.groundVel.x += _beltDir.x * gp.def.belt;
      player.groundVel.z += _beltDir.z * gp.def.belt;
    }
    player.groundNormal.set(gnx, gny, gnz);
    player.coyote = CFG.move.coyote;
    player.airJumps = abilities.owned.double ? 1 : 0;
    player.grip = Math.min(1, player.grip + CFG.hang.regen * dt);
  } else {
    player.groundVel.multiplyScalar(0.98);
    player.groundNormal.set(0, 1, 0);
  }
  player.lastVy = b.velocity.y;

  if (player.hang) pinHang();
  if (!playing) return;
  if (grounded && !player.wasGrounded) onLand(prevVy);
  if (grounded) {
    const plat = player.groundPlat;
    if (plat.def.hint && !plat.hintShown) { plat.hintShown = true; toast(plat.def.hint, 'gold', 5000); } // banens egne tips
    if (plat.def.cp && level.checkpoint !== plat) { // kontrolpunkt nået
      level.setCheckpoint(plat);
      toast(T.toastCheckpoint, 'gold', 2600);
      audio.play('buy');
      particles.burst(b.position.x, b.position.y - 0.3, b.position.z, 24, { color: '#5dff9b', speed: 4, up: 1.2, size: 0.25, life: 0.8, grav: 3 });
    }
    if (plat.type === 'bounce') {
      b.velocity.y = plat.def.pow;
      player.grounded = false;
      player.jumpCooldown = 0.15;
      player.jumping = false;
      plat.squash = 1;
      audio.play('bounce');
      particles.burst(b.position.x, b.position.y - 0.3, b.position.z, 14, { color: '#c8ff6a', speed: 4, up: 0.6, size: 0.25, life: 0.6, grav: 6 });
    } else if (plat.type === 'crumble' && plat.state === 'solid') {
      level.triggerCrumble(plat);
      particles.burst(b.position.x, b.position.y - 0.4, b.position.z, 10, { color: '#c49a62', speed: 2.5, up: 0.4, size: 0.22, life: 0.7, grav: 8 });
    } else if (plat.type === 'rail' && player.skate && !player.skate.grind && player.jumpCooldown <= 0) {
      startGrind(plat);
    }
  } else if (!player.hang && !abilities.rope) {
    tryGrab();
  }

  // Lava!
  if (b.position.y - CFG.player.radius < CFG.deathY) { die(); return; }

  // Mønter
  const px = b.position.x, py = b.position.y + 0.5, pz = b.position.z;
  for (const c of level.coins) {
    if (c.collected) continue;
    const dx = c.mesh.position.x - px, dy = c.mesh.position.y - py, dz = c.mesh.position.z - pz;
    if (dx * dx + dy * dy + dz * dz < 1.35 * 1.35) collectCoin(c);
  }

  // Portal
  const P = level.portal;
  if (Math.hypot(px - P.center.x, pz - P.center.z) < 1.7 && b.position.y > P.top - 0.6 && b.position.y < P.top + 4.6) enterPortal();
}

function onLand(vy) {
  if (vy < -5) {
    player.squash = clamp(-vy / 30, 0.12, 0.45);
    if (player.skate) player.skate.crouch = Math.min(1, -vy / 14);
    audio.play('land', clamp(-vy / 25, 0.2, 1));
    const p = player.body.position;
    particles.burst(p.x, p.y - CFG.player.radius + 0.05, p.z, Math.floor(clamp(-vy, 4, 14)), {
      color: player.groundPlat && player.groundPlat.icy ? '#e6f7ff' : '#d8cfbf', speed: 2.6, up: 0.25, size: 0.3, life: 0.55, grav: 0, drag: 3,
    });
  }
  player.flipT = -1;
}

function knockback(barBody, nx, nz, r) {
  if (player.knockCooldown > 0) return;
  const w = barBody.angularVelocity.y;
  const tvx = w * r.z, tvz = -w * r.x; // armens fart i kontaktpunktet
  const v = player.body.velocity;
  v.x = tvx * 1.25 + nx * 4.5;
  v.z = tvz * 1.25 + nz * 4.5;
  v.y = Math.max(v.y, 5.5);
  player.knockCooldown = 0.5;
  player.jumpCooldown = 0.12;
  cam.shake = 0.35;
  audio.play('hit');
}

function collectCoin(c) {
  c.collected = true;
  c.pop = 0;
  game.levelCoins += CFG.coinValue;
  audio.play('coin');
  particles.burst(c.mesh.position.x, c.mesh.position.y, c.mesh.position.z, 16, { color: '#ffd84a', speed: 3.5, up: 0.8, size: 0.2, life: 0.6, grav: 3 });
  toast(T.toastCoin(CFG.coinValue), 'gold', 1100);
}

function emitChalk(n) {
  const v = new THREE.Vector3();
  for (const h of player.model.hands) {
    h.getWorldPosition(v);
    particles.burst(v.x, v.y, v.z, n, { color: '#ffffff', speed: 1.2, up: 0.4, size: 0.16, life: 0.9, grav: -0.4, drag: 2, spread: 0.1 });
  }
}

// Figurens tilstand og animation (kører hver frame)
const _bp = new THREE.Vector3(), _down = new THREE.Vector3(0, -1, 0), _blobRay = new THREE.Raycaster();
function updatePlayerVisual(dt, elapsed) {
  const m = player.model, b = player.body, s = player.cs;
  m.root.position.set(b.position.x, b.position.y, b.position.z);
  const relX = b.velocity.x - player.groundVel.x, relZ = b.velocity.z - player.groundVel.z;
  const sp = Math.hypot(relX, relZ);
  const sk = player.skate;
  if (sk) player.facing = angleDamp(player.facing, -sk.heading, 18, dt);
  else if (player.hang) { /* retningen sættes af pinHang */ }
  else if (sp > 0.7) player.facing = angleDamp(player.facing, Math.atan2(-relX, -relZ), 14, dt);
  else if (game.state === 'playing' && (wish.x || wish.z)) player.facing = angleDamp(player.facing, Math.atan2(-wish.x, -wish.z), 10, dt);
  m.inner.rotation.y = player.facing;
  // På skateboardet følger brættet underlagets hældning
  let pitch = 0;
  if (sk && player.grounded) {
    const f = fwdVec(sk.heading), n = player.groundNormal;
    pitch = Math.asin(clamp(-(n.x * f.x + n.z * f.z), -0.8, 0.8));
  }
  m.inner.rotation.x = damp(m.inner.rotation.x, pitch, 12, dt);

  let mode;
  if (sk) mode = sk.grind ? 'grind' : 'skate';
  else if (player.hang) mode = player.hang.climb ? 'climb' : 'hang';
  else if (abilities.rope) mode = 'rope';
  else if (player.grounded) mode = sp > 0.6 ? 'run' : 'idle';
  else mode = 'air';
  if (mode === 'run' || mode === 'idle') {
    player.runPhase += dt * (3 + sp * 1.3);
    if (mode === 'run' && sp > 2.5 && game.state === 'playing') {
      player.stepTimer -= dt * (sp / 4);
      if (player.stepTimer <= 0) { player.stepTimer = 1; audio.play('step'); }
    }
  }
  player.squash = Math.max(0, player.squash - dt * 3.2);
  s.mode = mode;
  s.speed = sk ? Math.hypot(b.velocity.x, b.velocity.z) : sp;
  s.vy = b.velocity.y;
  s.grounded = player.grounded;
  s.runPhase = player.runPhase;
  s.time = elapsed;
  s.squash = player.squash;
  s.flipT = player.flipT;
  s.chalk = damp(s.chalk || 0, abilities.chalkActive > 0 ? 1 : 0, 8, dt);
  s.hangKind = player.hang ? player.hang.kind : null;
  s.shimmy = player.hang ? player.hang.shimmy : 0;
  s.climbT = player.hang && player.hang.climb ? player.hang.climb.t : 0;
  s.push = !!(sk && sk.pushT > 0);
  s.lean = sk ? sk.lean : 0;
  s.crouch = sk ? sk.crouch : 0;
  // Ekstra oplysninger til en mere levende figur (IK for hænderne, vejrtrækning, udstyr …)
  s.grip = player.grip;
  const prevFacing = s._facing ?? player.facing;
  s.turnRate = dt > 0 ? Math.atan2(Math.sin(player.facing - prevFacing), Math.cos(player.facing - prevFacing)) / dt : 0;
  s._facing = player.facing;
  _invQ.setFromEuler(_eul.set(0, player.facing, 0, 'YXZ')).invert();
  if (player.hang) {
    const F = hangFrame(player.hang);
    s.gripLocal = (s.gripLocal || { x: 0, y: 0, z: 0 });
    _cv.set(F.hx - b.position.x, F.hy - b.position.y, F.hz - b.position.z).applyQuaternion(_invQ);
    s.gripLocal.x = _cv.x; s.gripLocal.y = _cv.y; s.gripLocal.z = _cv.z;
    s.gripTangent = (s.gripTangent || { x: 1, y: 0, z: 0 });
    _cv.set(F.tx, player.hang.kind === 'zip' ? player.hang.zip.dir3.y : 0, F.tz).normalize().applyQuaternion(_invQ);
    s.gripTangent.x = _cv.x; s.gripTangent.y = _cv.y; s.gripTangent.z = _cv.z;
  } else { s.gripLocal = null; s.gripTangent = null; }
  if (abilities.rope) {
    const r = abilities.rope;
    _cv.set(r.point.x - b.position.x, r.point.y - (b.position.y + 0.8), r.point.z - b.position.z).normalize().applyQuaternion(_invQ);
    s.ropeDir = { x: _cv.x, y: _cv.y, z: _cv.z };
  } else s.ropeDir = null;
  const gp = player.grounded ? player.groundPlat : null;
  s.surface = gp ? (gp.type === 'ice' ? 'ice' : gp.type === 'conveyor' ? 'conveyor' : null) : null;
  _cv.set(-Math.sin(cam.yaw) * Math.cos(cam.pitch), -Math.sin(cam.pitch), -Math.cos(cam.yaw) * Math.cos(cam.pitch)).applyQuaternion(_invQ);
  s.aimLocal = { x: _cv.x, y: _cv.y, z: _cv.z };
  s.gear = s.gear || {};
  s.gear.gloves = !!abilities.owned.gloves; s.gear.chalk = !!abilities.owned.chalk;
  s.gear.rope = !!abilities.owned.rope; s.gear.helmet = !!level.def.skate;
  CHARACTER.animate(m, s, dt);
  if (s.chalk > 0.5 && Math.random() < dt * 14) emitChalk(1);

  // Rund skygge lige under spilleren (hjælper med at ramme landingen)
  _bp.set(b.position.x, b.position.y, b.position.z);
  _blobRay.set(_bp, _down);
  _blobRay.far = 60;
  const hits = _blobRay.intersectObjects(level.rayMeshes, false);
  if (hits.length && m.root.visible && !player.hang) {
    const h = hits[0];
    const height = h.distance - CFG.player.radius;
    player.blob.visible = true;
    player.blob.position.set(h.point.x, h.point.y + 0.03, h.point.z);
    const sc = clamp(1 - height / 25, 0.35, 1);
    player.blob.scale.set(sc, sc, sc);
    player.blob.material.opacity = clamp(1 - height / 30, 0.25, 0.9);
  } else {
    player.blob.visible = false;
  }
}

