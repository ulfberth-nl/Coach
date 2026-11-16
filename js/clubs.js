// Hockeyclubs (district Midden-Nederland, Noord-Holland en enkele grote clubs elders).
// Bron clublijst: hockeystanden.nl/clubs. Kleuren alleen waar een bron ze noemt (v = 1),
// Amsterdam is een inschatting (v = 0). Clubs zonder kleuren krijgen een neutraal schild;
// de coach kan per club zelf kleuren kiezen (opgeslagen op de telefoon).
// Velden: [naam zoals gebruikt, volledige naam, andere namen/afkortingen, plaats, kleuren, v]

const B = '#1E4FA3', W = '#FFFFFF', R = '#C8102E', K = '#111111', G = '#0B6B3A', DG = '#0F5A32',
  Y = '#F5C400', O = '#F47B20', N = '#1B2A5A', LB = '#7FB2E5', GR = '#8A8F98', BR = '#6B4423';

const RAW = [
  // Midden-Nederland
  ['Almeerse', 'Almeerse Hockey Club', 'AHC,Almere', 'Almere'],
  ['Amersfoort', 'Hockeyclub Amersfoort', 'HCA', 'Amersfoort'],
  ['Baarn', 'Baarnse Mixed Hockey Vereniging', 'BMHV,Baarnse', 'Baarn'],
  ['Barneveld', 'MHC Barneveld', '', 'Barneveld'],
  ['Buitenhout', 'MHC Buitenhout', '', 'Almere'],
  ['CMHC', 'Culemborgse Mixed Hockey Club', 'Culemborg', 'Culemborg'],
  ['De Haaskamp', 'Hockeyclub De Haaskamp', 'Haaskamp', 'Amerongen'],
  ['De Mezen', 'MHC De Mezen', 'Mezen', 'Harderwijk'],
  ['Shinty', 'DMHC Shinty', 'DMHC', 'Driebergen'],
  ['Doorn', 'Doornse Hockey Club', 'DHC,Doornse', 'Doorn'],
  ['Dorsteti', 'HV Dorsteti', '', 'Wijk bij Duurstede'],
  ['Eemvallei', 'HC Eemvallei', '', 'Amersfoort'],
  ['Fletiomare', 'MHC Fletiomare', '', 'Utrecht', [LB, BR], 1],
  ['Rapid', 'GHC Rapid', '', 'Gorinchem'],
  ['Geldermalsen', 'HC Geldermalsen', '', 'Geldermalsen'],
  ['Gooische', 'Gooische Hockey Club', 'GHC,Gooi', 'Bussum', [B, W], 1],
  ['HMHC', 'Hilversumsche Mixed Hockey Club', 'Hilversum,Hilversumsche', 'Loosdrecht'],
  ['Hoevelaken', 'MHC Hoevelaken', '', 'Hoevelaken'],
  ['Houten', 'Hockey Club Houten', '', 'Houten'],
  ['Huizer', 'Huizer Hockey Club', 'HHC,Huizen', 'Naarden'],
  ['IJsseloever', 'HC IJsseloever', '', 'IJsselstein'],
  ['Kampong', 'SV Kampong Hockey', '', 'Utrecht', [B, W], 1],
  ['Kromme Rijn', 'HC Kromme Rijn', '', 'Bunnik'],
  ['Laren', 'Larensche Mixed Hockey Club', 'LMHC,Larensche', 'Laren'],
  ['Leerdam', 'HC Leerdam', '', 'Leerdam'],
  ['Lelystad', 'MHC Lelystad', '', 'Lelystad'],
  ['Leusden', 'MHC Leusden', '', 'Leusden'],
  ['Loenen', 'Loenense Mixed Hockey Club', 'Loenense', 'Loenen aan de Vecht'],
  ['Maarn', 'MHC Maarn', '', 'Maarn'],
  ['Maarssen', 'MHV Maarssen', 'MHV', 'Maarssen'],
  ['MHCN', 'MHC Nieuwegein', 'Nieuwegein', 'Nieuwegein'],
  ['Voordaan', 'MMHC Voordaan', 'MMHC', 'Groenekan'],
  ['Montfoort', 'Hockeyclub Montfoort', '', 'Montfoort'],
  ['Muiderberg', 'MHC Muiderberg', '', 'Muiderberg'],
  ['Naarden', 'Hockeyclub Naarden', 'HCN', 'Naarden'],
  ['Nijkerk', 'HC Nijkerk', '', 'Nijkerk'],
  ['Phoenix', 'SV Phoenix', '', 'Zeist'],
  ['Rijnvliet', 'HC Rijnvliet', '', 'Utrecht'],
  ['Muiden', 'SC Muiden', '', 'Muiden'],
  ['Schaerweijde', 'ZSV Schaerweijde', 'ZSV', 'Zeist', [R, K], 1],
  ['Scherpenzeel', 'HC Scherpenzeel', '', 'Scherpenzeel'],
  ['Soest', 'MHC Soest', '', 'Soest'],
  ['Spandersbosch', "HV 't Spandersbosch", "SpaBo,'t Spandersbosch,Spanderbosch", 'Hilversum'],
  ['Spitsbergen', 'VMHC Spitsbergen', 'VMHC', 'Veenendaal'],
  ['SCHC', 'Stichtsche Cricket en Hockey Club', 'Stichtse,Stichtsche', 'Bilthoven'],
  ['De Kromhouters', 'THCC De Kromhouters', 'Kromhouters,THCC', 'Tiel', [N, W], 1],
  ['USHC', 'Utrechtse Studenten Hockey Club', 'Utrechtse Studs', 'Utrecht', [W, R, K], 1],
  ['UNO', 'Hockeyclub UNO', '', 'Utrecht'],
  ['Vianen', 'MHC Vianen', '', 'Vianen'],
  ['Woerden', 'MHC Woerden', '', 'Woerden'],
  ['Zeewolde', 'Hockey Club Zeewolde', '', 'Zeewolde'],
  ['Zwaluwen', 'Zwaluwen Utrecht', '', 'Utrecht'],
  // Noord-Holland
  ['Abcoude', 'HV Abcoude', '', 'Abcoude'],
  ['Amsterdam', 'Amsterdamsche Hockey & Bandy Club', 'AH&BC,AHBC', 'Amstelveen', [R, W], 0],
  ['Alkmaar', 'Alkmaarsche Mixed Hockey Club', 'AMHC', 'Alkmaar'],
  ['Alliance', 'MHC Alliance', '', 'Heemstede'],
  ['Amsterdam Dynamics', 'AM Amsterdam Dynamics', 'Dynamics', 'Amsterdam'],
  ['AMVJ', 'Hockeyclub AMVJ', '', 'Amstelveen'],
  ['Athena', 'HC AthenA', '', 'Amsterdam'],
  ['Bennebroek', 'MHC Bennebroek', '', 'Bennebroek'],
  ['Overbos', 'BHC Overbos', 'BHC', 'Beverwijk'],
  ['Bloemendaal', 'HC Bloemendaal', '', 'Bloemendaal'],
  ['Castricum', 'MHC Castricum', '', 'Castricum'],
  ['De Kikkers', 'MHC De Kikkers', 'Kikkers', 'Nieuw-Vennep'],
  ['De Reigers', 'MHC De Reigers', 'Reigers', 'Hoofddorp'],
  ['De Terriërs', 'HV De Terriërs', 'Terriers,Terriërs', 'Heiloo'],
  ['Diemen', 'HC Diemen', '', 'Diemen'],
  ['FIT', 'AMHC FIT', '', 'Amsterdam'],
  ['Haarlem', 'HC Haarlem', '', 'Haarlem'],
  ['Heerhugowaard', 'MHC Heerhugowaard', '', 'Heerhugowaard'],
  ['HIC', 'Hockeyclub HIC', '', 'Amstelveen', [O, W, K], 1],
  ['Hisalis', 'HC Hisalis', '', 'Lisse'],
  ['Hermes', 'HSC Hermes', '', 'Den Helder'],
  ['IJburg', 'AHC IJburg', '', 'Amsterdam'],
  ['Strawberries', 'KHC Strawberries', '', 'Driehuis'],
  ['Magnus', 'SMHC Magnus', '', 'Schagen'],
  ['HBS', 'MHC HBS', 'MHCHBS', 'Bloemendaal'],
  ['Mijdrecht', 'HV Mijdrecht', '', 'Mijdrecht'],
  ['Myra', 'HV MYRA', '', 'Amstelveen', [W, DG], 1],
  ['Noorderlicht', 'AHC Noorderlicht', '', 'Amsterdam'],
  ['Pinoké', 'Pinoké', 'Pinoke', 'Amstelveen'],
  ['Purmerend', 'MHC Purmerend', '', 'Purmerend'],
  ['Rood-Wit', 'AMHC Rood-Wit', 'Rood Wit', 'Aerdenhout', [R, W], 1],
  ['Saxenburg', 'HMHC Saxenburg', '', 'Haarlem'],
  ['Spaarndam', 'HC Spaarndam', '', 'Spaarndam'],
  ['Spire', 'HC Spire', '', 'Hoogwoud'],
  ['Hurley', 'THC Hurley', 'THC', 'Amstelveen', [W, N, LB], 1],
  ['Qui Vive', 'UHC Qui Vive', 'UHC', 'De Kwakel'],
  ['Uitgeest', 'MHC Uitgeest', '', 'Uitgeest'],
  ['Waterland', 'Waterlandse Hockey Club', 'Waterlandse', 'Monnickendam'],
  ['Weesp', 'MHC Weesp', '', 'Weesp'],
  ['Westerpark', 'AMHC Westerpark', '', 'Amsterdam'],
  ['Hoorn', 'WFHC Hoorn', 'WFHC', 'Zwaag'],
  ['Xenios', 'SBHC Xenios', '', 'Amsterdam', [LB, GR], 1],
  ['De Kraaien', 'ZHC De Kraaien', 'Kraaien', 'Wijdewormer'],
  ['Zandvoort', 'Zandvoortsche Hockey Club', '', 'Zandvoort'],
  // grote clubs elders
  ['Rotterdam', 'HC Rotterdam', 'HCR', 'Rotterdam', [G, W], 1],
  ['Den Bosch', "HC 's-Hertogenbosch", "'s-Hertogenbosch,HC Den Bosch", "'s-Hertogenbosch", [K, Y], 1],
  ['Leonidas', 'RHV Leonidas', 'RHV', 'Rotterdam', [B, W], 1],
  ['Push', 'BHV Push', 'BHV', 'Breda', [G, W], 1],
  ['Tilburg', 'HC Tilburg', '', 'Tilburg', [N, W], 1],
  ['LOHC', 'LOHC Leiden', 'Leiden', 'Leiden', [R, W, K], 1],
  ['Oranje-Rood', 'HC Oranje-Rood', 'Oranje Rood', 'Eindhoven', [O, R], 1],
  ['HGC', 'HGC', '', 'Wassenaar', [LB, K], 1],
  ['HDM', 'HHV HDM', 'hdm', 'Den Haag'],
  ['Klein Zwitserland', 'HC Klein Zwitserland', 'KZ', 'Den Haag']
];

