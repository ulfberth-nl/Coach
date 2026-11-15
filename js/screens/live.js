import { html, useEffect, useMemo, useRef, useState } from '../../vendor/preact-htm.js';
import { update, currentMatch } from '../store.js';
import * as M from '../match.js';
import { LINE_NAMES } from '../planner.js';
import { Field, Neon, Sheet, Confirm, Seg, Switch, Icon, useNow, useWakeLock, beep, flash, unlockAudio, toast, go, STANDS } from '../ui.js';

const teamOf = (state, match) => state.teams.find((t) => t.id === match.teamId);

// Pas de huidige wedstrijd aan (in één keer opgeslagen).
export function mutate(fn) {
  let result;
  update((draft) => {
    const m = draft.matches.find((x) => x.id === draft.currentMatchId);
    if (!m) return;
    const t = draft.teams.find((x) => x.id === m.teamId);
    result = fn(m, t, draft);
  });
  return result;
}

const UNDO_TEXT = { swap: 'wissel', goal: 'goal', oppgoal: 'tegengoal', disable: 'uitschakelen', enable: 'weer inzetbaar', join: 'later gekomen' };
const undoAction = { label: 'Ongedaan', run: () => { const ev = mutate((m, t) => M.undo(m, t)); if (ev) toast('Ongedaan: ' + UNDO_TEXT[ev.type]); } };

export function Live({ state }) {
  const match = currentMatch(state);
  if (!match) {
    return html`<main class="screen"><div class="empty"><p>Er is geen wedstrijd bezig.</p><a class="btn primary" href="#/">Wedstrijd klaarzetten</a></div></main>`;
  }
  return html`<${LiveInner} match=${match} team=${teamOf(state, match)} />`;
}

