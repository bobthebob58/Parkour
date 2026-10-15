/* =====================================================================
   6. PROCEDURELLE TEKSTURER OG MATERIALER
   Alle teksturer tegnes på <canvas> ved opstart – ingen eksterne filer.
   ===================================================================== */

// Sømløs (tilbar) value-noise med flere oktaver
function tileNoise(size, cells, octaves, rng) {
  const out = new Float32Array(size * size);
  let amp = 1, total = 0;
  for (let o = 0; o < octaves; o++) {
    const n = cells << o;
    const lat = new Float32Array(n * n);
    for (let i = 0; i < lat.length; i++) lat[i] = rng();
    for (let y = 0; y < size; y++) {
      const fy = (y / size) * n, y0 = Math.floor(fy), y1 = (y0 + 1) % n;
      let ty = fy - y0; ty = ty * ty * (3 - 2 * ty);
      for (let x = 0; x < size; x++) {
        const fx = (x / size) * n, x0 = Math.floor(fx), x1 = (x0 + 1) % n;
        let tx = fx - x0; tx = tx * tx * (3 - 2 * tx);
        const a = lat[y0 * n + x0], b = lat[y0 * n + x1], c = lat[y1 * n + x0], d = lat[y1 * n + x1];
        out[y * size + x] += amp * lerp(lerp(a, b, tx), lerp(c, d, tx), ty);
      }
    }
    total += amp;
    amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

function makeCanvas(size, h = size) {
  const c = document.createElement('canvas');
  c.width = size; c.height = h;
  return c;
}

let maxAniso = 4;
function toTexture(canvas, { srgb = true, repeat = true } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = maxAniso;
  t.needsUpdate = true;
  return t;
}

// Tegn pixel for pixel: fn(x, y) -> [r, g, b] (0..1) og evt. bump-højde
function paintPixels(size, fn) {
  const col = makeCanvas(size), bump = makeCanvas(size);
  const cc = col.getContext('2d'), bc = bump.getContext('2d');
  const ci = cc.createImageData(size, size), bi = bc.createImageData(size, size);
  const px = [0, 0, 0, 0];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      fn(x, y, px);
      const i = (y * size + x) * 4;
      ci.data[i] = clamp(px[0], 0, 1) * 255;
      ci.data[i + 1] = clamp(px[1], 0, 1) * 255;
      ci.data[i + 2] = clamp(px[2], 0, 1) * 255;
      ci.data[i + 3] = 255;
      const b = clamp(px[3], 0, 1) * 255;
      bi.data[i] = bi.data[i + 1] = bi.data[i + 2] = b;
      bi.data[i + 3] = 255;
    }
  }
  cc.putImageData(ci, 0, 0);
  bc.putImageData(bi, 0, 0);
  return { col, bump };
}

const TEX = {};

