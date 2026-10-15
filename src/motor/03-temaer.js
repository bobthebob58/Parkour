/* =====================================================================
   3. HIMMEL-TEMAER
   ===================================================================== */
const THEMES = {
  morning: {
    top: '#3a78d4', horizon: '#ffd6ae', bottom: '#f0b48a', sunElev: 18, sunAz: 40, sunColor: '#ffe0b8', sunInt: 3.0,
    hemiSky: '#cfe0ff', hemiInt: 0.9, fog: '#f2d2b6', fogNear: 90, fogFar: 620, cloud: '#fff1e4', stars: 0,
    stone: '#e8dccb', exposure: 1.0, lavaGlow: 0.9,
  },
  day: {
    top: '#1f63c9', horizon: '#a7d2ff', bottom: '#d9c6b2', sunElev: 58, sunAz: 20, sunColor: '#fff6e8', sunInt: 3.4,
    hemiSky: '#c4dcff', hemiInt: 0.95, fog: '#b3d4f4', fogNear: 110, fogFar: 700, cloud: '#ffffff', stars: 0,
    stone: '#d9d6cf', exposure: 1.0, lavaGlow: 0.8,
  },
  frost: {
    top: '#2c6fbf', horizon: '#d8f0ff', bottom: '#b9d6ea', sunElev: 30, sunAz: -30, sunColor: '#f4fbff', sunInt: 3.0,
    hemiSky: '#d9efff', hemiInt: 1.0, fog: '#d3e9f8', fogNear: 80, fogFar: 560, cloud: '#f6fbff', stars: 0,
    stone: '#c5d3e0', exposure: 1.02, lavaGlow: 0.8,
  },
  afternoon: {
    top: '#2860b8', horizon: '#ffe3b5', bottom: '#eab98e', sunElev: 34, sunAz: -60, sunColor: '#fff0cf', sunInt: 3.2,
    hemiSky: '#d5e2ff', hemiInt: 0.9, fog: '#f1dcbc', fogNear: 100, fogFar: 640, cloud: '#fff8ea', stars: 0,
    stone: '#e3d2b9', exposure: 1.0, lavaGlow: 0.9,
  },
  golden: {
    top: '#3a5aa8', horizon: '#ffc888', bottom: '#e39a6a', sunElev: 14, sunAz: -80, sunColor: '#ffcf8a', sunInt: 3.0,
    hemiSky: '#e8d6c0', hemiInt: 0.85, fog: '#f0c49a', fogNear: 80, fogFar: 560, cloud: '#ffe2c2', stars: 0,
    stone: '#e2c39c', exposure: 1.02, lavaGlow: 1.0,
  },
  sunset: {
    top: '#283a7c', horizon: '#ff9b5c', bottom: '#c45a6a', sunElev: 6, sunAz: 70, sunColor: '#ffad6b', sunInt: 2.7,
    hemiSky: '#c9a7c9', hemiInt: 0.8, fog: '#e89a7c', fogNear: 70, fogFar: 520, cloud: '#ffc2a6', stars: 0.15,
    stone: '#d9b39a', exposure: 1.05, lavaGlow: 1.2,
  },
  dusk: {
    top: '#151d4c', horizon: '#c4607e', bottom: '#7a3a6a', sunElev: 3, sunAz: 100, sunColor: '#ff9a7a', sunInt: 2.2,
    hemiSky: '#8f86c4', hemiInt: 0.85, fog: '#9a5c80', fogNear: 60, fogFar: 480, cloud: '#e4a0b8', stars: 0.5,
    stone: '#c9b4c4', exposure: 1.1, lavaGlow: 1.35,
  },
  storm: {
    top: '#2a3242', horizon: '#7f8a9a', bottom: '#5a4a52', sunElev: 40, sunAz: 10, sunColor: '#dfe6f2', sunInt: 1.9,
    hemiSky: '#a6b2c6', hemiInt: 1.05, fog: '#76808f', fogNear: 45, fogFar: 380, cloud: '#9aa4b2', stars: 0,
    stone: '#b9bec6', exposure: 1.12, lavaGlow: 1.3,
  },
  night: {
    top: '#04071a', horizon: '#2b2556', bottom: '#4a1d2a', sunElev: 38, sunAz: 150, sunColor: '#a9c4ff', sunInt: 1.6,
    hemiSky: '#6b7cc4', hemiInt: 1.05, fog: '#251f44', fogNear: 55, fogFar: 430, cloud: '#5b5a8a', stars: 1,
    stone: '#a7a9b8', exposure: 1.25, lavaGlow: 1.7, moon: true,
  },
};

