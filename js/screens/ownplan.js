// Eigen plan: de coach plant zelf, periode voor periode. Eerst de opstelling (zoals de start of het eind van de
// vorige periode, of advies), dan de wissels: zet het oranje bolletje op een tijd en sleep een bankspeler op het
// veld. Advies alleen als je erom vraagt (Adviseer me, of sleep een speler op 'Advies'); je ziet dan hoe de ploeg
// verandert en zet het met de vink in je plan, of past het eerst aan.
import { html, useMemo, useState, useEffect, useRef } from '../../vendor/preact-htm.js';
import * as M from '../match.js';
import { Field, Icon, Neon, Seg, BenchScroll, useDragSwap, justDragged, accentFor, useNow, toast, go } from '../ui.js';
import { haptic, reduced } from '../motion.js';
import { ghostsFor } from '../planview.js';
import { mutate } from './live.js';
import { Gevolgen, NextBar, MiniScore, switchPlanMode } from './plan.js';

const STEP = 30; // het bolletje springt per halve minuut
const SNAP = 25; // dicht bij een gepland moment: daarop vastklikken
const dismissed = new Set(); // 'leeg beginnen' gekozen (deze sessie)

const clean = (p) => ({ out: p.out, in: p.in, ...(p.shift ? { shift: { id: p.shift.id, to: p.shift.to } } : {}) });
const idsOf = (pairs) => pairs.flatMap((p) => [p.out, p.in, p.shift && p.shift.id]).filter(Boolean);
// nieuw paar bij een moment; paren met dezelfde spelers vervallen
const mergePairs = (cur, out, inn) => (cur || [])
  .filter((p) => p.out !== out && p.in !== inn && p.out !== inn && p.in !== out && !(p.shift && (p.shift.id === out || p.shift.id === inn)))
  .map(clean).concat([{ out, in: inn }]);
const slotKey = (s) => (s ? Object.keys(s).sort().map((k) => k + '=' + (s[k] || '')).join() : '');
const posFromSlots = (slots) => { const pos = {}; for (const k in slots) if (slots[k]) pos[slots[k]] = k[0]; return pos; };

export function OwnPlanner({ match, team }) {
  const [, force] = useState(0);
  const empty = !match.started && !(match.pins || []).length && !match.periodLineups && !dismissed.has(match.id);
  if (!empty) return html`<${OwnPlan} match=${match} team=${team} />`;
  const seed = () => {
    mutate((m, tt) => { m.planMode = 'app'; M.replan(m, tt); M.setPlanMode(m, tt, 'eigen', true); });
    haptic('success');
    toast('Het plan van de app staat klaar. Pas aan wat je wilt.');
  };
  return html`<main class="screen planner own">
    <${Top} match=${match} team=${team} />
    <section class="card ownempty">
      <span class="label">Jouw plan</span>
      <span class="h2">Hoe wil je beginnen?</span>
      <span class="sub">Je maakt het plan zelf, periode voor periode. De app geeft alleen advies als je erom vraagt.</span>
      <button type="button" class="choice" onClick=${seed}>
        <span class="col" style="gap:2px"><b>Met het plan van de app</b><span class="sub">Alle wissels staan al klaar. Jij past aan wat je anders wilt.</span></span>
      </button>
      <button type="button" class="choice" onClick=${() => { dismissed.add(match.id); haptic('select'); force((x) => x + 1); }}>
        <span class="col" style="gap:2px"><b>Leeg beginnen</b><span class="sub">Je zet zelf de opstelling en elke wissel.</span></span>
      </button>
      <button type="button" class="linkbtn" style="align-self:flex-start" onClick=${() => switchPlanMode('app')}>Toch de app laten plannen</button>
    </section>
  </main>`;
}

