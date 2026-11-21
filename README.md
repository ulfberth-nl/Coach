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

Tip: zet tijdens de wedstrijd het geluid aan. Bij een wisselmoment piept de app en knippert het scherm oranje (een trilsignaal kan niet vanuit een webapp op een iPhone; Android trilt wel). Het scherm blijft aan zolang de wedstrijd loopt.

## Beweging en tikje

- **Eén bewegingstaal:** vaste tempo's (tik 0,1 s, klein 0,25 s, scherm 0,45 s), weggaan gaat sneller dan binnenkomen, twee veren (zacht en speels).
- **Indrukken:** elke knop en kaart wordt iets kleiner en donkerder als je hem aanraakt en veert terug bij loslaten. Begin je te scrollen, dan licht er niets op.
- **Tikje bij tikken:** op een iPhone en op Android voel je een tikje bij knoppen, schakelaars en keuzes. Uit te zetten bij Team → Deze telefoon. Op de iPhone werkt dat zo: over elke knop ligt een onzichtbare iOS-schakelaar; jouw vinger zet hem om en iOS geeft het tikje (sinds iOS 26.5 mag een webpagina dat niet meer zelf doen). Daardoor voel je het bij tikken, niet bij vasthouden of slepen. Zet *Systeemhaptiek* aan bij Instellingen → Geluiden en voelbare feedback.
- **Schakelaar:** het bolletje rekt uit als je drukt en schiet verend naar de andere kant.
- **− en +:** het getal rolt mee; vasthouden telt steeds sneller door; aan de grens schudt het getal 'nee'.
- **Keuzebalk:** het blokje vloeit naar je keuze; je kunt er ook overheen vegen.
- **Open- en dichtklappen:** instellingen die erbij komen (marge, maximaal op de bank, dominante rol, stand-opties) klappen soepel open en sneller weer dicht.
- **Klikgeluid bij schuiven:** scrol je door de wissels in de tijdlijn, veeg je over een keuzebalk of sleep je de speelkracht-schuif, dan hoor je op de iPhone bij elk punt een zacht klikje (een tikje kan daar niet); Android trilt kort. Uit te zetten bij Team → Deze telefoon. Staat je iPhone op stil, dan hoor je het mogelijk niet.
- **Altijd soepel:** een instelling verandert meteen op het scherm. Het rekenwerk (wedstrijdplan, wisselprofielen) doet de app in een aparte rekendraad zodra je even niets aanpast; tot die tijd blijven de vorige getallen staan.
- **Schermovergangen** (iPhone met iOS 18 of nieuwer): tussen de tabbladen schuift het scherm in de richting van het tabblad; dieper gaan (Plan, Overzicht, Spelers) schuift erin zoals op een iPhone, terug schuift het weer weg. Bij de aftrap gaat het veld vloeiend over in het live-scherm en valt het scorebord erin; een uitslag groeit uit tot het overzicht van de wedstrijd. Oudere iPhones tonen het nieuwe scherm direct.
- **Vensters:** het scherm erachter wijkt een stukje naar achteren, de inhoud komt rij voor rij binnen, en je sluit een venster door het omlaag te trekken (bovenaan of aan het handvat); trek je niet ver genoeg, dan veert het terug. Meldingen veeg je opzij of omlaag weg (niet tijdens de wedstrijd: daar tik je erdoorheen).
- **Minder beweging:** staat *Beperk beweging* aan op je telefoon, of zet je *Minder beweging* aan bij Team → Deze telefoon, dan is alles rustig: geen veren, wiebels en zwevers.

## Eén Wedstrijd-scherm

Klaarzetten en spelen gebeuren op hetzelfde scherm, dat altijd in één beeld past (geen scrollen):
- **Voorbereiden:** bovenin het affiche; de knoppen *spelers*, *keeper* en *tegenstander* lichten op tot je ze hebt bevestigd. Daaronder de tijdlijn en het veld: sleep spelers voor de startopstelling (of naar een lege plek voor een andere opstelling), veeg door het plan. Onderin **Start · tik bij de aftrap**.
- **Volle bank:** wie van plek verandert op de bank glijdt naar zijn nieuwe plek. Past de bank niet op het scherm, dan veeg je hem opzij; zachte randen laten zien dat er nog spelers achter zitten en de bank klikt per speler vast. Omhoog slepen pakt een speler. Wie er straks in moet, schuift vanzelf in beeld; sleep je een speler naar de rand van de bank, dan scrollt die mee.
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
- **Programma en uitslagen:** in Seizoen staat het programma op datum (dichtstbij eerst) en daaronder de uitslagen; tik een uitslag open voor doelpunten, speeltijd en posities. Lange lijsten tonen eerst 4 met *Laat meer zien…*.
- **Seizoenen:** elke wedstrijd hoort bij een seizoen (aug–jul). Bovenin Seizoen kies je een eerder seizoen als archief, met uitslagen, minuten, posities en doelpunten.