function LiveInner({ match, team }) {
  const now = useNow(match.clock.running ? 500 : 1000);
  const L = M.periodLen(team);
  const T = M.gameTime(match, team, now);
  const el = M.elapsedInPeriod(match, now);
  const tick = Math.floor(T);
  const d = useMemo(() => M.derive(match, team, T), [match, team, tick]);
  const nick = (id) => M.nickOf(team, id);
  const next = M.nextSwap(match, team);
  const countdown = next ? next.t - T : null;
  const pending = M.lineupPending(match, team);
  const timeUp = match.started && !match.finished && el >= L;
  const counts = M.swapCounts(match);
  const stand = M.currentStand(match, team, d.score);
  const [sheet, setSheet] = useState(null);
  const [sel, setSel] = useState(null);

  useWakeLock(match.started && !match.finished);

  // signaal: korte piep een minuut van tevoren, dan piep + flits op het moment zelf
  const alerted = useRef({});
  useEffect(() => {
    if (!match.clock.running) return;
    if (next) {
      const key = next.t + ':' + next.out + ':' + next.in;
      if (countdown <= 60 && countdown > 1 && !alerted.current[key + 'a']) { alerted.current[key + 'a'] = 1; beep(1, 660); }
      if (countdown <= 0 && !alerted.current[key + 'b']) { alerted.current[key + 'b'] = 1; beep(3); flash(); }
    }
    if (timeUp && !alerted.current['end' + match.clock.period]) { alerted.current['end' + match.clock.period] = 1; beep(2, 520); flash(); }
  }, [tick, match.clock.running]);

  const toggleClock = () => {
    unlockAudio();
    if (match.clock.running) { mutate((m) => M.pauseClock(m)); return; }
    mutate((m, t) => {
      if (M.lineupPending(m, t)) {
        const prop = M.breakProposal(m, t);
        if (prop) M.applyLineup(m, t, prop);
      }
      M.startClock(m);
    });
  };

  const tapField = (id) => {
    if (match.finished) return;
    if (!match.started) {
      if (!sel) setSel(id);
      else if (sel === id) setSel(null);
      else { mutate((m, t) => M.swapInStartLineup(m, t, sel, id)); setSel(null); }
      return;
    }
    if (pending) { setSheet({ type: 'break' }); return; }
    const inn = M.suggestIn(match, team, id);
    if (!inn) { toast('Er zit niemand inzetbaar op de bank'); return; }
    setSheet({ type: 'swap', out: id, in: inn, planned: false });
  };

  const tapBench = (id) => {
    if (match.finished) return;
    if (!match.started) { tapField(id); return; }
    setSheet({ type: 'bench', id });
  };

  const openPlanned = () => {
    if (pending) { setSheet({ type: 'break' }); return; }
    if (next) { setSheet({ type: 'swap', out: next.out, in: next.in, planned: true }); return; }
    const inn = d.state.bench.filter((id) => !d.state.disabled[id]).sort((a, b) => d.state.played[a] - d.state.played[b])[0];
    if (!inn) { toast('Er zit niemand inzetbaar op de bank'); return; }
    setSheet({ type: 'swap', out: M.suggestOut(match, team, inn), in: inn, planned: false });
  };

  const canUndo = !!M.lastUndoable(match);

  // ---------- banner ----------
  let banner;
  if (match.finished) {
    banner = html`<a class="banner calm" href=${'#/afloop/' + match.id}><span class="bin"><span class="h2">Wedstrijd afgelopen</span><span class="sub">Bekijk het overzicht →</span></span></a>`;
  } else if (!match.started) {
    const first = next;
    banner = html`<div class="banner calm"><span class="bin">
      <span class="h2">Klaar voor de aftrap</span>
      <span class="sub">Tik twee spelers om ze te ruilen. Start de klok bij de aftrap.${counts.planned ? ` ${counts.planned} wissels gepland${first ? ', de eerste na ' + M.fmt(first.t) : ''}.` : ''}</span>
    </span></div>`;
  } else if (pending) {
    banner = html`<button type="button" class="banner" style="border:none;padding:0;background:none;text-align:left;width:100%" onClick=${() => setSheet({ type: 'break' })}>
      <${Neon} box><span class="bin">
        <span class="h2">Rust · opstelling voor de ${M.periodLabel(team, match.clock.period)}</span>
        <span class="sub" style="color:var(--ink)">Tik om de nieuwe opstelling te bekijken</span>
      </span></${Neon}>
    </button>`;
  } else if (timeUp) {
    banner = html`<button type="button" class="banner" style="border:none;padding:0;background:none;text-align:left;width:100%" onClick=${() => setSheet({ type: 'end' })}>
      <${Neon} box><span class="bin">
        <span class="h2">Tijd! Einde ${M.periodLabel(team, match.clock.period)}</span>
        <span class="sub" style="color:var(--ink)">Tik om af te sluiten</span>
      </span></${Neon}>
    </button>`;
  } else if (next) {
    const due = countdown <= 0;
    const soon = countdown <= 60;
    const at = match.plan ? match.plan.at : 0;
    const progress = Math.max(0, Math.min(1, (T - at) / Math.max(1, next.t - at)));
    const inner = html`<span class="bin">
      <span class="between"><span class="h2">${due ? 'Nu wisselen' : 'Volgende wissel over ' + M.fmt(countdown)}</span><span class="small" style="color:var(--ink);font-weight:800">${counts.done + 1} van ${counts.total}</span></span>
      <span class="sub" style="color:var(--ink);font-weight:700">Klaarmaken: ${nick(next.in)} (voor ${nick(next.out)})</span>
      <span class="progress"><div style=${`width:${progress * 100}%`}></div></span>
      ${!match.clock.running && html`<span class="small" style="color:var(--ink)">Klok staat stil</span>`}
    </span>`;
    banner = html`<button type="button" class="banner" style="border:none;padding:0;background:none;text-align:left;width:100%" onClick=${openPlanned} aria-label="Wisselmoment openen">
      ${soon ? html`<${Neon} box>${inner}</${Neon}>` : html`<span style="display:block;border-radius:20px">${inner}</span>`}
    </button>`;
  } else {
    banner = html`<div class="banner calm"><span class="bin"><span class="h2">Geen wissels meer deze ${M.periodWord(team)}</span>${!match.clock.running && html`<span class="sub">Klok staat stil</span>`}</span></div>`;
  }

  const benchEligible = d.state.bench.filter((id) => !d.state.disabled[id]);

  return html`<main class="screen">
    <div class="topbar">
      <a class="iconbtn" href="#/" aria-label="Terug"><${Icon} name="back" /></a>
      <div class="col grow" style="gap:0;align-items:center">
        <span class="h2">${team.name}${match.opponent ? ' – ' + match.opponent : ''}</span>
      </div>
      <a class="link" href="#/plan">Plan</a>
    </div>

    <section class="card" style="gap:8px">
      <div class="clockrow">
        <div class="col grow" style="gap:2px">
          <span class="num clock" style=${el > L ? 'color:#B26A00' : ''}>${M.fmt(el)}</span>
          <span class="small">${M.periodLabel(team, match.clock.period)} · ${team.periodMin} min</span>
        </div>
        <span class="num score" aria-label=${`Stand ${d.score.us} tegen ${d.score.them}`}>${d.score.us}–${d.score.them}</span>
        ${!match.finished && html`<button type="button" class=${'playbtn' + (match.clock.running ? '' : ' go')} onClick=${toggleClock} aria-label=${match.clock.running ? 'Klok pauzeren' : 'Klok starten'}>
          <${Icon} name=${match.clock.running ? 'pause' : 'play'} size=${24} />
        </button>`}
      </div>
      ${match.started && !match.finished && !pending && html`<div class="between">
        <span class="small">${match.clock.running ? 'Klok loopt' : 'Klok staat stil'}</span>
        <button type="button" class="link" onClick=${() => setSheet({ type: 'end' })}>Einde ${M.periodLabel(team, match.clock.period)}</button>
      </div>`}
    </section>

    ${banner}

    ${!match.finished && html`<div class="between" style="gap:10px">
      <div class="col" style="gap:0"><span class="label">Opstelling</span><span class="small">geldt vanaf de volgende wissel</span></div>
      ${team.rules.autoStand && html`<div class="row"><span class="small" style="font-weight:700">Auto</span><${Switch} label="Automatisch op stand" on=${match.standMode !== 'manual'} onChange=${(v) => mutate((m, t) => M.setStand(m, t, v ? 'auto' : 'manual', stand))} /></div>`}
    </div>`}
    ${!match.finished && html`<${Seg} label="Opstellingsstand" value=${stand} options=${STANDS} onChange=${(v) => mutate((m, t) => M.setStand(m, t, 'manual', v))} />`}

    <${Field} slots=${d.state.slots} lines=${team.lines} keeperId=${match.keeperId} nick=${nick}
      onTap=${match.finished ? null : tapField}
      neon=${match.started && next && !pending ? [next.out] : []}
      selected=${!match.started ? sel : null}
      sub=${(id) => M.fmt(d.state.played[id])} />

    <div class="benchrow">
      <span class="label">Bank</span>
      <div class="scroll">
        ${d.state.bench.map((id) => {
          const dis = d.state.disabled[id];
          const isNext = match.started && next && next.in === id && !pending;
          const pill = html`<button type="button" class=${'benchpill' + (dis ? ' off' : '')} style=${sel === id ? 'background:var(--orange)' : ''} onClick=${() => tapBench(id)}>
            ${nick(id)}<span class="t">${dis ? (dis === 'wedstrijd' ? 'klaar' : 'rust') : isNext ? 'klaarmaken' : M.mins(d.state.played[id]) + ' min'}</span>
          </button>`;
          return isNext ? html`<${Neon}>${pill}</${Neon}>` : pill;
        })}
        ${!d.state.bench.length && html`<span class="small">Niemand</span>`}
      </div>
      ${match.started && !match.finished && html`<button type="button" class="iconbtn" aria-label="Speler later gekomen" onClick=${() => setSheet({ type: 'join' })}><${Icon} name="plus" size=${18} /></button>`}
    </div>

    ${!match.finished && html`<div class="actions" style="grid-template-columns:repeat(4,minmax(0,1fr))">
      <button type="button" class="action goal" disabled=${!match.started} onClick=${() => setSheet({ type: 'goal' })}><${Icon} name="ball" size=${20} />Goal</button>
      <button type="button" class="action" disabled=${!match.started} onClick=${() => { mutate((m, t) => M.oppGoal(m, t)); toast('Tegengoal', undoAction); }}><${Icon} name="ball" size=${20} />Tegengoal</button>
      <button type="button" class="action swap" disabled=${!match.started || !benchEligible.length} onClick=${openPlanned}><${Icon} name="swap" size=${20} />Wissel</button>
      <button type="button" class="action" disabled=${!canUndo} onClick=${undoAction.run}><${Icon} name="undo" size=${20} />Ongedaan</button>
    </div>`}
    ${match.finished && html`<a class="btn primary block" href=${'#/afloop/' + match.id}>Overzicht van de wedstrijd</a>`}

    ${sheet && sheet.type === 'swap' && html`<${SwapSheet} match=${match} team=${team} d=${d} init=${sheet} counts=${counts} onClose=${() => setSheet(null)} />`}
    ${sheet && sheet.type === 'bench' && html`<${BenchSheet} match=${match} team=${team} d=${d} id=${sheet.id} onClose=${() => setSheet(null)}
      openSwap=${(s) => setSheet({ type: 'swap', ...s, planned: false })} />`}
    ${sheet && sheet.type === 'goal' && html`<${GoalSheet} match=${match} team=${team} d=${d} onClose=${() => setSheet(null)} />`}
    ${sheet && sheet.type === 'break' && html`<${BreakSheet} match=${match} team=${team} d=${d} onClose=${() => setSheet(null)} />`}
    ${sheet && sheet.type === 'join' && html`<${JoinSheet} match=${match} team=${team} onClose=${() => setSheet(null)} />`}
    ${sheet && sheet.type === 'end' && html`<${Confirm} title=${'Einde ' + M.periodLabel(team, match.clock.period) + '?'}
      text=${match.clock.period + 1 >= team.periods ? 'Daarna zie je het overzicht van de wedstrijd.' : 'De klok stopt. Daarna zet je de opstelling voor de volgende ' + M.periodWord(team) + ' klaar.'}
      yes=${match.clock.period + 1 >= team.periods ? 'Wedstrijd afsluiten' : 'Einde ' + M.periodLabel(team, match.clock.period)}
      onYes=${() => {
        const fin = mutate((m, t) => { M.endPeriod(m, t); return m.finished; });
        if (fin) setTimeout(() => go('/afloop/' + match.id), 0);
        else if (team.rules.newLineupAtBreak) setTimeout(() => setSheet({ type: 'break' }), 0);
      }}
      onClose=${() => setSheet((s) => (s && s.type === 'end' ? null : s))} />`}
  </main>`;
}

