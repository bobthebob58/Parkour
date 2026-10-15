/* =====================================================================
   12. INPUT
   ===================================================================== */
const input = { keys: Object.create(null), rightHeld: false, leftHeld: false, lastWheel: 0 };
const GAME_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Digit1', 'Digit2', 'Digit3']);

function setLooking(on) {
  document.body.classList.toggle('looking', on);
}
function releasePointer() {
  input.rightHeld = false;
  input.leftHeld = false;
  setLooking(false);
  if (document.pointerLockElement) document.exitPointerLock();
}

window.addEventListener('keydown', (e) => {
  if (game.state === 'playing' && GAME_KEYS.has(e.code)) e.preventDefault();
  audio.init();
  const wasDown = input.keys[e.code];
  input.keys[e.code] = true;
  if (!e.repeat && !wasDown) onKeyPress(e.code);
});
window.addEventListener('keyup', (e) => { input.keys[e.code] = false; });
window.addEventListener('blur', () => { input.keys = Object.create(null); releasePointer(); });

function onKeyPress(code) {
  const s = game.state;
  if (s === 'playing') {
    switch (code) {
      case 'Space':
        if (abilities.rope) releaseRope(true);
        else player.jumpBuffer = CFG.move.jumpBuffer;
        break;
      case 'Digit1': selectAbility('none'); break;
      case 'Digit2': selectAbility('chalk'); break;
      case 'Digit3': selectAbility('rope'); break;
      case 'KeyB': openShop('playing'); break;
      case 'KeyP': case 'Escape': pauseGame(); break;
      case 'KeyR': restartLevel(true); break;
      case 'KeyM': toggleSound(); break;
      case 'KeyH': $('help-hint').classList.toggle('hidden'); break;
      default: break;
    }
  } else if (s === 'paused') {
    if (code === 'KeyP' || code === 'Escape') resumeGame();
    else if (code === 'KeyB') openShop('paused');
  } else if (s === 'shop') {
    if (code === 'Escape' || code === 'KeyB') closeShop();
  } else if (s === 'complete') {
    if (code === 'Enter') nextLevel();
  }
}

canvas.addEventListener('mousedown', (e) => {
  audio.init();
  if (game.state !== 'playing') return;
  if (e.button === 0) {
    if (player.skate) return; // ingen evner på skateboardet
    const hadRope = !!abilities.rope;
    useAbility();
    input.leftHeld = !hadRope && !!abilities.rope; // samme klik: hold for at hale ind
  } else if (e.button === 2) {
    input.rightHeld = true;
    setLooking(true);
    try {
      const r = canvas.requestPointerLock();
      if (r && typeof r.catch === 'function') r.catch(() => {});
    } catch (err) { /* uden pointer lock bruges musens bevægelse direkte */ }
  }
});
window.addEventListener('mouseup', (e) => {
  if (e.button === 0) input.leftHeld = false;
  if (e.button === 2) releasePointer();
});
window.addEventListener('mousemove', (e) => {
  if (game.state !== 'playing') return;
  if (!input.rightHeld && document.pointerLockElement !== canvas) return;
  cam.yaw -= e.movementX * CFG.camera.sens;
  cam.pitch = clamp(cam.pitch + e.movementY * CFG.camera.sens, CFG.camera.minPitch, CFG.camera.maxPitch);
});
window.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  if (game.state !== 'playing') return;
  const now = performance.now();
  if (now - input.lastWheel < 110) return;
  input.lastWheel = now;
  cycleAbility(e.deltaY > 0 ? 1 : -1);
}, { passive: false });

