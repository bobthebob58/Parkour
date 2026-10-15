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

