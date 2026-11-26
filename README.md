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
- **Klaarzetten in vakken (v0.25.1):** geen stappen op volgorde maar vakken die je invult. Het affiche is het vak *Wedstrijd* (gestippeld oranje met *Tegen wie speel je?* zolang de tegenstander niet bevestigd is). Daaronder twee vakken: **Spelers** (wie er zijn en wie keept, in één venster; ingevuld met rondjes per speler in de kleur van zijn dominante rol, het aantal en de keeper) en **Basis** (gestippeld grijs, want niet verplicht; ingevuld met een mini-veldje en de naam). Een vak dat je net invult, veert even op en krijgt een groen vinkje. Is alles klaar, dan zegt de Startknop *klaar voor de aftrap* en gloeit hij rustig.
- **Basisopstellingen:** bewaar de opstelling op het veld als basis (met naam, keeper en wie op welke plek). Bij een volgende wedstrijd kies je hem met één tik; wie er niet is, vervangt de app door wie daar het best past (dominante rol, voorkeur, speelkracht) en dat staat erbij. Meldt iemand zich later af, dan past de basis zich vanzelf aan. Per basis: hernoemen, vervangen door het veld of verwijderen (met *Ongedaan*). Nog geen basis? Dan zegt het venster dat en helpt het je er een te maken. Past een basis niet bij de spelvorm (ander aantal in het veld), dan staat hij grijs.
- **Autopilot | Zelf plannen:** één schakelaar, het een of het ander. Tik een kant of sleep het blokje (voorbij het midden loslaten = de andere kant); het glijdt met een veer. Autopilot heeft de AI-rand en boven de rand het label *✦ aanbevolen*; Zelf plannen kleurt navy. Eronder één regel: bij Autopilot *14 wissels · 31′ p.p.* met *Speeltijd*, bij Zelf plannen het aantal blokken met *Open game plan*. De eerste keer Zelf plannen toont de app de verschillen naast elkaar (met *Toch Autopilot*). Daarna kies je hoe je begint: *Neem Autopilot over*, *Met basis …* (startblok uit je basis, de app doet een voorzet voor de rest) of *Begin leeg*. Terug naar Autopilot bewaart je game plan. ⓘ naast de schakelaar opent de uitleg.
- **Voorbereiden:** bovenin het affiche, daaronder de stappenrail en de schakelaar. Daaronder de tijdlijn en het veld: sleep spelers voor de startopstelling (of naar een lege plek voor een andere opstelling), ook van en naar de keeper (wie op de keeper landt keept, de oude keeper neemt zijn plek), en veeg door het plan. Bij een later wisselmoment zet slepen een **speldje**, net als in de planner: een bankspeler op een veldspeler = hij komt op dat moment erin (kwam die veldspeler net erin, dan neemt de bankspeler zijn beurt over); veld op veld = ruilen van plek of linie; naar een lege plek (+) = een andere opstelling vanaf dat moment (ook na de rust). De app rekent de rest opnieuw en voert het live precies zo uit. Een linie mag leeg raken (bijv. de enige middenvelder naar voren: 2-0-3); de lege linie blijft zichtbaar, zodat je er weer iemand naartoe sleept. Op lage schermen (tot 720 px hoog) staat een dunne tijdlijn zonder onderschrift, zodat speldjes ook daar te zien zijn. **Opstelling na de rust aanpassen (Autopilot):** veeg naar het rust-moment (het vierkantje op de tijdlijn) en sleep: bank op veld = hij begint de 2e helft, veld op veld = ruilen. Die opstelling staat dan vast (speldje); de app rekent de rest eromheen en staat daarbij hooguit 1 beurt verschil toe in plaats van ineens veel meer wissels. Een speldje op de tijdlijn tik je weg: dat moment gaat terug naar de app en het plan rekent opnieuw (met *Ongedaan*). Onder de schakelaar staat **Speeltijd**: dat opent vooraf per speler hoe lang hij speelt en waar, als losse pillen per linie (voor, midden, achter) met de doelband; tik een speler voor zijn wedstrijd in één strook (wanneer op welke linie, hoe vaak en hoe lang aan de kant). Werkt voor Autopilot en game plan; Controle gebruikt dezelfde grafiek. ⓘ naast de schakelaar opent een lichte laag die eerst de manier uitlegt die nu aan staat (*Nu actief*), en na een tik de andere manier, met *Overstappen* (je game plan blijft bewaard) of *Open game plan*. Op het veld zelf staat geen knop meer; volg je een game plan, dan staat er een slotje bij het onderschrift. Werk je met een game plan, dan is het veld hier om te bekijken; pak je toch een speler, dan schudt hij kort en zegt de app *Game plan staat aan: hier alleen bekijken* met *Uitleg*. Vegen door het plan werkt gewoon. De twee manieren heten **Autopilot** (de app plant en rekent mee; voorheen Standaardplan) en **Game plan** (jij bepaalt per blok). Onderin een eigen balk met **Start · tik bij de aftrap** en kleine knoppen naar Seizoen en Team; de menubalk is er dan niet, zodat het veld groter is (ook met 11 spelers).
- **Volle bank:** wie van plek verandert op de bank glijdt rustig een klein stukje naar zijn nieuwe plek; wie nieuw op de bank komt, verschijnt zacht als de rest is opgeschoven. Veeg je door het plan, dan krijgt wie erin kwam een zachte groene rand (geen flitsende gloed) en komen nieuwe spelers rustig in beeld. Past de bank niet op het scherm, dan veeg je hem opzij; zachte randen laten zien dat er nog spelers achter zitten en de bank klikt per speler vast. Omhoog slepen pakt een speler. Wie er straks in moet, schuift vanzelf in beeld; sleep je een speler naar de rand van de bank, dan scrollt die mee.
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
- **Lege staat:** zonder gespeelde wedstrijden zegt het spelersblok in Seizoen in één zin wat je er straks ziet.
- **Seizoenen:** elke wedstrijd hoort bij een seizoen (aug–jul). Bovenin Seizoen kies je een eerder seizoen als archief, met uitslagen, minuten, posities en doelpunten.

