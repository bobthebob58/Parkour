/* =====================================================================
   SKYHØJ PARKOUR
   Et 3D-parkourspil i skyerne. Three.js (grafik) + cannon-es (fysik).

   Indhold:
     1.  Konfiguration og konstanter
     2.  Danske tekster
     3.  Himmel-temaer (et pr. bane)
     4.  De 10 baner (hårdkodede segmentlister)
     5.  Hjælpefunktioner
     6.  Procedurelle teksturer og materialer
     7.  Renderer, scene, himmel, skyer, lava og lys
     8.  Fysikverden
     9.  Banebygger (segmenter -> platforme, ankre, mønter, portal)
     10. Baneobjekter i drift (bevægelige, smuldrende, vindmøller ...)
     11. Spilleren (krop, figur, animation, bevægelse)
     12. Input (tastatur og mus)
     13. Kamera
     14. Evner (kridt og reb)
     15. Lyd (procedurel WebAudio)
     16. Brugerflade (HUD, menuer, butik)
     17. Gem / indlæs
     18. Spiltilstand og hovedløkke
   ===================================================================== */
(() => {
'use strict';

const THREE = window.THREE;
const CANNON = window.CANNON;

/* =====================================================================
   1. KONFIGURATION
   ===================================================================== */
const CFG = {
  fixedDt: 1 / 120,          // fysik-tidsskridt (120 Hz giver stram kollision på små platforme)
  maxSteps: 8,               // maks. fysikskridt pr. frame (beskytter mod "spiral of death")
  gravity: 24,               // m/s² – kraftigere end jordens for et snappy parkour-feel
  lavaY: -50,                // lavaens overflade
  deathY: -49.2,             // spillerens fødder rører lavaen her
  player: {
    radius: 0.42,            // kollisionskugle ved fødderne
    upperRadius: 0.36,       // kollisionskugle ved overkroppen
    upperOffset: 0.8,
    mass: 70,
  },
  move: {
    speed: 9,                // løbehastighed m/s
    groundAccel: 80,         // acceleration på jorden (ganges med greb)
    groundDecel: 62,         // opbremsning på jorden (ganges med greb)
    airAccel: 26,            // luftkontrol
    airDrag: 0.6,            // let luftmodstand når man slipper tasterne
    jumpVel: 10.5,           // hop-hastighed -> ca. 2,3 m højt
    coyote: 0.11,            // man kan stadig hoppe kort efter at have forladt en kant
    jumpBuffer: 0.14,        // et hop trykket lige før landing tæller stadig
    jumpCut: 0.5,            // slipper man mellemrum tidligt, bliver hoppet lavere
    maxFall: 42,
  },
  grip: { normal: 1, ice: 0.11 },
  chalk: { duration: 5, cooldown: 10, cooldownUpgraded: 5, jumpMul: 1.3, gripMul: 4, gripMax: 1.5 },
  rope: {
    range: 32,
    rangeUpgraded: 45,
    reel: 7,                 // så hurtigt hales man ind, mens venstreklik holdes (m/s)
    minLength: 2.4,
    swingAccel: 13,          // "pump" med WASD mens man svinger
    maxSpeed: 30,
    releaseBoost: 6.5,       // ekstra opdrift når man slipper med mellemrum
    assistAngle: THREE.MathUtils.degToRad(9), // sigtehjælp mod krogpunkter
  },
  bounceDefault: 18,
  coinValue: 5,
  camera: { dist: 7.2, height: 1.45, minPitch: -1.05, maxPitch: 1.3, sens: 0.0026, fov: 70 },
};

const SHOP_ITEMS = [
  {
    id: 'chalk', kind: 'EVNE', price: 60, icon: 'chalk',
    name: 'Kridt',
    desc: 'Venstreklik: 5 sekunder med markant bedre greb og 30 % højere hop. Uundværligt på glatis.',
  },
  {
    id: 'rope', kind: 'EVNE', price: 150, icon: 'rope',
    name: 'Reb (entrehage)',
    desc: 'Skyd rebet mod en platform eller et lysende krogpunkt og sving dig over store huller. Hold venstreklik for at hale dig ind, tryk mellemrum for at hoppe af.',
  },
  {
    id: 'chalkbag', kind: 'OPGRADERING', price: 100, icon: 'bag', requires: 'chalk',
    name: 'Kridtpose',
    desc: 'Kridtet genoplades dobbelt så hurtigt (5 s i stedet for 10 s).',
  },
  {
    id: 'longrope', kind: 'OPGRADERING', price: 160, icon: 'longrope', requires: 'rope',
    name: 'Langt reb',
    desc: 'Rebets rækkevidde øges fra 32 m til 45 m.',
  },
];

/* =====================================================================
   2. DANSKE TEKSTER
   ===================================================================== */
const T = {
  abilityNames: { none: 'Ingen', chalk: 'Kridt', rope: 'Reb' },
  abilityReady: 'Klar – venstreklik',
  abilityNone: 'Ingen evne valgt',
  chalkActive: (s) => `Aktiv: ${s.toFixed(1)} s`,
  cooldown: (s) => `Genoplader: ${s.toFixed(1)} s`,
  ropeAttached: 'Hold venstreklik: hal ind · Mellemrum: hop af',
  ropeAim: 'Sigt på en platform eller et krogpunkt',
  ropeTarget: 'Mål fundet – venstreklik!',
  toastChalk: 'Kridt på hænderne! Bedre greb og højere hop',
  toastChalkCd: (s) => `Kridtet genoplades … ${s.toFixed(1)} s`,
  toastRopeNoTarget: 'Intet mål inden for rækkevidde',
  toastRopeHook: 'Rebet sidder fast!',
  toastNoAbility: 'Ingen evne valgt – køb evner i butikken (B)',
  toastDeath: 'Du faldt i lavaen! Banen starter forfra.',
  toastCoin: (n) => `+${n} mønter`,
  toastRestart: 'Banen er genstartet',
  toastNeedRope: 'Denne bane kræver rebet! Tryk B for at åbne butikken.',
  toastRopeHint: 'Tip: Vælg rebet (scroll), sigt på det lysende krogpunkt og venstreklik. Sving med W, hop af med mellemrum.',
  toastSound: (on) => (on ? 'Lyd: til' : 'Lyd: fra'),
  toastBought: (name) => `Du købte: ${name}`,
  toastEquip: (name) => `Valgt evne: ${name}`,
  shopBuy: 'Køb',
  shopOwned: 'Ejet ✓',
  shopMissing: (n) => `Mangler ${n}`,
  shopRequires: (name) => `Kræver: ${name}`,
  soundBtn: (on) => `Lyd: ${on ? 'Til' : 'Fra'}`,
  continueBtn: (n) => `Fortsæt – bane ${n}`,
  replayBtn: 'Spil igen fra bane 1',
  tipChalk: 'Tip: Kridt (60 mønter) gør det meget lettere at holde balancen på glatis.',
  tipRope: 'Tip: Fra bane 8 er rebet (150 mønter) nødvendigt for at krydse de store huller.',
  tipRopeOwned: 'Næste bane har enorme huller – husk at vælge rebet med scrollhjulet.',
  tipFinal: 'Sidste bane! Små platforme, gigantiske huller og ingen nåde. Held og lykke.',
  levelBanner: (n) => `BANE ${n}`,
  allLevels: 'Alle baner gennemført!',
};

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

/* =====================================================================
   4. DE 10 BANER
   Hver bane er en liste af segmenter, som banebyggeren (afsnit 9)
   omsætter til platforme. Felter:
     t     : type – 'start' | 'p' (sten) | 'ice' | 'move' | 'crumble' |
             'bounce' | 'spin' | 'finish' | 'anchor' (krogpunkt) | 'coin'
     g     : hul (kant til kant) fra forrige platform i meter
     w, d  : bredde (på tværs) og dybde (langs banen); shape:'cyl' = rund
     dy    : højdeforskel på topfladen i forhold til forrige platform
     x     : sideforskydning i forhold til forrige platforms midte
     turn  : drej banens retning (grader, + = højre) før placering
     yaw   : ekstra visuel rotation af platformen (grader)
     move  : ax ('x' = på tværs, 'z' = langs banen, 'y' = op/ned), amp, per, ph
     spin  : spd (rad/s), cross (to arme)
     bounce: pow (affyringsfart m/s)
     anchor/coin: at (meter ud fra forrige kant), y (højde over forrige top), x
     coin  : true -> mønt over platformen
     rope  : true -> hullet foran platformen kræver rebet
   ===================================================================== */
const LEVELS = [
  // ------------------------------------------------------------------ 1
  {
    name: 'Første skridt', theme: 'morning', reward: 25,
    segs: [
      { t: 'start', w: 12, d: 12 },
      { g: 2.5, w: 8, d: 8 },
      { g: 3, w: 8, d: 8, dy: 0.5, coin: true },
      { g: 3, w: 7, d: 9, x: 2 },
      { t: 'coin', at: 1.75, y: 2.2 },
      { g: 3.5, w: 8, d: 8, dy: 0.5 },
      { turn: 90, g: 3, w: 8, d: 8 },
      { g: 3, w: 6, d: 10, dy: -0.5, coin: true },
      { g: 3, w: 8, d: 8, dy: 1 },
      { g: 3.5, w: 8, shape: 'cyl' },
      { turn: -90, g: 3, w: 9, d: 9, coin: true },
      { g: 3, w: 7, d: 7, dy: 0.5, x: -2 },
      { g: 3.5, w: 7, d: 7, dy: 0.5, x: 2 },
      { g: 3, w: 8, d: 8, dy: 1, coin: true },
      { turn: -45, g: 3, w: 6, d: 12 },
      { g: 3, w: 8, d: 8, dy: -1 },
      { turn: 45, g: 3.5, w: 8, shape: 'cyl' },
      { g: 3, w: 7, d: 7, dy: 1, coin: true },
      { t: 'finish', g: 3, w: 12, d: 12 },
    ],
  },
  // ------------------------------------------------------------------ 2
  {
    name: 'Himmeltrappen', theme: 'day', reward: 40,
    segs: [
      { t: 'start', w: 12, d: 12 },
      { g: 3, w: 6, d: 6, dy: 1 },
      { g: 3, w: 5, shape: 'cyl', dy: 1 },
      { g: 3.5, w: 5, shape: 'cyl', dy: 1, coin: true },
      { g: 3, w: 5, shape: 'cyl', dy: 1.2 },
      { g: 3.5, w: 6, d: 6, dy: 1.2 },
      { turn: 60, g: 3.5, w: 5, d: 8 },
      { g: 4, w: 5, d: 5, dy: -1 },
      { t: 'coin', at: 2, y: 1.6 },
      { g: 4, w: 5, d: 5, dy: -1.5 },
      { g: 4, w: 5, d: 5, dy: -1.5, coin: true },
      { turn: -60, g: 3.5, w: 6, d: 6 },
      { g: 3, w: 4, d: 4, dy: 1.4, x: 1.5 },
      { g: 3, w: 4, d: 4, dy: 1.4, x: -3 },
      { g: 3, w: 4, d: 4, dy: 1.4, x: 3, coin: true },
      { g: 3, w: 4, d: 4, dy: 1.4, x: -3 },
      { g: 3.5, w: 6, d: 6, dy: 0.5, x: 1.5 },
      { turn: 90, g: 4, w: 5, shape: 'cyl' },
      { g: 4.5, w: 5, shape: 'cyl', dy: -1, coin: true },
      { g: 4, w: 5, shape: 'cyl', dy: 0.5 },
      { g: 4, w: 4, d: 10 },
      { turn: -45, g: 4, w: 5, d: 5, dy: 1 },
      { t: 'coin', at: 2.25, y: 2.0 },
      { g: 4.5, w: 5, d: 5 },
      { g: 4, w: 5, d: 5, dy: -2, coin: true },
      { t: 'finish', g: 4, w: 12, d: 12 },
    ],
  },
  // ------------------------------------------------------------------ 3
  {
    name: 'Springfjedre', theme: 'day', reward: 55,
    segs: [
      { t: 'start', w: 12, d: 12 },
      { g: 3.5, w: 5, d: 5 },
      { t: 'bounce', g: 4, w: 4, d: 4, pow: 17 },
      { g: 3, w: 6, d: 6, dy: 5, coin: true },
      { g: 4, w: 4, d: 4 },
      { g: 4, w: 4, d: 4, dy: -1 },
      { t: 'bounce', turn: 90, g: 4, w: 4, d: 4, pow: 19 },
      { g: 3.5, w: 5, d: 5, dy: 6 },
      { t: 'coin', at: 2.25, y: 1.5 },
      { g: 4.5, w: 4, d: 4, dy: -1 },
      { g: 4, w: 4, d: 6, dy: -1, coin: true },
      { t: 'bounce', g: 4, w: 4, d: 4, pow: 17 },
      { g: 3, w: 5, d: 5, dy: 4.5 },
      { turn: -90, g: 4.5, w: 4, d: 4 },
      { g: 4.5, w: 4, d: 4, dy: 1, coin: true },
      { g: 4, w: 5, d: 5, dy: -3 },
      { t: 'bounce', g: 4, w: 4, d: 4, pow: 17 },
      { t: 'coin', at: 4, y: 5 },
      { g: 8, w: 5, d: 5 },
      { turn: 45, g: 4, w: 4, d: 4, dy: 1 },
      { g: 4.5, w: 4, d: 4, dy: 1, coin: true },
      { t: 'bounce', g: 4, w: 4, d: 4, pow: 19 },
      { g: 9, w: 5, d: 5, dy: 2 },
      { turn: -45, g: 4.5, w: 4, d: 4 },
      { g: 4.5, w: 4, d: 4, dy: 1 },
      { g: 5, w: 5, d: 5, coin: true },
      { t: 'finish', g: 4, w: 12, d: 12, dy: 1 },
    ],
  },
  // ------------------------------------------------------------------ 4
  {
    name: 'Glatis', theme: 'frost', reward: 70,
    segs: [
      { t: 'start', w: 10, d: 10 },
      { g: 3.5, w: 5, d: 5 },
      { t: 'ice', g: 4, w: 5, d: 7 },
      { t: 'ice', g: 4, w: 5, d: 5, coin: true },
      { g: 4, w: 4, d: 4, dy: 1 },
      { t: 'ice', g: 4, w: 4, d: 8, dy: -0.5 },
      { turn: 90, g: 4, w: 4, d: 4 },
      { t: 'ice', g: 4.5, w: 4, d: 4 },
      { t: 'ice', g: 4.5, w: 4, d: 4, dy: 1, coin: true },
      { g: 4, w: 3.5, d: 3.5, dy: 0.5 },
      { t: 'ice', g: 4, w: 4, d: 12 },
      { turn: -90, g: 4.5, w: 4, d: 4 },
      { t: 'ice', g: 4, w: 3.5, d: 3.5, yaw: 45 },
      { t: 'ice', g: 4.5, w: 3.5, d: 3.5, yaw: 45, dy: 1, coin: true },
      { t: 'bounce', g: 4.5, w: 4, d: 4, pow: 17 },
      { t: 'ice', g: 3, w: 5, d: 5, dy: 4.5 },
      { t: 'ice', turn: 60, g: 4.5, w: 4, d: 4 },
      { g: 5, w: 4, d: 4, dy: -1 },
      { t: 'coin', at: 2.25, y: 2 },
      { t: 'ice', g: 4.5, w: 3.5, d: 3.5 },
      { t: 'ice', g: 4.5, w: 3.5, d: 3.5, dy: 1 },
      { t: 'ice', turn: -60, g: 4.5, w: 4, d: 6 },
      { g: 5, w: 4, d: 4, dy: -1, coin: true },
      { t: 'ice', g: 4.5, w: 4, d: 4 },
      { g: 5, w: 4, d: 4, dy: 1 },
      { t: 'ice', g: 5, w: 4, d: 4, coin: true },
      { t: 'finish', g: 4.5, w: 10, d: 10 },
    ],
  },
  // ------------------------------------------------------------------ 5
  {
    name: 'I bevægelse', theme: 'afternoon', reward: 85,
    segs: [
      { t: 'start', w: 10, d: 10 },
      { g: 4, w: 4, d: 4 },
      { t: 'move', g: 4, w: 3, d: 3, ax: 'x', amp: 3, per: 4 },
      { t: 'move', g: 4, w: 3, d: 3, ax: 'x', amp: 3, per: 4, ph: 0.5 },
      { g: 4, w: 3.5, d: 3.5, dy: 1, coin: true },
      { t: 'move', g: 4.5, w: 3, d: 3, ax: 'z', amp: 1.5, per: 3.5 },
      { g: 4.5, w: 3, d: 3 },
      { t: 'move', turn: 90, g: 4, w: 3, d: 3, ax: 'y', amp: 2, per: 4 },
      { g: 4, w: 3, d: 3, dy: 2, coin: true },
      { t: 'move', g: 4.5, w: 2.5, d: 2.5, ax: 'x', amp: 4, per: 5 },
      { g: 4.5, w: 2.5, d: 2.5 },
      { t: 'move', g: 4.5, w: 2.5, d: 2.5, ax: 'x', amp: 2.5, per: 3.5 },
      { t: 'move', g: 4.5, w: 2.5, d: 2.5, ax: 'x', amp: 2.5, per: 3.5, ph: 0.5, coin: true },
      { turn: -90, g: 4.5, w: 3, d: 3, dy: 1 },
      { t: 'move', g: 4, w: 3, d: 8, ax: 'z', amp: 2, per: 5 },
      { g: 4.5, w: 2.5, d: 2.5, coin: true },
      { t: 'move', g: 5, w: 2.5, d: 2.5, ax: 'y', amp: 1.5, per: 3 },
      { g: 5, w: 2.5, d: 2.5, dy: 1 },
      { t: 'move', turn: 45, g: 5, w: 2.5, d: 2.5, ax: 'x', amp: 3, per: 4 },
      { t: 'move', g: 5, w: 2.5, d: 2.5, ax: 'x', amp: 3, per: 4, ph: 0.25, coin: true },
      { g: 5, w: 3, d: 3, dy: -1 },
      { t: 'move', turn: -45, g: 4, w: 3, d: 3, ax: 'z', amp: 1.5, per: 4 },
      { g: 5, w: 2.5, d: 2.5 },
      { t: 'move', g: 5, w: 2.5, d: 2.5, ax: 'y', amp: 2, per: 3.5 },
      { g: 5, w: 2.5, d: 2.5, dy: 1.5, coin: true },
      { t: 'move', g: 5, w: 3, d: 3, ax: 'x', amp: 3.5, per: 4.5 },
      { t: 'finish', g: 5, w: 10, d: 10 },
    ],
  },
  // ------------------------------------------------------------------ 6
  {
    name: 'Smuldrende sten', theme: 'golden', reward: 100,
    segs: [
      { t: 'start', w: 10, d: 10 },
      { t: 'crumble', g: 4, w: 3, d: 3 },
      { t: 'crumble', g: 4.5, w: 3, d: 3 },
      { t: 'crumble', g: 4.5, w: 3, d: 3, coin: true },
      { g: 4.5, w: 3.5, d: 3.5, dy: 1 },
      { t: 'crumble', g: 4.5, w: 3, d: 3, x: 2 },
      { t: 'crumble', g: 4.5, w: 3, d: 3, x: -4 },
      { t: 'crumble', g: 4.5, w: 3, d: 3, x: 4, coin: true },
      { t: 'move', turn: 90, g: 4.5, w: 3, d: 3, ax: 'x', amp: 3, per: 4 },
      { t: 'crumble', g: 4.5, w: 2.5, d: 2.5 },
      { t: 'crumble', g: 5, w: 2.5, d: 2.5, dy: 1 },
      { t: 'bounce', g: 5, w: 3, d: 3, pow: 18 },
      { t: 'crumble', g: 3, w: 3, d: 3, dy: 5 },
      { g: 5, w: 3, d: 3, dy: -1, coin: true },
      { t: 'crumble', turn: -90, g: 5, w: 2.5, d: 2.5 },
      { t: 'move', g: 5, w: 2.5, d: 2.5, ax: 'y', amp: 1.5, per: 3.5 },
      { t: 'crumble', g: 5, w: 2.5, d: 2.5, dy: 1 },
      { t: 'crumble', g: 5, w: 2.5, d: 2.5, dy: 1, coin: true },
      { t: 'ice', g: 5, w: 3, d: 3 },
      { t: 'crumble', g: 5, w: 2.5, d: 2.5 },
      { t: 'move', turn: 60, g: 5, w: 2.5, d: 2.5, ax: 'x', amp: 3, per: 4 },
      { t: 'crumble', g: 5, w: 2.5, d: 2.5 },
      { t: 'crumble', g: 5.5, w: 2.5, d: 2.5, dy: -1, coin: true },
      { t: 'move', g: 5, w: 2.5, d: 2.5, ax: 'z', amp: 1.5, per: 4 },
      { t: 'crumble', g: 5, w: 2.5, d: 2.5 },
      { t: 'crumble', turn: -60, g: 5, w: 2.5, d: 2.5, dy: 1 },
      { g: 5.5, w: 3, d: 3 },
      { t: 'anchor', at: 3, y: 8, x: 7 },
      { t: 'coin', at: 3, y: 4.5, x: 7 },
      { t: 'crumble', g: 5, w: 2.5, d: 2.5, coin: true },
      { t: 'finish', g: 5, w: 10, d: 10 },
    ],
  },
  // ------------------------------------------------------------------ 7
  {
    name: 'Vindmøllerne', theme: 'sunset', reward: 115,
    segs: [
      { t: 'start', w: 10, d: 10 },
      { t: 'spin', g: 4.5, w: 5, spd: 1.6 },
      { g: 5, w: 2.5, d: 2.5 },
      { t: 'spin', g: 5, w: 5, spd: -2 },
      { g: 5, w: 1.5, d: 8, coin: true },
      { g: 5, w: 2, d: 2, dy: 1 },
      { turn: 90, g: 5, w: 1.2, d: 10 },
      { t: 'spin', g: 5, w: 5, spd: 1.8, dy: 1 },
      { t: 'move', g: 5, w: 2.5, d: 2.5, ax: 'x', amp: 2.5, per: 4, coin: true },
      { t: 'bounce', g: 5, w: 3, d: 3, pow: 19 },
      { t: 'anchor', at: 5, y: 8 },
      { t: 'coin', at: 5, y: 4 },
      { g: 10, w: 4, d: 4 },
      { t: 'spin', turn: -90, g: 5, w: 5, spd: -2.4 },
      { g: 5, w: 2, d: 2, dy: 1, coin: true },
      { t: 'move', g: 5, w: 2, d: 2, ax: 'y', amp: 1.5, per: 3 },
      { g: 5, w: 2, d: 2, dy: 1.5 },
      { g: 5, w: 1.5, d: 8 },
      { t: 'spin', g: 5, w: 5.5, spd: 2, cross: true },
      { t: 'crumble', turn: 45, g: 5, w: 2, d: 2 },
      { t: 'crumble', g: 5, w: 2, d: 2, coin: true },
      { t: 'move', g: 5.5, w: 2.5, d: 2.5, ax: 'x', amp: 3, per: 4 },
      { g: 5, w: 2, d: 2, dy: 1 },
      { t: 'spin', turn: -45, g: 5, w: 5.5, spd: -2.2, cross: true },
      { t: 'ice', g: 5, w: 2, d: 2 },
      { g: 5.5, w: 2, d: 2, dy: -1, coin: true },
      { t: 'move', g: 5, w: 2, d: 2, ax: 'z', amp: 1.5, per: 3.5 },
      { t: 'finish', g: 5, w: 10, d: 10 },
    ],
  },
  // ------------------------------------------------------------------ 8
  {
    name: 'Rebets prøve', theme: 'dusk', reward: 130, needsRope: true,
    segs: [
      { t: 'start', w: 10, d: 10 },
      { g: 4.5, w: 3, d: 3 },
      { g: 5, w: 2.5, d: 2.5, dy: 1 },
      { g: 5, w: 4, d: 4, coin: true },
      { t: 'anchor', at: 7, y: 7 },
      { g: 14, w: 4, d: 4, rope: true },
      { t: 'move', g: 5, w: 2.5, d: 2.5, ax: 'x', amp: 3, per: 4 },
      { t: 'crumble', g: 5, w: 2.5, d: 2.5, coin: true },
      { turn: 90, g: 5, w: 4, d: 4 },
      { t: 'anchor', at: 8, y: 7.5 },
      { t: 'coin', at: 8, y: 2.5 },
      { g: 16, w: 4, d: 4, dy: 1, rope: true },
      { g: 5, w: 2, d: 2 },
      { g: 5, w: 2, d: 2, dy: 1, coin: true },
      { t: 'spin', g: 5, w: 5, spd: 2 },
      { t: 'move', g: 5, w: 2, d: 2, ax: 'y', amp: 1.5, per: 3 },
      { g: 5, w: 4, d: 4, dy: 1 },
      { t: 'anchor', at: 6, y: 7 },
      { t: 'anchor', at: 16, y: 7 },
      { g: 22, w: 4, d: 4, rope: true, coin: true },
      { t: 'ice', turn: -90, g: 5, w: 2.5, d: 2.5 },
      { t: 'crumble', g: 5, w: 2, d: 2 },
      { g: 5.5, w: 2, d: 2, dy: 1, coin: true },
      { t: 'move', turn: 45, g: 5, w: 2, d: 2, ax: 'x', amp: 3, per: 4.5 },
      { g: 5, w: 4, d: 4 },
      { t: 'anchor', at: 9, y: 8 },
      { g: 18, w: 4, d: 4, rope: true, coin: true },
      { g: 5, w: 2, d: 2 },
      { t: 'finish', g: 5, w: 10, d: 10 },
    ],
  },
  // ------------------------------------------------------------------ 9
  {
    name: 'Stormens øje', theme: 'storm', reward: 145, needsRope: true,
    segs: [
      { t: 'start', w: 9, d: 9 },
      { g: 5, w: 2, d: 2 },
      { t: 'crumble', g: 5.5, w: 2, d: 2, dy: 1 },
      { t: 'move', g: 5.5, w: 2, d: 2, ax: 'x', amp: 3, per: 4 },
      { t: 'ice', g: 5.5, w: 1.8, d: 1.8, dy: 1, coin: true },
      { t: 'spin', g: 5, w: 4.5, spd: 2.4, cross: true },
      { g: 5, w: 3, d: 3 },
      { t: 'anchor', at: 9, y: 8 },
      { g: 18, w: 3, d: 3, rope: true, coin: true },
      { t: 'crumble', turn: 90, g: 5.5, w: 2, d: 2 },
      { t: 'crumble', g: 5.5, w: 2, d: 2, dy: 1, coin: true },
      { t: 'move', g: 5.5, w: 2, d: 2, ax: 'y', amp: 2, per: 3.5 },
      { g: 5, w: 2, d: 2, dy: 2 },
      { t: 'ice', g: 5, w: 1.2, d: 9 },
      { t: 'bounce', g: 5.5, w: 2, d: 2, pow: 18 },
      { g: 3, w: 2.5, d: 2.5, dy: 5, coin: true },
      { turn: -90, g: 4, w: 3, d: 3 },
      { t: 'anchor', at: 10, y: 8, ax: 'x', amp: 4, per: 5 },
      { g: 20, w: 3, d: 3, rope: true },
      { t: 'move', g: 5.5, w: 1.8, d: 1.8, ax: 'z', amp: 1.5, per: 3.5 },
      { t: 'crumble', g: 5.5, w: 1.8, d: 1.8 },
      { t: 'crumble', g: 5.5, w: 1.8, d: 1.8, dy: 1, coin: true },
      { t: 'spin', g: 5, w: 4.5, spd: -2.6 },
      { t: 'ice', turn: 60, g: 5.5, w: 1.8, d: 1.8 },
      { g: 6, w: 1.8, d: 1.8, dy: -1 },
      { g: 5.5, w: 3, d: 3 },
      { t: 'anchor', at: 8, y: 7 },
      { t: 'anchor', at: 20, y: 7.5 },
      { g: 26, w: 3, d: 3, rope: true },
      { t: 'move', g: 5.5, w: 1.8, d: 1.8, ax: 'x', amp: 2.5, per: 3.5, coin: true },
      { g: 5.5, w: 1.8, d: 1.8, dy: 1 },
      { t: 'crumble', turn: -60, g: 5.5, w: 1.8, d: 1.8 },
      { t: 'move', g: 5.5, w: 1.8, d: 1.8, ax: 'y', amp: 2, per: 3.5 },
      { g: 5, w: 1.8, d: 1.8, dy: 1.5, coin: true },
      { t: 'finish', g: 5.5, w: 9, d: 9 },
    ],
  },
  // ------------------------------------------------------------------ 10
  {
    name: 'Himlens ende', theme: 'night', reward: 160, needsRope: true,
    segs: [
      { t: 'start', w: 8, d: 8 },
      { g: 5.5, w: 1.5, d: 1.5 },
      { g: 6, w: 1.4, d: 1.4, dy: 1 },
      { t: 'crumble', g: 6, w: 1.4, d: 1.4 },
      { t: 'move', g: 6, w: 1.3, d: 1.3, ax: 'x', amp: 2.5, per: 4 },
      { g: 6, w: 2.5, d: 2.5 },
      { t: 'anchor', at: 10, y: 8 },
      { g: 20, w: 2.5, d: 2.5, rope: true },
      { t: 'ice', g: 6, w: 1.3, d: 1.3, coin: true },
      { t: 'crumble', g: 6, w: 1.3, d: 1.3, dy: 1 },
      { t: 'move', g: 6, w: 1.2, d: 1.2, ax: 'y', amp: 2, per: 3.5 },
      { g: 5.5, w: 1.3, d: 1.3, dy: 1.5 },
      { t: 'ice', turn: 90, g: 6, w: 1.2, d: 10 },
      { t: 'spin', g: 6, w: 4, spd: 2.6, cross: true },
      { g: 6, w: 2.5, d: 2.5 },
      { t: 'anchor', at: 8, y: 8 },
      { t: 'anchor', at: 22, y: 8, ax: 'y', amp: 2, per: 4 },
      { g: 30, w: 2.5, d: 2.5, rope: true },
      { t: 'crumble', g: 6, w: 1.3, d: 1.3, coin: true },
      { t: 'move', g: 6, w: 1.3, d: 1.3, ax: 'z', amp: 1.5, per: 3 },
      { g: 6.5, w: 1.3, d: 1.3, dy: -1 },
      { t: 'bounce', g: 6, w: 1.3, d: 1.3, pow: 19 },
      { t: 'crumble', g: 4, w: 1.6, d: 1.6, dy: 6 },
      { t: 'ice', turn: -90, g: 6, w: 1.3, d: 1.3 },
      { t: 'crumble', g: 6, w: 1.2, d: 1.2, dy: 1 },
      { g: 6, w: 2.5, d: 2.5 },
      { t: 'anchor', at: 12, y: 9, ax: 'x', amp: 4, per: 5 },
      { g: 24, w: 2, d: 2, rope: true },
      { t: 'move', g: 6, w: 1.2, d: 1.2, ax: 'x', amp: 2.5, per: 4, coin: true },
      { t: 'crumble', g: 6, w: 1.2, d: 1.2 },
      { t: 'ice', g: 6.5, w: 1.2, d: 1.2, dy: -1 },
      { t: 'spin', g: 6, w: 4.5, spd: -2.2, cross: true },
      { t: 'move', g: 6, w: 1.2, d: 1.2, ax: 'y', amp: 2, per: 3.5 },
      { g: 5.5, w: 1.2, d: 1.2, dy: 1.5 },
      { turn: 45, g: 6, w: 2.5, d: 2.5 },
      { t: 'anchor', at: 9, y: 9 },
      { t: 'anchor', at: 25, y: 10 },
      { g: 34, w: 2.5, d: 2.5, rope: true, coin: true },
      { t: 'crumble', g: 6, w: 1.2, d: 1.2 },
      { t: 'crumble', g: 6, w: 1.2, d: 1.2, dy: 1 },
      { t: 'move', g: 6, w: 1.2, d: 1.2, ax: 'x', amp: 2.5, per: 4 },
      { t: 'ice', g: 6.5, w: 1.2, d: 1.2, dy: -1 },
      { t: 'move', g: 6, w: 1.2, d: 1.2, ax: 'z', amp: 1.5, per: 3.5, coin: true },
      { turn: -45, g: 6, w: 2.5, d: 2.5, dy: 1 },
      { t: 'anchor', at: 8, y: 9 },
      { t: 'anchor', at: 20, y: 9.5, ax: 'x', amp: 3, per: 5 },
      { t: 'anchor', at: 32, y: 9 },
      { g: 40, w: 3, d: 3, rope: true },
      { t: 'crumble', g: 6, w: 1.2, d: 1.2 },
      { t: 'crumble', g: 6, w: 1.2, d: 1.2, dy: 1 },
      { t: 'move', g: 6, w: 1.2, d: 1.2, ax: 'y', amp: 2, per: 3 },
      { g: 5.5, w: 1.2, d: 1.2, dy: 1.5, coin: true },
      { t: 'spin', g: 6, w: 4.5, spd: 2.2, cross: true },
      { t: 'finish', g: 6, w: 8, d: 8 },
    ],
  },
];

/* =====================================================================
   5. HJÆLPEFUNKTIONER
   ===================================================================== */
const DEG = Math.PI / 180;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
function angleDamp(a, b, lambda, dt) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * (1 - Math.exp(-lambda * dt));
}
function mulberry32(seed) {
  return function rng() {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function formatTime(sec) {
  const s = Math.max(0, Math.floor(sec));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
const $ = (id) => document.getElementById(id);

// Gem/hent sikkert (localStorage kan være blokeret i private vinduer)
const storage = {
  get(key) { try { return window.localStorage.getItem(key); } catch (e) { return null; } },
  set(key, val) { try { window.localStorage.setItem(key, val); } catch (e) { /* ignoreres */ } },
  remove(key) { try { window.localStorage.removeItem(key); } catch (e) { /* ignoreres */ } },
};

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
  MAT.rope = std({ color: '#c8a46a', roughness: 0.85 });
  MAT.hook = std({ color: '#9aa4b2', roughness: 0.3, metalness: 1 });
  MAT.portalRing = std({ color: '#7cf0ff', roughness: 0.2, metalness: 0.6, emissive: '#36c8ff', emissiveIntensity: 2.2 });
  MAT.signWood = std({ color: '#6b4a2b', roughness: 0.85 });
}

/* =====================================================================
   7. RENDERER, SCENE, HIMMEL, SKYER, LAVA OG LYS
   ===================================================================== */
const canvas = $('game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
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
    for (int i = 0; i < 5; i++) { v += a * noise(p); p = r * p * 2.03; a *= 0.5; }
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
    vec3 crust = vec3(0.07, 0.016, 0.006) * (0.7 + 0.6 * fbm(p * 7.0));
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

let currentTheme = null;
function applyTheme(theme) {
  currentTheme = theme;
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
  for (const m of cloudMats) m.color.set(theme.cloud);
  MAT.stoneTop.color.set(theme.stone);
  MAT.rock.color.set(theme.stone).lerp(new THREE.Color('#ffffff'), 0.25);
  if (envRT) envRT.dispose();
  envRT = pmrem.fromScene(envScene, 0.035);
  scene.environment = envRT.texture;
}

/* =====================================================================
   8. FYSIKVERDEN (cannon-es)
   ===================================================================== */
const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -CFG.gravity, 0) });
world.broadphase = new CANNON.SAPBroadphase(world);
world.allowSleep = false;
world.solver.iterations = 12;
world.solver.tolerance = 0.0001;
world.defaultContactMaterial.friction = 0;
world.defaultContactMaterial.restitution = 0;
const MAT_PLAYER = new CANNON.Material('player');
const MAT_WORLD = new CANNON.Material('world');
// Friktion 0: spillerens greb styres af bevægelseskoden (afsnit 11), så is/kridt kan justere det præcist.
world.addContactMaterial(new CANNON.ContactMaterial(MAT_PLAYER, MAT_WORLD, {
  friction: 0, restitution: 0, contactEquationStiffness: 1e8, contactEquationRelaxation: 3,
}));
const G_PLAYER = 1, G_STATIC = 2, G_KINEMATIC = 4;

/* =====================================================================
   9. BANEBYGGER
   Omsætter segmentlisterne til konkrete positioner (ren data, ingen grafik),
   så banerne også kan valideres automatisk.
   ===================================================================== */
const fwdVec = (h) => ({ x: Math.sin(h), z: -Math.cos(h) });   // heading 0 = mod -Z
const rightVec = (h) => ({ x: Math.cos(h), z: Math.sin(h) });

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

function buildLevelData(def) {
  const plats = [], anchors = [], coins = [];
  let heading = 0, prev = null;
  for (const s of def.segs) {
    const t = s.t || 'p';
    if (t === 'anchor' || t === 'coin') {
      const f = fwdVec(heading), r = rightVec(heading);
      const e = footprintSupport(prev, f.x, f.z), lat = s.x || 0;
      const item = {
        x: prev.x + f.x * (e + s.at) + r.x * lat,
        y: prev.top + s.y,
        z: prev.z + f.z * (e + s.at) + r.z * lat,
        move: s.ax ? makeMove(s, heading) : null,
      };
      (t === 'anchor' ? anchors : coins).push(item);
      continue;
    }
    if (s.turn) heading += s.turn * DEG;
    const shape = t === 'spin' ? 'cyl' : (s.shape || 'box');
    const w = s.w ?? 4;
    const p = {
      type: t, shape, w, d: shape === 'cyl' ? w : (s.d ?? w),
      yaw: heading + (s.yaw || 0) * DEG, heading, index: plats.length,
      gap: s.g ?? 3, rope: !!s.rope,
    };
    if (!prev) { p.x = 0; p.z = 0; p.top = 0; }
    else {
      const f = fwdVec(heading), r = rightVec(heading);
      const dist = footprintSupport(prev, f.x, f.z) + p.gap + footprintSupport(p, f.x, f.z);
      p.x = prev.x + f.x * dist + r.x * (s.x || 0);
      p.z = prev.z + f.z * dist + r.z * (s.x || 0);
      p.top = prev.top + (s.dy || 0);
    }
    p.h = s.h || (t === 'start' || t === 'finish' ? 2.4 : clamp(Math.min(p.w, p.d) * 0.4, 0.7, 1.6));
    if (t === 'move') p.move = makeMove(s, heading);
    if (t === 'spin') { p.spd = s.spd ?? 2; p.cross = !!s.cross; p.bar = s.bar ?? p.w * 0.94; }
    if (t === 'bounce') p.pow = s.pow ?? CFG.bounceDefault;
    plats.push(p);
    if (s.coin) coins.push({ x: p.x, y: p.top + 1.3, z: p.z, plat: p.index });
    prev = p;
  }
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of plats) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
  }
  const bounds = {
    cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2,
    radius: Math.hypot(maxX - minX, maxZ - minZ) / 2 + 20,
  };
  return { plats, anchors, coins, startHeading: plats[1] ? plats[1].heading : 0, bounds };
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

