// Wisselplanner: één wissel per moment, eerlijk verdeeld, met de beste bezetting.
// Pure functies zonder DOM, zodat ze ook in Node getest kunnen worden.
//
// Begrippen
//   t       wedstrijdtijd in seconden (loopt door over de periodes heen)
//   pos     { spelerId: 'A' | 'M' | 'V' }  veldspelers (zonder keeper) met hun linie
//   bench   [spelerId]                      bankspelers, in volgorde
//   played  { spelerId: seconden }          gespeelde tijd
//   turns   { spelerId: aantal }            aantal keer gewisseld (eruit gehaald, ook in de rust)
//   since   { spelerId: t }                 moment van laatste wissel van deze speler

export const LINES = ['V', 'M', 'A'];
export const LINE_NAMES = { A: 'achter', M: 'midden', V: 'voor' };

// Doel per linie t.o.v. het gemiddelde op het veld. Het midden hoort sterk te zijn (de as van het veld).
const TARGETS = {
  verdedigen: { A: 10, M: 10, V: -10 },
  balans: { A: 0, M: 10, V: 0 },
  aanvallen: { A: -10, M: 10, V: 10 }
};

const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);

function lineAverages(pos, players) {
  const ids = Object.keys(pos);
  const overall = avg(ids.map((id) => players[id].kracht));
  const lines = {};
  for (const line of LINES) {
    const vals = ids.filter((id) => pos[id] === line).map((id) => players[id].kracht);
    lines[line] = vals.length ? avg(vals) : null;
  }
  return { overall, lines };
}

const fieldPrefs = (p) => p.fp || (p.prefs || []).filter((x) => x !== 'K');
// Strafpunten voor een speler op een linie: dominante rol gaat voor (vast = harde regel), daarna voorkeursposities.
export const FIXED_PENALTY = 250;
function linePenalty(p, line) {
  let pen = 0;
  if (p.main && p.main !== 'K' && p.main !== line) pen += p.flex === false ? FIXED_PENALTY : 8;
  const fp = fieldPrefs(p);
  if (fp.length && fp.indexOf(line) === -1) pen += 4;
  return pen;
}

function aggregate(pos, players) {
  const ag = { sum: { A: 0, M: 0, V: 0 }, cnt: { A: 0, M: 0, V: 0 }, total: 0, n: 0, miss: 0 };
  for (const id in pos) addTo(ag, players[id], pos[id], 1);
  return ag;
}
function addTo(ag, p, line, sign) {
  ag.sum[line] += sign * p.kracht; ag.cnt[line] += sign; ag.total += sign * p.kracht; ag.n += sign; ag.miss += sign * linePenalty(p, line);
}
function scoreAgg(ag, tg) {
  const overall = ag.n ? ag.total / ag.n : 0;
  let score = 0;
  for (let i = 0; i < 3; i++) {
    const line = LINES[i];
    if (!ag.cnt[line]) continue;
    const diff = ag.sum[line] / ag.cnt[line] - (overall + tg[line]);
    score += line === 'M' ? (diff < 0 ? -diff * 1.5 : diff * 0.25) : Math.abs(diff);
  }
  return score + ag.miss;
}

// Dragende speler: vanaf dit niveau (op de schaal 0–100; stap 6 van 8 op de schuifbalk)
export const KEY_KRACHT = 75;
const STAND_LINE = { verdedigen: 'A', aanvallen: 'V' };

// Bij verdedigen minstens één dragende speler achterin (of de sterkste als er geen dragende speler staat);
// bij aanvallen hetzelfde voorin. Spelers met die voorkeurspositie krijgen voorrang via de voorkeursstraf.
export function standPenalty(pos, players, stand) {
  const line = STAND_LINE[stand];
  if (!line) return 0;
  const ids = Object.keys(pos);
  if (!ids.length) return 0;
  let keys = ids.filter((id) => players[id].kracht >= KEY_KRACHT);
  if (!keys.length) {
    const top = Math.max(...ids.map((id) => players[id].kracht));
    keys = ids.filter((id) => players[id].kracht === top);
  }
  return keys.some((id) => pos[id] === line) ? 0 : 60;
}

// Hoe goed is een opstelling? Lager is beter. Eerst kracht (balans per linie), dan voorkeurspositie.
export function lineupScore(pos, players, stand = 'balans') {
  return scoreAgg(aggregate(pos, players), TARGETS[stand] || TARGETS.balans) + standPenalty(pos, players, stand);
}