// ---------- wisselmoment / snelle wissel ----------
function SwapSheet({ match, team, d, init, counts, onClose }) {
  const [out, setOut] = useState(init.out);
  const [inn, setIn] = useState(init.in);
  const [after, setAfter] = useState('terug');
  const nick = (id) => M.nickOf(team, id);
  const place = useMemo(() => (out && inn ? M.placement(match, team, out, inn) : null), [out, inn]);
  const preview = useMemo(() => (place ? M.previewSwap(match, team, { out, in: inn, shift: place.shift }) : null), [place]);
  const eligible = d.state.bench.filter((id) => !d.state.disabled[id]);
  const pw = M.periodWord(team);
  const isPlanned = init.planned && out === init.out && inn === init.in;

  const run = () => {
    mutate((m, t) => {
      M.doSwap(m, t, out, inn, place.shift);
      if (!init.planned && after !== 'terug') M.disablePlayer(m, t, out, after);
    });
    toast(`${nick(inn)} erin voor ${nick(out)}`, undoAction);
    onClose();
  };

  const below = (id) => {
    if (!place) return null;
    if (place.shift) {
      if (id === out) return html`<span class="inpill">${nick(place.shift.id)}</span>`;
      if (id === place.shift.id) return html`<span class="inpill sel">${nick(inn)}</span>`;
      return null;
    }
    return id === out ? html`<span class="inpill sel">${nick(inn)}</span>` : null;
  };

  const pf = preview && preview.plan.fair;
  const marge = team.rules.marge;

  return html`<${Sheet} onClose=${onClose} label="Wissel">
    <div class="between">
      <span class="h2" style="font-size:20px">${init.planned ? `Wissel ${counts.done + 1} van ${counts.total}` : 'Wissel nu'}</span>
      <span class="small">${M.fmt(M.elapsedInPeriod(match))} · ${M.periodLabel(team, match.clock.period)}</span>
    </div>
    <span class="sub">Tik een veldspeler om te kiezen wie eruit gaat, of een bankspeler om te kiezen wie erin komt.</span>

    <${Field} slots=${d.state.slots} lines=${team.lines} keeperId=${match.keeperId} nick=${nick} height=${340} compact
      onTap=${(id) => setOut(id)} neon=${[out]} dashed=${place && place.shift ? [place.shift.id] : []} below=${below} />

    ${place && html`<span class="sub" style="color:var(--ink);font-weight:700">
      ${nick(inn)} erin voor ${nick(out)}${place.shift ? ` · ${nick(place.shift.id)} schuift door naar ${LINE_NAMES[place.shift.to]}, ${nick(inn)} gaat naar ${LINE_NAMES[place.line]}` : ` · ${LINE_NAMES[place.line]}`}
    </span>`}

    <div class="col">
      <span class="label">Erin</span>
      <div class="wrap">
        ${eligible.map((id) => html`<button type="button" class="chip" aria-pressed=${inn === id ? 'true' : 'false'} onClick=${() => setIn(id)}>
          ${nick(id)}<span class="small" style="margin-left:6px">${M.mins(d.state.played[id])} min</span>
        </button>`)}
      </div>
    </div>

    ${!init.planned && html`<div class="col">
      <span class="label">${nick(out)} daarna</span>
      <${Seg} label="Daarna" value=${after} onChange=${setAfter} options=${[['terug', 'Kan terug'], ['periode', 'Rust deze ' + pw], ['wedstrijd', 'Hele wedstrijd']]} />
    </div>`}

    ${preview && html`<div class="card" style="box-shadow:none;border:1px solid var(--line);gap:8px">
      <span class="label">Na de wissel</span>
      <div class="wrap">
        ${preview.lines.map((l) => html`<span class="badge" style=${l.light ? 'background:var(--orange-tint);color:var(--ink)' : ''}>${l.name} ${l.light ? 'lichter' : '✓'}</span>`)}
      </div>
      <span class="sub">Speeltijd straks ${M.mins(pf.minPlayed)}–${M.mins(pf.maxPlayed)} min per kind${team.rules.equalTime ? (pf.spread <= marge * 60 + 1 ? ' · binnen de marge ✓' : ` · verschil ${M.mins(pf.spread)} min (marge ${marge})`) : ''}</span>
      <span class="sub">${preview.minTurns === preview.maxTurns ? `Iedereen ${preview.minTurns}× gewisseld${team.rules.evenOften ? ' ✓' : ''}` : `${preview.minTurns}–${preview.maxTurns}× gewisseld${team.rules.evenOften ? ' (niet gelijk)' : ''}`}</span>
      ${!isPlanned && init.planned && html`<span class="small">Je wijkt af van het plan; de volgende wissels passen zich aan.</span>`}
    </div>`}

    <${Neon} box><button type="button" class="btn primary block" style="box-shadow:none" disabled=${!place} onClick=${run}>${init.planned ? 'Wissel uitvoeren' : 'Wissel nu'}</button></${Neon}>
    <div class="row">
      ${init.planned && html`<button type="button" class="btn plain grow" onClick=${() => { mutate((m, t) => M.delay(m, t, 60)); toast('Wissel 1 minuut later'); onClose(); }}>1 min later</button>`}
      <button type="button" class="btn plain grow" onClick=${onClose}>Annuleren</button>
    </div>
  </${Sheet}>`;
}

