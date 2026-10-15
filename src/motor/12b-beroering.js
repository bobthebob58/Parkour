/* =====================================================================
   12b. BERØRING (telefon og tablet)
   Venstre del af skærmen: et joystick, der dukker op, hvor tommelfingeren
   rører. Resten af skærmen: træk for at dreje kameraet. Knapper: HOP,
   EVNE og pause. Hotbarens ikoner kan trykkes på for at skifte evne.
   Joysticket er analogt (lidt udslag = gå, fuldt udslag = løb) og sætter
   samtidig de virtuelle W/A/S/D-taster, så klatring, stænger og
   skateboard virker præcis som med tastaturet.
   ===================================================================== */
const touch = {
  active: false,        // touch-styringen vises (touch-skærm eller første berøring)
  stickId: null, x0: 0, y0: 0,
  lookId: null, lookX: 0, lookY: 0,
  lastTouch: 0,         // tidspunkt for seneste berøring (browsere sender bagefter "falske" musehændelser)
};
input.stick = { active: false, x: 0, y: 0 };
input.touchLook = false;
const STICK_R = 56;         // joystickets radius i px
const STICK_DEAD = 0.16;    // dødzone (andel af radius)
const STICK_ZONE = 0.42;    // venstre del af skærmen, hvor joysticket kan startes