## Tijdens de wedstrijd

- **Scorebord:** klok en stand staan naast elkaar, even groot; daaronder de helften/kwarten over de volle breedte. Cijfers rollen verend door. Groene ademende stip = klok loopt, oranje = pauze. Tik op de klok om te starten of te pauzeren; is de tijd om, dan sluit je met dezelfde tik de periode af en zet je daarna (tik opnieuw) de opstelling voor de volgende periode klaar.
- **Doelpunt:** tik op de stand. Het scorebord klapt om naar twee knoppen (*+1* voor ons of voor de tegenstander). Bij een goal van ons wordt het eiland oranje met *Wie scoorde?* en wordt het veld iets donkerder; en tik je de speler in het veld aan (of *Weet ik niet*); het veld blijft vrij. De stand kleurt groen als we voorstaan en amber bij een achterstand; de scorer krijgt een oranje pil met rimpels en een klein *+1*. Onderin staat een paar seconden *Goal Naam · Ongedaan* (scoorde de keeper zelf, dan bovenin).
- **Wissel-eiland:** onder het scorebord staat in tekst wat er komt (wie erin, wie eruit, wie doorschuift) en rechts een grote aftelring. Vanaf 1 minuut wordt het eiland donkerblauw en ademt de ring steeds sneller; ben je te laat, dan wordt de ring rood, wiebelt het eiland en staat er een witte pil met hoeveel (bijv. −0:44). De ring is ook de **wisselknop**: pijlen in een rondje met de tijd eronder. **Schuif de ring naar links** over het eiland: je duim gaat van het veld af, het eiland loopt oranje vol en er staat *Schuif om te wisselen*; voorbij ±60% kleurt het groen (*Loslaten = wisselen*) met een tikje. Loslaten = de pijlen draaien een slag rond en de wissel gebeurt meteen op het veld (met de ongedaan-pil). Eerder loslaten = de ring veert terug; alleen tikken = *← Schuif de ring naar links om te wisselen*. Als hint stuitert de ring af en toe een stukje naar links (in de laatste minuut vaker). In de laatste minuut staat er *← schuif* onder de ring, kleuren de pijlen oranje en draaien ze af en toe een slag; als het tijd is draaien ze sneller met *NU* eronder. Tik op de tekst van het eiland voor de planner.
- **Uitleg (peek):** onder het eiland hangt een lipje (⌄). Tik erop of veeg het omlaag en het eiland klapt uit tot een lade over het veld, in dezelfde kleur (donker in de laatste minuut), met wat je roept: **Roep eruit** (wie eruit gaat) en **Zeg tegen** (per speler dat erin komt of van plek verandert één regel met waar hij aan het eind staat; schuift iemand twee keer, dan telt alleen zijn eindplek, en wie op zijn plek terugkomt staat er niet in). De wissel daarna staat er niet meer in. Tik op de lade, nog eens op het lipje, veeg omhoog of tik ergens op het veld om hem te sluiten: die tik doet verder niets (geen wissel of keeperswissel eronder). Het lipje heeft een groter raakvlak dan je ziet. Vasthouden = alleen zolang je vasthoudt. Het lipje geeft een rimpeling zodra de nieuwe zwevers in beeld komen, en daarna elke halve minuut zolang ze zweven. Kleuren zoals op het veld: groen erin, oranje eruit, blauw doorschuiven.
- **Rust na de aftrap:** na de aftrap en na de rust blijft het veld anderhalve minuut rustig; daarna gaan de wissels zweven (behalve als de wissel al binnen een minuut komt).
- **Rust na een wissel:** zolang de ongedaan-pil staat, laat het veld alleen de nieuwe situatie zien; de zwevers, kleurranden en het lipje van de volgende wissel komen pas daarna rustig binnen.
- **Kleurranden staan altijd aan:** oranje draaiende rand om wie eruit gaat, groene rand om de zwever die erin komt (en om zijn pil op de bank), blauwe rand om de zwever die van plek wisselt. In de laatste minuut draaien ze sneller en feller. Hetzelfde in de planner.
- **Zwevers in het veld:** wie eruit gaat heeft een oranje draaiende ring; schuin erachter zweeft rustig wie erin komt, in groen (in de laatste minuut duidelijker, sneller en met een groene draaiende ring; op de bank heeft hij ook een groene ring). Een blauwe zwever met ↑/↓ laat zien wie doorschuift. Bij de wissel zakt wie eruit gaat weg richting de bank, glijdt een doorschuiver naar zijn nieuwe plek en stapt wie erin komt vanaf zijn zweefplek naar binnen (eerst groen, dan wit); daarna valt de speler die eruit ging op de bank.
- **Opstelling veranderen door te slepen:** pak een veldspeler op en het veld toont de linies (*voor*, *midden*, *achter*) met lege plekken (+) tussen en naast de spelers. Sleep bijvoorbeeld een aanvaller naar een lege plek op het middenveld: de buren schuiven opzij, erboven staat *Naar het midden · 2-2-1*, en bij loslaten landt hij precies op zijn nieuwe plek terwijl de rest vlot naar de nieuwe opstelling schuift. De opstelling geldt voor deze wedstrijd (de teaminstelling blijft gelijk) en het plan rekent meteen opnieuw. Elke linie houdt minstens één speler. Live staat onderin *Opstelling 2-2-1 · Ongedaan*; de pijl bovenin maakt het ook ongedaan. *Opstelling opnieuw laten voorstellen* in het ⋯-menu zet de teamopstelling terug.
- **Slepen = nu wisselen:** veld ↔ bank wisselt direct, veld ↔ veld ruilt plekken. De speler die je sleept zweeft boven je vinger, de dichtstbijzijnde speler wordt vanzelf het doel (je hoeft niet precies te mikken) en erboven staat wat er gebeurt, bijvoorbeeld *Speler 7 erin*. Laat je los zonder doel, dan vliegt hij terug. Over de keeper verschijnt dan een pil met *Kan terug / Rust / Klaar* (standaard *Kan terug*) en *Ongedaan maken*. Wie je terugsleept uit rust of klaar, is weer inzetbaar.
- **Meerdere spelers tegelijk:** stel bij Team → Wisselen in hoeveel spelers per wisselmoment wisselen (1–5; in de zaal standaard de hele veldploeg). Het wisselvenster toont dan alle paren; per paar kun je spelers kiezen, een paar weghalen of er een toevoegen.
- **Wisselen:** tik een speler (het eiland opent de planner). Bovenin staat wie eruit en wie erin gaat; Tik op de tegel *Eruit* of *Erin* voor een lijst van het veld of de bank, met minuten en hoe vaak iemand al gewisseld is. Label *plan* = volgende wissel uit het actuele plan; *advies* = beste partner als je zelf iemand anders kiest. In de blauwe balk: *1 min later*, *Bewaren* (je aangepaste wissel gebeurt op het geplande moment, daarna rekent de app verder) en *Wissel nu*. Na *Wissel nu* verschijnt dezelfde pil over de keeper.
- **Planner** (tik op de tekst van het wissel-eiland, of bij het voorbereiden op *Bekijk als rooster* → *Open de planner*): het veld is even groot als live (zelfde breedte en hoogte, dus ook 11 spelers passen), met *nu* op de voorgrond en het volgende moment erachter als zwevers met hun kleurranden. Klok en stand staan klein rechtsboven. Sleep je een speler naar de boven- of onderrand van het scherm, dan scrolt het scherm mee.
  - **Compact:** navigatie op één regel, het verhaal strakker, en het veld zo hoog dat de bank in beeld blijft. Op de start van een periode staat alleen de opstelling, zonder zwevers.
  - **De volgende wissel** staat boven het veld in dezelfde taal als de lade: *Volgende wissel · 1 van 14 · over 3:03 — Roep eruit: Speler 2 — Zeg tegen: Speler 9 erin · rechtsachter, Speler 1 naar het midden*. Plekken heten linksvoor, rechtsvoor, midvoor, linksachter, centraal achter, in het midden, enz. (links = links op het scherm). Het wissel-eiland zegt het kort (*Speler 8 rechtsvoor · Speler 1 naar het midden*).
  - **Slepen = het volgende moment plannen:** sleep een bankspeler op een veldspeler (of andersom) en het volgende wisselmoment krijgt precies die wissel, met een speldje. De rest van de wedstrijd rekent de app opnieuw uit; momenten tot en met het speldje blijven op hun tijd. *Losmaken* of een tik op het speldje op de tijdlijn geeft het moment terug aan de app. Kan een vastgezet moment niet meer (iemand rust of staat al in het veld), dan meldt de planner dat in plaats van het stil te wissen.
  - **Vegen door de momenten:** veeg over het veld, sleep het oranje bolletje of gebruik de pijlen; speldjes staan op de tijdlijn. *Terug naar nu* brengt je naar de werkelijkheid.
  - **Spieken:** houd je vinger stil op een leeg stuk veld en je ziet het volgende moment op ware grootte (de spelers glijden naar hun nieuwe plek, ook de bank). Loslaten = terug.
  - **Voor deze wedstrijd:** focus (verdedigen/balans/aanvallen, of de stand laten volgen) en eerlijkheid (*Strenger*, *Zoals ingesteld*, *Ruimer*). De teaminstelling blijft gelijk.
  - **Gevolgen** direct onder het veld: balans per linie op dit moment (zonder namen of cijfers), speeltijd per speler over de hele wedstrijd (met het verschil na je laatste aanpassing), hoe vaak naar de bank en de langste bankbeurt, en of het binnen de regels past.
  - **Wissel nu:** de vaste balk onderin toont het volgende moment met aftellen, *+1′* en *Wissel nu*; daarna sta je weer in het live-scherm, waar de wissel zichtbaar gebeurt (eruit, doorschuiven, erin) en de ongedaan-pil verschijnt. Bij de wissel piept de app ook in de planner.