// ---------- bankspeler ----------
function BenchSheet({ match, team, d, id, onClose, openSwap }) {
  const nick = M.nickOf(team, id);
  const dis = d.state.disabled[id];
  const pw = M.periodWord(team);
  return html`<${Sheet} onClose=${onClose} label=${nick}>
    <span class="h2" style="font-size:20px">${nick}</span>
    <span class="sub">Op de bank · ${M.mins(d.state.played[id])} min gespeeld · ${d.state.turns[id] || 0}× gewisseld</span>
    ${dis
      ? html`<p class="sub" style="margin:0">${dis === 'wedstrijd' ? 'Doet de rest van de wedstrijd niet meer mee.' : 'Rust tot het einde van deze ' + pw + '.'}</p>
        <button type="button" class="btn primary block" onClick=${() => { mutate((m, t) => M.enablePlayer(m, t, id)); toast(nick + ' is weer inzetbaar'); onClose(); }}>Weer inzetbaar</button>`
      : html`<button type="button" class="btn primary block" onClick=${() => openSwap({ in: id, out: M.suggestOut(match, team, id) })}>Nu erin</button>
        <button type="button" class="choice" onClick=${() => { mutate((m, t) => M.disablePlayer(m, t, id, 'periode')); toast(nick + ' rust deze ' + pw, undoAction); onClose(); }}>
          <span class="col" style="gap:1px"><span class="t" style="font-weight:800">Rest van de ${pw}</span><span class="small">Komt na de ${pw === 'helft' ? 'rust' : pw} weer in het schema</span></span>
        </button>
        <button type="button" class="choice" onClick=${() => { mutate((m, t) => M.disablePlayer(m, t, id, 'wedstrijd')); toast(nick + ' doet niet meer mee', undoAction); onClose(); }}>
          <span class="col" style="gap:1px"><span class="t" style="font-weight:800">Rest van de wedstrijd</span><span class="small">Bijvoorbeeld bij een blessure; telt niet mee in de verdeling</span></span>
        </button>`}
    <button type="button" class="btn plain block" onClick=${onClose}>Sluiten</button>
  </${Sheet}>`;
}