// Tastatur- og musetekster omskrevet til touch (bruges på banetips og andre tekster)
const TOUCH_TEXT = [
  [/WASD/g, 'Joysticket'],
  [/[Mm]ellemrum \+ W/g, 'HOP + joystick frem'],
  [/W\/[Mm]ellemrum/g, 'Joystick frem/HOP'],
  [/([Tt])ryk på mellemrum/g, '$1ryk på HOP'],
  [/[Mm]ellemrum/g, 'HOP'],
  [/([Hh])old venstreklik/g, '$1old EVNE'],
  [/\(venstreklik\)/g, '(EVNE-knappen)'],
  [/Venstreklik/g, 'Tryk på EVNE'],
  [/venstreklik/g, 'tryk på EVNE'],
  [/[Hh]øjreklik/g, 'træk i højre side'],
  [/\(scroll\)/g, '(tryk på ikonet forneden)'],
  [/med scrollhjulet/g, 'forneden på skærmen'],
  [/Tryk B for at åbne butikken/g, 'Åbn butikken i pausemenuen'],
  [/ \(B\)/g, ' (i pausemenuen)'],
  [/\((\d)\)/g, '(tryk på ikonet forneden)'],
  [/A\/D/g, 'joysticket til siden'],
  [/Tryk W\b/g, 'Skub joysticket frem'],
  [/tryk W\b/g, 'skub joysticket frem'],
  [/([Hh])old W\b/g, '$1old joysticket frem'],
  [/Tryk S\b/g, 'Træk joysticket tilbage'],
  [/tryk S\b/g, 'træk joysticket tilbage'],
  [/(^|[\s(·!.–-])W:/g, '$1Joystick frem:'],
  [/(^|[\s(·!.–-])S:/g, '$1Joystick tilbage:'],
  [/(^|[\s(·!.–-])W(?=[\s).,!]|$)/g, '$1joysticket frem'],
  [/(^|[\s(·!.–-])S(?=[\s).,!]|$)/g, '$1joysticket tilbage'],
  [/Klik igen/g, 'Tryk igen'],
];
function forTouch(s) {
  if (!touch.active || typeof s !== 'string') return s;
  for (const [re, to] of TOUCH_TEXT) s = s.replace(re, to);
  return s;
}

// Spillets faste tekster i en touch-udgave (skrevet i hånden; resten oversættes af forTouch)
const T_KEYBOARD = {};
function useTouchTexts(on) {
  for (const k of Object.keys(T_TOUCH)) {
    if (!(k in T_KEYBOARD)) T_KEYBOARD[k] = T[k];
    T[k] = on ? T_TOUCH[k] : T_KEYBOARD[k];
  }
}

function prefersTouch() {
  const mm = (q) => !!(window.matchMedia && window.matchMedia(q).matches);
  return mm('(pointer: coarse)') || ((navigator.maxTouchPoints || 0) > 0 && mm('(hover: none)'));
}

function setTouchMode(on) {
  if (touch.active === on) return;
  touch.active = on;
  document.body.classList.toggle('touch', on);
  useTouchTexts(on);
  if (on) {
    // Telefoner og tablets: lavere opløsning og mindre skyggekort; resten styres løbende af updateQuality
    quality.pr = Math.min(window.devicePixelRatio || 1, quality.max);
    renderer.setPixelRatio(quality.pr);
    renderer.setSize(window.innerWidth, window.innerHeight);
    if (sun.shadow.mapSize.x > 1024) {
      sun.shadow.mapSize.set(1024, 1024);
      if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
    }
  }
  if (typeof renderHotbar === 'function' && level) renderHotbar();
}

// ---- Joystick ----
function placeStick(x, y) {
  $('touch-stick').style.transform = `translate(${x - STICK_R}px, ${y - STICK_R}px)`;
}
function setKnob(dx, dy) {
  $('touch-knob').style.transform = `translate(${dx}px, ${dy}px)`;
}
function restStick() {
  $('touch-stick').classList.remove('on');
  $('touch-stick').style.transform = '';
  setKnob(0, 0);
}
function startStick(e) {
  touch.stickId = e.pointerId;
  // Hold hele joysticket inde på skærmen
  touch.x0 = clamp(e.clientX, STICK_R + 8, window.innerWidth - STICK_R - 8);
  touch.y0 = clamp(e.clientY, STICK_R + 8, window.innerHeight - STICK_R - 8);
  $('touch-stick').classList.add('on');
  placeStick(touch.x0, touch.y0);
  moveStick(e);
}
function moveStick(e) {
  let dx = e.clientX - touch.x0, dy = e.clientY - touch.y0;
  const len = Math.hypot(dx, dy);
  if (len > STICK_R) { dx *= STICK_R / len; dy *= STICK_R / len; }
  setKnob(dx, dy);
  let x = dx / STICK_R, y = dy / STICK_R;
  const m = Math.hypot(x, y);
  if (m < STICK_DEAD) { x = 0; y = 0; } else { const k = (m - STICK_DEAD) / (1 - STICK_DEAD) / m; x *= k; y *= k; }
  const st = input.stick, k = input.keys;
  st.active = true; st.x = x; st.y = y;
  // Virtuelle taster til klatring (frem = op, tilbage = giv slip), stænger og skateboard
  k.KeyW = y < -0.5; k.KeyS = y > 0.5; k.KeyA = x < -0.5; k.KeyD = x > 0.5;
}
function endStick() {
  touch.stickId = null;
  const st = input.stick, k = input.keys;
  st.active = false; st.x = 0; st.y = 0;
  k.KeyW = k.KeyS = k.KeyA = k.KeyD = false;
  restStick();
}

// ---- Kamera: træk med fingeren ----
function lookMove(e) {
  const k = 5 / Math.max(window.innerWidth, window.innerHeight); // én skærmbredde ≈ 290°
  cam.yaw -= (e.clientX - touch.lookX) * k;
  cam.pitch = clamp(cam.pitch + (e.clientY - touch.lookY) * k, CFG.camera.minPitch, CFG.camera.maxPitch);
  touch.lookX = e.clientX; touch.lookY = e.clientY;
}

function resetTouch() {
  if (touch.stickId !== null) endStick();
  touch.lookId = null;
  input.touchLook = false;
  input.stick.active = false;
  for (const id of ['btn-touch-jump', 'btn-touch-ability']) $(id).classList.remove('down');
}

canvas.addEventListener('pointerdown', (e) => {
  if (e.pointerType !== 'touch') return;
  touch.lastTouch = performance.now();
  setTouchMode(true);
  audio.init();
  if (game.state !== 'playing') return;
  e.preventDefault();
  if (e.clientX < window.innerWidth * STICK_ZONE) {
    if (touch.stickId !== null) return;
    startStick(e);
  } else {
    if (touch.lookId !== null) return;
    touch.lookId = e.pointerId; touch.lookX = e.clientX; touch.lookY = e.clientY;
    input.touchLook = true;
  }
  try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ældre browsere */ }
});
window.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'touch') return;
  if (e.pointerId === touch.stickId) moveStick(e);
  else if (e.pointerId === touch.lookId && game.state === 'playing') lookMove(e);
});
function endTouchPointer(e) {
  if (e.pointerId === touch.stickId) endStick();
  if (e.pointerId === touch.lookId) { touch.lookId = null; input.touchLook = false; }
}
window.addEventListener('pointerup', endTouchPointer);
window.addEventListener('pointercancel', endTouchPointer);

