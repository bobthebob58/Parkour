/* =====================================================================
   9. BANEBYGGER
   Omsætter segmentlisterne til konkrete positioner (ren data, ingen grafik),
   så banerne også kan valideres automatisk.
   ===================================================================== */
const fwdVec = (h) => ({ x: Math.sin(h), z: -Math.cos(h) });   // heading 0 = mod -Z
const rightVec = (h) => ({ x: Math.cos(h), z: Math.sin(h) });
const AXIS_X = new THREE.Vector3(1, 0, 0), AXIS_Y = new THREE.Vector3(0, 1, 0);

// Hvor langt rækker platformens fodaftryk i retningen (dx, dz)?
function footprintSupport(p, dx, dz) {
  if (p.shape === 'cyl') return p.w / 2;
  const f = fwdVec(p.yaw), r = rightVec(p.yaw);
  return Math.abs(dx * f.x + dz * f.z) * (p.d / 2) + Math.abs(dx * r.x + dz * r.z) * (p.w / 2);
}

function makeMove(s, heading) {
  const f = fwdVec(heading), r = rightVec(heading);
  const axis = s.ax === 'y' ? [0, 1, 0] : s.ax === 'z' ? [f.x, 0, f.z] : [r.x, 0, r.z];
  return { axis, amp: s.amp ?? 2, per: s.per ?? 4, ph: s.ph ?? 0 };
}
// Forskydning og hastighed for en bevægelse på tidspunkt t
function moveOffset(m, t, out) {
  const w = (Math.PI * 2) / m.per, a = (t / m.per + m.ph) * Math.PI * 2;
  const k = Math.sin(a) * m.amp, kv = Math.cos(a) * m.amp * w;
  out.x = m.axis[0] * k; out.y = m.axis[1] * k; out.z = m.axis[2] * k;
  if (out.vx !== undefined) { out.vx = m.axis[0] * kv; out.vy = m.axis[1] * kv; out.vz = m.axis[2] * kv; }
  return out;
}

// Pendul: platformen hænger i kæder fra et ophæng og svinger i en bue (men forbliver vandret)
function makeSwing(s, heading) {
  const f = fwdVec(heading), r = rightVec(heading);
  const axis = s.ax === 'z' ? [f.x, 0, f.z] : [r.x, 0, r.z];
  return { axis, len: s.len ?? 8, amp: (s.amp ?? 28) * DEG, per: s.per ?? 4, ph: s.ph ?? 0 };
}
function swingOffset(m, t, out) {
  const a = Math.sin((t / m.per + m.ph) * Math.PI * 2) * m.amp;
  const side = Math.sin(a) * m.len, up = (1 - Math.cos(a)) * m.len;
  out.x = m.axis[0] * side; out.y = up; out.z = m.axis[2] * side;
  return out;
}

// Typer, man ikke kan gribe fat i kanten af (skateboard-elementer)
const NO_LEDGE = new Set(['ramp', 'rail', 'boost']);

