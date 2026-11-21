// Wisselprofielen: één keuze in plaats van veel knoppen.
// Per profiel rekent de app een paar varianten van de regels door voor de spelers die er zijn
// (echte wedstrijdplannen, dezelfde berekening als langs het veld) en kiest de variant die het best past
// bij het doel van het profiel. Dat gebeurt voor het team en per wedstrijd opnieuw, met wie er dan is.
import { createMatch, matchEnd, mins } from './match.js';
import { KEY_KRACHT } from './planner.js';

const base = { evenOften: true, equalTime: true, turnsPerPeriod: 0 };
const over = (x, lim) => Math.max(0, x - lim);

export const PROFILES = {
  gelijk: {
    label: 'Iedereen even lang',
    tag: 'Eerlijkst',
    sub: 'Gelijke speeltijd gaat boven alles.',
    does: 'Elk kind speelt vrijwel even lang en gaat even vaak naar de bank. Niemand zit lang achter elkaar op de bank. Sterke en minder sterke spelers spelen evenveel.',
    variants: [
      { marge: 2, maxBenchOn: true, maxBench: 8, minInterval: 2, priority: 'eerlijk' },
      { marge: 2, maxBenchOn: true, maxBench: 10, minInterval: 2, priority: 'eerlijk' },
      { marge: 3, maxBenchOn: true, maxBench: 10, minInterval: 2, priority: 'eerlijk' },
      { marge: 4, maxBenchOn: true, maxBench: 8, minInterval: 2, priority: 'eerlijk' }
    ],
    // zo klein mogelijk verschil in speeltijd, daarna korte bankbeurten, dan pas weinig wissels
    score: (s) => s.spread * 4 + s.maxStint + s.moments * 0.25
  },
  balans: {
    label: 'In balans',
    tag: 'Aanbevolen',
    sub: 'Eerlijk, met zo min mogelijk wissels.',
    does: 'Iedereen speelt ongeveer even lang en gaat even vaak naar de bank, met zo min mogelijk wissels. Binnen die grenzen zoekt de app steeds de beste bezetting van de linies.',
    variants: [
      { marge: 4, maxBenchOn: true, maxBench: 10, minInterval: 2, priority: 'eerlijk' },
      { marge: 5, maxBenchOn: true, maxBench: 10, minInterval: 2, priority: 'eerlijk' },
      { marge: 5, maxBenchOn: true, maxBench: 12, minInterval: 2, priority: 'eerlijk' }
    ],
    score: (s) => s.moments + s.spread * 0.6 + over(s.maxStint, 10) * 1.5
  },
  rustig: {
    label: 'Rustig wisselen',
    tag: 'Minste wissels',
    sub: 'Weinig onderbrekingen, meer ritme.',
    does: 'Zo min mogelijk wissels, zodat de ploeg in zijn ritme blijft. Iedereen gaat nog steeds even vaak naar de bank en speelt ongeveer even lang, maar zit er wel langer achter elkaar.',
    variants: [
      { marge: 5, maxBenchOn: false, maxBench: 10, minInterval: 3, priority: 'eerlijk' },
      { marge: 6, maxBenchOn: true, maxBench: 15, minInterval: 3, priority: 'eerlijk' },
      { marge: 6, maxBenchOn: true, maxBench: 13, minInterval: 3, priority: 'eerlijk' },
      { marge: 7, maxBenchOn: true, maxBench: 15, minInterval: 3, priority: 'eerlijk' }
    ],
    score: (s) => s.moments * 2 + s.spread * 0.4 + over(s.maxStint, 16)
  },
  sterk: {
    label: 'Sterkste ploeg',
    tag: 'Beste bezetting',
    sub: 'De bezetting gaat voor, binnen een ruime marge.',
    does: 'De app zet zo vaak mogelijk de sterkste ploeg neer. Iedereen speelt en gaat even vaak naar de bank, maar dragende spelers staan wat langer. Het verschil in speeltijd blijft binnen een ruime marge.',
    variants: [
      { marge: 6, maxBenchOn: true, maxBench: 12, minInterval: 2, priority: 'bezetting', strongBias: 4 },
      { marge: 8, maxBenchOn: true, maxBench: 12, minInterval: 2, priority: 'bezetting', strongBias: 6 },
      { marge: 8, maxBenchOn: true, maxBench: 12, minInterval: 2, priority: 'bezetting', strongBias: 8 }
    ],
    // sterkte op het veld (gemiddelde speelkracht over de wedstrijd) telt het zwaarst
    score: (s) => -s.strength * 2 + s.moments * 0.15 + over(s.maxStint, 14)
  }
};
export const PROFILE_ORDER = ['gelijk', 'balans', 'rustig', 'sterk'];

