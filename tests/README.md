# Tests og skærmbilleder

Alle scripts køres via `run.js`. Det åbner `../index.html?debug` i headless Chromium med Playwright. Adresserne på jsDelivr (Three.js 0.160.0 og cannon-es 0.20.0) besvares med de lokale kopier i `node_modules`. Derfor kører testene offline og mod præcis de versioner, spillet bruger.

```bash
npm install
npx playwright install chromium   # hvis Playwright ikke allerede har en Chromium
```

| Kommando | Hvad den gør |
|---|---|
| `npm run baner` | Planlægningsrobotten spiller alle 15 baner fra start til portal med den rigtige fysik og tjekker kravene (se nedenfor). `LEVELS=3,7 npm run baner` begrænser til bestemte baner. Afslutter med fejlkode, hvis et krav ikke er opfyldt. |
| `npm run e2e` | 36 kontroller med rigtige mus- og tastaturhændelser (se nedenfor). |
| `npm test` | Begge ovenstående. |
| `npm run bot` | Robotten på én bane med en detaljeret rapport: `LEVEL=8 VERBOSE=1 npm run bot`. Se kommentaren øverst i `bot.js` for alle indstillinger. |
| `npm run billeder` | Startudsigt og perspektiv for alle 15 baner til `../docs/images`. |
| `npm run skaerme` | Portalen, døden i lavaen, bane fuldført, butik, pause, sejr og hovedmenuen til `../docs/images`. |
| `npm run verden` | Fotograferer et verdenssæt med alle dets platformtyper: `KIT_FILE=../src/verdener/candy.js KIT_ID=candy npm run verden`. |
| `npm run figur` | Fotograferer løberen i alle stillinger (løb, hop, hænder, skateboard, reb). Med `CHAR_FILE=../src/figur/figur.js` testes en ændret figur uden at bygge spillet først. |
| `npm run maal` | Måler med robotten, hvad fysikken tillader (hoplængder med og uden greb osv.). Resultatet ligger i `../docs/udvikling/MEASURED.md`. |

**`npm run baner`** tjekker for hver bane:

- Banen kan gennemføres med netop det udstyr, den kræver: reb fra bane 8 og dobbelthop fra bane 11.
- Uden det krævede udstyr er banen umulig.
- Uden kantgreb (`NOGRAB=ledge`) er bane 2–5 og 7–10 umulige, så de kræver hænderne.

**`npm run e2e`** dækker:

- menuer, WASD og hop (og at man *ikke* kan hoppe i luften uden dobbelthop)
- dobbelthop og kantgreb med klatring
- højreklik-kamera og scrollhjul
- kridt og reb
- butik, pause og død i lavaen
- kontrolpunkter og portalen
- skatebanen (start på skateboard, W sætter fart)
- gemning og "Fortsæt" efter genindlæsning

**Action-billeder fra banerne** tages af robotten. Den gemmer et øjebliksbillede af hele simulationen ved hvert trin på sin rute og kan derefter genafspille og fotografere dem:

```bash
SHOTS=/tmp/billeder SHOT_MATCH="greb|bar" SHOT_MAX=2 LEVEL=2 node run.js bot.js
```

Software-rendering giver kun få billeder i sekundet. Derfor venter scripts, der afhænger af tid, på *simuleret* tid i stedet for vægur-tid. Robotten kører fysikken direkte med faste tidsskridt.

Miljøvariabler:

- `CHROME_PATH`: egen Chromium
- `W`/`H`: vinduesstørrelse
- `OUT_DIR`: hvor billeder gemmes
- `LEVELS`: begræns baner
- `TIMEOUT_MS`: grænse for klik og andre handlinger (standard 120 s, fordi software-WebGL gør siden langsom)
