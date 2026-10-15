/* =====================================================================
   16. BRUGERFLADE
   ===================================================================== */
const ICONS = {
  none: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 12V6.5a1.4 1.4 0 0 1 2.8 0V11M10.8 10.5V5a1.4 1.4 0 0 1 2.8 0v5.5M13.6 10.5V6a1.4 1.4 0 0 1 2.8 0v5M16.4 11V8.8a1.4 1.4 0 0 1 2.8 0V14c0 4-3 7-6.8 7-3 0-4.9-1.6-6.4-4.2L4 13.6a1.4 1.4 0 0 1 2.3-1.6L8 14"/></svg>',
  chalk: '<svg viewBox="0 0 24 24"><g transform="rotate(-22 11 13)"><rect x="3.5" y="9.5" width="13" height="7" rx="1.6" fill="#f5f5f5"/><rect x="3.5" y="9.5" width="4" height="7" rx="1.4" fill="#d6d6d6"/></g><circle cx="19" cy="6.5" r="1.7" fill="#ffffff" opacity=".9"/><circle cx="16" cy="3.6" r="1.1" fill="#ffffff" opacity=".65"/><circle cx="21.2" cy="10.5" r="1" fill="#ffffff" opacity=".6"/></svg>',
  rope: '<svg viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3c3 2 5 2 7 1.5" stroke="#d6b27a" stroke-width="2"/><circle cx="12" cy="5" r="1.9" stroke="#cfd6e0" stroke-width="1.8"/><path d="M12 7v10" stroke="#cfd6e0" stroke-width="2.2"/><path d="M12 17c-3 0-5.5-1.6-6-4.5M12 17c3 0 5.5-1.6 6-4.5M12 17v3.5" stroke="#cfd6e0" stroke-width="2.2"/></svg>',
  bag: '<svg viewBox="0 0 24 24"><path d="M6.5 9h11l1.4 9.2a3 3 0 0 1-3 3.3H8.1a3 3 0 0 1-3-3.3z" fill="#6b8cff"/><rect x="5.5" y="7.4" width="13" height="2.6" rx="1.3" fill="#3a55c8"/><path d="M8 7.5c.8-2 2.3-3 4-3s3.2 1 4 3" fill="none" stroke="#f3f3f3" stroke-width="1.5"/><circle cx="12" cy="15.4" r="2.6" fill="#ffffff" opacity=".9"/></svg>',
  longrope: '<svg viewBox="0 0 24 24" fill="none" stroke="#d6b27a" stroke-width="1.9" stroke-linecap="round"><ellipse cx="11" cy="12" rx="8" ry="5"/><ellipse cx="11" cy="12" rx="5.3" ry="3.1"/><ellipse cx="11" cy="12" rx="2.6" ry="1.4"/><path d="M19 12c2 1.6 2.4 4.6.4 7"/></svg>',
  double: '<svg viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M6 20l6-6 6 6" stroke="#9fe4ff" stroke-width="2.2"/><path d="M6 13l6-6 6 6" stroke="#ffffff" stroke-width="2.2"/><path d="M8 4.5h8" stroke="#9fe4ff" stroke-width="1.6" opacity=".7"/></svg>',
  gloves: '<svg viewBox="0 0 24 24"><path d="M7 21v-5.5L4.6 12a1.4 1.4 0 0 1 2.3-1.6L8.5 12V5.2a1.4 1.4 0 0 1 2.8 0V11h.4V3.9a1.4 1.4 0 0 1 2.8 0V11h.4V5.2a1.4 1.4 0 0 1 2.8 0V11h.3V8a1.4 1.4 0 0 1 2.8 0v7.2L18 21z" fill="#e0913a"/><rect x="7" y="18.6" width="11" height="2.6" rx="1" fill="#7a4a1a"/></svg>',
  skate: '<svg viewBox="0 0 24 24" fill="none"><path d="M3 12.5h18c-.4 1.6-1.8 2.5-3.4 2.5H6.4C4.8 15 3.4 14.1 3 12.5z" fill="#ff7a3a"/><circle cx="7" cy="18" r="2" fill="#f0e6c8"/><circle cx="17" cy="18" r="2" fill="#f0e6c8"/></svg>',
};

function renderHotbar() {
  $('hotbar').classList.toggle('hidden', !!(level && level.def.skate));
  $('hotbar').innerHTML = SLOT_ORDER.map((id, i) => {
    const locked = id !== 'none' && !abilities.owned[id];
    const cls = ['slot', abilities.selected === id ? 'selected' : '', locked ? 'locked' : ''].join(' ');
    return `<div class="${cls}" data-slot="${id}"><span class="slot-key">${i + 1}</span>${ICONS[id]}<span class="slot-name">${T.abilityNames[id]}</span><div class="slot-cd"></div></div>`;
  }).join('');
  ui.chalkCd = $('hotbar').querySelector('[data-slot="chalk"] .slot-cd');
}