## Tijdens de wedstrijd

- **Scorebord:** klok en stand staan naast elkaar, even groot; daaronder de helften/kwarten over de volle breedte. Cijfers rollen verend door. Groene ademende stip = klok loopt, oranje = pauze. Tik op de klok om te starten of te pauzeren; is de tijd om, dan sluit je met dezelfde tik de periode af en zet je daarna (tik opnieuw) de opstelling voor de volgende periode klaar.
- **Doelpunt:** tik op de stand. Het scorebord klapt om naar twee knoppen (*+1* voor ons of voor de tegenstander). Bij een goal van ons wordt het eiland oranje met *Wie scoorde?* en wordt het veld iets donkerder; en tik je de speler in het veld aan (of *Weet ik niet*); het veld blijft vrij. De stand kleurt groen als we voorstaan en amber bij een achterstand; de scorer krijgt een oranje pil met rimpels en een klein *+1*. Onderin staat een paar seconden *Goal Naam · Ongedaan* (scoorde de keeper zelf, dan bovenin).
- **Wissel-eiland:** onder het scorebord staat in tekst wat er komt (wie erin, wie eruit, wie doorschuift) en rechts een grote aftelring. Vanaf 1 minuut wordt het eiland donkerblauw en ademt de ring steeds sneller; ben je te laat, dan wordt de ring rood, wiebelt het eiland en staat er een witte pil met hoeveel (bijv. −0:44). Tik op het eiland om te wisselen.
- **Zwevers in het veld:** wie eruit gaat heeft een oranje draaiende ring; schuin erachter zweeft rustig wie erin komt, in groen (in de laatste minuut duidelijker, sneller en met een groene draaiende ring; op de bank heeft hij ook een groene ring). Een blauwe zwever met ↑/↓ laat zien wie doorschuift. Bij de wissel zakt wie eruit gaat weg richting de bank, glijdt een doorschuiver naar zijn nieuwe plek en stapt wie erin komt vanaf zijn zweefplek naar binnen (eerst groen, dan wit); daarna valt de speler die eruit ging op de bank.
- **Opstelling veranderen door te slepen:** pak een veldspeler op en het veld toont de linies (*voor*, *midden*, *achter*) met lege plekken (+) tussen en naast de spelers. Sleep bijvoorbeeld een aanvaller naar een lege plek op het middenveld: de buren schuiven opzij, erboven staat *Naar het midden · 2-2-1*, en bij loslaten landt hij precies op zijn nieuwe plek terwijl de rest vlot naar de nieuwe opstelling schuift. De opstelling geldt voor deze wedstrijd (de teaminstelling blijft gelijk) en het plan rekent meteen opnieuw. Elke linie houdt minstens één speler. Live staat onderin *Opstelling 2-2-1 · Ongedaan*; de pijl bovenin maakt het ook ongedaan. *Opstelling opnieuw laten voorstellen* in het ⋯-menu zet de teamopstelling terug.
- **Slepen = nu wisselen:** veld ↔ bank wisselt direct, veld ↔ veld ruilt plekken. De speler die je sleept zweeft boven je vinger, de dichtstbijzijnde speler wordt vanzelf het doel (je hoeft niet precies te mikken) en erboven staat wat er gebeurt, bijvoorbeeld *Speler 7 erin*. Laat je los zonder doel, dan vliegt hij terug. Over de keeper verschijnt dan een pil met *Kan terug / Rust / Klaar* (standaard *Kan terug*) en *Ongedaan maken*. Wie je terugsleept uit rust of klaar, is weer inzetbaar.
- **Meerdere spelers tegelijk:** stel bij Team → Wisselen in hoeveel kinderen per wisselmoment wisselen (1–5; in de zaal standaard de hele veldploeg). Het wisselvenster toont dan alle paren; per paar kun je spelers kiezen, een paar weghalen of er een toevoegen.
- **Wisselen:** tik een speler (het eiland opent de planner). Bovenin staat wie eruit en wie erin gaat; Tik op de tegel *Eruit* of *Erin* voor een lijst van het veld of de bank, met minuten en hoe vaak iemand al gewisseld is. Label *plan* = volgende wissel uit het actuele plan; *advies* = beste partner als je zelf iemand anders kiest. In de blauwe balk: *1 min later*, *Bewaren* (je aangepaste wissel gebeurt op het geplande moment, daarna rekent de app verder) en *Wissel nu*. Na *Wissel nu* verschijnt dezelfde pil over de keeper.
- **Planner** (tik op het wissel-eiland, of op de planregel bij het voorbereiden): het grote veld met *nu* op de voorgrond en het volgende moment erachter als zwevers (zelfde taal als live). Klok en stand staan klein rechtsboven.
  - **Het verhaal van de volgende wissel** staat boven het veld, in coachtaal: *Volgende wissel · 1 van 14 · over 3:03 — ↑ Speler 9 erin voor ↓ Speler 2 — ↔ Speler 1 naar het midden · Speler 9 op rechtsachter*. Plekken heten linksvoor, rechtsvoor, midvoor, linksachter, centraal achter, in het midden, enz. (links = links op het scherm). Hetzelfde staat in het wissel-eiland (*Speler 8 op rechtsvoor*).
  - **Slepen = het volgende moment plannen:** sleep een bankspeler op een veldspeler (of andersom) en het volgende wisselmoment krijgt precies die wissel, met een speldje. De rest van de wedstrijd rekent de app opnieuw uit; momenten tot en met het speldje blijven op hun tijd. *Losmaken* geeft het moment terug aan de app. Kan een vastgezet moment niet meer (iemand rust of staat al in het veld), dan meldt de planner dat in plaats van het stil te wissen.
  - **Vegen door de momenten:** veeg over het veld, sleep het oranje bolletje of gebruik de pijlen; speldjes staan op de tijdlijn. *Terug naar nu* brengt je naar de werkelijkheid.
  - **Spieken:** houd je vinger stil op een leeg stuk veld en je ziet het volgende moment op ware grootte (de spelers glijden naar hun nieuwe plek, ook de bank). Loslaten = terug.
  - **Voor deze wedstrijd:** focus (verdedigen/balans/aanvallen, of de stand laten volgen) en eerlijkheid (*Strenger*, *Zoals ingesteld*, *Ruimer*). De teaminstelling blijft gelijk.
  - **Gevolgen** direct onder het veld: balans per linie op dit moment (zonder namen of cijfers), speeltijd per kind over de hele wedstrijd (met het verschil na je laatste aanpassing), hoe vaak naar de bank en de langste bankbeurt, en of het binnen de regels past.
  - **Wissel nu:** de vaste balk onderin toont het volgende moment met aftellen, *+1′* en *Wissel nu*; daarna sta je weer in het live-scherm, waar de wissel zichtbaar gebeurt (eruit, doorschuiven, erin) en de ongedaan-pil verschijnt. Bij de wissel piept de app ook in de planner.
