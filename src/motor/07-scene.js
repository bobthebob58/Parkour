/* =====================================================================
   7. RENDERER, SCENE, HIMMEL, SKYER, LAVA OG LYS
   ===================================================================== */
const canvas = $('game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(CFG.camera.fov, window.innerWidth / window.innerHeight, 0.1, 2600);
scene.fog = new THREE.Fog('#b3d4f4', 100, 700);

buildTextures();
buildMaterials();

// ---- Himmel (gradient-shader med sol/måne) ----
const SKY_VERT = /* glsl */`
  varying vec3 vDir;
  void main() {
    vDir = position;
    vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = p.xyww;
  }`;
const SKY_FRAG = /* glsl */`
  uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uBottom;
  uniform vec3 uSunDir; uniform vec3 uSunColor; uniform float uMoon;
  varying vec3 vDir;
  void main() {
    vec3 d = normalize(vDir);
    float h = d.y;
    vec3 col = mix(uHorizon, uTop, pow(clamp(h, 0.0, 1.0), 0.5));
    col = mix(col, uBottom, smoothstep(-0.02, -0.6, h));
    col += uHorizon * 0.18 * exp(-abs(h) * 16.0);
    float s = max(dot(d, uSunDir), 0.0);
    float size = mix(0.99955, 0.99965, uMoon);
    float disk = smoothstep(size, size + 0.00012, s);
    vec3 diskCol = mix(uSunColor * 9.0, vec3(0.85, 0.9, 1.0) * 1.6, uMoon);
    col += diskCol * disk;
    col += uSunColor * (pow(s, 90.0) * 0.55 + pow(s, 7.0) * 0.22) * (1.0 - uMoon * 0.65);
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }`;
const skyUniforms = {
  uTop: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uBottom: { value: new THREE.Color() },
  uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunColor: { value: new THREE.Color() }, uMoon: { value: 0 },
};
const skyMat = new THREE.ShaderMaterial({
  uniforms: skyUniforms, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG,
  side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false,
});
const skyGroup = new THREE.Group();
const skyMesh = new THREE.Mesh(new THREE.SphereGeometry(1000, 48, 24), skyMat);
skyMesh.renderOrder = -10;
skyMesh.frustumCulled = false;
skyGroup.add(skyMesh);

// Stjerner (synlige ved skumring og nat)
const starMat = new THREE.PointsMaterial({ color: '#ffffff', size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
{
  const rng = mulberry32(77), N = 1600, pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const u = rng() * 2 - 1, a = rng() * Math.PI * 2, r = Math.sqrt(1 - u * u);
    const y = Math.abs(u) * 0.95 + 0.05;
    pos[i * 3] = Math.cos(a) * r * 900; pos[i * 3 + 1] = y * 900; pos[i * 3 + 2] = Math.sin(a) * r * 900;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const stars = new THREE.Points(g, starMat);
  stars.renderOrder = -9;
  stars.frustumCulled = false;
  skyGroup.add(stars);
}
scene.add(skyGroup);

// Miljøkort (refleksioner) genereres fra himlen for hvert tema
const pmrem = new THREE.PMREMGenerator(renderer);
const envScene = new THREE.Scene();
envScene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), skyMat));
let envRT = null;

