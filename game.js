/* =====================================================================
   SKYHØJ PARKOUR
   Et 3D-parkourspil i skyerne. Three.js (grafik) + cannon-es (fysik).

   Indhold:
     1.  Konfiguration og konstanter
     2.  Danske tekster
     3.  Himmel-temaer (et pr. bane)
     4.  De 15 baner (hårdkodede segmentlister)
     5.  Hjælpefunktioner
     6.  Procedurelle teksturer og materialer
     7.  Renderer, scene, himmel, skyer, lava og lys
     8.  Fysikverden
     9.  Banebygger (segmenter -> platforme, ankre, mønter, portal)
     9b. Verdenssæt-systemet (standardsættet "sten")
     9c. Verdenerne (15 verdenssæt med egne himmeltemaer)
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
  maxSteps: 12,              // maks. fysikskridt pr. frame (fuld fart ned til 10 FPS, beskytter mod "spiral of death")
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
  grip: { normal: 1, ice: 0.11 },  // friktion mod underlaget (is er glat)
  // Hænderne: auto-greb af kanter og stænger, greb (udholdenhed), klatring
  hang: {
    drop: 1.72,              // hændernes højde over kroppens centrum, når man hænger
    wallGap: 0.47,           // kroppens afstand fra væggen
    reach: 0.95,             // vandret rækkevidde for at gribe en kant
    window: 0.55,            // lodret vindue for at gribe en kant
    barReach: 0.65,          // vandret rækkevidde for at gribe en stang
    shimmy: 1.7,             // sidelæns fart langs en kant (m/s)
    barShimmy: 2.2,          // fart langs en stang (hånd over hånd)
    climbTime: 0.42,
    drain: 1 / 4.2,          // greb brugt pr. sekund ved en kant (≈ 4 s)
    barDrain: 1 / 5.5,       // stænger er lidt nemmere at hænge i
    iceMul: 2,               // isglatte kanter tærer dobbelt så hurtigt på grebet
    moveMul: 1.3,            // det koster ekstra greb at flytte sig
    regen: 1.6,              // greb genvindes pr. sekund på fast grund
    cooldown: 0.28,          // pause før man kan gribe igen efter at have sluppet
    leapFwd: 6.5,            // spring fra en stang: fart fremad …
    leapUp: 5,               // … og opad (lavt, så hænderne kan gribe næste stang i farten)
    hopUp: 7.6,              // hop lige op fra en stang (uden retning)
  },
  // Kridt påvirker KUN hænderne
  chalk: { duration: 8, cooldown: 12, cooldownUpgraded: 6, drainMul: 0.25, reachBonus: 0.4, windowBonus: 0.35 },
  gloves: 1.5,               // klatrehandsker: grebet holder 50 % længere
  dbl: { vel: 9.8, steer: 0.65 },
  vent: { power: 30, maxUp: 9.5 },
  skate: {
    push: 7, maxPush: 13, brake: 14, roll: 0.25, maxSpeed: 30,
    turn: 1.8, airTurn: 0.9, lateral: 10, ollie: 8.6, grindFriction: 0.08,
  },
  rope: {
    range: 32,
    rangeUpgraded: 45,
    reel: 7,                 // så hurtigt hales man ind, mens venstreklik holdes (m/s)
    minLength: 2.4,
    swingAccel: 13,          // "pump" med WASD mens man svinger
    maxSpeed: 30,
    releaseBoost: 6.5,       // ekstra opdrift når man slipper med mellemrum
    assistAngle: THREE.MathUtils.degToRad(9), // sigtehjælp mod krogpunkter
    lockCos: Math.cos(THREE.MathUtils.degToRad(35)), // automatisk lås på krogpunkter foran spilleren
  },
  bounceDefault: 18,
  coinValue: 5,
  camera: { dist: 7.4, height: 2.15, minPitch: -1.05, maxPitch: 1.3, sens: 0.0026, fov: 70 },
};

const SHOP_ITEMS = [
  {
    id: 'chalk', kind: 'EVNE', price: 60, icon: 'chalk',
    name: 'Kridt',
    desc: 'Venstreklik: frisk kridt på hænderne. Grebet fyldes op, og i 8 sekunder holder du fire gange så længe og griber kanter længere væk.',
  },
  {
    id: 'double', kind: 'EVNE', price: 120, icon: 'double',
    name: 'Dobbelthop',
    desc: 'Tryk på mellemrum igen i luften for at hoppe en ekstra gang og skifte retning. Virker automatisk.',
  },
  {
    id: 'rope', kind: 'EVNE', price: 150, icon: 'rope',
    name: 'Reb (entrehage)',
    desc: 'Skyd rebet mod et lysende krogpunkt og sving dig over kløfter. Hold venstreklik for at hale ind, mellemrum for at hoppe af.',
  },
  {
    id: 'gloves', kind: 'OPGRADERING', price: 90, icon: 'gloves',
    name: 'Klatrehandsker',
    desc: 'Grebet holder 50 % længere, når du hænger i kanter og stænger.',
  },
  {
    id: 'chalkbag', kind: 'OPGRADERING', price: 100, icon: 'bag', requires: 'chalk',
    name: 'Kridtpose',
    desc: 'Kridtet genoplades dobbelt så hurtigt (6 s i stedet for 12 s).',
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
  toastChalk: 'Kridt på hænderne! Grebet holder meget længere',
  toastChalkCd: (s) => `Kridtet genoplades … ${s.toFixed(1)} s`,
  toastRopeNoTarget: 'Intet mål inden for rækkevidde',
  toastNoAbility: 'Ingen evne valgt – køb evner i butikken (B)',
  toastDeath: 'Du faldt i lavaen! Banen starter forfra.',
  toastCoin: (n) => `+${n} mønter`,
  toastRestart: 'Banen er genstartet',
  toastCheckpoint: 'Kontrolpunkt! Rører du lavaen, starter du herfra.',
  toastNeedRope: 'Denne bane kræver rebet! Tryk B for at åbne butikken.',
  toastRopeHint: 'Tip: Vælg rebet (scroll), sigt på det lysende krogpunkt og venstreklik. Sving med W, hop af med mellemrum.',
  toastSound: (on) => (on ? 'Lyd: til' : 'Lyd: fra'),
  toastBought: (name) => `Du købte: ${name}`,
  shopBuy: 'Køb',
  shopOwned: 'Ejet ✓',
  shopMissing: (n) => `Mangler ${n}`,
  shopRequires: (name) => `Kræver: ${name}`,
  soundBtn: (on) => `Lyd: ${on ? 'Til' : 'Fra'}`,
  continueBtn: (n) => `Fortsæt – bane ${n}`,
  tipChalk: 'Tip: Kridt (60 mønter) får hænderne til at holde meget længere – især på isglatte kanter.',
  tipDouble: 'Tip: Dobbelthop (120 mønter) gør de næste baner meget lettere – og nogle senere baner kræver det.',
  tipSkate: 'Næste bane køres på skateboard! W: fart · A/D: styr · S: brems · Mellemrum: ollie.',
  toastNeedDouble: 'Denne bane kræver dobbelthop! Tryk B for at åbne butikken.',
  toastGrabHint: 'Du hænger i hænderne! W/mellemrum: klatr op · A/D: flyt dig · S: giv slip',
  toastBarHint: 'Du hænger i en stang! WASD: flyt dig langs den · Mellemrum: hop af',
  toastZipHint: 'Svævebane! Du glider ned – tryk mellemrum for at hoppe af',
  toastSlip: 'Du mistede grebet!',
  toastGripLow: 'Grebet glipper – klatr op eller brug kridt!',
  toastSkate: 'Skateboard! W: sæt fart · A/D: styr · S: brems · Mellemrum: ollie',
  toastGrind: 'Grind!',
  toastDoubleOwned: 'Dobbelthop: tryk mellemrum igen i luften',
  skateAbility: 'Skateboard',
  skateStatus: (kmh) => `${kmh} km/t`,
  gripLabel: 'GREB',
  levelSelect: 'Vælg bane',
  locked: 'Låst',
  tipRope: 'Tip: Fra bane 8 er rebet (150 mønter) nødvendigt for at krydse de store huller.',
  tipRopeOwned: 'Næste bane har enorme huller – husk at vælge rebet med scrollhjulet.',
  tipFinal: 'Sidste bane! Små platforme, gigantiske huller og ingen nåde. Held og lykke.',
  levelBanner: (n) => `BANE ${n}`,
};


// Samme tekster på telefon og tablet (byttes ind af useTouchTexts, når touch-styringen bruges)
const T_TOUCH = {
  abilityReady: 'Klar – tryk på EVNE',
  ropeAttached: 'Hold EVNE: hal ind · HOP: hop af',
  ropeTarget: 'Mål fundet – tryk på EVNE!',
  toastNoAbility: 'Ingen evne valgt – køb evner i butikken (i pausemenuen)',
  toastNeedRope: 'Denne bane kræver rebet! Åbn butikken i pausemenuen.',
  toastRopeHint: 'Tip: Vælg rebet forneden, sigt på det lysende krogpunkt og tryk på EVNE. Sving med joysticket, hop af med HOP.',
  tipSkate: 'Næste bane køres på skateboard! Joystick frem: fart · til siden: styr · tilbage: brems · HOP: ollie.',
  toastNeedDouble: 'Denne bane kræver dobbelthop! Åbn butikken i pausemenuen.',
  toastGrabHint: 'Du hænger i hænderne! Joystick frem eller HOP: klatr op · til siden: flyt dig · tilbage: giv slip',
  toastBarHint: 'Du hænger i en stang! Joysticket: flyt dig langs den · HOP: hop af',
  toastZipHint: 'Svævebane! Du glider ned – tryk på HOP for at hoppe af',
  toastSkate: 'Skateboard! Joystick frem: sæt fart · til siden: styr · tilbage: brems · HOP: ollie',
  toastDoubleOwned: 'Dobbelthop: tryk på HOP igen i luften',
  tipRopeOwned: 'Næste bane har enorme huller – husk at vælge rebet forneden på skærmen.',
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
   4. DE 15 BANER
   Hver bane er en liste af segmenter, som banebyggeren (afsnit 9)
   omsætter til platforme og hjælpere. Udseendet kommer fra banens
   verdenssæt (kit, afsnit 9c) – fysikken er altid kasser og cylindre.
   Platform-felter:
     t     : 'start' | 'p' | 'ice' | 'crumble' | 'move' | 'swing' | 'bounce' |
             'spin' | 'conveyor' | 'rot' | 'vent' | 'finish' |
             (skateboard:) 'ramp' | 'rail' | 'boost'
     g     : hul (kant til kant) fra forrige platform i meter
     w, d  : bredde (på tværs) og dybde (langs banen); shape:'cyl' = rund
     dy    : højdeforskel på topfladen i forhold til forrige platform
     x     : sideforskydning; turn: drej banens retning (grader, + = højre)
     v     : verdenssættets variant (kun udseende)
     mv/sw : enhver platform kan bevæge sig ({ax, amp, per, ph}) eller svinge
     grab  : en kant, man er tænkt at gribe med hænderne; slick: glat kant
     cp    : kontrolpunkt; hint: tekst, der vises første gang man lander
     coin  : mønt over platformen
   Hjælpere (placeres ud fra forrige platform: at = meter ud fra kanten,
   y = højde over dens top, x = sideforskydning):
     bar (hængestang; ang, len, sw = trapez, mv = bevægelig), zip (svævebane;
     len, drop), anchor (krogpunkt til rebet), coin, wind (opvindssøjle)
   ===================================================================== */
const LEVELS = [
  // ------------------------------------------------------------------ 1
  {
    name: 'Himmelengen',
    kit: 'meadow',
    theme: 'meadow',
    reward: 20,
    needsRope: false,
    needsDouble: false,
    chalkTip: false,
    skate: false,
    segs: [
      { t: 'start', w: 12, d: 10, hint: 'Velkommen! WASD: løb · Mellemrum: hop · Saml mønterne' },
      { g: 2.5, w: 5, d: 14, h: 0.8 },
      { t: 'coin', at: -12.5, y: 1.3 },
      { t: 'coin', at: -10, y: 1.3 },
      { t: 'coin', at: -7.5, y: 1.3 },
      { t: 'coin', at: -5, y: 1.3 },
      { t: 'coin', at: -2.5, y: 1.3 },
      { g: 2.5, w: 11, d: 10, dy: 0.5 },
      { turn: 90, shape: 'cyl', g: 3, w: 9, h: 1.4 },
      { shape: 'cyl', g: 3, w: 4, dy: 0.5, coin: true, hint: 'Høballerne! Hop fra bal til bal – hver er lidt højere' },
      { shape: 'cyl', g: 2.5, w: 4, dy: 0.5, turn: -15, coin: true },
      { shape: 'cyl', g: 2.5, w: 4, dy: 0.5, turn: -15, coin: true },
      { shape: 'cyl', g: 2.5, w: 4, dy: 0.5, turn: -15, coin: true },
      { shape: 'cyl', g: 2.5, w: 4, dy: 0.5, turn: -15, coin: true },
      { turn: -30, g: 3, w: 12, d: 10, dy: 0.5, cp: true, hint: 'Kontrolpunkt! Falder du, starter du igen herfra' },
      { t: 'bar', at: 2.5, y: 2.4, len: 4, ang: 90, x: -2, opt: true },
      { t: 'coin', at: 2.5, y: 1, x: 0 },
      { g: 5, w: 9, d: 9, dy: -1 },
      { g: 3, w: 10, d: 9, hint: 'Laden er for høj at hoppe op på. Hop mod kanten – hænderne griber selv! W: klatr op' },
      { g: 3, w: 10, d: 14, h: 6, dy: 3.2, grab: true, coin: true },
      { g: 3.5, shape: 'cyl', w: 9, dy: -1.5, turn: 55 },
      { g: 2.5, w: 4, d: 9, h: 0.8, dy: 0.5, turn: -25 },
      { g: 2.5, w: 7, d: 7, dy: 1, turn: -30 },
      { g: 3, shape: 'cyl', w: 6, dy: 1 },
      { t: 'finish', g: 3, w: 12, d: 12, dy: 1 },
    ],
  },
  // ------------------------------------------------------------------ 2
  {
    name: 'Højhustagene',
    kit: 'rooftops',
    theme: 'rooftops',
    reward: 25,
    needsRope: false,
    needsDouble: false,
    chalkTip: false,
    skate: false,
    segs: [
      { t: 'start', w: 9, d: 9 },
      { g: 3.5, w: 8, d: 6, dy: 0.5, coin: true },
      { g: 4, shape: 'cyl', w: 6, dy: 0.5, x: 2, coin: true },
      { g: 4.5, w: 7, d: 8, dy: 1, x: -3 },
      { g: 4, w: 6, d: 8, dy: 0, x: 2, hint: 'Næste tag er for langt til fødderne! Løb og hop alligevel – hænderne griber parapeten. W: klatr op' },
      { g: 8.3, w: 8, d: 7, dy: 1, grab: true, coin: true },
      { g: 4, w: 8, d: 8, dy: 1.5, hint: 'Hjørnet! Grib røret på facaden, tryk W for at hænge dig langs det, og spring over til taget' },
      { t: 'bar', at: -4, x: 5, y: 2.4, len: 4.5, ang: 90 },
      { t: 'coin', at: -4, x: 7.5, y: 1.2 },
      { turn: 90, g: 10.5, w: 8, d: 8, dy: 0.5 },
      { g: 4.5, w: 6, d: 7, dy: 1, x: 1.5 },
      { t: 'coin', at: 7.7, x: -1.5, y: 0.2 },
      { g: 8, w: 7, d: 7, dy: 1.5, grab: true, coin: true },
      { g: 3.5, w: 7, d: 8, dy: 1, hint: 'Stilladset! Hop op og grib det første rør – Mellemrum + W: sving videre fra rør til rør' },
      { t: 'bar', at: 1.8, x: -2, y: 2.4, len: 4, ang: 90 },
      { t: 'bar', at: 4, x: -2, y: 2.4, len: 4, ang: 90 },
      { t: 'bar', at: 6.2, x: -2, y: 2.4, len: 4, ang: 90 },
      { t: 'coin', at: 4, x: 0, y: 1 },
      { g: 11.2, w: 9, d: 9, dy: 0.5, cp: true },
      { turn: -90, g: 4, w: 7, d: 7, dy: 1.5 },
      { g: 4.5, w: 8, d: 8, dy: 1, hint: 'Vinduespudseren! Hop på gondolen, når den er lav – den løfter dig op til taget' },
      { g: 3, w: 4.5, d: 3.5, h: 0.6, dy: 2.5, mv: { ax: 'y', amp: 2.5, per: 8, ph: 0 }, coin: true },
      { g: 3, w: 9, d: 8, dy: 2 },
      { t: 'zip', at: -1, x: 0, y: 3, len: 8.5, drop: 4.8 },
      { g: 7, w: 6, d: 7, dy: -4, coin: true },
      { t: 'coin', at: -2.5, x: 0, y: 1.3 },
      { t: 'coin', at: -4.5, x: 0, y: 1.3 },
      { g: 8.2, w: 7, d: 7, dy: 1.5, grab: true },
      { turn: -90, g: 4, shape: 'cyl', w: 6, dy: 1.5 },
      { g: 4, w: 7, d: 7, dy: 1 },
      { t: 'coin', at: 7.9, x: 3.5, y: 0.2 },
      { g: 8.5, w: 8, d: 7, dy: 1.5, grab: true, coin: true },
      { t: 'finish', g: 4, w: 12, d: 12, dy: 1.5 },
    ],
  },
  // ------------------------------------------------------------------ 3
  {
    name: 'Slikøerne',
    kit: 'candy',
    theme: 'candy',
    reward: 30,
    needsRope: false,
    needsDouble: false,
    chalkTip: false,
    skate: false,
    segs: [
      { t: 'start', w: 10, d: 10 },
      { g: 3, w: 4.6, d: 9 },
      { g: 3.5, w: 7, shape: 'cyl', dy: 0.5, coin: true },
      { g: 4, w: 4.4, shape: 'cyl', dy: 0.5 },
      { t: 'bounce', turn: 40, g: 3.2, w: 3.6, shape: 'cyl', pow: 16, hint: 'Skumfidus! Løb ind på puden - den kaster dig op i luften. Hold W, så flyver du fremad.' },
      { g: 3, w: 7, d: 6.5, dy: 2.6 },
      { g: 3.5, w: 16, shape: 'cyl', dy: -1.4, h: 2.6 },
      { t: 'bounce', turn: 50, g: -14.2, w: 3.4, shape: 'cyl', dy: 0.06, pow: 14, hint: 'Bryllupskagen: hop på puden og hold W mod næste etage. Du lander lige under kanten - hænderne griber selv. Tryk W for at kravle op.' },
      { t: 'coin', at: 3.4, y: 4.2 },
      { g: 3.8999999999999995, w: 12, shape: 'cyl', dy: 4.54, h: 2.6, grab: true },
      { t: 'bounce', turn: 50, g: -11.2, w: 3.4, shape: 'cyl', dy: 0.06, pow: 14 },
      { t: 'coin', at: 3.4, y: 4.2 },
      { g: 3.8999999999999995, w: 9, shape: 'cyl', dy: 4.54, h: 2.6, grab: true },
      { t: 'bounce', turn: 50, g: -8.7, w: 3.4, shape: 'cyl', dy: 0.06, pow: 15 },
      { g: 4.1, w: 8, shape: 'cyl', dy: 4.94, h: 2.6, grab: true, cp: true, coin: true },
      { t: 'crumble', turn: -60, g: 3.6, w: 3, d: 3, dy: -0.3, hint: 'Kiks! De knækker et halvt sekund efter, du lander - bliv ved med at løbe!' },
      { t: 'crumble', g: 4.4, w: 3, d: 3, dy: -0.3, x: -1 },
      { t: 'crumble', turn: 30, g: 4.6, w: 3, d: 3, dy: -0.3 },
      { t: 'crumble', g: 4.4, w: 3, d: 3, dy: -0.3, x: 1.2 },
      { t: 'crumble', turn: -35, g: 4.8, w: 3, d: 3, dy: -0.3, coin: true },
      { g: 4.4, w: 8, d: 6.5, dy: -0.5, cp: true, hint: 'Bolsjestokke! Hop op og grib fat. Tryk Mellemrum + W for at svinge videre til næste stok - til sidst venter en lakridsgynge.' },
      { t: 'bar', at: 1.2, y: 2.4, x: -1.5, len: 3, ang: 90 },
      { t: 'bar', at: 3.4, y: 2.4, x: -1.5, len: 3, ang: 90 },
      { t: 'bar', at: 5.6, y: 2.4, x: -1.5, len: 3, ang: 90 },
      { t: 'bar', at: 7.8, y: 2.4, x: -1.5, len: 3, ang: 90 },
      { t: 'coin', at: 4.5, y: 2 },
      { t: 'bar', at: 11.4, y: 2.4, x: -1.5, len: 3, ang: 90, sw: { len: 5, amp: 28, per: 3.2 } },
      { t: 'coin', at: 9.6, y: 2.2 },
      { g: 16, w: 5, shape: 'cyl', dy: -1 },
      { turn: -40, g: 4.5, w: 7, shape: 'cyl', dy: -1.8, cp: true },
      { turn: -40, g: 5, w: 3.2, d: 7, dy: -2.2 },
      { g: 5.5, w: 5, shape: 'cyl', dy: -2.2, coin: true },
      { turn: 70, g: 6, w: 4, shape: 'cyl', dy: -2.4 },
      { turn: 40, g: 5.5, w: 6.5, shape: 'cyl', dy: -2, coin: true },
      { g: 6, w: 7, d: 8, dy: -1.5, cp: true },
      { t: 'bounce', g: 3, w: 4, d: 4, pow: 22, hint: 'Gelé-puden er ekstra stærk! Løb ind på den og hold W hele vejen over kløften.' },
      { t: 'coin', at: 6.2, y: 9.8 },
      { g: 10, w: 6.5, shape: 'cyl', dy: 1.5 },
      { g: 3.5, w: 2.4, d: 22, dy: -0.5 },
      { t: 'coin', at: -4, y: 1.3 },
      { t: 'coin', at: -10, y: 1.3 },
      { t: 'coin', at: -16, y: 1.3 },
      { t: 'finish', g: 3.5, w: 10, d: 10 },
    ],
  },
  // ------------------------------------------------------------------ 4
  {
    name: 'Gletsjeren',
    kit: 'glacier',
    theme: 'glacier',
    reward: 35,
    needsRope: false,
    needsDouble: false,
    chalkTip: true,
    skate: false,
    segs: [
      { t: 'start', w: 10, d: 10 },
      { g: 3, w: 7, d: 7, dy: -1, coin: true },
      { t: 'ice', g: 3, w: 6, d: 6, dy: -1, hint: 'Is! Du glider og kan ikke stoppe – hop helt ude ved kanten' },
      { t: 'ice', g: 0, w: 6, d: 5, dy: -0.5 },
      { t: 'ice', g: 0, w: 6, d: 5, dy: -0.5, coin: true },
      { g: 6, w: 6, d: 6, dy: -1 },
      { t: 'crumble', g: 3, w: 3.2, d: 3.2, hint: 'Tyndt is! Det knækker under dig – bliv ved med at løbe' },
      { t: 'crumble', g: 3, w: 3.2, d: 3.2, dy: 0.3 },
      { t: 'crumble', g: 3, w: 3.2, d: 3.2, dy: 0.3 },
      { turn: 60, g: 3, w: 8, d: 7, dy: 0.5, cp: true },
      { t: 'rot', g: 3, w: 6, spd: 0.4, hint: 'Isflagerne drejer – hop, når de står rigtigt' },
      { t: 'rot', g: 3, w: 6, spd: -0.6, dy: 0.3, coin: true },
      { t: 'rot', g: 3, w: 6, spd: 0.5, dy: 0.3 },
      { turn: -45, g: 3, w: 6, d: 6, dy: 0.5, hint: 'Isglatte kanter! Grebet slipper dobbelt så hurtigt. Tip: kridt (venstreklik) får hænderne til at holde meget bedre' },
      { g: 8.6, w: 5, d: 5, grab: true, slick: true },
      { g: 4, w: 5, d: 5, dy: 0.5 },
      { t: 'coin', at: 4, y: 5.5 },
      { t: 'coin', at: 6, y: 6 },
      { g: 1.5, w: 4, d: 3, dy: 3.2, grab: true, slick: true, hint: 'Det frosne vandfald: grib, klatr op og grib igen – hurtigt!' },
      { g: 1.5, w: 4, d: 3, dy: 3.2, grab: true, slick: true },
      { g: 1.5, w: 5, d: 4, dy: 3.2, grab: true, slick: true, cp: true, coin: true },
      { turn: 45, g: 4, w: 6, d: 6, dy: -1 },
      { t: 'ice', g: 3, w: 5, d: 9, dy: -0.5 },
      { g: 5, w: 5, d: 5, dy: 0.5, coin: true },
      { t: 'crumble', g: 3, w: 3, d: 3 },
      { g: 7, w: 6, d: 6, dy: -0.5 },
      { g: 8.4, w: 6, d: 6, dy: 1, grab: true, coin: true },
      { t: 'finish', g: 3, w: 10, d: 10, dy: 0.5 },
    ],
  },
  // ------------------------------------------------------------------ 5
  {
    name: 'Luftskibshavnen',
    kit: 'harbor',
    theme: 'harbor',
    reward: 40,
    needsRope: false,
    needsDouble: false,
    chalkTip: false,
    skate: false,
    segs: [
      { t: 'start', w: 10, d: 10 },
      { g: 3, w: 5, d: 9, dy: 0.5 },
      { g: 4, shape: 'cyl', w: 4.2, dy: 0.5, turn: 25 },
      { g: 4.5, w: 3.6, d: 3.6, dy: 0.5, turn: -45, hint: 'Nogle dæk bevæger sig. Vent på det rette øjeblik, og hop!' },
      { g: 4.5, w: 4, d: 4.5, mv: { ax: 'z', amp: 2.2, per: 5.6, ph: 0.25 } },
      { g: 4.5, w: 8, d: 7, dy: 0.5, cp: true, coin: true, hint: 'Ballonerne stiger og falder. Hop, når kurven er i din højde – eller grib kanten med hænderne!' },
      { g: 5, shape: 'cyl', w: 2.8, h: 1, dy: 1, turn: 50, mv: { ax: 'y', amp: 2, per: 5.6, ph: 0 } },
      { t: 'coin', at: 2.25, y: 2.4 },
      { g: 4.5, shape: 'cyl', w: 2.8, h: 1, mv: { ax: 'y', amp: 2, per: 5.6, ph: 0.33 } },
      { g: 4.5, shape: 'cyl', w: 2.8, h: 1, dy: 1, grab: true, mv: { ax: 'y', amp: 2, per: 5.6, ph: 0.67 } },
      { g: 4.5, w: 6, d: 6, dy: 0.5, turn: -20 },
      { g: 4.5, w: 3, d: 13, dy: 0.5, turn: -40 },
      { t: 'coin', at: -1.8, x: 1.97, y: -1.2 },
      { t: 'coin', at: -5.1, x: 1.97, y: -1.2 },
      { t: 'coin', at: -8.4, x: 1.97, y: -1.2 },
      { t: 'coin', at: -11.7, x: 1.97, y: -1.2 },
      { g: 4.5, w: 4.6, d: 4.2, dy: 0.5, mv: { ax: 'x', amp: 3, per: 5, ph: 0 } },
      { g: 5, w: 4.6, d: 4.2, dy: 0.5, turn: 15, mv: { ax: 'x', amp: 3, per: 7.5, ph: 0.4 } },
      { g: 5, w: 6, d: 6, dy: 0.5, cp: true, coin: true, hint: 'Langt hop! Hænderne griber kanten af taget. Tryk W for at klatre op.' },
      { t: 'coin', at: -3.5, y: 5.6 },
      { t: 'coin', at: -1, y: 5.6 },
      { t: 'coin', at: 1.5, y: 5.6 },
      { g: 8.6, w: 5, d: 5, dy: 1, turn: 45, grab: true },
      { t: 'rot', g: 4, w: 5, spd: 0.5 },
      { g: 4.5, shape: 'cyl', w: 3, dy: 1.5, turn: -50 },
      { g: 4.5, w: 5, d: 5, dy: 0.5, turn: -15, hint: 'Kasserne svinger på kranerne. Hop på, når de svinger mod dig!' },
      { t: 'swing', g: 3.5, w: 2.6, d: 2.6, len: 7, amp: 22, per: 4.2, ph: 0, ax: 'z' },
      { t: 'swing', g: 3.5, w: 2.6, d: 2.6, len: 7, amp: 22, per: 4.2, ph: 0.12, ax: 'z' },
      { t: 'swing', g: 3.5, w: 2.6, d: 2.6, len: 7, amp: 22, per: 4.2, ph: 0.28, ax: 'z' },
      { g: 3.5, w: 7, d: 7, dy: 1.5, cp: true, coin: true },
      { g: 3.5, w: 4.5, d: 7, dy: 1, turn: 35, hint: 'Hop op på stangen under luftskibet! Den sejler dig over. Slip og hop (mellemrum + W), eller tryk S.' },
      { t: 'bar', at: 14, y: 2.4, x: -2.5, len: 5, ang: 90, mv: { ax: 'z', amp: 6, per: 6, ph: 0 } },
      { g: 18, w: 7, d: 7, dy: -0.5, cp: true },
      { t: 'coin', at: 6, y: 0.8 },
      { t: 'coin', at: 12, y: 0.1 },
      { t: 'zip', at: -1.5, y: 3.2, len: 22, drop: 3.5 },
      { t: 'finish', g: 19.5, w: 10, d: 10, dy: -2.5 },
    ],
  },
  // ------------------------------------------------------------------ 6
  {
    name: 'Solbanen',
    kit: 'skatemesa',
    theme: 'skatemesa',
    reward: 45,
    needsRope: false,
    needsDouble: false,
    chalkTip: false,
    skate: true,
    segs: [
      { t: 'start', w: 12, d: 14, v: 'plaza', hint: 'Skateboard! W: sæt fart · A/D: styr · S: brems · Mellemrum: ollie' },
      { g: 0, w: 10, d: 30, dy: -0.5, coin: true },
      { t: 'coin', at: -20, y: 1.2 },
      { t: 'coin', at: -10, y: 1.2 },
      { turn: 15, g: 0, w: 9, d: 26, dy: -1, coin: true },
      { t: 'boost', g: 0, w: 6, d: 6, hint: 'Boost! De lysende pile giver fuld fart' },
      { turn: -20, g: 0, w: 7, d: 24, dy: -1, coin: true },
      { t: 'coin', at: -12, y: 1.2, x: 1.5 },
      { turn: 20, g: 0, w: 7, d: 24, dy: -1, coin: true },
      { t: 'coin', at: -12, y: 1.2, x: -1.5 },
      { turn: -15, g: 0, w: 8, d: 20, dy: -0.5, cp: true },
      { g: 0, w: 8, d: 4, dy: -1, v: 'stairs' },
      { g: 0, w: 8, d: 4, dy: -1, v: 'stairs' },
      { g: 0, w: 8, d: 4, dy: -1, v: 'stairs' },
      { g: 0, w: 8, d: 14, dy: -1, coin: true },
      { t: 'rail', g: 2.5, len: 12, dy: 0.5, hint: 'Gelænder! Hop op på det (mellemrum) og grind' },
      { g: 2.5, w: 8, d: 16, dy: -1, coin: true },
      { t: 'boost', g: 0, w: 6, d: 6 },
      { t: 'ramp', g: 0, w: 6, len: 6, rise: 1.6 },
      { g: 6, w: 10, d: 20, dy: -2.5, coin: true },
      { turn: 25, g: 0, shape: 'cyl', w: 14, dy: -0.5, v: 'bowl', coin: true },
      { turn: 25, g: 0, shape: 'cyl', w: 12, dy: -0.5, v: 'bowl' },
      { g: 0, w: 9, d: 18, dy: -0.5, cp: true, coin: true },
      { t: 'ramp', g: 0, w: 6, len: 6, rise: 1.4 },
      { g: 5, w: 8, d: 22, dy: -2, coin: true },
      { turn: -20, g: 0, w: 6, d: 24, dy: -1, coin: true },
      { t: 'rail', g: 2.5, len: 14, dy: 0.4 },
      { g: 2.5, w: 6, d: 18, dy: -1, coin: true },
      { turn: 20, g: 0, w: 8, d: 16, dy: -0.5, coin: true },
      { t: 'boost', g: 0, w: 6, d: 6, hint: 'Megarampen! Fuld fart over kløften', spd: 26 },
      { t: 'boost', g: 0, w: 6, d: 6, spd: 26 },
      { t: 'boost', g: 0, w: 6, d: 6, spd: 26 },
      { t: 'ramp', g: 0, w: 7, len: 8, rise: 3 },
      { t: 'coin', at: 6, y: 3 },
      { t: 'coin', at: 10, y: 3.5 },
      { t: 'coin', at: 14, y: 3 },
      { t: 'finish', g: 15, w: 14, d: 18, dy: -6, v: 'plaza' },
    ],
  },
  // ------------------------------------------------------------------ 7
  {
    name: 'Tandhjulsfabrikken',
    kit: 'clockwork',
    theme: 'clockwork',
    reward: 50,
    needsRope: false,
    needsDouble: false,
    chalkTip: false,
    skate: false,
    segs: [
      { t: 'start', w: 10, d: 10 },
      { g: 3, w: 6, d: 6, coin: true },
      { t: 'conveyor', g: 3, w: 5, d: 14, spd: -4, hint: 'Samlebåndet kører imod dig – spurt og hop af i enden' },
      { g: 4, w: 6, d: 6, dy: 0.5, coin: true },
      { t: 'rot', g: 3, w: 5, spd: 0.8, dy: 0.8, hint: 'Tandhjulene drejer hver sin vej – hop videre opad' },
      { t: 'rot', g: 3, w: 5, spd: -0.8, dy: 0.8 },
      { t: 'rot', g: 3, w: 5, spd: 0.9, dy: 0.8, coin: true },
      { t: 'rot', g: 3, w: 5, spd: -0.9, dy: 0.8 },
      { g: 3, w: 7, d: 7, dy: 0.5, cp: true },
      { g: 3, w: 3, d: 3, mv: { ax: 'y', amp: 1.5, per: 3, ph: 0 }, hint: 'Stempler! De går op og ned – hop, når de er i din højde' },
      { g: 3, w: 3, d: 3, mv: { ax: 'y', amp: 1.5, per: 3, ph: 0.33 }, coin: true },
      { g: 3, w: 3, d: 3, mv: { ax: 'y', amp: 1.5, per: 3, ph: 0.66 } },
      { g: 3, w: 6, d: 6 },
      { t: 'crumble', g: 3, w: 3, d: 3 },
      { t: 'crumble', g: 3, w: 3, d: 3, dy: 0.3 },
      { turn: 90, g: 3, w: 6, d: 6 },
      { t: 'vent', g: 3, w: 3, d: 3, lift: 10, hint: 'Damp! Stil dig i dampen, så løfter den dig – grib kanten foroven' },
      { g: 2, w: 5, d: 4, dy: 9, grab: true, coin: true },
      { t: 'vent', g: 2, w: 3, d: 3, lift: 10 },
      { g: 2, w: 6, d: 6, dy: 9, grab: true, cp: true },
      { t: 'bar', at: 0.6, y: 2.5, len: 8.5, ang: 0 },
      { t: 'coin', at: 4, y: 0.5 },
      { t: 'spin', g: 10, w: 7, spd: 0.6, dy: -0.5 },
      { g: 3, w: 6, d: 6, hint: 'Krankrogen svinger – grib den, sving med, og spring af mod urtårnet' },
      { t: 'bar', at: 2.5, y: 2.4, len: 3, ang: 90, x: -1.5, sw: { len: 5, amp: 30, per: 3 } },
      { g: 10, w: 6, d: 6, dy: -0.5, coin: true },
      { t: 'coin', at: 2, y: 6 },
      { g: 8.6, w: 6, d: 6, dy: 0.5, grab: true, coin: true },
      { t: 'finish', g: 3, w: 10, d: 10, dy: 1 },
    ],
  },
  // ------------------------------------------------------------------ 8
  {
    name: 'Junglekronerne',
    kit: 'jungle',
    theme: 'jungle',
    reward: 55,
    needsRope: true,
    needsDouble: false,
    chalkTip: false,
    skate: false,
    segs: [
      { t: 'start', w: 10, d: 10, v: 'treehouse' },
      { g: 3, w: 6, d: 6, coin: true },
      { t: 'bounce', g: 3, w: 3.4, d: 3.4, pow: 18 },
      { g: 5, w: 6, d: 6, dy: 5 },
      { g: 3, w: 8, d: 8, cp: true, hint: 'Det første sving! Vælg rebet (3), sigt på den lysende frøkapsel og venstreklik – sving over' },
      { t: 'anchor', at: 7, y: 8 },
      { g: 14, w: 8, d: 8, rope: true, coin: true },
      { turn: 35, shape: 'cyl', g: 6.5, w: 3.2, dy: 1.8, grab: true, v: 'fungus', hint: 'Moderstammen: hop mod svampene – hænderne griber kanten' },
      { turn: 35, shape: 'cyl', g: 6.5, w: 3.2, dy: 1.8, grab: true, v: 'fungus', coin: true },
      { turn: 35, shape: 'cyl', g: 6.5, w: 3.2, dy: 1.8, grab: true, v: 'fungus' },
      { turn: 35, shape: 'cyl', g: 6.5, w: 3.6, dy: 1.8, grab: true, v: 'fungus' },
      { turn: 35, g: 3, w: 6, d: 6, dy: 0.5, cp: true },
      { t: 'bar', at: 0.6, y: 2.5, len: 4, ang: 0 },
      { g: 5.2, w: 2.2, d: 2.2, v: 'stub' },
      { t: 'bar', at: 0.6, y: 2.5, len: 4, ang: 0 },
      { g: 5.2, w: 6, d: 6, coin: true },
      { t: 'crumble', g: 3, w: 3, d: 3 },
      { t: 'crumble', g: 3, w: 3, d: 3 },
      { turn: -40, g: 3, w: 7, d: 7 },
      { t: 'anchor', at: 9, y: 9 },
      { g: 18, w: 6, d: 6, rope: true, coin: true, cp: true },
      { t: 'bar', at: 2.5, y: 2.4, len: 3, ang: 90, x: -1.5, sw: { len: 5, amp: 30, per: 3 }, hint: 'Lianen! Grib den, sving med, og spring af (mellemrum) mod balkonen' },
      { g: 10, w: 6, d: 6, dy: -0.5, grab: true, v: 'treehouse', coin: true },
      { t: 'zip', at: -1, y: 3.4, len: 18, drop: 4 },
      { t: 'finish', g: 14, w: 10, d: 10, dy: -2.8 },
    ],
  },
  // ------------------------------------------------------------------ 9
  {
    name: 'Stormskibene',
    kit: 'stormships',
    theme: 'stormships',
    reward: 60,
    needsRope: true,
    needsDouble: false,
    chalkTip: false,
    skate: false,
    segs: [
      { t: 'start', w: 10, d: 10 },
      { g: 3, w: 7, d: 8, coin: true },
      { g: 4, w: 7, d: 8, mv: { ax: 'y', amp: 1.5, per: 4, ph: 0 }, grab: true, slick: true, hint: 'Skibene gynger! Grib rælingen, når dækket stiger – den er våd og glat' },
      { g: 4, w: 7, d: 8, mv: { ax: 'y', amp: 1.5, per: 4, ph: 0.33 }, grab: true, slick: true, coin: true },
      { g: 4, w: 7, d: 8, mv: { ax: 'y', amp: 1.5, per: 4, ph: 0.66 }, grab: true, slick: true },
      { turn: 40, g: 3, w: 7, d: 7, cp: true, hint: 'Ræstigen: hop op fra rå til rå (mellemrum uden retning hopper lige op)' },
      { t: 'bar', at: 0.6, y: 2.4, len: 3, ang: 90, x: -1.5 },
      { t: 'bar', at: 0.9, y: 3.6, len: 3, ang: 90, x: -1.5 },
      { t: 'bar', at: 1.2, y: 4.8, len: 3, ang: 90, x: -1.5 },
      { g: 2.6, w: 4, d: 6, dy: 3, coin: true },
      { t: 'crumble', g: 3, w: 2.5, d: 2.5, dy: -1 },
      { t: 'crumble', g: 3, w: 2.5, d: 2.5 },
      { g: 3, w: 7, d: 7, dy: -1 },
      { t: 'swing', g: 4, w: 3, d: 3, len: 8, amp: 30, per: 4, hint: 'Hop på ankeret, når det svinger mod dig' },
      { t: 'spin', g: 4, w: 7, spd: 0.8, coin: true },
      { g: 3, w: 6, d: 6, cp: true },
      { t: 'bar', at: 2.5, y: 2.4, len: 3, ang: 90, x: -1.5, sw: { len: 5, amp: 30, per: 3 } },
      { g: 10, w: 6, d: 6, dy: -0.5, grab: true, slick: true, coin: true },
      { turn: -40, g: 8.6, w: 7, d: 7, dy: 1, grab: true, hint: 'Langt spring! Hænderne griber mastetoppens kant' },
      { t: 'coin', at: 6, y: 6 },
      { t: 'anchor', at: 11, y: 10 },
      { t: 'finish', g: 22, w: 9, d: 9, dy: 2, rope: true },
    ],
  },
  // ------------------------------------------------------------------ 10
  {
    name: 'Himlens ende',
    kit: 'starfield',
    theme: 'starfield',
    reward: 70,
    needsRope: true,
    needsDouble: false,
    chalkTip: false,
    skate: false,
    segs: [
      { t: 'start', w: 9, d: 9 },
      { g: 3, w: 1.4, d: 1.4 },
      { g: 4, w: 1.3, d: 1.3, dy: 0.5 },
      { g: 4.5, w: 1.2, d: 1.2, coin: true },
      { t: 'crumble', g: 5, w: 1.4, d: 1.4, hint: 'Meteorkæden smuldrer – stop ikke!' },
      { t: 'crumble', g: 5, w: 1.4, d: 1.4 },
      { t: 'crumble', g: 5.5, w: 1.4, d: 1.4 },
      { t: 'crumble', g: 5, w: 1.4, d: 1.4, dy: 0.5 },
      { t: 'crumble', g: 5.5, w: 1.4, d: 1.4 },
      { t: 'crumble', g: 5, w: 1.4, d: 1.4, dy: -0.5, coin: true },
      { g: 5, w: 6, d: 6, cp: true, v: 'deck' },
      { t: 'anchor', at: 10, y: 9 },
      { g: 22, w: 1.4, d: 1.4, dy: -1, rope: true, grab: true, hint: 'Det store tomrum! Sving fra stjerne til stjerne – hænderne griber skærvens kant, hvis du slipper for tidligt' },
      { t: 'anchor', at: 10, y: 9 },
      { g: 24, w: 1.4, d: 1.4, rope: true, grab: true, coin: true },
      { t: 'anchor', at: 12, y: 10 },
      { g: 26, w: 5, d: 5, dy: 1, rope: true, grab: true, cp: true, v: 'deck' },
      { t: 'spin', g: 3, w: 6, spd: 0.5 },
      { t: 'bar', at: 0.6, y: 2.4, len: 9, ang: 0 },
      { g: 10.5, w: 1.4, d: 1.4 },
      { g: 4.5, w: 1.2, d: 1.2, dy: 0.5, mv: { ax: 'x', amp: 1.5, per: 5 } },
      { g: 4.5, w: 4, d: 4, cp: true, v: 'deck' },
      { turn: 40, shape: 'cyl', g: 4, w: 1.2, dy: 1, v: 'moon' },
      { turn: 40, shape: 'cyl', g: 4, w: 1.1, dy: 1, v: 'moon', coin: true },
      { turn: 40, shape: 'cyl', g: 4.5, w: 1.1, dy: 1, v: 'moon' },
      { turn: 40, shape: 'cyl', g: 4, w: 1.1, dy: 1, v: 'moon' },
      { turn: 40, shape: 'cyl', g: 4.5, w: 1.1, dy: 1, v: 'moon' },
      { turn: 40, g: 8.4, w: 7, d: 7, dy: 1, grab: true },
      { t: 'finish', g: 0.5, w: 8, d: 8, dy: 0.5 },
    ],
  },
  // ------------------------------------------------------------------ 11
  {
    name: 'Kirsebærtemplet',
    kit: 'temple',
    theme: 'temple',
    reward: 75,
    needsRope: true,
    needsDouble: true,
    chalkTip: false,
    skate: false,
    segs: [
      { t: 'start', w: 10, d: 10 },
      { g: 3, w: 7, d: 7, v: 'koi', coin: true, hint: 'Koispringet er for langt til et almindeligt hop – tryk mellemrum igen i luften!' },
      { g: 11, w: 6, d: 6, dbl: true, v: 'stone', coin: true },
      { turn: 30, g: 3, w: 9, d: 9, cp: true, hint: 'Pagodeklatringen: hop mod tagskægget – grib, klatr op, og gentag' },
      { g: 2, w: 8, d: 8, dy: 3.2, grab: true },
      { g: 2, w: 7, d: 7, dy: 3.2, grab: true, coin: true },
      { g: 2, w: 6, d: 6, dy: 3.2, grab: true },
      { t: 'rot', g: 2, w: 6, spd: 0.3, dy: 3.2, grab: true },
      { g: 3, w: 6, d: 6 },
      { t: 'anchor', at: 7.5, y: 7 },
      { g: 15, w: 7, d: 7, rope: true, cp: true, coin: true },
      { t: 'zip', at: -1, y: 3.4, len: 40, drop: 10, hint: 'Lanternesnoren! Grib snoren og glid ned' },
      { g: 36, w: 4, d: 10, dy: -8.8, v: 'bridge' },
      { g: 3, w: 6, d: 6, cp: true, hint: 'Toriitunnelen: grib bjælkerne og spring fra bjælke til bjælke (mellemrum + W)' },
      { t: 'bar', at: 1, y: 2.5, len: 3, ang: 90, x: -1.5 },
      { t: 'bar', at: 3, y: 2.5, len: 3, ang: 90, x: -1.5 },
      { t: 'bar', at: 5, y: 2.5, len: 3, ang: 90, x: -1.5 },
      { t: 'bar', at: 7, y: 2.5, len: 3, ang: 90, x: -1.5 },
      { g: 9, w: 3, d: 3, v: 'lantern', coin: true },
      { t: 'bar', at: 1, y: 2.5, len: 3, ang: 90, x: -1.5, v: 'bamboo' },
      { t: 'bar', at: 3, y: 2.5, len: 3, ang: 90, x: -1.5, v: 'bamboo' },
      { t: 'bar', at: 5, y: 2.5, len: 3, ang: 90, x: -1.5, v: 'bamboo' },
      { t: 'bar', at: 7, y: 2.5, len: 3, ang: 90, x: -1.5, v: 'bamboo' },
      { g: 9, w: 6, d: 6, coin: true },
      { turn: -30, g: 4, w: 6, d: 6, dy: 0.5 },
      { t: 'coin', at: 6.5, y: 4.5 },
      { g: 13, w: 7, d: 7, dy: 0.5, grab: true, dbl: true },
      { t: 'finish', g: 3, w: 10, d: 10, dy: 0.5, v: 'moongate' },
    ],
  },
  // ------------------------------------------------------------------ 12
  {
    name: 'Neonbyen',
    kit: 'neoncity',
    theme: 'neoncity',
    reward: 80,
    needsRope: true,
    needsDouble: true,
    chalkTip: false,
    skate: false,
    segs: [
      { t: 'start', w: 10, d: 10, v: 'helipad' },
      { g: 3, w: 8, d: 8, coin: true, hint: 'Myldretid! Hop fra bil til bil – brug dobbelthoppet, hvis du ramte forkert' },
      { g: 3.5, w: 3.5, d: 5, mv: { ax: 'x', amp: 4, per: 5, ph: 0 }, v: 'car' },
      { g: 3.5, w: 3.5, d: 5, mv: { ax: 'x', amp: 4, per: 5.5, ph: 0.5 }, v: 'car', coin: true },
      { g: 3.5, w: 3.5, d: 5, mv: { ax: 'x', amp: 4, per: 4.5, ph: 0.2 }, v: 'car' },
      { g: 3.5, w: 3.5, d: 5, mv: { ax: 'x', amp: 4, per: 6, ph: 0.7 }, v: 'car' },
      { g: 3.5, w: 3.5, d: 10, mv: { ax: 'x', amp: 4, per: 6, ph: 0.4 }, v: 'bus', grab: true, coin: true },
      { g: 3.5, w: 8, d: 8, cp: true, hint: 'Rullebåndene kører imod dig og på tværs' },
      { t: 'conveyor', g: 3, w: 5, d: 12, spd: -3 },
      { t: 'conveyor', g: 2, w: 8, d: 5, spd: 3, ax: 'x' },
      { t: 'conveyor', g: 2, w: 5, d: 12, spd: -3, coin: true },
      { turn: 90, g: 3, w: 6, d: 6, hint: 'Neonstigen: hop op fra skilt til skilt (mellemrum uden retning)' },
      { t: 'bar', at: 0.6, y: 2.4, len: 3, ang: 90, x: -1.5 },
      { t: 'bar', at: 0.9, y: 3.6, len: 3, ang: 90, x: -1.5 },
      { t: 'bar', at: 1.2, y: 4.8, len: 3, ang: 90, x: -1.5 },
      { g: 2.6, w: 5, d: 5, dy: 3, v: 'sign', coin: true },
      { t: 'vent', g: 2, w: 3, d: 3, lift: 9 },
      { g: 2, w: 7, d: 7, dy: 8, grab: true, cp: true, hint: 'Dronekrogen: skyd rebet i dronen, sving over og slip ind i el-kablet' },
      { t: 'anchor', at: 9, y: 8, ax: 'x', amp: 1, per: 4 },
      { t: 'zip', at: 19, y: 2, len: 16, drop: 5 },
      { g: 32, w: 7, d: 8, dy: -5.2, rope: true, coin: true },
      { turn: -60, g: 3, w: 6, d: 6 },
      { g: 12, w: 6, d: 6, dbl: true, coin: true },
      { g: 8.6, w: 7, d: 7, dy: 1, grab: true },
      { t: 'finish', g: 3, w: 10, d: 10, dy: 1, v: 'billboard' },
    ],
  },
  // ------------------------------------------------------------------ 13
  {
    name: 'Vulkanen',
    kit: 'volcano',
    theme: 'volcano',
    reward: 85,
    needsRope: true,
    needsDouble: true,
    chalkTip: false,
    skate: false,
    segs: [
      { t: 'start', w: 10, d: 10 },
      { g: 3, w: 6, d: 6, dy: -2, coin: true },
      { t: 'crumble', g: 2.5, w: 3, d: 3, dy: -3, hint: 'Askeskrænten smuldrer – løb ned uden at stoppe' },
      { t: 'crumble', g: 2.5, w: 3, d: 3, dy: -3 },
      { t: 'crumble', g: 2.5, w: 3, d: 3, dy: -3 },
      { t: 'crumble', g: 2.5, w: 3, d: 3, dy: -3 },
      { g: 3, w: 7, d: 7, dy: -3, cp: true, hint: 'Basaltorglet: søjlerne stiger og synker i en bølge – løb med bølgen' },
      { shape: 'cyl', g: 2.5, w: 3, dy: -0.5, mv: { ax: 'y', amp: 2, per: 4, ph: 0 }, v: 'hex' },
      { shape: 'cyl', g: 2.5, w: 3, dy: 0, mv: { ax: 'y', amp: 2, per: 4, ph: 0.125 }, v: 'hex' },
      { shape: 'cyl', g: 2.5, w: 3, dy: 0, mv: { ax: 'y', amp: 2, per: 4, ph: 0.25 }, v: 'hex' },
      { shape: 'cyl', g: 2.5, w: 3, dy: 0, mv: { ax: 'y', amp: 2, per: 4, ph: 0.375 }, v: 'hex', coin: true },
      { shape: 'cyl', g: 2.5, w: 3, dy: 0, mv: { ax: 'y', amp: 2, per: 4, ph: 0.5 }, v: 'hex' },
      { shape: 'cyl', g: 2.5, w: 3, dy: 0, mv: { ax: 'y', amp: 2, per: 4, ph: 0.625 }, v: 'hex' },
      { shape: 'cyl', g: 2.5, w: 3, dy: 0, mv: { ax: 'y', amp: 2, per: 4, ph: 0.75 }, v: 'hex', coin: true },
      { shape: 'cyl', g: 2.5, w: 3, dy: 0, mv: { ax: 'y', amp: 2, per: 4, ph: 0.875 }, v: 'hex' },
      { g: 3, w: 7, d: 7, cp: true, hint: 'Skorpen revner! Løb over pladerne og grib kæden' },
      { t: 'crumble', g: 3, w: 4, d: 4, dy: -4, v: 'crust' },
      { t: 'crumble', g: 3, w: 4, d: 4, dy: -4, v: 'crust' },
      { t: 'crumble', g: 3, w: 4, d: 4, dy: -4, v: 'crust', coin: true },
      { t: 'bar', at: 0.6, y: 2.5, len: 8, ang: 0 },
      { g: 10, w: 6, d: 6, cp: true, hint: 'Lavafaldet: sving i rebet forbi faldet og grib den varme kant' },
      { t: 'anchor', at: 9, y: 9 },
      { g: 18, w: 4, d: 4, dy: 2, rope: true, grab: true, slick: true, coin: true, v: 'ledge' },
      { g: 3, w: 5, d: 5, dy: 0.5 },
      { t: 'vent', g: 3, w: 3, d: 3, lift: 10, hint: 'Varmeventil! Lad den løfte dig op ad flanken' },
      { g: 2, w: 5, d: 5, dy: 9, grab: true, slick: true },
      { shape: 'cyl', g: 3, w: 3, dy: 2, mv: { ax: 'y', amp: 1.5, per: 3.5, ph: 0 }, v: 'hex' },
      { shape: 'cyl', g: 3, w: 3, dy: 2, mv: { ax: 'y', amp: 1.5, per: 3.5, ph: 0.5 }, v: 'hex', coin: true },
      { g: 3, w: 7, d: 7, dy: 1, cp: true, hint: 'Udbruddet: gejseren kaster dig op – dobbelthop i toppen og grib kraterkanten' },
      { t: 'bounce', g: 3, w: 3.4, d: 3.4, pow: 22 },
      { g: 8, w: 7, d: 7, dy: 14, grab: true, dbl: true, coin: true, v: 'rim' },
      { t: 'finish', g: 2, w: 10, d: 10, dy: 0.5, v: 'rim' },
    ],
  },
  // ------------------------------------------------------------------ 14
  {
    name: 'Himmelhavet',
    kit: 'skyreef',
    theme: 'skyreef',
    reward: 90,
    needsRope: true,
    needsDouble: true,
    chalkTip: false,
    skate: false,
    segs: [
      { t: 'start', w: 10, d: 10 },
      { g: 3, w: 7, d: 7, coin: true, hint: 'Goplerne kaster dig op – grib bordkorallens kant' },
      { t: 'bounce', g: 3, w: 3.2, d: 3.2, pow: 16, mv: { ax: 'y', amp: 0.8, per: 3, ph: 0 } },
      { g: 4, w: 4.5, d: 4.5, dy: 4, grab: true },
      { t: 'bounce', g: 3, w: 3.2, d: 3.2, pow: 16, mv: { ax: 'y', amp: 0.8, per: 3, ph: 0.33 } },
      { g: 4, w: 4.5, d: 4.5, dy: 4, grab: true, coin: true },
      { t: 'bounce', g: 3, w: 3.2, d: 3.2, pow: 16, mv: { ax: 'y', amp: 0.8, per: 3, ph: 0.66 } },
      { g: 4, w: 4.5, d: 4.5, dy: 4, grab: true, cp: true },
      { g: 3, w: 6, d: 6, hint: 'Hvalskelettet: sving fra ribben til ribben – hvil på hvirvlerne' },
      { t: 'bar', at: 1, y: 2.5, len: 3, ang: 90, x: -1.5 },
      { t: 'bar', at: 3.2, y: 2.5, len: 3, ang: 90, x: -1.5 },
      { t: 'bar', at: 5.4, y: 2.5, len: 3, ang: 90, x: -1.5 },
      { t: 'bar', at: 7.6, y: 2.5, len: 3, ang: 90, x: -1.5 },
      { g: 9, w: 2.6, d: 2.6, v: 'vertebra', coin: true },
      { t: 'bar', at: 1, y: 2.5, len: 3, ang: 90, x: -1.5 },
      { t: 'bar', at: 3.2, y: 2.5, len: 3, ang: 90, x: -1.5 },
      { t: 'bar', at: 5.4, y: 2.5, len: 3, ang: 90, x: -1.5 },
      { t: 'bar', at: 7.6, y: 2.5, len: 3, ang: 90, x: -1.5 },
      { g: 9, w: 2.6, d: 2.6, v: 'vertebra' },
      { t: 'bar', at: 1, y: 2.5, len: 3, ang: 90, x: -1.5 },
      { t: 'bar', at: 3.2, y: 2.5, len: 3, ang: 90, x: -1.5 },
      { t: 'bar', at: 5.4, y: 2.5, len: 3, ang: 90, x: -1.5 },
      { t: 'bar', at: 7.6, y: 2.5, len: 3, ang: 90, x: -1.5 },
      { g: 9, w: 6, d: 6, cp: true, coin: true, hint: 'Mantaturen: hop på mantaen, rid med, og dobbelthop over til skildpadden' },
      { t: 'conveyor', g: 3, w: 5, d: 12, spd: 3 },
      { g: 3, w: 5, d: 7, mv: { ax: 'z', amp: 9, per: 10, ph: 0 }, v: 'manta' },
      { g: 18, w: 5, d: 5, mv: { ax: 'x', amp: 1.5, per: 6 }, v: 'turtle', grab: true, dbl: true, coin: true },
      { g: 3, w: 6, d: 6, cp: true, hint: 'Perlesvinget: tang, reb og boblesøjle' },
      { t: 'bar', at: 2.5, y: 2.4, len: 3, ang: 90, x: -1.5, sw: { len: 5, amp: 30, per: 3 } },
      { g: 10, w: 5, d: 5, dy: -0.5, grab: true },
      { t: 'anchor', at: 9, y: 8 },
      { g: 18, w: 6, d: 6, rope: true, coin: true },
      { g: 12.5, w: 5, d: 5, dbl: true, coin: true, hint: 'For langt til ét hop – dobbelthop!' },
      { t: 'wind', at: 2.5, y: -6, r: 2, h: 18 },
      { g: 6, w: 6, d: 6, dy: 7 },
      { t: 'finish', g: 3, w: 10, d: 10, dy: 0.5, v: 'clam' },
    ],
  },
  // ------------------------------------------------------------------ 15
  {
    name: 'Nordlystårnet',
    kit: 'crystalspire',
    theme: 'crystalspire',
    reward: 100,
    needsRope: true,
    needsDouble: true,
    chalkTip: false,
    skate: false,
    segs: [
      { t: 'start', w: 10, d: 10, hint: 'Nordlystårnet! Klatr hele vejen rundt om tårnet til kronen' },
      { turn: 22, g: 3.5, w: 4.5, d: 4.5, dy: 1.2, v: 'glass' },
      { turn: 22, g: 3.5, w: 4.5, d: 4.5, dy: 1.2, v: 'glass' },
      { turn: 22, g: 3.5, w: 4.5, d: 4.5, dy: 1.2, v: 'glass', coin: true },
      { turn: 22, g: 3.5, w: 4.5, d: 4.5, dy: 1.2, v: 'glass' },
      { turn: 22, g: 8.5, w: 5, d: 5, dy: 1, grab: true, slick: true, v: 'frost', hint: 'Frostglas er glat – kridt hjælper hænderne' },
      { turn: 22, g: 3, w: 4, d: 4, dy: 1, v: 'frost' },
      { t: 'crumble', turn: 22, g: 3, w: 3, d: 3, dy: 0.8 },
      { t: 'crumble', turn: 22, g: 3, w: 3, d: 3, dy: 0.8 },
      { t: 'crumble', turn: 22, g: 3, w: 3, d: 3, dy: 0.8 },
      { turn: 22, g: 3, w: 6, d: 6, dy: 1, cp: true, v: 'balcony', hint: 'Lysekronerne svinger – hop på, når de kommer tæt på' },
      { t: 'swing', turn: 22, g: 4, w: 4, d: 4, len: 8, amp: 25, per: 4 },
      { t: 'swing', g: 4, w: 4, d: 4, len: 8, amp: 25, per: 4.5 },
      { g: 4, w: 5, d: 5, dy: 1, v: 'glass', coin: true },
      { turn: 22, g: 3.5, w: 4, d: 4, dy: 1.5, v: 'glass' },
      { turn: 22, g: 3.5, w: 4, d: 4, dy: 1.5, v: 'glass' },
      { turn: 22, g: 3.5, w: 4, d: 4, dy: 1.5, v: 'glass' },
      { turn: 22, g: 3, w: 7, d: 7, dy: 1, cp: true, v: 'balcony', hint: 'Guldringene drejer hver sin vej' },
      { t: 'rot', turn: 22, shape: 'cyl', g: 3, w: 6, spd: 0.5, dy: 1, v: 'gold' },
      { t: 'rot', turn: 22, shape: 'cyl', g: 3, w: 6, spd: -0.6, dy: 1, v: 'gold', coin: true },
      { t: 'rot', turn: 22, shape: 'cyl', g: 3, w: 6, spd: 0.7, dy: 1, v: 'gold' },
      { t: 'spin', turn: 22, g: 3, w: 7, spd: 0.7, dy: 1 },
      { turn: 22, g: 3, w: 5, d: 5, dy: 1, v: 'gold' },
      { t: 'bar', at: 0.6, y: 2.5, len: 6, ang: 0 },
      { g: 7.5, w: 5, d: 5, v: 'gold', coin: true },
      { turn: 22, g: 3, w: 5, d: 5, dy: 1 },
      { t: 'zip', at: -1, y: 3.4, len: 16, drop: 3 },
      { g: 13, w: 7, d: 7, dy: -4.6000000000000005, v: 'balcony', cp: true },
      { t: 'bar', at: 2.5, y: 2.4, len: 3, ang: 90, x: -1.5, sw: { len: 5, amp: 30, per: 3 } },
      { g: 10, w: 5, d: 5, dy: -0.5, grab: true, v: 'gold' },
      { turn: 22, g: 3.5, w: 4, d: 4, dy: 1.5, v: 'glass' },
      { turn: 22, g: 3.5, w: 4, d: 4, dy: 1.5, v: 'gold' },
      { turn: 22, g: 3.5, w: 4, d: 4, dy: 1.5, v: 'glass' },
      { turn: 22, g: 3, w: 6, d: 6, dy: 1, cp: true, v: 'balcony', hint: 'Kronen: prismer, lysstråler – og til sidst det store reb-spring' },
      { turn: 22, g: 12, w: 5, d: 5, dy: 1, dbl: true, v: 'prism', coin: true },
      { t: 'vent', turn: 22, g: 3, w: 3, d: 3, lift: 10 },
      { g: 2, w: 5, d: 5, dy: 9, grab: true, v: 'prism' },
      { turn: 22, g: 12, w: 5, d: 5, dy: 1, dbl: true, v: 'prism' },
      { turn: 22, g: 3, w: 4, d: 4, dy: 1.2, v: 'glass' },
      { turn: 22, g: 3, w: 7, d: 7, dy: 1, cp: true, v: 'balcony', hint: 'Kronespringet: sving i rebet, slip, dobbelthop – og grib kronens kant!' },
      { t: 'anchor', at: 11, y: 10 },
      { g: 22, w: 6, d: 6, dy: 2, rope: true, grab: true, dbl: true, v: 'crown', coin: true },
      { t: 'finish', g: 1, w: 10, d: 10, dy: 0.5, v: 'crown' },
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

/* =====================================================================
   9b. VERDENS-SÆT (world kits)
   Hver bane kan have sit eget udseende. Et sæt er ren grafik: fysikken er
   altid kasser/cylindre, som banebyggeren bestemmer. Kontrakten:
     WORLD_KITS[id] = { id, name, create(ctx) -> {
       platform(p) -> Object3D   (påkrævet; lokalt koordinatsystem, se nedenfor)
       bar(b)      -> Object3D   (valgfri; stang langs lokal X, længde b.len)
       anchor()    -> Object3D   (valgfri; krogpunkt til rebet)
       decor(data) -> Object3D   (valgfri; baggrund i verdenskoordinater)
       update(dt, t)             (valgfri; animation hver frame)
       ventColor                 (valgfri; farve på opvindens partikler)
     } }
   platform(p): origo = centrum af kollisionslegemet. Kasse: p.w langs X,
   p.h langs Y (top i +p.h/2), p.d langs Z (banens retning er -Z). Cylinder:
   diameter p.w. Rampe: kasse p.w x p.h x p.slopeLen (motoren hælder den).
   Mesh'er, der viser selve det faste legeme, markeres userData.solid = true.
   Intet må stikke mere end 4 cm op over toppen inden for fodaftrykket.
   ===================================================================== */
const WORLD_KITS = {};
window.SKYHOJ_KITS = WORLD_KITS;
window.SKYHOJ_THEMES = THEMES;
const SHARED_GPU = new Set(); // delte materialer/teksturer, der aldrig må frigives sammen med en bane

function markSharedGpu() {
  for (const m of Object.values(MAT)) SHARED_GPU.add(m);
  for (const t of Object.values(TEX)) (Array.isArray(t) ? t : [t]).forEach((x) => SHARED_GPU.add(x));
}

// Hjælpere til sættenes kulisser: hold banen fri, og find ud af, hvor dybt noget må hænge ned under en platform
function courseHelpers(data) {
  const pr = (p) => (p.shape === 'cyl' ? p.w / 2 : Math.hypot(p.w, p.d) / 2);
  const segs = [];
  for (let i = 0; i + 1 < data.plats.length; i++) {
    const a = data.plats[i], b = data.plats[i + 1];
    segs.push({ ax: a.x, az: a.z, ay: a.top, ar: pr(a), bx: b.x, bz: b.z, by: b.top, br: pr(b) });
  }
  for (const b of data.bars) {
    segs.push({ ax: b.x - (b.dx * b.len) / 2, az: b.z - (b.dz * b.len) / 2, ay: b.y - 2, ar: 1.5, bx: b.x + (b.dx * b.len) / 2, bz: b.z + (b.dz * b.len) / 2, by: b.y - 2, br: 1.5 });
  }
  for (const z of data.zips) segs.push({ ax: z.ax, az: z.az, ay: z.ay - 2, ar: 1.5, bx: z.bx, bz: z.bz, by: z.by - 2, br: 1.5 });
  return {
    // true, hvis punktet (x, y, z) ligger mindst `margin` meter fra banens "korridor" (platforme, stænger, svævebaner)
    clearOfCourse(x, y, z, margin = 4) {
      for (const s of segs) {
        const dx = s.bx - s.ax, dz = s.bz - s.az, L2 = dx * dx + dz * dz;
        const t = L2 > 0 ? clamp(((x - s.ax) * dx + (z - s.az) * dz) / L2, 0, 1) : 0;
        const cy = s.ay + (s.by - s.ay) * t;
        if (y < cy - 9 || y > cy + 12) continue;
        const r = s.ar + (s.br - s.ar) * t + margin;
        const hx = s.ax + dx * t - x, hz = s.az + dz * t - z;
        if (hx * hx + hz * hz < r * r) return false;
      }
      return true;
    },
    // Hvor mange meter under platformens bund er der frit (før en anden del af banen eller lavaen)?
    freeBelow(p) {
      const bottom = p.top - p.h, rp = pr(p);
      let free = bottom - CFG.lavaY + 2;
      for (const q of data.plats) {
        if (q === p || q.top >= bottom) continue;
        if (Math.hypot(q.x - p.x, q.z - p.z) < rp + pr(q) + 2.5) free = Math.min(free, bottom - (q.top + 4.5));
      }
      return Math.max(0, free);
    },
  };
}

function makeKitContext(level) {
  return {
    ...courseHelpers(level.data),
    lavaY: CFG.lavaY,
    THREE, TEX, MAT, DEG, clamp, lerp, damp, mulberry32,
    rng: mulberry32(4242 + level.index * 131),
    boxGeometry, cylGeometry, rockGeometry, makeCanvas, toTexture, paintPixels, tileNoise, textTexture,
    fwdVec, rightVec,
    theme: level.theme,
    levelIndex: level.index,
    levelName: level.def.name,
    track: (o) => { level.disposables.push(o); return o; },
  };
}

// Standard-sættet: svævende stenøer (bruges også som reserve for alt, et sæt ikke tegner)
WORLD_KITS.sten = {
  id: 'sten',
  name: 'Svævende sten',
  create(ctx) {
    const { THREE, MAT, TEX } = ctx;
    // Transportbånd: gummibånd med pile (tekstur rulles i update)
    let beltTex = null, beltMat = null, grateMat = null;
    const belt = () => {
      if (beltMat) return beltMat;
      const c = ctx.makeCanvas(128, 256), g = c.getContext('2d');
      g.fillStyle = '#26292e'; g.fillRect(0, 0, 128, 256);
      g.fillStyle = '#3a3f46';
      for (let y = 0; y < 256; y += 16) g.fillRect(0, y, 128, 3);
      g.fillStyle = '#f2b705';
      for (const y0 of [40, 168]) {
        g.beginPath(); g.moveTo(64, y0); g.lineTo(104, y0 + 40); g.lineTo(84, y0 + 40); g.lineTo(64, y0 + 20);
        g.lineTo(44, y0 + 40); g.lineTo(24, y0 + 40); g.closePath(); g.fill();
      }
      beltTex = ctx.track(ctx.toTexture(c));
      beltMat = ctx.track(new THREE.MeshStandardMaterial({ map: beltTex, roughness: 0.85 }));
      return beltMat;
    };
    const grate = () => {
      if (grateMat) return grateMat;
      const c = ctx.makeCanvas(128), g = c.getContext('2d');
      g.fillStyle = '#1b1f24'; g.fillRect(0, 0, 128, 128);
      g.fillStyle = '#8a95a3';
      for (let i = 0; i < 128; i += 16) { g.fillRect(i, 0, 5, 128); g.fillRect(0, i, 128, 5); }
      grateMat = ctx.track(new THREE.MeshStandardMaterial({ map: ctx.track(ctx.toTexture(c)), roughness: 0.5, metalness: 0.7 }));
      return grateMat;
    };
    const belts = [];
    return {
      ventColor: '#ffffff',
      platform(p) {
        const group = new THREE.Group();
        let top = MAT.stoneTop, side = MAT.rock, bottom = MAT.rock, tile = 3, tileTop = true, sideTile = 3;
        switch (p.type) {
          case 'ice': top = MAT.iceTop; side = MAT.iceSide; bottom = MAT.iceSide; break;
          case 'crumble': top = MAT.crumble; side = MAT.crumble; bottom = MAT.crumble; tile = 2.5; sideTile = 2.5; break;
          case 'move': case 'swing': top = MAT.metalTop; side = MAT.metalSide; bottom = MAT.metalSide; tileTop = false; sideTile = p.h; break;
          case 'bounce': top = MAT.bounceTop; side = MAT.bounceSide; bottom = MAT.bounceSide; tileTop = false; break;
          case 'conveyor': top = belt(); side = MAT.metalSide; bottom = MAT.metalSide; tile = 2; sideTile = p.h; break;
          case 'vent': top = grate(); side = MAT.metalSide; bottom = MAT.metalSide; tile = 1; sideTile = p.h; break;
          case 'rot': side = MAT.hub; break;
          case 'ramp': case 'rail': case 'boost': top = MAT.metalTop; side = MAT.hub; bottom = MAT.hub; tileTop = false; break;
          default: break;
        }
        const depth = p.type === 'ramp' ? p.slopeLen : p.d;
        let main;
        if (p.shape === 'cyl') main = new THREE.Mesh(ctx.track(ctx.cylGeometry(p.w / 2, p.h, tile, { tileTop })), [side, top, bottom]);
        else main = new THREE.Mesh(ctx.track(ctx.boxGeometry(p.w, p.h, depth, tile, { tileTop, sideTile })), [side, side, top, bottom, side, side]);
        main.userData.solid = true;
        group.add(main);
        if (p.type === 'conveyor') belts.push(p);
        const minDim = Math.min(p.w, p.d);
        if (['p', 'start', 'finish', 'ice', 'spin', 'rot'].includes(p.type) && minDim >= 2.4) {
          const r = minDim * 0.5, dep = ctx.clamp(minDim * 1.2, 2, 10);
          const rock = new THREE.Mesh(ctx.track(ctx.rockGeometry(r, dep, p.seed)), p.type === 'ice' ? MAT.iceSide : MAT.rock);
          rock.position.y = -p.h / 2 - dep / 2 + 0.02;
          if (p.shape !== 'cyl') rock.scale.set((p.w / minDim) * 0.97, 1, (p.d / minDim) * 0.97);
          group.add(rock);
        }
        if (p.type === 'move' || p.type === 'swing') { // antigrav-glød under svævende metalplader
          const glow = new THREE.Mesh(ctx.track(new THREE.PlaneGeometry(1, 1)), ctx.track(new THREE.MeshBasicMaterial({
            map: TEX.glow, color: '#59d8ff', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
          })));
          glow.rotation.x = Math.PI / 2;
          glow.scale.set(p.w * 1.3, p.d * 1.3, 1);
          glow.position.y = -p.h / 2 - 0.15;
          glow.userData.noCastShadow = true;
          group.add(glow);
        }
        if (p.type === 'spin') {
          const hub = new THREE.Mesh(ctx.track(new THREE.CylinderGeometry(0.22, 0.3, 0.8, 16)), MAT.hub);
          hub.position.y = p.h / 2 + 0.4;
          group.add(hub);
        }
        return group;
      },
      bar(b) {
        const m = new THREE.Mesh(ctx.track(new THREE.CylinderGeometry(b.r, b.r, b.len, 12)), MAT.hook);
        m.rotation.z = Math.PI / 2;
        const g = new THREE.Group();
        g.add(m);
        for (const sx of [-1, 1]) { // ophæng i enderne
          const cap = new THREE.Mesh(ctx.track(new THREE.SphereGeometry(b.r * 1.8, 10, 8)), MAT.hub);
          cap.position.x = (sx * b.len) / 2;
          g.add(cap);
        }
        return g;
      },
      update(dt) {
        if (beltTex && belts.length) beltTex.offset.y -= dt * (belts[0].belt / 2);
      },
    };
  },
};

/* ===== VERDENSSÆT START (genereret – se dokumentationen) ===== */

/* =====================================================================
   9c. VERDENERNE – ét verdenssæt (og ét himmeltema) pr. bane
   ===================================================================== */

// ---------------------------------------------------------------- fælles værktøjskasse
/* =====================================================================
   Fælles værktøjskasse for verdenssættene: teksturer på lærred,
   platformblokke, underbygninger der holder sig inden for fodaftrykket,
   kulisser der holder banen fri, og små geometrihjælpere.
   Brug: const L = window.SKYHOJ_KITLIB(ctx) inde i create(ctx).
   ===================================================================== */
(function () {
  'use strict';
  window.SKYHOJ_KITLIB = function (ctx) {
    const { THREE } = ctx;
    const TAU = Math.PI * 2;
    const tr = (o) => ctx.track(o);
    const L = { TAU, tr };

    // ---- Materialer
    L.std = (o) => tr(new THREE.MeshStandardMaterial(o));
    L.phys = (o) => tr(new THREE.MeshPhysicalMaterial(o));
    L.basic = (o) => tr(new THREE.MeshBasicMaterial(o));
    L.glow = (color, opacity = 0.8) => tr(new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending }));

    // ---- Teksturer: tegn på et lærred og lav en gentagende tekstur
    L.tex = (size, paint, opts = {}) => {
      const c = ctx.makeCanvas(size, opts.h || size), g = c.getContext('2d');
      paint(g, size, opts.h || size);
      return tr(ctx.toTexture(c, { srgb: opts.srgb !== false, repeat: opts.repeat !== false }));
    };
    // Prikket støj (sten, sand, frosting …) i et sæt farver
    L.speckle = (g, w, h, colors, n, rMin, rMax, rng) => {
      for (let i = 0; i < n; i++) {
        g.fillStyle = colors[Math.floor(rng() * colors.length)];
        g.globalAlpha = 0.25 + rng() * 0.55;
        g.beginPath();
        g.arc(rng() * w, rng() * h, rMin + rng() * (rMax - rMin), 0, TAU);
        g.fill();
      }
      g.globalAlpha = 1;
    };
    // Revner (smuldrende platforme viser altid revner)
    L.cracks = (g, w, h, color, n, rng, width = 3) => {
      g.strokeStyle = color; g.lineCap = 'round'; g.lineJoin = 'round';
      for (let i = 0; i < n; i++) {
        let x = rng() * w, y = rng() * h, a = rng() * TAU;
        g.lineWidth = width * (0.6 + rng() * 0.8);
        g.beginPath(); g.moveTo(x, y);
        for (let k = 0; k < 7; k++) { a += (rng() - 0.5) * 1.3; x += Math.cos(a) * w * 0.08; y += Math.sin(a) * h * 0.08; g.lineTo(x, y); }
        g.stroke();
      }
    };
    L.fill = (g, w, h, color) => { g.fillStyle = color; g.fillRect(0, 0, w, h); };
    L.grad = (g, w, h, stops, vertical = true) => {
      const gr = vertical ? g.createLinearGradient(0, 0, 0, h) : g.createLinearGradient(0, 0, w, 0);
      stops.forEach(([o, c]) => gr.addColorStop(o, c));
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    };
    // Gitter (ventiler) og bånd med pile (transportbånd)
    L.grateTex = (bg, bar) => L.tex(128, (g, S) => {
      L.fill(g, S, S, bg); g.fillStyle = bar;
      for (let i = 0; i < S; i += 16) { g.fillRect(i, 0, 5, S); g.fillRect(0, i, S, 5); }
    });
    L.beltTex = (bg, stripe, arrow) => L.tex(128, (g, S) => {
      L.fill(g, S, S, bg); g.fillStyle = stripe;
      for (let y = 0; y < S; y += 16) g.fillRect(0, y, S, 3);
      g.fillStyle = arrow;
      for (const y0 of [24, 88]) { g.beginPath(); g.moveTo(64, y0); g.lineTo(100, y0 + 30); g.lineTo(82, y0 + 30); g.lineTo(64, y0 + 14); g.lineTo(46, y0 + 30); g.lineTo(28, y0 + 30); g.closePath(); g.fill(); }
    });

    // ---- Platformens hovedkrop (præcis kollisionskassen); markeres som fast flade
    L.block = (p, mats, tile = 2, opts = {}) => {
      const depth = p.type === 'ramp' ? p.slopeLen : p.d;
      const g = p.shape === 'cyl'
        ? ctx.cylGeometry(p.w / 2, p.h, tile, { tileTop: opts.tileTop !== false, segments: opts.segments || 40 })
        : ctx.boxGeometry(p.w, p.h, depth, tile, { tileTop: opts.tileTop !== false, sideTile: opts.sideTile || tile });
      const side = mats.side, top = mats.top || side, bottom = mats.bottom || side;
      const m = new THREE.Mesh(tr(g), p.shape === 'cyl' ? [side, top, bottom] : [side, side, top, bottom, side, side]);
      m.userData.solid = true;
      return m;
    };
    // Hvor dybt må noget hænge under platformen (holder resten af banen fri)
    L.depth = (p, want) => Math.max(0, Math.min(want, ctx.freeBelow(p)));
    // Tilspidset underbygning (kegle/pyramide) inden for fodaftrykket
    L.under = (p, mat, want, opts = {}) => {
      const depth = L.depth(p, want);
      if (depth < 0.4) return null;
      const seg = p.shape === 'cyl' ? (opts.segments || 24) : 4;
      const tip = opts.tip ?? 0.08;
      const g = new THREE.CylinderGeometry(1, tip, depth, seg, opts.rows || 4, false);
      if (p.shape !== 'cyl') g.rotateY(Math.PI / 4);
      const k = p.shape === 'cyl' ? p.w / 2 * 0.97 : 0.97 / Math.SQRT2;
      g.scale(p.shape === 'cyl' ? k : p.w * k, 1, p.shape === 'cyl' ? k : p.d * k);
      if (opts.jitter) {
        const P = g.attributes.position, rng = ctx.mulberry32(p.seed);
        for (let i = 0; i < P.count; i++) {
          const y = P.getY(i);
          if (y > depth / 2 - 0.01) continue;
          const f = 1 + (rng() - 0.5) * opts.jitter;
          P.setX(i, P.getX(i) * f); P.setZ(i, P.getZ(i) * f);
        }
        g.computeVertexNormals();
      }
      g.translate(0, -p.h / 2 - depth / 2 + 0.01, 0);
      return new THREE.Mesh(tr(g), mat);
    };
    // Lodret søjle/bygning under platformen (samme fodaftryk, evt. lidt indrykket)
    L.pillar = (p, mat, want, inset = 0, tile = 2) => {
      const depth = L.depth(p, want);
      if (depth < 0.4) return null;
      const g = p.shape === 'cyl'
        ? ctx.cylGeometry(Math.max(0.1, p.w / 2 - inset), depth, tile, { tileTop: false })
        : ctx.boxGeometry(Math.max(0.1, p.w - inset * 2), depth, Math.max(0.1, p.d - inset * 2), tile, { tileTop: false });
      g.translate(0, -p.h / 2 - depth / 2, 0);
      return new THREE.Mesh(tr(g), mat);
    };

    // ---- Kulisser: find steder, der ikke ligger i banen
    L.place = (data, rng, n, rMin, rMax, yMin, yMax, margin, fn) => {
      const b = data.bounds;
      let made = 0;
      for (let i = 0; i < n * 6 && made < n; i++) {
        const a = rng() * TAU, r = rMin + rng() * (rMax - rMin);
        const x = b.cx + Math.cos(a) * r, z = b.cz + Math.sin(a) * r, y = yMin + rng() * (yMax - yMin);
        if (!ctx.clearOfCourse(x, y, z, margin)) continue;
        fn(x, y, z, a, made++);
      }
      return made;
    };
    // Mange ens ting i ét draw call
    L.instanced = (geo, mat, list, castShadow = false) => {
      const m = new THREE.InstancedMesh(tr(geo), mat, Math.max(1, list.length));
      const o = new THREE.Object3D();
      list.forEach((t, i) => {
        o.position.set(t.x, t.y, t.z);
        o.rotation.set(t.rx || 0, t.ry || 0, t.rz || 0);
        const s = t.s || 1;
        o.scale.set(t.sx || s, t.sy || s, t.sz || s);
        o.updateMatrix();
        m.setMatrixAt(i, o.matrix);
      });
      m.count = list.length;
      m.castShadow = castShadow;
      m.userData.noCastShadow = !castShadow;
      return m;
    };
    // Rør/kabel langs en kurve
    L.tube = (pts, r, mat, seg = 40) => new THREE.Mesh(tr(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), seg, r, 8)), mat);
    // Drejet profil (vaser, svampe, lanterner …): pts = [[r, y], …]
    L.lathe = (pts, mat, seg = 24) => new THREE.Mesh(tr(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg)), mat);
    // Stjernehimmel/partikler som punkter langt væk (uden tåge)
    L.points = (positions, color, size, opacity = 1) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      return new THREE.Points(tr(g), tr(new THREE.PointsMaterial({ color, size, sizeAttenuation: false, transparent: true, opacity, fog: false, depthWrite: false })));
    };
    // En stang (cylinder langs lokal X)
    L.barMesh = (b, mat, r = b.r) => new THREE.Mesh(tr(new THREE.CylinderGeometry(r, r, b.len, 12).rotateZ(Math.PI / 2)), mat);
    return L;
  };
})();

// ---------------------------------------------------------------- meadow
/* =====================================================================
   VERDENSSÆT 'meadow' – Himmelengen (bane 1)
   Daggry over svævende gårdøer: græstørv på jordkegler med rødder og
   vandfald, plankebroer, høballer, rød lade, veranda, savet træstamme,
   svampe, vindmølle, får, æbletræ, menhirer, luftballon og morgendis.
   Ingen grå sten nogen steder: kun jord, træ, strå, tegl og mos.
   ===================================================================== */
(function () {
  'use strict';

  // Daggry: bleg blå zenit, fersken horisont, lav varm sol og dis
  window.SKYHOJ_THEMES.meadow = {
    top: '#7fb8e8', horizon: '#ffd9a8', bottom: '#f4c9a0', sunElev: 10, sunAz: 55, sunColor: '#ffd9a6', sunInt: 2.8,
    hemiSky: '#d6e6ff', hemiInt: 1.0, fog: '#f7dcbe', fogNear: 70, fogFar: 560, cloud: '#fff1e2', clouds: 0.9, stars: 0.12,
    stone: '#dcc9a0', exposure: 1.04, lavaGlow: 0.8,
  };

  window.SKYHOJ_KITS.meadow = {
    id: 'meadow',
    name: 'Himmelengen',
    variants: {
      turf: 'Græstørv med blomsterprikker på en jordkegle med rødder og tyndt vandfald (standard for p). Kasse eller shape:"cyl", w 4-12',
      flowers: 'Blomsterengen: som turf, men med tætte valmuer, tusindfryd og kløver. Kasse/cyl, w 4-10',
      bridge: 'Plankebro: planker på tværs, rebsløjfer langs kanten og en bueunderstøtning med hængere. Kasse w 3-6, d 6-20, h 0.4-0.8',
      hay: 'Høballe på ende: rund bale-top med strå-spiral og sejlgarn. shape:"cyl" w 3-5, h 1.5-2.5 (kasse = firkantet bale, w 2-4)',
      barn: 'Rød lade: røde brædder, hvide hjørner, port med kryds, tegltag er platformen. Kasse w 6-10, d 6-10, h 2.5-4.5 (cyl = silo)',
      porch: 'Hvidkantet træveranda med løber (standard for start): kasse w 6-10, d 6-10, h 0.6-2.4',
      hill: 'Bakketop med cirkel af sandfarvede fliser (standard for finish) og et grønt, mosbevokset bakkesæt. w 8-12',
      log: 'Savet træstamme: bark på siderne, årringe i enderne, flad top. Kasse w 1.4-3, d 4-14, h 0.6-1',
    },
    barVariants: {
      fence: 'Skrællet hegnsstolpe med jernmuffer, endeblokke og røde vimpler (standard for stænger og trapez)',
      branch: 'Æblegren med blade, hængende æbler og blomster',
    },
    create(ctx) {
      const { THREE } = ctx;
      const PI = Math.PI, TAU = PI * 2;
      const clamp = ctx.clamp, lerp = ctx.lerp;
      const V3 = THREE.Vector3;
      const tr = (o) => ctx.track(o);
      const rr = (r, a, b) => a + r() * (b - a);

      /* ---------- Teksturer (tegnes først, når de bruges; max 12) ---------- */
      const texCache = {};
      const pix = (g, w, h, fn) => { // pixel for pixel: fn(x, y, c) skriver [r, g, b, (a)] i 0..255
        const img = g.createImageData(w, h), d = img.data, c = [0, 0, 0, 255];
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            fn(x, y, c);
            const i = (y * w + x) * 4;
            d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = c[3]; c[3] = 255;
          }
        }
        g.putImageData(img, 0, 0);
      };
      // Tegn noget, så det også gentages over kanten (sømløs flise)
      const wrap = (w, h, x, y, m, fn) => {
        for (const dx of [-w, 0, w]) for (const dy of [-h, 0, h]) {
          if (x + dx > -m && x + dx < w + m && y + dy > -m && y + dy < h + m) fn(x + dx, y + dy);
        }
      };
      const dot = (g, x, y, r) => { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); };
      const line = (g, x0, y0, x1, y1) => { g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); };

      const PAINT = {
        // Græstørv: lysegrøn med strå, dug og blomster (flise 3 m)
        turf: [512, 512, (g, w, h, r) => {
          const n1 = ctx.tileNoise(w, 4, 4, r), n2 = ctx.tileNoise(w, 14, 2, r);
          pix(g, w, h, (x, y, c) => {
            const i = y * w + x, t = clamp(n1[i] * 1.5 + (n2[i] - 0.5) * 0.6 - 0.25, 0, 1);
            c[0] = lerp(72, 146, t); c[1] = lerp(138, 200, t); c[2] = lerp(46, 80, t);
          });
          g.lineCap = 'round';
          for (let i = 0; i < 4200; i++) {
            const x = r() * w, y = r() * h, a = -PI / 2 + (r() - 0.5) * 1.1, l = rr(r, 4, 10);
            g.strokeStyle = r() < 0.5 ? `rgba(38,98,30,${rr(r, 0.25, 0.5)})` : `rgba(196,238,116,${rr(r, 0.25, 0.55)})`;
            g.lineWidth = rr(r, 1, 1.8);
            wrap(w, h, x, y, 12, (px, py) => line(g, px, py, px + Math.cos(a) * l, py + Math.sin(a) * l));
          }
          // blomsterprikker: tusindfryd, smørblomst, kløver, forglemmigej
          for (let i = 0; i < 150; i++) {
            const x = r() * w, y = r() * h, k = (r() * 4) | 0;
            wrap(w, h, x, y, 6, (px, py) => {
              if (k === 0) {
                g.strokeStyle = '#fffdf2'; g.lineWidth = 1.4;
                for (let q = 0; q < 7; q++) line(g, px, py, px + Math.cos(q * 0.9) * 3.6, py + Math.sin(q * 0.9) * 3.6);
                g.fillStyle = '#ffd23a'; dot(g, px, py, 1.5);
              } else if (k === 1) { g.fillStyle = '#ffd62e'; dot(g, px, py, 2.4); g.fillStyle = '#fff3a0'; dot(g, px - 0.6, py - 0.6, 1); }
              else if (k === 2) { g.fillStyle = '#f08ab4'; dot(g, px, py, 2.6); g.fillStyle = '#c85a8a'; dot(g, px, py, 1.1); }
              else { g.fillStyle = '#7ab2ff'; dot(g, px, py, 1.9); g.fillStyle = '#ffe680'; dot(g, px, py, 0.7); }
            });
          }
          g.fillStyle = 'rgba(255,255,255,0.5)';
          for (let i = 0; i < 120; i++) dot(g, r() * w, r() * h, 0.8);
        }],
        // Græskant + jord til siden af en tørv (flise 2,4 m, græsbåndet øverst)
        turfSide: [512, 512, (g, w, h, r) => {
          const n1 = ctx.tileNoise(w, 5, 4, r);
          pix(g, w, h, (x, y, c) => {
            const t = n1[y * w + x];
            c[0] = lerp(88, 150, t); c[1] = lerp(58, 104, t); c[2] = lerp(34, 64, t);
          });
          g.lineCap = 'round';
          for (let i = 0; i < 70; i++) { // sten i jorden – varme ler-farver, aldrig grå
            const x = r() * w, y = rr(r, 100, h), s = rr(r, 3, 9);
            wrap(w, h, x, y, 12, (px, py) => {
              g.fillStyle = 'rgba(70,40,20,0.45)'; g.beginPath(); g.ellipse(px + 1, py + 1.5, s, s * 0.7, 0, 0, TAU); g.fill();
              g.fillStyle = r() < 0.5 ? '#cfae7e' : '#b98f5e'; g.beginPath(); g.ellipse(px, py, s, s * 0.7, 0, 0, TAU); g.fill();
            });
          }
          g.strokeStyle = 'rgba(190,150,96,0.8)'; // rodtråde
          for (let i = 0; i < 16; i++) {
            const x = r() * w, y0 = 50 + r() * 40, l = rr(r, 40, 150), s = rr(r, -0.4, 0.4);
            g.lineWidth = rr(r, 1.5, 3.2);
            wrap(w, h, x, y0, 30, (px, py) => { g.beginPath(); g.moveTo(px, py); g.bezierCurveTo(px + s * 60, py + l * 0.3, px - s * 40, py + l * 0.6, px + s * 30, py + l); g.stroke(); });
          }
          // græsbånd med frynset kant og hængende totter
          const edge = (x) => 78 + Math.sin(x / w * TAU * 5) * 7 + Math.sin(x / w * TAU * 13 + 1.3) * 5;
          g.fillStyle = 'rgba(30,18,8,0.35)'; // skygge under græsset
          for (let x = 0; x < w; x++) g.fillRect(x, 0, 1, edge(x) + 9);
          for (let x = 0; x < w; x++) {
            const gr = g.createLinearGradient(0, 0, 0, edge(x));
            gr.addColorStop(0, '#9fdc5a'); gr.addColorStop(1, '#4f9a2c');
            g.fillStyle = gr; g.fillRect(x, 0, 1, edge(x));
          }
          for (let i = 0; i < 260; i++) {
            const x = r() * w, l = rr(r, 10, 34);
            g.strokeStyle = r() < 0.5 ? '#3e8a26' : '#b6ea6e'; g.lineWidth = rr(r, 1.2, 2.4);
            wrap(w, h, x, edge(x) - 6, 6, (px, py) => line(g, px, py, px + (r() - 0.5) * 6, py + l));
          }
        }],
        // Jord med lodrette årer, rødder og grønt mos øverst (v 0..1 = hele keglens dybde, ingen gentagelse)
        soil: [512, 512, (g, w, h, r) => {
          const n1 = ctx.tileNoise(w, 4, 4, r), n2 = ctx.tileNoise(w, 12, 3, r);
          pix(g, w, h, (x, y, c) => {
            const i = y * w + x, t = clamp(n1[i] * 1.3 + (n2[i] - 0.5) * 0.7, 0, 1), d = y / h; // d: 0 øverst
            const moss = clamp(1 - (d - 0.1) / 0.22, 0, 1) * clamp(0.55 + n2[i] * 0.9, 0, 1);
            const dark = 1 - 0.32 * d;
            c[0] = lerp(lerp(98, 160, t) * dark, 94, moss); c[1] = lerp(lerp(64, 108, t) * dark, 160, moss); c[2] = lerp(38, 66, t) * dark * (1 - moss * 0.4);
          });
          g.lineCap = 'round';
          for (let i = 0; i < 160; i++) { // lodrette årer
            const x = r() * w, y = r() * h, l = rr(r, 30, 140);
            g.strokeStyle = r() < 0.5 ? `rgba(52,30,14,${rr(r, 0.15, 0.4)})` : `rgba(206,160,104,${rr(r, 0.12, 0.3)})`;
            g.lineWidth = rr(r, 1.5, 5);
            wrap(w, h, x, y, 10, (px, py) => line(g, px, py, px + (r() - 0.5) * 8, py + l));
          }
          for (let i = 0; i < 60; i++) { // varme småsten
            const x = r() * w, y = rr(r, h * 0.2, h), s = rr(r, 2, 6);
            g.fillStyle = r() < 0.5 ? '#c7a574' : '#a9814f'; g.beginPath(); g.ellipse(x, y, s, s * 0.7, 0, 0, TAU); g.fill();
          }
          g.strokeStyle = 'rgba(176,132,80,0.9)'; // rødder
          for (let i = 0; i < 14; i++) {
            const x = r() * w, y0 = r() * h * 0.5, l = rr(r, 80, 220);
            g.lineWidth = rr(r, 2, 4.5);
            wrap(w, h, x, y0, 30, (px, py) => { g.beginPath(); g.moveTo(px, py); g.bezierCurveTo(px + 30, py + l * 0.3, px - 30, py + l * 0.6, px + 10, py + l); g.stroke(); });
          }
        }],
        // Planker på tværs (flise 2,4 m, 12 brædder, forskudte samlinger, søm)
        planks: [512, 512, (g, w, h, r) => {
          const cols = ['#b07d4c', '#a37246', '#bb8a55', '#98683f', '#ad7a49', '#c0905a'];
          const n = 12, bh = h / n;
          for (let i = 0; i < n; i++) {
            const y0 = i * bh;
            let x = -r() * w * 0.6;
            while (x < w) {
              const len = w * rr(r, 0.45, 1);
              g.fillStyle = cols[(r() * cols.length) | 0]; g.fillRect(x, y0, len, bh);
              for (let k = 0; k < 7; k++) { // årer i træet
                const gy = y0 + 3 + r() * (bh - 6);
                g.strokeStyle = `rgba(72,42,20,${rr(r, 0.12, 0.32)})`; g.lineWidth = rr(r, 0.6, 1.5);
                g.beginPath(); g.moveTo(x + 2, gy);
                for (let s = 1; s <= 6; s++) g.lineTo(x + (len * s) / 6, gy + Math.sin(s * 1.3 + k) * 1.3);
                g.stroke();
              }
              if (r() < 0.35) { // knast
                const kx = x + len * rr(r, 0.2, 0.8), ky = y0 + bh * 0.5;
                g.strokeStyle = 'rgba(70,40,18,0.55)'; g.lineWidth = 1.2;
                for (let q = 1; q < 4; q++) { g.beginPath(); g.ellipse(kx, ky, q * 3.2, q * 1.6, 0, 0, TAU); g.stroke(); }
              }
              g.fillStyle = 'rgba(38,26,18,0.85)';
              for (const nx of [x + 7, x + len - 7]) for (const ny of [y0 + bh * 0.28, y0 + bh * 0.72]) dot(g, nx, ny, 1.5);
              g.fillStyle = 'rgba(30,18,10,0.65)'; g.fillRect(x, y0, 2, bh);
              x += len;
            }
            g.fillStyle = 'rgba(30,18,10,0.7)'; g.fillRect(0, y0, w, 2.5);
            g.fillStyle = 'rgba(255,232,190,0.2)'; g.fillRect(0, y0 + 2.5, w, 2);
          }
        }],
        // Bark: vandrette furer (flise 2,4 m)
        bark: [512, 512, (g, w, h, r) => {
          const n1 = ctx.tileNoise(w, 6, 3, r);
          pix(g, w, h, (x, y, c) => {
            const t = n1[y * w + x];
            c[0] = lerp(84, 140, t); c[1] = lerp(56, 98, t); c[2] = lerp(34, 62, t);
          });
          g.lineCap = 'round';
          for (let i = 0; i < 90; i++) {
            const y = r() * h, k = 1 + ((r() * 4) | 0), ph = r() * TAU, am = rr(r, 1.5, 5), x0 = r() * w, l = rr(r, w * 0.3, w * 0.9);
            g.strokeStyle = r() < 0.6 ? `rgba(40,24,12,${rr(r, 0.3, 0.6)})` : `rgba(196,150,96,${rr(r, 0.2, 0.4)})`;
            g.lineWidth = rr(r, 1.5, 4.5);
            wrap(w, h, x0, y, l, (px, py) => {
              g.beginPath(); g.moveTo(px, py);
              for (let s = 1; s <= 12; s++) g.lineTo(px + (l * s) / 12, py + Math.sin(ph + (s / 12) * TAU * k) * am);
              g.stroke();
            });
          }
          g.fillStyle = 'rgba(150,190,100,0.35)'; // lav og mos
          for (let i = 0; i < 26; i++) wrap(w, h, r() * w, r() * h, 20, (px, py) => { g.beginPath(); g.ellipse(px, py, rr(r, 8, 22), rr(r, 4, 9), 0, 0, TAU); g.fill(); });
        }],
        // Rød ladevæg: lodrette brædder (flise 2,4 m)
        red: [512, 512, (g, w, h, r) => {
          const cols = ['#b2382a', '#a23025', '#bf4331', '#a93628'];
          const n = 24, bw = w / n;
          for (let i = 0; i < n; i++) {
            g.fillStyle = cols[(r() * cols.length) | 0]; g.fillRect(i * bw, 0, bw, h);
            for (let k = 0; k < 5; k++) {
              g.strokeStyle = `rgba(80,20,14,${rr(r, 0.12, 0.3)})`; g.lineWidth = 0.8;
              line(g, i * bw + r() * bw, 0, i * bw + r() * bw, h);
            }
            g.fillStyle = 'rgba(40,10,6,0.55)'; g.fillRect(i * bw, 0, 1.6, h);
            g.fillStyle = 'rgba(255,170,140,0.16)'; g.fillRect(i * bw + 1.6, 0, 1.4, h);
          }
          g.fillStyle = 'rgba(40,10,6,0.6)'; // sømrækker
          for (let y = h * 0.1; y < h; y += h * 0.4) for (let i = 0; i < n; i++) dot(g, i * bw + bw / 2, y, 1.3);
        }],
        // Tegltag (flise 2,4 m): skællagte tegl i brunrødt med mos
        roof: [512, 512, (g, w, h, r) => {
          const rows = 16, th = h / rows, tw = w / 12;
          for (let j = 0; j < rows; j++) {
            for (let i = -1; i < 13; i++) {
              const x = i * tw + (j % 2) * tw / 2, y = j * th, k = r();
              g.fillStyle = k < 0.33 ? '#8f3b2b' : k < 0.66 ? '#9d4630' : '#823427';
              g.beginPath(); g.moveTo(x, y); g.lineTo(x + tw, y); g.lineTo(x + tw, y + th * 0.6);
              g.arc(x + tw / 2, y + th * 0.6, tw / 2, 0, PI); g.closePath(); g.fill();
              g.strokeStyle = 'rgba(40,12,8,0.6)'; g.lineWidth = 1.5; g.stroke();
              g.fillStyle = 'rgba(255,190,150,0.14)'; g.fillRect(x + 2, y + 1, tw - 4, 2);
            }
          }
          g.fillStyle = 'rgba(120,160,70,0.28)';
          for (let i = 0; i < 18; i++) wrap(w, h, r() * w, r() * h, 18, (px, py) => { g.beginPath(); g.ellipse(px, py, rr(r, 6, 18), rr(r, 3, 8), 0, 0, TAU); g.fill(); });
        }],
        // Strå (side af høballe): lodrette strå og to sejlgarnsbånd (v 0..1 = ballens højde)
        hay: [512, 512, (g, w, h, r) => {
          const n1 = ctx.tileNoise(w, 5, 3, r);
          pix(g, w, h, (x, y, c) => {
            const t = n1[y * w + x];
            c[0] = lerp(196, 240, t); c[1] = lerp(150, 200, t); c[2] = lerp(56, 92, t);
          });
          g.lineCap = 'round';
          for (let i = 0; i < 2600; i++) {
            const x = r() * w, y = r() * h, l = rr(r, 14, 60);
            g.strokeStyle = r() < 0.5 ? `rgba(150,100,30,${rr(r, 0.2, 0.5)})` : `rgba(255,232,150,${rr(r, 0.25, 0.55)})`;
            g.lineWidth = rr(r, 0.8, 1.8);
            wrap(w, h, x, y, 4, (px, py) => line(g, px, py, px + (r() - 0.5) * 4, py + l));
          }
          for (const y of [h * 0.17, h * 0.83]) { // sejlgarn
            g.fillStyle = 'rgba(60,40,16,0.55)'; g.fillRect(0, y - 6, w, 14);
            g.fillStyle = '#6b4a22'; g.fillRect(0, y - 4, w, 9);
            g.fillStyle = 'rgba(255,220,150,0.5)'; g.fillRect(0, y - 3, w, 2);
          }
        }],
        // Strå-spiral til ballens ender (vises 1:1 over hele toppen)
        hayTop: [512, 512, (g, w, h, r) => {
          g.fillStyle = '#d8aa4c'; g.fillRect(0, 0, w, h);
          g.lineCap = 'round';
          for (let i = 0; i < 1500; i++) {
            const a = r() * TAU, rad = Math.sqrt(r()) * w * 0.5, l = rr(r, 0.06, 0.2);
            g.strokeStyle = r() < 0.5 ? `rgba(140,92,28,${rr(r, 0.25, 0.6)})` : `rgba(255,230,150,${rr(r, 0.3, 0.6)})`;
            g.lineWidth = rr(r, 1, 2.2);
            g.beginPath(); g.arc(w / 2, h / 2, rad, a, a + l); g.stroke();
          }
          for (let k = 1; k < 9; k++) { g.strokeStyle = 'rgba(110,70,20,0.35)'; g.lineWidth = 2; g.beginPath(); g.arc(w / 2, h / 2, k * w * 0.055, 0, TAU); g.stroke(); }
          g.fillStyle = 'rgba(90,56,16,0.55)'; dot(g, w / 2, h / 2, 12);
        }],
        // Vandfald: lodrette lyse strimer med blød kant (flise 5 m)
        fall: [64, 256, (g, w, h, r) => {
          g.clearRect(0, 0, w, h);
          for (let i = 0; i < 24; i++) {
            const x = r() * w, ww = rr(r, 1.5, 5);
            for (let s = 0; s < 6; s++) {
              const y = r() * h, l = rr(r, 30, 110);
              g.fillStyle = `rgba(${r() < 0.4 ? '232,248,255' : '170,215,245'},${rr(r, 0.3, 0.95)})`;
              wrap(w, h, x, y, l, (px, py) => g.fillRect(px - ww / 2, py, ww, l));
            }
          }
          g.globalCompositeOperation = 'destination-in';
          const gr = g.createLinearGradient(0, 0, w, 0);
          gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.28, 'rgba(0,0,0,1)'); gr.addColorStop(0.72, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
          g.fillStyle = gr; g.fillRect(0, 0, w, h);
          g.globalCompositeOperation = 'source-over';
        }],
        // Ballonens baner (12 stykker à 16 px)
        balloon: [192, 64, (g, w, h) => {
          const cols = ['#d8392b', '#fff1d6', '#f2b630', '#fff1d6', '#2f7fc4', '#fff1d6'];
          for (let i = 0; i < 12; i++) { g.fillStyle = cols[i % 6]; g.fillRect(i * 16, 0, 16, h); }
          g.fillStyle = 'rgba(0,0,0,0.12)';
          for (let i = 0; i < 12; i++) g.fillRect(i * 16, 0, 1.5, h);
        }],
        // Morgendis: bløde skyklumper med alpha (flise 380 m)
        mist: [512, 512, (g, w, h, r) => {
          const n1 = ctx.tileNoise(w, 3, 5, r);
          pix(g, w, h, (x, y, c) => {
            const t = n1[y * w + x], a = clamp((t - 0.4) / 0.35, 0, 1);
            c[0] = 255; c[1] = 232 + t * 20; c[2] = 208 + t * 30; c[3] = a * a * (3 - 2 * a) * 215;
          });
        }],
      };
      const T = (k) => {
        if (texCache[k]) return texCache[k];
        const [w, h, fn] = PAINT[k], c = ctx.makeCanvas(w, h), g = c.getContext('2d');
        fn(g, w, h, ctx.mulberry32(k.length * 7919 + k.charCodeAt(0) * 31 + k.charCodeAt(k.length - 1)));
        const t = tr(ctx.toTexture(c));
        if (k === 'soil' || k === 'turfSide') t.wrapT = THREE.ClampToEdgeWrapping;
        return (texCache[k] = t);
      };
      // Roteret kopi (samme billede): lodret ådring til stolper og stænger
      const rotTex = (k) => {
        if (texCache[k + 'R']) return texCache[k + 'R'];
        const t = T(k).clone();
        t.rotation = PI / 2; t.center.set(0.5, 0.5); t.needsUpdate = true;
        return (texCache[k + 'R'] = tr(t));
      };

      /* ---------- Materialer ---------- */
      const std = (o) => new THREE.MeshStandardMaterial(o);
      const matCache = {};
      const MK = {
        turfTop: () => std({ map: T('turf'), roughness: 0.95 }),
        turfSide: () => std({ map: T('turfSide'), roughness: 0.95 }),
        soil: () => std({ map: T('soil'), roughness: 1, side: THREE.DoubleSide }),
        dirt: () => std({ color: '#5b3d24', roughness: 1 }),
        planks: () => std({ map: T('planks'), roughness: 0.82 }),
        planksOld: () => std({ map: T('planks'), color: '#c8aa8a', roughness: 0.95 }),
        planksDark: () => std({ map: T('planks'), color: '#8a7058', roughness: 0.9 }),
        bark: () => std({ map: T('bark'), roughness: 0.95 }),
        barkR: () => std({ map: rotTex('bark'), roughness: 0.95 }),
        red: () => std({ map: T('red'), roughness: 0.8 }),
        roof: () => std({ map: T('roof'), roughness: 0.7 }),
        hay: () => std({ map: T('hay'), roughness: 0.95 }),
        hayTop: () => std({ map: T('hayTop'), roughness: 0.95 }),
        water: () => new THREE.MeshBasicMaterial({ map: T('fall'), transparent: true, depthWrite: false, side: THREE.DoubleSide, opacity: 0.85 }),
        white: () => std({ color: '#f3ead6', roughness: 0.75 }),
        iron: () => std({ color: '#3c3733', roughness: 0.45, metalness: 0.7 }),
        rope: () => std({ color: '#cfae78', roughness: 0.95 }),
        root: () => std({ color: '#8e6a3c', roughness: 1 }),
        iceTop: () => new THREE.MeshPhysicalMaterial({ color: '#bfeaff', roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.03, emissive: '#2a77a8', emissiveIntensity: 0.18 }),
        iceSide: () => std({ color: '#a6dcf4', roughness: 0.14, emissive: '#1f6a96', emissiveIntensity: 0.3 }),
        capRed: () => std({ color: '#d63a2c', roughness: 0.45 }),
        cream: () => std({ color: '#f0e2c2', roughness: 0.7 }),
        vc: () => std({ vertexColors: true, roughness: 0.85 }),
        vcDS: () => std({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide }),
        decal: () => std({ vertexColors: true, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
        glow: () => new THREE.MeshBasicMaterial({ color: '#b6ff5a', transparent: true, opacity: 0.95, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, depthWrite: false }),
      };
      const mat = (k) => matCache[k] || (matCache[k] = tr(MK[k]()));

      /* ---------- Geometri-hjælpere ---------- */
      // Kasse med UV i verdensmeter; siderne har v = 1 øverst (så græsbåndet sidder i toppen)
      const boxG = (w, h, d, o = {}) => {
        const g = new THREE.BoxGeometry(w, h, d);
        const P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv;
        const tt = o.top || 3, st = o.side || 2.4, ox = o.ox || 0, oz = o.oz || 0;
        for (let i = 0; i < P.count; i++) {
          const x = P.getX(i), y = P.getY(i), z = P.getZ(i), nx = N.getX(i), ny = N.getY(i), nz = N.getZ(i);
          let u, v;
          if (Math.abs(ny) > 0.5) { u = x / tt + ox; v = -z / tt + oz; if (o.rot) { const s = u; u = -v; v = s; } }
          else {
            u = (Math.abs(nx) > 0.5 ? -z * nx : x * nz) / st + ox;
            v = 1 + (y - h / 2) / st;
          }
          U.setXY(i, u, v);
        }
        return g;
      };
      const cylG = (r, h, o = {}) => {
        const g = new THREE.CylinderGeometry(r, o.r2 ?? r, h, o.seg || 36, 1);
        const P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv;
        const st = o.side || 2.4, tt = o.top || 3;
        for (let i = 0; i < P.count; i++) {
          if (Math.abs(N.getY(i)) > 0.5) {
            if (o.capNorm) U.setXY(i, P.getX(i) / (2 * r) + 0.5, -P.getZ(i) / (2 * r) + 0.5);
            else U.setXY(i, P.getX(i) / tt + (o.ox || 0), -P.getZ(i) / tt + (o.oz || 0));
          } else {
            U.setXY(i, (U.getX(i) * TAU * r) / st, o.vFull ? (P.getY(i) + h / 2) / h : 1 + (P.getY(i) - h / 2) / st);
          }
        }
        return g;
      };
      // Flet geometrier (position/normal/uv/farve) til én: del = { geo, pos, rot, scl, color, jit, grad }
      const _m = new THREE.Matrix4(), _n = new THREE.Matrix3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _c = new THREE.Color();
      const merge = (parts) => {
        const P = [], N = [], U = [], C = [];
        for (const { geo, pos = [0, 0, 0], rot = [0, 0, 0], scl = [1, 1, 1], color = '#ffffff', jit = 0, grad = 0 } of parts) {
          const g = geo.index ? geo.toNonIndexed() : geo;
          _m.compose(new V3(pos[0], pos[1], pos[2]), _q.setFromEuler(_e.set(rot[0], rot[1], rot[2])), new V3(scl[0], scl[1], scl[2]));
          _n.getNormalMatrix(_m);
          const gp = g.attributes.position, gn = g.attributes.normal, gu = g.attributes.uv;
          g.computeBoundingBox();
          const y0 = g.boundingBox.min.y, y1 = g.boundingBox.max.y;
          _c.set(color);
          for (let i = 0; i < gp.count; i++) {
            const v = new V3(gp.getX(i), gp.getY(i), gp.getZ(i));
            const t = y1 > y0 ? (v.y - y0) / (y1 - y0) : 1;
            v.applyMatrix4(_m);
            const nn = new V3(gn.getX(i), gn.getY(i), gn.getZ(i)).applyMatrix3(_n).normalize();
            P.push(v.x, v.y, v.z); N.push(nn.x, nn.y, nn.z); U.push(gu ? gu.getX(i) : 0, gu ? gu.getY(i) : 0);
            const hsh = Math.sin(v.x * 12.9898 + v.y * 78.233 + v.z * 37.719) * 43758.5453;
            const f = (1 - grad * (1 - t)) * (1 + (hsh - Math.floor(hsh) - 0.5) * jit);
            C.push(_c.r * f, _c.g * f, _c.b * f);
          }
          if (g !== geo) g.dispose();
          geo.dispose();
        }
        const out = new THREE.BufferGeometry();
        out.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
        out.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
        out.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
        out.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
        return out;
      };
      const mesh = (geo, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(tr(geo), m); o.position.set(x, y, z); return o; };
      const FL = 0.012; // dekaler ligger 1,2 cm over toppen
      const disc = (r, x, z, y, color, seg = 12) => ({ geo: new THREE.CircleGeometry(r, seg), pos: [x, y, z], rot: [-PI / 2, 0, 0], color });
      const quadFlat = (w, d, x, z, y, color, ry = 0) => ({ geo: new THREE.PlaneGeometry(w, d), pos: [x, y, z], rot: [-PI / 2, 0, ry], color });
      const boxP = (w, h, d, x, y, z, color, rot) => ({ geo: new THREE.BoxGeometry(w, h, d), pos: [x, y, z], rot: rot || [0, 0, 0], color });
      const cylP = (r1, r2, h, x, y, z, color, seg = 8, rot, extra = {}) => ({ geo: new THREE.CylinderGeometry(r1, r2, h, seg), pos: [x, y, z], rot: rot || [0, 0, 0], color, ...extra });
      const ballP = (r, x, y, z, color, sc = [1, 1, 1], jit = 0, extra = {}) => ({ geo: new THREE.IcosahedronGeometry(r, 1), pos: [x, y, z], scl: sc, color, jit, ...extra });

      /* ---------- Jordkegle (under-konstruktion) med rødder og vandfald ---------- */
      // Overflade-punkt: t 0 (toppen, følger fodaftrykket) til 1 (spidsen), th = vinkel
      const profile = (a, b, depth, o = {}) => {
        const sTop = o.sTop ?? 0.985, e0 = o.e0 ?? 5, w1 = o.wob || [0, 0];
        return (t, th) => {
          const c = Math.cos(th), s = Math.sin(th), e = lerp(e0, 2, Math.min(1, t * 1.8));
          const k = 1 / Math.pow(Math.pow(Math.abs(c) / a, e) + Math.pow(Math.abs(s) / b, e), 1 / e);
          const wob = 1 + (o.wobAmp || 0) * (Math.sin(th * 3 + w1[0]) * 0.6 + Math.sin(th * 7 + w1[1]) * 0.4);
          const sc = sTop * Math.pow(1 - t, o.pow ?? 0.8) * wob;
          return [c * k * sc, -depth * Math.pow(t, 0.9), s * k * sc];
        };
      };
      const coneGeo = (a, b, depth, seed, o = {}) => {
        const R = 8, N = 22, f = profile(a, b, depth, o), r = ctx.mulberry32(seed);
        const jit = [];
        for (let k = 0; k <= R; k++) { jit.push([]); for (let i = 0; i < N; i++) jit[k].push(r()); }
        const pos = [], uv = [], idx = [], circ = (TAU * (a + b)) / 2 * 0.85 / (o.tileU || 4), vS = o.vScale ?? 1;
        for (let k = 0; k <= R; k++) {
          for (let i = 0; i <= N; i++) {
            const t = k / R, q = f(t, (i / N) * TAU), j = jit[k][i % N] - 0.5, s = Math.sin(t * PI);
            pos.push(q[0] * (1 + j * 0.3 * s), q[1] + j * depth * 0.035 * s, q[2] * (1 + j * 0.3 * s));
            uv.push((i / N) * circ, 1 - t * vS);
          }
        }
        for (let k = 0; k < R; k++) {
          for (let i = 0; i < N; i++) {
            const A = k * (N + 1) + i, B = A + 1, C = A + N + 1, D = C + 1;
            idx.push(A, B, C, B, D, C);
          }
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
        g.setIndex(idx);
        g.computeVertexNormals();
        const nrm = g.attributes.normal; // sømmen: samme normal i begge ender af ringen
        for (let k = 0; k <= R; k++) {
          const i0 = k * (N + 1), i1 = i0 + N;
          const x = nrm.getX(i0) + nrm.getX(i1), y = nrm.getY(i0) + nrm.getY(i1), z = nrm.getZ(i0) + nrm.getZ(i1), l = Math.hypot(x, y, z) || 1;
          nrm.setXYZ(i0, x / l, y / l, z / l); nrm.setXYZ(i1, x / l, y / l, z / l);
        }
        return g;
      };
      // Tilspidsede rødder, der kryber ned ad keglens overflade og hænger fri i enden
      const rootsGeo = (f, n, seed) => {
        const r = ctx.mulberry32(seed + 77), parts = [];
        for (let j = 0; j < n; j++) {
          const th0 = r() * TAU, t0 = 0.02 + r() * 0.1, len = 0.4 + r() * 0.4, wob = (r() - 0.5) * 1.2, pts = [];
          for (let s = 0; s <= 7; s++) {
            const q = f(t0 + (len * s) / 7, th0 + wob * Math.sin(s * 0.9 + j) * 0.35);
            pts.push(new V3(q[0], q[1], q[2]));
          }
          const e = pts[pts.length - 1];
          pts.push(new V3(e.x * 0.92, e.y - 0.5 - r() * 0.9, e.z * 0.92));
          const curve = new THREE.CatmullRomCurve3(pts), rad = 0.05 + r() * 0.06, tube = new THREE.TubeGeometry(curve, 24, rad, 5, false);
          const P = tube.attributes.position;
          for (let i = 0; i < P.count; i++) { // tilspidsning
            const ring = Math.floor(i / 6), c = curve.getPointAt(ring / 24), s = 1 - 0.85 * (ring / 24);
            P.setXYZ(i, c.x + (P.getX(i) - c.x) * s, c.y + (P.getY(i) - c.y) * s, c.z + (P.getZ(i) - c.z) * s);
          }
          parts.push({ geo: tube });
        }
        return merge(parts);
      };
      // Tynde vandfald: to krydsede bånd, der falder lodret fra en sprække
      const fallsGeo = (specs) => {
        const parts = [];
        for (const { x, y, z, H, wd, face } of specs) {
          for (let k = 0; k < 2; k++) {
            const g = new THREE.PlaneGeometry(wd, H);
            const uv = g.attributes.uv;
            for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * (H / 5));
            parts.push({ geo: g, pos: [x, y - H / 2, z], rot: [0, face + k * PI / 2, 0] });
          }
        }
        return merge(parts);
      };
      const waterMeshes = []; // alle vandfald deler én tekstur, som rulles i update
      const under = (g, p, o = {}) => {
        const D = p.type === 'ramp' ? p.slopeLen : p.d, k = o.k ?? 1;
        const a = (p.w / 2) * k, b = (p.shape === 'cyl' ? p.w / 2 : D / 2) * k;
        const free = ctx.freeBelow(p), md = Math.min(a, b);
        const dep = Math.min(o.depth ?? clamp(md * 2.3 + 1.5, 3.5, 11), free - 0.4);
        if (dep < 1.2 || md < 0.7) return;
        const po = { e0: p.shape === 'cyl' ? 2 : 5, sTop: o.sTop, vScale: o.vScale, pow: o.pow };
        const r = ctx.mulberry32(p.seed + (o.salt || 0));
        const cone = mesh(coneGeo(a, b, dep, p.seed + (o.salt || 0), po), o.mat || mat('soil'), 0, -p.h / 2 - 0.004, 0);
        g.add(cone);
        const f = profile(a, b, dep, po);
        if (o.roots !== false && md >= 1.4) {
          const rm = mesh(rootsGeo(f, Math.min(6, Math.floor(md * 1.1) + 1), p.seed), mat('root'), 0, -p.h / 2 - 0.004, 0);
          g.add(rm);
        }
        if (o.falls !== false && md >= 1.8 && r() < 0.6) {
          const th = r() * TAU, q = f(0.13, th), depthAt = -q[1];
          const H = Math.min(free - 0.3 - depthAt, dep + 4 + r() * 4);
          if (H > 1.5) {
            const wm = mesh(fallsGeo([{ x: q[0] * 1.0, y: -p.h / 2 + q[1], z: q[2] * 1.0, H, wd: 0.28 + r() * 0.16, face: Math.atan2(q[0], q[2]) }]), mat('water'));
            wm.userData.noCastShadow = true; wm.renderOrder = 2;
            g.add(wm);
            waterMeshes.push(wm);
          }
        }
      };

      // Sprækker i toppen (tværgående revner + huller) – flade dekaler
      const cracks = (g, p, seed, n) => {
        const r = ctx.mulberry32(seed), parts = [], D = p.d;
        for (let c = 0; c < n; c++) {
          let x = rr(r, -p.w * 0.4, p.w * 0.4), z = rr(r, -D * 0.4, D * 0.4), a = r() * TAU;
          for (let s = 0; s < 6; s++) {
            const l = rr(r, 0.35, 0.8), na = a + (r() - 0.5) * 1.3;
            parts.push(quadFlat(0.05 + r() * 0.05, l, x + Math.sin(a) * l / 2, z + Math.cos(a) * l / 2, p.h / 2 + FL, '#241508', a));
            x += Math.sin(a) * l; z += Math.cos(a) * l; a = na;
            if (Math.abs(x) > p.w / 2 || Math.abs(z) > D / 2) break;
          }
        }
        for (let c = 0; c < 3; c++) parts.push(quadFlat(rr(r, 0.3, 0.55), rr(r, 0.12, 0.2), rr(r, -p.w * 0.3, p.w * 0.3), rr(r, -D * 0.3, D * 0.3), p.h / 2 + FL, '#150c05', r() * 0.5));
        g.add(mesh(merge(parts), mat('decal')));
      };

      /* ---------- Platform-bygge ---------- */
      // Hoveddelen (præcis fysikkassen): [sideX, sideX, top, bund, sideZ, sideZ]
      const body = (p, mats, o = {}) => {
        const cyl = p.shape === 'cyl', off = (p.seed % 997) / 997, D = p.type === 'ramp' ? p.slopeLen : p.d;
        const geo = cyl ? cylG(p.w / 2, p.h, { top: o.top, side: o.side, ox: off, oz: off * 1.7, capNorm: o.capNorm, vFull: o.vFull })
          : boxG(p.w, p.h, D, { top: o.top, side: o.side, rot: o.rot, ox: off, oz: off * 1.7 });
        const m = new THREE.Mesh(tr(geo), cyl ? [mats[0], mats[2], mats[3]] : mats);
        m.userData.solid = true;
        return m;
      };
      const S6 = (side, top, bottom) => [side, side, top, bottom || mat('dirt'), side, side];

      const bTurf = (p, g, flowers) => {
        g.add(body(p, S6(mat('turfSide'), mat('turfTop'))));
        under(g, p);
        const r = ctx.mulberry32(p.seed + 5), parts = [], D = p.d, cyl = p.shape === 'cyl';
        const n = flowers ? Math.min(70, Math.round(p.w * D * 1.1)) : Math.min(18, Math.round(p.w * D * 0.12));
        const cols = flowers ? ['#e23a2e', '#fff6e0', '#ffd23a', '#f08ab4', '#9a7ae8'] : ['#fff6e0', '#ffd23a', '#f08ab4'];
        for (let i = 0; i < n; i++) {
          const a = r() * TAU, rad = Math.sqrt(r()), hw = p.w / 2 - 0.35, hd = (cyl ? p.w : D) / 2 - 0.35;
          const x = cyl ? Math.cos(a) * rad * hw : rr(r, -hw, hw), z = cyl ? Math.sin(a) * rad * hd : rr(r, -hd, hd);
          parts.push(disc(rr(r, 0.07, flowers ? 0.15 : 0.11), x, z, p.h / 2 + FL, cols[(r() * cols.length) | 0], 7));
          parts.push(disc(0.035, x, z, p.h / 2 + FL + 0.004, '#ffcf30', 6));
        }
        if (parts.length) { const dm = mesh(merge(parts), mat('decal')); dm.userData.noCastShadow = true; g.add(dm); }
      };

      const bBridge = (p, g) => {
        const D = p.d, h = p.h, w = p.w;
        const side = mat('planks');
        g.add(body(p, [side, side, mat('planks'), mat('planksDark'), side, side], { rot: false, side: 1.6 }));
        const free = ctx.freeBelow(p), r = ctx.mulberry32(p.seed + 9), parts = [], rope = [];
        // rebsløjfer langs kanten (2 cm uden for siden) og knuder ved stolpernes plads
        const n = Math.max(2, Math.round(D / 2.4));
        for (const sx of [-1, 1]) {
          for (let i = 0; i < n; i++) {
            const z0 = -D / 2 + (i * D) / n, z1 = z0 + D / n, pts = [];
            for (let s = 0; s <= 6; s++) pts.push(new V3(sx * (w / 2 + 0.03), h / 2 - 0.2 - Math.sin((s / 6) * PI) * 0.22, z0 + ((z1 - z0) * s) / 6));
            rope.push({ geo: new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, 0.035, 5), color: '#cfae78' });
            parts.push({ geo: new THREE.SphereGeometry(0.075, 7, 6), pos: [sx * (w / 2 + 0.03), h / 2 - 0.2, z0], color: '#b8905a' });
          }
          parts.push({ geo: new THREE.SphereGeometry(0.075, 7, 6), pos: [sx * (w / 2 + 0.03), h / 2 - 0.2, D / 2], color: '#b8905a' });
        }
        g.add(mesh(merge(rope.concat(parts)), mat('vc')));
        if (free > 1.4) { // under: langsliggere, tværbjælker, bue med hængere
          const sag = Math.min(free - 0.6, Math.max(0.9, D * 0.11)), u = [];
          for (const sx of [-1, 1]) {
            u.push(boxP(0.18, 0.26, D - 0.1, sx * (w / 2 - 0.3), -h / 2 - 0.13, 0, '#6e4a2c'));
            const pts = [];
            for (let s = 0; s <= 12; s++) { const t = s / 12; pts.push(new V3(sx * (w / 2 - 0.3), -h / 2 - 0.26 - Math.sin(t * PI) * sag, -D / 2 + 0.2 + t * (D - 0.4))); }
            u.push({ geo: new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.12, 6), color: '#7a5233' });
            for (let i = 1; i < Math.round(D / 1.5); i++) {
              const t = i / Math.round(D / 1.5), dep = Math.sin(t * PI) * sag;
              if (dep > 0.25) u.push(cylP(0.035, 0.035, dep, sx * (w / 2 - 0.3), -h / 2 - 0.26 - dep / 2, -D / 2 + 0.2 + t * (D - 0.4), '#caa56e', 5));
            }
          }
          for (let z = -D / 2 + 0.8; z < D / 2; z += 1.6) u.push(boxP(w - 0.3, 0.14, 0.18, 0, -h / 2 - 0.34, z, '#7d5836'));
          g.add(mesh(merge(u), mat('vc')));
        }
      };

      const bHay = (p, g) => {
        const cyl = p.shape === 'cyl', hay = mat('hay');
        g.add(body(p, S6(hay, mat('hayTop'), mat('hayTop')), { vFull: true, capNorm: true, side: 2.4, top: 2.4 }));
        under(g, p, { k: 0.78, depth: clamp(p.w * 0.35 + 0.8, 1.6, 4), falls: false });
        if (!cyl) { // firkantet bale: sejlgarn om bunden og toppen
          const r = ctx.mulberry32(p.seed), tw = [];
          tw.push(boxP(p.w + 0.03, 0.07, p.d + 0.03, 0, p.h * 0.28, 0, '#6b4a22'), boxP(p.w + 0.03, 0.07, p.d + 0.03, 0, -p.h * 0.28, 0, '#6b4a22'));
          g.add(mesh(merge(tw), mat('vc'))); void r;
        }
      };

      const bBarn = (p, g) => {
        const w = p.w, D = p.d, h = p.h, red = mat('red'), cyl = p.shape === 'cyl';
        g.add(body(p, S6(red, mat('roof'), red), { side: 2.4 }));
        const free = ctx.freeBelow(p), wall = Math.min(Math.max(0, 3.4 - h), free - 1.6);
        const parts = [], hh = h / 2;
        if (wall > 0.3) { // væggen fortsætter ned under taget
          const lower = cyl ? new THREE.Mesh(tr(cylG(w / 2 * 0.998, wall, { side: 2.4, seg: 32 })), red) : new THREE.Mesh(tr(boxG(w * 0.996, wall, D * 0.996, { side: 2.4, ox: 0.3 })), red);
          lower.position.y = -hh - wall / 2; g.add(lower);
        }
        const wh = h + Math.max(wall, 0);
        if (!cyl) {
          for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(boxP(0.15, wh, 0.15, sx * (w / 2 + 0.01), hh - wh / 2, sz * (D / 2 + 0.01), '#f4ecdc'));
          for (const sz of [-1, 1]) parts.push(boxP(w + 0.05, 0.24, 0.05, 0, hh - 0.12, sz * (D / 2 + 0.02), '#f4ecdc'));
          for (const sx of [-1, 1]) parts.push(boxP(0.05, 0.24, D + 0.05, sx * (w / 2 + 0.02), hh - 0.12, 0, '#f4ecdc'));
          // port med kryds på begge gavle
          const dw = Math.min(w * 0.42, 3.2), dh = Math.min(wh - 0.5, 2.8), dy = hh - 0.5 - dh / 2;
          for (const sz of [-1, 1]) {
            const z = sz * (D / 2 + 0.025);
            parts.push(boxP(dw, dh, 0.04, 0, dy, z, '#7a2a1e'), boxP(dw + 0.18, 0.1, 0.06, 0, dy + dh / 2, z, '#f4ecdc'));
            for (const ex of [-1, 1]) parts.push(boxP(0.1, dh, 0.06, ex * (dw / 2), dy, z, '#f4ecdc'));
            for (const dir of [-1, 1]) parts.push(boxP(0.09, Math.hypot(dw, dh) * 0.96, 0.06, 0, dy, z, '#f4ecdc', [0, 0, dir * Math.atan2(dw, dh)]));
          }
        } else {
          for (let i = 0; i < 3; i++) parts.push(cylP(w / 2 + 0.03, w / 2 + 0.03, 0.14, 0, hh - 0.5 - i * Math.max(0.9, wh / 3), 0, '#3a2a22', 28));
        }
        if (parts.length) g.add(mesh(merge(parts), mat('vc')));
        under(g, p, { k: 0.85, depth: clamp(Math.min(w, D) * 0.9, 3, 8), falls: false, mat: mat('soil'), sTop: 0.9, salt: wall > 0 ? 3 : 0 });
        // skråtag: flade tagrygge-streger (≤2 cm) som antydning af tagrygning
        const r2 = ctx.mulberry32(p.seed), line = [];
        for (let z = -D / 2 + 0.5; z < D / 2 - 0.3 && !cyl; z += 1.25) line.push(quadFlat(w - 0.5, 0.05, 0, z, hh + FL, '#5a1e14'));
        if (line.length) g.add(mesh(merge(line), mat('decal'))); void r2;
      };

      const bPorch = (p, g) => {
        const w = p.w, D = p.d, h = p.h, side = mat('planksDark');
        g.add(body(p, S6(side, mat('planks'), mat('planksDark')), { rot: true, side: 2.4 }));
        const r = ctx.mulberry32(p.seed + 2), t = [];
        // hvid kantliste og stolper
        for (const sz of [-1, 1]) t.push(boxP(w + 0.05, 0.2, 0.05, 0, h / 2 - 0.12, sz * (D / 2 + 0.02), '#f4ecdc'));
        for (const sx of [-1, 1]) t.push(boxP(0.05, 0.2, D + 0.05, sx * (w / 2 + 0.02), h / 2 - 0.12, 0, '#f4ecdc'));
        if (p.shape !== 'cyl' && h > 0.5) for (const sx of [-1, 1]) for (const sz of [-1, 1]) t.push(boxP(0.22, h + 1.4, 0.22, sx * (w / 2 - 0.35), -h / 2 - 0.2, sz * (D / 2 - 0.35), '#efe3cf'));
        g.add(mesh(merge(t), mat('vc')));
        // løber (flad dekal) i kløverrødt og fløde
        if (w >= 4 && D >= 4) {
          const rg = [], rw = Math.min(w * 0.55, 3.6), rd = Math.min(D * 0.28, 2.2), z0 = D * 0.28, y = h / 2 + FL;
          rg.push(quadFlat(rw, rd, 0, z0, y, '#b3392b'), quadFlat(rw - 0.3, rd - 0.3, 0, z0, y + 0.004, '#f1e2c0'), quadFlat(rw - 0.6, rd - 0.6, 0, z0, y + 0.008, '#c24a35'));
          for (let i = -2; i <= 2; i++) rg.push(quadFlat(0.08, rd - 0.6, i * (rw - 0.7) / 5, z0, y + 0.012, '#f1e2c0'));
          g.add(mesh(merge(rg), mat('decal')));
        }
        under(g, p, { k: 0.9, falls: true, sTop: 0.93 }); void r;
      };

      const bHill = (p, g) => {
        g.add(body(p, S6(mat('turfSide'), mat('turfTop'))));
        under(g, p, { vScale: 0.55, depth: clamp(Math.min(p.w, p.d) * 1.1 + 2, 4, 12), sTop: 0.99 });
        // cirkel af sandfarvede fliser rundt om portalen
        const r = ctx.mulberry32(p.seed + 4), parts = [], R0 = Math.min(p.w, p.d) * 0.3, y = p.h / 2 + FL, cols = ['#d9bf8c', '#caa874', '#e2c99a', '#bf9a66'];
        const n = Math.round(R0 * 5);
        for (let i = 0; i < n; i++) {
          const a = (i / n) * TAU;
          parts.push(quadFlat(0.55, 0.36, Math.cos(a) * R0, Math.sin(a) * R0, y, cols[(r() * 4) | 0], -a + PI / 2 + (r() - 0.5) * 0.12));
          if (i % 2 === 0) parts.push(quadFlat(0.45, 0.3, Math.cos(a + 0.12) * (R0 + 0.55), Math.sin(a + 0.12) * (R0 + 0.55), y, cols[(r() * 4) | 0], -a + PI / 2));
        }
        const dm = mesh(merge(parts), mat('decal')); dm.userData.noCastShadow = true; g.add(dm);
        const fl = [];
        for (let i = 0; i < 40; i++) {
          const a = r() * TAU, rad = rr(r, R0 + 1.2, Math.min(p.w, p.d) / 2 - 0.4);
          fl.push(disc(rr(r, 0.07, 0.13), Math.cos(a) * rad, Math.sin(a) * rad, y, ['#fff6e0', '#ffd23a', '#f08ab4', '#e23a2e'][(r() * 4) | 0], 7));
        }
        g.add(mesh(merge(fl), mat('decal')));
      };

      const bLog = (p, g) => {
        const w = p.w, D = p.d, h = p.h, bark = mat('bark');
        const cut = mat('planksOld');
        g.add(body(p, [bark, bark, mat('planks'), bark, cut, cut], { side: 1.6, top: 2.4, rot: true }));
        const free = ctx.freeBelow(p), rg = [];
        // årringe i enderne
        const cols = ['#d9b27a', '#b98a54', '#cfa56c', '#a67842', '#c79a60', '#8e6334'];
        for (const sz of [-1, 1]) for (let i = 0; i < 6; i++) {
          rg.push({ geo: new THREE.CircleGeometry(1, 20), pos: [0, 0, sz * (D / 2 + 0.01 + i * 0.002)], rot: [0, sz > 0 ? 0 : PI, 0], scl: [(w / 2) * (1 - i * 0.16), (h / 2) * (1 - i * 0.16), 1], color: cols[i] });
        }
        // bunden rundes af: halv stamme under kassen
        if (free > 0.9) {
          const dp = Math.min(free - 0.4, Math.max(0.4, w * 0.4));
          const hl = new THREE.CylinderGeometry(1, 1, D * 0.98, 16, 1, false, PI * 0.5, PI);
          rg.push({ geo: hl, pos: [0, -h / 2, 0], rot: [0, 0, PI / 2], scl: [dp, 1, w / 2 * 0.96], color: '#6a4a2e' });
        }
        g.add(mesh(merge(rg), mat('vc')));
      };

      // Tætte flader, der kan bruges til de øvrige typer
      const raft = (p, g, top, sideMat) => {
        g.add(body(p, S6(sideMat || mat('planksDark'), top || mat('planks'), mat('planksDark')), { rot: true }));
      };

      const platform = (p) => {
        const g = new THREE.Group();
        const t = p.type, v = p.v, cyl = p.shape === 'cyl', D = p.d;
        const kind = t === 'start' ? (v === 'porch' || !v ? 'porch' : v) : t === 'finish' ? (v || 'hill') : t === 'p' ? (v || 'turf') : null;
        if (kind) {
          switch (kind) {
            case 'porch': bPorch(p, g); break;
            case 'hill': bHill(p, g); break;
            case 'bridge': bBridge(p, g); break;
            case 'hay': bHay(p, g); break;
            case 'barn': bBarn(p, g); break;
            case 'log': bLog(p, g); break;
            case 'flowers': bTurf(p, g, true); break;
            default: bTurf(p, g, false);
          }
          return g;
        }
        switch (t) {
          case 'ice': { // frossen dam: blank is med indfrosne blade og en iset jordkegle
            g.add(body(p, S6(mat('iceSide'), mat('iceTop'), mat('iceSide'))));
            under(g, p, { mat: mat('iceSide'), falls: false, roots: false, k: 0.95 });
            const r = ctx.mulberry32(p.seed), parts = [];
            for (let i = 0; i < 9; i++) parts.push(quadFlat(rr(r, 0.04, 0.07), rr(r, 0.5, 1.4), rr(r, -p.w * 0.4, p.w * 0.4), rr(r, -D * 0.4, D * 0.4), p.h / 2 + FL, '#f4fcff', r() * PI));
            for (let i = 0; i < 6; i++) parts.push(disc(rr(r, 0.1, 0.25), rr(r, -p.w * 0.38, p.w * 0.38), rr(r, -D * 0.38, D * 0.38), p.h / 2 + FL, '#7fb27a', 6));
            g.add(mesh(merge(parts), mat('decal')));
            break;
          }
          case 'crumble': { // tørre, revnede planker med huller
            raft(p, g, mat('planksOld'), mat('planksOld'));
            cracks(g, p, p.seed, Math.max(3, Math.round(p.w * 0.9)));
            const free = ctx.freeBelow(p), u = [];
            for (const sx of [-1, 1]) u.push(boxP(0.16, Math.min(1.2, free), 0.16, sx * (p.w / 2 - 0.4), -p.h / 2 - Math.min(1.2, free) / 2, 0, '#5a4026'));
            g.add(mesh(merge(u), mat('vc')));
            break;
          }
          case 'move': case 'swing': { // tømmerflåde på tønder
            raft(p, g);
            const free = ctx.freeBelow(p), br = Math.min(0.42, free * 0.5), u = [];
            if (br > 0.2) for (const sx of [-1, 1]) {
              u.push(cylP(br, br, D * 0.84, sx * p.w * 0.27, -p.h / 2 - br * 0.75, 0, '#9a6a3a', 14, [PI / 2, 0, 0]));
              for (const z of [-0.3, 0.3]) u.push(cylP(br + 0.02, br + 0.02, 0.1, sx * p.w * 0.27, -p.h / 2 - br * 0.75, z * D, '#3c3733', 14, [PI / 2, 0, 0]));
            }
            if (u.length) g.add(mesh(merge(u), mat('vc')));
            if (t === 'swing') { // flade jernplader, hvor kæderne sidder fast
              const pl = [], cw = p.w * 0.42, cd = D * 0.42;
              for (const [cx, cz] of [[-cw, -cd], [cw, -cd], [-cw, cd], [cw, cd]]) pl.push(disc(0.17, cx, cz, p.h / 2 + FL, '#2e2a27', 10), disc(0.09, cx, cz, p.h / 2 + FL + 0.004, '#8a7f72', 10));
              g.add(mesh(merge(pl), mat('decal')));
            }
            break;
          }
          case 'bounce': { // rød fluesvamp med hvide pletter
            g.add(body(p, S6(mat('capRed'), mat('capRed'), mat('cream'))));
            const r = ctx.mulberry32(p.seed), sp = [], free = ctx.freeBelow(p);
            for (let i = 0; i < 9; i++) {
              const a = r() * TAU, rad = Math.sqrt(r()), hw = p.w / 2 - 0.45;
              sp.push(disc(rr(r, 0.15, 0.4), cyl ? Math.cos(a) * rad * hw : rr(r, -hw, hw), cyl ? Math.sin(a) * rad * hw : rr(r, -(D / 2 - 0.45), D / 2 - 0.45), p.h / 2 + FL, '#fff7e6', 10));
            }
            g.add(mesh(merge(sp), mat('decal')));
            const sl = Math.min(2.4, free - 0.4);
            if (sl > 0.5) {
              const st = new THREE.CylinderGeometry(Math.min(p.w, D) * 0.2, Math.min(p.w, D) * 0.12, sl, 14);
              g.add(mesh(st, mat('cream'), 0, -p.h / 2 - sl / 2, 0));
            }
            break;
          }
          case 'spin': { // rund bræddeskive med nav
            g.add(body(p, S6(mat('planksDark'), mat('planks'), mat('planksDark')), { rot: true }));
            under(g, p, { k: 0.8, falls: false });
            g.add(mesh(new THREE.CylinderGeometry(0.2, 0.28, 0.34, 14), mat('iron'), 0, p.h / 2 + 0.17, 0));
            const rg = [], R = p.w / 2;
            rg.push({ geo: new THREE.RingGeometry(R - 0.34, R - 0.14, 40), pos: [0, p.h / 2 + FL, 0], rot: [-PI / 2, 0, 0], color: '#3c3733' });
            g.add(mesh(merge(rg), mat('decal')));
            break;
          }
          case 'conveyor': { // brædder på rulle: texturen rulles i update
            const top = beltMat(p);
            g.add(body(p, [mat('planksDark'), mat('planksDark'), top, mat('planksDark'), mat('planksDark'), mat('planksDark')], { rot: p.beltAx === 'x' }));
            break;
          }
          case 'rot': { // vognhjul, der drejer
            g.add(body(p, S6(mat('barkR'), mat('planks'), mat('planksDark')), { rot: true, side: 1.6 }));
            const R = p.w / 2, rg = [], y = p.h / 2 + FL;
            rg.push({ geo: new THREE.RingGeometry(R - 0.3, R - 0.04, 48), pos: [0, y, 0], rot: [-PI / 2, 0, 0], color: '#2e2a27' });
            for (let i = 0; i < 4; i++) rg.push(quadFlat(0.2, R * 1.9, 0, 0, y + 0.004, '#3c2a1c', (i * PI) / 4 + 0.0));
            rg.push(disc(0.5, 0, 0, y + 0.008, '#2e2a27', 16), disc(0.28, 0, 0, y + 0.012, '#8e7b5e', 16));
            g.add(mesh(merge(rg), mat('decal')));
            const free = ctx.freeBelow(p), ax = Math.min(1.8, free - 0.3);
            if (ax > 0.4) g.add(mesh(new THREE.CylinderGeometry(0.3, 0.14, ax, 10), mat('barkR'), 0, -p.h / 2 - ax / 2, 0));
            break;
          }
          case 'vent': { // trælameller over en mørk skakt
            g.add(body(p, S6(mat('planksDark'), mat('iron'), mat('planksDark'))));
            const sl = [], y = p.h / 2 + FL;
            for (let z = -D / 2 + 0.28; z < D / 2 - 0.1; z += 0.5) sl.push(quadFlat(p.w - 0.3, 0.26, 0, z, y, '#a9824f'), quadFlat(p.w - 0.3, 0.04, 0, z + 0.15, y + 0.003, '#d8b27a'));
            g.add(mesh(merge(sl), mat('decal')));
            break;
          }
          case 'ramp': { // planke-rampe med køler og vinkelret underbygning
            raft(p, g, mat('planks'), mat('planksDark'));
            const pt = p.pitch, S = p.slopeLen, w = p.w, h = p.h, ref = new THREE.Group();
            ref.rotation.x = -pt; // lodret hjælpeakse
            const yR = -h / 2 * Math.cos(pt) - (S / 2) * Math.sin(pt), yF = yR + S * Math.sin(pt) * 1;
            const zR = -h / 2 * Math.sin(pt) + (S / 2) * Math.cos(pt), zF = -h / 2 * Math.sin(pt) - (S / 2) * Math.cos(pt);
            const sh = new THREE.Shape(); sh.moveTo(zR, yR); sh.lineTo(zF, yR); sh.lineTo(zF, yF - 0.02); sh.lineTo(zR, yR + 0.02);
            const ex = new THREE.ExtrudeGeometry(sh, { depth: 0.12, bevelEnabled: false });
            for (const sx of [-1, 1]) {
              const m = mesh(ex.clone(), mat('planksDark'));
              m.rotation.y = -PI / 2; m.position.x = sx * (w / 2 - 0.08) + 0.06;
              ref.add(m);
            }
            g.add(ref);
            break;
          }
          case 'rail': { // gammel hegnsbjælke på stolper
            const free = ctx.freeBelow(p), lg = Math.min(1.1, free), u = [];
            u.push({ geo: new THREE.CylinderGeometry(0.058, 0.058, D, 10), pos: [0, 0, 0], rot: [PI / 2, 0, 0], color: '#a67842' });
            u.push(cylP(0.075, 0.075, 0.1, 0, 0, -D / 2 + 0.05, '#2e2a27', 10, [PI / 2, 0, 0]), cylP(0.075, 0.075, 0.1, 0, 0, D / 2 - 0.05, '#2e2a27', 10, [PI / 2, 0, 0]));
            for (let z = -D / 2 + 0.6; z < D / 2; z += 2) u.push(boxP(0.1, lg, 0.1, 0, -lg / 2, z, '#6e4a2c'));
            const m = mesh(merge(u), mat('vc'));
            g.add(m);
            const hit = new THREE.Mesh(tr(new THREE.BoxGeometry(p.w, p.h, D)), mat('bark')); hit.visible = false; hit.userData.solid = true; g.add(hit);
            break;
          }
          case 'boost': { // brædder med lysende grønne piletegn
            raft(p, g, mat('planks'), mat('planksDark'));
            const ch = [], n = Math.max(2, Math.floor(D / 1.6)), cw = p.w * 0.36;
            for (let i = 0; i < n; i++) {
              const z = D / 2 - ((i + 0.5) * D) / n, sh = new THREE.Shape();
              sh.moveTo(0, -0.45); sh.lineTo(cw, 0.1); sh.lineTo(cw, 0.4); sh.lineTo(0, -0.1); sh.lineTo(-cw, 0.4); sh.lineTo(-cw, 0.1);
              const gm = new THREE.ShapeGeometry(sh);
              const m = mesh(gm, mat('glow')); m.rotation.x = -PI / 2; m.position.set(0, p.h / 2 + FL, z);
              m.userData.noCastShadow = true; g.add(m);
            }
            break;
          }
          default: bTurf(p, g, false);
        }
        return g;
      };

      /* ---------- Transportbånd: teksturen rulles ---------- */
      const belts = [];
      const beltMat = (p) => {
        const t = T('planks').clone(); t.needsUpdate = true;
        t.center.set(0.5, 0.5); t.repeat.set(Math.max(1, p.w / 2.4), Math.max(1, p.d / 2.4));
        if (p.beltAx === 'x') t.rotation = PI / 2;
        tr(t);
        const m = tr(std({ map: t, roughness: 0.85, color: '#d9c4a4' }));
        belts.push({ t, p });
        return m;
      };

      /* ---------- Stænger, svævebaner, ankre ---------- */
      const bar = (b) => {
        const g = new THREE.Group(), len = b.len, r = b.r, branch = b.v === 'branch';
        const pole = new THREE.CylinderGeometry(r, branch ? r * 1.1 : r, len, 12).rotateZ(PI / 2);
        g.add(mesh(pole, mat('barkR')));
        const u = [];
        if (!branch) {
          for (const sx of [-1, 1]) {
            u.push(cylP(r * 1.55, r * 1.55, 0.1, sx * (len / 2 - 0.22), 0, 0, '#3c3733', 12, [0, 0, PI / 2]));
            u.push(boxP(0.16, 0.2, 0.2, sx * (len / 2 + 0.06), 0, 0, '#8a5a30'));
            u.push(boxP(0.1, 0.85, 0.1, sx * (len / 2 + 0.06), 0.52, 0, '#7a4e2a'));
            u.push({ geo: new THREE.ConeGeometry(0.12, 0.5, 3), pos: [sx * (len / 2 + 0.06) - sx * 0.25, 0.8, 0], rot: [0, 0, sx * PI / 2], color: '#d8392b' });
          }
        } else { // æblegren: kviste, blade og hængende æbler
          const rg = ctx.mulberry32(Math.round(b.x * 31 + b.z * 17 + len * 7));
          for (let i = 0; i < 7; i++) {
            const x = rr(rg, -len / 2 + 0.2, len / 2 - 0.2), up = rg() < 0.5 ? 1 : -0.4, l = rr(rg, 0.3, 0.6), z = rr(rg, -0.25, 0.25);
            u.push(cylP(0.016, 0.028, l, x, up * l * 0.45, z * 0.4, '#5a3b22', 5, [z, 0, -up * 0.35]));
            for (let k = 0; k < 4; k++) u.push({ geo: new THREE.CircleGeometry(rr(rg, 0.09, 0.14), 5), pos: [x + rr(rg, -0.12, 0.12), up * l + rr(rg, -0.06, 0.1), z + rr(rg, -0.12, 0.12)], rot: [rr(rg, -1.3, 1.3), rr(rg, 0, PI), 0], color: ['#5fa83a', '#74bb48', '#4a9430'][k % 3] });
            if (rg() < 0.7) u.push(ballP(0.075, x + 0.03, -0.12 - rg() * 0.08, z, rg() < 0.7 ? '#d63a2c' : '#f0b030', [1, 0.9, 1]));
            if (rg() < 0.4) u.push(disc(0.04, x, z, 0.0, '#ffe6ee', 5));
          }
          u.push(cylP(r * 1.5, r * 1.1, 0.25, -len / 2 + 0.05, 0, 0, '#4e3320', 8, [0, 0, PI / 2]));
        }
        g.add(mesh(merge(u), mat('vcDS')));
        return g;
      };
      const zip = (z) => {
        const g = new THREE.Group(), a = new V3(z.ax, z.ay, z.az), b = new V3(z.bx, z.by, z.bz), d = b.clone().sub(a), L = d.length();
        const cable = mesh(new THREE.CylinderGeometry(0.03, 0.03, L, 6), mat('rope'));
        cable.position.copy(a).addScaledV3 ? 0 : 0;
        cable.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
        cable.quaternion.setFromUnitVectors(new V3(0, 1, 0), d.normalize());
        g.add(cable);
        const side = new V3(z.dz, 0, -z.dx), u = [];
        for (const [e, s] of [[a, 1], [b, -1]]) { // stolpe ved siden af linjen med bom, der ender før linjens start
          const px = e.x + side.x * 1.1, pz = e.z + side.z * 1.1;
          u.push(cylP(0.11, 0.14, 4, px, e.y - 1.6, pz, '#7a4e2a', 8));
          u.push(boxP(0.12, 0.12, 1.1, px - side.x * 0.5, e.y + 0.1, pz - side.z * 0.5, '#6e4a2c', [0, Math.atan2(side.x, side.z), 0]));
          u.push({ geo: new THREE.ConeGeometry(0.16, 0.5, 3), pos: [px - side.x * 0.1, e.y + 0.55 * s, pz - side.z * 0.1], rot: [0, 0, PI / 2], color: s > 0 ? '#d8392b' : '#f2b630' });
        }
        g.add(mesh(merge(u), mat('vc')));
        return g;
      };
      const anchor = () => { // gylden æble med blad
        const g = new THREE.Group();
        const ap = new THREE.Mesh(tr(new THREE.SphereGeometry(0.22, 18, 14)), tr(std({ color: '#e4452b', roughness: 0.3, emissive: '#ff6a20', emissiveIntensity: 0.4 })));
        ap.scale.y = 0.92; g.add(ap);
        g.add(mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.14, 6), mat('barkR'), 0, 0.24, 0));
        const lf = mesh(new THREE.CircleGeometry(0.13, 6), mat('vcDS'), 0.1, 0.3, 0);
        lf.geometry = merge([{ geo: new THREE.CircleGeometry(0.13, 6), color: '#6fbd3f' }]);
        lf.rotation.set(-0.6, 0.4, 0.5); g.add(lf);
        return g;
      };
      const spinArm = (p) => { // vindmøllevinge: bjælke med sejldug
        const L = p.bar, u = [];
        u.push(boxP(L, 0.12, 0.14, 0, 0, 0, '#7a4e2a'));
        const n = Math.max(3, Math.round(L / 0.8));
        for (let i = 0; i < n; i++) {
          const x = -L / 2 + (L * (i + 0.5)) / n;
          u.push(boxP(L / n - 0.06, 0.3, 0.04, x, 0, 0.11, i % 2 ? '#f6ecd6' : '#d8392b'));
          u.push(boxP(0.05, 0.34, 0.1, x - L / n / 2 + 0.03, 0, 0.05, '#5e3f23'));
        }
        const m = mesh(merge(u), mat('vc'));
        const g = new THREE.Group(); g.add(m);
        return g;
      };

      /* ====================================================================
         SCENERI
         ==================================================================== */
      const sunVec = () => {
        const th = ctx.theme, el = th.sunElev * ctx.DEG, az = th.sunAz * ctx.DEG;
        return new V3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
      };
      // Prop-geometrier (flettede, med toppunktsfarver)
      const PROPS = {};
      const prop = (k, mk) => PROPS[k] || (PROPS[k] = tr(mk()));
      const SHEEP = () => merge([
        ballP(0.4, 0, 0.55, 0, '#f6f0e4', [1.25, 0.95, 0.9], 0.18), ballP(0.28, -0.3, 0.7, 0.12, '#f1ead9', [1, 1, 1], 0.2), ballP(0.28, 0.28, 0.66, -0.1, '#f1ead9', [1, 1, 1], 0.2),
        ballP(0.2, 0.5, 0.7, 0, '#3b2f2a', [1.1, 1, 0.9]), ballP(0.08, 0.5, 0.88, 0.16, '#f6f0e4'), ballP(0.08, 0.5, 0.88, -0.16, '#f6f0e4'),
        cylP(0.045, 0.04, 0.4, 0.28, 0.2, 0.2, '#3b2f2a', 5), cylP(0.045, 0.04, 0.4, 0.28, 0.2, -0.2, '#3b2f2a', 5),
        cylP(0.045, 0.04, 0.4, -0.3, 0.2, 0.2, '#3b2f2a', 5), cylP(0.045, 0.04, 0.4, -0.3, 0.2, -0.2, '#3b2f2a', 5),
      ]);
      const TREE = (kind) => () => {
        const parts = [cylP(0.2, 0.34, 2.4, 0, 1.2, 0, '#6a4a2c', 7)];
        if (kind === 'oak') parts.push(ballP(1.7, 0, 3.6, 0, '#4f9a3a', [1, 0.85, 1], 0.3, { grad: 0.4 }), ballP(1.25, 1.1, 3.2, 0.5, '#5aa843', [1, 0.9, 1], 0.3, { grad: 0.4 }), ballP(1.3, -1.0, 3.1, -0.4, '#46893a', [1, 0.9, 1], 0.3, { grad: 0.4 }), ballP(1.1, 0.2, 4.6, -0.3, '#66b34a', [1, 0.9, 1], 0.3, { grad: 0.4 }));
        else if (kind === 'poplar') parts.push(ballP(1.0, 0, 4.6, 0, '#5ea63e', [1, 3.4, 1], 0.25, { grad: 0.35 }));
        else parts.push(ballP(1.2, 0, 1.8, 0, '#559e3c', [1.3, 0.8, 1.3], 0.3, { grad: 0.4 }), ballP(0.9, 0.9, 1.5, 0.4, '#68b24a', [1, 0.8, 1], 0.3, { grad: 0.4 }));
        return merge(parts);
      };
      const FENCE = () => merge([
        boxP(0.14, 1.0, 0.14, -1.1, 0.5, 0, '#8a6038'), boxP(0.14, 1.0, 0.14, 1.1, 0.5, 0, '#8a6038'), boxP(2.4, 0.1, 0.07, 0, 0.78, 0, '#a67842'), boxP(2.4, 0.1, 0.07, 0, 0.45, 0, '#a67842'),
      ]);
      const HAYROLL = () => merge([cylP(0.7, 0.7, 1.1, 0, 0.55, 0, '#dcb050', 12, [0, 0, 0], { jit: 0.2 }), cylP(0.72, 0.72, 0.08, 0, 0.3, 0, '#7a5426', 12), cylP(0.72, 0.72, 0.08, 0, 0.8, 0, '#7a5426', 12)]);
      const BARN = () => { // gårdens lade: røde vægge, hvid port, tegltag, lille silo
        const parts = [boxP(7, 4, 9, 0, 2, 0, '#b2382a', [0, 0, 0]), boxP(7.4, 0.4, 9.4, 0, 4.1, 0, '#f4ecdc')];
        for (const s of [-1, 1]) {
          parts.push({ geo: new THREE.CylinderGeometry(0, 1, 1, 4), pos: [s * 1.82, 5.3, 0], rot: [0, PI / 4, s * 0.0], scl: [0, 0, 0], color: '#000' });
        }
        parts.push({ geo: new THREE.CylinderGeometry(0.01, 4.8, 3.2, 4, 1), pos: [0, 5.75, 0], rot: [0, PI / 4, 0], scl: [0.9, 1, 1.25], color: '#8f3b2b' });
        parts.push(boxP(3, 3, 0.1, 0, 1.6, 4.55, '#f4ecdc'), boxP(2.6, 2.7, 0.12, 0, 1.55, 4.56, '#7a2a1e'), boxP(0.2, 3.3, 0.14, 0, 1.6, 4.58, '#f4ecdc', [0, 0, 0.62]), boxP(0.2, 3.3, 0.14, 0, 1.6, 4.58, '#f4ecdc', [0, 0, -0.62]));
        parts.push(cylP(1.4, 1.4, 7, 5.2, 3.5, -1.8, '#c9b48e', 12), { geo: new THREE.SphereGeometry(1.4, 12, 6, 0, TAU, 0, PI / 2), pos: [5.2, 7, -1.8], color: '#9d4630' });
        return merge(parts);
      };
      const COTTAGE = () => { // lille hvidkalket stuehus med teglsten og blå dør
        const parts = [boxP(7.6, 3.4, 5.6, 0, 1.7, 0, '#f2e6cf', [0, 0, 0]), boxP(7.9, 0.2, 5.9, 0, 3.45, 0, '#6e4a2c')];
        parts.push({ geo: new THREE.CylinderGeometry(0.01, 4.1, 2.6, 4, 1), pos: [0, 4.75, 0], rot: [0, PI / 4, 0], scl: [1.0, 1, 0.78], color: '#a3492f' });
        parts.push(boxP(0.9, 2.2, 0.9, 2.0, 5.9, -0.8, '#b24a30'), boxP(1.05, 0.15, 1.05, 2.0, 7.05, -0.8, '#6e4a2c'));
        parts.push(boxP(1.2, 2.2, 0.1, -1.0, 1.1, 2.85, '#3e7f77'), boxP(1.5, 0.15, 0.2, -1.0, 2.3, 2.9, '#f4ecdc'));
        for (const x of [1.4, 2.8]) parts.push(boxP(1.0, 1.0, 0.1, x, 1.9, 2.85, '#8fc9e6'), boxP(1.2, 0.12, 0.14, x, 1.3, 2.9, '#b3392b'));
        for (const x of [-2.2, 0.4, 2.6]) parts.push(boxP(0.1, 1.0, 1.0, 3.85, 1.9, x * 0.5, '#8fc9e6'));
        for (let i = 0; i < 5; i++) parts.push(ballP(0.12, 1.0 + i * 0.28, 1.4, 2.95, ['#f08ab4', '#ffd23a', '#e23a2e'][i % 3]));
        return merge(parts);
      };
      const MENHIR = () => {
        const g = new THREE.CylinderGeometry(0.5, 0.82, 3.6, 6, 3), P = g.attributes.position;
        for (let i = 0; i < P.count; i++) { const h = Math.sin(P.getX(i) * 7.3 + P.getY(i) * 3.1 + P.getZ(i) * 5.7); P.setX(i, P.getX(i) * (1 + h * 0.07)); P.setZ(i, P.getZ(i) * (1 + h * 0.07)); }
        g.translate(0, 1.8, 0);
        const parts = [{ geo: g, color: '#c4a574', jit: 0.25, grad: 0.35 }, { geo: new THREE.CylinderGeometry(0.55, 0.9, 1.0, 6), pos: [0, 0.5, 0], color: '#6f8f3c', jit: 0.3 }];
        return merge(parts);
      };
      const RUNES = () => merge([boxP(0.06, 0.5, 0.02, 0, 2.2, 0.5, '#8ff5d6'), boxP(0.35, 0.05, 0.02, 0, 2.4, 0.5, '#8ff5d6'), boxP(0.05, 0.3, 0.02, 0.2, 1.8, 0.58, '#8ff5d6'), boxP(0.25, 0.05, 0.02, -0.1, 1.6, 0.6, '#8ff5d6')]);
      const BALLOON = () => {
        const g = new THREE.Group();
        const env = new THREE.Mesh(tr(new THREE.SphereGeometry(1, 24, 16)), tr(std({ map: T('balloon'), roughness: 0.6, side: THREE.FrontSide })));
        env.scale.set(7, 8.5, 7); env.position.y = 9.5; g.add(env);
        const lower = new THREE.Mesh(tr(new THREE.ConeGeometry(2.6, 3.4, 18, 1, true)), env.material);
        lower.rotation.x = PI; lower.position.y = 2.6; g.add(lower);
        const basket = mesh(new THREE.BoxGeometry(2, 1.4, 2), mat('planks'), 0, -1.4, 0); g.add(basket);
        const ro = [];
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) ro.push(cylP(0.04, 0.04, 3.2, sx * 0.9, 1.0, sz * 0.9, '#c8a46a', 4, [sz * 0.25, 0, -sx * 0.25]));
        g.add(mesh(merge(ro), mat('vc')));
        return g;
      };

      // Er (x, z) mindst m meter fra platformens fodaftryk? (rektangel/cirkel)
      const rectDist = (p, x, z) => {
        const dx = x - p.x, dz = z - p.z;
        if (p.shape === 'cyl') return Math.max(0, Math.hypot(dx, dz) - p.w / 2);
        const f = ctx.fwdVec(p.yaw), r = ctx.rightVec(p.yaw), lz = dx * f.x + dz * f.z, lx = dx * r.x + dz * r.z;
        return Math.hypot(Math.max(Math.abs(lx) - p.w / 2, 0), Math.max(Math.abs(lz) - p.d / 2, 0));
      };

      const inst = [], windmills = [], balloons = [], smoke = [], sparkTime = { value: 0 };
      return {
        ventColor: '#fff0c0',
        platform, bar, zip, anchor, spinArm,
        decor(data) {
          const root = new THREE.Group(), plats = data.plats, B = data.bounds, r = ctx.mulberry32(5150 + ctx.levelIndex);
          const lavaY = ctx.lavaY, P0 = plats[0], PL = plats[plats.length - 1];
          // frit for banen? (y = ø-overflade, dep = dybde, m = ekstra margin)
          const free = (x, y, z, rad, dep, m = 8) => {
            for (const p of plats) {
              if (y - dep > p.top + 8 || y + 14 < p.top - 6) continue;
              if (rectDist(p, x, z) < rad + m) return false;
            }
            return true;
          };
          const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), Y = new V3(0, 1, 0);
          const put = (list, x, y, z, s, ry = 0, sy = s) => { M4.compose(new V3(x, y, z), Q.setFromAxisAngle(Y, ry), new V3(s, sy, s)); list.push(M4.clone()); };
          const L = { top: [[], [], []], tree: [], poplar: [], bush: [], sheep: [], fence: [], hay: [], barn: [], menhir: [], runes: [], cottage: [], sky: [] };
          const islands = [];
          const addIsland = (x, y, z, R, o = {}) => {
            const dep = Math.min(R * 0.95 + 5, y - lavaY - 4);
            if (dep < 4) return null;
            const v = (r() * 3) | 0;
            put(L.top[v], x, y, z, R, r() * TAU, dep);
            islands.push({ x, y, z, R, dep, v });
            return islands[islands.length - 1];
          };
          // 1) spredte gårdøer rundt om banen
          const span = Math.max(80, B.radius);
          for (let tries = 0, n = 0; tries < 400 && n < 34; tries++) {
            const base = plats[(r() * plats.length) | 0], a = r() * TAU, dist = rr(r, 28, 60 + span * 0.7);
            const R = rr(r, 7, 26), x = base.x + Math.cos(a) * dist, z = base.z + Math.sin(a) * dist, y = rr(r, base.top - 62, base.top + 24);
            if (y < lavaY + 16 || !free(x, y, z, R, R * 0.95 + 5, 10)) continue;
            if (islands.some((q) => Math.hypot(q.x - x, q.z - z) < q.R + R + 8 && Math.abs(q.y - y) < 26)) continue;
            const isl = addIsland(x, y, z, R);
            if (!isl) continue;
            n++;
            const kind = r(), cnt = (k) => Math.round(k * R / 12);
            const spot = (rad) => { const q = r() * TAU, d = Math.sqrt(r()) * R * rad; return [x + Math.cos(q) * d, z + Math.sin(q) * d]; };
            if (kind < 0.18 && R > 12) { const s = spot(0.4); put(L.barn, s[0], y, s[1], 1.0, r() * TAU); }
            if (kind > 0.8 && R > 11) { const s = spot(0.3); windmills.push({ x: s[0], y, z: s[1], s: 0.7, ry: r() * TAU }); }
            for (let i = 0; i < cnt(5) + 2; i++) { const s = spot(0.85); put(r() < 0.3 ? L.poplar : L.tree, s[0], y, s[1], rr(r, 1.2, 2.2), r() * TAU); }
            for (let i = 0; i < cnt(4); i++) { const s = spot(0.85); put(L.bush, s[0], y, s[1], rr(r, 0.9, 1.6), r() * TAU); }
            const gx = spot(0.5);
            for (let i = 0; i < 2 + cnt(4); i++) put(L.sheep, gx[0] + rr(r, -5, 5), y, gx[1] + rr(r, -5, 5), rr(r, 1.1, 1.5), r() * TAU);
            if (r() < 0.5) for (let i = 0; i < 3; i++) { const s = spot(0.7); put(L.hay, s[0], y, s[1], rr(r, 1.3, 2), r() * TAU); }
            if (r() < 0.55) for (let i = 0; i < 7; i++) { const q = r() * TAU; put(L.fence, x + Math.cos(q) * R * 0.88, y, z + Math.sin(q) * R * 0.88, 1.3, -q + PI / 2); }
          }
          // 2) startens stuehus ved siden af verandaen (på sin egen ø, lavere end banen)
          const place = (p, side, gap, size) => {
            const f = ctx.fwdVec(p.yaw), rv = ctx.rightVec(p.yaw);
            const c = (s) => ({ x: p.x + rv.x * s * (p.w / 2 + gap + size) , z: p.z + rv.z * s * (p.w / 2 + gap + size), yaw: p.yaw + (s > 0 ? -PI / 2 : PI / 2) });
            void f; return c(side);
          };
          for (const side of [-1, 1]) {
            const c = place(P0, side, 0.8, 3.0);
            if (plats.slice(1).every((p) => rectDist(p, c.x, c.z) > 5)) {
              const y = P0.top - 2.6;
              put(L.cottage, c.x, P0.top, c.z, 1.0, -c.yaw);
              addIsland(c.x, y, c.z, 6.2); // hovedøen under huset
              for (let i = 0; i < 4; i++) put(L.sheep, c.x + rr(r, -3, 3), y, c.z + rr(r, 3.4, 5.5), 1.2, r() * TAU);
              smoke.push({ x: c.x + Math.cos(-c.yaw) * 0 + 2.0, y: P0.top + 6.9, z: c.z - 0.8 });
              break;
            }
          }
          // 3) målet: menhir-ring på små øer, æbletræ og vindmølle bagved
          const fF = ctx.fwdVec(PL.yaw), fR = ctx.rightVec(PL.yaw);
          const Rr = Math.max(PL.w, PL.d) / 2 * 1.42 + 2.6;
          for (let i = 0; i < 10; i++) {
            const a = (i / 10) * TAU + 0.2, dx = Math.cos(a), dz = Math.sin(a);
            if (dx * -fF.x + dz * -fF.z > 0.55) continue; // hold indflyvningen fri
            const x = PL.x + dx * Rr, z = PL.z + dz * Rr, y = PL.top - 1.8;
            if (!plats.every((p) => p === PL || rectDist(p, x, z) > 3.2) || !addIsland(x, y, z, 2.3)) continue;
            put(L.menhir, x, y, z, rr(r, 0.9, 1.25), r() * TAU); put(L.runes, x, y, z, 1, 0);
          }
          const tl = [1, -1].map((s) => ({ x: PL.x + fR.x * s * (PL.w / 2 + 6.5) + fF.x * 1.5, z: PL.z + fR.z * s * (PL.w / 2 + 6.5) + fF.z * 1.5 })).find((c) => plats.every((p) => p === PL || rectDist(p, c.x, c.z) > 6));
          if (tl) {
            addIsland(tl.x, PL.top - 2.4, tl.z, 4.4);
            const ap = merge([
              cylP(0.35, 0.5, 3.2, 0, 1.6, 0, '#5e3f25', 8, [0, 0, 0.06]), ...[[0, 4.9, 0, 2.5], [1.8, 4.3, 0.6, 1.9], [-1.7, 4.4, -0.5, 1.9], [0.3, 6.2, -0.4, 1.6], [0.6, 4.4, 1.9, 1.5]].map((q) => ballP(q[3], q[0], q[1], q[2], '#5aa843', [1, 0.85, 1], 0.3, { grad: 0.4 })),
              ...Array.from({ length: 22 }, (_, i) => { const a = i * 2.4, rad = 2.0 + (i % 3) * 0.35; return ballP(0.17, Math.cos(a) * rad, 4.0 + (i % 5) * 0.55, Math.sin(a) * rad, i % 4 ? '#d9352a' : '#f2b630'); }),
            ]);
            const m = mesh(ap, mat('vc')); m.position.set(tl.x, PL.top - 2.4, tl.z); m.userData.noCastShadow = false; m.castShadow = true; root.add(m);
          }
          const mp = { x: PL.x + fF.x * 52 - fR.x * 10, z: PL.z + fF.z * 52 - fR.z * 10 };
          if (addIsland(mp.x, PL.top - 9, mp.z, 17)) windmills.push({ x: mp.x, y: PL.top - 9, z: mp.z, s: 1.5, ry: -PL.yaw + PI, hero: true });
          // 4) ø-instanser (top + kegle i ét net), træer, får, huse …
          const topGeo = (seed) => {
            const g = coneGeo(1, 1, 1, seed * 31 + 7, { e0: 2.2, sTop: 1, wobAmp: 0.12, wob: [seed, seed * 2.3], tileU: 1.4, vScale: 1.0, pow: 0.75 });
            const R = 22, f = profile(1, 1, 1, { e0: 2.2, sTop: 1, wobAmp: 0.12, wob: [seed, seed * 2.3], pow: 0.75 }), P = [], U = [], I = [];
            P.push(0, 0.02, 0); U.push(0, 0);
            for (let i = 0; i <= R; i++) { const q = f(0, (i / R) * TAU); P.push(q[0], 0.02, q[2]); U.push(q[0] * 6, -q[2] * 6); }
            for (let i = 1; i <= R; i++) I.push(0, i + 1, i);
            const t = new THREE.BufferGeometry();
            t.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); t.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
            t.setAttribute('normal', new THREE.Float32BufferAttribute(P.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3)); t.setIndex(I);
            return { cone: g, top: t };
          };
          const imesh = (geo, material, list, shadow = false) => {
            if (!list.length) return null;
            const m = new THREE.InstancedMesh(tr(geo), material, list.length);
            list.forEach((mx, i) => m.setMatrixAt(i, mx));
            m.instanceMatrix.needsUpdate = true; m.frustumCulled = false; m.castShadow = shadow; m.receiveShadow = true;
            root.add(m); return m;
          };
          L.top.forEach((list, i) => {
            const t = topGeo(i + 1);
            imesh(t.cone, mat('soil'), list);
            imesh(t.top, mat('turfTop'), list);
          });
          imesh(prop('tree', TREE('oak')), mat('vc'), L.tree, true);
          imesh(prop('poplar', TREE('poplar')), mat('vc'), L.poplar);
          imesh(prop('bush', TREE('bush')), mat('vc'), L.bush);
          imesh(prop('sheep', SHEEP), mat('vc'), L.sheep);
          imesh(prop('fence', FENCE), mat('vc'), L.fence);
          imesh(prop('hay', HAYROLL), mat('vc'), L.hay);
          imesh(prop('barn', BARN), mat('vc'), L.barn);
          imesh(prop('cottage', COTTAGE), mat('vc'), L.cottage, true);
          imesh(prop('menhir', MENHIR), mat('vc'), L.menhir, true);
          const rm = imesh(prop('runes', RUNES), tr(new THREE.MeshBasicMaterial({ color: '#8ff5d6' })), L.runes);
          if (rm) rm.castShadow = false;
          // vindmøller (den store drejer bag portalen)
          const millTower = prop('mill', () => merge([
            { geo: new THREE.CylinderGeometry(1.6, 2.6, 9, 8), pos: [0, 4.5, 0], color: '#f2e6cf', jit: 0.08 }, { geo: new THREE.ConeGeometry(2.1, 2.8, 8), pos: [0, 10.4, 0], color: '#7a4a2a' },
            boxP(0.9, 1.7, 0.2, 0, 0.85, 2.5, '#3e7f77'), boxP(0.7, 0.9, 0.2, 0, 5.5, 1.9, '#8fc9e6'),
          ]));
          const sail = prop('sail', () => {
            const parts = [boxP(0.5, 0.5, 0.5, 0, 0, 0, '#5e3f23')];
            for (let i = 0; i < 4; i++) {
              const a = (i * PI) / 2, c = Math.cos(a), s = Math.sin(a);
              parts.push(boxP(0.22, 9.4, 0.18, -s * 4.7, c * 4.7, 0, '#6e4a2c', [0, 0, a]));
              parts.push(boxP(1.5, 6.6, 0.06, c * 0.95 - s * 5.3, s * 0.95 + c * 5.3, 0.14, i % 2 ? '#f6ecd6' : '#efe3c8', [0, 0, a]));
              for (let k = 1; k < 5; k++) parts.push(boxP(1.6, 0.1, 0.1, c * 0.95 - s * (1.3 + k * 1.4), s * 0.95 + c * (1.3 + k * 1.4), 0.17, '#7a4e2a', [0, 0, a]));
            }
            return merge(parts);
          });
          for (const w of windmills) {
            const g = new THREE.Group();
            g.add(mesh(millTower.clone(), mat('vc')), (() => { const s = mesh(sail.clone(), mat('vc')); s.position.set(0, 7.2, 3.0); w.sail = s; return s; })());
            g.position.set(w.x, w.y, w.z); g.rotation.y = w.ry; g.scale.setScalar(w.s);
            g.traverse((o) => { if (o.isMesh) o.castShadow = !!w.hero; });
            root.add(g);
          }
          // 5) vandfald fra de fjerne øer ned i dis
          const falls = [];
          for (const q of islands) {
            if (r() < 0.45 && q.R > 9) {
              const th = r() * TAU, H = Math.min(q.dep + 14, q.y - lavaY - 6 + q.dep * 0.1);
              falls.push({ x: q.x + Math.cos(th) * q.R * 0.9, y: q.y - 1.5, z: q.z + Math.sin(th) * q.R * 0.9, H: Math.max(10, H), wd: 0.8 + r() * 1.0, face: th });
            }
          }
          if (falls.length) { const wm = mesh(fallsGeo(falls), mat('water')); wm.userData.noCastShadow = true; wm.renderOrder = 2; root.add(wm); waterMeshes.push(wm); }
          // 6) morgendis under banen (to bløde lag), sol-glød, luftballoner, byens silhuet
          const mistMat = tr(new THREE.MeshBasicMaterial({ map: T('mist'), transparent: true, depthWrite: false, fog: true, opacity: 0.8, side: THREE.DoubleSide }));
          mistMat.map.repeat.set(7, 7);
          for (const [dy, off] of [[-26, 0], [-36, 0.37]]) {
            const m = new THREE.Mesh(tr(new THREE.PlaneGeometry(2600, 2600).rotateX(-PI / 2)), mistMat);
            m.position.set(B.cx, B.minY + dy, B.cz); m.renderOrder = -1; m.userData.off = off; root.add(m);
          }
          const sv = sunVec(), cen = new V3(B.cx, 0, B.cz);
          for (const [sc, op] of [[900, 0.55], [2600, 0.25]]) {
            const sp = new THREE.Sprite(tr(new THREE.SpriteMaterial({ map: ctx.TEX.glow, color: '#ffd7a0', transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending, opacity: op })));
            sp.position.copy(cen).addScaledVector(sv, 1500); sp.scale.set(sc, sc, 1); root.add(sp);
          }
          const bl = prop('balloon', () => new THREE.BufferGeometry());
          void bl;
          for (const [d, side, hh, s] of [[170, 80, 70, 1.6], [-90, -150, 40, 1]]) {
            const b = BALLOON();
            const pos = new V3(PL.x + fF.x * d + fR.x * side, PL.top + hh, PL.z + fF.z * d + fR.z * side);
            b.position.copy(pos); b.scale.setScalar(s * 2.2); b.userData.base = pos.clone(); b.userData.ph = r() * TAU;
            b.traverse((o) => { if (o.isMesh) o.castShadow = false; });
            root.add(b); balloons.push(b);
          }
          // byens silhuet i horisonten bag målet (bane 2)
          const sk = [];
          for (let i = 0; i < 46; i++) {
            const a = Math.atan2(fF.z, fF.x) + rr(r, -0.5, 0.5), d = 1150 + r() * 80, w = rr(r, 14, 38), h = rr(r, 25, 120) * (1 - Math.abs(a - Math.atan2(fF.z, fF.x)) * 0.6);
            M4.compose(new V3(PL.x + Math.cos(a) * d, PL.top - 30 + h / 2, PL.z + Math.sin(a) * d), Q.setFromAxisAngle(Y, -a), new V3(w, h, w * 0.7)); sk.push(M4.clone());
          }
          imesh(new THREE.BoxGeometry(1, 1, 1), tr(new THREE.MeshBasicMaterial({ color: '#c9a6b8', fog: false })), sk);
          // dug og svævende frøuld
          const SP = tr(new THREE.ShaderMaterial({
            uniforms: { uTime: sparkTime }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
            vertexShader: `uniform float uTime; attribute float aPh; varying float vA;
              void main(){ vec3 p = position; p.x += sin(uTime*0.4 + aPh*6.0)*1.5; p.y += sin(uTime*0.6 + aPh*9.0)*1.1; p.z += cos(uTime*0.35 + aPh*5.0)*1.5;
                vec3 c = cameraPosition; p = c + mod(p - c + 45.0, 90.0) - 45.0;
                vA = 0.35 + 0.65 * pow(0.5 + 0.5*sin(uTime*(1.2+aPh*2.0) + aPh*40.0), 3.0);
                vec4 mv = viewMatrix * vec4(p,1.0); gl_PointSize = clamp(90.0 / -mv.z, 1.5, 7.0); gl_Position = projectionMatrix * mv; }`,
            fragmentShader: `varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); gl_FragColor = vec4(vec3(1.0,0.93,0.72), smoothstep(0.5,0.0,d) * vA); }`,
          }));
          const N = 380, sp = new Float32Array(N * 3), ph = new Float32Array(N);
          for (let i = 0; i < N; i++) { sp[i * 3] = r() * 90 - 45; sp[i * 3 + 1] = r() * 90 - 45; sp[i * 3 + 2] = r() * 90 - 45; ph[i] = r(); }
          const sg = tr(new THREE.BufferGeometry());
          sg.setAttribute('position', new THREE.BufferAttribute(sp, 3)); sg.setAttribute('aPh', new THREE.BufferAttribute(ph, 1));
          const pts = new THREE.Points(sg, SP); pts.frustumCulled = false; root.add(pts);
          // skorstensrøg
          for (const sm of smoke) {
            sm.puffs = [];
            for (let i = 0; i < 4; i++) {
              const s = new THREE.Sprite(tr(new THREE.SpriteMaterial({ map: ctx.TEX.glow, color: '#fff3e2', transparent: true, depthWrite: false, opacity: 0.4 })));
              s.userData.t = i / 4; root.add(s); sm.puffs.push(s);
            }
          }
          return root;
        },
        update(dt, t) {
          sparkTime.value = t;
          for (const w of waterMeshes) w.material.map.offset.y = -(t * 0.9) % 1;
          for (const b of belts) if (b.t) b.t.offset.y -= dt * (Math.abs(b.p.belt) / 2.4);
          for (const w of windmills) if (w.sail) w.sail.rotation.z += dt * (w.hero ? 0.5 : 0.35);
          for (const b of balloons) {
            b.position.set(b.userData.base.x + Math.sin(t * 0.04 + b.userData.ph) * 28, b.userData.base.y + Math.sin(t * 0.3 + b.userData.ph) * 2, b.userData.base.z + Math.cos(t * 0.03 + b.userData.ph) * 20);
            b.rotation.y = t * 0.02;
          }
          for (const sm of smoke) for (const s of sm.puffs) {
            s.userData.t = (s.userData.t + dt * 0.12) % 1;
            const k = s.userData.t;
            s.position.set(sm.x + k * 1.6, sm.y + k * 4.5, sm.z); s.scale.setScalar(0.8 + k * 3.2); s.material.opacity = 0.42 * (1 - k);
          }
        },
      };
    },
  };
})();

// ---------------------------------------------------------------- rooftops
/* =====================================================================
   VERDENSSÆT 'rooftops' – Højhustagene (bane 2)
   Solrig dag over byen: tagpap og grus med betonkant, glasfacader der
   fortsætter ned i dis og lava, vandtårne på ben, aircondition-kasser,
   et vinduespudser-lift på master, gule stilladsrør, en byggeplads med
   tårnkran, helipad, tagterrasser, vasketøjssnore og en flyvemaskine-stribe.
   ===================================================================== */
(function () {
  'use strict';

  // Skarp middag: dybblå zenit, bleg horisont, høj sol
  window.SKYHOJ_THEMES.rooftops = {
    top: '#2f7fe0', horizon: '#bfe3ff', bottom: '#d3e3ef', sunElev: 65, sunAz: 28, sunColor: '#fff7ea', sunInt: 3.3,
    hemiSky: '#cfe4ff', hemiInt: 0.95, fog: '#c4dcf0', fogNear: 130, fogFar: 780, cloud: '#ffffff', clouds: 1, stars: 0,
    stone: '#cfcac2', exposure: 1.0, lavaGlow: 0.85,
  };

  window.SKYHOJ_KITS.rooftops = {
    id: 'rooftops',
    name: 'Højhustagene',
    variants: {
      tar: 'Tagpap og grus med betonkant og facade ned i dybet (standard for p/start). Kasse 5-10 x 5-10, cyl w 5-9',
      terrace: 'Træterrasse med lyse planker og sort kant. Kasse 5-9 x 4-8 (cyl w 5-8)',
      garden: 'Taghave: græs med blomsterbede og fliser, plantekasse-sider. Kasse 5-9 x 5-9 (cyl w 5-8)',
      helipad: 'Helipad: mørkt asfaltdæk, gul kant og gult H (standard for finish). Cyl w 8-13 eller kasse 8-12 x 8-12',
      tank: 'Vandtårn på stålben: planketønde med jernbånd og stållåg. shape:"cyl" w 3-6 (kasse = stålcistern)',
      ac: 'Aircondition-kasse med riste og blæsere (trin op, ingen bygning under). Kasse 2-4 x 2-4, h 1-2.2',
      hut: 'Trappehus med hvidt tag og dør. Kasse 3-6 x 3-6, h 1.5-3',
      site: 'Byggeplads: rå betonplade med armeringsnet, gul kant og skelet med stillads nedenunder. Kasse 4-8 x 4-8',
    },
    barVariants: {
      pipe: 'Gult stilladsrør med sorte koblinger (standard) – bære-master går ned i dybet',
      galv: 'Galvaniseret stålrør (koldt grå)',
    },
    create(ctx) {
      const { THREE } = ctx;
      const PI = Math.PI, TAU = PI * 2;
      const tr = (o) => ctx.track(o);
      const V3 = THREE.Vector3;
      const Z = new V3(0, 1, 0);

      /* ---------- Teksturer (max 12, tegnes først, når de bruges) ---------- */
      const tex = {};
      const canvasTex = (key, w, h, paint) => {
        if (tex[key]) return tex[key];
        const c = ctx.makeCanvas(w, h), g = c.getContext('2d');
        paint(g, w, h, ctx.mulberry32(key.length * 7919 + w));
        return (tex[key] = tr(ctx.toTexture(c)));
      };
      const px = (g, w, h, fn) => { // pixel for pixel: fn(x, y, c) skriver [r,g,b] 0..255
        const img = g.createImageData(w, h), d = img.data, c = [0, 0, 0];
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          fn(x, y, c);
          const i = (y * w + x) * 4;
          d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
        }
        g.putImageData(img, 0, 0);
      };
      const T = {
        // Tagpap med grus og sømme (flise 3 m)
        tar: () => canvasTex('tar', 512, 512, (g, S, _, r) => {
          const n1 = ctx.tileNoise(S, 5, 4, r), n2 = ctx.tileNoise(S, 32, 2, r);
          px(g, S, S, (x, y, c) => {
            const v = 0.2 + n1[y * S + x] * 0.16 + n2[y * S + x] * 0.1;
            c[0] = v * 250; c[1] = v * 255; c[2] = v * 266;
          });
          for (let i = 0; i < 900; i++) { // grus
            const lt = r() < 0.7, k = 150 + r() * 80;
            g.fillStyle = lt ? `rgba(${k},${k},${k + 6},0.7)` : 'rgba(10,10,14,0.5)';
            g.beginPath(); g.arc(r() * S, r() * S, 1 + r() * 1.8, 0, TAU); g.fill();
          }
          for (let k = 0; k < 3; k++) { // tagpapsømme hver meter
            const y = Math.round((k * S) / 3);
            g.fillStyle = 'rgba(12,13,16,0.6)'; g.fillRect(0, y, S, 5);
            g.fillStyle = 'rgba(255,255,255,0.13)'; g.fillRect(0, y + 5, S, 2);
          }
          g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(40, 60, 180, 90); // lappede reparationer
          g.fillStyle = 'rgba(0,0,0,0.07)'; g.fillRect(300, 250, 140, 120);
          for (let i = 0; i < 4; i++) { // vandpletter
            const x = r() * S, y = r() * S, rad = 25 + r() * 40;
            const gr = g.createRadialGradient(x, y, 0, x, y, rad);
            gr.addColorStop(0, 'rgba(150,175,200,0.28)'); gr.addColorStop(1, 'rgba(150,175,200,0)');
            g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
          }
        }),
        // Beton (kanter, trappehus, byggeplads) – flise 2 m
        concrete: () => canvasTex('concrete', 256, 256, (g, S, _, r) => {
          const n = ctx.tileNoise(S, 6, 4, r);
          px(g, S, S, (x, y, c) => {
            const v = 0.74 + n[y * S + x] * 0.26 + (r() - 0.5) * 0.05;
            c[0] = v * 232; c[1] = v * 230; c[2] = v * 224;
          });
          for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(60,58,54,0.25)'; g.fillRect(r() * S, r() * S, 1 + r() * 2, 1 + r() * 2); }
          g.fillStyle = 'rgba(70,68,64,0.35)'; g.fillRect(0, 0, S, 2); g.fillRect(0, 0, 2, S);
        }),
        // Blå reflekterende glasfacade (flise 8 x 8 m = 4 ruder x 2 etager)
        glass: () => canvasTex('glass', 512, 512, (g, S, _, r) => {
          g.fillStyle = '#c4d2de'; g.fillRect(0, 0, S, S);
          for (let cx = 0; cx < 4; cx++) for (let fl = 0; fl < 2; fl++) {
            const x0 = cx * 128 + 4, y0 = fl * 256 + 4, w = 120, hg = 184, k = r();
            const gr = g.createLinearGradient(0, y0, 0, y0 + hg);
            if (k < 0.2) { gr.addColorStop(0, '#f0f9ff'); gr.addColorStop(1, '#8ec6f2'); } // sky-sky
            else if (k < 0.34) { gr.addColorStop(0, '#5d7a96'); gr.addColorStop(1, '#2b445e'); } // mørkt kontor
            else { gr.addColorStop(0, '#7cbcf4'); gr.addColorStop(1, '#2c74c4'); }
            g.fillStyle = gr; g.fillRect(x0, y0, w, hg);
            if (k > 0.34 && k < 0.44) { // oplyst kontor
              g.fillStyle = 'rgba(255,226,150,0.5)'; g.fillRect(x0, y0, w, hg);
              g.fillStyle = 'rgba(120,80,30,0.25)'; for (let y = y0 + 6; y < y0 + hg; y += 9) g.fillRect(x0, y, w, 3);
            }
            g.fillStyle = 'rgba(255,255,255,0.22)'; // solglimt
            g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0 + 70, y0); g.lineTo(x0, y0 + 110); g.fill();
            g.fillStyle = '#2a5a82'; g.fillRect(x0, y0 + hg, w, 64); // brystning
            g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(x0, y0 + hg, w, 3);
          }
        }),
        // Kontorfacade med bånd-vinduer (flise 8 x 8 m, 2 etager)
        office: () => canvasTex('office', 512, 512, (g, S, _, r) => {
          const n = ctx.tileNoise(S, 8, 3, r);
          px(g, S, S, (x, y, c) => { const v = 0.82 + n[y * S + x] * 0.16; c[0] = v * 226; c[1] = v * 218; c[2] = v * 200; });
          for (let fl = 0; fl < 2; fl++) {
            const y0 = fl * 256 + 66, hw = 150;
            for (let cx = 0; cx < 4; cx++) {
              const k = r(), gr = g.createLinearGradient(0, y0, 0, y0 + hw);
              gr.addColorStop(0, k < 0.3 ? '#ffe9b0' : '#5b8aa2'); gr.addColorStop(1, k < 0.3 ? '#e8b868' : '#1f3a4c');
              g.fillStyle = gr; g.fillRect(cx * 128 + 5, y0, 118, hw);
              g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(cx * 128 + 5, y0, 118, 18);
              if (k > 0.55) { g.fillStyle = 'rgba(255,255,255,0.35)'; for (let y = y0 + 20; y < y0 + 90; y += 7) g.fillRect(cx * 128 + 8, y, 112, 2); }
            }
            g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(0, y0 + hw, S, 5);
          }
        }),
        // Murstensfacade med vinduer (flise 4 x 4 m)
        brick: () => canvasTex('brick', 512, 512, (g, S, _, r) => {
          g.fillStyle = '#cdbfa8'; g.fillRect(0, 0, S, S);
          for (let row = 0; row < 48; row++) {
            const y = row * (S / 48), off = row % 2 ? 16 : 0;
            for (let x = -32; x < S; x += 32) {
              const k = 0.8 + r() * 0.35;
              g.fillStyle = `rgb(${168 * k | 0},${82 * k | 0},${58 * k | 0})`;
              g.fillRect(x + off + 1, y + 1, 30, S / 48 - 2);
            }
          }
          for (let cx = 0; cx < 2; cx++) for (let cy = 0; cy < 2; cy++) {
            const x = cx * 256 + 58, y = cy * 256 + 36;
            g.fillStyle = '#e9e4d8'; g.fillRect(x - 8, y - 12, 156, 14); g.fillRect(x - 6, y + 188, 152, 12);
            g.fillStyle = '#f4f1e8'; g.fillRect(x, y, 140, 190);
            const k = r(), gr = g.createLinearGradient(0, y, 0, y + 190);
            gr.addColorStop(0, k < 0.3 ? '#eac47c' : '#7fb0d6'); gr.addColorStop(1, k < 0.3 ? '#b8854a' : '#2f5d86');
            g.fillStyle = gr; g.fillRect(x + 8, y + 8, 124, 174);
            g.fillStyle = 'rgba(255,255,255,0.25)'; g.beginPath(); g.moveTo(x + 8, y + 8); g.lineTo(x + 70, y + 8); g.lineTo(x + 8, y + 90); g.fill();
            g.fillStyle = '#f4f1e8'; g.fillRect(x + 66, y + 8, 8, 174); g.fillRect(x + 8, y + 84, 124, 8);
          }
        }),
        // Terrassebrædder (flise 2 m)
        deck: () => canvasTex('deck', 256, 256, (g, S, _, r) => {
          for (let i = 0; i < 14; i++) {
            const x = (i * S) / 14, w = S / 14, k = 0.62 + r() * 0.32;
            g.fillStyle = `rgb(${176 * k | 0},${124 * k | 0},${80 * k | 0})`; g.fillRect(x, 0, w, S);
            for (let j = 0; j < 7; j++) { g.fillStyle = `rgba(60,36,18,${0.1 + r() * 0.18})`; g.fillRect(x + r() * w, 0, 1, S); }
            g.fillStyle = 'rgba(30,18,10,0.65)'; g.fillRect(x, 0, 2, S);
            const y = r() * S; g.fillStyle = 'rgba(30,18,10,0.6)'; g.fillRect(x, y, w, 2);
            g.fillStyle = 'rgba(40,40,40,0.7)'; g.fillRect(x + w / 2 - 1, 20, 2, 2); g.fillRect(x + w / 2 - 1, S - 20, 2, 2);
          }
        }),
        // Græsplæne med blomster og fliser (flise 4 m)
        lawn: () => canvasTex('lawn', 512, 512, (g, S, _, r) => {
          const n = ctx.tileNoise(S, 7, 4, r);
          px(g, S, S, (x, y, c) => {
            const v = n[y * S + x], st = Math.floor(x / 64) % 2 ? 0.06 : -0.02;
            c[0] = 70 + v * 50 + st * 120 + (r() - 0.5) * 12; c[1] = 128 + v * 70 + st * 160 + (r() - 0.5) * 14; c[2] = 52 + v * 30;
          });
          g.fillStyle = '#b9b4a8'; // fliser i midten
          for (let y = 0; y < S; y += 64) { g.fillStyle = '#aaa59a'; g.fillRect(224, y + 2, 64, 60); g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(226, y + 3, 60, 4); }
          const cols = ['#ffffff', '#ffe14d', '#ff6aa8', '#ff5a3c', '#c58cff'];
          for (let k = 0; k < 9; k++) {
            const cx = r() * S, cy = r() * S, col = cols[k % 5];
            for (let i = 0; i < 26; i++) {
              const a = r() * TAU, d = r() * 26; g.fillStyle = col;
              g.beginPath(); g.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 2 + r() * 1.5, 0, TAU); g.fill();
            }
          }
        }),
        // Helipad-dekal (gennemsigtig): gul ring, hjørner og H
        helipad: () => canvasTex('helipad', 512, 512, (g) => {
          g.strokeStyle = '#f7c600'; g.lineWidth = 22; g.beginPath(); g.arc(256, 256, 214, 0, TAU); g.stroke();
          g.lineWidth = 6; g.beginPath(); g.arc(256, 256, 238, 0, TAU); g.stroke();
          g.fillStyle = '#f7c600';
          g.fillRect(150, 140, 44, 232); g.fillRect(318, 140, 44, 232); g.fillRect(150, 232, 212, 48);
        }),
        // Rådnet tag med brædder, huller og revner (flise 2,4 m)
        crumble: () => canvasTex('crumble', 512, 512, (g, S, _, r) => {
          const n = ctx.tileNoise(S, 10, 3, r);
          px(g, S, S, (x, y, c) => {
            const row = Math.floor(y / 56), k = 0.5 + ((row * 37) % 5) * 0.08 + n[y * S + x] * 0.35;
            c[0] = 128 * k; c[1] = 104 * k; c[2] = 82 * k;
          });
          for (let row = 0; row < 10; row++) {
            const y = row * 56; g.fillStyle = 'rgba(14,10,6,0.85)'; g.fillRect(0, y, S, 4);
            const x = r() * S; g.fillRect(x, y, 3, 56);
            if (r() < 0.3) { g.fillStyle = '#0c0a08'; g.fillRect(r() * 380, y + 4, 60 + r() * 70, 40); } // manglende stykke
          }
          g.strokeStyle = '#0a0806'; g.lineCap = 'round';
          for (let k = 0; k < 4; k++) { // revner
            let x = r() * S, y = r() * S; g.lineWidth = 4 + r() * 3; g.beginPath(); g.moveTo(x, y);
            for (let i = 0; i < 9; i++) { x += (r() - 0.5) * 70; y += 28 + r() * 30; g.lineTo(x, y); }
            g.stroke();
          }
        }),
        // Tern-stålplade (flise 1,2 m)
        steel: () => canvasTex('steel', 256, 256, (g, S) => {
          g.fillStyle = '#8c959e'; g.fillRect(0, 0, S, S);
          for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
            for (const [dx, dy, a] of [[4, 4, 0.8], [12, 12, -0.8]]) {
              g.save(); g.translate(x * 16 + dx, y * 16 + dy); g.rotate(((x + y) % 2 ? a : -a));
              g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(-4, -1, 8, 3);
              g.fillStyle = 'rgba(255,255,255,0.55)'; g.fillRect(-4, -2, 8, 2); g.restore();
            }
          }
        }),
        // Ventilationsrist (flise 1 m)
        louvre: () => canvasTex('louvre', 128, 128, (g, S) => {
          g.fillStyle = '#23282e'; g.fillRect(0, 0, S, S);
          for (let y = 0; y < S; y += 10) {
            g.fillStyle = '#b9c1c8'; g.fillRect(0, y, S, 6);
            g.fillStyle = '#e6ebef'; g.fillRect(0, y, S, 2);
          }
        }),
        // Gummibånd med gule pile (flise 2 m)
        belt: () => canvasTex('belt', 128, 256, (g, S, H) => {
          g.fillStyle = '#25282c'; g.fillRect(0, 0, S, H);
          g.fillStyle = '#3a3f46'; for (let y = 0; y < H; y += 8) g.fillRect(0, y, S, 2);
          g.fillStyle = '#f2b705';
          for (const y0 of [30, 158]) {
            g.beginPath(); g.moveTo(64, y0); g.lineTo(108, y0 + 46); g.lineTo(86, y0 + 46); g.lineTo(64, y0 + 22);
            g.lineTo(42, y0 + 46); g.lineTo(20, y0 + 46); g.closePath(); g.fill();
          }
        }),
      };

      /* ---------- Materialer ---------- */
      const mats = {};
      const std = (key, o) => mats[key] || (mats[key] = tr(new THREE.MeshStandardMaterial(o)));
      const M = {
        tar: () => std('tar', { map: T.tar(), roughness: 0.95 }),
        concrete: (c = '#ffffff') => std('conc' + c, { map: T.concrete(), color: c, roughness: 0.9 }),
        coping: () => std('coping', { map: T.concrete(), color: '#a7a39a', roughness: 0.9, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
        copingCol: (c) => std('cop' + c, { color: c, roughness: 0.7, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
        deck: (c = '#ffffff') => std('deck' + c, { map: T.deck(), color: c, roughness: 0.85 }),
        steel: (c = '#ffffff') => std('steel' + c, { map: T.steel(), color: c, roughness: 0.42, metalness: 0.6 }),
        dark: () => std('dark', { color: '#2a2f36', roughness: 0.55, metalness: 0.6 }),
        yellow: () => std('yellow', { color: '#f2bf14', roughness: 0.42, metalness: 0.25 }),
        paint: (c) => std('p' + c, { color: c, roughness: 0.6, metalness: 0.15 }),
        vcol: () => std('vcol', { vertexColors: true, roughness: 0.7, metalness: 0.15 }),
        decal: () => std('decal', { vertexColors: true, roughness: 0.6, metalness: 0.1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
      };
      const FAC = { // facade-typer: [materiale, flisestørrelse, brystningsfarve]
        glass: () => [std('glass', { map: T.glass(), roughness: 0.14, metalness: 0.6 }), 8, M.concrete('#9fb7cc')],
        office: () => [std('office', { map: T.office(), roughness: 0.55, metalness: 0.1 }), 8, M.concrete('#e4dcc8')],
        brick: () => [std('brick', { map: T.brick(), roughness: 0.85 }), 4, M.concrete('#c8745a')],
      };
      const FKINDS = ['glass', 'office', 'glass', 'brick', 'glass'];

      /* ---------- Geometri-hjælpere ---------- */
      // Slå mange små dele (med farve pr. del) sammen til ét mesh
      const merge = (parts) => {
        let n = 0;
        const gs = parts.map((p) => { const g = p.g.index ? p.g.toNonIndexed() : p.g; n += g.attributes.position.count; return g; });
        const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2), cl = new Float32Array(n * 3);
        let o = 0;
        gs.forEach((g, i) => {
          const cnt = g.attributes.position.count, c = parts[i].c;
          pos.set(g.attributes.position.array, o * 3);
          if (g.attributes.normal) nor.set(g.attributes.normal.array, o * 3);
          if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
          for (let k = 0; k < cnt; k++) { cl[(o + k) * 3] = c ? c.r : 1; cl[(o + k) * 3 + 1] = c ? c.g : 1; cl[(o + k) * 3 + 2] = c ? c.b : 1; }
          o += cnt;
          if (g !== parts[i].g) g.dispose();
          parts[i].g.dispose();
        });
        const out = new THREE.BufferGeometry();
        out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
        out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
        out.setAttribute('color', new THREE.BufferAttribute(cl, 3));
        return tr(out);
      };
      const C = {}; const cc = (h) => C[h] || (C[h] = new THREE.Color(h));
      const B = (w, h, d, x, y, z, c, ry = 0) => ({ g: new THREE.BoxGeometry(w, h, d).rotateY(ry).translate(x, y, z), c: cc(c) });
      const Cy = (rt, rb, h, x, y, z, c, seg = 10) => ({ g: new THREE.CylinderGeometry(rt, rb, h, seg).translate(x, y, z), c: cc(c) });
      const Bm = (a, b, r, c, seg = 5) => { // rør mellem to punkter
        const d = new V3().subVectors(b, a), len = d.length();
        const g = new THREE.CylinderGeometry(r, r, len, seg).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(Z, d.normalize()));
        const m = new V3().addVectors(a, b).multiplyScalar(0.5);
        return { g: g.translate(m.x, m.y, m.z), c: cc(c) };
      };
      const P3 = (x, y, z) => new V3(x, y, z);
      const mesh = (geo, mat, noShadow) => { const m = new THREE.Mesh(geo, mat); if (noShadow) m.userData.noCastShadow = true; return m; };
      const shiftUV = (geo, du, dv) => {
        const uv = geo.attributes.uv;
        for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) + du, uv.getY(i) + dv);
        return geo;
      };

      // Betonkant: flad ring langs toppen + smalt bånd ned ad siden (flugter med fodaftrykket)
      const copingGeo = (p, cw, drop) => {
        const y0 = p.h / 2 + 0.004, e = 0.004;
        if (p.shape === 'cyl') {
          const R = p.w / 2;
          return merge([
            { g: new THREE.RingGeometry(Math.max(0.05, R - cw), R, 48, 1).rotateX(-PI / 2).translate(0, y0, 0) },
            { g: new THREE.CylinderGeometry(R + e, R + e, drop, 48, 1, true).translate(0, y0 - drop / 2, 0) },
          ]);
        }
        const hw = p.w / 2, hd = p.d / 2, pos = [], yb = y0 - drop;
        const quad = (a, b, c, d) => pos.push(...a, ...b, ...c, ...a, ...c, ...d);
        quad([-hw, y0, -hd], [hw, y0, -hd], [hw, y0, -hd + cw], [-hw, y0, -hd + cw]);
        quad([-hw, y0, hd - cw], [hw, y0, hd - cw], [hw, y0, hd], [-hw, y0, hd]);
        quad([-hw, y0, -hd + cw], [-hw + cw, y0, -hd + cw], [-hw + cw, y0, hd - cw], [-hw, y0, hd - cw]);
        quad([hw - cw, y0, -hd + cw], [hw, y0, -hd + cw], [hw, y0, hd - cw], [hw - cw, y0, hd - cw]);
        quad([-hw, yb, -hd - e], [hw, yb, -hd - e], [hw, y0, -hd - e], [-hw, y0, -hd - e]);
        quad([hw, yb, hd + e], [-hw, yb, hd + e], [-hw, y0, hd + e], [hw, y0, hd + e]);
        quad([-hw - e, yb, hd], [-hw - e, yb, -hd], [-hw - e, y0, -hd], [-hw - e, y0, hd]);
        quad([hw + e, yb, -hd], [hw + e, yb, hd], [hw + e, y0, hd], [hw + e, y0, -hd]);
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.computeVertexNormals();
        return tr(g);
      };

      // Legeme med tekstur-UV i meter (solid = det faste legeme)
      const body = (p, top, side, bot, tile, sideTile, tileTop = true) => {
        const D = p.type === 'ramp' ? p.slopeLen : p.d;
        const m = p.shape === 'cyl'
          ? new THREE.Mesh(tr(ctx.cylGeometry(p.w / 2, p.h, tile, { tileTop })), [side, top, bot])
          : new THREE.Mesh(tr(ctx.boxGeometry(p.w, p.h, D, tile, { tileTop, sideTile })), [side, side, top, bot, side, side]);
        m.userData.solid = true;
        return m;
      };
      // Flade dekaler (≤ 3 cm over toppen)
      const decalMesh = (parts, y) => { const m = mesh(merge(parts), M.decal(), true); m.position.y = y; return m; };
      const discPart = (r, x, z, c, seg = 24, a0 = 0, al = TAU) => ({ g: new THREE.CircleGeometry(r, seg, a0, al).rotateX(-PI / 2).translate(x, 0, z), c: cc(c) });
      const ringPart = (r0, r1, c, seg = 32) => ({ g: new THREE.RingGeometry(r0, r1, seg).rotateX(-PI / 2), c: cc(c) });
      const flatBox = (w, d, x, z, c, ry = 0) => ({ g: new THREE.BoxGeometry(w, 0.004, d).rotateY(ry).translate(x, 0, z), c: cc(c) });

      /* ---------- Skelet med stillads (byggeplads), lokale/verdens-koordinater ---------- */
      const skeleton = (parts, cx, cz, w, d, yTop, yBot, inset = 0.9) => {
        const hw = w / 2 - inset, hd = d / 2 - inset, cs = '#aaa69e';
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(B(0.4, yTop - yBot, 0.4, cx + sx * hw, (yTop + yBot) / 2, cz + sz * hd, cs));
        for (let y = yTop - 1.4; y > yBot; y -= 3.6) parts.push(B(hw * 2, 0.3, hd * 2, cx, y, cz, '#b4b0a8'));
        // stillads: standere, rækværk, planker og diagonaler langs alle fire sider
        const sides = [[-w / 2 + 0.12, -d / 2 + 0.12, w / 2 - 0.12, -d / 2 + 0.12], [w / 2 - 0.12, -d / 2 + 0.12, w / 2 - 0.12, d / 2 - 0.12],
          [w / 2 - 0.12, d / 2 - 0.12, -w / 2 + 0.12, d / 2 - 0.12], [-w / 2 + 0.12, d / 2 - 0.12, -w / 2 + 0.12, -d / 2 + 0.12]];
        sides.forEach(([x0, z0, x1, z1], si) => {
          const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / 2.4));
          for (let i = 0; i <= n; i++) {
            const x = cx + x0 + ((x1 - x0) * i) / n, z = cz + z0 + ((z1 - z0) * i) / n;
            parts.push(Cy(0.045, 0.045, yTop - yBot, x, (yTop + yBot) / 2, z, '#f2bf14', 5));
          }
          for (let y = yTop - 1.0; y > yBot; y -= 2.0) {
            parts.push(Bm(P3(cx + x0, y, cz + z0), P3(cx + x1, y, cz + z1), 0.04, '#f2bf14'));
            if (((y + 1000) / 2 | 0) % 2 === si % 2) parts.push(Bm(P3(cx + x0, y, cz + z0), P3(cx + x0 + (x1 - x0) / n, y - 2, cz + z0 + (z1 - z0) / n), 0.03, '#f2bf14'));
            if (Math.round(y) % 4 === 0) parts.push(B(Math.abs(x1 - x0) > 0.1 ? len : 0.9, 0.05, Math.abs(x1 - x0) > 0.1 ? 0.9 : len, cx + (x0 + x1) / 2, y + 0.02, cz + (z0 + z1) / 2, '#a9824f'));
          }
        });
      };

      /* ---------- Bygningsskaft under taget (inden for fodaftrykket) ---------- */
      const shaft = (g, p, kind) => {
        const bottomY = p.top - p.h, rnd = ctx.mulberry32(p.seed);
        const depth = Math.min(ctx.freeBelow(p) - 0.8, bottomY - ctx.lavaY - 0.15, 58);
        if (depth < 2) return;
        const [fm, tile] = FAC[kind]();
        const inset = 0.06;
        let geo;
        if (p.shape === 'cyl') geo = ctx.cylGeometry(p.w / 2 - inset, depth, tile, { tileTop: false });
        else geo = ctx.boxGeometry(p.w - inset * 2, depth, p.d - inset * 2, tile, { tileTop: false });
        shiftUV(tr(geo), rnd() * 4, -depth / tile + 1);
        const bot = M.concrete('#6a6a6a');
        const m = new THREE.Mesh(geo, p.shape === 'cyl' ? [fm, bot, bot] : [fm, fm, bot, bot, fm, fm]);
        m.position.y = -p.h / 2 - depth / 2;
        g.add(m);
        return depth;
      };

      /* ---------- Platformer ---------- */
      const belts = [];
      // Hvilket udseende hører til platformen?
      const look = (p) => {
        const t = p.type, v = p.v;
        const map = { ice: 'glass', crumble: 'crumble', move: 'gondola', swing: 'gondola', bounce: 'cushion', spin: 'disc', conveyor: 'belt', rot: 'turn', vent: 'vent', ramp: 'ramp', rail: 'rail', boost: 'boost' };
        if (map[t]) return map[t];
        if (v && ['tar', 'terrace', 'garden', 'helipad', 'tank', 'ac', 'hut', 'site'].includes(v)) return v;
        if (t === 'finish') return 'helipad';
        return 'tar';
      };

      const platform = (p) => {
        const g = new THREE.Group(), H = p.h, cyl = p.shape === 'cyl', kind = FKINDS[p.seed % FKINDS.length], k = look(p);
        const W = p.w, D = p.d, R = W / 2, top = H / 2;
        const [, , par] = FAC[kind]();
        let main, cope = null, deep = true;
        switch (k) {
          case 'terrace':
            main = body(p, M.deck(), par, M.concrete('#777'), 2, 2);
            cope = [M.copingCol('#2b2f35'), 0.22, 0.1];
            break;
          case 'garden':
            main = body(p, std('lawn', { map: T.lawn(), roughness: 0.95 }), M.deck('#8a6a4a'), M.concrete('#777'), 4, 1.6);
            cope = [M.copingCol('#6b4a2e'), 0.26, 0.14];
            break;
          case 'helipad': {
            main = body(p, M.tar(), par, M.concrete('#777'), 3, 2);
            cope = [M.copingCol('#f2bf14'), 0.34, 0.2];
            const s = Math.min(W, cyl ? W : D) * 0.96;
            const dec = mesh(tr(new THREE.PlaneGeometry(s, s).rotateX(-PI / 2)), std('hp', { map: T.helipad(), transparent: true, depthWrite: false, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), true);
            dec.position.y = top + 0.012;
            g.add(dec);
            const lights = []; // kantlys (flade)
            const n = cyl ? 20 : 4 + 2 * Math.round(W + D);
            for (let i = 0; i < n; i++) {
              let x, z;
              if (cyl) { x = Math.cos((i / n) * TAU) * (R - 0.62); z = Math.sin((i / n) * TAU) * (R - 0.62); }
              else { const t = (i / n) * 4, e = Math.floor(t), f = t - e; const a = [[-1, -1], [1, -1], [1, 1], [-1, 1]][e], b = [[1, -1], [1, 1], [-1, 1], [-1, -1]][e]; x = (a[0] + (b[0] - a[0]) * f) * (W / 2 - 0.62); z = (a[1] + (b[1] - a[1]) * f) * (D / 2 - 0.62); }
              lights.push(discPart(0.07, x, z, i % 2 ? '#fff6c0' : '#7dffa0', 8));
            }
            g.add(decalMesh(lights, top + 0.016));
            break;
          }
          case 'tank': {
            main = body(p, M.steel('#dfe6ec'), M.deck('#7c6a58'), M.dark(), 2, 2);
            const hat = [];
            const rr = (cyl ? R : Math.min(W, D) / 2) * 0.55;
            hat.push(ringPart(rr * 0.82, rr, '#4b525a'), discPart(rr * 0.3, 0, 0, '#454c54', 16));
            for (let i = 0; i < 8; i++) hat.push(discPart(0.06, Math.cos((i / 8) * TAU) * rr * 0.91, Math.sin((i / 8) * TAU) * rr * 0.91, '#2a2f36', 6));
            g.add(decalMesh(hat, top + 0.012));
            break;
          }
          case 'ac': {
            main = body(p, M.steel('#d8dde2'), std('louv', { map: T.louvre(), roughness: 0.5, metalness: 0.4 }), M.dark(), 1.2, 1);
            const cells = Math.max(1, Math.round(Math.max(W, D) / 1.6)), cl = Math.max(W, D) / cells, rr = Math.min(cl, Math.min(W, D)) * 0.4, hat = [];
            for (let i = 0; i < cells; i++) {
              const x = W >= D ? -W / 2 + cl * (i + 0.5) : 0, z = W >= D ? 0 : -D / 2 + cl * (i + 0.5);
              hat.push(discPart(rr, x, z, '#1b2025', 24), ringPart(rr * 0.9, rr * 1.04, '#c4ccd3', 24));
              for (let j = 0; j < 3; j++) hat.push(flatBox(rr * 1.9, 0.05, x, z, '#8a949d', (j * PI) / 3));
              hat[hat.length - 1].g.translate(0, 0.003, 0);
            }
            g.add(decalMesh(hat.map((h, i) => (h.g.translate(0, 0, 0), h)), top + 0.014));
            deep = false;
            break;
          }
          case 'hut': {
            main = body(p, M.concrete('#f3f5f6'), M.concrete('#ddd6c6'), M.concrete('#777'), 2.4, 2);
            cope = [M.copingCol('#9a968e'), 0.2, 0.12];
            const dh = Math.min(H * 0.9, 1.9), dw = 0.9;
            const door = mesh(tr(new THREE.PlaneGeometry(dw, dh)), M.paint('#3a4a5a'), true);
            door.position.set(0, -H / 2 + dh / 2 + 0.02, D / 2 + 0.008);
            const fr = mesh(tr(new THREE.PlaneGeometry(dw + 0.12, dh + 0.06)), M.paint('#e9e9e4'), true);
            fr.position.set(0, door.position.y + 0.02, D / 2 + 0.004);
            g.add(fr, door);
            if (!cyl) { // rist på siden
              const lv = mesh(tr(new THREE.PlaneGeometry(Math.min(1.2, D * 0.5), Math.min(0.5, H * 0.5))), std('louvh', { map: T.louvre(), roughness: 0.6 }), true);
              lv.rotation.y = PI / 2; lv.position.set(W / 2 + 0.008, 0, 0); g.add(lv);
            }
            break;
          }
          case 'site': {
            main = body(p, M.concrete('#9a968e'), M.concrete('#b0aca4'), M.concrete('#666'), 3, 2);
            cope = [M.copingCol('#f2bf14'), 0.3, 0.2];
            const rb = [], rr = ctx.mulberry32(p.seed + 5);
            for (let x = -W / 2 + 0.7; x < W / 2 - 0.5; x += 0.4) rb.push(flatBox(0.014, D - 1.2, x, 0, '#5a3a2a'));
            for (let z = -D / 2 + 0.7; z < D / 2 - 0.5; z += 0.4) rb.push(flatBox(W - 1.2, 0.014, 0, z, '#6a4636'));
            for (let i = 0; i < 3; i++) rb.push(flatBox(0.6 + rr(), 0.6 + rr(), (rr() - 0.5) * (W - 2), (rr() - 0.5) * (D - 2), '#b88a4e', rr() * 3));
            g.add(decalMesh(rb, top + 0.012));
            break;
          }
          case 'glass': { // 'ice': glastag/ovenlys – glat og blank
            const gl = tr(new THREE.MeshPhysicalMaterial({ map: T.glass(), color: '#eaf8ff', roughness: 0.04, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.03, emissive: '#2c78b8', emissiveIntensity: 0.22 }));
            main = body(p, gl, M.steel('#d6e0e8'), M.dark(), 3.2, 1.2);
            break;
          }
          case 'crumble': {
            main = body(p, std('crumble', { map: T.crumble(), roughness: 0.95 }), std('crumble', { map: T.crumble(), roughness: 0.95 }), M.dark(), 2.4, 1.4);
            deep = false;
            const rr = ctx.mulberry32(p.seed + 3), cr = [];
            for (let i = 0; i < 3; i++) { // revner som flade striber
              let x = (rr() - 0.5) * (W - 1.2), z = -D / 2 + 0.3 + rr() * 0.5; const pts = [];
              for (let j = 0; j < 7; j++) { pts.push([x, z]); x += (rr() - 0.5) * 1.2; z += (D - 0.6) / 7 * (0.7 + rr() * 0.6); }
              for (let j = 0; j + 1 < pts.length; j++) {
                const [x0, z0] = pts[j], [x1, z1] = pts[j + 1], L = Math.hypot(x1 - x0, z1 - z0);
                cr.push(flatBox(0.1 + rr() * 0.07, L + 0.06, (x0 + x1) / 2, (z0 + z1) / 2, '#0a0806', Math.atan2(x1 - x0, z1 - z0)));
              }
            }
            if (!cyl) g.add(decalMesh(cr, top + 0.01));
            const jo = [];
            for (let i = -1; i <= 1; i += 2) jo.push(B(0.18, 0.3, D - 0.2, i * W * 0.28, -H / 2 - 0.15, 0, '#4a3a2c'));
            jo.push(B(W - 0.2, 0.22, 0.18, 0, -H / 2 - 0.12, 0, '#3e3024'));
            g.add(mesh(merge(jo), M.vcol()));
            break;
          }
          case 'gondola': { // vinduespudser-kurv: ternplade, hvid skrog med gul bånd
            main = body(p, M.steel('#e8edf0'), M.paint('#f1f3f2'), M.dark(), 1.2, 1.2);
            cope = [M.copingCol('#f2bf14'), 0.2, 0.18];
            deep = false;
            const parts = [B(W - 0.1, 0.1, D - 0.1, 0, -H / 2 - 0.06, 0, '#3a4048')];
            const ax = p.move && p.move.axis && Math.abs(p.move.axis[1]) > 0.5;
            if (ax) for (const sx of [-1, 1]) { // skinneføring: arm ud til masten (under bunden)
              parts.push(B(0.7, 0.07, 0.34, sx * (W / 2 + 0.3), -H / 2 - 0.12, 0, '#f2bf14'));
              parts.push(B(0.2, 0.34, 0.34, sx * (W / 2 + 0.62), -H / 2 + 0.04, 0, '#2a2f36'));
            }
            g.add(mesh(merge(parts), M.vcol()));
            break;
          }
          case 'cushion': { // luftpude: orange vinyl med sømme
            main = body(p, M.paint('#ff7a1a'), M.paint('#e85a10'), M.dark(), 2, 2);
            cope = [M.copingCol('#ffd24a'), 0.12, 0.06];
            const dc = [ringPart(Math.min(W, cyl ? W : D) * 0.22, Math.min(W, cyl ? W : D) * 0.26, '#fff0c8', 32), discPart(Math.min(W, cyl ? W : D) * 0.1, 0, 0, '#fff0c8', 16)];
            g.add(decalMesh(dc, top + 0.012));
            g.add(mesh(tr(new THREE.CylinderGeometry(Math.min(R, W / 2) * 0.55, Math.min(R, W / 2) * 0.4, 0.9, 12)), M.dark(), false)).children[g.children.length - 1].position.y = -H / 2 - 0.45;
            deep = false;
            break;
          }
          case 'disc': { // spinnerens base
            main = body(p, M.steel('#c8d0d6'), M.dark(), M.dark(), 1.4, 1.4);
            g.add(decalMesh([ringPart(R * 0.82, R * 0.94, '#f2bf14', 40), discPart(0.4, 0, 0, '#2a2f36', 16)], top + 0.012));
            const hub = mesh(tr(new THREE.CylinderGeometry(0.22, 0.3, 0.7, 14)), M.dark());
            hub.position.y = top + 0.35; g.add(hub);
            break;
          }
          case 'belt': {
            const bt = T.belt().clone(); bt.needsUpdate = true;
            if (p.beltAx === 'x') { bt.center.set(0.5, 0.5); bt.rotation = PI / 2; }
            const bm = tr(new THREE.MeshStandardMaterial({ map: bt, roughness: 0.8 }));
            belts.push({ p, tex: bt });
            main = body(p, bm, M.dark(), M.dark(), 2, 1.2);
            const e = [flatBox(0.14, D, -W / 2 + 0.08, 0, '#f2bf14'), flatBox(0.14, D, W / 2 - 0.08, 0, '#f2bf14')];
            g.add(decalMesh(e, top + 0.008));
            break;
          }
          case 'turn': { // drejeskive: gul/hvide kiler så rotationen kan ses
            main = body(p, M.steel('#bfc7ce'), M.dark(), M.dark(), 1.4, 1.4);
            const wd = [];
            for (let i = 0; i < 6; i++) wd.push(discPart(R * 0.93, 0, 0, '#f2bf14', 8, (i * TAU) / 6, TAU / 12));
            wd.push(discPart(R * 0.14, 0, 0, '#2a2f36', 16));
            g.add(decalMesh(wd, top + 0.012));
            deep = false;
            break;
          }
          case 'vent':
            main = body(p, std('vent', { map: T.louvre(), roughness: 0.5, metalness: 0.4 }), M.steel('#aab3bb'), M.dark(), 0.9, 1);
            break;
          case 'ramp': case 'rail': case 'boost': {
            main = body(p, k === 'rail' ? M.yellow() : M.deck('#c9a373'), k === 'boost' ? M.dark() : M.steel('#9aa3ab'), M.dark(), 2, 1.2);
            if (k === 'boost') {
              const ch = [];
              for (let i = 0; i < 3; i++) ch.push({ g: new THREE.ConeGeometry(Math.min(W, 4) * 0.28, 0.6, 3).rotateX(-PI / 2).scale(1, 0.003 / 0.6, 1).translate(0, 0, -p.d * 0.3 + i * p.d * 0.3), c: cc('#ff9b1a') });
              g.add(decalMesh(ch, top + 0.012));
            }
            deep = false;
            break;
          }
          default: // 'tar' (standard)
            main = body(p, M.tar(), par, M.concrete('#777'), 3, 2);
            cope = [M.coping(), 0.3, 0.16];
        }
        if (main.material[0] === par && !cope) cope = [M.coping(), 0.3, 0.16];
        g.add(main);
        if (cope) g.add(mesh(copingGeo(p, cope[1], cope[2]), cope[0], true));
        // Bygning/ben under taget (ikke på ting der bevæger sig eller klemmes)
        if (deep && !p.kin) {
          if (k === 'tank') { // vandtårn: tønde, ben med krydsafstivning, så bygning
            const rr = cyl ? R : Math.min(W, D) / 2, parts = [];
            const tankH = 2.0;
            const mb = cyl ? new THREE.CylinderGeometry(rr * 0.985, rr * 0.985, tankH, 28, 1, true) : new THREE.BoxGeometry(W * 0.985, tankH, D * 0.985);
            const bm = new THREE.Mesh(tr(mb.translate(0, -H / 2 - tankH / 2, 0)), M.deck('#7c6a58'));
            g.add(bm);
            for (const yy of [0.35, 1.0, 1.65]) { // jernbånd
              parts.push(cyl ? { g: new THREE.CylinderGeometry(rr * 0.99, rr * 0.99, 0.09, 28, 1, true).translate(0, -H / 2 - yy, 0), c: cc('#2f343a') } : B(W * 0.99, 0.09, D * 0.99, 0, -H / 2 - yy, 0, '#2f343a'));
            }
            const y0 = -H / 2 - tankH, y1 = y0 - 4.0, lx = (cyl ? rr : W / 2) * 0.82, lz = (cyl ? rr : D / 2) * 0.82, sh = 0.84;
            for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
              const f = cyl ? 0.7071 : 1;
              parts.push(Bm(P3(sx * lx * f, y0, sz * lz * f), P3(sx * lx * f * sh, y1, sz * lz * f * sh), 0.1, '#47505a', 6));
            }
            for (const [a, b] of [[-1, -1, 1, -1], [1, -1, 1, 1], [1, 1, -1, 1], [-1, 1, -1, -1]].map((q) => [[q[0], q[1]], [q[2], q[3]]])) {
              const f = cyl ? 0.7071 : 1;
              parts.push(Bm(P3(a[0] * lx * f, y0 - 0.2, a[1] * lz * f), P3(b[0] * lx * f * sh, y1 + 0.3, b[1] * lz * f * sh), 0.04, '#6a747e'));
              parts.push(Bm(P3(b[0] * lx * f, y0 - 0.2, b[1] * lz * f), P3(a[0] * lx * f * sh, y1 + 0.3, a[1] * lz * f * sh), 0.04, '#6a747e'));
            }
            const sl = cyl ? new THREE.CylinderGeometry(rr * 0.78, rr * 0.78, 0.4, 24) : new THREE.BoxGeometry(W * 0.78, 0.4, D * 0.78);
            const slab = new THREE.Mesh(tr(sl), M.concrete('#777')); slab.position.y = y1 - 0.2; g.add(slab);
            g.add(mesh(merge(parts), M.vcol()));
            // bygningen under: lidt smallere end tårnets fodaftryk
            const sub = Object.assign({}, p, { w: p.w * 0.7, d: p.d * 0.7, h: 0, top: p.top + (y1 - 0.4 + H / 2), seed: p.seed });
            const sg = new THREE.Group(); const dp = shaft(sg, Object.assign(sub, { h: 0 }), kind);
            if (dp) { sg.position.y = y1 - 0.4 + H / 2; g.add(sg); }
          } else if (k === 'site') {
            const dp = Math.min(ctx.freeBelow(p) - 0.8, p.top - p.h - ctx.lavaY - 0.15, 52);
            if (dp > 3) {
              const parts = [];
              skeleton(parts, 0, 0, W, D, -H / 2, -H / 2 - dp);
              g.add(mesh(merge(parts), M.vcol()));
              if (!cyl) {
                const net = mesh(tr(new THREE.BoxGeometry(W - 0.2, dp * 0.55, D - 0.2)), tr(new THREE.MeshBasicMaterial({ color: '#3e8f4a', transparent: true, opacity: 0.4, depthWrite: false })), true);
                net.position.y = -H / 2 - dp * 0.3; g.add(net);
              }
            }
          } else shaft(g, p, kind);
        } else if (deep && p.kin === false) shaft(g, p, kind);
        return g;
      };

      /* ---------- Stænger: gule stilladsrør med koblinger ---------- */
      const bar = (b) => {
        const g = new THREE.Group(), galv = b.v === 'galv';
        const pipe = new THREE.Mesh(tr(new THREE.CylinderGeometry(b.r, b.r, b.len, 14).rotateZ(PI / 2)), galv ? std('galv', { color: '#aab4be', roughness: 0.35, metalness: 0.85 }) : M.yellow());
        g.add(pipe);
        const parts = [];
        const nodes = [-b.len / 2, b.len / 2];
        for (let x = -b.len / 2 + 1.8; x < b.len / 2 - 0.9; x += 2.4) nodes.push(x);
        for (const x of nodes) parts.push({ g: new THREE.CylinderGeometry(b.r * 1.7, b.r * 1.7, 0.12, 10).rotateZ(PI / 2).translate(x, 0, 0), c: cc('#2b3036') });
        for (const sx of [-1, 1]) parts.push({ g: new THREE.SphereGeometry(b.r * 1.15, 8, 6).translate(sx * (b.len / 2 + 0.02), 0, 0), c: cc('#2b3036') });
        g.add(mesh(merge(parts), M.vcol()));
        return g;
      };

      /* ---------- Svævebane: stålwire med gule master ved siden af ---------- */
      const zip = (z) => {
        const g = new THREE.Group();
        const A = P3(z.ax, z.ay, z.az), Bp = P3(z.bx, z.by, z.bz), dir = new V3().subVectors(Bp, A).normalize();
        const side = new V3(-dir.z, 0, dir.x).normalize().multiplyScalar(0.95);
        const parts = [Bm(A, Bp, 0.028, '#323840', 6)];
        for (const [P, drop] of [[A, 5.5], [Bp, 4.2]]) {
          const base = P.clone().add(side);
          parts.push(Bm(P3(base.x, P.y - drop, base.z), P3(base.x, P.y + 0.45, base.z), 0.1, '#f2bf14', 8));
          parts.push(Bm(P3(base.x, P.y + 0.3, base.z), P3(P.x, P.y + 0.06, P.z), 0.05, '#f2bf14', 6));
          parts.push({ g: new THREE.SphereGeometry(0.1, 8, 6).translate(P.x, P.y + 0.04, P.z), c: cc('#2b3036') });
          parts.push(Bm(P3(base.x, P.y - drop * 0.5, base.z), P3(base.x - side.x * 1.2, P.y - drop * 0.9, base.z - side.z * 1.2), 0.05, '#aab3bb', 5));
        }
        g.add(mesh(merge(parts), M.vcol()));
        return g;
      };

      /* ---------- Anker: kranhage med blok ---------- */
      const anchor = () => {
        const g = new THREE.Group(), parts = [];
        parts.push(B(0.34, 0.2, 0.24, 0, 0.18, 0, '#f2bf14'), Cy(0.04, 0.04, 1.4, 0, 1.0, 0, '#3a4048', 6));
        parts.push({ g: new THREE.TorusGeometry(0.15, 0.04, 6, 14, PI * 1.5).rotateX(PI / 2).translate(0, -0.06, 0), c: cc('#cfd6dc') });
        g.add(mesh(merge(parts), M.vcol()));
        return g;
      };

      /* ---------- Spinner-arm: gul/sort advarselsbom ---------- */
      const spinArm = (p) => {
        const parts = [], n = Math.max(4, Math.round(p.bar / 0.6)), sl = p.bar / n;
        for (let i = 0; i < n; i++) parts.push(B(sl, 0.36, 0.45, -p.bar / 2 + sl * (i + 0.5), 0, 0, i % 2 ? '#2a2f36' : '#f2bf14'));
        return mesh(merge(parts), M.vcol());
      };

      /* ---------- Kulisse ---------- */
      let blink = [], haze = [];
      const decor = (data) => {
        const root = new THREE.Group();
        const R = ctx.mulberry32(9100 + data.plats.length * 17), bd = data.bounds, plats = data.plats;
        // Banens "skygge" i planen: cirkler vi skal holde os fra
        const discs = plats.map((p) => ({ x: p.x, z: p.z, r: p.shape === 'cyl' ? p.w / 2 : Math.hypot(p.w, p.d) / 2, y: p.top }));
        for (const b of data.bars) for (const f of [-0.5, 0, 0.5]) discs.push({ x: b.x + b.dx * b.len * f, z: b.z + b.dz * b.len * f, r: 2.5, y: b.y });
        for (const z of data.zips) for (const f of [0, 0.5, 1]) discs.push({ x: z.ax + (z.bx - z.ax) * f, z: z.az + (z.bz - z.az) * f, r: 2.5, y: z.ay });
        const clear = (x, z, r, m = 4) => discs.every((d) => Math.hypot(x - d.x, z - d.z) > r + d.r + m);
        const nearest = (x, z) => { let best = 1e9, y = 0; for (const d of discs) { const e = Math.hypot(x - d.x, z - d.z) - d.r; if (e < best) { best = e; y = d.y; } } return { d: best, y }; };

        const placed = [], clutter = [], lawns = [], roofs = [], walls = { glass: [], office: [], brick: [] };
        const addWall = (arr, x0, z0, x1, z1, y0, y1, tile, uo) => { // ét væg-stykke med UV i meter
          const ex = x1 - x0, ez = z1 - z0, L = Math.hypot(ex, ez);
          arr.push([x0, z0, x1, z1, y0, y1, tile, uo, L]);
        };
        const addBuilding = (x, z, w, d, yTop, kind) => {
          const yBot = ctx.lavaY - 3, tile = FAC[kind]()[1], uo = R() * 5;
          const hx = w / 2, hz = d / 2;
          addWall(walls[kind], x - hx, z - hz, x + hx, z - hz, yBot, yTop, tile, uo);
          addWall(walls[kind], x + hx, z - hz, x + hx, z + hz, yBot, yTop, tile, uo + 1.3);
          addWall(walls[kind], x + hx, z + hz, x - hx, z + hz, yBot, yTop, tile, uo + 2.1);
          addWall(walls[kind], x - hx, z + hz, x - hx, z - hz, yBot, yTop, tile, uo + 3.7);
          roofs.push([x, z, w, d, yTop]);
          // betonkant rundt om taget
          const pc = '#c4c0b6';
          clutter.push(B(w, 0.7, 0.3, x, yTop + 0.35, z - hz + 0.15, pc), B(w, 0.7, 0.3, x, yTop + 0.35, z + hz - 0.15, pc),
            B(0.3, 0.7, d - 0.6, x - hx + 0.15, yTop + 0.35, z, pc), B(0.3, 0.7, d - 0.6, x + hx - 0.15, yTop + 0.35, z, pc));
        };
        const roofProps = (x, z, w, d, yTop, big, far) => {
          const n = Math.floor(R() * 4);
          for (let i = 0; i < n; i++) { // aircondition
            const px = x + (R() - 0.5) * (w - 4), pz = z + (R() - 0.5) * (d - 4), sc = 0.8 + R() * 1.2;
            clutter.push(B(2.2 * sc, 1.3 * sc, 1.4 * sc, px, yTop + 0.65 * sc, pz, '#aeb7bf'), Cy(0.55 * sc, 0.55 * sc, 0.04, px, yTop + 1.32 * sc, pz, '#1d2227', 12));
          }
          if (R() < 0.34) { // vandtårn
            const px = x + (R() - 0.5) * (w - 8), pz = z + (R() - 0.5) * (d - 8), s = 0.8 + R() * 0.5;
            clutter.push(Cy(1.6 * s, 1.6 * s, 3.2 * s, px, yTop + (2.8 + 1.6) * s, pz, '#7a6652', 14), Cy(0.1, 1.75 * s, 1.1 * s, px, yTop + (4.4 + 3.2 * 0.5 + 0.55) * s - 0.5 * s, pz, '#4f565e', 14));
            for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) clutter.push(Bm(P3(px + sx * 1.3 * s, yTop, pz + sz * 1.3 * s), P3(px + sx * 1.3 * s, yTop + 2.9 * s, pz + sz * 1.3 * s), 0.09, '#4a525b'));
          }
          if (R() < 0.3 && w > 12) { // trappehus
            const px = x + (R() - 0.5) * (w - 9), pz = z + (R() - 0.5) * (d - 9);
            clutter.push(B(4.5, 3.0, 4, px, yTop + 1.5, pz, '#d9d3c5'), B(4.9, 0.25, 4.4, px, yTop + 3.1, pz, '#9a968e'), B(0.9, 1.9, 0.06, px, yTop + 0.97, pz + 2.03, '#3a4a5a'));
          }
          if (R() < 0.16 && w > 16) { // solpaneler
            const px = x + (R() - 0.5) * (w - 12), pz = z + (R() - 0.5) * (d - 10);
            for (let i = 0; i < 5; i++) clutter.push({ g: new THREE.BoxGeometry(2.4, 0.08, 1.5).rotateX(-0.45).translate(px + (i - 2) * 2.6, yTop + 0.75, pz), c: cc('#1c3a68') });
          }
          if (R() < (far ? 0.4 : 0.26)) { // antenne med rød lampe
            const px = x + (R() - 0.5) * (w - 6), pz = z + (R() - 0.5) * (d - 6), hgt = 7 + R() * (big ? 30 : 14);
            clutter.push(Cy(0.07, 0.16, hgt, px, yTop + hgt / 2, pz, '#aab2ba', 5));
            for (let j = 1; j < 4; j++) clutter.push(B(1.6 - j * 0.3, 0.07, 0.07, px, yTop + (hgt * j) / 4.4, pz, '#9aa2aa'));
            if (R() < 0.8) blink.push({ x: px, y: yTop + hgt + 0.2, z: pz, ph: R() * TAU });
          }
          if (R() < 0.12 && w > 14) { // taghave
            const px = x + (R() - 0.5) * (w - 8), pz = z + (R() - 0.5) * (d - 8);
            lawns.push([px, pz, Math.min(w - 4, 9), Math.min(d - 4, 7), yTop + 0.06]);
            for (let i = 0; i < 4; i++) clutter.push({ g: new THREE.IcosahedronGeometry(0.9 + R() * 0.9, 0).translate(px + (R() - 0.5) * 6, yTop + 1.4 + R(), pz + (R() - 0.5) * 4), c: cc(R() < 0.5 ? '#3f8f3c' : '#5aa845') }, B(0.18, 1.2, 0.18, px, yTop + 0.6, pz, '#5a4030'));
          }
          if (R() < 0.13 && w > 12) { // vasketøjssnor
            const px = x + (R() - 0.5) * (w - 10), pz = z + (R() - 0.5) * (d - 8), L = 5.5;
            clutter.push(B(0.08, 2.2, 0.08, px - L / 2, yTop + 1.1, pz, '#6a5a4a'), B(0.08, 2.2, 0.08, px + L / 2, yTop + 1.1, pz, '#6a5a4a'), B(L, 0.02, 0.02, px, yTop + 2.1, pz, '#e8e8e8'));
            for (let i = 0; i < 7; i++) clutter.push(B(0.5 + R() * 0.3, 0.6 + R() * 0.3, 0.02, px - L / 2 + 0.5 + i * 0.7, yTop + 1.75, pz, ['#ff5a5a', '#fff', '#5aa0ff', '#ffd24a', '#7ad07a'][i % 5]));
          }
        };

        // Skyline: bygninger uden om banen (nær: lidt under banen; fjern: høje tårne i diset)
        for (let i = 0, n = 0; i < 900 && n < 150; i++) {
          const a = R() * TAU, far = i > 380, rad = 18 + Math.pow(R(), far ? 0.8 : 1.5) * (bd.radius + (far ? 620 : 150));
          const x = bd.cx + Math.cos(a) * rad, z = bd.cz + Math.sin(a) * rad;
          const w = (far ? 22 : 13) + R() * (far ? 40 : 20), d = (far ? 22 : 13) + R() * (far ? 40 : 20), r = Math.hypot(w, d) / 2;
          if (!clear(x, z, r, 3.5) || placed.some((q) => Math.hypot(x - q.x, z - q.z) < (r + q.r) * 0.82 + 1.5)) continue;
          const ne = nearest(x, z), tall = ne.d > 55 && R() < 0.45;
          const yTop = tall ? ne.y + 8 + R() * (40 + Math.min(120, ne.d * 0.25)) : ne.y - 5 - R() * 30;
          const kind = FKINDS[Math.floor(R() * FKINDS.length)];
          placed.push({ x, z, r }); n++;
          addBuilding(x, z, w, d, yTop, kind);
          roofProps(x, z, w, d, yTop, tall, far);
          if (n === 7 || n === 26) { // helipad på et par tage
            clutter.push({ g: new THREE.CylinderGeometry(Math.min(w, d) * 0.4, Math.min(w, d) * 0.4, 0.15, 28).translate(x, yTop + 0.08, z), c: cc('#4a4f55') });
            roofs.pad = (roofs.pad || []).concat([[x, yTop + 0.17, z, Math.min(w, d) * 0.8]]);
          }
        }

        // Byggeplads med skelet, stillads og tårnkran (ét sted tæt på banen)
        let site = null;
        for (let i = 0; i < 300 && !site; i++) {
          const a = R() * TAU, rad = bd.radius * 0.4 + R() * (bd.radius * 0.7 + 60), x = bd.cx + Math.cos(a) * rad, z = bd.cz + Math.sin(a) * rad;
          if (clear(x, z, 24, 14) && placed.every((q) => Math.hypot(x - q.x, z - q.z) > q.r + 26)) site = [x, z];
        }
        if (site) {
          const [sx, sz] = site, ne = nearest(sx, sz), roof = ne.y + 6 + R() * 8, parts = [];
          skeleton(parts, sx, sz, 22, 18, roof, ctx.lavaY - 2, 1.6);
          for (let y = roof - 1.4; y > roof - 14; y -= 3.6) parts.push(B(18.4, 0.3, 14.4, sx, y, sz, '#b4b0a8'));
          // tårnkran
          const mx = sx + 15, mz = sz + 2, yb = ctx.lavaY - 2, yt = roof + 34, ylow = roof + 33;
          for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) parts.push(B(0.35, yt - yb, 0.35, mx + dx * 1.1, (yt + yb) / 2, mz + dz * 1.1, '#f2bf14'));
          for (let y = yb; y < yt; y += 3.4) {
            parts.push(B(2.4, 0.16, 0.16, mx, y, mz - 1.1, '#f2bf14'), B(2.4, 0.16, 0.16, mx, y, mz + 1.1, '#f2bf14'), B(0.16, 0.16, 2.4, mx - 1.1, y, mz, '#f2bf14'), B(0.16, 0.16, 2.4, mx + 1.1, y, mz, '#f2bf14'));
            parts.push(Bm(P3(mx - 1.1, y, mz - 1.1), P3(mx + 1.1, y + 3.4, mz - 1.1), 0.07, '#f2bf14'), Bm(P3(mx + 1.1, y, mz + 1.1), P3(mx - 1.1, y + 3.4, mz + 1.1), 0.07, '#f2bf14'));
          }
          const jib = 40, cjib = 13;
          parts.push(B(jib + cjib, 0.3, 0.3, mx + (jib - cjib) / 2, ylow + 2.6, mz, '#f2bf14'), B(jib + cjib, 0.2, 0.2, mx + (jib - cjib) / 2, ylow + 0.8, mz, '#f2bf14'));
          for (let x = -cjib; x < jib; x += 2.6) parts.push(Bm(P3(mx + x, ylow + 0.8, mz), P3(mx + x + 1.3, ylow + 2.6, mz), 0.06, '#f2bf14'), Bm(P3(mx + x + 1.3, ylow + 2.6, mz), P3(mx + x + 2.6, ylow + 0.8, mz), 0.06, '#f2bf14'));
          parts.push(B(2.2, 2.0, 2.0, mx - 1.8, ylow + 0.5, mz, '#e8e8e4'), B(3, 1.8, 2.4, mx - cjib + 1.5, ylow + 0.9, mz, '#6e747c'), B(0.3, 5, 0.3, mx, ylow + 5.2, mz, '#f2bf14'));
          parts.push(Bm(P3(mx, ylow + 7.6, mz), P3(mx + jib, ylow + 2.6, mz), 0.04, '#cfd5da'), Bm(P3(mx, ylow + 7.6, mz), P3(mx - cjib, ylow + 2.6, mz), 0.04, '#cfd5da'));
          parts.push(Bm(P3(mx + jib * 0.7, ylow + 0.6, mz), P3(mx + jib * 0.7, ylow - 14, mz), 0.025, '#222'), B(0.7, 0.3, 0.7, mx + jib * 0.7, ylow - 14.2, mz, '#f2bf14'));
          for (let i = 0; i < 6; i++) parts.push(B(5, 0.18, 0.18, mx + jib * 0.7, ylow - 14.7 - i * 0.2, mz + (i - 2.5) * 0.18, '#d8b13a'));
          blink.push({ x: mx, y: yt + 8, z: mz, ph: 0.5 });
          root.add(mesh(merge(parts), M.vcol()));
        }

        // Saml og byg meshes: facader, tage, tagpynt
        const wallGeo = (list) => {
          const pos = [], nor = [], uv = [];
          for (const [x0, z0, x1, z1, y0, y1, tile, uo, L] of list) {
            const ex = (x1 - x0) / L, ez = (z1 - z0) / L, nx = ez, nz = -ex;
            const V = [[x0, y0, z0, 0, y0], [x1, y0, z1, L, y0], [x1, y1, z1, L, y1], [x0, y1, z0, 0, y1]];
            for (const i of [0, 2, 1, 0, 3, 2]) {
              const v = V[i]; pos.push(v[0], v[1], v[2]); nor.push(nx, 0, nz); uv.push(v[3] / tile + uo, 1 + (v[4] - y1) / tile);
            }
          }
          const g = new THREE.BufferGeometry();
          g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
          g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
          g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
          return tr(g);
        };
        for (const kd of ['glass', 'office', 'brick']) if (walls[kd].length) root.add(mesh(wallGeo(walls[kd]), FAC[kd]()[0]));
        const rp = [];
        for (const [x, z, w, d, y] of roofs) rp.push({ g: new THREE.PlaneGeometry(w, d).rotateX(-PI / 2).translate(x, y + 0.02, z) });
        if (rp.length) {
          const g = merge(rp), pos = g.attributes.position, uv = g.attributes.uv;
          for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / 3, pos.getZ(i) / 3);
          root.add(mesh(g, M.tar()));
        }
        for (const [x, z, w, d, y] of lawns) {
          const g = tr(new THREE.PlaneGeometry(w, d).rotateX(-PI / 2).translate(x, y, z)), uv = g.attributes.uv;
          for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / 4, uv.getY(i) * d / 4);
          root.add(mesh(g, std('lawn', { map: T.lawn(), roughness: 0.95 }), true));
        }
        for (const [x, y, z, s] of roofs.pad || []) { // helipad-dekal på fjerne tage
          const m = mesh(tr(new THREE.PlaneGeometry(s, s).rotateX(-PI / 2)), std('hp', { map: T.helipad(), transparent: true, depthWrite: false, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), true);
          m.position.set(x, y + 0.02, z); root.add(m);
        }
        if (clutter.length) root.add(mesh(merge(clutter), M.vcol()));

        // Stilladsmaster under stængerne og skinner til vinduesliften
        const masts = [];
        for (const b of data.bars) {
          if (b.swing || b.move) continue;
          const pl = plats[b.after], hd = pl ? pl.heading : 0, f = ctx.fwdVec(hd);
          const along = Math.abs(b.dx * f.x + b.dz * f.z) > 0.7, nx = -b.dz, nz = b.dx;
          const e = [-1, 1].map((s) => {
            const x = b.x + (b.dx * b.len * s) / 2, z = b.z + (b.dz * b.len * s) / 2;
            return along ? [x + nx * 0.8, z + nz * 0.8, x, z] : [x + b.dx * s * 0.5, z + b.dz * s * 0.5, x, z];
          });
          const yb = Math.max(ctx.lavaY + 0.2, b.y - 58);
          for (const [x, z, x0, z0] of e) {
            masts.push(Bm(P3(x, yb, z), P3(x, b.y + 0.15, z), 0.05, '#f2bf14', 6), Bm(P3(x0, b.y, z0), P3(x, b.y, z), 0.04, '#f2bf14'));
            masts.push({ g: new THREE.CylinderGeometry(0.075, 0.075, 0.1, 8).translate(x, b.y, z), c: cc('#2b3036') });
          }
          const dd = Math.hypot(e[1][0] - e[0][0], e[1][1] - e[0][1]);
          if (dd < 5.6) for (let y = b.y; y > yb + 1; y -= 3) {
            masts.push(Bm(P3(e[0][0], y, e[0][1]), P3(e[1][0], y - 3, e[1][1]), 0.03, '#f2bf14', 4), Bm(P3(e[1][0], y, e[1][1]), P3(e[0][0], y - 3, e[0][1]), 0.03, '#f2bf14', 4), Bm(P3(e[0][0], y, e[0][1]), P3(e[1][0], y, e[1][1]), 0.03, '#f2bf14', 4));
          }
          else for (let y = b.y - 5; y > yb + 1; y -= 5) for (const [x, z] of e) masts.push(B(0.12, 0.12, 0.12, x, y, z, '#2b3036'));
        }
        for (const p of plats) { // vinduesliftens master
          if (!p.move || Math.abs(p.move.axis[1]) < 0.5) continue;
          const rv = ctx.rightVec(p.yaw), amp = p.move.amp, yt = p.top + amp + 5, yb = Math.max(ctx.lavaY + 0.2, p.top - amp - 60);
          for (const s of [-1, 1]) {
            const x = p.x + rv.x * s * (p.w / 2 + 0.62), z = p.z + rv.z * s * (p.w / 2 + 0.62);
            masts.push(B(0.16, yt - yb, 0.16, x, (yt + yb) / 2, z, '#f2bf14'), B(0.4, 0.4, 0.4, x, yt + 0.2, z, '#2b3036'));
            for (let y = yb; y < yt; y += 1.0) masts.push(B(0.2, 0.05, 0.2, x, y, z, '#2b3036'));
            blink.push({ x, y: yt + 0.7, z, ph: s * 1.3 });
          }
        }
        if (masts.length) root.add(mesh(merge(masts), M.vcol()));

        // Opvindssøjler som damp
        for (const w of data.winds) {
          const m = mesh(tr(new THREE.CylinderGeometry(w.r, w.r * 0.8, w.h, 16, 1, true)), tr(new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide })), true);
          m.position.set(w.x, w.y + w.h / 2, w.z); root.add(m);
        }

        // Blinkende røde lamper (tre faser)
        const sm = [0, 1, 2].map(() => tr(new THREE.SpriteMaterial({ map: ctx.TEX.glow, color: '#ff3a2a', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })));
        const bl = blink; blink = [];
        for (const b of bl) { const s = new THREE.Sprite(sm[Math.floor(b.ph * 3) % 3]); s.position.set(b.x, b.y, b.z); s.scale.set(2.4, 2.4, 1); root.add(s); }
        blink = sm;

        // Dis-lag omkring bygningernes fødder, så skyline falder ud i dis (lavaen kan stadig ses)
        haze = [];
        for (const [y, op, sz] of [[ctx.lavaY + 10, 0.5, 2400], [ctx.lavaY + 26, 0.3, 2000]]) {
          const mt = tr(new THREE.MeshBasicMaterial({ map: ctx.TEX.glow, color: '#d0e5f6', transparent: true, opacity: op, depthWrite: false, fog: false }));
          const m = mesh(tr(new THREE.PlaneGeometry(sz, sz).rotateX(-PI / 2)), mt, true);
          m.position.set(bd.cx, y, bd.cz); m.renderOrder = -1; root.add(m);
        }

        // Flyvemaskine-stribe høj oppe og ende på bane 3's candyskyer fjernt i horisonten
        const cm = tr(new THREE.MeshBasicMaterial({ map: ctx.TEX.glow, color: '#ffffff', transparent: true, opacity: 0.6, depthWrite: false, fog: false }));
        const trail = mesh(tr(new THREE.PlaneGeometry(1400, 14)), cm, true);
        trail.position.set(bd.cx - 300, 520, bd.cz - 900); trail.rotation.set(0.2, 0.5, 0); trail.lookAt(bd.cx, 380, bd.cz); trail.rotateZ(0.1);
        const tr2 = mesh(tr(new THREE.PlaneGeometry(900, 5)), cm, true); tr2.position.copy(trail.position); tr2.quaternion.copy(trail.quaternion); tr2.translateY(5); tr2.translateZ(1);
        root.add(trail, tr2);
        const last = plats[plats.length - 1], fw = ctx.fwdVec(last.heading);
        for (let i = 0; i < 9; i++) {
          const sp = new THREE.Sprite(tr(new THREE.SpriteMaterial({ map: ctx.TEX.clouds[i % 3], color: i % 2 ? '#ffc2e6' : '#bff2e2', transparent: true, depthWrite: false, fog: false, opacity: 0.5 })));
          const d = 1150 + R() * 250, side = (R() - 0.5) * 700;
          sp.position.set(last.x + fw.x * d - fw.z * side, 160 + R() * 150, last.z + fw.z * d + fw.x * side);
          sp.scale.set(360 + R() * 260, 200 + R() * 120, 1); root.add(sp);
        }
        return root;
      };

      return {
        ventColor: '#eef6ff',
        platform, bar, zip, anchor, spinArm, decor,
        update(dt, t) {
          for (const b of belts) { const s = b.p.belt / 2; if (b.p.beltAx === 'x') b.tex.offset.x -= dt * s; else b.tex.offset.y -= dt * s; }
          for (let i = 0; i < blink.length; i++) blink[i].opacity = 0.15 + 0.85 * Math.pow(Math.max(0, Math.sin(t * 2.4 + i * 2.1)), 3);
        },
      };
    },
  };
})();

// ---------------------------------------------------------------- candy
/* =====================================================================
   VERDENSSÆT 'candy' – Slikøerne (bane 3)
   Kæmpe slik i en pastelhimmel: donuts med glasur og krymmel, chokolade-
   plader, macarons, vaffelbroer, slikkepinde, bryllupskage, skumfiduser og
   gelé. Bagved hælder en kæmpekop chokolade ud i havet mellem candyfloss-skyer.
   ===================================================================== */
(function () {
  'use strict';

  // Pastel-eftermiddag: lyserød zenit, mintgrøn horisont, blød sol
  window.SKYHOJ_THEMES.candy = {
    top: '#f7a8d8', horizon: '#b8f5e0', bottom: '#f4c9de', sunElev: 40, sunAz: -35, sunColor: '#fff0f6', sunInt: 2.7,
    hemiSky: '#ffe2f3', hemiInt: 1.05, fog: '#f2dcef', fogNear: 110, fogFar: 680, cloud: '#ffd0ec', clouds: 0.85, stars: 0,
    stone: '#f2d6e4', exposure: 1.04, lavaGlow: 0.85,
  };

  window.SKYHOJ_KITS.candy = {
    id: 'candy',
    name: 'Slikøerne',
    variants: {
      donut: 'Donut: lyserød glasur med krymmel, syltetøj i midten, gylden dej med rund bund. shape:"cyl" w 3-9 (kasse = aflang donut, w 2-4, d 4-10)',
      choc: 'Chokoladeplade med tern i et farvet papir med guldfolie. Kasse w 2-6, d 2-12 (cyl = chokoladetærte i kiksebund, w 3-8)',
      macaron: 'Macaron i pastel (skal, fod, creme). Stables nedad, hvis der er plads under. shape:"cyl" w 2.5-6 (kasse = firkantet macaron, 3-5)',
      cake: 'Bryllupskage-etage: elfenbensfondant, lyserød glasurkant med dryp, guirlander, bånd og perler; aftagende etager nedenunder. shape:"cyl" w 6-14 (kasse 6-12)',
      wafer: 'Vaffelbro: vaffelmønster på toppen, lag af vaffel og creme på siden. Kasse w 2-4, d 4-20 (lange broer)',
      lolly: 'Slikkepind: blank regnbuespiral på toppen og en hvid pind nedenunder. shape:"cyl" w 3-7 (kasse = spiralflise)',
      marsh: 'Skumfidus i pastel med flormelis og rund bund (også standard for runde springpuder). cyl eller kasse, w 2-6',
      jelly: 'Gennemsigtig gelé/vingummi med sukkertop og mørk kerne (standard for firkantede springpuder). Kasse w 2-5 (cyl også)',
    },
    barVariants: {
      cane: 'Rød-hvid bolsjestok med krog i +X-enden (standard for stænger)',
      licorice: 'Snoet rød lakrids (standard for trapez)',
      wafer: 'Vaffelrør med chokoladespiral',
    },
    create(ctx) {
      const { THREE } = ctx;
      const PI = Math.PI, TAU = PI * 2, BEV = 0.03;
      const tr = (o) => ctx.track(o);
      const V3 = THREE.Vector3;

      /* ---------- Teksturer (tegnes først, når de bruges; max 12) ---------- */
      const texCache = {};
      const canvasTex = (key, w, h, paint) => {
        if (texCache[key]) return texCache[key];
        const c = ctx.makeCanvas(w, h), g = c.getContext('2d');
        paint(g, w, h, ctx.mulberry32(key.length * 977 + w + h));
        return (texCache[key] = tr(ctx.toTexture(c)));
      };
      // Pixel for pixel: fn(x, y, c) skriver [r, g, b] (0..255) i c
      const pixels = (g, w, h, fn) => {
        const img = g.createImageData(w, h), d = img.data, c = [0, 0, 0];
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          fn(x, y, c);
          const i = (y * w + x) * 4;
          d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
        }
        g.putImageData(img, 0, 0);
      };
      // Tegn noget, så det også gentages over kanten (sømløs flise)
      const wrap = (W, H, x, y, m, fn) => {
        for (const dx of [-W, 0, W]) for (const dy of (H ? [-H, 0, H] : [0])) {
          if (x + dx > -m && x + dx < W + m && y + dy > -m && y + dy < (H || 1e9) + m) fn(x + dx, y + dy);
        }
      };
      const line = (g, x0, y0, x1, y1) => { g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); };
      const SPR = ['#ffffff', '#ffe14d', '#4fc3ff', '#6ee0a0', '#b38cff', '#ff7a4d', '#ff3f7f'];
      // Et krymmel-stykke med skygge og glans
      const sprinkle = (g, x, y, a, len, wd, col) => {
        const dx = (Math.cos(a) * len) / 2, dy = (Math.sin(a) * len) / 2;
        g.lineCap = 'round';
        g.lineWidth = wd; g.strokeStyle = 'rgba(120,30,70,0.3)'; line(g, x - dx + 1.5, y - dy + 2, x + dx + 1.5, y + dy + 2);
        g.strokeStyle = col; line(g, x - dx, y - dy, x + dx, y + dy);
        g.lineWidth = wd * 0.32; g.strokeStyle = 'rgba(255,255,255,0.55)'; line(g, x - dx * 0.7 - 1, y - dy * 0.7 - 1, x + dx * 0.7 - 1, y + dy * 0.7 - 1);
      };
      // Glasur-dryp: lyserødt bånd fra toppen med dråber, der hænger ned (gentages vandret)
      const drips = (g, W, H, y0, n, maxLen, col, r) => {
        const ds = [];
        for (let i = 0; i < n; i++) ds.push([((i + r() * 0.6) / n) * W, 10 + r() * 14, r() * maxLen]);
        for (const [col2, oy] of [['rgba(120,40,70,0.3)', 4], [col, 0]]) {
          g.fillStyle = col2;
          g.fillRect(0, 0, W, y0 + oy);
          for (const [x, wd, len] of ds) wrap(W, 0, x, 0, wd, (px) => {
            g.fillRect(px - wd / 2, y0 - 2 + oy, wd, len);
            g.beginPath(); g.arc(px, y0 + len + oy, wd / 2, 0, TAU); g.fill();
          });
        }
        g.fillStyle = 'rgba(255,255,255,0.22)'; g.fillRect(0, 0, W, y0 * 0.35);
      };
      const T = {
        // Lyserød glasur med krymmel (donuts, start/mål) – flise 2,4 m
        frost: () => canvasTex('frost', 512, 512, (g, S, _, r) => {
          g.fillStyle = '#f59fc9'; g.fillRect(0, 0, S, S);
          for (let i = 0; i < 70; i++) {
            const x = r() * S, y = r() * S, rad = 20 + r() * 60, lt = r() < 0.55;
            wrap(S, S, x, y, rad, (px, py) => {
              const gr = g.createRadialGradient(px, py, 0, px, py, rad);
              gr.addColorStop(0, lt ? 'rgba(255,228,242,0.35)' : 'rgba(214,96,152,0.2)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
              g.fillStyle = gr; g.fillRect(px - rad, py - rad, rad * 2, rad * 2);
            });
          }
          for (let i = 0; i < 190; i++) {
            const x = r() * S, y = r() * S, a = r() * PI, len = 16 + r() * 12, col = SPR[Math.floor(r() * SPR.length)];
            wrap(S, S, x, y, 20, (px, py) => sprinkle(g, px, py, a, len, 6, col));
          }
        }),
        // Chokoladetern med fas (2 x 2 tern pr. flise)
        choc: () => canvasTex('choc', 512, 512, (g, S, _, r) => pixels(g, S, S, (x, y, c) => {
          const lx = x & 255, ly = y & 255, m = Math.min(lx, 255 - lx, ly, 255 - ly), n = (r() - 0.5) * 6;
          let k = 0;
          if (m < 7) k = -0.55;
          else if (m < 36) k = (m === lx || m === ly ? 0.45 : -0.4) * (1 - (m - 7) / 29);
          else if (m > 58 && m < 63) k = 0.12; else if (m >= 63 && m < 67) k = -0.12;
          c[0] = 98 + k * 80 + n; c[1] = 55 + k * 50 + n * 0.6; c[2] = 34 + k * 34 + n * 0.4;
        })),
        // Vaffelgitter (4 x 4 lommer pr. flise)
        wafer: () => canvasTex('wafer', 256, 256, (g, S, _, r) => pixels(g, S, S, (x, y, c) => {
          const lx = x & 63, ly = y & 63, e = Math.min(lx, 63 - lx, ly, 63 - ly);
          let v;
          if (e < 8) v = 1.02 - e * 0.01 + (lx < 3 || ly < 3 ? 0.06 : 0);
          else v = 0.72 + Math.min(1, (e - 8) / 10) * 0.06 - (lx < 15 || ly < 15 ? 0.09 : 0);
          v += (r() - 0.5) * 0.05;
          c[0] = 240 * v; c[1] = 188 * v; c[2] = 112 * v;
        })),
        // Vaffel-lag og creme (siden af vaffelbroer; v går over hele højden)
        waferSide: () => canvasTex('waferSide', 256, 256, (g, S, _, r) => pixels(g, S, S, (x, y, c) => {
          const yy = y + Math.sin(x * 0.07) * 1.5, layer = Math.floor((yy / S) * 9), wafer = layer % 2 === 0;
          const n = (r() - 0.5) * 14;
          if (wafer) { const rib = (x & 15) < 3 ? 18 : 0; c[0] = 226 + rib + n; c[1] = 168 + rib + n; c[2] = 96 + n; }
          else if (layer % 4 === 1) { c[0] = 247 + n; c[1] = 230 + n; c[2] = 204 + n; } else { c[0] = 196 + n; c[1] = 140 + n; c[2] = 96 + n; }
        })),
        // Lagkage set fra siden: glasur, bund, syltetøj, creme, chokoladebund (start/mål)
        sponge: () => canvasTex('sponge', 512, 256, (g, W, H, r) => {
          const L = [[30, [243, 206, 134]], [44, [214, 38, 79]], [58, [255, 244, 228]], [128, [122, 66, 40]], [142, [255, 244, 228]], [256, [243, 206, 134]]];
          pixels(g, W, H, (x, y, c) => {
            const yy = y + Math.sin(x * 0.05) * 2 + Math.sin(x * 0.013 + 1) * 3;
            const col = (L.find((l) => yy < l[0]) || L[L.length - 1])[1], n = (r() - 0.5) * 16;
            c[0] = col[0] + n; c[1] = col[1] + n; c[2] = col[2] + n;
          });
          g.fillStyle = 'rgba(90,50,20,0.25)';
          for (let i = 0; i < 700; i++) { const x = r() * W, y = r() * H; g.beginPath(); g.ellipse(x, y, 1 + r() * 2.5, 1 + r() * 1.5, 0, 0, TAU); g.fill(); }
          drips(g, W, H, 22, 12, 34, '#f59fc9', r);
        }),
        // Revnet kiks med prikhuller (smuldreplatforme) – hele toppen er én kiks
        biscuit: () => canvasTex('biscuit', 512, 512, (g, S, _, r) => {
          const nz = ctx.tileNoise(128, 6, 3, r);
          pixels(g, S, S, (x, y, c) => {
            const v = 0.92 + (nz[(y >> 2) * 128 + (x >> 2)] - 0.5) * 0.4 + (r() - 0.5) * 0.06;
            c[0] = 230 * v; c[1] = 172 * v; c[2] = 98 * v;
          });
          for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) {
            const x = 43 + i * 85, y = 43 + j * 85;
            g.fillStyle = 'rgba(255,230,180,0.5)'; g.beginPath(); g.arc(x + 1.5, y + 1.5, 7, 0, TAU); g.fill();
            g.fillStyle = 'rgba(110,60,20,0.75)'; g.beginPath(); g.arc(x, y, 6, 0, TAU); g.fill();
          }
          g.lineCap = 'round'; g.lineJoin = 'round';
          const crack = (x, y, a, steps, wd) => {
            const pts = [[x, y]];
            for (let s = 0; s < steps; s++) { a += (r() - 0.5) * 0.9; x += Math.cos(a) * 18; y += Math.sin(a) * 18; pts.push([x, y]); }
            for (const [col, w, o] of [['rgba(255,226,170,0.55)', wd * 0.5, 2.5], ['rgba(64,30,8,0.95)', wd, 0]]) {
              g.strokeStyle = col; g.lineWidth = w; g.beginPath();
              pts.forEach(([px, py], i) => (i ? g.lineTo(px + o, py + o) : g.moveTo(px + o, py + o))); g.stroke();
            }
            return pts;
          };
          for (let k = 0; k < 5; k++) {
            const side = k % 4, t = 0.2 + r() * 0.6;
            const [x, y] = [[t * S, 0], [S, t * S], [t * S, S], [0, t * S]][side];
            const pts = crack(x, y, Math.atan2(S / 2 - y, S / 2 - x) + (r() - 0.5) * 0.6, 10 + Math.floor(r() * 6), 7);
            const b = pts[3 + Math.floor(r() * 4)];
            crack(b[0], b[1], r() * TAU, 5, 4);
          }
          for (let i = 0; i < 160; i++) { g.fillStyle = r() < 0.5 ? 'rgba(255,240,210,0.6)' : 'rgba(120,70,30,0.4)'; g.fillRect(r() * S, r() * S, 2, 2); }
        }),
        // Donutside: glasur med dryp foroven, gylden dej med lys ring, mørkere bund
        donut: () => canvasTex('donut', 512, 256, (g, W, H, r) => {
          pixels(g, W, H, (x, y, c) => {
            const t = y / H, ring = Math.exp(-(((t - 0.62) / 0.07) ** 2)), dk = Math.max(0, (t - 0.72) / 0.28), n = (r() - 0.5) * 10;
            c[0] = 216 - dk * 50 + ring * 26 + n; c[1] = 146 - dk * 48 + ring * 62 + n; c[2] = 74 - dk * 30 + ring * 76 + n;
          });
          drips(g, W, H, 86, 9, 60, '#f59fc9', r);
          for (let i = 0; i < 30; i++) {
            const x = r() * W, y = 8 + r() * 66;
            wrap(W, 0, x, y, 16, (px) => sprinkle(g, px, y, r() * PI, 12, 5, SPR[Math.floor(r() * SPR.length)]));
          }
        }),
        // Bryllupskagens side: glasurkant, guirlander med perler, rosetter og satinbånd
        cake: () => canvasTex('cake', 512, 256, (g, W, H, r) => {
          g.fillStyle = '#fbf2e8'; g.fillRect(0, 0, W, H);
          for (let x = 0; x < W; x += 8) { g.fillStyle = `rgba(200,170,150,${0.03 + r() * 0.04})`; g.fillRect(x, 0, 4, H); }
          drips(g, W, H, 26, 14, 36, '#f7aed0', r);
          for (let i = 0; i < 4; i++) {
            const x0 = i * 128;
            for (const [col, wd] of [['#e58fbf', 9], ['rgba(255,255,255,0.6)', 2.5]]) {
              g.strokeStyle = col; g.lineWidth = wd; g.beginPath(); g.moveTo(x0, 100); g.quadraticCurveTo(x0 + 64, 172, x0 + 128, 100); g.stroke();
            }
            for (let k = 1; k < 10; k++) {
              const t = k / 10, px = x0 + 128 * t, py = 100 + 2 * t * (1 - t) * 72;
              g.fillStyle = '#fffaf4'; g.beginPath(); g.arc(px, py + 9, 3.5, 0, TAU); g.fill();
            }
            g.fillStyle = '#f06ea9'; g.beginPath(); g.arc(x0, 98, 13, 0, TAU); g.fill();
            g.strokeStyle = '#ffc2dc'; g.lineWidth = 3; g.beginPath(); g.arc(x0, 98, 7, 0.5, 5.5); g.stroke();
          }
          g.fillStyle = '#c7a3ec'; g.fillRect(0, 200, W, 26);
          g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(0, 205, W, 6);
          g.fillStyle = 'rgba(90,50,140,0.35)'; g.fillRect(0, 200, W, 2); g.fillRect(0, 224, W, 2);
        }),
        // Slikkepindens spiral (hele fladen, ikke tilet)
        swirl: () => canvasTex('swirl', 512, 512, (g, S) => {
          const pal = [[255, 92, 160], [255, 247, 251], [100, 222, 188], [255, 247, 251], [255, 214, 70], [255, 247, 251], [176, 132, 255], [255, 247, 251]];
          pixels(g, S, S, (x, y, c) => {
            const dx = x - 255.5, dy = y - 255.5, rr = Math.hypot(dx, dy) / 256;
            const f = ((Math.atan2(dy, dx) / TAU + 1) * 8 + rr * 6) % 8, i = Math.floor(f), sh = 1 - rr * 0.14;
            const col = rr > 0.95 || rr < 0.045 ? pal[1] : pal[i];
            c[0] = col[0] * sh; c[1] = col[1] * sh; c[2] = col[2] * sh;
          });
        }),
        // Bolsjestribe på skrå (stænger, skinner, pæle) – én flise pr. omkreds
        stripe: () => canvasTex('stripe', 128, 128, (g, S, _, r) => pixels(g, S, S, (x, y, c) => {
          const t = ((x + y) & 127) / 128, n = (r() - 0.5) * 6;
          const col = t < 0.3 ? [214, 30, 52] : (t > 0.46 && t < 0.52) || (t > 0.8 && t < 0.86) ? [240, 104, 146] : [252, 247, 242];
          c[0] = col[0] + n; c[1] = col[1] + n; c[2] = col[2] + n;
        })),
        // Sukker/flormelis: fin gråskala-støj med glimt (farves af materialet)
        sugar: () => canvasTex('sugar', 256, 256, (g, S, _, r) => pixels(g, S, S, (x, y, c) => {
          const q = r();
          const v = q < 0.012 ? 255 : q < 0.022 ? 196 : 226 + (r() - 0.5) * 26;
          c[0] = c[1] = c[2] = v;
        })),
        // Sur regnbuestrimmel med pile mod kørselsretningen (transportbånd)
        belt: () => canvasTex('belt', 256, 256, (g, S, _, r) => {
          ['#ff4d6d', '#ff9f43', '#ffe14d', '#5fdc7a', '#4fb6ff', '#b07cff'].forEach((col, i) => { g.fillStyle = col; g.fillRect((i * S) / 6, 0, S / 6 + 1, S); });
          for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(255,255,255,${0.3 + r() * 0.5})`; g.fillRect(r() * S, r() * S, 1 + r() * 2, 1 + r() * 2); }
          g.fillStyle = 'rgba(255,255,255,0.85)';
          for (const y of [64, 192]) {
            g.beginPath(); g.moveTo(60, y - 34); g.lineTo(128, y + 18); g.lineTo(196, y - 34); g.lineTo(196, y - 6);
            g.lineTo(128, y + 46); g.lineTo(60, y - 6); g.closePath(); g.fill();
          }
          g.fillStyle = '#2a1820'; g.fillRect(0, 0, 10, S); g.fillRect(S - 10, 0, 10, S);
        }),
      };

      /* ---------- Materialer (deles mellem platformene i banen) ---------- */
      const mats = {};
      const mat = (key, make) => mats[key] || (mats[key] = tr(make()));
      const std = (o) => new THREE.MeshStandardMaterial(o);
      const phys = (o) => new THREE.MeshPhysicalMaterial(o);
      const DEC = { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 };
      const SHELL = ['#f79cc2', '#9fe3c0', '#c6a8f5', '#f8e08a', '#f9b48d'];
      const MARSH = ['#fff6fa', '#ffd2e7', '#d2f6ea', '#fff0c2', '#e4dbff'];
      const JELLY = ['#ff2d55', '#2fcf6f', '#ff8a1f', '#ffc61a', '#a64dff'];
      const WRAP = ['#e8457c', '#3c7ee0', '#8b4fd0', '#1fa6a0'];
      const M = {
        frost: () => mat('frost', () => std({ map: T.frost(), roughness: 0.48 })),
        donut: () => mat('donut', () => std({ map: T.donut(), roughness: 0.55 })),
        jam: () => mat('jam', () => phys({ color: '#d0144a', roughness: 0.1, clearcoat: 1, ...DEC })),
        chocTop: () => mat('chocTop', () => std({ map: T.choc(), bumpMap: T.choc(), bumpScale: 3, roughness: 0.34 })),
        choc: () => mat('choc', () => std({ color: '#5a2f1d', roughness: 0.28 })),
        foil: () => mat('foil', () => std({ color: '#f0c050', map: T.sugar(), metalness: 1, roughness: 0.3 })),
        wrap: (i) => mat('wrap' + i, () => std({ color: WRAP[i], roughness: 0.62 })),
        white: () => mat('white', () => std({ color: '#fbf6ef', roughness: 0.6 })),
        shell: (i) => mat('shell' + i, () => std({ color: SHELL[i], map: T.sugar(), roughness: 0.72 })),
        cream: () => mat('cream', () => std({ color: '#fff4e2', roughness: 0.6 })),
        fondant: () => mat('fondant', () => std({ color: '#fff7ef', map: T.sugar(), roughness: 0.55 })),
        cakeSide: () => mat('cakeSide', () => std({ map: T.cake(), roughness: 0.5 })),
        pearl: () => mat('pearl', () => phys({ color: '#fffaf2', roughness: 0.2, clearcoat: 1 })),
        pink: () => mat('pink', () => std({ color: '#f7a3cc', roughness: 0.45, ...DEC })),
        waferTop: () => mat('waferTop', () => std({ map: T.wafer(), bumpMap: T.wafer(), bumpScale: 2, roughness: 0.8 })),
        waferSide: () => mat('waferSide', () => std({ map: T.waferSide(), roughness: 0.75 })),
        swirl: () => mat('swirl', () => phys({ map: T.swirl(), roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.08 })),
        candy: () => mat('candy', () => phys({ color: '#ff74b0', roughness: 0.2, clearcoat: 1 })),
        stick: () => mat('stick', () => std({ color: '#f8f3ea', roughness: 0.7 })),
        marsh: (i) => mat('marsh' + i, () => phys({ color: MARSH[i], map: T.sugar(), roughness: 0.9, sheen: 1, sheenColor: '#ffffff', sheenRoughness: 0.5 })),
        jelly: (i) => mat('jelly' + i, () => phys({ color: JELLY[i], roughness: 0.15, clearcoat: 1, transparent: true, opacity: 0.8, emissive: JELLY[i], emissiveIntensity: 0.12 })),
        jellyTop: (i) => mat('jellyTop' + i, () => phys({ color: new THREE.Color(JELLY[i]).lerp(new THREE.Color('#ffffff'), 0.35), map: T.sugar(), roughness: 0.6, clearcoat: 0.4 })),
        jellyCore: (i) => mat('jellyCore' + i, () => std({ color: new THREE.Color(JELLY[i]).multiplyScalar(0.5), roughness: 0.4, emissive: JELLY[i], emissiveIntensity: 0.2 })),
        bisTop: () => mat('bisTop', () => std({ map: T.biscuit(), bumpMap: T.biscuit(), bumpScale: 3, roughness: 0.9 })),
        bisSide: () => mat('bisSide', () => std({ map: T.biscuit(), color: '#d9a670', roughness: 0.9 })),
        glassTop: () => mat('glassTop', () => phys({ map: ctx.TEX.iceTop, color: '#a8f4ea', roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.03 })),
        glass: () => mat('glass', () => phys({ color: '#7fe6da', roughness: 0.05, clearcoat: 1, transparent: true, opacity: 0.72 })),
        licorice: () => mat('licorice', () => std({ color: '#231419', roughness: 0.35 })),
        stripe: () => mat('stripe', () => phys({ map: T.stripe(), roughness: 0.25, clearcoat: 0.8 })),
        licRed: () => mat('licRed', () => std({ map: T.stripe(), color: '#8a1020', roughness: 0.38 })),
        roll: () => mat('roll', () => std({ map: T.stripe(), color: '#d8a066', roughness: 0.55 })),
        sponge: () => mat('sponge', () => std({ map: T.sponge(), roughness: 0.75 })),
        cone: () => mat('cone', () => std({ map: T.wafer(), color: '#eab070', roughness: 0.8 })),
        ventTop: () => mat('ventTop', () => std({ map: T.wafer(), color: '#9a6040', roughness: 0.7, emissive: '#ff5fb0', emissiveIntensity: 0.12 })),
        glow: () => mat('glow', () => new THREE.MeshBasicMaterial({ map: ctx.TEX.glow, color: '#ff8fd6', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })),
        icing: () => mat('icing', () => std({ color: '#ffffff', roughness: 0.45, ...DEC })),
        chevron: () => mat('chev', () => std({ color: '#fff3a0', emissive: '#ffcf3a', emissiveIntensity: 1.2, ...DEC })),
        cello: () => mat('cello', () => phys({ color: '#ffffff', transparent: true, opacity: 0.5, roughness: 0.1, clearcoat: 1, iridescence: 1 })),
      };

      /* ---------- Geometri: omrids trukket gennem en profil ---------- */
      // Omrids i XZ indrykket s meter: cirkel eller kasse med runde hjørner (lukket: sidste = første)
      function ring(p, L, s) {
        const out = [];
        if (p.shape === 'cyl') {
          const R = Math.max(0.01, p.w / 2 - s), n = ctx.clamp(Math.round(p.w * 6), 24, 64);
          for (let k = 0; k <= n; k++) { const a = (k / n) * TAU; out.push(R * Math.cos(a), R * Math.sin(a)); }
          return out;
        }
        const hx = Math.max(0.01, p.w / 2 - s), hz = Math.max(0.01, L / 2 - s), rc = Math.min(0.09 + s * 0.6, hx, hz);
        const C = [[hx - rc, hz - rc], [rc - hx, hz - rc], [rc - hx, rc - hz], [hx - rc, rc - hz]];
        for (let c = 0; c < 4; c++) for (let k = 0; k <= 3; k++) {
          const a = ((c + k / 3) * PI) / 2;
          out.push(C[c][0] + rc * Math.cos(a), C[c][1] + rc * Math.sin(a));
        }
        out.push(out[0], out[1]);
        return out;
      }
      // Massivt legeme. bands: [{ m: materialindeks, pts: [[indryk, y], ...] (oppefra og ned),
      //   vr: [vTop, vBund] (normaliseret) eller vt: meter pr. flise, ut: meter pr. flise rundt }]
      // top/bot: { m, uv(x, z) } -> flad låg-flade (toppen i første bånds første punkt)
      function solid(p, L, bands, top, bot) {
        const pos = [], uv = [], idx = [], grp = [], rows = [];
        const o = ring(p, L, 0), n = o.length / 2, cum = [0];
        for (let k = 1; k < n; k++) cum.push(cum[k - 1] + Math.hypot(o[2 * k] - o[2 * k - 2], o[2 * k + 1] - o[2 * k - 1]));
        const per = cum[n - 1];
        let last = null;
        for (const b of bands) {
          const v0 = pos.length / 3, i0 = idx.length, reps = Math.max(1, Math.round(per / (b.ut || 1))), d = [0];
          for (let j = 1; j < b.pts.length; j++) d.push(d[j - 1] + Math.hypot(b.pts[j][0] - b.pts[j - 1][0], b.pts[j][1] - b.pts[j - 1][1]));
          const tot = d[d.length - 1] || 1;
          b.pts.forEach(([s, y], j) => {
            const r = ring(p, L, s), v = b.vr ? b.vr[0] + (b.vr[1] - b.vr[0]) * (d[j] / tot) : -d[j] / (b.vt || 1);
            rows.push(pos.length / 3);
            for (let k = 0; k < n; k++) { pos.push(r[2 * k], y, r[2 * k + 1]); uv.push((cum[k] / per) * reps, v); }
            last = { r, y };
          });
          for (let j = 0; j + 1 < b.pts.length; j++) for (let k = 0; k + 1 < n; k++) {
            const a = v0 + j * n + k, c = a + n;
            idx.push(a, a + 1, c, a + 1, c + 1, c);
          }
          grp.push([i0, idx.length - i0, b.m]);
        }
        const cap = (r, y, c, up) => {
          const v0 = pos.length / 3, i0 = idx.length;
          pos.push(0, y, 0); uv.push(...c.uv(0, 0));
          for (let k = 0; k < n; k++) { pos.push(r[2 * k], y, r[2 * k + 1]); uv.push(...c.uv(r[2 * k], r[2 * k + 1])); }
          for (let k = 1; k < n; k++) (up ? idx.push(v0, v0 + k + 1, v0 + k) : idx.push(v0, v0 + k, v0 + k + 1));
          grp.push([i0, idx.length - i0, c.m]);
        };
        if (top) cap(ring(p, L, bands[0].pts[0][0]), bands[0].pts[0][1], top, true);
        if (bot && last) cap(last.r, last.y, bot, false);
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
        g.setIndex(idx);
        for (const [s, c, m] of grp) g.addGroup(s, c, m);
        g.computeVertexNormals();
        const nr = g.attributes.normal; // samme normal på begge sider af sømmen
        for (const a of rows) {
          const b = a + n - 1, x = nr.getX(a) + nr.getX(b), y = nr.getY(a) + nr.getY(b), z = nr.getZ(a) + nr.getZ(b), l = Math.hypot(x, y, z) || 1;
          nr.setXYZ(a, x / l, y / l, z / l); nr.setXYZ(b, x / l, y / l, z / l);
        }
        return tr(g);
      }
      // Hjælpere til profiler og UV'er
      const side = (h2, bev, yBot) => [[bev, h2], [0, h2 - bev], [0, yBot]];
      const bowl = (y0, dep, sh, s0 = 0) => {
        const pts = [];
        for (let i = 0; i <= 5; i++) { const a = ((i / 5) * PI) / 2; pts.push([s0 + sh * (1 - Math.cos(a)), y0 - dep * Math.sin(a)]); }
        return pts;
      };
      const world = (m, t) => ({ m, uv: (x, z) => [x / t, -z / t] });
      const norm = (m, p, L) => ({ m, uv: (x, z) => [x / p.w + 0.5, 0.5 - z / L] });
      const fixed = (m, u, v) => ({ m, uv: () => [u, v] });
      const half = (p, L) => (p.shape === 'cyl' ? p.w / 2 : Math.min(p.w, L) / 2);
      // Skaler en cylinders/rørs UV, så bolsjestriben får rigtige proportioner
      const scaleUV = (g, su, sv) => { const a = g.attributes.uv; for (let i = 0; i < a.count; i++) a.setXY(i, a.getX(i) * su, a.getY(i) * sv); return g; };
      const flat = (geo, m, y) => { const d = new THREE.Mesh(tr(geo.rotateX(-PI / 2)), m); d.position.y = y; d.userData.noCastShadow = true; return d; };

      /* ---------- Udseender (et pr. variant/type) ---------- */
      // Hvert udseende giver { mats, top, main: [bånd], under: [bånd], bot, extra(g) }
      const LOOK = {
        donut(p, L, F) {
          const h2 = p.h / 2, R = half(p, L), dep = Math.min(F, p.h * 0.6, R * 0.7), k = dep > 0.15 ? p.h / (p.h + dep * 1.25) : 1;
          return {
            mats: [M.frost(), M.donut()], top: world(0, 2.4), bot: fixed(1, 0.5, 0.02),
            main: [{ m: 1, pts: side(h2, BEV, -h2), vr: [1, 1 - k], ut: 2.2 }],
            under: dep > 0.15 ? [{ m: 1, pts: bowl(-h2, dep, Math.min(R * 0.55, dep * 1.3)), vr: [1 - k, 0], ut: 2.2 }] : null,
            extra(g) { if (p.shape === 'cyl' && R >= 1.2) g.add(flat(new THREE.CircleGeometry(R * 0.26, 36), M.jam(), h2 + 0.004)); },
          };
        },
        choc(p, L, F) {
          const H = p.h, h2 = H / 2, R = half(p, L), rr = ctx.mulberry32(p.seed);
          if (p.shape === 'cyl') { // chokoladetærte i kiksebund
            const dep = Math.min(F, H * 0.3);
            return {
              mats: [M.chocTop(), M.choc(), M.bisSide()], top: world(0, 1.8), bot: world(2, 1),
              main: [{ m: 1, pts: side(h2, BEV, h2 - 0.3 * H), vt: 1, ut: 1 }, { m: 2, pts: [[0, h2 - 0.3 * H], [0, -h2]], vt: 1, ut: 1 }],
              under: dep > 0.1 ? [{ m: 2, pts: bowl(-h2, dep, R * 0.2), vt: 1, ut: 1 }] : null,
            };
          }
          const nx = Math.max(1, Math.round(p.w / 0.9)), nz = Math.max(1, Math.round(L / 0.9)), y = (f) => h2 - f * H;
          return {
            mats: [M.chocTop(), M.choc(), M.foil(), M.wrap(Math.floor(rr() * WRAP.length)), M.white()],
            top: { m: 0, uv: (x, z) => [((x / p.w + 0.5) * nx) / 2, ((0.5 - z / L) * nz) / 2] }, bot: fixed(3, 0, 0),
            main: [
              { m: 1, pts: side(h2, BEV, y(0.42)), vt: 1, ut: 1 }, { m: 2, pts: [[0, y(0.42)], [0, y(0.5)]], vt: 0.4, ut: 0.4 },
              { m: 3, pts: [[0, y(0.5)], [0, y(0.7)]], vt: 1, ut: 1 }, { m: 4, pts: [[0, y(0.7)], [0, y(0.79)]], vt: 1, ut: 1 },
              { m: 3, pts: [[0, y(0.79)], [0, -h2]], vt: 1, ut: 1 },
            ],
          };
        },
        macaron(p, L, F) {
          const H = p.h, h2 = H / 2, R = half(p, L), rr = ctx.mulberry32(p.seed), c1 = Math.floor(rr() * 5), c2 = (c1 + 1 + Math.floor(rr() * 4)) % 5;
          // En macaron: skal, fod, creme, fod, skal (fra y0 og Hm ned, indrykket s0)
          const mac = (y0, Hm, s0, m) => {
            const y = (f) => y0 - f * Hm, f = s0 + 0.035, c = s0 + Math.min(0.07, R * 0.05);
            return [
              { m, pts: [[s0 + BEV, y0], [s0, y0 - BEV], [s0, y(0.4)], [s0 + 0.02, y(0.43)], [f, y(0.47)], [c, y(0.47)]], vt: 1.2, ut: 1.2 },
              { m: 2, pts: [[c, y(0.47)], [c, y(0.63)]], vt: 1, ut: 1 },
              { m, pts: [[c, y(0.63)], [f, y(0.63)], [s0 + 0.02, y(0.67)], [s0, y(0.7)], [s0, y(1)]], vt: 1.2, ut: 1.2 },
            ];
          };
          const stack = p.v === 'macaron' && !p.move && !p.swing && F > H * 0.95;
          const H2 = H * 0.75, s2 = R * 0.12, dep = Math.min(F - (stack ? H2 : 0), H * 0.35);
          let under = [];
          if (stack) under = [{ m: 1, pts: [[0, -h2], [s2 + BEV, -h2]], vt: 1, ut: 1 }, ...mac(-h2, H2, s2, 1)];
          if (dep > 0.12) under.push({ m: stack ? 1 : 0, pts: bowl(stack ? -h2 - H2 : -h2, dep, R * 0.4, stack ? s2 : 0), vt: 1.2, ut: 1.2 });
          return { mats: [M.shell(c1), M.shell(c2), M.cream()], top: world(0, 1.2), bot: world(stack ? 1 : 0, 1.2), main: mac(h2, H, 0, 0), under };
        },
        cake(p, L, F) {
          const H = p.h, h2 = H / 2, R = half(p, L), under = [];
          let y = -h2, s = 0, used = 0;
          for (let k = 1; k <= 3; k++) { // aftagende etager nedenunder (som en omvendt lagkage)
            const hk = H * 0.75, sk = R * 0.17 * k;
            if (used + hk > F || sk > R * 0.6) break;
            under.push({ m: 0, pts: [[s, y], [sk + BEV, y]], vt: 1.6, ut: 1.6 }, { m: 1, pts: side(y, BEV, y - hk).map(([a, b]) => [a + sk, b]), vr: [1, 0], ut: 2.4 });
            y -= hk; s = sk; used += hk;
          }
          return {
            mats: [M.fondant(), M.cakeSide()], top: world(0, 1.6), bot: world(0, 1.6),
            main: [{ m: 1, pts: side(h2, BEV, -h2), vr: [1, 0], ut: 2.4 }], under,
            extra(g) {
              // Perlekant forneden (stikker højst 3 cm ud) og en lyserød glasurring på toppen
              const r = ring(p, L, 0.05), pts = [];
              let acc = 0;
              for (let k = 1; k < r.length / 2; k++) {
                const x = r[2 * k], z = r[2 * k + 1], d = Math.hypot(x - r[2 * k - 2], z - r[2 * k - 1]);
                for (acc += d; acc > 0.17; acc -= 0.17) { const t = 1 - acc / d; pts.push([r[2 * k - 2] + (x - r[2 * k - 2]) * t, z + (r[2 * k - 1] - z) * (1 - t)]); }
              }
              const im = new THREE.InstancedMesh(tr(new THREE.SphereGeometry(0.08, 8, 6)), M.pearl(), pts.length), o = new THREE.Object3D();
              pts.forEach(([x, z], i) => { o.position.set(x, -h2 + 0.085, z); o.updateMatrix(); im.setMatrixAt(i, o.matrix); });
              g.add(im);
              if (p.shape === 'cyl' && R > 1.5) g.add(flat(new THREE.RingGeometry(R - 0.5, R - 0.24, 64), M.pink(), h2 + 0.004));
            },
          };
        },
        wafer(p, L) {
          const h2 = p.h / 2;
          return { mats: [M.waferTop(), M.waferSide()], top: world(0, 0.8), bot: world(0, 0.8), main: [{ m: 1, pts: side(h2, 0.02, -h2), vr: [1, 0], ut: 1.2 }] };
        },
        lolly(p, L, F) {
          const h2 = p.h / 2, R = half(p, L), len = Math.min(F, 6 + R);
          return {
            mats: [M.swirl(), M.candy()], top: norm(0, p, L), bot: world(1, 1),
            main: [{ m: 1, pts: side(h2, 0.035, -h2), vt: 1, ut: 1 }],
            extra(g) {
              if (len < 0.6) return;
              const rs = ctx.clamp(R * 0.07, 0.08, 0.2), st = new THREE.Mesh(tr(new THREE.CylinderGeometry(rs, rs, len, 12)), M.stick());
              st.position.y = -h2 - len / 2;
              g.add(st);
            },
          };
        },
        marsh(p, L, F) {
          const H = p.h, h2 = H / 2, R = half(p, L), i = Math.floor(ctx.mulberry32(p.seed)() * 5), dep = Math.min(F, H * 0.3);
          return {
            mats: [M.marsh(i)], top: world(0, 1.4), bot: world(0, 1.4),
            main: [{ m: 0, pts: [[0.03, h2], [0.006, h2 - 0.03], [0, h2 - 0.08], [0, -h2]], vt: 1.4, ut: 1.4 }],
            under: dep > 0.1 ? [{ m: 0, pts: bowl(-h2, dep, Math.min(R * 0.3, dep * 1.2)), vt: 1.4, ut: 1.4 }] : null,
          };
        },
        jelly(p, L) {
          const H = p.h, h2 = H / 2, i = Math.floor(ctx.mulberry32(p.seed)() * 5);
          return {
            mats: [M.jellyTop(i), M.jelly(i)], top: world(0, 1), bot: world(1, 1),
            main: [{ m: 1, pts: [[0.035, h2], [0.004, h2 - 0.03], [0, h2 - 0.08], [0, -h2 + 0.08], [0.05, -h2]], vt: 1, ut: 1 }],
            extra(g) { // mørk kerne inde i geléen giver dybde
              const k = 0.62, geo = p.shape === 'cyl' ? new THREE.CylinderGeometry((p.w / 2) * k, (p.w / 2) * k, H * k, 24) : new THREE.BoxGeometry(p.w * k, H * k, L * k);
              const core = new THREE.Mesh(tr(geo), M.jellyCore(i));
              core.userData.noCastShadow = true;
              g.add(core);
            },
          };
        },
        biscuit(p, L) {
          const h2 = p.h / 2;
          return { mats: [M.bisTop(), M.bisSide()], top: norm(0, p, L), bot: world(1, 1), main: [{ m: 1, pts: side(h2, 0.025, -h2), vt: 1, ut: 1 }] };
        },
        glass(p, L, F) { // sukkerglas (glat som is)
          const h2 = p.h / 2, R = half(p, L), dep = Math.min(F, 1.8, R);
          return {
            mats: [M.glassTop(), M.glass()], top: world(0, 2), bot: world(1, 1),
            main: [{ m: 1, pts: side(h2, 0.02, -h2), vt: 1, ut: 1 }],
            extra(g) { // hængende sukkerkrystaller under
              if (dep < 0.4) return;
              const rr = ctx.mulberry32(p.seed + 3);
              for (let i = 0; i < 5; i++) {
                const a = rr() * TAU, d = rr() * R * 0.5, len = dep * (0.5 + rr() * 0.5), cr = Math.min(R * 0.25, 0.2 + rr() * 0.3);
                const c = new THREE.Mesh(tr(new THREE.ConeGeometry(cr, len, 5).rotateX(PI)), M.glass());
                c.position.set(Math.cos(a) * d, -h2 - len / 2, Math.sin(a) * d);
                c.userData.noCastShadow = true;
                g.add(c);
              }
            },
          };
        },
        belt(p, L) {
          const h2 = p.h / 2, tex = tr(T.belt().clone()), tile = 1.6;
          tex.needsUpdate = true;
          belts.push({ tex, spd: (p.belt || 3) / tile });
          const ax = p.beltAx === 'x';
          return {
            mats: [tr(std({ map: tex, roughness: 0.6 })), M.licorice(), M.stripe()], bot: world(1, 1),
            top: { m: 0, uv: ax ? (x, z) => [z / L + 0.5, -x / tile] : (x, z) => [x / p.w + 0.5, z / tile] },
            main: [{ m: 2, pts: [[0.02, h2], [0, h2 - 0.02], [0, h2 - 0.14]], vt: 0.5, ut: 0.5 }, { m: 1, pts: [[0, h2 - 0.14], [0, -h2]], vt: 1, ut: 1 }],
          };
        },
        vent(p, L) {
          const h2 = p.h / 2;
          return {
            mats: [M.ventTop(), M.choc()], top: world(0, 0.5), bot: world(1, 1), main: [{ m: 1, pts: side(h2, 0.02, -h2), vt: 1, ut: 1 }],
            extra(g) { const gl = flat(new THREE.PlaneGeometry(p.w * 0.95, L * 0.95), M.glow(), h2 + 0.02); g.add(gl); },
          };
        },
        block(p, L, F) { // start/mål: lagkage på et vaffelbæger
          const h2 = p.h / 2, R = half(p, L), hc = Math.min(F, R * 2.2, 14);
          return {
            mats: [M.frost(), M.sponge(), M.choc()], top: world(0, 2.4), bot: world(2, 1),
            main: [{ m: 1, pts: side(h2, 0.04, -h2), vr: [1, 0], ut: 2.6 }],
            extra(g) {
              if (hc < 2) return;
              const rc = R * 0.9, cone = new THREE.Mesh(tr(scaleUV(new THREE.ConeGeometry(rc, hc, 28, 1, true), (TAU * rc) / 0.8, Math.hypot(rc, hc) / 0.8).rotateX(PI)), M.cone());
              cone.position.y = -h2 - hc / 2;
              const dip = new THREE.Mesh(tr(new THREE.CylinderGeometry(rc * 0.99, rc * 0.91, hc * 0.09, 28)), M.choc());
              dip.position.y = -h2 - hc * 0.045;
              g.add(cone, dip);
            },
          };
        },
        ramp(p, L) {
          const h2 = p.h / 2;
          return { mats: [M.chocTop(), M.choc()], top: world(0, 1.8), bot: world(1, 1), main: [{ m: 1, pts: side(h2, 0.02, -h2), vt: 1, ut: 1 }] };
        },
        rail(p, L, F) {
          const h2 = p.h / 2, len = Math.min(F, 1.4);
          return {
            mats: [M.stripe()], top: world(0, 0.4), bot: world(0, 0.4), main: [{ m: 0, pts: [[0, h2], [0, -h2]], vt: 0.4, ut: 0.4 }],
            extra(g) {
              if (len < 0.3) return;
              const geo = tr(new THREE.CylinderGeometry(0.05, 0.05, len, 8));
              for (let z = -L / 2 + 0.6; z <= L / 2 - 0.5; z += 2.5) { const s = new THREE.Mesh(geo, M.licorice()); s.position.set(0, -h2 - len / 2, z); g.add(s); }
            },
          };
        },
      };
      LOOK.boost = (p, L) => {
        const s = LOOK.jelly(p, L), core = s.extra;
        s.extra = (g) => { // lysende chevroner, der peger fremad (-Z)
          core(g);
          const w = Math.min(p.w * 0.32, 1.2), sh = new THREE.Shape();
          sh.moveTo(-w, 0.35); sh.lineTo(0, -0.35); sh.lineTo(w, 0.35); sh.lineTo(w, 0.75); sh.lineTo(0, 0.05); sh.lineTo(-w, 0.75);
          for (let i = -1; i <= 1; i++) {
            const c = flat(new THREE.ShapeGeometry(sh), M.chevron(), p.h / 2 + 0.005);
            c.geometry.rotateY(PI); c.position.z = i * Math.min(1.3, L * 0.28) - 0.2;
            g.add(c);
          }
        };
        return s;
      };
      const VARS = ['donut', 'choc', 'macaron', 'cake', 'wafer', 'lolly', 'marsh', 'jelly'];
      function lookOf(p) {
        const v = VARS.includes(p.v) ? p.v : null;
        switch (p.type) {
          case 'start': case 'finish': return v || 'block';
          case 'ice': return 'glass';
          case 'crumble': return 'biscuit';
          case 'bounce': return v === 'marsh' || v === 'jelly' ? v : p.shape === 'cyl' ? 'marsh' : 'jelly';
          case 'conveyor': return 'belt';
          case 'vent': case 'ramp': case 'rail': case 'boost': return p.type;
          case 'move': return v || 'macaron';
          case 'swing': return v || 'choc';
          case 'rot': return v || 'lolly';
          default: return v || (p.shape === 'cyl' ? 'donut' : 'choc');
        }
      }

      const belts = [], spinners = [];
      let anim = null;
      // Bolsjestang langs X (stænger, vindmøllearme): rør + afrundede ender
      function caneRod(len, r, m, hook) {
        const g = new THREE.Group();
        const rod = new THREE.Mesh(tr(scaleUV(new THREE.CylinderGeometry(r, r, len, 16, 1, true), 1, len / (TAU * r)).rotateZ(PI / 2)), m);
        g.add(rod);
        const capGeo = tr(new THREE.SphereGeometry(r, 14, 8, 0, TAU, 0, PI / 2));
        const c0 = new THREE.Mesh(capGeo, m);
        c0.rotation.z = PI / 2; c0.position.x = -len / 2;
        g.add(c0);
        if (hook) { // bolsjestokkens krog hænger ned i +X-enden
          const R = Math.max(0.16, r * 3.2);
          g.add(new THREE.Mesh(tr(scaleUV(new THREE.TorusGeometry(R, r, 10, 16, PI), (PI * R) / (TAU * r), 1).rotateZ(-PI / 2).translate(len / 2, -R, 0)), m));
        } else {
          const c1 = new THREE.Mesh(capGeo, m);
          c1.rotation.z = -PI / 2; c1.position.x = len / 2;
          g.add(c1);
        }
        return g;
      }
      // Sammensmeltning af flere geometrier (med hver sin matrix) til én
      function merge(list) {
        let n = 0;
        const parts = list.map(([geo, m]) => { const g = geo.index ? geo.toNonIndexed() : geo; if (g !== geo) geo.dispose(); g.applyMatrix4(m); n += g.attributes.position.count; return g; });
        const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
        let o = 0;
        for (const g of parts) {
          pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3);
          if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
          o += g.attributes.position.count; g.dispose();
        }
        const out = new THREE.BufferGeometry();
        out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
        out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
        return tr(out);
      }
      const mtx = (x, y, z, sx, sy, sz, rz = 0) => new THREE.Matrix4().compose(new V3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new V3(0, 0, 1), rz), new V3(sx, sy, sz));
      // Candyfloss-sky: en klump kugler (bruges over bevægelige stænger)
      const puffGeo = (rr, n, S) => merge(Array.from({ length: n }, (_, i) => {
        const a = (i / n) * TAU, d = i ? S * (0.35 + rr() * 0.3) : 0, s = S * (i ? 0.38 + rr() * 0.2 : 0.6);
        return [new THREE.IcosahedronGeometry(1, 2), mtx(Math.cos(a) * d, (rr() - 0.3) * S * 0.3, Math.sin(a) * d * 0.6, s, s * 0.85, s)];
      }));

      return {
        ventColor: '#ff9bd5',
        slickColor: '#7ff5e4',

        platform(p) {
          const L = p.type === 'ramp' ? p.slopeLen : p.d;
          const F = p.type === 'ramp' || p.type === 'boost' ? 0 : Math.min(ctx.freeBelow(p), 14);
          const look = lookOf(p), s = LOOK[look](p, L, F);
          const g = new THREE.Group(), hasUnder = s.under && s.under.length;
          const main = new THREE.Mesh(solid(p, L, s.main, s.top, hasUnder ? null : s.bot), s.mats);
          main.userData.solid = true;
          g.add(main);
          if (hasUnder) g.add(new THREE.Mesh(solid(p, L, s.under, null, s.bot), s.mats));
          if (s.extra) s.extra(g);
          if (p.type === 'bounce') { // pyntet glasurring: "land her"
            const r = half(p, L) * 0.55;
            g.add(flat(new THREE.RingGeometry(r * 0.78, r, 40), M.icing(), p.h / 2 + 0.005), flat(new THREE.CircleGeometry(r * 0.22, 24), M.icing(), p.h / 2 + 0.005));
          }
          if (p.type === 'spin') { // pebermyntepæl som nav under armen
            const hub = new THREE.Mesh(tr(scaleUV(new THREE.CylinderGeometry(0.24, 0.28, 0.8, 16), 1, 0.8 / (TAU * 0.26))), M.stripe());
            hub.position.y = p.h / 2 + 0.4;
            g.add(hub);
          }
          if (p.move || p.swing) { // lyserød svæveglød under bevægelige stykker
            const gl = flat(new THREE.PlaneGeometry(1, 1), M.glow(), -p.h / 2 - 0.2);
            gl.rotation.x = PI / 2; gl.scale.set(p.w * 1.3, L * 1.3, 1);
            g.add(gl);
          }
          return g;
        },

        spinArm(p) {
          return caneRod(p.bar, 0.19, M.stripe(), false);
        },

        bar(b) {
          const look = ['cane', 'licorice', 'wafer'].includes(b.v) ? b.v : b.swing ? 'licorice' : 'cane';
          const m = look === 'cane' ? M.stripe() : look === 'licorice' ? M.licRed() : M.roll();
          const g = caneRod(b.len, b.r, m, look === 'cane' && !b.swing);
          if (b.move) { // en candyfloss-sky bærer stangen (mindst 2,5 m over)
            const cloud = new THREE.Mesh(puffGeo(ctx.mulberry32(b.index + 5), 6, 1.4), mat('cloudBar', () => std({ color: '#ffc8ea', roughness: 1 })));
            cloud.position.y = 3.6; cloud.userData.noCastShadow = true;
            g.add(cloud);
            for (const sx of [-0.4, 0.4]) {
              const s = new THREE.Mesh(tr(new THREE.CylinderGeometry(0.025, 0.025, 3.2, 6)), M.licorice());
              s.position.set(sx * b.len, 1.6, 0);
              g.add(s);
            }
          }
          return g;
        },

        zip(z) {
          // Lakridssnøre mellem to bolsjestokke; stokkene står lidt uden for enderne og går opad
          const g = new THREE.Group(), A = new V3(z.ax, z.ay, z.az), B = new V3(z.bx, z.by, z.bz);
          const dir = B.clone().sub(A), len = dir.length();
          dir.divideScalar(len);
          const P0 = A.clone().addScaledVector(dir, -0.6), P1 = B.clone().addScaledVector(dir, 0.6);
          const cable = new THREE.Mesh(tr(new THREE.CylinderGeometry(0.035, 0.035, len + 1.2, 8)), M.licorice());
          cable.position.copy(P0).add(P1).multiplyScalar(0.5);
          cable.quaternion.setFromUnitVectors(new V3(0, 1, 0), dir);
          g.add(cable);
          const yaw = Math.atan2(-dir.z, dir.x);
          for (const [P, s] of [[P0, -1], [P1, 1]]) {
            const post = new THREE.Group(), r = 0.12, hgt = 2.6;
            post.add(new THREE.Mesh(tr(scaleUV(new THREE.CylinderGeometry(r, r, hgt, 14), 1, hgt / (TAU * r)).translate(0, hgt / 2 - 0.25, 0)), M.stripe()));
            const R = 0.42, hook = new THREE.Mesh(tr(scaleUV(new THREE.TorusGeometry(R, r, 10, 16, PI), (PI * R) / (TAU * r), 1).translate(-R * s, hgt - 0.25, 0)), M.stripe());
            post.add(hook);
            post.position.copy(P); post.rotation.y = yaw;
            g.add(post);
          }
          return g;
        },

        anchor(a) {
          // Indpakket pebermyntebolsje i ringens plan (drejer langsomt)
          const g = new THREE.Group(), spin = new THREE.Group();
          const disc = new THREE.Mesh(tr(new THREE.CylinderGeometry(0.26, 0.26, 0.14, 28).rotateX(PI / 2)), [M.candy(), M.swirl(), M.swirl()]);
          spin.add(disc);
          for (const s of [-1, 1]) {
            const tw = new THREE.Mesh(tr(new THREE.ConeGeometry(0.12, 0.2, 10).rotateZ((s * PI) / 2)), M.cello());
            tw.position.x = s * 0.37; tw.userData.noCastShadow = true;
            spin.add(tw);
          }
          g.add(spin);
          spinners.push(spin);
          return g;
        },

        decor(data) {
          return buildDecor(data);
        },

        update(dt, t) {
          for (const b of belts) b.tex.offset.y += b.spd * dt;
          for (const s of spinners) s.rotation.z += dt * 0.8;
          if (anim) anim(dt, t);
        },
      };

      /* ---------- Kulisser: kop med chokoladevandfald, candyfloss, slikøer ---------- */
      function buildDecor(data) {
        const root = new THREE.Group(), b = data.bounds, rng = ctx.mulberry32(9100 + ctx.levelIndex * 7), lava = ctx.lavaY;
        const R0 = b.radius, cx = b.cx, cz = b.cz, o = new THREE.Object3D(), col = new THREE.Color();
        const at = (a, r) => [cx + Math.cos(a) * r, cz + Math.sin(a) * r];
        const start = data.plats[0], fw = ctx.fwdVec(data.startHeading), aFwd = Math.atan2(fw.z, fw.x);
        // Stedet er frit, hvis det ligger langt nok fra banen
        const free = (x, y, z, m) => ctx.clearOfCourse(x, y, z, m);

        // --- Kæmpekoppen, der hælder chokolade ud (foran-højre for starten) ---
        const aCup = aFwd + 0.55, [kx, kz] = [start.x + Math.cos(aCup) * (R0 + 70), start.z + Math.sin(aCup) * (R0 + 70)];
        const cupY = b.maxY + 26, toC = new V3(cx - kx, 0, cz - kz).normalize();
        const cup = new THREE.Group(), tilt = new THREE.Group();
        cup.position.set(kx, cupY, kz); cup.rotation.y = Math.atan2(-toC.z, toC.x);
        tilt.rotation.z = -0.62;
        cup.add(tilt); root.add(cup);
        const porcelain = std({ color: '#c4f2e2', roughness: 0.22 }), inner = std({ color: '#fffafc', roughness: 0.2, side: THREE.DoubleSide });
        const gold = std({ color: '#f2c45a', metalness: 1, roughness: 0.25 }), chocLiq = std({ color: '#5e2e1a', roughness: 0.15 });
        const prof = [[0.01, 0], [6, 0], [7, 0.8], [9.5, 3.5], [12.3, 9], [14, 15], [14.5, 18]].map(([x, y]) => new THREE.Vector2(x, y));
        tilt.add(new THREE.Mesh(tr(new THREE.LatheGeometry(prof, 48)), porcelain));
        const inProf = [[0.01, 1.2], [8, 1.4], [11.6, 9], [13.4, 15], [13.9, 18]].map(([x, y]) => new THREE.Vector2(x, y));
        tilt.add(new THREE.Mesh(tr(new THREE.LatheGeometry(inProf, 48)), inner));
        const rim = new THREE.Mesh(tr(new THREE.TorusGeometry(14.2, 0.45, 10, 64).rotateX(PI / 2)), gold);
        rim.position.y = 18; tilt.add(rim);
        const surf = new THREE.Mesh(tr(new THREE.CircleGeometry(13.1, 48).rotateX(-PI / 2)), chocLiq);
        surf.position.y = 14.5; tilt.add(surf);
        const handle = new THREE.Mesh(tr(new THREE.TorusGeometry(4.6, 1.1, 12, 28, PI * 1.25).rotateZ(-PI * 0.62)), porcelain);
        handle.position.set(-14.6, 9.5, 0); tilt.add(handle);
        for (let i = 0; i < 9; i++) { // lyserøde prikker på koppen
          const d = new THREE.Mesh(tr(new THREE.CircleGeometry(1.3, 20)), std({ color: '#ff9fcf', roughness: 0.3 }));
          const a = (i / 9) * TAU + 0.3, y = 6 + (i % 3) * 3.6, rr = 9.4 + (y - 3.5) * 0.48;
          d.position.set(Math.cos(a) * (rr + 0.08), y, Math.sin(a) * (rr + 0.08)); d.lookAt(Math.cos(a) * 40, y, Math.sin(a) * 40);
          tilt.add(d);
        }
        const saucer = new THREE.Mesh(tr(new THREE.LatheGeometry([[0.01, -1.2], [10, -1.2], [19, 0.4], [21, 1.4], [20.6, 1.6], [10, 0], [0.01, 0]].map(([x, y]) => new THREE.Vector2(x, y)), 48)), std({ color: '#ffc3df', roughness: 0.25 }));
        saucer.position.set(-4, -5, 0); saucer.rotation.z = -0.15; cup.add(saucer);
        // Chokoladestrålen fra kopkanten ned i havet
        cup.updateMatrixWorld(true);
        const lip = new V3(14.6, 17.6, 0).applyMatrix4(tilt.matrixWorld), down = lava + 0.6;
        const P = (f, dy) => new V3(lip.x + toC.x * f, dy, lip.z + toC.z * f);
        const curve = new THREE.CatmullRomCurve3([lip.clone(), P(3.5, lip.y - 2.2), P(6.5, lip.y - 8), P(8.3, lip.y - 22), P(9, (lip.y + down) / 2), P(9.2, down)]);
        const flowTex = tr(T.sugar().clone());
        flowTex.needsUpdate = true; flowTex.repeat.set(3, 8);
        const flowMat = std({ color: '#6b3420', map: flowTex, roughness: 0.16, emissive: '#2a1008', emissiveIntensity: 0.3 });
        root.add(new THREE.Mesh(tr(new THREE.TubeGeometry(curve, 90, 2.3, 14, false)), flowMat));
        const end = P(9.2, down + 0.6);
        const pool = new THREE.Mesh(tr(new THREE.CircleGeometry(15, 48).rotateX(-PI / 2)), chocLiq);
        pool.position.copy(end); root.add(pool);
        const ripples = [0, 1, 2].map((i) => {
          const m = new THREE.Mesh(tr(new THREE.RingGeometry(0.8, 1, 48).rotateX(-PI / 2)), new THREE.MeshBasicMaterial({ color: '#9a5a36', transparent: true, depthWrite: false }));
          m.position.copy(end).y += 0.1 + i * 0.02; root.add(m);
          return m;
        });
        const foam = new THREE.InstancedMesh(tr(new THREE.IcosahedronGeometry(1, 1)), std({ color: '#8a4a2a', roughness: 0.3 }), 14);
        for (let i = 0; i < 14; i++) {
          const a = (i / 14) * TAU, d = 2.5 + rng() * 2.5, s = 0.8 + rng() * 1.4;
          o.position.set(end.x + Math.cos(a) * d, end.y + rng() * 0.8, end.z + Math.sin(a) * d); o.scale.set(s, s * 0.7, s); o.updateMatrix();
          foam.setMatrixAt(i, o.matrix);
        }
        root.add(foam);

        // --- Candyfloss-skyer: i horisonten, under banen og tre på pinde ---
        const clusters = [];
        for (let i = 0; i < 12; i++) { const a = rng() * TAU, [x, z] = at(a, R0 + 90 + rng() * 260); clusters.push([x, b.maxY + 8 + rng() * 55, z, 10 + rng() * 14, 9]); }
        for (let i = 0; i < 9; i++) { const a = rng() * TAU, [x, z] = at(a, rng() * (R0 + 100)); clusters.push([x, lava + 20 + rng() * 10, z, 8 + rng() * 8, 7]); }
        const sticks = [];
        for (let i = 0; i < 3; i++) {
          const a = aFwd + PI * (0.6 + i * 0.4) + rng() * 0.4, [x, z] = at(a, R0 + 120 + rng() * 120), y = b.maxY + 18 + rng() * 22;
          clusters.push([x, y, z, 14 + rng() * 6, 12]); sticks.push([x, y, z]);
        }
        const nPuff = clusters.reduce((s, c) => s + c[4], 0);
        const floss = new THREE.InstancedMesh(tr(new THREE.IcosahedronGeometry(1, 2)), std({ color: '#ffffff', roughness: 1, emissive: '#3a2a3a', emissiveIntensity: 0.25 }), nPuff);
        const FL = ['#ffc4e6', '#ffb3dc', '#dcc8ff', '#c8e6ff', '#ffd9ef'];
        let k = 0;
        for (const [x, y, z, S, n] of clusters) for (let i = 0; i < n; i++) {
          const a = rng() * TAU, d = i ? S * (0.3 + rng() * 0.45) : 0, s = S * (i ? 0.32 + rng() * 0.22 : 0.55);
          o.position.set(x + Math.cos(a) * d, y + (rng() - 0.4) * S * 0.35, z + Math.sin(a) * d); o.scale.set(s, s * 0.82, s); o.updateMatrix();
          floss.setMatrixAt(k, o.matrix); floss.setColorAt(k++, col.set(FL[Math.floor(rng() * FL.length)]));
        }
        root.add(floss);
        for (const [x, y, z] of sticks) {
          const h = y - lava, st = new THREE.Mesh(tr(new THREE.CylinderGeometry(0.9, 1.6, h, 12)), M.stick());
          st.position.set(x, lava + h / 2 - 6, z); root.add(st);
        }

        // --- Slikøer med gumdrops, vingummibamser, slikkepinde og bolsjestokke ---
        const DROP = ['#ff4f7b', '#ffb84d', '#ffe14d', '#5fdc7a', '#4fb6ff', '#b07cff', '#ff7ad9'];
        const drops = [], bears = [], lollies = [], canes = [];
        const islandMats = [M.frost(), std({ color: '#c9f3e2', map: T.sugar(), roughness: 0.5 }), std({ color: '#fff0b8', map: T.sugar(), roughness: 0.5 })];
        const brownie = std({ color: '#6a3a26', roughness: 0.9, map: T.sugar() });
        for (let i = 0, made = 0; i < 14 && made < 6; i++) {
          const a = (made / 6) * TAU + aFwd + rng() * 0.5, Ri = 9 + rng() * 8, [x, z] = at(a, R0 + 45 + rng() * 110);
          const y = b.minY - 4 + rng() * (b.maxY - b.minY + 14);
          if (!free(x, y, z, Ri + 10)) continue;
          made++;
          const isl = new THREE.Group();
          isl.position.set(x, y, z);
          const body = new THREE.Mesh(tr(scaleUV(new THREE.CylinderGeometry(Ri, Ri, 3.2, 40, 1), Math.round((TAU * Ri) / 2.6), 1)), [M.sponge(), islandMats[made % 3], M.choc()]);
          body.geometry.attributes.uv.array.forEach(() => {});
          isl.add(body);
          const rock = new THREE.Mesh(tr(ctx.rockGeometry(Ri * 0.95, Ri * 1.3, made * 13 + 1)), brownie);
          rock.position.y = -1.6 - Ri * 0.65; isl.add(rock);
          root.add(isl);
          const topY = y + 1.6;
          for (let j = 0; j < 12; j++) { const aa = rng() * TAU, d = Math.sqrt(rng()) * Ri * 0.85; drops.push([x + Math.cos(aa) * d, topY, z + Math.sin(aa) * d, 0.9 + rng() * 1.2]); }
          for (let j = 0; j < 3; j++) { const aa = rng() * TAU, d = rng() * Ri * 0.7; bears.push([x + Math.cos(aa) * d, topY, z + Math.sin(aa) * d, 1.3 + rng() * 1.0, rng() * TAU]); }
          for (let j = 0; j < 2; j++) { const aa = rng() * TAU, d = Ri * (0.3 + rng() * 0.5); lollies.push([x + Math.cos(aa) * d, topY, z + Math.sin(aa) * d, 5 + rng() * 3, 1.6 + rng() * 0.8, rng() * TAU]); }
          canes.push([x + Ri * 0.5, topY, z - Ri * 0.3, 0.65, rng() * TAU]);
        }
        // Kæmpebamser, der vader i havet, og kæmpe-slikkepinde/-stokke, der rejser sig af det
        for (let i = 0; i < 4; i++) { const a = aFwd + PI * 0.3 + i * 1.4 + rng() * 0.5, [x, z] = at(a, R0 + 120 + rng() * 140), s = 14 + rng() * 8; bears.push([x, lava - s * 0.5, z, s, Math.atan2(cx - x, cz - z)]); }
        for (let i = 0; i < 5; i++) { const a = aFwd + 0.9 + i * 1.25 + rng() * 0.4, [x, z] = at(a, R0 + 150 + rng() * 200); lollies.push([x, lava, z, b.maxY - lava + 25 + rng() * 40, 10 + rng() * 6, Math.atan2(cx - x, cz - z)]); }
        for (let i = 0; i < 4; i++) { const a = aFwd + 2.2 + i * 1.5 + rng() * 0.5, [x, z] = at(a, R0 + 130 + rng() * 180); canes.push([x, lava - 10, z, 6 + rng() * 3, rng() * TAU]); }

        const sugar = std({ color: '#ffffff', map: T.sugar(), roughness: 0.6 });
        const dropGeo = tr(new THREE.LatheGeometry([[0.01, 0], [0.5, 0], [0.5, 0.06], [0.47, 0.3], [0.38, 0.55], [0.22, 0.72], [0.01, 0.78]].map(([x, y]) => new THREE.Vector2(x, y)), 14));
        const dropsM = new THREE.InstancedMesh(dropGeo, sugar, drops.length);
        drops.forEach(([x, y, z, s], i) => { o.position.set(x, y, z); o.rotation.set(0, 0, 0); o.scale.setScalar(s); o.updateMatrix(); dropsM.setMatrixAt(i, o.matrix); dropsM.setColorAt(i, col.set(DROP[i % DROP.length])); });
        root.add(dropsM);
        // Vingummibamse af kugler (krop, hoved, ører, snude, arme, ben); ca. 1,9 m høj ved skala 1
        const bearGeo = merge([
          [0, 0.78, 0, 0.5, 0.62, 0.42, 0], [0, 1.5, 0, 0.38, 0.36, 0.36, 0], [-0.27, 1.8, 0, 0.13, 0.13, 0.1, 0], [0.27, 1.8, 0, 0.13, 0.13, 0.1, 0],
          [0, 1.43, 0.3, 0.17, 0.13, 0.12, 0], [-0.47, 1.02, 0.06, 0.16, 0.25, 0.16, -0.5], [0.47, 1.02, 0.06, 0.16, 0.25, 0.16, 0.5],
          [-0.26, 0.24, 0.08, 0.2, 0.25, 0.22, 0], [0.26, 0.24, 0.08, 0.2, 0.25, 0.22, 0],
        ].map(([x, y, z, sx, sy, sz, rz]) => [new THREE.SphereGeometry(1, 12, 9), mtx(x, y, z, sx, sy, sz, rz)]));
        const bearM = new THREE.InstancedMesh(bearGeo, phys({ color: '#ffffff', roughness: 0.18, clearcoat: 1, transparent: true, opacity: 0.88 }), bears.length);
        bears.forEach(([x, y, z, s, yaw], i) => { o.position.set(x, y, z); o.rotation.set(0, yaw, 0); o.scale.setScalar(s); o.updateMatrix(); bearM.setMatrixAt(i, o.matrix); bearM.setColorAt(i, col.set(JELLY[i % JELLY.length])); });
        root.add(bearM);
        // Slikkepinde: pind + spiralskive (instanser)
        const stickM = new THREE.InstancedMesh(tr(new THREE.CylinderGeometry(1, 1, 1, 8).translate(0, 0.5, 0)), M.stick(), lollies.length);
        const discM = new THREE.InstancedMesh(tr(new THREE.CylinderGeometry(1, 1, 0.22, 36).rotateX(PI / 2)), [M.candy(), M.swirl(), M.swirl()], lollies.length);
        lollies.forEach(([x, y, z, h, r, yaw], i) => {
          const rs = Math.max(0.12, r * 0.07);
          o.position.set(x, y, z); o.rotation.set(0, yaw, 0); o.scale.set(rs, h, rs); o.updateMatrix(); stickM.setMatrixAt(i, o.matrix);
          o.position.y = y + h; o.scale.setScalar(r); o.updateMatrix(); discM.setMatrixAt(i, o.matrix);
        });
        root.add(stickM, discM);
        // Bolsjestok: lige stykke + halvcirkel-krog som rør
        const caneCurve = new THREE.Curve();
        caneCurve.getPoint = (t, out = new V3()) => {
          const s = t * (8 + PI * 1.5);
          if (s < 8) return out.set(0, s, 0);
          const f = (s - 8) / 1.5;
          return out.set(1.5 - 1.5 * Math.cos(f), 8 + 1.5 * Math.sin(f), 0);
        };
        const caneGeo = tr(scaleUV(new THREE.TubeGeometry(caneCurve, 40, 0.42, 12, false), (8 + PI * 1.5) / (TAU * 0.42), 1));
        const caneM = new THREE.InstancedMesh(caneGeo, M.stripe(), canes.length);
        canes.forEach(([x, y, z, s, yaw], i) => { o.position.set(x, y, z); o.rotation.set(0, yaw, 0); o.scale.setScalar(s); o.updateMatrix(); caneM.setMatrixAt(i, o.matrix); });
        root.add(caneM);

        // --- Krymmel-glimt i luften (holdt fri af selve banen) ---
        const sp = [], sc = [];
        for (let i = 0; i < 900 && sp.length < 520; i++) {
          const x = cx + (rng() - 0.5) * R0 * 2.2, y = b.minY - 12 + rng() * (b.maxY - b.minY + 40), z = cz + (rng() - 0.5) * R0 * 2.2;
          if (!free(x, y, z, 2)) continue;
          sp.push(x, y, z); col.set(SPR[Math.floor(rng() * SPR.length)]); sc.push(col.r, col.g, col.b);
        }
        const spGeo = tr(new THREE.BufferGeometry());
        spGeo.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
        spGeo.setAttribute('color', new THREE.Float32BufferAttribute(sc, 3));
        const sparkles = new THREE.Points(spGeo, new THREE.PointsMaterial({ size: 0.55, map: ctx.TEX.glow, vertexColors: true, transparent: true, depthWrite: false, opacity: 0.95 }));
        root.add(sparkles);

        // --- Opvind som stigende sodabobler ---
        const bub = [];
        for (const w of data.winds) for (let i = 0; i < 40; i++) {
          const a = rng() * TAU, d = Math.sqrt(rng()) * w.r;
          bub.push({ x: w.x + Math.cos(a) * d, z: w.z + Math.sin(a) * d, y0: w.y, h: w.h, f: rng(), v: 0.15 + rng() * 0.2 });
        }
        let bubPts = null;
        if (bub.length) {
          const g = tr(new THREE.BufferGeometry());
          g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(bub.length * 3), 3));
          bubPts = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.35, map: ctx.TEX.glow, color: '#ffd6f0', transparent: true, depthWrite: false }));
          bubPts.frustumCulled = false;
          root.add(bubPts);
        }

        // --- Himlen: pastel-regnbue langt væk og en blød glorie om solen ---
        const rbGeo = tr(new THREE.RingGeometry(560, 660, 96, 6, 0, PI)), rc = [];
        const RB = ['#c7a8ff', '#9fd0ff', '#a8f0c8', '#fff3a0', '#ffc89a', '#ff9fc0'].map((c) => new THREE.Color(c));
        const rp = rbGeo.attributes.position;
        for (let i = 0; i < rp.count; i++) { const t = (Math.hypot(rp.getX(i), rp.getY(i)) - 560) / 100, c = RB[ctx.clamp(Math.floor(t * 5.999), 0, 5)]; rc.push(c.r, c.g, c.b); }
        rbGeo.setAttribute('color', new THREE.Float32BufferAttribute(rc, 3));
        const rainbow = new THREE.Mesh(rbGeo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.32, fog: false, depthWrite: false, side: THREE.DoubleSide }));
        const aRb = aFwd + 0.15, [rx, rz] = at(aRb, 1300);
        rainbow.position.set(rx, lava - 80, rz); rainbow.lookAt(cx, lava - 80, cz);
        root.add(rainbow);
        const th = ctx.theme, el = (th.sunElev * PI) / 180, az = (th.sunAz * PI) / 180;
        const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: ctx.TEX.glow, color: '#ffe6f4', transparent: true, opacity: 0.55, fog: false, depthWrite: false }));
        halo.position.set(cx + Math.sin(az) * Math.cos(el) * 1500, Math.sin(el) * 1500, cz - Math.cos(az) * Math.cos(el) * 1500);
        halo.scale.set(520, 520, 1);
        root.add(halo);
        for (const m of [floss, dropsM, bearM, stickM, discM, caneM, foam]) m.frustumCulled = false;

        // Animation: strømmende chokolade, ringe i plaskebassinet, svævende skyer og glimt, bobler
        anim = (dt, t) => {
          flowTex.offset.x -= dt * 0.45;
          ripples.forEach((m, i) => {
            const f = (t * 0.35 + i / 3) % 1;
            m.scale.setScalar(4 + f * 16); m.material.opacity = 0.55 * (1 - f);
          });
          floss.position.y = Math.sin(t * 0.25) * 1.2;
          sparkles.rotation.y = Math.sin(t * 0.05) * 0.03;
          sparkles.position.y = Math.sin(t * 0.4) * 0.8;
          if (bubPts) {
            const a = bubPts.geometry.attributes.position;
            bub.forEach((q, i) => { const f = (q.f + t * q.v) % 1; a.setXYZ(i, q.x + Math.sin(t + i) * 0.15, q.y0 + f * q.h, q.z); });
            a.needsUpdate = true;
          }
        };
        return root;
      }
    },
  };
})();

// ---------------------------------------------------------------- glacier
/* =====================================================================
   VERDENSSÆT 'glacier' – Gletsjeren (bane 4)
   Frostgråt vejr over drivende gletsjerblokke: sne på mørk klippe, blank
   gennemsigtig is med istapper, tyndt is der revner, roterende isflager,
   igloer, snedækkede graner og en rød forskningsstation med antenne ved
   det frosne vandfald. Bagved: enorme gletsjere og en kæmpe isbjergs-bue.
   ===================================================================== */
(function () {
  'use strict';

  // Frost-overskyet: bleg blå himmel, hvid horisont, kold blå dis
  window.SKYHOJ_THEMES.glacier = {
    top: '#a9c4dc', horizon: '#eef4fa', bottom: '#c6d9e8', sunElev: 26, sunAz: -35, sunColor: '#f6faff', sunInt: 2.3,
    hemiSky: '#dcecfa', hemiInt: 1.15, fog: '#cfe0ef', fogNear: 70, fogFar: 540, cloud: '#f4f8fc', clouds: 0.95, stars: 0,
    stone: '#7d8b9a', exposure: 1.05, lavaGlow: 0.85,
  };

  window.SKYHOJ_KITS.glacier = {
    id: 'glacier',
    name: 'Gletsjeren',
    variants: {
      rock: 'Bar mørk klippeknold med sneplamper (godt greb). Kasse w 2.5-6, d 2.5-8 eller shape:"cyl" w 2.5-6. Standard for t:"p" er ellers snedækket klippe.',
      ice: 'Blank, gennemsigtig blå is med istapper under (glat kant). Kasse w 3-8 eller cyl w 3-7. Samme udseende som t:"ice".',
      waterfall: 'Frosset vandfald: lodrette ismønstre, hvid-blå top og istapsøjler nedenunder. Kasse w 3-8, d 2-5, h 0.8-1.6 (til stablede afsatser).',
      floe: 'Flydende isflage af revnede plader med en iskøl under. shape:"cyl" w 4-8 (standard for t:"rot") eller kasse w 3-7.',
      igloo: 'Tag af snefliser (iglo-blokke) med tyk snetop. Kasse eller cyl, w 3-7, h 1-2.',
      deck: 'Rødt forskningsstationsdæk af diamantplade med ravgul kant på ståltårne (standard for t:"finish"). Kasse w 3-12, d 3-12.',
      plank: 'Ekspeditionens plankegang med snestøv på pæle. Lange kasser w 2-3.5, d 4-12.',
      overhang: 'Tyk snedækket klippeudhæng med lange, tætte istapper under (til istappe-shimmy). Kasse w 4-10, d 2-5, h 1.2-2.',
    },
    barVariants: {
      ice: 'Frossen istap-stang: blank blå is med rimfrost-bånd og iskugler i enderne (standard)',
      steel: 'Forskningsstationens stålrør med orange bånd og rim',
      pine: 'Frosset grangren med småkviste',
    },
    create(ctx) {
      const { THREE } = ctx;
      const PI = Math.PI, TAU = PI * 2, V3 = THREE.Vector3;
      const tr = (o) => ctx.track(o);
      const rnd = ctx.mulberry32, clamp = ctx.clamp, lerp = ctx.lerp;
      const hex = (h) => new THREE.Color(h);
      const WHITE = hex('#ffffff');

      /* ---------- Teksturer (tegnes først, når de bruges; max 12) ---------- */
      const texC = {};
      const tex = (key, paint, opt) => texC[key] || (texC[key] = tr(ctx.toTexture(paint(), opt)));
      const crackData = (S, rng, n, step, wmax) => { // revner som tilfældige vandringer (alfakanal)
        const c = ctx.makeCanvas(S), g = c.getContext('2d');
        g.strokeStyle = '#fff'; g.lineCap = 'round';
        for (let k = 0; k < n; k++) {
          let x = S * 0.1 + rng() * S * 0.8, y = S * 0.1 + rng() * S * 0.8, a = rng() * TAU;
          g.lineWidth = 0.7 + rng() * wmax; g.beginPath(); g.moveTo(x, y);
          for (let s = 0; s < 16; s++) {
            a += (rng() - 0.5) * 1.2; x += Math.cos(a) * step; y += Math.sin(a) * step;
            if (x < 10 || x > S - 10) a = PI - a;
            if (y < 10 || y > S - 10) a = -a;
            g.lineTo(x, y);
          }
          g.stroke();
        }
        return g.getImageData(0, 0, S, S).data;
      };
      // Sne: bløde driver, vindrifler og glimt
      const snowTex = () => tex('snow', () => {
        const S = 512, r = rnd(11), a = ctx.tileNoise(S, 4, 4, r), b = ctx.tileNoise(S, 28, 2, r), c = ctx.tileNoise(S, 128, 1, r);
        return ctx.paintPixels(S, (x, y, px) => {
          const i = y * S + x, rip = 0.5 + 0.5 * Math.sin((x / S) * TAU * 7 + a[i] * 16);
          const v = 0.95 + (a[i] - 0.5) * 0.16 + (b[i] - 0.5) * 0.05 - rip * 0.03, sp = c[i] > 0.9 ? 0.1 : 0;
          px[0] = v - 0.05 + sp; px[1] = v - 0.018 + sp; px[2] = v + 0.03 + sp; px[3] = 0.5;
        }).col;
      });
      // Mørk klippe med lag og sne i fordybninger; band = snekant øverst (til lodrette vægge)
      const rockPaint = (S, band) => {
        const r = rnd(band ? 23 : 29), a = ctx.tileNoise(S, 3, 5, r), b = ctx.tileNoise(S, 14, 3, r), c = ctx.tileNoise(S, 70, 2, r);
        return ctx.paintPixels(S, (x, y, px) => {
          const i = y * S + x, strata = 0.5 + 0.5 * Math.sin((y / S) * TAU * 4 + a[i] * 9);
          let v = 0.2 + a[i] * 0.2 + strata * 0.05 + (c[i] - 0.5) * 0.1, sn = clamp((a[i] - 0.64) * 10, 0, 1), e = 0;
          if (Math.abs(b[i] - 0.5) < 0.011) v -= 0.09;
          if (band) {
            const edge = 74 + 18 * Math.sin((TAU * 3 * x) / S + 1) + 13 * Math.sin((TAU * 7 * x) / S + 2.4) + 8 * Math.sin((TAU * 13 * x) / S + 4.1) + (c[i] - 0.5) * 14;
            if (y < edge) { sn = 1; e = clamp((y - (edge - 16)) / 16, 0, 1); } else v *= 0.6 + 0.4 * clamp((y - edge) / 40, 0, 1);
          }
          const w = 0.95 - e * 0.1;
          px[0] = lerp(v * 0.95, w - 0.05, sn); px[1] = lerp(v, w - 0.015, sn); px[2] = lerp(v * 1.12, w + 0.03, sn); px[3] = 0.5;
        }).col;
      };
      const rockTex = () => tex('rock', () => rockPaint(512, false));
      const wallTex = () => tex('wall', () => rockPaint(512, true));
      const iceTopTex = () => tex('iceTop', () => {
        const S = 512, r = rnd(31), n = ctx.tileNoise(S, 4, 5, r), f = ctx.tileNoise(S, 36, 2, r), cr = crackData(S, r, 22, 16, 1.6);
        return ctx.paintPixels(S, (x, y, px) => {
          const i = y * S + x, c = cr[i * 4 + 3] / 255, bub = f[i] > 0.84 ? 0.1 : 0;
          px[0] = 0.5 + n[i] * 0.22 + c * 0.4 + bub; px[1] = 0.78 + n[i] * 0.14 + c * 0.2 + bub; px[2] = 0.97; px[3] = 0.5;
        }).col;
      });
      // Lodrette istræk med rimfrost øverst (y=0 er toppen af væggen)
      const iceSideTex = () => tex('iceSide', () => {
        const S = 512, r = rnd(37), n = ctx.tileNoise(S, 6, 4, r), f = ctx.tileNoise(S, 48, 2, r);
        return ctx.paintPixels(S, (x, y, px) => {
          const i = y * S + x, st = 0.5 + 0.5 * Math.sin((x / S) * TAU * 9 + n[i] * 7 + f[i] * 2), dep = y / S;
          const frost = clamp(1 - dep / 0.12, 0, 1), bub = f[i] > 0.86 ? 0.14 : 0;
          px[0] = lerp(0.36 + st * 0.12 + n[i] * 0.1 + bub, 0.92, frost);
          px[1] = lerp(0.66 + st * 0.12 + bub * 0.7, 0.97, frost);
          px[2] = lerp(0.93 - dep * 0.08, 1, frost); px[3] = 0.5;
        }).col;
      });
      // Pakis: hvide plader adskilt af mørkeblå revner (tilet Voronoi)
      const floeTex = () => tex('floe', () => {
        const S = 512, r = rnd(41), pts = [], nz = ctx.tileNoise(S, 8, 3, r);
        for (let i = 0; i < 11; i++) pts.push([r() * S, r() * S, i % 3]);
        const cols = [[0.95, 0.98, 1], [0.8, 0.92, 0.99], [0.88, 0.94, 0.98]];
        return ctx.paintPixels(S, (x, y, px) => {
          let d1 = 1e9, d2 = 1e9, id = 0;
          for (const [cx, cy, k] of pts) {
            for (let ox = -S; ox <= S; ox += S) for (let oy = -S; oy <= S; oy += S) {
              const d = (x - cx - ox) * (x - cx - ox) + (y - cy - oy) * (y - cy - oy);
              if (d < d1) { d2 = d1; d1 = d; id = k; } else if (d < d2) d2 = d;
            }
          }
          const gap = Math.sqrt(d2) - Math.sqrt(d1), seam = clamp(gap / 9, 0, 1), c = cols[id], sh = 0.94 + (nz[y * S + x] - 0.5) * 0.18;
          const hi = clamp(1 - Math.abs(gap - 12) / 6, 0, 1) * 0.12;   // lys kant lige uden for revnen
          px[0] = lerp(0.12, c[0] * sh + hi, seam); px[1] = lerp(0.36, c[1] * sh + hi, seam); px[2] = lerp(0.66, c[2] * sh + hi * 0.5, seam); px[3] = 0.5;
        }).col;
      });
      // Rød diamantplade (stationens stål)
      const deckTex = () => tex('deck', () => {
        const S = 256, r = rnd(53), n = ctx.tileNoise(S, 6, 3, r);
        return ctx.paintPixels(S, (x, y, px) => {
          const u = (x % 32) / 32 - 0.5, v = (y % 32) / 32 - 0.5, row = ((x >> 5) + (y >> 5)) & 1;
          const l = row ? Math.abs(u * 0.5 + v) : Math.abs(u * 0.5 - v), dia = l < 0.1 && Math.abs(u) < 0.42 && Math.abs(v) < 0.42 ? 1 : 0;
          const k = 0.62 + (n[y * S + x] - 0.5) * 0.25 + dia * 0.12;
          px[0] = k * 0.96; px[1] = k * 0.2; px[2] = k * 0.16; px[3] = 0.5;
        }).col;
      });
      // Plankegang med snestøv i fugerne (planker langs v)
      const woodTex = () => tex('wood', () => {
        const S = 256, r = rnd(61), n = ctx.tileNoise(S, 5, 4, r), g2 = ctx.tileNoise(S, 48, 1, r);
        return ctx.paintPixels(S, (x, y, px) => {
          const i = y * S + x, pl = x % 64, shade = 0.78 + (((x >> 6) * 37) % 7) * 0.035;
          let k = (0.36 + (n[i] - 0.5) * 0.2 + (0.5 + 0.5 * Math.sin((x / S) * TAU * 28 + n[i] * 9)) * 0.07) * shade;
          if (pl < 3 || pl > 61) k *= 0.35;
          const sn = pl < 5 || pl > 59 ? 0.5 : g2[i] > 0.78 ? 0.7 : 0;
          px[0] = lerp(k * 1.25, 0.9, sn); px[1] = lerp(k * 0.82, 0.94, sn); px[2] = lerp(k * 0.52, 0.98, sn); px[3] = 0.5;
        }).col;
      });
      // Sneblokke (iglo-sten) med blå fuger
      const brickTex = () => tex('brick', () => {
        const S = 256, r = rnd(67), n = ctx.tileNoise(S, 8, 3, r);
        return ctx.paintPixels(S, (x, y, px) => {
          const row = y >> 5, xo = (x + (row & 1) * 32) % 64, id = ((x + (row & 1) * 32) >> 6) + row * 7;
          const sh = 0.9 + ((id * 53) % 9) * 0.012 + (n[y * S + x] - 0.5) * 0.08;
          if (xo < 3 || y % 32 < 3) { px[0] = 0.55; px[1] = 0.72; px[2] = 0.9; } else { px[0] = sh - 0.04; px[1] = sh; px[2] = sh + 0.05; }
          px[3] = 0.5;
        }).col;
      });
      const beltTex = () => tex('belt', () => { // snekat-bælte med hvide pile (op på lærredet = frem langs -Z)
        const c = ctx.makeCanvas(128, 256), g = c.getContext('2d');
        g.fillStyle = '#23272e'; g.fillRect(0, 0, 128, 256);
        g.fillStyle = '#3a4048'; for (let y = 0; y < 256; y += 16) g.fillRect(0, y, 128, 4);
        g.fillStyle = '#f2f6fa';
        for (const y0 of [34, 162]) {
          g.beginPath(); g.moveTo(64, y0); g.lineTo(104, y0 + 40); g.lineTo(84, y0 + 40); g.lineTo(64, y0 + 20);
          g.lineTo(44, y0 + 40); g.lineTo(24, y0 + 40); g.closePath(); g.fill();
        }
        return c;
      });
      const grateTex = () => tex('grate', () => { // varmeventil: sort rist over glødende bund
        const c = ctx.makeCanvas(128), g = c.getContext('2d'), r = rnd(71);
        g.fillStyle = '#16191e'; g.fillRect(0, 0, 128, 128);
        for (let y = 0; y < 128; y += 16) for (let x = 0; x < 128; x += 16) {
          g.fillStyle = `rgb(${200 + r() * 55 | 0},${70 + r() * 60 | 0},20)`; g.fillRect(x + 5, y + 5, 11, 11);
        }
        g.fillStyle = '#6d7a88'; for (let i = 0; i < 128; i += 16) { g.fillRect(i, 0, 5, 128); g.fillRect(0, i, 128, 5); }
        return c;
      });
      const cushionTex = () => tex('cushion', () => { // oppustelig redningspude med hvide pile
        const c = ctx.makeCanvas(256), g = c.getContext('2d');
        g.fillStyle = '#c94a10'; g.fillRect(0, 0, 256, 256);
        const gr = g.createRadialGradient(128, 128, 10, 128, 128, 140); gr.addColorStop(0, '#ff9a3c'); gr.addColorStop(1, '#e8651a');
        g.fillStyle = gr; g.fillRect(14, 14, 228, 228);
        g.setLineDash([10, 8]); g.strokeStyle = '#fff1d8'; g.lineWidth = 3; g.strokeRect(24, 24, 208, 208);
        g.setLineDash([]); g.fillStyle = 'rgba(255,255,255,0.92)';
        for (let k = 0; k < 2; k++) {
          const y0 = 150 - k * 56;
          g.beginPath(); g.moveTo(78, y0 + 34); g.lineTo(128, y0 - 12); g.lineTo(178, y0 + 34); g.lineTo(160, y0 + 44);
          g.lineTo(128, y0 + 14); g.lineTo(96, y0 + 44); g.closePath(); g.fill();
        }
        return c;
      }, { repeat: false });

      /* ---------- Materialer ---------- */
      const M = {};
      const mat = (k, f) => M[k] || (M[k] = tr(f()));
      const std = (o) => new THREE.MeshStandardMaterial(o);
      // Fresnel-glans (kant lyser op) på is
      const fresnel = (m, color, pw, k) => {
        const c = hex(color);
        m.onBeforeCompile = (s) => {
          s.uniforms.uRim = { value: c };
          s.fragmentShader = s.fragmentShader.replace('void main() {', 'uniform vec3 uRim;\nvoid main() {').replace('#include <emissivemap_fragment>',
            `#include <emissivemap_fragment>\n totalEmissiveRadiance += uRim * pow(1.0 - saturate(abs(dot(normalize(normal), normalize(vViewPosition)))), ${pw.toFixed(1)}) * ${k.toFixed(2)};`);
        };
        m.customProgramCacheKey = () => `fres${pw}${k}`;
        return m;
      };
      const ice = (k, map, o) => mat(k, () => fresnel(new THREE.MeshPhysicalMaterial({
        map, transparent: true, roughness: 0.1, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.06, depthWrite: true, ...o,
      }), '#bfeaff', 2.2, 0.9));
      const MT = {
        snow: () => mat('snow', () => std({ map: snowTex(), vertexColors: true, roughness: 0.9 })),
        wall: () => mat('wall', () => std({ map: wallTex(), roughness: 0.92 })),
        rock: () => mat('rock', () => std({ map: rockTex(), vertexColors: true, roughness: 0.93 })),
        rockFlat: () => mat('rockFlat', () => std({ map: rockTex(), vertexColors: true, roughness: 0.93, flatShading: true })),
        iceTop: () => ice('iceTop', iceTopTex(), { vertexColors: true, color: '#e6f6ff', opacity: 0.9, emissive: '#2a78b8', emissiveIntensity: 0.3 }),
        iceSide: () => ice('iceSide', iceSideTex(), { color: '#dff4ff', opacity: 0.86, emissive: '#2a78b8', emissiveIntensity: 0.34 }),
        iceBulb: () => ice('iceBulb', iceSideTex(), { vertexColors: true, color: '#d6efff', opacity: 0.82, flatShading: true, emissive: '#2a78b8', emissiveIntensity: 0.3 }),
        fall: () => ice('fall', iceSideTex(), { color: '#f2fbff', opacity: 0.92, emissive: '#5aa2d8', emissiveIntensity: 0.3 }),
        icicle: () => ice('icicle', null, { color: '#cfeeff', opacity: 0.8, emissive: '#3b8fd0', emissiveIntensity: 0.4 }),
        floe: () => mat('floe', () => std({ map: floeTex(), vertexColors: true, roughness: 0.28, metalness: 0.05, emissive: '#1b4a78', emissiveIntensity: 0.12 })),
        thinTop: () => mat('thinTop', () => std({ map: floeTex(), vertexColors: true, roughness: 0.4, color: '#f4f9ff', emissive: '#274f7a', emissiveIntensity: 0.18 })),
        core: () => mat('core', () => std({ color: '#14558f', roughness: 0.4, emissive: '#0a3a6e', emissiveIntensity: 0.6 })),
        deck: () => mat('deck', () => std({ map: deckTex(), vertexColors: true, roughness: 0.55, metalness: 0.45 })),
        lift: () => mat('lift', () => std({ map: deckTex(), vertexColors: true, roughness: 0.5, metalness: 0.6, color: '#8aa2bd' })),
        wood: () => mat('wood', () => std({ map: woodTex(), vertexColors: true, roughness: 0.85 })),
        brick: () => mat('brick', () => std({ map: brickTex(), vertexColors: true, roughness: 0.85, flatShading: true })),
        steel: () => mat('steel', () => std({ color: '#7d8895', roughness: 0.4, metalness: 0.85 })),
        dark: () => mat('dark', () => std({ color: '#2c3440', roughness: 0.5, metalness: 0.6 })),
        orange: () => mat('orange', () => std({ color: '#e8651a', roughness: 0.55 })),
        grate: () => mat('grate', () => std({ map: grateTex(), roughness: 0.5, metalness: 0.5, emissive: '#ff7a1a', emissiveMap: grateTex(), emissiveIntensity: 0.5 })),
        belt: () => mat('belt', () => std({ map: beltTex(), roughness: 0.85 })),
        boost: () => mat('boost', () => std({ map: beltTex(), roughness: 0.4, emissive: '#38c8ff', emissiveMap: beltTex(), emissiveIntensity: 1.3 })),
        cushion: () => mat('cushion', () => std({ map: cushionTex(), vertexColors: true, roughness: 0.55 })),
        vertex: () => mat('vertex', () => std({ vertexColors: true, roughness: 0.75, flatShading: true })),
      };

      /* ---------- Geometri-hjælpere ---------- */
      const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new V3(), _s = new V3();
      const xf = (g, x = 0, y = 0, z = 0, ry = 0, sx = 1, sy = sx, sz = sx, rx = 0, rz = 0) => { // flyt/drej/skalér geometri
        _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz));
        return g.applyMatrix4(_m);
      };
      const paint = (g, c) => { // ensfarvet vertexfarve (ikke-indekseret)
        const q = g.index ? g.toNonIndexed() : g, n = q.attributes.position.count, a = new Float32Array(n * 3), k = hex(c);
        for (let i = 0; i < n; i++) { a[i * 3] = k.r; a[i * 3 + 1] = k.g; a[i * 3 + 2] = k.b; }
        q.setAttribute('color', new THREE.BufferAttribute(a, 3));
        return q;
      };
      const merge = (list) => {
        const parts = list.map((g) => (g.index ? g.toNonIndexed() : g));
        let n = 0;
        for (const q of parts) n += q.attributes.position.count;
        const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2), col = new Float32Array(n * 3).fill(1);
        let o = 0;
        for (const q of parts) {
          const A = q.attributes;
          pos.set(A.position.array, o * 3);
          if (A.normal) nor.set(A.normal.array, o * 3);
          if (A.uv) uv.set(A.uv.array, o * 2);
          if (A.color) col.set(A.color.array, o * 3);
          o += A.position.count;
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
        g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
        return g;
      };
      const mesh = (g, m, o = {}) => { // net med sporing, evt. solid / ingen skygge
        const x = new THREE.Mesh(tr(g), m);
        if (o.solid) x.userData.solid = true;
        if (o.ns) x.userData.noCastShadow = true;
        return x;
      };
      const seg = (a, b, r, rs = 8) => { // cylinder mellem to punkter
        const d = new V3().subVectors(b, a), g = new THREE.CylinderGeometry(r, r, d.length(), rs);
        g.applyQuaternion(_q.setFromUnitVectors(new V3(0, 1, 0), d.clone().normalize()));
        return g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
      };
      const dropGroup = (g, k) => { // fjern en gruppe (toppen tegnes separat)
        const idx = Array.from(g.index.array), grp = g.groups[k];
        idx.splice(grp.start, grp.count); g.setIndex(idx); g.clearGroups();
        return g;
      };
      // Vægge (u i meter, v målt nedad fra toppen) + bund; ingen top
      const sidesGeo = (p, d, tU, tV, off) => {
        const cyl = p.shape === 'cyl', hy = p.h / 2;
        const g = dropGroup(cyl ? new THREE.CylinderGeometry(p.w / 2, p.w / 2, p.h, 40, 1) : new THREE.BoxGeometry(p.w, p.h, d), cyl ? 1 : 2);
        const P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv;
        for (let i = 0; i < P.count; i++) {
          const x = P.getX(i), y = P.getY(i), z = P.getZ(i), nx = N.getX(i), nz = N.getZ(i);
          if (Math.abs(N.getY(i)) > 0.5) { U.setXY(i, x / tU, z / tV); continue; }
          const u = cyl ? (U.getX(i) * TAU * (p.w / 2)) / tU : Math.abs(nx) > 0.5 ? (-nx * z) / tU : (nz * x) / tU;
          U.setXY(i, u + off, 1 - (hy - y) / tV);
        }
        return g;
      };
      // Toppen: 3x3-gitter (kasse) eller skive+ring (cyl) med kantfarve i vertexfarver; UV i meter (fit = hele fladen)
      const topGeo = (p, d, tU, tV, band, cIn, cEdge, off, fit) => {
        const cyl = p.shape === 'cyl', R = p.w / 2;
        let g;
        if (cyl) {
          const b = Math.min(band, R * 0.45);
          g = merge([new THREE.CircleGeometry(R - b, 40), new THREE.RingGeometry(R - b, R, 40, 1)]).rotateX(-PI / 2);
        } else {
          const bx = Math.min(band, p.w * 0.45), bz = Math.min(band, d * 0.45);
          g = new THREE.PlaneGeometry(p.w, d, 3, 3).rotateX(-PI / 2);
          const P = g.attributes.position;
          for (let i = 0; i < P.count; i++) {
            const x = P.getX(i), z = P.getZ(i);
            P.setX(i, Math.abs(x) < p.w * 0.4 ? Math.sign(x) * (p.w / 2 - bx) : x);
            P.setZ(i, Math.abs(z) < d * 0.4 ? Math.sign(z) * (d / 2 - bz) : z);
          }
        }
        if (!g.attributes.color) g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 3), 3));
        const P = g.attributes.position, C = g.attributes.color, U = g.attributes.uv;
        for (let i = 0; i < P.count; i++) {
          const x = P.getX(i), z = P.getZ(i);
          const edge = cyl ? Math.hypot(x, z) > R - 1e-3 : Math.abs(Math.abs(x) - p.w / 2) < 1e-4 || Math.abs(Math.abs(z) - d / 2) < 1e-4;
          const c = edge ? cEdge : cIn;
          C.setXYZ(i, c.r, c.g, c.b);
          U.setXY(i, x / tU + (fit ? 0.5 : off), -z / tV + (fit ? 0.5 : off * 0.7));
        }
        return g.translate(0, p.h / 2, 0);
      };
      // Klippeknold/iskøl under pladen: smalner nedad og bliver inden for fodaftrykket
      const bulb = (p, d, depth, rng, S, c0, c1, tile) => {
        const R = 5, g = new THREE.CylinderGeometry(1, 0.02, depth, S, R, true).translate(0, -depth / 2, 0);
        const P = g.attributes.position, U = g.attributes.uv, col = new Float32Array(P.count * 3), jit = [];
        const rx = (p.w / 2) * 0.9, rz = ((p.shape === 'cyl' ? p.w : d) / 2) * 0.9;
        for (let i = 0; i < P.count; i++) {
          const ring = Math.floor(i / (S + 1)), k = (i % (S + 1)) % S, key = ring * S + k, t = ring / R;
          if (jit[key] === undefined) jit[key] = ring === 0 ? 1 : 0.76 + rng() * 0.24;
          const f = Math.pow(1 - t, 0.8) * jit[key], a = Math.atan2(P.getZ(i), P.getX(i)), c = c0.clone().lerp(c1, Math.pow(t, 0.7));
          P.setXYZ(i, Math.cos(a) * rx * f, -depth * t, Math.sin(a) * rz * f);
          U.setXY(i, ((k / S) * TAU * rx) / tile, (-depth * t) / tile);
          col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
        }
        g.setAttribute('color', new THREE.BufferAttribute(col, 3));
        return g;
      };
      // Istapper langs undersidens kant (spids nedad)
      const icicles = (p, d, rng, perM, maxLen, rMax) => {
        const cyl = p.shape === 'cyl', hw = p.w / 2 - 0.12, hd = d / 2 - 0.12, per = cyl ? TAU * hw : 4 * (hw + hd), n = Math.round(per * perM), list = [];
        for (let i = 0; i < n; i++) {
          let x, z;
          if (cyl) { const a = rng() * TAU; x = Math.cos(a) * hw; z = Math.sin(a) * hw; } else {
            const t = rng() * per, s = hw * 2, e = hd * 2;
            if (t < s) { x = -hw + t; z = -hd; } else if (t < s + e) { x = hw; z = -hd + (t - s); } else if (t < 2 * s + e) { x = hw - (t - s - e); z = hd; } else { x = -hw; z = hd - (t - 2 * s - e); }
          }
          const len = 0.25 + Math.pow(rng(), 1.4) * maxLen, r = 0.04 + rng() * rMax;
          list.push(xf(new THREE.ConeGeometry(r, len, 5, 1, true).rotateX(PI).translate(0, -len / 2, 0), x, -p.h / 2 + 0.03, z));
        }
        return n ? merge(list) : null;
      };
      // Ståltårne under dækket / pæle under plankegangen
      const legs = (p, d, depth, r, along) => {
        const list = [], hw = p.w / 2 - 0.45, hd = d / 2 - 0.45, cyl = p.shape === 'cyl';
        const pts = cyl ? [0.785, 2.356, 3.927, 5.498].map((a) => [Math.cos(a) * (p.w / 2 - 0.55), Math.sin(a) * (p.w / 2 - 0.55)]) : [[-hw, -hd], [hw, -hd], [-hw, hd], [hw, hd]];
        if (along && !cyl) for (let z = -hd + 2.2; z < hd - 0.8; z += 2.2) pts.push([-hw, z], [hw, z]);
        for (const [x, z] of pts) list.push(xf(new THREE.CylinderGeometry(r, r * 0.7, depth, 8), x, -p.h / 2 - depth / 2 + 0.02, z));
        if (!cyl) { // tværafstivning øverst
          list.push(xf(new THREE.BoxGeometry(p.w - 0.9, 0.1, 0.1), 0, -p.h / 2 - Math.min(depth * 0.45, 1.2), -hd));
          list.push(xf(new THREE.BoxGeometry(p.w - 0.9, 0.1, 0.1), 0, -p.h / 2 - Math.min(depth * 0.45, 1.2), hd));
        }
        return merge(list);
      };
      const glowGeo = new THREE.PlaneGeometry(1, 1).rotateX(PI / 2);

      /* ---------- Udseende pr. platformtype / variant ---------- */
      const SNOWEDGE = hex('#a9c3dd'), STYLES = {
        snow: () => ({ side: MT.wall(), tU: 2, tV: 2, top: MT.snow(), tile: 3, band: 0.45, cIn: WHITE, cEdge: SNOWEDGE, under: 'rock', ici: [0.35, 0.9, 0.06] }),
        rock: () => ({ side: MT.rock(), tU: 3, tV: 3, top: MT.rock(), tile: 3, band: 0.35, cIn: WHITE, cEdge: hex('#8a97a6'), under: 'rock', ici: [0.2, 0.5, 0.05] }),
        ice: () => ({ side: MT.iceSide(), tU: 2, tV: 2, top: MT.iceTop(), tile: 3, band: 0.4, cIn: hex('#f2fbff'), cEdge: hex('#7fcfff'), under: 'ice', core: true, ici: [0.9, 1.7, 0.1] }),
        waterfall: () => ({ side: MT.fall(), tU: 3, tV: 3, top: MT.iceTop(), tile: 4, band: 0.4, cIn: hex('#fafdff'), cEdge: hex('#a8dcff'), under: 'column', core: true, ici: [0.8, 1.4, 0.09] }),
        floe: (p) => ({ side: MT.iceSide(), tU: 2, tV: 2, top: MT.floe(), tile: p.shape === 'cyl' ? p.w : 4, band: 0.35, cIn: WHITE, cEdge: hex('#9fd3f2'), under: 'ice', keel: 1, core: false, ici: [0.3, 0.8, 0.08] }),
        igloo: () => ({ side: MT.brick(), tU: 2, tV: 2, top: MT.snow(), tile: 3, band: 0.5, cIn: WHITE, cEdge: SNOWEDGE, under: 'dome' }),
        deck: () => ({ side: MT.deck(), tU: 2, tV: 2, top: MT.deck(), tile: 2, band: 0.4, cIn: WHITE, cEdge: hex('#e9b026'), under: 'stilts', ici: [0.2, 0.5, 0.04] }),
        plank: () => ({ side: MT.wood(), tU: 2, tV: 2, top: MT.wood(), tile: 2, band: 0.3, cIn: WHITE, cEdge: hex('#d8c8b0'), under: 'piles', ici: [0.3, 0.7, 0.05] }),
        overhang: () => ({ side: MT.wall(), tU: 2, tV: 2, top: MT.snow(), tile: 3, band: 0.45, cIn: WHITE, cEdge: SNOWEDGE, under: null, ici: [1.8, 2.2, 0.1] }),
        thin: () => ({ side: MT.iceSide(), tU: 1.6, tV: 2, top: MT.thinTop(), tile: 1.5, band: 0.3, cIn: hex('#f4fbff'), cEdge: hex('#7fb4e0'), under: null, ici: [0.7, 0.6, 0.06] }),
        lift: () => ({ side: MT.lift(), tU: 2, tV: 2, top: MT.lift(), tile: 2, band: 0.4, cIn: WHITE, cEdge: hex('#c9d7e6'), under: 'glow' }),
        cushion: () => ({ side: MT.orange(), tU: 2, tV: 2, top: MT.cushion(), tile: 1, band: 0.2, cIn: WHITE, cEdge: hex('#ffd9a8'), under: null, fit: true }),
        belt: (p) => ({ side: MT.dark(), tU: 2, tV: 2, top: MT.belt(), tile: p.w, tileV: p.w * 2, band: 0.12, cIn: WHITE, cEdge: hex('#9aa8b8'), under: null }),
        vent: () => ({ side: MT.dark(), tU: 2, tV: 2, top: MT.grate(), tile: 1.5, band: 0.2, cIn: WHITE, cEdge: hex('#c9d7e6'), under: null }),
        ramp: () => ({ side: MT.wall(), tU: 2, tV: 2, top: MT.snow(), tile: 3, band: 0.3, cIn: WHITE, cEdge: SNOWEDGE, under: null }),
        boost: () => ({ side: MT.dark(), tU: 2, tV: 2, top: MT.boost(), tile: 2, band: 0.1, cIn: WHITE, cEdge: WHITE, under: null }),
        rail: () => ({ side: MT.steel(), tU: 2, tV: 2, top: MT.steel(), tile: 2, band: 0.02, cIn: WHITE, cEdge: WHITE, under: null }),
      };
      const styleFor = (p) => {
        const v = p.v;
        switch (p.type) {
          case 'ice': return v === 'waterfall' || v === 'floe' ? v : 'ice';
          case 'crumble': return 'thin';
          case 'move': case 'swing': return 'lift';
          case 'bounce': return 'cushion';
          case 'conveyor': return 'belt';
          case 'vent': return 'vent';
          case 'rot': return v && STYLES[v] ? v : 'floe';
          case 'finish': return v && STYLES[v] ? v : 'deck';
          case 'ramp': case 'boost': case 'rail': return p.type;
          default: return v && STYLES[v] ? v : 'snow';
        }
      };
      const beltPlats = [];

      /* ---------- Platform ---------- */
      const platform = (p) => {
        const name = styleFor(p), st = STYLES[name](p), g = new THREE.Group(), rng = ctx.mulberry32(p.seed + 5);
        const cyl = p.shape === 'cyl', d = p.type === 'ramp' ? p.slopeLen : p.d, off = rng(), hy = p.h / 2;
        const fb = Math.max(0, ctx.freeBelow(p) - 0.4), minDim = Math.min(p.w, d);
        g.add(mesh(sidesGeo(p, d, st.tU, st.tV, off), st.side, { solid: true }));
        g.add(mesh(topGeo(p, d, st.tile, st.tileV || st.tile, st.band, st.cIn, st.cEdge, off, st.fit), st.top, { solid: true }));
        if (st.core) { // mørk iskerne giver dybde i den gennemsigtige is
          const cg = cyl ? new THREE.CylinderGeometry(p.w / 2 - 0.1, p.w / 2 - 0.1, p.h - 0.14, 28) : new THREE.BoxGeometry(p.w - 0.2, p.h - 0.14, d - 0.2);
          g.add(mesh(cg.translate(0, -0.07, 0), MT.core(), { ns: true }));
        }
        let depth = 0;
        if (st.under === 'rock' || st.under === 'ice' || st.under === 'dome' || st.under === 'column') {
          depth = Math.min(clamp(minDim * (st.keel ? 0.9 : 1.1), 1.8, 7), fb);
          if (depth > 0.7) {
            if (st.under === 'column') { // frosne vandfaldssøjler
              const list = [], n = 3 + Math.floor(rng() * 3);
              for (let i = 0; i < n; i++) {
                const len = Math.min(depth, 1.5 + rng() * 3.5), r = 0.25 + rng() * 0.3;
                const x = (rng() - 0.5) * (p.w - 1.6), z = (rng() - 0.5) * (d - 1.6);
                list.push(xf(new THREE.ConeGeometry(r, len, 7, 1, true).rotateX(PI).translate(0, -len / 2, 0), x, -hy + 0.03, z));
              }
              g.add(mesh(merge(list), MT.icicle(), { ns: true }));
            } else {
              const ic = st.under === 'ice', c0 = hex(ic ? '#f2fbff' : st.under === 'dome' ? '#f4f8ff' : '#dfe9f4'), c1 = hex(ic ? '#5fb4e8' : st.under === 'dome' ? '#9bb6d4' : '#39424e');
              const b = mesh(bulb(p, d, depth, rng, ic ? 7 : 9, c0, c1, 3), ic ? MT.iceBulb() : st.under === 'dome' ? MT.brick() : MT.rockFlat(), { ns: ic });
              b.position.y = -hy + 0.03;
              g.add(b);
            }
          }
        } else if (st.under === 'stilts' || st.under === 'piles') {
          depth = Math.min(clamp(minDim * 0.9, 1.6, 5.5), fb);
          if (depth > 0.8) g.add(mesh(legs(p, d, depth, st.under === 'stilts' ? 0.11 : 0.15, st.under === 'piles'), st.under === 'stilts' ? MT.steel() : MT.wood()));
        } else if (st.under === 'glow') { // antigrav-glød under stationens løfteplader
          const gl = new THREE.Mesh(glowGeo, tr(new THREE.MeshBasicMaterial({ map: ctx.TEX.glow, color: '#9fe4ff', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
          gl.scale.set(p.w * 1.3, 1, d * 1.3); gl.position.y = -hy - 0.15; gl.userData.noCastShadow = true;
          g.add(gl);
        }
        if (st.ici && fb > 0.5) {
          const ig = icicles(p, d, rng, st.ici[0], Math.min(st.ici[1], fb * 0.8), st.ici[2]);
          if (ig) g.add(mesh(ig, MT.icicle(), { ns: true }));
        }
        if (p.type === 'conveyor') beltPlats.push(p);
        return g;
      };

      /* ---------- Stænger, anker, svævebane, vindmøllearm ---------- */
      const anchors = [];
      const bar = (b) => {
        const v = b.v || 'ice', L = b.len, r = b.r, g = new THREE.Group(), rng = rnd(Math.round(b.x * 31 + b.z * 17 + L * 7) | 0);
        const rod = (rr, m) => g.add(mesh(new THREE.CylinderGeometry(rr, rr, L, 14).rotateZ(PI / 2), m));
        if (v === 'steel') {
          rod(r, MT.steel());
          const list = [];
          for (let x = -L / 2 + 0.3; x < L / 2; x += 0.9) list.push(paint(xf(new THREE.CylinderGeometry(r * 1.25, r * 1.25, 0.12, 12).rotateZ(PI / 2), x), '#ee7b1c'));
          for (const s of [-1, 1]) list.push(paint(xf(new THREE.BoxGeometry(0.08, r * 7, r * 7), (s * L) / 2), '#c43a2a'));
          g.add(mesh(merge(list), MT.vertex()));
        } else if (v === 'pine') {
          rod(r, mat('bark', () => std({ color: '#5a4030', roughness: 0.95 })));
          const list = [];
          for (let x = -L / 2 + 0.4; x < L / 2 - 0.2; x += 0.7 + rng() * 0.5) {
            const s = rng() < 0.5 ? 1 : -1;
            list.push(paint(xf(new THREE.ConeGeometry(r * 0.5, 0.45, 5).rotateZ(-s * 1.2), x, -0.05, s * 0.2), '#3f6a4c'));
            list.push(paint(xf(new THREE.SphereGeometry(r * 1.15, 6, 4).scale(1.8, 0.45, 1), x + 0.2, r * 0.9, 0), '#f4f8ff'));
          }
          g.add(mesh(merge(list), MT.vertex()));
        } else {
          rod(r, ice('barIce', null, { color: '#cfeeff', opacity: 0.88, emissive: '#3b8fd0', emissiveIntensity: 0.45 }));
          const list = [];
          for (let x = -L / 2 + 0.35; x < L / 2; x += 0.8) list.push(paint(xf(new THREE.CylinderGeometry(r * 1.4, r * 1.4, 0.07, 10).rotateZ(PI / 2), x), '#f4faff'));
          for (const s of [-1, 1]) {
            list.push(paint(xf(new THREE.IcosahedronGeometry(r * 3.2, 1), (s * L) / 2, 0, 0, 0, 1, 1.1, 1), '#e6f6ff'));
            for (let i = 0; i < 3; i++) { const len = 0.3 + rng() * 0.6; list.push(paint(xf(new THREE.ConeGeometry(0.05, len, 5).rotateX(PI).translate(0, -len / 2, 0), (s * L) / 2 + (rng() - 0.5) * 0.2, -r * 2.2, (rng() - 0.5) * 0.2), '#d6f0ff')); }
          }
          for (let i = 0; i < 3; i++) { const len = 0.2 + rng() * 0.5; list.push(paint(xf(new THREE.ConeGeometry(0.04, len, 5).rotateX(PI).translate(0, -len / 2, 0), (rng() - 0.5) * L * 0.7, -r, 0), '#d6f0ff')); }
          g.add(mesh(merge(list), mat('frost', () => std({ vertexColors: true, roughness: 0.3, emissive: '#2a6fa8', emissiveIntensity: 0.25 }))));
        }
        return g;
      };
      // Anker: iskrystal med seks spidser (snefnug)
      const anchor = () => {
        const g = new THREE.Group(), list = [paint(xf(new THREE.OctahedronGeometry(0.17, 0), 0, 0, 0, 0, 1, 1.6, 1), '#c8f1ff')];
        for (let i = 0; i < 3; i++) {
          list.push(paint(xf(new THREE.BoxGeometry(0.78, 0.045, 0.06), 0, 0, 0, (i * PI) / 3), '#e8f8ff'));
          for (const s of [-1, 1]) list.push(paint(xf(new THREE.OctahedronGeometry(0.07, 0), Math.cos((i * PI) / 3) * s * 0.39, 0, -Math.sin((i * PI) / 3) * s * 0.39), '#9fdcff'));
        }
        const m = mesh(merge(list), mat('crystal', () => std({ vertexColors: true, roughness: 0.15, emissive: '#68c8ff', emissiveIntensity: 0.9, flatShading: true })), { ns: true });
        g.add(m); anchors.push(g);
        return g;
      };
      const zip = (z) => {
        const g = new THREE.Group(), a = new V3(z.ax, z.ay, z.az), e = new V3(z.bx, z.by, z.bz), dir = new V3().subVectors(e, a);
        const side = new V3(-dir.z, 0, dir.x).normalize().multiplyScalar(0.7), list = [seg(a, e, 0.035, 6)];
        for (const [end, sg] of [[a, 1], [e, 1]]) {
          const top = end.clone().add(side.clone().multiplyScalar(sg)).add(new V3(0, -0.35, 0)), foot = top.clone().add(new V3(0, -3.6, 0));
          list.push(paint(seg(foot, top, 0.11), '#d83a2a'), paint(seg(top, end, 0.06), '#7d8895'));
          for (let k = 0; k < 3; k++) list.push(paint(seg(foot.clone().lerp(top, 0.15 + k * 0.28), foot.clone().lerp(top, 0.25 + k * 0.28), 0.118), '#f4f4f4'));
        }
        g.add(mesh(merge(list.map((q, i) => (i === 0 ? paint(q, '#aab6c4') : q))), MT.vertex()));
        return g;
      };
      const spinArm = (p) => { // isbjælke med røde ender og aksel ned mod soklen
        const L = p.bar, g = new THREE.Group(), list = [];
        list.push(paint(new THREE.BoxGeometry(L - 1.0, 0.36, 0.45), '#bfe6fb'));
        for (const s of [-1, 1]) {
          list.push(paint(xf(new THREE.BoxGeometry(0.52, 0.38, 0.47), (s * (L - 0.52)) / 2), '#d83a2a'));
          list.push(paint(xf(new THREE.BoxGeometry(0.1, 0.39, 0.48), (s * (L - 0.52)) / 2 - s * 0.14), '#f4f4f4'));
          for (let i = 0; i < 4; i++) { const len = 0.25 + ((i * 37) % 5) * 0.08; list.push(paint(xf(new THREE.ConeGeometry(0.05, len, 5).rotateX(PI).translate(0, -len / 2, 0), s * (0.7 + i * 0.9), -0.17, 0.08 * (i % 2 ? 1 : -1)), '#d6f0ff')); }
        }
        list.push(paint(xf(new THREE.CylinderGeometry(0.2, 0.26, 0.55, 14), 0, -0.32, 0), '#4a5460'));
        g.add(mesh(merge(list), MT.vertex()));
        return g;
      };

      /* ---------- Kulisser ---------- */
      const timeU = [];
      // Sne/glimt, der ombrydes rundt om kameraet (hele bevægelsen sker i shaderen)
      const flakes = (n, box, size, color, fall, sparkle) => {
        const rng = rnd(n + 7), pos = new Float32Array(n * 3), seed = new Float32Array(n);
        for (let i = 0; i < n; i++) { pos[i * 3] = rng() * box.x; pos[i * 3 + 1] = rng() * box.y; pos[i * 3 + 2] = rng() * box.z; seed[i] = rng(); }
        const geo = tr(new THREE.BufferGeometry());
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
        const u = { uTime: { value: 0 }, uBox: { value: box }, uSize: { value: size }, uCol: { value: hex(color) }, uFall: { value: fall }, uSpark: { value: sparkle ? 1 : 0 } };
        const m = tr(new THREE.ShaderMaterial({
          uniforms: u, transparent: true, depthWrite: false, fog: false, blending: sparkle ? THREE.AdditiveBlending : THREE.NormalBlending,
          vertexShader: `uniform float uTime; uniform vec3 uBox; uniform float uSize; uniform float uFall; uniform float uSpark; attribute float aSeed; varying float vA;
            void main() {
              vec3 p = position;
              p.y -= uTime * uFall * (0.6 + aSeed);
              p.x += sin(uTime * 0.7 + aSeed * 40.0) * 1.4 + uTime * 0.9;
              p.z += cos(uTime * 0.55 + aSeed * 31.0) * 1.2;
              vec3 rel = mod(p - cameraPosition + uBox * 0.5, uBox) - uBox * 0.5;
              vec4 mv = viewMatrix * vec4(cameraPosition + rel, 1.0);
              gl_Position = projectionMatrix * mv;
              float dist = -mv.z;
              gl_PointSize = clamp(uSize * (0.6 + aSeed) * 620.0 / max(dist, 1.0), 1.5, 10.0);
              vA = (1.0 - smoothstep(0.35, 0.5, length(rel / uBox))) * smoothstep(0.5, 3.0, dist);
              if (uSpark > 0.5) vA *= pow(0.5 + 0.5 * sin(uTime * (2.0 + aSeed * 5.0) + aSeed * 60.0), 3.0);
            }`,
          fragmentShader: `uniform vec3 uCol; varying float vA;
            void main() { float a = smoothstep(0.5, 0.1, length(gl_PointCoord - 0.5)) * vA; if (a < 0.01) discard; gl_FragColor = vec4(uCol, a * 0.9); }`,
        }));
        const pts = new THREE.Points(geo, m);
        pts.frustumCulled = false; pts.userData.noCastShadow = true; timeU.push(u.uTime);
        return pts;
      };
      // Skybokse (instanserede, skærmvendte tåge-/skyklatter, ét kald)
      const puffs = (items, texture, fade) => {
        const n = items.length, A = new Float32Array(n * 4), B = new Float32Array(n * 4), base = new THREE.PlaneGeometry(1, 1);
        items.forEach((it, i) => { A.set([it[0], it[1], it[2], it[3]], i * 4); B.set([it[4], it[5], it[6], it[7]], i * 4); });
        const geo = tr(new THREE.InstancedBufferGeometry());
        geo.index = base.index; geo.setAttribute('position', base.attributes.position); geo.setAttribute('uv', base.attributes.uv);
        geo.setAttribute('aPos', new THREE.InstancedBufferAttribute(A, 4)); geo.setAttribute('aTint', new THREE.InstancedBufferAttribute(B, 4));
        geo.instanceCount = n;
        const m = tr(new THREE.ShaderMaterial({
          uniforms: { uMap: { value: texture }, uFade: { value: new THREE.Vector2(fade[0], fade[1]) } }, transparent: true, depthWrite: false, fog: false,
          vertexShader: `attribute vec4 aPos; attribute vec4 aTint; varying vec2 vUv; varying vec4 vT; varying float vD;
            void main() { vec4 mv = viewMatrix * vec4(aPos.xyz, 1.0); vD = -mv.z; mv.xy += position.xy * aPos.w; vUv = uv; vT = aTint; gl_Position = projectionMatrix * mv; }`,
          fragmentShader: `uniform sampler2D uMap; uniform vec2 uFade; varying vec2 vUv; varying vec4 vT; varying float vD;
            void main() { float a = texture2D(uMap, vUv).a * vT.a * smoothstep(uFade.x, uFade.y, vD); gl_FragColor = vec4(vT.rgb, a);
              #include <tonemapping_fragment>
              #include <colorspace_fragment>
            }`,
        }));
        const o = new THREE.Mesh(geo, m);
        o.frustumCulled = false; o.userData.noCastShadow = true;
        return o;
      };
      // Takket ismassiv: flere kegler med terrasser, farver fra mørk klippe til sne
      const massif = (seed, R, H) => {
        const rng = rnd(seed), list = [];
        for (let pk = 0; pk < 3; pk++) {
          const r = R * (pk ? 0.45 + rng() * 0.3 : 1), h = H * (pk ? 0.5 + rng() * 0.35 : 1), S = 11, L = 9;
          const g = new THREE.ConeGeometry(1, 1, S, L, true), P = g.attributes.position, col = new Float32Array(P.count * 3), jit = [];
          for (let i = 0; i < P.count; i++) {
            const ring = Math.floor(i / (S + 1)), k = (i % (S + 1)) % S, key = ring * S + k;
            if (jit[key] === undefined) jit[key] = 0.78 + rng() * 0.44;
            const t = 1 - ring / L, a = Math.atan2(P.getZ(i), P.getX(i)), terr = 1 + 0.16 * Math.sin(t * TAU * 3.2 + pk);
            const rr = Math.pow(1 - t, 0.85) * jit[key] * terr * r, jy = (jit[key] - 1) * 0.1 * h * (ring > 0 ? 1 : 0);
            P.setXYZ(i, Math.cos(a) * rr, t * h + jy, Math.sin(a) * rr);
            const c = hex(t < 0.2 ? '#46566a' : t < 0.55 ? '#8fc4ea' : '#f4f9ff').lerp(WHITE, (jit[key] - 0.78) * 0.5);
            col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
          }
          g.setAttribute('color', new THREE.BufferAttribute(col, 3));
          list.push(xf(g, pk ? (rng() - 0.5) * R * 1.3 : 0, 0, pk ? (rng() - 0.5) * R * 1.3 : 0));
        }
        return merge(list);
      };
      const pineGeo = () => merge([ // lav-poly gran med snetunge grene
        paint(xf(new THREE.CylinderGeometry(0.18, 0.26, 1.4, 6), 0, 0.7, 0), '#4a3626'),
        ...[[2.1, 1.7, 0.9], [1.7, 1.5, 2.1], [1.25, 1.3, 3.2]].map(([r, h, y], i) => {
          const g = new THREE.ConeGeometry(r, h, 7, 1, true).translate(0, y, 0).toNonIndexed(), P = g.attributes.position, a = new Float32Array(P.count * 3);
          for (let k = 0; k < P.count; k++) { const t = (P.getY(k) - (y - h / 2)) / h, c = hex('#2d5a42').lerp(hex('#eef5ff'), clamp(t * 1.5 - 0.1 + i * 0.1, 0, 1)); a[k * 3] = c.r; a[k * 3 + 1] = c.g; a[k * 3 + 2] = c.b; }
          g.setAttribute('color', new THREE.BufferAttribute(a, 3));
          return g;
        }),
      ]);
      const pieceList = (list, g, c, x, y, z, ry = 0, sx = 1, sy = sx, sz = sx) => list.push(paint(xf(g, x, y, z, ry, sx, sy, sz), c));

      const decor = (data) => {
        const root = new THREE.Group(), b = data.bounds, plats = data.plats, rng = rnd(ctx.levelIndex * 977 + 13), th = ctx.theme;
        const last = plats[plats.length - 1], first = plats[0], lavaY = ctx.lavaY, snowY = [];
        for (let y = b.minY - 12; y <= b.maxY + 12; y += 8) snowY.push(y);
        const clearAt = (x, z, m) => snowY.every((y) => ctx.clearOfCourse(x, y, z, m));
        const add = (o) => { root.add(o); return o; };

        // Sne og glimt
        add(flakes(4500, new V3(70, 40, 70), 0.055, '#ffffff', 1.5, false));
        add(flakes(1400, new V3(110, 50, 110), 0.05, '#cfeaff', 0.25, true));

        // Gletsjermassiver rundt om, med fod i lavaen
        const gm = mesh(merge(Array.from({ length: 14 }, (_, i) => {
          for (let tries = 0, D = b.radius + 90 + rng() * 150; ; tries++, D += 40) {
            const ang = (i / 14) * TAU + rng() * 0.35, R = 40 + rng() * 55, H = 75 + rng() * 105, x = b.cx + Math.cos(ang) * D, z = b.cz + Math.sin(ang) * D;
            if (clearAt(x, z, R * 0.8 + 10) || tries > 6) return xf(massif(31 + i * 17, R, H), x, lavaY - 8, z, rng() * TAU);
          }
        })), mat('massif', () => std({ vertexColors: true, flatShading: true, roughness: 0.55, emissive: '#1a3a5a', emissiveIntensity: 0.14 })));
        add(gm);

        // Kæmpe isbjergs-bue bagved (i forlængelse af startretningen)
        {
          const ang = first.heading + 0.5, D = b.radius + 270, g = new THREE.TorusGeometry(1, 0.34, 10, 28, PI);
          const P = g.attributes.position, col = new Float32Array(P.count * 3), j = [];
          for (let i = 0; i < P.count; i++) {
            const key = Math.round(P.getX(i) * 40) + ',' + Math.round(P.getY(i) * 40) + ',' + Math.round(P.getZ(i) * 40);
            if (j[key] === undefined) j[key] = 0.9 + rng() * 0.22;
            const k = j[key], c = hex('#5a8fc4').lerp(hex('#f2f8ff'), clamp(P.getY(i) * 0.9 + (k - 1), 0, 1));
            P.setXYZ(i, P.getX(i) * 125 + (k - 1) * 12, P.getY(i) * 135 + (k - 1) * 10, P.getZ(i) * 62 * k);
            col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
          }
          g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.computeVertexNormals();
          const arch = mesh(g, mat('arch', () => std({ vertexColors: true, flatShading: true, roughness: 0.3, emissive: '#2a6fa8', emissiveIntensity: 0.22 })), { ns: true });
          const fw = new V3(Math.sin(ang), 0, -Math.cos(ang));
          arch.position.set(b.cx + fw.x * D, lavaY - 6, b.cz + fw.z * D); arch.rotation.y = -ang + PI / 2 + 0.4;
          add(arch);
        }

        // Klippe med frossent vandfald og forskningsstation bag målet
        const pines = [];
        let station = null;
        for (const da of [0, 0.5, -0.5, 1, -1, 1.6, -1.6, PI]) {
          const hd = last.heading + da, f = ctx.fwdVec(hd), dist = Math.max(last.w, last.d) / 2 + 32;
          const cx = last.x + f.x * dist, cz = last.z + f.z * dist;
          if (!clearAt(cx, cz, 24) && da !== PI) continue;
          const W = 46, Dp = 34, top = last.top - 1.4, Hc = top - lavaY + 6, yaw = -hd, root2 = new THREE.Group();
          root2.position.set(cx, 0, cz); root2.rotation.y = yaw; // lokal -Z = væk fra banen
          const bg = new THREE.BoxGeometry(W, Hc, Dp, 9, 8, 5), P = bg.attributes.position, col = new Float32Array(P.count * 3);
          for (let i = 0; i < P.count; i++) {
            const x = P.getX(i), y = P.getY(i), z = P.getZ(i), edge = Math.abs(y) > Hc / 2 - 0.1 ? 0 : 1, n = Math.sin(x * 0.7 + z * 0.4) * Math.cos(y * 0.35 + x * 0.2);
            P.setXYZ(i, x + n * 2.2 * edge * (Math.abs(x) < W / 2 - 0.1 ? 1 : 0.3), y, z + n * 1.8 * (z > 0 ? edge : 0.2));
            const c = hex(y > Hc / 2 - 0.3 ? '#f4f9ff' : '#3f4b5a').lerp(hex('#aebfd0'), clamp(n * 0.4 + 0.2, 0, 0.5) * (y > Hc / 2 - 0.3 ? 0 : 1));
            col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
          }
          bg.setAttribute('color', new THREE.BufferAttribute(col, 3)); bg.computeVertexNormals();
          const cliff = mesh(bg, MT.vertex(), {}); cliff.position.y = lavaY - 6 + Hc / 2; root2.add(cliff);
          // frosset vandfald på forsiden: ribber af isrør, tapet af en flade og et forhæng af istapper foroven
          const wl = [], zf = Dp / 2 + 1.2;
          for (let i = 0; i < 22; i++) {
            const x = -W * 0.3 + (i / 21) * W * 0.6 + (rng() - 0.5) * 1.2, len = Hc * (0.55 + rng() * 0.4), r = 1.2 + rng() * 1.1;
            wl.push(xf(new THREE.ConeGeometry(r, len, 7, 1, true).rotateX(PI).translate(0, -len / 2, 0), x, top, zf + rng() * 1.2, rng() * TAU));
          }
          for (let i = 0; i < 40; i++) { const len = 1.5 + rng() * 4, x = -W / 2 + rng() * W; wl.push(xf(new THREE.ConeGeometry(0.3 + rng() * 0.3, len, 5, 1, true).rotateX(PI).translate(0, -len / 2, 0), x, top - 0.4, zf - 0.5 + rng())); }
          const fall = mesh(merge(wl), MT.fall(), { ns: true }); fall.position.y = 0; root2.add(fall);
          const sheet = new THREE.Mesh(tr(new THREE.PlaneGeometry(W * 0.62, Hc * 0.9, 1, 1)), tr(new THREE.MeshStandardMaterial({ map: iceSideTex(), color: '#eaf7ff', emissive: '#4a95d0', emissiveIntensity: 0.3, roughness: 0.2 })));
          sheet.position.set(0, top - Hc * 0.45, zf - 0.4); root2.add(sheet);
          root.add(root2);
          // stationen oven på klippen
          const sl = [], wl2 = [], t0 = top, s0 = -4;
          const cabin = (x, z, w, h, d, cw, cr) => {
            pieceList(sl, new THREE.BoxGeometry(w, h, d), cw, x, t0 + h / 2, z);
            pieceList(sl, new THREE.BoxGeometry(w + 0.7, 0.3, d + 0.7), cr, x, t0 + h + 0.15, z);
            pieceList(sl, new THREE.BoxGeometry(w + 0.5, 0.25, d + 0.5), '#f4f9ff', x, t0 + h + 0.4, z);
            for (let k = 0; k < Math.floor(w / 2.6); k++) wl2.push(xf(new THREE.PlaneGeometry(1.1, 0.9), x - w / 2 + 1.5 + k * 2.6, t0 + h * 0.58, z + d / 2 + 0.02));
          };
          cabin(-8, s0, 11, 4.2, 6.5, '#c4281e', '#f2f4f6'); cabin(6, s0 + 2, 8, 3.2, 4.5, '#eef2f6', '#c4281e'); cabin(-1, s0 - 8, 6, 3, 4, '#c4281e', '#2f3640');
          for (let i = 0; i < 5; i++) pieceList(sl, new THREE.CylinderGeometry(0.55, 0.55, 1.2, 10), i % 2 ? '#c4281e' : '#2d5aa0', -14 + (i % 3) * 1.2, t0 + 0.6, -9 + Math.floor(i / 3) * 1.3);
          for (let i = 0; i < 3; i++) pieceList(sl, new THREE.BoxGeometry(1.5, 1.2, 1.5), '#8a6a44', 12 + i * 1.7, t0 + 0.6 + (i === 2 ? 1.2 : 0), -4.5);
          for (let k = 0; k < 8; k++) pieceList(sl, new THREE.CylinderGeometry(1.0 - k * 0.07, 1.06 - k * 0.07, 3.4, 8), k % 2 ? '#f4f4f4' : '#d83a2a', 16, t0 + 1.7 + k * 3.4, -12 + 0); // antennemast
          pieceList(sl, new THREE.SphereGeometry(2.2, 14, 6, 0, TAU, 0, 1.0), '#f2f4f6', 16, t0 + 29, -12, 0.6, 1, 1, 1); // parabol
          const stationMesh = mesh(merge(sl), MT.vertex(), {}); stationMesh.position.set(0, 0, 0); root2.add(stationMesh);
          const win = mesh(merge(wl2), mat('win', () => std({ color: '#ffe2a0', emissive: '#ffcf70', emissiveIntensity: 1.2, side: THREE.DoubleSide })), { ns: true });
          win.rotation.y = 0; root2.add(win);
          for (const s of [-1, 1]) { // rødt blinklys og lysende kugle på mastetoppen
            const ball = new THREE.Mesh(tr(new THREE.SphereGeometry(0.45, 10, 8)), tr(std({ color: '#ff3a2a', emissive: '#ff2010', emissiveIntensity: 1.5 })));
            ball.position.set(16, t0 + 30.2 + (s > 0 ? 0 : -0.01), -12); ball.userData.noCastShadow = true;
            if (s > 0) { root2.add(ball); station = ball; }
          }
          // sne omkring ved stationen
          for (let i = 0; i < 9; i++) pines.push([cx + Math.cos(yaw) * (-18 + i * 4.4) - Math.sin(yaw) * (-8 + rng() * 14), top, cz + Math.sin(yaw) * (-18 + i * 4.4) * -1 + Math.cos(yaw) * (-8 + rng() * 14), 0.9 + rng() * 0.5]);
          break;
        }
        add(new THREE.Group());

        const dec = { station, rotors: [] };
        decorState.station = station;
        return root;
      };
      const decorState = {};
      return {
        ventColor: '#eaf6ff',
        platform, bar, anchor, zip, spinArm, decor,
        update(dt, t) {
          for (const u of timeU) u.value = t;
          for (const p of beltPlats) { const tx = M.belt && M.belt.map; if (tx) tx.offset.y -= (dt * p.belt) / (p.w * 2) / beltPlats.length; }
          for (const a of anchors) a.rotation.y = t * 0.6;
          if (decorState.station) decorState.station.material.emissiveIntensity = Math.sin(t * 3) > 0.4 ? 2 : 0.15;
        },
      };
    },
  };
})();

// ---------------------------------------------------------------- harbor
/* =====================================================================
   VERDENSSÆT 'harbor' – Luftskibshavnen (bane 5)
   Solrig havn i skyerne: hvide moler med blå kanter, kurve under
   balloner, zeppelin-gondoler, fragtkasser i kranwirer, fortøjnings-
   master, luftskibe, et fyrtårn, måger og vimpler.
   ===================================================================== */
(function () {
  'use strict';

  window.SKYHOJ_THEMES.harbor = {
    top: '#2f7fe0', horizon: '#bfe4ff', bottom: '#e6d4b8', sunElev: 48, sunAz: 25, sunColor: '#fff6e4', sunInt: 3.3,
    hemiSky: '#cfe6ff', hemiInt: 1.0, fog: '#cde6fa', fogNear: 120, fogFar: 760, cloud: '#ffffff', clouds: 1, stars: 0,
    stone: '#e8e0d4', exposure: 1.0, lavaGlow: 0.75,
  };

  window.SKYHOJ_KITS.harbor = {
    id: 'harbor',
    name: 'Luftskibshavnen',
    variants: {
      pier: 'Hvid mole: lyse planker, blå kant og pæle ned i skyerne (standard for p). Kasse w 3-10, d 3-20',
      basket: 'Flettet ballonkurv med en ballon højt over (standard for bevægelige op/ned). Kasse/cyl w 2.5-4',
      gondola: 'Zeppelin-gondol: hvidt dæk med messinglister og en luftskibsballon over (standard for bevægelige sidelæns). Kasse w 3-6',
      crate: 'Fragtkasse af træ med jernbeslag og krankrog (standard for swing). Kasse w 2-4',
      mast: 'Fortøjningsmast: rund rødhvid top på en gittermast (standard for rot/cyl). shape:"cyl" w 3-6',
      lighthouse: 'Fyrtårnets top: rødhvid ring med lanterne (standard for finish). w 6-12',
      dock: 'Havnekaj med bolsjestribede fortøjningspullerter (standard for start). w 8-12',
    },
    barVariants: 'Stænger er messing-fortøjningsrør (bevægelige stænger har et lille luftskib over sig). Svævebaner er fragtkabler med en blok. Krogpunkter er messingringe på bøjer.',
    create(ctx) {
      const { THREE } = ctx;
      const L = window.SKYHOJ_KITLIB(ctx);
      const PI = Math.PI, TAU = L.TAU, tr = L.tr;
      const rng = ctx.mulberry32(500 + ctx.levelIndex);
      const anim = { flags: [], blimps: [], gulls: null };

      const deck = L.tex(256, (g, S) => {
        for (let x = 0; x < S; x += 28) { g.fillStyle = ['#efe6d6', '#e6dccb', '#f4ede0'][(x / 28) % 3]; g.fillRect(x, 0, 28, S); g.fillStyle = '#b8ac98'; g.fillRect(x, 0, 2, S); }
        g.fillStyle = '#8a7a66'; for (let y = 16; y < S; y += 64) for (let x = 12; x < S; x += 28) g.fillRect(x, y, 3, 3);
      });
      const blueSide = L.tex(128, (g, S) => { L.fill(g, S, S, '#f2f0ea'); g.fillStyle = '#2a6ac8'; g.fillRect(0, 0, S, 26); g.fillStyle = '#1c4a90'; g.fillRect(0, 26, S, 4); });
      const wicker = L.tex(128, (g, S) => {
        L.fill(g, S, S, '#b8864a');
        for (let y = 0; y < S; y += 8) for (let x = (y / 8) % 2 ? 0 : 8; x < S; x += 16) { g.fillStyle = '#d8a866'; g.fillRect(x, y, 12, 6); g.fillStyle = '#8a5a2a'; g.fillRect(x, y + 6, 12, 2); }
      });
      const crateTex = L.tex(128, (g, S) => {
        L.fill(g, S, S, '#a8784a'); g.fillStyle = '#8a5a30';
        for (let y = 0; y < S; y += 21) g.fillRect(0, y, S, 2);
        g.strokeStyle = '#6a4424'; g.lineWidth = 10; g.strokeRect(4, 4, S - 8, S - 8);
        g.beginPath(); g.moveTo(8, 8); g.lineTo(S - 8, S - 8); g.stroke();
      });
      const stripes = L.tex(128, (g, S) => { for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#ffffff' : '#d8342a'; g.fillRect(0, i * S / 8, S, S / 8); } });
      const crack = L.tex(256, (g, S) => {
        for (let x = 0; x < S; x += 28) { g.fillStyle = ['#c8b8a0', '#bcaa90'][(x / 28) % 2]; g.fillRect(x, 0, 28, S); }
        L.cracks(g, S, S, '#5a4a38', 14, rng, 3);
      });
      const M = {
        deck: L.std({ map: deck, roughness: 0.7 }),
        side: L.std({ map: blueSide, roughness: 0.6 }),
        white: L.std({ color: '#f4f2ee', roughness: 0.5 }),
        wicker: L.std({ map: wicker, bumpMap: wicker, bumpScale: 1.5, roughness: 0.85 }),
        crate: L.std({ map: crateTex, roughness: 0.8 }),
        stripes: L.std({ map: stripes, roughness: 0.5 }),
        brass: L.std({ color: '#d8a845', roughness: 0.25, metalness: 0.9 }),
        iron: L.std({ color: '#4a4e58', roughness: 0.45, metalness: 0.8 }),
        rope: L.std({ color: '#c8a46a', roughness: 0.85 }),
        canvas: L.std({ color: '#f2ece0', roughness: 0.75 }),
        red: L.std({ color: '#d8342a', roughness: 0.5 }),
        blue: L.std({ color: '#2a6ac8', roughness: 0.5 }),
        cracked: L.std({ map: crack, roughness: 0.85 }),
        lamp: L.std({ color: '#fff4c8', emissive: '#ffe08a', emissiveIntensity: 2 }),
        balloon: [L.std({ color: '#ffcc33', roughness: 0.6 }), L.std({ color: '#ff6a4a', roughness: 0.6 }), L.std({ color: '#4ac0ff', roughness: 0.6 }), L.std({ color: '#7ad06a', roughness: 0.6 })],
        bounce: L.std({ color: '#ff8a3a', roughness: 0.5, emissive: '#ff5a10', emissiveIntensity: 0.15 }),
      };
      const variantOf = (p) => p.v || (p.type === 'start' ? 'dock' : p.type === 'finish' ? 'lighthouse' : p.type === 'crumble' ? 'old'
        : p.swing ? 'crate' : p.type === 'rot' || p.type === 'spin' ? 'mast' : p.move ? (p.move.axis[1] > 0.9 ? 'basket' : 'gondola') : 'pier');

      // En lille zeppeliner (brugt over gondoler, bevægelige stænger og i kulissen)
      const blimp = (len, mat) => {
        const g = new THREE.Group();
        const body = new THREE.Mesh(tr(new THREE.SphereGeometry(1, 24, 14)), mat);
        body.scale.set(len * 0.5, len * 0.16, len * 0.16); g.add(body);
        for (let k = 0; k < 4; k++) {
          const fin = new THREE.Mesh(tr(new THREE.BoxGeometry(len * 0.12, len * 0.14, 0.08)), M.red);
          fin.position.x = -len * 0.42; fin.rotation.x = k * PI / 2; fin.translateY(len * 0.1); g.add(fin);
        }
        return g;
      };

      return {
        ventColor: '#ffffff',
        platform(p) {
          const g = new THREE.Group();
          const v = variantOf(p), minD = Math.min(p.w, p.d);
          if (v === 'basket') {
            g.add(L.block(p, { top: M.wicker, side: M.wicker }, 1.5));
            const bal = new THREE.Mesh(tr(new THREE.SphereGeometry(minD * 0.9, 20, 14)), M.balloon[p.index % 4]);
            bal.position.y = p.h / 2 + 3.2 + minD * 0.9; bal.scale.y = 1.2; bal.userData.noCastShadow = true;
            g.add(bal);
            for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { // reb op til ballonen (ved hjørnerne, uden for gangarealet)
              const r = L.tube([new THREE.Vector3(sx * p.w * 0.48, p.h / 2, sz * (p.shape === 'cyl' ? p.w : p.d) * 0.48), new THREE.Vector3(sx * minD * 0.4, p.h / 2 + 3.4, sz * minD * 0.4)], 0.02, M.rope, 2);
              g.add(r);
            }
          } else if (v === 'gondola') {
            g.add(L.block(p, { top: M.deck, side: M.white }, 2));
            const z = blimp(Math.max(p.w, p.d) * 2.2, M.canvas);
            z.position.y = p.h / 2 + 5 + p.w * 0.35; z.rotation.y = PI / 2;
            g.add(z);
            const keel = L.under(p, M.brass, 0.8, { tip: 0.6 }); if (keel) g.add(keel);
          } else if (v === 'crate') {
            g.add(L.block(p, { top: M.crate, side: M.crate }, minD, { tileTop: false }));
            const hook = new THREE.Mesh(tr(new THREE.TorusGeometry(0.25, 0.06, 8, 16, PI * 1.4)), M.iron);
            hook.position.y = -p.h / 2 - 0.3; g.add(hook);
          } else if (v === 'mast') {
            g.add(L.block(p, { top: M.deck, side: M.stripes }, 2, { sideTile: p.h }));
            const lat = L.pillar(p, M.iron, 18, p.w * 0.38, 2); if (lat) g.add(lat);
          } else if (v === 'lighthouse') {
            g.add(L.block(p, { top: M.deck, side: M.stripes }, 3, { sideTile: p.h }));
            const tower = L.pillar(p, M.stripes, 30, minD * 0.15, 6); if (tower) g.add(tower);
          } else if (v === 'old') { // smuldrende: gamle, revnede planker
            g.add(L.block(p, { top: M.cracked, side: M.cracked }, 2));
          } else if (p.type === 'bounce') {
            g.add(L.block(p, { top: M.bounce, side: M.blue }, 2));
          } else { // mole/kaj
            g.add(L.block(p, { top: M.deck, side: M.side }, 2, { sideTile: Math.max(1, p.h) }));
            const dep = L.depth(p, 14);
            if (dep > 1) { // pæle ned i skyerne
              const legs = [];
              const nx = Math.max(2, Math.round(p.w / 3)), nz = Math.max(2, Math.round((p.shape === 'cyl' ? p.w : p.d) / 3));
              for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) {
                const x = (i / (nx - 1) - 0.5) * p.w * 0.85, z = (k / (nz - 1) - 0.5) * (p.shape === 'cyl' ? p.w : p.d) * 0.85;
                if (p.shape === 'cyl' && Math.hypot(x, z) > p.w * 0.45) continue;
                legs.push({ x, y: -p.h / 2 - dep / 2, z, sx: 1, sy: dep, sz: 1 });
              }
              g.add(L.instanced(new THREE.CylinderGeometry(0.16, 0.16, 1, 8), M.white, legs, true));
            }
          }
          if (p.type === 'conveyor') g.children[0].material = [M.side, M.side, L.std({ map: L.beltTex('#3a3e46', '#4a4e58', '#ffcc33'), roughness: 0.8 }), M.side, M.side, M.side];
          if (p.type === 'vent') g.children[0].material = [M.side, M.side, L.std({ map: L.grateTex('#2a2e36', '#c8ccd8'), roughness: 0.5, metalness: 0.6 }), M.side, M.side, M.side];
          return g;
        },
        bar(b) {
          const g = new THREE.Group();
          g.add(L.barMesh(b, M.brass));
          if (b.move) { const z = blimp(Math.max(6, b.len * 1.6), M.canvas); z.position.y = 3.2; g.add(z); }
          return g;
        },
        anchor() {
          const g = new THREE.Group();
          const buoy = new THREE.Mesh(tr(new THREE.SphereGeometry(0.3, 16, 12)), M.red);
          const band = new THREE.Mesh(tr(new THREE.TorusGeometry(0.3, 0.06, 8, 20)), M.white);
          band.rotation.x = PI / 2;
          g.add(buoy, band);
          return g;
        },
        zip(z) {
          const g = new THREE.Group();
          const a = new THREE.Vector3(z.ax, z.ay, z.az), b = new THREE.Vector3(z.bx, z.by, z.bz);
          g.add(L.tube([a, b], 0.04, M.iron, 8));
          for (const p of [a, b]) {
            const post = new THREE.Mesh(tr(new THREE.CylinderGeometry(0.15, 0.2, 4.4, 8)), M.stripes);
            post.position.set(p.x, p.y - 1.9, p.z); g.add(post);
          }
          return g;
        },
        decor(data) {
          const root = new THREE.Group();
          const b = data.bounds, R0 = b.radius + 50;
          const cols = [M.canvas, M.balloon[0], M.balloon[2], M.red];
          L.place(data, rng, 12, R0, R0 + 260, b.minY, b.maxY + 40, 25, (x, y, z, a, i) => { // luftskibe i trafik
            const len = 30 + rng() * 50, s = blimp(len, cols[i % cols.length]);
            s.position.set(x, y, z); s.rotation.y = rng() * TAU;
            root.add(s); anim.blimps.push({ m: s, sp: 2 + rng() * 3, a });
          });
          L.place(data, rng, 18, R0, R0 + 200, b.minY - 10, b.maxY + 20, 15, (x, y, z, a, i) => { // varmluftballoner
            const bal = new THREE.Mesh(tr(new THREE.SphereGeometry(4 + rng() * 3, 16, 12)), M.balloon[i % 4]);
            bal.position.set(x, y, z); bal.scale.y = 1.25;
            const bk = new THREE.Mesh(tr(new THREE.BoxGeometry(2, 1.6, 2)), M.wicker); bk.position.y = -7.5;
            bal.add(bk); root.add(bal);
          });
          // Fyrtårnet og havnebygninger på en stor ø bag målet
          const fin = data.plats[data.plats.length - 1];
          const dir = Math.atan2(fin.z - b.cz, fin.x - b.cx);
          const ix = b.cx + Math.cos(dir) * (R0 + 120), iz = b.cz + Math.sin(dir) * (R0 + 120);
          const isle = L.lathe([[0.01, -60], [40, -20], [60, 0], [62, 2], [0.01, 2]], L.std({ color: '#7aa860', roughness: 0.95 }), 32);
          isle.position.set(ix, b.minY - 12, iz); root.add(isle);
          const lh = L.lathe([[6, 0], [4.5, 40], [5.5, 41], [5.5, 44], [3.5, 44]], M.stripes, 24);
          lh.position.set(ix, b.minY - 10, iz); root.add(lh);
          const lamp = new THREE.Mesh(tr(new THREE.SphereGeometry(3.2, 16, 12)), M.lamp); lamp.position.set(ix, b.minY + 37, iz); root.add(lamp);
          for (let i = 0; i < 6; i++) {
            const h = new THREE.Mesh(tr(new THREE.BoxGeometry(10, 8 + rng() * 6, 8)), i % 2 ? M.white : M.balloon[i % 4]);
            h.position.set(ix + Math.cos(i) * 30, b.minY - 6, iz + Math.sin(i) * 30); root.add(h);
          }
          // Måger
          const pos = [];
          for (let i = 0; i < 60; i++) pos.push(b.cx + (rng() - 0.5) * b.radius * 2, b.maxY + 10 + rng() * 30, b.cz + (rng() - 0.5) * b.radius * 2);
          anim.gulls = L.points(pos, '#ffffff', 4, 1);
          root.add(anim.gulls);
          return root;
        },
        update(dt, t) {
          for (const s of anim.blimps) { s.m.position.x += Math.cos(s.a + PI / 2) * s.sp * dt; s.m.position.z += Math.sin(s.a + PI / 2) * s.sp * dt; s.m.rotation.y = -(s.a + PI / 2); }
          if (anim.gulls) { anim.gulls.rotation.y = t * 0.02; anim.gulls.position.y = Math.sin(t * 0.5) * 2; }
        },
      };
    },
  };
})();

// ---------------------------------------------------------------- skatemesa
/* =====================================================================
   VERDENSSÆT 'skatemesa' – Solbanen (bane 6, skateboardbanen)
   En motorvej i himlen hen over ørkenens mesaer: glatte betondæk med
   malede striber og kantsten, krydsfinér-kickers, gelændere og autoværn
   til grinds, lysende boostpuder med chevroner, kaktusser, klippebuer,
   graffiti, en campingvogn, et neonskilt og en enorm lav sol.
   ===================================================================== */
(function () {
  'use strict';

  window.SKYHOJ_THEMES.skatemesa = {
    top: '#3a6ac0', horizon: '#ffc890', bottom: '#e09060', sunElev: 9, sunAz: 0, sunColor: '#ffc078', sunInt: 3.2,
    hemiSky: '#ffd8b0', hemiInt: 0.95, fog: '#f0b888', fogNear: 120, fogFar: 820, cloud: '#ffe0c8', clouds: 0.45, stars: 0,
    stone: '#e0b890', exposure: 1.05, lavaGlow: 0.95,
  };

  window.SKYHOJ_KITS.skatemesa = {
    id: 'skatemesa',
    name: 'Solbanen',
    variants: {
      road: 'Betonvej med gul midterstribe og hvide kanter på en sandstensmesa (standard for p). Kasse w 5-12, d 6-40',
      plaza: 'Skateplaza af glat beton med graffiti-felter (standard for start/finish). w 8-16',
      bowl: 'Betonbowl-kant: lyseblå malet beton med metalkant (coping). Kasse/cyl w 6-14',
      stairs: 'Trappesæt-top: beton med trinkanter malet gule. Kasse w 4-8',
      mesa: 'Rå sandstenstop med lag (brug sparsomt mellem vejstykker). Kasse/cyl w 4-12',
    },
    barVariants: 'Rails (type rail) er stålrør på stolper (gelænder) eller autoværn; kickers (ramp) er krydsfinér med metalkant; boost-puder har lysende chevroner.',
    create(ctx) {
      const { THREE } = ctx;
      const L = window.SKYHOJ_KITLIB(ctx);
      const PI = Math.PI, TAU = L.TAU, tr = L.tr;
      const rng = ctx.mulberry32(600 + ctx.levelIndex);
      const anim = { boosts: [], signs: [] };

      const concrete = L.tex(256, (g, S) => { L.fill(g, S, S, '#c8c2b8'); L.speckle(g, S, S, ['#b8b2a8', '#d8d2c8', '#a8a298'], 1400, 1, 2, rng); g.strokeStyle = 'rgba(90,80,70,0.35)'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, S - 1); g.lineTo(S, S - 1); g.stroke(); });
      const road = L.tex(256, (g, S) => {
        L.fill(g, S, S, '#4a4a50'); L.speckle(g, S, S, ['#5a5a60', '#3a3a40', '#6a6a70'], 1800, 1, 2, rng);
        g.fillStyle = '#ffd23a'; g.fillRect(S / 2 - 6, 0, 12, S * 0.55);
        g.fillStyle = '#f4f4f0'; g.fillRect(10, 0, 8, S); g.fillRect(S - 18, 0, 8, S);
      }, { repeat: true });
      const sandstone = L.tex(256, (g, S) => {
        for (let y = 0; y < S; y += 6 + Math.floor(rng() * 10)) { g.fillStyle = ['#c8683a', '#d87a48', '#b85a30', '#e08a58', '#a84a28'][Math.floor(rng() * 5)]; g.fillRect(0, y, S, 16); }
        L.speckle(g, S, S, ['#f0a070', '#8a3a20'], 500, 1, 3, rng);
      });
      const plywood = L.tex(256, (g, S) => {
        L.fill(g, S, S, '#d8b078'); g.globalAlpha = 0.35;
        for (let i = 0; i < 40; i++) { g.strokeStyle = '#a87a48'; g.lineWidth = 2; g.beginPath(); g.ellipse(rng() * S, rng() * S, 40 + rng() * 60, 6 + rng() * 10, 0, 0, TAU); g.stroke(); }
        g.globalAlpha = 1; g.fillStyle = '#6a5040'; for (let y = 0; y < S; y += 128) g.fillRect(0, y, S, 3);
      });
      const chevron = L.tex(256, (g, S) => {
        L.fill(g, S, S, '#1a1a24');
        g.fillStyle = '#3affea';
        for (const y0 of [20, 100, 180]) { g.beginPath(); g.moveTo(S / 2, y0); g.lineTo(S * 0.9, y0 + 50); g.lineTo(S * 0.7, y0 + 50); g.lineTo(S / 2, y0 + 22); g.lineTo(S * 0.3, y0 + 50); g.lineTo(S * 0.1, y0 + 50); g.closePath(); g.fill(); }
      });
      const graffiti = L.tex(512, (g, S) => {
        L.fill(g, S, S, '#c8c2b8'); L.speckle(g, S, S, ['#b8b2a8', '#d8d2c8'], 2000, 1, 2, rng);
        const cols = ['#ff3a8a', '#3ac8ff', '#ffd23a', '#7a3aff', '#3aff8a'];
        for (let i = 0; i < 6; i++) { g.fillStyle = cols[i % 5]; g.globalAlpha = 0.85; g.font = `bold ${60 + rng() * 60}px sans-serif`; g.save(); g.translate(rng() * S * 0.7, 80 + rng() * S * 0.8); g.rotate((rng() - 0.5) * 0.6); g.fillText(['RUL!', 'SOL', 'OLLIE', 'GRIND', 'SKYHØJ', 'KICK'][i], 0, 0); g.restore(); }
        g.globalAlpha = 1;
      });
      const bowlTex = L.tex(256, (g, S) => { L.fill(g, S, S, '#8ac8e8'); L.speckle(g, S, S, ['#7ab8d8', '#9ad8f8'], 900, 1, 2, rng); });
      const stairsTex = L.tex(256, (g, S) => { L.fill(g, S, S, '#c8c2b8'); g.fillStyle = '#ffd23a'; for (let y = 0; y < S; y += 64) g.fillRect(0, y, S, 10); });
      const M = {
        road: L.std({ map: road, roughness: 0.75 }),
        concrete: L.std({ map: concrete, roughness: 0.8 }),
        graffiti: L.std({ map: graffiti, roughness: 0.8 }),
        sandstone: L.std({ map: sandstone, bumpMap: sandstone, bumpScale: 1.5, roughness: 0.95 }),
        plywood: L.std({ map: plywood, roughness: 0.7 }),
        chevron: L.std({ map: chevron, roughness: 0.4, emissive: '#3affea', emissiveMap: chevron, emissiveIntensity: 1.6 }),
        bowl: L.std({ map: bowlTex, roughness: 0.6 }),
        stairs: L.std({ map: stairsTex, roughness: 0.8 }),
        steel: L.std({ color: '#c8ccd4', roughness: 0.2, metalness: 1 }),
        rail: L.std({ color: '#d8dce4', roughness: 0.15, metalness: 1 }),
        guard: L.std({ color: '#a8acb4', roughness: 0.35, metalness: 0.9 }),
        cactus: L.std({ color: '#4a8a3a', roughness: 0.8 }),
        van: L.std({ color: '#e8e0c8', roughness: 0.5 }),
        vanStripe: L.std({ color: '#e86a3a', roughness: 0.5 }),
        neon: L.std({ color: '#ff3a8a', emissive: '#ff3a8a', emissiveIntensity: 2.6 }),
        sun: tr(new THREE.MeshBasicMaterial({ color: '#ffd890', fog: false, transparent: true, opacity: 0.95 })),
        crack: L.std({ map: L.tex(256, (g, S) => { L.fill(g, S, S, '#b8b2a8'); L.cracks(g, S, S, '#4a4440', 18, rng, 3); }), roughness: 0.85 }),
      };
      const variantOf = (p) => p.v || (p.type === 'start' || p.type === 'finish' ? 'plaza' : p.type === 'crumble' ? 'crack' : 'road');

      return {
        ventColor: '#ffffff',
        platform(p) {
          const g = new THREE.Group();
          const v = variantOf(p), minD = Math.min(p.w, p.d);
          if (p.type === 'ramp') { // krydsfinér-kicker med metalkant og stivere under
            g.add(L.block(p, { top: M.plywood, side: M.plywood }, 2));
            const lip = new THREE.Mesh(tr(new THREE.CylinderGeometry(0.06, 0.06, p.w, 8).rotateZ(PI / 2)), M.steel);
            lip.position.set(0, p.h / 2, -p.slopeLen / 2); g.add(lip);
            return g;
          }
          if (p.type === 'rail') { // gelænder på stolper
            g.add(L.block(p, { top: M.rail, side: M.rail }, 1));
            const n = Math.max(2, Math.round(p.d / 3));
            for (let i = 0; i <= n; i++) {
              const post = new THREE.Mesh(tr(new THREE.CylinderGeometry(0.04, 0.05, 1.4, 8)), M.guard);
              post.position.set(0, -0.75, -p.d / 2 + i * p.d / n); g.add(post);
            }
            return g;
          }
          if (p.type === 'boost') {
            g.add(L.block(p, { top: M.chevron, side: M.steel }, p.w, { tileTop: false }));
            anim.boosts.push(g);
            const u = L.pillar(p, M.sandstone, 20, 0.1, 4); if (u) g.add(u);
            return g;
          }
          const top = v === 'plaza' ? M.graffiti : v === 'bowl' ? M.bowl : v === 'stairs' ? M.stairs : v === 'mesa' ? M.sandstone : v === 'crack' ? M.crack : M.road;
          const tile = v === 'road' ? p.w : v === 'plaza' ? 8 : 3;
          g.add(L.block(p, { top, side: M.concrete }, tile, { sideTile: Math.max(1, p.h) }));
          if (v === 'bowl') { const cop = new THREE.Mesh(tr(p.shape === 'cyl' ? new THREE.TorusGeometry(p.w / 2, 0.07, 6, 32).rotateX(PI / 2) : new THREE.BoxGeometry(p.w + 0.1, 0.12, p.d + 0.1)), M.steel); cop.position.y = p.h / 2 - 0.1; g.add(cop); }
          // sandstensmesa under vejen (lagdelt klippe)
          const mesa = L.pillar(p, M.sandstone, 60, 0, 6);
          if (mesa) g.add(mesa);
          return g;
        },
        bar(b) { return L.barMesh(b, M.rail); },
        decor(data) {
          const root = new THREE.Group();
          const b = data.bounds, R0 = b.radius * 0.2 + 30;
          // Den enorme lave sol ret frem
          const sun = new THREE.Mesh(tr(new THREE.CircleGeometry(160, 48)), M.sun);
          const last = data.plats[data.plats.length - 1], first = data.plats[0];
          const dx = last.x - first.x, dz = last.z - first.z, dl = Math.hypot(dx, dz) || 1;
          sun.position.set(last.x + dx / dl * 1500, b.maxY + 60, last.z + dz / dl * 1500);
          sun.lookAt(first.x, b.maxY, first.z); root.add(sun);
          // Mesaer, klippesøjler og buer langs ruten
          const buttes = [];
          L.place(data, rng, 70, R0, b.radius + 320, ctx.lavaY, ctx.lavaY, 18, (x, y, z) => {
            // nær banen holdes toppen under vejen (så den ikke spærrer for udsigten); langt væk må de rage op
            const far = ctx.clearOfCourse(x, b.maxY, z, 70);
            const r = 10 + rng() * 30;
            const top = far ? b.maxY - 10 + rng() * 60 : b.minY - 6 - rng() * 20;
            const h = top - ctx.lavaY;
            buttes.push({ x, y: y + h / 2, z, sx: r, sy: h, sz: r * (0.6 + rng() * 0.8), ry: rng() * TAU });
          });
          root.add(L.instanced(new THREE.CylinderGeometry(0.85, 1, 1, 7), M.sandstone, buttes));
          L.place(data, rng, 5, R0 + 60, b.radius + 260, b.minY - 20, b.minY - 20, 30, (x, y, z, a) => {
            const arch = new THREE.Mesh(tr(new THREE.TorusGeometry(30, 7, 8, 24, PI)), M.sandstone);
            arch.position.set(x, y, z); arch.rotation.y = a; root.add(arch);
          });
          // Kaktusser og en campingvogn på mesatoppe ved siden af vejen
          const cact = [];
          L.place(data, rng, 60, 8, b.radius + 80, b.minY - 2, b.maxY, 6, (x, y, z) => cact.push({ x, y, z, sx: 0.5, sy: 3 + rng() * 3, sz: 0.5 }));
          root.add(L.instanced(new THREE.CylinderGeometry(1, 1, 1, 8), M.cactus, cact));
          L.place(data, rng, 1, 30, b.radius, b.minY, b.minY + 10, 12, (x, y, z) => {
            const van = new THREE.Group(); van.position.set(x, y, z);
            const body = new THREE.Mesh(tr(new THREE.BoxGeometry(3, 2.6, 6.5)), M.van); body.position.y = 1.6; van.add(body);
            const stripe = new THREE.Mesh(tr(new THREE.BoxGeometry(3.05, 0.4, 6.55)), M.vanStripe); stripe.position.y = 1.4; van.add(stripe);
            root.add(van);
          });
          // Neonskiltet "RUL!" på en mast
          L.place(data, rng, 2, 20, b.radius, b.maxY - 5, b.maxY + 5, 10, (x, y, z) => {
            const sign = new THREE.Group(); sign.position.set(x, y, z); sign.lookAt(b.cx, y, b.cz);
            const pole = new THREE.Mesh(tr(new THREE.CylinderGeometry(0.3, 0.3, 30, 8)), M.guard); pole.position.y = -15; sign.add(pole);
            const tex = L.tex(256, (g, S) => { L.fill(g, S, S, '#140a20'); g.fillStyle = '#ff3a8a'; g.font = 'bold 110px sans-serif'; g.fillText('RUL!', 12, 165); }, { repeat: false, h: 256 });
            const board = new THREE.Mesh(tr(new THREE.PlaneGeometry(10, 10)), L.std({ map: tex, emissive: '#ff3a8a', emissiveMap: tex, emissiveIntensity: 2 }));
            board.position.y = 4; sign.add(board); root.add(sign); anim.signs.push(board);
          });
          return root;
        },
        update(dt, t) {
          M.chevron.map.offset.y = -(t * 1.6) % 1;
          for (const s of anim.signs) s.material.emissiveIntensity = Math.sin(t * 7) > -0.7 ? 2 : 0.4;
        },
      };
    },
  };
})();

// ---------------------------------------------------------------- clockwork
/* =====================================================================
   VERDENSSÆT 'clockwork' – Tandhjulsfabrikken (bane 7)
   En kæmpe svævende urværksfabrik i sepiafarvet smog: nittede messing- og
   kobberplader, sorte jernbjælker, tandhjul som drejeskiver, stempler,
   transportbånd med kædetræk, rustne riste, kranarme og dampventiler.
   Bagved tårner et uhret op med blottede tandhjul og en lysende skive.
   ===================================================================== */
(function () {
  'use strict';

  // Sepia-smog: brun top, ravgul horisont, bleg appelsinsol bag røgen, tæt tåge
  window.SKYHOJ_THEMES.clockwork = {
    top: '#6b5a45', horizon: '#c9944f', bottom: '#8f6a3e', sunElev: 14, sunAz: -35, sunColor: '#ffbf80', sunInt: 2.5,
    hemiSky: '#ecd2a6', hemiInt: 1.05, fog: '#a98258', fogNear: 34, fogFar: 430, cloud: '#b08a5e', clouds: 0.9, stars: 0,
    stone: '#b89a6e', exposure: 1.14, lavaGlow: 1.25,
  };

  window.SKYHOJ_KITS.clockwork = {
    id: 'clockwork',
    name: 'Tandhjulsfabrikken',
    variants: {
      plate: 'Nittet messingplade (standard for p/start). Kasse w 2-8, d 2-12, cyl w 3-8. Stålfod og rør under',
      girder: 'Sort jernbjælke med gult/sort sikkerhedsbort. Lange kasser: w 1.5-3, d 5-14',
      crate: 'Trækasse med jernbånd (cyl = tønde med jernringe). Kasse w 2.5-5, d 2.5-5, cyl w 2.5-4',
      boiler: 'Kobberkedel med nittebånd og dæksel, på ben. cyl w 3-8 (kasse w 3-6 også fint)',
      furnace: 'Ovn: sort jern med glødende sprækker og ovnmund på siden. Kasse eller cyl w 3-8',
      catwalk: 'Jerngangbro i ternet tråd-plade, lyse kanter. Kasse w 1.5-3, d 4-14',
      gear: 'Fast tandhjul (drejer ikke) med tænder og eger. KUN shape:"cyl" w 4-10',
      piston: 'Messing-stempelhoved på krom-stempelstang og bælg. Kasse eller cyl w 2.5-6 (også standard for lodret mv)',
    },
    barVariants: {
      pipe: 'Kobber-dampør med messingkoblinger og flanger (standard for stænger)',
      rod: 'Sort jernstang med messingmuffer',
      hook: 'Kranåg med opadbøjede kroge og sjækler (standard for trapez)',
    },
    create(ctx) {
      const { THREE } = ctx;
      const PI = Math.PI, TAU = PI * 2, clamp = ctx.clamp;
      const tr = (o) => ctx.track(o);
      const V3 = THREE.Vector3;
      const anim = { gears: [], belts: [], uniforms: [], spin: [], hands: [], cogs: [], flick: [], needles: [] };

      /* ---------- Teksturer (tegnes først, når de bruges) ---------- */
      const texCache = {};
      const canvasTex = (key, S, paint) => {
        if (texCache[key]) return texCache[key];
        const c = ctx.makeCanvas(S), g = c.getContext('2d');
        paint(g, S, ctx.mulberry32(key.length * 131 + S));
        return (texCache[key] = tr(ctx.toTexture(c)));
      };
      // Lysmodulation med sømløs støj
      const grain = (g, S, amt, cells, seed) => {
        const img = g.getImageData(0, 0, S, S), d = img.data, n = ctx.tileNoise(S, cells, 4, ctx.mulberry32(seed));
        for (let i = 0; i < S * S; i++) {
          const k = 1 + (n[i] - 0.5) * 2 * amt;
          d[i * 4] *= k; d[i * 4 + 1] *= k; d[i * 4 + 2] *= k;
        }
        g.putImageData(img, 0, 0);
      };
      const rivet = (g, x, y, rad) => {
        g.fillStyle = 'rgba(0,0,0,0.4)'; g.beginPath(); g.arc(x + 1.2, y + 1.6, rad, 0, TAU); g.fill();
        const gr = g.createRadialGradient(x - rad * 0.35, y - rad * 0.4, rad * 0.1, x, y, rad);
        gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.55, '#b9b2a4'); gr.addColorStop(1, '#6e6659');
        g.fillStyle = gr; g.beginPath(); g.arc(x, y, rad, 0, TAU); g.fill();
      };
      const blot = (g, x, y, rad, col) => {
        const gr = g.createRadialGradient(x, y, 0, x, y, rad);
        gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      };
      // Nittede plader (neutral lys: farves af materialet) – 2×2 plader på 4 m
      const paintPlate = (g, S, r) => {
        const P = S / 2;
        for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
          const x0 = i * P, y0 = j * P, k = 0.86 + r() * 0.16;
          g.fillStyle = `rgb(${232 * k | 0},${222 * k | 0},${204 * k | 0})`; g.fillRect(x0, y0, P, P);
          for (let n = 0; n < 70; n++) {
            g.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)';
            g.fillRect(x0, y0 + r() * P, P, 1 + r() * 1.5);
          }
          g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(x0 + 4, y0 + 4, P - 8, 3); g.fillRect(x0 + 4, y0 + 4, 3, P - 8);
          g.fillStyle = 'rgba(40,25,10,0.45)'; g.fillRect(x0 + 4, y0 + P - 7, P - 8, 3); g.fillRect(x0 + P - 7, y0 + 4, 3, P - 8);
          for (let n = 0; n < 8; n++) {
            const t = 24 + n * ((P - 48) / 7);
            rivet(g, x0 + t, y0 + 17, 4.2); rivet(g, x0 + t, y0 + P - 17, 4.2);
            if (n > 0 && n < 7) { rivet(g, x0 + 17, y0 + t, 4.2); rivet(g, x0 + P - 17, y0 + t, 4.2); }
          }
        }
        g.fillStyle = '#2a1d12';
        for (const o of [0, P]) { g.fillRect(o - 2, 0, 4, S); g.fillRect(0, o - 2, S, 4); }
        g.fillRect(S - 2, 0, 2, S); g.fillRect(0, S - 2, S, 2);
        for (let n = 0; n < 12; n++) blot(g, r() * S, r() * S, 30 + r() * 60, 'rgba(60,35,12,0.30)');
        for (let n = 0; n < 9; n++) { // rustnedløb
          const x = r() * S, y = r() * S * 0.5, gr = g.createLinearGradient(0, y, 0, y + 150);
          gr.addColorStop(0, 'rgba(110,60,25,0.32)'); gr.addColorStop(1, 'rgba(110,60,25,0)');
          g.fillStyle = gr; g.fillRect(x, y, 3 + r() * 5, 150);
        }
        g.strokeStyle = 'rgba(255,255,255,0.22)'; g.lineWidth = 1;
        for (let n = 0; n < 36; n++) { const x = r() * S, y = r() * S, a = r() * PI; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * 26, y + Math.sin(a) * 26); g.stroke(); }
        grain(g, S, 0.14, 6, 5);
      };
      // Én nittet sidepanel (S px = platformens tykkelse)
      const paintPanel = (g, S, r) => {
        g.fillStyle = '#d8cfbd'; g.fillRect(0, 0, S, S);
        for (let n = 0; n < 40; n++) { g.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)'; g.fillRect(0, r() * S, S, 1 + r()); }
        g.fillStyle = 'rgba(255,255,255,0.55)'; g.fillRect(0, 0, S, 7);
        g.fillStyle = 'rgba(40,25,10,0.5)'; g.fillRect(0, S - 9, S, 9);
        g.fillStyle = '#2a1d12'; g.fillRect(0, 0, 3, S); g.fillRect(S - 3, 0, 3, S);
        g.fillStyle = 'rgba(40,25,10,0.35)'; g.fillRect(0, S * 0.5 - 2, S, 3);
        for (let n = 0; n < 4; n++) { const x = 24 + n * ((S - 48) / 3); rivet(g, x, 24, 5); rivet(g, x, S - 26, 5); rivet(g, x, S * 0.5 + 22, 4); }
        for (let n = 0; n < 6; n++) blot(g, r() * S, r() * S, 30 + r() * 40, 'rgba(70,40,15,0.3)');
        grain(g, S, 0.12, 4, 9);
      };
      // Ternet jernplade (1 m)
      const paintTread = (g, S, r) => {
        g.fillStyle = '#8a8680'; g.fillRect(0, 0, S, S);
        const st = S / 8;
        for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) {
          const cx = i * st + st / 2, cy = j * st + st / 2, a = (i + j) % 2 ? PI / 4 : -PI / 4;
          g.save(); g.translate(cx, cy); g.rotate(a);
          g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(-st * 0.4 + 1.5, -st * 0.1 + 2, st * 0.8, st * 0.2);
          g.fillStyle = '#d9d4c8'; g.fillRect(-st * 0.4, -st * 0.1, st * 0.8, st * 0.2);
          g.fillStyle = 'rgba(255,255,255,0.6)'; g.fillRect(-st * 0.4, -st * 0.1, st * 0.8, 2);
          g.restore();
        }
        for (let n = 0; n < 6; n++) blot(g, r() * S, r() * S, 40 + r() * 40, 'rgba(30,20,10,0.35)');
        grain(g, S, 0.18, 5, 3);
      };
      // Rusten rist med revner og rødglødende sprækker
      const paintGrate = (g, S, r) => {
        g.fillStyle = '#120d0a'; g.fillRect(0, 0, S, S);
        const pitch = S / 12;
        for (let j = 0; j < 12; j++) for (let i = 0; i < 12; i++) {
          if (r() < 0.07) continue; // rustet hul
          const k = 0.7 + r() * 0.5;
          g.fillStyle = `rgb(${150 * k | 0},${78 * k | 0},${38 * k | 0})`;
          g.fillRect(i * pitch, j * pitch + 3, pitch, 7); g.fillRect(i * pitch + 3, j * pitch, 7, pitch);
          g.fillStyle = 'rgba(255,190,120,0.35)'; g.fillRect(i * pitch, j * pitch + 3, pitch, 2);
        }
        g.fillStyle = '#4a2a18'; g.fillRect(0, 0, S, 14); g.fillRect(0, S - 14, S, 14); g.fillRect(0, 0, 14, S); g.fillRect(S - 14, 0, 14, S);
        for (let n = 0; n < 16; n++) blot(g, r() * S, r() * S, 30 + r() * 60, 'rgba(120,50,15,0.4)');
        for (let c = 0; c < 4; c++) { // revner: mørk kerne med glødende kant
          let x = r() * S, y = r() * S, a = r() * TAU;
          const pts = [[x, y]];
          for (let s = 0; s < 9; s++) { a += (r() - 0.5) * 1.2; x += Math.cos(a) * 34; y += Math.sin(a) * 34; pts.push([x, y]); }
          for (const [wd, col] of [[11, 'rgba(255,110,30,0.55)'], [6, 'rgba(255,200,90,0.9)'], [3, '#0a0605']]) {
            g.strokeStyle = col; g.lineWidth = wd; g.lineJoin = 'round'; g.beginPath();
            pts.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py))); g.stroke();
          }
        }
        grain(g, S, 0.16, 8, 11);
      };
      // Olieglat stålplade med regnbueskær
      const paintOil = (g, S, r) => {
        const n1 = ctx.tileNoise(S, 4, 4, ctx.mulberry32(21)), n2 = ctx.tileNoise(S, 3, 3, ctx.mulberry32(22));
        const img = g.createImageData(S, S), d = img.data;
        for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
          const i = y * S + x, m = clamp((n2[i] - 0.4) * 4, 0, 1), h = n1[i] * 3.2;
          const br = 0.32 + 0.05 * Math.sin(y * 1.7 + n1[i] * 12);
          d[i * 4] = 255 * (br * 0.8 + m * 0.34 * (0.5 + 0.5 * Math.cos(TAU * h)));
          d[i * 4 + 1] = 255 * (br * 0.9 + m * 0.34 * (0.5 + 0.5 * Math.cos(TAU * (h + 0.33))));
          d[i * 4 + 2] = 255 * (br * 1.05 + m * 0.4 * (0.5 + 0.5 * Math.cos(TAU * (h + 0.67))));
          d[i * 4 + 3] = 255;
        }
        g.putImageData(img, 0, 0);
        g.fillStyle = 'rgba(255,255,255,0.12)';
        for (let n = 0; n < 8; n++) { g.beginPath(); g.ellipse(r() * S, r() * S, 20 + r() * 40, 5 + r() * 8, r() * PI, 0, TAU); g.fill(); }
      };
      const paintWood = (g, S, r) => {
        const pw = S / 8;
        for (let i = 0; i < 8; i++) {
          const k = 0.8 + r() * 0.3;
          g.fillStyle = `rgb(${214 * k | 0},${170 * k | 0},${118 * k | 0})`; g.fillRect(i * pw, 0, pw, S);
          for (let n = 0; n < 24; n++) {
            g.strokeStyle = r() < 0.5 ? 'rgba(80,45,15,0.22)' : 'rgba(255,230,190,0.12)'; g.lineWidth = 1 + r() * 1.4;
            const x = i * pw + 4 + r() * (pw - 8); g.beginPath(); g.moveTo(x, 0);
            for (let y = 0; y <= S; y += 32) g.lineTo(x + Math.sin(y * 0.02 + n) * 2.5, y); g.stroke();
          }
          if (r() < 0.6) { g.fillStyle = 'rgba(70,38,12,0.55)'; g.beginPath(); g.ellipse(i * pw + pw / 2, r() * S, 6, 11, 0, 0, TAU); g.fill(); }
          g.fillStyle = 'rgba(20,10,4,0.8)'; g.fillRect(i * pw, 0, 3, S);
          g.fillStyle = 'rgba(20,10,4,0.5)'; g.fillRect(i * pw, (i % 2) * S * 0.5 + S * 0.25 - 1, pw, 3);
        }
        grain(g, S, 0.12, 6, 13);
      };
      // Transportbånd: gummi med messingkløfter og pile. Fremad (−Z) = opad i billedet. rot: vandret bånd
      const paintBelt = (rot) => (g, S) => {
        g.save();
        if (rot) { g.translate(S, 0); g.rotate(PI / 2); }
        g.fillStyle = '#2b2622'; g.fillRect(0, 0, S, S);
        for (let y = 0; y < S; y += 8) { g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(0, y, S, 2); }
        const n = 8, st = S / n;
        for (let i = 0; i < n; i++) {
          const y = i * st;
          g.fillStyle = '#c79a4c'; g.fillRect(0, y + 2, S, st * 0.34);
          g.fillStyle = 'rgba(255,255,230,0.55)'; g.fillRect(0, y + 2, S, 3);
          g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(0, y + 2 + st * 0.34, S, 3);
          if (i % 2 === 0) { // pil, der peger i kørselsretningen
            g.fillStyle = '#e8b830'; g.beginPath();
            g.moveTo(S * 0.5, y + st * 0.55); g.lineTo(S * 0.66, y + st * 1.45); g.lineTo(S * 0.5, y + st * 1.12); g.lineTo(S * 0.34, y + st * 1.45); g.closePath(); g.fill();
          }
        }
        g.restore();
      };
      // Drivkæde (rullekæde) på bæltets side – bevæger sig vandret
      const paintChain = (g, S) => {
        g.fillStyle = '#3a2e24'; g.fillRect(0, 0, S, S);
        for (let y = 0; y < S; y += 6) { g.fillStyle = 'rgba(255,255,255,0.04)'; g.fillRect(0, y, S, 1); }
        const n = 8, st = S / n, y0 = S * 0.36, hh = S * 0.28;
        g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(0, y0 - 6, S, hh + 12);
        for (let i = 0; i < n; i++) {
          const x = i * st;
          g.fillStyle = i % 2 ? '#b9b3a6' : '#8d877b';
          g.beginPath(); g.roundRect(x + 2, y0, st * 0.62, hh, hh * 0.45); g.fill();
          g.fillStyle = 'rgba(255,255,255,0.45)'; g.fillRect(x + 6, y0 + 3, st * 0.5, 3);
          g.fillStyle = '#1b1612'; g.beginPath(); g.arc(x + 2 + st * 0.12, y0 + hh / 2, 4, 0, TAU); g.arc(x + 2 + st * 0.5, y0 + hh / 2, 4, 0, TAU); g.fill();
        }
      };
      // Urskive: messing, elfenbensskive, romertal – bruges som målplatform og som tårnets skive
      const paintDial = (g, S) => {
        const c = S / 2;
        g.fillStyle = '#b9923f'; g.fillRect(0, 0, S, S);
        for (let n = 0; n < 40; n++) { g.fillStyle = n % 2 ? 'rgba(255,240,190,0.06)' : 'rgba(60,35,5,0.07)'; g.fillRect(0, n * S / 40, S, 3); }
        for (const [x, y] of [[26, 26], [S - 26, 26], [26, S - 26], [S - 26, S - 26]]) rivet(g, x, y, 9);
        const ring = (rad, col) => { g.fillStyle = col; g.beginPath(); g.arc(c, c, rad, 0, TAU); g.fill(); };
        ring(c - 4, '#5b3d14'); ring(c - 14, '#d9b45a'); ring(c - 26, '#7a5420');
        const face = g.createRadialGradient(c, c, 20, c, c, c - 28);
        face.addColorStop(0, '#f6eed8'); face.addColorStop(1, '#dccfa8');
        g.fillStyle = face; g.beginPath(); g.arc(c, c, c - 28, 0, TAU); g.fill();
        g.strokeStyle = '#2b1d0e';
        for (let i = 0; i < 60; i++) {
          const a = (i / 60) * TAU, big = i % 5 === 0, r1 = c - 52 - (big ? 22 : 0), r2 = c - 38;
          g.lineWidth = big ? 6 : 2;
          g.beginPath(); g.moveTo(c + Math.sin(a) * r1, c - Math.cos(a) * r1); g.lineTo(c + Math.sin(a) * r2, c - Math.cos(a) * r2); g.stroke();
        }
        g.fillStyle = '#2b1d0e'; g.font = `bold ${S * 0.085}px Georgia, serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
        const rom = ['XII', 'I', 'II', 'III', 'IIII', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * TAU, rr = c - 100;
          g.save(); g.translate(c + Math.sin(a) * rr, c - Math.cos(a) * rr); g.rotate(a); g.fillText(rom[i], 0, 0); g.restore();
        }
        g.strokeStyle = 'rgba(120,80,20,0.4)'; g.lineWidth = 2;
        for (let i = 0; i < 24; i++) { const a = (i / 24) * TAU; g.beginPath(); g.moveTo(c + Math.sin(a) * 36, c - Math.cos(a) * 36); g.lineTo(c + Math.sin(a) * 74, c - Math.cos(a) * 74); g.stroke(); }
        ring(30, '#a47a2c'); ring(22, '#e3c06a'); ring(9, '#4a3210');
      };
      const paintHazard = (g, S) => {
        g.fillStyle = '#1d1a17'; g.fillRect(0, 0, S, S);
        g.fillStyle = '#e2ad1c';
        for (let i = -2; i < 6; i++) {
          g.beginPath(); g.moveTo(i * S / 2, 0); g.lineTo(i * S / 2 + S / 4, 0); g.lineTo(i * S / 2 + S / 4 - S, S); g.lineTo(i * S / 2 - S, S); g.closePath(); g.fill();
        }
      };
      const T = {
        plate: () => canvasTex('plate', 512, paintPlate),
        panel: () => canvasTex('panel', 256, paintPanel),
        tread: () => canvasTex('tread', 256, paintTread),
        grate: () => canvasTex('grate', 512, paintGrate),
        oil: () => canvasTex('oil', 512, paintOil),
        wood: () => canvasTex('wood', 512, paintWood),
        beltZ: () => canvasTex('beltZ', 256, paintBelt(false)),
        beltX: () => canvasTex('beltX', 256, paintBelt(true)),
        chain: () => canvasTex('chain', 256, paintChain),
        dial: () => canvasTex('dial', 512, paintDial),
        hazard: () => canvasTex('hazard', 128, paintHazard),
      };

      /* ---------- Materialer ---------- */
      const matCache = {};
      const std = (o) => new THREE.MeshStandardMaterial(o);
      const mat = (key) => matCache[key] || (matCache[key] = tr(MATS[key]()));
      const metalMap = (map, color, rough, metal, bump = 1.4) => std({ map: T[map](), bumpMap: T[map](), bumpScale: bump, color, roughness: rough, metalness: metal });
      const decalOpts = { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 };
      const MATS = {
        brassTop: () => metalMap('plate', '#ecc064', 0.42, 0.55),
        brassSide: () => metalMap('panel', '#d8aa52', 0.5, 0.6),
        copperTop: () => metalMap('plate', '#e69468', 0.4, 0.55),
        copperSide: () => metalMap('panel', '#c8764a', 0.45, 0.6),
        ironSide: () => metalMap('panel', '#6c6865', 0.5, 0.7),
        ironTop: () => metalMap('plate', '#8c8782', 0.5, 0.6),
        ironDark: () => metalMap('panel', '#3b3836', 0.55, 0.75),
        darkPlate: () => metalMap('plate', '#47423e', 0.5, 0.7),
        patina: () => metalMap('plate', '#8fc9ae', 0.5, 0.45),
        tread: () => metalMap('tread', '#c9c3b8', 0.5, 0.65, 2.2),
        grate: () => metalMap('grate', '#ffffff', 0.85, 0.35, 2.4),
        oilTop: () => new THREE.MeshPhysicalMaterial({ map: T.oil(), color: '#d8e4ff', roughness: 0.12, metalness: 0.55, clearcoat: 1, clearcoatRoughness: 0.05 }),
        oilSide: () => metalMap('panel', '#2e3948', 0.25, 0.85),
        wood: () => std({ map: T.wood(), bumpMap: T.wood(), bumpScale: 1.2, color: '#f0d2a4', roughness: 0.85, metalness: 0 }),
        woodDark: () => std({ map: T.wood(), color: '#a88458', roughness: 0.9, metalness: 0 }),
        dial: () => std({ map: T.dial(), roughness: 0.5, metalness: 0.35 }),
        dialGlow: () => std({ map: T.dial(), roughness: 0.6, metalness: 0.1, emissive: '#ffb050', emissiveMap: T.dial(), emissiveIntensity: 0.75 }),
        hazard: () => std({ map: T.hazard(), roughness: 0.6, metalness: 0.3, ...decalOpts }),
        decalDark: () => std({ color: '#26211e', roughness: 0.7, metalness: 0.5, ...decalOpts }),
        decalBrass: () => std({ color: '#f0c660', roughness: 0.3, metalness: 0.9, ...decalOpts }),
        decalHot: () => new THREE.MeshBasicMaterial({ color: '#ff7a22', ...decalOpts }),
        decalLamp: () => new THREE.MeshBasicMaterial({ color: '#ffd890', ...decalOpts }),
        pipe: () => std({ color: '#cf7a4a', roughness: 0.28, metalness: 0.95 }),
        brass: () => std({ color: '#e6b650', roughness: 0.3, metalness: 0.95 }),
        chrome: () => std({ color: '#d5d8dc', roughness: 0.14, metalness: 1 }),
        iron: () => std({ color: '#2f2d2c', roughness: 0.45, metalness: 0.85 }),
        rust: () => std({ color: '#7d4a2c', roughness: 0.9, metalness: 0.4 }),
        rubber: () => std({ color: '#1f1b19', roughness: 0.9, metalness: 0.1 }),
        red: () => std({ color: '#b3261e', roughness: 0.45, metalness: 0.4 }),
        lamp: () => new THREE.MeshBasicMaterial({ color: '#ffcf84' }),
        glowHot: () => new THREE.MeshBasicMaterial({ color: '#ff8424' }),
        window: () => new THREE.MeshBasicMaterial({ color: '#ffb256' }),
      };

      /* ---------- Geometri-hjælpere ---------- */
      // Samler mange små dele pr. materiale i få meshes (få draw calls)
      const mk = () => {
        const parts = new Map();
        const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new V3(), s = new V3();
        return {
          add(m, geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
            const g = geo.index ? geo.toNonIndexed() : geo.clone();
            m4.compose(v.set(x, y, z), q.setFromEuler(e.set(rx, ry, rz)), s.set(sx, sy, sz));
            g.applyMatrix4(m4);
            if (!parts.has(m)) parts.set(m, []);
            parts.get(m).push(g);
          },
          build(group, cast = true) {
            for (const [m, list] of parts) {
              let n = 0;
              for (const g of list) n += g.attributes.position.count;
              const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
              let o = 0;
              for (const g of list) {
                pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3);
                if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
                o += g.attributes.position.count;
              }
              const geo = new THREE.BufferGeometry();
              geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
              geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
              geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
              const mesh = new THREE.Mesh(tr(geo), m);
              if (!cast || m.isMeshBasicMaterial || m.userData.flat) mesh.userData.noCastShadow = true;
              group.add(mesh);
            }
            return group;
          },
        };
      };
      const scaleUV = (g, k) => { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * k, uv.getY(i) * k); return g; };
      const flatQuad = (w, d, tile = 1) => { const g = new THREE.PlaneGeometry(w, d).rotateX(-PI / 2); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / tile, uv.getY(i) * d / tile); return g; };
      const flatRing = (r0, r1, seg, tile = 1, a0 = 0, aLen = TAU) => scaleUV(new THREE.RingGeometry(r0, r1, seg, 1, a0, aLen).rotateX(-PI / 2), (2 * r1) / tile);
      // Fladt omrids (Shape) som dekal
      const flatShape = (pts) => new THREE.ShapeGeometry(new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)))).rotateX(-PI / 2);
      // Tandhjul: omrids med tænder (tip Rt, rod Rr), eger og nav. Aksen er z (før evt. rotation)
      const gearGeo = (Rt, Rr, n, depth, spokes = 0, hub = 0) => {
        const s = new THREE.Shape(), st = TAU / n, pt = (a, r) => new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r);
        const out = [];
        for (let i = 0; i < n; i++) { const c = i * st; out.push(pt(c - 0.5 * st, Rr), pt(c - 0.27 * st, Rr), pt(c - 0.15 * st, Rt), pt(c + 0.15 * st, Rt), pt(c + 0.27 * st, Rr)); }
        s.setFromPoints(out);
        for (let k = 0; k < spokes; k++) {
          const a0 = (k / spokes) * TAU + 0.12, a1 = ((k + 1) / spokes) * TAU - 0.12, ri = hub * 1.35, ro = Rr * 0.8, h = new THREE.Path(), pts = [];
          for (let i = 0; i <= 5; i++) pts.push(pt(a0 + (a1 - a0) * i / 5, ro));
          for (let i = 5; i >= 0; i--) pts.push(pt(a0 + (a1 - a0) * i / 5, ri));
          h.setFromPoints(pts); s.holes.push(h);
        }
        return new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 3 });
      };
      // Tilfældig forskydning af teksturen, så ens plader ikke ligner hinanden (kun på top og sider vandret)
      const jitterUV = (geo, r) => {
        const uv = geo.attributes.uv, nor = geo.attributes.normal, du = r(), dv = r();
        for (let i = 0; i < uv.count; i++) {
          const top = Math.abs(nor.getY(i)) > 0.5;
          uv.setXY(i, uv.getX(i) + du, uv.getY(i) + (top ? dv : 0));
        }
      };

      /* ---------- Platformens dele ---------- */
      const upMover = (p) => !!(p.move && p.move.axis[1] > 0.9);
      const VAR = { plate: 1, girder: 1, crate: 1, boiler: 1, furnace: 1, catwalk: 1, gear: 1, piston: 1 };
      const lookOf = (p) => {
        const free = p.type === 'p' || p.type === 'start' || p.type === 'finish';
        if (free && p.v && VAR[p.v]) return p.v === 'gear' && p.shape !== 'cyl' ? 'plate' : p.v;
        if (free) return p.type === 'finish' ? 'dial' : upMover(p) ? 'piston' : 'plate';
        if (p.type === 'move') return upMover(p) ? 'piston' : 'trolley';
        return { ice: 'oil', crumble: 'rust', swing: 'hung', bounce: 'spring', spin: 'turn', conveyor: 'belt', rot: 'cog', vent: 'vent', ramp: 'ramp', rail: 'rail', boost: 'boost' }[p.type] || 'plate';
      };
      const beltMats = {}; // pr. signeret fart: delte teksturer, der rulles i update
      const beltSet = (p) => {
        const ax = p.beltAx === 'x' ? 'X' : 'Z', key = ax + p.belt;
        if (beltMats[key]) return beltMats[key];
        const sg = p.belt < 0 ? -1 : 1, tile = 2;
        const mine = (src, sx, sy, sideTile) => {
          const t = src.clone(); t.needsUpdate = true; t.repeat.set(sx, sy); tr(t);
          return t;
        };
        const topT = mine(T['belt' + ax](), ax === 'X' ? sg : 1, ax === 'Z' ? sg : 1);
        // Kæden: på siderne, der vender langs kørselsretningen (±X for Z-bånd, ±Z for X-bånd)
        const chR = mine(T.chain(), sg, 1), chL = mine(T.chain(), -sg, 1);
        const mm = (t) => tr(std({ map: t, bumpMap: t, bumpScale: 1.6, roughness: 0.5, metalness: 0.7 }));
        const set = {
          top: tr(std({ map: topT, bumpMap: topT, bumpScale: 1.8, roughness: 0.6, metalness: 0.3 })),
          chainR: mm(chR), chainL: mm(chL), tile, ax,
        };
        anim.belts.push({ top: topT, chains: [chR, chL], v: Math.abs(p.belt), tile, ax, sideTile: 1 });
        return (beltMats[key] = set);
      };

      // Fyld-dekaler: mørke tandhuller, eger og nav oven på et drejeligt tandhjul
      const cogDecals = (B, R, n, tooth, top) => {
        const st = TAU / n;
        for (let i = 0; i < n; i++) {
          const c = i * st + st / 2;
          B.add(mat('decalDark'), flatRing(R - tooth - 0.02, R + 0.005, 4, 1, c - st * 0.27, st * 0.54), 0, top + 0.012, 0);
        }
        B.add(mat('decalDark'), flatRing(R - tooth - 0.1, R - tooth - 0.02, 64), 0, top + 0.012, 0);
        const spokes = n > 14 ? 6 : 5;
        for (let k = 0; k < spokes; k++) {
          const a = (k / spokes) * TAU + st * 0.25, ri = R * 0.2, ro = R - tooth - 0.35, wd = Math.max(0.22, R * 0.07);
          const dx = Math.cos(a), dz = -Math.sin(a), nx = dz, nz = -dx;
          B.add(mat('decalDark'), flatShape([
            [dx * ri + nx * wd, -(dz * ri + nz * wd) * 0 + (-(dz * ri + nz * wd))], [dx * ro + nx * wd * 0.6, -(dz * ro + nz * wd * 0.6)],
            [dx * ro - nx * wd * 0.6, -(dz * ro - nz * wd * 0.6)], [dx * ri - nx * wd, -(dz * ri - nz * wd)],
          ]), 0, top + 0.012, 0);
        }
        B.add(mat('decalBrass'), flatRing(0.001, Math.max(0.5, R * 0.16), 40), 0, top + 0.016, 0);
        B.add(mat('decalDark'), flatRing(Math.max(0.5, R * 0.16), Math.max(0.5, R * 0.16) + 0.08, 40), 0, top + 0.016, 0);
        B.add(mat('decalDark'), flatRing(0.001, Math.max(0.18, R * 0.05), 20), 0, top + 0.02, 0);
      };

      return {
        ventColor: '#f3ead8',
        slickColor: '#7fd8ff',

        platform(p) {
          const grp = new THREE.Group(), B = mk(), look = lookOf(p), r = ctx.mulberry32(p.seed);
          const cyl = p.shape === 'cyl', R = p.w / 2, w = p.w, h = p.h, d = cyl ? p.w : p.type === 'ramp' ? p.slopeLen : p.d, top = h / 2;
          const big = p.type === 'start' || p.type === 'finish';
          const drop = ['ramp', 'rail', 'boost'].includes(p.type) ? 0 : Math.max(0, ctx.freeBelow(p) - (p.move && p.move.amp ? p.move.amp : 0));
          const minD = Math.min(w, d);
          // Hovedlegemet (det fysiske volumen)
          const body = (topM, sideM, botM, tile, sideTile, geoFix) => {
            let geo, ms;
            if (cyl) { geo = ctx.cylGeometry(R, h, tile, { segments: 48 }); ms = [sideM, topM, botM]; }
            else { geo = ctx.boxGeometry(w, h, d, tile, { sideTile }); ms = [sideM, sideM, topM, botM, sideM, sideM]; }
            if (geoFix) geoFix(geo); else jitterUV(geo, r);
            const m = new THREE.Mesh(tr(geo), ms);
            m.userData.solid = true;
            grp.add(m);
            return m;
          };
          // Nedhængende underdel: aftagende kasser/kegle + rør + lampe. Alt ligger inden for fodaftrykket
          const hopper = (depth, sideM, withPipes = true) => {
            if (depth < 0.7) return;
            const y0 = -h / 2;
            if (cyl) {
              B.add(sideM, scaleUV(new THREE.CylinderGeometry(R * 0.96, R * 0.42, depth, 28, 1, true), 1), 0, y0 - depth / 2, 0);
              B.add(mat('brass'), new THREE.TorusGeometry(R * 0.96, 0.05, 6, 40).rotateX(PI / 2), 0, y0 - 0.03, 0);
              B.add(mat('brass'), new THREE.TorusGeometry(R * 0.42, 0.05, 6, 28).rotateX(PI / 2), 0, y0 - depth, 0);
            } else {
              let sw = w, sd = d, y = y0;
              const steps = depth > 2.2 ? 3 : 2, hh = depth / steps;
              for (let i = 0; i < steps; i++) {
                sw = Math.max(0.6, sw * 0.8 - 0.1); sd = Math.max(0.6, sd * 0.8 - 0.1);
                B.add(sideM, ctx.boxGeometry(sw, hh, sd, 2, { sideTile: 2 }), 0, y - hh / 2, 0);
                B.add(mat('brass'), ctx.boxGeometry(sw + 0.04, 0.07, sd + 0.04, 1), 0, y - 0.035, 0);
                y -= hh;
              }
            }
            if (withPipes && minD > 2.6) {
              const L = depth * (0.8 + r() * 0.5), px = cyl ? R * 0.62 : w / 2 - 0.42, pz = cyl ? 0 : d / 2 - 0.42, sgn = r() < 0.5 ? -1 : 1;
              const pr = 0.11;
              B.add(mat('pipe'), new THREE.CylinderGeometry(pr, pr, L, 10), sgn * px, y0 - L / 2, cyl ? 0 : pz * sgn);
              for (let k = 0.2; k < L; k += 0.7) B.add(mat('brass'), new THREE.CylinderGeometry(pr * 1.45, pr * 1.45, 0.07, 10), sgn * px, y0 - k, cyl ? 0 : pz * sgn);
              B.add(mat('brass'), new THREE.SphereGeometry(pr * 1.3, 10, 8), sgn * px, y0 - L, cyl ? 0 : pz * sgn);
            }
            if (depth > 1.2) { // varm hængelampe i bunden
              B.add(mat('lamp'), new THREE.SphereGeometry(0.13, 10, 8), 0, y0 - depth - 0.1, 0);
              B.add(mat('iron'), new THREE.CylinderGeometry(0.05, 0.05, 0.25, 6), 0, y0 - depth + 0.04, 0);
            }
          };
          // Sikkerhedsbort rundt langs kanten (flade dekaler)
          const hazardFrame = (bw = 0.3) => {
            const y = top + 0.012;
            if (cyl) B.add(mat('hazard'), flatRing(R - bw, R - 0.01, 56, 0.5), 0, y, 0);
            else {
              B.add(mat('hazard'), flatQuad(w - 0.02, bw, 0.5), 0, y, -d / 2 + bw / 2 + 0.01);
              B.add(mat('hazard'), flatQuad(w - 0.02, bw, 0.5), 0, y, d / 2 - bw / 2 - 0.01);
              B.add(mat('hazard'), flatQuad(bw, d - 2 * bw - 0.04, 0.5), -w / 2 + bw / 2 + 0.01, y, 0);
              B.add(mat('hazard'), flatQuad(bw, d - 2 * bw - 0.04, 0.5), w / 2 - bw / 2 - 0.01, y, 0);
            }
          };
          // Stempelstang med bælg under en plade
          const pistonRod = () => {
            const L = clamp(Math.min(drop - 0.3, 6), 0, 6);
            if (L < 1) return;
            const rb = clamp(minD * 0.17, 0.22, 0.55), y0 = -h / 2;
            const prof = [];
            for (let i = 0; i <= 14; i++) prof.push(new THREE.Vector2(rb * (i % 2 ? 0.8 : 1.05), i * 0.11));
            B.add(mat('ironDark'), new THREE.LatheGeometry(prof, 20), 0, y0 - 1.54, 0);
            B.add(mat('brass'), new THREE.CylinderGeometry(rb * 1.25, rb * 1.25, 0.14, 20), 0, y0 - 0.07, 0);
            B.add(mat('chrome'), new THREE.CylinderGeometry(rb * 0.5, rb * 0.5, L - 1.4, 14), 0, y0 - 1.55 - (L - 1.4) / 2, 0);
            B.add(mat('brass'), new THREE.CylinderGeometry(rb * 0.85, rb * 0.85, 0.3, 16), 0, y0 - L - 0.05, 0);
            B.add(mat('lamp'), new THREE.SphereGeometry(0.1, 8, 6), 0, y0 - L - 0.28, 0);
          };

          switch (look) {
            case 'dial': { // målplatform: urskive
              const geo = cyl ? ctx.cylGeometry(R, h, 4, { segments: 56 }) : ctx.boxGeometry(w, h, d, 4, { sideTile: h });
              const uv = geo.attributes.uv, nor = geo.attributes.normal, pos = geo.attributes.position;
              for (let i = 0; i < uv.count; i++) if (nor.getY(i) > 0.5) uv.setXY(i, pos.getX(i) / w + 0.5, 0.5 - pos.getZ(i) / d);
              const m = new THREE.Mesh(tr(geo), cyl ? [mat('brassSide'), mat('dial'), mat('ironSide')] : [mat('brassSide'), mat('brassSide'), mat('dial'), mat('ironSide'), mat('brassSide'), mat('brassSide')]);
              m.userData.solid = true; grp.add(m);
              hopper(Math.min(drop, clamp(minD * 0.7, 2, 6)), mat('ironDark'));
              break;
            }
            case 'girder': {
              body(mat('tread'), mat('ironSide'), mat('ironDark'), 1, h);
              hazardFrame(0.24);
              const dd = Math.min(drop, 2.2);
              if (dd > 0.6) {
                B.add(mat('ironDark'), ctx.boxGeometry(w * 0.34, dd, d * 0.97, 1.5, { sideTile: 1.5 }), 0, -h / 2 - dd / 2, 0);
                B.add(mat('ironDark'), ctx.boxGeometry(w * 0.8, 0.16, d * 0.97, 1.5), 0, -h / 2 - dd + 0.08, 0);
                for (let z = -d / 2 + 1; z < d / 2 - 0.5; z += 2.2) B.add(mat('brass'), ctx.boxGeometry(w * 0.36, dd * 0.9, 0.08, 1), 0, -h / 2 - dd / 2, z);
              }
              break;
            }
            case 'catwalk': {
              body(mat('tread'), mat('ironSide'), mat('ironDark'), 1, h);
              const dd = Math.min(drop, 1.6);
              if (dd > 0.5) {
                const n = Math.max(2, Math.round(d / 2.4));
                for (let i = 0; i <= n; i++) B.add(mat('ironDark'), ctx.boxGeometry(w * 0.9, dd, 0.14, 1), 0, -h / 2 - dd / 2, -d / 2 + 0.2 + (i * (d - 0.4)) / n);
                B.add(mat('pipe'), new THREE.CylinderGeometry(0.07, 0.07, d * 0.96, 8).rotateX(PI / 2), 0, -h / 2 - dd, 0);
              }
              break;
            }
            case 'crate': {
              if (cyl) { // tønde
                const m = body(mat('wood'), mat('woodDark'), mat('woodDark'), 2, 2);
                m.geometry.attributes.uv && (m.geometry.attributes.uv.needsUpdate = true);
                for (const y of [-h / 2 + 0.1, 0, h / 2 - 0.1]) B.add(mat('iron'), new THREE.CylinderGeometry(R + 0.004, R + 0.004, 0.09, 40, 1, true), 0, y, 0);
                hopper(Math.min(drop, 1.2), mat('woodDark'), false);
              } else {
                body(mat('wood'), mat('woodDark'), mat('woodDark'), 2, 2);
                const t = 0.06;
                for (const sx of [-1, 1]) for (const z of [-d * 0.36, d * 0.36]) B.add(mat('iron'), ctx.boxGeometry(0.02, h, 0.22, 1), sx * (w / 2 + 0.004), 0, z);
                for (const sz of [-1, 1]) for (const x of [-w * 0.36, w * 0.36]) B.add(mat('iron'), ctx.boxGeometry(0.22, h, 0.02, 1), x, 0, sz * (d / 2 + 0.004));
                for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.add(mat('iron'), flatQuad(0.5, 0.5, 1), sx * (w / 2 - 0.26), top + 0.012, sz * (d / 2 - 0.26));
                B.add(mat('iron'), flatQuad(w - 0.04, 0.2, 1), 0, top + 0.012, 0);
                void t;
                if (drop > 0.8) for (const sx of [-1, 1]) B.add(mat('woodDark'), ctx.boxGeometry(0.34, 0.45, d * 0.96, 1), sx * (w / 2 - 0.35), -h / 2 - 0.225, 0);
              }
              break;
            }
            case 'boiler': {
              body(mat('copperTop'), mat('copperSide'), mat('ironDark'), 3, h);
              const lid = cyl ? R : minD / 2;
              B.add(mat('decalBrass'), cyl ? flatRing(R - 0.34, R - 0.18, 56) : flatQuad(w - 0.3, d - 0.3, 1), 0, top + 0.012, 0);
              B.add(mat('decalDark'), cyl ? flatRing(R - 0.18, R - 0.1, 56) : flatQuad(w - 0.5, d - 0.5, 1), 0, top + 0.014, 0);
              B.add(mat('decalBrass'), flatRing(0.01, Math.min(0.9, lid * 0.38), 36), 0, top + 0.02, 0);
              B.add(mat('decalDark'), flatRing(Math.min(0.9, lid * 0.38), Math.min(0.9, lid * 0.38) + 0.07, 36), 0, top + 0.024, 0);
              if (cyl) for (const y of [-h / 2 + 0.18, h / 2 - 0.18]) B.add(mat('brass'), new THREE.CylinderGeometry(R + 0.004, R + 0.004, 0.12, 48, 1, true), 0, y, 0);
              // ben
              const dd = Math.min(drop, clamp(minD * 0.8, 1.2, 3.6));
              if (dd > 0.7) for (const [lx, lz] of cyl ? [[0.6, 0.6], [-0.6, 0.6], [0.6, -0.6], [-0.6, -0.6]].map(([a, b]) => [a * R * 0.8, b * R * 0.8]) : [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => [a * (w / 2 - 0.35), b * (d / 2 - 0.35)]))
                B.add(mat('ironDark'), new THREE.CylinderGeometry(0.1, 0.17, dd, 8), lx, -h / 2 - dd / 2, lz);
              break;
            }
            case 'furnace': {
              body(mat('darkPlate'), mat('ironDark'), mat('ironDark'), 3, h);
              // glødende ristspalter i toppen
              const slit = mat('decalHot');
              if (cyl) for (let i = 0; i < 5; i++) { const x = (i - 2) * R * 0.3, L = Math.sqrt(Math.max(0.05, R * R * 0.7 - x * x)) * 1.5; B.add(slit, flatQuad(0.09, L, 1), x, top + 0.012, 0); }
              else { const n = Math.max(3, Math.floor(w / 0.75)); for (let i = 0; i < n; i++) B.add(slit, flatQuad(0.09, d * 0.7, 1), (i - (n - 1) / 2) * (w * 0.78 / n), top + 0.012, 0); }
              B.add(mat('decalDark'), cyl ? flatRing(R - 0.3, R - 0.04, 56) : flatQuad(w - 0.06, d - 0.06, 1), 0, top + 0.008, 0);
              // ovnmund i siden (fladt glødende felt lige uden på væggen)
              if (!cyl && h > 0.8) B.add(slit, flatShape([[-w * 0.22, 0], [w * 0.22, 0], [w * 0.22, h * 0.34], [0, h * 0.5], [-w * 0.22, h * 0.34]]).rotateX(PI / 2).rotateY(0), 0, -h / 2 + 0.1, d / 2 + 0.01);
              if (cyl && h > 0.8) B.add(slit, flatShape([[-R * 0.2, 0], [R * 0.2, 0], [R * 0.2, h * 0.34], [0, h * 0.5], [-R * 0.2, h * 0.34]]).rotateX(PI / 2), 0, -h / 2 + 0.1, R + 0.012);
              hopper(Math.min(drop, clamp(minD * 0.8, 1.4, 4)), mat('ironDark'));
              B.add(mat('glowHot'), cyl ? new THREE.CylinderGeometry(R * 0.4, R * 0.4, 0.05, 16) : ctx.boxGeometry(w * 0.4, 0.05, d * 0.4, 1), 0, -h / 2 - Math.min(drop, clamp(minD * 0.8, 1.4, 4)) - 0.02, 0);
              break;
            }
            case 'gear': {
              const n = clamp(Math.round(R * 3) + 6, 10, 30), tooth = clamp(R * 0.15, 0.25, 0.55), cap = 0.2;
              const gb = gearGeo(R, R - tooth, n, h - cap, 0, 0).rotateX(-PI / 2).translate(0, -h / 2, 0);
              scaleUV(gb, 0.4);
              const mg = new THREE.Mesh(tr(gb), [mat('darkPlate'), mat('brassSide')]);
              mg.userData.solid = true; grp.add(mg);
              const cp = new THREE.Mesh(tr(ctx.cylGeometry(R, cap, 4, { segments: 56 })), [mat('brassSide'), mat('brassTop'), mat('brassSide')]);
              cp.position.y = h / 2 - cap / 2; cp.userData.solid = true; grp.add(cp);
              cogDecals(B, R, n, tooth, top);
              break;
            }
            case 'piston': {
              body(mat('brassTop'), mat('brassSide'), mat('ironDark'), 4, h);
              B.add(cyl ? mat('decalDark') : mat('decalDark'), cyl ? flatRing(R - 0.34, R - 0.28, 56) : flatQuad(w - 0.5, d - 0.5, 1), 0, top + 0.012, 0);
              B.add(mat('decalDark'), flatRing(0.01, Math.min(0.5, minD * 0.12), 24), 0, top + 0.014, 0);
              pistonRod();
              break;
            }
            case 'trolley': { // vandret bevægelig plade på hjul
              body(mat('brassTop'), mat('brassSide'), mat('ironDark'), 4, h);
              hazardFrame(0.2);
              const dd = Math.min(drop, 1.3);
              if (dd > 0.6) {
                B.add(mat('ironDark'), ctx.boxGeometry(w * 0.5, 0.22, d * 0.7, 1), 0, -h / 2 - 0.11, 0);
                for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
                  const x = sx * w * 0.3, z = sz * d * 0.28;
                  B.add(mat('ironDark'), ctx.boxGeometry(0.1, dd * 0.6, 0.3, 1), x, -h / 2 - dd * 0.3, z);
                  B.add(mat('iron'), new THREE.CylinderGeometry(0.24, 0.24, 0.14, 16).rotateZ(PI / 2), x, -h / 2 - dd * 0.6, z);
                  B.add(mat('brass'), new THREE.CylinderGeometry(0.08, 0.08, 0.2, 8).rotateZ(PI / 2), x, -h / 2 - dd * 0.6, z);
                }
              }
              break;
            }
            case 'hung': { // pendulplade: ophængsøjer ved hjørnerne (kæderne tegner motoren)
              body(mat('copperTop'), mat('copperSide'), mat('ironDark'), 4, h);
              hazardFrame(0.2);
              for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
                B.add(mat('decalDark'), flatRing(0.001, 0.2, 18), sx * w * 0.42, top + 0.02, sz * d * 0.42);
                B.add(mat('decalBrass'), flatRing(0.001, 0.12, 14), sx * w * 0.42, top + 0.024, sz * d * 0.42);
              }
              hopper(Math.min(drop, 1.2), mat('ironDark'), false);
              break;
            }
            case 'oil': { // olieglat plade: glat som is
              body(mat('oilTop'), mat('oilSide'), mat('ironDark'), 3, h);
              hopper(Math.min(drop, clamp(minD * 0.7, 1.2, 3.5)), mat('oilSide'), false);
              break;
            }
            case 'rust': { // rusten rist med revner
              body(mat('grate'), mat('grate'), mat('rust'), 3, 3);
              const dd = Math.min(drop, 1.4);
              if (dd > 0.5) for (let i = 0; i < 5; i++) {
                const L = (0.3 + r() * 0.9) * dd, x = (r() - 0.5) * (cyl ? R : w) * 0.8, z = (r() - 0.5) * (cyl ? R : d) * 0.8;
                B.add(mat('rust'), new THREE.CylinderGeometry(0.035, 0.05, L, 5), x, -h / 2 - L / 2, z, (r() - 0.5) * 0.4, 0, (r() - 0.5) * 0.4);
              }
              break;
            }
            case 'spring': { // fjederpude: kobberplade med pile og spiralfjeder
              body(mat('copperTop'), mat('copperSide'), mat('ironDark'), 3, h);
              for (let i = 0; i < 2; i++) {
                const cz = (i - 0.5) * Math.min(1.2, minD * 0.34), s = Math.min(1, minD * 0.2);
                B.add(mat('decalBrass'), flatShape([[0, -0.0], [s * 0.9, -s * 0.9], [s * 0.4, -s * 0.9], [s * 0.4, -s * 1.5], [-s * 0.4, -s * 1.5], [-s * 0.4, -s * 0.9], [-s * 0.9, -s * 0.9]].map(([x, y]) => [x, y + s * 0.8])), 0, top + 0.014, cz * 0.9);
              }
              B.add(mat('decalDark'), cyl ? flatRing(R - 0.3, R - 0.22, 48) : flatQuad(w - 0.45, d - 0.45, 1), 0, top + 0.01, 0);
              const dd = Math.min(drop, 2.2);
              if (dd > 0.9) {
                const cr = clamp(minD * 0.26, 0.3, 0.9), turns = 5, pts = [];
                for (let i = 0; i <= turns * 24; i++) { const a = (i / 24) * TAU; pts.push(new V3(Math.cos(a) * cr, -h / 2 - 0.2 - (i / (turns * 24)) * (dd - 0.4), Math.sin(a) * cr)); }
                B.add(mat('chrome'), new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), turns * 24, 0.07, 6), 0, 0, 0);
                B.add(mat('ironDark'), new THREE.CylinderGeometry(cr * 1.5, cr * 1.7, 0.2, 18), 0, -h / 2 - dd + 0.1, 0);
                B.add(mat('ironDark'), new THREE.CylinderGeometry(cr * 1.5, cr * 1.5, 0.12, 18), 0, -h / 2 - 0.08, 0);
              }
              break;
            }
            case 'turn': { // base til kranarm: skive med sikkerhedsring
              body(mat('darkPlate'), mat('ironSide'), mat('ironDark'), 3, h);
              B.add(mat('hazard'), flatRing(R - 0.42, R - 0.12, 56, 0.5), 0, top + 0.012, 0);
              B.add(mat('decalBrass'), flatRing(0.01, 0.55, 28), 0, top + 0.016, 0);
              B.add(mat('decalDark'), flatRing(0.55, 0.62, 28), 0, top + 0.02, 0);
              hopper(Math.min(drop, clamp(minD * 0.7, 1.4, 4)), mat('ironDark'));
              break;
            }
            case 'belt': {
              const bs = beltSet(p), tile = 2;
              let geo;
              if (bs.ax === 'Z') geo = ctx.boxGeometry(w, h, d, tile, { sideTile: tile });
              else geo = ctx.boxGeometry(w, h, d, tile, { sideTile: tile });
              // sider langs kørselsretningen får kæden (UV: tile = h, så kæden fylder siden)
              const uv = geo.attributes.uv, nor = geo.attributes.normal, pos = geo.attributes.position;
              for (let i = 0; i < uv.count; i++) {
                const nx = Math.abs(nor.getX(i)) > 0.5, nz = Math.abs(nor.getZ(i)) > 0.5;
                if ((bs.ax === 'Z' && nx) || (bs.ax === 'X' && nz)) uv.setXY(i, (bs.ax === 'Z' ? -pos.getZ(i) * Math.sign(nor.getX(i) || 1) : pos.getX(i) * Math.sign(nor.getZ(i) || 1)) / h * 1.0 + 0.5, (pos.getY(i) / h) + 0.5);
              }
              const ms = bs.ax === 'Z' ? [bs.chainR, bs.chainL, bs.top, mat('ironDark'), mat('ironSide'), mat('ironSide')]
                : [mat('ironSide'), mat('ironSide'), bs.top, mat('ironDark'), bs.chainR, bs.chainL];
              const m = new THREE.Mesh(tr(geo), ms); m.userData.solid = true; grp.add(m);
              // sikkerhedsbort langs de kanter, der ikke er bånd-ender
              const y = top + 0.012, bw = 0.16;
              if (bs.ax === 'Z') for (const sx of [-1, 1]) B.add(mat('hazard'), flatQuad(bw, d - 0.02, 0.4), sx * (w / 2 - bw / 2 - 0.01), y, 0);
              else for (const sz of [-1, 1]) B.add(mat('hazard'), flatQuad(w - 0.02, bw, 0.4), 0, y, sz * (d / 2 - bw / 2 - 0.01));
              const dd = Math.min(drop, 2.6);
              if (dd > 0.9) {
                for (const sgn of [-1, 1]) for (const k of [-0.36, 0.36]) {
                  const ax = bs.ax === 'Z' ? [sgn * (w / 2 - 0.35), k * d] : [k * w, sgn * (d / 2 - 0.35)];
                  B.add(mat('ironDark'), ctx.boxGeometry(0.18, dd, 0.18, 1), ax[0], -h / 2 - dd / 2, ax[1]);
                }
                B.add(mat('brass'), new THREE.CylinderGeometry(0.34, 0.34, Math.min(1.1, (bs.ax === 'Z' ? w : d) * 0.4), 16).rotateZ(bs.ax === 'Z' ? PI / 2 : 0).rotateX(bs.ax === 'Z' ? 0 : PI / 2), 0, -h / 2 - dd * 0.6, 0);
              }
              break;
            }
            case 'cog': { // drejeskive som tandhjul
              const n = clamp(Math.round(R * 3) + 6, 10, 32), tooth = clamp(R * 0.16, 0.25, 0.6), cap = 0.2;
              const gb = gearGeo(R, R - tooth, n, h - cap, 0, 0).rotateX(-PI / 2).translate(0, -h / 2, 0);
              scaleUV(gb, 0.4);
              const mg = new THREE.Mesh(tr(gb), [mat('darkPlate'), mat('brassSide')]);
              mg.userData.solid = true; grp.add(mg);
              const cp = new THREE.Mesh(tr(ctx.cylGeometry(R, cap, 4, { segments: 56 })), [mat('brassSide'), mat('brassTop'), mat('brassSide')]);
              cp.position.y = h / 2 - cap / 2; cp.userData.solid = true; grp.add(cp);
              cogDecals(B, R, n, tooth, top);
              // aksel og et lille drivhjul under
              const dd = Math.min(drop, clamp(R * 0.9, 1.2, 4));
              if (dd > 0.9) {
                B.add(mat('iron'), new THREE.CylinderGeometry(0.28, 0.34, dd, 14), 0, -h / 2 - dd / 2, 0);
                const sg = gearGeo(R * 0.6, R * 0.6 - tooth * 0.8, Math.max(8, Math.round(n * 0.6)), 0.3).rotateX(-PI / 2);
                B.add(mat('darkPlate'), scaleUV(sg, 0.4), 0, -h / 2 - dd * 0.65, 0);
                B.add(mat('lamp'), new THREE.SphereGeometry(0.12, 8, 6), 0, -h / 2 - dd - 0.05, 0);
              }
              anim.cogs.push(grp);
              break;
            }
            case 'vent': { // damprist: sort plade med lange spalter
              body(mat('darkPlate'), mat('ironSide'), mat('ironDark'), 2, h);
              B.add(mat('decalBrass'), cyl ? flatRing(R - 0.2, R - 0.06, 40) : flatQuad(w - 0.1, d - 0.1, 1), 0, top + 0.008, 0);
              B.add(mat('decalDark'), cyl ? flatRing(0.001, R - 0.2, 40) : flatQuad(w - 0.4, d - 0.4, 1), 0, top + 0.012, 0);
              const n = Math.max(3, Math.floor(minD / 0.5));
              for (let i = 0; i < n; i++) B.add(mat('decalLamp'), flatQuad(0.07, minD * 0.5, 1), (i - (n - 1) / 2) * (minD * 0.62 / n), top + 0.016, 0);
              const dd = Math.min(drop, 4);
              if (dd > 0.8) {
                const pr = clamp(minD * 0.2, 0.2, 0.5);
                B.add(mat('pipe'), new THREE.CylinderGeometry(pr, pr, dd, 14), 0, -h / 2 - dd / 2, 0);
                for (let k = 0.3; k < dd; k += 0.8) B.add(mat('brass'), new THREE.CylinderGeometry(pr * 1.35, pr * 1.35, 0.1, 14), 0, -h / 2 - k, 0);
                B.add(mat('red'), new THREE.TorusGeometry(0.26, 0.035, 6, 14), 0, -h / 2 - dd * 0.55, pr + 0.05, PI / 2 * 0, 0, 0);
              }
              break;
            }
            case 'ramp': {
              body(mat('tread'), mat('ironSide'), mat('ironDark'), 1, 1);
              break;
            }
            case 'rail': {
              const m = new THREE.Mesh(tr(ctx.boxGeometry(w, h, d, 1)), mat('brass')); m.userData.solid = true; grp.add(m);
              break;
            }
            case 'boost': {
              body(mat('ironTop'), mat('ironSide'), mat('ironDark'), 1, 1);
              for (let i = -1; i <= 1; i++) B.add(mat('decalHot'), flatShape([[-w * 0.3, 0.7], [0, 0.1], [w * 0.3, 0.7], [w * 0.3, 1.0], [0, 0.4], [-w * 0.3, 1.0]]), 0, top + 0.014, i * 1.4 - 0.4);
              break;
            }
            default: { // 'plate' og start
              body(mat('brassTop'), mat('brassSide'), mat('ironDark'), 4, h);
              if (p.type === 'start') hazardFrame(0.3);
              else if (r() < 0.45) hazardFrame(0.16);
              const tint = r();
              if (tint < 0.3 && !big) { grp.children[0].material = grp.children[0].material.map((m) => (m === mat('brassTop') ? mat('copperTop') : m === mat('brassSide') ? mat('copperSide') : m)); }
              hopper(Math.min(drop, clamp(minD * (big ? 0.7 : 0.9), 1.4, big ? 7 : 4.5)), mat('ironDark'));
              if (upMover(p)) pistonRod();
            }
          }
          B.build(grp, true);
          return grp;
        },

        /* ---------- Spinner: kranarm i gittervæk ---------- */
        spinArm(p) {
          const g = new THREE.Group(), B = mk(), L = p.bar, hh = 0.18;
          B.add(mat('ironDark'), ctx.boxGeometry(L, 0.07, 0.4, 1), 0, -hh + 0.035, 0);
          B.add(mat('ironDark'), ctx.boxGeometry(L, 0.07, 0.4, 1), 0, hh - 0.035, 0);
          B.add(mat('brass'), new THREE.CylinderGeometry(0.4, 0.4, 0.5, 20), 0, 0, 0);
          B.add(mat('iron'), new THREE.CylinderGeometry(0.17, 0.17, 0.55, 12), 0, -0.26, 0);
          const n = Math.max(6, Math.round(L / 0.55)), seg = L / n;
          for (let i = 0; i < n; i++) {
            const x0 = -L / 2 + i * seg, sl = Math.hypot(seg, 0.3);
            B.add(mat('iron'), new THREE.CylinderGeometry(0.03, 0.03, sl, 5), x0 + seg / 2, 0, 0, 0, 0, (i % 2 ? 1 : -1) * Math.atan2(0.3, seg) + PI / 2 * 0 - (i % 2 ? 1 : -1) * 0 + PI / 2 * 0 + Math.PI / 2 * 0 + (PI / 2) * 0 - PI / 2 * 0 + (i % 2 ? -PI / 2 : PI / 2) * 0 + 0 * 1 + PI / 2 * 0 - (PI / 2) * 0);
          }
          for (const s of [-1, 1]) {
            B.add(mat('hazard'), ctx.boxGeometry(1.1, 0.37, 0.46, 0.5), s * (L / 2 - 0.55), 0, 0);
            B.add(mat('iron'), ctx.boxGeometry(0.5, 0.5, 0.5, 1), s * (L / 2 + 0.05), -0.05, 0);
          }
          B.build(g, true);
          return g;
        },

        /* ---------- Stænger ---------- */
        bar(b) {
          const g = new THREE.Group(), B = mk(), len = b.len, r = b.r, v = b.v === 'rod' || b.v === 'hook' ? b.v : b.swing ? 'hook' : 'pipe';
          const cylX = (rad, l) => new THREE.CylinderGeometry(rad, rad, l, 14).rotateZ(PI / 2);
          B.add(v === 'rod' ? mat('iron') : mat('pipe'), cylX(r, len));
          if (v === 'hook') { // kranåg: sjækler ved rebene og opadbøjede kroge i enderne
            for (const e of [0.15, 0.85]) {
              B.add(mat('brass'), cylX(r * 1.7, 0.22), (e - 0.5) * len, 0, 0);
              B.add(mat('chrome'), new THREE.TorusGeometry(0.11, 0.025, 6, 16), (e - 0.5) * len, 0.16, 0, 0, 0, 0);
            }
            for (const s of [-1, 1]) {
              const pts = [];
              for (let i = 0; i <= 10; i++) { const a = (i / 10) * PI * 0.95; pts.push(new V3(s * (len / 2 + 0.12 - Math.sin(a) * 0.14 * 0.5 + 0.0), Math.sin(a) * 0.32 * 0 + (i / 10) * 0.34 - Math.cos(a) * 0 , 0)); }
              const hook = [new V3(s * len / 2, 0, 0), new V3(s * (len / 2 + 0.14), 0.05, 0), new V3(s * (len / 2 + 0.2), 0.26, 0), new V3(s * (len / 2 + 0.1), 0.42, 0), new V3(s * (len / 2 - 0.06), 0.36, 0)];
              B.add(mat('iron'), new THREE.TubeGeometry(new THREE.CatmullRomCurve3(hook), 14, r * 1.1, 7));
              void pts;
            }
          } else {
            const n = Math.max(1, Math.floor(len / 1.5));
            for (let i = 1; i <= n; i++) {
              const x = -len / 2 + (len * i) / (n + 1);
              B.add(mat('brass'), cylX(r * 1.55, 0.13), x, 0, 0);
              B.add(mat('brass'), cylX(r * 1.2, 0.04), x - 0.1, 0, 0);
              B.add(mat('brass'), cylX(r * 1.2, 0.04), x + 0.1, 0, 0);
            }
            for (const s of [-1, 1]) {
              B.add(mat('brass'), cylX(r * 2.7, 0.05), s * (len / 2 - 0.03), 0, 0);
              B.add(mat('iron'), new THREE.SphereGeometry(r * 1.7, 10, 8), s * (len / 2 + 0.02), 0, 0);
            }
            if (v === 'pipe') { // ventilhjul i den ene ende
              B.add(mat('red'), new THREE.TorusGeometry(0.2, 0.03, 6, 16).rotateY(PI / 2), len / 2 + 0.2, 0, 0);
              B.add(mat('brass'), cylX(0.025, 0.2), len / 2 + 0.1, 0, 0);
              B.add(mat('red'), new THREE.BoxGeometry(0.03, 0.4, 0.03), len / 2 + 0.2, 0, 0);
              B.add(mat('red'), new THREE.BoxGeometry(0.03, 0.03, 0.4), len / 2 + 0.2, 0, 0);
            }
          }
          B.build(g, true);
          return g;
        },

        /* ---------- Svævebane: stålwire med kranmaster ---------- */
        zip(z) {
          const g = new THREE.Group(), B = mk();
          const A = new V3(z.ax, z.ay, z.az), E = new V3(z.bx, z.by, z.bz), dir = E.clone().sub(A), L = dir.length();
          dir.normalize();
          const side = new V3(-dir.z, 0, dir.x).normalize().multiplyScalar(1.1);
          const q = new THREE.Quaternion().setFromUnitVectors(new V3(0, 1, 0), dir);
          const cab = new THREE.Mesh(tr(new THREE.CylinderGeometry(0.03, 0.03, L, 6)), mat('chrome'));
          cab.position.copy(A).addScaledVector(dir, L / 2); cab.quaternion.copy(q);
          g.add(cab);
          for (const [P, up] of [[A, 0.9], [E, 0.9]]) {
            const bx = P.x + side.x, bz = P.z + side.z;
            B.add(mat('ironDark'), new THREE.CylinderGeometry(0.1, 0.16, 4.2, 8), bx, P.y - 3.0 + 1.1 * 0, bz);
            B.add(mat('brass'), new THREE.CylinderGeometry(0.2, 0.2, 0.12, 10), bx, P.y + 0.9 - 0.1, bz);
            B.add(mat('ironDark'), new THREE.BoxGeometry(1.1, 0.12, 0.12), P.x + side.x * 0.5, P.y + 0.9, P.z + side.z * 0.5, 0, Math.atan2(-side.z, side.x), 0);
            B.add(mat('brass'), new THREE.TorusGeometry(0.12, 0.03, 6, 14), P.x, P.y + 0.1, P.z, 0, 0, 0);
            void up;
          }
          B.build(g, true);
          return g;
        },

        /* ---------- Krogpunkt: messing-tandhjul med øje ---------- */
        anchor() {
          const g = new THREE.Group(), cogG = new THREE.Group(), B = mk();
          const gg = gearGeo(0.33, 0.26, 10, 0.12, 4, 0.08).rotateX(-PI / 2).translate(0, -0.06, 0);
          B.add(mat('brass'), scaleUV(gg, 1));
          B.add(mat('iron'), new THREE.CylinderGeometry(0.09, 0.09, 0.2, 10), 0, 0, 0);
          B.build(cogG, true);
          g.add(cogG);
          const eye = new THREE.Mesh(tr(new THREE.TorusGeometry(0.1, 0.03, 6, 14)), mat('chrome'));
          eye.position.y = 0.2; g.add(eye);
          const rod = new THREE.Mesh(tr(new THREE.CylinderGeometry(0.02, 0.02, 0.9, 5)), mat('iron'));
          rod.position.y = 0.6; g.add(rod);
          anim.spin.push(cogG);
          return g;
        },

        /* ---------- Kulisser ---------- */
        decor(data) {
          return buildDecor(data);
        },

        update(dt, t) {
          for (const b of anim.belts) {
            const k = (dt * b.v) / b.tile;
            b.top.offset.y -= b.ax === 'Z' ? k : 0;
            b.top.offset.x -= b.ax === 'X' ? k : 0;
            for (const c of b.chains) c.offset.x -= (dt * b.v) / 1.0 * 0.5;
          }
          for (const s of anim.spin) s.rotation.y = t * 0.8;
          for (const gr of anim.gears) gr.mesh.rotation.z = t * gr.w + gr.ph;
          for (const u of anim.uniforms) u.value = t;
          for (const hnd of anim.hands) hnd.mesh.rotation.z = -t * hnd.w;
          for (const n of anim.needles) n.mesh.rotation.z = n.base + Math.sin(t * n.f + n.ph) * n.amp;
          for (const f of anim.flick) f.material.opacity = f.base * (0.85 + 0.15 * Math.sin(t * 7 + f.ph) * Math.sin(t * 3.1 + f.ph));
        },
      };

      /* ---------- Kulisser (se decor) ---------- */
      function buildDecor(data) {
        const root = new THREE.Group();
        const b = data.bounds, rng = ctx.mulberry32(7171 + ctx.levelIndex);
        const R0 = b.radius + 45, yMid = (b.minY + b.maxY) / 2;
        const place = (minR, spread, yLo, yHi, tries = 30) => {
          for (let i = 0; i < tries; i++) {
            const a = rng() * TAU, r = minR + rng() * spread;
            const x = b.cx + Math.cos(a) * r, z = b.cz + Math.sin(a) * r, y = yLo + rng() * (yHi - yLo);
            if (ctx.clearOfCourse(x, y, z, 14)) return { x, y, z, a };
          }
          return null;
        };
        // Kæmpe tandhjul, der drejer langsomt i baggrunden (lodrette, vendt mod banen)
        const gearMats = ['brass', 'pipe', 'iron', 'brassSide'];
        for (let i = 0; i < 14; i++) {
          const q = place(R0, 220, yMid - 30, yMid + 50);
          if (!q) continue;
          const R = 10 + rng() * 26, n = Math.round(R * 1.4);
          const geo = tr(gearGeo(R, R * 0.88, n, 2 + rng() * 2, 5, R * 0.18).translate(0, 0, -1));
          const g = new THREE.Mesh(geo, mat(gearMats[i % gearMats.length]));
          const holder = new THREE.Group();
          holder.position.set(q.x, q.y, q.z);
          holder.lookAt(b.cx, q.y, b.cz);
          holder.add(g);
          root.add(holder);
          anim.gears.push({ mesh: g, w: (i % 2 ? 1 : -1) * (0.6 / R) * 6, ph: rng() * TAU });
        }
        // Fabrikshaller med oplyste vinduer og skorstene
        const winGeo = tr(new THREE.PlaneGeometry(1.6, 2.4));
        for (let i = 0; i < 10; i++) {
          const q = place(R0 + 60, 260, b.minY - 60, b.minY - 40);
          if (!q) continue;
          const w = 40 + rng() * 50, h = 50 + rng() * 60, d = 30 + rng() * 30;
          const hall = new THREE.Group();
          hall.position.set(q.x, q.y, q.z);
          hall.lookAt(b.cx, q.y, b.cz);
          const body = new THREE.Mesh(tr(new THREE.BoxGeometry(w, h, d)), mat(i % 2 ? 'ironDark' : 'copperSide'));
          body.position.y = h / 2;
          hall.add(body);
          const roof = new THREE.Mesh(tr(new THREE.CylinderGeometry(d / 2, d / 2, w, 3, 1).rotateZ(PI / 2)), mat('darkPlate'));
          roof.position.y = h + d * 0.2;
          hall.add(roof);
          const rows = Math.floor(h / 9), cols = Math.floor(w / 6);
          const wins = new THREE.InstancedMesh(winGeo, mat('window'), rows * cols);
          let k = 0;
          for (let r = 1; r < rows; r++) for (let c = 0; c < cols; c++) {
            if (rng() < 0.35) continue;
            const m = new THREE.Matrix4().makeTranslation(-w / 2 + 3 + c * 6, r * 9, d / 2 + 0.05);
            wins.setMatrixAt(k++, m);
          }
          wins.count = k;
          hall.add(wins);
          for (let c = 0; c < 2; c++) { // skorstene
            const stack = new THREE.Mesh(tr(new THREE.CylinderGeometry(2.2, 3, 50, 12)), mat('rust'));
            stack.position.set(-w / 3 + c * w / 2, h + 25, -d / 4);
            hall.add(stack);
          }
          root.add(hall);
        }
        // Urtårnet: en stor urskive med visere, der drejer
        const tq = place(R0 + 30, 40, b.maxY + 10, b.maxY + 25, 60) || { x: b.cx + R0 + 40, y: b.maxY + 15, z: b.cz };
        const tower = new THREE.Group();
        tower.position.set(tq.x, tq.y, tq.z);
        tower.lookAt(b.cx, tq.y, b.cz);
        const shaft = new THREE.Mesh(tr(new THREE.BoxGeometry(24, 120, 24)), mat('brassSide'));
        shaft.position.y = -50;
        tower.add(shaft);
        const face = new THREE.Mesh(tr(new THREE.CircleGeometry(16, 48)), mat('dialGlow'));
        face.position.set(0, 0, 12.2);
        tower.add(face);
        const rim = new THREE.Mesh(tr(new THREE.TorusGeometry(16.4, 1, 10, 48)), mat('brass'));
        rim.position.z = 12.4;
        tower.add(rim);
        for (const [len, wid, w] of [[11, 1.1, 0.12], [14, 0.7, 1.4]]) {
          const hand = new THREE.Mesh(tr(new THREE.BoxGeometry(wid, len, 0.4).translate(0, len / 2 - 1.5, 0)), mat('iron'));
          hand.position.z = 12.9;
          tower.add(hand);
          anim.hands.push({ mesh: hand, w });
        }
        const cap = new THREE.Mesh(tr(new THREE.ConeGeometry(18, 22, 4).rotateY(PI / 4)), mat('patina'));
        cap.position.y = 27;
        tower.add(cap);
        root.add(tower);
        // Kobberrør, der bugter sig mellem hallerne
        for (let i = 0; i < 6; i++) {
          const pts = [];
          let a = rng() * TAU;
          for (let k = 0; k < 6; k++) {
            a += 0.25 + rng() * 0.2;
            const r = R0 + 20 + rng() * 80;
            pts.push(new V3(b.cx + Math.cos(a) * r, b.minY - 30 + rng() * 60, b.cz + Math.sin(a) * r));
          }
          if (!pts.every((p) => ctx.clearOfCourse(p.x, p.y, p.z, 10))) continue;
          root.add(new THREE.Mesh(tr(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, 1.4, 8)), mat('pipe')));
        }
        return root;
      }
    },
  };
})();

// ---------------------------------------------------------------- jungle
/* =====================================================================
   VERDENSSÆT 'jungle' – Junglekronerne (bane 8)
   Junglens trætoppe: den store modertræstamme, svampehylder, grenstumper,
   trædæk og trætophuse, lianer og grene som stænger, svampe- og
   bladpuder, døde grene, lysende frøkapsler, vandfald og tåge.
   ===================================================================== */
(function () {
  'use strict';

  window.SKYHOJ_THEMES.jungle = {
    top: '#3f8fd0', horizon: '#c8eac0', bottom: '#8ab48a', sunElev: 55, sunAz: 10, sunColor: '#fff4d8', sunInt: 3.0,
    hemiSky: '#c4ecc0', hemiInt: 1.05, fog: '#b8dcb0', fogNear: 70, fogFar: 520, cloud: '#f2fff0', clouds: 0.85, stars: 0,
    stone: '#b8c4a0', exposure: 1.0, lavaGlow: 0.85,
  };

  window.SKYHOJ_KITS.jungle = {
    id: 'jungle',
    name: 'Junglekronerne',
    variants: {
      fungus: 'Svampehylde: halvrund, lys orange-brun med lameller under (standard for cyl). shape:"cyl" w 1.5-4',
      stub: 'Grenstump: bark på siderne, årringe i toppen, gren der fortsætter ind mod stammen. Kasse/cyl w 1.2-3',
      deck: 'Trædæk på grene (standard for p): planker bundet med reb, bladtag under. Kasse w 3-10',
      treehouse: 'Trætophus-balkon: planker, stråtag under, lanterner (standard for start/finish). w 6-12',
      leaf: 'Kæmpe blad som platform. Kasse w 2-5',
      dead: 'Død, grå gren med revner (standard for crumble). Kasse w 1.5-3',
    },
    barVariants: 'Stænger er grene med mos og blade; trapez er lianer. Svævebaner er lianer med blomster. Krogpunkter er lysende frøkapsler.',
    create(ctx) {
      const { THREE } = ctx;
      const L = window.SKYHOJ_KITLIB(ctx);
      const PI = Math.PI, TAU = L.TAU, tr = L.tr;
      const rng = ctx.mulberry32(800 + ctx.levelIndex);
      const anim = { pods: [], falls: [], birds: null };

      const bark = L.tex(256, (g, S) => {
        L.fill(g, S, S, '#6a4a32');
        for (let x = 0; x < S; x += 6 + Math.floor(rng() * 8)) { g.fillStyle = rng() < 0.5 ? '#4e3424' : '#7e5a3e'; g.fillRect(x, 0, 2 + rng() * 4, S); }
        g.globalAlpha = 0.5; L.speckle(g, S, S, ['#5a7a2a', '#7aa03a'], 120, 3, 10, rng); g.globalAlpha = 1;
      });
      const rings = L.tex(256, (g, S) => {
        L.fill(g, S, S, '#c8a070');
        for (let r = S / 2; r > 4; r -= 7) { g.strokeStyle = r % 14 ? '#a87e50' : '#b88e5e'; g.lineWidth = 2; g.beginPath(); g.arc(S / 2, S / 2, r, 0, TAU); g.stroke(); }
      }, { repeat: false });
      const planks = L.tex(256, (g, S) => {
        for (let x = 0; x < S; x += 32) { g.fillStyle = ['#9a7046', '#8a6038', '#a87a4e'][(x / 32) % 3]; g.fillRect(x, 0, 32, S); g.fillStyle = '#4a3020'; g.fillRect(x, 0, 2, S); }
        g.fillStyle = '#c8a46a'; for (let y = 40; y < S; y += 110) g.fillRect(0, y, S, 6);
      });
      const fungus = L.tex(256, (g, S) => {
        L.grad(g, S, S, [[0, '#f2c880'], [1, '#c8823a']]);
        L.speckle(g, S, S, ['#ffe8b8', '#a8602a'], 200, 2, 6, rng);
      });
      const leaf = L.tex(256, (g, S) => {
        L.fill(g, S, S, '#3c8a32'); g.strokeStyle = '#7ac85a'; g.lineWidth = 5;
        g.beginPath(); g.moveTo(S / 2, 0); g.lineTo(S / 2, S); g.stroke(); g.lineWidth = 2;
        for (let y = 10; y < S; y += 24) { g.beginPath(); g.moveTo(S / 2, y); g.lineTo(0, y + 30); g.moveTo(S / 2, y); g.lineTo(S, y + 30); g.stroke(); }
      });
      const dead = L.tex(256, (g, S) => { L.fill(g, S, S, '#8a8478'); L.speckle(g, S, S, ['#a8a294', '#6a6458'], 300, 1, 4, rng); L.cracks(g, S, S, '#3a362e', 16, rng, 3); });
      const falls = L.tex(64, (g, S) => { L.grad(g, S, S, [[0, '#e8f8ff'], [1, '#8ac8e8']], false); g.globalAlpha = 0.6; for (let i = 0; i < 30; i++) { g.fillStyle = '#ffffff'; g.fillRect(rng() * S, rng() * S, 2, 12); } g.globalAlpha = 1; });
      const M = {
        bark: L.std({ map: bark, bumpMap: bark, bumpScale: 2, roughness: 0.95 }),
        rings: L.std({ map: rings, roughness: 0.8 }),
        planks: L.std({ map: planks, roughness: 0.8 }),
        fungus: L.std({ map: fungus, roughness: 0.7 }),
        gills: L.std({ color: '#e8d0a0', roughness: 0.9 }),
        leaf: L.std({ map: leaf, roughness: 0.6, side: THREE.DoubleSide }),
        leafDark: L.std({ color: '#2a6a2a', roughness: 0.75 }),
        moss: L.std({ color: '#5a9a3a', roughness: 0.95 }),
        dead: L.std({ map: dead, roughness: 0.95 }),
        thatch: L.std({ color: '#b89a5a', roughness: 0.95 }),
        rope: L.std({ color: '#c8a46a', roughness: 0.85 }),
        vine: L.std({ color: '#4a7a2a', roughness: 0.8 }),
        pod: L.std({ color: '#c8ff6a', emissive: '#8aff3a', emissiveIntensity: 1.6, roughness: 0.4 }),
        mushroom: L.std({ color: '#e84a4a', roughness: 0.5, emissive: '#a01a1a', emissiveIntensity: 0.1 }),
        dots: L.std({ color: '#fff4e8', roughness: 0.6 }),
        water: tr(new THREE.MeshBasicMaterial({ map: falls, transparent: true, opacity: 0.8, fog: true })),
        flower: L.std({ color: '#ff6aa8', roughness: 0.6, emissive: '#ff3a8a', emissiveIntensity: 0.2 }),
      };
      const variantOf = (p) => p.v || (p.type === 'start' || p.type === 'finish' ? 'treehouse' : p.type === 'crumble' ? 'dead'
        : p.type === 'bounce' ? 'mushroom' : p.shape === 'cyl' ? (p.w <= 3 ? 'stub' : 'fungus') : Math.min(p.w, p.d) <= 2.5 ? 'stub' : 'deck');

      return {
        ventColor: '#e8fff0',
        platform(p) {
          const g = new THREE.Group();
          const v = variantOf(p), minD = Math.min(p.w, p.d);
          if (v === 'fungus') {
            g.add(L.block(p, { top: M.fungus, side: M.fungus }, 2, { segments: 28 }));
            const gl = L.under(p, M.gills, Math.min(1.2, p.w * 0.3), { tip: 0.2, segments: 28 }); if (gl) g.add(gl);
          } else if (v === 'stub') {
            g.add(L.block(p, { top: M.rings, side: M.bark }, p.shape === 'cyl' ? p.w : minD, { tileTop: false, segments: 14 }));
            const s = L.pillar(p, M.bark, 3, minD * 0.12, 2); if (s) g.add(s);
          } else if (v === 'mushroom') { // springpude: rød fluesvamp
            g.add(L.block(p, { top: M.mushroom, side: M.mushroom }, 2, { segments: 24 }));
            for (let i = 0; i < 5; i++) {
              const d = new THREE.Mesh(tr(new THREE.CircleGeometry(minD * 0.07, 10).rotateX(-PI / 2)), M.dots);
              const a = i / 5 * TAU + p.seed; d.position.set(Math.cos(a) * minD * 0.25, p.h / 2 + 0.01, Math.sin(a) * minD * 0.25); g.add(d);
            }
            const stem = L.pillar(p, M.dots, 4, minD * 0.3, 2); if (stem) g.add(stem);
          } else if (v === 'leaf') {
            g.add(L.block(p, { top: M.leaf, side: M.leafDark }, minD, { tileTop: false }));
          } else if (v === 'dead') {
            g.add(L.block(p, { top: M.dead, side: M.dead }, 2));
          } else { // trædæk / trætophus
            g.add(L.block(p, { top: M.planks, side: M.bark }, 2));
            const roof = L.under(p, v === 'treehouse' ? M.thatch : M.leafDark, v === 'treehouse' ? 2.5 : 1.4, { tip: 0.5 }); if (roof) g.add(roof);
            const trunk = L.pillar(p, M.bark, 30, minD * 0.36, 3); if (trunk) { trunk.position.y -= 1; g.add(trunk); }
          }
          if (p.type === 'conveyor') g.children[0].material = [M.bark, M.bark, L.std({ map: L.beltTex('#5a4030', '#6a5040', '#c8ff6a'), roughness: 0.8 }), M.bark, M.bark, M.bark];
          if (p.type === 'vent') g.children[0].material = [M.bark, M.bark, L.std({ map: L.grateTex('#3a2a1a', '#7a9a4a'), roughness: 0.8 }), M.bark, M.bark, M.bark];
          return g;
        },
        bar(b) {
          const g = new THREE.Group();
          g.add(L.barMesh(b, b.swing ? M.vine : M.bark, b.r * 1.1));
          if (!b.swing) {
            const n = Math.max(2, Math.round(b.len / 0.8));
            for (let i = 0; i < n; i++) {
              const l = new THREE.Mesh(tr(new THREE.PlaneGeometry(0.35, 0.18)), M.leaf);
              l.position.set(-b.len / 2 + (i + 0.5) * b.len / n, 0.12, (i % 2 ? 1 : -1) * 0.1); l.rotation.set(-0.6, i, 0.3); g.add(l);
            }
          }
          return g;
        },
        anchor() { // lysende frøkapsel
          const g = new THREE.Group();
          const pod = new THREE.Mesh(tr(new THREE.SphereGeometry(0.28, 14, 10)), M.pod);
          pod.scale.y = 1.4; g.add(pod); anim.pods.push(pod);
          const stem = new THREE.Mesh(tr(new THREE.CylinderGeometry(0.03, 0.03, 1.2, 6)), M.vine); stem.position.y = 0.9; g.add(stem);
          return g;
        },
        zip(z) { // lian med blomster
          const g = new THREE.Group();
          const a = new THREE.Vector3(z.ax, z.ay, z.az), b = new THREE.Vector3(z.bx, z.by, z.bz);
          g.add(L.tube([a, a.clone().lerp(b, 0.5).add(new THREE.Vector3(0, -0.3, 0)), b], 0.05, M.vine, 24));
          const n = Math.max(3, Math.round(a.distanceTo(b) / 3));
          for (let i = 1; i < n; i++) { const f = new THREE.Mesh(tr(new THREE.SphereGeometry(0.12, 8, 6)), M.flower); f.position.copy(a.clone().lerp(b, i / n)); f.position.y += 0.08; g.add(f); }
          return g;
        },
        decor(data) {
          const root = new THREE.Group();
          const b = data.bounds, R0 = b.radius + 40;
          // Kæmpetræer: stammer med store, grønne kroner rundt om banen
          const trunks = [], crowns = [];
          L.place(data, rng, 26, R0, R0 + 260, ctx.lavaY + 10, ctx.lavaY + 10, 16, (x, y, z) => {
            const h = (b.maxY - ctx.lavaY) + 20 + rng() * 40, r = 3 + rng() * 4;
            trunks.push({ x, y: y + h / 2, z, sx: r, sy: h, sz: r });
            for (let k = 0; k < 5; k++) crowns.push({ x: x + (rng() - 0.5) * r * 6, y: y + h + rng() * 8, z: z + (rng() - 0.5) * r * 6, s: r * (2 + rng() * 1.5), sy: r * 1.2 });
          });
          root.add(L.instanced(new THREE.CylinderGeometry(0.8, 1, 1, 9), M.bark, trunks));
          root.add(L.instanced(new THREE.IcosahedronGeometry(1, 1), M.leafDark, crowns));
          // Vandfald fra kronerne og tåge
          L.place(data, rng, 6, R0 + 30, R0 + 180, b.minY, b.maxY, 20, (x, y, z) => {
            const f = new THREE.Mesh(tr(new THREE.PlaneGeometry(8, 80)), M.water);
            f.position.set(x, y - 30, z); f.lookAt(b.cx, y - 30, b.cz); root.add(f); anim.falls.push(f);
          });
          // Fugle
          const pos = [];
          for (let i = 0; i < 40; i++) pos.push(b.cx + (rng() - 0.5) * b.radius * 2, b.maxY + 15 + rng() * 25, b.cz + (rng() - 0.5) * b.radius * 2);
          anim.birds = L.points(pos, '#ff5a3a', 4, 1);
          root.add(anim.birds);
          return root;
        },
        update(dt, t) {
          falls.offset.y = -t * 0.8;
          for (const p of anim.pods) p.material.emissiveIntensity = 1.3 + Math.sin(t * 3) * 0.4;
          if (anim.birds) anim.birds.rotation.y = t * 0.03;
        },
      };
    },
  };
})();

// ---------------------------------------------------------------- stormships
/* =====================================================================
   VERDENSSÆT 'stormships' – Stormskibene (bane 9)
   En flåde af flyvende sejlskibe i tordenvejr: våde dæk, skrog med
   kanoner og lanterner, svingende ankre, ræer, rigning, gangspil,
   master med udkigstønder, regn og lyn.
   ===================================================================== */
(function () {
  'use strict';

  window.SKYHOJ_THEMES.stormships = {
    top: '#1a2230', horizon: '#56637a', bottom: '#2e2a36', sunElev: 40, sunAz: 120, sunColor: '#c8d6f0', sunInt: 1.9,
    hemiSky: '#8a9ab6', hemiInt: 1.1, fog: '#3e4a5c', fogNear: 45, fogFar: 400, cloud: '#5a6474', clouds: 1, stars: 0,
    stone: '#9aa2ae', exposure: 1.18, lavaGlow: 1.25,
  };

  window.SKYHOJ_KITS.stormships = {
    id: 'stormships',
    name: 'Stormskibene',
    variants: {
      deck: 'Vådt skibsdæk med tjærede fuger, mørkt skrog med kanonporte under (standard for p). Kasse w 3-10, d 4-20',
      bow: 'Skibsstævn: dæk på et skrog, der spidser til under (godt til smalle platforme). Kasse w 2-5',
      top: 'Udkigstønde/mastetop: rund tønde på en mast (standard for cyl). shape:"cyl" w 1.5-4',
      plank: 'Løs planke (standard for crumble): revnet, slidt træ. Kasse w 1.5-3',
      anchor: 'Stort jernanker hængende i kæde (standard for swing). Kasse w 2-4',
      flagship: 'Flagskibets agterdæk med messing og lanterner (standard for start/finish). w 8-14',
    },
    barVariants: 'Stænger er ræer (rundholt med sejl foldet op); trapez er rigning (tov). Svævebaner er tovværk. Krogpunkter er jernringe på mastetoppe.',
    create(ctx) {
      const { THREE } = ctx;
      const L = window.SKYHOJ_KITLIB(ctx);
      const PI = Math.PI, TAU = L.TAU, tr = L.tr;
      const rng = ctx.mulberry32(900 + ctx.levelIndex);
      const anim = { rain: null, flash: null, flashT: 0, lanterns: [], ships: [] };

      const deckTex = L.tex(256, (g, S) => {
        for (let x = 0; x < S; x += 22) { g.fillStyle = ['#6a5038', '#5e4632', '#735a40'][(x / 22) % 3]; g.fillRect(x, 0, 22, S); g.fillStyle = '#1e1610'; g.fillRect(x, 0, 2, S); }
        g.fillStyle = '#2a2018'; for (let y = 0; y < S; y += 96) for (let x = 0; x < S; x += 22) g.fillRect(x, y + (x % 44), 22, 2);
      });
      const hullTex = L.tex(256, (g, S) => {
        for (let y = 0; y < S; y += 18) { g.fillStyle = ['#3a2a20', '#33251c', '#402e22'][(y / 18) % 3]; g.fillRect(0, y, S, 18); g.fillStyle = '#1a120c'; g.fillRect(0, y, S, 2); }
        g.fillStyle = '#c8a040'; g.fillRect(0, 10, S, 5);
        g.fillStyle = '#120c08'; for (let x = 30; x < S; x += 80) g.fillRect(x, 60, 26, 22);
      });
      const crackTex = L.tex(256, (g, S) => {
        for (let x = 0; x < S; x += 32) { g.fillStyle = ['#7a6248', '#6a5440'][(x / 32) % 2]; g.fillRect(x, 0, 32, S); }
        L.cracks(g, S, S, '#1a1008', 16, rng, 3);
      });
      const sailTex = L.tex(128, (g, S) => { L.fill(g, S, S, '#d8ccb0'); g.strokeStyle = '#b8a888'; g.lineWidth = 2; for (let x = 0; x < S; x += 16) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, S); g.stroke(); } });
      const M = {
        wetDeck: L.phys({ map: deckTex, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.1 }),
        hull: L.std({ map: hullTex, roughness: 0.7 }),
        plank: L.std({ map: crackTex, roughness: 0.85 }),
        wood: L.std({ color: '#5a4030', roughness: 0.8 }),
        iron: L.std({ color: '#2e3036', roughness: 0.45, metalness: 0.85 }),
        brass: L.std({ color: '#c8a040', roughness: 0.3, metalness: 0.9 }),
        rope: L.std({ color: '#a88a5a', roughness: 0.9 }),
        sail: L.std({ map: sailTex, roughness: 0.85, side: THREE.DoubleSide }),
        lantern: L.std({ color: '#ffd88a', emissive: '#ffb040', emissiveIntensity: 2.2 }),
        bounce: L.std({ color: '#5a6a8a', roughness: 0.4, emissive: '#3a5aaa', emissiveIntensity: 0.3 }),
      };
      const variantOf = (p) => p.v || (p.type === 'start' || p.type === 'finish' ? 'flagship' : p.type === 'crumble' ? 'plank'
        : p.swing ? 'anchor' : p.shape === 'cyl' ? 'top' : Math.min(p.w, p.d) < 3 ? 'bow' : 'deck');

      const ship = (len) => { // kulisseskib: skrog, master og sejl
        const s = new THREE.Group();
        const hull = new THREE.Mesh(tr(new THREE.CylinderGeometry(len * 0.16, len * 0.06, len, 8, 1, false, 0, PI).rotateZ(PI / 2).rotateX(PI)), M.hull);
        hull.scale.set(1, 1, 0.7); s.add(hull);
        for (let k = -1; k <= 1; k++) {
          const mast = new THREE.Mesh(tr(new THREE.CylinderGeometry(0.4, 0.5, len * 0.8, 6)), M.wood);
          mast.position.set(k * len * 0.28, len * 0.4, 0); s.add(mast);
          const sail = new THREE.Mesh(tr(new THREE.PlaneGeometry(len * 0.3, len * 0.35, 4, 4)), M.sail);
          sail.position.set(k * len * 0.28, len * 0.45, 0.6); sail.rotation.y = PI / 2; s.add(sail);
        }
        return s;
      };

      return {
        ventColor: '#cfe0ff',
        slickColor: '#7ab8ff',
        platform(p) {
          const g = new THREE.Group();
          const v = variantOf(p), minD = Math.min(p.w, p.d);
          if (v === 'top') {
            g.add(L.block(p, { top: M.wetDeck, side: M.wood }, 1.5, { segments: 16 }));
            const band = new THREE.Mesh(tr(new THREE.CylinderGeometry(p.w / 2 + 0.03, p.w / 2 + 0.03, 0.12, 16, 1, true)), M.iron);
            band.position.y = -p.h * 0.2; g.add(band);
            const mast = L.pillar(p, M.wood, 22, p.w * 0.36, 2); if (mast) g.add(mast);
          } else if (v === 'anchor') {
            g.add(L.block(p, { top: M.iron, side: M.iron }, 2));
            const fl = new THREE.Mesh(tr(new THREE.TorusGeometry(minD * 0.45, 0.18, 8, 16, PI)), M.iron);
            fl.rotation.z = PI; fl.position.y = -p.h / 2 - 0.2; g.add(fl);
          } else if (v === 'plank') {
            g.add(L.block(p, { top: M.plank, side: M.plank }, 2));
          } else {
            g.add(L.block(p, { top: M.wetDeck, side: M.hull }, 2, { sideTile: Math.max(1, p.h) }));
            const hull = L.under(p, M.hull, v === 'bow' ? 3 : 2 + minD * 0.5, { tip: v === 'bow' ? 0.15 : 0.45, segments: 6 });
            if (hull) g.add(hull);
            if (v === 'flagship') {
              for (const sx of [-1, 1]) {
                const lan = new THREE.Mesh(tr(new THREE.SphereGeometry(0.22, 10, 8)), M.lantern);
                lan.position.set(sx * (p.w / 2 + 0.2), -p.h / 2 - 0.2, p.d * 0.45); g.add(lan); anim.lanterns.push(lan);
              }
            }
          }
          if (p.type === 'bounce') g.children[0].material = [M.hull, M.hull, M.bounce, M.hull, M.hull, M.hull];
          if (p.type === 'conveyor') g.children[0].material = [M.hull, M.hull, L.std({ map: L.beltTex('#3a2a20', '#4a3a2a', '#c8a040'), roughness: 0.8 }), M.hull, M.hull, M.hull];
          if (p.type === 'vent') g.children[0].material = [M.hull, M.hull, L.std({ map: L.grateTex('#1a120c', '#5a4030'), roughness: 0.8 }), M.hull, M.hull, M.hull];
          return g;
        },
        spinArm(p) { // gangspillets håndspager
          const arm = new THREE.Mesh(tr(new THREE.CylinderGeometry(0.16, 0.16, p.bar, 8).rotateZ(PI / 2)), M.wood);
          return arm;
        },
        bar(b) { // rå med et sammenrullet sejl
          const g = new THREE.Group();
          g.add(L.barMesh(b, M.wood, b.r * 1.15));
          const furl = new THREE.Mesh(tr(new THREE.CylinderGeometry(b.r * 2.2, b.r * 2.2, b.len * 0.8, 10).rotateZ(PI / 2)), M.sail);
          furl.position.y = b.r * 3.4; g.add(furl);
          return g;
        },
        anchor() {
          const g = new THREE.Group();
          g.add(new THREE.Mesh(tr(new THREE.CylinderGeometry(0.14, 0.18, 0.5, 8)), M.brass));
          const top = new THREE.Mesh(tr(new THREE.SphereGeometry(0.18, 10, 8)), M.lantern); top.position.y = 0.3; g.add(top);
          return g;
        },
        zip(z) {
          const a = new THREE.Vector3(z.ax, z.ay, z.az), b = new THREE.Vector3(z.bx, z.by, z.bz);
          return L.tube([a, a.clone().lerp(b, 0.5).add(new THREE.Vector3(0, -0.25, 0)), b], 0.045, M.rope, 20);
        },
        decor(data) {
          const root = new THREE.Group();
          const b = data.bounds, R0 = b.radius + 40;
          L.place(data, rng, 14, R0, R0 + 260, b.minY - 20, b.maxY + 10, 25, (x, y, z) => {
            const s = ship(30 + rng() * 40); s.position.set(x, y, z); s.rotation.y = rng() * TAU;
            root.add(s); anim.ships.push({ m: s, ph: rng() * TAU });
          });
          // Regn: lodrette streger som punkter, der falder
          const pos = [];
          for (let i = 0; i < 2500; i++) pos.push(b.cx + (rng() - 0.5) * b.radius * 2.6, b.minY - 20 + rng() * 80, b.cz + (rng() - 0.5) * b.radius * 2.6);
          anim.rain = L.points(pos, '#bcd0ee', 1.6, 0.55);
          anim.rain.material.fog = true;
          root.add(anim.rain);
          // Lyn: et stort lysglimt i skyerne (blinker af og til)
          anim.flash = new THREE.Mesh(tr(new THREE.PlaneGeometry(800, 400)), tr(new THREE.MeshBasicMaterial({ color: '#dfe8ff', transparent: true, opacity: 0, fog: false, depthWrite: false, blending: THREE.AdditiveBlending })));
          anim.flash.position.set(b.cx + 600, b.maxY + 200, b.cz - 600); anim.flash.lookAt(b.cx, b.maxY, b.cz);
          root.add(anim.flash);
          return root;
        },
        update(dt, t) {
          if (anim.rain) anim.rain.position.y = -((t * 30) % 40);
          if (anim.flash) {
            anim.flashT -= dt;
            if (anim.flashT < -4 - (Math.sin(t * 1.7) + 1) * 3) anim.flashT = 0.25;
            anim.flash.material.opacity = anim.flashT > 0 ? 0.6 * Math.abs(Math.sin(anim.flashT * 40)) : 0;
          }
          for (const s of anim.ships) { s.m.position.y += Math.sin(t * 0.6 + s.ph) * dt * 0.8; s.m.rotation.z = Math.sin(t * 0.5 + s.ph) * 0.04; }
          for (const l of anim.lanterns) l.material.emissiveIntensity = 2 + Math.sin(t * 6) * 0.3;
        },
      };
    },
  };
})();

// ---------------------------------------------------------------- starfield
/* =====================================================================
   VERDENSSÆT 'starfield' – Himlens ende (bane 10)
   Rummets kant: små meteorer med glødende krystalårer, jern-nikkel-
   klumper, kometis og farvede mineraler, en satellit med solpaneler,
   gitterstænger, stjerner som krogpunkter, planeter og en tåge.
   ===================================================================== */
(function () {
  'use strict';

  window.SKYHOJ_THEMES.starfield = {
    top: '#03020c', horizon: '#2a1650', bottom: '#1c0a24', sunElev: 28, sunAz: 35, sunColor: '#d6e0ff', sunInt: 2.4,
    hemiSky: '#8a7ad8', hemiInt: 1.0, fog: '#120a26', fogNear: 140, fogFar: 950, cloud: '#3a2a66', clouds: 0, stars: 1,
    stone: '#9a94b0', exposure: 1.22, lavaGlow: 1.1, moon: false,
  };

  window.SKYHOJ_KITS.starfield = {
    id: 'starfield',
    name: 'Himlens ende',
    variants: {
      crystal: 'Meteor med glødende cyan krystalårer og krystaller under (standard for p). Kasse/cyl w 1-4',
      iron: 'Jern-nikkel-meteor: metallisk, Widmanstätten-mønster i toppen. Kasse/cyl w 1-4',
      comet: 'Kometis: blåhvid, frostet, med en svag hale af støv (standard for bevægelige). w 1-4',
      mineral: 'Farvestribet mineral (lilla/orange lag). Kasse/cyl w 1-4',
      deck: 'Satellittens hviledæk: lyst metal med lysende kanter og solpaneler under (standard for start/finish). w 4-12',
      moon: 'Lille måneklippe: grå-lilla med kratere. shape:"cyl" w 1-3',
    },
    barVariants: 'Stænger er lette rumgitter (rør med skrå afstivere). Krogpunkter er stjerner. Svævebaner er lysende kabler.',
    create(ctx) {
      const { THREE } = ctx;
      const L = window.SKYHOJ_KITLIB(ctx);
      const PI = Math.PI, TAU = L.TAU, tr = L.tr;
      const rng = ctx.mulberry32(1000 + ctx.levelIndex);
      const anim = { spin: [], twinkle: [] };

      const rockTex = (base, spots) => L.tex(256, (g, S) => { L.fill(g, S, S, base); L.speckle(g, S, S, spots, 600, 1, 6, rng); });
      const veins = L.tex(256, (g, S) => { L.fill(g, S, S, '#000'); L.cracks(g, S, S, '#4ff6ff', 10, rng, 4); L.cracks(g, S, S, '#c8fbff', 6, rng, 1.5); });
      const widman = L.tex(256, (g, S) => {
        L.fill(g, S, S, '#6c6a70'); g.lineWidth = 2;
        for (let i = 0; i < 70; i++) {
          const a = [0, PI / 3, -PI / 3][i % 3], x = rng() * S, y = rng() * S, l = 30 + rng() * 80;
          g.strokeStyle = rng() < 0.5 ? '#8f8c94' : '#4c4a50';
          g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
        }
      });
      const bands = L.tex(256, (g, S) => {
        const cols = ['#5b2a7a', '#c45a2a', '#7a3a8a', '#e09040', '#3a1a5a', '#a04a6a'];
        for (let y = 0; y < S; y += 12) { g.fillStyle = cols[Math.floor(rng() * cols.length)]; g.fillRect(0, y, S, 12 + rng() * 10); }
        L.speckle(g, S, S, ['#ffffff', '#000000'], 200, 1, 3, rng);
      });
      const deckTex = L.tex(256, (g, S) => {
        L.fill(g, S, S, '#c8ccd8'); g.strokeStyle = '#8a90a0'; g.lineWidth = 3;
        for (let i = 0; i <= S; i += 64) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, S); g.moveTo(0, i); g.lineTo(S, i); g.stroke(); }
        g.fillStyle = '#5a6070'; for (let i = 32; i < S; i += 64) for (let j = 32; j < S; j += 64) { g.beginPath(); g.arc(i, j, 4, 0, TAU); g.fill(); }
      });
      const panelTex = L.tex(128, (g, S) => {
        L.fill(g, S, S, '#152a6a'); g.strokeStyle = '#7a9ae0'; g.lineWidth = 2;
        for (let i = 0; i <= S; i += 16) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, S); g.moveTo(0, i); g.lineTo(S, i); g.stroke(); }
      });
      const M = {
        crystalTop: L.std({ map: rockTex('#3a3448', ['#4c4460', '#26202f']), roughness: 0.85, emissive: '#3ff0ff', emissiveMap: veins, emissiveIntensity: 1.2 }),
        crystalSide: L.std({ map: rockTex('#2e2a3a', ['#423a52', '#1a1622']), roughness: 0.9, emissive: '#2ad8ff', emissiveMap: veins, emissiveIntensity: 0.8 }),
        ironTop: L.std({ map: widman, roughness: 0.32, metalness: 0.9 }),
        ironSide: L.std({ map: rockTex('#4a4448', ['#6a6266', '#2a2628', '#7a4a30']), roughness: 0.5, metalness: 0.75 }),
        comet: L.phys({ map: rockTex('#d8eaff', ['#ffffff', '#a8c8f0']), roughness: 0.25, clearcoat: 0.6, emissive: '#1a3a6a', emissiveIntensity: 0.25 }),
        mineral: L.std({ map: bands, roughness: 0.6, metalness: 0.15 }),
        moon: L.std({ map: rockTex('#8a8498', ['#6a6478', '#a8a2b8', '#5a5468']), roughness: 0.95 }),
        deck: L.std({ map: deckTex, roughness: 0.4, metalness: 0.6 }),
        deckSide: L.std({ color: '#7a8090', roughness: 0.35, metalness: 0.8, emissive: '#2a6aff', emissiveIntensity: 0.25 }),
        panel: L.std({ map: panelTex, roughness: 0.25, metalness: 0.6, emissive: '#0a1a50', emissiveIntensity: 0.6 }),
        truss: L.std({ color: '#c8ccd6', roughness: 0.3, metalness: 0.9 }),
        crystal: L.phys({ color: '#7ff6ff', roughness: 0.05, transmission: 0.4, thickness: 0.5, emissive: '#2ad0ff', emissiveIntensity: 0.9 }),
        star: L.std({ color: '#fff4c8', emissive: '#ffd860', emissiveIntensity: 2.6, roughness: 0.3 }),
        cable: L.std({ color: '#9fe8ff', emissive: '#4fd8ff', emissiveIntensity: 1.2 }),
        crackGlow: L.std({ map: rockTex('#3a2a2a', ['#2a1a1a', '#4a3030']), roughness: 0.9, emissive: '#ff6a20', emissiveMap: veins, emissiveIntensity: 1.4 }),
      };
      const variantOf = (p) => p.v || (p.type === 'start' || p.type === 'finish' ? 'deck' : p.type === 'crumble' ? 'crumble'
        : p.kin || p.type === 'ice' ? 'comet' : ['crystal', 'iron', 'mineral', 'crystal'][p.index % 4]);
      const looks = {
        crystal: [M.crystalTop, M.crystalSide], iron: [M.ironTop, M.ironSide], comet: [M.comet, M.comet],
        mineral: [M.mineral, M.mineral], deck: [M.deck, M.deckSide], moon: [M.moon, M.moon], crumble: [M.crackGlow, M.crackGlow],
      };

      return {
        ventColor: '#a8f4ff',
        platform(p) {
          const g = new THREE.Group();
          const v = variantOf(p), [top, side] = looks[v] || looks.crystal;
          g.add(L.block(p, { top, side }, 1.5, { segments: v === 'deck' ? 40 : 9 }));
          if (v === 'deck') {
            // solpaneler og antenne under dækket (inden for fodaftrykket)
            const dep = L.depth(p, 4);
            if (dep > 1) {
              const core = L.pillar(p, M.deckSide, dep, Math.min(p.w, p.d) * 0.3);
              if (core) g.add(core);
              const pan = new THREE.Mesh(tr(new THREE.BoxGeometry(p.w * 0.95, 0.06, Math.min(p.d, p.w) * 0.4)), M.panel);
              pan.position.y = -p.h / 2 - dep * 0.6;
              g.add(pan);
            }
          } else {
            // ru meteorklippe under den flade top
            const r = (p.shape === 'cyl' ? p.w : Math.min(p.w, p.d)) * 0.5;
            const dep = L.depth(p, r * 2.4 + 1);
            if (dep > 0.4) {
              const rock = new THREE.Mesh(tr(ctx.rockGeometry(r, dep, p.seed)), side);
              rock.position.y = -p.h / 2 - dep / 2 + 0.02;
              if (p.shape !== 'cyl') rock.scale.set(p.w / (2 * r) * 0.95, 1, p.d / (2 * r) * 0.95);
              g.add(rock);
              if (v === 'crystal') { // krystaller, der stikker ned/ud under kanten
                const n = 3 + Math.floor(p.seed % 3);
                for (let i = 0; i < n; i++) {
                  const c = new THREE.Mesh(tr(new THREE.OctahedronGeometry(0.25 + (p.seed % 7) * 0.04, 0)), M.crystal);
                  const a = i / n * TAU + p.seed;
                  c.position.set(Math.cos(a) * r * 0.45, -p.h / 2 - dep * (0.3 + 0.15 * i / n), Math.sin(a) * r * 0.45);
                  c.scale.set(0.7, 1.8, 0.7);
                  g.add(c);
                }
              }
            }
          }
          if (p.type === 'spin') anim.spin.push(g);
          return g;
        },
        spinArm(p) { // solpanel-arm på satellitten
          const g = new THREE.Group();
          const rod = new THREE.Mesh(tr(new THREE.BoxGeometry(p.bar, 0.12, 0.12)), M.truss);
          g.add(rod);
          for (const sx of [-1, 1]) {
            const pan = new THREE.Mesh(tr(new THREE.BoxGeometry(p.bar * 0.4, 0.05, 0.9)), M.panel);
            pan.position.x = sx * p.bar * 0.28;
            g.add(pan);
          }
          return g;
        },
        bar(b) { // rumgitter
          const g = new THREE.Group();
          g.add(L.barMesh(b, M.truss));
          const n = Math.max(2, Math.round(b.len / 0.6));
          const strut = tr(new THREE.CylinderGeometry(0.018, 0.018, 0.5, 6));
          for (let i = 0; i < n; i++) {
            const s = new THREE.Mesh(strut, M.truss);
            s.position.set(-b.len / 2 + (i + 0.5) * b.len / n, 0.2, 0);
            s.rotation.z = i % 2 ? 0.7 : -0.7;
            g.add(s);
          }
          const top = new THREE.Mesh(tr(new THREE.CylinderGeometry(0.025, 0.025, b.len, 6).rotateZ(PI / 2)), M.truss);
          top.position.y = 0.4;
          g.add(top);
          return g;
        },
        anchor() { // stjerne
          const g = new THREE.Group();
          const s = new THREE.Mesh(tr(new THREE.OctahedronGeometry(0.32, 0)), M.star);
          const s2 = s.clone(); s2.rotation.set(PI / 4, PI / 4, 0); s2.scale.setScalar(0.8);
          g.add(s, s2);
          anim.twinkle.push(g);
          return g;
        },
        zip(z) {
          const a = new THREE.Vector3(z.ax, z.ay, z.az), b = new THREE.Vector3(z.bx, z.by, z.bz);
          return L.tube([a, b], 0.035, M.cable, 8);
        },
        decor(data) {
          const root = new THREE.Group();
          const b = data.bounds, R0 = b.radius + 80;
          // Planeter (ingen tåge – de er langt væk)
          const planet = (r, cols, x, y, z, ring) => {
            const t = L.tex(256, (g, S) => {
              for (let yy = 0; yy < S; yy += 8) { g.fillStyle = cols[Math.floor(rng() * cols.length)]; g.fillRect(0, yy, S, 8 + rng() * 14); }
            });
            const m = new THREE.Mesh(tr(new THREE.SphereGeometry(r, 48, 24)), L.std({ map: t, roughness: 0.9, fog: false, emissive: cols[0], emissiveIntensity: 0.15 }));
            m.material.fog = false;
            m.position.set(x, y, z);
            root.add(m);
            if (ring) {
              const rg = new THREE.Mesh(tr(new THREE.RingGeometry(r * 1.4, r * 2.1, 64)), tr(new THREE.MeshBasicMaterial({ color: ring, transparent: true, opacity: 0.55, side: THREE.DoubleSide, fog: false, depthWrite: false })));
              rg.position.copy(m.position); rg.rotation.set(1.2, 0.3, 0.2);
              root.add(rg);
            }
            anim.spin.push(m);
          };
          planet(180, ['#c46a3a', '#e8a060', '#8a4a2a', '#f2c890'], b.cx + 900, b.maxY + 220, b.cz - 700, '#e8d0a8');
          planet(90, ['#3a6ac8', '#6aa0e8', '#2a3a8a'], b.cx - 700, b.maxY + 160, b.cz + 500, null);
          planet(40, ['#8a8a9a', '#b0b0c0', '#6a6a7a'], b.cx + 300, b.maxY + 90, b.cz + 650, null);
          // Tåge: store, svagt lysende flader
          for (let i = 0; i < 5; i++) {
            const neb = L.tex(256, (g, S) => {
              const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
              gr.addColorStop(0, ['rgba(180,80,255,0.5)', 'rgba(60,160,255,0.45)', 'rgba(255,90,170,0.4)'][i % 3]);
              gr.addColorStop(1, 'rgba(0,0,0,0)');
              g.fillStyle = gr; g.fillRect(0, 0, S, S);
            }, { repeat: false });
            const m = new THREE.Mesh(tr(new THREE.PlaneGeometry(900, 600)), tr(new THREE.MeshBasicMaterial({ map: neb, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending })));
            const a = i / 5 * TAU;
            m.position.set(b.cx + Math.cos(a) * 1500, b.maxY + 100 + i * 60, b.cz + Math.sin(a) * 1500);
            m.lookAt(b.cx, b.maxY, b.cz);
            root.add(m);
          }
          // Asteroider rundt om banen
          const ast = [];
          L.place(data, rng, 90, R0, R0 + 400, b.minY - 60, b.maxY + 60, 15, (x, y, z) => ast.push({ x, y, z, s: 1.5 + rng() * 9, rx: rng() * 3, ry: rng() * 3 }));
          root.add(L.instanced(new THREE.DodecahedronGeometry(1, 0), M.ironSide, ast));
          // Ekstra stjerner tæt på (glimtende)
          const pos = [];
          for (let i = 0; i < 1500; i++) { const a = rng() * TAU, e = (rng() - 0.3) * PI, r = 1600; pos.push(b.cx + Math.cos(a) * Math.cos(e) * r, b.maxY + Math.sin(e) * r, b.cz + Math.sin(a) * Math.cos(e) * r); }
          const stars = L.points(pos, '#ffffff', 1.6, 0.9);
          root.add(stars); anim.twinkle.push(stars);
          return root;
        },
        update(dt, t) {
          for (const s of anim.spin) s.rotation.y += dt * 0.05;
          for (const s of anim.twinkle) if (s.material) s.material.opacity = 0.7 + Math.sin(t * 3) * 0.2; else s.rotation.y = t * 1.2;
        },
      };
    },
  };
})();

// ---------------------------------------------------------------- temple
/* =====================================================================
   VERDENSSÆT 'temple' – Kirsebærtemplet (bane 11)
   Pagoder med røde lakvægge og tagskæg, stentrapper med mos, buede
   broer, lotusblade, torii-porte og bambus som stænger, lanternesnore,
   tempelklokker, kirsebærtræer og faldende kronblade.
   ===================================================================== */
(function () {
  'use strict';

  window.SKYHOJ_THEMES.temple = {
    top: '#7fb6f0', horizon: '#ffd9e4', bottom: '#f4c2cc', sunElev: 32, sunAz: -55, sunColor: '#fff0dc', sunInt: 3.0,
    hemiSky: '#f0dcea', hemiInt: 1.0, fog: '#f6d6e0', fogNear: 90, fogFar: 600, cloud: '#fff4f8', clouds: 0.8, stars: 0,
    stone: '#d8ccc0', exposure: 1.02, lavaGlow: 0.85,
  };

  window.SKYHOJ_KITS.temple = {
    id: 'temple',
    name: 'Kirsebærtemplet',
    variants: {
      pagoda: 'Pagodeetage: træplanker på toppen, røde lakvægge med guldbånd og mørkt tegltag under (standard for p). Kasse/cyl w 3-10',
      stone: 'Tempeltrappe af lys granit med mos i fugerne. Kasse w 3-8',
      bridge: 'Rød buebro: planker på tværs, røde sider og en bue under. Kasse w 2.5-4, d 6-16',
      lantern: 'Stenlanterne (toro): rund stentop med lys ovenpå siderne. shape:"cyl" w 1.5-3',
      koi: 'Trædæk over en koidam (blåt vand med fisk under). Kasse w 5-10',
      moongate: 'Hvid kalket terrasse med en rund måneport-mosaik i toppen (standard for finish). w 8-12',
      courtyard: 'Tempelgård med grus rivet i bølger (standard for start). w 8-12',
    },
    barVariants: 'Stænger er røde torii-bjælker med sorte ender; b.v "bamboo" giver grøn bambus med led. Svævebaner er snore med papirlanterner. Krogpunkter er tempelklokker.',
    create(ctx) {
      const { THREE } = ctx;
      const L = window.SKYHOJ_KITLIB(ctx);
      const PI = Math.PI, TAU = L.TAU, tr = L.tr;
      const rng = ctx.mulberry32(1100 + ctx.levelIndex);
      const anim = { petals: null, lanterns: [], sway: [] };

      const planks = L.tex(256, (g, S) => {
        for (let y = 0; y < S; y += 32) { g.fillStyle = ['#b07a4a', '#a06a3e', '#bd8656', '#9a643a'][(y / 32) % 4]; g.fillRect(0, y, S, 32); g.fillStyle = '#5a3a20'; g.fillRect(0, y, S, 2); }
        g.globalAlpha = 0.25; for (let i = 0; i < 120; i++) { g.fillStyle = '#4a2a14'; g.fillRect(rng() * S, rng() * S, 20 + rng() * 60, 1); } g.globalAlpha = 1;
      });
      const lacquer = L.tex(256, (g, S) => {
        L.fill(g, S, S, '#b3261e');
        g.fillStyle = '#e8b84a'; g.fillRect(0, 0, S, 18); g.fillStyle = '#7a1410'; g.fillRect(0, 18, S, 6);
        g.fillStyle = '#8f1a14'; for (let x = 0; x < S; x += 64) g.fillRect(x, 24, 10, S);
      });
      const granite = L.tex(256, (g, S) => {
        L.fill(g, S, S, '#cfc6ba'); L.speckle(g, S, S, ['#b8aea0', '#e4dcd2', '#9a9086'], 700, 1, 3, rng);
        g.strokeStyle = '#6f8a3a'; g.lineWidth = 4; for (let i = 0; i <= S; i += 128) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, S); g.moveTo(0, i); g.lineTo(S, i); g.stroke(); }
      });
      const gravel = L.tex(256, (g, S) => {
        L.fill(g, S, S, '#e2dccf'); L.speckle(g, S, S, ['#cfc7b8', '#f2ede2', '#b8b0a0'], 1200, 1, 2.5, rng);
        g.strokeStyle = 'rgba(150,140,120,0.5)'; g.lineWidth = 3;
        for (let y = 8; y < S; y += 16) { g.beginPath(); for (let x = 0; x <= S; x += 8) g.lineTo(x, y + Math.sin(x / S * TAU * 2) * 5); g.stroke(); }
      });
      const moonTex = L.tex(256, (g, S) => {
        L.fill(g, S, S, '#f3eee4');
        g.strokeStyle = '#b3261e'; g.lineWidth = 10; g.beginPath(); g.arc(S / 2, S / 2, S * 0.4, 0, TAU); g.stroke();
        g.fillStyle = '#e8b84a'; g.beginPath(); g.arc(S / 2, S / 2, S * 0.12, 0, TAU); g.fill();
      }, { repeat: false });
      const water = L.tex(256, (g, S) => {
        L.grad(g, S, S, [[0, '#2a7aa0'], [1, '#1a4a70']]);
        for (let i = 0; i < 6; i++) { g.fillStyle = rng() < 0.5 ? '#ff7a2a' : '#ffffff'; g.beginPath(); g.ellipse(rng() * S, rng() * S, 14, 6, rng() * PI, 0, TAU); g.fill(); }
      });
      const cracked = L.tex(256, (g, S) => {
        for (let y = 0; y < S; y += 32) { g.fillStyle = ['#8a6a4a', '#7a5a3a'][(y / 32) % 2]; g.fillRect(0, y, S, 32); }
        L.cracks(g, S, S, '#2a1a10', 16, rng, 3);
      });
      const M = {
        planks: L.std({ map: planks, roughness: 0.75 }),
        lacquer: L.std({ map: lacquer, roughness: 0.35, metalness: 0.1 }),
        roof: L.std({ color: '#2f3640', roughness: 0.55, metalness: 0.3 }),
        granite: L.std({ map: granite, bumpMap: granite, bumpScale: 1, roughness: 0.9 }),
        gravel: L.std({ map: gravel, roughness: 0.95 }),
        moon: L.std({ map: moonTex, roughness: 0.8 }),
        plaster: L.std({ color: '#f3eee4', roughness: 0.9 }),
        water: L.phys({ map: water, roughness: 0.08, clearcoat: 1 }),
        lotus: L.std({ color: '#4caa4a', roughness: 0.55 }),
        lotusSide: L.std({ color: '#2f7a3a', roughness: 0.6 }),
        pink: L.std({ color: '#ff9ec4', roughness: 0.6, emissive: '#ff5a9a', emissiveIntensity: 0.15 }),
        cracked: L.std({ map: cracked, roughness: 0.9 }),
        black: L.std({ color: '#1e1e22', roughness: 0.5 }),
        bamboo: L.std({ color: '#7ab04a', roughness: 0.45 }),
        bambooNode: L.std({ color: '#5a8a34', roughness: 0.5 }),
        bronze: L.std({ color: '#a8743a', roughness: 0.35, metalness: 0.85 }),
        paper: L.std({ color: '#ff5a3a', emissive: '#ff6a2a', emissiveIntensity: 0.8, roughness: 0.7 }),
        paperW: L.std({ color: '#fff4dc', emissive: '#ffd890', emissiveIntensity: 0.7, roughness: 0.7 }),
        rope: L.std({ color: '#c8a46a', roughness: 0.85 }),
        blossom: L.std({ color: '#ffb6d2', roughness: 0.8, emissive: '#ff8ab8', emissiveIntensity: 0.12 }),
        trunk: L.std({ color: '#4a3028', roughness: 0.9 }),
        mountain: L.std({ color: '#8a9ab8', roughness: 1 }),
        snow: L.std({ color: '#f4f6fa', roughness: 0.9 }),
      };
      const variantOf = (p) => p.v || (p.type === 'start' ? 'courtyard' : p.type === 'finish' ? 'moongate' : p.type === 'crumble' ? 'crumble'
        : p.type === 'bounce' ? 'lotus' : p.d >= 6 && p.w <= 4 ? 'bridge' : p.shape === 'cyl' && p.w <= 3 ? 'lantern' : 'pagoda');

      return {
        ventColor: '#ffe6f0',
        platform(p) {
          const g = new THREE.Group();
          const v = variantOf(p);
          const minD = Math.min(p.w, p.d);
          if (v === 'pagoda' || p.type === 'rot' || p.type === 'spin') {
            g.add(L.block(p, { top: M.planks, side: M.lacquer }, 2, { sideTile: p.h }));
            // mørkt tegltag (indenfor fodaftrykket) og en rød stamme under
            const roof = L.under(p, M.roof, Math.min(1.6, minD * 0.4), { tip: 0.55, segments: 4 });
            if (roof) g.add(roof);
            const post = L.pillar(p, M.lacquer, 14, minD * 0.32, 3);
            if (post) { post.position.y -= 1.2; g.add(post); }
          } else if (v === 'stone') {
            g.add(L.block(p, { top: M.granite, side: M.granite }, 2));
            const u = L.under(p, M.granite, 5, { jitter: 0.2 }); if (u) g.add(u);
          } else if (v === 'bridge') {
            g.add(L.block(p, { top: M.planks, side: M.lacquer }, 2, { sideTile: p.h }));
            const dep = L.depth(p, p.d * 0.25);
            if (dep > 0.3) { // bue under broen
              const arch = new THREE.Mesh(tr(new THREE.CylinderGeometry(p.d / 2 * 0.98, p.d / 2 * 0.98, p.w * 0.9, 24, 1, false, -PI / 2, PI).rotateZ(PI / 2).rotateY(PI / 2)), M.lacquer);
              arch.scale.y = dep / (p.d / 2); arch.position.y = -p.h / 2;
              g.add(arch);
            }
          } else if (v === 'lantern') {
            g.add(L.block(p, { top: M.granite, side: M.granite }, 1.5, { segments: 8 }));
            const glow = new THREE.Mesh(tr(new THREE.CylinderGeometry(p.w * 0.3, p.w * 0.3, 0.5, 8)), M.paperW);
            glow.position.y = -p.h / 2 - 0.25; g.add(glow);
            const col = L.pillar(p, M.granite, 6, p.w * 0.32, 2); if (col) { col.position.y -= 0.5; g.add(col); }
          } else if (v === 'koi') {
            g.add(L.block(p, { top: M.planks, side: M.planks }, 2));
            const pond = L.pillar(p, M.water, 0.6, 0.2, 2); if (pond) g.add(pond);
            const u = L.under(p, M.granite, 4, { jitter: 0.2 }); if (u) { u.position.y -= 0.6; g.add(u); }
          } else if (v === 'moongate' || v === 'courtyard') {
            g.add(L.block(p, { top: v === 'moongate' ? M.moon : M.gravel, side: M.plaster }, v === 'moongate' ? (p.shape === 'cyl' ? p.w : Math.min(p.w, p.d)) : 3, { tileTop: v !== 'moongate' }));
            const u = L.under(p, M.granite, 8, { jitter: 0.15 }); if (u) g.add(u);
          } else if (v === 'lotus') { // springpude: et stort lotusblad
            g.add(L.block(p, { top: M.lotus, side: M.lotusSide }, 2, { segments: 24 }));
            const flower = L.lathe([[0.05, 0], [0.35, 0.12], [0.5, 0.35], [0.3, 0.55], [0.01, 0.6]], M.pink, 10);
            flower.position.y = -p.h / 2 - 0.6; flower.rotation.x = PI; g.add(flower);
          } else { // smuldrende: gamle, revnede planker
            g.add(L.block(p, { top: M.cracked, side: M.cracked }, 2));
          }
          if (p.type === 'conveyor') g.children[0].material = [M.lacquer, M.lacquer, L.std({ map: L.beltTex('#5a3a22', '#7a5030', '#e8b84a'), roughness: 0.8 }), M.lacquer, M.lacquer, M.lacquer];
          if (p.type === 'vent') g.children[0].material = [M.granite, M.granite, L.std({ map: L.grateTex('#2a2a30', '#b8a070'), roughness: 0.6 }), M.granite, M.granite, M.granite];
          return g;
        },
        bar(b) {
          const g = new THREE.Group();
          if (b.v === 'bamboo') {
            g.add(L.barMesh(b, M.bamboo));
            const n = Math.max(2, Math.round(b.len / 0.5));
            for (let i = 1; i < n; i++) {
              const node = new THREE.Mesh(tr(new THREE.CylinderGeometry(b.r * 1.25, b.r * 1.25, 0.04, 10).rotateZ(PI / 2)), M.bambooNode);
              node.position.x = -b.len / 2 + i * b.len / n; g.add(node);
            }
          } else { // torii-bjælke
            g.add(L.barMesh(b, M.lacquer, b.r * 1.1));
            for (const sx of [-1, 1]) {
              const cap = new THREE.Mesh(tr(new THREE.BoxGeometry(0.16, b.r * 3, b.r * 3)), M.black);
              cap.position.x = sx * (b.len / 2 - 0.06); g.add(cap);
            }
          }
          return g;
        },
        anchor() { // tempelklokke
          const g = new THREE.Group();
          const bell = L.lathe([[0.01, 0.42], [0.12, 0.4], [0.2, 0.28], [0.24, 0.05], [0.3, -0.12], [0.26, -0.14]], M.bronze, 20);
          bell.position.y = -0.12; g.add(bell);
          return g;
        },
        zip(z) { // lanternesnor
          const g = new THREE.Group();
          const a = new THREE.Vector3(z.ax, z.ay, z.az), b = new THREE.Vector3(z.bx, z.by, z.bz);
          g.add(L.tube([a, b], 0.03, M.rope, 8));
          const n = Math.max(3, Math.round(a.distanceTo(b) / 2.2));
          const lg = tr(new THREE.SphereGeometry(0.24, 12, 8));
          for (let i = 1; i < n; i++) {
            const p = a.clone().lerp(b, i / n);
            const l = new THREE.Mesh(lg, i % 2 ? M.paper : M.paperW);
            l.position.set(p.x, p.y - 0.75, p.z); l.scale.y = 1.3;
            g.add(l); anim.lanterns.push(l);
          }
          for (const p of [a, b]) {
            const post = new THREE.Mesh(tr(new THREE.CylinderGeometry(0.12, 0.14, 4, 8)), M.lacquer);
            post.position.set(p.x, p.y - 1.7, p.z); g.add(post);
          }
          return g;
        },
        decor(data) {
          const root = new THREE.Group();
          const b = data.bounds, R0 = b.radius + 40;
          // Kirsebærtræer på små svævende øer
          const trunks = [], crowns = [];
          L.place(data, rng, 40, R0, R0 + 220, b.minY - 25, b.maxY - 5, 10, (x, y, z) => {
            const s = 1 + rng() * 1.5;
            trunks.push({ x, y: y + 3 * s, z, sx: s, sy: s * 1.2, sz: s, ry: rng() * TAU });
            for (let k = 0; k < 4; k++) crowns.push({ x: x + (rng() - 0.5) * 5 * s, y: y + 7 * s + rng() * 3 * s, z: z + (rng() - 0.5) * 5 * s, s: s * (2.4 + rng() * 1.6) });
            crowns.push({ x, y: y - 1.5 * s, z, s: s * 3.2, sy: s * 1.2, sx: s * 3.6, sz: s * 3.6 }); // ø (grønt græs)
          });
          root.add(L.instanced(new THREE.CylinderGeometry(0.4, 0.7, 6, 7), M.trunk, trunks));
          root.add(L.instanced(new THREE.IcosahedronGeometry(1, 1), M.blossom, crowns));
          // Pagodetårne og torii-porte i det fjerne
          L.place(data, rng, 6, R0 + 120, R0 + 360, b.minY - 40, b.minY - 20, 20, (x, y, z) => {
            const tower = new THREE.Group(); tower.position.set(x, y, z);
            const tiers = 4 + Math.floor(rng() * 3);
            for (let k = 0; k < tiers; k++) {
              const w = 22 - k * 3;
              const body = new THREE.Mesh(tr(new THREE.BoxGeometry(w * 0.7, 7, w * 0.7)), M.lacquer); body.position.y = k * 10 + 3.5;
              const roof = new THREE.Mesh(tr(new THREE.ConeGeometry(w * 0.8, 4, 4).rotateY(PI / 4)), M.roof); roof.position.y = k * 10 + 8.5;
              tower.add(body, roof);
            }
            root.add(tower);
          });
          L.place(data, rng, 8, R0 + 30, R0 + 200, b.minY - 10, b.maxY, 14, (x, y, z, a) => {
            const t = new THREE.Group(); t.position.set(x, y, z); t.rotation.y = -a;
            for (const sx of [-1, 1]) { const c = new THREE.Mesh(tr(new THREE.CylinderGeometry(0.6, 0.7, 14, 10)), M.lacquer); c.position.set(sx * 5, 7, 0); t.add(c); }
            const top = new THREE.Mesh(tr(new THREE.BoxGeometry(15, 1.2, 1.4)), M.black); top.position.y = 14.2;
            const mid = new THREE.Mesh(tr(new THREE.BoxGeometry(12, 0.9, 1)), M.lacquer); mid.position.y = 11.5;
            t.add(top, mid); root.add(t);
          });
          // Bjerge med sne i horisonten
          for (let i = 0; i < 9; i++) {
            const a = i / 9 * TAU + rng() * 0.3, r = b.radius + 700;
            const h = 220 + rng() * 260;
            const m = new THREE.Mesh(tr(new THREE.ConeGeometry(h * 0.9, h, 7)), M.mountain);
            m.position.set(b.cx + Math.cos(a) * r, ctx.lavaY + h / 2 - 20, b.cz + Math.sin(a) * r);
            const cap = new THREE.Mesh(tr(new THREE.ConeGeometry(h * 0.27, h * 0.3, 7)), M.snow);
            cap.position.y = h * 0.36; m.add(cap); root.add(m);
          }
          // Faldende kronblade
          const pos = [];
          for (let i = 0; i < 700; i++) pos.push(b.cx + (rng() - 0.5) * b.radius * 2.4, b.minY + rng() * (b.maxY - b.minY + 40), b.cz + (rng() - 0.5) * b.radius * 2.4);
          anim.petals = L.points(pos, '#ffb0d0', 3, 0.9);
          anim.petals.material.fog = true;
          root.add(anim.petals);
          return root;
        },
        update(dt, t) {
          if (anim.petals) { anim.petals.position.y = -((t * 1.2) % 20); anim.petals.position.x = Math.sin(t * 0.4) * 3; }
          for (let i = 0; i < anim.lanterns.length; i++) anim.lanterns[i].rotation.z = Math.sin(t * 1.5 + i) * 0.12;
        },
      };
    },
  };
})();

// ---------------------------------------------------------------- neoncity
/* =====================================================================
   VERDENSSÆT 'neoncity' – Neonbyen (bane 12)
   Neonby om natten: tagterrasser med neonkanter, flyvende biler og
   busser som bevægelige platforme, rullebånd, tagventiler, neonskilte
   som stænger, el-kabler som svævebaner, droner som krogpunkter,
   hologrammer, regnvåde tage og et hav af oplyste skyskrabere.
   ===================================================================== */
(function () {
  'use strict';

  window.SKYHOJ_THEMES.neoncity = {
    top: '#060414', horizon: '#3a1a5a', bottom: '#2a0a2a', sunElev: 50, sunAz: 160, sunColor: '#b8a8ff', sunInt: 1.6,
    hemiSky: '#7a5ad8', hemiInt: 1.15, fog: '#1e1236', fogNear: 60, fogFar: 520, cloud: '#3a2a5a', clouds: 0.5, stars: 0.4,
    stone: '#a8a0c0', exposure: 1.28, lavaGlow: 1.3,
  };

  window.SKYHOJ_KITS.neoncity = {
    id: 'neoncity',
    name: 'Neonbyen',
    variants: {
      roof: 'Regnvådt tag med neonkant og en oplyst skyskraber under (standard for p). Kasse w 4-12',
      car: 'Flyvende bil: blank karrosseri, forlygter og blå jetglød under (standard for sidelæns bevægelige). Kasse w 2.5-4, d 4-6',
      bus: 'Flyvende bus: lang, gul med oplyste vinduer. Kasse w 3-4, d 8-14',
      billboard: 'Hologram-reklameskilt (standard for finish): toppen er en lysende platform. w 6-12',
      helipad: 'Landingsplads med H og blinkende lys (standard for start og cyl). w 4-12',
      sign: 'Neonskiltets top (standard for smalle platforme). Kasse w 1.5-3',
    },
    barVariants: 'Stænger er neonrør (pink/cyan) i metalrammer. Svævebaner er el-kabler. Krogpunkter er droner med propeller.',
    create(ctx) {
      const { THREE } = ctx;
      const L = window.SKYHOJ_KITLIB(ctx);
      const PI = Math.PI, TAU = L.TAU, tr = L.tr;
      const rng = ctx.mulberry32(1200 + ctx.levelIndex);
      const anim = { drones: [], cars: [], neon: [], holo: [] };
      const NEON = ['#ff3ab8', '#3af6ff', '#ffd23a', '#8a5aff'];

      const roofTex = L.tex(256, (g, S) => {
        L.fill(g, S, S, '#22202c'); L.speckle(g, S, S, ['#2e2c3a', '#16141e', '#3a3848'], 900, 1, 3, rng);
        g.globalAlpha = 0.25; for (let i = 0; i < 12; i++) { g.fillStyle = NEON[i % 4]; g.beginPath(); g.ellipse(rng() * S, rng() * S, 20 + rng() * 30, 6, rng() * PI, 0, TAU); g.fill(); } g.globalAlpha = 1;
      });
      const windows = L.tex(256, (g, S) => {
        L.fill(g, S, S, '#121020');
        for (let y = 6; y < S; y += 16) for (let x = 6; x < S; x += 14) { const r = rng(); g.fillStyle = r < 0.45 ? '#1a1830' : r < 0.75 ? '#ffd890' : r < 0.9 ? '#8ae8ff' : '#ff7ad0'; g.fillRect(x, y, 8, 10); }
      });
      const heli = L.tex(256, (g, S) => {
        L.fill(g, S, S, '#2a2836'); g.strokeStyle = '#ffd23a'; g.lineWidth = 10; g.beginPath(); g.arc(S / 2, S / 2, S * 0.4, 0, TAU); g.stroke();
        g.fillStyle = '#ffd23a'; g.fillRect(S * 0.32, S * 0.3, 18, S * 0.4); g.fillRect(S * 0.6, S * 0.3, 18, S * 0.4); g.fillRect(S * 0.32, S * 0.47, S * 0.36, 16);
      }, { repeat: false });
      const holoTex = L.tex(256, (g, S) => {
        L.grad(g, S, S, [[0, '#3af6ff'], [1, '#ff3ab8']]);
        g.fillStyle = 'rgba(255,255,255,0.5)'; g.font = 'bold 60px sans-serif'; g.fillText('NEON', 40, 150);
        g.fillStyle = 'rgba(0,0,0,0.25)'; for (let y = 0; y < S; y += 6) g.fillRect(0, y, S, 2);
      }, { repeat: false });
      const busTex = L.tex(128, (g, S) => { L.fill(g, S, S, '#ffc83a'); g.fillStyle = '#6ad8ff'; for (let x = 6; x < S; x += 24) g.fillRect(x, 30, 18, 30); g.fillStyle = '#2a2a2a'; g.fillRect(0, 90, S, 8); });
      const crackTex = L.tex(256, (g, S) => { L.fill(g, S, S, '#2a2834'); L.cracks(g, S, S, '#ff3ab8', 10, rng, 3); L.cracks(g, S, S, '#0a0810', 10, rng, 3); });
      const M = {
        roof: L.phys({ map: roofTex, roughness: 0.25, clearcoat: 0.9, clearcoatRoughness: 0.15 }),
        building: L.std({ map: windows, roughness: 0.6, emissive: '#ffffff', emissiveMap: windows, emissiveIntensity: 0.9 }),
        concrete: L.std({ color: '#3a3848', roughness: 0.8 }),
        heli: L.std({ map: heli, roughness: 0.6 }),
        car: [L.phys({ color: '#e83a6a', roughness: 0.2, metalness: 0.6, clearcoat: 1 }), L.phys({ color: '#3a8aff', roughness: 0.2, metalness: 0.6, clearcoat: 1 }), L.phys({ color: '#f2f2f6', roughness: 0.2, metalness: 0.5, clearcoat: 1 })],
        bus: L.std({ map: busTex, roughness: 0.4, emissive: '#3a2a00', emissiveIntensity: 0.3 }),
        jet: L.glow('#3af6ff', 0.85),
        holo: tr(new THREE.MeshBasicMaterial({ map: holoTex, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false })),
        frame: L.std({ color: '#5a5868', roughness: 0.35, metalness: 0.9 }),
        dark: L.std({ color: '#141220', roughness: 0.5, metalness: 0.6 }),
        light: L.std({ color: '#ffffff', emissive: '#fff4d8', emissiveIntensity: 2 }),
        red: L.std({ color: '#ff3a3a', emissive: '#ff2a2a', emissiveIntensity: 2 }),
        cracked: L.std({ map: crackTex, roughness: 0.6, emissive: '#ff3ab8', emissiveMap: crackTex, emissiveIntensity: 0.8 }),
        neon: NEON.map((c) => L.std({ color: c, emissive: c, emissiveIntensity: 2.4, roughness: 0.3 })),
      };
      const variantOf = (p) => p.v || (p.type === 'start' ? 'helipad' : p.type === 'finish' ? 'billboard' : p.type === 'crumble' ? 'crumble'
        : p.move && p.move.axis[1] < 0.5 ? (p.d >= 8 || p.w >= 8 ? 'bus' : 'car') : p.shape === 'cyl' ? 'helipad' : Math.min(p.w, p.d) < 3 ? 'sign' : 'roof');
      // Neonkant langs toppen (ligger på siden, lige under kanten)
      const neonRim = (p, mat) => {
        const g = p.shape === 'cyl' ? new THREE.TorusGeometry(p.w / 2 + 0.02, 0.05, 6, 40).rotateX(PI / 2)
          : new THREE.BoxGeometry(p.w + 0.08, 0.1, (p.type === 'ramp' ? p.slopeLen : p.d) + 0.08);
        const m = new THREE.Mesh(tr(g), mat);
        m.position.y = p.h / 2 - 0.25;
        if (p.shape !== 'cyl') m.scale.set(1, 1, 1);
        return m;
      };

      return {
        ventColor: '#c8a8ff',
        platform(p) {
          const g = new THREE.Group();
          const v = variantOf(p), minD = Math.min(p.w, p.d), neon = M.neon[p.index % 4];
          if (v === 'car' || v === 'bus') {
            const body = v === 'bus' ? M.bus : M.car[p.index % 3];
            g.add(L.block(p, { top: M.roof, side: body }, 2));
            const cab = L.under(p, body, 0.9, { tip: 0.75 }); if (cab) g.add(cab);
            const jet = new THREE.Mesh(tr(new THREE.CircleGeometry(minD * 0.4, 16).rotateX(PI / 2)), M.jet);
            jet.position.y = -p.h / 2 - 1; jet.userData.noCastShadow = true; g.add(jet);
            for (const sx of [-1, 1]) { const l = new THREE.Mesh(tr(new THREE.SphereGeometry(0.15, 8, 6)), M.light); l.position.set(sx * p.w * 0.35, 0, -p.d / 2 - 0.05); g.add(l); }
          } else if (v === 'billboard') {
            g.add(L.block(p, { top: M.roof, side: M.dark }, 2));
            g.add(neonRim(p, neon));
            const holo = new THREE.Mesh(tr(new THREE.PlaneGeometry(p.w, p.w * 0.5)), M.holo);
            holo.position.set(0, -p.h / 2 - p.w * 0.3, (p.shape === 'cyl' ? p.w : p.d) / 2 + 0.05); g.add(holo);
            const tower = L.pillar(p, M.building, 50, minD * 0.2, 6); if (tower) g.add(tower);
          } else if (v === 'crumble') {
            g.add(L.block(p, { top: M.cracked, side: M.dark }, 2));
          } else {
            const top = v === 'helipad' ? M.heli : M.roof;
            g.add(L.block(p, { top, side: M.concrete }, v === 'helipad' ? (p.shape === 'cyl' ? p.w : minD) : 3, { tileTop: v !== 'helipad' }));
            g.add(neonRim(p, neon));
            if (!p.kin) { const tower = L.pillar(p, M.building, 60, 0.05, 8); if (tower) g.add(tower); }
          }
          if (p.type === 'conveyor') g.children[0].material = [M.dark, M.dark, L.std({ map: L.beltTex('#1a1828', '#2a2838', '#3af6ff'), roughness: 0.4, emissive: '#3af6ff', emissiveIntensity: 0.2 }), M.dark, M.dark, M.dark];
          if (p.type === 'vent') g.children[0].material = [M.concrete, M.concrete, L.std({ map: L.grateTex('#0a0814', '#8a5aff'), roughness: 0.4, emissive: '#8a5aff', emissiveIntensity: 0.4 }), M.concrete, M.concrete, M.concrete];
          if (p.type === 'bounce') g.children[0].material = [M.concrete, M.concrete, M.neon[0], M.concrete, M.concrete, M.concrete];
          return g;
        },
        bar(b) { // neonrør i metalramme
          const g = new THREE.Group();
          g.add(L.barMesh(b, M.neon[(b.index || 0) % 2 ? 1 : 0], b.r));
          for (const sx of [-1, 1]) { const f = new THREE.Mesh(tr(new THREE.BoxGeometry(0.1, 0.6, 0.1)), M.frame); f.position.set(sx * b.len / 2, 0.25, 0); g.add(f); }
          return g;
        },
        anchor(a) { // drone
          const g = new THREE.Group();
          g.add(new THREE.Mesh(tr(new THREE.BoxGeometry(0.5, 0.14, 0.5)), M.dark));
          const eye = new THREE.Mesh(tr(new THREE.SphereGeometry(0.08, 8, 6)), M.red); eye.position.set(0, -0.06, 0.2); g.add(eye);
          for (const [x, z] of [[-0.35, -0.35], [0.35, -0.35], [-0.35, 0.35], [0.35, 0.35]]) {
            const rot = new THREE.Mesh(tr(new THREE.CylinderGeometry(0.18, 0.18, 0.02, 12)), M.jet); rot.position.set(x, 0.1, z); g.add(rot); anim.drones.push(rot);
          }
          return g;
        },
        zip(z) { // el-kabel mellem master
          const g = new THREE.Group();
          const a = new THREE.Vector3(z.ax, z.ay, z.az), b = new THREE.Vector3(z.bx, z.by, z.bz);
          g.add(L.tube([a, a.clone().lerp(b, 0.5).add(new THREE.Vector3(0, -0.35, 0)), b], 0.04, M.dark, 24));
          for (const p of [a, b]) { const post = new THREE.Mesh(tr(new THREE.CylinderGeometry(0.12, 0.16, 4.4, 8)), M.frame); post.position.set(p.x, p.y - 1.9, p.z); g.add(post); }
          return g;
        },
        decor(data) {
          const root = new THREE.Group();
          const b = data.bounds, R0 = b.radius + 30;
          // Skyskrabere med oplyste vinduer (ét draw call) og neontoppe
          const towers = [], tops = [];
          L.place(data, rng, 120, R0, R0 + 360, ctx.lavaY, ctx.lavaY, 10, (x, y, z) => {
            const h = (b.maxY - ctx.lavaY) + rng() * 80 - 10, w = 10 + rng() * 22;
            towers.push({ x, y: y + h / 2, z, sx: w, sy: h, sz: w * (0.7 + rng() * 0.6) });
            if (rng() < 0.4) tops.push({ x, y: y + h + 1, z, sx: w * 0.9, sy: 0.6, sz: 0.6 });
          });
          root.add(L.instanced(new THREE.BoxGeometry(1, 1, 1), M.building, towers));
          root.add(L.instanced(new THREE.BoxGeometry(1, 1, 1), M.neon[0], tops));
          // Flyvende trafik i baner rundt om banen
          L.place(data, rng, 40, R0 + 10, R0 + 200, b.minY - 10, b.maxY + 30, 12, (x, y, z, a) => {
            const c = new THREE.Mesh(tr(new THREE.BoxGeometry(2.5, 1, 5)), M.car[Math.floor(rng() * 3)]);
            const j = new THREE.Mesh(tr(new THREE.PlaneGeometry(2, 4).rotateX(PI / 2)), M.jet); j.position.y = -0.7; c.add(j);
            c.position.set(x, y, z); root.add(c);
            anim.cars.push({ m: c, a, r: Math.hypot(x - b.cx, z - b.cz), sp: (rng() < 0.5 ? 1 : -1) * (0.04 + rng() * 0.05), cx: b.cx, cz: b.cz });
          });
          // Store hologrammer
          L.place(data, rng, 6, R0 + 40, R0 + 220, b.minY, b.maxY + 30, 25, (x, y, z) => {
            const h = new THREE.Mesh(tr(new THREE.PlaneGeometry(30, 16)), M.holo); h.position.set(x, y, z); h.lookAt(b.cx, y, b.cz);
            root.add(h); anim.holo.push(h);
          });
          return root;
        },
        update(dt, t) {
          for (const r of anim.drones) r.rotation.y += dt * 30;
          for (const c of anim.cars) { c.a += c.sp * dt; c.m.position.x = c.cx + Math.cos(c.a) * c.r; c.m.position.z = c.cz + Math.sin(c.a) * c.r; c.m.rotation.y = -c.a + (c.sp > 0 ? 0 : PI); }
          for (const h of anim.holo) h.material.opacity = 0.7 + Math.sin(t * 9) * 0.08;
        },
      };
    },
  };
})();

// ---------------------------------------------------------------- volcano
/* =====================================================================
   VERDENSSÆT 'volcano' – Vulkanen (bane 13)
   Basaltsøjler, afkølet lavaskorpe med glødende revner, gejsere,
   varmeventiler, varme kanter, kæder og lavafald under en askehimmel.
   ===================================================================== */
(function () {
  'use strict';

  // Askehimmel: mørk røg foroven, glødende orange horisont, svag sol gennem røgen
  window.SKYHOJ_THEMES.volcano = {
    top: '#1c1416', horizon: '#c4512a', bottom: '#5a1e14', sunElev: 22, sunAz: -40, sunColor: '#ffb27a', sunInt: 2.2,
    hemiSky: '#b08070', hemiInt: 0.95, fog: '#5c2c22', fogNear: 60, fogFar: 520, cloud: '#6b4a44', clouds: 0.75, stars: 0,
    stone: '#9a8a84', exposure: 1.12, lavaGlow: 1.7,
  };

  window.SKYHOJ_KITS.volcano = {
    id: 'volcano',
    name: 'Vulkanen',
    variants: {
      hex: 'Sekskantet basaltsøjle med søjler ned i dybet (standard for p). shape:"cyl" w 2-5 (kasse = firkantet basaltblok)',
      crust: 'Afkølet lavaskorpe: sort, ru top med glødende revner. Kasse w 3-8, h 0.5-1',
      ledge: 'Klippehylde i vulkanens flanke: ru basalt med en glødende sprække under. Kasse w 2-6, d 2-4',
      obsidian: 'Blankt sort obsidian-glas (ser glat ud – brug til ice eller slick). Kasse/cyl w 2-5',
      rim: 'Kraterkant: rødbrun, svovlgul skorpe og glødende runer (standard for finish). w 8-12',
      plaza: 'Askeplads af mørk basalt med fliser (standard for start). w 8-12',
    },
    barVariants: 'Stænger er tunge jernkæder (led på led). Svævebaner er kæder. Krogpunkter er glødende ildsten.',
    create(ctx) {
      const { THREE } = ctx;
      const L = window.SKYHOJ_KITLIB(ctx);
      const PI = Math.PI, TAU = L.TAU, tr = L.tr;
      const rng = ctx.mulberry32(1300 + ctx.levelIndex);
      const anim = { flows: [], embers: [], smoke: [] };

      // ---- Teksturer
      const basaltTop = L.tex(256, (g, S) => {
        L.fill(g, S, S, '#3a3433');
        L.speckle(g, S, S, ['#4b4442', '#2a2524', '#5a514e'], 500, 1, 5, rng);
        g.strokeStyle = '#211c1c'; g.lineWidth = 3; // sekskantmønster
        for (let y = 0; y < S + 40; y += 37) for (let x = (y / 37) % 2 ? 21 : 0; x < S + 40; x += 42) {
          g.beginPath();
          for (let k = 0; k <= 6; k++) { const a = k / 6 * TAU; g.lineTo(x + Math.cos(a) * 21, y + Math.sin(a) * 21); }
          g.stroke();
        }
      });
      const basaltSide = L.tex(256, (g, S) => {
        L.grad(g, S, S, [[0, '#4a4240'], [1, '#2c2625']]);
        g.fillStyle = '#1f1a1a';
        for (let x = 0; x < S; x += 24 + Math.floor(rng() * 10)) g.fillRect(x, 0, 3, S);
        L.speckle(g, S, S, ['#5b5350', '#231e1d'], 300, 1, 4, rng);
      });
      const crackTex = L.tex(256, (g, S) => {
        L.fill(g, S, S, '#000000');
        L.cracks(g, S, S, '#ff6a1a', 14, rng, 5);
        L.cracks(g, S, S, '#ffd27a', 8, rng, 2);
      });
      const crustTop = L.tex(256, (g, S) => {
        L.fill(g, S, S, '#2a2322');
        L.speckle(g, S, S, ['#3d3433', '#1a1514', '#4a3d38'], 700, 1, 6, rng);
        L.cracks(g, S, S, '#120e0d', 18, rng, 4);
      });
      const sulfur = L.tex(256, (g, S) => {
        L.fill(g, S, S, '#7a3f22');
        L.speckle(g, S, S, ['#e8c547', '#c98a2b', '#5a2a18', '#f2dc6a'], 600, 2, 9, rng);
      });
      const runes = L.tex(256, (g, S) => {
        L.fill(g, S, S, '#000000');
        g.strokeStyle = '#ff8a2a'; g.lineWidth = 6; g.beginPath(); g.arc(S / 2, S / 2, S * 0.42, 0, TAU); g.stroke();
        g.lineWidth = 4;
        for (let k = 0; k < 8; k++) {
          const a = k / 8 * TAU, x = S / 2 + Math.cos(a) * S * 0.33, y = S / 2 + Math.sin(a) * S * 0.33;
          g.beginPath(); g.moveTo(x - 8, y - 10); g.lineTo(x + 8, y); g.lineTo(x - 6, y + 10); g.stroke();
        }
      }, { repeat: false });
      const flowTex = L.tex(128, (g, S) => {
        L.grad(g, S, S, [[0, '#ffdd77'], [0.4, '#ff7a1a'], [1, '#b52a08']], false);
        g.globalAlpha = 0.5;
        for (let i = 0; i < 40; i++) { g.fillStyle = rng() < 0.5 ? '#ffe9a0' : '#8a1a04'; g.fillRect(rng() * S, rng() * S, 2 + rng() * 10, 10 + rng() * 40); }
        g.globalAlpha = 1;
      });

      // ---- Materialer
      const M = {
        basaltTop: L.std({ map: basaltTop, bumpMap: basaltTop, bumpScale: 1.5, roughness: 0.92 }),
        basaltSide: L.std({ map: basaltSide, bumpMap: basaltSide, bumpScale: 2, roughness: 0.95 }),
        glowSide: L.std({ map: basaltSide, roughness: 0.9, emissive: '#ff5a10', emissiveMap: crackTex, emissiveIntensity: 1.4 }),
        crust: L.std({ map: crustTop, roughness: 0.95, emissive: '#ff5a10', emissiveMap: crackTex, emissiveIntensity: 1.6 }),
        crustSide: L.std({ map: crustTop, roughness: 0.95, emissive: '#ff4a08', emissiveMap: crackTex, emissiveIntensity: 1.1 }),
        sulfur: L.std({ map: sulfur, bumpMap: sulfur, bumpScale: 1.2, roughness: 0.85 }),
        obsidian: L.phys({ color: '#0d0b10', roughness: 0.05, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.03 }),
        obsidianSide: L.phys({ color: '#1a1420', roughness: 0.12, metalness: 0.3, clearcoat: 1 }),
        rim: L.std({ map: sulfur, roughness: 0.8, emissive: '#ff7a20', emissiveMap: runes, emissiveIntensity: 1.6 }),
        iron: L.std({ color: '#3a3330', roughness: 0.55, metalness: 0.85 }),
        hotIron: L.std({ color: '#5a3020', roughness: 0.5, metalness: 0.7, emissive: '#ff4a10', emissiveIntensity: 0.35 }),
        steam: tr(new THREE.MeshBasicMaterial({ map: ctx.TEX.glow, color: '#ffd8b0', transparent: true, opacity: 0.35, depthWrite: false })),
        flow: tr(new THREE.MeshBasicMaterial({ map: flowTex, transparent: true, opacity: 0.95, fog: false })),
        ember: L.std({ color: '#2a1a14', roughness: 0.7, emissive: '#ff6a18', emissiveIntensity: 2.2 }),
      };
      const variantOf = (p) => {
        if (p.v) return p.v;
        if (p.type === 'start') return 'plaza';
        if (p.type === 'finish') return 'rim';
        if (p.type === 'crumble') return 'crust';
        if (p.type === 'ice') return 'obsidian';
        return p.shape === 'cyl' ? 'hex' : 'ledge';
      };

      // Sekskantet basaltsøjle (indskrevet i cylinderen – toppen ligger inden for fodaftrykket)
      const hexColumn = (p, topMat, sideMat) => {
        const R = p.w / 2;
        const g = new THREE.CylinderGeometry(R, R, p.h, 6, 1);
        const m = new THREE.Mesh(tr(g), [sideMat, topMat, sideMat]);
        m.userData.solid = true;
        return m;
      };

      return {
        ventColor: '#ffb58a',
        slickColor: '#ff7a2a',
        platform(p) {
          const g = new THREE.Group();
          const v = variantOf(p);
          let main;
          switch (p.type) {
            case 'bounce': { // gejser: svovlgul kegle med et damphul
              main = L.block(p, { top: M.sulfur, side: M.basaltSide }, 2);
              const vent = new THREE.Mesh(tr(new THREE.CircleGeometry(Math.min(p.w, p.d) * 0.22, 24).rotateX(-PI / 2)), M.ember);
              vent.position.y = p.h / 2 + 0.02;
              g.add(vent);
              const puff = new THREE.Sprite(M.steam);
              puff.scale.set(p.w * 0.9, p.w * 1.2, 1); puff.position.y = p.h / 2 + p.w * 0.6;
              g.add(puff); anim.smoke.push(puff);
              break;
            }
            case 'vent': {
              const grate = L.std({ map: L.grateTex('#1a1110', '#4a3a36'), roughness: 0.8, emissive: '#ff5a10', emissiveIntensity: 0.6 });
              main = L.block(p, { top: grate, side: M.basaltSide }, 1);
              break;
            }
            case 'conveyor': { // glødende lavastrøm under en skorpe, der flyder
              main = L.block(p, { top: M.crust, side: M.basaltSide }, 2);
              break;
            }
            case 'spin': case 'rot': main = hexColumn(p, M.basaltTop, M.glowSide); break;
            default:
              if (v === 'hex') main = p.shape === 'cyl' ? hexColumn(p, M.basaltTop, M.basaltSide) : L.block(p, { top: M.basaltTop, side: M.basaltSide }, 2);
              else if (v === 'crust') main = L.block(p, { top: M.crust, side: M.crustSide }, 2);
              else if (v === 'obsidian') main = L.block(p, { top: M.obsidian, side: M.obsidianSide }, 2);
              else if (v === 'rim') main = L.block(p, { top: M.rim, side: M.basaltSide }, p.shape === 'cyl' ? p.w : 2, { tileTop: false });
              else main = L.block(p, { top: M.basaltTop, side: M.basaltSide }, 2);
          }
          g.add(main);
          // Underbygning: basaltsøjler ned i dybet (bevægelige søjler får en kortere stamme)
          const want = p.kin ? 10 : 6 + Math.min(p.w, p.d) * 2;
          if (p.type !== 'crumble' && v !== 'crust') {
            const u = v === 'hex' || p.type === 'spin' || p.type === 'rot'
              ? L.pillar(p, p.kin ? M.glowSide : M.basaltSide, want, 0.04)
              : L.under(p, M.basaltSide, want, { jitter: 0.25 });
            if (u) g.add(u);
          } else {
            const u = L.under(p, M.crustSide, 1.6, { tip: 0.4 });
            if (u) g.add(u);
          }
          return g;
        },
        bar(b) { // tung jernkæde: stang + led
          const g = new THREE.Group();
          g.add(L.barMesh(b, M.iron));
          const n = Math.max(2, Math.round(b.len / 0.32));
          const link = tr(new THREE.TorusGeometry(0.11, 0.03, 6, 12));
          for (let i = 0; i < n; i++) {
            const l = new THREE.Mesh(link, M.hotIron);
            l.position.x = -b.len / 2 + (i + 0.5) * b.len / n;
            l.rotation.y = PI / 2; l.rotation.x = i % 2 ? PI / 2 : 0;
            g.add(l);
          }
          return g;
        },
        anchor() { // glødende ildsten
          const g = new THREE.Group();
          const rock = new THREE.Mesh(tr(new THREE.IcosahedronGeometry(0.34, 0)), M.ember);
          rock.rotation.set(0.4, 0.7, 0.2);
          g.add(rock);
          return g;
        },
        zip(z) { // kæde-svævebane med jernmaster
          const g = new THREE.Group();
          const a = new THREE.Vector3(z.ax, z.ay, z.az), b = new THREE.Vector3(z.bx, z.by, z.bz);
          g.add(L.tube([a, a.clone().lerp(b, 0.5).add(new THREE.Vector3(0, -0.15, 0)), b], 0.045, M.iron, 24));
          for (const p of [a, b]) {
            const post = new THREE.Mesh(tr(new THREE.CylinderGeometry(0.14, 0.2, 4, 8)), M.iron);
            post.position.set(p.x, p.y - 1.7, p.z);
            g.add(post);
          }
          return g;
        },
        decor(data) {
          const root = new THREE.Group();
          const b = data.bounds, R0 = b.radius + 60;
          // Hovedvulkanen bag målet: stor kegle med krater og lavafald
          const fin = data.plats[data.plats.length - 1];
          const dir = Math.atan2(fin.z - b.cz, fin.x - b.cx);
          const vx = b.cx + Math.cos(dir) * (R0 + 220), vz = b.cz + Math.sin(dir) * (R0 + 220);
          const cone = L.lathe([[0.01, 140], [40, 136], [70, 110], [140, 30], [230, -60]], M.basaltSide, 48);
          cone.position.set(vx, ctx.lavaY + 10, vz);
          root.add(cone);
          const glowTop = new THREE.Mesh(tr(new THREE.CircleGeometry(38, 32).rotateX(-PI / 2)), M.flow);
          glowTop.position.set(vx, ctx.lavaY + 147, vz);
          root.add(glowTop);
          for (let k = 0; k < 5; k++) { // lavafald ned ad siden
            const a = dir + PI + (k - 2) * 0.35;
            const flow = new THREE.Mesh(tr(new THREE.PlaneGeometry(14, 150)), M.flow);
            flow.position.set(vx + Math.cos(a) * 90, ctx.lavaY + 75, vz + Math.sin(a) * 90);
            flow.lookAt(b.cx, ctx.lavaY + 75, b.cz);
            flow.rotation.x -= 0.5;
            root.add(flow);
            anim.flows.push(flow);
          }
          // Spidse basalttårne og røgsøjler rundt om banen
          const spireGeo = new THREE.CylinderGeometry(0.5, 1, 1, 6);
          const spires = [];
          L.place(data, rng, 40, R0, R0 + 260, ctx.lavaY + 10, ctx.lavaY + 10, 12, (x, y, z) => {
            const h = 30 + rng() * 90, r = 4 + rng() * 10;
            spires.push({ x, y: y + h / 2, z, sx: r, sy: h, sz: r, ry: rng() * TAU });
          });
          root.add(L.instanced(spireGeo, M.basaltSide, spires));
          L.place(data, rng, 8, R0 + 20, R0 + 200, b.minY - 10, b.minY + 10, 20, (x, y, z) => {
            const s = new THREE.Sprite(M.steam);
            s.scale.set(60, 120, 1); s.position.set(x, y + 40, z);
            root.add(s); anim.smoke.push(s);
          });
          // Flyvende gløder og aske
          const pos = [];
          for (let i = 0; i < 500; i++) pos.push(b.cx + (rng() - 0.5) * b.radius * 3, b.minY - 30 + rng() * 120, b.cz + (rng() - 0.5) * b.radius * 3);
          const embers = L.points(pos, '#ffa040', 2.5, 0.85);
          root.add(embers); anim.embers.push(embers);
          return root;
        },
        update(dt, t) {
          flowTex.offset.y = -t * 0.35;
          for (const s of anim.smoke) s.material.opacity = 0.3 + Math.sin(t * 0.7) * 0.05;
          for (const e of anim.embers) { e.position.y = (t * 1.5) % 30; e.material.opacity = 0.6 + Math.sin(t * 5) * 0.25; }
        },
      };
    },
  };
})();

// ---------------------------------------------------------------- skyreef
/* =====================================================================
   VERDENSSÆT 'skyreef' – Himmelhavet (bane 14)
   Et koralrev, der svæver i himlen som under vand: bordkoraller,
   gopler som springpuder, mantaer og skildpadder som bevægelige
   platforme, boblesøjler, et hvalskelet med ribben som stænger,
   tang som trapez, perler som krogpunkter, kæmpemusling og fisk.
   ===================================================================== */
(function () {
  'use strict';

  window.SKYHOJ_THEMES.skyreef = {
    top: '#0a5a8a', horizon: '#5ad8d8', bottom: '#2a8aa0', sunElev: 62, sunAz: 0, sunColor: '#d8fff8', sunInt: 2.6,
    hemiSky: '#8af0f0', hemiInt: 1.15, fog: '#3aa8b8', fogNear: 50, fogFar: 460, cloud: '#c8fff8', clouds: 0.6, stars: 0,
    stone: '#e8d8c8', exposure: 1.1, lavaGlow: 0.9,
  };

  window.SKYHOJ_KITS.skyreef = {
    id: 'skyreef',
    name: 'Himmelhavet',
    variants: {
      coral: 'Bordkoral: flad, rosa-orange plade med polypper på en koralstamme (standard for p). Kasse/cyl w 2-8',
      brain: 'Hjernekoral: rund, bugtet, grøngul (standard for cyl). shape:"cyl" w 2-5',
      manta: 'Mantarokke: mørkeblå ryg med lys bug og vinger (standard for sidelæns bevægelige). Kasse w 3-6',
      turtle: 'Havskildpadde: skjoldet er platformen (standard for bevægelige frem/tilbage). Kasse/cyl w 3-5',
      vertebra: 'Hvirvel i hvalskelettet: benhvid, porøs (standard for smalle). Kasse w 1.5-3',
      clam: 'Kæmpemusling med perlemor (standard for finish). w 6-12',
      sand: 'Sandbanke med muslingeskaller og søstjerner (standard for start). w 6-12',
    },
    barVariants: 'Stænger er hvalribben (buede ben); trapez er tang. Svævebaner er strømme af bobler langs en tangsnor. Krogpunkter er perler.',
    create(ctx) {
      const { THREE } = ctx;
      const L = window.SKYHOJ_KITLIB(ctx);
      const PI = Math.PI, TAU = L.TAU, tr = L.tr;
      const rng = ctx.mulberry32(1400 + ctx.levelIndex);
      const anim = { jelly: [], fish: [], kelp: [], bubbles: [] };

      const coralTop = L.tex(256, (g, S) => { L.fill(g, S, S, '#ff9a7a'); L.speckle(g, S, S, ['#ffd0b8', '#e86a5a', '#fff0e0'], 900, 1.5, 3.5, rng); });
      const coralSide = L.tex(256, (g, S) => { L.grad(g, S, S, [[0, '#ff8a6a'], [1, '#c84a5a']]); L.speckle(g, S, S, ['#ffb89a', '#a83a4a'], 400, 1, 3, rng); });
      const brain = L.tex(256, (g, S) => {
        L.fill(g, S, S, '#c8d06a'); g.strokeStyle = '#8a9a3a'; g.lineWidth = 6;
        for (let i = 0; i < 26; i++) { let x = rng() * S, y = rng() * S, a = rng() * TAU; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 12; k++) { a += (rng() - 0.5) * 1.6; x += Math.cos(a) * 12; y += Math.sin(a) * 12; g.lineTo(x, y); } g.stroke(); }
      });
      const sand = L.tex(256, (g, S) => { L.fill(g, S, S, '#f0dcb0'); L.speckle(g, S, S, ['#e0c898', '#fff0d0', '#c8b080'], 1500, 1, 2.5, rng); });
      const bone = L.tex(256, (g, S) => { L.fill(g, S, S, '#efe6d6'); L.speckle(g, S, S, ['#d8ccb8', '#c8bca8', '#fffaf0'], 900, 1, 3, rng); });
      const nacre = L.tex(256, (g, S) => {
        const gr = g.createLinearGradient(0, 0, S, S);
        ['#f8e8ff', '#c8f0ff', '#fff0d8', '#e8d0ff'].forEach((c, i) => gr.addColorStop(i / 3, c));
        g.fillStyle = gr; g.fillRect(0, 0, S, S);
      });
      const mantaTex = L.tex(256, (g, S) => { L.fill(g, S, S, '#1e3a5a'); L.speckle(g, S, S, ['#e8f4ff', '#3a5a7a'], 200, 2, 6, rng); });
      const shell = L.tex(256, (g, S) => {
        L.fill(g, S, S, '#7a5a2a'); g.strokeStyle = '#c8a050'; g.lineWidth = 5;
        for (let y = 0; y < S + 50; y += 50) for (let x = (y / 50) % 2 ? 30 : 0; x < S + 60; x += 60) { g.beginPath(); for (let k = 0; k <= 6; k++) { const a = k / 6 * TAU; g.lineTo(x + Math.cos(a) * 28, y + Math.sin(a) * 28); } g.stroke(); }
      });
      const crackBone = L.tex(256, (g, S) => { L.fill(g, S, S, '#d8ccb8'); L.cracks(g, S, S, '#6a5a48', 14, rng, 3); });
      const M = {
        coralTop: L.std({ map: coralTop, bumpMap: coralTop, bumpScale: 2, roughness: 0.85 }),
        coralSide: L.std({ map: coralSide, roughness: 0.85 }),
        brain: L.std({ map: brain, bumpMap: brain, bumpScale: 3, roughness: 0.8 }),
        sand: L.std({ map: sand, roughness: 0.95 }),
        bone: L.std({ map: bone, bumpMap: bone, bumpScale: 1.5, roughness: 0.8 }),
        crackBone: L.std({ map: crackBone, roughness: 0.85 }),
        nacre: L.phys({ map: nacre, roughness: 0.15, metalness: 0.3, clearcoat: 1, iridescence: 0.8 }),
        clamShell: L.std({ color: '#7a6a8a', roughness: 0.6 }),
        manta: L.std({ map: mantaTex, roughness: 0.5 }),
        belly: L.std({ color: '#f0f4f8', roughness: 0.6 }),
        shell: L.std({ map: shell, roughness: 0.5 }),
        skin: L.std({ color: '#6a9a5a', roughness: 0.7 }),
        jelly: L.phys({ color: '#ffa8f0', roughness: 0.2, transmission: 0.3, thickness: 0.4, emissive: '#ff6ad8', emissiveIntensity: 0.5, transparent: true, opacity: 0.9 }),
        tentacle: L.std({ color: '#ffb8f0', emissive: '#ff6ad8', emissiveIntensity: 0.6, transparent: true, opacity: 0.7 }),
        kelp: L.std({ color: '#3a8a3a', roughness: 0.6 }),
        pearl: L.phys({ color: '#fff8f0', roughness: 0.1, clearcoat: 1, emissive: '#c8f0ff', emissiveIntensity: 0.4 }),
        fish: [L.std({ color: '#ffb23a', roughness: 0.4 }), L.std({ color: '#3ab8ff', roughness: 0.4 }), L.std({ color: '#ff5a8a', roughness: 0.4 })],
        bubble: tr(new THREE.MeshBasicMaterial({ color: '#e8ffff', transparent: true, opacity: 0.5, depthWrite: false })),
        caustic: L.glow('#aaffff', 0.25),
      };
      const variantOf = (p) => p.v || (p.type === 'start' ? 'sand' : p.type === 'finish' ? 'clam' : p.type === 'crumble' ? 'crumbly'
        : p.type === 'bounce' ? 'jelly' : p.move ? (p.move.axis[1] > 0.9 ? 'jelly' : p.move.axis[0] !== 0 && Math.abs(p.move.axis[0]) + Math.abs(p.move.axis[2]) > 0.5 && p.index % 2 ? 'turtle' : 'manta')
          : p.shape === 'cyl' ? 'brain' : Math.min(p.w, p.d) < 2.5 ? 'vertebra' : 'coral');

      return {
        ventColor: '#e8ffff',
        platform(p) {
          const g = new THREE.Group();
          const v = variantOf(p), minD = Math.min(p.w, p.d);
          if (v === 'jelly') { // glødende gople – toppen er klokken
            g.add(L.block(p, { top: M.jelly, side: M.jelly }, 2, { segments: 24 }));
            const n = 8;
            for (let i = 0; i < n; i++) {
              const a = i / n * TAU, r = minD * 0.32;
              const t = new THREE.Mesh(tr(new THREE.CylinderGeometry(0.05, 0.02, 3 + (i % 3), 5)), M.tentacle);
              t.position.set(Math.cos(a) * r, -p.h / 2 - 1.8, Math.sin(a) * r); g.add(t); anim.jelly.push(t);
            }
          } else if (v === 'manta') {
            g.add(L.block(p, { top: M.manta, side: M.manta }, minD, { tileTop: false }));
            const belly = L.under(p, M.belly, 0.6, { tip: 0.7 }); if (belly) g.add(belly);
            const tail = new THREE.Mesh(tr(new THREE.CylinderGeometry(0.06, 0.02, p.d * 0.8, 6).rotateX(PI / 2)), M.manta);
            tail.position.set(0, -0.1, p.d / 2 + p.d * 0.4); g.add(tail);
          } else if (v === 'turtle') {
            g.add(L.block(p, { top: M.shell, side: M.shell }, minD, { tileTop: false, segments: 16 }));
            const body = L.under(p, M.skin, 0.8, { tip: 0.75 }); if (body) g.add(body);
            for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
              const fl = new THREE.Mesh(tr(new THREE.SphereGeometry(0.4, 10, 8)), M.skin);
              fl.scale.set(1.6, 0.3, 0.8); fl.position.set(sx * p.w * 0.4, -p.h / 2 - 0.3, sz * (p.shape === 'cyl' ? p.w : p.d) * 0.4); g.add(fl);
            }
          } else if (v === 'clam') {
            g.add(L.block(p, { top: M.nacre, side: M.clamShell }, p.shape === 'cyl' ? p.w : minD, { tileTop: false }));
            const half = L.under(p, M.clamShell, 3, { tip: 0.3, segments: 18 }); if (half) g.add(half);
          } else if (v === 'sand') {
            g.add(L.block(p, { top: M.sand, side: M.coralSide }, 3));
            const u = L.under(p, M.coralSide, 8, { jitter: 0.3 }); if (u) g.add(u);
          } else if (v === 'vertebra' || v === 'crumbly') {
            g.add(L.block(p, { top: v === 'crumbly' ? M.crackBone : M.bone, side: v === 'crumbly' ? M.crackBone : M.bone }, 1.5));
            if (v === 'vertebra') { const u = L.under(p, M.bone, 1.4, { tip: 0.4 }); if (u) g.add(u); }
          } else if (v === 'brain') {
            g.add(L.block(p, { top: M.brain, side: M.brain }, 2, { segments: 24 }));
            const u = L.under(p, M.brain, p.w * 0.6, { tip: 0.3, segments: 24 }); if (u) g.add(u);
          } else { // bordkoral på en stamme
            g.add(L.block(p, { top: M.coralTop, side: M.coralSide }, 2));
            const stem = L.pillar(p, M.coralSide, 8 + minD, minD * 0.38, 2); if (stem) g.add(stem);
          }
          if (p.type === 'conveyor') g.children[0].material = [M.coralSide, M.coralSide, L.std({ map: L.beltTex('#2a7aa0', '#5ab8d8', '#e8ffff'), roughness: 0.5 }), M.coralSide, M.coralSide, M.coralSide];
          if (p.type === 'vent') g.children[0].material = [M.coralSide, M.coralSide, L.std({ map: L.grateTex('#8a4a4a', '#ffd0b8'), roughness: 0.8 }), M.coralSide, M.coralSide, M.coralSide];
          return g;
        },
        bar(b) {
          const g = new THREE.Group();
          if (b.swing) { g.add(L.barMesh(b, M.kelp, b.r * 1.2)); return g; }
          g.add(L.barMesh(b, M.bone, b.r * 1.15)); // hvalribben: buede ben ned fra stangens ender
          for (const sx of [-1, 1]) {
            const rib = new THREE.Mesh(tr(new THREE.TorusGeometry(1.2, 0.09, 6, 16, PI / 2)), M.bone);
            rib.position.set(sx * b.len / 2, -1.2, 0); rib.rotation.set(0, sx > 0 ? 0 : PI, 0); g.add(rib);
          }
          return g;
        },
        anchor() { // perle i en lille musling
          const g = new THREE.Group();
          g.add(new THREE.Mesh(tr(new THREE.SphereGeometry(0.3, 18, 14)), M.pearl));
          return g;
        },
        zip(z) {
          const g = new THREE.Group();
          const a = new THREE.Vector3(z.ax, z.ay, z.az), b = new THREE.Vector3(z.bx, z.by, z.bz);
          g.add(L.tube([a, b], 0.05, M.kelp, 8));
          return g;
        },
        decor(data) {
          const root = new THREE.Group();
          const b = data.bounds, R0 = b.radius + 30;
          // Boblesøjler (opvind) synlige som bobler
          for (const w of data.winds) {
            const pos = [];
            for (let i = 0; i < 120; i++) { const a = rng() * TAU, r = Math.sqrt(rng()) * w.r; pos.push(w.x + Math.cos(a) * r, w.y + rng() * w.h, w.z + Math.sin(a) * r); }
            const pts = L.points(pos, '#ffffff', 4, 0.8); pts.material.fog = true;
            root.add(pts); anim.bubbles.push({ m: pts, h: w.h });
          }
          // Koralrev-øer og tang rundt om banen
          const reefs = [], kelp = [];
          L.place(data, rng, 50, R0, R0 + 240, b.minY - 30, b.maxY, 12, (x, y, z) => {
            const s = 3 + rng() * 8;
            reefs.push({ x, y, z, sx: s * 1.6, sy: s, sz: s * 1.4, ry: rng() * TAU });
            for (let k = 0; k < 3; k++) kelp.push({ x: x + (rng() - 0.5) * s, y: y + s * 0.8 + 6, z: z + (rng() - 0.5) * s, sx: 0.5, sy: 12 + rng() * 10, sz: 0.5 });
          });
          root.add(L.instanced(new THREE.DodecahedronGeometry(1, 1), M.coralSide, reefs));
          const kelpMesh = L.instanced(new THREE.CylinderGeometry(0.3, 0.6, 1, 6), M.kelp, kelp);
          root.add(kelpMesh); anim.kelp.push(kelpMesh);
          // Hvalskelet i baggrunden
          const wx = b.cx + R0 + 60, wz = b.cz;
          const spine = L.tube([new THREE.Vector3(wx - 60, b.maxY + 30, wz), new THREE.Vector3(wx, b.maxY + 40, wz), new THREE.Vector3(wx + 60, b.maxY + 28, wz)], 1.6, M.bone, 30);
          root.add(spine);
          for (let i = -6; i <= 6; i++) {
            const rib = new THREE.Mesh(tr(new THREE.TorusGeometry(12, 0.8, 6, 20, PI)), M.bone);
            rib.position.set(wx + i * 8, b.maxY + 36, wz); rib.rotation.set(0, PI / 2, PI); root.add(rib);
          }
          // Fiskestimer
          for (let s = 0; s < 6; s++) {
            const school = new THREE.Group();
            const cx = b.cx + (rng() - 0.5) * b.radius * 1.6, cy = b.minY + rng() * (b.maxY - b.minY + 20), cz = b.cz + (rng() - 0.5) * b.radius * 1.6;
            if (!ctx.clearOfCourse(cx, cy, cz, 10)) continue;
            const list = [];
            for (let i = 0; i < 25; i++) list.push({ x: (rng() - 0.5) * 8, y: (rng() - 0.5) * 4, z: (rng() - 0.5) * 8, sx: 0.6, sy: 0.35, sz: 0.2 });
            school.add(L.instanced(new THREE.SphereGeometry(1, 8, 6), M.fish[s % 3], list));
            school.position.set(cx, cy, cz); root.add(school); anim.fish.push({ g: school, cx, cz, r: 6 + rng() * 10, ph: rng() * TAU });
          }
          // Lysstriber fra overfladen (kaustik)
          for (let i = 0; i < 10; i++) {
            const beam = new THREE.Mesh(tr(new THREE.PlaneGeometry(6, 200)), M.caustic);
            beam.position.set(b.cx + (rng() - 0.5) * b.radius * 2, b.maxY + 40, b.cz + (rng() - 0.5) * b.radius * 2);
            beam.rotation.set(0, rng() * PI, 0.2); beam.userData.noCastShadow = true; root.add(beam);
          }
          return root;
        },
        update(dt, t) {
          for (let i = 0; i < anim.jelly.length; i++) anim.jelly[i].rotation.x = Math.sin(t * 2 + i) * 0.2;
          for (const f of anim.fish) { const a = t * 0.3 + f.ph; f.g.position.x = f.cx + Math.cos(a) * f.r; f.g.position.z = f.cz + Math.sin(a) * f.r; f.g.rotation.y = -a; }
          for (const bb of anim.bubbles) bb.m.position.y = (t * 3) % (bb.h * 0.3);
          for (const k of anim.kelp) k.rotation.z = Math.sin(t * 0.8) * 0.01;
        },
      };
    },
  };
})();

// ---------------------------------------------------------------- crystalspire
/* =====================================================================
   VERDENSSÆT 'crystalspire' – Nordlystårnet (bane 15, finalen)
   Et kæmpe tårn af krystal og guld under nordlyset: glas- og frost-
   glasplatforme, guldringe og guldarme, lysekroner, lysstråler,
   splintrende glas, master med svævebaner og svævende souvenirs fra
   alle de tidligere verdener.
   ===================================================================== */
(function () {
  'use strict';

  window.SKYHOJ_THEMES.crystalspire = {
    top: '#050a22', horizon: '#1e3a6a', bottom: '#1a1a3a', sunElev: 45, sunAz: -20, sunColor: '#c8e0ff', sunInt: 2.2,
    hemiSky: '#8ab0ff', hemiInt: 1.15, fog: '#16244a', fogNear: 90, fogFar: 700, cloud: '#2a3a6a', clouds: 0.35, stars: 1,
    stone: '#c8d0e8', exposure: 1.25, lavaGlow: 1.0, moon: true,
  };

  window.SKYHOJ_KITS.crystalspire = {
    id: 'crystalspire',
    name: 'Nordlystårnet',
    variants: {
      glass: 'Klart krystalglas med guldkant og lysende facetter under (standard for p). Kasse/cyl w 2-8',
      frost: 'Frostglas: matblåt og glat (brug til ice / slick). Kasse/cyl w 2-6',
      gold: 'Guldplade med gravering (standard for rot/spin og bevægelige). Kasse/cyl w 3-10',
      prism: 'Prisme: regnbuefarvet krystal (kronens kapitel). Kasse/cyl w 2-5',
      balcony: 'Hvilebalkon i hvid marmor med guld (standard for start). w 6-12',
      crown: 'Tårnets krone: guldring med lysende krystaller (standard for finish). w 8-14',
    },
    barVariants: 'Stænger er guldrør med krystalknopper; trapez er lysekroner. Svævebaner er lysende guldkabler. Krogpunkter er svævende krystaller.',
    create(ctx) {
      const { THREE } = ctx;
      const L = window.SKYHOJ_KITLIB(ctx);
      const PI = Math.PI, TAU = L.TAU, tr = L.tr;
      const rng = ctx.mulberry32(1500 + ctx.levelIndex);
      const anim = { aurora: [], orbit: [], gems: [] };

      const engraved = L.tex(256, (g, S) => {
        L.fill(g, S, S, '#d8a840'); g.strokeStyle = '#a87a20'; g.lineWidth = 3;
        for (let r = 20; r < S; r += 40) { g.beginPath(); g.arc(S / 2, S / 2, r, 0, TAU); g.stroke(); }
        for (let k = 0; k < 12; k++) { const a = k / 12 * TAU; g.beginPath(); g.moveTo(S / 2, S / 2); g.lineTo(S / 2 + Math.cos(a) * S, S / 2 + Math.sin(a) * S); g.stroke(); }
      });
      const marble = L.tex(256, (g, S) => { L.fill(g, S, S, '#f2f0f6'); g.strokeStyle = 'rgba(150,150,190,0.5)'; g.lineWidth = 2; for (let i = 0; i < 14; i++) { let x = rng() * S, y = 0; g.beginPath(); g.moveTo(x, y); while (y < S) { x += (rng() - 0.5) * 30; y += 20; g.lineTo(x, y); } g.stroke(); } });
      const frostTex = L.tex(256, (g, S) => { L.fill(g, S, S, '#b8d8ff'); L.speckle(g, S, S, ['#ffffff', '#9ac0f0'], 900, 1, 4, rng); });
      const shards = L.tex(256, (g, S) => { L.fill(g, S, S, '#9ad0ff'); L.cracks(g, S, S, '#ffffff', 16, rng, 2.5); });
      const auroraTex = L.tex(256, (g, S) => {
        const gr = g.createLinearGradient(0, 0, 0, S);
        gr.addColorStop(0, 'rgba(120,60,255,0)'); gr.addColorStop(0.4, 'rgba(80,255,170,0.6)'); gr.addColorStop(0.75, 'rgba(60,200,255,0.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr; g.fillRect(0, 0, S, S);
        g.globalCompositeOperation = 'destination-in';
        for (let x = 0; x < S; x += 4) { g.fillStyle = `rgba(0,0,0,${0.4 + 0.6 * Math.abs(Math.sin(x * 0.05))})`; g.fillRect(x, 0, 4, S); }
      }, { repeat: true });
      const M = {
        glass: L.phys({ color: '#d8f4ff', roughness: 0.04, transmission: 0.6, thickness: 1, ior: 1.45, clearcoat: 1, transparent: true, opacity: 0.92 }),
        glassSide: L.phys({ color: '#a8d8ff', roughness: 0.08, transmission: 0.5, thickness: 1, emissive: '#3a7aff', emissiveIntensity: 0.25, transparent: true, opacity: 0.9 }),
        frost: L.phys({ map: frostTex, roughness: 0.35, clearcoat: 0.6, emissive: '#2a5aaa', emissiveIntensity: 0.2 }),
        gold: L.std({ map: engraved, roughness: 0.3, metalness: 0.55, emissive: '#6a4a10', emissiveIntensity: 0.35 }),
        goldPlain: L.std({ color: '#f0c050', roughness: 0.25, metalness: 0.6, emissive: '#6a4a10', emissiveIntensity: 0.3 }),
        marble: L.std({ map: marble, roughness: 0.35 }),
        shards: L.phys({ map: shards, roughness: 0.1, clearcoat: 1, emissive: '#5aa0ff', emissiveIntensity: 0.3 }),
        prism: L.phys({ color: '#ffffff', roughness: 0.03, iridescence: 1, iridescenceIOR: 1.6, clearcoat: 1, emissive: '#ff8af0', emissiveIntensity: 0.15 }),
        gem: L.std({ color: '#8af0ff', emissive: '#4ad8ff', emissiveIntensity: 1.8, roughness: 0.2 }),
        tower: L.phys({ color: '#9ac8ff', roughness: 0.1, emissive: '#2a4aaa', emissiveIntensity: 0.35, clearcoat: 1 }),
        aurora: tr(new THREE.MeshBasicMaterial({ map: auroraTex, transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending })),
        candle: L.std({ color: '#fff4d0', emissive: '#ffd890', emissiveIntensity: 2.2 }),
        souvenir: [L.std({ color: '#ffcc33', roughness: 0.6 }), L.std({ color: '#ff9ec4', roughness: 0.6 }), L.std({ color: '#5aa040', roughness: 0.7 }), L.std({ color: '#b3261e', roughness: 0.5 }), L.std({ color: '#3a8aff', roughness: 0.4 })],
      };
      const variantOf = (p) => p.v || (p.type === 'start' ? 'balcony' : p.type === 'finish' ? 'crown' : p.type === 'crumble' ? 'shatter'
        : p.type === 'ice' || p.slick ? 'frost' : p.type === 'rot' || p.type === 'spin' || p.kin ? 'gold' : 'glass');

      return {
        ventColor: '#c8f0ff',
        slickColor: '#bfe8ff',
        platform(p) {
          const g = new THREE.Group();
          const v = variantOf(p), minD = Math.min(p.w, p.d);
          if (v === 'glass' || v === 'prism') {
            g.add(L.block(p, { top: v === 'prism' ? M.prism : M.glass, side: M.glassSide }, 2, { segments: 12 }));
            const rim = new THREE.Mesh(tr(p.shape === 'cyl' ? new THREE.TorusGeometry(p.w / 2, 0.06, 6, 24).rotateX(PI / 2) : new THREE.BoxGeometry(p.w + 0.04, 0.1, p.d + 0.04)), M.goldPlain);
            rim.position.y = -p.h / 2 + 0.05; g.add(rim);
            const facet = L.under(p, M.glassSide, minD * 0.9, { tip: 0.02, segments: 6 }); if (facet) g.add(facet);
          } else if (v === 'frost') {
            g.add(L.block(p, { top: M.frost, side: M.frost }, 2, { segments: 12 }));
            const facet = L.under(p, M.frost, minD * 0.7, { tip: 0.02, segments: 6 }); if (facet) g.add(facet);
          } else if (v === 'gold') {
            g.add(L.block(p, { top: M.gold, side: M.goldPlain }, p.shape === 'cyl' ? p.w : minD, { tileTop: false }));
          } else if (v === 'balcony') {
            g.add(L.block(p, { top: M.marble, side: M.marble }, 3));
            const u = L.under(p, M.goldPlain, 1.5, { tip: 0.6 }); if (u) g.add(u);
          } else if (v === 'crown') {
            g.add(L.block(p, { top: M.gold, side: M.goldPlain }, p.shape === 'cyl' ? p.w : minD, { tileTop: false }));
            for (let i = 0; i < 10; i++) { // krystaller rundt om kanten (under topniveau)
              const a = i / 10 * TAU, r = (p.shape === 'cyl' ? p.w : minD) / 2;
              const c = new THREE.Mesh(tr(new THREE.OctahedronGeometry(0.35, 0)), M.gem);
              c.position.set(Math.cos(a) * r * 0.85, -p.h / 2 - 0.5, Math.sin(a) * r * 0.85); c.scale.y = 2.2; g.add(c);
            }
            const u = L.under(p, M.tower, 6, { tip: 0.3, segments: 8 }); if (u) g.add(u);
          } else { // splintrende glas
            g.add(L.block(p, { top: M.shards, side: M.shards }, 2));
          }
          if (p.swing) { // lysekrone: lys under platformen
            for (let i = 0; i < 6; i++) { const a = i / 6 * TAU, c = new THREE.Mesh(tr(new THREE.SphereGeometry(0.14, 8, 6)), M.candle); c.position.set(Math.cos(a) * minD * 0.35, -p.h / 2 - 0.35, Math.sin(a) * minD * 0.35); g.add(c); }
          }
          if (p.type === 'conveyor') g.children[0].material = [M.goldPlain, M.goldPlain, L.std({ map: L.beltTex('#3a5aa0', '#5a7ac0', '#ffe08a'), roughness: 0.3, metalness: 0.5 }), M.goldPlain, M.goldPlain, M.goldPlain];
          if (p.type === 'vent') g.children[0].material = [M.goldPlain, M.goldPlain, L.std({ map: L.grateTex('#1a2a5a', '#e8b84a'), roughness: 0.3, metalness: 0.8, emissive: '#4ad8ff', emissiveIntensity: 0.4 }), M.goldPlain, M.goldPlain, M.goldPlain];
          if (p.type === 'bounce') g.children[0].material = [M.glassSide, M.glassSide, M.prism, M.glassSide, M.glassSide, M.glassSide];
          return g;
        },
        spinArm(p) {
          const g = new THREE.Group();
          g.add(new THREE.Mesh(tr(new THREE.BoxGeometry(p.bar, 0.3, 0.4)), M.goldPlain));
          for (const sx of [-1, 1]) { const c = new THREE.Mesh(tr(new THREE.OctahedronGeometry(0.3, 0)), M.gem); c.position.x = sx * p.bar / 2; g.add(c); }
          return g;
        },
        bar(b) {
          const g = new THREE.Group();
          g.add(L.barMesh(b, M.goldPlain));
          for (const sx of [-1, 1]) { const k = new THREE.Mesh(tr(new THREE.OctahedronGeometry(b.r * 2.5, 0)), M.gem); k.position.x = sx * b.len / 2; g.add(k); }
          if (b.swing) { // lysekrone over trapezen
            const ring = new THREE.Mesh(tr(new THREE.TorusGeometry(b.len * 0.35, 0.05, 6, 24).rotateX(PI / 2)), M.goldPlain); ring.position.y = 1.2; g.add(ring);
            for (let i = 0; i < 6; i++) { const a = i / 6 * TAU, c = new THREE.Mesh(tr(new THREE.SphereGeometry(0.1, 8, 6)), M.candle); c.position.set(Math.cos(a) * b.len * 0.35, 1.3, Math.sin(a) * b.len * 0.35); g.add(c); }
          }
          return g;
        },
        anchor() {
          const g = new THREE.Group();
          const c = new THREE.Mesh(tr(new THREE.OctahedronGeometry(0.34, 0)), M.gem); c.scale.y = 1.6; g.add(c); anim.gems.push(c);
          return g;
        },
        zip(z) {
          const g = new THREE.Group();
          const a = new THREE.Vector3(z.ax, z.ay, z.az), b = new THREE.Vector3(z.bx, z.by, z.bz);
          g.add(L.tube([a, b], 0.04, M.gem, 8));
          for (const p of [a, b]) { const post = new THREE.Mesh(tr(new THREE.CylinderGeometry(0.15, 0.2, 4.4, 8)), M.goldPlain); post.position.set(p.x, p.y - 1.9, p.z); g.add(post); }
          return g;
        },
        decor(data) {
          const root = new THREE.Group();
          const b = data.bounds;
          // Det centrale tårn: tilspidset krystal fra lavaen til over kronen (holdt fri af banen)
          let tr0 = 30;
          for (const p of data.plats) tr0 = Math.min(tr0, Math.hypot(p.x - b.cx, p.z - b.cz) - Math.max(p.w, p.d) / 2 - 4);
          const R = Math.max(3, Math.min(tr0, 26));
          if (R > 3) {
            const tower = L.lathe([[R, ctx.lavaY - 2], [R * 0.95, b.minY], [R * 0.7, (b.minY + b.maxY) / 2], [R * 0.45, b.maxY + 10], [0.01, b.maxY + 60]], M.tower, 8);
            tower.position.set(b.cx, 0, b.cz); root.add(tower);
            for (let i = 0; i < 6; i++) { // guldbånd om tårnet
              const y = b.minY + (b.maxY - b.minY) * i / 5, rr = R * (0.95 - 0.5 * i / 5);
              const band = new THREE.Mesh(tr(new THREE.TorusGeometry(rr + 0.3, 0.4, 6, 32).rotateX(PI / 2)), M.goldPlain);
              band.position.set(b.cx, y, b.cz); root.add(band);
            }
          }
          // Nordlys: store bånd højt oppe, der bølger
          for (let i = 0; i < 4; i++) {
            const g = new THREE.PlaneGeometry(1400, 260, 40, 1);
            const P = g.attributes.position;
            for (let k = 0; k < P.count; k++) P.setZ(k, Math.sin(P.getX(k) * 0.006 + i) * 120);
            const m = new THREE.Mesh(tr(g), M.aurora);
            m.position.set(b.cx + (i - 1.5) * 200, b.maxY + 260 + i * 40, b.cz - 500 + i * 300);
            m.rotation.y = i * 0.6; root.add(m); anim.aurora.push(m);
          }
          // Svævende souvenirs fra de tidligere verdener i kredsløb (kun pynt)
          const shapes = [new THREE.CylinderGeometry(1.5, 1.5, 2.5, 16), new THREE.TorusGeometry(1.4, 0.6, 10, 20), new THREE.ConeGeometry(1.4, 2.6, 4), new THREE.BoxGeometry(2.2, 2.2, 2.2), new THREE.SphereGeometry(1.4, 14, 10)];
          for (let i = 0; i < 18; i++) {
            const m = new THREE.Mesh(tr(shapes[i % shapes.length]), M.souvenir[i % M.souvenir.length]);
            const r = b.radius + 30 + rng() * 60, y = b.minY + rng() * (b.maxY - b.minY + 30), a = rng() * TAU;
            if (!ctx.clearOfCourse(b.cx + Math.cos(a) * r, y, b.cz + Math.sin(a) * r, 10)) continue;
            root.add(m); anim.orbit.push({ m, r, y, a, cx: b.cx, cz: b.cz, sp: 0.03 + rng() * 0.04 });
          }
          // Krystalspir rundt om (i det fjerne)
          const spires = [];
          L.place(data, rng, 30, b.radius + 120, b.radius + 420, ctx.lavaY, ctx.lavaY, 20, (x, y, z) => { const h = 60 + rng() * 160, r = 4 + rng() * 10; spires.push({ x, y: y + h / 2, z, sx: r, sy: h, sz: r, ry: rng() * TAU }); });
          root.add(L.instanced(new THREE.ConeGeometry(1, 1, 6), M.tower, spires));
          return root;
        },
        update(dt, t) {
          for (const a of anim.aurora) { a.material.opacity = 0.7 + Math.sin(t * 0.5) * 0.3; a.position.x += Math.sin(t * 0.2) * dt * 4; }
          for (const o of anim.orbit) { o.a += o.sp * dt; o.m.position.set(o.cx + Math.cos(o.a) * o.r, o.y + Math.sin(t + o.a) * 2, o.cz + Math.sin(o.a) * o.r); o.m.rotation.y += dt * 0.5; }
          for (const g of anim.gems) g.rotation.y = t * 1.5;
        },
      };
    },
  };
})();

/* ===== VERDENSSÆT SLUT ===== */

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
    vec3 col = mix(uColA, uColB, sw * 0.7 + sw2 * 0.3) * (0.45 + 0.75 * (1.0 - r));
    col += vec3(0.9, 0.95, 1.0) * pow(1.0 - r, 6.0) * 0.6;
    float alpha = smoothstep(1.0, 0.82, r) * (0.35 + 0.4 * sw);
    gl_FragColor = vec4(col, alpha);
  }`;

const _tq = new THREE.Quaternion();

class Level {
  constructor(index, defOverride) {
    this.index = index;
    this.def = defOverride || LEVELS[index];
    this.data = buildLevelData(this.def);
    this.theme = THEMES[this.def.theme] || THEMES.day;
    this.group = new THREE.Group();
    this.platforms = [];
    this.anchors = [];
    this.coins = [];
    this.bars = [];
    this.zips = [];
    this.gusts = [];
    this.winds = [];
    this.vents = [];
    this.chains = [];
    this.rayMeshes = [];      // kamera-kollision, reb-sigte og skygge
    this.disposables = [];
    this.time = 0;
    this.checkpoint = null;   // seneste kontrolpunkt (platform), man genstarter fra
    this.bodyToPlat = new Map();
    const ctx = makeKitContext(this);
    this.kit = (WORLD_KITS[this.def.kit] || WORLD_KITS.sten).create(ctx);
    this.fallbackKit = this.def.kit && this.def.kit !== 'sten' ? WORLD_KITS.sten.create(ctx) : this.kit;
    this.build();
    scene.add(this.group);
  }

  geo(g) { this.disposables.push(g); return g; }

  build() {
    for (const p of this.data.plats) this.buildPlatform(p);
    for (const b of this.data.bars) this.buildBar(b);
    for (const w of this.data.winds) this.winds.push({ def: w, emit: 0 });
    for (const z of this.data.zips) this.buildZip(z);
    for (const g of this.data.gusts) this.gusts.push({ def: g, emit: 0, f: fwdVec(g.yaw), r: rightVec(g.yaw) });
    for (const a of this.data.anchors) this.buildAnchor(a);
    for (const c of this.data.coins) this.buildCoin(c);
    if (this.kit.decor) {
      const d = this.kit.decor(this.data);
      if (d) this.group.add(d);
    }
    for (const plat of this.platforms) if (plat.def.cp) this.buildCheckpoint(plat);
    this.buildStartDecor();
    this.buildPortal();
  }

  // Lad sættet tegne objektet; sæt skygger og registrér de faste flader
  adopt(obj, plat) {
    let solids = 0;
    obj.traverse((o) => {
      if (!o.isMesh) return;
      if (!o.userData.noCastShadow) o.castShadow = true;
      o.receiveShadow = true;
      if (o.userData.solid) {
        solids++;
        if (plat) { o.userData.plat = plat; this.rayMeshes.push(o); }
      }
    });
    return solids;
  }

  buildPlatform(p) {
    const plat = {
      def: p, type: p.type, mesh: null, body: null,
      grip: p.type === 'ice' ? CFG.grip.ice : CFG.grip.normal,
      icy: p.type === 'ice' || p.v === 'ice' || p.slick, // glatte kanter: grebet slipper dobbelt så hurtigt
      state: 'solid', timer: 0, fallVel: 0, squash: 0,
    };
    const pose = platformPose(p);
    const visual = this.kit.platform(p) || this.fallbackKit.platform(p);
    const mesh = new THREE.Group();
    mesh.add(visual);
    if (!this.adopt(visual, plat)) {
      // Sættet glemte at markere en fast flade: tilføj en usynlig, så kamera og reb stadig virker
      const g = p.shape === 'cyl' ? new THREE.CylinderGeometry(p.w / 2, p.w / 2, p.h, 16)
        : new THREE.BoxGeometry(p.w, p.h, p.type === 'ramp' ? p.slopeLen : p.d);
      const hidden = new THREE.Mesh(this.geo(g), new THREE.MeshBasicMaterial({ visible: false }));
      hidden.userData.solid = true;
      hidden.userData.plat = plat;
      mesh.add(hidden);
      this.rayMeshes.push(hidden);
    }
    this.buildLip(p, plat, mesh);
    mesh.position.copy(pose.pos);
    mesh.quaternion.copy(pose.quat);
    this.group.add(mesh);
    plat.mesh = mesh;
    plat.baseQuat = pose.quat.clone();

    // Fysik
    const kin = p.kin;
    const body = new CANNON.Body({
      mass: 0,
      type: kin ? CANNON.Body.KINEMATIC : CANNON.Body.STATIC,
      material: MAT_WORLD,
      collisionFilterGroup: kin ? G_KINEMATIC : G_STATIC,
      collisionFilterMask: G_PLAYER,
    });
    if (p.shape === 'cyl') body.addShape(new CANNON.Cylinder(p.w / 2, p.w / 2, p.h, 20));
    else body.addShape(new CANNON.Box(new CANNON.Vec3(p.w / 2, p.h / 2, (p.type === 'ramp' ? p.slopeLen : p.d) / 2)));
    body.position.set(pose.pos.x, pose.pos.y, pose.pos.z);
    body.quaternion.set(pose.quat.x, pose.quat.y, pose.quat.z, pose.quat.w);
    if (p.type === 'rot') body.angularVelocity.set(0, p.spd, 0);
    world.addBody(body);
    plat.body = body;
    plat.base = body.position.clone();
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
        // Sættet kan tegne sin egen arm (lokal X langs armen, 0,36 høj og 0,45 dyb)
        const bar = (this.kit.spinArm && this.kit.spinArm(p)) || new THREE.Mesh(this.geo(boxGeometry(p.bar, 0.36, 0.45, 2)), MAT.stripes);
        bar.rotation.y = (i * Math.PI) / 2;
        bar.traverse((o) => { if (o.isMesh) o.castShadow = true; });
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
    // Kæder fra pendulplatformens hjørner op til ophænget
    if (p.swing) {
      const cw = p.w * 0.42, cd = p.d * 0.42;
      for (const [cx, cz] of [[-cw, -cd], [cw, -cd], [-cw, cd], [cw, cd]]) {
        const local = new THREE.Vector3(cx, p.h / 2, cz).applyQuaternion(plat.baseQuat);
        const chain = new THREE.Mesh(this.geo(new THREE.CylinderGeometry(0.035, 0.035, 1, 6, 1, true).translate(0, 0.5, 0)), MAT.hub);
        chain.castShadow = true;
        this.group.add(chain);
        this.chains.push({ plat, local, pivot: new THREE.Vector3(plat.base.x + local.x, plat.base.y + local.y + p.swing.len, plat.base.z + local.z), mesh: chain });
      }
    }
    if (p.type === 'vent') this.vents.push({ plat, emit: 0 });
    this.platforms.push(plat);
  }

  // Kalkhvid, slidt kant på alt, man kan gribe fat i (blå frostkant, hvis den er glat)
  buildLip(p, plat, mesh) {
    if (NO_LEDGE.has(p.type) || !p.lip || Math.min(p.w, p.d) < 0.5) return;
    const mat = plat.icy ? (this.kit.slickColor && !(p.type === 'ice' || p.v === 'ice') ? this.slickMat() : MAT.lipIcy) : p.grab ? MAT.lipGrab : MAT.lipFaint;
    const strong = plat.icy || p.grab;
    const tw = strong ? 0.16 : 0.1, drop = strong ? 0.14 : 0.08, y0 = p.h / 2 + 0.008;
    let g;
    if (p.shape === 'cyl') {
      const R = p.w / 2;
      const ring = new THREE.RingGeometry(Math.max(0.05, R - tw), R + 0.01, 48, 1).rotateX(-Math.PI / 2).translate(0, y0, 0);
      const band = new THREE.CylinderGeometry(R + 0.012, R + 0.012, drop, 48, 1, true).translate(0, y0 - drop / 2, 0);
      const lipG = new THREE.Group();
      lipG.add(new THREE.Mesh(this.geo(ring), mat), new THREE.Mesh(this.geo(band), mat));
      lipG.traverse((o) => { o.userData.noCastShadow = true; });
      mesh.add(lipG);
      return;
    }
    const hw = p.w / 2, hd = p.d / 2, e = 0.012, pos = [];
    const quad = (a, b, c, d) => pos.push(...a, ...b, ...c, ...a, ...c, ...d);
    // Top-ramme: forkant/bagkant i fuld længde, siderne afkortet så hjørnerne ikke overlapper
    quad([-hw, y0, -hd], [hw, y0, -hd], [hw, y0, -hd + tw], [-hw, y0, -hd + tw]);
    quad([-hw, y0, hd - tw], [hw, y0, hd - tw], [hw, y0, hd], [-hw, y0, hd]);
    quad([-hw, y0, -hd + tw], [-hw + tw, y0, -hd + tw], [-hw + tw, y0, hd - tw], [-hw, y0, hd - tw]);
    quad([hw - tw, y0, -hd + tw], [hw, y0, -hd + tw], [hw, y0, hd - tw], [hw - tw, y0, hd - tw]);
    // Smalle bånd ned ad siderne
    const yb = y0 - drop;
    quad([-hw, yb, -hd - e], [hw, yb, -hd - e], [hw, y0, -hd - e], [-hw, y0, -hd - e]);
    quad([hw, yb, hd + e], [-hw, yb, hd + e], [-hw, y0, hd + e], [hw, y0, hd + e]);
    quad([-hw - e, yb, hd], [-hw - e, yb, -hd], [-hw - e, y0, -hd], [-hw - e, y0, hd]);
    quad([hw + e, yb, -hd], [hw + e, yb, hd], [hw + e, y0, hd], [hw + e, y0, -hd]);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const m = new THREE.Mesh(this.geo(geo), mat);
    m.userData.noCastShadow = true;
    mesh.add(m);
  }

  slickMat() {
    if (!this._slickMat) {
      this._slickMat = MAT.lipIcy.clone();
      this._slickMat.color.set(this.kit.slickColor);
      this.disposables.push(this._slickMat);
    }
    return this._slickMat;
  }

  buildBar(b) {
    const visual = (this.kit.bar && this.kit.bar(b)) || this.fallbackKit.bar(b);
    this.adopt(visual, null);
    // Hvide gribebånd: samme signal på alle stænger i alle verdener
    if (b.len >= 0.6) {
      const tapeGeo = this.geo(new THREE.CylinderGeometry(b.r + 0.014, b.r + 0.014, 0.11, 12).rotateZ(Math.PI / 2));
      const n = Math.max(2, Math.round(b.len / 0.7));
      for (let i = 0; i < n; i++) {
        const tape = new THREE.Mesh(tapeGeo, MAT.gripTape);
        tape.position.x = -b.len / 2 + (b.len * (i + 0.5)) / n;
        visual.add(tape);
      }
    }
    visual.position.set(b.x, b.y, b.z);
    visual.rotation.y = Math.atan2(-b.dz, b.dx); // lokal X langs stangen
    this.group.add(visual);
    const bar = {
      def: b, mesh: visual,
      a0: new THREE.Vector3(b.x - (b.dx * b.len) / 2, b.y, b.z - (b.dz * b.len) / 2),
      a: new THREE.Vector3(b.x - (b.dx * b.len) / 2, b.y, b.z - (b.dz * b.len) / 2),
      dir: new THREE.Vector3(b.dx, 0, b.dz),
      vel: new THREE.Vector3(), ropes: [],
    };
    if (b.swing) { // trapezets reb op til ophænget
      for (const e of [0.15, 0.85]) {
        const rope = new THREE.Mesh(this.geo(new THREE.CylinderGeometry(0.025, 0.025, 1, 6, 1, true).translate(0, 0.5, 0)), MAT.rope);
        this.group.add(rope);
        bar.ropes.push({ e, mesh: rope, pivot: new THREE.Vector3(bar.a0.x + b.dx * b.len * e, b.y + b.swing.len, bar.a0.z + b.dz * b.len * e) });
      }
    }
    this.bars.push(bar);
  }

  buildZip(z) {
    let visual = this.kit.zip && this.kit.zip(z);
    if (!visual) {
      visual = new THREE.Group();
      const len3 = Math.hypot(z.len, z.drop);
      const cable = new THREE.Mesh(this.geo(new THREE.CylinderGeometry(0.03, 0.03, len3, 6)), MAT.hook);
      cable.position.set((z.bx - z.ax) / 2, (z.by - z.ay) / 2, (z.bz - z.az) / 2);
      cable.quaternion.setFromUnitVectors(AXIS_Y, new THREE.Vector3(z.bx - z.ax, z.by - z.ay, z.bz - z.az).normalize());
      visual.add(cable);
      for (const [px, py, pz] of [[0, 0, 0], [z.bx - z.ax, z.by - z.ay, z.bz - z.az]]) {
        const pole = new THREE.Mesh(this.geo(new THREE.CylinderGeometry(0.1, 0.12, 3, 10)), MAT.hub);
        pole.position.set(px, py + 0.2, pz);
        visual.add(pole);
      }
      visual.position.set(z.ax, z.ay, z.az);
    }
    this.adopt(visual, null);
    this.group.add(visual);
    const handle = new THREE.Mesh(this.geo(new THREE.TorusGeometry(0.16, 0.035, 8, 16)), MAT.anchor);
    this.group.add(handle);
    const d3 = new THREE.Vector3(z.bx - z.ax, z.by - z.ay, z.bz - z.az);
    const len3 = d3.length();
    this.zips.push({ def: z, mesh: visual, handle, a: new THREE.Vector3(z.ax, z.ay, z.az), dir3: d3.divideScalar(len3), len3, dir: new THREE.Vector3(z.dx, 0, z.dz), s: 0.3 });
  }

  ventActive(plat) {
    const d = plat.def;
    return !d.pulse || ((this.time / d.pulse + d.ph) % 1) < d.duty;
  }
  gustActive(g) {
    const d = g.def;
    return ((this.time / d.per + d.ph) % 1) < d.duty;
  }

  buildAnchor(a) {
    // Ankerpunktet har altid en lysende cyan ring; sættet bestemmer, hvad der sidder i midten
    const group = new THREE.Group();
    if (!this._anchorRingGeo) this._anchorRingGeo = this.geo(new THREE.TorusGeometry(0.62, 0.09, 12, 36));
    const ring = new THREE.Mesh(this._anchorRingGeo, MAT.anchorRing);
    group.add(ring);
    const custom = this.kit.anchor && this.kit.anchor(a);
    if (custom) {
      this.adopt(custom, null);
      group.add(custom);
    } else {
      const inner = new THREE.Mesh(this.geo(new THREE.SphereGeometry(0.2, 16, 12)), MAT.anchor);
      group.add(inner);
    }
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: TEX.glow, color: '#4fe6ff', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.8,
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
    const obj = { def: c, mesh: group, collected: false, plat: c.plat !== undefined ? this.platforms[c.plat] : null, pos: new THREE.Vector3(c.x, c.y, c.z), spin: (c.x * 7.13 + c.z * 3.71) % 6 };
    if (obj.plat) obj.offset = new THREE.Vector3(c.x - obj.plat.base.x, c.y - obj.plat.base.y, c.z - obj.plat.base.z);
    group.position.copy(obj.pos);
    this.group.add(group);
    this.coins.push(obj);
  }

  // Kontrolpunkt: en flad, lysende ring på platformen (bliver grøn, når den er nået)
  buildCheckpoint(plat) {
    const d = plat.def, R = Math.min(d.w, d.shape === 'cyl' ? d.w : d.d) * 0.3;
    const mat = new THREE.MeshBasicMaterial({ color: '#e8f2ff', transparent: true, opacity: 0.75, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    this.disposables.push(mat);
    const ring = new THREE.Mesh(this.geo(new THREE.RingGeometry(R * 0.82, R, 48).rotateX(-Math.PI / 2)), mat);
    ring.position.y = d.h / 2 + 0.012;
    const dot = new THREE.Mesh(this.geo(new THREE.CircleGeometry(R * 0.28, 32).rotateX(-Math.PI / 2)), mat);
    dot.position.y = d.h / 2 + 0.012;
    plat.mesh.add(ring, dot);
    plat.cpMat = mat;
  }

  setCheckpoint(plat) {
    if (this.checkpoint === plat) return;
    if (this.checkpoint && this.checkpoint.cpMat) this.checkpoint.cpMat.color.set('#e8f2ff');
    this.checkpoint = plat;
    if (plat && plat.cpMat) plat.cpMat.color.set('#5dff9b');
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
    sign.rotation.y = -p.yaw + Math.PI + 0.35;
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
      map: TEX.glow, color: '#4fb8ff', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.32,
    }));
    glow.scale.set(8, 8, 1);
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
      if (plat.def.move || plat.def.swing) {
        plat.body.position.copy(plat.base);
        plat.body.velocity.set(0, 0, 0);
      }
      if (plat.type === 'rot') {
        const q = plat.baseQuat;
        plat.body.quaternion.set(q.x, q.y, q.z, q.w);
        plat.body.angularVelocity.set(0, plat.def.spd, 0);
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
    plat.mesh.quaternion.copy(plat.baseQuat);
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
      if ((plat.def.move || plat.def.swing) && plat.state === 'solid') {
        if (plat.def.move) moveOffset(plat.def.move, t, o);
        else swingOffset(plat.def.swing, t, o);
        const tx = plat.base.x + o.x, ty = plat.base.y + o.y, tz = plat.base.z + o.z;
        if (dt > 0) plat.body.velocity.set((tx - plat.body.position.x) / dt, (ty - plat.body.position.y) / dt, (tz - plat.body.position.z) / dt);
        else plat.body.position.set(tx, ty, tz);
      }
      if (plat.type === 'crumble' && plat.state !== 'solid') {
        plat.timer -= dt;
        if (plat.state === 'shaking' && plat.timer <= 0) {
          plat.state = 'falling';
          plat.timer = 3.2;
          world.removeBody(plat.body);
          if (abilities.rope && abilities.rope.plat === plat) releaseRope(false);
        } else if (plat.state === 'falling' && plat.timer <= 0) {
          // Kommer kun tilbage, hvis spilleren ikke står i vejen
          const pb = player.body.position;
          if (plat.def.kin) { plat.body.position.copy(plat.base); plat.body.velocity.set(0, 0, 0); }
          const near = Math.abs(pb.x - plat.base.x) < plat.def.w / 2 + 1 && Math.abs(pb.z - plat.base.z) < plat.def.d / 2 + 1 &&
            Math.abs(pb.y - plat.def.top) < 2.5;
          if (!near) this.restoreCrumble(plat);
          else plat.timer = 0.3;
        }
      }
    }
    for (const a of this.anchors) this.anchorPos(a, t, a.pos, a.vel);
    for (const bar of this.bars) {
      if (bar.def.swing) swingOffset(bar.def.swing, t, o);
      else if (bar.def.move) moveOffset(bar.def.move, t, o);
      else continue;
      const nx = bar.a0.x + o.x, ny = bar.a0.y + o.y, nz = bar.a0.z + o.z;
      if (dt > 0) bar.vel.set((nx - bar.a.x) / dt, (ny - bar.a.y) / dt, (nz - bar.a.z) / dt);
      bar.a.set(nx, ny, nz);
    }
  }

  // Kaldes hver frame (grafik)
  update(dt, elapsed) {
    for (const plat of this.platforms) {
      if (plat.def.kin && plat.state === 'solid') {
        plat.mesh.position.copy(plat.body.position);
        if (plat.type === 'rot') plat.mesh.quaternion.copy(plat.body.quaternion);
      } else if (plat.type === 'crumble') {
        if (plat.state === 'shaking') {
          const k = 0.06 * (1 - plat.timer / 0.55 + 0.3);
          const c = plat.body.position;
          plat.mesh.position.set(c.x + (Math.random() - 0.5) * k, c.y + (Math.random() - 0.5) * k * 0.5, c.z + (Math.random() - 0.5) * k);
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
    // Pendulernes kæder
    for (const c of this.chains) {
      const bp = c.plat.body.position;
      const from = _v3a.set(bp.x + c.local.x, bp.y + c.local.y, bp.z + c.local.z);
      const dir = _v3b.copy(c.pivot).sub(from);
      const len = dir.length();
      c.mesh.position.copy(from);
      c.mesh.quaternion.setFromUnitVectors(AXIS_Y, dir.divideScalar(len || 1));
      c.mesh.scale.set(1, len, 1);
    }
    for (const bar of this.bars) {
      if (!bar.def.swing && !bar.def.move) continue;
      const b = bar.def;
      bar.mesh.position.set(bar.a.x + (b.dx * b.len) / 2, bar.a.y, bar.a.z + (b.dz * b.len) / 2);
      for (const r of bar.ropes) {
        const from = _v3a.set(bar.a.x + b.dx * b.len * r.e, bar.a.y, bar.a.z + b.dz * b.len * r.e);
        const dir = _v3b.copy(r.pivot).sub(from);
        const len = dir.length();
        r.mesh.position.copy(from);
        r.mesh.quaternion.setFromUnitVectors(AXIS_Y, dir.divideScalar(len || 1));
        r.mesh.scale.set(1, len, 1);
      }
    }
    for (const z of this.zips) {
      const riding = player.hang && player.hang.kind === 'zip' && player.hang.zip === z;
      const s = riding ? player.hang.s3 : z.s;
      z.handle.position.copy(z.a).addScaledVector(z.dir3, s);
      z.handle.position.y -= 0.18;
      z.handle.rotation.y = -Math.atan2(z.dir.z, z.dir.x);
    }
    // Opvind: damp/luft der stiger op
    if (dt > 0) {
      const col = this.kit.ventColor || '#ffffff';
      const cam = camera.position;
      for (const g of this.gusts) {
        const d = g.def;
        if (!this.gustActive(g) || Math.abs(d.x - cam.x) > 90 || Math.abs(d.z - cam.z) > 90) continue;
        g.emit += dt * 40;
        while (g.emit > 1) {
          g.emit--;
          const a = (Math.random() - 0.5) * d.d, b = (Math.random() - 0.5) * d.w;
          particles.emit(d.x + g.f.x * a + g.r.x * b - d.dx * d.w * 0.4, d.y + Math.random() * d.h, d.z + g.f.z * a + g.r.z * b - d.dz * d.w * 0.4,
            d.dx * 14, 0, d.dz * 14, '#e8f4ff', 0.18, 0.7, 0, 0);
        }
      }
      for (const v of this.vents) {
        const bp = v.plat.body.position, d = v.plat.def;
        if (!this.ventActive(v.plat)) continue;
        if (Math.abs(bp.x - cam.x) > 90 || Math.abs(bp.z - cam.z) > 90) continue;
        v.emit += dt * 26;
        const r = Math.min(d.w, d.d) * 0.4;
        while (v.emit > 1) {
          v.emit--;
          const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * r;
          particles.emit(bp.x + Math.cos(a) * rr, bp.y + d.h / 2 + 0.1, bp.z + Math.sin(a) * rr,
            0, 4 + Math.random() * 4, 0, col, 0.35 + Math.random() * 0.4, d.lift / 7, 0, 0.3);
        }
      }
      for (const w of this.winds) {
        const d = w.def;
        if (Math.abs(d.x - cam.x) > 90 || Math.abs(d.z - cam.z) > 90) continue;
        w.emit += dt * 30;
        while (w.emit > 1) {
          w.emit--;
          const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * d.r;
          particles.emit(d.x + Math.cos(a) * rr, d.y + Math.random() * 2, d.z + Math.sin(a) * rr,
            0, 5 + Math.random() * 4, 0, col, 0.3 + Math.random() * 0.35, d.h / 8, 0, 0.3);
        }
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
        if (c.plat.type === 'rot') {
          c.pos.copy(c.offset).applyQuaternion(_tq.copy(c.plat.mesh.quaternion).multiply(_tq2.copy(c.plat.baseQuat).invert())).add(c.plat.mesh.position);
        } else {
          c.pos.copy(c.plat.mesh.position).add(c.offset);
        }
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
      P.glow.scale.set(8 * pulse, 8 * pulse, 1);
      P.light.intensity = 36 + Math.sin(elapsed * 5) * 8;
    }
    if (this.kit.update) this.kit.update(dt, elapsed);
  }

  dispose() {
    for (const plat of this.platforms) {
      if (plat.body.world) world.removeBody(plat.body);
      if (plat.bar) world.removeBody(plat.bar.body);
    }
    scene.remove(this.group);
    // Frigiv alt GPU-indhold, sættet har lavet (men aldrig de delte materialer/teksturer)
    const seen = new Set(this.disposables);
    this.group.traverse((o) => {
      if (o.geometry) seen.add(o.geometry);
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of mats) {
        seen.add(m);
        for (const k of ['map', 'bumpMap', 'normalMap', 'roughnessMap', 'emissiveMap', 'alphaMap', 'aoMap', 'metalnessMap']) {
          if (m[k]) seen.add(m[k]);
        }
      }
    });
    for (const d of seen) if (d && d.dispose && !SHARED_GPU.has(d)) d.dispose();
  }
}
const _v3a = new THREE.Vector3(), _v3b = new THREE.Vector3(), _tq2 = new THREE.Quaternion();

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
/* ===== FIGUR START ===== */
/* =====================================================================
   Skyhøj Parkour – realistisk løber
   Procedural figur af standard Three.js-geometri:
   - led-hierarki: bækken › ryg › bryst › nakke › hoved; skulder › overarm ›
     underarm › hånd (håndflade, tommel, 4 fingre i 2 led); hofte › lår ›
     skinneben › fod › tå
   - to-leds IK for arme og ben, afstandsdrevet løbecyklus (fødderne glider ikke)
   - salto, hænge-, klatre- og rebstillinger, skateboard og udstyr
   Bruges som: CHARACTER = createCharacterModule(THREE)
   ===================================================================== */
function createCharacterModule(THREE) {
  'use strict';
  // Konstanter fra spillets CFG (kopieret – figuren læser ikke CFG)
  const RADIUS = 0.42;      // roden er kroppens centrum; fødderne står 0.42 m under
  const RUN_SPEED = 9;      // fuld løbefart (m/s)
  const HANG_DROP = 1.72;   // hænderne er 1.72 m over roden, når man hænger
  const WALL_GAP = 0.47;    // … og kanten er 0.47 m foran roden (mod lokal −Z)

  // Kroppens mål i meter over fodlinjen (1.80 m høj, ca. 7.5 hoveder)
  const HIP_Y = 0.95, HIP_X = 0.092, THIGH = 0.445, SHIN = 0.42, ANKLE_H = 0.085;
  const UPPER = 0.29, FORE = 0.265;
  const SPINE_Y = 0.09, CHEST_Y = 0.17, NECK_Y = 0.29, HEAD_Y = 0.085;
  const CLAV_X = 0.02, CLAV_Y = 0.22, SHO_X = 0.165, SHO_Y = 0.015, SHO_Z = 0.012;
  const PIVOT_Y = 0.9;      // saltoens drejepunkt over fødderne
  const DECK = 0.11;        // skateboardets dæk over fodlinjen
  const EYE_X = 0.031, EYE_Y = 0.098, EYE_Z = -0.079;

  // ---------- Små hjælpere ----------
  const V2 = THREE.Vector2, V3 = THREE.Vector3, Q = THREE.Quaternion, M4 = THREE.Matrix4;
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
  const frac = (x) => x - Math.floor(x);
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const UPV = new V3(0, 1, 0), DOWN = new V3(0, -1, 0);
  function rng(seed) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }
  function spline(K, w) { // Catmull-Rom gennem jævnt fordelte nøgler (w 0..1)
    const n = K.length - 1, x = clamp(w, 0, 1) * n, i = Math.min(n - 1, Math.floor(x)), t = x - i;
    const p0 = K[Math.max(0, i - 1)], p1 = K[i], p2 = K[i + 1], p3 = K[Math.min(n, i + 2)];
    return 0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (3 * p1 - p0 - 3 * p2 + p3) * t * t * t);
  }

  // ---------- Geometri ----------
  const _m = new M4(), _q = new Q(), _e = new THREE.Euler(), _v = new V3(), _s = new V3();
  function xf(g, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    _m.compose(_v.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz));
    return g.applyMatrix4(_m);
  }
  const lathe = (pts, seg = 16) => new THREE.LatheGeometry(pts.map((p) => new V2(p[0], p[1])), seg);
  const ball = (w = 16, h = 12) => new THREE.SphereGeometry(1, w, h);
  function shape(g, fn) { // flyt hjørnepunkter og genberegn normaler
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { _v.fromBufferAttribute(p, i); fn(_v); p.setXYZ(i, _v.x, _v.y, _v.z); }
    g.computeVertexNormals();
    return g;
  }
  const capsule = (r, len) => new THREE.CapsuleGeometry(r, len, 3, 8).translate(0, -len / 2, 0);
  const plain = (g) => merge([[g, 0xffffff]]);

  // Flet dele sammen til én geometri med punktfarver: [[geometri, farve | fn(v, c)], …]
  const _col = new THREE.Color();
  function merge(parts) {
    let nv = 0, ni = 0;
    for (const [g] of parts) { nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), col = new Float32Array(nv * 3);
    const idx = nv > 65000 ? new Uint32Array(ni) : new Uint16Array(ni);
    let vo = 0, io = 0;
    for (const [g, c] of parts) {
      const P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv, n = P.count, fn = typeof c === 'function';
      if (!fn) _col.set(c === undefined ? 0xffffff : c);
      for (let i = 0; i < n; i++) {
        const k = vo + i;
        _v.fromBufferAttribute(P, i);
        pos[k * 3] = _v.x; pos[k * 3 + 1] = _v.y; pos[k * 3 + 2] = _v.z;
        if (N) { nor[k * 3] = N.getX(i); nor[k * 3 + 1] = N.getY(i); nor[k * 3 + 2] = N.getZ(i); }
        if (U) { uv[k * 2] = U.getX(i); uv[k * 2 + 1] = U.getY(i); }
        if (fn) c(_v, _col, i);
        col[k * 3] = _col.r; col[k * 3 + 1] = _col.g; col[k * 3 + 2] = _col.b;
      }
      if (g.index) for (let i = 0; i < g.index.count; i++) idx[io++] = g.index.getX(i) + vo;
      else for (let i = 0; i < n; i++) idx[io++] = i + vo;
      vo += n;
      g.dispose();
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    out.setIndex(new THREE.BufferAttribute(idx, 1));
    out.computeBoundingSphere();
    return out;
  }

  // Farver (stof-materialerne er hvide; farven ligger i punktfarverne)
  const C = {
    hood: '#e4472d', hoodDk: '#b93723', pocket: '#d33f28', pants: '#26334d', pantsDk: '#1b2438', stripe: '#c9d1e0',
    shoe: '#f3f3f0', sole: '#f7f6f2', outsole: '#38383b', grey: '#c3c8d0', accent: '#ffcf33', cord: '#f0ede6',
  };

  // Stof-normalkort (lille strik-mønster), deles af alle figurer
  let FABRIC_N = null;
  function fabricNormal() {
    if (FABRIC_N || typeof document === 'undefined') return FABRIC_N;
    const S = 64, cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const ctx = cv.getContext('2d'), img = ctx.createImageData(S, S), R = rng(3), h = new Float32Array(S * S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) h[y * S + x] = 0.35 * Math.sin((x / S) * TAU * 8) * Math.sin((y / S) * TAU * 16) + 0.3 * R();
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const dx = h[y * S + ((x + 1) % S)] - h[y * S + ((x + S - 1) % S)], dy = h[((y + 1) % S) * S + x] - h[((y + S - 1) % S) * S + x];
      const l = Math.hypot(dx, dy, 1), k = (y * S + x) * 4;
      img.data[k] = (-dx / l * 0.5 + 0.5) * 255; img.data[k + 1] = (-dy / l * 0.5 + 0.5) * 255; img.data[k + 2] = (1 / l * 0.5 + 0.5) * 255; img.data[k + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    FABRIC_N = new THREE.CanvasTexture(cv);
    FABRIC_N.wrapS = FABRIC_N.wrapT = THREE.RepeatWrapping;
    FABRIC_N.repeat.set(5, 5);
    return FABRIC_N;
  }

  const SKIN = new THREE.Color('#d8a184'), GLOVE = new THREE.Color('#2a2e35'), WHITE = new THREE.Color('#ffffff'), CHALKG = new THREE.Color('#d8d8d4');
  function makeMaterials() {
    const phys = (o) => new THREE.MeshPhysicalMaterial(o);
    const nm = fabricNormal();
    const fabric = (color, sheenColor, rough) => phys({
      color, roughness: rough, sheen: 1, sheenRoughness: 0.55, sheenColor: new THREE.Color(sheenColor),
      vertexColors: true, normalMap: nm, normalScale: new V2(0.35, 0.35),
    });
    const skinM = () => phys({ color: SKIN.clone(), roughness: 0.5, sheen: 0.35, sheenRoughness: 0.45, sheenColor: new THREE.Color('#ffc2a8'), vertexColors: true });
    return {
      skin: skinM(), hand: skinM(),
      hoodie: fabric('#ffffff', '#ffb8a2', 0.86), pants: fabric('#ffffff', '#8796c4', 0.9), cord: fabric('#ffffff', '#ffffff', 0.8),
      glove: fabric(GLOVE.clone(), '#7a8290', 0.8), gear: fabric('#ffffff', '#ffffff', 0.75), rope: fabric('#ffffff', '#a8e6ff', 0.75),
      shoe: phys({ color: '#ffffff', roughness: 0.45, clearcoat: 0.15, vertexColors: true }),
      hair: phys({ color: '#ffffff', roughness: 0.7, sheen: 0.6, sheenRoughness: 0.4, sheenColor: new THREE.Color('#7a5a40'), vertexColors: true }),
      eye: phys({ color: '#f1eee8', roughness: 0.25, clearcoat: 0.6 }),
      iris: phys({ color: '#ffffff', roughness: 0.2, clearcoat: 0.8, vertexColors: true }),
      lips: phys({ color: '#b97668', roughness: 0.45, sheen: 0.3, sheenColor: new THREE.Color('#ffb0a0') }),
      band: fabric('#ffffff', '#fff1b0', 0.8),
      hard: phys({ color: '#ffffff', roughness: 0.38, clearcoat: 0.6, vertexColors: true }),
      deck: phys({ color: '#ffffff', roughness: 0.7, vertexColors: true }),
      metal: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.35, metalness: 0.85, vertexColors: true }),
      wheel: phys({ color: '#ffffff', roughness: 0.4, vertexColors: true }),
    };
  }

  // --- Krop ---
  function pelvisGeo() {
    const g = xf(lathe([[0.03, -0.12], [0.1, -0.108], [0.148, -0.072], [0.165, -0.02], [0.164, 0.05], [0.154, 0.13]], 20), 0, 0, 0, 0, 0, 0, 1, 1, 0.74);
    return merge([[g, C.pants]]);
  }
  function abdomenGeo() {
    const g = xf(lathe([[0.168, -0.14], [0.173, -0.125], [0.172, -0.1], [0.167, -0.05], [0.161, 0.02], [0.158, 0.1], [0.163, 0.17], [0.17, 0.21]], 24), 0, 0, 0, 0, 0, 0, 1, 1, 0.72);
    const inPocket = (v) => v.z < -0.05 && Math.abs(v.x) < 0.098 && v.y > -0.1 && v.y < 0.0;
    shape(g, (v) => { if (inPocket(v)) v.z *= 1.05; });
    return merge([[g, (v, c) => c.set(v.y < -0.112 ? C.hoodDk : inPocket(v) ? (Math.abs(v.x) > 0.085 || v.y > -0.012 ? C.hoodDk : C.pocket) : C.hood)]]);
  }
  function chestGeo() {
    const g = xf(lathe([[0.158, -0.15], [0.17, -0.06], [0.186, 0.03], [0.195, 0.1], [0.198, 0.16], [0.19, 0.2], [0.165, 0.235], [0.128, 0.265], [0.092, 0.29], [0.068, 0.312], [0.058, 0.325]], 24), 0, 0, 0, 0, 0, 0, 1, 1, 0.68);
    const collar = xf(new THREE.TorusGeometry(0.064, 0.014, 6, 20), 0, 0.312, 0.006, Math.PI / 2, 0, 0, 1, 1, 0.9);
    return merge([[g, C.hood], [collar, C.hoodDk]]);
  }
  function hoodGeo() {
    const roll = xf(new THREE.TorusGeometry(0.088, 0.031, 8, 26, Math.PI * 1.7), 0, 0, 0, Math.PI / 2, 0, 0, 1, 1, 0.95).rotateY(1.1);
    const bulk = shape(ball(14, 10), (v) => v.set(v.x * 0.12, v.y * 0.1 - 0.065, v.z * 0.045 + 0.112));
    return merge([[roll, C.hood], [bulk, C.hood]]);
  }
  function stringsGeo() {
    const parts = [];
    for (const x of [-0.033, 0.033]) {
      parts.push([xf(new THREE.CylinderGeometry(0.0035, 0.0035, 0.15, 5), x, -0.075, 0), C.cord]);
      parts.push([xf(new THREE.CylinderGeometry(0.005, 0.0045, 0.022, 6), x, -0.158, 0), '#cfcfcf']);
    }
    return merge(parts);
  }

  // --- Hoved ---
  function headUnit(v, sock = true) { // enhedskugle → hovedform (hovedets lokale rum)
    let x = v.x, y = v.y, z = v.z;
    if (y < 0) x *= 1 - 0.12 * y * y - 0.45 * Math.max(0, -y - 0.62); // smallere hage
    if (y < -0.35 && y > -0.95) x *= 1 + 0.16 * Math.sin(((-y - 0.35) / 0.6) * Math.PI); // kantet kæbe
    if (y < -0.86) y = -0.86 + (y + 0.86) * 0.5;               // flad hage                          // kæben smalner
    if (y < -0.2 && z < 0) z *= 1 + 0.14 * (-y - 0.2);        // hage frem
    z *= z < 0 ? 0.9 : 1.05;                                  // fladt ansigt, rundt baghoved
    if (sock && z < 0) for (const ex of [-0.4, 0.4]) {        // øjenhuler
      const d = Math.hypot(x - ex, y + 0.02);
      if (d < 0.3) z *= 1 - 0.1 * (1 - d / 0.3) ** 2;
    }
    v.set(x * 0.079, y * 0.113 + 0.1, z * 0.1 - 0.012);
  }
  function headGeo() {
    const g = ball(26, 20).rotateY(Math.PI / 2);
    shape(g, (v) => headUnit(v));
    const nose = xf(shape(ball(10, 8), (v) => v.set(v.x * 0.012, v.y * 0.024, v.z * 0.016)), 0, 0.084, -0.1, -0.3, 0, 0);
    const tip = xf(shape(ball(10, 8), (v) => v.set(v.x * 0.0125, v.y * 0.01, v.z * 0.011)), 0, 0.066, -0.108);
    const parts = [[g, (v, c) => {
      const uy = (v.y - 0.1) / 0.113, uz = (v.z + 0.012) / 0.1, ux = v.x / 0.078;
      c.setRGB(1, 1, 1);
      const st = smooth(-0.3, -0.6, uy) * (uz < 0.35 ? 1 : 0);  // skægstubbe
      if (st > 0) c.setRGB(1 - 0.16 * st, 1 - 0.18 * st, 1 - 0.14 * st);
      if (Math.abs(ux) > 0.4 && uy > -0.5 && uy < 0.0 && uz < -0.3) c.setRGB(1, 0.94, 0.92); // kinder
    }], [nose, 0xffffff], [tip, 0xfff4f0]];
    for (const s of [-1, 1]) {
      parts.push([xf(shape(ball(10, 8), (v) => v.set(v.x * 0.009, v.y * 0.028, v.z * 0.018)), s * 0.076, 0.088, 0.01, 0, s * 0.35, 0), 0xf6e4dc]);
    }
    return merge(parts);
  }
  function eyesGeo() { return merge([-1, 1].map((s) => [xf(new THREE.SphereGeometry(0.0125, 14, 10), s * EYE_X, EYE_Y, EYE_Z), 0xffffff])); }
  function irisGeo() {
    const parts = [];
    for (const s of [-1, 1]) {
      parts.push([xf(shape(ball(12, 8), (v) => v.set(v.x * 0.0062, v.y * 0.0062, v.z * 0.0022)), s * EYE_X, EYE_Y, EYE_Z - 0.0112), '#5a3b22']);
      parts.push([xf(shape(ball(10, 6), (v) => v.set(v.x * 0.0027, v.y * 0.0027, v.z * 0.0012)), s * EYE_X, EYE_Y, EYE_Z - 0.0127), '#0b0b0b']);
    }
    return merge(parts);
  }
  function lidsGeo() { // øvre øjenlåg (drejes ned ved blink) med mørk vippekant
    return merge([-1, 1].map((s) => [xf(new THREE.SphereGeometry(0.0136, 14, 6, 0, TAU, 0, Math.PI / 2), s * EYE_X, 0, 0),
      (v, c) => (v.y < 0.0025 ? c.setRGB(0.3, 0.22, 0.2) : c.setRGB(0.97, 0.95, 0.95))]));
  }
  function browsGeo() {
    return merge([-1, 1].map((s) => [xf(new THREE.BoxGeometry(0.032, 0.0065, 0.01), s * 0.033, 0.119, -0.0905, -0.25, -s * 0.25, -s * 0.1), '#2b1d14']));
  }
  function lipsGeo() {
    const up = xf(shape(ball(12, 6), (v) => v.set(v.x * 0.018, v.y * 0.0036, v.z * 0.0065)), 0, 0.036, -0.0872);
    const lo = xf(shape(ball(12, 6), (v) => v.set(v.x * 0.017, v.y * 0.0045, v.z * 0.007)), 0, 0.0285, -0.0862);
    return merge([[up, 0xffffff], [lo, 0xffffff]]);
  }
  function hairGeo() {
    const R = rng(7), parts = [];
    const th = (ux, uz) => 0.15 + smooth(-0.1, -0.6, uz) * (0.42 + 0.1 * Math.abs(ux)) - smooth(0.1, 0.6, uz) * 0.6;
    const cap = ball(28, 18).rotateY(Math.PI / 2);
    shape(cap, (v) => {
      const k = v.y < th(v.x, v.z) ? 0.95 : 1.07 + (R() - 0.5) * 0.025;
      v.multiplyScalar(k);
      headUnit(v, false);
    });
    parts.push([cap, (v, c) => c.set('#2b1d14')]);
    for (let n = 0; n < 46; n++) { // korte, lidt uregelmæssige totter
      const a = R() * TAU, y = 0.25 + R() * 0.75, r = Math.sqrt(1 - y * y);
      _s.set(Math.cos(a) * r, y, Math.sin(a) * r);
      if (_s.y < th(_s.x, _s.z) + 0.12) continue;
      _s.multiplyScalar(1.055); headUnit(_s, false);
      const sz = 0.8 + R() * 0.45, px = _s.x, py = _s.y, pz = _s.z;
      parts.push([xf(new THREE.IcosahedronGeometry(1, 1), px, py, pz, R() * 0.6, a, 0, 0.017 * sz, 0.0075 * sz, 0.021 * sz), R() > 0.5 ? '#2b1d14' : '#33241a']);
    }
    return merge(parts);
  }
  function bandGeo() {
    return merge([[xf(new THREE.CylinderGeometry(1, 1.03, 0.026, 32, 1, true), 0, 0.163, -0.003, -0.12, 0, 0, 0.08, 1, 0.096), C.accent]]);
  }
  function helmetGeo() {
    const g = shape(new THREE.SphereGeometry(1, 26, 12, 0, TAU, 0, Math.PI / 2).rotateY(Math.PI / 2), (v) => v.set(v.x * 0.099, v.y * 0.1, v.z * 0.12));
    xf(g, 0, 0.13, -0.006, -0.22, 0, 0);
    const rim = xf(new THREE.TorusGeometry(1, 0.06, 6, 30), 0, 0.13, -0.006, Math.PI / 2 - 0.22, 0, 0, 0.1, 0.122, 0.1);
    return merge([[g, (v, c) => c.set(Math.abs(v.x) < 0.012 ? C.accent : '#22252b')], [rim, '#15171b']]);
  }

  // --- Arme og hænder ---
  function upperArmGeo(s) {
    const g = xf(lathe([[0.043, -0.295], [0.047, -0.255], [0.051, -0.17], [0.054, -0.09], [0.054, -0.03], [0.046, 0.01], [0.02, 0.03]], 16), 0, 0, 0, 0, 0, 0, 1, 1, 0.94);
    const delt = shape(ball(16, 12), (v) => v.set(v.x * 0.05 + s * 0.004, v.y * 0.062 - 0.035, v.z * 0.052));
    return merge([[g, C.hood], [delt, C.hood]]);
  }
  function foreArmGeo() {
    const g = lathe([[0.034, -0.266], [0.036, -0.252], [0.037, -0.236], [0.041, -0.205], [0.047, -0.12], [0.049, -0.055], [0.046, -0.005], [0.03, 0.03]], 16);
    const elbow = xf(new THREE.SphereGeometry(0.046, 14, 10), 0, 0, 0.002);
    return merge([[g, (v, c) => c.set(v.y < -0.236 ? C.hoodDk : C.hood)], [elbow, C.hood]]);
  }
  function palmGeo(s) {
    const palm = shape(ball(14, 10), (v) => {
      const taper = v.y > 0.3 ? 1 - 0.3 * (v.y - 0.3) / 0.7 : 1;
      v.set(v.x * 0.0165 * (v.x * s > 0 ? 1.05 : 0.95), v.y * 0.05 - 0.052, v.z * 0.041 * taper);
    });
    const wrist = xf(new THREE.CylinderGeometry(0.023, 0.025, 0.035, 12), 0, -0.006, 0, 0, 0, 0, 0.78, 1, 1.18);
    return merge([[palm, 0xffffff], [wrist, 0xffffff]]);
  }
  // [z, y, proksimal, distal, radius, spredning]
  const FINGERS = [[-0.029, -0.094, 0.044, 0.042, 0.0088, 0.12], [-0.0095, -0.099, 0.049, 0.046, 0.009, 0.03],
    [0.0095, -0.097, 0.046, 0.043, 0.0086, -0.05], [0.027, -0.089, 0.036, 0.034, 0.0075, -0.14]];

  // --- Ben og sko ---
  const stripeK = (v, s) => (s * v.x) / Math.max(1e-4, Math.hypot(v.x, v.z)) > 0.94;
  function thighGeo(s) {
    const g = lathe([[0.057, -0.445], [0.061, -0.41], [0.069, -0.32], [0.079, -0.2], [0.087, -0.09], [0.089, -0.02], [0.082, 0.04], [0.05, 0.085]], 18);
    return merge([[g, (v, c) => c.set(stripeK(v, s) ? C.stripe : C.pants)]]);
  }
  function shinGeo(s) {
    const knee = xf(new THREE.SphereGeometry(0.058, 14, 10), 0, 0, -0.004);
    const g = lathe([[0.042, -0.42], [0.044, -0.405], [0.045, -0.385], [0.049, -0.36], [0.057, -0.25], [0.062, -0.14], [0.059, -0.05], [0.056, 0.02]], 18);
    shape(g, (v) => { if (v.z > 0) v.z *= 1 + 0.12 * Math.sin(clamp((v.y + 0.33) / 0.3, 0, 1) * Math.PI); }); // læg
    return merge([[g, (v, c) => c.set(v.y < -0.385 ? C.pantsDk : stripeK(v, s) ? C.stripe : C.pants)], [knee, C.pants]]);
  }
  function kneePadGeo() {
    const g = shape(new THREE.SphereGeometry(1, 14, 10, Math.PI, Math.PI), (v) => v.set(v.x * 0.074, v.y * 0.095 - 0.035, v.z * 0.075 - 0.004));
    return merge([[g, (v, c) => c.set(Math.abs(v.x) < 0.042 && v.y > -0.075 && v.y < 0.01 ? '#6b7280' : '#1e2126')]]);
  }
  function shoeGeo() { // bagdel af skoen (anklen er origo, sålen ved y = −0.085)
    const mid = shape(ball(18, 10), (v) => {
      const y = -0.07 + 0.0155 * clamp(v.y / 0.75, -1, 1);
      v.set(v.x * 0.047 * (v.z > 0.3 ? 1 - 0.25 * (v.z - 0.3) : 1), y, -0.035 + v.z * 0.1);
    });
    const up = shape(ball(20, 14), (v) => {
      let y = v.y;
      if (v.z < 0 && y > 0) y *= 1 + 0.5 * v.z; // lavere foran (vristen)
      v.set(v.x * 0.0445 * (v.z > 0.4 ? 1 - 0.2 * (v.z - 0.4) : 1), Math.max(-0.058, -0.028 + y * 0.052), Math.max(-0.135, -0.035 + v.z * 0.1));
    });
    return merge([[mid, (v, c) => c.set(v.y < -0.08 ? C.outsole : C.sole)], [up, (v, c) => {
      if (Math.abs(v.x) < 0.013 && v.y > -0.012 && v.z < -0.02 && v.z > -0.11) c.set(Math.floor(v.z / 0.013) % 2 ? '#a3a9b2' : C.shoe);
      else if (v.z > 0.05 && v.y > -0.012) c.set(C.accent);
      else if (Math.abs(v.x) > 0.034 && v.y < -0.002 && v.y > -0.05 && v.z < 0.03 && v.z > -0.12) c.set(C.grey);
      else c.set(C.shoe);
    }]]);
  }
  function toeGeo() { // forfod (tå-leddet sidder ved trædepuden)
    const mid = shape(ball(14, 8), (v) => v.set(v.x * 0.047, 0.015 + 0.0155 * clamp(v.y / 0.75, -1, 1), Math.min(0.012, -0.03 + v.z * 0.058)));
    const cap = shape(ball(14, 10), (v) => v.set(v.x * 0.0445, Math.max(0.027, 0.027 + v.y * 0.03), Math.min(0.008, -0.028 + v.z * 0.057)));
    return merge([[mid, (v, c) => c.set(v.y < 0.005 ? C.outsole : C.sole)], [cap, (v, c) => c.set(v.z < -0.072 ? '#e0e3e8' : C.shoe)]]);
  }

  // --- Udstyr ---
  function chalkBagGeo() {
    const bag = lathe([[0.002, -0.118], [0.04, -0.116], [0.051, -0.1], [0.054, -0.05], [0.051, -0.024], [0.055, -0.016], [0.055, -0.004], [0.048, 0.0]], 16);
    const chalk = xf(new THREE.CircleGeometry(0.047, 14), 0, -0.006, 0, -Math.PI / 2, 0, 0);
    const clip = xf(new THREE.BoxGeometry(0.03, 0.03, 0.012), 0, 0.006, -0.05);
    return merge([[bag, (v, c) => c.set(v.y > -0.025 ? '#f2f0ea' : v.y > -0.08 && v.y < -0.066 ? C.accent : '#2d2f36')], [chalk, '#ffffff'], [clip, '#2d2f36']]);
  }
  function ropeCoilGeo() {
    const parts = [];
    // oprullet reb på ryggen: tætte, lidt skæve løkker
    for (let k = 0; k < 9; k++) { // tyk bundt af løkker (to-farvet klatrereb)
      const g = new THREE.TorusGeometry(0.105 + (k % 3) * 0.011, 0.0095, 6, 36);
      xf(g, ((k * 7) % 5 - 2) * 0.004, 0.01 - (k % 4) * 0.006, 0.16 + ((k * 5) % 3) * 0.008, 0.06 + (k % 3) * 0.05, 0, 0.07 * (k - 4), 1, 1.25, 1);
      parts.push([g, k % 3 === 1 ? '#d9e3e8' : k % 2 ? '#1f7896' : '#2c8fb0']);
    }
    const tie = xf(new THREE.TorusGeometry(0.034, 0.013, 6, 14), 0, 0.135, 0.17, 0, Math.PI / 2, 0, 1, 1.5, 1);
    parts.push([tie, '#1f6f8c']);
    return merge(parts);
  }

  // --- Skateboard (langs lokal Z, næsen mod −Z) ---
  function deckGeo() {
    const L = 0.8, W = 0.205, T = 0.013, g = new THREE.BoxGeometry(W, T, L, 8, 1, 40);
    const p = g.attributes.position, n = g.attributes.normal, face = [];
    for (let i = 0; i < p.count; i++) {
      face.push(n.getY(i) > 0.5 ? 1 : n.getY(i) < -0.5 ? -1 : 0);
      let x = p.getX(i), y = p.getY(i);
      const z = p.getZ(i), az = Math.abs(z), end = L / 2 - W / 2;
      if (az > end) { const k = (az - end) / (W / 2); x *= Math.sqrt(Math.max(0.03, 1 - k * k)); }
      y += (az > 0.27 ? ((az - 0.27) / 0.13) ** 2 * 0.055 : 0) + 0.004 * (x / (W / 2)) ** 2; // kick + konkav
      p.setXYZ(i, x, y, z);
    }
    g.computeVertexNormals();
    xf(g, 0, 0.098 + T / 2, 0);
    return merge([[g, (v, c, i) => c.set(face[i] > 0 ? '#1b1b1d' : face[i] < 0 ? C.hood : '#d6b07a')]]);
  }
  function trucksGeo() {
    const parts = [];
    for (const z of [-0.215, 0.215]) {
      parts.push([xf(new THREE.BoxGeometry(0.06, 0.012, 0.075), 0, 0.092, z), '#b9bec6']);
      parts.push([xf(new THREE.CylinderGeometry(0.013, 0.013, 0.022, 10), 0, 0.075, z), C.accent]);
      parts.push([xf(new THREE.BoxGeometry(0.13, 0.024, 0.03), 0, 0.048, z), '#b9bec6']);
      parts.push([xf(new THREE.CylinderGeometry(0.005, 0.005, 0.19, 8), 0, 0.027, z, 0, 0, Math.PI / 2), '#8b9099']);
    }
    return merge(parts);
  }
  function wheelsGeo() {
    const parts = [];
    for (const z of [-0.215, 0.215]) for (const x of [-0.083, 0.083]) {
      const g = lathe([[0.0, -0.016], [0.021, -0.016], [0.027, -0.01], [0.0275, 0.0], [0.027, 0.01], [0.021, 0.016], [0.0, 0.016]], 16);
      parts.push([xf(g, x, 0.027, z, 0, 0, Math.PI / 2), (v, c) => c.set(Math.hypot(v.y - 0.027, v.z - z) < 0.012 ? '#8a8f96' : '#f1ead8')]);
    }
    return merge(parts);
  }

  // =====================================================================
  //   Opbygning af riggen
  // =====================================================================
  function build() {
    const mats = makeMaterials();
    const grp = (parent, x = 0, y = 0, z = 0) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; };
    const add = (parent, geo, mat, shadow = true) => { const m = new THREE.Mesh(geo, mat); m.castShadow = shadow; parent.add(m); return m; };

    const root = new THREE.Group();
    root.name = 'runner';
    const inner = grp(root);
    inner.rotation.order = 'YXZ';
    const tiltG = grp(inner, 0, -RADIUS, 0);            // hældning i sving (om fodlinjen)
    const pivot = grp(tiltG, 0, PIVOT_Y, 0);            // salto / rebhældning / skate-vending
    pivot.rotation.order = 'YXZ';
    const base = grp(pivot, 0, -PIVOT_Y, 0);            // fodlinjen = origo for alle stillinger

    const pelvis = grp(base, 0, HIP_Y, 0);
    add(pelvis, pelvisGeo(), mats.pants);
    const spine = grp(pelvis, 0, SPINE_Y, 0);
    add(spine, abdomenGeo(), mats.hoodie);
    const chest = grp(spine, 0, CHEST_Y, 0);
    const chestMesh = add(chest, chestGeo(), mats.hoodie);
    const hood = grp(chest, 0, 0.27, 0);
    add(hood, hoodGeo(), mats.hoodie);
    const strings = grp(chest, 0, 0.255, -0.112);
    add(strings, stringsGeo(), mats.cord, false);
    const coil = grp(chest, 0, 0, 0);
    add(coil, ropeCoilGeo(), mats.rope);

    const neck = grp(chest, 0, NECK_Y, 0.008);
    add(neck, plain(xf(new THREE.CylinderGeometry(0.05, 0.058, 0.15, 14), 0, 0.03, 0)), mats.skin);
    const head = grp(neck, 0, HEAD_Y, 0);
    add(head, headGeo(), mats.skin);
    add(head, hairGeo(), mats.hair);
    add(head, eyesGeo(), mats.eye, false);
    add(head, irisGeo(), mats.iris, false);
    const lids = grp(head, 0, EYE_Y, EYE_Z);
    add(lids, lidsGeo(), mats.skin, false);
    add(head, browsGeo(), mats.hair, false);
    add(head, lipsGeo(), mats.lips, false);
    const band = add(head, bandGeo(), mats.band);
    const helmet = add(head, helmetGeo(), mats.hard);

    const arms = [];
    for (const s of [-1, 1]) { // venstre (−X) først, så højre (+X)
      const clav = grp(chest, s * CLAV_X, CLAV_Y, 0);
      const up = grp(clav, s * SHO_X, SHO_Y, SHO_Z);
      add(up, upperArmGeo(s), mats.hoodie);
      const lo = grp(up, 0, -UPPER, 0);
      add(lo, foreArmGeo(), mats.hoodie);
      const hand = grp(lo, 0, -FORE, 0);
      const palm = add(hand, palmGeo(s), mats.hand);
      const anchor = grp(hand, -s * 0.012, -0.055, 0);
      const fingers = FINGERS.map(([z, y, l1, l2, r]) => {
        const p = grp(hand, 0, y, z);
        const pm = add(p, plain(capsule(r, l1)), mats.hand, false);
        const d = grp(p, 0, -l1, 0);
        add(d, plain(capsule(r * 0.92, l2)), mats.hand, false);
        return { p, d, pm };
      });
      const tp = grp(hand, -s * 0.007, -0.03, -0.03);
      const tpm = add(tp, plain(capsule(0.0105, 0.04)), mats.hand, false);
      const td = grp(tp, 0, -0.04, 0);
      add(td, plain(capsule(0.0095, 0.032)), mats.hand, false);
      arms.push({ s, clav, up, lo, hand, palm, anchor, fingers, thumb: { p: tp, d: td, pm: tpm } });
    }
    const legs = [];
    for (const s of [-1, 1]) {
      const up = grp(pelvis, s * HIP_X, 0, 0);
      add(up, thighGeo(s), mats.pants);
      const lo = grp(up, 0, -THIGH, 0);
      add(lo, shinGeo(s), mats.pants);
      const pad = add(lo, kneePadGeo(), mats.hard);
      const foot = grp(lo, 0, -SHIN, 0);
      add(foot, shoeGeo(), mats.shoe);
      const toe = grp(foot, 0, -ANKLE_H, -0.135);
      add(toe, toeGeo(), mats.shoe);
      legs.push({ s, up, lo, foot, toe, pad });
    }
    const bag = grp(pelvis, 0.105, 0.105, 0.17);
    add(bag, xf(chalkBagGeo(), 0, -0.02, 0), mats.gear);

    const board = grp(inner, 0, -RADIUS, 0);
    add(board, deckGeo(), mats.deck);
    add(board, trucksGeo(), mats.metal);
    add(board, wheelsGeo(), mats.wheel);
    board.visible = false;

    const rig = {
      root, inner, tiltG, pivot, base, pelvis, spine, chest, chestMesh, hood, strings, coil, neck, head, lids, band, helmet,
      arms, legs, bag, board, mats, hands: [arms[0].anchor, arms[1].anchor],
      setChalk(k) {
        k = clamp(k || 0, 0, 1);
        mats.hand.color.copy(SKIN).lerp(WHITE, k * 0.8);
        mats.glove.color.copy(GLOVE).lerp(CHALKG, k * 0.6);
      },
    };
    rig._st = {
      init: false, w: {}, list: [], pose: newPose(), tmp: newPose(),
      poses: { ground: newPose(), air: newPose(), hang: newPose(), climb: newPose(), rope: newPose(), skate: newPose(), flip: newPose() },
      prev: new V3(), vel: new V3(), velLocal: new V3(), airT: 0, accLean: 0, prevSpeed: 0, lastSpeed: 0, lastGrp: '',
      exert: 0, pushW: 0, swing: 0, swingV: 0, flipAng: 0, flipW: 0, blinkT: 2 + Math.random() * 3, blinkP: 0,
      hood: 0, hoodV: 0, dStr: { d: new V3(0, -1, 0), v: new V3() }, dBag: { d: new V3(0, -1, 0), v: new V3() },
      baseInv: new M4(), mC: new M4(), mI: new M4(), qI: new Q(), gear: '',
    };
    applyGear(rig, { gloves: false, chalk: false, rope: false, helmet: false });
    return rig;
  }

  function applyGear(rig, g) {
    const key = `${!!g.gloves}${!!g.chalk}${!!g.rope}${!!g.helmet}`;
    if (rig._st.gear === key) return;
    rig._st.gear = key;
    const m = rig.mats, hm = g.gloves ? m.glove : m.hand;
    for (const A of rig.arms) { // fingerløse handsker: håndflade og inderste fingerled
      A.palm.material = hm;
      A.thumb.pm.material = hm;
      for (const F of A.fingers) F.pm.material = hm;
    }
    rig.bag.visible = !!g.chalk;
    rig.coil.visible = !!g.rope;
    rig.helmet.visible = !!g.helmet;
    rig.band.visible = !g.helmet;
    for (const L of rig.legs) L.pad.visible = !!g.helmet;
  }

  // =====================================================================
  //   Stillinger: et fast tal-layout, der kan blandes lineært
  // =====================================================================
  const I_YAW = 0, I_TX = 1, I_TZ = 2, I_BANK = 3, I_PEL = 4, I_PROT = 7, I_SPN = 10, I_CHS = 13, I_NCK = 16, I_HED = 19, I_LOOK = 22, I_BREATH = 23;
  // arm: 0-2 mål (håndled), 3-5 albue-retning, 6 rum, 7-10 hånd-kvaternion (inner-rum), 11 vægt,
  //      12-14 håndled (relativt), 15 krumning, 16 tommel, 17 spredning, 18 skulderløft, 19-26 andet mål (+rum, vægt)
  // ben: 0-2 ankel, 3-5 knæ-retning, 6 rum, 7 pitch, 8 yaw, 9 roll, 10 tå
  // rum: 0 = base (fodlinjen), 1 = brystet, 2 = inner (motorens ramme)
  const A0 = 24, AS = 27, L0 = A0 + 2 * AS, LS = 11, NP = L0 + 2 * LS;
  function newPose() { return new Float64Array(NP); }
  const ao = (i) => A0 + i * AS, lo = (i) => L0 + i * LS;
  function setArm(P, i, x, y, z, px, py, pz, space) {
    const o = ao(i);
    P[o] = x; P[o + 1] = y; P[o + 2] = z; P[o + 3] = px; P[o + 4] = py; P[o + 5] = pz; P[o + 6] = space;
  }
  function setArm2(P, i, x, y, z, px, py, pz, space, w) {
    const o = ao(i) + 19;
    P[o] = x; P[o + 1] = y; P[o + 2] = z; P[o + 3] = px; P[o + 4] = py; P[o + 5] = pz; P[o + 6] = space; P[o + 7] = w;
  }
  function setHand(P, i, curl, thumb, spread, shrug = 0, wx = 0, wy = 0, wz = 0) {
    const o = ao(i);
    P[o + 12] = wx; P[o + 13] = wy; P[o + 14] = wz; P[o + 15] = curl; P[o + 16] = thumb; P[o + 17] = spread; P[o + 18] = shrug;
  }
  function setHandAbs(P, i, q, w) { const o = ao(i); P[o + 7] = q.x; P[o + 8] = q.y; P[o + 9] = q.z; P[o + 10] = q.w; P[o + 11] = w; }
  function setLeg(P, i, x, y, z, px, py, pz, space, pitch = 0, yaw = 0, roll = 0, toe = 0) {
    const o = lo(i);
    P[o] = x; P[o + 1] = y; P[o + 2] = z; P[o + 3] = px; P[o + 4] = py; P[o + 5] = pz; P[o + 6] = space;
    P[o + 7] = pitch; P[o + 8] = yaw; P[o + 9] = roll; P[o + 10] = toe;
  }
  function mixPose(P, B, k) { for (let j = 0; j < NP; j++) P[j] += (B[j] - P[j]) * k; }

  // Arm som led-vinkler (bryst-rum): løft frem, ud til siden og albuebøjning
  const SHOULDER = [new V3(-(CLAV_X + SHO_X), CLAV_Y + SHO_Y, SHO_Z), new V3(CLAV_X + SHO_X, CLAV_Y + SHO_Y, SHO_Z)];
  function armFK(P, i, flex, abd, bend, inward = 0) {
    const s = i ? 1 : -1, S = SHOULDER[i], ca = Math.cos(abd), sa = Math.sin(abd);
    const ex = S.x + s * sa * UPPER, ey = S.y - ca * Math.cos(flex) * UPPER, ez = S.z - ca * Math.sin(flex) * UPPER;
    const f2 = flex + bend;
    let fx = s * sa * 0.6 - s * inward, fy = -ca * Math.cos(f2), fz = -ca * Math.sin(f2);
    const fl = Math.hypot(fx, fy, fz) || 1;
    fx /= fl; fy /= fl; fz /= fl;
    const hx = ex + fx * FORE, hy = ey + fy * FORE, hz = ez + fz * FORE;
    let px = ex - (S.x + hx) / 2, py = ey - (S.y + hy) / 2, pz = ez - (S.z + hz) / 2;
    if (px * px + py * py + pz * pz < 1e-5) { px = s * 0.3; py = -0.2; pz = 1; }
    setArm(P, i, hx, hy, hz, px, py, pz, 1);
  }

  // Håndens orientering ud fra fingerretning f og håndfladens normal n (inner-rum)
  const _hx = new V3(), _hy = new V3(), _hz = new V3(), _mb = new M4();
  function handQuat(q, f, n, s) {
    _hy.copy(f).negate().normalize();
    _hx.copy(n).multiplyScalar(-s);
    _hx.addScaledVector(_hy, -_hx.dot(_hy)).normalize();
    _hz.crossVectors(_hx, _hy);
    return q.setFromRotationMatrix(_mb.makeBasis(_hx, _hy, _hz));
  }
  // Fra håndfladens punkt til håndleddet (IK-målet)
  const _anc = new V3();
  function palmToWrist(p, q, s) { _anc.set(-s * 0.012, -0.055, 0).applyQuaternion(q); return p.sub(_anc); }

  // --- Stå og løbe ---
  function idlePose(st, s, P) {
    const t = s.time || 0, ex = st.exert;
    const ws = Math.sin(t * 0.55) * 0.8 + Math.sin(t * 0.23 + 1) * 0.2;     // vægtskift
    const br = Math.sin(t * (1.7 + ex * 1.6)) * (1 + ex * 1.5);              // vejrtrækning
    P[I_PEL] = 0.026 * ws; P[I_PEL + 1] = 0.935 - 0.006 * Math.abs(ws); P[I_PEL + 2] = 0;
    P[I_PROT] = -0.03; P[I_PROT + 1] = 0.05 * ws; P[I_PROT + 2] = 0.045 * ws;
    P[I_SPN] = 0.02 - 0.04 * ex; P[I_SPN + 2] = -0.03 * ws;
    P[I_CHS] = 0.03 + 0.012 * br; P[I_CHS + 2] = -0.02 * ws;
    P[I_NCK] = 0.02; P[I_HED] = -0.03 + 0.01 * br;
    P[I_HED + 1] = 0.22 * Math.sin(t * 0.31) * Math.sin(t * 0.17 + 1);      // kigger rundt
    P[I_LOOK] = 1; P[I_BREATH] = br;
    armFK(P, 0, 0.06 + 0.01 * br, 0.1, 0.28);
    armFK(P, 1, 0.04, 0.1, 0.32);
    setHand(P, 0, 0.45, 0.3, 0.05, 0.03 * br * (1 + 2 * ex));
    setHand(P, 1, 0.5, 0.3, 0.05, 0.03 * br * (1 + 2 * ex));
    setLeg(P, 0, -0.118, ANKLE_H, -0.035, -0.15, 0, -1, 0, 0, 0.13, 0, 0);
    setLeg(P, 1, 0.118, ANKLE_H, 0.045, 0.15, 0, -1, 0, 0, -0.16, 0, 0);
  }

  const _fc = { y: 0, z: 0, pitch: 0, toe: 0 };
  function footCycle(u, D, Ls, zLand, sb, o) {
    const aE = -(0.55 + 0.45 * sb);                         // hælløft ved afsæt
    if (u < D) { // standfase: forfoden står stille på jorden, kroppen glider frem over den
      const q = u / D, a = aE * smooth(0.4, 1, q);
      const bz = zLand - 0.135 + q * Ls;
      o.y = 0.085 * Math.cos(a) - 0.135 * Math.sin(a);
      o.z = bz + 0.085 * Math.sin(a) + 0.135 * Math.cos(a);
      o.pitch = a; o.toe = -a * 0.9;
      return;
    }
    const w = (u - D) / (1 - D);                            // svingfase
    const z0 = zLand - 0.135 + Ls + 0.085 * Math.sin(aE) + 0.135 * Math.cos(aE), y0 = 0.085 * Math.cos(aE) - 0.135 * Math.sin(aE);
    o.z = spline([z0, 0.3 + 0.12 * sb, -0.08 - 0.12 * sb, zLand - 0.05 - 0.07 * sb, zLand], w);
    o.y = spline([y0, 0.24 + 0.3 * sb, 0.34 + 0.14 * sb, 0.15 + 0.05 * sb, ANKLE_H], w);
    o.pitch = spline([aE, -1.15, -0.45, 0.12, 0], w);
    o.toe = -aE * 0.9 * (1 - smooth(0, 0.3, w));
  }
  function runPose(st, s, P) {
    const v = Math.max(0.6, s.speed || 0), sb = smooth(3, RUN_SPEED - 0.5, v);
    const T = TAU / (3 + 1.3 * v);                          // samme takt som spillets runPhase
    const Ls = Math.min(0.85, 0.42 + 0.05 * v);             // forfodens vej under kontakten
    const D = clamp(Ls / (v * T), 0.22, 0.6);               // kontakttid → ingen glidning
    const zLand = -0.36 * Ls, p = frac((s.runPhase || 0) / TAU), c = Math.cos(TAU * p), g = 0.4 + 0.6 * sb;
    for (let i = 0; i < 2; i++) {
      const sgn = i ? 1 : -1;
      footCycle(frac(p + i * 0.5), D, Ls, zLand, sb, _fc);
      setLeg(P, i, sgn * (0.085 - 0.02 * sb), _fc.y, _fc.z, sgn * 0.12, -0.25, -1, 0, _fc.pitch, -sgn * 0.04, 0, _fc.toe);
    }
    const bob = -(0.018 + 0.017 * sb) * Math.cos(TAU * 2 * (p - D / 2)); // lavest midt i standfasen
    P[I_PEL] = 0; P[I_PEL + 1] = 0.925 - 0.035 * sb + bob; P[I_PEL + 2] = -0.02 * sb;
    P[I_PROT] = -(0.05 + 0.1 * sb) - st.accLean; P[I_PROT + 1] = -0.16 * g * c; P[I_PROT + 2] = 0.035 * Math.sin(TAU * p) * g;
    P[I_SPN] = -0.04 - 0.04 * sb; P[I_SPN + 1] = 0.12 * g * c;
    P[I_CHS] = -0.02; P[I_CHS + 1] = 0.14 * g * c;
    P[I_NCK] = 0.05 + 0.08 * sb; P[I_NCK + 1] = -0.08 * g * c; P[I_HED] = 0.04 + 0.08 * sb;
    P[I_LOOK] = 0.6; P[I_BREATH] = 0.5 * Math.sin((s.time || 0) * 5);
    const amp = 0.35 + 0.5 * sb;
    for (let i = 0; i < 2; i++) { // armene svinger modsat benene, albuer ca. 90°
      const a = (i ? 1 : -1) * c;
      armFK(P, i, 0.12 + amp * a, 0.13, 1.45 + 0.35 * a * sb + (1 - sb) * 0.1, 0.12 * Math.max(0, a));
      setHand(P, i, 0.95, 0.55, 0, 0.05 * sb);
    }
  }
  function poseGround(st, s, P) {
    const v = s.speed || 0, t = s.time || 0;
    idlePose(st, s, P);
    const rb = s.mode === 'run' ? smooth(0.3, 2.2, v) : 0;
    if (rb > 0) { st.tmp.fill(0); runPose(st, s, st.tmp); mixPose(P, st.tmp, rb); }
    P[I_BANK] = clamp((s.turnRate || 0) * v * 0.03, -0.35, 0.35) * rb;      // hæld ind i svinget
    const sq = clamp(s.squash || 0, 0, 1);
    if (sq > 0) { // landing: knæene bøjes, overkroppen og armene frem
      P[I_PEL + 1] -= 0.45 * sq; P[I_PEL + 2] += 0.07 * sq;
      P[I_PROT] -= 0.45 * sq; P[I_SPN] -= 0.15 * sq; P[I_CHS] -= 0.1 * sq; P[I_NCK] += 0.25 * sq;
      for (let i = 0; i < 2; i++) { const o = ao(i); P[o + 2] -= 0.22 * sq; P[o + 1] += 0.06 * sq; P[o] *= 1 + 0.4 * sq; }
    }
    if (s.surface === 'ice') { // glat: armene ud, let usikker
      const w1 = Math.sin(t * 7.3), w2 = Math.sin(t * 5.1 + 1);
      for (let i = 0; i < 2; i++) { const o = ao(i); P[o] += (i ? 1 : -1) * (0.2 + 0.05 * w1); P[o + 1] += 0.22 + 0.08 * (i ? w1 : w2); }
      P[I_PEL] += 0.025 * w2; P[I_PROT + 2] += 0.05 * w1;
    } else if (s.surface === 'conveyor') {
      P[I_PEL] += 0.02 * Math.sin(t * 6); P[I_PROT + 2] += 0.04 * Math.sin(t * 6 + 0.5);
    }
  }

  // --- Luft og salto ---
  function poseAir(st, s, P) {
    const vy = s.vy || 0, wU = smooth(1.5, 7, vy), wD = smooth(1.5, 8, -vy), wA = Math.max(0, 1 - wU - wD);
    const m = (u, a, d) => u * wU + a * wA + d * wD;        // afsæt / toppunkt / fald
    P[I_PEL + 1] = m(0.93, 0.88, 0.92); P[I_PEL + 2] = m(0.02, 0.02, 0);
    P[I_PROT] = m(0.02, -0.2, -0.04); P[I_SPN] = m(0.06, -0.12, 0.02); P[I_CHS] = m(0.06, -0.06, 0.06);
    P[I_NCK] = m(-0.05, 0.05, 0.02); P[I_HED] = m(0, 0.1, -0.12);
    P[I_LOOK] = 0.4;
    armFK(P, 0, m(2.2, 0.75, 0.55), m(0.25, 0.45, 0.95), m(0.4, 1.05, 0.95));
    armFK(P, 1, m(1.9, 0.6, 0.35), m(0.3, 0.4, 0.85), m(0.5, 1.15, 1.05));
    for (let i = 0; i < 2; i++) setHand(P, i, m(0.55, 0.7, 0.2), 0.4, m(0.1, 0.1, 0.8), m(0.2, 0, 0.15));
    setLeg(P, 0, -0.1, m(0.2, 0.42, 0.14), m(0.3, 0.06, -0.12), -0.15, m(-0.4, 0.3, -0.2), -1, 0, m(-1.0, -0.55, 0.15));
    setLeg(P, 1, 0.1, m(0.47, 0.45, 0.3), m(-0.08, 0.0, 0.14), 0.15, m(0.2, 0.3, -0.2), -1, 0, m(-0.35, -0.5, -0.35));
  }
  function poseFlip(st, s, P) { // samlet salto: knæ til brystet, hænder om skinnebenene
    P[I_PEL + 1] = 0.86; P[I_PEL + 2] = 0.04;
    P[I_PROT] = -0.35; P[I_SPN] = -0.4; P[I_CHS] = -0.3; P[I_NCK] = -0.25; P[I_HED] = -0.15;
    for (let i = 0; i < 2; i++) {
      const sgn = i ? 1 : -1;
      setLeg(P, i, sgn * 0.1, 0.6, 0.12, sgn * 0.3, 0.6, -1, 0, -0.7, 0, 0, 0);
      setArm(P, i, sgn * 0.16, 0.8, -0.2, sgn, -0.3, 0.3, 0);
      setHand(P, i, 1.2, 0.8, 0, 0.1);
    }
  }

  // --- Hænge i kant / stang / svævebane ---
  const _G = new V3(), _Tn = new V3(), _W = new V3(), _f = new V3(), _n = new V3(), _a = new V3(), _qh = new Q();
  function poseHang(st, s, P) {
    const kind = s.hangKind || 'ledge', bar = kind !== 'ledge', g = s.gripLocal, tg = s.gripTangent;
    _G.set(g ? g.x : 0, g ? g.y : HANG_DROP, g ? g.z : bar ? 0 : -WALL_GAP);
    _Tn.set(tg ? tg.x : 1, tg ? tg.y : 0, tg ? tg.z : 0);
    if (_Tn.x < 0 || (Math.abs(_Tn.x) < 1e-3 && _Tn.z > 0)) _Tn.negate();
    _Tn.normalize();
    _W.set(_Tn.z, 0, -_Tn.x);                               // vandret ind mod kanten
    if (_W.lengthSq() < 1e-6) _W.set(0, 0, -1);
    _W.normalize();
    const grip = clamp(s.grip == null ? 1 : s.grip, 0, 1), trem = clamp((0.3 - grip) / 0.3, 0, 1);
    const tt = s.time || 0, sh = clamp(s.shimmy || 0, -1, 1), ash = Math.abs(sh);
    const jit = trem * Math.sin(tt * 37) * Math.sin(tt * 23 + 1);
    P[I_YAW] = bar ? clamp(Math.atan2(-_Tn.z, _Tn.x), -0.75, 0.75) : 0;   // skuldrene langs stangen
    const gx = _G.x, gy = _G.y + RADIUS, gz = _G.z, sway = -0.05 * sh;
    const half = kind === 'zip' ? 0.09 : 0.2;
    for (let i = 0; i < 2; i++) { // hånd over hånd ved sidelæns bevægelse
      const sgn = i ? 1 : -1, u = frac(tt * 0.8 + (i ? 0.5 : 0));
      let off = sgn * half, lift = 0;
      if (ash > 0.05) { // hånden flyttes hurtigt frem, og glider så tilbage, mens kroppen følger efter
        const mv = u < 0.3, o = mv ? lerp(-1, 1, smooth(0, 0.3, u)) : lerp(1, -1, (u - 0.3) / 0.7);
        off += Math.sign(sh) * 0.07 * o * ash;
        lift = mv ? 0.045 * Math.sin((Math.PI * u) / 0.3) * ash : 0;
      }
      if (bar) { // overhåndsgreb: håndfladen bag stangen, fingrene over den
        _f.copy(UPV).addScaledVector(_W, 0.15);
        _n.copy(_W).addScaledVector(UPV, 0.25);
        _a.copy(_G).addScaledVector(_Tn, off).addScaledVector(_W, -0.05).addScaledVector(UPV, -0.012 + lift);
      } else { // kantgreb: håndfladen ned på kanten, fingrene ind over den
        _f.copy(_W).addScaledVector(UPV, 0.25);
        _n.set(0, -1, 0).addScaledVector(_W, 0.1);
        _a.copy(_G).addScaledVector(_Tn, off).addScaledVector(_W, 0.035).addScaledVector(UPV, 0.008 + lift);
      }
      handQuat(_qh, _f.normalize(), _n.normalize(), sgn);
      palmToWrist(_a, _qh, sgn);
      setArm(P, i, _a.x, _a.y, _a.z, sgn + jit * 0.5, bar ? -0.1 : -0.35, bar ? 0.5 : 0.35, 2);
      setHandAbs(P, i, _qh, 1);
      setHand(P, i, (bar ? 1.35 : 0.4) - 0.35 * trem, bar ? 1.0 : 0.35, 0.05, bar ? 0.75 : 0.5);
    }
    P[I_BREATH] = 0.6 * Math.sin(tt * 2.6);
    P[I_LOOK] = 0.3;
    if (!bar) { // spændt hæng: fødderne mod muren, knæene bøjet
      P[I_PEL] = gx * 0.6 + sway + 0.01 * jit; P[I_PEL + 1] = gy - 0.94 + 0.008 * jit; P[I_PEL + 2] = gz + 0.5;
      P[I_PROT] = -0.26; P[I_SPN] = -0.12; P[I_CHS] = -0.1; P[I_NCK] = 0.25; P[I_HED] = 0.22;
      for (let i = 0; i < 2; i++) {
        const sgn = i ? 1 : -1;
        setLeg(P, i, sgn * 0.16 + sway * 0.5, gy - 1.66 + (i ? 0.06 : 0), gz + 0.17, sgn * 0.5, -0.4, -1, 0, 0.85, -sgn * 0.15, 0, 0.2);
      }
    } else if (kind === 'bar') { // frit hæng: benene dingler
      P[I_PEL] = gx * 0.5 + sway; P[I_PEL + 1] = gy - 1.1; P[I_PEL + 2] = 0.02;
      P[I_PROT] = 0.03; P[I_SPN] = 0.02; P[I_CHS] = 0.08; P[I_NCK] = 0.12; P[I_HED] = 0.1;
      setLeg(P, 0, -0.075 + sway, gy - 1.95, -0.05, -0.1, 0, -1, 0, -0.6, 0.1, 0, 0);
      setLeg(P, 1, 0.075 + sway, gy - 1.98, -0.01, 0.1, 0, -1, 0, -0.65, -0.1, 0, 0);
    } else { // svævebane: to hænder over hovedet, benene trukket op
      P[I_PEL] = gx * 0.5; P[I_PEL + 1] = gy - 1.08; P[I_PEL + 2] = 0.02;
      P[I_PROT] = -0.25; P[I_SPN] = -0.15; P[I_CHS] = 0.02; P[I_NCK] = 0.1;
      for (let i = 0; i < 2; i++) setLeg(P, i, (i ? 1 : -1) * 0.09, gy - 1.55, -0.14, (i ? 1 : -1) * 0.2, 0.4, -1, 0, -0.5, 0, 0, 0);
    }
  }

  // --- Klatre op over kanten (mantle) ---
  const CLK = { // nøgler ved climbT 0, .2, .4, .6, .8, 1 – relativt til kantens hjørne
    py: [-1.06, -0.8, -0.4, 0.33, 0.62, 1.0], pz: [0.45, 0.36, 0.2, 0.05, -0.22, -0.6],
    pel: [-0.22, -0.32, -0.55, -0.6, -0.38, -0.04], spn: [-0.12, -0.2, -0.35, -0.32, -0.15, 0], nck: [0.25, 0.15, -0.05, -0.15, 0.0, 0.0],
    ry: [-1.6, -1.3, -0.78, 0.1, 0.085, 0.145], rz: [0.17, 0.15, 0.12, 0.15, -0.3, -0.62], rp: [0.85, 0.8, 0.3, -1.3, 0, 0],
    ly: [-1.6, -1.42, -1.02, -0.62, 0.24, 0.145], lz: [0.17, 0.17, 0.18, 0.22, -0.02, -0.56], lp: [0.85, 0.85, 0.6, 0.2, -0.5, 0],
  };
  function poseClimb(st, s, P) {
    const t = clamp(s.climbT || 0, 0, 1), k = (K) => spline(K, t);
    // kantens forventede sted (samme kurve som spillets placeClimb)
    const up = smooth(0, 0.6, t), inn = smooth(0.6, 1, t);
    const ey = HANG_DROP - (HANG_DROP + RADIUS + 0.06) * up, ez = -(WALL_GAP * (1 - inn) - 0.6 * inn);
    const hw = 1 - smooth(0.42, 0.62, t);                   // hænderne slipper kanten
    const g = s.gripLocal, gx = g ? g.x : 0, gy = g ? g.y : HANG_DROP, gz = g ? g.z : -WALL_GAP;
    const Lx = gx * hw, Ly = ey + (gy - ey) * hw + RADIUS, Lz = ez + (gz - ez) * hw;
    P[I_PEL] = Lx * 0.5; P[I_PEL + 1] = Ly + k(CLK.py); P[I_PEL + 2] = Lz + k(CLK.pz);
    P[I_PROT] = k(CLK.pel); P[I_SPN] = k(CLK.spn); P[I_CHS] = k(CLK.spn) * 0.6; P[I_NCK] = k(CLK.nck); P[I_HED] = k(CLK.nck) * 0.5;
    P[I_LOOK] = 0.3; P[I_BREATH] = 0.8 * Math.sin((s.time || 0) * 3);
    setLeg(P, 1, 0.11, Ly + k(CLK.ry), Lz + k(CLK.rz), 0.2, -0.3, -1, 0, k(CLK.rp), 0, 0, 0);
    setLeg(P, 0, -0.12, Ly + k(CLK.ly), Lz + k(CLK.lz), -0.3, -0.2, -1, 0, k(CLK.lp), 0, 0, 0);
    for (let i = 0; i < 2; i++) {
      const sgn = i ? 1 : -1;
      armFK(P, i, 0.35, 0.25, 0.5);                         // frie arme (efter slip)
      _f.set(0, 0.25, -1); _n.set(0, -1, -0.1);
      handQuat(_qh, _f.normalize(), _n.normalize(), sgn);
      _a.set(Lx + sgn * 0.2, Ly - RADIUS + 0.008, Lz - 0.035);
      palmToWrist(_a, _qh, sgn);
      const e1 = smooth(0.1, 0.4, t);                       // albuerne op og bagud
      setArm2(P, i, _a.x, _a.y, _a.z, sgn * lerp(1, 0.45, e1), lerp(-0.3, 0.7, e1), lerp(0.35, 1, e1), 2, hw);
      setHandAbs(P, i, _qh, hw);
      setHand(P, i, lerp(0.5, 0.4, hw), 0.4, 0.1, 0.4 * hw);
    }
  }

  // --- Reb: én hånd over den anden langs rebet ---
  function poseRope(st, s, P) {
    const d = s.ropeDir;
    _a.set(d ? d.x : 0, d ? d.y : 0.94, d ? d.z : -0.34).normalize();
    P[I_TX] = clamp(Math.atan2(_a.z, _a.y), -1.1, 1.1) * 0.8;
    P[I_TZ] = clamp(-Math.atan2(_a.x, _a.y), -0.9, 0.9) * 0.8;
    const lv = st.velLocal, trail = clamp(-lv.z * 0.025, -0.25, 0.25), side = clamp(-lv.x * 0.02, -0.15, 0.15);
    P[I_PEL] = side * 0.3; P[I_PEL + 1] = 1.0; P[I_PEL + 2] = 0.04;
    P[I_PROT] = 0.05; P[I_SPN] = 0.05; P[I_CHS] = 0.08; P[I_NCK] = 0.15; P[I_HED] = 0.12;
    P[I_LOOK] = 0.3;
    for (let i = 0; i < 2; i++) { // højre hånd nederst (rebet udgår fra den), venstre over
      const sgn = i ? 1 : -1;
      _f.set(0, 0, -1).addScaledVector(_a, _a.z).normalize(); // fingrene vandret frem, om rebet
      _hy.copy(_f).negate(); _hz.copy(_a).negate();
      _n.crossVectors(_hy, _hz).multiplyScalar(-sgn);
      handQuat(_qh, _f, _n, sgn);
      _G.set(0, 0.8, 0).addScaledVector(_a, i ? 0.6 : 0.84).addScaledVector(_n, -0.016);
      palmToWrist(_G, _qh, sgn);
      setArm(P, i, _G.x, _G.y, _G.z, sgn * 0.8, -0.4, 0.5, 2);
      setHandAbs(P, i, _qh, 1);
      setHand(P, i, 1.5, 1.1, 0, 0.5);
      setLeg(P, i, sgn * 0.055 + side, 0.12, 0.1 + trail, sgn * 0.05, 0, -1, 0, -0.55, 0, 0, 0);
    }
  }

  // --- Skateboard: sidelæns stand (venstre fod forrest), hoved drejet frem ---
  function poseSkate(st, s, P) {
    const grind = s.mode === 'grind', air = s.grounded === false;
    const cr = clamp(s.crouch || 0, 0, 1), lean = clamp(s.lean || 0, -1, 1), pk = st.pushW, tt = s.time || 0;
    const yaw = -Math.PI / 2 + 0.8 * pk;                    // kroppen drejer frem, når der skubbes
    P[I_YAW] = yaw; P[I_BANK] = -lean * 0.2;
    const grab = air ? smooth(0.25, 0.42, st.airT) : 0;     // indy grab på store hop
    const low = 0.2 * cr + (grind ? 0.14 : 0) + (air ? 0.12 : 0) + 0.18 * grab + 0.04 * pk;
    const cz = -0.1 * pk, cy = Math.cos(yaw), sy = Math.sin(yaw);
    P[I_PEL] = -cz * sy; P[I_PEL + 1] = DECK + 0.76 - low; P[I_PEL + 2] = cz * cy;   // over brættets midte
    P[I_PROT] = -0.16 - 0.25 * cr - (grind ? 0.15 : 0) - 0.25 * grab - 0.1 * pk;
    P[I_SPN] = -0.06 - 0.12 * cr - 0.2 * grab; P[I_SPN + 1] = 0.12 * (1 - pk);
    P[I_CHS] = -0.03; P[I_CHS + 1] = 0.15 * (1 - pk);
    P[I_NCK] = 0.08 + 0.15 * cr + 0.15 * grab; P[I_HED] = 0.05;
    P[I_LOOK] = 0.95; P[I_BREATH] = 0.4 * Math.sin(tt * 2);
    const dy = -RADIUS + DECK + ANKLE_H;                    // anklens højde på dækket (inner)
    setLeg(P, 0, -0.05 * (1 - pk), dy, -0.2, 1, 0, -0.3, 2, 0, -Math.PI / 2 + 0.3 + 1.15 * pk, 0, 0);
    // bagerste fod: på halen, eller skubber langs jorden ved siden af brættet
    const ph = frac(tt * 1.6);
    let px = 0.17, py = -RADIUS + ANKLE_H, pz;
    if (ph < 0.55) pz = lerp(-0.1, 0.42, ph / 0.55);
    else { const w = (ph - 0.55) / 0.45; pz = lerp(0.42, -0.1, smooth(0, 1, w)); py += 0.1 * Math.sin(Math.PI * w); }
    px = lerp(-0.05, px, pk); py = lerp(dy, py, pk); pz = lerp(0.23, pz, pk);
    setLeg(P, 1, px, py, pz, 1, 0, 0.3, 2, 0, lerp(-Math.PI / 2 - 0.12, 0.05, pk), 0, 0);
    const wide = grind ? 0.35 : 0;
    armFK(P, 0, 0.35 + 0.4 * cr, 0.95 - 0.45 * cr + wide, 0.35);
    armFK(P, 1, -0.1 + 0.3 * cr, 0.9 - 0.4 * cr + wide, 0.4);
    for (let i = 0; i < 2; i++) setHand(P, i, 0.5, 0.3, 0.3, 0.05);
    if (grab > 0) { // bagerste hånd griber tå-kanten mellem fødderne
      _f.set(0, -1, 0); _n.set(-1, 0, 0);
      handQuat(_qh, _f, _n, 1);
      _a.set(0.1, -RADIUS + DECK - 0.012, 0.03);
      palmToWrist(_a, _qh, 1);
      setArm2(P, 1, _a.x, _a.y, _a.z, 1, 0.3, 0.6, 2, grab);
      setHandAbs(P, 1, _qh, grab);
      P[ao(1) + 15] = lerp(0.5, 1.3, grab);
    }
  }

  // =====================================================================
  //   IK og blanding
  // =====================================================================
  const _P = new V3(), _T = new V3(), _K = new V3(), _d = new V3(), _pp = new V3(), _h = new V3(), _by = new V3(), _bz = new V3();
  const _mA = new M4(), _mB = new M4(), _qa = new Q(), _qb = new Q(), _qc = new Q(), _qLo = new Q(), _qw = new Q(), _qd = new Q(), _qAcc = new Q();
  const _t1 = new V3(), _t2 = new V3(), _p1 = new V3(), _p2 = new V3(), _pl = new V3();
  const _eF = new THREE.Euler(0, 0, 0, 'YXZ');

  // To-leds IK i forælderens rum: øverste led peger mod knæ/albue, nederste mod målet
  function ik(st, up, low, a, b, T, pole, sign, qLowBase) {
    _mA.multiplyMatrices(st.baseInv, up.parent.matrixWorld);
    _qc.setFromRotationMatrix(_mA);
    _mB.copy(_mA).invert();
    _P.copy(up.position);
    _T.copy(T).applyMatrix4(_mB);
    _pp.copy(pole).transformDirection(_mB);
    _d.subVectors(_T, _P);
    let dist = _d.length();
    if (dist < 1e-5) _d.set(0, -1, 0); else _d.divideScalar(dist);
    dist = clamp(dist, Math.abs(a - b) + 1e-3, a + b - 1e-4);
    _pp.addScaledVector(_d, -_pp.dot(_d));
    if (_pp.lengthSq() < 1e-8) _pp.set(0, 0, -1).addScaledVector(_d, _d.z);
    _pp.normalize();
    const ca = clamp((a * a + dist * dist - b * b) / (2 * a * dist), -1, 1), sa = Math.sqrt(1 - ca * ca);
    _K.copy(_P).addScaledVector(_d, a * ca).addScaledVector(_pp, a * sa);
    _T.copy(_P).addScaledVector(_d, dist);
    _h.crossVectors(_d, _pp).multiplyScalar(sign).normalize();   // hængselsaksen = lokal X
    _by.subVectors(_P, _K).normalize(); _bz.crossVectors(_h, _by);
    _qa.setFromRotationMatrix(_mA.makeBasis(_h, _by, _bz));
    _by.subVectors(_K, _T).normalize(); _bz.crossVectors(_h, _by);
    _qb.setFromRotationMatrix(_mA.makeBasis(_h, _by, _bz));
    up.quaternion.copy(_qa);
    low.quaternion.copy(_qa).invert().multiply(_qb);
    qLowBase.copy(_qc).multiply(_qb);
  }
  function convPoint(st, Pm, o, space, out) {
    out.set(Pm[o], Pm[o + 1], Pm[o + 2]);
    if (space === 1) out.applyMatrix4(st.mC); else if (space === 2) out.applyMatrix4(st.mI);
    return out;
  }
  function convDir(st, Pm, o, space, out) {
    out.set(Pm[o], Pm[o + 1], Pm[o + 2]);
    if (space === 1) out.transformDirection(st.mC); else if (space === 2) out.transformDirection(st.mI); else out.normalize();
    return out;
  }
  function addQuat(q, w) { // vægtet kvaternion-sum (samme halvkugle)
    if (_qAcc.x * q.x + _qAcc.y * q.y + _qAcc.z * q.z + _qAcc.w * q.w < 0) w = -w;
    _qAcc.x += q.x * w; _qAcc.y += q.y * w; _qAcc.z += q.z * w; _qAcc.w += q.w * w;
  }
  function solveArm(rig, st, L, i) {
    const A = rig.arms[i], o = ao(i);
    _T.set(0, 0, 0); _pl.set(0, 0, 0); _qAcc.set(0, 0, 0, 0);
    let aw = 0, curl = 0, th = 0, sp = 0, wx = 0, wy = 0, wz = 0;
    for (let j = 0; j < L.length; j += 2) {
      const Pm = L[j], w = L[j + 1], w2 = Pm[o + 26];
      convPoint(st, Pm, o, Pm[o + 6], _t1); convDir(st, Pm, o + 3, Pm[o + 6], _p1);
      if (w2 > 0) { convPoint(st, Pm, o + 19, Pm[o + 25], _t2); convDir(st, Pm, o + 22, Pm[o + 25], _p2); _t1.lerp(_t2, w2); _p1.lerp(_p2, w2); }
      _T.addScaledVector(_t1, w); _pl.addScaledVector(_p1, w);
      const a = Pm[o + 11] * w;
      if (a > 0) { _qa.set(Pm[o + 7], Pm[o + 8], Pm[o + 9], Pm[o + 10]).normalize().premultiply(st.qI); addQuat(_qa, a); aw += a; }
      wx += Pm[o + 12] * w; wy += Pm[o + 13] * w; wz += Pm[o + 14] * w;
      curl += Pm[o + 15] * w; th += Pm[o + 16] * w; sp += Pm[o + 17] * w;
    }
    ik(st, A.up, A.lo, UPPER, FORE, _T, _pl, -1, _qLo);
    _qd.copy(_qLo).multiply(_qw.setFromEuler(_e.set(wx, wy, wz)));
    if (aw > 0.001) { _qAcc.normalize(); _qd.slerp(_qAcc, clamp(aw, 0, 1)); }
    A.hand.quaternion.copy(_qLo).invert().multiply(_qd);
    const s = A.s;
    for (let f = 0; f < 4; f++) {
      const F = A.fingers[f], c = curl * (1 + f * 0.07);
      F.p.rotation.set(FINGERS[f][5] * (0.5 + sp * 1.8), 0, -s * c * 0.95);
      F.d.rotation.z = -s * c * 1.1;
    }
    A.thumb.p.rotation.set(0.75 + 0.2 * th, 0, -s * (0.3 + 0.55 * th));
    A.thumb.d.rotation.z = -s * th * 0.8;
  }
  function solveLeg(rig, st, L, i) {
    const G = rig.legs[i], o = lo(i);
    _T.set(0, 0, 0); _pl.set(0, 0, 0); _qAcc.set(0, 0, 0, 0);
    let toe = 0;
    for (let j = 0; j < L.length; j += 2) {
      const Pm = L[j], w = L[j + 1], sp = Pm[o + 6];
      _T.addScaledVector(convPoint(st, Pm, o, sp, _t1), w);
      _pl.addScaledVector(convDir(st, Pm, o + 3, sp, _p1), w);
      _qa.setFromEuler(_eF.set(Pm[o + 7], Pm[o + 8], Pm[o + 9]));
      if (sp === 2) _qa.premultiply(st.qI);
      addQuat(_qa, w);
      toe += Pm[o + 10] * w;
    }
    ik(st, G.up, G.lo, THIGH, SHIN, _T, _pl, 1, _qLo);
    _qAcc.normalize();
    G.foot.quaternion.copy(_qLo).invert().multiply(_qAcc);
    G.toe.rotation.x = toe;
  }

  // Dinglende ting (snore, kridtpose) følger tyngdekraft + fartvind med fjeder-forsinkelse
  const _qp = new Q(), _dl = new V3();
  function dangle(obj, D, st, dt, zMin, zMax) {
    _t1.set(-st.vel.x * 0.07, -1 - st.vel.y * 0.07, -st.vel.z * 0.07).normalize();
    if (dt > 0) {
      D.v.addScaledVector(_t2.subVectors(_t1, D.d), 60 * dt).multiplyScalar(Math.max(0, 1 - 9 * dt));
      D.d.addScaledVector(D.v, dt).normalize();
    }
    _qp.setFromRotationMatrix(obj.parent.matrixWorld).invert();
    _dl.copy(D.d).applyQuaternion(_qp);
    _dl.z = clamp(_dl.z, zMin, zMax);
    if (_dl.y > -0.2) _dl.y = -0.2;
    obj.quaternion.setFromUnitVectors(DOWN, _dl.normalize());
  }

  const GROUP = { idle: 'ground', run: 'ground', air: 'air', hang: 'hang', climb: 'climb', rope: 'rope', skate: 'skate', grind: 'skate' };
  const MODES = ['ground', 'air', 'hang', 'climb', 'rope', 'skate'];
  const RATE = { ground: 13, air: 9, hang: 20, climb: 28, rope: 14, skate: 12 };
  const BUILD = { ground: poseGround, air: poseAir, hang: poseHang, climb: poseClimb, rope: poseRope, skate: poseSkate };

  // =====================================================================
  //   Animation (kaldes hver frame)
  // =====================================================================
  function animate(rig, s, dt) {
    const st = rig._st;
    dt = clamp(dt || 0, 0, 0.1);
    const mode = s.mode || 'idle', grp = GROUP[mode] || 'ground', speed = s.speed || 0;
    // fart i verden (til fjedre, pendul og reb)
    const rp = rig.root.position;
    if (!st.init) st.prev.copy(rp);
    if (dt > 0) {
      _v.subVectors(rp, st.prev).divideScalar(dt);
      if (_v.lengthSq() > 900) _v.set(0, 0, 0);
      st.vel.lerp(_v, 0.5);
    }
    st.prev.copy(rp);
    st.velLocal.copy(st.vel).applyAxisAngle(UPV, -rig.inner.rotation.y);
    st.airT = s.grounded === false ? st.airT + dt : 0;
    if (dt > 0) st.accLean = damp(st.accLean, clamp(((speed - st.prevSpeed) / dt) * 0.012, -0.1, 0.18), 5, dt);
    st.prevSpeed = speed;
    st.exert = clamp(st.exert + dt * (grp === 'hang' || grp === 'climb' || grp === 'rope' ? 0.12 : speed > 6 ? 0.04 : -0.07), 0, 1);
    st.pushW = damp(st.pushW, s.push && s.grounded !== false ? 1 : 0, 6, dt);
    if (grp === 'hang' && s.hangKind && s.hangKind !== 'ledge') { // pendul efter grebet om stangen
      if (st.lastGrp !== 'hang') st.swingV = clamp(st.lastSpeed * 0.35, 0, 3);
      st.swingV += (-7.5 * Math.sin(st.swing) - 1.6 * st.swingV) * dt;
      st.swing += st.swingV * dt;
    } else { st.swing = damp(st.swing, 0, 6, dt); st.swingV = 0; }
    st.lastSpeed = speed;
    // tilstandsvægte (bløde overgange)
    if (!st.init) { for (const m of MODES) st.w[m] = m === grp ? 1 : 0; st.init = true; } else {
      for (const m of MODES) { st.w[m] = damp(st.w[m], m === grp ? 1 : 0, RATE[grp], dt); if (st.w[m] < 0.003) st.w[m] = 0; }
    }
    st.lastGrp = grp;
    // salto om kroppens tyngdepunkt
    if (s.flipT != null && s.flipT >= 0 && grp === 'air') {
      const f = clamp(s.flipT, 0, 1);
      st.flipAng = -TAU * f * f * (3 - 2 * f);
      st.flipW = smooth(0, 0.12, f) * (1 - smooth(0.8, 1, f));
    } else { st.flipAng = damp(wrap(st.flipAng), 0, 10, dt); st.flipW = damp(st.flipW, 0, 12, dt); }

    // byg og bland stillingerne
    const L = st.list;
    L.length = 0;
    let tot = 0;
    for (const m of MODES) {
      const w = st.w[m] * (1 - st.flipW);
      if (w <= 0) continue;
      const Pm = st.poses[m];
      Pm.fill(0);
      BUILD[m](st, s, Pm);
      L.push(Pm, w); tot += w;
    }
    if (st.flipW > 0.003) { const Pf = st.poses.flip; Pf.fill(0); poseFlip(st, s, Pf); L.push(Pf, st.flipW); tot += st.flipW; }
    for (let j = 1; j < L.length; j += 2) L[j] /= tot;
    const P = st.pose;
    for (let k = 0; k < A0; k++) { let v = 0; for (let j = 0; j < L.length; j += 2) v += L[j][k] * L[j + 1]; P[k] = v; }

    // krop (FK)
    rig.tiltG.rotation.z = P[I_BANK];
    rig.pivot.rotation.set(P[I_TX] + st.flipAng + st.swing, P[I_YAW], P[I_TZ]);
    rig.pelvis.position.set(P[I_PEL], P[I_PEL + 1], P[I_PEL + 2]);
    rig.pelvis.rotation.set(P[I_PROT], P[I_PROT + 1], P[I_PROT + 2]);
    rig.spine.rotation.set(P[I_SPN], P[I_SPN + 1], P[I_SPN + 2]);
    rig.chest.rotation.set(P[I_CHS], P[I_CHS + 1], P[I_CHS + 2]);
    const aim = s.aimLocal, sk = st.w.skate;              // hovedet drejer let mod kameraets sigte
    let ly = 0, lp = 0;
    if (aim) { ly = wrap(Math.atan2(-aim.x, -aim.z) - P[I_YAW]); lp = Math.asin(clamp(aim.y, -1, 1)); }
    const lim = 0.5 + 0.9 * sk;
    ly = clamp(ly * (0.3 + 0.6 * sk), -lim, lim) * P[I_LOOK];
    lp = clamp(lp * 0.3, -0.25, 0.2) * P[I_LOOK];
    rig.neck.rotation.set(P[I_NCK] + lp * 0.4, P[I_NCK + 1] + ly * 0.4, P[I_NCK + 2]);
    rig.head.rotation.set(P[I_HED] + lp * 0.6, P[I_HED + 1] + ly * 0.6, P[I_HED + 2]);
    for (let i = 0; i < 2; i++) {
      let shr = 0;
      for (let j = 0; j < L.length; j += 2) shr += L[j][ao(i) + 18] * L[j + 1];
      rig.arms[i].clav.rotation.z = rig.arms[i].s * shr * 0.3;
    }
    const br = P[I_BREATH];
    rig.chestMesh.scale.set(1 + 0.012 * br, 1 + 0.005 * br, 1 + 0.022 * br);
    rig.root.updateMatrixWorld(true);
    st.baseInv.copy(rig.base.matrixWorld).invert();
    st.mC.multiplyMatrices(st.baseInv, rig.chest.matrixWorld);
    st.mI.multiplyMatrices(st.baseInv, rig.inner.matrixWorld);
    st.qI.setFromRotationMatrix(st.mI);

    // lemmer (IK)
    for (let i = 0; i < 2; i++) solveArm(rig, st, L, i);
    for (let i = 0; i < 2; i++) solveLeg(rig, st, L, i);

    // sekundær bevægelse
    dangle(rig.strings, st.dStr, st, dt, -1, -0.17);
    dangle(rig.bag, st.dBag, st, dt, 0.02, 1);
    const hoodT = clamp(-st.vel.y * 0.02 + speed * 0.012, -0.2, 0.35);
    st.hoodV += ((hoodT - st.hood) * 70 - st.hoodV * 8) * dt;
    st.hood += st.hoodV * dt;
    rig.hood.rotation.x = st.hood;
    rig.coil.rotation.x = -st.hood * 0.25;

    // blink hvert 3.–6. sekund
    st.blinkT -= dt;
    if (st.blinkT <= 0) { st.blinkT = 3 + Math.random() * 3; st.blinkP = 1e-4; }
    let bl = 0;
    if (st.blinkP > 0) { st.blinkP += dt / 0.16; bl = Math.sin(Math.min(1, st.blinkP) * Math.PI); if (st.blinkP >= 1) st.blinkP = 0; }
    rig.lids.rotation.x = lerp(0.62, -0.85, bl);

    // brættet, udstyr og kridt
    rig.board.visible = mode === 'skate' || mode === 'grind';
    rig.board.rotation.z = -clamp(s.lean || 0, -1, 1) * 0.06;
    if (s.gear) applyGear(rig, s.gear);
    rig.setChalk(s.chalk);
  }

  return { build, animate };
}

let CHARACTER = createCharacterModule(THREE);
/* ===== FIGUR SLUT ===== */

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
  player.model = CHARACTER.build();
  player.model.inner.rotation.order = 'YXZ';
  scene.add(player.model.root);
  player.blob = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), new THREE.MeshBasicMaterial({
    map: TEX.blob, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4,
  }));
  player.blob.rotation.x = -Math.PI / 2;
  player.blob.renderOrder = 2;
  scene.add(player.blob);
}

// Skift figuren ud (bruges af udviklerværktøjerne)
function replaceCharacter(impl) {
  if (impl) CHARACTER = impl;
  const old = player.model;
  scene.remove(old.root);
  old.root.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  player.model = CHARACTER.build();
  player.model.inner.rotation.order = 'YXZ';
  scene.add(player.model.root);
}

function respawnPlayer() {
  const s = level.spawn, b = player.body;
  b.position.set(s.x, s.y, s.z);
  b.previousPosition.copy(b.position);
  b.velocity.set(0, 0, 0);
  Object.assign(player, {
    grounded: false, wasGrounded: false, groundPlat: null, coyote: 0, jumpBuffer: 0,
    jumpCooldown: 0, jumping: false, knockCooldown: 0, squash: 0, lastVy: 0,
    hang: null, grip: 1, grabCooldown: 0, airJumps: 0, flipT: -1,
  });
  player.skate = level.def.skate ? { heading: level.data.startHeading, grind: null, pushT: 0, lean: 0, crouch: 0, boostT: 0 } : null;
  player.groundVel.set(0, 0, 0);
  player.facing = -level.data.startHeading;
  player.model.root.visible = true;
  cam.target.set(s.x, s.y + CFG.camera.height - CFG.player.radius, s.z);
}

// Ønsket bevægelsesretning ud fra WASD (eller touch-joysticket) og kameraets retning
const wish = new THREE.Vector3();
function readWish() {
  const k = input.keys, st = input.stick;
  // Joysticket er analogt: lidt udslag = gå langsomt, fuldt udslag = løb
  const fwd = st.active ? -st.y : (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0);
  const side = st.active ? st.x : (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);
  const sy = Math.sin(cam.yaw), cy = Math.cos(cam.yaw);
  wish.set(-sy * fwd + cy * side, 0, -cy * fwd - sy * side);
  if (wish.lengthSq() > 1) wish.normalize();
  return wish;
}

// Underlagets friktion (is er glat). Kridt påvirker IKKE fødderne – kun hænderne.
function currentGrip() {
  return player.groundPlat && player.groundPlat.grip !== undefined ? player.groundPlat.grip : CFG.grip.normal;
}

// Kører før hvert fysikskridt
function playerControl(dt) {
  const b = player.body, v = b.velocity, M = CFG.move;
  player.coyote -= dt;
  player.jumpBuffer -= dt;
  player.jumpCooldown -= dt;
  player.knockCooldown -= dt;
  player.grabCooldown -= dt;
  if (player.flipT >= 0) { player.flipT += dt / 0.5; if (player.flipT >= 1) player.flipT = -1; }
  const w = readWish();
  if (player.hang) { if (player.hang.age !== undefined) player.hang.age += dt; hangControl(dt, w); return; }
  if (player.skate) { skateControl(dt); applyAirflow(dt); return; }
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
    // Retningen normaliseres, så et halvt udslag på joysticket ikke bremser i luften.
    const wm = Math.hypot(w.x, w.z), ux = w.x / wm, uz = w.z / wm;
    const along = v.x * ux + v.z * uz;
    let px = v.x - ux * along, pz = v.z - uz * along;
    const add = M.speed * wm - along;
    const a = add > 0 ? Math.min(add, M.airAccel * dt) : 0;
    const perp = Math.hypot(px, pz), cut = M.airAccel * 0.7 * dt;
    const k = perp > cut ? (perp - cut) / perp : 0;
    px *= k; pz *= k;
    v.x = ux * (along + a) + px;
    v.z = uz * (along + a) + pz;
  } else {
    const k = Math.max(0, 1 - M.airDrag * dt);
    v.x *= k; v.z *= k;
  }

  // Hop: kun fra jorden (eller lige efter kanten) – og ét dobbelthop i luften, hvis det er købt
  if (player.jumpBuffer > 0 && player.jumpCooldown <= 0 && !abilities.rope) {
    if (player.grounded || player.coyote > 0) {
      v.y = M.jumpVel + Math.max(0, player.groundVel.y);
      player.grounded = false;
      player.coyote = 0;
      player.jumpBuffer = 0;
      player.jumpCooldown = 0.12;
      player.jumping = true;
      player.airJumps = abilities.owned.double ? 1 : 0;
      audio.play('jump');
      const p = b.position;
      particles.burst(p.x, p.y - CFG.player.radius + 0.05, p.z, 6, { color: '#d9d2c4', speed: 2, up: 0.3, size: 0.3, life: 0.5, grav: 0 });
    } else if (player.airJumps > 0) {
      doubleJump(w);
    }
  }
  // Variabel hophøjde
  if (player.jumping && !input.keys.Space && v.y > 0) {
    v.y *= M.jumpCut;
    player.jumping = false;
  }
  if (v.y <= 0) player.jumping = false;

  if (abilities.rope) applyRope(dt, w);
  applyAirflow(dt);
  if (v.y < -M.maxFall) v.y = -M.maxFall;
}

function doubleJump(w) {
  const v = player.body.velocity, D = CFG.dbl;
  v.y = D.vel;
  const hs = Math.hypot(v.x, v.z);
  const wm = Math.hypot(w.x, w.z);
  if (wm > 0) { // skift retning i luften, men behold farten (også ved et halvt udslag på joysticket)
    const sp = Math.max(hs, CFG.move.speed * 0.8);
    v.x = v.x * (1 - D.steer) + (w.x / wm) * sp * D.steer;
    v.z = v.z * (1 - D.steer) + (w.z / wm) * sp * D.steer;
  }
  player.airJumps--;
  player.jumpBuffer = 0;
  player.jumpCooldown = 0.12;
  player.jumping = true;
  player.flipT = 0;
  audio.play('dbl');
  const p = player.body.position;
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    particles.emit(p.x, p.y - 0.3, p.z, Math.cos(a) * 4, -0.5, Math.sin(a) * 4, '#dff4ff', 0.28, 0.45, 0, 3);
  }
}

// Opvind fra ventiler og vindsøjler: løfter, til man svæver i toppen
function applyAirflow(dt) {
  const b = player.body, p = b.position, v = b.velocity;
  let accel = 0;
  const feet = p.y - CFG.player.radius;
  for (const vt of level.vents) {
    if (!level.ventActive(vt.plat)) continue;
    const d = vt.plat.def, bp = vt.plat.body.position;
    if (Math.hypot(p.x - bp.x, p.z - bp.z) > Math.min(d.w, d.d) / 2) continue;
    const yy = feet - (bp.y + d.h / 2);
    if (yy < -0.3 || yy > d.lift * 1.6) continue;
    accel = Math.max(accel, CFG.gravity + d.power * (1 - yy / d.lift));
  }
  for (const wd of level.winds) {
    const d = wd.def;
    if (Math.hypot(p.x - d.x, p.z - d.z) > d.r) continue;
    const yy = feet - d.y;
    if (yy < 0 || yy > d.h * 1.6) continue;
    accel = Math.max(accel, CFG.gravity + d.power * (1 - yy / d.h));
  }
  for (const g of level.gusts) { // sidevind
    if (!level.gustActive(g)) continue;
    const d = g.def, rx = p.x - d.x, rz = p.z - d.z;
    if (Math.abs(rx * g.f.x + rz * g.f.z) > d.d / 2 || Math.abs(rx * g.r.x + rz * g.r.z) > d.w / 2) continue;
    if (p.y < d.y || p.y > d.y + d.h) continue;
    const k = player.grounded ? 0.35 : 1; // står man fast, skubber vinden mindre
    v.x += d.dx * d.power * k * dt;
    v.z += d.dz * d.power * k * dt;
  }
  if (accel > 0) {
    v.y += accel * dt;
    v.y *= Math.max(0, 1 - 1.4 * dt);
    if (v.y > CFG.vent.maxUp) v.y = CFG.vent.maxUp;
    player.jumping = false;
  }
}

/* ---------------------------------------------------------------------
   Hænderne: kanter og stænger
   --------------------------------------------------------------------- */
const _hf = { hx: 0, hy: 0, hz: 0, nx: 0, nz: 0, tx: 0, tz: 0, vx: 0, vy: 0, vz: 0 };
const _hq = new THREE.Quaternion(), _hv = new THREE.Vector3(), _hn = new THREE.Vector3();
const _hw = new CANNON.Vec3(), _hr = new CANNON.Vec3();
const smooth01 = (x) => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };

function gripDrain(base) {
  return (base / (abilities.owned.gloves ? CFG.gloves : 1)) * (abilities.chalkActive > 0 ? CFG.chalk.drainMul : 1);
}

function tryGrab() {
  if (player.grabCooldown > 0 || player.grip <= 0.02 || abilities.rope || player.skate) return false;
  const b = player.body, p = b.position, H = CFG.hang;
  if (b.velocity.y > 3.5) return false;
  const chalk = abilities.chalkActive > 0;
  const reach = H.reach + (chalk ? CFG.chalk.reachBonus : 0);
  const win = H.window + (chalk ? CFG.chalk.windowBonus : 0);
  const handY = p.y + H.drop;
  let best = null, bestScore = Infinity;
  for (const plat of level.platforms) {
    if (NO_LEDGE.has(plat.type) || plat.state === 'falling' || !plat.body.world || debug.noLedge) continue;
    const d = plat.def, bp = plat.body.position;
    const dy = bp.y + d.h / 2 - handY;
    if (dy < -win || dy > win * 0.8) continue;
    const half = (d.shape === 'cyl' ? d.w / 2 : Math.hypot(d.w, d.d) / 2) + reach + 0.3;
    const rx = p.x - bp.x, rz = p.z - bp.z;
    if (Math.abs(rx) > half || Math.abs(rz) > half) continue;
    _hq.set(plat.body.quaternion.x, plat.body.quaternion.y, plat.body.quaternion.z, plat.body.quaternion.w).invert();
    _hv.set(rx, 0, rz).applyQuaternion(_hq);
    const lx = _hv.x, lz = _hv.z;
    let c;
    if (d.shape === 'cyl') {
      const dist = Math.hypot(lx, lz) - d.w / 2;
      if (dist <= 0.05 || dist > reach) continue;
      c = { shape: 'cyl', ang: Math.atan2(lz, lx), dist };
    } else {
      const ox = Math.abs(lx) - d.w / 2, oz = Math.abs(lz) - d.d / 2;
      if (ox <= 0.05 && oz <= 0.05) continue; // står over platformen – så lander man i stedet
      const dist = Math.hypot(Math.max(ox, 0), Math.max(oz, 0));
      if (dist > reach) continue;
      if (ox >= oz) {
        const m = Math.min(0.25, d.d / 2);
        c = { shape: 'box', axis: 'x', side: Math.sign(lx) || 1, t: clamp(lz, -d.d / 2 + m, d.d / 2 - m), dist };
      } else {
        const m = Math.min(0.25, d.w / 2);
        c = { shape: 'box', axis: 'z', side: Math.sign(lz) || 1, t: clamp(lx, -d.w / 2 + m, d.w / 2 - m), dist };
      }
    }
    const score = c.dist + Math.abs(dy) * 0.6;
    if (score < bestScore) { bestScore = score; best = { kind: 'ledge', plat, ...c }; }
  }
  const barReach = H.barReach + (chalk ? CFG.chalk.reachBonus * 0.6 : 0);
  for (const bar of level.bars) {
    const dy = bar.a.y - handY;
    if (dy < -win || dy > win * 0.8) continue;
    let s = (p.x - bar.a.x) * bar.dir.x + (p.z - bar.a.z) * bar.dir.z;
    if (s < -barReach || s > bar.def.len + barReach) continue;
    s = clamp(s, 0.25, bar.def.len - 0.25);
    const hd = Math.hypot(p.x - (bar.a.x + bar.dir.x * s), p.z - (bar.a.z + bar.dir.z * s));
    if (hd > barReach) continue;
    const score = hd + Math.abs(dy) * 0.6 - 0.15;
    if (score < bestScore) { bestScore = score; best = { kind: 'bar', bar, s }; }
  }
  for (const z of level.zips) {
    const d = z.def;
    let sh = (p.x - z.a.x) * z.dir.x + (p.z - z.a.z) * z.dir.z; // vandret afstand langs kablet
    if (sh < -barReach || sh > d.len - 1) continue;
    sh = clamp(sh, 0.3, d.len - 1);
    const cy = d.ay - (d.drop * sh) / d.len;
    const dy = cy - handY;
    if (dy < -win || dy > win * 0.8) continue;
    const hd = Math.hypot(p.x - (z.a.x + z.dir.x * sh), p.z - (z.a.z + z.dir.z * sh));
    if (hd > barReach) continue;
    const score = hd + Math.abs(dy) * 0.6 - 0.2;
    if (score < bestScore) { bestScore = score; best = { kind: 'zip', zip: z, s3: (sh / d.len) * z.len3, speed: Math.max(5, Math.hypot(b.velocity.x, b.velocity.z) * 0.8) }; }
  }
  if (!best) return false;
  startHang(best);
  return true;
}

function startHang(c) {
  player.hang = { ...c, climb: null, shimmy: 0, warned: false, age: 0 };
  player.jumping = false;
  player.jumpBuffer = 0;
  player.coyote = 0;
  player.airJumps = abilities.owned.double ? 1 : 0;
  player.flipT = -1;
  audio.play('grab');
  const F = hangFrame(player.hang);
  particles.burst(F.hx, F.hy + 0.05, F.hz, 6, { color: abilities.chalkActive > 0 ? '#ffffff' : '#cfc6b8', speed: 1.2, up: 0.4, size: 0.18, life: 0.5, grav: 2 });
  if (c.kind === 'bar' && player.hints.bar < 2) { player.hints.bar++; toast(T.toastBarHint, 'gold', 3400); }
  if (c.kind === 'zip' && !player.hints.zip) { player.hints.zip = 1; toast(T.toastZipHint, 'gold', 3000); audio.play('zip'); }
  if (c.kind === 'ledge' && player.hints.grab < 2) { player.hints.grab++; toast(T.toastGrabHint, 'gold', 3400); }
  pinHang();
}

// Hvor sidder hænderne lige nu (verdenskoordinater), og hvilken vej vender kanten?
function hangFrame(h) {
  const F = _hf;
  if (h.kind === 'bar') {
    const bar = h.bar;
    F.hx = bar.a.x + bar.dir.x * h.s; F.hy = bar.a.y; F.hz = bar.a.z + bar.dir.z * h.s;
    F.nx = 0; F.nz = 0; F.tx = bar.dir.x; F.tz = bar.dir.z; F.vx = bar.vel.x; F.vy = bar.vel.y; F.vz = bar.vel.z;
    return F;
  }
  if (h.kind === 'zip') {
    const z = h.zip;
    F.hx = z.a.x + z.dir3.x * h.s3; F.hy = z.a.y + z.dir3.y * h.s3; F.hz = z.a.z + z.dir3.z * h.s3;
    F.nx = 0; F.nz = 0; F.tx = z.dir.x; F.tz = z.dir.z;
    F.vx = z.dir3.x * h.speed; F.vy = z.dir3.y * h.speed; F.vz = z.dir3.z * h.speed;
    return F;
  }
  const plat = h.plat, d = plat.def, body = plat.body;
  let lx, lz, nx, nz, tx, tz;
  if (h.shape === 'cyl') {
    const R = d.w / 2, ca = Math.cos(h.ang), sa = Math.sin(h.ang);
    lx = ca * R; lz = sa * R; nx = ca; nz = sa; tx = -sa; tz = ca;
  } else if (h.axis === 'x') {
    lx = (h.side * d.w) / 2; lz = h.t; nx = h.side; nz = 0; tx = 0; tz = 1;
  } else {
    lx = h.t; lz = (h.side * d.d) / 2; nx = 0; nz = h.side; tx = 1; tz = 0;
  }
  _hq.set(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w);
  _hv.set(lx, d.h / 2, lz).applyQuaternion(_hq);
  F.hx = body.position.x + _hv.x; F.hy = body.position.y + _hv.y; F.hz = body.position.z + _hv.z;
  _hn.set(nx, 0, nz).applyQuaternion(_hq); F.nx = _hn.x; F.nz = _hn.z;
  _hn.set(tx, 0, tz).applyQuaternion(_hq); F.tx = _hn.x; F.tz = _hn.z;
  _hr.set(_hv.x, _hv.y, _hv.z);
  body.angularVelocity.cross(_hr, _hw);
  F.vx = body.velocity.x + _hw.x; F.vy = body.velocity.y + _hw.y; F.vz = body.velocity.z + _hw.z;
  return F;
}

// Hold kroppen fast under hænderne (kører både før og efter fysikskridtet)
function pinHang() {
  const h = player.hang;
  if (!h) return;
  const F = hangFrame(h), b = player.body, H = CFG.hang;
  if (h.climb) { placeClimb(F); return; }
  b.position.set(F.hx + F.nx * H.wallGap, F.hy - H.drop, F.hz + F.nz * H.wallGap);
  b.velocity.set(F.vx, F.vy, F.vz);
  if (h.kind === 'ledge') player.facing = Math.atan2(F.nx, F.nz);
  else if (Math.abs(h.shimmy) > 0.2) player.facing = Math.atan2(-F.tx * Math.sign(h.shimmy), -F.tz * Math.sign(h.shimmy));
}

function hangControl(dt, w) {
  const h = player.hang, H = CFG.hang;
  if (h.plat && (h.plat.state === 'falling' || !h.plat.body.world)) { releaseHang('fall'); return; }
  const F = hangFrame(h);
  if (h.climb) {
    h.climb.t = Math.min(1, h.climb.t + dt / H.climbTime);
    placeClimb(F);
    if (h.climb.t >= 1) { player.hang = null; player.grabCooldown = 0.2; player.coyote = 0; }
    return;
  }
  if (h.kind === 'zip') { // svævebanen: glid automatisk nedad, slip med mellemrum eller i bunden
    const z = h.zip;
    h.speed = Math.min(20, h.speed + CFG.gravity * Math.max(0.15, -z.dir3.y) * dt);
    h.s3 += h.speed * dt;
    player.facing = Math.atan2(-z.dir.x, -z.dir.z);
    player.grip = Math.max(0.05, player.grip - gripDrain(H.barDrain * 0.4) * dt);
    if (h.s3 >= z.len3 - 0.4 || player.jumpBuffer > 0) {
      const jump = player.jumpBuffer > 0;
      player.jumpBuffer = 0;
      const v = player.body.velocity;
      player.hang = null;
      player.grabCooldown = 0.5;
      v.set(z.dir3.x * h.speed, z.dir3.y * h.speed + (jump ? 7 : 2.5), z.dir3.z * h.speed);
      if (jump) { player.jumping = true; audio.play('jump'); }
      return;
    }
    pinHang();
    return;
  }
  const along = w.x * F.tx + w.z * F.tz;
  const toward = -(w.x * F.nx + w.z * F.nz);
  let rate = h.kind === 'bar' ? H.barDrain : H.drain;
  if (h.plat && h.plat.icy) rate *= H.iceMul;
  if (Math.abs(along) > 0.3) rate *= H.moveMul;
  player.grip -= gripDrain(rate) * dt;
  if (player.grip <= 0) {
    player.grip = 0;
    releaseHang('slip');
    toast(T.toastSlip, 'bad', 1600);
    audio.play('slip');
    return;
  }
  if (player.grip < 0.3 && !h.warned) { h.warned = true; toast(T.toastGripLow, 'bad', 1800); }
  h.shimmy = 0;
  if (h.kind === 'bar') {
    if (Math.abs(along) > 0.2) {
      h.s = clamp(h.s + along * H.barShimmy * dt, 0.25, h.bar.def.len - 0.25);
      h.shimmy = along;
    }
    if (player.jumpBuffer > 0) { player.jumpBuffer = 0; jumpOffBar(w); return; }
    // S (uden at det flytter en langs stangen) = giv slip
    const k = input.keys;
    if ((k.KeyS || k.ArrowDown) && !(k.KeyW || k.ArrowUp) && Math.abs(along) < 0.3) { releaseHang('drop'); return; }
  } else {
    if (Math.abs(along) > 0.3 && Math.abs(toward) < 0.6) {
      const d = h.plat.def, step = along * H.shimmy * dt;
      if (h.shape === 'cyl') h.ang += step / (d.w / 2);
      else {
        const len = h.axis === 'x' ? d.d : d.w;
        const lim = len / 2 - Math.min(0.25, len / 2);
        h.t = clamp(h.t + step, -lim, lim);
      }
      h.shimmy = along;
    }
    if (player.jumpBuffer > 0 || toward > 0.6) {
      if (h.age >= 0.18) { player.jumpBuffer = 0; startClimb(); return; }
    } else if (toward < -0.6) { releaseHang('drop'); return; }
  }
  pinHang();
}

function startClimb() {
  player.hang.climb = { t: 0 };
  audio.play('climb');
}

// Klatring: først op langs væggen, så ind over kanten
function placeClimb(F) {
  const H = CFG.hang, b = player.body, k = player.hang.climb.t;
  const up = smooth01(k / 0.6), inn = smooth01((k - 0.6) / 0.4);
  const y = F.hy - H.drop + (H.drop + CFG.player.radius + 0.06) * up;
  const out = H.wallGap * (1 - inn) - 0.6 * inn;
  b.position.set(F.hx + F.nx * out, y, F.hz + F.nz * out);
  b.velocity.set(F.vx, F.vy, F.vz);
  player.facing = Math.atan2(F.nx, F.nz);
}

function releaseHang(reason) {
  const h = player.hang;
  if (!h) return;
  const F = hangFrame(h);
  player.hang = null;
  player.grabCooldown = reason === 'jump' ? 0.3 : reason === 'drop' ? 0.5 : reason === 'slip' ? 0.8 : CFG.hang.cooldown;
  const v = player.body.velocity;
  if (reason === 'drop') v.set(F.vx + F.nx * 1.5, Math.min(F.vy, 0) - 1, F.vz + F.nz * 1.5);
  else if (reason === 'slip' || reason === 'fall') v.set(F.vx + F.nx * 0.8, -2, F.vz + F.nz * 0.8);
}

function jumpOffBar(w) {
  // Med retning: et langt fremadspring (til næste stang eller en platform).
  // Uden retning: lige op (til en stang lige over, fx en ræstige i en mast).
  // (et lille udslag på joysticket tæller som "uden retning"; retningen normaliseres)
  const wm = Math.hypot(w.x, w.z), dir = wm > 0.3, H = CFG.hang;
  const ux = dir ? w.x / wm : 0, uz = dir ? w.z / wm : 0;
  // Stangens egen fart (trapez/bevægelig stang) følger med, så man kan kaste sig langt
  const F = hangFrame(player.hang), bvx = F.vx, bvy = F.vy, bvz = F.vz;
  releaseHang('jump');
  player.body.velocity.set(ux * H.leapFwd + bvx, (dir ? H.leapUp : H.hopUp) + Math.max(0, bvy) * 0.6, uz * H.leapFwd + bvz);
  player.jumping = true;
  audio.play('jump');
}

/* ---------------------------------------------------------------------
   Skateboard
   --------------------------------------------------------------------- */
function skateControl(dt) {
  const b = player.body, v = b.velocity, S = CFG.skate, k = input.keys, sk = player.skate;
  const steer = input.stick.active ? clamp(input.stick.x / 0.8, -1, 1) // joysticket styrer trinløst
    : (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);
  const pushing = !!(k.KeyW || k.ArrowUp), braking = !!(k.KeyS || k.ArrowDown);
  sk.lean = damp(sk.lean, steer, 8, dt);
  sk.pushT = Math.max(0, sk.pushT - dt);
  sk.crouch = Math.max(0, sk.crouch - dt * 2.5);
  sk.boostT = Math.max(0, sk.boostT - dt);
  if (sk.grind) { grindControl(dt); return; }
  const gv = player.groundVel;
  if (player.grounded) {
    const spd0 = Math.hypot(v.x - gv.x, v.z - gv.z);
    sk.heading += steer * S.turn * clamp(0.5 + spd0 / 14, 0.5, 1) * dt;
    const f = fwdVec(sk.heading);
    const rx = v.x - gv.x, rz = v.z - gv.z;
    let along = rx * f.x + rz * f.z;
    let lx = rx - f.x * along, lz = rz - f.z * along;
    if (along < -2.5) { sk.heading += Math.PI; along = -along; lx = -lx; lz = -lz; } // lander baglæns: vend brættet
    const f2 = fwdVec(sk.heading);
    if (pushing && along < S.maxPush) { along = Math.min(S.maxPush, along + S.push * dt); sk.pushT = 0.35; }
    if (braking) along = Math.max(0, along - S.brake * dt);
    along -= Math.min(Math.max(along, 0), S.roll * dt);
    const plat = player.groundPlat;
    if (plat && plat.type === 'boost' && along < plat.def.boost) {
      along = plat.def.boost;
      if (sk.boostT <= 0) { sk.boostT = 0.6; audio.play('boost'); particles.burst(b.position.x, b.position.y - 0.3, b.position.z, 16, { color: '#7dfcff', speed: 4, up: 0.3, size: 0.3, life: 0.5, grav: 0 }); }
    }
    const kd = Math.exp(-S.lateral * dt);
    lx *= kd; lz *= kd;
    along = Math.min(along, S.maxSpeed);
    v.x = gv.x + f2.x * along + lx;
    v.z = gv.z + f2.z * along + lz;
  } else {
    const dh = steer * S.airTurn * dt;
    sk.heading += dh;
    const c = Math.cos(dh * 0.6), s = Math.sin(dh * 0.6);
    const vx = v.x * c - v.z * s, vz = v.x * s + v.z * c;
    v.x = vx; v.z = vz;
  }
  if (player.jumpBuffer > 0 && player.jumpCooldown <= 0 && (player.grounded || player.coyote > 0)) {
    v.y = S.ollie + Math.max(0, gv.y);
    player.jumpBuffer = 0;
    player.jumpCooldown = 0.15;
    player.grounded = false;
    player.coyote = 0;
    sk.crouch = 1;
    audio.play('ollie');
  }
  if (v.y < -CFG.move.maxFall) v.y = -CFG.move.maxFall;
}

function startGrind(plat) {
  const sk = player.skate, v = player.body.velocity;
  const q = plat.body.quaternion;
  _hq.set(q.x, q.y, q.z, q.w);
  _hn.set(0, 0, -1).applyQuaternion(_hq);
  const along = v.x * _hn.x + v.z * _hn.z;
  sk.grind = { plat, ax: _hn.x, az: _hn.z, dir: along >= 0 ? 1 : -1, speed: Math.max(7, Math.abs(along)) };
  audio.play('grind');
  if (!sk.grindHint) { sk.grindHint = true; toast(T.toastGrind, 'gold', 1000); }
}

function grindControl(dt) {
  const sk = player.skate, g = sk.grind, b = player.body, d = g.plat.def, bp = g.plat.body.position;
  const s = (b.position.x - bp.x) * g.ax + (b.position.z - bp.z) * g.az;
  if (Math.abs(s) > d.d / 2 + 0.05) { sk.grind = null; return; } // kørte ud over enden
  g.speed = Math.max(5, g.speed - CFG.skate.grindFriction * g.speed * dt);
  b.position.set(bp.x + g.ax * s, bp.y + d.h / 2 + CFG.player.radius + 0.01, bp.z + g.az * s);
  b.velocity.set(g.ax * g.dir * g.speed, 0, g.az * g.dir * g.speed);
  sk.heading = Math.atan2(g.ax * g.dir, -g.az * g.dir);
  if (Math.random() < dt * 40) {
    particles.emit(b.position.x, b.position.y - 0.4, b.position.z, (Math.random() - 0.5) * 3, 1.5 + Math.random() * 2, (Math.random() - 0.5) * 3, '#ffd27a', 0.12, 0.35, 12, 0);
  }
  if (player.jumpBuffer > 0) {
    player.jumpBuffer = 0;
    sk.grind = null;
    b.velocity.y = CFG.skate.ollie;
    player.jumpCooldown = 0.2;
    sk.crouch = 1;
    audio.play('ollie');
  }
}

// Kører efter hvert fysikskridt: jordkontakt, transportbånd, springpuder, smuldren, greb, lava, mønter og portal
const _r = new CANNON.Vec3(), _w = new CANNON.Vec3(), _beltDir = new THREE.Vector3();
function postStep(dt, playing) {
  const b = player.body;
  const prevVy = player.lastVy;
  player.wasGrounded = player.grounded;
  let grounded = false, gInfo = null, gBody = null, bestY = 0.5, gnx = 0, gny = 1, gnz = 0;
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
    if (ny > bestY) { bestY = ny; grounded = true; gInfo = info; gBody = other; _r.copy(r); gnx = nx; gny = ny; gnz = nz; }
  }
  if (player.jumpCooldown > 0 || player.hang) grounded = false;
  player.grounded = grounded;
  player.groundPlat = grounded ? (gInfo.type === 'bar' ? gInfo.parent : gInfo) : null;
  if (grounded) {
    // Underlagets hastighed i kontaktpunktet (v + ω × r) – så man følger med bevægelige platforme
    gBody.angularVelocity.cross(_r, _w);
    player.groundVel.set(gBody.velocity.x + _w.x, gBody.velocity.y + _w.y, gBody.velocity.z + _w.z);
    const gp = player.groundPlat;
    if (gp.type === 'conveyor') { // transportbånd
      _beltDir.set(gp.def.beltAx === 'x' ? 1 : 0, 0, gp.def.beltAx === 'x' ? 0 : -1).applyQuaternion(gp.mesh.quaternion);
      player.groundVel.x += _beltDir.x * gp.def.belt;
      player.groundVel.z += _beltDir.z * gp.def.belt;
    }
    player.groundNormal.set(gnx, gny, gnz);
    player.coyote = CFG.move.coyote;
    player.airJumps = abilities.owned.double ? 1 : 0;
    player.grip = Math.min(1, player.grip + CFG.hang.regen * dt);
  } else {
    player.groundVel.multiplyScalar(0.98);
    player.groundNormal.set(0, 1, 0);
  }
  player.lastVy = b.velocity.y;

  if (player.hang) pinHang();
  if (!playing) return;
  if (grounded && !player.wasGrounded) onLand(prevVy);
  if (grounded) {
    const plat = player.groundPlat;
    if (plat.def.hint && !plat.hintShown) { plat.hintShown = true; toast(plat.def.hint, 'gold', 5000); } // banens egne tips
    if (plat.def.cp && level.checkpoint !== plat) { // kontrolpunkt nået
      level.setCheckpoint(plat);
      toast(T.toastCheckpoint, 'gold', 2600);
      audio.play('buy');
      particles.burst(b.position.x, b.position.y - 0.3, b.position.z, 24, { color: '#5dff9b', speed: 4, up: 1.2, size: 0.25, life: 0.8, grav: 3 });
    }
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
    } else if (plat.type === 'rail' && player.skate && !player.skate.grind && player.jumpCooldown <= 0) {
      startGrind(plat);
    }
  } else if (!player.hang && !abilities.rope) {
    tryGrab();
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
    if (player.skate) player.skate.crouch = Math.min(1, -vy / 14);
    audio.play('land', clamp(-vy / 25, 0.2, 1));
    const p = player.body.position;
    particles.burst(p.x, p.y - CFG.player.radius + 0.05, p.z, Math.floor(clamp(-vy, 4, 14)), {
      color: player.groundPlat && player.groundPlat.icy ? '#e6f7ff' : '#d8cfbf', speed: 2.6, up: 0.25, size: 0.3, life: 0.55, grav: 0, drag: 3,
    });
  }
  player.flipT = -1;
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

// Figurens tilstand og animation (kører hver frame)
const _bp = new THREE.Vector3(), _down = new THREE.Vector3(0, -1, 0), _blobRay = new THREE.Raycaster();
function updatePlayerVisual(dt, elapsed) {
  const m = player.model, b = player.body, s = player.cs;
  m.root.position.set(b.position.x, b.position.y, b.position.z);
  const relX = b.velocity.x - player.groundVel.x, relZ = b.velocity.z - player.groundVel.z;
  const sp = Math.hypot(relX, relZ);
  const sk = player.skate;
  if (sk) player.facing = angleDamp(player.facing, -sk.heading, 18, dt);
  else if (player.hang) { /* retningen sættes af pinHang */ }
  else if (sp > 0.7) player.facing = angleDamp(player.facing, Math.atan2(-relX, -relZ), 14, dt);
  else if (game.state === 'playing' && (wish.x || wish.z)) player.facing = angleDamp(player.facing, Math.atan2(-wish.x, -wish.z), 10, dt);
  m.inner.rotation.y = player.facing;
  // På skateboardet følger brættet underlagets hældning
  let pitch = 0;
  if (sk && player.grounded) {
    const f = fwdVec(sk.heading), n = player.groundNormal;
    pitch = Math.asin(clamp(-(n.x * f.x + n.z * f.z), -0.8, 0.8));
  }
  m.inner.rotation.x = damp(m.inner.rotation.x, pitch, 12, dt);

  let mode;
  if (sk) mode = sk.grind ? 'grind' : 'skate';
  else if (player.hang) mode = player.hang.climb ? 'climb' : 'hang';
  else if (abilities.rope) mode = 'rope';
  else if (player.grounded) mode = sp > 0.6 ? 'run' : 'idle';
  else mode = 'air';
  if (mode === 'run' || mode === 'idle') {
    player.runPhase += dt * (3 + sp * 1.3);
    if (mode === 'run' && sp > 2.5 && game.state === 'playing') {
      player.stepTimer -= dt * (sp / 4);
      if (player.stepTimer <= 0) { player.stepTimer = 1; audio.play('step'); }
    }
  }
  player.squash = Math.max(0, player.squash - dt * 3.2);
  s.mode = mode;
  s.speed = sk ? Math.hypot(b.velocity.x, b.velocity.z) : sp;
  s.vy = b.velocity.y;
  s.grounded = player.grounded;
  s.runPhase = player.runPhase;
  s.time = elapsed;
  s.squash = player.squash;
  s.flipT = player.flipT;
  s.chalk = damp(s.chalk || 0, abilities.chalkActive > 0 ? 1 : 0, 8, dt);
  s.hangKind = player.hang ? player.hang.kind : null;
  s.shimmy = player.hang ? player.hang.shimmy : 0;
  s.climbT = player.hang && player.hang.climb ? player.hang.climb.t : 0;
  s.push = !!(sk && sk.pushT > 0);
  s.lean = sk ? sk.lean : 0;
  s.crouch = sk ? sk.crouch : 0;
  // Ekstra oplysninger til en mere levende figur (IK for hænderne, vejrtrækning, udstyr …)
  s.grip = player.grip;
  const prevFacing = s._facing ?? player.facing;
  s.turnRate = dt > 0 ? Math.atan2(Math.sin(player.facing - prevFacing), Math.cos(player.facing - prevFacing)) / dt : 0;
  s._facing = player.facing;
  _invQ.setFromEuler(_eul.set(0, player.facing, 0, 'YXZ')).invert();
  if (player.hang) {
    const F = hangFrame(player.hang);
    s.gripLocal = (s.gripLocal || { x: 0, y: 0, z: 0 });
    _cv.set(F.hx - b.position.x, F.hy - b.position.y, F.hz - b.position.z).applyQuaternion(_invQ);
    s.gripLocal.x = _cv.x; s.gripLocal.y = _cv.y; s.gripLocal.z = _cv.z;
    s.gripTangent = (s.gripTangent || { x: 1, y: 0, z: 0 });
    _cv.set(F.tx, player.hang.kind === 'zip' ? player.hang.zip.dir3.y : 0, F.tz).normalize().applyQuaternion(_invQ);
    s.gripTangent.x = _cv.x; s.gripTangent.y = _cv.y; s.gripTangent.z = _cv.z;
  } else { s.gripLocal = null; s.gripTangent = null; }
  if (abilities.rope) {
    const r = abilities.rope;
    _cv.set(r.point.x - b.position.x, r.point.y - (b.position.y + 0.8), r.point.z - b.position.z).normalize().applyQuaternion(_invQ);
    s.ropeDir = { x: _cv.x, y: _cv.y, z: _cv.z };
  } else s.ropeDir = null;
  const gp = player.grounded ? player.groundPlat : null;
  s.surface = gp ? (gp.type === 'ice' ? 'ice' : gp.type === 'conveyor' ? 'conveyor' : null) : null;
  _cv.set(-Math.sin(cam.yaw) * Math.cos(cam.pitch), -Math.sin(cam.pitch), -Math.cos(cam.yaw) * Math.cos(cam.pitch)).applyQuaternion(_invQ);
  s.aimLocal = { x: _cv.x, y: _cv.y, z: _cv.z };
  s.gear = s.gear || {};
  s.gear.gloves = !!abilities.owned.gloves; s.gear.chalk = !!abilities.owned.chalk;
  s.gear.rope = !!abilities.owned.rope; s.gear.helmet = !!level.def.skate;
  CHARACTER.animate(m, s, dt);
  if (s.chalk > 0.5 && Math.random() < dt * 14) emitChalk(1);

  // Rund skygge lige under spilleren (hjælper med at ramme landingen)
  _bp.set(b.position.x, b.position.y, b.position.z);
  _blobRay.set(_bp, _down);
  _blobRay.far = 60;
  const hits = _blobRay.intersectObjects(level.rayMeshes, false);
  if (hits.length && m.root.visible && !player.hang) {
    const h = hits[0];
    const height = h.distance - CFG.player.radius;
    player.blob.visible = true;
    player.blob.position.set(h.point.x, h.point.y + 0.03, h.point.z);
    const sc = clamp(1 - height / 25, 0.35, 1);
    player.blob.scale.set(sc, sc, sc);
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
window.addEventListener('blur', () => { input.keys = Object.create(null); releasePointer(); if (touch.active) resetTouch(); });

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

// Brug den valgte evne (venstreklik eller EVNE-knappen på touch-skærme)
function pressAbility() {
  if (player.skate) return; // ingen evner på skateboardet
  const hadRope = !!abilities.rope;
  useAbility();
  input.leftHeld = !hadRope && !!abilities.rope; // samme tryk: hold for at hale ind
}
// Efter en berøring sender browsere "falske" musehændelser – dem ignorerer vi
const fromTouch = () => performance.now() - touch.lastTouch < 1000;

canvas.addEventListener('mousedown', (e) => {
  audio.init();
  if (game.state !== 'playing' || fromTouch()) return;
  if (e.button === 0) {
    pressAbility();
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
  if (fromTouch()) return;
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
   12b. BERØRING (telefon og tablet)
   Venstre del af skærmen: et joystick, der dukker op, hvor tommelfingeren
   rører. Resten af skærmen: træk for at dreje kameraet. Knapper: HOP,
   EVNE og pause. Hotbarens ikoner kan trykkes på for at skifte evne.
   Joysticket er analogt (lidt udslag = gå, fuldt udslag = løb) og sætter
   samtidig de virtuelle W/A/S/D-taster, så klatring, stænger og
   skateboard virker præcis som med tastaturet.
   ===================================================================== */
const touch = {
  active: false,        // touch-styringen vises (touch-skærm eller første berøring)
  stickId: null, x0: 0, y0: 0,
  lookId: null, lookX: 0, lookY: 0,
  lastTouch: 0,         // tidspunkt for seneste berøring (browsere sender bagefter "falske" musehændelser)
};
input.stick = { active: false, x: 0, y: 0 };
input.touchLook = false;
const STICK_R = 56;         // joystickets radius i px
const STICK_DEAD = 0.16;    // dødzone (andel af radius)
const STICK_ZONE = 0.42;    // venstre del af skærmen, hvor joysticket kan startes

// Tastatur- og musetekster omskrevet til touch (bruges på banetips og andre tekster)
const TOUCH_TEXT = [
  [/WASD/g, 'Joysticket'],
  [/[Mm]ellemrum \+ W/g, 'HOP + joystick frem'],
  [/W\/[Mm]ellemrum/g, 'Joystick frem/HOP'],
  [/([Tt])ryk på mellemrum/g, '$1ryk på HOP'],
  [/[Mm]ellemrum/g, 'HOP'],
  [/([Hh])old venstreklik/g, '$1old EVNE'],
  [/\(venstreklik\)/g, '(EVNE-knappen)'],
  [/Venstreklik/g, 'Tryk på EVNE'],
  [/venstreklik/g, 'tryk på EVNE'],
  [/[Hh]øjreklik/g, 'træk i højre side'],
  [/\(scroll\)/g, '(tryk på ikonet forneden)'],
  [/med scrollhjulet/g, 'forneden på skærmen'],
  [/Tryk B for at åbne butikken/g, 'Åbn butikken i pausemenuen'],
  [/ \(B\)/g, ' (i pausemenuen)'],
  [/\((\d)\)/g, '(tryk på ikonet forneden)'],
  [/A\/D/g, 'joysticket til siden'],
  [/Tryk W\b/g, 'Skub joysticket frem'],
  [/tryk W\b/g, 'skub joysticket frem'],
  [/([Hh])old W\b/g, '$1old joysticket frem'],
  [/Tryk S\b/g, 'Træk joysticket tilbage'],
  [/tryk S\b/g, 'træk joysticket tilbage'],
  [/(^|[\s(·!.–-])W:/g, '$1Joystick frem:'],
  [/(^|[\s(·!.–-])S:/g, '$1Joystick tilbage:'],
  [/(^|[\s(·!.–-])W(?=[\s).,!]|$)/g, '$1joysticket frem'],
  [/(^|[\s(·!.–-])S(?=[\s).,!]|$)/g, '$1joysticket tilbage'],
  [/Klik igen/g, 'Tryk igen'],
];
function forTouch(s) {
  if (!touch.active || typeof s !== 'string') return s;
  for (const [re, to] of TOUCH_TEXT) s = s.replace(re, to);
  return s;
}

// Spillets faste tekster i en touch-udgave (skrevet i hånden; resten oversættes af forTouch)
const T_KEYBOARD = {};
function useTouchTexts(on) {
  for (const k of Object.keys(T_TOUCH)) {
    if (!(k in T_KEYBOARD)) T_KEYBOARD[k] = T[k];
    T[k] = on ? T_TOUCH[k] : T_KEYBOARD[k];
  }
}

function prefersTouch() {
  const mm = (q) => !!(window.matchMedia && window.matchMedia(q).matches);
  return mm('(pointer: coarse)') || ((navigator.maxTouchPoints || 0) > 0 && mm('(hover: none)'));
}

function setTouchMode(on) {
  if (touch.active === on) return;
  touch.active = on;
  document.body.classList.toggle('touch', on);
  useTouchTexts(on);
  if (on) {
    // Telefoner og tablets: lavere opløsning og mindre skyggekort; resten styres løbende af updateQuality
    resetQualityFloor();
    quality.pr = Math.min(window.devicePixelRatio || 1, quality.max);
    renderer.setPixelRatio(quality.pr);
    renderer.setSize(window.innerWidth, window.innerHeight);
    if (sun.shadow.mapSize.x > 1024) {
      sun.shadow.mapSize.set(1024, 1024);
      if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
    }
  }
  if (typeof renderHotbar === 'function' && level) renderHotbar();
}

// ---- Joystick ----
function placeStick(x, y) {
  $('touch-stick').style.transform = `translate(${x - STICK_R}px, ${y - STICK_R}px)`;
}
function setKnob(dx, dy) {
  $('touch-knob').style.transform = `translate(${dx}px, ${dy}px)`;
}
function restStick() {
  $('touch-stick').classList.remove('on');
  $('touch-stick').style.transform = '';
  setKnob(0, 0);
}
function startStick(e) {
  touch.stickId = e.pointerId;
  // Joystickets midte er der, hvor tommelfingeren rører (så der ikke kommer udslag af sig selv
  // tæt ved kanten); kun ringen tegnes flyttet ind, så den er helt på skærmen
  touch.x0 = e.clientX; touch.y0 = e.clientY;
  const bx = clamp(e.clientX, STICK_R + 8, window.innerWidth - STICK_R - 8);
  const by = clamp(e.clientY, STICK_R + 8, window.innerHeight - STICK_R - 8);
  touch.ox = touch.x0 - bx; touch.oy = touch.y0 - by;
  $('touch-stick').classList.add('on');
  placeStick(bx, by);
  moveStick(e);
}
function moveStick(e) {
  let dx = e.clientX - touch.x0, dy = e.clientY - touch.y0;
  const len = Math.hypot(dx, dy);
  if (len > STICK_R) { dx *= STICK_R / len; dy *= STICK_R / len; }
  setKnob(dx + touch.ox, dy + touch.oy);
  let x = dx / STICK_R, y = dy / STICK_R;
  const m = Math.hypot(x, y);
  if (m < STICK_DEAD) { x = 0; y = 0; } else { const k = (m - STICK_DEAD) / (1 - STICK_DEAD) / m; x *= k; y *= k; }
  const st = input.stick;
  st.active = true; st.x = x; st.y = y;
  applyStickKeys();
}
// Virtuelle taster til klatring (frem = op, tilbage = giv slip), stænger og skateboard
function applyStickKeys() {
  const st = input.stick, k = input.keys;
  if (!st.active) return;
  k.KeyW = st.y < -0.5; k.KeyS = st.y > 0.5; k.KeyA = st.x < -0.5; k.KeyD = st.x > 0.5;
}
function endStick() {
  touch.stickId = null;
  const st = input.stick, k = input.keys;
  st.active = false; st.x = 0; st.y = 0;
  k.KeyW = k.KeyS = k.KeyA = k.KeyD = false;
  restStick();
}

// ---- Kamera: træk med fingeren ----
function lookMove(e) {
  const k = 5 / Math.max(window.innerWidth, window.innerHeight); // én skærmbredde ≈ 290°
  cam.yaw -= (e.clientX - touch.lookX) * k;
  cam.pitch = clamp(cam.pitch + (e.clientY - touch.lookY) * k, CFG.camera.minPitch, CFG.camera.maxPitch);
  touch.lookX = e.clientX; touch.lookY = e.clientY;
}

function resetTouch() {
  if (touch.stickId !== null) endStick();
  touch.lookId = null;
  input.touchLook = false;
  input.stick.active = false;
  for (const id of ['btn-touch-jump', 'btn-touch-ability']) $(id).classList.remove('down');
}
// Kort død i lavaen: fingrene, der rører skærmen, følges stadig (så joysticket virker igen efter genstart),
// men alle udslag nulstilles, indtil fingeren flyttes
function pauseTouchOutputs() {
  input.stick.x = 0; input.stick.y = 0;
}

canvas.addEventListener('pointerdown', (e) => {
  if (e.pointerType !== 'touch') return;
  touch.lastTouch = performance.now();
  setTouchMode(true);
  audio.init();
  if (game.state !== 'playing' && game.state !== 'dead') return;
  e.preventDefault();
  if (e.clientX < window.innerWidth * STICK_ZONE) {
    if (touch.stickId !== null) return;
    startStick(e);
  } else {
    if (touch.lookId !== null) return;
    touch.lookId = e.pointerId; touch.lookX = e.clientX; touch.lookY = e.clientY;
    input.touchLook = true;
  }
  try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ældre browsere */ }
});
window.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'touch') return;
  if (e.pointerId === touch.stickId) moveStick(e);
  else if (e.pointerId === touch.lookId && game.state === 'playing') lookMove(e);
});
function endTouchPointer(e) {
  if (e.pointerId === touch.stickId) endStick();
  if (e.pointerId === touch.lookId) { touch.lookId = null; input.touchLook = false; }
}
window.addEventListener('pointerup', endTouchPointer);
window.addEventListener('pointercancel', endTouchPointer);

// ---- Knapper, der kan holdes nede ----
function holdButton(id, down, up) {
  const el = $(id);
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.pointerType === 'touch') { touch.lastTouch = performance.now(); setTouchMode(true); }
    audio.init();
    el.classList.add('down');
    try { el.setPointerCapture(e.pointerId); } catch (err) { /* ældre browsere */ }
    down();
  });
  const release = () => {
    if (!el.classList.contains('down')) return;
    el.classList.remove('down');
    up();
  };
  el.addEventListener('pointerup', release);
  el.addEventListener('pointercancel', release);
  el.addEventListener('lostpointercapture', release);
  el.addEventListener('contextmenu', (e) => e.preventDefault());
}
holdButton('btn-touch-jump', () => {
  if (game.state !== 'playing') return;
  input.keys.Space = true;   // holdes nede = højere hop (som mellemrum)
  onKeyPress('Space');       // hop, dobbelthop, klatr op, spring fra stang, slip rebet
}, () => { input.keys.Space = false; });
holdButton('btn-touch-ability', () => {
  if (game.state === 'playing') pressAbility();
}, () => { input.leftHeld = false; });
holdButton('btn-touch-pause', () => {
  if (game.state === 'playing') pauseGame();
}, () => {});

// Tryk på et ikon i hotbaren for at vælge evnen
$('hotbar').addEventListener('pointerdown', (e) => {
  const slot = e.target.closest('[data-slot]');
  if (!slot || game.state !== 'playing') return;
  e.preventDefault();
  e.stopPropagation();
  selectAbility(slot.dataset.slot);
});

// Ingen zoom, rulning eller "gummibånd" midt i spillet (menuerne må stadig rulles)
document.addEventListener('touchmove', (e) => {
  if (!(e.target.closest && e.target.closest('.screen'))) e.preventDefault();
}, { passive: false });
document.addEventListener('gesturestart', (e) => { if (touch.active) e.preventDefault(); }); // ikke knib-zoom på Mac-trackpads

// Lodret telefon: foreslå at dreje den – men lad spilleren fortsætte alligevel.
// Drejes telefonen midt i en bane, sættes spillet på pause, så man ikke dør bag beskeden.
$('btn-rotate-ok').addEventListener('click', () => document.body.classList.add('rotate-ok'));
const portraitMq = window.matchMedia ? window.matchMedia('(orientation: portrait) and (max-width: 600px)') : null;
function onPortraitChange() {
  if (portraitMq && portraitMq.matches && touch.active && game.state === 'playing' && !document.body.classList.contains('rotate-ok')) pauseGame();
}
if (portraitMq) {
  if (portraitMq.addEventListener) portraitMq.addEventListener('change', onPortraitChange);
  else if (portraitMq.addListener) portraitMq.addListener(onPortraitChange); // ældre Safari
  window.addEventListener('resize', onPortraitChange);
}

// ---- Billedkvalitet på telefon og tablet ----
// Opløsningen sænkes, hvis billedraten falder under ca. 40, og hæves igen, når der er luft.
// En sænkning beholdes kun, hvis den hjalp: er billedraten låst (fx 30 i iOS' strømsparetilstand),
// gør færre pixels ingen forskel, og så går den tilbage og prøver ikke lavere igen på banen.
const quality = { pr: 1, max: 1.5, min: 0.75, floor: 0.75, trial: null, t: 0, n: 0 };
function resetQualityFloor() { quality.floor = quality.min; quality.trial = null; }
function updateQuality(dt) {
  if (!touch.active || game.state !== 'playing' || debug.freeze) { quality.t = 0; quality.n = 0; return; }
  quality.t += dt; quality.n++;
  if (quality.t < 2) return;
  const fps = quality.n / quality.t;
  quality.t = 0; quality.n = 0;
  const cap = Math.min(window.devicePixelRatio || 1, quality.max);
  let pr = quality.pr;
  if (quality.trial) {
    if (fps < quality.trial.fps * 1.1) { pr = quality.trial.pr; quality.floor = quality.trial.pr; } // hjalp ikke
    quality.trial = null;
  } else if (fps < 40 && pr > quality.floor) {
    quality.trial = { fps, pr };
    pr = Math.max(quality.floor, pr - 0.25);
  } else if (fps > 56) pr = Math.min(cap, pr + 0.125);
  if (pr !== quality.pr) {
    quality.pr = pr;
    renderer.setPixelRatio(pr);
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
}

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
    // På skateboardet følger kameraet automatisk brættet (medmindre man selv drejer med højreklik/fingeren)
    if (player.skate && !input.rightHeld && !input.touchLook && !k.KeyQ && !k.KeyE) {
      cam.yaw = angleDamp(cam.yaw, -player.skate.heading, 3.2, dt);
      cam.pitch = damp(cam.pitch, 0.24, 2, dt);
    }
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
  // Skjul figuren, hvis kameraet presses helt ind på den (så den ikke blokerer udsynet)
  player.model.inner.visible = cam.curDist > 1.6;
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
  owned: { chalk: false, rope: false, chalkbag: false, longrope: false, double: false, gloves: false },
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
  if (player.skate) return;
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
  player.grip = 1; // frisk kridt: grebet fyldes helt op – også midt i et hæng
  if (player.hang) player.hang.warned = false;
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
  // Automatisk lås på et krogpunkt, der ligger nogenlunde foran (så man ikke skal sigte stejlt op)
  const hl = Math.hypot(_aimDir.x, _aimDir.z) || 1;
  const fx = _aimDir.x / hl, fz = _aimDir.z / hl;
  let bestScore = Infinity;
  for (const a of level.anchors) {
    const dx = a.pos.x - _chest.x, dy = a.pos.y - _chest.y, dz = a.pos.z - _chest.z;
    const hd = Math.hypot(dx, dz) || 0.001;
    const dist = Math.hypot(hd, dy);
    if (dist > range || dist < 1.5) continue;
    const cosYaw = (dx * fx + dz * fz) / hd;
    const elev = Math.atan2(dy, hd);
    if (cosYaw < CFG.rope.lockCos || elev < -0.35 || elev > 1.4) continue;
    const score = (1 - cosYaw) * 12 + dist * 0.02;
    if (score < bestScore) { bestScore = score; best = a; }
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
  if (player.hang) releaseHang('jump');
  const b = player.body.position;
  const len = Math.hypot(b.x - t.point.x, b.y + 0.8 - t.point.y, b.z - t.point.z);
  let local = null;
  if (t.plat) { // ankerpunktet gemmes i platformens eget koordinatsystem (så det følger med, hvis den drejer)
    const q = t.plat.body.quaternion;
    local = new THREE.Vector3(t.point.x - t.plat.body.position.x, t.point.y - t.plat.body.position.y, t.point.z - t.plat.body.position.z)
      .applyQuaternion(_hq.set(q.x, q.y, q.z, q.w).invert());
  }
  abilities.rope = { anchor: t.anchor, plat: t.plat, point: t.point.clone(), vel: new THREE.Vector3(), length: len, local };
  abilities.ropeShoot = 0;
  player.jumping = false;
  player.airJumps = abilities.owned.double ? 1 : 0; // dobbelthoppet er klar igen efter et sving
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
    const pb = rope.plat.body, q = pb.quaternion;
    _v3a.copy(rope.local).applyQuaternion(_hq.set(q.x, q.y, q.z, q.w));
    rope.point.set(pb.position.x + _v3a.x, pb.position.y + _v3a.y, pb.position.z + _v3a.z);
    _hr.set(_v3a.x, _v3a.y, _v3a.z);
    pb.angularVelocity.cross(_hr, _hw);
    rope.vel.set(pb.velocity.x + _hw.x, pb.velocity.y + _hw.y, pb.velocity.z + _hw.z);
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
  // EVNE-knappen på touch-skærme viser den valgte evne (og er væk på skateboardet)
  const ab = $('btn-touch-ability');
  ab.classList.toggle('hidden', !!(level && level.def.skate));
  ab.classList.toggle('empty', abilities.selected === 'none');
  ab.innerHTML = `${ICONS[abilities.selected]}<span>EVNE</span>`;
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
  el.textContent = forTouch(msg);
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
    if (s === 'dead') pauseTouchOutputs(); else resetTouch();
    input.keys = Object.create(null);
  } else {
    applyStickKeys(); // en tommelfinger, der stadig holder joysticket efter døden, virker med det samme
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
    return `<div class="shop-item ${owned ? 'owned' : ''}"><div class="si-icon">${ICONS[it.icon]}</div><div class="si-kind">${it.kind}</div><h3>${it.name}</h3><p>${forTouch(it.desc)}</p>${btn}</div>`;
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

/* =====================================================================
   17. GEM / INDLÆS
   ===================================================================== */
const SAVE_KEY = 'skyhoj-parkour-v1';
function saveGame() {
  if (debug.quiet) return;
  storage.set(SAVE_KEY, JSON.stringify({
    v: 1, level: game.savedLevel, coins: game.coins, owned: abilities.owned, selected: abilities.selected,
    deaths: game.deaths, totalTime: Math.round(game.totalTime), sound: game.sound,
    highest: game.highest, best: game.best,
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
  abilities.owned = { chalk: false, rope: false, chalkbag: false, longrope: false, double: false, gloves: false, ...(s ? s.owned : {}) };
  game.highest = s ? clamp(s.highest | 0, 0, LEVELS.length - 1) : 0;
  game.best = (s && s.best) || {};
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
  highest: 0, best: {},
};
const FIRST_ROPE_LEVEL = () => LEVELS.findIndex((d) => d.needsRope);
let level = null;

function loadLevel(i) {
  releaseRope(false);
  abilities.target = null;
  if (level) level.dispose();
  game.levelIndex = i;
  level = new Level(i);
  applyTheme(level.theme);
  buildClouds(level.data.bounds);
  level.reset();
  respawnPlayer();
  cam.yaw = -level.data.startHeading;
  cam.pitch = 0.3;
  cam.curDist = CFG.camera.dist;
  renderHotbar(); // skjules på skateboardbanen
  resetQualityFloor();
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
    if (def.skate) toast(T.toastSkate, 'gold', 7000);
    else if (def.needsRope && !abilities.owned.rope) toast(T.toastNeedRope, 'bad', 7000);
    else if (def.needsDouble && !abilities.owned.double) toast(T.toastNeedDouble, 'bad', 7000);
    else if (i === FIRST_ROPE_LEVEL()) toast(T.toastRopeHint, 'gold', 7000);
    else if (def.chalkTip && !abilities.owned.chalk) toast(T.tipChalk, 'gold', 6000);
  }, 1400);
}

function restartLevel(manual) {
  releaseRope(false);
  level.setCheckpoint(null);
  level.reset();
  respawnPlayer();
  cam.yaw = -level.data.startHeading;
  game.levelTime = 0;
  game.levelCoins = 0;
  abilities.chalkActive = 0;
  if (manual) toast(T.toastRestart, '', 1400);
}

// Genstart fra det seneste kontrolpunkt (banens tid, mønter og bevægelser fortsætter)
function respawnAtCheckpoint() {
  releaseRope(false);
  for (const plat of level.platforms) if (plat.type === 'crumble' && plat.state !== 'solid') level.restoreCrumble(plat);
  const cp = level.checkpoint, c = cp.body.position, b = player.body;
  respawnPlayer();
  b.position.set(c.x, c.y + cp.def.h / 2 + CFG.player.radius + 0.05, c.z);
  b.previousPosition.copy(b.position);
  b.velocity.set(cp.body.velocity.x, Math.max(0, cp.body.velocity.y), cp.body.velocity.z);
  const next = level.platforms[cp.def.index + 1];
  const h = next ? next.def.heading : cp.def.heading;
  player.facing = -h;
  if (player.skate) player.skate.heading = h;
  cam.yaw = -h;
  cam.target.set(b.position.x, b.position.y + CFG.camera.height - CFG.player.radius, b.position.z);
  abilities.chalkActive = 0;
}

function die() {
  if (game.state !== 'playing') return;
  game.deaths++;
  game.deadTimer = 1.3;
  releaseRope(false);
  player.hang = null;
  if (player.skate) player.skate.grind = null;
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
  game.highest = Math.max(game.highest, Math.min(LEVELS.length - 1, game.levelIndex + 1));
  const prevBest = game.best[game.levelIndex];
  if (!prevBest || game.levelTime < prevBest) game.best[game.levelIndex] = Math.round(game.levelTime * 10) / 10;
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
  const nd = LEVELS[next];
  if (nd.skate) tip = T.tipSkate;
  else if (nd.needsRope && !abilities.owned.rope) tip = T.tipRope;
  else if (nd.needsDouble && !abilities.owned.double) tip = T.tipDouble;
  else if (nd.chalkTip && !abilities.owned.chalk) tip = T.tipChalk;
  else if (next === FIRST_ROPE_LEVEL()) tip = T.tipRopeOwned;
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
const debug = { freeze: false, freeCam: false, quiet: false, noLedge: false }; // kun til automatiske tests/skærmbilleder (?debug)
let lastT = performance.now(), acc = 0, elapsed = 0;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, Math.max(0, (now - lastT) / 1000));
  lastT = now;
  elapsed += dt;
  updateQuality(dt);
  const s = game.state;
  const simulate = simulateStates.has(s) || (s === 'shop' && (game.shopReturn === 'menu' || game.shopReturn === 'complete'));
  if (simulate && level && !debug.freeze) {
    acc += dt;
    let n = 0;
    while (acc >= CFG.fixedDt && n < CFG.maxSteps) { fixedStep(CFG.fixedDt); acc -= CFG.fixedDt; n++; }
    if (n >= CFG.maxSteps) acc = 0;
  }
  if (s === 'playing') { game.levelTime += dt; game.totalTime += dt; }
  if (s === 'dead') {
    game.deadTimer -= dt;
    if (game.deadTimer <= 0) { if (level.checkpoint) respawnAtCheckpoint(); else restartLevel(false); setState('playing'); }
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
  if (debug.freeCam) { /* kameraet styres udefra */ }
  else if (s === 'menu' || (s === 'shop' && game.shopReturn === 'menu')) updateMenuCamera(elapsed);
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
  const pv = player.body.velocity;
  audio.update(pb.y - CFG.lavaY, Math.hypot(pv.x, pv.y, pv.z),
    player.skate && player.grounded && s === 'playing' ? Math.hypot(pv.x, pv.z) : 0);

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
    $('btn-new').textContent = forTouch('Sikker? Klik igen – alt nulstilles');
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
click('btn-levels', () => { renderLevelSelect(); setState('levels'); });
click('btn-levels-back', () => { refreshMenu(); setState('menu'); });
$('level-grid').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-level]');
  if (!btn) return;
  audio.init();
  audio.play('click');
  startLevel(+btn.dataset.level);
});

// Udstilling af alle platformtyper i et verdens-sæt (bruges af udviklerværktøjer og tests)
function showcaseDef(kit, theme) {
  return {
    name: 'Udstilling', kit, theme, reward: 0,
    segs: [
      { t: 'start', w: 10, d: 10 },
      { g: 3, w: 6, d: 6 },
      { t: 'ice', g: 3, w: 4, d: 4 },
      { t: 'crumble', g: 3, w: 4, d: 4 },
      { t: 'move', g: 3, w: 4, d: 4, ax: 'x', amp: 0.001, per: 4 },
      { t: 'bounce', g: 3, w: 4, d: 4 },
      { t: 'spin', g: 3, w: 5, spd: 0.4 },
      { t: 'conveyor', g: 3, w: 4, d: 6, spd: 3 },
      { t: 'rot', g: 3, w: 6, spd: 0.25 },
      { t: 'vent', g: 3, w: 3, d: 3, lift: 6 },
      { t: 'swing', g: 3, w: 4, d: 3, len: 6, amp: 0.001 },
      { t: 'bar', at: 1, y: 2.6, len: 4 },
      { g: 6, w: 4, shape: 'cyl' },
      { t: 'zip', at: -1, y: 3.4, len: 14, drop: 0.8 },
      { g: 12, w: 6, d: 6 },
      { t: 'bar', at: 2, y: 2.4, len: 3, ang: 90, x: -1.5, sw: { len: 5, amp: 25, per: 3 } },
      { t: 'gust', at: 3, w: 6, d: 6, h: 10, y: -2, pow: 12 },
      { t: 'vent', g: 6, w: 3, d: 3, lift: 6, pulse: 3, duty: 0.5 },
      { t: 'anchor', at: 2, y: 6 },
      { g: 4, w: 6, d: 6, v: 'big' },
      { g: 3, w: 4, d: 4, grab: true, dy: 1 },
      { g: 3, w: 4, d: 4, slick: true },
      { t: 'bounce', g: 3, w: 4, d: 4, mv: { ax: 'y', amp: 0.001, per: 3 } },
      { t: 'bar', at: 1, y: 2.6, len: 3, mv: { ax: 'x', amp: 0.001, per: 4 } },
      { g: 5, w: 6, d: 6 },
      { t: 'ramp', g: 3, w: 4, len: 6, rise: 2 },
      { t: 'boost', g: 0, w: 4, d: 6 },
      { t: 'rail', g: 2, len: 8 },
      { t: 'finish', g: 3, w: 10, d: 10 },
    ],
  };
}

// ---- Opstart ----
function boot() {
  markSharedGpu();
  createPlayer();
  const save = loadSave();
  applySave(save);
  game.sound = save ? save.sound !== false : true;
  audio.enabled = game.sound;
  loadLevel(clamp(game.savedLevel, 0, LEVELS.length - 1));
  refreshMenu();
  // Telefon og tablet: touch-styring (joystick, HOP, EVNE og pause) i stedet for tastatur og mus
  if (prefersTouch()) setTouchMode(true);
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
      fixedStep, respawnPlayer, onKeyPress, updateCamera, camera, renderer, scene, world, debug, particles,
      emitChalk, enterPortal, restartLevel, tryGrab, releaseHang, hangFrame, WORLD_KITS, renderLevelSelect,
      touch, setTouchMode, forTouch, quality, T,
      get CHARACTER() { return CHARACTER; },
      setLevelDef(i, def) { LEVELS[i] = def; },
      showcaseDef,
      // Gem/gendan hele simulationens tilstand (testrobotten prøver handlinger af og spoler tilbage)
      snapshot() {
        const v3 = (v) => ({ x: v.x, y: v.y, z: v.z });
        const q4 = (q) => ({ x: q.x, y: q.y, z: q.z, w: q.w });
        const b = player.body, P = player, A = abilities;
        const keys = ['grounded', 'wasGrounded', 'groundPlat', 'coyote', 'jumpBuffer', 'jumpCooldown', 'jumping', 'knockCooldown',
          'facing', 'runPhase', 'squash', 'lastVy', 'stepTimer', 'grip', 'grabCooldown', 'airJumps', 'flipT'];
        const pl = {};
        for (const k of keys) pl[k] = P[k];
        return {
          game: { state: game.state, coins: game.coins, levelCoins: game.levelCoins, deaths: game.deaths, deadTimer: game.deadTimer, portalTimer: game.portalTimer, levelTime: game.levelTime },
          body: { p: v3(b.position), v: v3(b.velocity) },
          pl, gv: v3(P.groundVel), gn: v3(P.groundNormal),
          hang: P.hang ? { ...P.hang, climb: P.hang.climb ? { ...P.hang.climb } : null } : null,
          skate: P.skate ? { ...P.skate, grind: P.skate.grind ? { ...P.skate.grind } : null } : null,
          abil: { chalkActive: A.chalkActive, chalkCooldown: A.chalkCooldown, selected: A.selected, ropeShoot: A.ropeShoot, target: A.target,
            rope: A.rope ? { ...A.rope, point: A.rope.point.clone(), vel: A.rope.vel.clone(), local: A.rope.local ? A.rope.local.clone() : null } : null },
          time: level.time, wtime: world.time,
          plats: level.platforms.map((p) => ({ p: v3(p.body.position), v: v3(p.body.velocity), q: q4(p.body.quaternion), w: v3(p.body.angularVelocity),
            inWorld: !!p.body.world, state: p.state, timer: p.timer, fallVel: p.fallVel, squash: p.squash,
            mp: v3(p.mesh.position), mq: q4(p.mesh.quaternion), mvis: p.mesh.visible,
            bar: p.bar ? { q: q4(p.bar.body.quaternion), w: v3(p.bar.body.angularVelocity) } : null })),
          bars: level.bars.map((r) => ({ a: v3(r.a), v: v3(r.vel) })),
          anchors: level.anchors.map((a) => ({ p: v3(a.pos), v: v3(a.vel) })),
          coins: level.coins.map((c) => c.collected),
          cp: level.checkpoint ? level.platforms.indexOf(level.checkpoint) : -1,
        };
      },
      restore(s) {
        const b = player.body, P = player, A = abilities;
        Object.assign(game, s.game);
        b.position.set(s.body.p.x, s.body.p.y, s.body.p.z);
        b.previousPosition.copy(b.position);
        b.velocity.set(s.body.v.x, s.body.v.y, s.body.v.z);
        Object.assign(P, s.pl);
        P.groundVel.set(s.gv.x, s.gv.y, s.gv.z);
        P.groundNormal.set(s.gn.x, s.gn.y, s.gn.z);
        P.hang = s.hang ? { ...s.hang, climb: s.hang.climb ? { ...s.hang.climb } : null } : null;
        P.skate = s.skate ? { ...s.skate, grind: s.skate.grind ? { ...s.skate.grind } : null } : null;
        const r = s.abil.rope;
        Object.assign(A, s.abil, { rope: r ? { ...r, point: r.point.clone(), vel: r.vel.clone(), local: r.local ? r.local.clone() : null } : null });
        level.time = s.time; world.time = s.wtime;
        level.platforms.forEach((p, i) => {
          const o = s.plats[i];
          p.body.position.set(o.p.x, o.p.y, o.p.z); p.body.previousPosition.copy(p.body.position);
          p.body.velocity.set(o.v.x, o.v.y, o.v.z);
          p.body.quaternion.set(o.q.x, o.q.y, o.q.z, o.q.w);
          p.body.angularVelocity.set(o.w.x, o.w.y, o.w.z);
          if (o.inWorld && !p.body.world) world.addBody(p.body);
          if (!o.inWorld && p.body.world) world.removeBody(p.body);
          Object.assign(p, { state: o.state, timer: o.timer, fallVel: o.fallVel, squash: o.squash });
          p.mesh.position.set(o.mp.x, o.mp.y, o.mp.z); p.mesh.quaternion.set(o.mq.x, o.mq.y, o.mq.z, o.mq.w); p.mesh.visible = o.mvis;
          if (o.bar) { p.bar.body.quaternion.set(o.bar.q.x, o.bar.q.y, o.bar.q.z, o.bar.q.w); p.bar.body.angularVelocity.set(o.bar.w.x, o.bar.w.y, o.bar.w.z); }
        });
        level.bars.forEach((r, i) => { r.a.set(s.bars[i].a.x, s.bars[i].a.y, s.bars[i].a.z); r.vel.set(s.bars[i].v.x, s.bars[i].v.y, s.bars[i].v.z); });
        level.anchors.forEach((a, i) => { a.pos.set(s.anchors[i].p.x, s.anchors[i].p.y, s.anchors[i].p.z); a.vel.set(s.anchors[i].v.x, s.anchors[i].v.y, s.anchors[i].v.z); });
        level.coins.forEach((c, i) => { c.collected = s.coins[i]; });
        level.setCheckpoint(s.cp >= 0 ? level.platforms[s.cp] : null);
        if (game.state === 'playing') { $('screen-complete').classList.add('hidden'); }
      },
      // Start en vilkårlig banedefinition (uden at ændre LEVELS permanent)
      playDef(def, slot = 0) {
        const keep = LEVELS[slot];
        LEVELS[slot] = def;
        startLevel(slot);
        LEVELS[slot] = keep;
        document.getElementById('level-banner').classList.add('hidden');
        return level.data;
      },
      setCharacter(impl) { replaceCharacter(impl); },
      // Vis alle platformtyper i et sæt og stil kameraet, så de kan fotograferes
      showcase(kit, theme = 'day') {
        const def = showcaseDef(kit, theme);
        const keep = LEVELS[0];
        LEVELS[0] = def;
        startLevel(0);
        LEVELS[0] = keep;
        document.getElementById('level-banner').classList.add('hidden');
        return level.data.plats.map((p) => ({ type: p.type, x: p.x, z: p.z, top: p.top }));
      },
      camTo(x, y, z, tx, ty, tz) {
        debug.freeCam = true;
        camera.position.set(x, y, z);
        camera.lookAt(tx, ty, tz);
        camera.updateMatrixWorld();
      },
      // Stil flere figurer op i forskellige stillinger (til skærmbilleder af animationerne)
      lineup(states, spacing = 1.6) {
        if (window.__lineup) for (const r of window.__lineup) scene.remove(r.root);
        const sp = level.spawn;
        window.__lineup = states.map((st, i) => {
          const rig = CHARACTER.build();
          rig.inner.rotation.order = 'YXZ';
          rig.root.position.set(sp.x + (i - (states.length - 1) / 2) * spacing, sp.y + (st.yOffset || 0), sp.z);
          rig.inner.rotation.y = st.facing ?? 0;
          scene.add(rig.root);
          const hanging = st.mode === 'hang' || st.mode === 'climb';
          const full = { mode: 'idle', speed: 0, vy: 0, grounded: true, runPhase: 0, time: 0, squash: 0, flipT: -1, chalk: 0,
            hangKind: null, shimmy: 0, climbT: 0, push: false, lean: 0, crouch: 0,
            grip: 1, turnRate: 0, surface: null, aimLocal: { x: 0, y: -0.2, z: -1 },
            gripLocal: hanging ? { x: 0, y: CFG.hang.drop, z: st.hangKind === 'bar' ? 0 : -CFG.hang.wallGap } : null,
            gripTangent: hanging ? { x: 1, y: 0, z: 0 } : null,
            ropeDir: st.mode === 'rope' ? { x: 0, y: 0.94, z: -0.34 } : null,
            gear: { gloves: false, chalk: true, rope: true, helmet: st.mode === 'skate' || st.mode === 'grind' }, ...st };
          for (let k = 0; k < 40; k++) CHARACTER.animate(rig, full, 1 / 30);
          return rig;
        });
        player.model.root.visible = false;
        return window.__lineup.length;
      },
    };
  }
}

const _invQ = new THREE.Quaternion(), _eul = new THREE.Euler(), _cv = new THREE.Vector3();
const fontsReady = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
Promise.race([fontsReady, new Promise((r) => setTimeout(r, 1500))]).then(boot);
})();
