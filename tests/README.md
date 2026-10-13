# Tests og skærmbilleder

Alle scripts køres via `run.js`, som åbner `../index.html?debug` i headless Chromium med Playwright. Adresserne på jsDelivr (Three.js 0.160.0 og cannon-es 0.20.0) besvares med de lokale kopier i `node_modules`, så testene kører offline og mod præcis de versioner, spillet bruger.

```bash
npm install
npx playwright install chromium   # hvis Playwright ikke allerede har en Chromium
```

| Kommando | Hvad den gør |
|---|---|
| `npm run valider` | Bygger alle 10 baner som data og sammenligner hvert hul (kant til kant, over hele bevægelsescyklussen) med den maksimale hoplængde ved den aktuelle højdeforskel. Tjekker også rækkevidden til krogpunkterne og at platforme ikke overlapper. |
| `npm run bot` | Fysik-botten placeres på platform *i* og skal nå platform *i + 1* med den rigtige fysik – for hver overgang på alle baner. Den venter på bevægelige platforme, tager springpuder og vindmøller i fart, og svinger i rebet. `LEVELS=8,10 npm run bot` begrænser til bestemte baner. |
| `npm run e2e` | Rigtige mus- og tastaturhændelser: menuer, WASD, hop (og at man *ikke* kan hoppe i luften), højreklik-kamera, scrollhjul, kridt og reb, butik, pause, død i lavaen, portal, gemning og "Fortsæt" efter genindlæsning. |
| `npm test` | Alle tre ovenstående. Afslutter med fejlkode, hvis noget fejler. |
| `npm run billeder` | Genskaber skærmbillederne i `../docs/images` (startudsigt og perspektiv for alle baner samt iscenesatte action-billeder). |
| `npm run gif:reb` / `npm run gif:springpude` | Renderer animationerne billede for billede (fysikken fryses mellem hvert billede) og samler dem til GIF med Python/Pillow. |

Software-rendering giver kun få billeder i sekundet, så scripts, der afhænger af tid, venter på *simuleret* tid (`level.time`) i stedet for vægur-tid.

Miljøvariabler: `CHROME_PATH` (egen Chromium), `W`/`H` (vinduesstørrelse), `OUT_DIR` (hvor billeder gemmes), `LEVELS` (begræns baner).