- **Keeper wisselen:** tik op de keeper.
- **Focus van de opstelling** (aanvallen/balans/verdedigen): de schuif net binnen de linkerzijlijn (de pil staat precies op de stippen en volgt je vinger zonder haperen; tijdens het slepen van een speler stapt hij even opzij). Boven = aanvallen (rode pil), midden = balans (oker), onder = verdedigen (blauw), in de kleuren van de linies. Sleep de pil omhoog of omlaag (je ziet meteen wat elke stand doet), of tik erop voor de keuzes en *Auto op stand*. Na een wijziging zegt het eiland een paar seconden wat er gebeurt en reageren de spelers: aanvallers stuiteren, verdedigers zetten zich schrap, bij balans wiegt iedereen even. Verandert de focus automatisch door een doelpunt, dan gebeurt dat pas na het doelpunt-feestje. Een groen *A* = automatisch. Geldt vanaf de volgende wissel.
- **Dominante rol:** spelers met een dominante rol hebben een gekleurd randje links in hun pil (zelfde kleuren als bij de spelers: groen keeper, blauw achter, oker midden, rood voor), op het veld én op de bank; in de kieslijst van het wisselvenster staat een klein label.
- **Doelpunten per speler:** een oranje bolletje met het aantal goals vóór de speeltijd onder de pil (zo blijft de zwever vrij), bij de keeper rechtsboven en op de bank achter de naam.
- **Stand aanpassen:** in het ⋯-menu, met − en + voor tegengoals, per speler en voor *onbekend*; het totaal loopt mee.
- **Tijd aanpassen, einde periode, afsluiten of weggooien:** het ⋯-menu.
- **Ongedaan maken:** de pijl bovenin, of de pil over de keeper.

## Hoe de app wisselt

