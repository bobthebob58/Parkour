/* =====================================================================
   15. LYD (procedurel WebAudio – ingen lydfiler)
   ===================================================================== */
const audio = {
  ctx: null, master: null, enabled: true, noiseBuf: null, windGain: null, windFilter: null, rumbleGain: null,
  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { this.ctx = new AC(); } catch (e) { this.ctx = null; return; }
    const c = this.ctx;
    this.master = c.createGain();
    this.master.gain.value = this.enabled ? 0.55 : 0;
    this.master.connect(c.destination);
    const len = c.sampleRate * 2;
    this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const loop = (freq, gain) => {
      const src = c.createBufferSource();
      src.buffer = this.noiseBuf;
      src.loop = true;
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = freq;
      const g = c.createGain();
      g.gain.value = gain;
      src.connect(f).connect(g).connect(this.master);
      src.start();
      return { f, g };
    };
    const wind = loop(450, 0.04);
    this.windGain = wind.g; this.windFilter = wind.f;
    this.rumbleGain = loop(120, 0).g;
    const roll = loop(260, 0); // hjulenes rumlen på skateboardet
    this.rollGain = roll.g; this.rollFilter = roll.f;
  },
  setEnabled(on) {
    this.enabled = on;
    if (this.master) this.master.gain.setTargetAtTime(on ? 0.55 : 0, this.ctx.currentTime, 0.05);
  },
  tone(freq, dur, { type = 'sine', vol = 0.2, to = null, delay = 0, attack = 0.005 } = {}) {
    const c = this.ctx, t0 = c.currentTime + delay;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(this.master);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  },
  noise(dur, { vol = 0.2, type = 'lowpass', freq = 1000, to = null, q = 0.8, delay = 0 } = {}) {
    const c = this.ctx, t0 = c.currentTime + delay;
    const s = c.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(freq, t0);
    if (to) f.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f).connect(g).connect(this.master);
    s.start(t0, Math.random() * 1.5);
    s.stop(t0 + dur + 0.05);
  },
  play(name, k = 1) {
    if (!this.ctx || !this.enabled || debug.quiet) return;
    switch (name) {
      case 'jump': this.tone(300, 0.14, { type: 'square', vol: 0.05, to: 560 }); this.noise(0.08, { vol: 0.08, freq: 900 }); break;
      case 'land': this.noise(0.16, { vol: 0.25 * k, freq: 500, to: 120 }); break;
      case 'step': this.noise(0.05, { vol: 0.05, freq: 900 + Math.random() * 400 }); break;
      case 'coin': this.tone(988, 0.09, { type: 'square', vol: 0.07 }); this.tone(1319, 0.28, { type: 'square', vol: 0.07, delay: 0.08 }); break;
      case 'chalk': this.noise(0.45, { vol: 0.22, type: 'highpass', freq: 2600, to: 900 }); break;
      case 'rope': this.noise(0.16, { vol: 0.22, type: 'bandpass', freq: 500, to: 3500, q: 2 }); this.tone(1400, 0.06, { type: 'triangle', vol: 0.08, delay: 0.1 }); break;
      case 'bounce': this.tone(160, 0.38, { vol: 0.32, to: 760 }); break;
      case 'hit': this.noise(0.2, { vol: 0.35, freq: 1400, to: 200 }); this.tone(140, 0.2, { type: 'sawtooth', vol: 0.08, to: 70 }); break;
      case 'crack': this.noise(0.3, { vol: 0.28, freq: 1600, to: 260 }); this.noise(0.12, { vol: 0.16, type: 'highpass', freq: 3000, delay: 0.05 }); break;
      case 'death':
        this.noise(1.3, { vol: 0.45, freq: 4000, to: 180 });
        this.tone(220, 0.9, { type: 'sawtooth', vol: 0.09, to: 40 });
        break;
      case 'portal':
        [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.5, { type: 'triangle', vol: 0.09, delay: i * 0.07 }));
        this.noise(0.9, { vol: 0.12, type: 'bandpass', freq: 400, to: 4000, q: 1.5 });
        break;
      case 'buy': this.tone(784, 0.1, { type: 'square', vol: 0.06 }); this.tone(1175, 0.3, { type: 'square', vol: 0.06, delay: 0.09 }); break;
      case 'deny': this.tone(170, 0.16, { type: 'square', vol: 0.06, to: 120 }); break;
      case 'click': this.tone(620, 0.05, { type: 'triangle', vol: 0.07 }); break;
      case 'grab': this.noise(0.09, { vol: 0.22, freq: 1200, to: 400 }); this.tone(220, 0.08, { type: 'triangle', vol: 0.06 }); break;
      case 'climb': this.noise(0.25, { vol: 0.12, type: 'bandpass', freq: 700, to: 1400, q: 1.2 }); break;
      case 'slip': this.noise(0.4, { vol: 0.2, type: 'highpass', freq: 2200, to: 600 }); this.tone(330, 0.3, { type: 'triangle', vol: 0.06, to: 160 }); break;
      case 'dbl': this.noise(0.22, { vol: 0.18, type: 'bandpass', freq: 600, to: 2600, q: 1.5 }); this.tone(520, 0.16, { type: 'triangle', vol: 0.07, to: 880 }); break;
      case 'ollie': this.tone(90, 0.08, { type: 'square', vol: 0.12 }); this.noise(0.08, { vol: 0.25, freq: 2500 }); break;
      case 'grind': this.noise(0.5, { vol: 0.18, type: 'bandpass', freq: 3200, q: 3 }); break;
      case 'boost': this.tone(300, 0.4, { type: 'sawtooth', vol: 0.06, to: 1200 }); break;
      case 'zip': this.noise(0.9, { vol: 0.12, type: 'bandpass', freq: 1800, to: 3600, q: 4 }); break;
      default: break;
    }
  },
  update(heightAboveLava, speed, rolling = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.rollGain.gain.setTargetAtTime(Math.min(rolling / 18, 1) * 0.25, t, 0.08);
    this.rollFilter.frequency.setTargetAtTime(160 + rolling * 22, t, 0.1);
    this.rumbleGain.gain.setTargetAtTime(clamp(1 - heightAboveLava / 70, 0, 1) * 0.35, t, 0.2);
    this.windGain.gain.setTargetAtTime(0.03 + Math.min(speed / 28, 1) * 0.09, t, 0.2);
    this.windFilter.frequency.setTargetAtTime(380 + speed * 45, t, 0.2);
  },
};

