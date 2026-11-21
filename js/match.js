// Wedstrijdlogica: klok, gebeurtenissen, afgeleide stand en (her)planning.
import { naturalMoments, project, candidates as ownCands, decideLineup, fitOf, inKracht, FIT } from './ownplanner.js';
import { planRest, planPinned, planOwn, stateAt, advise, breakLineup, initialState, LINES, lineStatus, isDisabled, placeIn } from './planner.js';
import { uid } from './store.js';

export const periodLen = (team) => team.periodMin * 60;
// Opstelling van deze wedstrijd (de coach kan hem per wedstrijd veranderen door te slepen); anders die van het team.
export const linesOf = (match, team) => (match && match.lines) || team.lines;
export const formationText = (lines) => `${lines.A || 0}-${lines.M || 0}-${lines.V || 0}`;
// opstelling na het verplaatsen van één speler van linie 'from' naar 'to' (null als dat niet kan)
export function formationAfter(lines, from, to) {
  if (!from || !to || from === to || !((lines[from] || 0) > 1)) return null;
  return { ...lines, [from]: lines[from] - 1, [to]: (lines[to] || 0) + 1 };
}
const TOWARD = { V: 'Naar voren', M: 'Naar het midden', A: 'Naar achteren' };
export const formationLabel = (lines, from, to) => { const n = formationAfter(lines, from, to); return n ? `${TOWARD[to]} · ${formationText(n)}` : null; };
export const matchEnd = (team) => team.periods * periodLen(team);

export function playersMap(team) {
  const map = {};
  for (const p of team.players) map[p.id] = { kracht: p.kracht, prefs: p.prefs || [], main: p.main || null, flex: p.flex !== false, nick: p.nick || p.name, name: p.name };
  return map;
}

export function nickOf(team, id) {
  const p = team.players.find((x) => x.id === id);
  return p ? (p.nick || p.name) : '?';
}

// ---------- klok ----------
export function elapsedInPeriod(match, ms = Date.now()) {
  const c = match.clock;
  return c.accum + (c.running ? (ms - c.startedAt) / 1000 : 0);
}

// Wedstrijdtijd in seconden; blijft binnen de huidige periode, ook als de klok doorloopt.
export function gameTime(match, team, ms = Date.now()) {
  const L = periodLen(team);
  if (match.finished) return match.endT != null ? match.endT : matchEnd(team);
  return match.clock.period * L + Math.min(elapsedInPeriod(match, ms), L - 1);
}

export function periodLabel(team, p) {
  if (team.periods === 2) return p === 0 ? '1e helft' : '2e helft';
  if (team.periods === 4) return (p + 1) + 'e kwart';
  return 'Periode ' + (p + 1);
}

export function periodWord(team) {
  return team.periods === 2 ? 'helft' : team.periods === 4 ? 'kwart' : 'periode';
}

export const fmt = (sec) => {
  const s = Math.max(0, Math.round(sec));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
};
export const mins = (sec) => Math.round(Math.max(0, sec) / 60);

// ---------- vaste plekken op het veld per linie ----------
export function makeSlots(pos, lines, players) {
  const slots = {};
  for (const l of LINES) {
    const ids = Object.keys(pos).filter((id) => pos[id] === l)
      .sort((a, b) => (players[b] ? players[b].kracht : 0) - (players[a] ? players[a].kracht : 0));
    const n = lines[l] || 0;
    const mid = Math.floor((n - 1) / 2);
    const seq = [mid];
    for (let d = 1; seq.length < n; d++) { if (mid + d < n) seq.push(mid + d); if (mid - d >= 0 && seq.length < n) seq.push(mid - d); }
    const order = [];
    ids.forEach((id, i) => { if (i < n) order[seq[i]] = id; });
    for (let i = 0; i < n; i++) slots[l + i] = order[i] || null;
  }
  return slots;
}

export function slotOf(slots, id) {
  return Object.keys(slots).find((k) => slots[k] === id);
}

// Pas een wissel toe op de vaste plekken (wie erin komt neemt de plek; bij doorschuiven ruilen de plekken).
// Plek op het veld in coachtaal: linksvoor, rechtsachter, centraal midden, … (links = links op het scherm,
// het team speelt naar boven). Bij één speler in een linie: voorin, in het midden, achterin.
const BASE = { V: 'voor', M: 'midden', A: 'achter' };
export function posName(line, i, n) {
  if (!line) return null;
  if (n <= 1) return { V: { op: 'voorin', naar: 'naar voren', kort: 'voorin' }, M: { op: 'in het midden', naar: 'naar het midden', kort: 'midden' }, A: { op: 'achterin', naar: 'naar achteren', kort: 'achterin' } }[line];
  const mid = (n - 1) / 2;
  let name;
  if (i === 0) name = 'links' + BASE[line];
  else if (i === n - 1) name = 'rechts' + BASE[line];
  else if (i === mid) name = line === 'V' ? 'midvoor' : 'centraal ' + BASE[line];
  else name = 'centraal ' + BASE[line] + (i < mid ? ' links' : ' rechts');
  return { op: 'op ' + name, naar: 'naar ' + name, kort: name };
}
const posOf = (slots, lines, id) => { const k = slotOf(slots, id); return k ? posName(k[0], +k.slice(1), lines[k[0]] || 0) : null; };

// Het verhaal van een wisselmoment: per paar wie erin komt voor wie, waar hij gaat spelen en wie doorschuift
// (en waarheen). Paren gaan na elkaar, zoals de wissels zelf.
export function swapStory(slots, lines, pairs) {
  let cur = { ...slots };
  return pairs.map((p) => {
    const shift = p.shift && slotOf(cur, p.shift.id) ? p.shift.id : null;
    const out = posOf(cur, lines, p.out);
    const line = shift ? { in: p.in, out: p.out, shift, shiftPos: out, inPos: posOf(cur, lines, shift) } : { in: p.in, out: p.out, inPos: out };
    cur = slotSwap(cur, p.out, p.in, shift ? p.shift : null);
    return line;
  });
}

// Plekwissels in coachtaal: wie ruilt met wie, en waar elk daarna staat (na de wissels van dat moment).
export function moveStory(slots, lines, moves) {
  let cur = { ...slots };
  return moves.map((mv) => {
    const sa = slotOf(cur, mv.a), sb = slotOf(cur, mv.b);
    if (!sa || !sb) return { a: mv.a, b: mv.b };
    const st = { a: mv.a, b: mv.b, aPos: posName(sb[0], +sb.slice(1), lines[sb[0]] || 0), bPos: posName(sa[0], +sa.slice(1), lines[sa[0]] || 0) };
    cur = { ...cur, [sa]: mv.b, [sb]: mv.a };
    return st;
  });
}

// Plekken na een rij wissels (voor het verhaal van het moment daarna).
export function slotsAfter(slots, pairs) {
  let cur = { ...slots };
  for (const p of pairs) cur = slotSwap(cur, p.out, p.in, p.shift && slotOf(cur, p.shift.id) ? p.shift : null);
  return cur;
}

export function slotSwap(slots, out, inn, shift) {
  const next = { ...slots };
  const outSlot = slotOf(next, out);
  if (shift && slotOf(next, shift.id)) {
    const shiftSlot = slotOf(next, shift.id);
    next[outSlot] = shift.id;
    next[shiftSlot] = inn;
  } else if (outSlot) {
    next[outSlot] = inn;
  }
  return next;
}

// Keeper wisselen: nieuwe keeper komt van de bank of uit het veld; de oude keeper gaat naar de bank
// (mode 'bank' of 'klaar') of neemt de veldplek over (mode 'veld'). Bij een veldspeler als nieuwe keeper
// vult ev.fill (een bankspeler) zo nodig de lege plek.
export function applyKeeperChange(s, ev) {
  const old = s.keeper, nw = ev.to;
  if (!nw || nw === old) return;
  if (nw in s.pos) {
    const line = s.pos[nw];
    const slot = slotOf(s.slots, nw);
    const pos = { ...s.pos };
    delete pos[nw];
    const slots = { ...s.slots };
    let bench = s.bench.slice();
    if (ev.mode === 'veld' && old) { pos[old] = line; slots[slot] = old; }
    else {
      if (ev.fill && bench.indexOf(ev.fill) !== -1) { bench = bench.filter((x) => x !== ev.fill); pos[ev.fill] = line; slots[slot] = ev.fill; }
      else slots[slot] = null;
      if (old) bench.push(old);
    }
    s.pos = pos; s.slots = slots; s.bench = bench;
  } else {
    s.bench = s.bench.filter((x) => x !== nw).concat(old ? [old] : []);
  }
  s.keeper = nw;
}

// ---------- afgeleide stand uit de gebeurtenissen ----------
export function derive(match, team, T) {
  const players = playersMap(team);
  const L = periodLen(team);
  const st = { pos: {}, bench: [], played: {}, turns: {}, since: {}, disabled: {}, slots: {}, keeper: match.keeperId || null };
  const score = { us: 0, them: 0 };
  const goals = {};
  const lineTime = {};
  const late = [];
  const init = (id) => { st.played[id] = 0; st.turns[id] = 0; st.since[id] = 0; lineTime[id] = { A: 0, M: 0, V: 0, K: 0 }; };
  for (const id of match.present) init(id);
  let last = 0;
  const advance = (to) => {
    const dt = Math.max(0, to - last);
    if (dt > 0) {
      for (const id of Object.keys(st.pos)) { st.played[id] += dt; lineTime[id][st.pos[id]] += dt; }
      if (st.keeper && lineTime[st.keeper]) lineTime[st.keeper].K += dt;
    }
    last = Math.max(last, to);
  };
  let first = true;
  for (const ev of match.events) {
    if (ev.t > T + 0.5) break;
    advance(ev.t);
    if (ev.type === 'lineup') {
      if (!first) {
        for (const id of Object.keys(st.pos)) if (!(id in ev.pos)) { st.turns[id] += 1; st.since[id] = ev.t; }
        for (const id of Object.keys(ev.pos)) if (!(id in st.pos)) st.since[id] = ev.t;
      }
      st.pos = { ...ev.pos };
      st.bench = ev.bench.slice();
      st.slots = ev.slots ? { ...ev.slots } : makeSlots(ev.pos, linesOf(match, team), players);
      first = false;
    } else if (ev.type === 'formation') {
      if (st.pos[ev.playerId]) {
        st.slots = moveSlot(st.slots, ev.playerId, ev.from, ev.to, ev.lines, ev.at);
        st.pos = { ...st.pos, [ev.playerId]: ev.to };
      }
    } else if (ev.type === 'swap') {
      st.slots = slotSwap(st.slots, ev.out, ev.in, ev.shift);
      const newPos = { ...st.pos };
      delete newPos[ev.out];
      if (ev.shift && ev.shift.id in newPos) {
        newPos[ev.in] = newPos[ev.shift.id];
        newPos[ev.shift.id] = ev.shift.to;
      } else {
        newPos[ev.in] = st.pos[ev.out];
      }
      st.pos = newPos;
      st.bench = st.bench.filter((id) => id !== ev.in).concat([ev.out]);
      st.turns[ev.out] += 1;
      st.since[ev.out] = ev.t;
      st.since[ev.in] = ev.t;
    } else if (ev.type === 'goal') {
      score.us += 1;
      if (ev.scorer) goals[ev.scorer] = (goals[ev.scorer] || 0) + 1;
    } else if (ev.type === 'oppgoal') {
      score.them += 1;
    } else if (ev.type === 'disable') {
      st.disabled[ev.playerId] = ev.mode;
    } else if (ev.type === 'enable') {
      delete st.disabled[ev.playerId];
    } else if (ev.type === 'periodEnd') {
      last = Math.max(last, (ev.period + 1) * L);
    } else if (ev.type === 'keeper') {
      const old = st.keeper;
      applyKeeperChange(st, ev);
      if (old) { st.since[old] = ev.t; if (late.indexOf(old) === -1) late.push(old); if (ev.mode === 'klaar') st.disabled[old] = 'wedstrijd'; }
      if (ev.fill) st.since[ev.fill] = ev.t;
    } else if (ev.type === 'move') {
      const la = st.pos[ev.a], lb = st.pos[ev.b];
      if (la && lb) {
        st.pos = { ...st.pos, [ev.a]: lb, [ev.b]: la };
        const sa = slotOf(st.slots, ev.a), sb = slotOf(st.slots, ev.b);
        st.slots = { ...st.slots, [sa]: ev.b, [sb]: ev.a };
      }
    } else if (ev.type === 'join') {
      if (!(ev.playerId in st.played)) init(ev.playerId);
      if (st.bench.indexOf(ev.playerId) === -1 && !(ev.playerId in st.pos)) st.bench.push(ev.playerId);
      st.since[ev.playerId] = ev.t;
      late.push(ev.playerId);
    }
  }
  advance(T);
  for (const id of Object.keys(st.disabled)) {
    if (st.disabled[id] !== 'wedstrijd' && !isDisabled(st, id, T, { periodLen: L })) delete st.disabled[id];
  }
  return { state: st, score, goals, lineTime, late };
}

