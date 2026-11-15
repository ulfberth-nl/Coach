// Wedstrijdlogica: klok, gebeurtenissen, afgeleide stand en (her)planning.
import { planRest, initialState, LINES, lineStatus, isDisabled, placeIn } from './planner.js';
import { uid } from './store.js';

export const periodLen = (team) => team.periodMin * 60;
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

// ---------- afgeleide stand uit de gebeurtenissen ----------
export function derive(match, team, T) {
  const players = playersMap(team);
  const L = periodLen(team);
  const st = { pos: {}, bench: [], played: {}, turns: {}, since: {}, disabled: {}, slots: {} };
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
      if (match.keeperId && lineTime[match.keeperId]) lineTime[match.keeperId].K += dt;
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
      st.slots = ev.slots ? { ...ev.slots } : makeSlots(ev.pos, team.lines, players);
      first = false;
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

// Aantal keer gewisseld per kind voor de hele wedstrijd (null = de app kiest zelf).
export function turnsTarget(team) {
  const k = team.rules.turnsPerPeriod;
  return k ? k * team.periods : null;
}

export function makeCtx(match, team, stand) {
  return {
    players: playersMap(team),
    lines: team.lines,
    periodLen: periodLen(team),
    periods: team.periods,
    rules: { ...team.rules, priority: match.priority || team.rules.priority, turnsTarget: turnsTarget(team) },
    stand
  };
}

export function lineupPending(match, team) {
  const p = match.clock.period;
  return !match.finished && p > 0 && !match.clock.running && match.clock.accum === 0 &&
    !!team.rules.newLineupAtBreak && !match.events.some((e) => e.type === 'lineup' && e.period === p);
}

// Ankerpunt van het plan: de laatste wissel of opstelling in deze periode. Zo verschuift het plan niet bij een goal.
function planAnchor(match, team, T) {
  const L = periodLen(team);
  const pStart = Math.floor(T / L) * L;
  let anchor = pStart;
  for (const e of match.events) {
    if (e.t > T + 0.5) break;
    if ((e.type === 'swap' || e.type === 'lineup' || e.type === 'join') && e.t >= anchor) anchor = e.t;
  }
  return Math.min(anchor, T);
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
  let r = planRest(st, ctx, anchor);
  const swapsOf = (x) => x.steps.filter((s) => s.type === 'swap').length;
  if (!match.started) {
    match.baseline = swapsOf(r);
  } else if (match.baseline != null) {
    // na een afwijking (extra of vroege wissel) niet ineens veel meer wissels: dan mag het verschil 1 beurt zijn
    const end = matchEnd(team);
    const expected = Math.ceil(match.baseline * (end - anchor) / end) + 1;
    if (!r.ok || swapsOf(r) > expected + 1) {
      const r2 = planRest(st, { ...ctx, rules: { ...ctx.rules, turnsSlack: 1 } }, anchor);
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
    fair: r.fair,
    finalPlayed: r.final.played,
    finalTurns: r.final.turns
  };
  return match;
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
    priority: opts.priority || team.rules.priority,
    standMode: 'auto',
    manualStand: 'balans',
    clock: { period: 0, running: false, startedAt: 0, accum: 0 },
    started: false,
    finished: false,
    firstAt: null,
    events: [],
    plan: null
  };
  const ctx = makeCtx(match, team, 'balans');
  const st = initialState(fieldIds, ctx);
  match.events.push({ id: uid(), type: 'lineup', t: 0, period: 0, pos: st.pos, bench: st.bench, slots: makeSlots(st.pos, team.lines, players) });
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
  const lu = swapInLineup({ pos: ev.pos, bench: ev.bench, slots: ev.slots || makeSlots(ev.pos, team.lines, players) }, a, b);
  match.events[0] = { ...ev, ...lu };
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
  match.events.push({ id: uid(), type: 'lineup', t: T, period: match.clock.period, pos: lu.pos, bench: lu.bench, slots: lu.slots || makeSlots(lu.pos, team.lines, players) });
  match.firstAt = null;
  replan(match, team);
}

export function doSwap(match, team, out, inn, shift) {
  const T = gameTime(match, team);
  const d = derive(match, team, T);
  const line = shift ? d.state.pos[shift.id] : d.state.pos[out];
  match.events.push({ id: uid(), type: 'swap', t: T, out, in: inn, line, shift: shift || null });
  match.firstAt = null;
  replan(match, team);
}

// Twee veldspelers ruilen van plek tijdens de wedstrijd.
export function movePlayers(match, team, a, b) {
  match.events.push({ id: uid(), type: 'move', t: gameTime(match, team), a, b });
  replan(match, team);
}

export function delay(match, team, sec = 60) {
  match.firstAt = gameTime(match, team) + sec;
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

export function setScorer(match, eventId, scorer) {
  const ev = match.events.find((e) => e.id === eventId);
  if (ev) ev.scorer = scorer || null;
}

const UNDOABLE = ['swap', 'goal', 'oppgoal', 'disable', 'enable', 'join', 'move'];

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
  if (u.ev.type === 'join') match.present = match.present.filter((id) => id !== u.ev.playerId);
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
  const s = match.plan.steps[0];
  return s && s.type === 'swap' && s.t < end ? s : null;
}

export function swapCounts(match) {
  const done = match.events.filter((e) => e.type === 'swap').length;
  const planned = match.plan ? match.plan.steps.filter((s) => s.type === 'swap').length : 0;
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
  if (swap) doSwap(copy, team, swap.out, swap.in, swap.shift || null);
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

export function breakProposal(match, team) {
  const step = match.plan && match.plan.steps.find((s) => s.type === 'lineup');
  if (!step) return null;
  return { pos: step.pos, bench: step.bench, slots: makeSlots(step.pos, team.lines, playersMap(team)) };
}

export function summary(match, team) {
  const T = gameTime(match, team);
  return { ...derive(match, team, T), T };
}

// Alle momenten van de wedstrijd (gedaan + gepland) met opstelling, voor het wedstrijdplan.
export function timeline(match, team) {
  const players = playersMap(team);
  const cards = [];
  let slots = null, pos = null, bench = null;
  for (const ev of match.events) {
    if (ev.type === 'lineup') {
      slots = ev.slots ? { ...ev.slots } : makeSlots(ev.pos, team.lines, players);
      pos = { ...ev.pos }; bench = ev.bench.slice();
      cards.push({ kind: 'lineup', t: ev.t, period: ev.period, slots, pos, bench, past: true });
    } else if (ev.type === 'swap' && slots) {
      slots = slotSwap(slots, ev.out, ev.in, ev.shift);
      const np = { ...pos }; delete np[ev.out];
      if (ev.shift && ev.shift.id in np) { np[ev.in] = np[ev.shift.id]; np[ev.shift.id] = ev.shift.to; } else np[ev.in] = pos[ev.out];
      pos = np; bench = bench.filter((x) => x !== ev.in).concat([ev.out]);
      cards.push({ kind: 'swap', t: ev.t, out: ev.out, in: ev.in, shift: ev.shift, slots, pos, bench, past: true });
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
        slots = makeSlots(s.pos, team.lines, players);
        pos = { ...s.pos }; bench = s.bench.slice();
        cards.push({ kind: 'lineup', t: s.t, period: s.period, slots, pos, bench, past: false });
      } else {
        slots = slotSwap(slots, s.out, s.in, s.shift);
        pos = { ...s.pos }; bench = bench.filter((x) => x !== s.in).concat([s.out]);
        cards.push({ kind: 'swap', t: s.t, out: s.out, in: s.in, shift: s.shift, slots, pos, bench, past: false });
      }
    }
  }
  return { cards, nowIndex };
}
