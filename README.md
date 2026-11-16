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

## Eén Wedstrijd-scherm

Klaarzetten en spelen gebeuren op hetzelfde scherm, dat altijd in één beeld past (geen scrollen):
- **Voorbereiden:** bovenin het affiche; de knoppen *spelers*, *keeper* en *tegenstander* lichten op tot je ze hebt bevestigd. Daaronder de tijdlijn en het veld: sleep spelers voor de startopstelling, veeg door het plan. Onderin **Start · tik bij de aftrap**.
- **Live:** klok en stand bovenin, de balk met de volgende wissel, het veld en de bank. De menubalk verdwijnt; Seizoen en Team zitten dan in het ⋯-menu.
- **Afgelopen:** de uitslag, het overzicht en *Nieuwe wedstrijd klaarzetten*.

## Seizoen en programma

- **+ Wedstrijd:** tegenstander, thuis/uit, datum, aanvang, verzameltijd (standaard een half uur voor aanvang), veld en taken voor ouders (fluiten 0–2, fruit 0–1, bar/wedstrijdtafel 0–2). *Eerlijk verdelen* kiest wie het minst aan de beurt was.
- **Clubs:** bij het typen van de tegenstander stelt de app clubs voor (naam, afkorting zoals HMHC/SCHC/SpaBo, of plaats). Het schild krijgt de clubkleuren als die bekend zijn (`js/clubs.js`, met bron); anders kies je de kleuren zelf, de app onthoudt ze per club.
- **Keeper en afmeldingen per wedstrijd:** vooraf in te vullen (met keepbeurten dit seizoen); de klaargezette wedstrijd neemt ze over.
- **Bericht kopiëren:** wedstrijd en taken voor de teamapp of WhatsApp (vet met *sterretjes*).
- **Takenoverzicht:** alle komende wedstrijden met keeper en taken in één bericht voor WhatsApp.
- **Agenda-bestand (.ics):** alle wedstrijden of één wedstrijd, op de telefoon gemaakt, om in de agenda te zetten of te delen.
- Het Wedstrijd-scherm zet automatisch de eerstvolgende wedstrijd uit het programma klaar. Via het affiche zie je de wedstrijd die het dichtst bij ligt; tik erop voor een lijst met de andere wedstrijden.
- **Seizoenen:** elke wedstrijd hoort bij een seizoen (aug–jul). Bovenin Seizoen kies je een eerder seizoen als archief, met uitslagen, minuten, posities en doelpunten.

## Tijdens de wedstrijd

- **Klok:** tik op de klok om te starten of te pauzeren. Blauw = loopt, oranje en knipperend = staat stil. Rechts zie je welke helft/welk kwart en hoeveel tijd er nog is.
- **Wisselbalk:** SpaBo-blauw met een oranje voortgangspil. Vanaf 1 minuut voor de wissel knippert de pil, steeds sneller tot de wissel gedaan is; ben je te laat, dan staat er hoeveel (bijv. −1:33).
- **Meerdere spelers tegelijk:** stel bij Team → Wisselen in hoeveel kinderen per wisselmoment wisselen (1–5; in de zaal standaard de hele veldploeg). Het wisselvenster toont dan alle paren; per paar kun je spelers kiezen, een paar weghalen of er een toevoegen.
- **Doelpunt:** tik op de stand en kies het eigen logo (daarna wie scoorde) of het logo van de tegenstander.
- **Wisselen:** tik de wisselbalk of een speler. Bovenin staat wie eruit en wie erin gaat; Tik op de tegel *Eruit* of *Erin* voor een lijst van het veld of de bank, met minuten en hoe vaak iemand al gewisseld is. Label *plan* = volgende wissel uit het actuele plan; *advies* = beste partner als je zelf iemand anders kiest. In de blauwe balk: *1 min later*, *Bewaren* (je aangepaste wissel gebeurt op het geplande moment, daarna rekent de app verder) en *Wissel nu*. Slepen kan ook: veld ↔ bank = direct wisselen, veld ↔ veld = plekken ruilen.
- **Wedstrijdplan tijdens de wedstrijd:** de tijdlijn toont waar je nu bent, oude momenten worden grijs, de zwarte pil zegt hoe lang het nog duurt en bij de eerstvolgende wissel staat *Nu wisselen*.
- **Keeper wisselen:** tik op de keeper.
- **Stand van de opstelling** (verdedigen/balans/aanvallen): het label rechtsonder op het veld.
- **Tijd aanpassen, einde periode, afsluiten of weggooien:** het ⋯-menu.
- **Ongedaan maken:** de pijl bovenin, of "Ongedaan" in de melding.

## Hoe de app wisselt

- **Wissels per kind:** in te stellen bij Team → Wisselen (bijv. 1× per helft), of de app kiest zelf.
- **Dominante rol:** per speler in te stellen (achter pincode); vast of "mag afwijken".
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

De app maakt geen verbinding met andere diensten: geen koppelingen, geen analytics, geen lettertypes of scripts van buitenaf. Alleen de bestanden van de app zelf worden (één keer) geladen en daarna bewaard voor gebruik zonder bereik.


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
3. Seizoensoverzichten met grafieken per speler