// ---------- opstellingsstand ----------
export function currentStand(match, team, score) {
  const r = team.rules;
  if (match.standMode === 'manual' || !r.autoStand) return match.manualStand || 'balans';
  const d = score.us - score.them;
  return d < 0 ? r.standAchter : d > 0 ? r.standVoor : r.standGelijk;
}

// Regels die voor deze wedstrijd gelden: de teamregels, aangevuld met wat het wisselprofiel
// voor de spelers van deze wedstrijd heeft uitgerekend (match.rules).
// Eerlijkheid voor deze wedstrijd (planner): strenger of ruimer dan het profiel van het team.
export const FAIR_ADJ = {
  strenger: (r) => ({ equalTime: true, marge: Math.max(2, (r.marge || 5) - 2), maxBenchOn: true, maxBench: Math.max(6, (r.maxBench || 10) - 2) }),
  ruimer: (r) => ({ marge: (r.marge || 5) + 3, maxBench: (r.maxBench || 10) + 4, turnsSlack: 1 })
};
export function effRules(match, team) {
  const r = match && match.rules ? { ...team.rules, ...match.rules } : team.rules;
  const adj = match && FAIR_ADJ[match.fairness];
  return adj ? { ...r, ...adj(r) } : r;
}

export function setFairness(match, team, v) {
  match.fairness = FAIR_ADJ[v] ? v : null;
  replan(match, team);
}

// Aantal keer gewisseld per kind voor de hele wedstrijd (null = de app kiest zelf).
export function turnsTarget(team, match = null) {
  const k = effRules(match, team).turnsPerPeriod;
  return k ? k * team.periods : null;
}

export function makeCtx(match, team, stand) {
  const r = effRules(match, team);
  return {
    players: playersMap(team),
    lines: linesOf(match, team),
    periodLen: periodLen(team),
    periods: team.periods,
    rules: { ...r, priority: match.priority || r.priority, turnsTarget: turnsTarget(team, match), turnsSlack: r.turnsSlack || 0 },
    stand
  };
}

export function lineupPending(match, team) {
  const p = match.clock.period;
  // eigen plan: na de rust kiest de coach altijd de opstelling (zijn plan, of zoals start of eind)
  return !match.finished && p > 0 && !match.clock.running && match.clock.accum === 0 &&
    (!!team.rules.newLineupAtBreak || isOwn(match, team)) && !match.events.some((e) => e.type === 'lineup' && e.period === p);
}

// Ankerpunt van het plan: de laatste wissel of opstelling in deze periode. Zo verschuift het plan niet bij een goal.
function planAnchor(match, team, T) {
  const L = periodLen(team);
  const pStart = Math.floor(T / L) * L;
  let anchor = pStart;
  for (const e of match.events) {
    if (e.t > T + 0.5) break;
    if ((e.type === 'swap' || e.type === 'lineup' || e.type === 'join' || e.type === 'keeper') && e.t >= anchor) anchor = e.t;
  }
  return Math.min(anchor, T);
}

// Vastgezette momenten die nog gelden (vanaf het ankerpunt tot het einde), op tijd.
function activePins(match, anchor, end) {
  const list = (match.pins || []).map((p) => ({ ...p, pairs: p.pairs.slice() }));
  const fx = match.fixed;
  if (fx && !list.some((p) => p.t === fx.t)) list.push({ t: fx.t, pairs: fx.pairs || [{ out: fx.out, in: fx.in }], after: fx.after });
  // game plan: een moment met alleen plekwissels telt ook
  return list.filter((p) => p.t >= anchor && p.t < end - 1 && p.pairs && (p.pairs.length || (p.moves && p.moves.length))).sort((a, b) => a.t - b.t);
}

// Een moment vastzetten (speldje): op tijd t gebeuren precies deze wissels. Vervangt een speldje op dat moment.
export function pinMoment(match, team, t, pairs, after = 'terug') {
  const list = (match.pins || []).filter((p) => p.t !== t);
  if (match.fixed && match.fixed.t === t) match.fixed = null;
  list.push({ t, pairs: pairs.map((p) => ({ out: p.out, in: p.in, ...(p.shift ? { shift: { id: p.shift.id, to: p.shift.to } } : {}) })), after });
  match.pins = list.sort((a, b) => a.t - b.t);
  match.firstAt = null;
  replan(match, team);
}

// Speldje weghalen: de app kiest op dat moment weer zelf.
export function unpinMoment(match, team, t) {
  match.pins = (match.pins || []).filter((p) => p.t !== t);
  if (match.fixed && match.fixed.t === t) match.fixed = null;
  replan(match, team);
}

export const isPinned = (match, t) => (match.pins || []).some((p) => p.t === t) || !!(match.fixed && match.fixed.t === t);

// Na een uitgevoerde wissel: speldjes die nu aan de beurt (of voorbij) zijn vervallen; deed de coach de wissel
// van het eerstvolgende speldje alvast, dan is dat paar gebeurd.
function consumePins(match, T, pairs) {
  if (!match.pins || !match.pins.length) return;
  let list = match.pins.filter((p) => p.t > T + 0.5).sort((a, b) => a.t - b.t);
  if (list.length) {
    const done = new Set(pairs.map((p) => p.out + '>' + p.in));
    const rest = list[0].pairs.filter((p) => !done.has(p.out + '>' + p.in));
    if (rest.length !== list[0].pairs.length) list = rest.length ? [{ ...list[0], pairs: rest }].concat(list.slice(1)) : list.slice(1);
  }
  match.pins = list;
}

export function replan(match, team, ms = Date.now()) {
  const T = gameTime(match, team, ms);
  const d = derive(match, team, T);
  const stand = currentStand(match, team, d.score);
  const ctx = makeCtx(match, team, stand);
  const anchor = planAnchor(match, team, T);
  const st = d.state;
  if (T > anchor) for (const id of Object.keys(st.pos)) st.played[id] -= T - anchor;
  ctx.lineupPending = lineupPending(match, team);
  ctx.firstAt = match.firstAt && match.firstAt > anchor ? match.firstAt : null;
  ctx.excludeFair = d.late;
  // speldjes: momenten die de coach heeft vastgezet (ook de 'bewaarde wissel'); de rest rekent de app zelf
  const pins = activePins(match, anchor, matchEnd(team));
  // eigen plan: precies wat de coach plande (wissels en opstellingen per periode), geen advies
  if (isOwn(match, team)) {
    const r = planOwn(st, ctx, anchor, pins, match.periodLineups || {});
    match.plan = { at: anchor, stand, own: true, steps: r.steps, ok: r.ok, why: r.why || [], relaxed: false, broken: r.broken || [], fair: r.fair, finalPlayed: r.final.played, finalTurns: r.final.turns };
    return match;
  }
  const plan = (c) => {
    const free = planRest(st, c, anchor);
    if (!pins.length) return free;
    const grid = free.steps.filter((x) => x.type === 'swap').map((x) => x.t);
    return { ...planPinned(st, c, anchor, pins, grid), free };
  };
  let r = plan(ctx);
  const swapsOf = (x) => x.steps.filter((s) => s.type === 'swap').length;
  // met speldjes: past de rest niet meer precies binnen de regels, dan mag het verschil 1 beurt zijn in plaats
  // van ineens veel meer wissels
  if (pins.length && (!r.ok || swapsOf(r) > swapsOf(r.free) + 1)) {
    const r2 = plan({ ...ctx, rules: { ...ctx.rules, turnsSlack: 1 } });
    if ((r2.ok && !r.ok) || swapsOf(r2) < swapsOf(r)) r = { ...r2, relaxed: true };
  }
  if (!match.started) {
    match.baseline = swapsOf(r.free || r);
  } else if (match.baseline != null) {
    // na een afwijking (extra of vroege wissel) niet ineens veel meer wissels: dan mag het verschil 1 beurt zijn
    const end = matchEnd(team);
    const expected = Math.ceil(match.baseline * (end - anchor) / end) + 1;
    if (!r.ok || swapsOf(r) > expected + 1) {
      const r2 = plan({ ...ctx, rules: { ...ctx.rules, turnsSlack: 1 } });
      if (r2.ok && swapsOf(r2) < swapsOf(r)) r = { ...r2, relaxed: true };
    }
  }
  match.plan = {
    at: anchor,
    stand,
    steps: r.steps,
    ok: r.ok,
    why: r.why || [],
    relaxed: !!r.relaxed,
    broken: r.broken || [],
    fair: r.fair,
    finalPlayed: r.final.played,
    finalTurns: r.final.turns
  };
  return match;
}

// ---------- eigen plan (de coach plant zelf, advies alleen op verzoek) ----------
export const isOwn = (match, team) => (match && match.planMode ? match.planMode : team && team.rules && team.rules.planMode) === 'eigen';

// Wie maakt het plan voor deze wedstrijd: 'app' of 'eigen'. Bij overstappen naar eigen kan het plan van de app
// als begin dienen (seed): de wissels worden speldjes, de opstellingen per periode die van de app.
export function setPlanMode(match, team, mode, seed = false) {
  const was = isOwn(match, team);
  // terug naar de app: jouw plan blijft bewaard voor als je weer zelf gaat plannen
  if (mode !== 'eigen' && was) {
    match.ownStash = { pins: match.pins || [], periodLineups: match.periodLineups || null };
    match.pins = [];
    match.periodLineups = null;
  } else if (mode === 'eigen' && !was && match.ownStash && (match.ownStash.pins.length || match.ownStash.periodLineups) && !seed) {
    match.pins = match.ownStash.pins.filter((p) => !match.started || p.t > gameTime(match, team));
    match.periodLineups = match.ownStash.periodLineups;
    match.ownStash = null;
    match.planMode = mode;
    replan(match, team);
    return;
  }
  if (mode === 'eigen' && seed && match.plan) {
    const T = gameTime(match, team);
    const byT = {};
    for (const s of match.plan.steps) {
      if (s.t < T) continue;
      if (s.type === 'swap') (byT[s.t] = byT[s.t] || []).push({ out: s.out, in: s.in, shift: s.shift || null });
      else if (s.type === 'lineup' && s.period > 0) {
        match.periodLineups = { ...(match.periodLineups || {}), [s.period]: { pos: { ...s.pos }, bench: s.bench.slice(), slots: makeSlots(s.pos, linesOf(match, team), playersMap(team)) } };
      }
    }
    match.pins = Object.keys(byT).map((t) => ({ t: +t, pairs: byT[t], after: 'terug' })).sort((a, b) => a.t - b.t);
    match.ownStash = null;
  }
  match.planMode = mode;
  replan(match, team);
}