function buildTextures() {
  const S = 512;

  // --- Stenfliser (platformtoppe). 512 px = 2 m -> 2x2 fliser à 1 m ---
  {
    const rng = mulberry32(11);
    const big = tileNoise(S, 6, 5, rng), fine = tileNoise(S, 48, 2, rng);
    const tints = [0.04, -0.05, 0.0, 0.07].map((v) => v + (rng() - 0.5) * 0.05);
    const { col, bump } = paintPixels(S, (x, y, px) => {
      const sx = x % 256, sy = y % 256;
      const slab = (x >> 8) + ((y >> 8) << 1);
      const edge = Math.min(sx, 255 - sx, sy, 255 - sy);
      const n = big[y * S + x], f = fine[y * S + x];
      let v = 0.74 + (n - 0.5) * 0.34 + (f - 0.5) * 0.14 + tints[slab];
      let h = 0.62 + (n - 0.5) * 0.4 + (f - 0.5) * 0.2;
      if (f > 0.78) { v -= 0.1; h -= 0.15; }
      if (edge < 3) { v = 0.42 + n * 0.12; h = 0.05; }
      else if (edge < 12) {
        const k = (12 - edge) / 8;
        const lit = sx < 12 || sy < 12 ? 1 : -1;
        v += lit * 0.08 * k; h -= k * 0.35;
      }
      px[0] = v * 1.02; px[1] = v * 0.99; px[2] = v * 0.95; px[3] = h;
    });
    TEX.stoneTop = toTexture(col);
    TEX.stoneBump = toTexture(bump, { srgb: false });
  }

  // --- Klippeside med lag (sider og bund af platforme) ---
  {
    const rng = mulberry32(23);
    const n1 = tileNoise(S, 4, 5, rng), n2 = tileNoise(S, 16, 3, rng), n3 = tileNoise(S, 64, 2, rng);
    const { col, bump } = paintPixels(S, (x, y, px) => {
      const i = y * S + x, a = n1[i], b = n2[i], c = n3[i];
      const strata = 0.5 + 0.5 * Math.sin((y / S) * Math.PI * 2 * 3 + a * 12 + b * 3);
      let v = 0.36 + (a - 0.5) * 0.35 + strata * 0.08 + (c - 0.5) * 0.12;
      const crack = Math.abs(b - 0.5) < 0.01 ? 1 : 0;
      v -= crack * 0.16;
      px[0] = v * 1.06; px[1] = v * 0.99; px[2] = v * 0.92;
      px[3] = 0.5 + (a - 0.5) * 0.8 + (c - 0.5) * 0.3 - crack * 0.4;
    });
    TEX.rock = toTexture(col);
    TEX.rockBump = toTexture(bump, { srgb: false });
  }

  // --- Metalplade med advarselsstriber (bevægelige platforme, ikke-tilet) ---
  {
    const c = makeCanvas(S), g = c.getContext('2d');
    const rng = mulberry32(5);
    g.fillStyle = '#3d4b5c'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 2600; i++) { // børstet metal
      g.fillStyle = `rgba(255,255,255,${rng() * 0.05})`;
      g.fillRect(rng() * S, rng() * S, 30 + rng() * 80, 1);
    }
    const B = 44;
    g.save();
    g.beginPath(); g.rect(0, 0, S, S); g.rect(B, B, S - 2 * B, S - 2 * B); g.clip('evenodd');
    g.fillStyle = '#f2b705'; g.fillRect(0, 0, S, S);
    g.fillStyle = '#1b1b1b';
    for (let i = -S; i < S * 2; i += 52) {
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 26, 0); g.lineTo(i + 26 - S, S); g.lineTo(i - S, S); g.closePath(); g.fill();
    }
    g.restore();
    g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = 4; g.strokeRect(B, B, S - 2 * B, S - 2 * B);
    g.strokeStyle = 'rgba(255,255,255,0.08)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(S / 2, B); g.lineTo(S / 2, S - B); g.moveTo(B, S / 2); g.lineTo(S - B, S / 2); g.stroke();
    for (const [rx, ry] of [[B + 18, B + 18], [S - B - 18, B + 18], [B + 18, S - B - 18], [S - B - 18, S - B - 18]]) {
      const gr = g.createRadialGradient(rx - 3, ry - 3, 1, rx, ry, 8);
      gr.addColorStop(0, '#c8d2de'); gr.addColorStop(1, '#2a3440');
      g.fillStyle = gr; g.beginPath(); g.arc(rx, ry, 8, 0, Math.PI * 2); g.fill();
    }
    TEX.metalTop = toTexture(c, { repeat: false });
  }
  {
    const c = makeCanvas(256), g = c.getContext('2d');
    g.fillStyle = '#34404e'; g.fillRect(0, 0, 256, 256);
    g.fillStyle = '#f2b705'; g.fillRect(0, 0, 256, 36);
    g.fillStyle = '#1b1b1b';
    for (let i = -64; i < 320; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 16, 0); g.lineTo(i - 20, 36); g.lineTo(i - 36, 36); g.fill(); }
    g.strokeStyle = 'rgba(255,255,255,0.1)'; g.lineWidth = 2;
    for (let x = 0; x < 256; x += 64) { g.beginPath(); g.moveTo(x, 36); g.lineTo(x, 256); g.stroke(); }
    TEX.metalSide = toTexture(c);
  }

  // --- Is (glat, tilet) ---
  {
    const rng = mulberry32(31);
    const n = tileNoise(S, 5, 5, rng), f = tileNoise(S, 40, 2, rng);
    const crack = makeCanvas(S), cg = crack.getContext('2d');
    cg.strokeStyle = 'rgba(255,255,255,0.9)';
    for (let k = 0; k < 26; k++) { // revner som tilfældige vandringer
      let x = rng() * S, y = rng() * S, a = rng() * Math.PI * 2;
      cg.lineWidth = 0.6 + rng() * 1.6;
      cg.beginPath(); cg.moveTo(x, y);
      for (let s = 0; s < 14; s++) {
        a += (rng() - 0.5) * 1.1; x += Math.cos(a) * 14; y += Math.sin(a) * 14;
        cg.lineTo(x, y);
      }
      cg.stroke();
    }
    const cd = cg.getImageData(0, 0, S, S).data;
    const { col, bump } = paintPixels(S, (x, y, px) => {
      const i = y * S + x, cr = cd[i * 4 + 3] / 255;
      const v = n[i], w = f[i];
      px[0] = 0.72 + v * 0.18 + cr * 0.25 + w * 0.05;
      px[1] = 0.88 + v * 0.1 + cr * 0.12;
      px[2] = 0.98 + cr * 0.05;
      px[3] = 0.5 + (v - 0.5) * 0.2 - cr * 0.5;
    });
    TEX.iceTop = toTexture(col);
    TEX.iceBump = toTexture(bump, { srgb: false });
  }
  {
    const rng = mulberry32(37);
    const n = tileNoise(256, 4, 4, rng);
    const { col } = paintPixels(256, (x, y, px) => {
      const v = n[y * 256 + x];
      const streak = 0.5 + 0.5 * Math.sin(x * 0.15 + v * 6);
      px[0] = 0.42 + v * 0.2 + streak * 0.08; px[1] = 0.68 + v * 0.18 + streak * 0.06; px[2] = 0.92; px[3] = 0.5;
    });
    TEX.iceSide = toTexture(col);
  }

  // --- Smuldrende sandsten ---
  {
    const rng = mulberry32(41);
    const n = tileNoise(S, 6, 5, rng), f = tileNoise(S, 32, 2, rng);
    const crack = makeCanvas(S), cg = crack.getContext('2d');
    cg.strokeStyle = '#000';
    for (let k = 0; k < 16; k++) {
      let x = rng() * S, y = rng() * S, a = rng() * Math.PI * 2;
      cg.lineWidth = 2 + rng() * 3;
      cg.beginPath(); cg.moveTo(x, y);
      for (let s = 0; s < 10; s++) { a += (rng() - 0.5) * 1.4; x += Math.cos(a) * 22; y += Math.sin(a) * 22; cg.lineTo(x, y); }
      cg.stroke();
    }
    const cd = cg.getImageData(0, 0, S, S).data;
    const { col, bump } = paintPixels(S, (x, y, px) => {
      const i = y * S + x, cr = cd[i * 4 + 3] / 255;
      const v = 0.7 + (n[i] - 0.5) * 0.3 + (f[i] - 0.5) * 0.18 - cr * 0.45;
      px[0] = v * 1.05; px[1] = v * 0.8; px[2] = v * 0.55;
      px[3] = 0.6 + (n[i] - 0.5) * 0.3 - cr * 0.6;
    });
    TEX.crumble = toTexture(col);
    TEX.crumbleBump = toTexture(bump, { srgb: false });
  }

  // --- Springpude (ikke-tilet) ---
  {
    const c = makeCanvas(S), g = c.getContext('2d');
    g.fillStyle = '#1d2a12'; g.fillRect(0, 0, S, S);
    const gr = g.createRadialGradient(S / 2, S / 2, 20, S / 2, S / 2, S * 0.48);
    gr.addColorStop(0, '#d9ff6a'); gr.addColorStop(1, '#5fbf1d');
    g.fillStyle = gr; g.fillRect(28, 28, S - 56, S - 56);
    g.strokeStyle = 'rgba(20,50,0,0.55)'; g.lineWidth = 10;
    for (let r = 60; r < 240; r += 50) { g.beginPath(); g.arc(S / 2, S / 2, r, 0, Math.PI * 2); g.stroke(); }
    g.fillStyle = 'rgba(255,255,255,0.92)';
    for (let k = 0; k < 2; k++) { // pile-op chevrons
      const y0 = S / 2 + 30 - k * 70;
      g.beginPath(); g.moveTo(S / 2 - 70, y0 + 40); g.lineTo(S / 2, y0 - 30); g.lineTo(S / 2 + 70, y0 + 40);
      g.lineTo(S / 2 + 45, y0 + 52); g.lineTo(S / 2, y0 + 8); g.lineTo(S / 2 - 45, y0 + 52); g.closePath(); g.fill();
    }
    TEX.bounceTop = toTexture(c, { repeat: false });
  }

  // --- Rød/hvid stribet vindmøllearm ---
  {
    const c = makeCanvas(256, 64), g = c.getContext('2d');
    for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#f4f4f4' : '#d8261c'; g.fillRect(i * 32, 0, 32, 64); }
    g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(0, 52, 256, 12);
    TEX.stripes = toTexture(c);
  }

  // --- Skyer (bløde totter) ---
  TEX.clouds = [0, 1, 2].map((k) => {
    const c = makeCanvas(256), g = c.getContext('2d');
    const rng = mulberry32(100 + k * 7);
    for (let i = 0; i < 42; i++) {
      const a = rng() * Math.PI * 2, r = Math.pow(rng(), 0.7) * 70;
      const x = 128 + Math.cos(a) * r * 1.25, y = 138 + Math.sin(a) * r * 0.5 - rng() * 14;
      const rad = 26 + rng() * 34;
      const gr = g.createRadialGradient(x, y - rad * 0.25, 0, x, y, rad);
      const shade = 230 + Math.floor((1 - (y - 90) / 100) * 25);
      gr.addColorStop(0, `rgba(${shade},${shade},${shade + 5},0.55)`);
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
    }
    return toTexture(c, { repeat: false });
  });

  // --- Blød glød (portal, krogpunkter, mønter) ---
  {
    const c = makeCanvas(128), g = c.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.55)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    TEX.glow = toTexture(c, { repeat: false });
  }

  // --- Rund skygge under spilleren (landingsindikator) ---
  {
    const c = makeCanvas(128), g = c.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 62);
    gr.addColorStop(0, 'rgba(0,0,0,0.6)'); gr.addColorStop(0.7, 'rgba(0,0,0,0.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    TEX.blob = toTexture(c, { repeat: false });
  }
}

