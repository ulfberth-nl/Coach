# SpaBo Coach – wissel-app

Webapp voor de telefoon langs het hockeyveld: eerlijk en slim wisselen, speeltijd en posities bijhouden, en na afloop een overzicht. Gemaakt voor 't Spandersbosch JO9-Wit, maar per team in te stellen (6-tal, 8-tal, 11-tal, helften of kwarten).

Dit is **stap 1**: alles werkt op één telefoon en wordt alleen op die telefoon bewaard. De app werkt ook zonder bereik.

## Online zetten (GitHub Pages)

1. Ga naar de repository op GitHub → **Settings** → **Pages**.
2. Kies bij *Build and deployment* → *Source*: **Deploy from a branch**.
3. Kies de branch **main** en de map **/ (root)**, en klik op **Save**.
4. Na een minuut staat de app op `https://<jouw-account>.github.io/<repository>/`.

## Op je iPhone zetten

1. Open de link in **Safari**.
2. Tik op het deel-icoon → **Zet op beginscherm**.
3. Open de app voortaan via het icoon: dan draait hij schermvullend en werkt hij ook zonder bereik.

Tip: zet tijdens de wedstrijd het geluid aan. Bij een wisselmoment piept de app en knippert het scherm oranje (trillen kan niet vanuit een webapp op een iPhone). Het scherm blijft aan zolang de wedstrijd loopt.

## Hoe de app wisselt

- **Eén wissel per moment.** De app kiest zelf hoeveel momenten nodig zijn: het kleinste aantal waarbij iedereen even vaak gewisseld wordt, de speeltijd binnen de marge blijft en niemand te lang achter elkaar op de bank zit.
- **Wie erin:** wie het minst gespeeld heeft. **Wie eruit:** wie het minst vaak gewisseld is en het langst staat; bij gelijke keuze iemand met vergelijkbare speelkracht, zodat de linies in balans blijven.
- **Plek op het veld:** de nieuwe speler neemt de plek over. Als de balans (eerst speelkracht, dan voorkeurspositie) daar duidelijk beter van wordt, schuift één speler door.
- **Opstellingsstand:** Verdedigen, Balans of Aanvallen, automatisch op de stand (in te stellen per team). Het midden blijft altijd sterk.
- **Rust:** de volgende helft begint met een nieuwe opstelling (gratis moment om meerdere kinderen te wisselen).
- **Live bijsturen:** een andere wissel, "1 min later", een snelle wissel bij een blessure, een speler laten rusten of later laten aansluiten. Het plan rekent de rest van de wedstrijd opnieuw uit; een goal verschuift het volgende moment niet.

Alle regels staan onder **Team**: eerlijkheid aan/uit, marge, maximaal op de bank, minimale tijd tussen wissels, voorrang (eerlijkheid of beste bezetting) en het gedrag bij achterstand, gelijke stand en voorsprong.

## Spelers en beoordeling

Onder **Team → Spelers en beoordeling** (achter een pincode van 4 cijfers): naam, bijnaam (max. 8 tekens, die staat in het veld), speelkracht (schuifbalk zonder cijfers), voorkeursposities en sterke kanten. Buiten dit deel zie je nergens niveaus; de wisselberekening gebruikt ze alleen intern.

De pincode houdt meekijkers buiten, maar is geen echte beveiliging: de gegevens staan op de telefoon zelf.

## Gegevens en back-up

Alles staat in de browser van de telefoon. Maak af en toe een back-up via **Team → Back-up maken** (een JSON-bestand) en zet hem terug via **Back-up terugzetten**. In stap 2 komt opslag in een eigen database, zodat twee coaches tegelijk kunnen werken.

## Voor ontwikkelaars

Geen build-stap: gewone ES-modules, [Preact](https://preactjs.com) + [htm](https://github.com/developit/htm) in `vendor/`, lettertypes Nunito en Inter lokaal in `fonts/`.

```
index.html, manifest.webmanifest, sw.js   PWA-schil (offline)
css/app.css                               stijl (clubkleuren, pillen, neon)
js/planner.js                             wisselberekening (puur, zonder DOM)
js/match.js                               klok, gebeurtenissen, herplannen
js/store.js                               opslag op de telefoon
js/ui.js                                  gedeelde onderdelen (veld, pillen, sheets)
js/screens/*.js                           schermen
tests/*.test.mjs                          tests: node tests/planner.test.mjs && node tests/match.test.mjs
```

Lokaal proberen: `python3 -m http.server` in deze map en open `http://localhost:8000`.

Bij een nieuwe versie: verhoog `VERSION` in `sw.js`, dan halen telefoons de nieuwe bestanden op (de app meldt "Nieuwe versie klaar").

## Volgende stappen

1. ~~Wisselberekening + wedstrijdscherm op één telefoon~~ (deze versie)
2. Samen werken met de tweede coach (Firebase, gratis Spark-plan, inloggen met Google)
3. KNHB-programma automatisch ophalen
4. Seizoensoverzichten met grafieken per speler