// Opstelling voor het begin van periode p in het eigen plan (p = 0: de startopstelling van de wedstrijd).
export function setPeriodLineup(match, team, p, lu) {
  if (p === 0 && !match.started) {
    const ev = match.events[0];
    match.events[0] = { ...ev, pos: { ...lu.pos }, bench: lu.bench.slice(), slots: { ...lu.slots } };
    // bewaard, zodat hij blijft staan als de app de wedstrijd opnieuw opbouwt
    if (isOwn(match, team)) match.periodLineups = { ...(match.periodLineups || {}), 0: { pos: { ...lu.pos }, bench: lu.bench.slice(), slots: { ...lu.slots } } };
  } else {
    match.periodLineups = { ...(match.periodLineups || {}), [p]: { pos: { ...lu.pos }, bench: lu.bench.slice(), slots: { ...lu.slots } } };
  }
  replan(match, team);
}

export function clearPeriodLineup(match, team, p) {
  if (!match.periodLineups) return;
  const next = { ...match.periodLineups };
  delete next[p];
  match.periodLineups = next;
  replan(match, team);
}

// Startpunt om vooruit te plannen: nu (lopende wedstrijd) of de aftrap.
function planStart(match, team) {
  const T = match.started ? gameTime(match, team) : 0;
  const d = derive(match, team, T);
  const anchor = match.plan && match.plan.at != null ? Math.min(match.plan.at, T) : T;
  const st = d.state;
  if (T > anchor) for (const id of Object.keys(st.pos)) st.played[id] -= T - anchor;
  return { st, anchor, T };
}

// Situatie volgens het plan op tijd t (inclusive = wissels op t al gedaan), met gespeelde tijd per kind.
export function planStateAt(match, team, t, inclusive = false) {
  const { st, anchor } = planStart(match, team);
  return stateAt(st, anchor, (match.plan && match.plan.steps) || [], t, inclusive);
}

// Advies op verzoek: wie erin voor 'out', wie eruit voor 'inn', of de beste hele wissel op tijd t.
// Staat er op t al een wissel (exclude: wie daar al wisselt), dan advies voor een extra wissel na die wissel.
export function adviseAt(match, team, t, out = null, inn = null, exclude = []) {
  const state = planStateAt(match, team, t, exclude.length > 0);
  const ctx = makeCtx(match, team, match.plan ? match.plan.stand : 'balans');
  return advise(state, ctx, t, out, inn, exclude);
}

// Opstelling die de app zou adviseren aan het begin van periode p (volgens het plan tot dan).
export function adviseLineup(match, team, p) {
  const t = p * periodLen(team);
  const state = planStateAt(match, team, t, false);
  const ctx = makeCtx(match, team, match.plan ? match.plan.stand : 'balans');
  const lu = breakLineup(state, ctx, t, null);
  return { pos: lu.pos, bench: lu.bench, slots: makeSlots(lu.pos, linesOf(match, team), playersMap(team)) };
}

// Opstellingen om uit te kiezen bij het begin van periode p in het eigen plan.
export function periodOptions(match, team, p) {
  const L = periodLen(team);
  const players = playersMap(team);
  const lines = linesOf(match, team);
  const steps = (match.plan && match.plan.steps) || [];
  const startOf = (q) => {
    if (q === 0) { const ev = match.events[0]; return { pos: ev.pos, bench: ev.bench, slots: ev.slots || makeSlots(ev.pos, lines, players) }; }
    const ev = match.events.find((e) => e.type === 'lineup' && e.period === q);
    if (ev) return { pos: ev.pos, bench: ev.bench, slots: ev.slots || makeSlots(ev.pos, lines, players) };
    const s = steps.find((x) => x.type === 'lineup' && x.period === q);
    if (s) return { pos: s.pos, bench: s.bench, slots: s.slots ? { ...s.slots } : makeSlots(s.pos, lines, players), own: !!s.own };
    return null;
  };
  // het eind van de vorige periode: de situatie vlak voor de rust
  const endPrev = p > 0 ? planStateAt(match, team, p * L - 0.5, true) : null;
  const sameKeeper = (lu) => lu;
  return {
    current: startOf(p),
    start: p > 0 ? sameKeeper(startOf(p - 1)) : null,
    eind: endPrev ? { pos: { ...endPrev.pos }, bench: endPrev.bench.slice(), slots: makeSlots(endPrev.pos, lines, players) } : null,
    advies: adviseLineup(match, team, p)
  };
}

// Vul de rest van deze periode aan: de app plant de wissels na 'fromT' tot de rust, als speldjes.
export function ownFillPeriod(match, team, fromT) {
  const L = periodLen(team);
  const end = Math.min(matchEnd(team), (Math.floor(fromT / L) + 1) * L);
  const state = planStateAt(match, team, fromT, true);
  const ctx = makeCtx(match, team, match.plan ? match.plan.stand : 'balans');
  ctx.lineupPending = false;
  ctx.firstAt = null;
  const r = planRest(state, ctx, fromT);
  const have = new Set((match.pins || []).map((p) => p.t));
  const byT = {};
  for (const s of r.steps) if (s.type === 'swap' && s.t > fromT + 1 && s.t < end - 1 && !have.has(s.t)) (byT[s.t] = byT[s.t] || []).push({ out: s.out, in: s.in, shift: s.shift || null });
  const add = Object.keys(byT).map((t) => ({ t: +t, pairs: byT[t], after: 'terug' }));
  match.pins = (match.pins || []).concat(add).sort((a, b) => a.t - b.t);
  replan(match, team);
  return add.length;
}

// Een gepland moment verschuiven in de tijd.
export function moveMoment(match, team, t, toT) {
  match.pins = (match.pins || []).map((p) => (p.t === t ? { ...p, t: toT } : p)).sort((a, b) => a.t - b.t);
  replan(match, team);
}

// ---------- wedstrijd aanmaken ----------
export function createMatch(team, opts) {
  const players = playersMap(team);
  const present = opts.present.slice();
  const keeperId = team.keeper ? opts.keeperId || null : null;
  const fieldIds = present.filter((id) => id !== keeperId);
  const match = {
    id: uid(),
    teamId: team.id,
    opponent: opts.opponent || '',
    date: opts.date || new Date().toISOString().slice(0, 10),
    present,
    keeperId,
    priority: opts.priority || (opts.rules && opts.rules.priority) || team.rules.priority,
    rules: opts.rules || null,
    lines: opts.lines || null,
    // speldjes, eerlijkheid en focus voor deze wedstrijd blijven staan als de app de wedstrijd opnieuw opbouwt
    pins: opts.pins ? opts.pins.map((p) => ({ ...p, pairs: p.pairs.slice() })) : [],
    fairness: opts.fairness || null,
    planMode: opts.planMode || null,
    periodLineups: opts.periodLineups ? JSON.parse(JSON.stringify(opts.periodLineups)) : null,
    ownStash: opts.ownStash ? JSON.parse(JSON.stringify(opts.ownStash)) : null,
    planStyle: opts.planStyle || null,
    planRhythm: opts.planRhythm || null,
    ownSteps: opts.ownSteps ? JSON.parse(JSON.stringify(opts.ownSteps)) : null,
    gameplan: opts.gameplan ? JSON.parse(JSON.stringify(opts.gameplan)) : null,
    standMode: opts.standMode || 'auto',
    manualStand: opts.manualStand || 'balans',
    clock: { period: 0, running: false, startedAt: 0, accum: 0 },
    started: false,
    finished: false,
    firstAt: null,
    events: [],
    plan: null
  };
  const ctx = makeCtx(match, team, 'balans');
  const st = initialState(fieldIds, ctx);
  // eigen plan: de startopstelling van de coach blijft staan zolang hij nog klopt (zelfde spelers en opstelling)
  const own0 = isOwn(match, team) && match.periodLineups && match.periodLineups[0];
  const lines = linesOf(match, team);
  const F = Object.values(lines).reduce((a, b) => a + b, 0);
  const fits = own0 && Object.keys(own0.pos).length === F && Object.keys(own0.pos).every((id) => fieldIds.indexOf(id) !== -1) &&
    Object.keys(own0.slots || {}).every((k) => +k.slice(1) < (lines[k[0]] || 0)) && LINES.every((l) => Object.keys(own0.pos).filter((id) => own0.pos[id] === l).length === (lines[l] || 0));
  if (fits) match.events.push({ id: uid(), type: 'lineup', t: 0, period: 0, pos: { ...own0.pos }, bench: fieldIds.filter((id) => !(id in own0.pos)), slots: { ...own0.slots } });
  else match.events.push({ id: uid(), type: 'lineup', t: 0, period: 0, pos: st.pos, bench: st.bench, slots: makeSlots(st.pos, lines, players) });
  if (match.gameplan) gpClean(match);
  replan(match, team);
  return match;
}

// Vooraf: hoeveel wissels levert deze selectie op?
export function previewPlan(team, present, keeperId, priority) {
  const field = present.filter((id) => id !== keeperId);
  const F = Object.values(team.lines).reduce((a, b) => a + b, 0);
  if (field.length < F) return null;
  return createMatch(team, { present, keeperId, priority }).plan;
}

// Twee spelers ruilen in een opstelling (veld↔veld of veld↔bank). Geeft een nieuwe opstelling terug.
export function swapInLineup(lu, a, b) {
  const slots = { ...lu.slots };
  const pos = { ...lu.pos };
  let bench = lu.bench.slice();
  const sa = slotOf(slots, a), sb = slotOf(slots, b);
  if (sa && sb) {
    slots[sa] = b; slots[sb] = a;
    const la = pos[a]; pos[a] = pos[b]; pos[b] = la;
  } else if (sa && !sb) {
    slots[sa] = b; pos[b] = pos[a]; delete pos[a];
    bench = bench.map((x) => (x === b ? a : x));
  } else if (!sa && sb) {
    slots[sb] = a; pos[a] = pos[b]; delete pos[b];
    bench = bench.map((x) => (x === a ? b : x));
  }
  return { pos, bench, slots };
}

export function swapInStartLineup(match, team, a, b) {
  const ev = match.events[0];
  const players = playersMap(team);
  const lu = swapInLineup({ pos: ev.pos, bench: ev.bench, slots: ev.slots || makeSlots(ev.pos, linesOf(match, team), players) }, a, b);
  match.events[0] = { ...ev, ...lu };
  // eigen plan: de startopstelling hoort bij jouw plan en blijft staan als de app de wedstrijd opnieuw opbouwt
  if (isOwn(match, team)) match.periodLineups = { ...(match.periodLineups || {}), 0: { pos: { ...lu.pos }, bench: lu.bench.slice(), slots: { ...lu.slots } } };
  replan(match, team);
}

// ---------- acties (muteren een concept van de wedstrijd) ----------
export function startClock(match) {
  if (match.clock.running || match.finished) return;
  match.started = true;
  match.clock.running = true;
  match.clock.startedAt = Date.now();
}