// ---- Skyer ----
const cloudGroup = new THREE.Group();
scene.add(cloudGroup);
const cloudMats = [];
for (let i = 0; i < 6; i++) {
  cloudMats.push(new THREE.SpriteMaterial({
    map: TEX.clouds[i % 3], transparent: true, depthWrite: false, fog: true, opacity: i < 3 ? 0.9 : 0.6,
  }));
}
function buildClouds(bounds) {
  while (cloudGroup.children.length) cloudGroup.remove(cloudGroup.children[0]);
  const rng = mulberry32(Math.floor(bounds.cx * 13 + bounds.cz * 7) + 99);
  const cx = bounds.cx, cz = bounds.cz, R = bounds.radius + 260;
  const add = (x, y, z, s, mi) => {
    const sp = new THREE.Sprite(cloudMats[mi]);
    sp.position.set(x, y, z);
    sp.scale.set(s, s * 0.55, 1);
    sp.userData.drift = 0.6 + rng() * 1.2;
    cloudGroup.add(sp);
  };
  // Skyhav under banen (mellem platformene og lavaen)
  for (let i = 0; i < 70; i++) {
    const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * R;
    add(cx + Math.cos(a) * r, -18 - rng() * 22, cz + Math.sin(a) * r, 35 + rng() * 70, 3 + Math.floor(rng() * 3));
  }
  // Fjerne skyer i horisonten
  for (let i = 0; i < 46; i++) {
    const a = rng() * Math.PI * 2, r = R * 0.8 + rng() * 380;
    add(cx + Math.cos(a) * r, -5 + rng() * 70, cz + Math.sin(a) * r, 80 + rng() * 140, Math.floor(rng() * 3));
  }
  // Høje fjerskyer
  for (let i = 0; i < 18; i++) {
    const a = rng() * Math.PI * 2, r = rng() * R;
    add(cx + Math.cos(a) * r, 90 + rng() * 60, cz + Math.sin(a) * r, 90 + rng() * 120, 3 + Math.floor(rng() * 3));
  }
}

