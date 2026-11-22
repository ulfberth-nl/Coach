// Rekenwerk voor 'Jouw plan' (de coach plant zelf). Pure functies, zonder DOM.
//
// Speelstijl
//   sterk   Sterkste opstelling: kinderen spelen in hun kracht (dominante rol leidend, voorkeur daarna) en er
//           wordt vooral binnen de linies gewisseld. Sterkere spelers staan iets langer, binnen de marge.
//   balans  Gebalanceerd: eerlijke speeltijd voorop, met oog voor voorkeursposities (vaak jongere teams).
//
// Kan de speeltijd niet precies gelijk (blokken delen niet op), dan gaat het extra blok in beide stijlen naar de
// sterkere spelers, nooit 'toevallig' naar een beginner. Gebalanceerd houdt daarnaast de ploeg zo even sterk
// mogelijk over de hele wedstrijd.
//
// Vooruitkijken: een advies op één moment kijkt naar de hele rest van de wedstrijd (met de logische momenten en
// het ritme), zodat wie alle adviezen overneemt eerlijk uitkomt in plaats van alleen het moment zelf goed te doen.

import { LINES, LINE_NAMES, assignLines, isDisabled } from './planner.js';

export const FIT = { dominant: 3, voorkeur: 2, neutraal: 1, buiten: 0 };
const fieldPrefs = (p) => p.fp || (p.prefs || []).filter((x) => x !== 'K');

// Speelt deze speler op deze linie in zijn kracht? Dominante rol gaat voor, daarna voorkeursposities.
export function fitOf(p, line) {
  if (!p) return 'neutraal';
  const main = p.main && p.main !== 'K' ? p.main : null;
  if (main && line === main) return 'dominant';
  if (main && p.flex === false) return 'buiten';
  const fp = fieldPrefs(p);
  if (fp.indexOf(line) !== -1) return 'voorkeur';
  if (!main && !fp.length) return 'neutraal';
  return 'buiten';
}
export const inKracht = (p, line) => fitOf(p, line) !== 'buiten';

// Logische wisselmomenten: 25, 50 en 75% van de periode, afgerond op hele minuten (in seconden, absolute tijd).
export function naturalMoments(L, p) {
  const out = [];
  for (const q of [0.25, 0.5, 0.75]) {
    const t = p * L + Math.round((L * q) / 60) * 60;
    if (t > p * L && t < (p + 1) * L && out.indexOf(t) === -1) out.push(t);
  }
  return out;
}

const STRONG_BIAS = 3; // seconden extra 'nodig' per punt speelkracht boven 50 (bij sterk)
// Bij gebalanceerd een heel kleine voorsprong: alleen beslissend als twee kinderen even lang speelden. Zo gaat
// een extra blok (als de speeltijd niet precies gelijk kan) naar sterkere spelers en niet toevallig naar een beginner.
const EVEN_BIAS = 0.6;
// Vooruitkijken: van twee even eerlijke uitkomsten wint die waarin sterkere spelers de extra minuten hebben
// (punten per minuut speeltijd × afwijking van de gemiddelde speelkracht / 50). Sterk genoeg om de ruis van
// blokken op halve minuten (6½ of 6 min) te winnen, te zwak om echte speeltijd te verschuiven: een heel blok
// van een beginner naar een dragende speler kost altijd meer dan het oplevert.
const TILT = { sterk: 25, balans: 12 };
// Gebalanceerd: de ploeg zo veel mogelijk even sterk over de hele wedstrijd (spreiding van de gemiddelde
// speelkracht in het veld rond het eigen gemiddelde van de wedstrijd, in punten).
const EVEN_TEAM = 1.5;
const krOf = (players, id) => (players[id] && players[id].kracht != null ? players[id].kracht : 50);

function clone(s) {
  return { pos: { ...s.pos }, bench: s.bench.slice(), played: { ...s.played }, turns: { ...s.turns }, since: { ...s.since }, disabled: { ...(s.disabled || {}) } };
}

