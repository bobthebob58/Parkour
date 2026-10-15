/* =====================================================================
   13. KAMERA (tredjeperson, roteres med højreklik)
   ===================================================================== */
const cam = { yaw: 0, pitch: 0.32, target: new THREE.Vector3(), curDist: CFG.camera.dist, shake: 0 };
const _camRay = new THREE.Raycaster(), _camDir = new THREE.Vector3();

function updateCamera(dt) {
  const k = input.keys;
  if (game.state === 'playing') {
    if (k.KeyQ) cam.yaw += 2.2 * dt;
    if (k.KeyE) cam.yaw -= 2.2 * dt;
    // På skateboardet følger kameraet automatisk brættet (medmindre man selv drejer med højreklik)
    if (player.skate && !input.rightHeld && !k.KeyQ && !k.KeyE) {
      cam.yaw = angleDamp(cam.yaw, -player.skate.heading, 3.2, dt);
      cam.pitch = damp(cam.pitch, 0.24, 2, dt);
    }
  }
  const b = player.body.position;
  const ty = Math.max(b.y + CFG.camera.height - CFG.player.radius, CFG.lavaY + 9);
  cam.target.x = damp(cam.target.x, b.x, 22, dt);
  cam.target.y = damp(cam.target.y, ty, 12, dt);
  cam.target.z = damp(cam.target.z, b.z, 22, dt);
  const cp = Math.cos(cam.pitch);
  _camDir.set(Math.sin(cam.yaw) * cp, Math.sin(cam.pitch), Math.cos(cam.yaw) * cp);
  let want = CFG.camera.dist;
  _camRay.set(cam.target, _camDir);
  _camRay.far = want;
  const hits = _camRay.intersectObjects(level.rayMeshes, false);
  if (hits.length) want = Math.max(1.1, hits[0].distance - 0.35);
  cam.curDist = want < cam.curDist ? want : damp(cam.curDist, want, 4, dt);
  camera.position.copy(cam.target).addScaledVector(_camDir, cam.curDist);
  camera.lookAt(cam.target);
  // Skjul figuren, hvis kameraet presses helt ind på den (så den ikke blokerer udsynet)
  player.model.inner.visible = cam.curDist > 1.6;
  if (cam.shake > 0) {
    cam.shake = Math.max(0, cam.shake - dt);
    const s = cam.shake * 0.25;
    camera.position.x += (Math.random() - 0.5) * s;
    camera.position.y += (Math.random() - 0.5) * s;
  }
}

// Langsom panorering i hovedmenuen
function updateMenuCamera(elapsed) {
  const s = level.spawn;
  const h = level.data.startHeading, f = fwdVec(h);
  const a = -h + Math.sin(elapsed * 0.08) * 0.9 + 0.6;
  camera.position.set(s.x + Math.sin(a) * 15, s.y + 6 + Math.sin(elapsed * 0.25) * 1.2, s.z + Math.cos(a) * 15);
  camera.lookAt(s.x + f.x * 12, s.y + 1, s.z + f.z * 12);
}