function buildLevelData(def) {
  const plats = [], anchors = [], coins = [], bars = [], winds = [], zips = [], gusts = [];
  let heading = 0, prev = null, seed = 7, seq = -1;
  for (const s of def.segs) {
    seq++;
    const t = s.t || 'p';
    if (t === 'anchor' || t === 'coin' || t === 'bar' || t === 'wind' || t === 'zip' || t === 'gust') {
      const f = fwdVec(heading), r = rightVec(heading);
      const e = footprintSupport(prev, f.x, f.z), lat = s.x || 0;
      const after = prev.index; // hjælperen hører til overgangen fra platform `after` til den næste (seq = rækkefølge)
      const bx = prev.x + f.x * (e + (s.at ?? 0)) + r.x * lat;
      const bz = prev.z + f.z * (e + (s.at ?? 0)) + r.z * lat;
      if (t === 'bar') {
        // Hængestang: starter "at" meter ud fra forrige kant og løber "len" meter (ang = drejning ift. banen)
        const yaw = heading + (s.ang || 0) * DEG, dv = fwdVec(yaw), len = s.len ?? 4;
        bars.push({
          x: bx + dv.x * len / 2, y: prev.top + (s.y ?? 2.6), z: bz + dv.z * len / 2,
          dx: dv.x, dz: dv.z, yaw, len, r: s.r ?? 0.06, v: s.v || null, index: bars.length, after, seq, opt: !!s.opt,
          move: s.mv ? makeMove(s.mv, heading) : null, // stang, der flytter sig (fx under et luftskib)
          // Trapez: stangen hænger i reb og svinger som et pendul
          swing: s.sw ? makeSwing({ ax: s.sw.ax || 'z', len: s.sw.len ?? 5, amp: s.sw.amp ?? 30, per: s.sw.per ?? 3, ph: s.sw.ph ?? 0 }, heading) : null,
        });
      } else if (t === 'zip') {
        // Svævebane: et skråt kabel, man griber fat i og glider ned ad
        const yaw = heading + (s.ang || 0) * DEG, dv = fwdVec(yaw), len = s.len ?? 16, drop = s.drop ?? 4;
        const ay = prev.top + (s.y ?? 3.2);
        zips.push({
          ax: bx, ay, az: bz, bx: bx + dv.x * len, by: ay - drop, bz: bz + dv.z * len,
          len, drop, dx: dv.x, dz: dv.z, yaw, v: s.v || null, index: zips.length, after, seq, opt: !!s.opt,
        });
      } else if (t === 'gust') {
        // Vindstød: et område, der med mellemrum skubber spilleren sidelæns
        const yaw = heading + (s.ang ?? 90) * DEG, dv = fwdVec(yaw);
        gusts.push({
          x: bx, y: prev.top + (s.y ?? -2), z: bz, w: s.w ?? 8, d: s.d ?? 10, h: s.h ?? 12, yaw: heading,
          dx: dv.x, dz: dv.z, power: s.pow ?? 14, per: s.per ?? 4, duty: s.duty ?? 0.5, ph: s.ph ?? 0, after, seq,
        });
      } else if (t === 'wind') {
        // Opvind (søjle af luft/damp), der løfter spilleren
        winds.push({ x: bx, y: prev.top + (s.y ?? -8), z: bz, r: s.r ?? 1.8, h: s.h ?? 12, power: s.pow ?? CFG.vent.power, after, seq });
      } else {
        const item = { x: bx, y: prev.top + s.y, z: bz, move: s.ax ? makeMove(s, heading) : null, after, seq, opt: !!s.opt };
        (t === 'anchor' ? anchors : coins).push(item);
      }
      continue;
    }
    if (s.turn) heading += s.turn * DEG;
    const shape = t === 'spin' || t === 'rot' ? 'cyl' : (s.shape || 'box');
    const w = t === 'rail' ? 0.16 : (s.w ?? 4);
    const d = shape === 'cyl' ? w : (t === 'ramp' || t === 'rail' ? (s.len ?? s.d ?? 6) : (s.d ?? w));
    seed = (seed * 16807) % 2147483647;
    const p = {
      type: t, shape, w, d, yaw: heading + (s.yaw || 0) * DEG, heading, index: plats.length,
      gap: s.g ?? 3, rope: !!s.rope, grab: !!s.grab, dbl: !!s.dbl, v: s.v || null, seed,
      slick: !!s.slick, lip: s.lip ?? true, hint: s.hint || null, cp: !!s.cp,
    };
    if (!prev) { p.x = 0; p.z = 0; p.top = 0; }
    else {
      const f = fwdVec(heading), r = rightVec(heading);
      const dist = footprintSupport(prev, f.x, f.z) + p.gap + footprintSupport(p, f.x, f.z);
      p.x = prev.x + f.x * dist + r.x * (s.x || 0);
      p.z = prev.z + f.z * dist + r.z * (s.x || 0);
      p.top = prev.top + (s.dy || 0);
    }
    p.h = s.h || (t === 'start' || t === 'finish' ? 2.4 : t === 'rail' ? 0.12 : t === 'ramp' ? 0.6 : t === 'boost' ? 0.6
      : clamp(Math.min(p.w, p.d) * 0.4, 0.7, 1.6));
    if (t === 'ramp') {
      // Skrå rampe: toppen går fra top0 til top over den vandrette længde d
      p.rise = s.rise ?? 2;
      p.top0 = p.top;
      p.top = p.top0 + p.rise;
      p.pitch = Math.atan2(p.rise, p.d);
      p.slopeLen = Math.hypot(p.d, p.rise);
    }
    // Enhver platform kan bevæge sig (mv) eller svinge (sw); 'move'/'swing' er de klassiske metalplader
    if (t === 'move') p.move = makeMove(s, heading);
    else if (s.mv) p.move = makeMove(s.mv, heading);
    if (t === 'swing') p.swing = makeSwing(s, heading);
    else if (s.sw) p.swing = makeSwing(s.sw, heading);
    p.kin = !!(p.move || p.swing || t === 'rot');
    if (t === 'spin') { p.spd = s.spd ?? 2; p.cross = !!s.cross; p.bar = s.bar ?? p.w * 0.94; }
    if (t === 'bounce') p.pow = s.pow ?? CFG.bounceDefault;
    if (t === 'conveyor') { p.belt = s.spd ?? 3; p.beltAx = s.ax === 'x' ? 'x' : 'z'; }
    if (t === 'rot') p.spd = s.spd ?? 0.6;
    if (t === 'vent') { p.lift = s.lift ?? 9; p.power = s.pow ?? CFG.vent.power; p.pulse = s.pulse || 0; p.duty = s.duty ?? 0.5; p.ph = s.ph ?? 0; }
    if (t === 'boost') p.boost = s.spd ?? 22;
    plats.push(p);
    if (s.coin) coins.push({ x: p.x, y: (p.top0 !== undefined ? (p.top0 + p.top) / 2 : p.top) + 1.3, z: p.z, plat: p.index });
    prev = p;
  }
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of [...plats, ...bars]) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
  }
  const bounds = {
    cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2,
    radius: Math.hypot(maxX - minX, maxZ - minZ) / 2 + 20,
    minY: Math.min(...plats.map((p) => p.top)), maxY: Math.max(...plats.map((p) => p.top)),
  };
  return { plats, anchors, coins, bars, winds, zips, gusts, startHeading: plats[1] ? plats[1].heading : 0, bounds };
}