/* =====================================================================
   10. BANEOBJEKTER I DRIFT
   ===================================================================== */
const PORTAL_FRAG = /* glsl */`
  uniform float uTime; uniform vec3 uColA; uniform vec3 uColB;
  varying vec2 vUv;
  void main() {
    vec2 c = vUv - 0.5;
    float r = length(c) * 2.0;
    float a = atan(c.y, c.x);
    float sw = sin(a * 5.0 + r * 11.0 - uTime * 4.5) * 0.5 + 0.5;
    float sw2 = sin(a * 3.0 - r * 7.0 + uTime * 3.0) * 0.5 + 0.5;
    vec3 col = mix(uColA, uColB, sw * 0.7 + sw2 * 0.3) * (0.7 + 1.6 * (1.0 - r));
    float alpha = smoothstep(1.0, 0.82, r) * (0.55 + 0.45 * sw);
    gl_FragColor = vec4(col * 1.6, alpha);
  }`;

class Level {
  constructor(index) {
    this.index = index;
    this.def = LEVELS[index];
    this.data = buildLevelData(this.def);
    this.group = new THREE.Group();
    this.platforms = [];
    this.anchors = [];
    this.coins = [];
    this.rayMeshes = [];      // kamera-kollision og reb-sigte
    this.disposables = [];
    this.time = 0;
    this.bodyToPlat = new Map();
    this.build();
    scene.add(this.group);
  }