// ---- Knapper, der kan holdes nede ----
function holdButton(id, down, up) {
  const el = $(id);
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.pointerType === 'touch') { touch.lastTouch = performance.now(); setTouchMode(true); }
    audio.init();
    el.classList.add('down');
    try { el.setPointerCapture(e.pointerId); } catch (err) { /* ældre browsere */ }
    down();
  });
  const release = () => {
    if (!el.classList.contains('down')) return;
    el.classList.remove('down');
    up();
  };
  el.addEventListener('pointerup', release);
  el.addEventListener('pointercancel', release);
  el.addEventListener('lostpointercapture', release);
  el.addEventListener('contextmenu', (e) => e.preventDefault());
}
holdButton('btn-touch-jump', () => {
  if (game.state !== 'playing') return;
  input.keys.Space = true;   // holdes nede = højere hop (som mellemrum)
  onKeyPress('Space');       // hop, dobbelthop, klatr op, spring fra stang, slip rebet
}, () => { input.keys.Space = false; });
holdButton('btn-touch-ability', () => {
  if (game.state === 'playing') pressAbility();
}, () => { input.leftHeld = false; });
holdButton('btn-touch-pause', () => {
  if (game.state === 'playing') pauseGame();
}, () => {});

// Tryk på et ikon i hotbaren for at vælge evnen
$('hotbar').addEventListener('pointerdown', (e) => {
  const slot = e.target.closest('[data-slot]');
  if (!slot || game.state !== 'playing') return;
  e.preventDefault();
  e.stopPropagation();
  selectAbility(slot.dataset.slot);
});

// Ingen zoom, rulning eller "gummibånd" midt i spillet (menuerne må stadig rulles)
document.addEventListener('touchmove', (e) => {
  if (!(e.target.closest && e.target.closest('.screen'))) e.preventDefault();
}, { passive: false });
document.addEventListener('gesturestart', (e) => e.preventDefault());

// Lodret telefon: foreslå at dreje den – men lad spilleren fortsætte alligevel
$('btn-rotate-ok').addEventListener('click', () => document.body.classList.add('rotate-ok'));

// ---- Billedkvalitet på telefon og tablet ----
// Opløsningen sænkes, hvis billedraten falder under ca. 40, og hæves igen, når der er luft.
const quality = { pr: 1, max: 1.5, min: 0.75, t: 0, n: 0 };
function updateQuality(dt) {
  if (!touch.active || game.state !== 'playing' || debug.freeze) { quality.t = 0; quality.n = 0; return; }
  quality.t += dt; quality.n++;
  if (quality.t < 2) return;
  const fps = quality.n / quality.t;
  quality.t = 0; quality.n = 0;
  const cap = Math.min(window.devicePixelRatio || 1, quality.max);
  let pr = quality.pr;
  if (fps < 40) pr = Math.max(quality.min, pr - 0.25);
  else if (fps > 56) pr = Math.min(cap, pr + 0.125);
  if (pr !== quality.pr) {
    quality.pr = pr;
    renderer.setPixelRatio(pr);
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
}