// Hoeveel speeltijd heeft iedereen nog nodig om eerlijk uit te komen (positief = moet meer spelen)?
function needs(state, ctx, t, end, style) {
  const all = Object.keys(state.pos).concat(state.bench).filter((id) => !isDisabled(state, id, t, ctx));
  const F = Object.values(ctx.lines).reduce((a, b) => a + b, 0);
  const total = all.reduce((s, id) => s + (state.played[id] || 0), 0) + F * Math.max(0, end - t);
  const target = all.length ? total / all.length : 0;
  const need = {};
  for (const id of all) {
    const k = ctx.players[id] && ctx.players[id].kracht != null ? ctx.players[id].kracht : 50;
    need[id] = target - (state.played[id] || 0) + (style === 'sterk' ? STRONG_BIAS : EVEN_BIAS) * (k - 50);
  }
  return { need, all, F, target };
}

// Plek voor wie erin komt: op de plek van wie eruit gaat; past hij daar niet (buiten zijn kracht), dan schuift
// iemand door die daar wél past, als de nieuwe speler op diens plek in zijn kracht staat.
function placeFit(pos, out, inn, players, moved) {
  const spot = pos[out];
  const next = { ...pos };
  delete next[out];
  if (inKracht(players[inn], spot)) { next[inn] = spot; return { pos: next, shift: null }; }
  let best = null, bs = -1;
  for (const id in next) {
    if (moved.has(id) || next[id] === spot) continue;
    if (!inKracht(players[id], spot) || !inKracht(players[inn], next[id])) continue;
    const sc = FIT[fitOf(players[id], spot)] + FIT[fitOf(players[inn], next[id])];
    if (sc > bs) { bs = sc; best = id; }
  }
  if (best) { next[inn] = next[best]; next[best] = spot; return { pos: next, shift: { id: best, to: spot } }; }
  next[inn] = spot;
  return { pos: next, shift: null };
}

// Opstelling in hun kracht: ruil spelers tussen linies zolang meer kinderen op hun dominante of voorkeursplek
// komen. Daarbinnen blijft de verdeling van de kracht over de linies zoals assignLines die koos.
export function fitAssign(pos, players) {
  const next = { ...pos };
  const f = (id, l) => FIT[fitOf(players[id], l)];
  for (let round = 0; round < 6; round++) {
    let better = false;
    const keys = Object.keys(next);
    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        const a = keys[i], b = keys[j], la = next[a], lb = next[b];
        if (la === lb) continue;
        if (f(a, lb) + f(b, la) > f(a, la) + f(b, lb)) { next[a] = lb; next[b] = la; better = true; }
      }
    }
    if (!better) break;
  }
  return next;
}

// Wie wisselt er op een vrij moment (hooguit k paren)?
export function decideMoment(state, ctx, t, nextT, end, k, style, singles = false, first = []) {
  const players = ctx.players;
  const { need } = needs(state, ctx, t, end, style);
  const maxB = ctx.rules && ctx.rules.maxBenchOn ? (ctx.rules.maxBench || 10) * 60 : Infinity;
  const segLen = Math.max(0, nextT - t);
  const field = Object.keys(state.pos);
  const bench = state.bench.filter((id) => need[id] != null);
  const forced = (id) => t - (state.since[id] || 0) + segLen > maxB + 1;
  const W = style === 'sterk' ? 120 : 45;
  const Wout = style === 'sterk' ? 60 : 20;
  const cands = [];
  for (const out of field) {
    if (need[out] == null) continue;
    for (const inn of bench) {
      const gain = need[inn] - need[out];
      const f = forced(inn);
      if (gain <= 20 && !f) continue;
      const score = gain + (f ? 100000 : 0) + W * FIT[fitOf(players[inn], state.pos[out])] + Wout * (fitOf(players[out], state.pos[out]) === 'buiten' ? 1 : 0);
      cands.push({ out, inn, score });
    }
  }
  cands.sort((a, b) => b.score - a.score);
  // alleen de beste losse paren (om vooruit te kijken)
  if (singles) return cands.slice(0, k).map((c) => ({ out: c.out, in: c.inn }));
  const used = new Set();
  const pairs = [];
  let pos = { ...state.pos };
  const moved = new Set();
  const list = first.map((f) => ({ out: f.out, inn: f.in })).concat(cands);
  for (const c of list) {
    if (pairs.length >= k) break;
    if (used.has(c.out) || used.has(c.inn) || !(c.out in pos)) continue;
    const pl = placeFit(pos, c.out, c.inn, players, moved);
    pos = pl.pos;
    used.add(c.out); used.add(c.inn);
    moved.add(c.inn); if (pl.shift) moved.add(pl.shift.id);
    pairs.push({ out: c.out, in: c.inn, ...(pl.shift ? { shift: pl.shift } : {}) });
  }
  return pairs;
}