  geo(g) { this.disposables.push(g); return g; }

  build() {
    const rng = mulberry32(1000 + this.index * 77);
    for (const p of this.data.plats) this.buildPlatform(p, rng);
    for (const a of this.data.anchors) this.buildAnchor(a);
    for (const c of this.data.coins) this.buildCoin(c);
    this.buildStartDecor();
    this.buildPortal();
  }

  buildPlatform(p, rng) {
    const plat = {
      def: p, type: p.type, mesh: null, body: null, grip: p.type === 'ice' ? CFG.grip.ice : CFG.grip.normal,
      base: new CANNON.Vec3(p.x, p.top - p.h / 2, p.z), state: 'solid', timer: 0, fallVel: 0,
      squash: 0, coins: [],
    };
    const yawQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -p.yaw);
    let top, side, bottom, tile = 3, tileTop = true, sideTile = 3;
    switch (p.type) {
      case 'ice': top = MAT.iceTop; side = MAT.iceSide; bottom = MAT.iceSide; break;
      case 'crumble': top = MAT.crumble; side = MAT.crumble; bottom = MAT.crumble; tile = 2.5; sideTile = 2.5; break;
      case 'move': top = MAT.metalTop; side = MAT.metalSide; bottom = MAT.metalSide; tileTop = false; sideTile = p.h; break;
      case 'bounce': top = MAT.bounceTop; side = MAT.bounceSide; bottom = MAT.bounceSide; tileTop = false; break;
      default: top = MAT.stoneTop; side = MAT.rock; bottom = MAT.rock;
    }
    const mesh = new THREE.Group();
    let main;
    if (p.shape === 'cyl') {
      main = new THREE.Mesh(this.geo(cylGeometry(p.w / 2, p.h, tile, { tileTop })), [side, top, bottom]);
    } else {
      main = new THREE.Mesh(this.geo(boxGeometry(p.w, p.h, p.d, tile, { tileTop, sideTile })), [side, side, top, bottom, side, side]);
    }
    main.castShadow = true;
    main.receiveShadow = true;
    main.userData.plat = plat;
    mesh.add(main);
    this.rayMeshes.push(main);
    plat.main = main;