// Opstelling bij de start of na de rust: sterkste spelers eerst op hun voorkeurslinie, daarna verbeteren door te ruilen.
export function assignLines(ids, lines, players, stand = 'balans') {
  const free = { ...lines };
  const pos = {};
  const sorted = ids.slice().sort((a, b) => players[b].kracht - players[a].kracht);
  // eerst wie een vaste rol heeft, dan de sterksten
  sorted.sort((a, b) => (players[b].main && players[b].flex === false ? 1 : 0) - (players[a].main && players[a].flex === false ? 1 : 0));
  for (const id of sorted) {
    const p = players[id];
    const prefs = (p.main && p.main !== 'K' ? [p.main] : []).concat(fieldPrefs(p));
    const choice = prefs.find((l) => free[l] > 0) || ['M', 'A', 'V'].find((l) => free[l] > 0);
    if (!choice) break;
    free[choice] -= 1;
    pos[id] = choice;
  }
  const tg = TARGETS[stand] || TARGETS.balans;
  const ag = aggregate(pos, players);
  for (let round = 0; round < 4; round++) {
    let improved = false;
    const keys = Object.keys(pos);
    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        const a = keys[i], b = keys[j];
        const la = pos[a], lb = pos[b];
        if (la === lb) continue;
        const cur = scoreAgg(ag, tg) + standPenalty(pos, players, stand);
        addTo(ag, players[a], la, -1); addTo(ag, players[b], lb, -1);
        addTo(ag, players[a], lb, 1); addTo(ag, players[b], la, 1);
        pos[a] = lb; pos[b] = la;
        if (scoreAgg(ag, tg) + standPenalty(pos, players, stand) < cur - 0.5) { improved = true; }
        else { pos[a] = la; pos[b] = lb; addTo(ag, players[a], lb, -1); addTo(ag, players[b], la, -1); addTo(ag, players[a], la, 1); addTo(ag, players[b], lb, 1); }
      }
    }
    if (!improved) break;
  }
  return pos;
}

// Zet een nieuwe speler op de vrijgekomen plek, of laat één speler doorschuiven als dat duidelijk beter is.
export function placeIn(pos, out, kin, players, stand = 'balans') {
  const tg = TARGETS[stand] || TARGETS.balans;
  const spot = pos[out];
  const ag = aggregate(pos, players);
  addTo(ag, players[out], spot, -1);
  addTo(ag, players[kin], spot, 1);
  const withStand = !!STAND_LINE[stand];
  const tmp = withStand ? { ...pos } : null;
  if (withStand) { delete tmp[out]; tmp[kin] = spot; }
  let bestScore = scoreAgg(ag, tg) + (withStand ? standPenalty(tmp, players, stand) : 0);
  let shiftId = null;
  for (const id in pos) {
    const from = pos[id];
    if (id === out || from === spot) continue;
    addTo(ag, players[id], from, -1); addTo(ag, players[id], spot, 1);
    addTo(ag, players[kin], spot, -1); addTo(ag, players[kin], from, 1);
    let sp = 0;
    if (withStand) { tmp[id] = spot; tmp[kin] = from; sp = standPenalty(tmp, players, stand); tmp[id] = from; tmp[kin] = spot; }
    const sc = scoreAgg(ag, tg) + 3 + sp; // doorschuiven kost onrust op het veld
    addTo(ag, players[kin], from, -1); addTo(ag, players[kin], spot, 1);
    addTo(ag, players[id], spot, -1); addTo(ag, players[id], from, 1);
    if (sc < bestScore - 0.01) { bestScore = sc; shiftId = id; }
  }
  const best = { ...pos };
  delete best[out];
  if (shiftId) { best[kin] = pos[shiftId]; best[shiftId] = spot; } else best[kin] = spot;
  return { pos: best, shift: shiftId ? { id: shiftId, to: spot } : null, line: best[kin] };
}

export function isDisabled(state, id, t, ctx) {
  const d = state.disabled && state.disabled[id];
  if (!d) return false;
  if (d === 'wedstrijd') return true;
  // 'periode:<n>' = niet inzetbaar tot het einde van periode n
  const p = Number(String(d).split(':')[1]);
  return Math.floor(t / ctx.periodLen) <= p;
}