const ui = { chalkCd: null, crosshairState: '' };
function setText(id, text) {
  const el = $(id);
  if (el._t !== text) { el.textContent = text; el._t = text; }
}

function toast(msg, kind = '', dur = 2400) {
  if (debug.quiet) return;
  const box = $('toasts');
  for (const el of box.children) {
    if (el._msg === msg && !el.classList.contains('out')) { clearTimeout(el._timer); el._timer = setTimeout(() => removeToast(el), dur); return; }
  }
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = msg;
  el._msg = msg;
  box.appendChild(el);
  while (box.children.length > 4) box.removeChild(box.firstChild);
  el._timer = setTimeout(() => removeToast(el), dur);
}
function removeToast(el) {
  el.classList.add('out');
  setTimeout(() => el.remove(), 420);
}
function clearToasts() { $('toasts').innerHTML = ''; }

function showBanner() {
  const el = $('level-banner');
  setText('level-banner-num', T.levelBanner(game.levelIndex + 1));
  setText('level-banner-name', level.def.name);
  el.classList.add('hidden');
  void el.offsetWidth; // genstart CSS-animationen
  el.classList.remove('hidden');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.add('hidden'), 3300);
}

function updateHud() {
  setText('hud-level-num', String(game.levelIndex + 1));
  setText('hud-level-of', `/${LEVELS.length}`);
  setText('hud-level-name', level.def.name);
  setText('hud-coins', String(game.coins));
  setText('hud-level-coins', game.levelCoins > 0 ? `+${game.levelCoins}` : '');
  setText('hud-time', formatTime(game.levelTime));
  setText('hud-deaths', String(game.deaths));

  const sel = abilities.selected;
  setText('hud-ability-name', player.skate ? T.skateAbility : T.abilityNames[sel]);
  let status, fill = 0, mode = '';
  if (player.skate) {
    const v = player.body.velocity, kmh = Math.round(Math.hypot(v.x, v.z) * 3.6);
    status = T.skateStatus(kmh); fill = Math.min(1, kmh / (CFG.skate.maxSpeed * 3.6)); mode = 'active';
  } else if (sel === 'chalk') {
    if (abilities.chalkActive > 0) {
      status = T.chalkActive(abilities.chalkActive); fill = abilities.chalkActive / CFG.chalk.duration; mode = 'active';
    } else if (abilities.chalkCooldown > 0) {
      const total = chalkTotalCooldown() - CFG.chalk.duration;
      status = T.cooldown(abilities.chalkCooldown); fill = 1 - abilities.chalkCooldown / total; mode = 'cooldown';
    } else { status = T.abilityReady; fill = 1; }
  } else if (sel === 'rope') {
    status = abilities.rope ? T.ropeAttached : abilities.target ? T.ropeTarget : T.ropeAim;
    fill = abilities.rope ? 1 : abilities.target ? 1 : 0;
  } else {
    status = T.abilityNone;
  }
  setText('hud-ability-status', status);
  const panel = $('hud-ability');
  if (panel._mode !== mode) { panel.classList.toggle('active', mode === 'active'); panel.classList.toggle('cooldown', mode === 'cooldown'); panel._mode = mode; }
  $('hud-ability-fill').style.width = `${Math.round(clamp(fill, 0, 1) * 100)}%`;
  if (ui.chalkCd) {
    const cdFrac = abilities.chalkActive > 0 ? 0 : abilities.chalkCooldown / Math.max(0.01, chalkTotalCooldown() - CFG.chalk.duration);
    ui.chalkCd.style.transform = `scaleY(${clamp(cdFrac, 0, 1).toFixed(3)})`;
  }
  // Grebsmåler (vises, når man hænger, eller grebet ikke er fyldt op)
  const gripEl = $('hud-grip');
  const showGrip = !!player.hang || player.grip < 0.995;
  if (gripEl._show !== showGrip) { gripEl.classList.toggle('hidden', !showGrip); gripEl._show = showGrip; }
  if (showGrip) {
    $('hud-grip-fill').style.width = `${Math.round(player.grip * 100)}%`;
    gripEl.classList.toggle('low', player.grip < 0.3);
    gripEl.classList.toggle('chalked', abilities.chalkActive > 0);
  }
  // Dobbelthop klar?
  const dbl = $('hud-dbl');
  const dblState = !abilities.owned.double || player.skate ? 'off' : (player.airJumps > 0 || player.grounded ? 'ready' : 'used');
  if (dbl._s !== dblState) { dbl.className = `panel dbl-${dblState}`; dbl._s = dblState; }
  const ch = abilities.rope ? 'hooked' : (sel === 'rope' && abilities.target ? 'target' : '');
  if (ch !== ui.crosshairState) {
    const el = $('crosshair');
    el.classList.toggle('hooked', ch === 'hooked');
    el.classList.toggle('target', ch === 'target');
    ui.crosshairState = ch;
  }
}