// ---------- goal ----------
function GoalSheet({ match, team, d, onClose }) {
  const nick = (id) => M.nickOf(team, id);
  const order = ['V', 'M', 'A'];
  const field = Object.keys(d.state.slots).sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0])).map((k) => d.state.slots[k]).filter(Boolean);
  const pick = (id) => {
    mutate((m, t) => M.goal(m, t, id));
    toast(id ? `Goal ${nick(id)}!` : 'Goal!', undoAction);
    onClose();
  };
  return html`<${Sheet} onClose=${onClose} label="Goal">
    <span class="h2" style="font-size:22px">Goal! Wie scoorde?</span>
    <div class="wrap">
      ${field.map((id) => html`<button type="button" class="chip" style="min-height:48px;font-size:15px" onClick=${() => pick(id)}>${nick(id)}</button>`)}
    </div>
    <button type="button" class="btn plain block" onClick=${() => pick(null)}>Later invullen</button>
  </${Sheet}>`;
}

// ---------- rust: nieuwe opstelling ----------
function BreakSheet({ match, team, d, onClose }) {
  const nick = (id) => M.nickOf(team, id);
  const current = { pos: d.state.pos, bench: d.state.bench, slots: d.state.slots };
  const proposal = useMemo(() => M.breakProposal(match, team), []);
  const [lu, setLu] = useState(proposal || current);
  const [sel, setSel] = useState(null);
  const tap = (id) => {
    if (!sel) setSel(id);
    else if (sel === id) setSel(null);
    else { setLu(M.swapInLineup(lu, sel, id)); setSel(null); }
  };
  const comingIn = Object.keys(lu.pos).filter((id) => !(id in d.state.pos));
  const goingOut = Object.keys(d.state.pos).filter((id) => !(id in lu.pos));
  const apply = () => { mutate((m, t) => M.applyLineup(m, t, lu)); toast('Opstelling staat klaar · start de klok bij de aftrap'); onClose(); };
  return html`<${Sheet} onClose=${onClose} label="Nieuwe opstelling">
    <span class="h2" style="font-size:20px">Opstelling ${M.periodLabel(team, match.clock.period)}</span>
    <span class="sub">${comingIn.length ? `Erin: ${comingIn.map(nick).join(', ')}. Naar de bank: ${goingOut.map(nick).join(', ')}.` : 'Dezelfde spelers, posities opnieuw verdeeld.'} Tik twee spelers om ze te ruilen.</span>
    <${Field} slots=${lu.slots} lines=${team.lines} keeperId=${match.keeperId} nick=${nick} height=${300} compact onTap=${tap} selected=${sel} neon=${comingIn} />
    <div class="benchrow">
      <span class="label">Bank</span>
      <div class="scroll">
        ${lu.bench.map((id) => html`<button type="button" class="benchpill" style=${sel === id ? 'background:var(--orange)' : ''} onClick=${() => tap(id)}>${nick(id)}<span class="t">${M.mins(d.state.played[id])} min</span></button>`)}
      </div>
    </div>
    <${Neon} box><button type="button" class="btn primary block" style="box-shadow:none" onClick=${apply}>Deze opstelling vastzetten</button></${Neon}>
    <div class="row">
      <button type="button" class="btn plain grow" onClick=${() => setLu(current)}>Zoals voor de rust</button>
      ${proposal && html`<button type="button" class="btn plain grow" onClick=${() => setLu(proposal)}>Voorstel</button>`}
    </div>
  </${Sheet}>`;
}

// ---------- speler komt later ----------
function JoinSheet({ match, team, onClose }) {
  const missing = team.players.filter((p) => p.active !== false && match.present.indexOf(p.id) === -1);
  return html`<${Sheet} onClose=${onClose} label="Later gekomen">
    <span class="h2" style="font-size:20px">Wie is er later gekomen?</span>
    ${missing.length
      ? html`<div class="wrap">${missing.map((p) => html`<button type="button" class="chip" onClick=${() => { mutate((m, t) => M.joinPlayer(m, t, p.id)); toast((p.nick || p.name) + ' zit op de bank', undoAction); onClose(); }}>${p.nick || p.name}</button>`)}</div>
        <span class="small">Komt op de bank en wordt in het schema opgenomen. Telt niet mee voor de gelijke verdeling.</span>`
      : html`<p class="sub" style="margin:0">Iedereen uit de selectie is er al.</p>`}
    <button type="button" class="btn plain block" onClick=${onClose}>Sluiten</button>
  </${Sheet}>`;
}