// Platformens fysiske placering: centrum af kollisionsboksen og dens rotation
function platformPose(p) {
  const quat = new THREE.Quaternion().setFromAxisAngle(AXIS_Y, -p.yaw);
  if (p.type === 'ramp') {
    quat.multiply(new THREE.Quaternion().setFromAxisAngle(AXIS_X, p.pitch));
    const n = new THREE.Vector3(0, 1, 0).applyQuaternion(quat);
    const pos = new THREE.Vector3(p.x, (p.top0 + p.top) / 2, p.z).addScaledVector(n, -p.h / 2);
    return { pos, quat };
  }
  return { pos: new THREE.Vector3(p.x, p.top - p.h / 2, p.z), quat };
}

// Geometri med UV'er skaleret til verdensmeter, så teksturer ikke strækkes
function boxGeometry(w, h, d, tile, { tileTop = true, sideTile = tile } = {}) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    if (f === 2 && !tileTop) continue;
    const tl = f === 2 || f === 3 ? tile : sideTile;
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, (uv.getX(i) * dims[f][0]) / tl, (uv.getY(i) * dims[f][1]) / tl);
    }
  }
  return g;
}
function cylGeometry(r, h, tile, { tileTop = true, segments = 40 } = {}) {
  const g = new THREE.CylinderGeometry(r, r, h, segments, 1);
  const uv = g.attributes.uv, n = g.attributes.normal;
  for (let i = 0; i < uv.count; i++) {
    if (Math.abs(n.getY(i)) > 0.5) {
      if (tileTop) uv.setXY(i, ((uv.getX(i) - 0.5) * 2 * r) / tile, ((uv.getY(i) - 0.5) * 2 * r) / tile);
    } else {
      uv.setXY(i, (uv.getX(i) * Math.PI * 2 * r) / tile, (uv.getY(i) * h) / tile);
    }
  }
  return g;
}

// Takket klippestykke under svævende platforme (kun pynt)
function rockGeometry(radius, depth, seed) {
  const g = new THREE.ConeGeometry(radius, depth, 10, 4);
  g.rotateX(Math.PI);
  const pos = g.attributes.position;
  const rng = mulberry32(seed);
  const jitter = new Map();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const key = `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`;
    if (!jitter.has(key)) jitter.set(key, rng());
    const j = jitter.get(key);
    const top = (y + depth / 2) / depth; // 1 i toppen, 0 i spidsen
    const k = top > 0.98 ? 1 : 0.75 + j * 0.5;
    pos.setXYZ(i, x * k, y + (top < 0.98 ? (j - 0.5) * depth * 0.12 : 0), z * k);
  }
  g.computeVertexNormals();
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * radius * 1.5, uv.getY(i) * depth * 0.4);
  return g;
}

