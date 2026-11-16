import { html, useEffect, useMemo, useRef, useState } from '../../vendor/preact-htm.js';
import { update, currentMatch } from '../store.js';
import * as M from '../match.js';
import { LINE_NAMES } from '../planner.js';
import { Field, Neon, Sheet, Confirm, Seg, Switch, Icon, TeamBadge, OppBadge, useNow, useWakeLock, useDragSwap, justDragged, beep, flash, unlockAudio, toast, go, STANDS, POS_COLORS } from '../ui.js';


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

const UNDO_TEXT = { swap: 'wissel', goal: 'goal', oppgoal: 'tegengoal', disable: 'uitschakelen', enable: 'weer inzetbaar', join: 'later gekomen', move: 'plekken ruilen', keeper: 'keeperwissel' };
export const undoAction = { label: 'Ongedaan', run: () => { const ev = mutate((m, t) => M.undo(m, t)); if (ev) toast('Ongedaan: ' + UNDO_TEXT[ev.type]); } };

// ---------- wissel: schets bovenin, keuzes daaronder, knoppen in vaste balk ----------
export function SwapSheet({ match, team, d, init, counts, onClose }) {
  const [out, setOut] = useState(init.out);
  const [inn, setIn] = useState(init.in);
  const [after, setAfter] = useState('terug');
  const [pick, setPick] = useState(!!init.pick);
  const nick = (id) => M.nickOf(team, id);
  const place = useMemo(() => (out && inn ? M.placement(match, team, out, inn) : null), [out, inn]);
  const preview = useMemo(() => (place ? M.previewSwap(match, team, { out, in: inn, shift: place.shift }) : null), [place]);
  const pw = M.periodWord(team);
  const isPlanned = init.planned && out === init.out && inn === init.in;
  const pf = preview && preview.plan.fair;
  const marge = team.rules.marge;
  const target = M.turnsTarget(team);
  const kracht = (id) => { const p = team.players.find((x) => x.id === id); return p ? p.kracht : 50; };
  const st = d.state;

  // logische volgorde: wie het minst speelde erin, wie het vaakst/langst speelde eruit; het plan staat vooraan
  // volgorde ligt vast zodra het venster opent (knoppen springen niet weg bij het kiezen)
  const benchIds = useMemo(() => st.bench.filter((id) => !st.disabled[id]).sort((a, b) =>
    ((b === init.in) - (a === init.in)) || (st.played[a] - st.played[b]) || (Math.abs(kracht(a) - kracht(init.out)) - Math.abs(kracht(b) - kracht(init.out)))), []);
  const fieldIds = useMemo(() => Object.keys(st.pos).sort((a, b) =>
    ((b === init.out) - (a === init.out)) || (st.turns[a] - st.turns[b]) || (st.played[b] - st.played[a]) || (Math.abs(kracht(a) - kracht(init.in)) - Math.abs(kracht(b) - kracht(init.in)))), []);
  const bestIn = benchIds[0], bestOut = fieldIds[0];

  const run = (close) => {
    mutate((m, t) => {
      M.doSwap(m, t, out, inn, place.shift);
      if (after !== 'terug') M.disablePlayer(m, t, out, after);
    });
    toast(`${nick(inn)} erin voor ${nick(out)}`, undoAction);
    close();
  };
  const later = (close) => { mutate((m, t) => M.delay(m, t, 60)); toast('Wissel 1 minuut later'); close(); };
  const ok = (good) => html`<span class=${'fx ' + (good ? 'good' : 'warn')}>${good ? '✓' : '!'}</span>`;
  const chip = (id, active, onClick, warm, best) => html`<button type="button" class=${'chip big' + (warm ? ' warm' : '')} aria-pressed=${active ? 'true' : 'false'} onClick=${onClick}>
    ${st.pos[id] && html`<span class="ldot" style=${`background:${POS_COLORS[st.pos[id]]}`}></span>`}${nick(id)}<span class="small">${M.mins(st.played[id])}′</span>${best && html`<span class="best">${init.planned ? 'plan' : 'beste'}</span>`}
  </button>`;

  const footer = (close) => html`
    ${init.planned && html`<button type="button" class="btn ghostblue" style="flex:1 1 0" onClick=${() => later(close)}>1 min later</button>`}
    <button type="button" class="btn onblue" style="flex:2 1 0" disabled=${!place} onClick=${() => run(close)}>Wissel nu</button>`;

  return html`<${Sheet} onClose=${onClose} label="Wissel" x footer=${footer}>
    <div class="swaphead">
      <span class="h2">${isPlanned ? `Wissel ${counts.done + 1} van ${counts.total}` : 'Wissel'}</span>
      <span class="sub">${M.fmt(M.elapsedInPeriod(match))} · ${M.periodLabel(team, match.clock.period)}${!isPlanned && init.planned ? ' · afwijking van het plan' : ''}</span>
    </div>

    <div class="duo big">
      <div class="duo-side out">
        <span class="duo-label">Eruit</span>
        <span class="duo-name" key=${'o' + out}>${nick(out)}</span>
        <span class="duo-sub">${LINE_NAMES[st.pos[out]]} · ${M.mins(st.played[out])} min</span>
      </div>
      <span class="duo-arrow" aria-hidden="true"><${Icon} name="swap" size=${28} /></span>
      <div class="duo-side in">
        <span class="duo-label">Erin</span>
        <span class="duo-name" key=${'i' + inn}>${nick(inn)}</span>
        <span class="duo-sub">${place ? 'naar ' + LINE_NAMES[place.line] + ' · ' : ''}${M.mins(st.played[inn])} min</span>
      </div>
    </div>
    ${place && place.shift && html`<div class="shiftline"><${Icon} name="swap" size=${18} /> ${nick(place.shift.id)} schuift door naar ${LINE_NAMES[place.shift.to]}</div>`}

    <div class="sep"></div>

    <button type="button" class="pickbtn" aria-expanded=${pick ? 'true' : 'false'} onClick=${() => setPick(!pick)}>
      <span>Andere speler kiezen</span><span class=${'chev' + (pick ? ' open' : '')}><${Icon} name="chev" size=${18} /></span>
    </button>
    <div class=${'collapse' + (pick ? ' open' : '')}><div class="col" style="gap:12px">
      <div class="pickgroup">
        <span class="label">Erin · van de bank</span>
        <div class="wrap">${benchIds.map((id) => chip(id, inn === id, () => setIn(id), false, id === bestIn))}${!benchIds.length && html`<span class="small">Niemand inzetbaar op de bank</span>`}</div>
      </div>
      <div class="pickgroup">
        <span class="label">Eruit · uit het veld</span>
        <div class="wrap">${fieldIds.map((id) => chip(id, out === id, () => setOut(id), true, id === bestOut))}</div>
      </div>
    </div></div>

    <div class="col">
      <span class="label">${nick(out)} daarna</span>
      <${Seg} label="Daarna" value=${after} onChange=${setAfter} options=${[['terug', 'Kan terug'], ['periode', 'Rust deze ' + pw], ['wedstrijd', 'Klaar']]} />
    </div>

    ${preview && html`<div class="effects">
      <div class="fxrow">${ok(!preview.lines.some((l) => l.light))}<span>${preview.lines.some((l) => l.light) ? 'Lichter: ' + preview.lines.filter((l) => l.light).map((l) => l.name).join(', ') : 'Linies blijven in balans'}</span></div>
      <div class="fxrow">${ok(!team.rules.equalTime || pf.spread <= marge * 60 + 1)}<span>Speeltijd straks ${M.mins(pf.minPlayed)}–${M.mins(pf.maxPlayed)} min per kind</span></div>
      <div class="fxrow">${ok(target != null ? preview.minTurns === target && preview.maxTurns === target : preview.minTurns === preview.maxTurns)}<span>${preview.minTurns === preview.maxTurns ? `Iedereen ${preview.minTurns}× gewisseld` : `${preview.minTurns}–${preview.maxTurns}× gewisseld`}</span></div>
      ${!isPlanned && init.planned && html`<span class="small">De volgende wissels passen zich aan.</span>`}
    </div>`}
  </${Sheet}>`;
}