export function pauseClock(match) {
  if (!match.clock.running) return;
  match.clock.accum += (Date.now() - match.clock.startedAt) / 1000;
  match.clock.running = false;
}

export function endPeriod(match, team) {
  pauseClock(match);
  const L = periodLen(team);
  const p = match.clock.period;
  match.events.push({ id: uid(), type: 'periodEnd', t: p * L + Math.min(match.clock.accum, L), period: p });
  match.firstAt = null;
  match.fixed = null;
  if (p + 1 >= team.periods) {
    match.finished = true;
    match.endT = p * L + Math.min(match.clock.accum, L);
    match.plan = { ...(match.plan || {}), steps: [] };
  } else {
    match.clock.period = p + 1;
    match.clock.accum = 0;
    replan(match, team);
  }
}

// Wedstrijd nu afsluiten (bijvoorbeeld als hij eerder stopt). Niet gespeelde tijd telt niet mee.
export function finishNow(match, team) {
  pauseClock(match);
  const L = periodLen(team);
  const p = match.clock.period;
  const T = p * L + Math.min(match.clock.accum, L);
  match.events.push({ id: uid(), type: 'periodEnd', t: T, period: p });
  match.finished = true;
  match.started = true;
  match.endT = T;
  match.firstAt = null;
  match.fixed = null;
  match.plan = { ...(match.plan || {}), steps: [] };
}

// Klok van deze periode op een tijd zetten (in seconden). Latere gebeurtenissen schuiven mee terug.
export function setClock(match, team, sec) {
  const L = periodLen(team);
  const p = match.clock.period;
  const s = Math.max(0, Math.min(L, Math.round(sec)));
  if (match.clock.running) { match.clock.startedAt = Date.now() - s * 1000; match.clock.accum = 0; } else match.clock.accum = s;
  const newT = p * L + Math.min(s, L - 1);
  for (const ev of match.events) if (ev.type !== 'periodEnd' && ev.t > newT && ev.t >= p * L) ev.t = newT;
  const happened = match.events.some((e) => e.type !== 'lineup' || e.t > 0);
  if (p === 0 && s === 0 && !happened) {
    match.clock.running = false;
    match.clock.accum = 0;
    match.started = false;
  }
  match.firstAt = null;
  replan(match, team);
}

export function adjustClock(match, team, delta) {
  setClock(match, team, elapsedInPeriod(match) + delta);
}

export function applyLineup(match, team, lu) {
  const T = gameTime(match, team);
  const players = playersMap(team);
  const cur = linesOf(match, team);
  const ev = { id: uid(), type: 'lineup', t: T, period: match.clock.period, pos: lu.pos, bench: lu.bench, slots: lu.slots || makeSlots(lu.pos, lu.lines || cur, players) };
  // andere opstelling in de rust (bijv. 2-2-1): geldt vanaf nu voor de rest van de wedstrijd
  if (lu.lines && formationText(lu.lines) !== formationText(cur)) { ev.lines = { ...lu.lines }; ev.prevLines = { ...cur }; match.lines = { ...lu.lines }; }
  match.events.push(ev);
  match.firstAt = null;
  match.fixed = null;
  replan(match, team);
}

export function doSwap(match, team, out, inn, shift) {
  const T = gameTime(match, team);
  const d = derive(match, team, T);
  const line = shift ? d.state.pos[shift.id] : d.state.pos[out];
  match.events.push({ id: uid(), type: 'swap', t: T, out, in: inn, line, shift: shift || null });
  match.firstAt = null;
  match.fixed = null;
  consumePins(match, T, [{ out, in: inn }]);
  replan(match, team);
}

// Meerdere wissels tegelijk: telkens de beste plek, één keer herplannen; ongedaan maken haalt de hele groep weg.
export function doSwapGroup(match, team, pairs) {
  if (pairs.length === 1) return doSwap(match, team, pairs[0].out, pairs[0].in, pairs[0].shift || null);
  const T = gameTime(match, team);
  const d = derive(match, team, T);
  const stand = currentStand(match, team, d.score);
  const players = playersMap(team);
  let pos = { ...d.state.pos };
  const g = uid();
  for (const pr of pairs) {
    if (!(pr.out in pos)) continue;
    const placed = placeIn(pos, pr.out, pr.in, players, stand);
    const line = placed.shift ? pos[placed.shift.id] : pos[pr.out];
    match.events.push({ id: uid(), type: 'swap', t: T, out: pr.out, in: pr.in, line, shift: placed.shift || null, g });
    pos = placed.pos;
  }
  match.firstAt = null;
  match.fixed = null;
  consumePins(match, T, pairs);
  replan(match, team);
}

// Paren voor een groepswissel met de plek van elke nieuwe speler (na elkaar toegepast)
export function placeGroup(match, team, pairs) {
  const d = derive(match, team, gameTime(match, team));
  const stand = currentStand(match, team, d.score);
  const players = playersMap(team);
  let pos = { ...d.state.pos };
  return pairs.map((pr) => {
    if (!(pr.out in pos)) return { ...pr, line: null, shift: null };
    const placed = placeIn(pos, pr.out, pr.in, players, stand);
    pos = placed.pos;
    return { ...pr, line: placed.line, shift: placed.shift };
  });
}

// Aangepaste wissel bewaren voor het moment waarop de volgende wissel gepland stond.
export function fixSwap(match, team, out, inn, after = 'terug') {
  return fixGroup(match, team, [{ out, in: inn }], after);
}

export function fixGroup(match, team, pairs, after = 'terug') {
  const next = nextSwap(match, team);
  if (!next) return false;
  pinMoment(match, team, next.t, pairs, after);
  return isPinned(match, next.t);
}

export function changeKeeper(match, team, to, mode) {
  const T = gameTime(match, team);
  const d = derive(match, team, T);
  let fill = null;
  if (to in d.state.pos && mode !== 'veld') {
    const players = playersMap(team);
    fill = d.state.bench.filter((id) => !d.state.disabled[id]).sort((a, b) => (d.state.played[a] - d.state.played[b]) ||
      (Math.abs(players[a].kracht - players[to].kracht) - Math.abs(players[b].kracht - players[to].kracht)))[0] || null;
  }
  match.events.push({ id: uid(), type: 'keeper', t: T, from: d.state.keeper, to, mode, fill });
  match.firstAt = null;
  replan(match, team);
}

// Plek in een linie aanpassen: speler weg uit zijn linie (de rest schuift aan), erbij in de nieuwe linie
// (aan de kant waar hij vandaan kwam). Andere linies blijven zoals ze zijn.
export function moveSlot(slots, id, from, to, lines, at = null) {
  const ids = (l) => Object.keys(slots).filter((k) => k[0] === l).sort((a, b) => +a.slice(1) - +b.slice(1)).map((k) => slots[k]).filter(Boolean);
  const src = ids(from);
  const rest = src.filter((x) => x !== id);
  const dst = ids(to).filter((x) => x !== id);
  // op de plek waar de coach hem neerzette; anders aan de kant waar hij vandaan kwam
  if (at != null) dst.splice(Math.max(0, Math.min(dst.length, at)), 0, id);
  else if (src.indexOf(id) < (src.length - 1) / 2) dst.unshift(id);
  else dst.push(id);
  const out = {};
  for (const l of LINES) {
    const list = l === from ? rest : l === to ? dst : ids(l);
    for (let i = 0; i < (lines[l] || 0); i++) out[l + i] = list[i] || null;
  }
  return out;
}

// Opstelling veranderen door een veldspeler naar een andere linie te slepen (bijv. een aanvaller naar het
// middenveld: van 2-1-2 naar 2-2-1). Geldt voor deze wedstrijd; het plan rekent daarna opnieuw.
export function changeFormation(match, team, id, to, at = null) {
  const cur = linesOf(match, team);
  if (!match.started) {
    const ev = match.events[0];
    const from = ev && ev.pos[id];
    const lines = formationAfter(cur, from, to);
    if (!lines) return null;
    const slots = moveSlot(ev.slots || makeSlots(ev.pos, cur, playersMap(team)), id, from, to, lines, at);
    match.events[0] = { ...ev, pos: { ...ev.pos, [id]: to }, slots };
    match.lines = lines;
    // eigen plan: de start volgt mee; geplande opstellingen met de oude verdeling vervallen (zoals eind vorige)
    if (isOwn(match, team) && match.periodLineups) {
      const fit = (lu) => LINES.every((l) => Object.values(lu.pos).filter((x) => x === l).length === (lines[l] || 0));
      const next = { 0: { pos: { ...match.events[0].pos }, bench: match.events[0].bench.slice(), slots: { ...slots } } };
      for (const k of Object.keys(match.periodLineups)) if (+k > 0 && fit(match.periodLineups[k])) next[k] = match.periodLineups[k];
      match.periodLineups = next;
    }
    replan(match, team);
    return lines;
  }
  const T = gameTime(match, team);
  const from = derive(match, team, T).state.pos[id];
  const lines = formationAfter(cur, from, to);
  if (!lines) return null;
  match.events.push({ id: uid(), type: 'formation', t: T, playerId: id, from, to, at, lines, prev: { ...cur } });
  match.lines = lines;
  replan(match, team);
  return lines;
}

// Twee veldspelers ruilen van plek tijdens de wedstrijd.
export function movePlayers(match, team, a, b) {
  match.events.push({ id: uid(), type: 'move', t: gameTime(match, team), a, b });
  replan(match, team);
}

export function clearFixed(match, team) {
  const next = nextSwap(match, team);
  match.fixed = null;
  if (next) match.pins = (match.pins || []).filter((p) => p.t !== next.t);
  replan(match, team);
}

export function delay(match, team, sec = 60) {
  const next = nextSwap(match, team);
  const T = gameTime(match, team);
  if (next && isPinned(match, next.t)) {
    // het vastgezette moment schuift mee
    if (match.fixed && match.fixed.t === next.t) match.fixed = { ...match.fixed, t: T + sec };
    match.pins = (match.pins || []).map((p) => (p.t === next.t ? { ...p, t: T + sec } : p)).sort((a, b) => a.t - b.t);
  } else match.firstAt = T + sec;
  replan(match, team);
}

export function disablePlayer(match, team, playerId, mode) {
  const T = gameTime(match, team);
  const p = Math.min(team.periods - 1, Math.floor(T / periodLen(team)));
  match.events.push({ id: uid(), type: 'disable', t: T, playerId, mode: mode === 'wedstrijd' ? 'wedstrijd' : 'periode:' + p });
  replan(match, team);
}

export function enablePlayer(match, team, playerId) {
  match.events.push({ id: uid(), type: 'enable', t: gameTime(match, team), playerId });
  replan(match, team);
}

export function joinPlayer(match, team, playerId) {
  if (match.present.indexOf(playerId) === -1) match.present.push(playerId);
  match.events.push({ id: uid(), type: 'join', t: gameTime(match, team), playerId });
  replan(match, team);
}

export function goal(match, team, scorer) {
  match.events.push({ id: uid(), type: 'goal', t: gameTime(match, team), scorer: scorer || null });
  replan(match, team);
}

export function oppGoal(match, team) {
  match.events.push({ id: uid(), type: 'oppgoal', t: gameTime(match, team) });
  replan(match, team);
}

// Stand handmatig aanpassen: haal het laatste doelpunt van deze speler (null = onbekend) of de laatste tegengoal weg.
export function removeGoal(match, team, scorer, opp = false) {
  for (let i = match.events.length - 1; i >= 0; i--) {
    const e = match.events[i];
    if (opp ? e.type === 'oppgoal' : e.type === 'goal' && (e.scorer || null) === (scorer || null)) {
      match.events.splice(i, 1);
      replan(match, team);
      return true;
    }
  }
  return false;
}

