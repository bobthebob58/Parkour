/* =====================================================================
   14. EVNER: KRIDT OG REB
   ===================================================================== */
const SLOT_ORDER = ['none', 'chalk', 'rope'];
const abilities = {
  owned: { chalk: false, rope: false, chalkbag: false, longrope: false, double: false, gloves: false },
  selected: 'none',
  chalkActive: 0,
  chalkCooldown: 0,
  rope: null,
  target: null,
  ropeShoot: 1,
};

function availableAbilities() { return SLOT_ORDER.filter((id) => id === 'none' || abilities.owned[id]); }

function selectAbility(id) {
  if (id !== 'none' && !abilities.owned[id]) {
    toast(`${T.abilityNames[id]} er låst – køb den i butikken (B)`, 'bad', 1800);
    audio.play('deny');
    return;
  }
  if (abilities.selected === id) return;
  abilities.selected = id;
  audio.play('click');
  renderHotbar();
}

function cycleAbility(dir) {
  const list = availableAbilities();
  if (list.length < 2) { toast(T.toastNoAbility, '', 1800); return; }
  const i = list.indexOf(abilities.selected);
  selectAbility(list[(i + dir + list.length) % list.length]);
}

function useAbility() {
  if (player.skate) return;
  switch (abilities.selected) {
    case 'chalk': useChalk(); break;
    case 'rope': if (abilities.rope) releaseRope(false); else fireRope(); break;
    default: toast(T.toastNoAbility, '', 1800); break;
  }
}

function chalkTotalCooldown() {
  return CFG.chalk.duration + (abilities.owned.chalkbag ? CFG.chalk.cooldownUpgraded : CFG.chalk.cooldown);
}

function useChalk() {
  if (abilities.chalkCooldown > 0) {
    toast(T.toastChalkCd(abilities.chalkCooldown), 'bad', 1400);
    audio.play('deny');
    return;
  }
  abilities.chalkActive = CFG.chalk.duration;
  abilities.chalkCooldown = chalkTotalCooldown();
  player.grip = 1; // frisk kridt: grebet fyldes helt op – også midt i et hæng
  if (player.hang) player.hang.warned = false;
  audio.play('chalk');
  emitChalk(26);
  toast(T.toastChalk, 'good', 2200);
}

const ropeRange = () => (abilities.owned.longrope ? CFG.rope.rangeUpgraded : CFG.rope.range);
const _aimDir = new THREE.Vector3(), _aimTmp = new THREE.Vector3(), _chest = new THREE.Vector3(), _aimRay = new THREE.Raycaster();

// Sigte: krogpunkter tæt på sigtekornet foretrækkes (sigtehjælp), ellers rammes platforme direkte
function findRopeTarget() {
  const b = player.body.position;
  const range = ropeRange();
  _chest.set(b.x, b.y + 0.8, b.z);
  camera.getWorldDirection(_aimDir);
  const origin = camera.position;
  let best = null, bestAng = CFG.rope.assistAngle;
  for (const a of level.anchors) {
    if (a.pos.distanceTo(_chest) > range) continue;
    const ang = _aimTmp.copy(a.pos).sub(origin).angleTo(_aimDir);
    if (ang < bestAng) { bestAng = ang; best = a; }
  }
  if (best) return { anchor: best, plat: null, point: best.pos.clone() };
  // Automatisk lås på et krogpunkt, der ligger nogenlunde foran (så man ikke skal sigte stejlt op)
  const hl = Math.hypot(_aimDir.x, _aimDir.z) || 1;
  const fx = _aimDir.x / hl, fz = _aimDir.z / hl;
  let bestScore = Infinity;
  for (const a of level.anchors) {
    const dx = a.pos.x - _chest.x, dy = a.pos.y - _chest.y, dz = a.pos.z - _chest.z;
    const hd = Math.hypot(dx, dz) || 0.001;
    const dist = Math.hypot(hd, dy);
    if (dist > range || dist < 1.5) continue;
    const cosYaw = (dx * fx + dz * fz) / hd;
    const elev = Math.atan2(dy, hd);
    if (cosYaw < CFG.rope.lockCos || elev < -0.35 || elev > 1.4) continue;
    const score = (1 - cosYaw) * 12 + dist * 0.02;
    if (score < bestScore) { bestScore = score; best = a; }
  }
  if (best) return { anchor: best, plat: null, point: best.pos.clone() };
  const tStart = Math.max(0, _aimTmp.copy(_chest).sub(origin).dot(_aimDir));
  _aimRay.set(_aimTmp.copy(origin).addScaledVector(_aimDir, tStart), _aimDir);
  _aimRay.far = range + 8;
  const hits = _aimRay.intersectObjects(level.rayMeshes, false);
  for (const h of hits) {
    const plat = h.object.userData.plat;
    if (!plat || plat.state === 'falling') continue;
    if (h.point.distanceTo(_chest) > range) break;
    return { anchor: null, plat, point: h.point.clone() };
  }
  return null;
}

