import { html, useEffect, useMemo, useRef, useState } from '../../vendor/preact-htm.js';
import { update, currentMatch } from '../store.js';
import * as M from '../match.js';
import { LINE_NAMES } from '../planner.js';
import { Field, accentFor, Neon, Sheet, Confirm, Seg, Switch, Icon, TeamBadge, OppBadge, useNow, useWakeLock, useDragSwap, justDragged, beep, flash, unlockAudio, toast, go, STANDS, POS_COLORS, POS_NAMES } from '../ui.js';


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

// ---------- wissel: schets bovenin (tik een tegel om te kiezen), knoppen in vaste balk ----------
// Labels: "plan" = de volgende wissel uit het actuele plan (dat na elke afwijking opnieuw wordt berekend);
// "advies" = kies je zelf een andere speler, dan is dit de beste partner voor die keuze.
// dominante rol als klein gekleurd label achter de naam
function domChip(team, id) {
  const p = team.players.find((x) => x.id === id);
  return p && p.main ? html` <span class="dom" style=${'--acc:' + POS_COLORS[p.main]}>${POS_NAMES[p.main]}</span>` : null;
}

export function SwapSheet({ match, team, d, init, counts, onClose, onDone }) {
  const st = d.state;
  const pending = M.lineupPending(match, team);
  const next = pending ? null : M.nextSwap(match, team);
  const planOut = next ? next.out : null, planIn = next ? next.in : null;
  const [out, setOut] = useState(init.out);
  const [inn, setIn] = useState(init.in);
  const [after, setAfter] = useState((next && next.fixed && next.after && init.out === next.out && init.in === next.in) ? next.after : 'terug');
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState('out');
  const nick = (id) => M.nickOf(team, id);
  const place = useMemo(() => (out && inn ? M.placement(match, team, out, inn) : null), [out, inn]);
  const preview = useMemo(() => (place ? M.previewSwap(match, team, { out, in: inn, shift: place.shift }) : null), [place]);
  const pw = M.periodWord(team);
  const isPlanned = !!next && out === planOut && inn === planIn;
  const pf = preview && preview.plan.fair;
  const marge = team.rules.marge;
  const target = M.turnsTarget(team);
  const kracht = (id) => { const p = team.players.find((x) => x.id === id); return p ? p.kracht : 50; };

  // vaste volgorde zodra het venster opent: plan vooraan, dan wie het minst speelde (bank) of het meest/vaakst (veld)
  const benchIds = useMemo(() => st.bench.filter((id) => !st.disabled[id]).sort((a, b) =>
    ((b === planIn) - (a === planIn)) || (st.played[a] - st.played[b]) || (Math.abs(kracht(a) - kracht(init.out)) - Math.abs(kracht(b) - kracht(init.out)))), []);
  const fieldIds = useMemo(() => Object.keys(st.pos).sort((a, b) =>
    ((b === planOut) - (a === planOut)) || (st.turns[a] - st.turns[b]) || (st.played[b] - st.played[a]) || (Math.abs(kracht(a) - kracht(init.in)) - Math.abs(kracht(b) - kracht(init.in)))), []);
  const bestFor = (list, other, side) => list.slice().sort((a, b) => side === 'in'
    ? (st.played[a] - st.played[b]) || (Math.abs(kracht(a) - kracht(other)) - Math.abs(kracht(b) - kracht(other)))
    : (st.turns[a] - st.turns[b]) || (st.played[b] - st.played[a]) || (Math.abs(kracht(a) - kracht(other)) - Math.abs(kracht(b) - kracht(other))))[0];
  const adviesIn = out !== planOut ? bestFor(benchIds, out, 'in') : null;
  const adviesOut = inn !== planIn ? bestFor(fieldIds, inn, 'out') : null;

  const toggle = (side) => { if (open && panel === side) setOpen(false); else { setPanel(side); setOpen(true); } };
  const choose = (side, id) => { if (side === 'out') setOut(id); else setIn(id); setOpen(false); };
  const run = (close) => {
    mutate((m, t) => {
      M.doSwap(m, t, out, inn, place.shift);
      if (after !== 'terug') M.disablePlayer(m, t, out, after);
    });
    if (onDone) onDone({ out, status: after, undos: after !== 'terug' ? 2 : 1 });
    else toast(`${nick(inn)} erin voor ${nick(out)}`, undoAction);
    close();
  };
  const later = (close) => { mutate((m, t) => M.delay(m, t, 60)); toast('Wissel 1 minuut later'); close(); };
  const save = (close) => {
    const ok = mutate((m, t) => M.fixSwap(m, t, out, inn, after));
    if (ok) toast(`Bewaard: ${nick(inn)} erin voor ${nick(out)} om ${M.fmt(next.t - match.clock.period * M.periodLen(team))}`, { label: 'Ongedaan', run: () => { mutate((m, t) => M.clearFixed(m, t)); toast('Bewaarde wissel teruggedraaid'); } });
    else toast('Bewaren lukt niet: kies een speler die nu op de bank zit');
    close();
  };
  const ok = (good) => html`<span class=${'fx ' + (good ? 'good' : 'warn')}>${good ? '✓' : '!'}</span>`;
  const tagOf = (side, id) => (id === (side === 'out' ? planOut : planIn) ? 'plan' : id === (side === 'out' ? adviesOut : adviesIn) ? 'advies' : null);
  const row = (side, id) => {
    const on = side === 'out' ? out === id : inn === id;
    const tag = tagOf(side, id);
    const t = st.turns[id] || 0;
    return html`<button type="button" key=${side + id} class=${'prow2' + (side === 'out' ? ' warm' : '') + (on ? ' on' : '')} onClick=${() => choose(side, id)}>
      <span class="ldot" style=${`background:${st.pos[id] ? POS_COLORS[st.pos[id]] : 'var(--line-2)'}`}></span>
      <span class="col grow" style="gap:1px;min-width:0">
        <span class="pr-name">${nick(id)}${domChip(team, id)}${tag && html` <span class=${'tag ' + tag}>${tag}</span>`}</span>
        <span class="pr-meta">${st.pos[id] ? LINE_NAMES[st.pos[id]] + ' · ' : ''}${M.mins(st.played[id])} min · ${t ? t + '× gewisseld' : 'nog niet gewisseld'}</span>
      </span>
      ${on && html`<span class="pr-check" aria-hidden="true">✓</span>`}
    </button>`;
  };
  const list = panel === 'out' ? fieldIds : benchIds;

  const footer = (close) => html`
    ${next && html`<button type="button" class="btn ghostblue" style="flex:1 1 0" onClick=${() => later(close)}>1 min later</button>`}
    ${next && !isPlanned && html`<button type="button" class="btn ghostblue" style="flex:1 1 0" disabled=${!place} onClick=${() => save(close)}>Bewaren</button>`}
    <button type="button" class="btn onblue" style="flex:1.4 1 0" disabled=${!place} onClick=${() => run(close)}>Wissel nu</button>`;

  return html`<${Sheet} onClose=${onClose} label="Wissel" x footer=${footer}>
    <div class="swaphead">
      <span class="h2">${isPlanned ? `Wissel ${counts.done + 1} van ${counts.total}` : next ? 'Wissel · aangepast' : 'Wissel'}</span>
      <span class="sub">${M.fmt(M.elapsedInPeriod(match))} · ${M.periodLabel(team, match.clock.period)}${next && next.fixed && isPlanned ? ' · bewaarde wissel' : ''}</span>
    </div>

    <div class="duo big">
      <button type="button" class="duo-side out" aria-expanded=${open && panel === 'out' ? 'true' : 'false'} onClick=${() => toggle('out')}>
        <span class="duo-chev" aria-hidden="true"><${Icon} name="chev" size=${16} /></span>
        <span class="duo-label">Eruit</span>
        <span class="duo-name" key=${'o' + out}>${nick(out)}</span>
        <span class="duo-sub">${LINE_NAMES[st.pos[out]]} · ${M.mins(st.played[out])} min</span>
      </button>
      <span class="duo-arrow" aria-hidden="true"><${Icon} name="swap" size=${28} /></span>
      <button type="button" class="duo-side in" aria-expanded=${open && panel === 'in' ? 'true' : 'false'} onClick=${() => toggle('in')}>
        <span class="duo-chev" aria-hidden="true"><${Icon} name="chev" size=${16} /></span>
        <span class="duo-label">Erin</span>
        <span class="duo-name" key=${'i' + inn}>${nick(inn)}</span>
        <span class="duo-sub">${place ? 'naar ' + LINE_NAMES[place.line] + ' · ' : ''}${M.mins(st.played[inn])} min</span>
      </button>
    </div>
    ${!open && html`<span class="swapnote">Tik op een naam om een andere speler te kiezen</span>`}
    <div class=${'collapse' + (open ? ' open' : '')}><div>
      <div class="plist" key=${panel}>
        <span class="plabel">${panel === 'out' ? 'Wie gaat eruit? · in het veld' : 'Wie komt erin? · op de bank'}</span>
        ${list.map((id) => row(panel, id))}
        ${panel === 'in' && benchIds.length <= 1 && html`<span class="small">Geen andere spelers inzetbaar op de bank.</span>`}
      </div>
    </div></div>
    ${place && place.shift && html`<div class="shiftline"><${Icon} name="swap" size=${18} /> ${nick(place.shift.id)} schuift door naar ${LINE_NAMES[place.shift.to]}</div>`}

    <div class="col">
      <span class="label">${nick(out)} daarna</span>
      <${Seg} label="Daarna" value=${after} onChange=${setAfter} options=${[['terug', 'Kan terug'], ['periode', 'Rust deze ' + pw], ['wedstrijd', 'Klaar']]} />
    </div>

    ${preview && html`<div class="effects">
      <div class="fxrow">${ok(!preview.lines.some((l) => l.light))}<span>${preview.lines.some((l) => l.light) ? 'Lichter: ' + preview.lines.filter((l) => l.light).map((l) => l.name).join(', ') : 'Linies blijven in balans'}</span></div>
      <div class="fxrow">${ok(!team.rules.equalTime || pf.spread <= marge * 60 + 1)}<span>Speeltijd straks ${M.mins(pf.minPlayed)}–${M.mins(pf.maxPlayed)} min per kind</span></div>
      <div class="fxrow">${ok(target != null ? preview.minTurns === target && preview.maxTurns === target : preview.minTurns === preview.maxTurns)}<span>${preview.minTurns === preview.maxTurns ? `Iedereen ${preview.minTurns}× gewisseld` : `${preview.minTurns}–${preview.maxTurns}× gewisseld`}</span></div>
      ${!isPlanned && next && html`<span class="small">Wissel nu: de app rekent direct een nieuw plan. Bewaren: deze wissel gebeurt op het geplande moment, daarna rekent de app verder.</span>`}
    </div>`}
  </${Sheet}>`;
}