- **Hoe wissel je deze wedstrijd?** Bij het voorbereiden staat één compacte kaart met twee manieren naast elkaar; de actieve heeft een vinkje. *Uitleg* legt ze kort uit. Bij Team → Wisselen kies je alleen waarmee een nieuwe wedstrijd begint. Het veld krimpt mee, zodat bank en startknop ook op een klein scherm passen.
  - **✦ Autopilot** (de app maakt het, herkenbaar aan de rondlopende rand in paars, blauw en groen, een ademende gloed, vonkjes en een stromend icoon): tik voor het rooster per speler, met *Open de planner* en *Pas aan als game plan* (neemt het plan over in blokken; kan het in blokken eerlijker, dan krijg je een voorzet).
  - **Game plan:** *Zelf bouwen*. Terug naar Autopilot bewaart je game plan (*Ongedaan* in de melding). Start je met een leeg game plan, dan vraagt de app het eerst.
- **Game plan** in vier stappen. Bovenin een glazen voortgangsbalk in vier delen met nummer en naam (tik = naar die stap), onderin *Vorige* en *Volgende*:
  1. **Opzet:** speelstijl als twee kaarten (label *Oudere teams* / *Jongere teams* boven de naam), blokken per periode (het woord volgt het team: per helft, per kwart) met een balk die de periode in blokken deelt, keuze 2 t/m 6 met een klein gloeiend stipje bij het advies (alleen de keuze die je aantikt krijgt de blauwe vulling), de gevolgen (per blok, speeltijd, max aan de kant, wissels per grens) en een advieskaart die uitlegt waarom (spelers, bank, wissels per moment, de rust of pauze). Daarna *✦ Voorzet van de app* of *Leeg bord*; bij 12 of meer blokken raadt de app de voorzet aan.
  2. **Startopstelling:** de linies met lege plekken, iedereen op de bank. Tik een bankspeler en dan een plek, of sleep hem. Is de opstelling vol, dan loopt die door tot het eind van de wedstrijd: dat is de basis.
  3. **Wissels per blok** op het **liniebord**: rijen Voor, Mid, Achter, de keeper en de Bank; kolommen de blokken. Staand één periode met een minikaart van de hele wedstrijd; liggend het hele bord (veel blokken: compacter).
     - **Een speler kiezen:** tik een speler (op het bord of in de strook onderin). Hij licht op in alle blokken, de rest wordt rustig, en bij de linies staat ★ ☆ ✕ voor hem. Tik dan in elk blok waar hij moet spelen: op wie eruit gaat (wissel), op iemand in een andere linie (ruilen), op een lege plek, op de bank, of op ＋ voor een andere opstelling (bijv. een verdediger erbij: dan 3-1-1 in dat blok). ＋ kan altijd, ook vanaf de bank en ook op een ongewone plek: de teaminstellingen zijn regels voor de voorzet, niet voor jou. Staat er dan één te veel in het veld, dan toont de kop *+1* en tik je wie eruit gaat. Hij blijft gekozen, zodat je hem blok voor blok kunt neerzetten.
     - **Spelerbalk** onderin: naam, blokken en minuten met zijn doel (groen = op koers, oranje = te weinig of te veel), per blok een streepje in de kleur van zijn linie, zijn ★/☆-plekken, zijn langste tijd aan de kant en hoe lang hij buiten zijn kracht speelt; ✕ = klaar.
     - Tekens: ★ dominante plek, ☆ voorkeursplek, ✕ uit positie. Een pijltje en kleurrand tonen wie er t.o.v. het blok ervoor in kwam, uit ging of van linie wisselde.
     - Kop van een blok: tijd, ⇅ wissels, ↔ plekwissels, de opstelling als die anders is, = geen wijziging, ✦ van de app.
     - **Op het veld:** tik de kop van een blok en dat blok staat groot op het veld, met de bank eronder. Schuif zoals live: bank op veld = wissel, veld op veld = ruilen van linie, naar een lege plek (+) = andere opstelling of een plek invullen. Een wijziging geldt alleen voor dat blok. Veeg over het veld (of gebruik de pijlen of de streepjes bovenin) naar het blok ervoor of erna. Twee spelers in dezelfde linie ruilen van plek (links/rechts) door de een op de ander te slepen; een lege linie blijft zichtbaar (*Midden leeg · sleep hierheen*). Bij elke speler staat kort wat er veranderde (*erin*, *was CM*), met ★/☆/✕; bovenin de punten van dat blok (vol of niet, wie hier te lang aan de kant zit, wie buiten zijn kracht speelt). De gekozen speler blijft gekozen; ↶ is dezelfde als op het bord. Esc of ← = terug naar de tabel.
     - **Gevolgen van je wijziging:** na elke zet staat onderin één regel met het belangrijkste gevolg (bijv. *Speler 3 nu 19′ aaneen aan de kant*) of een rustig ✓. Tik erop voor voor/na (speeltijd, langst aan de kant, in hun kracht, wie minuten wint of verliest) en hooguit drie betere zetten die jouw blok laten staan; *Doe* (met *Ongedaan*) of *OK, terug naar het bord*.
     - **✦ Gratis verbeteringen:** ruilen twee spelers in een blok van linie zonder dat iemand minder in zijn kracht speelt (de minuten blijven gelijk), dan staat er een knop *✦ 1 gratis verbetering*. Dezelfde ruil in blokken na elkaar is één voorstel. Nooit vanzelf: jij kiest. Bij *Gebalanceerd* rustiger (*linieruilen in hun kracht*), omdat afwisselen daar ook ontwikkeling is.
     - ↶ maakt je laatste zetten ongedaan. *✦ Vul aan* vult alle blokken die niet van jou zijn. Filters: *Alle*, *Voor*, *Mid*, *Achter*, *Aandacht* (met aantal: te weinig gespeeld, te lang aaneen aan de kant, of bij Sterkste opstelling buiten zijn kracht). Staand blijven de periodeknoppen bovenin staan en veeg je over het bord naar de periode ervoor of erna.
  4. **Controle** als dashboard: drie ringen (eerlijk, aan de kant, in hun kracht) met een conclusie die zegt wat er precies speelt, vier tegels met status, ✦ *Om naar te kijken*: per punt hooguit drie oplossingen (een oplossing die alleen winst geeft staat bovenaan als *✦ Pure winst*, met een AI-rand) (bijv. *1e helft 6:30: Speler 8 erin voor Speler 6*) met wat het doet voor dit punt, de speeltijd, *in hun kracht* en wie minuten wint of verliest; *Doe* past het toe (met *Ongedaan*), of *Bekijk … in de tabel* opent het bord met die speler gekozen, speeltijd per speler per linie met de doelband, de wisselmomenten als tijdlijn en het rooster per speler.
  - **Alleen de planning:** tijdens de wedstrijd werk je vanuit het live-scherm. Het eiland, de uitleg en *Wissel nu* volgen het game plan precies (met doorschuivers, plekwissels en een andere opstelling; één keer ongedaan maken per moment). Een moment met alleen een plekwissel of andere opstelling krijgt een eigen moment op het eiland. Het bord is dan alleen-lezen. In de rust kies je *Game plan*, *Als start*, *Als eind* of *Advies*.