    // Pynt under platformen
    const minDim = Math.min(p.w, p.d);
    if ((p.type === 'p' || p.type === 'start' || p.type === 'finish' || p.type === 'ice' || p.type === 'spin') && minDim >= 2.4) {
      const r = minDim * 0.5;
      const depth = clamp(minDim * 1.2, 2, 10);
      const rock = new THREE.Mesh(this.geo(rockGeometry(r, depth, Math.floor(rng() * 1e6))), p.type === 'ice' ? MAT.iceSide : MAT.rock);
      rock.position.y = -p.h / 2 - depth / 2 + 0.02;
      if (p.shape !== 'cyl') rock.scale.set((p.w / minDim) * 0.97, 1, (p.d / minDim) * 0.97);
      rock.castShadow = true;
      mesh.add(rock);
    }
    if (p.type === 'move') { // antigrav-glød under bevægelige platforme
      const glow = new THREE.Mesh(this.geo(new THREE.PlaneGeometry(1, 1)), new THREE.MeshBasicMaterial({
        map: TEX.glow, color: '#59d8ff', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      }));
      glow.rotation.x = Math.PI / 2;
      glow.scale.set(p.w * 1.3, p.d * 1.3, 1);
      glow.position.y = -p.h / 2 - 0.15;
      mesh.add(glow);
      this.disposables.push(glow.material);
    }
    if (p.type === 'spin') {
      const hub = new THREE.Mesh(this.geo(new THREE.CylinderGeometry(0.22, 0.3, 0.8, 16)), MAT.hub);
      hub.position.y = p.h / 2 + 0.4;
      hub.castShadow = true;
      mesh.add(hub);
    }

    mesh.position.set(p.x, p.top - p.h / 2, p.z);
    mesh.quaternion.copy(yawQ);
    this.group.add(mesh);
    plat.mesh = mesh;

    // Fysik
    const body = new CANNON.Body({
      mass: 0,
      type: p.type === 'move' ? CANNON.Body.KINEMATIC : CANNON.Body.STATIC,
      material: MAT_WORLD,
      collisionFilterGroup: p.type === 'move' ? G_KINEMATIC : G_STATIC,
      collisionFilterMask: G_PLAYER,
    });
    if (p.shape === 'cyl') body.addShape(new CANNON.Cylinder(p.w / 2, p.w / 2, p.h, 20));
    else body.addShape(new CANNON.Box(new CANNON.Vec3(p.w / 2, p.h / 2, p.d / 2)));
    body.position.copy(plat.base);
    body.quaternion.setFromEuler(0, -p.yaw, 0);
    world.addBody(body);
    plat.body = body;
    this.bodyToPlat.set(body.id, plat);

    // Vindmøllearm(e)
    if (p.type === 'spin') {
      const armGroup = new THREE.Group();
      const barBody = new CANNON.Body({
        mass: 0, type: CANNON.Body.KINEMATIC, material: MAT_WORLD,
        collisionFilterGroup: G_KINEMATIC, collisionFilterMask: G_PLAYER,
      });
      const arms = p.cross ? 2 : 1;
      for (let i = 0; i < arms; i++) {
        const bar = new THREE.Mesh(this.geo(boxGeometry(p.bar, 0.36, 0.45, 2)), MAT.stripes);
        bar.rotation.y = (i * Math.PI) / 2;
        bar.castShadow = true;
        armGroup.add(bar);
        const q = new CANNON.Quaternion().setFromEuler(0, (i * Math.PI) / 2, 0);
        barBody.addShape(new CANNON.Box(new CANNON.Vec3(p.bar / 2, 0.18, 0.225)), new CANNON.Vec3(), q);
      }
      barBody.position.set(p.x, p.top + 0.5, p.z);
      barBody.angularVelocity.set(0, p.spd, 0);
      world.addBody(barBody);
      armGroup.position.set(p.x, p.top + 0.5, p.z);
      this.group.add(armGroup);
      plat.bar = { body: barBody, mesh: armGroup };
      this.bodyToPlat.set(barBody.id, { type: 'bar', parent: plat, body: barBody });
    }
    this.platforms.push(plat);
  }

  buildAnchor(a) {
    const group = new THREE.Group();
    const ring = new THREE.Mesh(this.geo(new THREE.TorusGeometry(0.55, 0.11, 12, 32)), MAT.anchor);
    group.add(ring);
    const inner = new THREE.Mesh(this.geo(new THREE.SphereGeometry(0.18, 16, 12)), MAT.anchor);
    group.add(inner);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: TEX.glow, color: '#ffc23a', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.8,
    }));
    glow.scale.set(3.2, 3.2, 1);
    group.add(glow);
    this.disposables.push(glow.material);
    group.position.set(a.x, a.y, a.z);
    this.group.add(group);
    this.anchors.push({ def: a, mesh: group, ring, glow, pos: new THREE.Vector3(a.x, a.y, a.z), vel: new THREE.Vector3(), highlight: 0 });
  }

  buildCoin(c) {
    const group = new THREE.Group();
    const coin = new THREE.Mesh(this.geo(new THREE.CylinderGeometry(0.42, 0.42, 0.09, 28)), MAT.coin);
    coin.rotation.x = Math.PI / 2;
    coin.castShadow = true;
    group.add(coin);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: TEX.glow, color: '#ffd76a', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.55,
    }));
    glow.scale.set(1.8, 1.8, 1);
    group.add(glow);
    this.disposables.push(glow.material);
    const obj = { def: c, mesh: group, collected: false, plat: c.plat !== undefined ? this.platforms[c.plat] : null, pos: new THREE.Vector3(c.x, c.y, c.z), spin: Math.random() * 6 };
    if (obj.plat) obj.offset = new THREE.Vector3(c.x - obj.plat.base.x, c.y - obj.plat.base.y, c.z - obj.plat.base.z);
    group.position.copy(obj.pos);
    this.group.add(group);
    this.coins.push(obj);
  }

  buildStartDecor() {
    const p = this.data.plats[0];
    const f = fwdVec(p.heading), r = rightVec(p.heading);
    // "START" malet på platformen
    const startTex = textTexture(['START'], { w: 1024, h: 256, color: 'rgba(255,255,255,0.85)', sizes: [190] });
    this.disposables.push(startTex);
    const decal = new THREE.Mesh(this.geo(new THREE.PlaneGeometry(p.w * 0.7, p.w * 0.175)), new THREE.MeshStandardMaterial({
      map: startTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, roughness: 0.9,
    }));
    this.disposables.push(decal.material);
    decal.rotation.set(-Math.PI / 2, 0, -p.yaw);
    decal.position.set(p.x + f.x * (p.d * 0.22), p.top + 0.01, p.z + f.z * (p.d * 0.22));
    decal.receiveShadow = true;
    this.group.add(decal);

    // Skilt med banenummer og navn
    const signTex = textTexture([`BANE ${this.index + 1}`, this.def.name], {
      w: 1024, h: 512, bg: '#1a2238', color: '#ffffff', sizes: [120, 92],
    });
    this.disposables.push(signTex);
    const sign = new THREE.Group();
    const board = new THREE.Mesh(this.geo(new THREE.BoxGeometry(3.4, 1.7, 0.12)), [
      MAT.signWood, MAT.signWood, MAT.signWood, MAT.signWood,
      new THREE.MeshStandardMaterial({ color: '#6b4a2b', roughness: 0.85 }),
      new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.6, emissive: '#ffffff', emissiveMap: signTex, emissiveIntensity: 0.25 }),
    ]);
    this.disposables.push(board.material[4], board.material[5]);
    board.position.y = 2.3;
    board.castShadow = true;
    sign.add(board);
    for (const sx of [-1.3, 1.3]) {
      const post = new THREE.Mesh(this.geo(new THREE.BoxGeometry(0.14, 2.3, 0.14)), MAT.signWood);
      post.position.set(sx, 1.15, 0.0);
      post.castShadow = true;
      sign.add(post);
    }
    // Skiltet står foran til venstre og vender mod spilleren
    const lateral = -(p.w / 2 - 1.9), ahead = p.d / 2 - 1.2;
    sign.position.set(p.x + f.x * ahead + r.x * lateral, p.top, p.z + f.z * ahead + r.z * lateral);
    sign.rotation.y = -p.yaw + Math.PI;
    sign.rotation.y += 0.35;
    this.group.add(sign);
  }

  buildPortal() {
    const p = this.data.plats[this.data.plats.length - 1];
    const group = new THREE.Group();
    const R = 2.1;
    const ring = new THREE.Mesh(this.geo(new THREE.TorusGeometry(R, 0.2, 16, 64)), MAT.portalRing);
    ring.castShadow = true;
    group.add(ring);
    const arcs = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const arc = new THREE.Mesh(this.geo(new THREE.TorusGeometry(R + 0.42, 0.07, 8, 32, 1.4)), MAT.anchor);
      arc.rotation.z = (i * Math.PI * 2) / 3;
      arcs.add(arc);
    }
    group.add(arcs);
    const diskMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uColA: { value: new THREE.Color('#2bb8ff') }, uColB: { value: new THREE.Color('#c86bff') } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: PORTAL_FRAG,
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    });
    this.disposables.push(diskMat);
    const disk = new THREE.Mesh(this.geo(new THREE.CircleGeometry(R, 48)), diskMat);
    group.add(disk);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: TEX.glow, color: '#6fd8ff', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.7,
    }));
    glow.scale.set(9, 9, 1);
    this.disposables.push(glow.material);
    group.add(glow);
    // Partikler der kredser om portalen
    const N = 90, pos = new Float32Array(N * 3);
    const prng = mulberry32(5);
    for (let i = 0; i < N; i++) {
      const a = prng() * Math.PI * 2, rr = R * (0.6 + prng() * 0.9);
      pos[i * 3] = Math.cos(a) * rr; pos[i * 3 + 1] = Math.sin(a) * rr; pos[i * 3 + 2] = (prng() - 0.5) * 1.2;
    }
    const pg = this.geo(new THREE.BufferGeometry());
    pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pm = new THREE.PointsMaterial({ color: '#bff3ff', size: 0.12, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    this.disposables.push(pm);
    const sparks = new THREE.Points(pg, pm);
    group.add(sparks);
    const light = new THREE.PointLight('#5fd0ff', 40, 22, 2);
    group.add(light);
    group.position.set(p.x, p.top + R + 0.35, p.z);
    group.rotation.y = -p.yaw;
    this.group.add(group);
    // Lysende cirkel på gulvet
    const floor = new THREE.Mesh(this.geo(new THREE.RingGeometry(R * 0.9, R * 1.25, 48)), new THREE.MeshBasicMaterial({
      color: '#59d8ff', transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending,
      polygonOffset: true, polygonOffsetFactor: -2,
    }));
    this.disposables.push(floor.material);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(p.x, p.top + 0.02, p.z);
    this.group.add(floor);
    this.portal = { group, ring, arcs, disk, diskMat, sparks, glow, light, floor, center: new THREE.Vector3(p.x, p.top + R + 0.35, p.z), top: p.top };
  }

  get spawn() {
    const p = this.data.plats[0];
    const f = fwdVec(p.heading);
    return new THREE.Vector3(p.x - f.x * (p.d * 0.15), p.top + CFG.player.radius + 0.05, p.z - f.z * (p.d * 0.15));
  }

  reset() {
    this.time = 0;
    for (const plat of this.platforms) {
      if (plat.type === 'move') {
        const o = moveOffset(plat.def.move, 0, { x: 0, y: 0, z: 0 });
        plat.body.position.set(plat.base.x + o.x, plat.base.y + o.y, plat.base.z + o.z);
        plat.body.velocity.set(0, 0, 0);
      }
      if (plat.type === 'crumble' && plat.state !== 'solid') this.restoreCrumble(plat);
      if (plat.bar) {
        plat.bar.body.quaternion.set(0, 0, 0, 1);
        plat.bar.body.angularVelocity.set(0, plat.def.spd, 0);
      }
    }
    for (const c of this.coins) { c.collected = false; c.mesh.visible = true; c.mesh.scale.setScalar(1); }
    this.fixedUpdate(0);
    this.update(0, 0);
  }

  restoreCrumble(plat) {
    plat.state = 'solid';
    plat.timer = 0;
    plat.fallVel = 0;
    if (!plat.body.world) world.addBody(plat.body);
    plat.mesh.position.set(plat.base.x, plat.base.y, plat.base.z);
    plat.mesh.rotation.set(0, -plat.def.yaw, 0);
    plat.mesh.visible = true;
    plat.mesh.scale.setScalar(1);
  }

  triggerCrumble(plat) {
    if (plat.state !== 'solid') return;
    plat.state = 'shaking';
    plat.timer = 0.55;
    audio.play('crack');
  }

  anchorPos(a, t, outPos, outVel) {
    outPos.set(a.def.x, a.def.y, a.def.z);
    outVel.set(0, 0, 0);
    if (a.def.move) {
      const o = moveOffset(a.def.move, t, { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 });
      outPos.x += o.x; outPos.y += o.y; outPos.z += o.z;
      outVel.set(o.vx, o.vy, o.vz);
    }
  }

  // Kaldes før hvert fysikskridt
  fixedUpdate(dt) {
    this.time += dt;
    const t = this.time;
    const o = { x: 0, y: 0, z: 0 };
    for (const plat of this.platforms) {
      if (plat.type === 'move') {
        moveOffset(plat.def.move, t, o);
        const tx = plat.base.x + o.x, ty = plat.base.y + o.y, tz = plat.base.z + o.z;
        if (dt > 0) plat.body.velocity.set((tx - plat.body.position.x) / dt, (ty - plat.body.position.y) / dt, (tz - plat.body.position.z) / dt);
        else plat.body.position.set(tx, ty, tz);
      } else if (plat.type === 'crumble' && plat.state !== 'solid') {
        plat.timer -= dt;
        if (plat.state === 'shaking' && plat.timer <= 0) {
          plat.state = 'falling';
          plat.timer = 3.2;
          world.removeBody(plat.body);
          if (abilities.rope && abilities.rope.plat === plat) releaseRope(false);
        } else if (plat.state === 'falling' && plat.timer <= 0) {
          // Kommer kun tilbage, hvis spilleren ikke står i vejen
          const pb = player.body.position;
          const near = Math.abs(pb.x - plat.base.x) < plat.def.w / 2 + 1 && Math.abs(pb.z - plat.base.z) < plat.def.d / 2 + 1 &&
            Math.abs(pb.y - plat.def.top) < 2.5;
          if (!near) this.restoreCrumble(plat);
          else plat.timer = 0.3;
        }
      }
    }
    for (const a of this.anchors) this.anchorPos(a, t, a.pos, a.vel);
  }

  // Kaldes hver frame (grafik)
  update(dt, elapsed) {
    for (const plat of this.platforms) {
      if (plat.type === 'move') {
        plat.mesh.position.copy(plat.body.position);
      } else if (plat.type === 'crumble') {
        if (plat.state === 'shaking') {
          const k = 0.06 * (1 - plat.timer / 0.55 + 0.3);
          plat.mesh.position.set(plat.base.x + (Math.random() - 0.5) * k, plat.base.y + (Math.random() - 0.5) * k * 0.5, plat.base.z + (Math.random() - 0.5) * k);
        } else if (plat.state === 'falling') {
          plat.fallVel += 22 * dt;
          plat.mesh.position.y -= plat.fallVel * dt;
          plat.mesh.rotation.x += dt * 0.7;
          plat.mesh.rotation.z += dt * 0.4;
          if (plat.mesh.position.y < CFG.lavaY - 5) plat.mesh.visible = false;
        }
      } else if (plat.type === 'bounce' && plat.squash > 0) {
        plat.squash = Math.max(0, plat.squash - dt * 4);
        const s = 1 - Math.sin(plat.squash * Math.PI) * 0.35;
        plat.mesh.scale.set(1 + (1 - s) * 0.3, s, 1 + (1 - s) * 0.3);
      }
      if (plat.bar) {
        plat.bar.mesh.position.copy(plat.bar.body.position);
        plat.bar.mesh.quaternion.copy(plat.bar.body.quaternion);
      }
    }
    for (const a of this.anchors) {
      a.mesh.position.copy(a.pos);
      a.ring.rotation.y = elapsed * 1.6;
      a.ring.rotation.x = Math.sin(elapsed * 0.8) * 0.4;
      const target = a === abilities.target?.anchor ? 1 : 0;
      a.highlight = damp(a.highlight, target, 12, dt);
      const pulse = 1 + Math.sin(elapsed * 4) * 0.06;
      a.mesh.scale.setScalar(pulse * (1 + a.highlight * 0.35));
      a.glow.material.opacity = 0.65 + a.highlight * 0.35;
    }
    for (const c of this.coins) {
      if (c.collected) {
        if (c.mesh.visible) {
          c.pop = (c.pop || 0) + dt * 5;
          c.mesh.scale.setScalar(Math.max(0, 1 - c.pop));
          c.mesh.position.y += dt * 4;
          if (c.pop >= 1) c.mesh.visible = false;
        }
        continue;
      }
      if (c.plat) {
        c.pos.copy(c.plat.mesh.position).add(c.offset);
        if (c.plat.state === 'falling') c.pos.y = c.plat.mesh.position.y + c.offset.y;
      }
      c.mesh.position.copy(c.pos);
      c.mesh.position.y += Math.sin(elapsed * 2.2 + c.spin) * 0.12;
      c.mesh.rotation.y = elapsed * 2.4 + c.spin;
    }
    if (this.portal) {
      const P = this.portal;
      P.diskMat.uniforms.uTime.value = elapsed;
      P.arcs.rotation.z = elapsed * 1.2;
      P.ring.rotation.z = -elapsed * 0.4;
      P.sparks.rotation.z = elapsed * 0.7;
      const pulse = 1 + Math.sin(elapsed * 3) * 0.05;
      P.glow.scale.set(9 * pulse, 9 * pulse, 1);
      P.light.intensity = 36 + Math.sin(elapsed * 5) * 8;
    }
  }

  dispose() {
    for (const plat of this.platforms) {
      if (plat.body.world) world.removeBody(plat.body);
      if (plat.bar) world.removeBody(plat.bar.body);
    }
    scene.remove(this.group);
    for (const d of this.disposables) d.dispose();
  }
}

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
const particles = new Particles(900);