function fireRope() {
  const t = findRopeTarget();
  if (!t) {
    toast(T.toastRopeNoTarget, 'bad', 1400);
    audio.play('deny');
    return;
  }
  if (player.hang) releaseHang('jump');
  const b = player.body.position;
  const len = Math.hypot(b.x - t.point.x, b.y + 0.8 - t.point.y, b.z - t.point.z);
  let local = null;
  if (t.plat) { // ankerpunktet gemmes i platformens eget koordinatsystem (så det følger med, hvis den drejer)
    const q = t.plat.body.quaternion;
    local = new THREE.Vector3(t.point.x - t.plat.body.position.x, t.point.y - t.plat.body.position.y, t.point.z - t.plat.body.position.z)
      .applyQuaternion(_hq.set(q.x, q.y, q.z, q.w).invert());
  }
  abilities.rope = { anchor: t.anchor, plat: t.plat, point: t.point.clone(), vel: new THREE.Vector3(), length: len, local };
  abilities.ropeShoot = 0;
  player.jumping = false;
  player.airJumps = abilities.owned.double ? 1 : 0; // dobbelthoppet er klar igen efter et sving
  audio.play('rope');
}

function releaseRope(jump) {
  if (!abilities.rope) return;
  abilities.rope = null;
  input.leftHeld = false;
  if (jump) {
    const v = player.body.velocity;
    v.y = Math.max(v.y, 0) + CFG.rope.releaseBoost;
    audio.play('jump');
  }
}

function updateRopeAnchor(rope) {
  if (rope.anchor) {
    rope.point.copy(rope.anchor.pos);
    rope.vel.copy(rope.anchor.vel);
  } else if (rope.plat) {
    const pb = rope.plat.body, q = pb.quaternion;
    _v3a.copy(rope.local).applyQuaternion(_hq.set(q.x, q.y, q.z, q.w));
    rope.point.set(pb.position.x + _v3a.x, pb.position.y + _v3a.y, pb.position.z + _v3a.z);
    _hr.set(_v3a.x, _v3a.y, _v3a.z);
    pb.angularVelocity.cross(_hr, _hw);
    rope.vel.set(pb.velocity.x + _hw.x, pb.velocity.y + _hw.y, pb.velocity.z + _hw.z);
  }
}

// Rebet som en uelastisk afstandsbegrænsning + langsom indhaling (pendul-sving)
function applyRope(dt, w) {
  const rope = abilities.rope, R = CFG.rope;
  updateRopeAnchor(rope);
  const b = player.body, p = b.position, v = b.velocity;
  const dx = p.x - rope.point.x, dy = p.y + 0.8 - rope.point.y, dz = p.z - rope.point.z;
  const dist = Math.hypot(dx, dy, dz) || 0.0001;
  if (input.leftHeld) rope.length = Math.max(R.minLength, rope.length - R.reel * dt); // hal ind
  const nx = dx / dist, ny = dy / dist, nz = dz / dist;
  if (w.x || w.z) { // "pump" svinget med WASD (vinkelret på rebet)
    const d = w.x * nx + w.z * nz;
    v.x += (w.x - nx * d) * R.swingAccel * dt;
    v.y += (-ny * d) * R.swingAccel * dt;
    v.z += (w.z - nz * d) * R.swingAccel * dt;
  }
  if (dist > rope.length) {
    const radial = (v.x - rope.vel.x) * nx + (v.y - rope.vel.y) * ny + (v.z - rope.vel.z) * nz;
    if (radial > 0) { v.x -= nx * radial; v.y -= ny * radial; v.z -= nz * radial; }
    p.x = rope.point.x + nx * rope.length;
    p.y = rope.point.y + ny * rope.length - 0.8;
    p.z = rope.point.z + nz * rope.length;
  }
  const sp = Math.hypot(v.x, v.y, v.z);
  if (sp > R.maxSpeed) { const s = R.maxSpeed / sp; v.x *= s; v.y *= s; v.z *= s; }
}

// Reb-grafik
const ropeGeo = new THREE.CylinderGeometry(0.035, 0.035, 1, 6, 1, true);
ropeGeo.translate(0, 0.5, 0);
const ropeMesh = new THREE.Mesh(ropeGeo, MAT.rope);
ropeMesh.castShadow = true;
ropeMesh.visible = false;
scene.add(ropeMesh);
const hookMesh = new THREE.Group();
{
  const hub = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 10), MAT.hook);
  hookMesh.add(hub);
  for (let i = 0; i < 3; i++) {
    const prong = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.035, 6, 12, Math.PI * 0.9), MAT.hook);
    prong.rotation.y = (i * Math.PI * 2) / 3;
    prong.position.y = 0.05;
    hookMesh.add(prong);
  }
  hookMesh.visible = false;
  scene.add(hookMesh);
}
const _hand = new THREE.Vector3(), _ropeDir = new THREE.Vector3(), _yAxis = new THREE.Vector3(0, 1, 0);

function updateRopeVisual(dt) {
  const rope = abilities.rope;
  if (!rope) { ropeMesh.visible = false; hookMesh.visible = false; return; }
  abilities.ropeShoot = Math.min(1, abilities.ropeShoot + dt / 0.09);
  player.model.hands[1].getWorldPosition(_hand);
  _ropeDir.copy(rope.point).sub(_hand);
  const len = _ropeDir.length();
  _ropeDir.normalize();
  ropeMesh.visible = true;
  ropeMesh.position.copy(_hand);
  ropeMesh.quaternion.setFromUnitVectors(_yAxis, _ropeDir);
  ropeMesh.scale.set(1, len * abilities.ropeShoot, 1);
  hookMesh.visible = true;
  hookMesh.position.copy(_hand).addScaledVector(_ropeDir, len * abilities.ropeShoot);
  hookMesh.quaternion.setFromUnitVectors(_yAxis, _ropeDir.negate());
}