// Kies wie erin gaat en wie eruit.
export function chooseSwap(state, ctx, t, interval, inMode = 'played', outMode = 'played') {
  const { players, rules, stand } = ctx;
  const eligible = state.bench.filter((id) => !isDisabled(state, id, t, ctx));
  if (!eligible.length) return null;
  const fieldIds = Object.keys(state.pos);
  if (!fieldIds.length) return null;

  const byPlayed = (a, b) => (state.played[a] - state.played[b]) || (state.since[a] - state.since[b]);
  const bySince = (a, b) => (state.since[a] - state.since[b]) || (state.played[a] - state.played[b]);
  const kin = eligible.slice().sort((a, b) =>
    (inMode === 'since' ? bySince(a, b) : byPlayed(a, b)) || (players[b].kracht - players[a].kracht))[0];

  const minStint = Math.max(60, interval * 0.8);
  let cands = fieldIds.filter((id) => t - state.since[id] >= minStint);
  if (!cands.length) cands = fieldIds;
  const kDiff = (id) => Math.abs(players[id].kracht - players[kin].kracht);
  const main = players[kin].main && players[kin].main !== 'K' ? players[kin].main : null;
  const lineOk = (id) => (main && state.pos[id] !== main ? 1 : 0);
  const fair = rules.priority !== 'bezetting';
  cands.sort((a, b) => {
    if (fair) {
      if (rules.evenOften && state.turns[a] !== state.turns[b]) return state.turns[a] - state.turns[b];
      const pd = outMode === 'since' ? state.since[a] - state.since[b] : state.played[b] - state.played[a];
      if (Math.abs(pd) > 30) return pd;
      return (lineOk(a) - lineOk(b)) || (kDiff(a) - kDiff(b));
    }
    if (lineOk(a) !== lineOk(b)) return lineOk(a) - lineOk(b);
    const kd = kDiff(a) - kDiff(b);
    if (Math.abs(kd) > 5) return kd;
    return state.played[b] - state.played[a];
  });
  const kout = cands[0];
  const placed = placeIn(state.pos, kout, kin, players, stand);
  return { out: kout, in: kin, line: placed.line, shift: placed.shift, pos: placed.pos };
}

function cloneState(s) {
  return {
    pos: { ...s.pos },
    bench: s.bench.slice(),
    played: { ...s.played },
    turns: { ...s.turns },
    since: { ...s.since },
    disabled: { ...(s.disabled || {}) },
    maxStint: 0
  };
}

function noteStint(state, id, t) {
  if (state.disabled && state.disabled[id]) return;
  const len = t - (state.since[id] || 0);
  if (len > state.maxStint) state.maxStint = len;
}

function advance(state, from, to) {
  const dt = Math.max(0, to - from);
  for (const id of Object.keys(state.pos)) state.played[id] = (state.played[id] || 0) + dt;
}

function applySwap(state, sw, t) {
  noteStint(state, sw.in, t);
  state.pos = { ...sw.pos };
  state.bench = state.bench.filter((id) => id !== sw.in).concat([sw.out]);
  state.since[sw.out] = t;
  state.since[sw.in] = t;
  state.turns[sw.out] = (state.turns[sw.out] || 0) + 1;
}

// Nieuwe opstelling bij de start van een periode (de rust is een gratis moment om meerdere kinderen te wisselen).
export function breakLineup(state, ctx, t, changes = null) {
  const { players, lines, rules } = ctx;
  const F = Object.values(lines).reduce((a, b) => a + b, 0);
  const all = Object.keys(state.pos).concat(state.bench);
  const avail = all.filter((id) => !isDisabled(state, id, t, ctx));
  const fair = rules.priority !== 'bezetting';
  const onField = avail.filter((id) => id in state.pos);
  const freeSeats = Math.max(0, F - onField.length);
  const maxBench = Math.max(0, avail.length - F);
  // changes = hoeveel kinderen in de rust naar de bank gaan (null = zoveel als er bankplekken zijn)
  const nBench = changes === null ? maxBench : Math.min(maxBench, Math.max(0, changes - 0));
  void freeSeats;
  const order = onField.slice().sort((a, b) => fair
    ? ((rules.evenOften ? state.turns[a] - state.turns[b] : 0) || (state.played[b] - state.played[a]))
    : ((players[a].kracht - players[b].kracht) || (state.played[b] - state.played[a])));
  const toBench = order.slice(0, nBench);
  // wie erin komt: wie het minst gespeeld heeft
  const comeIn = avail.filter((id) => !(id in state.pos)).sort((a, b) => state.played[a] - state.played[b]);
  const stay = onField.filter((id) => toBench.indexOf(id) === -1);
  const starters = stay.concat(comeIn).slice(0, F);
  const pos = assignLines(starters, lines, players, ctx.stand);
  const bench = all.filter((id) => !(id in pos));
  return { pos, bench };
}