const SCREENS = { menu: 'screen-menu', paused: 'screen-pause', complete: 'screen-complete', shop: 'screen-shop', victory: 'screen-victory', levels: 'screen-levels' };
function setState(s) {
  game.state = s;
  for (const [k, id] of Object.entries(SCREENS)) $(id).classList.toggle('hidden', k !== s);
  $('hud').classList.toggle('hidden', !(s === 'playing' || s === 'dead' || s === 'portal'));
  if (s !== 'playing') {
    releasePointer();
    input.keys = Object.create(null);
  } else {
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    canvas.focus({ preventScroll: true });
  }
}

function renderShop() {
  setText('shop-coins', String(game.coins));
  const nameOf = (id) => SHOP_ITEMS.find((it) => it.id === id).name;
  $('shop-items').innerHTML = SHOP_ITEMS.map((it) => {
    const owned = abilities.owned[it.id];
    const reqOk = !it.requires || abilities.owned[it.requires];
    const afford = game.coins >= it.price;
    let btn;
    if (owned) btn = `<button class="btn" disabled>${T.shopOwned}</button>`;
    else if (!reqOk) btn = `<button class="btn" disabled>${T.shopRequires(nameOf(it.requires))}</button>`;
    else if (!afford) btn = `<button class="btn" disabled><span class="si-price"><span class="coin-icon"></span>${it.price} · ${T.shopMissing(it.price - game.coins)}</span></button>`;
    else btn = `<button class="btn btn-primary" data-buy="${it.id}"><span class="si-price">${T.shopBuy} · <span class="coin-icon"></span>${it.price}</span></button>`;
    return `<div class="shop-item ${owned ? 'owned' : ''}"><div class="si-icon">${ICONS[it.icon]}</div><div class="si-kind">${it.kind}</div><h3>${it.name}</h3><p>${it.desc}</p>${btn}</div>`;
  }).join('');
}

function buy(id) {
  const it = SHOP_ITEMS.find((x) => x.id === id);
  if (!it || abilities.owned[id] || game.coins < it.price) return;
  if (it.requires && !abilities.owned[it.requires]) return;
  game.coins -= it.price;
  abilities.owned[id] = true;
  if (id === 'chalk' || id === 'rope') abilities.selected = id;
  audio.play('buy');
  if (id === 'double') setTimeout(() => toast(T.toastDoubleOwned, 'gold', 2600), 50);
  saveGame();
  renderShop();
  renderHotbar();
  toast(T.toastBought(it.name), 'gold');
}

function openShop(from) {
  game.shopReturn = from;
  renderShop();
  setState('shop');
}
function closeShop() {
  const r = game.shopReturn;
  if (r === 'playing') setState('playing');
  else if (r === 'paused') setState('paused');
  else if (r === 'complete') setState('complete');
  else { refreshMenu(); setState('menu'); }
}

function pauseGame() {
  setText('btn-sound', T.soundBtn(game.sound));
  setState('paused');
}
function resumeGame() { setState('playing'); }

function toggleSound() {
  game.sound = !game.sound;
  audio.setEnabled(game.sound);
  setText('btn-sound', T.soundBtn(game.sound));
  toast(T.toastSound(game.sound), '', 1200);
  saveGame();
}

// Banevalg: alle baner, man har låst op (gemt i "highest")
function renderLevelSelect() {
  const save = loadSave();
  const highest = save ? clamp(save.highest | 0, 0, LEVELS.length - 1) : 0;
  const best = (save && save.best) || {};
  $('level-grid').innerHTML = LEVELS.map((def, i) => {
    const open = i <= highest;
    const t = best[i] ? formatTime(best[i]) : '';
    return `<button class="level-tile ${open ? '' : 'locked'}" ${open ? `data-level="${i}"` : 'disabled'}>
      <span class="lt-num">${i + 1}</span><span class="lt-name">${open ? def.name : T.locked}</span>
      <span class="lt-best">${t ? `⏱ ${t}` : ''}</span></button>`;
  }).join('');
}

let newGameArmed = 0;
function refreshMenu() {
  const save = loadSave();
  const cont = $('btn-continue');
  $('btn-levels').classList.toggle('hidden', !(save && (save.highest | 0) > 0));
  const canContinue = save && save.level > 0 && save.level < LEVELS.length;
  cont.classList.toggle('hidden', !canContinue);
  if (canContinue) cont.textContent = T.continueBtn(save.level + 1);
  $('btn-new').classList.toggle('btn-primary', !canContinue);
  $('btn-new').textContent = 'Nyt spil';
  newGameArmed = 0;
}