export function setScorer(match, eventId, scorer) {
  const ev = match.events.find((e) => e.id === eventId);
  if (ev) ev.scorer = scorer || null;
}

const UNDOABLE = ['swap', 'goal', 'oppgoal', 'disable', 'enable', 'join', 'move', 'keeper', 'formation'];

export function lastUndoable(match) {
  for (let i = match.events.length - 1; i >= 0; i--) {
    const e = match.events[i];
    if (UNDOABLE.indexOf(e.type) !== -1) return { index: i, ev: e };
    if (e.type === 'lineup' || e.type === 'periodEnd') return null;
  }
  return null;
}

export function undo(match, team) {
  const u = lastUndoable(match);
  if (!u) return null;
  match.events.splice(u.index, 1);
  if (u.ev.g) match.events = match.events.filter((e) => e.g !== u.ev.g);
  if (u.ev.type === 'join') match.present = match.present.filter((id) => id !== u.ev.playerId);
  if (u.ev.type === 'formation') match.lines = u.ev.prev;
  replan(match, team);
  return u.ev;
}

export function setStand(match, team, mode, value) {
  match.standMode = mode;
  if (value) match.manualStand = value;
  replan(match, team);
}

// ---------- hulpfuncties voor de schermen ----------
export function nextSwap(match, team) {
  if (!match.plan || match.finished) return null;
  const end = (match.clock.period + 1) * periodLen(team);
  // plekwissels zonder wissel (game plan) blokkeren de volgende wissel niet; ze gaan mee met de volgende wissel
  const s = match.plan.steps.find((x) => x.type !== 'move');
  return s && s.type === 'swap' && s.t < end ? s : null;
}

// Plekwissels (game plan) die bij de eerstvolgende wissel horen: op hetzelfde moment, of eerder en nog niet gedaan.
export function nextMoves(match, team) {
  const first = nextSwap(match, team);
  if (!first || !match.plan) return [];
  return match.plan.steps.filter((x) => x.type === 'move' && x.t <= first.t).map((x) => ({ a: x.a, b: x.b }));
}

// Het eerstvolgende moment precies zoals gepland uitvoeren (eigen plan): wissels met hun doorschuiver, dan de
// plekwissels. Eén groep, dus één keer ongedaan maken.
export function doPlannedMoment(match, team) {
  const group = nextGroup(match, team);
  if (!group.length) return [];
  const moves = nextMoves(match, team);
  const T = gameTime(match, team);
  const g = uid();
  let pos = { ...derive(match, team, T).state.pos };
  const done = [];
  for (const s of group) {
    if (!(s.out in pos) || s.in in pos) continue;
    const shift = s.shift && s.shift.id in pos && s.shift.id !== s.out ? { id: s.shift.id, to: pos[s.out] } : null;
    const line = shift ? pos[shift.id] : pos[s.out];
    match.events.push({ id: uid(), type: 'swap', t: T, out: s.out, in: s.in, line, shift, g });
    const np = { ...pos }; delete np[s.out];
    if (shift) { np[s.in] = pos[shift.id]; np[shift.id] = shift.to; } else np[s.in] = pos[s.out];
    pos = np;
    done.push({ out: s.out, in: s.in, shift });
  }
  for (const mv of moves) {
    if (!(mv.a in pos) || !(mv.b in pos)) continue;
    match.events.push({ id: uid(), type: 'move', t: T, a: mv.a, b: mv.b, g });
    pos = { ...pos, [mv.a]: pos[mv.b], [mv.b]: pos[mv.a] };
  }
  match.firstAt = null;
  match.fixed = null;
  consumePins(match, T, done);
  // plekwissels zonder wissel die al meegingen: niet nog eens
  match.pins = (match.pins || []).filter((p) => !(p.t <= group[0].t && !(p.pairs && p.pairs.length)));
  replan(match, team);
  return done;
}

// Alle wissels van het eerstvolgende moment (1 of meer spelers tegelijk)
export function nextGroup(match, team) {
  const first = nextSwap(match, team);
  if (!first) return [];
  const out = [];
  for (const s of match.plan.steps) { if (s.type === 'move') continue; if (s.type !== 'swap' || s.t !== first.t) break; out.push(s); }
  return out;
}

// telt wisselmomenten (een groep wissels tegelijk = 1 moment)
export function swapCounts(match) {
  const moments = (list) => { let n = 0, last = null; for (const s of list) { if (s.type !== 'swap') { last = null; continue; } const key = s.g || s.t; if (key !== last) n++; last = key; } return n; };
  const done = moments(match.events.filter((e) => e.type === 'swap'));
  const planned = match.plan ? moments(match.plan.steps) : 0;
  return { done, planned, total: done + planned };
}

// Beste bankspeler voor een snelle wissel van deze veldspeler.
export function suggestIn(match, team, outId) {
  const d = derive(match, team, gameTime(match, team));
  const players = playersMap(team);
  const eligible = d.state.bench.filter((id) => !d.state.disabled[id]);
  return eligible.sort((a, b) => (d.state.played[a] - d.state.played[b]) ||
    (Math.abs(players[a].kracht - players[outId].kracht) - Math.abs(players[b].kracht - players[outId].kracht)))[0] || null;
}

// Beste veldspeler om te wisselen als deze bankspeler erin moet.
export function suggestOut(match, team, inId) {
  const d = derive(match, team, gameTime(match, team));
  const players = playersMap(team);
  return Object.keys(d.state.pos).sort((a, b) => (d.state.turns[a] - d.state.turns[b]) || (d.state.played[b] - d.state.played[a]) ||
    (Math.abs(players[a].kracht - players[inId].kracht) - Math.abs(players[b].kracht - players[inId].kracht)))[0] || null;
}

// Waar komt de nieuwe speler te staan (en schuift er iemand door)?
export function placement(match, team, out, inn) {
  const d = derive(match, team, gameTime(match, team));
  const stand = currentStand(match, team, d.score);
  return placeIn(d.state.pos, out, inn, playersMap(team), stand);
}

// Wat gebeurt er als we deze wissel nu doen? Voor het gevolgen-paneel.
export function previewSwap(match, team, swap) {
  const copy = JSON.parse(JSON.stringify(match));
  if (swap && swap.pairs) doSwapGroup(copy, team, swap.pairs);
  else if (swap) doSwap(copy, team, swap.out, swap.in, swap.shift || null);
  else delay(copy, team, 60);
  const d = derive(copy, team, gameTime(copy, team));
  const players = playersMap(team);
  const stand = currentStand(copy, team, d.score);
  const counted = Object.keys(d.state.pos).concat(d.state.bench).filter((id) => d.state.disabled[id] !== 'wedstrijd' && d.late.indexOf(id) === -1);
  const turns = counted.map((id) => copy.plan.finalTurns[id] || 0);
  return {
    lines: lineStatus(d.state.pos, players, stand),
    plan: copy.plan,
    minTurns: turns.length ? Math.min(...turns) : 0,
    maxTurns: turns.length ? Math.max(...turns) : 0
  };
}

// Opstellingen voor de rust (iedereen staat aan de kant, je begint opnieuw): aanbevolen (het plan), of zoals
// de start of het eind van de vorige periode. Wie niet meer kan (klaar, keeper geworden) wordt vervangen door
// wie het minst speelde; dat staat in 'repl'.
const linesFromSlots = (slots) => { const l = { A: 0, M: 0, V: 0 }; for (const k in slots) if (slots[k]) l[k[0]]++; return l; };
export function breakOptions(match, team) {
  const T = gameTime(match, team);
  const st = derive(match, team, T).state;
  const keeper = st.keeper;
  const pool = Object.keys(st.pos).concat(st.bench).filter((id) => id !== keeper && st.disabled[id] !== 'wedstrijd');
  const fix = (lu) => {
    if (!lu) return null;
    const src = lu.slots || makeSlots(lu.pos, linesOf(match, team), playersMap(team));
    const inUse = new Set(Object.values(src).filter(Boolean));
    const spare = pool.filter((id) => !inUse.has(id)).sort((a, b) => (st.played[a] || 0) - (st.played[b] || 0));
    const slots = {}, used = new Set(), repl = [];
    for (const k of Object.keys(src)) {
      let id = src[k];
      if (!id) continue;
      if (pool.indexOf(id) === -1 || used.has(id)) { const r = spare.shift(); if (r) repl.push({ out: id, in: r }); id = r; }
      if (id) { slots[k] = id; used.add(id); }
    }
    const pos = {};
    for (const k in slots) pos[slots[k]] = k[0];
    return { pos, slots, bench: pool.filter((id) => !used.has(id)), lines: linesFromSlots(slots), repl };
  };
  const p = match.clock.period;
  const prevStart = match.events.filter((e) => e.type === 'lineup' && (e.period || 0) === p - 1).pop() || match.events.find((e) => e.type === 'lineup');
  const prop = breakProposal(match, team);
  const eind = fix({ pos: st.pos, slots: st.slots });
  const own = isOwn(match, team);
  return {
    aanbevolen: prop ? { ...fix(prop), repl: [] } : eind,
    start: fix(prevStart),
    eind,
    // eigen plan: advies alleen op verzoek; 'planned' = de coach had deze opstelling zelf gepland
    advies: own ? fix(ownAdviseLineup(match, team, p)) : null,
    planned: own && !!prop,
    own,
    played: st.played,
    keeper
  };
}

export function breakProposal(match, team) {
  const step = match.plan && match.plan.steps.find((s) => s.type === 'lineup' && (s.period == null || s.period === match.clock.period));
  if (!step) return null;
  return { pos: step.pos, bench: step.bench, slots: step.slots ? { ...step.slots } : makeSlots(step.pos, linesOf(match, team), playersMap(team)) };
}

export function summary(match, team) {
  const T = gameTime(match, team);
  return { ...derive(match, team, T), T };
}