// Opstelling aan het begin van een periode volgens de speelstijl.
export function decideLineup(state, ctx, t, end, style) {
  const players = ctx.players;
  const { need, all, F } = needs(state, ctx, t, end, style);
  let starters;
  const first = all.every((id) => !(state.played[id] || 0));
  if (first && style !== 'sterk') {
    // gebalanceerd begin: sterk en minder sterk gemengd op de bank, zodat de ploeg de hele wedstrijd even sterk is
    const byK = all.slice().sort((a, b) => (players[b].kracht || 50) - (players[a].kracht || 50));
    const nB = Math.max(0, byK.length - F);
    const benchIdx = new Set();
    for (let i = 0; i < nB; i++) benchIdx.add(Math.min(byK.length - 1, Math.max(0, Math.round(((i + 1) * byK.length) / (nB + 1)) - 1)));
    starters = byK.filter((_, i) => !benchIdx.has(i)).slice(0, F);
    if (starters.length < F) starters = byK.slice(0, F);
  } else {
    starters = all.slice().sort((a, b) => need[b] - need[a]).slice(0, F);
  }
  const pos = fitAssign(assignLines(starters, ctx.lines, players, ctx.stand || 'balans'), players);
  const everyone = Object.keys(state.pos).concat(state.bench);
  return { pos, bench: everyone.filter((id) => !(id in pos)) };
}

function applySwapS(state, pr, t) {
  const pos = { ...state.pos };
  const spot = pos[pr.out];
  delete pos[pr.out];
  if (pr.shift && pr.shift.id in pos) { pos[pr.in] = pos[pr.shift.id]; pos[pr.shift.id] = spot; } else pos[pr.in] = spot;
  state.pos = pos;
  state.bench = state.bench.filter((id) => id !== pr.in).concat([pr.out]);
  state.since[pr.out] = t; state.since[pr.in] = t;
  state.turns[pr.out] = (state.turns[pr.out] || 0) + 1;
}
function applyLineupS(state, lu, t) {
  for (const id of Object.keys(state.pos)) if (!(id in lu.pos)) { state.turns[id] = (state.turns[id] || 0) + 1; state.since[id] = t; }
  for (const id of Object.keys(lu.pos)) if (!(id in state.pos)) state.since[id] = t;
  const everyone = Object.keys(state.pos).concat(state.bench);
  state.pos = { ...lu.pos };
  state.bench = everyone.filter((id) => !(id in lu.pos));
}

// Speel het plan door vanaf T0. items: [{ t, type: 'pin', pairs } | { t, type: 'lineup', pos } |
// { t, type: 'free', emit } | { t, type: 'freeLineup', emit }]. Op een vrij moment worden een paar mogelijke
// keuzes vooruit doorgespeeld tot het eind (vooruitkijken); de keuze met de beste uitkomst telt. Geeft de gekozen
// wissels (alleen bij emit), de opstellingen en de eindstand terug.
export function project({ start, T0, ctx, items, k, style, lookahead = true, snaps = false }) {
  const end = ctx.periods * ctx.periodLen;
  const isL = (x) => (x.type === 'lineup' || x.type === 'freeLineup' ? 1 : 0);
  const sorted = items.filter((x) => x.t >= T0 && x.t < end).sort((a, b) => a.t - b.t || isL(b) - isL(a));
  const st = clone(start);
  const ids = Object.keys(st.pos).concat(st.bench);
  const acc = { fit: 0, field: 0, ks: 0, kq: 0, stretch: {}, swaps: 0, moments: new Set() };
  for (const id of ids) acc.stretch[id] = 0;
  const out = { emitted: [], lineups: [], snaps: snaps ? { [T0]: { ...st.pos } } : null };
  const fin = run(st, T0, acc, sorted, 0, { ctx, k, style, end, lookahead, out });
  return { emitted: out.emitted, lineups: out.lineups, final: fin, snaps: out.snaps };
}

function cloneAcc(a) { return { fit: a.fit, field: a.field, ks: a.ks || 0, kq: a.kq || 0, stretch: { ...a.stretch }, swaps: a.swaps, moments: new Set(a.moments) }; }

