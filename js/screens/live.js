import { html, useEffect, useMemo, useRef, useState } from '../../vendor/preact-htm.js';
import { update, currentMatch } from '../store.js';
import * as M from '../match.js';
import { LINE_NAMES } from '../planner.js';
import { Field, Neon, Sheet, Confirm, Seg, Switch, Icon, TeamBadge, OppBadge, useNow, useWakeLock, useDragSwap, justDragged, beep, flash, unlockAudio, toast, go, STANDS } from '../ui.js';

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

const UNDO_TEXT = { swap: 'wissel', goal: 'goal', oppgoal: 'tegengoal', disable: 'uitschakelen', enable: 'weer inzetbaar', join: 'later gekomen', move: 'plekken ruilen' };
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
  const running = match.clock.running;
  const [sheet, setSheet] = useState(null);
  const zone = useRef(null);

  useWakeLock(match.started && !match.finished);

  // signaal: korte piep een minuut van tevoren, dan piep + flits op het moment zelf
  const alerted = useRef({});
  useEffect(() => {
    if (!running) return;
    if (next) {
      const key = next.t + ':' + next.out + ':' + next.in;
      if (countdown <= 60 && countdown > 1 && !alerted.current[key + 'a']) { alerted.current[key + 'a'] = 1; beep(1, 660); }
      if (countdown <= 0 && !alerted.current[key + 'b']) { alerted.current[key + 'b'] = 1; beep(3); flash(); }
    }
    if (timeUp && !alerted.current['end' + match.clock.period]) { alerted.current['end' + match.clock.period] = 1; beep(2, 520); flash(); }
  }, [tick, running]);

  const toggleClock = () => {
    unlockAudio();
    if (match.finished) return;
    if (running) { mutate((m) => M.pauseClock(m)); return; }
    if (pending) { setSheet({ type: 'break' }); return; }
    mutate((m) => M.startClock(m));
  };

  // slepen: veld↔bank = wissel nu, veld↔veld = plekken ruilen; voor de aftrap = startopstelling
  const onDrag = (a, b) => {
    if (!match.started) { mutate((m, t) => M.swapInStartLineup(m, t, a, b)); toast(`${nick(a)} ↔ ${nick(b)} · plan opnieuw berekend`); return; }
    const aF = a in d.state.pos, bF = b in d.state.pos;
    if (aF && bF) { mutate((m, t) => M.movePlayers(m, t, a, b)); toast(`${nick(a)} ↔ ${nick(b)} van plek gewisseld`, undoAction); return; }
    if (aF === bF) return;
    const out = aF ? a : b, inn = aF ? b : a;
    if (d.state.disabled[inn]) { toast(nick(inn) + ' is nu niet inzetbaar'); return; }
    mutate((m, t) => M.doSwap(m, t, out, inn, null));
    toast(`${nick(inn)} erin voor ${nick(out)}`, undoAction);
  };
  useDragSwap(zone, !match.finished && !pending, onDrag);

  const tapField = (id) => {
    if (match.finished || justDragged(zone)) return;
    if (!match.started) { toast('Sleep spelers om de startopstelling te wijzigen'); return; }
    if (pending) { setSheet({ type: 'break' }); return; }
    const inn = next && next.out === id ? next.in : M.suggestIn(match, team, id);
    if (!inn) { toast('Er zit niemand inzetbaar op de bank'); return; }
    setSheet({ type: 'swap', out: id, in: inn, planned: !!(next && next.out === id && next.in === inn) });
  };

  const tapBench = (id) => {
    if (match.finished || justDragged(zone)) return;
    if (!match.started) { toast('Sleep spelers om de startopstelling te wijzigen'); return; }
    setSheet({ type: 'bench', id });
  };

  const openPlanned = () => {
    if (pending) { setSheet({ type: 'break' }); return; }
    if (next) setSheet({ type: 'swap', out: next.out, in: next.in, planned: true });
  };

  const canUndo = !!M.lastUndoable(match);

  // ---------- banner ----------
  let banner;
  const bannerBtn = (inner, onClick, neon) => html`<button type="button" class="banner" style="border:none;padding:0;background:none;text-align:left;width:100%" onClick=${onClick}>
    ${neon ? html`<${Neon} box>${inner}</${Neon}>` : html`<span style="display:block;border-radius:20px">${inner}</span>`}
  </button>`;
  if (match.finished) {
    banner = html`<a class="banner calm" href=${'#/afloop/' + match.id}><span class="bin"><span class="h2">Wedstrijd afgelopen</span><span class="sub">Bekijk het overzicht →</span></span></a>`;
  } else if (!match.started) {
    banner = html`<div class="banner calm"><span class="bin">
      <span class="h2">Klaar voor de aftrap</span>
      <span class="sub">Sleep spelers om de opstelling te wijzigen. Tik op de klok bij de aftrap.${counts.planned ? ` ${counts.planned} wissels gepland${next ? ', de eerste na ' + M.fmt(next.t) : ''}.` : ''}</span>
    </span></div>`;
  } else if (pending) {
    banner = bannerBtn(html`<span class="bin"><span class="h2">Rust · opstelling voor de ${M.periodLabel(team, match.clock.period)}</span><span class="sub" style="color:var(--ink)">Tik om de nieuwe opstelling te bekijken</span></span>`, () => setSheet({ type: 'break' }), true);
  } else if (timeUp) {
    banner = bannerBtn(html`<span class="bin"><span class="h2">Tijd! Einde ${M.periodLabel(team, match.clock.period)}</span><span class="sub" style="color:var(--ink)">Tik om af te sluiten</span></span>`, () => setSheet({ type: 'end' }), true);
  } else if (next) {
    const due = countdown <= 0;
    const at = match.plan ? match.plan.at : 0;
    const progress = Math.max(0, Math.min(1, (T - at) / Math.max(1, next.t - at)));
    banner = bannerBtn(html`<span class="bin">
      <span class="between"><span class="h2">${due ? 'Nu wisselen' : 'Volgende wissel over ' + M.fmt(countdown)}</span><span class="small" style="color:var(--ink);font-weight:800">${counts.done + 1} van ${counts.total}</span></span>
      <span class="sub" style="color:var(--ink);font-weight:700">Klaarmaken: ${nick(next.in)} (voor ${nick(next.out)})</span>
      <span class="progress"><div style=${`width:${progress * 100}%`}></div></span>
    </span>`, openPlanned, countdown <= 60);
  } else {
    banner = html`<div class="banner calm"><span class="bin"><span class="h2">Geen wissels meer deze ${M.periodWord(team)}</span></span></div>`;
  }

  return html`<main class="screen">
    <div class="topbar">
      <a class="iconbtn" href="#/" aria-label="Terug"><${Icon} name="back" /></a>
      <span class="h2 grow" style="text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${match.opponent ? 'tegen ' + match.opponent : team.name}</span>
      <button type="button" class="iconbtn" aria-label="Laatste actie ongedaan maken" disabled=${!canUndo} onClick=${undoAction.run}><${Icon} name="undo" size=${20} /></button>
      <a class="link" href="#/plan">Plan</a>
    </div>

    <section class="card" style="gap:8px">
      <div class="clockrow">
        <button type="button" class=${'clockbtn ' + (match.finished ? 'done' : running ? 'running' : 'stopped')} onClick=${toggleClock}
          aria-label=${running ? 'Klok loopt, tik om te pauzeren' : 'Klok staat stil, tik om te starten'}>
          <span class="num clock" style=${el > L ? 'color:#B26A00' : ''}>${M.fmt(el)}</span>
          <span class="clockstate">${match.finished ? 'Afgelopen'
            : running ? html`<span class="rundot"></span>Loopt · tik voor pauze`
            : html`<${Icon} name="play" size=${14} />${match.started ? 'Stil · tik om te starten' : 'Tik bij de aftrap'}`}</span>
        </button>
        <button type="button" class="scorebtn" disabled=${!match.started || match.finished} onClick=${() => setSheet({ type: 'goal' })} aria-label=${`Stand ${d.score.us} tegen ${d.score.them}, tik bij een doelpunt`}>
          <span class="num score bump" key=${d.score.us + '-' + d.score.them}>${d.score.us}–${d.score.them}</span>
          <span class="clockstate">${match.started && !match.finished ? 'tik bij goal' : 'stand'}</span>
        </button>
      </div>
      <div class="between">
        <span class="small">${M.periodLabel(team, match.clock.period)} · ${team.periodMin} min</span>
        ${match.started && !match.finished && !pending && html`<button type="button" class="link" onClick=${() => setSheet({ type: 'end' })}>Einde ${M.periodLabel(team, match.clock.period)}</button>`}
      </div>
    </section>

    ${banner}

    ${!match.finished && html`<div class="between" style="gap:10px">
      <div class="col" style="gap:0"><span class="label">Opstelling</span><span class="small">geldt vanaf de volgende wissel</span></div>
      ${team.rules.autoStand && html`<div class="row"><span class="small" style="font-weight:700">Auto</span><${Switch} label="Automatisch op stand" on=${match.standMode !== 'manual'} onChange=${(v) => mutate((m, t) => M.setStand(m, t, v ? 'auto' : 'manual', stand))} /></div>`}
    </div>`}
    ${!match.finished && html`<${Seg} label="Opstellingsstand" value=${stand} options=${STANDS} onChange=${(v) => mutate((m, t) => M.setStand(m, t, 'manual', v))} />`}

    <div ref=${zone} class="col" style="gap:10px">
      <${Field} slots=${d.state.slots} lines=${team.lines} keeperId=${match.keeperId} nick=${nick}
        onTap=${match.finished ? null : tapField}
        neon=${match.started && next && !pending ? [next.out] : []}
        sub=${(id) => M.fmt(d.state.played[id])} />
      <div class="benchrow">
        <span class="label">Bank</span>
        <div class="scroll">
          ${d.state.bench.map((id) => {
            const dis = d.state.disabled[id];
            const isNext = match.started && next && next.in === id && !pending;
            const pill = html`<button type="button" key=${id} data-pid=${id} class=${'benchpill' + (dis ? ' off' : '')} onClick=${() => tapBench(id)}>
              ${nick(id)}<span class="t">${dis ? (dis === 'wedstrijd' ? 'klaar' : 'rust') : isNext ? 'klaarmaken' : M.mins(d.state.played[id]) + ' min'}</span>
            </button>`;
            return isNext ? html`<${Neon} key=${'n' + id}>${pill}</${Neon}>` : pill;
          })}
          ${!d.state.bench.length && html`<span class="small">Niemand</span>`}
        </div>
        ${match.started && !match.finished && html`<button type="button" class="iconbtn" aria-label="Speler later gekomen" onClick=${() => setSheet({ type: 'join' })}><${Icon} name="plus" size=${18} /></button>`}
      </div>
    </div>
    ${!match.finished && html`<span class="small" style="text-align:center">Tik een speler om te wisselen · sleep om direct te ruilen</span>`}
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

// ---------- wissel: groot en leesbaar ----------
function SwapSheet({ match, team, d, init, counts, onClose }) {
  const [out, setOut] = useState(init.out);
  const [inn, setIn] = useState(init.in);
  const [after, setAfter] = useState('terug');
  const nick = (id) => M.nickOf(team, id);
  const place = useMemo(() => (out && inn ? M.placement(match, team, out, inn) : null), [out, inn]);
  const preview = useMemo(() => (place ? M.previewSwap(match, team, { out, in: inn, shift: place.shift }) : null), [place]);
  const eligible = d.state.bench.filter((id) => !d.state.disabled[id]);
  const order = ['V', 'M', 'A'];
  const fieldIds = Object.keys(d.state.pos).sort((a, b) => order.indexOf(d.state.pos[a]) - order.indexOf(d.state.pos[b]));
  const pw = M.periodWord(team);
  const isPlanned = init.planned && out === init.out && inn === init.in;
  const pf = preview && preview.plan.fair;
  const marge = team.rules.marge;
  const target = M.turnsTarget(team);

  const run = () => {
    mutate((m, t) => {
      M.doSwap(m, t, out, inn, place.shift);
      if (after !== 'terug') M.disablePlayer(m, t, out, after);
    });
    toast(`${nick(inn)} erin voor ${nick(out)}`, undoAction);
    onClose();
  };
  const ok = (good) => html`<span class=${'fx ' + (good ? 'good' : 'warn')}>${good ? '✓' : '!'}</span>`;

  return html`<${Sheet} onClose=${onClose} label="Wissel">
    <div class="between">
      <span class="h2" style="font-size:22px">${isPlanned ? `Wissel ${counts.done + 1} van ${counts.total}` : 'Wissel'}</span>
      <span class="sub">${M.fmt(M.elapsedInPeriod(match))} · ${M.periodLabel(team, match.clock.period)}</span>
    </div>

    <div class="duo">
      <div class="duo-side out">
        <span class="duo-label">Eruit</span>
        <span class="duo-name">${nick(out)}</span>
        <span class="duo-sub">${LINE_NAMES[d.state.pos[out]]} · ${M.mins(d.state.played[out])} min gespeeld</span>
      </div>
      <span class="duo-arrow" aria-hidden="true"><${Icon} name="swap" size=${26} /></span>
      <div class="duo-side in">
        <span class="duo-label">Erin</span>
        <span class="duo-name">${nick(inn)}</span>
        <span class="duo-sub">${place ? 'naar ' + LINE_NAMES[place.line] + ' · ' : ''}${M.mins(d.state.played[inn])} min</span>
      </div>
    </div>
    ${place && place.shift && html`<div class="shiftline"><${Icon} name="swap" size=${18} /> ${nick(place.shift.id)} schuift door naar ${LINE_NAMES[place.shift.to]}</div>`}

    <div class="col">
      <span class="label">Wie gaat erin?</span>
      <div class="wrap">
        ${eligible.map((id) => html`<button type="button" class="chip big" aria-pressed=${inn === id ? 'true' : 'false'} onClick=${() => setIn(id)}>${nick(id)}<span class="small">${M.mins(d.state.played[id])}′</span></button>`)}
      </div>
    </div>
    <div class="col">
      <span class="label">Wie gaat eruit?</span>
      <div class="wrap">
        ${fieldIds.map((id) => html`<button type="button" class="chip big warm" aria-pressed=${out === id ? 'true' : 'false'} onClick=${() => setOut(id)}>${nick(id)}<span class="small">${M.mins(d.state.played[id])}′</span></button>`)}
      </div>
    </div>

    <div class="col">
      <span class="label">${nick(out)} daarna</span>
      <${Seg} label="Daarna" value=${after} onChange=${setAfter} options=${[['terug', 'Kan terug'], ['periode', 'Rust deze ' + pw], ['wedstrijd', 'Klaar']]} />
    </div>

    ${preview && html`<div class="effects">
      <div class="fxrow">${ok(!preview.lines.some((l) => l.light))}<span>${preview.lines.some((l) => l.light) ? 'Lichter: ' + preview.lines.filter((l) => l.light).map((l) => l.name).join(', ') : 'Linies blijven in balans'}</span></div>
      <div class="fxrow">${ok(!team.rules.equalTime || pf.spread <= marge * 60 + 1)}<span>Speeltijd straks ${M.mins(pf.minPlayed)}–${M.mins(pf.maxPlayed)} min per kind</span></div>
      <div class="fxrow">${ok(target != null ? preview.minTurns === target && preview.maxTurns === target : preview.minTurns === preview.maxTurns)}<span>${preview.minTurns === preview.maxTurns ? `Iedereen ${preview.minTurns}× gewisseld` : `${preview.minTurns}–${preview.maxTurns}× gewisseld`}</span></div>
      ${!isPlanned && init.planned && html`<span class="small">Je wijkt af van het plan; de volgende wissels passen zich aan.</span>`}
    </div>`}

    <${Neon} box><button type="button" class="btn primary block" style="box-shadow:none;min-height:60px;font-size:19px" disabled=${!place} onClick=${run}>Wissel nu</button></${Neon}>
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
    <span class="h2" style="font-size:22px">${nick}</span>
    <span class="sub">Op de bank · ${M.mins(d.state.played[id])} min gespeeld · ${d.state.turns[id] || 0}× gewisseld</span>
    ${dis
      ? html`<p class="sub" style="margin:0">${dis === 'wedstrijd' ? 'Doet de rest van de wedstrijd niet meer mee.' : 'Rust tot het einde van deze ' + pw + '.'}</p>
        <button type="button" class="btn primary block" onClick=${() => { mutate((m, t) => M.enablePlayer(m, t, id)); toast(nick + ' is weer inzetbaar'); onClose(); }}>Weer inzetbaar</button>`
      : html`<button type="button" class="btn primary block" onClick=${() => openSwap({ in: id, out: M.suggestOut(match, team, id) })}>Nu erin</button>
        <button type="button" class="choice" onClick=${() => { mutate((m, t) => M.disablePlayer(m, t, id, 'periode')); toast(nick + ' rust deze ' + pw, undoAction); onClose(); }}>
          <span class="col" style="gap:1px"><span style="font-weight:800;font-size:16px">Rest van de ${pw}</span><span class="sub">Komt daarna weer in het schema</span></span>
        </button>
        <button type="button" class="choice" onClick=${() => { mutate((m, t) => M.disablePlayer(m, t, id, 'wedstrijd')); toast(nick + ' doet niet meer mee', undoAction); onClose(); }}>
          <span class="col" style="gap:1px"><span style="font-weight:800;font-size:16px">Rest van de wedstrijd</span><span class="sub">Bijvoorbeeld bij een blessure</span></span>
        </button>`}
    <button type="button" class="btn plain block" onClick=${onClose}>Sluiten</button>
  </${Sheet}>`;
}

// ---------- doelpunt: tik op ons logo of dat van de tegenstander ----------
function GoalSheet({ match, team, d, onClose }) {
  const [step, setStep] = useState('who');
  const nick = (id) => M.nickOf(team, id);
  const order = ['V', 'M', 'A'];
  const field = Object.keys(d.state.slots).sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0])).map((k) => d.state.slots[k]).filter(Boolean);
  const pick = (id) => {
    mutate((m, t) => M.goal(m, t, id));
    toast(id ? `Goal ${nick(id)}!` : 'Goal!', undoAction);
    onClose();
  };
  if (step === 'scorer') {
    return html`<${Sheet} onClose=${onClose} label="Wie scoorde">
      <span class="h2" style="font-size:22px">Goal! Wie scoorde?</span>
      <div class="wrap">${field.map((id) => html`<button type="button" class="chip big" onClick=${() => pick(id)}>${nick(id)}</button>`)}</div>
      <button type="button" class="btn plain block" onClick=${() => pick(null)}>Weet ik niet / later</button>
    </${Sheet}>`;
  }
  return html`<${Sheet} onClose=${onClose} label="Doelpunt">
    <span class="h2" style="font-size:22px">Doelpunt voor…</span>
    <div class="goaltiles">
      <button type="button" class="goaltile us" onClick=${() => setStep('scorer')}>
        <${TeamBadge} team=${team} size=${84} />
        <span class="gt-name">${team.name}</span>
        <span class="gt-sub">Goal voor ons</span>
      </button>
      <button type="button" class="goaltile them" onClick=${() => { mutate((m, t) => M.oppGoal(m, t)); toast('Tegengoal', undoAction); onClose(); }}>
        <${OppBadge} name=${match.opponent} size=${84} />
        <span class="gt-name">${match.opponent || 'Tegenstander'}</span>
        <span class="gt-sub">Tegengoal</span>
      </button>
    </div>
    <button type="button" class="btn plain block" onClick=${onClose}>Annuleren</button>
  </${Sheet}>`;
}

// ---------- rust: nieuwe opstelling ----------
function BreakSheet({ match, team, d, onClose }) {
  const nick = (id) => M.nickOf(team, id);
  const current = { pos: d.state.pos, bench: d.state.bench, slots: d.state.slots };
  const proposal = useMemo(() => M.breakProposal(match, team), []);
  const [lu, setLu] = useState(proposal || current);
  const zone = useRef(null);
  useDragSwap(zone, true, (a, b) => setLu((x) => M.swapInLineup(x, a, b)));
  const comingIn = Object.keys(lu.pos).filter((id) => !(id in d.state.pos));
  const goingOut = Object.keys(d.state.pos).filter((id) => !(id in lu.pos));
  const apply = () => { mutate((m, t) => M.applyLineup(m, t, lu)); toast('Opstelling staat klaar · tik op de klok bij de aftrap'); onClose(); };
  return html`<${Sheet} onClose=${onClose} label="Nieuwe opstelling">
    <span class="h2" style="font-size:22px">Opstelling ${M.periodLabel(team, match.clock.period)}</span>
    <span class="sub" style="color:var(--ink)">${comingIn.length ? html`<span class="chg in">Erin: ${comingIn.map(nick).join(', ')}</span> <span class="chg out">Eruit: ${goingOut.map(nick).join(', ')}</span>` : 'Dezelfde spelers, posities opnieuw verdeeld.'}</span>
    <div ref=${zone} class="col" style="gap:8px">
      <${Field} slots=${lu.slots} lines=${team.lines} keeperId=${match.keeperId} nick=${nick} height=${300} onTap=${() => {}} neon=${comingIn} />
      <div class="benchrow">
        <span class="label">Bank</span>
        <div class="scroll">
          ${lu.bench.map((id) => html`<button type="button" key=${id} data-pid=${id} class="benchpill">${nick(id)}<span class="t">${M.mins(d.state.played[id])} min</span></button>`)}
        </div>
      </div>
    </div>
    <span class="small">Sleep spelers om te ruilen.</span>
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
    <span class="h2" style="font-size:22px">Wie is er later gekomen?</span>
    ${missing.length
      ? html`<div class="wrap">${missing.map((p) => html`<button type="button" class="chip big" onClick=${() => { mutate((m, t) => M.joinPlayer(m, t, p.id)); toast((p.nick || p.name) + ' zit op de bank', undoAction); onClose(); }}>${p.nick || p.name}</button>`)}</div>
        <span class="small">Komt op de bank en wordt in het schema opgenomen. Telt niet mee voor de gelijke verdeling.</span>`
      : html`<p class="sub" style="margin:0">Iedereen uit de selectie is er al.</p>`}
    <button type="button" class="btn plain block" onClick=${onClose}>Sluiten</button>
  </${Sheet}>`;
}