// Skilt/maling med tekst (start-platform og skilte)
function textTexture(lines, { w = 1024, h = 512, bg = null, color = '#fff', font = 'Rubik, system-ui, sans-serif', sizes = [150, 70], stroke = null } = {}) {
  const c = makeCanvas(w, h), g = c.getContext('2d');
  if (bg) { g.fillStyle = bg; g.fillRect(0, 0, w, h); }
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const total = sizes.slice(0, lines.length).reduce((a, b) => a + b * 1.1, 0);
  let y = h / 2 - total / 2;
  lines.forEach((line, i) => {
    const s = sizes[i] || sizes[sizes.length - 1];
    g.font = `900 ${s}px ${font}`;
    y += (s * 1.1) / 2;
    if (stroke) { g.lineWidth = s * 0.08; g.strokeStyle = stroke; g.strokeText(line, w / 2, y); }
    g.fillStyle = color; g.fillText(line, w / 2, y);
    y += (s * 1.1) / 2;
  });
  return toTexture(c, { repeat: false });
}

const MAT = {};
function buildMaterials() {
  const std = (o) => new THREE.MeshStandardMaterial(o);
  MAT.stoneTop = std({ map: TEX.stoneTop, bumpMap: TEX.stoneBump, bumpScale: 1.6, roughness: 0.88, metalness: 0 });
  MAT.rock = std({ map: TEX.rock, bumpMap: TEX.rockBump, bumpScale: 2.2, roughness: 0.95, metalness: 0 });
  MAT.metalTop = std({ map: TEX.metalTop, roughness: 0.42, metalness: 0.65 });
  MAT.metalSide = std({ map: TEX.metalSide, roughness: 0.5, metalness: 0.6 });
  MAT.iceTop = new THREE.MeshPhysicalMaterial({
    map: TEX.iceTop, bumpMap: TEX.iceBump, bumpScale: 0.8, roughness: 0.06, metalness: 0,
    clearcoat: 1, clearcoatRoughness: 0.04, color: '#f2fbff',
  });
  MAT.iceSide = std({ map: TEX.iceSide, roughness: 0.12, metalness: 0, color: '#d6f1ff', emissive: '#0b2a44', emissiveIntensity: 0.4 });
  MAT.crumble = std({ map: TEX.crumble, bumpMap: TEX.crumbleBump, bumpScale: 2, roughness: 0.92 });
  MAT.bounceTop = std({ map: TEX.bounceTop, roughness: 0.5, emissive: '#3c7a00', emissiveIntensity: 0.25 });
  MAT.bounceSide = std({ color: '#2b3a22', roughness: 0.6, metalness: 0.3 });
  MAT.stripes = std({ map: TEX.stripes, roughness: 0.4, metalness: 0.2 });
  MAT.hub = std({ color: '#2e3540', roughness: 0.35, metalness: 0.9 });
  MAT.coin = std({ color: '#ffcc40', roughness: 0.22, metalness: 1, emissive: '#7a4a00', emissiveIntensity: 0.35 });
  MAT.anchor = std({ color: '#ffd24a', roughness: 0.3, metalness: 0.8, emissive: '#ff9d00', emissiveIntensity: 0.9 });
  // Faste signaler, der ser ens ud i alle verdener
  MAT.anchorRing = std({ color: '#8ff4ff', roughness: 0.25, metalness: 0.4, emissive: '#19d6ff', emissiveIntensity: 1.8 });
  MAT.gripTape = std({ color: '#f4f2ec', roughness: 0.95, metalness: 0 });
  const lip = (color, opacity) => new THREE.MeshBasicMaterial({
    color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  MAT.lipFaint = lip('#f6f3ea', 0.32);
  MAT.lipGrab = lip('#ffffff', 0.8);
  MAT.lipIcy = lip('#a8ecff', 0.9);
  MAT.rope = std({ color: '#c8a46a', roughness: 0.85 });
  MAT.hook = std({ color: '#9aa4b2', roughness: 0.3, metalness: 1 });
  MAT.portalRing = std({ color: '#7cf0ff', roughness: 0.2, metalness: 0.6, emissive: '#36c8ff', emissiveIntensity: 2.2 });
  MAT.signWood = std({ color: '#6b4a2b', roughness: 0.85 });
}