// Alle momenten van de wedstrijd (gedaan + gepland) met opstelling, voor het wedstrijdplan.
export function timeline(match, team) {
  const players = playersMap(team);
  const cards = [];
  let slots = null, pos = null, bench = null, keeper = match.keeperId || null;
  // opstelling aan het begin: terugrekenen vanaf de huidige via de opstellingswijzigingen
  let lines = linesOf(match, team);
  for (let k = match.events.length - 1; k >= 0; k--) {
    const e = match.events[k];
    if (e.type === 'formation') lines = e.prev;
    else if (e.type === 'lineup' && e.prevLines) lines = e.prevLines;
  }
  for (const ev of match.events) {
    if (ev.type === 'formation' && pos && pos[ev.playerId]) {
      lines = ev.lines;
      slots = moveSlot(slots, ev.playerId, ev.from, ev.to, ev.lines, ev.at);
      pos = { ...pos, [ev.playerId]: ev.to };
      if (cards.length) cards[cards.length - 1] = { ...cards[cards.length - 1], slots, pos, lines };
      continue;
    }
    if (ev.type === 'keeper' && pos) {
      const s = { pos, bench, slots, keeper };
      applyKeeperChange(s, ev);
      ({ pos, bench, slots, keeper } = s);
      if (cards.length) cards[cards.length - 1] = { ...cards[cards.length - 1], slots, pos, bench, keeper };
      continue;
    }
    if (ev.type === 'lineup') {
      if (ev.lines) lines = ev.lines;
      slots = ev.slots ? { ...ev.slots } : makeSlots(ev.pos, lines, players);
      pos = { ...ev.pos }; bench = ev.bench.slice();
      cards.push({ kind: 'lineup', t: ev.t, period: ev.period, slots, pos, bench, keeper, lines, past: true });
    } else if (ev.type === 'swap' && slots) {
      slots = slotSwap(slots, ev.out, ev.in, ev.shift);
      const np = { ...pos }; delete np[ev.out];
      if (ev.shift && ev.shift.id in np) { np[ev.in] = np[ev.shift.id]; np[ev.shift.id] = ev.shift.to; } else np[ev.in] = pos[ev.out];
      pos = np; bench = bench.filter((x) => x !== ev.in).concat([ev.out]);
      const prev = cards[cards.length - 1];
      if (ev.g && prev && prev.kind === 'swap' && prev.g === ev.g) {
        cards[cards.length - 1] = { ...prev, outs: prev.outs.concat([ev.out]), ins: prev.ins.concat([ev.in]), pairs: prev.pairs.concat([{ out: ev.out, in: ev.in, shift: ev.shift || null }]), shift: prev.shift || ev.shift, slots, pos, bench };
      } else cards.push({ kind: 'swap', t: ev.t, out: ev.out, in: ev.in, outs: [ev.out], ins: [ev.in], pairs: [{ out: ev.out, in: ev.in, shift: ev.shift || null }], g: ev.g || null, shift: ev.shift, slots, pos, bench, keeper, lines, past: true });
    } else if (ev.type === 'join' && bench) {
      bench = bench.concat([ev.playerId]);
    } else if (ev.type === 'move' && pos && pos[ev.a] && pos[ev.b]) {
      pos = { ...pos, [ev.a]: pos[ev.b], [ev.b]: pos[ev.a] };
      const sa = slotOf(slots, ev.a), sb = slotOf(slots, ev.b);
      slots = { ...slots, [sa]: ev.b, [sb]: ev.a };
      if (cards.length) cards[cards.length - 1] = { ...cards[cards.length - 1], slots, pos };
    }
  }
  const nowIndex = cards.length - 1;
  if (!match.finished) {
    for (const s of (match.plan ? match.plan.steps : [])) {
      if (s.type === 'lineup') {
        slots = s.slots ? { ...s.slots } : makeSlots(s.pos, lines, players);
        pos = { ...s.pos }; bench = s.bench.slice();
        cards.push({ kind: 'lineup', t: s.t, period: s.period, slots, pos, bench, keeper, lines, past: false, own: !!s.own });
      } else if (s.type === 'move') {
        // plekwissel (game plan): twee veldspelers ruilen van linie, bij de wissels van dit moment
        if (!pos || !(s.a in pos) || !(s.b in pos)) continue;
        pos = { ...pos, [s.a]: pos[s.b], [s.b]: pos[s.a] };
        const sa = slotOf(slots, s.a), sb = slotOf(slots, s.b);
        slots = { ...slots, [sa]: s.b, [sb]: s.a };
        const prev = cards[cards.length - 1];
        if (prev && !prev.past && (prev.kind === 'swap' || prev.kind === 'move') && prev.t === s.t) cards[cards.length - 1] = { ...prev, slots, pos, moves: (prev.moves || []).concat([{ a: s.a, b: s.b }]) };
        else cards.push({ kind: 'move', t: s.t, pairs: [], outs: [], ins: [], moves: [{ a: s.a, b: s.b }], slots, pos, bench, keeper, lines, past: false });
      } else {
        slots = slotSwap(slots, s.out, s.in, s.shift);
        pos = { ...s.pos }; bench = bench.filter((x) => x !== s.in).concat([s.out]);
        const prev = cards[cards.length - 1];
        if (prev && !prev.past && prev.kind === 'swap' && prev.t === s.t) {
          cards[cards.length - 1] = { ...prev, outs: prev.outs.concat([s.out]), ins: prev.ins.concat([s.in]), pairs: prev.pairs.concat([{ out: s.out, in: s.in, shift: s.shift || null }]), shift: prev.shift || s.shift, slots, pos, bench, pinned: prev.pinned || !!s.pinned };
        } else cards.push({ kind: 'swap', t: s.t, out: s.out, in: s.in, outs: [s.out], ins: [s.in], pairs: [{ out: s.out, in: s.in, shift: s.shift || null }], shift: s.shift, slots, pos, bench, keeper, lines, past: false, pinned: !!s.pinned });
      }
    }
  }
  return { cards, nowIndex };
}


// ---------- Jouw plan als route: speelstijl, ritme, vooruitkijkend advies, rapport ----------

export { naturalMoments, fitOf, inKracht, FIT };

// Balans per linie van een opstelling (zonder namen of cijfers).
export function lineStatusOf(match, team, pos) {
  return lineStatus(pos, playersMap(team), match.plan ? match.plan.stand : 'balans');
}

// Speelstijl van het eigen plan: 'sterk' (sterkste opstelling, in hun kracht) of 'balans' (gebalanceerd, eerlijk).
export function planStyle(match, team) {
  if (match.planStyle) return match.planStyle;
  return (team.rules && team.rules.profile === 'sterk') ? 'sterk' : 'balans';
}
// Veldspelers (zonder keeper) en hoeveel er op de bank zitten.
export function squadInfo(match, team) {
  const st = match.events[0] || { pos: {}, bench: [] };
  const n = Object.keys(st.pos).length + st.bench.length;
  const F = Object.values(linesOf(match, team)).reduce((a, b) => a + b, 0);
  return { n, F, bench: Math.max(0, n - F) };
}

// De stappen van de route: aanpak, per periode opstelling en wissels, rapport.
export function ownSteps(team) {
  const list = ['aanpak'];
  for (let p = 0; p < team.periods; p++) list.push('op:' + p, 'ws:' + p);
  list.push('rapport');
  return list;
}
export function markStep(match, key, at) {
  const cur = match.ownSteps || { done: {}, at: 'aanpak' };
  match.ownSteps = { done: { ...cur.done, ...(key ? { [key]: true } : {}) }, at: at || cur.at };
}

// Vrije momenten en vaste stukken van het plan vanaf nu, voor het vooruitkijken.
function ownItems(match, team, T0, scope) {
  const L = periodLen(team);
  const P = team.periods;
  const pins = (match.pins || []).filter((x) => x.t >= T0);
  const items = pins.map((x) => ({ t: x.t, type: 'pin', pairs: x.pairs }));
  const p0 = Math.min(P - 1, Math.floor(T0 / L));
  const pending = match.started && lineupPending(match, team);
  for (let q = p0; q < P; q++) {
    if (q > 0 && (q > p0 || pending)) {
      const lu = match.periodLineups && match.periodLineups[q];
      // nog niet gekozen: vooruitkijken gaat uit van advies in de rust, maar alleen voor periodes ná de periode
      // die je nu vult en zolang je die opstelling nog niet bekeek (anders geldt 'zoals eind': geen wijziging)
      const seen = match.ownSteps && match.ownSteps.done && match.ownSteps.done['op:' + q];
      if (lu) items.push({ t: q * L, type: 'lineup', pos: lu.pos });
      else if (!seen && (!scope || q > scope.p)) items.push({ t: q * L, type: 'freeLineup', emit: false });
    }
    const inQ = pins.filter((x) => x.t > q * L && x.t < (q + 1) * L);
    const inScope = scope && scope.p === q;
    // buiten de te vullen periode: heeft de coach daar zelf gepland, dan geldt alleen zijn plan
    if (inQ.length && !inScope) continue;
    for (const t of naturalMoments(L, q)) {
      if (t <= T0 + 20) continue;
      if (inQ.some((x) => Math.abs(x.t - t) < 60)) continue;
      if (scope && scope.t != null && Math.abs(scope.t - t) < 60) continue;
      items.push({ t, type: 'free', emit: !!inScope && scope.t == null });
    }
    if (inScope && scope.t != null) items.push({ t: scope.t, type: 'free', emit: true });
  }
  return items;
}
function ownStartState(match, team) {
  const T0 = match.started && !match.finished ? Math.floor(gameTime(match, team)) : 0;
  return { T0, start: planStateAt(match, team, T0, false) };
}
function ownCtx(match, team) {
  return makeCtx(match, team, match.plan ? match.plan.stand : 'balans');
}

// Wat gebeurt er als je met k wissels per logisch moment speelt (en de adviezen volgt)? Voor de keuze 'ritme'.
export function rhythmOptions(match, team, style = planStyle(match, team)) {
  const { T0, start } = ownStartState(match, team);
  const ctx = ownCtx(match, team);
  const { bench } = squadInfo(match, team);
  const r = effRules(match, team);
  const maxB = r.maxBenchOn ? (r.maxBench || 10) * 60 : Infinity;
  const marge = (r.marge || 5) * 60;
  const opts = [];
  for (let k = 1; k <= Math.max(1, bench); k++) {
    const res = project({ start, T0, ctx, items: ownItems(match, team, T0, null), k, style });
    const f = res.final;
    opts.push({ k, minPlayed: f.minPlayed, maxPlayed: f.maxPlayed, maxStretch: f.maxStretch, swaps: f.swaps, kracht: f.kracht,
      ok: f.maxStretch <= maxB + 1 && f.maxPlayed - f.minPlayed <= marge });
  }
  const okOnes = opts.filter((o) => o.ok);
  const rec = okOnes.length ? okOnes[0]
    : opts.slice().sort((a, b) => (Math.max(0, a.maxStretch - maxB) * 3 + (a.maxPlayed - a.minPlayed)) - (Math.max(0, b.maxStretch - maxB) * 3 + (b.maxPlayed - b.minPlayed)))[0];
  return { opts, recommended: rec ? rec.k : 1 };
}
export function planRhythm(match, team) {
  const { bench } = squadInfo(match, team);
  if (match.planRhythm) return Math.min(Math.max(1, bench), match.planRhythm);
  return rhythmOptions(match, team).recommended;
}

// Vul de vrije logische momenten van periode p met vooruitkijkend advies. Geeft het aantal wissels terug.
export function ownAutoFill(match, team, p) {
  const { T0, start } = ownStartState(match, team);
  const res = project({ start, T0, ctx: ownCtx(match, team), items: ownItems(match, team, T0, { p }), k: planRhythm(match, team), style: planStyle(match, team) });
  let n = 0;
  for (const e of res.emitted) if (e.pairs.length) { pinMoment(match, team, e.t, e.pairs, 'terug'); n += e.pairs.length; }
  return n;
}
// Voorstel voor één moment (vooruitkijkend), zonder het al te plannen.
export function ownSuggestAt(match, team, t, k = null) {
  const { T0, start } = ownStartState(match, team);
  const L = periodLen(team);
  const p = Math.min(team.periods - 1, Math.floor(t / L));
  const res = project({ start, T0, ctx: ownCtx(match, team), items: ownItems(match, team, T0, { p, t }), k: k || planRhythm(match, team), style: planStyle(match, team) });
  const e = res.emitted.find((x) => x.t === t);
  return { pairs: e ? e.pairs : [], final: res.final };
}
// Hoe komt het plan uit als je vanaf nu de adviezen volgt (en wat je al plande blijft staan)?
export function ownProjection(match, team) {
  const { T0, start } = ownStartState(match, team);
  return project({ start, T0, ctx: ownCtx(match, team), items: ownItems(match, team, T0, null), k: planRhythm(match, team), style: planStyle(match, team) }).final;
}
// Opstelling van periode p: hoe pakt de hele wedstrijd uit met deze opstelling, en hoe met advies?
export function ownCompareLineup(match, team, p, pos) {
  const L = periodLen(team);
  const t = p * L;
  const { T0, start } = ownStartState(match, team);
  if (t < T0 || p === 0) return null;
  const ctx = ownCtx(match, team);
  const base = ownItems(match, team, T0, null).filter((x) => !(x.t === t && (x.type === 'lineup' || x.type === 'freeLineup')));
  const k = planRhythm(match, team), style = planStyle(match, team);
  const cur = project({ start, T0, ctx, items: base.concat([{ t, type: 'lineup', pos }]), k, style }).final;
  const adv = project({ start, T0, ctx, items: base.concat([{ t, type: 'freeLineup' }]), k, style }).final;
  return { cur, adv };
}