- **Keeper wisselen:** tik op de keeper; kies van de bank of uit het veld, de knop zegt *X keept vanaf nu*.
- **Focus van de opstelling** (aanvallen/balans/verdedigen): de schuif net binnen de linkerzijlijn (de pil staat precies op de stippen en volgt je vinger zonder haperen; tijdens het slepen van een speler stapt hij even opzij). Boven = aanvallen (rode pil), midden = balans (oker), onder = verdedigen (blauw), in de kleuren van de linies. Sleep de pil omhoog of omlaag (je ziet meteen wat elke stand doet), of tik erop voor de keuzes en *Auto op stand*. Na een wijziging zegt het eiland een paar seconden wat er gebeurt en reageren de spelers: aanvallers stuiteren, verdedigers zetten zich schrap, bij balans wiegt iedereen even. Verandert de focus automatisch door een doelpunt, dan gebeurt dat pas na het doelpunt-feestje. Een groen *A* = automatisch. Geldt vanaf de volgende wissel.
- **Dominante rol:** spelers met een dominante rol hebben een gekleurd randje links in hun pil (zelfde kleuren als bij de spelers: groen keeper, blauw achter, oker midden, rood voor), op het veld én op de bank; in de kieslijst van het wisselvenster staat een klein label.
- **Doelpunten per speler:** een oranje bolletje met het aantal goals vóór de speeltijd onder de pil (zo blijft de zwever vrij), bij de keeper rechtsboven en op de bank achter de naam.
- **Stand aanpassen:** in het ⋯-menu, met − en + voor tegengoals, per speler en voor *onbekend*; het totaal loopt mee.
- **Tijd aanpassen, einde periode, afsluiten of weggooien:** het ⋯-menu.
- **Ongedaan maken:** de pijl bovenin, of de pil over de keeper.

