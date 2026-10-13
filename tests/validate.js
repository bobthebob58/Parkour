// Analytic feasibility check of all 10 levels.
module.exports = async (page, h) => {
  await page.waitForFunction(() => window.skyhoj && window.skyhoj.game.state === 'menu', null, { timeout: 60000 });
  const out = await page.evaluate(() => {
    const S = window.skyhoj, CFG = S.CFG;
    const g = CFG.gravity, speed = CFG.move.speed;
    const reach = (v0, dy) => {
      const disc = v0 * v0 - 2 * g * dy;
      if (disc < 0) return -1;
      return speed * (v0 + Math.sqrt(disc)) / g;
    };
    const fwd = (h) => ({ x: Math.sin(h), z: -Math.cos(h) });
    const right = (h) => ({ x: Math.cos(h), z: Math.sin(h) });
    // signed distance from point to footprint (positive outside)
    const sdf = (p, px, pz) => {
      const dx = px - p.cx, dz = pz - p.cz;
      if (p.shape === 'cyl') return Math.hypot(dx, dz) - p.w / 2;
      const f = fwd(p.yaw), r = right(p.yaw);
      const lz = Math.abs(dx * f.x + dz * f.z) - p.d / 2, lx = Math.abs(dx * r.x + dz * r.z) - p.w / 2;
      return Math.hypot(Math.max(lx, 0), Math.max(lz, 0)) + Math.min(Math.max(lx, lz), 0);
    };
    const perimeter = (p) => {
      const pts = [];
      if (p.shape === 'cyl') {
        for (let i = 0; i < 64; i++) { const a = i / 64 * Math.PI * 2; pts.push([p.cx + Math.cos(a) * p.w / 2, p.cz + Math.sin(a) * p.w / 2]); }
      } else {
        const f = fwd(p.yaw), r = right(p.yaw);
        for (let i = 0; i <= 16; i++) {
          const t = i / 16 - 0.5;
          for (const [a, b] of [[t * p.w, p.d / 2], [t * p.w, -p.d / 2], [p.w / 2, t * p.d], [-p.w / 2, t * p.d]]) {
            pts.push([p.cx + r.x * a + f.x * b, p.cz + r.z * a + f.z * b]);
          }
        }
      }
      return pts;
    };
    const gapBetween = (A, B) => {
      let m = Infinity;
      for (const [x, z] of perimeter(A)) m = Math.min(m, sdf(B, x, z));
      for (const [x, z] of perimeter(B)) m = Math.min(m, sdf(A, x, z));
      return m;
    };
    const at = (p, t) => {
      const q = { ...p, cx: p.x, cz: p.z, ctop: p.top };
      if (p.move) {
        const k = Math.sin((t / p.move.per + p.move.ph) * Math.PI * 2) * p.move.amp;
        q.cx += p.move.axis[0] * k; q.ctop += p.move.axis[1] * k; q.cz += p.move.axis[2] * k;
      }
      return q;
    };
    const lines = [];
    let worst = [];
    S.LEVELS.forEach((def, li) => {
      const d = S.buildLevelData(def);
      let length = 0;
      lines.push(`\n=== Bane ${li + 1}: ${def.name} (${d.plats.length} platforme, ${d.anchors.length} krogpunkter, ${d.coins.length} mønter)`);
      for (let i = 0; i + 1 < d.plats.length; i++) {
        const A = d.plats[i], B = d.plats[i + 1];
        length += Math.hypot(B.x - A.x, B.z - A.z);
        // best case over motion cycle (both may move): sample times
        let best = { gap: Infinity, dy: 0, ratio: Infinity };
        const per = Math.max(A.move ? A.move.per : 1, B.move ? B.move.per : 1) * 2;
        const N = (A.move || B.move) ? 96 : 1;
        for (let k = 0; k < N; k++) {
          const t = k / N * per;
          const a = at(A, t), b = at(B, t + 0.8);
          const gap = gapBetween(a, b);
          const dy = b.ctop - a.ctop;
          const v0 = A.type === 'bounce' ? A.pow : CFG.move.jumpVel;
          const r = reach(v0, dy);
          const ratio = r < 0 ? Infinity : gap / r;
          if (ratio < best.ratio) best = { gap, dy, ratio, r };
        }
        let note = '';
        if (B.rope) {
          // anchors between A and B
          const anchors = d.anchors.filter(an => {
            const ax = an.x - A.x, az = an.z - A.z, f = fwd(B.heading);
            const along = ax * f.x + az * f.z;
            return along > 0 && along < Math.hypot(B.x - A.x, B.z - A.z);
          });
          const edgeA = { x: A.x + fwd(B.heading).x * (A.d / 2), z: A.z + fwd(B.heading).z * (A.d / 2) };
          const first = anchors[0];
          const dist0 = first ? Math.hypot(first.x - edgeA.x, first.y - (A.top + 1.2), first.z - edgeA.z) : Infinity;
          note = `REB: ${anchors.length} krogpunkt(er), afstand fra kant til første ${dist0.toFixed(1)} m` + (dist0 > CFG.rope.range ? '  <-- UDEN FOR RÆKKEVIDDE' : '');
          for (let j = 1; j < anchors.length; j++) {
            const dd = Math.hypot(anchors[j].x - anchors[j - 1].x, anchors[j].y - anchors[j - 1].y, anchors[j].z - anchors[j - 1].z);
            note += `, ${j}->${j + 1}: ${dd.toFixed(1)} m`;
          }
        } else {
          if (best.ratio > 0.92) note = '  <-- FOR LANGT';
          else if (best.ratio > 0.8) note = '  (meget svært)';
          worst.push({ li: li + 1, i, ratio: best.ratio });
        }
        const flag = B.rope ? '' : `ratio ${best.ratio.toFixed(2)}`;
        lines.push(`  ${String(i).padStart(2)}->${String(i + 1).padStart(2)} ${A.type.padEnd(7)}→${B.type.padEnd(7)} gap ${best.gap.toFixed(2).padStart(5)} dy ${best.dy.toFixed(2).padStart(5)} ${flag} ${note}`);
      }
      // overlap check between non-adjacent platforms
      for (let i = 0; i < d.plats.length; i++) for (let j = i + 2; j < d.plats.length; j++) {
        const A = at(d.plats[i], 0), B = at(d.plats[j], 0);
        const gp = gapBetween(A, B);
        if (gp < 2 && Math.abs(A.ctop - B.ctop) < 5) lines.push(`  !! overlap/tæt: ${i} og ${j} (gap ${gp.toFixed(2)}, dy ${(B.ctop - A.ctop).toFixed(1)})`);
      }
      lines.push(`  længde ca. ${length.toFixed(0)} m, højde ${Math.min(...d.plats.map(p => p.top)).toFixed(1)}..${Math.max(...d.plats.map(p => p.top)).toFixed(1)}`);
    });
    return lines.join('\n');
  });
  console.log(out);
  if (/FOR LANGT|UDEN FOR RÆKKEVIDDE|overlap/.test(out)) throw new Error('Banevalidering fejlede');
};