const player = {
  body: null, model: null, blob: null,
  grounded: false, wasGrounded: false, groundPlat: null, groundVel: new THREE.Vector3(),
  coyote: 0, jumpBuffer: 0, jumpCooldown: 0, jumping: false, knockCooldown: 0,
  facing: 0, runPhase: 0, squash: 0, lastVy: 0, stepTimer: 0,
  deathPos: new CANNON.Vec3(),
};

// Parkourløberen bygges af simple former (ingen eksterne modeller)
function buildCharacter() {
  const M = (c, r = 0.7, m = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
  const skin = M('#efc19c', 0.6), hoodie = M('#e4472d', 0.78), pants = M('#26334d', 0.85);
  const shoe = M('#f4f4f4', 0.5), sole = M('#1f1f1f', 0.8), hair = M('#3b2a1d', 0.9);
  const band = M('#ffcf33', 0.55), eye = M('#111111', 0.3), stripe = M('#ffffff', 0.7);
  const handMat = M('#efc19c', 0.6); // egen kopi, så kridtet kan gøre hænderne hvide
  const root = new THREE.Group();
  const inner = new THREE.Group();
  inner.position.y = -CFG.player.radius;
  root.add(inner);
  const torsoG = new THREE.Group();
  inner.add(torsoG);
  const add = (parent, geo, mat, x, y, z) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    parent.add(m);
    return m;
  };
  add(torsoG, new THREE.CapsuleGeometry(0.25, 0.4, 6, 14), hoodie, 0, 1.13, 0).scale.set(1, 1, 0.72);
  add(torsoG, new THREE.BoxGeometry(0.06, 0.3, 0.02), stripe, 0.12, 1.2, -0.185);
  add(torsoG, new THREE.CylinderGeometry(0.235, 0.245, 0.13, 16), pants, 0, 0.84, 0).scale.z = 0.76;
  const head = new THREE.Group();
  head.position.set(0, 1.6, 0);
  torsoG.add(head);
  add(head, new THREE.SphereGeometry(0.2, 20, 16), skin, 0, 0, 0);
  add(head, new THREE.SphereGeometry(0.212, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.52), hair, 0, 0.025, 0.015);
  add(head, new THREE.TorusGeometry(0.205, 0.028, 8, 28), band, 0, 0.055, 0).rotation.x = Math.PI / 2;
  add(head, new THREE.SphereGeometry(0.028, 8, 8), eye, -0.07, 0.0, -0.182);
  add(head, new THREE.SphereGeometry(0.028, 8, 8), eye, 0.07, 0.0, -0.182);
  const hands = [];
  const arm = (side) => {
    const g = new THREE.Group();
    g.position.set(0.33 * side, 1.37, 0);
    torsoG.add(g);
    add(g, new THREE.CapsuleGeometry(0.075, 0.42, 4, 10), hoodie, 0, -0.27, 0);
    hands.push(add(g, new THREE.SphereGeometry(0.078, 12, 10), handMat, 0, -0.57, 0));
    return g;
  };
  const leg = (side) => {
    const g = new THREE.Group();
    g.position.set(0.12 * side, 0.84, 0);
    torsoG.add(g);
    add(g, new THREE.CapsuleGeometry(0.095, 0.56, 4, 10), pants, 0, -0.38, 0);
    add(g, new THREE.BoxGeometry(0.17, 0.11, 0.3), shoe, 0, -0.78, -0.05);
    add(g, new THREE.BoxGeometry(0.176, 0.03, 0.31), sole, 0, -0.835, -0.05);
    return g;
  };
  const armL = arm(-1), armR = arm(1), legL = leg(-1), legR = leg(1);
  return { root, inner, torsoG, head, armL, armR, legL, legR, hands, handMat };
}

function createPlayer() {
  const b = new CANNON.Body({
    mass: CFG.player.mass, material: MAT_PLAYER, fixedRotation: true, linearDamping: 0, angularDamping: 1,
    collisionFilterGroup: G_PLAYER, collisionFilterMask: G_STATIC | G_KINEMATIC,
  });
  b.addShape(new CANNON.Sphere(CFG.player.radius));
  b.addShape(new CANNON.Sphere(CFG.player.upperRadius), new CANNON.Vec3(0, CFG.player.upperOffset, 0));
  b.updateMassProperties();
  world.addBody(b);
  player.body = b;
  player.model = buildCharacter();
  scene.add(player.model.root);
  player.blob = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), new THREE.MeshBasicMaterial({
    map: TEX.blob, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4,
  }));
  player.blob.rotation.x = -Math.PI / 2;
  player.blob.renderOrder = 2;
  scene.add(player.blob);
}

function respawnPlayer() {
  const s = level.spawn, b = player.body;
  b.position.set(s.x, s.y, s.z);
  b.previousPosition.copy(b.position);
  b.velocity.set(0, 0, 0);
  Object.assign(player, {
    grounded: false, wasGrounded: false, groundPlat: null, coyote: 0, jumpBuffer: 0,
    jumpCooldown: 0, jumping: false, knockCooldown: 0, squash: 0, lastVy: 0,
  });
  player.groundVel.set(0, 0, 0);
  player.facing = -level.data.startHeading;
  player.model.root.visible = true;
  cam.target.set(s.x, s.y + CFG.camera.height - CFG.player.radius, s.z);
}

// Ønsket bevægelsesretning ud fra WASD og kameraets retning
const wish = new THREE.Vector3();
function readWish() {
  const k = input.keys;
  const fwd = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0);
  const side = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);
  const sy = Math.sin(cam.yaw), cy = Math.cos(cam.yaw);
  wish.set(-sy * fwd + cy * side, 0, -cy * fwd - sy * side);
  if (wish.lengthSq() > 1) wish.normalize();
  return wish;
}

function currentGrip() {
  const base = player.groundPlat && player.groundPlat.grip !== undefined ? player.groundPlat.grip : CFG.grip.normal;
  return abilities.chalkActive > 0 ? Math.min(base * CFG.chalk.gripMul, CFG.chalk.gripMax) : base;
}

// Kører før hvert fysikskridt: løb, luftkontrol, hop og reb
function playerControl(dt) {
  const b = player.body, v = b.velocity, M = CFG.move;
  player.coyote -= dt;
  player.jumpBuffer -= dt;
  player.jumpCooldown -= dt;
  player.knockCooldown -= dt;
  const w = readWish();
  const hasInput = w.x !== 0 || w.z !== 0;

  if (abilities.rope) {
    // svinger i rebet: luftkontrol håndteres i applyRope
  } else if (player.grounded) {
    const gv = player.groundVel;
    const tx = w.x * M.speed + gv.x, tz = w.z * M.speed + gv.z;
    let dx = tx - v.x, dz = tz - v.z;
    const len = Math.hypot(dx, dz);
    const maxD = (hasInput ? M.groundAccel : M.groundDecel) * currentGrip() * dt;
    if (len > maxD) { dx *= maxD / len; dz *= maxD / len; }
    v.x += dx; v.z += dz;
  } else if (hasInput) {
    // Luftkontrol: farten langs input-retningen bevares (momentum fra reb og springpuder),
    // mens sidelæns drift kan styres væk – stramt, men stadig med fart.
    const along = v.x * w.x + v.z * w.z;
    let px = v.x - w.x * along, pz = v.z - w.z * along;
    const add = M.speed - along;
    const a = add > 0 ? Math.min(add, M.airAccel * dt) : 0;
    const perp = Math.hypot(px, pz), cut = M.airAccel * 0.7 * dt;
    const k = perp > cut ? (perp - cut) / perp : 0;
    px *= k; pz *= k;
    v.x = w.x * (along + a) + px;
    v.z = w.z * (along + a) + pz;
  } else {
    const k = Math.max(0, 1 - M.airDrag * dt);
    v.x *= k; v.z *= k;
  }

  // Hop (kun fra jorden eller lige efter kanten – ingen uendelige hop)
  if (player.jumpBuffer > 0 && (player.grounded || player.coyote > 0) && player.jumpCooldown <= 0 && !abilities.rope) {
    const mul = abilities.chalkActive > 0 ? CFG.chalk.jumpMul : 1;
    v.y = M.jumpVel * mul + Math.max(0, player.groundVel.y);
    player.grounded = false;
    player.coyote = 0;
    player.jumpBuffer = 0;
    player.jumpCooldown = 0.12;
    player.jumping = true;
    audio.play('jump');
    const p = b.position;
    particles.burst(p.x, p.y - CFG.player.radius + 0.05, p.z, 6, { color: '#d9d2c4', speed: 2, up: 0.3, size: 0.3, life: 0.5, grav: 0 });
    if (abilities.chalkActive > 0) emitChalk(8);
  }
  // Variabel hophøjde
  if (player.jumping && !input.keys.Space && v.y > 0) {
    v.y *= M.jumpCut;
    player.jumping = false;
  }
  if (v.y <= 0) player.jumping = false;

  if (abilities.rope) applyRope(dt, w);
  if (v.y < -M.maxFall) v.y = -M.maxFall;
}