## Hoe de app wisselt

- **Wissels per speler:** in te stellen bij Team → Wisselen (bijv. 1× per helft), of de app kiest zelf.
- **Dominante rol:** per speler in te stellen (achter pincode); vast of "mag afwijken".
- **Eén wissel per moment.** De app kiest zelf hoeveel momenten nodig zijn: het kleinste aantal waarbij iedereen even vaak gewisseld wordt, de speeltijd binnen de marge blijft en niemand te lang achter elkaar op de bank zit.
- **Wie erin:** wie het minst gespeeld heeft. **Wie eruit:** wie het minst vaak gewisseld is en het langst staat; bij gelijke keuze iemand met vergelijkbare speelkracht, zodat de linies in balans blijven.
- **Plek op het veld:** de nieuwe speler neemt de plek over. Als de balans (eerst speelkracht, dan voorkeurspositie) daar duidelijk beter van wordt, schuift één speler door.
- **Opstellingsstand:** Verdedigen, Balans of Aanvallen, automatisch op de stand (in te stellen per team). Het midden blijft altijd sterk.
- **Rust:** iedereen staat aan de kant en je begint opnieuw, dus de app laat één opstelling zien (geen zwevers). Bovenin kies je *Aanbevolen* (bij een game plan: *Game plan*, met ernaast *Advies*) (standaard: wie het minst speelde begint, met één zin uitleg), *Als start* (zoals de start van de vorige periode) of *Als eind* (zoals je eindigde). Wie niet meer inzetbaar is, wordt vervangen door wie het minst speelde, en dat staat erbij. Sleep spelers om te ruilen of naar een lege plek voor een andere opstelling (die geldt daarna voor de rest van de wedstrijd); dan staat er *Eigen opstelling*. Tik op de keeper om een andere keeper te kiezen. Op de bank staat hoeveel minuten iedereen speelde. *Start 2e helft* (of tik op de klok) zet de opstelling vast en start de klok.
- **Extra blok in het game plan:** delen de blokken niet precies op (bijv. 9 veldspelers, 5 in het veld, 10 blokken), dan speelt een deel van de spelers één blok meer. Dat extra blok gaat eerst naar de dragende spelers, daarna op speelkracht, nooit 'toevallig' naar een beginner, ook niet als de blokken een halve minuut verschillen (6½ of 6 min). Bij *Gebalanceerd* houdt de voorzet daarnaast de ploeg zo even sterk mogelijk over de hele wedstrijd; bij *Sterkste opstelling* gaat spelen in hun kracht voor. De voorzet begint met het geadviseerde aantal blokken, tenzij je zelf een aantal tikt.
- **Live bijsturen:** een andere wissel, "1 min later", een snelle wissel bij een blessure, een speler laten rusten of later laten aansluiten. Het plan rekent de rest van de wedstrijd opnieuw uit; een goal verschuift het volgende moment niet.