export const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[’'`.]/g, '').replace(/&/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();

const abbrOf = (n, aliases) => {
  if (/^[A-Z&-]{2,5}$/.test(n.replace(/\s/g, '')) && n.length <= 5) return n.replace(/[^A-Z]/g, '').slice(0, 4);
  const a = aliases.find((x) => /^[A-Z]{2,4}$/.test(x));
  if (a) return a;
  const words = n.split(/[\s-]+/).filter((w) => !/^(de|het|t)$/i.test(w));
  return words.length > 1 ? words.map((w) => w[0]).join('').toUpperCase().slice(0, 3) : n.slice(0, 3).toUpperCase();
};

export const CLUBS = RAW.map(([n, f, a, t, c, v]) => {
  const aliases = a ? a.split(',') : [];
  return { n, f, a: aliases, t, c: c || null, v: !!v, ab: abbrOf(n, aliases), keys: [n].concat(aliases).map(norm), fk: norm(f), tk: norm(t) };
});

// "Laren JO9-2" -> { base: 'Laren', suffix: 'JO9-2' }: alles vanaf het eerste woord met een cijfer is het team
export function splitTeam(name) {
  const words = String(name || '').trim().split(/\s+/).filter(Boolean);
  const k = words.findIndex((w) => /\d/.test(w));
  return k === -1 ? { base: words.join(' '), suffix: '' } : { base: words.slice(0, k).join(' '), suffix: words.slice(k).join(' ') };
}

// Welke club hoort bij deze tegenstander? Langste naam die als heel woord voorkomt wint.
export function findClub(name) {
  const s = ' ' + norm(splitTeam(name).base || name) + ' ';
  if (s.trim() === '') return null;
  let best = null, bestLen = 0;
  for (const c of CLUBS) {
    for (const k of c.keys.concat([c.fk])) {
      if (k && k.length > bestLen && s.indexOf(' ' + k + ' ') !== -1) { best = c; bestLen = k.length; }
    }
  }
  return best;
}

// Suggesties bij het typen
export function searchClubs(text, max = 5) {
  const q = norm(splitTeam(text).base);
  if (!q) return [];
  const scored = [];
  for (const c of CLUBS) {
    let s = 0;
    if (c.keys.some((k) => k === q)) s = 100;
    else if (c.keys.some((k) => k.startsWith(q))) s = 60;
    else if (c.keys.some((k) => k.split(' ').some((w) => w.startsWith(q)))) s = 45;
    else if (c.fk.split(' ').some((w) => w.startsWith(q)) || (q.length >= 4 && c.fk.indexOf(q) !== -1)) s = 30;
    else if (c.tk.startsWith(q)) s = 20;
    if (s) scored.push([s, c]);
  }
  return scored.sort((a, b) => b[0] - a[0] || a[1].n.localeCompare(b[1].n, 'nl')).slice(0, max).map((x) => x[1]);
}

// Kies club, behoud het team (bijv. "JO9-2") als dat al is ingetypt
export function withClub(text, club) {
  const { suffix } = splitTeam(text);
  return club.n + ' ' + suffix;
}

// Sleutel voor eigen kleuren: de club, anders de naam zonder teamaanduiding
export function colorKey(name) {
  const c = findClub(name);
  return c ? c.n : norm(splitTeam(name).base);
}

export function clubColors(name, overrides) {
  const key = colorKey(name);
  if (overrides && key && overrides[key]) return overrides[key];
  const c = findClub(name);
  return c && c.c ? c.c : null;
}

export function clubAbbr(name) {
  const c = findClub(name);
  if (c) return c.ab;
  const base = splitTeam(name).base || name || '';
  return base.replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase() || '?';
}
