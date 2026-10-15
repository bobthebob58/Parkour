/* =====================================================================
   11. SPILLEREN
   ===================================================================== */

// Lille partikelsystem: kridtstøv, landingsstøv, lavasprøjt, møntglimt, stenskår
class Particles {
  constructor(max) {
    this.max = max;
    this.cursor = 0;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.alpha = new Float32Array(max);
    this.size = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage);
    this.aAlpha = new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos);
    g.setAttribute('aColor', this.aCol);
    g.setAttribute('aAlpha', this.aAlpha);
    g.setAttribute('aSize', this.aSize);
    this.uniforms = { uScale: { value: window.innerHeight } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, transparent: true, depthWrite: false,
      vertexShader: /* glsl */`
        attribute vec3 aColor; attribute float aAlpha; attribute float aSize;
        uniform float uScale;
        varying vec3 vC; varying float vA;
        void main() {
          vC = aColor; vA = aAlpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * uScale / max(0.2, -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        varying vec3 vC; varying float vA;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.12, d) * vA;
          if (a < 0.01) discard;
          gl_FragColor = vec4(vC, a);
          #include <colorspace_fragment>
        }`,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.tmpColor = new THREE.Color();
  }

  emit(x, y, z, vx, vy, vz, color, size, life, grav = 0, drag = 0) {
    if (debug.quiet) return;
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.max;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.tmpColor.set(color);
    this.col[i * 3] = this.tmpColor.r; this.col[i * 3 + 1] = this.tmpColor.g; this.col[i * 3 + 2] = this.tmpColor.b;
    this.size[i] = size;
    this.life[i] = this.maxLife[i] = life;
    this.grav[i] = grav;
    this.drag[i] = drag;
    this.alpha[i] = 1;
  }

  burst(x, y, z, n, { color = '#ffffff', speed = 3, up = 1, size = 0.25, life = 0.8, grav = 4, drag = 1.5, spread = 0.3 } = {}) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2, s = speed * (0.4 + Math.random() * 0.6);
      this.emit(
        x + (Math.random() - 0.5) * spread, y + (Math.random() - 0.5) * spread, z + (Math.random() - 0.5) * spread,
        Math.cos(a) * s, up * (0.5 + Math.random()) * speed * 0.6, Math.sin(a) * s,
        color, size * (0.6 + Math.random() * 0.8), life * (0.6 + Math.random() * 0.6), grav, drag,
      );
    }
  }

  update(dt) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.alpha[i] = 0; continue; }
      const dr = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[i * 3] *= dr;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * dr - this.grav[i] * dt;
      this.vel[i * 3 + 2] *= dr;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.alpha[i] = Math.min(1, (this.life[i] / this.maxLife[i]) * 1.6);
    }
    this.aPos.needsUpdate = true;
    this.aCol.needsUpdate = true;
    this.aAlpha.needsUpdate = true;
    this.aSize.needsUpdate = true;
  }
}
const particles = new Particles(1600);

const player = {
  body: null, model: null, blob: null,
  grounded: false, wasGrounded: false, groundPlat: null, groundVel: new THREE.Vector3(), groundNormal: new THREE.Vector3(0, 1, 0),
  coyote: 0, jumpBuffer: 0, jumpCooldown: 0, jumping: false, knockCooldown: 0,
  facing: 0, runPhase: 0, squash: 0, lastVy: 0, stepTimer: 0,
  deathPos: new CANNON.Vec3(),
  hang: null,          // hænger i en kant eller stang
  grip: 1,             // grebets udholdenhed (0..1)
  grabCooldown: 0,
  airJumps: 0,         // dobbelthop tilbage i luften
  flipT: -1,           // salto ved dobbelthop (0..1)
  skate: null,         // skateboard-tilstand på skatebanen
  hints: { grab: 0, bar: 0 },
  cs: {},              // tilstand til figurens animation
};

/* ---------------------------------------------------------------------
   Figuren (løberen). Kontrakten mellem motoren og figuren:
     CHARACTER.build() -> rig med
       root   : Group, placeres i kollisionskuglens centrum (fødderne er 0.42 m under)
       inner  : Group, motoren sætter rotation.y (retning; figuren kigger mod -Z),
                rotation.x (hældning på skateboard; rækkefølge 'YXZ') og visible
       hands  : [venstre, højre] Object3D (rebet sidder i højre hånd, kridtstøv fra begge)
       setChalk(k): gør hænderne hvide (0..1)
       board  : skateboard-gruppe (eller null); figuren viser den selv i skate-tilstand
     CHARACTER.animate(rig, s, dt) med s = {
       mode: 'idle'|'run'|'air'|'hang'|'climb'|'rope'|'skate'|'grind',
       speed, vy, grounded, runPhase, time, squash, flipT, chalk,
       hangKind: 'ledge'|'bar'|'zip', shimmy (-1..1), climbT (0..1),
       push (bool), lean (-1..1), crouch (0..1),
       grip (0..1 udholdenhed), gripLocal {x,y,z} + gripTangent {x,y,z}: hvor hænderne
         holder (midtpunkt og retning langs kant/stang) i figurens lokale ramme (inner),
       ropeDir {x,y,z}: retning mod rebets krog i lokal ramme (eller null),
       turnRate (rad/s), surface: 'ice'|'conveyor'|null, aimLocal {x,y,z}: kameraets sigte i lokal ramme,
       gear: { gloves, chalk, rope, helmet } – udstyr, spilleren har (vises på figuren) }
   --------------------------------------------------------------------- */