// Kandidaten na een tik: wie erin voor 'out' of wie eruit voor 'inn' op tijd t (na wat daar al gepland staat).
export function ownCandidates(match, team, t, { out = null, inn = null, exclude = [] } = {}) {
  const state = planStateAt(match, team, t, exclude.length > 0);
  return ownCands(state, ownCtx(match, team), t, team.periods * periodLen(team), { out, inn, exclude, style: planStyle(match, team) });
}
// Advies voor de opstelling aan het begin van periode p, volgens de speelstijl (of een gekozen stijl). Kijkt
// vooruit: de opstelling die met de rest van het plan (en het ritme) het eerlijkst uitkomt.
export function ownAdviseLineup(match, team, p, style = planStyle(match, team)) {
  const L = periodLen(team);
  const t = p * L;
  const { T0, start } = ownStartState(match, team);
  const ctx = ownCtx(match, team);
  let items = ownItems(match, team, T0, null).filter((x) => !(x.t === t && (x.type === 'lineup' || x.type === 'freeLineup')));
  items.push({ t, type: 'freeLineup', emit: true });
  let res;
  if (t >= T0) res = project({ start, T0, ctx, items, k: planRhythm(match, team), style });
  const got = res && res.lineups.find((x) => x.t === t);
  const pos = got ? got.pos : decideLineup(planStateAt(match, team, t, false), ctx, t, team.periods * L, style).pos;
  const st = planStateAt(match, team, t, false);
  const everyone = Object.keys(st.pos).concat(st.bench);
  return { pos, bench: everyone.filter((id) => !(id in pos)), slots: makeSlots(pos, linesOf(match, team), playersMap(team)) };
}

// Rapport: kerncijfers en inzichten over het hele plan (uit de tijdlijn), met verwijzing naar de stap.
export function ownReport(match, team) {
  const { cards } = timeline(match, team);
  const players = playersMap(team);
  const L = periodLen(team);
  const END = team.periods * L;
  const r = effRules(match, team);
  const stand = match.plan ? match.plan.stand : 'balans';
  const ids = Object.keys(cards[0].pos).concat(cards[0].bench);
  const played = {}, fit = {}, out = {}, outWhere = {}, since = {}, stretch = {}, turns = {};
  for (const id of ids) { played[id] = 0; fit[id] = 0; out[id] = 0; outWhere[id] = null; since[id] = 0; stretch[id] = { len: 0 }; turns[id] = 0; }
  let lightSec = 0, lightFrom = null, lightWorst = { len: 0 };
  let prevPos = null;
  for (let i = 0; i < cards.length; i++) {
    const c = cards[i];
    const t0 = c.t, t1 = i + 1 < cards.length ? cards[i + 1].t : END;
    const dt = Math.max(0, t1 - t0);
    if (prevPos) {
      for (const id of ids) {
        const was = id in prevPos, is = id in c.pos;
        if (was && !is) { since[id] = t0; turns[id]++; }
        if (!was && is) { const len = t0 - since[id]; if (len > stretch[id].len) stretch[id] = { len, from: since[id], to: t0 }; since[id] = t0; }
      }
    }
    for (const id of Object.keys(c.pos)) {
      if (!(id in played)) continue;
      played[id] += dt;
      if (inKracht(players[id], c.pos[id])) fit[id] += dt;
      else { out[id] += dt; if (!outWhere[id]) outWhere[id] = { line: c.pos[id], t: t0 }; }
    }
    const light = lineStatus(c.pos, players, stand).find((x) => x.light);
    if (light && dt > 0) { lightSec += dt; if (dt > lightWorst.len) lightWorst = { len: dt, t: t0, line: light.line }; }
    prevPos = c.pos;
  }
  for (const id of ids) if (!(id in cards[cards.length - 1].pos)) { const len = END - since[id]; if (len > stretch[id].len) stretch[id] = { len, from: since[id], to: END }; }
  const vals = ids.map((id) => played[id]);
  const minP = Math.min(...vals), maxP = Math.max(...vals);
  const fieldTot = vals.reduce((a, b) => a + b, 0);
  const fitTot = ids.reduce((a, id) => a + fit[id], 0);
  const longest = ids.slice().sort((a, b) => stretch[b].len - stretch[a].len)[0];
  const swaps = cards.filter((c) => c.kind === 'swap').reduce((a, c) => a + (c.pairs ? c.pairs.length : 1), 0);
  const moments = cards.filter((c) => c.kind === 'swap').length;
  const maxB = r.maxBenchOn ? (r.maxBench || 10) * 60 : null;
  const marge = (r.marge || 5) * 60;
  const kpi = {
    time: { min: minP, max: maxP, spread: maxP - minP, marge, ok: maxP - minP <= marge + 30 },
    bench: { max: stretch[longest].len, rule: maxB, ok: !maxB || stretch[longest].len <= maxB + 1, who: longest, from: stretch[longest].from, to: stretch[longest].to },
    swaps: { n: swaps, moments, every: moments ? END / (moments + 1) : null },
    kracht: { pct: fieldTot ? fitTot / fieldTot : 1, out: ids.filter((id) => out[id] >= 60).sort((a, b) => out[b] - out[a]).map((id) => ({ id, sec: out[id], line: outWhere[id].line, t: outWhere[id].t })) },
    lines: { pct: fieldTot ? 1 - lightSec / END : 1, worst: lightWorst.len ? lightWorst : null }
  };
  // inzichten, op impact: wat valt buiten de regels of de kracht, met de plek om het aan te passen
  const step = (t) => 'ws:' + Math.min(team.periods - 1, Math.floor(t / L));
  const insights = [];
  if (!kpi.bench.ok) insights.push({ kind: 'bench', sev: 3, id: longest, sec: kpi.bench.max, from: kpi.bench.from, to: kpi.bench.to, step: step(kpi.bench.from + 1), t: null });
  if (!kpi.time.ok) {
    const least = ids.slice().sort((a, b) => played[a] - played[b])[0];
    insights.push({ kind: 'time', sev: 3, id: least, sec: played[least], step: 'ws:0' });
  }
  for (const o of kpi.kracht.out.slice(0, 2)) insights.push({ kind: 'kracht', sev: 2, id: o.id, sec: o.sec, line: o.line, step: step(o.t + 1), t: o.t });
  if (kpi.lines.worst && kpi.lines.worst.len >= L / 3) insights.push({ kind: 'lines', sev: 1, line: kpi.lines.worst.line, t: kpi.lines.worst.t, sec: kpi.lines.worst.len, step: step(kpi.lines.worst.t + 1) });
  insights.sort((a, b) => b.sev - a.sev);
  const verdict = kpi.time.ok && kpi.bench.ok ? (kpi.kracht.pct >= 0.9 ? 'goed' : 'kracht') : 'let';
  return { kpi, insights: insights.slice(0, 3), verdict, played, turns, ids, fitSec: fit, outSec: out, swaps, moments };
}


// ---------- Game plan: liniebord (blokken × linies) ----------
// match.gameplan = { n: blokken per periode, grid: [pos per blok | null], src: ['coach'|'ai'|'base'|null], base }
// pos = { spelerId: 'V' | 'M' | 'A' } voor de veldspelers in dat blok; wie er niet in staat zit op de bank.
// Het bord wordt omgezet naar het eigen plan (startopstelling, opstelling per periode, wissels en plekwissels per
// blokgrens), zodat het live-scherm het gewoon uitvoert.

export const GP_SIZES = [2, 3, 4, 5, 6];

export function gpFieldIds(match) {
  const ev = match.events[0] || { pos: {}, bench: [] };
  return Object.keys(ev.pos).concat(ev.bench);
}
export function gpBlocks(match, team, n = (match.gameplan && match.gameplan.n) || 4) {
  const L = periodLen(team);
  const out = [];
  for (let p = 0; p < team.periods; p++) {
    for (let i = 0; i < n; i++) {
      const t = p * L + Math.round((i * L) / n / 30) * 30;
      const t1 = p * L + Math.round(((i + 1) * L) / n / 30) * 30;
      out.push({ b: out.length, p, i, t, t1, len: t1 - t });
    }
  }
  return out;
}
// Spelers die niet (meer) in het veld kunnen (afwezig, of nu keeper) uit het bord halen.
export function gpClean(match) {
  const gp = match.gameplan;
  if (!gp) return;
  const ids = new Set(gpFieldIds(match));
  gp.grid = gp.grid.map((pos) => {
    if (!pos) return pos;
    const np = {};
    for (const id in pos) if (ids.has(id)) np[id] = pos[id];
    return np;
  });
}
export function gpEnsure(match, team, n) {
  const blocks = gpBlocks(match, team, n);
  gpClean(match);
  const gp = match.gameplan;
  if (!gp || gp.n !== n || gp.grid.length !== blocks.length) {
    // ander aantal blokken: wat er al stond per periode zo goed mogelijk overnemen
    const old = gp && gp.base ? gp : null;
    const grid = blocks.map((bl) => {
      if (!old) return null;
      const ob = gpBlocks(match, team, old.n).filter((x) => x.p === bl.p && x.t <= bl.t).pop();
      return ob ? (old.grid[ob.b] ? { ...old.grid[ob.b] } : null) : null;
    });
    match.gameplan = { n, grid, src: blocks.map(() => (old ? 'base' : null)), base: !!old };
  }
  return match.gameplan;
}
export function gpLinesCount(match, team) { return linesOf(match, team); }
export function gpComplete(match, team, pos) {
  if (!pos) return false;
  const lines = linesOf(match, team);
  const ids = gpFieldIds(match);
  const cnt = { V: 0, M: 0, A: 0 };
  for (const id in pos) { if (ids.indexOf(id) === -1) return false; cnt[pos[id]]++; }
  return LINES.every((l) => cnt[l] === (lines[l] || 0));
}
// Zet de opstelling van blok b (door de coach of de voorzet). Het eerste volle blok op een leeg bord is de basis:
// dat loopt door tot het eind van de wedstrijd. Daarna staat elk blok op zichzelf.
export function gpSetBlock(match, team, b, pos, src = 'coach') {
  const gp = match.gameplan;
  if (!gp) return;
  gp.grid[b] = { ...pos };
  gp.src[b] = src;
  if (!gp.base && b === 0 && gpComplete(match, team, pos)) {
    for (let k = 1; k < gp.grid.length; k++) { gp.grid[k] = { ...pos }; gp.src[k] = 'base'; }
    gp.base = true;
  }
  gpSync(match, team);
}
// Doortrekken: blok b geldt ook voor de volgende blokken (tot het eind van de periode of de wedstrijd).
export function gpExtend(match, team, b, toEnd = false) {
  const gp = match.gameplan;
  const blocks = gpBlocks(match, team, gp.n);
  const pos = gp.grid[b];
  if (!pos) return 0;
  let n = 0;
  for (const bl of blocks) {
    if (bl.b <= b) continue;
    if (!toEnd && bl.p !== blocks[b].p) break;
    gp.grid[bl.b] = { ...pos }; gp.src[bl.b] = 'coach'; n++;
  }
  gpSync(match, team);
  return n;
}
export function gpClear(match, team) {
  const n = match.gameplan ? match.gameplan.n : 4;
  match.gameplan = null;
  gpEnsure(match, team, n);
  gpSync(match, team);
}