function OwnPlan({ match, team }) {
  const nick = (id) => M.nickOf(team, id);
  const accent = accentFor(team);
  const L = M.periodLen(team);
  const P = team.periods;
  const { cards } = useMemo(() => M.timeline(match, team), [match, team]);
  const live = match.started && !match.finished;
  const running = live && match.clock.running;
  const now = useNow(running ? 1000 : 5000);
  const T = live ? M.gameTime(match, team, now) : 0;
  const curP = live ? match.clock.period : 0;
  const pending = live && M.lineupPending(match, team);
  const [p, setPRaw] = useState(curP);
  const [step, setStep] = useState(live || (match.pins || []).length ? 'wissels' : 'opstelling');
  const [sel, setSel] = useState({});
  const [preview, setPreview] = useState(null);
  const [lastAdvice, setLastAdvice] = useState(null);
  // eerlijkheid zoals hij was vóór je laatste aanpassing (om het verschil te tonen)
  const [before, setBefore] = useState(null);
  // na een stap of periode: de kaart bovenaan in beeld, zodat het veld en de bank er helemaal op passen
  const cardRef = useRef(null);
  const toCard = () => requestAnimationFrame(() => { const el = cardRef.current; if (el && el.getBoundingClientRect().top < 0) el.scrollIntoView({ block: 'start', behavior: reduced() ? 'auto' : 'smooth' }); });
  const toField = () => requestAnimationFrame(() => { const el = cardRef.current && cardRef.current.querySelector('.otl-nav, .luopts, .lutext'); if (el) el.scrollIntoView({ block: 'start', behavior: reduced() ? 'auto' : 'smooth' }); });
  const remember = () => setBefore({ fair: match.plan.fair, ok: match.plan.ok, key: Date.now() });
  const change = (fn) => { remember(); return mutate(fn); };

  const pL = p * L, pEnd = (p + 1) * L;
  const lo = live && p === curP ? Math.max(pL + STEP, Math.ceil((T + 10) / STEP) * STEP) : pL + STEP;
  const hi = pEnd - STEP;
  const periodDone = match.finished || (live && (p < curP || lo > hi));
  const moments = cards.filter((c) => c.kind === 'swap' && c.t > pL && c.t < pEnd);
  const future = moments.filter((c) => !c.past && c.t >= lo);
  const defaultT = () => (future.length ? future[0].t : Math.min(hi, Math.max(lo, pL + Math.round(L / 3 / STEP) * STEP)));
  const [t, setT] = useState(defaultT);
  const setP = (q) => { setPRaw(q); setSel({}); setPreview(null); setStep(live && q === curP ? 'wissels' : 'opstelling'); haptic('select'); toCard(); };
  // bij een nieuwe periode of als de tijd voorbij is: het bolletje naar een geldige plek
  useEffect(() => { if (t < lo || t > hi) setT(defaultT()); }, [p, lo, hi]);

  // ---------- situatie op tijd t ----------
  const baseCard = (() => { let b = cards[0]; for (const c of cards) { if (c.t < t) b = c; else break; } return b; })();
  const mom = !periodDone ? cards.find((c) => c.kind === 'swap' && c.t === t && !c.past) : null;
  const lines = baseCard.lines || M.linesOf(match, team);
  const keeper = baseCard.keeper || match.keeperId;
  // advies of aanpassen: vanaf de situatie na wat er op t al gepland staat
  const viewBase = mom || baseCard;
  const pv = preview && preview.t === t ? preview : null;
  const [, tick] = useState(0);
  const pvKey = pv ? pv.pairs.map((q) => q.out + q.in + (q.shift ? q.shift.id : '')).join() : '';
  useEffect(() => { if (!pvKey) return undefined; const id = setTimeout(() => tick((x) => x + 1), 1800); return () => clearTimeout(id); }, [pvKey]);
  const after = pv ? M.slotsAfter(viewBase.slots, pv.pairs) : null;
  const afterBench = pv ? viewBase.bench.filter((id) => !pv.pairs.some((q) => q.in === id)).concat(pv.pairs.map((q) => q.out)) : null;
  const editable = !periodDone && t >= lo && t <= hi;
  const swapNo = (tt) => cards.filter((c) => c.kind === 'swap' && c.t <= tt).length;
  const label = (tt) => M.periodLabel(team, Math.min(P - 1, Math.floor(tt / L))) + ' ' + M.fmt(tt - Math.min(P - 1, Math.floor(tt / L)) * L);

  const undoPins = (prev, prevLu) => ({ label: 'Ongedaan', run: () => mutate((m, tt) => { m.pins = prev; if (prevLu !== undefined) m.periodLineups = prevLu; M.replan(m, tt); }) });
  const pinAt = (tt, pairs, msg) => {
    const prev = (match.pins || []).map((x) => ({ ...x, pairs: x.pairs.map(clean) }));
    change((m, t2) => M.pinMoment(m, t2, tt, pairs));
    haptic('success');
    if (msg) toast(msg, undoPins(prev));
  };
  const planPair = (out, inn) => {
    setSel({});
    pinAt(t, mergePairs(mom && mom.pairs, out, inn), `${nick(inn)} erin voor ${nick(out)} · ${label(t)}`);
  };
  const removeMoment = () => {
    const prev = (match.pins || []).map((x) => ({ ...x, pairs: x.pairs.map(clean) }));
    change((m, tt) => M.unpinMoment(m, tt, t));
    haptic('toggle');
    toast('Wissel ' + label(t) + ' verwijderd', undoPins(prev));
  };
  const shiftMoment = (d) => {
    const to = t + d;
    if (to < lo || to > hi || moments.some((c) => c.t === to)) { haptic('no'); return; }
    change((m, tt) => M.moveMoment(m, tt, t, to));
    setT(to);
    haptic('select');
  };
  const fill = () => {
    const last = future.length ? future[future.length - 1].t : null;
    const from = Math.max(last != null ? last : pL, live && p === curP ? T : pL);
    const prev = (match.pins || []).map((x) => ({ ...x, pairs: x.pairs.map(clean) }));
    const n = change((m, tt) => M.ownFillPeriod(m, tt, from));
    haptic(n ? 'success' : 'no');
    toast(n ? `${n} ${n === 1 ? 'wissel' : 'wissels'} aangevuld in de ${M.periodLabel(team, p)}` : 'Niets aan te vullen in deze periode', n ? undoPins(prev) : undefined);
  };

  // ---------- advies op verzoek ----------
  const askAdvice = (out = null, inn = null) => {
    const ex = mom ? idsOf(mom.pairs) : [];
    const who = out || inn;
    if (who && ex.indexOf(who) !== -1) { toast(`${nick(who)} wisselt al op dit moment`); haptic('no'); return; }
    const a = M.adviseAt(match, team, t, out, inn, ex);
    setSel({});
    if (!a) { toast('Geen advies mogelijk op dit moment'); haptic('no'); return; }
    haptic('select');
    setPreview({ t, pairs: [clean(a)], why: a.why, edit: false });
  };
  const applyPreview = () => {
    if (!pv) return;
    const all = (mom ? mom.pairs.map(clean) : []).concat(pv.pairs.map(clean));
    setPreview(null);
    pinAt(t, all, null);
    toast('In je plan gezet · ' + label(t));
  };

  // aanpassen: op de nieuwe situatie schuiven (doorschuiver kiezen) of een andere bankspeler erin
  const editMove = (a, b, dry) => {
    const pairs = pv.pairs.map(clean);
    const onF = (id) => !!M.slotOf(after, id);
    const kIn = (id) => pairs.findIndex((q) => q.in === id);
    const kSh = (id) => pairs.findIndex((q) => q.shift && q.shift.id === id);
    const kOut = (id) => pairs.findIndex((q) => q.out === id);
    if (b.slice(0, 5) === 'zone:') return null;
    if (onF(a) && onF(b)) {
      const I = kIn(a) !== -1 ? a : kIn(b) !== -1 ? b : null;
      if (!I) return null;
      const X = I === a ? b : a;
      const i = kIn(I);
      if (pairs[i].shift && pairs[i].shift.id === X) {
        if (dry) return `${nick(X)} terug naar zijn plek`;
        delete pairs[i].shift;
      } else {
        if (kIn(X) !== -1 || kSh(X) !== -1) return null;
        const pre = M.slotsAfter(viewBase.slots, pairs.slice(0, i));
        const outSlot = M.slotOf(pre, pairs[i].out);
        if (!outSlot) return null;
        const xs = M.slotOf(pre, X);
        if (dry) {
          const nm = M.posName(outSlot[0], +outSlot.slice(1), lines[outSlot[0]] || 0);
          const nmI = xs ? M.posName(xs[0], +xs.slice(1), lines[xs[0]] || 0) : null;
          return `${nick(X)} ${nm ? nm.naar : 'schuift door'}${nmI ? ', ' + nick(I) + ' ' + nmI.op : ''}`;
        }
        pairs[i].shift = { id: X, to: outSlot[0] };
      }
    } else if (onF(a) !== onF(b)) {
      const F = onF(a) ? a : b, Bn = onF(a) ? b : a;
      const io = kOut(Bn);
      if (io !== -1) {
        if (pairs[io].in !== F) return null;
        if (dry) return `Deze wissel schrappen`;
        pairs.splice(io, 1);
      } else if (kIn(F) !== -1) {
        if (dry) return `${nick(Bn)} erin in plaats van ${nick(F)}`;
        pairs[kIn(F)].in = Bn;
      } else if (kSh(F) !== -1) {
        return null;
      } else {
        if (dry) return `Ook ${nick(Bn)} erin voor ${nick(F)}`;
        pairs.push({ out: F, in: Bn });
      }
    } else return null;
    if (!pairs.length) { setPreview(null); return null; }
    setPreview({ ...pv, pairs, why: null, changed: true });
    haptic('select');
    return null;
  };

  // ---------- slepen ----------
  const zone = useRef(null);
  const dragOn = step === 'wissels' && editable && (!pv || pv.edit);
  const onField = (id) => id in viewBase.pos;
  const drop = (a, b) => {
    if (pv) { editMove(a, b, false); return; }
    if (b === 'zone:advies') { if (a in baseCard.pos) askAdvice(a, null); else askAdvice(null, a); return; }
    const aF = a in baseCard.pos, bF = b in baseCard.pos;
    if (aF === bF) return;
    planPair(aF ? a : b, aF ? b : a);
  };
  const hint = (a, b) => {
    if (pv) return editMove(a, b, true);
    if (b === 'zone:advies') return a in baseCard.pos ? `Wie erin voor ${nick(a)}? Advies` : `${nick(a)} erin: voor wie? Advies`;
    if (b.slice(0, 5) === 'line:') return null;
    const aF = a in baseCard.pos, bF = b in baseCard.pos;
    if (aF === bF) return null;
    return `${nick(aF ? b : a)} erin voor ${nick(aF ? a : b)} · ${M.fmt(t - pL)}`;
  };
  useDragSwap(zone, dragOn, drop, hint);
  const tapField = (id) => {
    if (justDragged(zone) || !editable || pv) return;
    if (sel.in) { planPair(id, sel.in); return; }
    haptic('select');
    setSel(sel.out === id ? {} : { out: id });
  };
  const tapBench = (id) => {
    if (justDragged(zone) || !editable || pv) return;
    if (sel.out) { planPair(sel.out, id); return; }
    haptic('select');
    setSel(sel.in === id ? {} : { in: id });
  };

  // ---------- tijdlijn van de periode ----------
  const track = useRef(null);
  const tRef = useRef(t);
  tRef.current = t;
  const geo = useRef({});
  geo.current = { pL, lo, hi, times: moments.filter((c) => !c.past).map((c) => c.t) };
  useEffect(() => {
    const el = track.current;
    if (!el) return undefined;
    let on = false;
    const at = (x) => {
      const g = geo.current;
      const r = el.getBoundingClientRect();
      const raw = g.pL + Math.max(0, Math.min(1, (x - r.left) / r.width)) * L;
      let best = null, bd = SNAP;
      for (const mt of g.times) { const d = Math.abs(mt - raw); if (d <= bd) { bd = d; best = mt; } }
      const v = Math.max(g.lo, Math.min(g.hi, best != null ? best : Math.round(raw / STEP) * STEP));
      if (v !== tRef.current) { setT(v); setSel({}); haptic('select'); }
    };
    const down = (e) => { on = true; at(e.clientX); };
    const move = (e) => { if (on) { e.preventDefault(); at(e.clientX); } };
    const up = () => { on = false; };
    el.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => { el.removeEventListener('pointerdown', down); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); };
  }, [step, periodDone]);
  const pct = (tt) => ((tt - pL) / L) * 100;
  const jump = (dir) => {
    const list = future.map((c) => c.t);
    const nx = dir > 0 ? list.find((x) => x > t) : list.slice().reverse().find((x) => x < t);
    if (nx != null) { setT(nx); setSel({}); setPreview(null); haptic('select'); }
  };

  // ---------- opstelling van de periode ----------
  const cardAt = (tt) => { let b = cards[0]; for (const c of cards) { if (c.t <= tt) b = c; else break; } return b; };
  const endPrev = p > 0 ? (() => { let b = cards[0]; for (const c of cards) { if (c.t < pL) b = c; else break; } return b; })() : null;
  const startPrev = p > 0 ? cardAt((p - 1) * L) : null;
  const luCard = cards.find((c) => c.kind === 'lineup' && c.period === p);
  const planned = !!(match.periodLineups && match.periodLineups[p]);
  const lu = p === 0 ? cards[0] : luCard || endPrev;
  const luEditable = !match.finished && (p === 0 ? !match.started : !(live && p <= curP));
  const which = p === 0 ? (planned ? (lastAdvice && slotKey(lastAdvice.slots) === slotKey(lu.slots) ? 'advies' : 'eigen') : 'app')
    : !planned ? 'eind'
    : slotKey(lu.slots) === slotKey(startPrev && startPrev.slots) ? 'start'
    : lastAdvice && slotKey(lastAdvice.slots) === slotKey(lu.slots) ? 'advies'
    : slotKey(lu.slots) === slotKey(endPrev && endPrev.slots) ? 'eindvast' : 'eigen';
  const setLu = (next, msg) => {
    const prevLu = match.periodLineups ? JSON.parse(JSON.stringify(match.periodLineups)) : null;
    const prevPins = (match.pins || []).map((x) => ({ ...x, pairs: x.pairs.map(clean) }));
    change((m, tt) => M.setPeriodLineup(m, tt, p, { pos: posFromSlots(next.slots), bench: next.bench.slice(), slots: { ...next.slots } }));
    if (msg) toast(msg, p > 0 ? undoPins(prevPins, prevLu) : undefined);
  };
  const pickLu = (k) => {
    haptic('select');
    if (k === 'eind') { change((m, tt) => M.clearPeriodLineup(m, tt, p)); return; }
    if (k === 'start') { setLu(startPrev); return; }
    if (k === 'advies') {
      const a = M.adviseLineup(match, team, p);
      setLastAdvice(a);
      setLu(a);
    }
  };
  const luZone = useRef(null);
  const luDrop = (a, b) => {
    if (b.slice(0, 5) === 'line:' || b.slice(0, 5) === 'zone:') return;
    setLu({ ...M.swapInLineup({ pos: lu.pos, bench: lu.bench, slots: lu.slots }, a, b) });
  };
  const luHint = (a, b) => {
    if (b.slice(0, 5) === 'line:' || b.slice(0, 5) === 'zone:') return null;
    const aF = a in lu.pos, bF = b in lu.pos;
    if (aF === bF) return 'Ruil met ' + nick(b);
    return aF ? nick(b) + ' begint' : 'Begint voor ' + nick(b);
  };
  useDragSwap(luZone, step === 'opstelling' && luEditable, luDrop, luHint);
  const luText = {
    app: 'Startopstelling van de app. Sleep om te ruilen.',
    eigen: 'Jouw eigen opstelling.',
    advies: 'Advies: de spelers die het minst speelden beginnen, iedereen op een goede plek.',
    start: p > 0 ? `Zoals de start van de ${M.periodLabel(team, p - 1)}.` : '',
    eind: p > 0 ? `Zoals het eind van de ${M.periodLabel(team, p - 1)}. Verandert vanzelf mee met je wissels.` : '',
    eindvast: p > 0 ? `Zoals het eind van de ${M.periodLabel(team, p - 1)}.` : ''
  }[which];

  const broken = (match.plan && match.plan.broken) || [];
  const brokenHere = broken.filter((b) => b.t >= pL && b.t < pEnd);
  const plcls = 'screen planner own' + (live ? ' is-live' : '');

  // ---------- het verhaal boven het veld ----------
  let story = null;
  if (step === 'wissels' && !periodDone) {
    if (pv) {
      const st = M.swapStory(viewBase.slots, lines, pv.pairs);
      story = html`<div class="nextcap story advice" key=${'pv' + t}>
        <span class="nc-when">${pv.changed ? 'Aangepast' : 'Advies'} · ${label(t)}</span>
        <${StoryLines} st=${st} nick=${nick} />
        ${pv.why && html`<span class="nc-why"><${Icon} name="spark" size=${14} />${nick(pv.pairs[0].in)} ${pv.why}</span>`}
        ${pv.edit && html`<span class="nc-hint">Sleep de nieuwe speler naar een andere plek om iemand door te laten schuiven. Of sleep een bankspeler op hem.</span>`}
        <button type="button" class="iconbtn adv-x" aria-label="Annuleer" onClick=${() => { setPreview(null); haptic('toggle'); }}><${Icon} name="x" size=${18} /></button>
        <div class="adv-act">
          <button type="button" class=${'btn soft adv-edit' + (pv.edit ? ' on' : '')} aria-pressed=${pv.edit ? 'true' : 'false'} onClick=${() => { haptic('toggle'); setPreview({ ...pv, edit: !pv.edit }); }}><${Icon} name="edit" size=${18} />Aanpassen</button>
          <button type="button" class="btn ok adv-ok" onClick=${applyPreview}><${Icon} name="check" size=${20} />Toepassen</button>
        </div>
      </div>`;
    } else if (mom) {
      const st = M.swapStory(baseCard.slots, lines, mom.pairs);
      story = html`<div class="nextcap story own" key=${'m' + t}>
        <span class="nc-when">Wissel ${swapNo(t)} · ${label(t)}</span>
        <${StoryLines} st=${st} nick=${nick} />
        <div class="mom-act">
          <button type="button" class="linkbtn" onClick=${removeMoment}>Verwijder</button>
          <span class="mom-move">
            <button type="button" class="chip" aria-label="30 seconden eerder" onClick=${() => shiftMoment(-STEP)}>−0:30</button>
            <button type="button" class="chip" aria-label="30 seconden later" onClick=${() => shiftMoment(STEP)}>+0:30</button>
          </span>
        </div>
      </div>`;
    } else if (sel.out || sel.in) {
      story = html`<div class="nextcap story sel" key=${'s' + (sel.out || sel.in)}>
        <span class="nc-when">${label(t)}</span>
        <span class="nc-what">${sel.out ? `${nick(sel.out)} naar de bank. Wie erin?` : `${nick(sel.in)} erin. Voor wie?`}</span>
        <span class="nc-hint">${sel.out ? 'Tik een bankspeler, of laat de app kiezen.' : 'Tik een speler op het veld, of laat de app kiezen.'}</span>
      </div>`;
    } else {
      story = html`<div class="nextcap story" key=${'e' + t}>
        <span class="nc-when">${label(t)}</span>
        <span class="nc-what">Nog geen wissel op dit moment</span>
        <span class="nc-hint">Sleep een bankspeler op het veld. Of tik op Adviseer me.</span>
      </div>`;
    }
  }

  const fieldSlots = pv ? after : baseCard.slots;
  const benchIds = pv ? afterBench : baseCard.bench;
  const outs = pv ? pv.pairs.map((q) => q.out) : [];
  const ins = pv ? pv.pairs.map((q) => q.in) : [];
  const momIns = mom && !pv ? mom.pairs.map((q) => q.in) : [];
  const momOuts = mom && !pv ? mom.pairs.map((q) => q.out) : [];
  const ghosts = mom && !pv ? ghostsFor({ ...mom, pinned: false }, baseCard.pos, nick) : null;
  const curCard = pv ? { ...viewBase, pos: posFromSlots(after) } : mom || baseCard;

  return html`<main class=${plcls}>
    <${Top} match=${match} team=${team} />

    <div class="owntabs">
      <${Seg} label="Periode" small value=${p} onChange=${setP} options=${Array.from({ length: P }, (_, q) => [q, M.periodLabel(team, q)])} />
    </div>

    ${brokenHere.length > 0 && html`<section class="card warncard" role="alert">
      <span class="h2" style="font-size:16px">Klopt niet meer</span>
      ${brokenHere.map((b) => html`<span class="sub" style="color:var(--ink)" key=${'b' + b.t + b.out}>${b.lineup
        ? `Opstelling ${M.periodLabel(team, Math.floor(b.t / L))}: ${nick(b.in)} speelt voor ${nick(b.out)}.`
        : `Wissel om ${label(b.t)}: ${nick(b.in)} voor ${nick(b.out)} kan niet.`}</span>`)}
      <span class="small">Bijvoorbeeld omdat een speler rust heeft of al op het veld staat. Pas het hieronder aan.</span>
    </section>`}

    <section class="card plcard ownplan" ref=${cardRef}>
      <div class="ownsteps" role="tablist" aria-label="Stap">
        <button type="button" role="tab" aria-selected=${step === 'opstelling' ? 'true' : 'false'} class=${'ostep' + (step === 'opstelling' ? ' on' : '')} onClick=${() => { setStep('opstelling'); setPreview(null); setSel({}); haptic('select'); }}>
          <b>1</b>Opstelling</button>
        <span class="ostep-line" aria-hidden="true"></span>
        <button type="button" role="tab" aria-selected=${step === 'wissels' ? 'true' : 'false'} class=${'ostep' + (step === 'wissels' ? ' on' : '')} onClick=${() => { setStep('wissels'); haptic('select'); }}>
          <b>2</b>Wissels${moments.length ? html`<span class="ocount">${moments.length}</span>` : ''}</button>
      </div>

      ${step === 'opstelling' && html`
        ${luEditable && html`<div class="luopts">
          ${p > 0 && html`<button type="button" class="chip" aria-pressed=${which === 'start' ? 'true' : 'false'} onClick=${() => pickLu('start')}>Zoals start vorige</button>`}
          ${p > 0 && html`<button type="button" class="chip" aria-pressed=${which === 'eind' || which === 'eindvast' ? 'true' : 'false'} onClick=${() => pickLu('eind')}>Zoals eind vorige</button>`}
          <button type="button" class="chip warm advbtn" aria-pressed=${which === 'advies' ? 'true' : 'false'} onClick=${() => pickLu('advies')}><${Icon} name="spark" size=${15} />Adviseer me</button>
        </div>`}
        <span class="small lutext" key=${which + p}>${luEditable ? luText : pending && p === curP ? 'Het is rust: kies de opstelling in het wedstrijdscherm.' : 'Deze periode is al begonnen.'}</span>
        <div ref=${luZone} class="scrubzone">
          <div class="fieldbox">
            <${Field} slots=${lu.slots} lines=${lu.lines || lines} keeperId=${lu.keeper || match.keeperId} nick=${nick} height="clamp(380px, 56dvh, 560px)" onTap=${() => {}} accent=${accent} />
          </div>
          <div class="benchrow">
            <span class="label">Bank</span>
            <${BenchScroll}>
              ${lu.bench.map((id) => { const ac = accent(id); return html`<button type="button" class=${'benchpill' + (ac ? ' acc' : '')} style=${ac ? '--acc:' + ac : ''} key=${id} data-pid=${id}>${nick(id)}</button>`; })}
              ${!lu.bench.length && html`<span class="small">niemand</span>`}
            </${BenchScroll}>
          </div>
        </div>
        ${luEditable && html`<span class="small">Sleep spelers om te ruilen.</span>`}
        <button type="button" class="btn soft block" onClick=${() => { setStep('wissels'); haptic('select'); toField(); }}>Naar de wissels<${Icon} name="chev" size=${18} /></button>
      `}

      ${step === 'wissels' && (periodDone
        ? html`<div class="nextcap story"><span class="nc-what">${match.finished ? 'De wedstrijd is afgelopen.' : 'Deze periode is gespeeld.'}</span></div>`
        : html`
        <div class="otl-nav">
          <button type="button" class="iconbtn" aria-label="Vorige wissel" onClick=${() => jump(-1)} disabled=${!future.some((c) => c.t < t)}><span style="transform:rotate(180deg);display:inline-flex"><${Icon} name="chev" /></span></button>
          <span class="otl-when"><b class="num">${M.fmt(t - pL)}</b><span class="small">${M.periodLabel(team, p)}${live && p === curP ? ' · over ' + M.fmt(Math.max(0, t - T)) : ''}</span></span>
          <button type="button" class="iconbtn" aria-label="Volgende wissel" onClick=${() => jump(1)} disabled=${!future.some((c) => c.t > t)}><${Icon} name="chev" /></button>
        </div>
        <div class="tl otl" ref=${track} aria-label="Tijdlijn van de periode">
          <span class="tl-line"></span>
          ${live && p === curP && html`<span class="otl-past" style=${`width:${pct(Math.min(pEnd, T))}%`}></span><span class="tl-now" style=${`left:${pct(Math.min(pEnd, T))}%`}></span>`}
          ${moments.map((c) => html`<span key=${'d' + c.t} class=${'tl-dot own' + (c.past ? ' past' : '') + (c.t === t ? ' cur' : '')} style=${`left:${pct(c.t)}%`}></span>`)}
          <span class="tl-head" style=${`left:${pct(t)}%`}></span>
        </div>
        ${story}
      `)}

      ${step === 'wissels' && !periodDone && html`<div ref=${zone} class=${'scrubzone' + (pv && pv.edit ? ' editing' : '')}>
        <div class=${'fieldbox' + (pv ? ' previewing' : '')}>
          <${Field} slots=${fieldSlots} lines=${lines} keeperId=${keeper} nick=${nick} height="clamp(380px, 56dvh, 560px)" onTap=${tapField} accent=${accent}
            neon=${pv ? ins : momOuts} dashed=${pv ? pv.pairs.filter((q) => q.shift).map((q) => q.shift.id) : []} selected=${sel.out || null} ghosts=${ghosts} animate=${!!pv} />
        </div>
        <div class="benchrow">
          <span class="label">Bank</span>
          <${BenchScroll}>
            ${editable && !pv && html`<span class="benchdrop" data-pid="zone:advies" key="zone"><span class="pill"><${Icon} name="spark" size=${14} />Advies</span></span>`}
            ${benchIds.map((id) => {
              const ac = accent(id);
              const wo = pv && outs.indexOf(id) !== -1;
              const goesIn = momIns.indexOf(id) !== -1;
              const pill = html`<button type="button" class=${'benchpill' + (wo ? ' wasout' : '') + (ac ? ' acc' : '') + (sel.in === id ? ' sel' : '')} style=${ac ? '--acc:' + ac : ''} key=${id} data-pid=${id} onClick=${() => tapBench(id)}>${nick(id)}${wo ? html`<span class="t">eruit</span>` : goesIn ? html`<span class="t">erin</span>` : ''}</button>`;
              return goesIn ? html`<${Neon} key=${'n' + id}>${pill}</${Neon}>` : pill;
            })}
            ${!benchIds.length && html`<span class="small">niemand</span>`}
          </${BenchScroll}>
        </div>
      </div>`}

      ${step === 'wissels' && editable && !pv && html`<div class="ownbar">
        <button type="button" class="btn soft advbtn grow" onClick=${() => askAdvice(sel.out || null, sel.in || null)}><${Icon} name="spark" size=${18} />${sel.out ? `Wie erin voor ${nick(sel.out)}?` : sel.in ? `Voor wie ${nick(sel.in)}?` : 'Adviseer me'}</button>
        <button type="button" class="btn plain" onClick=${fill}>Vul de rest aan</button>
      </div>`}

      <${Gevolgen} match=${match} team=${team} card=${step === 'opstelling' ? lu : curCard} before=${before} />

      ${step === 'wissels' && html`<div class="ownnext">
        ${p + 1 < P
          ? html`<button type="button" class="btn primary block" onClick=${() => setP(p + 1)}>Volgende: ${M.periodLabel(team, p + 1)}<${Icon} name="chev" size=${18} /></button>`
          : html`<a class="btn primary block" href="#/">Klaar</a>`}
      </div>`}
    </section>

    <section class="card plset">
      <span class="label">Wie maakt het plan</span>
      <${Seg} label="Wie maakt het plan" value="eigen" options=${[['app', 'De app'], ['eigen', 'Ikzelf']]} onChange=${(v) => v === 'app' && switchPlanMode('app')} />
      <span class="small">Je plant zelf. De app adviseert alleen als je erom vraagt, en laat altijd de gevolgen zien.</span>
    </section>

    <${NextBar} match=${match} team=${team} cards=${cards} />
  </main>`;
}

function Top({ match, team }) {
  return html`<div class="topbar plbar">
    <a class="iconbtn" href="#/" aria-label="Terug"><${Icon} name="back" /></a>
    <span class="h2 grow">Jouw plan</span>
    <${MiniScore} match=${match} team=${team} />
  </div>`;
}

function StoryLines({ st, nick }) {
  return html`<div class="nc-lines">${st.map((x) => html`<div class="nc-line" key=${x.in + x.out}>
    <span class="nc-main"><span class="chg in">↑ ${nick(x.in)}</span> erin voor <span class="chg out">↓ ${nick(x.out)}</span></span>
    <span class="nc-sub">${x.shift
      ? html`<span class="chg sh">↔ ${nick(x.shift)}</span> ${x.shiftPos ? x.shiftPos.naar : 'schuift door'}${x.inPos ? html`<span class="nc-dim"> · ${nick(x.in)} ${x.inPos.op}</span>` : ''}`
      : x.inPos ? html`${nick(x.in)} ${x.inPos.op}` : ''}</span>
  </div>`)}</div>`;
}