// ---------- bankspeler ----------
export function BenchSheet({ match, team, d, id, onClose, openSwap }) {
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
export function GoalSheet({ match, team, d, onClose }) {
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
export function BreakSheet({ match, team, d, onClose }) {
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
      <${Field} slots=${lu.slots} lines=${team.lines} keeperId=${d.state.keeper} nick=${nick} height=${360} onTap=${() => {}} neon=${comingIn} />
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
export function JoinSheet({ match, team, onClose }) {
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

// ---------- keeper wisselen (bijvoorbeeld bij een blessure) ----------
export function KeeperSheet({ match, team, d, onClose }) {
  const nick = (id) => M.nickOf(team, id);
  const keeper = d.state.keeper;
  const [to, setTo] = useState(null);
  const [mode, setMode] = useState('bank');
  const bench = d.state.bench.filter((id) => !d.state.disabled[id]);
  const field = Object.keys(d.state.pos);
  const fromField = !!to && to in d.state.pos;
  const opts = fromField ? [['veld', 'Neemt plek over'], ['bank', 'Naar de bank'], ['klaar', 'Blessure']] : [['bank', 'Naar de bank'], ['klaar', 'Blessure']];
  const m = opts.some(([v]) => v === mode) ? mode : 'bank';
  const run = () => {
    mutate((mm, t) => M.changeKeeper(mm, t, to, m));
    toast(`${nick(to)} keept nu`, undoAction);
    onClose();
  };
  return html`<${Sheet} onClose=${onClose} label="Keeper wisselen">
    <span class="h2" style="font-size:22px">Keeper wisselen</span>
    <span class="sub">Nu keept ${nick(keeper)}.</span>
    <div class="col">
      <span class="label">Nieuwe keeper</span>
      <div class="wrap">
        ${bench.map((id) => html`<button type="button" class="chip big" aria-pressed=${to === id ? 'true' : 'false'} onClick=${() => setTo(id)}>${nick(id)}<span class="small">bank</span></button>`)}
        ${field.map((id) => html`<button type="button" class="chip big warm" aria-pressed=${to === id ? 'true' : 'false'} onClick=${() => setTo(id)}>${nick(id)}<span class="small">veld</span></button>`)}
      </div>
    </div>
    ${to && html`<div class="col">
      <span class="label">${nick(keeper)} daarna</span>
      <${Seg} label="Oude keeper" value=${m} onChange=${setMode} options=${opts} />
      ${fromField && m !== 'veld' && html`<span class="small">Er komt iemand van de bank op de plek van ${nick(to)}.</span>`}
    </div>`}
    <${Neon} box><button type="button" class="btn primary block" style="box-shadow:none" disabled=${!to} onClick=${run}>Keeper wisselen</button></${Neon}>
    <button type="button" class="btn plain block" onClick=${onClose}>Annuleren</button>
  </${Sheet}>`;
}
