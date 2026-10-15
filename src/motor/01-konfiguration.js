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