// Van blok A naar blok B: wie eruit, wie erin (met doorschuiver als dat precies klopt) en welke veldspelers
// daarna nog van linie ruilen (plekwissels, telkens twee spelers).
export function gpDiff(A, B) {
  const outs = Object.keys(A).filter((id) => !(id in B));
  const ins = Object.keys(B).filter((id) => !(id in A));
  const pairs = [];
  const left = outs.slice();
  // eerst wie erin komt op dezelfde linie als wie eruit gaat
  for (const inn of ins.slice().sort((x, y) => (left.some((o) => A[o] === B[y]) ? 1 : 0) - (left.some((o) => A[o] === B[x]) ? 1 : 0))) {
    let k = left.findIndex((o) => A[o] === B[inn]);
    if (k === -1) k = 0;
    if (k >= left.length) break;
    pairs.push({ out: left[k], in: inn });
    left.splice(k, 1);
  }
  // doorschuiver: X gaat naar de linie van wie eruit gaat, de nieuwe speler neemt de plek van X
  let pos = { ...A };
  const usedX = new Set();
  for (const pr of pairs) {
    const lo = pos[pr.out];
    if (B[pr.in] !== lo) {
      const X = Object.keys(pos).find((x) => x !== pr.out && !usedX.has(x) && x in B && pos[x] === B[pr.in] && B[x] === lo);
      if (X) { pr.shift = { id: X, to: lo }; usedX.add(X); }
    }
    const np = { ...pos }; delete np[pr.out];
    if (pr.shift) { np[pr.in] = pos[pr.shift.id]; np[pr.shift.id] = lo; } else np[pr.in] = lo;
    pos = np;
  }
  // wat dan nog niet klopt: ruilen in tweetallen tot iedereen op zijn linie uit blok B staat
  const moves = [];
  for (let guard = 0; guard < 20; guard++) {
    const wrong = Object.keys(pos).filter((id) => id in B && pos[id] !== B[id]);
    if (!wrong.length) break;
    const a = wrong[0];
    const b = wrong.find((x) => x !== a && pos[x] === B[a] && B[x] === pos[a]) || wrong.find((x) => x !== a && pos[x] === B[a]);
    if (!b) break;
    moves.push({ a, b });
    pos = { ...pos, [a]: pos[b], [b]: pos[a] };
  }
  return { pairs, moves };
}

// Het bord omzetten naar het eigen plan (alleen bij het voorbereiden).
export function gpSync(match, team) {
  const gp = match.gameplan;
  if (!gp || match.started) { replan(match, team); return; }
  const blocks = gpBlocks(match, team, gp.n);
  const ids = gpFieldIds(match);
  const players = playersMap(team);
  const lines = linesOf(match, team);
  if (!gp.base) { match.pins = []; match.periodLineups = null; replan(match, team); return; }
  const pins = [];
  const lineups = {};
  let prev = null, prevSlots = null;
  for (const bl of blocks) {
    let pos = gp.grid[bl.b];
    if (!gpComplete(match, team, pos)) pos = prev; // onvolledig blok: telt als ongewijzigd (zie Controle)
    if (!pos) continue;
    if (bl.i === 0) {
      const slots = reslot(prevSlots, pos, lines, players);
      lineups[bl.p] = { pos: { ...pos }, bench: ids.filter((id) => !(id in pos)), slots };
      prevSlots = slots;
    } else if (prev) {
      const { pairs, moves } = gpDiff(prev, pos);
      if (pairs.length || moves.length) pins.push({ t: bl.t, pairs, moves, after: 'terug' });
      // plekken (links/rechts) volgen de wissels zoals live
      let sl = { ...prevSlots };
      for (const pr of pairs) sl = slotSwap(sl, pr.out, pr.in, pr.shift || null);
      for (const mv of moves) { const sa = slotOf(sl, mv.a), sb = slotOf(sl, mv.b); sl = { ...sl, [sa]: mv.b, [sb]: mv.a }; }
      prevSlots = sl;
    }
    prev = pos;
  }
  // startopstelling = eerste blok
  if (lineups[0]) {
    const ev = match.events[0];
    match.events[0] = { ...ev, pos: { ...lineups[0].pos }, bench: lineups[0].bench.slice(), slots: { ...lineups[0].slots } };
  }
  match.periodLineups = lineups;
  match.pins = pins;
  replan(match, team);
}
// Plekken links/rechts zo stabiel mogelijk: wie op dezelfde linie blijft, houdt zijn plek.
export function reslot(prevSlots, pos, lines, players) {
  if (!prevSlots) return makeSlots(pos, lines, players);
  const slots = {};
  for (const l of LINES) for (let i = 0; i < (lines[l] || 0); i++) slots[l + i] = null;
  const placed = new Set();
  for (const k in prevSlots) { const id = prevSlots[k]; if (id && pos[id] === k[0] && k in slots) { slots[k] = id; placed.add(id); } }
  for (const id in pos) {
    if (placed.has(id)) continue;
    const k = Object.keys(slots).find((x) => x[0] === pos[id] && !slots[x]);
    if (k) slots[k] = id;
  }
  return slots;
}

// Hoe staat het bord ervoor: per blok volledig of niet, per kind blokken en minuten, langst aan de kant.
export function gpStats(match, team) {
  const gp = match.gameplan;
  const blocks = gpBlocks(match, team, gp ? gp.n : 4);
  const ids = gpFieldIds(match);
  const F = Object.values(linesOf(match, team)).reduce((a, b) => a + b, 0);
  const res = { blocks: [], kids: {}, target: 0, targetBlocks: 0, maxBench: 0, maxBenchWho: null };
  for (const id of ids) res.kids[id] = { blocks: 0, sec: 0, run: 0, maxRun: 0, out: 0 };
  const players = playersMap(team);
  let prev = null;
  for (const bl of blocks) {
    const pos = gp && gp.grid[bl.b];
    const ok = gpComplete(match, team, pos);
    const cnt = { V: 0, M: 0, A: 0 };
    if (pos) for (const id in pos) cnt[pos[id]]++;
    let swaps = 0, moves = 0;
    if (prev && pos && bl.i > 0) { const d = gpDiff(prev, pos); swaps = d.pairs.length; moves = d.moves.length; }
    res.blocks.push({ ...bl, ok, cnt, swaps, moves, src: gp ? gp.src[bl.b] : null, empty: !pos });
    for (const id of ids) {
      const k = res.kids[id];
      if (bl.i === 0) k.run = k.run; // de rust telt niet als speeltijd, wel als 'aan de kant' doorlopend
      if (pos && id in pos) {
        k.blocks++; k.sec += bl.len; k.run = 0;
        if (!inKracht(players[id], pos[id])) k.out += bl.len;
      } else if (pos) {
        k.run += bl.len; if (k.run > k.maxRun) k.maxRun = k.run;
      }
    }
    if (pos) prev = pos;
  }
  const filled = res.blocks.filter((x) => !x.empty);
  const total = filled.reduce((a, x) => a + x.len, 0) * F;
  res.target = ids.length ? total / ids.length : 0;
  res.targetBlocks = ids.length ? (filled.length * F) / ids.length : 0;
  for (const id of ids) if (res.kids[id].maxRun > res.maxBench) { res.maxBench = res.kids[id].maxRun; res.maxBenchWho = id; }
  const secs = ids.map((id) => res.kids[id].sec);
  res.min = secs.length ? Math.min(...secs) : 0;
  res.max = secs.length ? Math.max(...secs) : 0;
  return res;
}

// Aanbevolen aantal blokken per periode: vooruit doorgerekend met de hele bank per moment.
export function gpRecommend(match, team, style = planStyle(match, team)) {
  const ids = gpFieldIds(match);
  const ctx = makeCtx(match, team, 'balans');
  const F = Object.values(ctx.lines).reduce((a, b) => a + b, 0);
  const bench = Math.max(0, ids.length - F);
  const r = effRules(match, team);
  const maxB = r.maxBenchOn ? (r.maxBench || 10) * 60 : Infinity;
  const marge = (r.marge || 5) * 60;
  const opts = GP_SIZES.map((n) => {
    const res = gpProject(match, team, n, style, true);
    const f = res.final;
    return { n, minPlayed: f.minPlayed, maxPlayed: f.maxPlayed, maxStretch: f.maxStretch, swaps: f.swaps, ok: f.maxStretch <= maxB + 1 && f.maxPlayed - f.minPlayed <= marge, every: periodLen(team) / n };
  });
  const ok = opts.filter((o) => o.ok);
  const rec = !bench ? 2 : ok.length ? ok[0].n : opts.slice().sort((a, b) => (Math.max(0, a.maxStretch - maxB) * 1.5 + a.maxPlayed - a.minPlayed) - (Math.max(0, b.maxStretch - maxB) * 1.5 + b.maxPlayed - b.minPlayed))[0].n;
  return { opts, recommended: rec, bench };
}

// Voorzet (of 'vul aan'): de app vult elk blok dat niet van de coach is, vooruitkijkend over de hele wedstrijd.
function gpProject(match, team, n, style, ignoreCoach = false) {
  const gp = match.gameplan;
  const blocks = gpBlocks(match, team, n);
  const ids = gpFieldIds(match);
  const ctx = makeCtx(match, team, 'balans');
  const F = Object.values(ctx.lines).reduce((a, b) => a + b, 0);
  const bench = Math.max(1, ids.length - F);
  const coach = (bl) => !ignoreCoach && gp && gp.n === n && gp.src[bl.b] === 'coach' && gpComplete(match, team, gp.grid[bl.b]);
  const ev = match.events[0];
  const b0 = blocks[0];
  const startPos = coach(b0) ? gp.grid[0] : ev.pos;
  const played = {}, turns = {}, since = {};
  for (const id of ids) { played[id] = 0; turns[id] = 0; since[id] = 0; }
  const start = { pos: { ...startPos }, bench: ids.filter((id) => !(id in startPos)), played, turns, since, disabled: {} };
  const items = [];
  for (const bl of blocks) {
    if (bl.b === 0) { if (!coach(bl)) items.push({ t: 0, type: 'freeLineup', emit: true }); continue; }
    if (coach(bl)) items.push({ t: bl.t, type: 'lineup', pos: gp.grid[bl.b] });
    else if (bl.i === 0) items.push({ t: bl.t, type: 'freeLineup', emit: true });
    else items.push({ t: bl.t, type: 'free', emit: true, k: bench });
  }
  return project({ start, T0: 0, ctx, items, k: bench, style, snaps: true });
}
export function gpFill(match, team, style = planStyle(match, team)) {
  const gp = match.gameplan;
  if (!gp) return 0;
  const blocks = gpBlocks(match, team, gp.n);
  const res = gpProject(match, team, gp.n, style);
  let n = 0;
  for (const bl of blocks) {
    if (gp.src[bl.b] === 'coach' && gpComplete(match, team, gp.grid[bl.b])) continue;
    const pos = res.snaps && res.snaps[bl.t];
    if (!pos) continue;
    gp.grid[bl.b] = { ...pos }; gp.src[bl.b] = 'ai'; n++;
  }
  gp.base = true;
  gpSync(match, team);
  return n;
}