// Kører efter hvert fysikskridt: jordkontakt, springpuder, smuldren, lava, mønter og portal
const _r = new CANNON.Vec3(), _w = new CANNON.Vec3();
function postStep(dt, playing) {
  const b = player.body;
  const prevVy = player.lastVy;
  player.wasGrounded = player.grounded;
  let grounded = false, gInfo = null, gBody = null, bestY = 0.5;
  for (const c of world.contacts) {
    let other, nx, ny, nz, r;
    if (c.bi === b) { other = c.bj; nx = -c.ni.x; ny = -c.ni.y; nz = -c.ni.z; r = c.rj; }
    else if (c.bj === b) { other = c.bi; nx = c.ni.x; ny = c.ni.y; nz = c.ni.z; r = c.ri; }
    else continue;
    const info = level.bodyToPlat.get(other.id);
    if (!info) continue;
    if (info.type === 'bar' && ny < 0.6) {
      if (playing) knockback(other, nx, nz, r);
      continue;
    }
    if (ny > bestY) { bestY = ny; grounded = true; gInfo = info; gBody = other; _r.copy(r); }
  }
  if (player.jumpCooldown > 0) grounded = false;
  player.grounded = grounded;
  player.groundPlat = grounded ? (gInfo.type === 'bar' ? gInfo.parent : gInfo) : null;
  if (grounded) {
    // Underlagets hastighed i kontaktpunktet (v + ω × r) – så man følger med bevægelige platforme
    gBody.angularVelocity.cross(_r, _w);
    player.groundVel.set(gBody.velocity.x + _w.x, gBody.velocity.y + _w.y, gBody.velocity.z + _w.z);
    player.coyote = CFG.move.coyote;
  } else {
    player.groundVel.multiplyScalar(0.98);
  }
  player.lastVy = b.velocity.y;

  if (!playing) return;
  if (grounded && !player.wasGrounded) onLand(prevVy);
  if (grounded) {
    const plat = player.groundPlat;
    if (plat.type === 'bounce') {
      b.velocity.y = plat.def.pow;
      player.grounded = false;
      player.jumpCooldown = 0.15;
      player.jumping = false;
      plat.squash = 1;
      audio.play('bounce');
      particles.burst(b.position.x, b.position.y - 0.3, b.position.z, 14, { color: '#c8ff6a', speed: 4, up: 0.6, size: 0.25, life: 0.6, grav: 6 });
    } else if (plat.type === 'crumble' && plat.state === 'solid') {
      level.triggerCrumble(plat);
      particles.burst(b.position.x, b.position.y - 0.4, b.position.z, 10, { color: '#c49a62', speed: 2.5, up: 0.4, size: 0.22, life: 0.7, grav: 8 });
    }
  }

  // Lava!
  if (b.position.y - CFG.player.radius < CFG.deathY) { die(); return; }

  // Mønter
  const px = b.position.x, py = b.position.y + 0.5, pz = b.position.z;
  for (const c of level.coins) {
    if (c.collected) continue;
    const dx = c.mesh.position.x - px, dy = c.mesh.position.y - py, dz = c.mesh.position.z - pz;
    if (dx * dx + dy * dy + dz * dz < 1.35 * 1.35) collectCoin(c);
  }

  // Portal
  const P = level.portal;
  if (Math.hypot(px - P.center.x, pz - P.center.z) < 1.7 && b.position.y > P.top - 0.6 && b.position.y < P.top + 4.6) enterPortal();
}

function onLand(vy) {
  if (vy < -5) {
    player.squash = clamp(-vy / 30, 0.12, 0.45);
    audio.play('land', clamp(-vy / 25, 0.2, 1));
    const p = player.body.position;
    particles.burst(p.x, p.y - CFG.player.radius + 0.05, p.z, Math.floor(clamp(-vy, 4, 14)), {
      color: player.groundPlat && player.groundPlat.type === 'ice' ? '#e6f7ff' : '#d8cfbf', speed: 2.6, up: 0.25, size: 0.3, life: 0.55, grav: 0, drag: 3,
    });
  }
}

function knockback(barBody, nx, nz, r) {
  if (player.knockCooldown > 0) return;
  const w = barBody.angularVelocity.y;
  const tvx = w * r.z, tvz = -w * r.x; // armens fart i kontaktpunktet
  const v = player.body.velocity;
  v.x = tvx * 1.25 + nx * 4.5;
  v.z = tvz * 1.25 + nz * 4.5;
  v.y = Math.max(v.y, 5.5);
  player.knockCooldown = 0.5;
  player.jumpCooldown = 0.12;
  cam.shake = 0.35;
  audio.play('hit');
}

function collectCoin(c) {
  c.collected = true;
  c.pop = 0;
  game.levelCoins += CFG.coinValue;
  audio.play('coin');
  particles.burst(c.mesh.position.x, c.mesh.position.y, c.mesh.position.z, 16, { color: '#ffd84a', speed: 3.5, up: 0.8, size: 0.2, life: 0.6, grav: 3 });
  toast(T.toastCoin(CFG.coinValue), 'gold', 1100);
}

function emitChalk(n) {
  const v = new THREE.Vector3();
  for (const h of player.model.hands) {
    h.getWorldPosition(v);
    particles.burst(v.x, v.y, v.z, n, { color: '#ffffff', speed: 1.2, up: 0.4, size: 0.16, life: 0.9, grav: -0.4, drag: 2, spread: 0.1 });
  }
}

// Animation af figuren (kører hver frame)
const _bp = new THREE.Vector3(), _down = new THREE.Vector3(0, -1, 0), _blobRay = new THREE.Raycaster();
function updatePlayerVisual(dt, elapsed) {
  const m = player.model, b = player.body;
  m.root.position.set(b.position.x, b.position.y, b.position.z);
  const relX = b.velocity.x - player.groundVel.x, relZ = b.velocity.z - player.groundVel.z;
  const sp = Math.hypot(relX, relZ);
  if (sp > 0.7) player.facing = angleDamp(player.facing, Math.atan2(-relX, -relZ), 14, dt);
  else if (game.state === 'playing' && (wish.x || wish.z)) player.facing = angleDamp(player.facing, Math.atan2(-wish.x, -wish.z), 10, dt);
  m.inner.rotation.y = player.facing;

  const blend = player.grounded ? clamp(sp / CFG.move.speed, 0, 1) : 0;
  let lL, lR, aL, aR, aLz = 0.1, aRz = -0.1, lean;
  if (abilities.rope) {
    aR = 2.95; aL = 2.7; aLz = -0.15; aRz = 0.15;
    const sw = Math.sin(elapsed * 3) * 0.25;
    lL = 0.35 + sw; lR = 0.1 - sw; lean = 0;
  } else if (player.grounded) {
    player.runPhase += dt * (3 + sp * 1.3);
    const s = Math.sin(player.runPhase);
    lL = s * 0.95 * blend; lR = -s * 0.95 * blend;
    aL = -s * 0.85 * blend; aR = s * 0.85 * blend;
    lean = 0.2 * blend;
    if (blend < 0.05) { aL = Math.sin(elapsed * 1.6) * 0.04; aR = -aL; }
    // fodtrin
    if (blend > 0.3 && game.state === 'playing') {
      player.stepTimer -= dt * (sp / 4);
      if (player.stepTimer <= 0) { player.stepTimer = 1; audio.play('step'); }
    }
  } else {
    const up = clamp(b.velocity.y / 10, -1, 1);
    lL = 0.75 - up * 0.2; lR = -0.35 + up * 0.25;
    aL = 0.4 + up * 0.9; aR = 0.2 + up * 0.7;
    aLz = 0.6; aRz = -0.6;
    lean = 0.08;
  }
  const k = 16;
  m.legL.rotation.x = damp(m.legL.rotation.x, lL, k, dt);
  m.legR.rotation.x = damp(m.legR.rotation.x, lR, k, dt);
  m.armL.rotation.x = damp(m.armL.rotation.x, aL, k, dt);
  m.armR.rotation.x = damp(m.armR.rotation.x, aR, k, dt);
  m.armL.rotation.z = damp(m.armL.rotation.z, -aLz, k, dt);
  m.armR.rotation.z = damp(m.armR.rotation.z, -aRz, k, dt);
  m.torsoG.rotation.x = damp(m.torsoG.rotation.x, -lean, 10, dt);
  player.squash = Math.max(0, player.squash - dt * 3.2);
  const sq = player.squash;
  m.inner.scale.set(1 + sq * 0.25, 1 - sq * 0.35, 1 + sq * 0.25);
  m.inner.position.y = -CFG.player.radius + Math.abs(Math.sin(player.runPhase)) * 0.06 * blend;

  // Kridt gør hænderne hvide
  const chalkT = abilities.chalkActive > 0 ? 1 : 0;
  m.handMat.color.lerp(chalkT ? new THREE.Color('#ffffff') : new THREE.Color('#efc19c'), 1 - Math.exp(-8 * dt));
  if (chalkT && Math.random() < dt * 14) emitChalk(1);

  // Rund skygge lige under spilleren (hjælper med at ramme landingen)
  _bp.set(b.position.x, b.position.y, b.position.z);
  _blobRay.set(_bp, _down);
  _blobRay.far = 60;
  const hits = _blobRay.intersectObjects(level.rayMeshes, false);
  if (hits.length && m.root.visible) {
    const h = hits[0];
    const height = h.distance - CFG.player.radius;
    player.blob.visible = true;
    player.blob.position.set(h.point.x, h.point.y + 0.03, h.point.z);
    const s = clamp(1 - height / 25, 0.35, 1);
    player.blob.scale.set(s, s, s);
    player.blob.material.opacity = clamp(1 - height / 30, 0.25, 0.9);
  } else {
    player.blob.visible = false;
  }
}

/* =====================================================================
   12. INPUT
   ===================================================================== */
const input = { keys: Object.create(null), rightHeld: false, leftHeld: false, lastWheel: 0 };
const GAME_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Digit1', 'Digit2', 'Digit3']);

function setLooking(on) {
  document.body.classList.toggle('looking', on);
}
function releasePointer() {
  input.rightHeld = false;
  input.leftHeld = false;
  setLooking(false);
  if (document.pointerLockElement) document.exitPointerLock();
}

window.addEventListener('keydown', (e) => {
  if (game.state === 'playing' && GAME_KEYS.has(e.code)) e.preventDefault();
  audio.init();
  const wasDown = input.keys[e.code];
  input.keys[e.code] = true;
  if (!e.repeat && !wasDown) onKeyPress(e.code);
});
window.addEventListener('keyup', (e) => { input.keys[e.code] = false; });
window.addEventListener('blur', () => { input.keys = Object.create(null); releasePointer(); });

function onKeyPress(code) {
  const s = game.state;
  if (s === 'playing') {
    switch (code) {
      case 'Space':
        if (abilities.rope) releaseRope(true);
        else player.jumpBuffer = CFG.move.jumpBuffer;
        break;
      case 'Digit1': selectAbility('none'); break;
      case 'Digit2': selectAbility('chalk'); break;
      case 'Digit3': selectAbility('rope'); break;
      case 'KeyB': openShop('playing'); break;
      case 'KeyP': case 'Escape': pauseGame(); break;
      case 'KeyR': restartLevel(true); break;
      case 'KeyM': toggleSound(); break;
      case 'KeyH': $('help-hint').classList.toggle('hidden'); break;
      default: break;
    }
  } else if (s === 'paused') {
    if (code === 'KeyP' || code === 'Escape') resumeGame();
    else if (code === 'KeyB') openShop('paused');
  } else if (s === 'shop') {
    if (code === 'Escape' || code === 'KeyB') closeShop();
  } else if (s === 'complete') {
    if (code === 'Enter') nextLevel();
  }
}

canvas.addEventListener('mousedown', (e) => {
  audio.init();
  if (game.state !== 'playing') return;
  if (e.button === 0) {
    const hadRope = !!abilities.rope;
    useAbility();
    input.leftHeld = !hadRope && !!abilities.rope; // samme klik: hold for at hale ind
  } else if (e.button === 2) {
    input.rightHeld = true;
    setLooking(true);
    try {
      const r = canvas.requestPointerLock();
      if (r && typeof r.catch === 'function') r.catch(() => {});
    } catch (err) { /* uden pointer lock bruges musens bevægelse direkte */ }
  }
});
window.addEventListener('mouseup', (e) => {
  if (e.button === 0) input.leftHeld = false;
  if (e.button === 2) releasePointer();
});
window.addEventListener('mousemove', (e) => {
  if (game.state !== 'playing') return;
  if (!input.rightHeld && document.pointerLockElement !== canvas) return;
  cam.yaw -= e.movementX * CFG.camera.sens;
  cam.pitch = clamp(cam.pitch + e.movementY * CFG.camera.sens, CFG.camera.minPitch, CFG.camera.maxPitch);
});
window.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  if (game.state !== 'playing') return;
  const now = performance.now();
  if (now - input.lastWheel < 110) return;
  input.lastWheel = now;
  cycleAbility(e.deltaY > 0 ? 1 : -1);
}, { passive: false });

