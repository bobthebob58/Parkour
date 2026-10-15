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