function outcome(st, acc, ctx, end) {
  const ids = Object.keys(st.pos).concat(st.bench);
  const stretch = { ...acc.stretch };
  for (const id of st.bench) { const len = end - (st.since[id] || 0); if (len > stretch[id]) stretch[id] = len; }
  const avail = ids.filter((id) => !(st.disabled && st.disabled[id] === 'wedstrijd'));
  const played = avail.map((id) => st.played[id] || 0);
  // wie krijgt de extra minuten: positief als dat de sterkere spelers zijn
  const km = avail.reduce((a, id) => a + krOf(ctx.players, id), 0) / Math.max(1, avail.length);
  const tilt = avail.reduce((a, id) => a + ((st.played[id] || 0) / 60) * (krOf(ctx.players, id) - km) / 50, 0);
  return {
    tilt, kbal: acc.field ? Math.sqrt(Math.max(0, (acc.kq || 0) / acc.field - ((acc.ks || 0) / acc.field) ** 2)) : 0,
    played: { ...st.played }, turns: { ...st.turns },
    minPlayed: played.length ? Math.min(...played) : 0,
    maxPlayed: played.length ? Math.max(...played) : 0,
    maxStretch: Math.max(0, ...avail.map((id) => stretch[id] || 0)),
    stretches: avail.map((id) => stretch[id] || 0),
    swaps: acc.swaps, moments: acc.moments.size,
    kracht: acc.field ? acc.fit / acc.field : 1
  };
}

// Hoe goed is een uitkomst (lager is beter): eerlijk binnen de bankregel, dan in hun kracht, dan weinig wissels.
function badness(f, ctx, style) {
  const maxB = ctx.rules && ctx.rules.maxBenchOn ? (ctx.rules.maxBench || 10) * 60 : Infinity;
  // ook wie er nog meer te lang aan de kant zit telt mee (niet alleen de langste), zodat een gedwongen lange
  // bankbeurt niet 'gratis' meer kinderen lang laat zitten
  const overSum = maxB === Infinity || !f.stretches ? 0 : f.stretches.reduce((a, x) => a + Math.max(0, x - maxB), 0);
  const sterk = style === 'sterk';
  return (f.maxPlayed - f.minPlayed) + 1.5 * Math.max(0, f.maxStretch - maxB) + 0.6 * overSum + (1 - f.kracht) * (sterk ? 1200 : 120) + f.swaps * 4 -
    TILT[sterk ? 'sterk' : 'balans'] * (f.tilt || 0) + (sterk ? 0 : EVEN_TEAM * (f.kbal || 0));
}

// Vooruitkijken bij een vrije opstelling: wie er in de rust naar de bank gaat, bepaalt hoe de rest uitpakt.
function bestLineup(st, acc, lu, it, i, sorted, o) {
  const { ctx, style, end } = o;
  const { need, all, F } = needs(st, ctx, it.t, end, style);
  const nB = Math.max(0, all.length - F);
  if (!nB) return lu;
  // kandidaten voor de bank: wie het minst nodig heeft; bij gelijke stand eerst de minder sterke spelers
  const pool = all.slice().sort((a, b) => need[a] - need[b] || krOf(ctx.players, a) - krOf(ctx.players, b)).slice(0, Math.min(all.length, nB + 3));
  const combos = [];
  const pick = (from, chosen) => {
    if (chosen.length === nB) { combos.push(chosen.slice()); return; }
    for (let j = from; j < pool.length; j++) { chosen.push(pool[j]); pick(j + 1, chosen); chosen.pop(); }
  };
  pick(0, []);
  const everyone = Object.keys(st.pos).concat(st.bench);
  let best = lu, bs = Infinity;
  const tryLu = (cand) => {
    const s2 = clone(st), a2 = cloneAcc(acc);
    for (const id of s2.bench) if (id in cand.pos) { const len = it.t - (s2.since[id] || 0); if (len > (a2.stretch[id] || 0)) a2.stretch[id] = len; }
    applyLineupS(s2, cand, it.t);
    const f = run(s2, it.t, a2, sorted, i + 1, { ...o, lookahead: false, out: null });
    const b = badness(f, ctx, style);
    if (b < bs - 0.01) { bs = b; best = cand; }
  };
  tryLu(lu);
  for (const benchSet of combos.slice(0, 40)) {
    const starters = all.filter((id) => benchSet.indexOf(id) === -1).slice(0, F);
    if (starters.length < F) continue;
    const pos = fitAssign(assignLines(starters, ctx.lines, ctx.players, ctx.stand || 'balans'), ctx.players);
    tryLu({ pos, bench: everyone.filter((id) => !(id in pos)) });
  }
  return best;
}