/* =====================================================================
   13. KAMERA (tredjeperson, roteres med højreklik)
   ===================================================================== */
const cam = { yaw: 0, pitch: 0.32, target: new THREE.Vector3(), curDist: CFG.camera.dist, shake: 0 };
const _camRay = new THREE.Raycaster(), _camDir = new THREE.Vector3();

function updateCamera(dt) {
  const k = input.keys;
  if (game.state === 'playing') {
    if (k.KeyQ) cam.yaw += 2.2 * dt;
    if (k.KeyE) cam.yaw -= 2.2 * dt;
  }
  const b = player.body.position;
  const ty = Math.max(b.y + CFG.camera.height - CFG.player.radius, CFG.lavaY + 9);
  cam.target.x = damp(cam.target.x, b.x, 22, dt);
  cam.target.y = damp(cam.target.y, ty, 12, dt);
  cam.target.z = damp(cam.target.z, b.z, 22, dt);
  const cp = Math.cos(cam.pitch);
  _camDir.set(Math.sin(cam.yaw) * cp, Math.sin(cam.pitch), Math.cos(cam.yaw) * cp);
  let want = CFG.camera.dist;
  _camRay.set(cam.target, _camDir);
  _camRay.far = want;
  const hits = _camRay.intersectObjects(level.rayMeshes, false);
  if (hits.length) want = Math.max(1.1, hits[0].distance - 0.35);
  cam.curDist = want < cam.curDist ? want : damp(cam.curDist, want, 4, dt);
  camera.position.copy(cam.target).addScaledVector(_camDir, cam.curDist);
  camera.lookAt(cam.target);
  if (cam.shake > 0) {
    cam.shake = Math.max(0, cam.shake - dt);
    const s = cam.shake * 0.25;
    camera.position.x += (Math.random() - 0.5) * s;
    camera.position.y += (Math.random() - 0.5) * s;
  }
}

// Langsom panorering i hovedmenuen
function updateMenuCamera(elapsed) {
  const s = level.spawn;
  const h = level.data.startHeading, f = fwdVec(h);
  const a = -h + Math.sin(elapsed * 0.08) * 0.9 + 0.6;
  camera.position.set(s.x + Math.sin(a) * 15, s.y + 6 + Math.sin(elapsed * 0.25) * 1.2, s.z + Math.cos(a) * 15);
  camera.lookAt(s.x + f.x * 12, s.y + 1, s.z + f.z * 12);
}

/* =====================================================================
   14. EVNER: KRIDT OG REB
   ===================================================================== */
const SLOT_ORDER = ['none', 'chalk', 'rope'];
const abilities = {
  owned: { chalk: false, rope: false, chalkbag: false, longrope: false },
  selected: 'none',
  chalkActive: 0,
  chalkCooldown: 0,
  rope: null,
  target: null,
  ropeShoot: 1,
};

function availableAbilities() { return SLOT_ORDER.filter((id) => id === 'none' || abilities.owned[id]); }

function selectAbility(id) {
  if (id !== 'none' && !abilities.owned[id]) {
    toast(`${T.abilityNames[id]} er låst – køb den i butikken (B)`, 'bad', 1800);
    audio.play('deny');
    return;
  }
  if (abilities.selected === id) return;
  abilities.selected = id;
  audio.play('click');
  renderHotbar();
}

function cycleAbility(dir) {
  const list = availableAbilities();
  if (list.length < 2) { toast(T.toastNoAbility, '', 1800); return; }
  const i = list.indexOf(abilities.selected);
  selectAbility(list[(i + dir + list.length) % list.length]);
}

function useAbility() {
  switch (abilities.selected) {
    case 'chalk': useChalk(); break;
    case 'rope': if (abilities.rope) releaseRope(false); else fireRope(); break;
    default: toast(T.toastNoAbility, '', 1800); break;
  }
}

function chalkTotalCooldown() {
  return CFG.chalk.duration + (abilities.owned.chalkbag ? CFG.chalk.cooldownUpgraded : CFG.chalk.cooldown);
}

function useChalk() {
  if (abilities.chalkCooldown > 0) {
    toast(T.toastChalkCd(abilities.chalkCooldown), 'bad', 1400);
    audio.play('deny');
    return;
  }
  abilities.chalkActive = CFG.chalk.duration;
  abilities.chalkCooldown = chalkTotalCooldown();
  audio.play('chalk');
  emitChalk(26);
  toast(T.toastChalk, 'good', 2200);
}

const ropeRange = () => (abilities.owned.longrope ? CFG.rope.rangeUpgraded : CFG.rope.range);
const _aimDir = new THREE.Vector3(), _aimTmp = new THREE.Vector3(), _chest = new THREE.Vector3(), _aimRay = new THREE.Raycaster();

// Sigte: krogpunkter tæt på sigtekornet foretrækkes (sigtehjælp), ellers rammes platforme direkte
function findRopeTarget() {
  const b = player.body.position;
  const range = ropeRange();
  _chest.set(b.x, b.y + 0.8, b.z);
  camera.getWorldDirection(_aimDir);
  const origin = camera.position;
  let best = null, bestAng = CFG.rope.assistAngle;
  for (const a of level.anchors) {
    if (a.pos.distanceTo(_chest) > range) continue;
    const ang = _aimTmp.copy(a.pos).sub(origin).angleTo(_aimDir);
    if (ang < bestAng) { bestAng = ang; best = a; }
  }
  if (best) return { anchor: best, plat: null, point: best.pos.clone() };
  const tStart = Math.max(0, _aimTmp.copy(_chest).sub(origin).dot(_aimDir));
  _aimRay.set(_aimTmp.copy(origin).addScaledVector(_aimDir, tStart), _aimDir);
  _aimRay.far = range + 8;
  const hits = _aimRay.intersectObjects(level.rayMeshes, false);
  for (const h of hits) {
    const plat = h.object.userData.plat;
    if (!plat || plat.state === 'falling') continue;
    if (h.point.distanceTo(_chest) > range) break;
    return { anchor: null, plat, point: h.point.clone() };
  }
  return null;
}

function fireRope() {
  const t = findRopeTarget();
  if (!t) {
    toast(T.toastRopeNoTarget, 'bad', 1400);
    audio.play('deny');
    return;
  }
  const b = player.body.position;
  const len = Math.hypot(b.x - t.point.x, b.y + 0.8 - t.point.y, b.z - t.point.z);
  abilities.rope = {
    anchor: t.anchor, plat: t.plat, point: t.point.clone(), vel: new THREE.Vector3(), length: len,
    local: t.plat ? new THREE.Vector3(t.point.x - t.plat.body.position.x, t.point.y - t.plat.body.position.y, t.point.z - t.plat.body.position.z) : null,
  };
  abilities.ropeShoot = 0;
  player.jumping = false;
  audio.play('rope');
}

function releaseRope(jump) {
  if (!abilities.rope) return;
  abilities.rope = null;
  input.leftHeld = false;
  if (jump) {
    const v = player.body.velocity;
    v.y = Math.max(v.y, 0) + CFG.rope.releaseBoost;
    audio.play('jump');
  }
}

function updateRopeAnchor(rope) {
  if (rope.anchor) {
    rope.point.copy(rope.anchor.pos);
    rope.vel.copy(rope.anchor.vel);
  } else if (rope.plat) {
    const pb = rope.plat.body;
    rope.point.set(pb.position.x + rope.local.x, pb.position.y + rope.local.y, pb.position.z + rope.local.z);
    rope.vel.set(pb.velocity.x, pb.velocity.y, pb.velocity.z);
  }
}

// Rebet som en uelastisk afstandsbegrænsning + langsom indhaling (pendul-sving)
function applyRope(dt, w) {
  const rope = abilities.rope, R = CFG.rope;
  updateRopeAnchor(rope);
  const b = player.body, p = b.position, v = b.velocity;
  const dx = p.x - rope.point.x, dy = p.y + 0.8 - rope.point.y, dz = p.z - rope.point.z;
  const dist = Math.hypot(dx, dy, dz) || 0.0001;
  if (input.leftHeld) rope.length = Math.max(R.minLength, rope.length - R.reel * dt); // hal ind
  const nx = dx / dist, ny = dy / dist, nz = dz / dist;
  if (w.x || w.z) { // "pump" svinget med WASD (vinkelret på rebet)
    const d = w.x * nx + w.z * nz;
    v.x += (w.x - nx * d) * R.swingAccel * dt;
    v.y += (-ny * d) * R.swingAccel * dt;
    v.z += (w.z - nz * d) * R.swingAccel * dt;
  }
  if (dist > rope.length) {
    const radial = (v.x - rope.vel.x) * nx + (v.y - rope.vel.y) * ny + (v.z - rope.vel.z) * nz;
    if (radial > 0) { v.x -= nx * radial; v.y -= ny * radial; v.z -= nz * radial; }
    p.x = rope.point.x + nx * rope.length;
    p.y = rope.point.y + ny * rope.length - 0.8;
    p.z = rope.point.z + nz * rope.length;
  }
  const sp = Math.hypot(v.x, v.y, v.z);
  if (sp > R.maxSpeed) { const s = R.maxSpeed / sp; v.x *= s; v.y *= s; v.z *= s; }
}

// Reb-grafik
const ropeGeo = new THREE.CylinderGeometry(0.035, 0.035, 1, 6, 1, true);
ropeGeo.translate(0, 0.5, 0);
const ropeMesh = new THREE.Mesh(ropeGeo, MAT.rope);
ropeMesh.castShadow = true;
ropeMesh.visible = false;
scene.add(ropeMesh);
const hookMesh = new THREE.Group();
{
  const hub = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 10), MAT.hook);
  hookMesh.add(hub);
  for (let i = 0; i < 3; i++) {
    const prong = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.035, 6, 12, Math.PI * 0.9), MAT.hook);
    prong.rotation.y = (i * Math.PI * 2) / 3;
    prong.position.y = 0.05;
    hookMesh.add(prong);
  }
  hookMesh.visible = false;
  scene.add(hookMesh);
}
const _hand = new THREE.Vector3(), _ropeDir = new THREE.Vector3(), _yAxis = new THREE.Vector3(0, 1, 0);

function updateRopeVisual(dt) {
  const rope = abilities.rope;
  if (!rope) { ropeMesh.visible = false; hookMesh.visible = false; return; }
  abilities.ropeShoot = Math.min(1, abilities.ropeShoot + dt / 0.09);
  player.model.hands[1].getWorldPosition(_hand);
  _ropeDir.copy(rope.point).sub(_hand);
  const len = _ropeDir.length();
  _ropeDir.normalize();
  ropeMesh.visible = true;
  ropeMesh.position.copy(_hand);
  ropeMesh.quaternion.setFromUnitVectors(_yAxis, _ropeDir);
  ropeMesh.scale.set(1, len * abilities.ropeShoot, 1);
  hookMesh.visible = true;
  hookMesh.position.copy(_hand).addScaledVector(_ropeDir, len * abilities.ropeShoot);
  hookMesh.quaternion.setFromUnitVectors(_yAxis, _ropeDir.negate());
}

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
    if (!this.ctx || !this.enabled) return;
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
      default: break;
    }
  },
  update(heightAboveLava, speed) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.rumbleGain.gain.setTargetAtTime(clamp(1 - heightAboveLava / 70, 0, 1) * 0.35, t, 0.2);
    this.windGain.gain.setTargetAtTime(0.03 + Math.min(speed / 28, 1) * 0.09, t, 0.2);
    this.windFilter.frequency.setTargetAtTime(380 + speed * 45, t, 0.2);
  },
};

/* =====================================================================
   16. BRUGERFLADE
   ===================================================================== */
const ICONS = {
  none: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 12V6.5a1.4 1.4 0 0 1 2.8 0V11M10.8 10.5V5a1.4 1.4 0 0 1 2.8 0v5.5M13.6 10.5V6a1.4 1.4 0 0 1 2.8 0v5M16.4 11V8.8a1.4 1.4 0 0 1 2.8 0V14c0 4-3 7-6.8 7-3 0-4.9-1.6-6.4-4.2L4 13.6a1.4 1.4 0 0 1 2.3-1.6L8 14"/></svg>',
  chalk: '<svg viewBox="0 0 24 24"><g transform="rotate(-22 11 13)"><rect x="3.5" y="9.5" width="13" height="7" rx="1.6" fill="#f5f5f5"/><rect x="3.5" y="9.5" width="4" height="7" rx="1.4" fill="#d6d6d6"/></g><circle cx="19" cy="6.5" r="1.7" fill="#ffffff" opacity=".9"/><circle cx="16" cy="3.6" r="1.1" fill="#ffffff" opacity=".65"/><circle cx="21.2" cy="10.5" r="1" fill="#ffffff" opacity=".6"/></svg>',
  rope: '<svg viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3c3 2 5 2 7 1.5" stroke="#d6b27a" stroke-width="2"/><circle cx="12" cy="5" r="1.9" stroke="#cfd6e0" stroke-width="1.8"/><path d="M12 7v10" stroke="#cfd6e0" stroke-width="2.2"/><path d="M12 17c-3 0-5.5-1.6-6-4.5M12 17c3 0 5.5-1.6 6-4.5M12 17v3.5" stroke="#cfd6e0" stroke-width="2.2"/></svg>',
  bag: '<svg viewBox="0 0 24 24"><path d="M6.5 9h11l1.4 9.2a3 3 0 0 1-3 3.3H8.1a3 3 0 0 1-3-3.3z" fill="#6b8cff"/><rect x="5.5" y="7.4" width="13" height="2.6" rx="1.3" fill="#3a55c8"/><path d="M8 7.5c.8-2 2.3-3 4-3s3.2 1 4 3" fill="none" stroke="#f3f3f3" stroke-width="1.5"/><circle cx="12" cy="15.4" r="2.6" fill="#ffffff" opacity=".9"/></svg>',
  longrope: '<svg viewBox="0 0 24 24" fill="none" stroke="#d6b27a" stroke-width="1.9" stroke-linecap="round"><ellipse cx="11" cy="12" rx="8" ry="5"/><ellipse cx="11" cy="12" rx="5.3" ry="3.1"/><ellipse cx="11" cy="12" rx="2.6" ry="1.4"/><path d="M19 12c2 1.6 2.4 4.6.4 7"/></svg>',
};