// Teams zonder profiel: met de standaardregels is dat 'In balans', anders 'Eigen'.
export function profileOf(rules) {
  if (rules.profile) return rules.profile;
  const d = rules.marge === 5 && rules.maxBenchOn && rules.maxBench === 10 && (rules.minInterval || 2) === 2 &&
    rules.evenOften && rules.equalTime && !rules.turnsPerPeriod && rules.priority !== 'bezetting';
  return d ? 'balans' : 'eigen';
}

// Wat een plan betekent, in getallen die een coach herkent
export function statsOf(match, team) {
  const plan = match.plan;
  const end = matchEnd(team);
  const lu = match.events[0];
  const field = Object.keys(lu.pos).concat(lu.bench);
  const kr = {};
  for (const p of team.players) kr[p.id] = p.kracht;
  // sterkte: gemiddelde speelkracht op het veld, gewogen naar tijd
  const avg = (pos) => { const ids = Object.keys(pos); return ids.reduce((a, id) => a + (kr[id] != null ? kr[id] : 50), 0) / Math.max(1, ids.length); };
  let t = 0, pos = lu.pos, acc = 0;
  for (const s of plan.steps.slice().sort((a, b) => a.t - b.t)) {
    if (!s.pos) continue;
    acc += avg(pos) * (s.t - t);
    t = s.t;
    pos = s.pos;
  }
  acc += avg(pos) * Math.max(0, end - t);
  const moments = new Set(plan.steps.filter((s) => s.type === 'swap').map((s) => s.t)).size;
  const f = plan.fair;
  // dragende spelers vs de rest (alleen als groep, nooit per kind)
  const played = plan.finalPlayed || {};
  const strong = field.filter((id) => (kr[id] || 0) >= KEY_KRACHT), rest = field.filter((id) => (kr[id] || 0) < KEY_KRACHT);
  const mean = (ids) => ids.reduce((a, id) => a + (played[id] || 0), 0) / Math.max(1, ids.length);
  return {
    ok: plan.ok,
    moments,
    every: moments ? Math.round((end / (moments + team.periods)) / 30) / 2 : 0,
    minP: mins(f.minPlayed), maxP: mins(f.maxPlayed),
    spread: (f.maxPlayed - f.minPlayed) / 60,
    maxStint: (f.maxStint || 0) / 60,
    minTurns: f.minTurns, maxTurns: f.maxTurns,
    strength: end ? acc / end : 0,
    strongDelta: strong.length && rest.length ? (mean(strong) - mean(rest)) / 60 : null
  };
}

// Sleutel: alles wat de uitkomst kan veranderen
export function keyOf(key, team, present, keeperId) {
  const r = team.rules;
  const ps = team.players.filter((p) => present.indexOf(p.id) !== -1).map((p) => [p.id, p.kracht, (p.prefs || []).join(''), p.main || '', p.flex === false ? 0 : 1].join(':')).sort().join(',');
  return [key, ps, keeperId || '', team.type, team.keeper, JSON.stringify(team.lines), team.periods, team.periodMin, r.perMoment || 1, r.newLineupAtBreak ? 1 : 0].join('|');
}