- **Wissels per kind:** in te stellen bij Team → Wisselen (bijv. 1× per helft), of de app kiest zelf.
- **Dominante rol:** per speler in te stellen (achter pincode); vast of "mag afwijken".
- **Eén wissel per moment.** De app kiest zelf hoeveel momenten nodig zijn: het kleinste aantal waarbij iedereen even vaak gewisseld wordt, de speeltijd binnen de marge blijft en niemand te lang achter elkaar op de bank zit.
- **Wie erin:** wie het minst gespeeld heeft. **Wie eruit:** wie het minst vaak gewisseld is en het langst staat; bij gelijke keuze iemand met vergelijkbare speelkracht, zodat de linies in balans blijven.
- **Plek op het veld:** de nieuwe speler neemt de plek over. Als de balans (eerst speelkracht, dan voorkeurspositie) daar duidelijk beter van wordt, schuift één speler door.
- **Opstellingsstand:** Verdedigen, Balans of Aanvallen, automatisch op de stand (in te stellen per team). Het midden blijft altijd sterk.
- **Rust:** de volgende helft begint met een nieuwe opstelling (gratis moment om meerdere kinderen te wisselen).
- **Live bijsturen:** een andere wissel, "1 min later", een snelle wissel bij een blessure, een speler laten rusten of later laten aansluiten. Het plan rekent de rest van de wedstrijd opnieuw uit; een goal verschuift het volgende moment niet.

### Wisselprofielen

Bij **Team → Wisselen** kies je één profiel in plaats van losse regels:

- **Iedereen even lang** (eerlijkst): gelijke speeltijd en korte bankbeurten gaan boven alles.
- **In balans** (aanbevolen): iedereen ongeveer even lang en even vaak naar de bank, met zo min mogelijk wissels.
- **Rustig wisselen** (minste wissels): meer ritme, maar langer achter elkaar op de bank.
- **Sterkste ploeg** (beste bezetting): iedereen gaat even vaak naar de bank, dragende spelers staan een paar minuten langer.

Per profiel rekent de app een paar varianten door met echte wedstrijdplannen voor jouw selectie en kiest de variant die het best past (bijvoorbeeld nooit elke paar minuten een wissel). Bij het gekozen profiel staat wat de app doet en wat de gevolgen zijn, met de getallen van jouw team: aantal wissels, speeltijd per kind, hoe vaak en hoe lang op de bank. Bij elke wedstrijd rekent de app het opnieuw uit met wie er is.

Wie zelf wil sleutelen, opent **Eigen instellingen**: spelers tegelijk, hoe vaak naar de bank, voorrang, marge, maximaal op de bank, minimale tijd tussen wissels. Pas je daar iets aan, dan heet je keuze *Eigen*. Daarnaast staan onder **Team** het gedrag bij achterstand, gelijke stand en voorsprong.

## Spelers en beoordeling

Onder **Team → Spelers en beoordeling** (achter een pincode van 4 cijfers): naam, bijnaam (max. 8 tekens, die staat in het veld), speelkracht (schuif met 9 niveaus zonder cijfers: van *Beginner* tot *Draagt Het Hele Team*; het label staat boven de balk en eronder de omschrijving, die tijdens het schuiven meebeweegt; vanaf *Bepalende Speler* kleurt hij groen), voorkeursposities en sterke kanten. Buiten dit deel zie je nergens niveaus; de wisselberekening gebruikt ze alleen intern.

Het pincodescherm is donker met ronde glazen toetsen; bij een fout schudden de bolletjes rood, bij de goede code gaat het slot open. Je kunt ook een toetsenbord gebruiken.

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
js/ui.js                                  gedeelde onderdelen (veld, pillen, sheets, schakelaar, +/−, keuzebalk)
js/motion.js                              bewegingstaal: tempo's, veren, indrukken, tikje, minder beweging
js/profiles.js                            wisselprofielen: varianten doorrekenen en de beste kiezen
js/compute.js, js/worker.js               rekendraad (Web Worker) voor plannen en profielen
js/worker-core.js                         het rekenwerk zelf (ook bruikbaar zonder worker)
js/refresh.js                             optimistisch bijwerken: plan op de achtergrond opnieuw uitrekenen
js/screens/*.js                           schermen
tests/*.test.mjs                          tests: node tests/planner.test.mjs && node tests/match.test.mjs && node tests/profiles.test.mjs && node tests/formation.test.mjs && node tests/pins.test.mjs
```

Lokaal proberen: `python3 -m http.server` in deze map en open `http://localhost:8000`.

Bij een nieuwe versie: verhoog `VERSION` in `sw.js`, dan halen telefoons de nieuwe bestanden op (de app meldt "Nieuwe versie klaar").

## Volgende stappen

1. ~~Wisselberekening + wedstrijdscherm op één telefoon~~ (deze versie)
2. Samen werken met de tweede coach (Firebase, gratis Spark-plan, inloggen met Google)
3. Seizoensoverzichten met grafieken per speler