### Wisselprofielen

Bij **Team → Wisselen** kies je één profiel in plaats van losse regels:

- **Iedereen even lang** (eerlijkst): gelijke speeltijd en korte bankbeurten gaan boven alles.
- **In balans** (aanbevolen): iedereen ongeveer even lang en even vaak naar de bank, met zo min mogelijk wissels.
- **Rustig wisselen** (minste wissels): meer ritme, maar langer achter elkaar op de bank.
- **Sterkste ploeg** (beste bezetting): iedereen gaat even vaak naar de bank, dragende spelers staan een paar minuten langer.

Per profiel rekent de app een paar varianten door met echte wedstrijdplannen voor jouw selectie en kiest de variant die het best past (bijvoorbeeld nooit elke paar minuten een wissel). Bij het gekozen profiel staat wat de app doet en wat de gevolgen zijn, met de getallen van jouw team: aantal wissels, speeltijd per speler, hoe vaak en hoe lang op de bank. Bij elke wedstrijd rekent de app het opnieuw uit met wie er is.

Wie zelf wil sleutelen, opent **Eigen instellingen**: spelers tegelijk, hoe vaak naar de bank, voorrang, marge, maximaal op de bank, minimale tijd tussen wissels. Pas je daar iets aan, dan heet je keuze *Eigen*. Daarnaast staan onder **Team** het gedrag bij achterstand, gelijke stand en voorsprong.