const cache = new Map();
function evalVariant(team, prof, v, present, keeperId) {
  const rules = { ...base, ...v };
  let s;
  try { s = statsOf(createMatch(team, { present, keeperId, priority: v.priority, rules }), team); } catch (e) { return null; }
  // elke paar minuten een wissel is voor kinderen (en de coach) te onrustig, bij elk profiel
  const hectic = s.moments && s.every < 3 ? (3 - s.every) * 8 : 0;
  return { rules, stats: s, score: prof.score(s) + hectic + (s.ok ? 0 : 1000) };
}
export function enough(team, present, keeperId) {
  const F = team.lines.A + team.lines.M + team.lines.V;
  return present.filter((id) => id !== keeperId).length >= F;
}
function remember(ck, best) {
  if (cache.size > 60) cache.clear();
  cache.set(ck, best);
  return best;
}
// Beste variant van een profiel voor deze spelers: { rules, stats } (of null als er te weinig spelers zijn)
export function tune(team, key, present, keeperId) {
  const prof = PROFILES[key];
  if (!prof || !enough(team, present, keeperId)) return null;
  const ck = keyOf(key, team, present, keeperId);
  if (cache.has(ck)) return cache.get(ck);
  let best = null;
  for (const v of prof.variants) {
    const r = evalVariant(team, prof, v, present, keeperId);
    if (r && (!best || r.score < best.score)) best = r;
  }
  return remember(ck, best);
}
// Zelfde, maar in stapjes (één variant per keer), zodat het scherm niet hapert
export async function tuneAsync(team, key, present, keeperId, alive = () => true) {
  const prof = PROFILES[key];
  if (!prof || !enough(team, present, keeperId)) return null;
  const ck = keyOf(key, team, present, keeperId);
  if (cache.has(ck)) return cache.get(ck);
  let best = null;
  for (const v of prof.variants) {
    await new Promise((r) => setTimeout(r, 0));
    if (!alive()) return null;
    const r = evalVariant(team, prof, v, present, keeperId);
    if (r && (!best || r.score < best.score)) best = r;
  }
  return remember(ck, best);
}

// Uitkomst die al bekend is (zonder te rekenen), of undefined
export function cachedTune(team, key, present, keeperId) {
  const ck = keyOf(key, team, present, keeperId);
  return cache.has(ck) ? cache.get(ck) : undefined;
}
// Uitkomst uit de rekendraad bewaren, zodat de app hem direct kan gebruiken
export function rememberTune(team, key, present, keeperId, result) {
  remember(keyOf(key, team, present, keeperId), result);
}
// Regels voor een wedstrijd met deze spelers, als ze al bekend zijn (null = de teamregels).
// Rekenen gebeurt op de achtergrond (js/refresh.js); de teamregels zijn al afgestemd op de hele selectie.
export function matchRules(team, present, keeperId) {
  const key = profileOf(team.rules);
  if (!PROFILES[key]) return null;
  const t = cachedTune(team, key, present, keeperId);
  return t ? t.rules : null;
}

// Gevolgen in gewone taal, met de getallen van dit team
export function consequences(key, s, ref) {
  const out = [];
  const d = ref && key !== 'balans' ? s.moments - ref.moments : 0;
  out.push({ t: `${s.moments} ${s.moments === 1 ? 'wissel' : 'wissels'}, ongeveer elke ${String(s.every).replace('.', ',')} min${d ? ` (${d > 0 ? d + ' meer' : -d + ' minder'} dan In balans)` : ''}` });
  out.push({ t: s.minP === s.maxP ? `Iedereen speelt ${s.minP} min` : `Speeltijd ${s.minP}–${s.maxP} min per kind` });
  out.push({ t: s.minTurns === s.maxTurns ? `Iedereen ${s.minTurns}× naar de bank` : `${s.minTurns}–${s.maxTurns}× naar de bank` });
  const stint = Math.round(s.maxStint);
  out.push({ t: `Hooguit ${stint} min achter elkaar op de bank`, warn: stint > 12 });
  if (key === 'gelijk') out.push({ t: 'Op sommige momenten staat er een lichtere ploeg; dat hoort bij gelijk verdelen.' });
  if (key === 'rustig') out.push({ t: 'Minder onderbrekingen en meer ritme, maar langer wachten op de bank.', warn: stint > 12 });
  if (key === 'sterk') {
    if (s.strongDelta == null) out.push({ t: 'Nog geen dragende spelers ingesteld: de app kijkt dan alleen naar speelkracht.' });
    else if (Math.round(s.strongDelta) >= 1) out.push({ t: `Dragende spelers spelen gemiddeld ${Math.round(s.strongDelta)} min meer dan de rest.`, warn: true });
    else out.push({ t: 'Dragende spelers spelen ongeveer even lang als de rest.' });
  }
  if (ref && key !== 'balans' && s.moments === ref.moments && s.minP === ref.minP && s.maxP === ref.maxP && Math.round(s.maxStint) === Math.round(ref.maxStint)) {
    out.push({ t: 'Met deze selectie komt dit op hetzelfde uit als In balans.' });
  }
  if (!s.ok) out.push({ t: 'Niet alles past precies met deze selectie; dit is de eerlijkste verdeling.', warn: true });
  return out;
}