function run(st, now, acc, sorted, from, o) {
  const { ctx, k, style, end } = o;
  const players = ctx.players;
  const advanceTo = (t) => {
    const dt = Math.max(0, t - now);
    if (dt > 0) {
      // gemiddelde sterkte van de ploeg in het veld, voor 'even sterk over de hele wedstrijd'
      const on = Object.keys(st.pos);
      const avg = on.reduce((a, id) => a + krOf(players, id), 0) / Math.max(1, on.length);
      const w = dt * on.length;
      acc.ks = (acc.ks || 0) + avg * w;
      acc.kq = (acc.kq || 0) + avg * avg * w;
    }
    for (const id of Object.keys(st.pos)) {
      st.played[id] = (st.played[id] || 0) + dt;
      acc.field += dt;
      if (inKracht(players[id], st.pos[id])) acc.fit += dt;
    }
    now = Math.max(now, t);
  };
  const noteBench = (id, t) => { const len = t - (st.since[id] || 0); if (len > (acc.stretch[id] || 0)) acc.stretch[id] = len; };
  const doPairs = (pairs, t) => { for (const pr of pairs) { noteBench(pr.in, t); applySwapS(st, pr, t); acc.swaps++; } if (pairs.length) acc.moments.add(t); };
  for (let i = from; i < sorted.length; i++) {
    const it = sorted[i];
    advanceTo(it.t);
    const nextT = (sorted.slice(i + 1).find((x) => x.t > it.t) || { t: end }).t;
    if (it.type === 'lineup' || it.type === 'freeLineup') {
      let lu;
      if (it.type === 'lineup') {
        // geplande opstelling; wie niet kan wordt vervangen door wie het minst speelde
        const all = Object.keys(st.pos).concat(st.bench);
        const ok = (id) => all.indexOf(id) !== -1 && !isDisabled(st, id, it.t, ctx);
        const spare = all.filter((id) => ok(id) && !(id in it.pos)).sort((a, b) => (st.played[a] || 0) - (st.played[b] || 0));
        const pos = {};
        for (const id of Object.keys(it.pos)) { if (ok(id)) pos[id] = it.pos[id]; else { const r = spare.shift(); if (r) pos[r] = it.pos[id]; } }
        lu = { pos };
      } else {
        lu = decideLineup(st, ctx, it.t, end, style);
        if (o.lookahead) lu = bestLineup(st, acc, lu, it, i, sorted, o);
      }
      for (const id of st.bench) if (id in lu.pos) noteBench(id, it.t);
      applyLineupS(st, lu, it.t);
      if (it.emit && o.out) o.out.lineups.push({ t: it.t, pos: { ...lu.pos } });
      if (o.out && o.out.snaps) o.out.snaps[it.t] = { ...st.pos };
      continue;
    }
    let pairs;
    if (it.type === 'pin') pairs = it.pairs.filter((pr) => pr.out in st.pos && st.bench.indexOf(pr.in) !== -1 && !isDisabled(st, pr.in, it.t, ctx));
    else {
      const kk = it.k || k;
      pairs = decideMoment(st, ctx, it.t, nextT, end, kk, style);
      if (o.lookahead) {
        // vooruitkijken: andere keuzes op dit moment doorspelen tot het eind en de beste nemen
        const options = [pairs];
        for (let n = pairs.length - 1; n >= 0; n--) options.push(pairs.slice(0, n));
        const firsts = decideMoment(st, ctx, it.t, nextT, end, 8, style, true);
        for (const f of firsts) {
          const rest = decideMoment(st, ctx, it.t, nextT, end, kk, style, false, [f]);
          options.push(rest);
        }
        let best = null, bs = Infinity;
        const seen = new Set();
        for (const opt of options) {
          const key = opt.map((x) => x.out + '>' + x.in).sort().join();
          if (seen.has(key)) continue;
          seen.add(key);
          const s2 = clone(st), a2 = cloneAcc(acc);
          for (const pr of opt) { const len = it.t - (s2.since[pr.in] || 0); if (len > (a2.stretch[pr.in] || 0)) a2.stretch[pr.in] = len; applySwapS(s2, pr, it.t); a2.swaps++; }
          if (opt.length) a2.moments.add(it.t);
          const f = run(s2, it.t, a2, sorted, i + 1, { ...o, lookahead: false, out: null });
          const b = badness(f, ctx, style);
          if (b < bs - 0.01) { bs = b; best = opt; }
        }
        pairs = best || pairs;
      }
    }
    doPairs(pairs, it.t);
    if (it.emit && it.type === 'free' && o.out) o.out.emitted.push({ t: it.t, pairs });
    if (o.out && o.out.snaps) o.out.snaps[it.t] = { ...st.pos };
  }
  advanceTo(end);
  return outcome(st, acc, ctx, end);
}