- **Eigen instellingen gaan voor:** pas je bij Team → Wisselen → *Eigen instellingen* een regel aan die het profiel bepaalt (marge, bankduur, tijd tussen wissels, ritme, voorrang, even vaak, gelijke speeltijd), dan staan de profielen uit: de app volgt alleen jouw regels en stemt niet meer per wedstrijd af op wie er is. Een oranje melding zegt dat; *Terug naar In balans* of een tik op een profiel zet het terug. *Hoeveel spelers tegelijk* geldt bij elk profiel.

- **Sterkste ploeg rekent scherper (v0.25.1):** spelen buiten je kracht telt bij beste bezetting veel zwaarder (dominante rol 40, geen voorkeur 20 strafpunten; bij eerlijk 16 en 8), zodat dragende spelers op hun plek blijven en een speler die overal past schuift. Van alle plannen die binnen de regels passen kiest de app niet meer het eerste maar het beste: bij beste bezetting gaan de extra minuten naar sterkere spelers, speelt een duidelijk sterkere speler (2 niveaus of meer) nooit korter dan een zwakkere, en zitten liefst niet twee dragende spelers tegelijk op de bank. Sterke spelers krijgen ook de korte bankbeurten vlak voor en na de rust. Bij eerlijk gaat het kleinste verschil in speeltijd voor; bij gelijke stand gaan de beste spelers voor.
- **Dragende spelers één keer minder naar de bank (v0.25.2, Sterkste ploeg):** de app probeert of dragende spelers (niveau 7+) één keer minder naar de bank kunnen dan de rest, met hooguit één wissel meer dan normaal. Past dat niet binnen de regels, dan gaat iedereen even vaak. Sterkste ploeg mag daarvoor tot 10 minuten verschil hebben (was 8).
- **Focus en dragende spelers (v0.25.2):** bij focus op verdedigen hoort er een dragende speler achterin. Staat er een dragende verdediger of een Vaste Waarde (niveau 6) met vaste rol achter in het veld, dan is dat goed genoeg en schuift er niemand. Anders eerst een dragende speler of Vaste Waarde met achter als voorkeur; pas als die er niet is, valt een andere dragende speler in: eerst een dragende middenvelder, daarna een dragende aanvaller (bij aanvallen andersom). Alleen Sterkste ploeg mag tot 10 minuten verschil in speeltijd hebben; de andere profielen houden hun eigen marge. Bij balans speelt iedereen op zijn eigen plek(ken). De opstelling zoekt nu steeds de beste ruil (niet de eerste die iets beter is) en probeert ook met elke dragende speler alvast op de focuslinie.