function applyLineup(state, lu, t) {
  for (const id of Object.keys(state.pos)) {
    if (!(id in lu.pos)) {
      state.turns[id] = (state.turns[id] || 0) + 1;
      state.since[id] = t;
    }
  }
  for (const id of Object.keys(lu.pos)) if (!(id in state.pos)) { noteStint(state, id, t); state.since[id] = t; }
  state.pos = { ...lu.pos };
  state.bench = lu.bench.slice();
}

// Simuleer de rest van de wedstrijd met m wissels (verdeeld over de resterende periodes).
function simulate(start, ctx, T, m, opt = {}) {
  const { periodLen, periods, rules } = ctx;
  const end = periods * periodLen;
  const state = cloneState(start);
  const segments = [];
  const curP = Math.min(periods - 1, Math.floor(T / periodLen));
  for (let p = curP; p < periods; p++) {
    const a = p === curP ? T : p * periodLen;
    const b = (p + 1) * periodLen;
    const first = p === curP && ctx.firstAt && ctx.firstAt > T && ctx.firstAt < b - 30 ? ctx.firstAt : null;
    if (b - a > 1) segments.push({ p, a, b, len: b - a, first });
  }
  const totalLen = segments.reduce((s, x) => s + x.len, 0);
  let left = m;
  segments.forEach((sg, i) => {
    const share = Math.round((m * sg.len) / totalLen) + (i === 0 && segments.length > 1 ? (opt.shiftFirst || 0) : 0);
    sg.k = i === segments.length - 1 ? left : Math.max(0, Math.min(left, share));
    left -= sg.k;
  });

  const steps = [];
  let now = T;
  for (const sg of segments) {
    const atBreak = sg.p > curP || (sg.p === curP && T === sg.p * periodLen && ctx.lineupPending);
    if (atBreak && sg.p > 0) {
      advance(state, now, sg.p * periodLen);
      now = sg.p * periodLen;
      if (rules.newLineupAtBreak) {
        const lu = breakLineup(state, ctx, now, opt.breakChanges === undefined ? null : opt.breakChanges);
        steps.push({ type: 'lineup', t: now, pos: lu.pos, bench: lu.bench, period: sg.p });
        applyLineup(state, lu, now);
      }
    }
    const interval = sg.first ? (sg.b - sg.first) / Math.max(1, sg.k) : sg.len / (sg.k + 1);
    for (let j = 1; j <= sg.k; j++) {
      const t = Math.round(sg.first ? sg.first + ((sg.b - sg.first) * (j - 1)) / sg.k : sg.a + (sg.len * j) / (sg.k + 1));
      advance(state, now, t);
      now = t;
      const sw = chooseSwap(state, ctx, t, interval, opt.inMode, opt.outMode);
      if (!sw) continue;
      steps.push({ type: 'swap', t, out: sw.out, in: sw.in, line: sw.line, shift: sw.shift, pos: { ...sw.pos } });
      applySwap(state, sw, t);
    }
  }
  advance(state, now, end);
  for (const id of state.bench) noteStint(state, id, end);
  return { steps, final: state };
}

export function fairness(final, ctx, ids) {
  const skip = ctx.excludeFair || [];
  const counted = ids.filter((id) => !(final.disabled && final.disabled[id] === 'wedstrijd') && skip.indexOf(id) === -1);
  const pv = counted.map((id) => final.played[id] || 0);
  const tv = counted.map((id) => final.turns[id] || 0);
  const target = ctx.rules.turnsTarget;
  const dev = target == null ? 0 : tv.reduce((a, x) => a + Math.abs(x - target), 0);
  return {
    dev,
    spread: pv.length ? Math.max(...pv) - Math.min(...pv) : 0,
    turnsDiff: tv.length ? Math.max(...tv) - Math.min(...tv) : 0,
    minPlayed: pv.length ? Math.min(...pv) : 0,
    maxPlayed: pv.length ? Math.max(...pv) : 0,
    minTurns: tv.length ? Math.min(...tv) : 0,
    maxTurns: tv.length ? Math.max(...tv) : 0,
    maxStint: final.maxStint || 0
  };
}