// Kandidaten met een reden (advies na een tik op een speler). Met out: wie erin; met inn: wie eruit.
export function candidates(state, ctx, t, end, { out = null, inn = null, exclude = [], style = 'balans', n = 3 }) {
  const players = ctx.players;
  const ex = new Set(exclude);
  const { need } = needs(state, ctx, t, end, style);
  const min = (s) => Math.round(s / 60);
  const fitText = (id, line) => {
    const f = fitOf(players[id], line);
    const where = LINE_NAMES[line];
    return f === 'dominant' ? { txt: 'sterkste plek: ' + where, good: true } : f === 'voorkeur' ? { txt: 'speelt graag ' + where, good: true } : f === 'buiten' ? { txt: 'buiten zijn kracht (' + where + ')', good: false } : null;
  };
  const W = style === 'sterk' ? 240 : 60;
  const res = [];
  if (out) {
    const line = state.pos[out];
    const benchP = state.bench.filter((id) => need[id] != null).map((id) => state.played[id] || 0);
    const leastPlayed = Math.min(...benchP);
    const leastN = benchP.filter((v) => Math.abs(v - leastPlayed) < 30).length;
    for (const id of state.bench) {
      if (ex.has(id) || need[id] == null) continue;
      const pl = placeFit(state.pos, out, id, players, new Set());
      const landed = pl.pos[id];
      const fitIn = fitOf(players[id], landed);
      const score = need[id] + W * FIT[fitIn] - (pl.shift ? 30 : 0);
      const why = [];
      const wait = min(t - (state.since[id] || 0));
      const plm = min(state.played[id] || 0);
      if (Math.abs((state.played[id] || 0) - leastPlayed) < 30 && leastN === 1 && state.bench.length > 1) why.push({ txt: 'speelde het minst (' + plm + ' min)', good: true });
      else if (wait >= 3) why.push({ txt: 'zit al ' + wait + ' min aan de kant', good: true });
      else why.push({ txt: 'speelde ' + plm + ' min', good: true });
      const ft = fitText(id, landed);
      if (ft) why.push(ft);
      res.push({ out, in: id, shift: pl.shift, score, why });
    }
  } else if (inn) {
    for (const id of Object.keys(state.pos)) {
      if (ex.has(id) || need[id] == null) continue;
      const pl = placeFit(state.pos, id, inn, players, new Set());
      const fitIn = fitOf(players[inn], pl.pos[inn]);
      const outFit = fitOf(players[id], state.pos[id]);
      const score = -need[id] + W * FIT[fitIn] + (outFit === 'buiten' ? W / 2 : 0) - (pl.shift ? 30 : 0);
      const why = [];
      const on = min(t - (state.since[id] || 0));
      why.push({ txt: 'speelt al ' + on + ' min aaneen', good: true });
      if (outFit === 'buiten') why.push({ txt: 'staat nu buiten zijn kracht', good: true });
      const ft = fitText(inn, pl.pos[inn]);
      if (ft) why.push({ ...ft, txt: ft.good ? LINE_NAMES[pl.pos[inn]] + ' past bij de nieuwe speler' : ft.txt });
      res.push({ out: id, in: inn, shift: pl.shift, score, why });
    }
  }
  res.sort((a, b) => b.score - a.score);
  return res.slice(0, n);
}

export { LINES };