// ---- Lava (animeret shader i bunden af verden) ----
const LAVA_VERT = /* glsl */`
  varying vec3 vWorld;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;
const LAVA_FRAG = /* glsl */`
  uniform float uTime; uniform vec3 uHaze; uniform float uGlow;
  varying vec3 vWorld;
  float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    mat2 r = mat2(0.8, -0.6, 0.6, 0.8);
    for (int i = 0; i < 4; i++) { v += a * noise(p); p = r * p * 2.03; a *= 0.5; }
    return v;
  }
  void main() {
    vec2 p = vWorld.xz * 0.03;
    float t = uTime * 0.045;
    vec2 q = vec2(fbm(p + vec2(0.0, t)), fbm(p + vec2(5.2, 1.3) - t * 0.8));
    float n = fbm(p + 1.7 * q + vec2(t * 0.6, -t * 0.4));
    float heat = smoothstep(0.5, 0.68, n);                       // varme, flydende pøle
    float c2 = fbm(p * 3.1 + q * 2.5 - t * 0.5);
    float crack = 1.0 - smoothstep(0.0, 0.035, abs(c2 - 0.5));    // tynde glødende revner i skorpen
    float pulse = 0.8 + 0.2 * sin(uTime * 1.7 + n * 24.0);
    vec3 crust = vec3(0.07, 0.016, 0.006) * (0.6 + 0.8 * noise(p * 7.0));
    vec3 hot = mix(vec3(1.0, 0.22, 0.02) * 1.6, vec3(1.0, 0.62, 0.16) * 2.6, smoothstep(0.62, 0.78, n));
    vec3 col = mix(crust, hot * pulse, heat);
    col += vec3(1.0, 0.3, 0.04) * 1.4 * crack * (1.0 - heat) * pulse;
    col *= uGlow;
    float dist = length(vWorld.xz - cameraPosition.xz);
    col = mix(col, uHaze, smoothstep(160.0, 1100.0, dist));
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;
const lavaUniforms = { uTime: { value: 0 }, uHaze: { value: new THREE.Color('#ff7a3a') }, uGlow: { value: 1 } };
const lava = new THREE.Mesh(
  new THREE.PlaneGeometry(5000, 5000),
  new THREE.ShaderMaterial({ uniforms: lavaUniforms, vertexShader: LAVA_VERT, fragmentShader: LAVA_FRAG, fog: false }),
);
lava.rotation.x = -Math.PI / 2;
lava.position.y = CFG.lavaY;
scene.add(lava);

// Gløder der stiger op fra lavaen
const emberUniforms = { uTime: { value: 0 }, uCenter: { value: new THREE.Vector3() }, uScale: { value: window.innerHeight } };
{
  const rng = mulberry32(3), N = 700;
  const pos = new Float32Array(N * 3), spd = new Float32Array(N), ph = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (rng() - 0.5) * 220; pos[i * 3 + 1] = rng() * 48; pos[i * 3 + 2] = (rng() - 0.5) * 220;
    spd[i] = 1.5 + rng() * 4; ph[i] = rng() * 100;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSpeed', new THREE.BufferAttribute(spd, 1));
  g.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1));
  const m = new THREE.ShaderMaterial({
    uniforms: emberUniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      attribute float aSpeed; attribute float aPhase;
      uniform float uTime; uniform vec3 uCenter; uniform float uScale;
      varying float vA;
      void main() {
        float h = mod(position.y + uTime * aSpeed, 48.0);
        vec3 w;
        w.x = uCenter.x + mod(position.x - uCenter.x + 110.0, 220.0) - 110.0 + sin(uTime * 0.8 + aPhase) * 1.6;
        w.z = uCenter.z + mod(position.z - uCenter.z + 110.0, 220.0) - 110.0 + cos(uTime * 0.6 + aPhase) * 1.6;
        w.y = ${CFG.lavaY.toFixed(1)} + h;
        vA = (1.0 - h / 48.0) * smoothstep(0.0, 3.0, h);
        vec4 mv = viewMatrix * vec4(w, 1.0);
        gl_PointSize = clamp(uScale * 0.35 / -mv.z, 1.0, 18.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      varying float vA;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d) * vA;
        gl_FragColor = vec4(vec3(1.0, 0.55, 0.18) * 1.8, a);
      }`,
  });
  const embers = new THREE.Points(g, m);
  embers.frustumCulled = false;
  scene.add(embers);
}

// ---- Lys ----
const hemi = new THREE.HemisphereLight('#cfe0ff', '#ff6a2a', 0.9);
scene.add(hemi);
const sun = new THREE.DirectionalLight('#ffffff', 3);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 260;
sun.shadow.camera.left = -34; sun.shadow.camera.right = 34;
sun.shadow.camera.top = 34; sun.shadow.camera.bottom = -34;
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.035;
scene.add(sun, sun.target);
// Lavaens glød oplyser platformenes undersider
const lavaLight = new THREE.DirectionalLight('#ff6a2a', 0.9);
scene.add(lavaLight, lavaLight.target);
const sunDir = new THREE.Vector3();

function applyTheme(theme) {
  skyUniforms.uTop.value.set(theme.top);
  skyUniforms.uHorizon.value.set(theme.horizon);
  skyUniforms.uBottom.value.set(theme.bottom);
  skyUniforms.uSunColor.value.set(theme.sunColor);
  skyUniforms.uMoon.value = theme.moon ? 1 : 0;
  const el = theme.sunElev * DEG, az = theme.sunAz * DEG;
  sunDir.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
  skyUniforms.uSunDir.value.copy(sunDir);
  // Lyset må aldrig komme helt vandret ind (ellers bliver skyggerne meterlange)
  sun.userData.dir = new THREE.Vector3(sunDir.x, Math.max(sunDir.y, 0.42), sunDir.z).normalize();
  sun.color.set(theme.sunColor);
  sun.intensity = theme.sunInt;
  hemi.color.set(theme.hemiSky);
  hemi.intensity = theme.hemiInt;
  lavaLight.intensity = 0.55 * theme.lavaGlow;
  scene.fog.color.set(theme.fog);
  scene.fog.near = theme.fogNear;
  scene.fog.far = theme.fogFar;
  lavaUniforms.uHaze.value.set(theme.horizon).lerp(new THREE.Color(theme.bottom), 0.2);
  lavaUniforms.uGlow.value = 0.85 + theme.lavaGlow * 0.15;
  starMat.opacity = theme.stars;
  renderer.toneMappingExposure = theme.exposure;
  const clouds = theme.clouds ?? 1; // 0 = ingen skyer (fx i rummet)
  cloudMats.forEach((m, i) => { m.color.set(theme.cloud); m.opacity = (i < 3 ? 0.9 : 0.6) * clouds; });
  cloudGroup.visible = clouds > 0.01;
  MAT.stoneTop.color.set(theme.stone);
  MAT.rock.color.set(theme.stone).lerp(new THREE.Color('#ffffff'), 0.25);
  if (envRT) envRT.dispose();
  envRT = pmrem.fromScene(envScene, 0.035);
  scene.environment = envRT.texture;
}