// Hoofdfunctie: maak het plan voor de rest van de wedstrijd vanaf tijd T.
// ctx: { players, lines, periodLen, periods, rules, stand, firstAt, lineupPending, excludeFair }
export function planRest(start, ctx, T) {
  const ids = Object.keys(start.pos).concat(start.bench);
  const end = ctx.periods * ctx.periodLen;
  const remaining = Math.max(0, end - T);
  const minInterval = Math.max(60, (ctx.rules.minInterval || 2) * 60);
  const maxM = Math.max(0, Math.floor(remaining / minInterval) - 1);
  const marge = (ctx.rules.marge || 5) * 60;
  const maxBench = ctx.rules.maxBenchOn ? (ctx.rules.maxBench || 10) * 60 : 0;
  // genormaliseerde spelers (voorkeurslinies vooraf berekend) voor snelheid
  const fast = {};
  for (const id in ctx.players) { const p = ctx.players[id]; fast[id] = { kracht: p.kracht, fp: fieldPrefs(p), main: p.main || null, flex: p.flex !== false }; }
  ctx = { ...ctx, players: fast };
  let best = null;
  const multi = Math.min(ctx.periods, ctx.periods - Math.floor(T / ctx.periodLen)) > 1;
  const variants = [];
  const B = start.bench.length;
  const breakOpts = multi && ctx.rules.newLineupAtBreak ? Array.from({ length: B + 1 }, (_, i) => B - i) : [null];
  for (const breakChanges of breakOpts) for (const shiftFirst of multi ? [0, -1, 1] : [0]) {
    for (const inMode of ['played', 'since']) for (const outMode of ['played', 'since']) variants.push({ inMode, outMode, shiftFirst, breakChanges });
  }
  if (start.bench.length) {
    for (let m = 0; m <= maxM; m++) {
      let bestOkM = null;
      for (const v of variants) {
        const sim = simulate(start, ctx, T, m, v);
        const f = fairness(sim.final, ctx, ids);
        const okTime = !ctx.rules.equalTime || f.spread <= marge;
        const fixed = ctx.rules.turnsTarget != null;
        const slack = ctx.rules.turnsSlack || 0;
        const okTurns = fixed
          ? (slack ? f.minTurns >= ctx.rules.turnsTarget && f.maxTurns <= ctx.rules.turnsTarget + slack : f.dev === 0)
          : (!ctx.rules.evenOften || f.turnsDiff <= slack);
        const okBench = !maxBench || f.maxStint <= maxBench + 1;
        const cost = (ctx.rules.equalTime ? Math.max(0, f.spread - marge) / 30 : 0) * 10 +
          (fixed ? f.dev * 20 : (ctx.rules.evenOften ? f.turnsDiff : 0) * 5) +
          (maxBench ? Math.max(0, f.maxStint - maxBench) / 60 : 0) * 3 + m * 0.05 + f.spread / 600;
        const why = [];
        if (!okTurns) why.push(fixed ? 'turns' : 'even');
        if (!okTime) why.push('time');
        if (!okBench) why.push('bench');
        const cand = { ...sim, fair: f, m, ok: okTime && okTurns && okBench, cost, why };
        if (cand.ok) { bestOkM = cand; break; }
        if (!best || cand.cost < best.cost) best = cand;
      }
      if (bestOkM) { best = bestOkM; break; }
    }
  }
  if (!best) {
    const sim = simulate(start, ctx, T, 0);
    best = { ...sim, m: 0, ok: true, cost: 0, fair: fairness(sim.final, ctx, ids) };
  }
  return best;
}

// Startsituatie voor een nieuwe wedstrijd: de sterkste spelers beginnen (de bank komt er snel in).
export function initialState(fieldIds, ctx) {
  const F = Object.values(ctx.lines).reduce((a, b) => a + b, 0);
  const sorted = fieldIds.slice().sort((a, b) => ctx.players[b].kracht - ctx.players[a].kracht);
  const starters = sorted.slice(0, F);
  const startPos = assignLines(starters, ctx.lines, ctx.players, ctx.stand);
  const bench = sorted.filter((id) => !(id in startPos));
  const played = {}, turns = {}, since = {};
  for (const id of fieldIds) { played[id] = 0; turns[id] = 0; since[id] = 0; }
  return { pos: startPos, bench, played, turns, since, disabled: {} };
}

// Balans per linie na een (voorgestelde) opstelling: neutraal, zonder niveaus te tonen.
export function lineStatus(pos, players, stand = 'balans') {
  const tg = TARGETS[stand] || TARGETS.balans;
  const { overall, lines } = lineAverages(pos, players);
  return ['A', 'M', 'V'].map((line) => {
    const a = lines[line];
    const light = a !== null && a < overall + tg[line] - 10;
    return { line, name: LINE_NAMES[line], light };
  });
}