function renderHotbar() {
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
  setText('hud-level-name', level.def.name);
  setText('hud-coins', String(game.coins));
  setText('hud-level-coins', game.levelCoins > 0 ? `+${game.levelCoins}` : '');
  setText('hud-time', formatTime(game.levelTime));
  setText('hud-deaths', String(game.deaths));

  const sel = abilities.selected;
  setText('hud-ability-name', T.abilityNames[sel]);
  let status, fill = 0, mode = '';
  if (sel === 'chalk') {
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
  const ch = abilities.rope ? 'hooked' : (sel === 'rope' && abilities.target ? 'target' : '');
  if (ch !== ui.crosshairState) {
    const el = $('crosshair');
    el.classList.toggle('hooked', ch === 'hooked');
    el.classList.toggle('target', ch === 'target');
    ui.crosshairState = ch;
  }
}

const SCREENS = { menu: 'screen-menu', paused: 'screen-pause', complete: 'screen-complete', shop: 'screen-shop', victory: 'screen-victory' };
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

let newGameArmed = 0;
function refreshMenu() {
  const save = loadSave();
  const cont = $('btn-continue');
  const canContinue = save && save.level > 0 && save.level < LEVELS.length;
  cont.classList.toggle('hidden', !canContinue);
  if (canContinue) cont.textContent = T.continueBtn(save.level + 1);
  $('btn-new').classList.toggle('btn-primary', !canContinue);
  $('btn-new').textContent = 'Nyt spil';
  newGameArmed = 0;
}

/* =====================================================================
   17. GEM / INDLÆS
   ===================================================================== */
const SAVE_KEY = 'skyhoj-parkour-v1';
function saveGame() {
  storage.set(SAVE_KEY, JSON.stringify({
    v: 1, level: game.savedLevel, coins: game.coins, owned: abilities.owned, selected: abilities.selected,
    deaths: game.deaths, totalTime: Math.round(game.totalTime), sound: game.sound,
  }));
}
function loadSave() {
  const raw = storage.get(SAVE_KEY);
  if (!raw) return null;
  try {
    const s = JSON.parse(raw);
    if (!s || s.v !== 1) return null;
    return s;
  } catch (e) { return null; }
}
function applySave(s) {
  game.coins = s ? s.coins | 0 : 0;
  game.deaths = s ? s.deaths | 0 : 0;
  game.totalTime = s ? +s.totalTime || 0 : 0;
  game.savedLevel = s ? clamp(s.level | 0, 0, LEVELS.length) : 0;
  abilities.owned = { chalk: false, rope: false, chalkbag: false, longrope: false, ...(s ? s.owned : {}) };
  abilities.selected = s && s.selected && (s.selected === 'none' || abilities.owned[s.selected]) ? s.selected : 'none';
  abilities.chalkActive = 0;
  abilities.chalkCooldown = 0;
  renderHotbar();
}

/* =====================================================================
   18. SPILTILSTAND OG HOVEDLØKKE
   ===================================================================== */
const game = {
  state: 'loading', levelIndex: 0, savedLevel: 0, coins: 0, levelCoins: 0, deaths: 0,
  totalTime: 0, levelTime: 0, sound: true, deadTimer: 0, portalTimer: 0, shopReturn: 'menu',
};
let level = null;

function loadLevel(i) {
  releaseRope(false);
  abilities.target = null;
  if (level) level.dispose();
  game.levelIndex = i;
  level = new Level(i);
  applyTheme(THEMES[level.def.theme]);
  buildClouds(level.data.bounds);
  level.reset();
  respawnPlayer();
  cam.yaw = -level.data.startHeading;
  cam.pitch = 0.3;
  cam.curDist = CFG.camera.dist;
}

function startLevel(i) {
  loadLevel(i);
  game.levelTime = 0;
  game.levelCoins = 0;
  abilities.chalkActive = 0;
  abilities.chalkCooldown = 0;
  clearToasts();
  setState('playing');
  showBanner();
  const def = level.def;
  setTimeout(() => {
    if (game.state !== 'playing' || game.levelIndex !== i) return;
    if (def.needsRope && !abilities.owned.rope) toast(T.toastNeedRope, 'bad', 7000);
    else if (i === 7) toast(T.toastRopeHint, 'gold', 7000);
    else if (def.theme === 'frost' && !abilities.owned.chalk) toast(T.tipChalk, 'gold', 6000);
  }, 1400);
}

function restartLevel(manual) {
  releaseRope(false);
  level.reset();
  respawnPlayer();
  cam.yaw = -level.data.startHeading;
  game.levelTime = 0;
  game.levelCoins = 0;
  abilities.chalkActive = 0;
  if (manual) toast(T.toastRestart, '', 1400);
}

function die() {
  if (game.state !== 'playing') return;
  game.deaths++;
  game.deadTimer = 1.3;
  releaseRope(false);
  const b = player.body;
  player.deathPos.copy(b.position);
  setState('dead');
  player.model.root.visible = false;
  player.blob.visible = false;
  audio.play('death');
  const fl = $('flash');
  fl.classList.remove('on');
  void fl.offsetWidth;
  fl.classList.add('on');
  for (let i = 0; i < 3; i++) {
    particles.burst(b.position.x, CFG.lavaY + 0.3, b.position.z, 22, { color: i ? '#ff7a1a' : '#ffd24a', speed: 7, up: 2.2, size: 0.55, life: 1.1, grav: 14, drag: 0.5, spread: 1 });
  }
  cam.shake = 0.6;
  toast(T.toastDeath, 'bad', 2600);
  saveGame();
}

function enterPortal() {
  if (game.state !== 'playing') return;
  releaseRope(false);
  setState('portal');
  game.portalTimer = 0.75;
  audio.play('portal');
  $('fade').classList.add('on');
  const c = level.portal.center;
  particles.burst(c.x, c.y, c.z, 60, { color: '#8fe8ff', speed: 7, up: 0.8, size: 0.35, life: 1, grav: 0, drag: 2, spread: 1.5 });
}

function completeLevel() {
  const def = level.def;
  const reward = def.reward;
  const bonus = game.levelCoins;
  game.coins += reward + bonus;
  const last = game.levelIndex >= LEVELS.length - 1;
  game.savedLevel = last ? 0 : game.levelIndex + 1;
  saveGame();
  $('fade').classList.remove('on');
  if (last) {
    setText('victory-time', formatTime(game.totalTime));
    setText('victory-deaths', String(game.deaths));
    setText('victory-coins', String(game.coins));
    setState('victory');
    return;
  }
  setText('complete-level', String(game.levelIndex + 1));
  setText('complete-name', def.name);
  setText('complete-time', formatTime(game.levelTime));
  setText('complete-reward', `+${reward}`);
  setText('complete-bonus', `+${bonus}`);
  setText('complete-total', String(game.coins));
  const next = game.levelIndex + 1;
  let tip = '';
  if (LEVELS[next].theme === 'frost' && !abilities.owned.chalk) tip = T.tipChalk;
  else if (LEVELS[next].needsRope && !abilities.owned.rope) tip = T.tipRope;
  else if (next === 7) tip = T.tipRopeOwned;
  else if (next === LEVELS.length - 1) tip = T.tipFinal;
  setText('complete-tip', tip);
  setState('complete');
}

function nextLevel() {
  if (game.state !== 'complete') return;
  startLevel(game.levelIndex + 1);
}

// Et fast fysikskridt
function fixedStep(dt) {
  level.fixedUpdate(dt);
  const playing = game.state === 'playing';
  const b = player.body;
  if (playing) {
    abilities.chalkActive = Math.max(0, abilities.chalkActive - dt);
    abilities.chalkCooldown = Math.max(0, abilities.chalkCooldown - dt);
    playerControl(dt);
  } else if (game.state === 'dead') {
    b.position.copy(player.deathPos);
    b.velocity.set(0, 0, 0);
  } else if (player.grounded) {
    b.velocity.x = player.groundVel.x;
    b.velocity.z = player.groundVel.z;
  }
  world.step(dt);
  postStep(dt, playing);
}

const simulateStates = new Set(['playing', 'dead', 'portal', 'menu', 'complete', 'victory']);
let lastT = performance.now(), acc = 0, elapsed = 0;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, Math.max(0, (now - lastT) / 1000));
  lastT = now;
  elapsed += dt;
  const s = game.state;
  const simulate = simulateStates.has(s) || (s === 'shop' && (game.shopReturn === 'menu' || game.shopReturn === 'complete'));
  if (simulate && level) {
    acc += dt;
    let n = 0;
    while (acc >= CFG.fixedDt && n < CFG.maxSteps) { fixedStep(CFG.fixedDt); acc -= CFG.fixedDt; n++; }
    if (n >= CFG.maxSteps) acc = 0;
  }
  if (s === 'playing') { game.levelTime += dt; game.totalTime += dt; }
  if (s === 'dead') {
    game.deadTimer -= dt;
    if (game.deadTimer <= 0) { restartLevel(false); setState('playing'); }
  }
  if (s === 'portal') {
    game.portalTimer -= dt;
    if (game.portalTimer <= 0) completeLevel();
  }
  if (!level) return;

  // Grafik
  level.update(dt, elapsed);
  updatePlayerVisual(dt, elapsed);
  particles.update(dt);
  if (s === 'menu' || (s === 'shop' && game.shopReturn === 'menu')) updateMenuCamera(elapsed);
  else updateCamera(dt);
  abilities.target = s === 'playing' && abilities.selected === 'rope' && !abilities.rope ? findRopeTarget() : null;
  updateRopeVisual(dt);
  if (s === 'playing' || s === 'dead' || s === 'portal') updateHud();

  // Miljø følger kameraet / spilleren
  const pb = player.body.position;
  skyGroup.position.copy(camera.position);
  lavaUniforms.uTime.value = elapsed;
  emberUniforms.uTime.value = elapsed;
  emberUniforms.uCenter.value.set(pb.x, 0, pb.z);
  lava.position.x = Math.round(camera.position.x / 50) * 50;
  lava.position.z = Math.round(camera.position.z / 50) * 50;
  const d = sun.userData.dir;
  sun.position.set(pb.x + d.x * 120, pb.y + d.y * 120, pb.z + d.z * 120);
  sun.target.position.set(pb.x, pb.y, pb.z);
  lavaLight.position.set(pb.x, pb.y - 100, pb.z);
  lavaLight.target.position.set(pb.x, pb.y, pb.z);
  for (const c of cloudGroup.children) c.position.x += c.userData.drift * dt * 0.4;
  audio.update(pb.y - CFG.lavaY, Math.hypot(player.body.velocity.x, player.body.velocity.y, player.body.velocity.z));

  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  emberUniforms.uScale.value = h;
  particles.uniforms.uScale.value = h;
});

// ---- Knapper ----
const click = (id, fn) => $(id).addEventListener('click', () => { audio.init(); audio.play('click'); fn(); });
click('btn-continue', () => {
  const s = loadSave();
  startLevel(s ? clamp(s.level, 0, LEVELS.length - 1) : 0);
});
click('btn-new', () => {
  const s = loadSave();
  const hasProgress = s && (s.level > 0 || s.coins > 0 || Object.values(s.owned || {}).some(Boolean));
  if (hasProgress && !newGameArmed) {
    newGameArmed = 1;
    $('btn-new').textContent = 'Sikker? Klik igen – alt nulstilles';
    setTimeout(() => { if (newGameArmed) refreshMenu(); }, 3500);
    return;
  }
  storage.remove(SAVE_KEY);
  applySave(null);
  game.savedLevel = 0;
  saveGame();
  startLevel(0);
});
click('btn-menu-shop', () => openShop('menu'));
click('btn-resume', resumeGame);
click('btn-pause-shop', () => openShop('paused'));
click('btn-restart', () => { restartLevel(true); setState('playing'); });
click('btn-sound', toggleSound);
click('btn-quit', () => {
  saveGame();
  loadLevel(clamp(game.savedLevel, 0, LEVELS.length - 1));
  refreshMenu();
  setState('menu');
});
click('btn-next', nextLevel);
click('btn-complete-shop', () => openShop('complete'));
click('btn-shop-back', closeShop);
click('btn-replay', () => { game.savedLevel = 0; saveGame(); startLevel(0); });
click('btn-victory-menu', () => { loadLevel(0); refreshMenu(); setState('menu'); });
$('shop-items').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-buy]');
  if (btn) buy(btn.dataset.buy);
});

// ---- Opstart ----
function boot() {
  createPlayer();
  const save = loadSave();
  applySave(save);
  game.sound = save ? save.sound !== false : true;
  audio.enabled = game.sound;
  loadLevel(clamp(game.savedLevel, 0, LEVELS.length - 1));
  refreshMenu();
  $('screen-loading').classList.add('hidden');
  setState('menu');
  requestAnimationFrame((t) => { lastT = t; frame(t); });

  // Udvikler-hooks til automatiske tests (kun med ?debug i adressen)
  if (/[?&]debug\b/.test(location.search)) {
    window.skyhoj = {
      game, player, abilities, cam, CFG, LEVELS, THEMES, input,
      get level() { return level; },
      buildLevelData, startLevel, loadLevel, completeLevel, die, fireRope, releaseRope, findRopeTarget,
      useAbility, selectAbility, openShop, setState, renderShop, renderHotbar, toast, saveGame, applySave,
      fixedStep, respawnPlayer, onKeyPress, updateCamera, camera, renderer, scene, world,
    };
  }
}

const fontsReady = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
Promise.race([fontsReady, new Promise((r) => setTimeout(r, 1500))]).then(boot);
})();
