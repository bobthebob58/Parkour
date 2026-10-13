# Skyhøj Parkour

**Et 3D-parkourspil i skyerne – højt over et glødende hav af lava.**
Løb, hop og sving dig gennem 10 baner, tjen mønter ved hver portal, og køb kridt og reb i butikken.
Bygget med [Three.js](https://threejs.org) (grafik) og [cannon-es](https://pmndrs.github.io/cannon-es/) (fysik). Hele spillet – også brugerfladen – er på dansk.

![Svingtur i rebet på bane 8](docs/images/anim-reb-sving.gif)

---

## Indhold

- [Spil det](#spil-det)
- [Styring](#styring)
- [Evner, mønter og butik](#evner-mønter-og-butik)
- [De 10 baner](#de-10-baner)
- [Byggedagbog – billeder fra hele processen](#byggedagbog--billeder-fra-hele-processen)
- [Teknisk overblik](#teknisk-overblik)
- [Tests](#tests)

---

## Spil det

Spillet består af tre filer: **`index.html`**, **`style.css`** og **`game.js`**.

1. **Dobbeltklik på `index.html`** – det virker direkte fra disken (`file://`).
2. Eller kør en lokal webserver i mappen, f.eks. `npx serve .` eller `python3 -m http.server`, og åbn adressen.

Der skal være internetforbindelse, første gang siden åbnes: Three.js `0.160.0` og cannon-es `0.20.0` hentes fra jsDelivr-CDN'en via et *import map*. Spillet kræver en moderne browser med WebGL (Chrome, Edge, Firefox eller Safari 16.4+). Fremskridt, mønter og køb gemmes automatisk i browseren.

![Hovedmenuen](docs/images/skaerm-hovedmenu.jpg)

## Styring

| Tast / mus | Handling |
|---|---|
| **W A S D** | Bevæg dig (i forhold til kameraets retning) |
| **Mellemrum** | Hop – hold for højere hop, tryk kort for et lille hop. Man kan kun hoppe fra jorden |
| **Højreklik (hold)** | Drej kameraet / se dig omkring (musen låses, mens knappen holdes) |
| **Venstreklik** | Brug den valgte evne |
| **Scrollhjul** eller **1 / 2 / 3** | Skift evne |
| **B** | Butik |
| **P** / **Esc** | Pause |
| **R** | Genstart banen |
| **M** | Lyd til/fra |
| **H** | Skjul/vis hjælpelinjen |
| **Q / E** | Drej kameraet med tastaturet (alternativ til højreklik) |

**Rebet:** Venstreklik skyder rebet. *Hold* venstreklik for at hale dig ind, tryk på **W** for at give svinget fart, og tryk **mellemrum** for at hoppe af (med et ekstra løft) – eller klik igen for blot at give slip.

## Evner, mønter og butik

Man tjener **mønter** ved at nå portalen for enden af hver bane (25 → 160 mønter, stigende med banen) og ved at samle **bonusmønter** undervejs (5 stk. hver – de udbetales først ved portalen, og de nulstilles, hvis du dør).

| Vare | Pris | Effekt |
|---|---|---|
| **Kridt** (evne) | 60 | Venstreklik: 5 sekunder med op til 4× greb (perfekt på is) og 30 % højere hop. Genoplades på 10 s |
| **Reb / entrehage** (evne) | 150 | Skyd rebet mod et lysende krogpunkt eller en platform og sving dig over kløfter. Nødvendigt fra bane 8 |
| **Kridtpose** (opgradering) | 100 | Kridtet genoplades dobbelt så hurtigt |
| **Langt reb** (opgradering) | 160 | Rebets rækkevidde øges fra 32 m til 45 m |

Butikken åbnes mellem banerne, fra pausemenuen, fra hovedmenuen eller med **B** midt i en bane.

| Bane fuldført | Butikken |
|---|---|
| ![Bane fuldført](docs/images/skaerm-bane-fuldfoert.jpg) | ![Butik](docs/images/skaerm-butik.jpg) |

## De 10 baner

Rører du lavaen i bunden af verden (y = −50), dør du med det samme, og banen starter forfra. Banerne bliver gradvist længere, platformene mindre og hullerne større.

| # | Navn | Stemning | Nyt / særligt | Platforme | Længde | Belønning |
|---|---|---|---|---|---|---|
| 1 | Første skridt | Morgen | Store platforme, lette hop | 18 | ~200 m | 25 |
| 2 | Himmeltrappen | Dag | Trapper op og ned, runde søjler | 24 | ~220 m | 40 |
| 3 | Springfjedre | Dag | **Springpuder** – op til 6 m op og 9 m frem | 25 | ~225 m | 55 |
| 4 | Glatis | Frost | **Glatis** – kridt anbefales | 26 | ~230 m | 70 |
| 5 | I bevægelse | Eftermiddag | **Bevægelige platforme** (side, frem/tilbage, elevator), mindre landingszoner | 27 | ~205 m | 85 |
| 6 | Smuldrende sten | Gylden time | **Smuldrende sten** – bliv ikke stående | 29 | ~220 m | 100 |
| 7 | Vindmøllerne | Solnedgang | **Vindmøller** med roterende arme, smalle bjælker | 26 | ~230 m | 115 |
| 8 | Rebets prøve | Skumring | **Rebet er påkrævet**: fire kløfter på 14–22 m | 23 | ~235 m | 130 |
| 9 | Stormens øje | Storm | Alt kombineret, **bevægelige krogpunkter** | 31 | ~290 m | 145 |
| 10 | Himlens ende | Nat | Platforme ned til 1,2 m, hop på 6–6,5 m, fem rebkløfter op til **40 m** med op til tre krogpunkter | 45 | ~475 m | 160 |

Hver bane ender med en **glødende, roterende portal**. Rører du den, udbetales mønterne, og du teleporteres til næste bane.

| Bane 1 | Bane 2 |
|---|---|
| ![Bane 1](docs/images/bane-01-start.jpg) | ![Bane 2](docs/images/bane-02-oversigt.jpg) |
| **Bane 3** | **Bane 4** |
| ![Bane 3](docs/images/bane-03-oversigt.jpg) | ![Bane 4](docs/images/bane-04-start.jpg) |
| **Bane 5** | **Bane 6** |
| ![Bane 5](docs/images/bane-05-start.jpg) | ![Bane 6](docs/images/bane-06-start.jpg) |
| **Bane 7** | **Bane 8** |
| ![Bane 7](docs/images/bane-07-oversigt.jpg) | ![Bane 8](docs/images/bane-08-oversigt.jpg) |
| **Bane 9** | **Bane 10** |
| ![Bane 9](docs/images/bane-09-start.jpg) | ![Bane 10](docs/images/bane-10-start.jpg) |

Alle 20 baneskærmbilleder (startudsigt + perspektiv fra ca. en tredjedel inde på banen) ligger i [`docs/images`](docs/images).

---

## Byggedagbog – billeder fra hele processen

Spillet er bygget i milepæle. Hvert trin blev dokumenteret med skærmbilleder taget automatisk i en headless browser.

### Trin 1 – Himlen, lavaen og lyset

Først miljøet: en gradient-himmel (shader) med sol eller måne, procedurelle skyer, en animeret lava-shader med mørk skorpe, glødende revner og flydende pøle, gløder der stiger op, og retningsbestemt sollys med bløde skygger. Alle teksturer (stenfliser, klippe, is, sandsten, metal med advarselsstriber) tegnes på `<canvas>` ved opstart – der er ingen eksterne billedfiler.

| Morgen | Solnedgang | Nat |
|---|---|---|
| ![Miljø om morgenen](docs/images/01-miljoe-morgen.jpg) | ![Miljø ved solnedgang](docs/images/01-miljoe-solnedgang.jpg) | ![Miljø om natten](docs/images/01-miljoe-nat.jpg) |

*Første forsøg gav en overeksponeret, næsten hvid lava og en hård kant i horisonten; lava-shaderen blev skrevet om, så skorpen er mørk og kun revner og pøle gløder.*

### Trin 2 – Spilleren, kameraet og brugerfladen

Parkourløberen er bygget af simple former og animeret i kode (løb, hop, svæv, landing med "squash", armene op i rebet). Kollisionen er to kugler i cannon-es med låst rotation. Tredjepersonskameraet drejes med højreklik og trækkes ind, hvis en platform kommer i vejen. HUD'en viser bane, mønter, tid, dødsfald, valgt evne og en hotbar.

| Før: sigtekornet sad på hovedet | Efter: kameraet sigter over hovedet |
|---|---|
| ![Før](docs/images/foer-start.jpg) | ![Efter](docs/images/bane-01-start.jpg) |

### Trin 3 – Banebyggeren og de 10 baner

Banerne er hårdkodet som lister af segmenter (`{ t: 'move', g: 4.5, w: 3, ax: 'x', amp: 3, per: 4 }` = "bevægelig platform, 4,5 m hul, 3 m bred, svinger 3 m sidelæns hvert 4. sekund"). Byggeren placerer hver platform ud fra den forriges kant, så hullerne er præcise, og pynter de svævende platforme med takkede klippestykker. Hver bane har sin egen himmel og stenfarve.

| Bane 2 – Himmeltrappen | Bane 7 – Vindmøllerne |
|---|---|
| ![Bane 2 perspektiv](docs/images/bane-02-oversigt.jpg) | ![Bane 7 perspektiv](docs/images/bane-07-oversigt.jpg) |

### Trin 4 – Banemekanikker

| Bevægelige platforme (bane 5) | Smuldrende sten (bane 6) |
|---|---|
| ![Bevægelige platforme](docs/images/bevaegelige-platforme.jpg) | ![Smuldrende sten](docs/images/smuldrende-sten.jpg) |
| **Vindmøller (bane 7)** | **Springpude (bane 3)** |
| ![Vindmølle](docs/images/vindmoelle.jpg) | ![Springpude](docs/images/springpude.jpg) |

Bevægelige platforme er kinematiske legemer, og spilleren arver deres fart (også ved hop). Smuldrende sten ryster i 0,55 s og falder, og kommer tilbage efter få sekunder. Vindmøllernes arme slår spilleren væk. Springpuder sender en op i 17–19 m/s.

![Springpude-sekvens på bane 3](docs/images/anim-springpude.gif)

### Trin 5 – Evnerne: kridt og reb

| Kridt på glatis (bane 4) | Rebet låser på et krogpunkt (bane 8) |
|---|---|
| ![Kridt](docs/images/kridt-paa-is.jpg) | ![Sigte med rebet](docs/images/reb-sigte.jpg) |

Kridtet gør hænderne hvide og drysser støv; HUD'en tæller ned. Rebet er en uelastisk afstandsbegrænsning, så man svinger som et ægte pendul.

![Midt i et sving](docs/images/reb-sving.jpg)

### Trin 6 – Test og balancering

For at sikre, at alle 10 baner faktisk kan gennemføres, blev der skrevet tre automatiske tests (se [Tests](#tests)):

1. **Banevalidering:** For hvert par af platforme beregnes det mindste hul (kant til kant, over hele bevægelsescyklussen) og sammenlignes med den maksimale hoplængde ved den givne højdeforskel. Sværhedsgraden stiger jævnt fra højst 47 % af den maksimale hoplængde på bane 1 til 87 % på bane 10.
2. **Fysik-bot:** En bot spiller *hver eneste overgang* på alle baner med den rigtige fysik – løber, hopper, venter på bevægelige platforme, svinger i rebet og slipper, når en forudsigelse af faldbanen rammer målet.
3. **End-to-end:** Rigtige mus- og tastaturhændelser i browseren: menuer, WASD, hop, højreklik-kamera, scrollhjul, evner, butik, pause, død i lavaen, portal, gemning og "Fortsæt" efter genindlæsning.

Slutresultat:

```
Bane 1: 17/17 overgange klaret        Bane 6: 28/28 overgange klaret
Bane 2: 23/23 overgange klaret        Bane 7: 25/25 overgange klaret
Bane 3: 24/24 overgange klaret        Bane 8: 22/22 overgange klaret
Bane 4: 25/25 overgange klaret        Bane 9: 30/30 overgange klaret
Bane 5: 26/26 overgange klaret        Bane 10: 44/44 overgange klaret
End-to-end: 29/29 kontroller OK – ingen JavaScript-fejl
```

Testene fandt reelle problemer, som blev rettet undervejs:

- **Rebet** halede sig automatisk ind, så lange enkeltsving gik i stå under krogpunktet. Nu holder rebet sin længde (ægte pendul), og man haler sig ind ved at holde venstreklik.
- **Luftkontrol:** Sidelæns fart arvet fra en bevægelig platform kunne ikke styres væk i luften. Nu kan sidelæns drift korrigeres, mens farten fremad bevares.
- **Bane 3:** En springpude krævede et 90°-sving i luften for at nå en platform 4,5 m oppe – svinget blev flyttet.
- **Vindmøller på bane 7 og 10:** Hurtige krydsarme gav et sikkert vindue, der var kortere end tiden det tager at krydse platformen – farten blev sat ned.
- **Bane 10:** Den sidste kløft (44 m, tre krogpunkter) var for lang – den er nu 40 m med tættere krogpunkter.
- **Sigte med rebet:** Krogpunkter højt oppe tvang kameraet ned bag figuren. Nu låser rebet automatisk på et krogpunkt foran dig, og figuren skjules, hvis kameraet presses helt ind på den.
- **Portalen** var overeksponeret (helt hvid) og blev tonet ned, så hvirvlen kan ses.

| Før: sigte mod et højt krogpunkt | Efter: automatisk lås |
|---|---|
| ![Før](docs/images/foer-sigte.jpg) | ![Efter](docs/images/reb-sigte.jpg) |
| **Før: portalen** | **Efter: portalen** |
| ![Før](docs/images/foer-portal.jpg) | ![Efter](docs/images/portal.jpg) |

### Trin 7 – Død, pause og sejr

| Død i lavaen | Pause | Alle baner gennemført |
|---|---|---|
| ![Død i lavaen](docs/images/lava-doed.jpg) | ![Pause](docs/images/skaerm-pause.jpg) | ![Sejr](docs/images/skaerm-sejr.jpg) |

---

## Teknisk overblik

```
index.html   Import map (Three.js + cannon-es fra CDN), HUD og alle menuskærme
style.css    HUD, hotbar, menuer, butik, overgange (glas-look, responsivt)
game.js      Hele spillet (ca. 3.200 linjer), opdelt i 18 afsnit:
               1  Konfiguration       10  Baneobjekter (bevægelige, smuldrende, vindmøller, portal …)
               2  Danske tekster      11  Spilleren (krop, figur, animation, bevægelse)
               3  Himmel-temaer       12  Input (tastatur og mus)
               4  De 10 baner         13  Kamera
               5  Hjælpefunktioner    14  Evner (kridt og reb)
               6  Teksturer           15  Lyd (procedurel WebAudio)
               7  Himmel, lava, lys   16  Brugerflade
               8  Fysikverden         17  Gem / indlæs
               9  Banebygger          18  Spiltilstand og hovedløkke
docs/images  Skærmbilleder og animationer brugt i denne README
tests/       Banevalidering, fysik-bot, end-to-end-test og skærmbillede-scripts
```

- **Fysik:** fast tidsskridt på 1/120 s, tyngdekraft 24 m/s², løbefart 9 m/s, hop 10,5 m/s (≈ 2,3 m højt, op til ≈ 7,9 m langt). Friktionen i cannon-es er 0 – grebet styres i stedet af bevægelseskoden, så is og kridt kan justere det præcist.
- **Stramme kontroller:** "coyote time" (man kan hoppe 0,11 s efter at have forladt en kant), hop-buffer (0,14 s), variabel hophøjde og en rund skygge lige under spilleren, der viser, hvor man lander.
- **Lyd:** alle lydeffekter (hop, landing, mønter, reb, springpude, lava, portal) og vind/lava-rumlen syntetiseres med WebAudio – ingen lydfiler.
- **Virker fra disken:** `index.html` indlæser bibliotekerne som ES-moduler og starter derefter `game.js` som et klassisk script, fordi browsere blokerer lokale modulfiler under `file://`.
- **Udvikler-hooks:** Med `?debug` i adressen får testene adgang til `window.skyhoj`.

## Tests

Testene kører spillet i headless Chromium (WebGL via software-rendering) og besvarer CDN-adresserne med lokale kopier af præcis de samme biblioteksversioner, så de også kører offline.

```bash
cd tests
npm install
npm run valider     # beregner alle huller mod hoplængden
npm run bot         # fysik-botten spiller alle 264 overgange
npm run e2e         # rigtige mus-/tastaturhændelser end-to-end
npm run billeder    # genskaber skærmbillederne i docs/images
```

Se [`tests/README.md`](tests/README.md) for detaljer.