## Spelers en beoordeling

Onder **Team → Spelers en beoordeling** (achter een pincode van 4 cijfers): naam, bijnaam (max. 8 tekens, die staat in het veld), speelkracht (schuif met 9 niveaus zonder cijfers: van *Beginner* tot *Draagt Het Hele Team*; het label staat boven de balk en eronder de omschrijving, die tijdens het schuiven meebeweegt; vanaf *Bepalende Speler* kleurt hij groen), voorkeursposities en sterke kanten. Buiten dit deel zie je nergens niveaus; de wisselberekening gebruikt ze alleen intern.

Het pincodescherm is donker met ronde glazen toetsen; bij een fout schudden de bolletjes rood, bij de goede code gaat het slot open. Je kunt ook een toetsenbord gebruiken.

De pincode houdt meekijkers buiten, maar is geen echte beveiliging: de gegevens staan op de telefoon zelf.

## Plekken kort
Achter **LB · CV · RB** (linksback, centrale verdediger, rechtsback), midden **LM · CM · RM**, voor **LV · MV · RV** (linksvoor, midvoor, rechtsvoor). Links = links op het scherm; het team speelt naar boven. Geen *A* voor aanval of achter, omdat dat verwarrend leest.

## Gegevens en back-up

- **Versie:** onderaan de Team-pagina (*SpaBo Coach · versie …*; staat er een nieuwe versie klaar, dan *Nieuwe versie klaar · Vernieuwen*) en onderin het ⋯-menu van het Wedstrijd-scherm.
- **Laatste back-up:** bij Team → Gegevens staat wanneer je de laatste back-up maakte (oranje als het nooit gebeurde of langer dan 14 dagen geleden is).

De app maakt geen verbinding met andere diensten: geen koppelingen, geen analytics, geen lettertypes of scripts van buitenaf. Alleen de bestanden van de app zelf worden (één keer) geladen en daarna bewaard voor gebruik zonder bereik.


Alles staat in de browser van de telefoon. Maak af en toe een back-up via **Team → Back-up maken** (een JSON-bestand) en zet hem terug via **Back-up terugzetten**. In stap 2 komt opslag in een eigen database, zodat twee coaches tegelijk kunnen werken.

## Voor ontwikkelaars

Geen build-stap: gewone ES-modules, [Preact](https://preactjs.com) + [htm](https://github.com/developit/htm) in `vendor/`, lettertypes Nunito en Inter lokaal in `fonts/`.

```
index.html, manifest.webmanifest, sw.js   PWA-schil (offline)
css/app.css                               stijl (clubkleuren, pillen, neon)
js/planner.js                             wisselberekening (puur, zonder DOM)
js/ownplanner.js                          game plan: speelstijl, in hun kracht, vooruitkijkend rekenen (puur)
js/match.js                               klok, gebeurtenissen, herplannen
js/store.js                               opslag op de telefoon
js/ui.js                                  gedeelde onderdelen (veld, pillen, sheets, schakelaar, +/−, keuzebalk)
js/motion.js                              bewegingstaal: tempo's, veren, indrukken, tikje, minder beweging
js/profiles.js                            wisselprofielen: varianten doorrekenen en de beste kiezen
js/compute.js, js/worker.js               rekendraad (Web Worker) voor plannen en profielen
js/worker-core.js                         het rekenwerk zelf (ook bruikbaar zonder worker)
js/refresh.js                             optimistisch bijwerken: plan op de achtergrond opnieuw uitrekenen
js/screens/*.js                           schermen
tests/*.test.mjs                          tests: node tests/planner.test.mjs && node tests/match.test.mjs && node tests/profiles.test.mjs && node tests/formation.test.mjs && node tests/pins.test.mjs && node tests/ownplan.test.mjs && node tests/route.test.mjs && node tests/gameplan.test.mjs
```

Lokaal proberen: `python3 -m http.server` in deze map en open `http://localhost:8000`.

Bij een nieuwe versie: verhoog `VERSION` in `sw.js`, dan halen telefoons de nieuwe bestanden op (de app meldt "Nieuwe versie klaar").

## Volgende stappen

1. ~~Wisselberekening + wedstrijdscherm op één telefoon~~ (deze versie)
2. Samen werken met de tweede coach (Firebase, gratis Spark-plan, inloggen met Google)
3. Seizoensoverzichten met grafieken per speler
