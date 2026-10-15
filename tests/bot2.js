// Planner bot v2: plays a whole level with the real physics, stage by stage, using
// snapshot/restore to try variants (timing, run-up, double jump, release points).
//
// Usage:
//   LEVEL_FILE=/abs/level.json node run.js bot2.js     (a level def: {name, kit, theme, segs, ...})
//   LEVEL=7 node run.js bot2.js                          (LEVELS[6] from game.js)
// Options (env):
//   INV=rope,double,gloves,chalk   owned items (default: rope if def.needsRope, double if def.needsDouble)
//   KITS_DIR=/abs/kits             inject kit files (only needed for SHOTS)
//   SHOTS=/abs/dir                 save a few screenshots along the found route
//   VERBOSE=1                      print every stage with the parameters that worked
//   MAXTRIES=60                    max variants per stage
//   NOGRAB=ledge                   the hands never catch LEDGES (bars/zips still work) – proves catch-jumps need the hands
//   NOGRAB=all                     the hands never catch anything
// Prints a report: per stage OK/FAIL with reasons, total route time, and a final line
//   RESULT: PASS|FAIL <level name> stages=<ok>/<n> time=<s>
const path = require('path'), fs = require('fs');

module.exports = async (page, h) => {
  await page.waitForFunction(() => window.skyhoj && window.skyhoj.game.state === 'menu', null, { timeout: 60000 });
  if (process.env.KITS_DIR && fs.existsSync(process.env.KITS_DIR)) {
    for (const f of fs.readdirSync(process.env.KITS_DIR).filter((f) => f.endsWith('.js')).sort()) {
      await page.addScriptTag({ path: path.join(process.env.KITS_DIR, f) });
    }
  }
  let def = null;
  if (process.env.LEVEL_FILE) {
    const src = fs.readFileSync(process.env.LEVEL_FILE, 'utf8');
    def = process.env.LEVEL_FILE.endsWith('.json') ? JSON.parse(src) : eval('(' + src.replace(/^[^{]*/, '').replace(/;\s*$/, '') + ')');
  }
  const levelNo = +(process.env.LEVEL || 0);
  const inv = process.env.INV ? process.env.INV.split(',').filter(Boolean) : null;
  const opts = { verbose: !!process.env.VERBOSE, maxTries: +(process.env.MAXTRIES || 60), shots: !!process.env.SHOTS,
    debugStage: process.env.DEBUG_STAGE !== undefined ? +process.env.DEBUG_STAGE : -1, noGrab: process.env.NOGRAB || '' };
  const res = await page.evaluate(planner, { def, levelNo, inv, opts });
  console.log(res.report);
  if (process.env.SHOTS && res.route && res.route.length) {
    fs.mkdirSync(process.env.SHOTS, { recursive: true });
    // Replay to a few interesting points and take screenshots from the follow camera
    const picks = res.route.filter((r, i) => i % Math.max(1, Math.floor(res.route.length / 6)) === 0).slice(0, 7);
    for (const [k, r] of picks.entries()) {
      await page.evaluate((snapIdx) => window.__botShow(snapIdx), r.snap);
      await h.wait(2500);
      const file = path.join(process.env.SHOTS, `route-${String(k).padStart(2, '0')}.png`);
      await page.screenshot({ path: file });
      console.log('saved', file);
    }
  }
};

// ---------------------------------------------------------------------------
// Everything below runs inside the page.
module.exports.planner = planner;
async function planner({ def, levelNo, inv, opts }) {
  const S = window.skyhoj, CFG = S.CFG, P = S.player, A = S.abilities, cam = S.cam;
  const dt = CFG.fixedDt, H = CFG.hang;
  const out = [];
  const log = (s) => out.push(s);
  S.debug.quiet = true;
  S.debug.freeze = true;
  if (!def) def = S.LEVELS[levelNo - 1];
  if (!def) return { report: 'no level' };
  const items = inv || [def.needsRope ? 'rope' : null, def.needsDouble ? 'double' : null].filter(Boolean);
  for (const k of Object.keys(A.owned)) A.owned[k] = false;
  for (const k of items) A.owned[k] = true;
  S.playDef(def, 0);
  S.setState('playing');
  S.debug.quiet = true;
  const L = S.level;
  const plats = L.platforms, N = plats.length;
  const radius = CFG.player.radius;

  // ---------- small helpers ----------
  const keys = (o = {}) => {
    const k = S.input.keys;
    k.KeyW = !!o.W; k.KeyS = !!o.S; k.KeyA = !!o.A; k.KeyD = !!o.D; k.Space = !!o.Space;
  };
  const pressSpace = () => S.onKeyPress('Space');
  // NOGRAB=1: hænderne kan ikke gribe noget (bruges til at bevise, at et spring KRÆVER hænderne)
  S.debug.noLedge = opts.noGrab === 'ledge';
  const step = () => { if (opts.noGrab && opts.noGrab !== 'ledge') P.grabCooldown = 1; S.fixedStep(dt); };
  const yawTo = (x, z) => { const b = P.body.position; cam.yaw = Math.atan2(-(x - b.x), -(z - b.z)); };
  const pos = () => P.body.position;
  const platTop = (pl) => pl.body.position.y + pl.def.h / 2;
  const platC = (pl) => pl.body.position;
  const platR = (pl) => (pl.def.shape === 'cyl' ? pl.def.w / 2 : Math.min(pl.def.w, pl.def.d) / 2);
  const hdist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const alive = () => S.game.state === 'playing' || S.game.state === 'portal';
  // local footprint test with inset (positive inset = inside margin)
  function inFoot(pl, x, z, inset = 0) {
    const d = pl.def, c = pl.body.position;
    if (d.shape === 'cyl') return Math.hypot(x - c.x, z - c.z) < d.w / 2 - inset;
    const q = pl.body.quaternion;
    // inverse rotate (yaw only is enough for flat platforms; ramps use pitch too but footprint ~ same)
    const yaw = Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.z * q.z));
    const dx = x - c.x, dz = z - c.z, cs = Math.cos(-yaw), sn = Math.sin(-yaw);
    const lx = dx * cs + dz * sn, lz = -dx * sn + dz * cs;
    const dd = d.type === 'ramp' ? d.slopeLen : d.d;
    return Math.abs(lx) < d.w / 2 - inset && Math.abs(lz) < dd / 2 - inset;
  }
  // distance from point (x,z) moving along unit dir (ux,uz) to the footprint boundary
  function distToEdge(pl, x, z, ux, uz) {
    const d = pl.def, c = pl.body.position;
    if (d.shape === 'cyl') {
      const R = d.w / 2, px = x - c.x, pz = z - c.z;
      const b = px * ux + pz * uz, cc = px * px + pz * pz - R * R;
      const disc = b * b - cc;
      return disc < 0 ? 0 : -b + Math.sqrt(disc);
    }
    const q = pl.body.quaternion;
    const yaw = Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.z * q.z));
    const cs = Math.cos(-yaw), sn = Math.sin(-yaw);
    const dx = x - c.x, dz = z - c.z;
    const lx = dx * cs + dz * sn, lz = -dx * sn + dz * cs;
    const vx = ux * cs + uz * sn, vz = -ux * sn + uz * cs;
    const dd = d.type === 'ramp' ? d.slopeLen : d.d;
    let t = Infinity;
    if (vx > 1e-6) t = Math.min(t, (d.w / 2 - lx) / vx); else if (vx < -1e-6) t = Math.min(t, (-d.w / 2 - lx) / vx);
    if (vz > 1e-6) t = Math.min(t, (dd / 2 - lz) / vz); else if (vz < -1e-6) t = Math.min(t, (-dd / 2 - lz) / vz);
    return Math.max(0, t);
  }
  // future pose of a platform/bar at time offset tau (uses the level's deterministic motion)
  function platAt(pl, tau) {
    const d = pl.def, c = pl.base, o = { x: 0, y: 0, z: 0 };
    if (d.move) {
      const m = d.move, a = ((L.time + tau) / m.per + m.ph) * Math.PI * 2, k = Math.sin(a) * m.amp;
      o.x = m.axis[0] * k; o.y = m.axis[1] * k; o.z = m.axis[2] * k;
    } else if (d.swing) {
      const m = d.swing, a = Math.sin(((L.time + tau) / m.per + m.ph) * Math.PI * 2) * m.amp;
      o.x = m.axis[0] * Math.sin(a) * m.len; o.y = (1 - Math.cos(a)) * m.len; o.z = m.axis[2] * Math.sin(a) * m.len;
    } else return { x: pl.body.position.x, y: pl.body.position.y, z: pl.body.position.z };
    return { x: c.x + o.x, y: c.y + o.y, z: c.z + o.z };
  }
  function barPoint(bar, s) { return { x: bar.a.x + bar.dir.x * s, y: bar.a.y, z: bar.a.z + bar.dir.z * s }; }
  function barClosestS(bar, x, z) {
    const s = (x - bar.a.x) * bar.dir.x + (z - bar.a.z) * bar.dir.z;
    return Math.max(0.3, Math.min(bar.def.len - 0.3, s));
  }

  // ---------- goals ----------
  // A goal is something to reach; each knows how to test success and where to aim.
  function goalPlat(pl) {
    return {
      kind: 'plat', pl, label: `plat ${pl.def.index} (${pl.type}${pl.def.v ? '/' + pl.def.v : ''})`,
      aim(tau = 0) { const c = platAt(pl, tau); return { x: c.x, y: c.y + pl.def.h / 2, z: c.z }; },
      top: () => platTop(pl),
      radius: () => platR(pl),
      reached() {
        if (P.groundPlat === pl && (P.grounded || pl.type === 'bounce')) return true;
        if (pl.type === 'vent') {
          // opvinden fanger en, før fødderne rører risten: at svæve over den tæller som nået
          const c = pl.body.position, p = pos(), feet = p.y - radius - (c.y + pl.def.h / 2);
          if (inFoot(pl, p.x, p.z, 0.1) && feet > -0.3 && feet < pl.def.lift * 1.6 && L.ventActive(pl)) return true;
        }
        // landet længere fremme (genvej / skateboard over en platform) tæller også
        if (P.grounded && P.groundPlat && P.groundPlat.def.index > pl.def.index && P.groundPlat.type !== 'bounce') return true;
        if (P.skate && P.skate.grind && P.skate.grind.plat.def.index >= pl.def.index) return true;
        return false;
      },
    };
  }
  function goalBar(bar) {
    return {
      kind: 'bar', bar, label: `bar ${bar.def.index}${bar.def.swing ? ' (trapez)' : bar.def.move ? ' (moving)' : ''}`,
      aim() { const b = pos(); const s = barClosestS(bar, b.x, b.z); return barPoint(bar, s); },
      top: () => bar.a.y - H.drop - radius + 0.2,
      radius: () => 0.4,
      reached: () => !!(P.hang && P.hang.kind === 'bar' && P.hang.bar === bar),
    };
  }
  function goalZip(z) {
    return {
      kind: 'zip', zip: z, label: `zip ${z.def.index}`,
      aim() { return { x: z.a.x + z.dir.x * 1.2, y: z.a.y, z: z.a.z + z.dir.z * 1.2 }; },
      top: () => z.a.y - H.drop - radius,
      radius: () => 0.4,
      reached: () => !!(P.hang && P.hang.kind === 'zip' && P.hang.zip === z),
    };
  }
  function goalWind(w) {
    const d = w.def;
    return {
      kind: 'wind', wind: d, label: `vindsøjle`,
      aim() { return { x: d.x, y: d.y, z: d.z }; },
      top: () => d.y,
      radius: () => d.r * 0.6,
      reached() { const b = pos(); return Math.hypot(b.x - d.x, b.z - d.z) < d.r * 0.85 && b.y - radius > d.y - 0.5 && b.y - radius < d.y + d.h; },
    };
  }

  // ---------- stages ----------
  const stages = [];
  for (let i = 0; i + 1 < N; i++) {
    const hs = [];
    for (const b of L.bars) if (b.def.after === i) hs.push({ seq: b.def.seq, g: goalBar(b) });
    for (const z of L.zips) if (z.def.after === i) hs.push({ seq: z.def.seq, g: goalZip(z) });
    for (const w of L.winds) if (w.def.after === i) hs.push({ seq: w.def.seq, g: goalWind(w) });
    const ancs = L.anchors.filter((a) => a.def.after === i).sort((a, b) => a.def.seq - b.def.seq);
    hs.sort((a, b) => a.seq - b.seq);
    // anchors: insert a rope stage before the first helper that comes after them (or before the platform)
    let ropeInserted = false;
    const list = [];
    for (const hh of hs) {
      if (!ropeInserted && ancs.length && ancs[0].def.seq < hh.seq) { list.push({ rope: ancs.filter((a) => a.def.seq < hh.seq), seq: ancs[0].def.seq }); ropeInserted = true; }
      list.push(hh);
    }
    if (!ropeInserted && ancs.length) list.push({ rope: ancs, seq: ancs[0].def.seq });
    for (const item of list) stages.push(item.rope ? { kind: 'rope', anchors: item.rope, trans: i } : { goal: item.g, trans: i });
    stages.push({ goal: goalPlat(plats[i + 1]), trans: i });
  }
  // a rope stage's goal is the following stage's goal
  for (let k = 0; k < stages.length; k++) if (stages[k].kind === 'rope') stages[k].goal = stages[k + 1].goal;

  // ---------- low level: run the sim with a per-step policy ----------
  // policy(t) returns 'ok' | 'fail:<why>' | undefined (continue)
  function run(policy, tmax) {
    let t = 0;
    while (t < tmax) {
      const r = policy(t);
      if (r) return r;
      step();
      t += dt;
      if (S.game.state === 'dead') return 'fail:lava';
      if (S.game.state === 'portal') return 'portal';
      if (!alive()) return 'fail:state ' + S.game.state;
    }
    return 'fail:timeout';
  }

  // Where is the player standing / hanging now?
  function situation() {
    if (A.rope) return 'rope';
    if (P.hang) return P.hang.kind === 'ledge' ? 'ledge' : P.hang.kind; // bar | zip
    if (P.grounded) return 'ground';
    return 'air';
  }

  // Air phase towards a goal, with optional double jump rule. Also climbs a caught ledge of the goal.
  function airTo(goal, dbl, t0Limit = 6, hover = null) {
    let jumpedAgain = false, t = 0;
    return run((tt) => {
      t = tt;
      if (goal.reached()) {
        if (goal.kind === 'plat') {
          // must stay on it for a moment (ice, moving)
          return stable(goal) ? 'ok' : 'fail:slid off';
        }
        return 'ok';
      }
      if (P.hang) {
        if (P.hang.kind === 'ledge' && goal.kind === 'plat' && P.hang.plat === goal.pl) {
          // caught the ledge: climb with W
          keys({ W: true }); yawTo(goal.aim().x, goal.aim().z);
          return;
        }
        if (P.hang.kind === 'ledge') return `fail:caught wrong ledge (plat ${P.hang.plat.def.index})`;
        return `fail:grabbed wrong ${P.hang.kind}`;
      }
      if (P.grounded && !goal.reached()) {
        const gp = P.groundPlat;
        if (gp && gp.type === 'bounce') return; // bounce pad will throw us – keep steering
        if (tt > 0.15) return `fail:landed on plat ${gp ? gp.def.index : '?'}`;
      }
      // hover in an updraft first (rise above the goal), then steer
      if (hover && pos().y - radius < goal.top() + hover.rise && tt < hover.max) {
        const c = hover.center;
        if (Math.hypot(pos().x - c.x, pos().z - c.z) > 0.25) { yawTo(c.x, c.z); keys({ W: true }); } else keys({});
        return;
      }
      const lead = Math.min(1.2, hdist(pos(), goal.aim()) / 9);
      const a = goal.aim(lead);
      const dist = Math.hypot(a.x - pos().x, a.z - pos().z);
      yawTo(a.x, a.z);
      const v = P.body.velocity;
      // nær en stang/svævebane: slip W, så hænderne ikke skyder forbi
      keys({ W: dist > (goal.kind === 'plat' || goal.kind === 'wind' ? 0.25 : 0.6), Space: S.input.keys.Space && v.y > 0 });
      if (dbl && !jumpedAgain && P.airJumps > 0) {
        let fire = false;
        if (dbl === 'apex') fire = v.y < 0.5;
        else if (dbl === 'early') fire = v.y < 4;
        else if (dbl === 'late') fire = v.y < -4;
        else if (dbl === 'need') {
          // predicted short of the goal?
          const feet = pos().y - radius, top = goal.top();
          const disc = v.y * v.y + 2 * CFG.gravity * (feet - top);
          const tLand = disc < 0 ? 0 : (v.y + Math.sqrt(disc)) / CFG.gravity;
          const reach = Math.max(Math.hypot(v.x, v.z), 7) * tLand;
          fire = v.y < 2 && reach < dist - goal.radius() * 0.5;
        }
        if (fire) { jumpedAgain = true; keys({ W: true, Space: true }); pressSpace(); }
      }
    }, t0Limit);
  }
  function stable(goal) {
    if (goal.pl.type === 'bounce' || goal.pl.type === 'crumble' || goal.pl.type === 'vent') return true;
    const snap = S.snapshot();
    keys({});
    let ok = true;
    for (let i = 0; i < 18; i++) { step(); if (!alive() || S.game.state === 'dead') { ok = false; break; } }
    if (ok && !(P.grounded && P.groundPlat === goal.pl) && !(P.hang && P.hang.plat === goal.pl)) ok = P.grounded;
    S.restore(snap);
    return ok;
  }

  // From standing on a platform: wait, back off, run, jump towards the goal.
  function runJump(goal, prm) {
    const from = P.groundPlat;
    if (!from) return 'fail:not grounded';
    let r;
    if (prm.wait > 0) {
      r = run((t) => { keys({}); if (t >= prm.wait) return 'ok'; if (!P.grounded) return 'fail:fell while waiting'; }, prm.wait + 1);
      if (r !== 'ok') return r;
    }
    if (prm.back > 0 && from.type !== 'crumble' && from.type !== 'ice') {
      // walk back away from the goal to get a run-up
      const a = goal.aim(), c = platC(from);
      const dx = a.x - c.x, dz = a.z - c.z, Lh = Math.hypot(dx, dz) || 1;
      const lim = Math.max(0, (from.def.shape === 'cyl' ? from.def.w / 2 : Math.min(from.def.w, from.def.d) / 2) - 0.7);
      const bx = c.x - (dx / Lh) * Math.min(prm.back, lim), bz = c.z - (dz / Lh) * Math.min(prm.back, lim);
      r = run(() => {
        const p = pos();
        const cx = platC(from);
        const tx = bx + (cx.x - c.x), tz = bz + (cx.z - c.z);
        if (Math.hypot(tx - p.x, tz - p.z) < 0.35) return 'ok';
        yawTo(tx, tz); keys({ W: true });
        if (!P.grounded && P.coyote <= 0) return 'fail:fell during run-up';
      }, 3);
      keys({});
      if (r !== 'ok') return r;
    }
    // run and jump
    let jumped = false, tj = 0;
    const lead = prm.lead ?? 0.3;
    r = run((t) => {
      if (goal.reached() || P.hang) return 'ok';
      const p = pos(), v = P.body.velocity;
      const la = Math.min(1.2, hdist(p, goal.aim()) / 9);
      const a = goal.aim(la);
      yawTo(a.x, a.z);
      if (!jumped) {
        const gp = P.groundPlat || from;
        const sp = Math.hypot(v.x - P.groundVel.x, v.z - P.groundVel.z);
        const dh = Math.hypot(a.x - p.x, a.z - p.z) || 1;
        const ux = (a.x - p.x) / dh, uz = (a.z - p.z) / dh;
        const e = distToEdge(gp, p.x, p.z, ux, uz);
        const near = goal.kind !== 'plat' && goal.kind !== 'wind' && dh < 1.0 + lead;
        const want = prm.jumpNow || near || (e < lead + sp * dt * 2) || (!P.grounded && P.coyote > 0 && P.coyote < 0.05) || (goal.kind === 'plat' && inFoot(goal.pl, p.x, p.z, 0.2));
        keys({ W: true });
        if (want && t > 0.02) {
          if (goal.kind === 'plat' && inFoot(goal.pl, p.x, p.z, 0.3) && Math.abs(platTop(goal.pl) - (p.y - radius)) < 0.4) return 'ok';
          keys({ W: true, Space: true }); pressSpace(); jumped = true; tj = t;
        }
        if (!P.grounded && P.coyote <= 0 && !jumped) return 'fail:ran off edge';
        if (t > 4) return 'fail:never reached edge';
      } else {
        keys({ W: true, Space: !(prm.short && t - tj > 0.08) });
        if (t - tj > 0.05) return 'ok';
      }
    }, 6);
    if (r !== 'ok') return r;
    return airTo(goal, prm.dbl);
  }

  // Hanging on a bar: shimmy to a point, maybe wait, then leap / drop / hop.
  function leaveBar(goal, prm) {
    const bar = P.hang.bar;
    const ga = goal.aim();
    let target = prm.at === 'near' ? barClosestS(bar, ga.x, ga.z) : prm.at === 'far' ? (barClosestS(bar, ga.x, ga.z) > bar.def.len / 2 ? bar.def.len - 0.3 : 0.3) : P.hang.s;
    let r = run(() => {
      if (!P.hang) return 'fail:lost grip';
      const dS = target - P.hang.s;
      if (Math.abs(dS) < 0.06) { keys({}); return 'ok'; }
      // point camera so that W moves along the bar in the needed direction
      const sgn = Math.sign(dS);
      const p = pos();
      yawTo(p.x + bar.dir.x * sgn * 5, p.z + bar.dir.z * sgn * 5);
      keys({ W: true });
    }, 8);
    if (r !== 'ok') return r;
    if (prm.wait > 0) {
      r = run((t) => { keys({}); if (!P.hang) return 'fail:slipped while waiting'; if (t >= prm.wait) return 'ok'; }, prm.wait + 0.5);
      if (r !== 'ok') return r;
    }
    const a = goal.aim(0.4);
    if (prm.mode === 'drop') { yawTo(a.x, a.z); keys({ S: true }); step(); keys({}); }
    else if (prm.mode === 'hop') { keys({ Space: true }); pressSpace(); step(); }
    else { yawTo(a.x, a.z); keys({ W: true, Space: true }); pressSpace(); step(); }
    if (P.hang && P.hang.bar === bar) return 'fail:did not let go';
    return airTo(goal, prm.dbl);
  }

  // Riding a zipline: let go at a fraction (or at the end) then fly to the goal.
  function rideZip(goal, prm) {
    const z = P.hang.zip;
    let r = run(() => {
      if (!P.hang) return 'ok'; // auto release at the end
      keys({});
      if (prm.rel < 1 && P.hang.s3 >= prm.rel * z.len3) { pressSpace(); }
    }, 12);
    if (r !== 'ok') return r;
    return airTo(goal, prm.dbl);
  }

  // Standing on an updraft vent: stand still until high enough, then steer.
  function rideVent(goal, prm) {
    const vent = P.groundPlat;
    const c = platC(vent);
    let r = run((t) => {
      if (goal.reached() || P.hang) return 'ok';
      const p = pos();
      if (Math.hypot(p.x - c.x, p.z - c.z) > 0.3) { yawTo(c.x, c.z); keys({ W: true }); } else keys({});
      if (p.y - radius > goal.top() + prm.rise) return 'ok';
      if (t > 8) return 'fail:vent too weak';
    }, 9);
    if (r !== 'ok') return r;
    return airTo(goal, prm.dbl);
  }

  // In an updraft column: hover centred until high enough, then steer.
  function rideWind(goal, prm, wind) {
    return airTo(goal, prm.dbl, 9, { rise: prm.rise, max: 7, center: { x: wind.x, z: wind.z } });
  }

  // Rope chain: hook anchors in order and release towards the goal.
  function ropeTo(goal, anchors, prm) {
    S.selectAbility('rope');
    let idx = -1, jumped = false, released = false;
    const g0 = goal.aim();
    const r = run((t) => {
      const p = pos(), v = P.body.velocity;
      if (goal.reached()) return 'ok';
      if (P.hang) return 'ok';
      if (!A.rope) {
        if (idx === anchors.length - 1 && released) return 'ok';
        const next = anchors[idx + 1];
        if (P.grounded && !jumped) {
          // run to the edge facing the first anchor and jump
          yawTo(next.pos.x, next.pos.z);
          const dh = hdist(p, next.pos) || 1;
          const e = distToEdge(P.groundPlat, p.x, p.z, (next.pos.x - p.x) / dh, (next.pos.z - p.z) / dh);
          keys({ W: true });
          if (e < 0.5 + prm.edge) { keys({ W: true, Space: true }); pressSpace(); jumped = true; }
          return;
        }
        if (P.grounded && jumped && t > 0.5) return `fail:landed before hooking anchor ${idx + 2}`;
        keys({ W: true });
        yawTo((next || anchors[idx]).pos.x, (next || anchors[idx]).pos.z);
        if (next) {
          const a = next.pos;
          const dist = Math.hypot(a.x - p.x, a.y - (p.y + 0.8), a.z - p.z);
          const ready = idx < 0 ? v.y < 4 + prm.hook : true;
          if (dist < (A.owned.longrope ? CFG.rope.rangeUpgraded : CFG.rope.range) - 0.5 && ready) {
            // aim the camera exactly at the anchor and fire
            S.camera.position.set(p.x - (a.x - p.x) * 0.15, p.y + 0.8 - (a.y - p.y - 0.8) * 0.15 + 0.3, p.z - (a.z - p.z) * 0.15);
            S.camera.lookAt(a.x, a.y, a.z); S.camera.updateMatrixWorld();
            const tg = S.findRopeTarget();
            if (tg && tg.anchor === next) { S.fireRope(); idx++; }
          }
        }
        if (t > 3 && idx < 0) return 'fail:could not hook first anchor';
        return;
      }
      // swinging
      const cur = anchors[idx], next = anchors[idx + 1];
      const tgt = next ? next.pos : g0;
      yawTo(tgt.x, tgt.z);
      keys({ W: true });
      const dir = { x: tgt.x - cur.pos.x, z: tgt.z - cur.pos.z }, dl = Math.hypot(dir.x, dir.z) || 1;
      const along = ((p.x - cur.pos.x) * dir.x + (p.z - cur.pos.z) * dir.z) / dl;
      const vAlong = (v.x * dir.x + v.z * dir.z) / dl;
      if (next) {
        if (along > 1 + prm.sw && vAlong > 2 && v.y > -3) { S.releaseRope(false); }
      } else if (along > prm.rel && vAlong > 1) {
        // release when a ballistic prediction (with boost) reaches the goal area
        if (prm.pred) {
          let x = p.x, y = p.y - radius, z = p.z, vx = v.x, vy = Math.max(v.y, 0) + CFG.rope.releaseBoost, vz = v.z;
          const top = goal.top(), gc = goal.aim(0.8);
          let hit = false;
          for (let k = 0; k < 300; k++) {
            const ny = y + vy * 0.01; vy -= CFG.gravity * 0.01; x += vx * 0.01; z += vz * 0.01;
            if (y >= top && ny < top) { hit = Math.hypot(x - gc.x, z - gc.z) < goal.radius() + prm.slack; break; }
            y = ny;
          }
          if (hit) { pressSpace(); released = true; }
        } else { pressSpace(); released = true; }
      }
      if (t > 14) return 'fail:rope timeout';
    }, 15);
    if (r !== 'ok') return r;
    return airTo(goal, prm.dbl);
  }

  // Skateboard: roll/push, steer with A/D towards the goal, ollie before edges.
  function skateTo(goal, prm) {
    let ollied = false;
    const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
    return run((t) => {
      if (goal.reached()) return 'ok';
      const sk = P.skate, p = pos(), v = P.body.velocity;
      if (!sk) return 'fail:no skate';
      const sp = Math.hypot(v.x, v.z);
      if (sk.grind) {
        // on a rail: ride to the end, optionally ollie off near the end
        keys({});
        const g = sk.grind, bp = g.plat.body.position, dd = g.plat.def.d / 2;
        const sAlong = ((p.x - bp.x) * g.ax + (p.z - bp.z) * g.az) * g.dir;
        if (prm.ollie && dd - sAlong < prm.lead * 0.5) pressSpace();
        return;
      }
      const a = goal.aim(Math.min(1, hdist(p, goal.aim()) / Math.max(sp, 6)));
      const want = Math.atan2(a.x - p.x, -(a.z - p.z));
      const err = wrap(want - sk.heading);
      const fast = sp > prm.speed + 2;
      keys({ W: sp < prm.speed, S: fast && P.grounded, D: err > 0.03, A: err < -0.03 });
      if (P.grounded && prm.ollie && !ollied) {
        const gp = P.groundPlat;
        if (gp && gp !== goal.pl) {
          const f = { x: Math.sin(sk.heading), z: -Math.cos(sk.heading) };
          const e = distToEdge(gp, p.x, p.z, f.x, f.z);
          const railGoal = goal.kind === 'plat' && goal.pl.type === 'rail';
          if (e < prm.lead || (railGoal && hdist(p, goal.aim()) < prm.lead + goal.pl.def.d / 2)) { pressSpace(); ollied = true; }
        }
      }
      if (P.grounded && P.groundPlat && P.groundPlat.def.index < (goal.pl ? goal.pl.def.index - 1 : 0) && t > 1) return 'fail:fell back';
      if (t > 12) return 'fail:skate timeout';
    }, 14);
  }

  // ---------- variant generators ----------
  const hasDbl = A.owned.double;
  const dblOpts = hasDbl ? [null, 'need', 'apex', 'late', 'early'] : [null];
  function variants(stage) {
    const sit = situation();
    const goal = stage.goal;
    const V = [];
    if (P.skate) {
      for (const ollie of [false, true]) for (const lead of ollie ? [0.6, 1.5, 3, 4.5, 6] : [0]) for (const speed of [99, 11, 8, 14]) V.push({ ctl: 'skate', ollie, lead, speed });
      return V;
    }
    if (stage.kind === 'rope') {
      for (const pred of [true, false]) for (const rel of [0, 2, 4, -2, 6]) for (const dbl of dblOpts.slice(0, 3)) {
        V.push({ ctl: 'rope', pred, rel, slack: 0.4, sw: 0, hook: 0, edge: 0, dbl });
        if (V.length > opts.maxTries) break;
      }
      V.push({ ctl: 'rope', pred: true, rel: 0, slack: 1, sw: 1.5, hook: 2, edge: 0.6, dbl: hasDbl ? 'need' : null });
      return V;
    }
    if (sit === 'ground') {
      const from = P.groundPlat;
      if (from && from.type === 'vent') {
        for (const rise of [0.6, 1.5, 3, 5, 0.2]) for (const dbl of dblOpts.slice(0, 2)) V.push({ ctl: 'vent', rise, dbl });
      }
      const moving = from && (from.def.kin || from.type === 'spin') || (goal.kind === 'plat' && goal.pl.def.kin) || (goal.kind === 'bar' && (goal.bar.def.swing || goal.bar.def.move));
      const per = Math.max(moving ? 4 : 0, goal.kind === 'plat' && goal.pl.def.move ? goal.pl.def.move.per : 0, goal.kind === 'plat' && goal.pl.def.swing ? goal.pl.def.swing.per : 0,
        goal.kind === 'bar' && goal.bar.def.swing ? goal.bar.def.swing.per : 0, goal.kind === 'bar' && goal.bar.def.move ? goal.bar.def.move.per : 0,
        from && from.def.move ? from.def.move.per : 0, from && from.def.swing ? from.def.swing.per : 0, from && from.type === 'rot' ? Math.PI * 2 / Math.abs(from.def.spd || 1) : 0);
      const waits = from && from.type === 'crumble' ? [0] : moving ? Array.from({ length: Math.min(24, Math.ceil(per / 0.25)) }, (_, i) => i * 0.25) : [0];
      const backs = from && (from.type === 'crumble' || from.type === 'ice') ? [0] : [3, 0, 6, 1.5];
      const leads = [0.3, 0.9, 1.6];
      for (const dbl of dblOpts) for (const wait of waits) for (const back of backs) for (const lead of leads) {
        V.push({ ctl: 'run', wait, back, lead, dbl });
      }
      // short hops for tiny gaps / ledges just above
      V.push({ ctl: 'run', wait: 0, back: 0, lead: 0.3, short: true, dbl: null });
      // sort: cheap & common first
      V.sort((a, b) => (a.dbl ? 1 : 0) - (b.dbl ? 1 : 0) || a.wait - b.wait);
      return V.slice(0, Math.max(opts.maxTries, 12 * waits.length));
    }
    if (sit === 'bar') {
      const bar = P.hang.bar;
      const waits = bar.def.swing || bar.def.move ? Array.from({ length: Math.ceil((bar.def.swing || bar.def.move).per / 0.15) + 1 }, (_, i) => i * 0.15) : [0, 0.4];
      for (const dbl of dblOpts) for (const at of ['near', 'here', 'far']) for (const wait of waits) for (const mode of ['leap', 'drop', 'hop']) V.push({ ctl: 'bar', at, wait, mode, dbl });
      V.sort((a, b) => (a.dbl ? 1 : 0) - (b.dbl ? 1 : 0) || (a.mode === 'leap' ? 0 : 1) - (b.mode === 'leap' ? 0 : 1));
      return V.slice(0, Math.max(opts.maxTries, waits.length * 3));
    }
    if (sit === 'zip') {
      for (const dbl of dblOpts) for (const rel of [1, 0.9, 0.8, 0.7, 0.6, 0.95, 0.5]) V.push({ ctl: 'zip', rel, dbl });
      return V;
    }
    if (sit === 'air') {
      // e.g. launched by a bounce pad or inside an updraft column
      const prev = stage.prevGoal;
      if (prev && prev.kind === 'wind') for (const rise of [0.8, 2, 4, 0.2, 6]) for (const dbl of dblOpts.slice(0, 3)) V.push({ ctl: 'wind', rise, dbl, wind: prev.wind });
      if (prev && prev.kind === 'plat' && prev.pl.type === 'vent') {
        const c = platC(prev.pl);
        for (const rise of [0.8, 2, 4, 0.2, 6]) for (const dbl of dblOpts.slice(0, 3)) V.push({ ctl: 'wind', rise, dbl, wind: { x: c.x, z: c.z } });
      }
      for (const dbl of dblOpts) V.push({ ctl: 'air', dbl });
      return V;
    }
    if (sit === 'ledge') return [{ ctl: 'climb' }];
    return [{ ctl: 'none' }];
  }

  function execute(stage, prm) {
    const goal = stage.goal;
    switch (prm.ctl) {
      case 'run': return runJump(goal, prm);
      case 'vent': return rideVent(goal, prm);
      case 'bar': return leaveBar(goal, prm);
      case 'zip': return rideZip(goal, prm);
      case 'air': return airTo(goal, prm.dbl);
      case 'wind': return rideWind(goal, prm, prm.wind);
      case 'rope': return ropeTo(goal, stage.anchors, prm);
      case 'climb': return airTo(goal, null);
      case 'skate': return skateTo(goal, prm);
      default: return 'fail:no controller';
    }
  }

  // ---------- search ----------
  const route = [];
  window.__botSnaps = [];
  const stats = { tries: 0 };
  let failInfo = null;
  for (let k = 0; k < stages.length; k++) if (k > 0) stages[k].prevGoal = stages[k - 1].goal;
  // settle on the start platform
  keys({});
  for (let i = 0; i < 60; i++) step();
  const t0 = L.time;

  function solve(k, depth) {
    if (k >= stages.length) return true;
    const stage = stages[k];
    const snap = S.snapshot();
    const V = variants(stage);
    const reasons = {};
    let successes = 0, vi = 0;
    for (const prm of V) {
      vi++;
      stats.tries++;
      S.restore(snap);
      let r = execute(stage, prm);
      if (r === 'portal') r = k === stages.length - 1 ? 'ok' : 'ok';
      if (r === 'ok') {
        successes++;
        route[k] = { stage: k, label: stage.goal.label + (stage.kind === 'rope' ? ' via reb' : ''), prm, t: +(L.time - t0).toFixed(1), snap: window.__botSnaps.length, tries: vi };
        window.__botSnaps.push(S.snapshot());
        if (S.game.state === 'portal' || k === stages.length - 1) return true;
        // sprang vi frem (genvej), fortsætter vi fra den platform, vi står på
        let nk = k + 1;
        const gp = P.grounded ? P.groundPlat : (P.skate && P.skate.grind ? P.skate.grind.plat : null);
        if (gp) while (nk < stages.length && stages[nk].trans < gp.def.index) nk++;
        if (nk >= stages.length) return true;
        if (solve(nk, depth + 1)) return true;
        if (successes >= 4) break; // limited backtracking
        continue;
      }
      const why = r.replace(/^fail:/, '');
      reasons[why] = (reasons[why] || 0) + 1;
      if (opts.debugStage === k) log(`    [stage ${k}] ${JSON.stringify(prm)} -> ${why}`);
    }
    S.restore(snap);
    if (!failInfo || k >= failInfo.k) failInfo = { k, stage, reasons, tried: V.length, sit: situation() };
    return false;
  }
  const ok = solve(0, 0);
  // finish: walk into the portal from the finish platform
  let portal = false;
  if (ok) {
    const fin = plats[N - 1];
    const P0 = L.portal.center;
    const r = run(() => { yawTo(P0.x, P0.z); keys({ W: true }); }, 6);
    portal = r === 'portal';
  }
  keys({});
  const total = route.length ? route[route.length - 1].t : 0;

  // ---------- report ----------
  log(`=== ${def.name} (${N} platforme, ${L.bars.length} stænger, ${L.zips.length} svævebaner, ${L.anchors.length} krogpunkter, ${L.winds.length} vindsøjler, ${L.coins.length} mønter) inventar: ${items.join(',') || 'intet'}`);
  if (opts.verbose) for (const r of route) if (r) log(`  ok  ${String(r.stage).padStart(3)} → ${r.label.padEnd(30)} t=${String(r.t).padStart(5)}s  #${r.tries} ${JSON.stringify(r.prm)}`);
  if (!ok && failInfo) {
    const st = failInfo.stage;
    const from = failInfo.k > 0 ? stages[failInfo.k - 1].goal.label : 'start';
    log(`  FAIL stage ${failInfo.k} (overgang ${st.trans}→${st.trans + 1}): fra ${from} [${failInfo.sit}] til ${st.goal.label}${st.kind === 'rope' ? ' via reb' : ''}; ${failInfo.tried} varianter: ${JSON.stringify(failInfo.reasons)}`);
  }
  // lint: platforms too close to each other (non-adjacent)
  const D = L.data.plats;
  for (let i = 0; i < D.length; i++) for (let j = i + 2; j < D.length; j++) {
    const a = D[i], b = D[j];
    const ra = a.shape === 'cyl' ? a.w / 2 : Math.hypot(a.w, a.d) / 2, rb = b.shape === 'cyl' ? b.w / 2 : Math.hypot(b.w, b.d) / 2;
    if (Math.hypot(a.x - b.x, a.z - b.z) < ra + rb + 1 && Math.abs(a.top - b.top) < 4.5 && !a.move && !b.move) log(`  advarsel: platform ${i} og ${j} overlapper/er meget tætte`);
  }
  log(`RESULT: ${ok && portal ? 'PASS' : 'FAIL'} ${def.name} stages=${route.filter(Boolean).length}/${stages.length} time=${total}s tries=${stats.tries}${ok && !portal ? ' (portal ikke nået)' : ''}`);
  // replay helper for screenshots
  window.__botShow = (i) => {
    S.restore(window.__botSnaps[i]);
    S.player.model.root.visible = true;
    S.debug.freeze = true; S.debug.freeCam = false; S.debug.quiet = true;
    keys({});
    for (let k = 0; k < 2; k++) step();
    document.getElementById('toasts').innerHTML = '';
  };
  S.debug.quiet = false;
  S.debug.noLedge = false;
  return { report: out.join('\n'), route: route.filter(Boolean).map((r) => ({ snap: r.snap, label: r.label })) };
}