// ---------- meerdere spelers tegelijk ----------
export function GroupSwapSheet({ match, team, d, counts, onClose, onDone }) {
  const st = d.state;
  const planned = M.nextGroup(match, team);
  const first = planned[0] || null;
  const [pairs, setPairs] = useState(planned.map((s) => ({ out: s.out, in: s.in })));
  const [after, setAfter] = useState(first && first.fixed && first.after ? first.after : 'terug');
  const [open, setOpen] = useState(null); // { i, side }
  const [last, setLast] = useState({ i: 0, side: 'out' });
  const nick = (id) => M.nickOf(team, id);
  const pw = M.periodWord(team);
  const kracht = (id) => { const p = team.players.find((x) => x.id === id); return p ? p.kracht : 50; };
  const placed = useMemo(() => M.placeGroup(match, team, pairs), [pairs]);
  const preview = useMemo(() => (pairs.length ? M.previewSwap(match, team, { pairs }) : null), [pairs]);
  const key = (ps) => ps.map((p) => p.out + '>' + p.in).sort().join('|');
  const isPlanned = !!first && key(pairs) === key(planned);
  const planOuts = planned.map((s) => s.out), planIns = planned.map((s) => s.in);
  const usedOut = pairs.map((p) => p.out), usedIn = pairs.map((p) => p.in);
  const benchAll = useMemo(() => st.bench.filter((id) => !st.disabled[id]).sort((a, b) => ((planIns.indexOf(b) !== -1) - (planIns.indexOf(a) !== -1)) || (st.played[a] - st.played[b])), []);
  const fieldAll = useMemo(() => Object.keys(st.pos).sort((a, b) => ((planOuts.indexOf(b) !== -1) - (planOuts.indexOf(a) !== -1)) || (st.turns[a] - st.turns[b]) || (st.played[b] - st.played[a])), []);
  const pf = preview && preview.plan.fair;
  const marge = team.rules.marge;
  const target = M.turnsTarget(team);

  const setPair = (i, side, id) => { setPairs(pairs.map((p, k) => (k === i ? { ...p, [side]: id } : p))); setOpen(null); };
  const toggle = (i, side) => { if (open && open.i === i && open.side === side) setOpen(null); else { setOpen({ i, side }); setLast({ i, side }); } };
  const remove = (i) => { setPairs(pairs.filter((_, k) => k !== i)); setOpen(null); };
  const freeIn = benchAll.filter((id) => usedIn.indexOf(id) === -1);
  const freeOut = fieldAll.filter((id) => usedOut.indexOf(id) === -1);
  const add = () => {
    if (!freeIn.length || !freeOut.length) return;
    const inn = freeIn[0];
    const out = freeOut.slice().sort((a, b) => (st.turns[a] - st.turns[b]) || (st.played[b] - st.played[a]) || (Math.abs(kracht(a) - kracht(inn)) - Math.abs(kracht(b) - kracht(inn))))[0];
    setPairs(pairs.concat([{ out, in: inn }]));
  };
  const run = (close) => {
    mutate((m, t) => {
      M.doSwapGroup(m, t, pairs);
      if (after !== 'terug') for (const p of pairs) M.disablePlayer(m, t, p.out, after);
    });
    if (onDone) onDone({ outs: pairs.map((p) => p.out), status: after, undos: 1 + (after !== 'terug' ? pairs.length : 0) });
    else toast(`${pairs.length} wissels: ${pairs.map((p) => nick(p.in)).join(', ')} erin`, undoAction);
    close();
  };
  const later = (close) => { mutate((m, t) => M.delay(m, t, 60)); toast('Wissels 1 minuut later'); close(); };
  const save = (close) => {
    const ok = mutate((m, t) => M.fixGroup(m, t, pairs, after));
    if (ok) toast(`Bewaard voor ${M.fmt(first.t - match.clock.period * M.periodLen(team))}`, { label: 'Ongedaan', run: () => { mutate((m, t) => M.clearFixed(m, t)); toast('Bewaarde wissels teruggedraaid'); } });
    else toast('Bewaren lukt niet met deze keuze');
    close();
  };
  const ok = (good) => html`<span class=${'fx ' + (good ? 'good' : 'warn')}>${good ? '✓' : '!'}</span>`;
  const row = (i, side, id) => {
    const cur = pairs[i] && pairs[i][side];
    const tag = (side === 'out' ? planOuts : planIns).indexOf(id) !== -1 ? 'plan' : null;
    const t = st.turns[id] || 0;
    return html`<button type="button" key=${side + id} class=${'prow2' + (side === 'out' ? ' warm' : '') + (cur === id ? ' on' : '')} onClick=${() => setPair(i, side, id)}>
      <span class="ldot" style=${`background:${st.pos[id] ? POS_COLORS[st.pos[id]] : 'var(--line-2)'}`}></span>
      <span class="col grow" style="gap:1px;min-width:0">
        <span class="pr-name">${nick(id)}${domChip(team, id)}${tag && html` <span class="tag plan">plan</span>`}</span>
        <span class="pr-meta">${st.pos[id] ? LINE_NAMES[st.pos[id]] + ' · ' : ''}${M.mins(st.played[id])} min · ${t ? t + '× gewisseld' : 'nog niet gewisseld'}</span>
      </span>
      ${cur === id && html`<span class="pr-check" aria-hidden="true">✓</span>`}
    </button>`;
  };
  const panelList = () => {
    const { i, side } = last;
    const p = pairs[i];
    if (!p) return [];
    const pool = side === 'out' ? fieldAll.filter((id) => id === p.out || usedOut.indexOf(id) === -1) : benchAll.filter((id) => id === p.in || usedIn.indexOf(id) === -1);
    return pool.map((id) => row(i, side, id));
  };

  const footer = (close) => html`
    ${first && html`<button type="button" class="btn ghostblue" style="flex:1 1 0" onClick=${() => later(close)}>1 min later</button>`}
    ${first && !isPlanned && html`<button type="button" class="btn ghostblue" style="flex:1 1 0" disabled=${!pairs.length} onClick=${() => save(close)}>Bewaren</button>`}
    <button type="button" class="btn onblue" style="flex:1.4 1 0" disabled=${!pairs.length} onClick=${() => run(close)}>Wissel nu</button>`;

  return html`<${Sheet} onClose=${onClose} label="Wissels" x footer=${footer}>
    <div class="swaphead">
      <span class="h2">${isPlanned ? `Wissel ${counts.done + 1} van ${counts.total}` : 'Wissels · aangepast'}</span>
      <span class="sub">${pairs.length} ${pairs.length === 1 ? 'speler' : 'spelers'} tegelijk · ${M.fmt(M.elapsedInPeriod(match))} · ${M.periodLabel(team, match.clock.period)}</span>
    </div>
    <div class="gpairs">
      ${pairs.map((p, i) => {
        const pl = placed[i] || {};
        return html`<div class="gpair-wrap" key=${'p' + i}>
          <div class="gpair">
            <button type="button" class="gtile out" aria-expanded=${open && open.i === i && open.side === 'out' ? 'true' : 'false'} onClick=${() => toggle(i, 'out')}>
              <span class="duo-label">Eruit</span><span class="gname" key=${'o' + p.out}>${nick(p.out)}</span>
              <span class="gsub">${LINE_NAMES[st.pos[p.out]] || ''} · ${M.mins(st.played[p.out])} min</span>
            </button>
            <span class="duo-arrow" aria-hidden="true"><${Icon} name="swap" size=${22} /></span>
            <button type="button" class="gtile in" aria-expanded=${open && open.i === i && open.side === 'in' ? 'true' : 'false'} onClick=${() => toggle(i, 'in')}>
              <span class="duo-label">Erin</span><span class="gname" key=${'i' + p.in}>${nick(p.in)}</span>
              <span class="gsub">${pl.line ? 'naar ' + LINE_NAMES[pl.line] + ' · ' : ''}${M.mins(st.played[p.in])} min</span>
            </button>
            ${pairs.length > 1 && html`<button type="button" class="gremove" aria-label=${'Wissel ' + nick(p.out) + ' weghalen'} onClick=${() => remove(i)}><${Icon} name="x" size=${16} /></button>`}
          </div>
          ${pl.shift && html`<span class="gshift">↔ ${nick(pl.shift.id)} schuift door naar ${LINE_NAMES[pl.shift.to]}</span>`}
          <div class=${'collapse' + (open && open.i === i ? ' open' : '')}><div>
            ${last.i === i && html`<div class="plist" key=${last.side + i}>
              <span class="plabel">${last.side === 'out' ? 'Wie gaat eruit? · in het veld' : 'Wie komt erin? · op de bank'}</span>
              ${panelList()}
            </div>`}
          </div></div>
        </div>`;
      })}
      ${freeIn.length > 0 && freeOut.length > 0 && html`<button type="button" class="addtile" onClick=${add}><${Icon} name="plus" size=${18} /> Nog een speler wisselen</button>`}
    </div>
    <span class="swapnote">Tik op een naam om een andere speler te kiezen</span>

    <div class="col">
      <span class="label">Wie eruit gaat, daarna</span>
      <${Seg} label="Daarna" value=${after} onChange=${setAfter} options=${[['terug', 'Kan terug'], ['periode', 'Rust deze ' + pw], ['wedstrijd', 'Klaar']]} />
    </div>

    ${preview && html`<div class="effects">
      <div class="fxrow">${ok(!preview.lines.some((l) => l.light))}<span>${preview.lines.some((l) => l.light) ? 'Lichter: ' + preview.lines.filter((l) => l.light).map((l) => l.name).join(', ') : 'Linies blijven in balans'}</span></div>
      <div class="fxrow">${ok(!team.rules.equalTime || pf.spread <= marge * 60 + 1)}<span>Speeltijd straks ${M.mins(pf.minPlayed)}–${M.mins(pf.maxPlayed)} min per kind</span></div>
      <div class="fxrow">${ok(target != null ? preview.minTurns === target && preview.maxTurns === target : preview.minTurns === preview.maxTurns)}<span>${preview.minTurns === preview.maxTurns ? `Iedereen ${preview.minTurns}× gewisseld` : `${preview.minTurns}–${preview.maxTurns}× gewisseld`}</span></div>
      ${!isPlanned && first && html`<span class="small">Wissel nu: de app rekent direct een nieuw plan. Bewaren: deze wissels gebeuren op het geplande moment, daarna rekent de app verder.</span>`}
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
      <${Field} slots=${lu.slots} lines=${team.lines} keeperId=${d.state.keeper} nick=${nick} height=${360} onTap=${() => {}} neon=${comingIn} accent=${accentFor(team)} />
      <div class="benchrow">
        <span class="label">Bank</span>
        <div class="scroll">
          ${lu.bench.map((id) => html`<button type="button" key=${id} data-pid=${id} class=${'benchpill' + (accentFor(team)(id) ? ' acc' : '')} style=${accentFor(team)(id) ? '--acc:' + accentFor(team)(id) : ''}>${nick(id)}<span class="t">${M.mins(d.state.played[id])} min</span></button>`)}
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
