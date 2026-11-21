// Wedstrijdplan als één veld dat meebeweegt: veeg over het veld of sleep het oranje bolletje
// over de tijdlijn. Spelers glijden naar hun nieuwe plek; daaronder uitklapbaar het rooster per kind.
import { html, useState, useMemo, useRef, useEffect } from '../vendor/preact-htm.js';
import * as M from './match.js';
import { LINE_NAMES } from './planner.js';
import { Field, Icon, Neon, POS_COLORS, useDragSwap, BenchScroll, accentFor, CallStory } from './ui.js';
import { haptic } from './motion.js';

const BENCH = '#DCE2EE';

export function changes(cards, i) {
  if (i === 0) return { in: [], out: [], shift: null };
  const c = cards[i], prev = cards[i - 1];
  return {
    in: Object.keys(c.pos).filter((id) => !(id in prev.pos)),
    out: Object.keys(prev.pos).filter((id) => !(id in c.pos)),
    shift: c.shift || null
  };
}

export function useAnimatedF(initial, maxF) {
  const [f, setFState] = useState(initial);
  const fr = useRef(initial);
  const raf = useRef(0);
  const setF = (v, animate) => {
    const target = Math.max(0, Math.min(maxF(), v));
    cancelAnimationFrame(raf.current);
    if (!animate) { fr.current = target; setFState(target); return; }
    const from = fr.current;
    const t0 = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - t0) / 320);
      fr.current = from + (target - from) * (1 - Math.pow(1 - k, 3));
      setFState(fr.current);
      if (k < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
  };
  return [f, setF, () => fr.current];
}

// horizontaal vegen verandert f; pillen blijven sleepbaar als dat aan staat
export function useScrub(ref, fns) {
  const cur = useRef(fns);
  cur.current = fns;
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    let st = null;
    const down = (e) => {
      if (cur.current.skipPills() && e.target.closest('[data-pid]')) return;
      // een volle bank scrollt zelf opzij
      if (e.target.closest('.scroll.ovf')) return;
      st = { x: e.clientX, y: e.clientY, f0: cur.current.get(), active: false };
    };
    const move = (e) => {
      if (!st) return;
      // spieken (vinger stil op het veld) of slepen van een speler: dan niet door de momenten vegen
      if (el.dataset.peek || el.classList.contains('dragging')) { st = null; return; }
      const dx = e.clientX - st.x;
      if (!st.active) {
        if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(e.clientY - st.y)) return;
        st.active = true;
      }
      e.preventDefault();
      cur.current.set(st.f0 - dx / 120, false);
    };
    const up = (e) => {
      if (!st) return;
      if (st.active) {
        const dx = e.clientX - st.x;
        let target = Math.round(cur.current.get());
        if (Math.abs(dx) > 30 && target === Math.round(st.f0)) target += dx < 0 ? 1 : -1;
        cur.current.set(target, true);
        el.dataset.justDragged = '1';
        setTimeout(() => { delete el.dataset.justDragged; }, 60);
      }
      st = null;
    };
    el.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      el.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, []);
}

// Wie er bij het volgende moment verandert, als zwevers achter de spelers (zelfde taal als live).
const LORD = { V: 0, M: 1, A: 2 };
export function ghostsFor(next, pos, nick) {
  const g = {};
  if (!next || next.kind !== 'swap') return g;
  for (const p of next.pairs || [{ out: next.out, in: next.in, shift: next.shift }]) {
    const extra = next.pinned ? ' pinned' : '';
    if (p.shift && p.shift.id in pos) {
      const from = pos[p.shift.id], to = p.shift.to;
      g[p.out] = { name: nick(p.shift.id), kind: 'shift' + extra, dir: LORD[to] < LORD[from] ? '↑' : LORD[to] > LORD[from] ? '↓' : '↔' };
      g[p.shift.id] = { name: nick(p.in), kind: 'in' + extra };
    } else g[p.out] = { name: nick(p.in), kind: 'in' + extra };
  }
  return g;
}

// Paren van een moment na slepen in de planner: het nieuwe paar komt erbij, paren met dezelfde spelers vervallen.
export function pairsAfterDrag(next, out, inn, perMoment) {
  const cur = (next && next.pairs) || [];
  let list = cur.filter((p) => p.out !== out && p.in !== inn && p.out !== inn && p.in !== out).map((p) => ({ out: p.out, in: p.in }));
  list.push({ out, in: inn });
  while (list.length > Math.max(1, perMoment)) list.shift();
  return list;
}

export function PlanView({ match, team, editable = false, onSwap, initialIndex = 0, nowIndex = -1, compact = false, liveT = null, onSwapNow = null, planner = false, onPin = null, onUnpin = null, onIndex = null, children = null }) {
  const nick = (id) => M.nickOf(team, id);
  const END = M.matchEnd(team);
  const L = M.periodLen(team);
  const { cards } = useMemo(() => M.timeline(match, team), [match, team]);
  const maxF = () => cards.length - 1;
  const [f, setF, getF] = useAnimatedF(Math.min(initialIndex, cards.length - 1), maxF);
  const [roster, setRoster] = useState(false);
  const zone = useRef(null);
  const track = useRef(null);
  const i = Math.max(0, Math.min(cards.length - 1, Math.round(f)));
  const c = cards[i];
  const ch = changes(cards, i);
  const canEdit = !planner && editable && i === 0;
  // planner: het volgende moment (achtergrond) plan je door op de voorgrond te slepen
  const nx = i + 1 < cards.length ? cards[i + 1] : null;
  const canPlan = planner && !!onPin && !match.finished && nx && nx.kind === 'swap' && !nx.past && i >= Math.max(0, nowIndex);
  const [peek, setPeek] = useState(false);
  // kleurranden van het volgende moment: oranje = eruit (veld), groen = erin (bank)
  const nxPairs = nx && nx.kind === 'swap' ? nx.pairs || [{ out: nx.out, in: nx.in }] : [];
  // planner: op een opstelling (start van een periode) staat alleen die opstelling, nog zonder zwevers
  const calm = planner && c.kind === 'lineup';
  const nxOuts = calm ? [] : nxPairs.map((p) => p.out);
  const nxIns = calm ? [] : nxPairs.map((p) => p.in);
  // klikje bij elk wisselmoment dat je passeert (trillen op Android, klikgeluid op de iPhone)
  const lastI = useRef(i);
  useEffect(() => { if (lastI.current !== i) { lastI.current = i; haptic('select'); setPeek(false); } if (onIndex) onIndex(i); }, [i]);
  const lines = c.lines || M.linesOf(match, team);
  const swapNoOf = (card) => cards.filter((x) => x.kind === 'swap' && x.t <= card.t).length;
  const perMoment = M.effRules(match, team).perMoment || 1;
  const planHint = (a, b) => {
    if (b.slice(0, 5) === 'line:') return null;
    const aF = a in c.pos, bF = b in c.pos;
    if (aF === bF) return null;
    const out = aF ? a : b, inn = aF ? b : a;
    return `${M.nickOf(team, inn)} erin voor ${M.nickOf(team, out)} · wissel ${swapNoOf(nx)}`;
  };
  const planDrop = (a, b) => {
    const aF = a in c.pos;
    const out = aF ? a : b, inn = aF ? b : a;
    onPin(nx.t, pairsAfterDrag(nx, out, inn, perMoment), swapNoOf(nx));
  };
  useDragSwap(zone, canEdit || canPlan, (a, b) => (canPlan ? planDrop(a, b) : onSwap && onSwap(a, b)), (a, b) => (canPlan ? planHint(a, b) : b.slice(0, 5) === 'line:'
    ? (a in c.pos ? M.formationLabel(lines, c.pos[a], b.split(':')[1]) : null)
    : 'Ruil met ' + M.nickOf(team, b)));
  useScrub(zone, { get: getF, set: setF, skipPills: () => (editable && Math.round(getF()) === 0) || canPlan });
  // spieken: vinger stil op een leeg stuk veld = het volgende moment op ware grootte
  useEffect(() => {
    const el = zone.current;
    if (!el || !planner) return undefined;
    let tm = 0, sx = 0, sy = 0;
    const stop = () => { clearTimeout(tm); tm = 0; if (el.dataset.peek) { delete el.dataset.peek; setPeek(false); } };
    const down = (e) => {
      if (e.target.closest('[data-pid], .keeperspot, .benchrow')) return;
      sx = e.clientX; sy = e.clientY;
      tm = setTimeout(() => { el.dataset.peek = '1'; setPeek(true); haptic('select'); }, 380);
    };
    const move = (e) => { if (tm && !el.dataset.peek && Math.hypot(e.clientX - sx, e.clientY - sy) > 10) { clearTimeout(tm); tm = 0; } };
    el.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    return () => { stop(); el.removeEventListener('pointerdown', down); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', stop); window.removeEventListener('pointercancel', stop); };
  }, [planner]);

  const timeOf = (x) => {
    const k = Math.max(0, Math.min(cards.length - 1, Math.floor(x)));
    const a = cards[k].t, b = k + 1 < cards.length ? cards[k + 1].t : END;
    return a + (b - a) * Math.max(0, Math.min(1, x - k));
  };
  const fOfTime = (t) => {
    let k = 0;
    while (k + 1 < cards.length && cards[k + 1].t <= t) k++;
    const a = cards[k].t, b = k + 1 < cards.length ? cards[k + 1].t : END;
    return k + (b > a ? Math.min(1, (t - a) / (b - a)) : 0);
  };
  const label = (t) => {
    const p = Math.min(team.periods - 1, Math.floor(t / L));
    return M.periodLabel(team, p) + ' ' + M.fmt(t - p * L);
  };

  // slepen over de tijdlijn (en over het rooster)
  useEffect(() => {
    const els = [track.current, zone.current && zone.current.parentElement.querySelector('.rooster .grid')].filter(Boolean);
    let active = null;
    const at = (el, x) => {
      const r = (el.querySelector('.cells') || el).getBoundingClientRect();
      const p = Math.max(0, Math.min(1, (x - r.left) / r.width));
      // tijdlijn: gelijk verdeelde bolletjes; rooster: echte tijd
      setF(el === track.current ? p * (cards.length - 1) : fOfTime(p * END), false);
    };
    const downs = els.map((el) => { const h = (e) => { active = el; at(el, e.clientX); }; el.addEventListener('pointerdown', h); return [el, h]; });
    const move = (e) => { if (active) { e.preventDefault(); at(active, e.clientX); } };
    const up = () => { if (active) { active = null; setF(Math.round(getF()), true); } };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    return () => { downs.forEach(([el, h]) => el.removeEventListener('pointerdown', h)); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  }, [cards, roster]);

  const swapNo = [];
  let n = 0;
  for (const cc of cards) swapNo.push(cc.kind === 'swap' ? ++n : 0);
  const title = c.kind === 'lineup' ? (c.period === 0 ? 'Start' : 'Opstelling ' + M.periodLabel(team, c.period)) : `Wissel ${swapNo[i]} van ${n}`;
  const t = timeOf(f);
  const pct = (t / END) * 100;
  const n1 = Math.max(1, cards.length - 1);
  const dotPct = (k) => (k / n1) * 100;
  const headPct = (f / n1) * 100;
  const kids = match.present.filter((id) => id !== match.keeperId);
  const segs = cards.map((cc, k) => ({ a: cc.t, b: k + 1 < cards.length ? cards[k + 1].t : END, pos: cc.pos }));
  const status = i < nowIndex ? 'Gedaan' : i === nowIndex ? 'Nu' : nowIndex >= 0 ? 'Gepland' : null;
  // tijdens de wedstrijd: waar staan we nu, hoe lang nog tot dit moment
  const live = liveT != null && nowIndex >= 0 && !match.finished;
  const nowPct = live ? (fOfTime(liveT) / n1) * 100 : null;
  const until = live && i > nowIndex ? c.t - liveT : null;
  const pillText = label(t) + (live ? (i < nowIndex ? ' · geweest' : until != null ? (until > 0 ? ' · over ' + M.fmt(until) : ' · nu!') : '') : '');
  const isNext = live && i === nowIndex + 1 && c.kind === 'swap' && onSwapNow;
  const multi = c.kind === 'swap' && c.ins && c.ins.length > 1;
  const swapText = c.kind === 'swap' ? (multi ? `${c.ins.map(nick).join(', ')} erin` : `${nick(c.in)} erin voor ${nick(c.out)}`) : '';

  return html`<div class=${'planview col' + (compact ? ' compact' : '')} style="gap:8px">
    <div class="tl" ref=${track} aria-label="Tijdlijn">
      <span class="tl-line"></span>
      ${cards.map((cc, k) => (k > 0 && cc.kind === 'lineup' ? html`<span class="tl-break" style=${`left:${dotPct(k - 0.5)}%`}><b>${team.periods === 2 ? 'rust' : 'pauze'}</b></span>` : null))}
      ${cards.map((cc, k) => html`<span class=${'tl-dot' + (k < i ? ' past' : k === i ? ' cur' : '') + (cc.kind === 'lineup' ? ' lu' : '') + (cc.pinned ? ' pinned' : '')} style=${`left:${dotPct(k)}%`}></span>`)}
      ${cards.map((cc, k) => (cc.pinned && !cc.past ? html`<span class="tl-pin" key=${'pin' + cc.t} style=${`left:${dotPct(k)}%`} aria-label="Vastgezet"><${Icon} name="pin" size=${13} /></span>` : null))}
      ${live && html`<span class="tl-now" style=${`left:${nowPct}%`}></span>`}
      <span class="tl-head" style=${`left:${headPct}%`}><span class="tl-time" style=${`transform:translateX(-${headPct}%)`}>${pillText}</span></span>
    </div>
    ${!compact && html`<div class=${'between' + (planner ? ' plnav' : '')}>
      <button type="button" class="iconbtn" aria-label="Vorige" onClick=${() => setF(i - 1, true)} disabled=${i === 0}><span style="transform:rotate(180deg);display:inline-flex"><${Icon} name="chev" /></span></button>
      <div class=${planner ? 'plnav-t' : 'col'} style=${planner ? '' : 'gap:0;align-items:center'}>
        <span class="h2">${planner && live && i === nowIndex ? 'Nu' : title}</span>
        ${planner && live && i !== nowIndex
          ? html`<button type="button" class="tonow" onClick=${() => setF(nowIndex, true)}>terug naar nu</button>`
          : planner ? (status && i !== nowIndex ? html`<span class="small">${status}</span>` : null)
          : html`<span class="small">${label(c.t)}${status && !(planner && i === nowIndex) ? ' · ' + status : ''}</span>`}
      </div>
      <button type="button" class="iconbtn" aria-label="Volgende" onClick=${() => setF(i + 1, true)} disabled=${i === cards.length - 1}><${Icon} name="chev" /></button>
    </div>`}
    ${!compact && !planner && isNext && html`<div class="planlive">
      <span class="col grow" style="gap:0;min-width:0"><b>${until > 0 ? 'Over ' + M.fmt(until) : 'Nu wisselen'}</b><span class="small" style="color:var(--ink)">${swapText}</span></span>
      <button type="button" class="btn primary" style="min-height:44px;padding:0 16px" onClick=${onSwapNow}>Nu wisselen</button>
    </div>`}
    ${compact && html`<div class="fieldcap">${title}${i > 0 && c.kind === 'swap' ? html` · ${multi ? html`<b>${c.ins.map(nick).join(', ')}</b> erin` : html`<b>${nick(c.in)}</b> erin voor ${nick(c.out)}`}` : ''}</div>`}
    ${!compact && planner && html`<${NextCaption} i=${i} nx=${nx} c=${c} lines=${lines} team=${team} match=${match} nick=${nick} canPlan=${canPlan}
      swapNo=${nx ? swapNoOf(nx) : 0} total=${cards.filter((x) => x.kind === 'swap').length} label=${label} onUnpin=${onUnpin}
      isNow=${live ? i === nowIndex : i === 0} until=${live && nx ? nx.t - liveT : null} />`}
    <div ref=${zone} class="scrubzone">
      <div class=${'fieldbox' + (live && i < nowIndex ? ' past' : '') + (peek ? ' peeking' : '')}>
        ${peek && nx
          ? html`<${Field} slots=${nx.slots} lines=${nx.lines || lines} keeperId=${nx.keeper || match.keeperId} nick=${nick} height=${compact ? 'auto' : 'clamp(380px, 56dvh, 560px)'}
              onTap=${() => {}} neon=${changes(cards, i + 1).in} accent=${accentFor(team)} />`
          : html`<${Field} slots=${c.slots} lines=${lines} formable=${canEdit} keeperId=${c.keeper || match.keeperId} nick=${nick} height=${compact ? 'auto' : 'clamp(380px, 56dvh, 560px)'}
              onTap=${() => {}} neon=${planner ? nxOuts : []} marked=${planner ? [] : ch.in} dashed=${!planner && ch.shift ? [ch.shift.id] : []} accent=${accentFor(team)} ghosts=${planner && !peek && !calm ? ghostsFor(nx, c.pos, nick) : null} />`}
        ${planner && peek && nx && html`<span class="peeklabel" role="status"><${Icon} name="eye" size=${15} />${nx.kind === 'lineup' ? 'Opstelling ' + M.periodLabel(team, nx.period) : 'Na wissel ' + swapNoOf(nx)}</span>`}
      </div>
      <div class="benchrow">
        <span class="label">Bank</span>
        <${BenchScroll}>
          ${(peek && nx ? nx.bench : c.bench).map((id) => {
            const ac = accentFor(team)(id); const wo = !planner && ch.out.indexOf(id) !== -1;
            const goesIn = planner && !peek && nxIns.indexOf(id) !== -1;
            const pill = html`<button type="button" class=${'benchpill' + (wo ? ' wasout' : '') + (ac ? ' acc' : '')} style=${ac ? '--acc:' + ac : ''} key=${id} data-pid=${id}>${nick(id)}${wo ? html`<span class="t">eruit</span>` : goesIn ? html`<span class="t">erin</span>` : ''}</button>`;
            return goesIn ? html`<${Neon} key=${'n' + id}>${pill}</${Neon}>` : pill;
          })}
          ${!c.bench.length && html`<span class="small">niemand</span>`}
        </${BenchScroll}>
      </div>
    </div>
    ${children}
    ${!compact && !planner && (i === 0
      ? html`<span class="sub">${editable ? 'Sleep een speler naar een andere plek of naar de bank om te ruilen. Het plan rekent meteen mee.' : 'Startopstelling.'}</span>`
      : c.kind === 'lineup'
        ? html`<span class="sub" style="color:var(--ink)"><span class="chg in">Erin: ${ch.in.map(nick).join(', ') || '—'}</span> <span class="chg out">Eruit: ${ch.out.map(nick).join(', ') || '—'}</span></span>`
        : multi ? html`<span class="sub" style="color:var(--ink)"><span class="chg in">↑ ${c.ins.map(nick).join(', ')}</span> erin voor <span class="chg out">↓ ${c.outs.map(nick).join(', ')}</span></span>`
        : html`<span class="sub" style="color:var(--ink)"><span class="chg in">↑ ${nick(c.in)}</span> erin voor <span class="chg out">↓ ${nick(c.out)}</span>${c.shift ? html`<br /><span class="chg sh">↔ ${nick(c.shift.id)}</span> schuift naar ${LINE_NAMES[c.shift.to]}` : ''}</span>`)}
    ${!compact && !planner && html`<span class="small">Veeg over het veld of sleep het oranje bolletje.</span>`}

    ${!compact && html`<div class="rooster card" style="box-shadow:none;border:1px solid var(--line);gap:0;padding:0">
      <button type="button" class="between" style="background:none;border:none;min-height:48px;padding:0 12px;width:100%" aria-expanded=${roster ? 'true' : 'false'} onClick=${() => setRoster(!roster)}>
        <span class="h2" style="font-size:15px">Hele wedstrijd per kind</span>
        <span class=${'chev' + (roster ? ' open' : '')}><${Icon} name="chev" size=${18} /></span>
      </button>
      <div class=${'collapse' + (roster ? ' open' : '')}><div>
        <div class="grid table" style="padding:0 12px 12px;display:flex;flex-direction:column;gap:4px;touch-action:pan-y">
          ${kids.map((id) => html`<div class="r">
            <span class="n">${nick(id)}</span>
            <span class="cells" style="position:relative">
              ${segs.map((s) => html`<span style=${`flex:${Math.max(1, s.b - s.a)} 1 0;background:${s.pos[id] ? POS_COLORS[s.pos[id]] : BENCH}`}></span>`)}
              <i class="playline" style=${`left:${pct}%`}></i>
            </span>
            <span class="v num">${M.mins(segs.reduce((a, s) => a + (s.pos[id] ? s.b - s.a : 0), 0))}′</span>
          </div>`)}
          <div class="legend">
            <span><i style="background:var(--pos-A)"></i>Achter</span><span><i style="background:var(--pos-M)"></i>Midden</span>
            <span><i style="background:var(--pos-V)"></i>Voor</span><span><i style=${'background:' + BENCH}></i>Bank</span>
          </div>
        </div>
      </div></div>
    </div>`}
  </div>`;
}

// Planner: het verhaal van het volgende moment, boven het veld. Per paar wie erin komt voor wie, waar hij gaat
// spelen en wie doorschuift (in coachtaal: linksvoor, rechtsachter, …). Met speldje of 'de app kiest'.
function NextCaption({ i, nx, c, lines, team, match, nick, canPlan, swapNo, total, label, onUnpin, isNow, until }) {
  if (match.finished) return null;
  if (!nx) return html`<div class="nextcap story"><span class="nc-when">Hierna</span><span class="nc-what">Geen wissels meer in deze wedstrijd.</span></div>`;
  if (nx.kind === 'lineup') return html`<div class="nextcap story"><span class="nc-when">${M.periodWord(team) === 'helft' ? 'Rust' : 'Pauze'} · ${label(nx.t)}</span><span class="nc-what">Nieuwe opstelling voor de ${M.periodLabel(team, nx.period)}</span></div>`;
  const call = M.callStory(c.slots, lines, nx.pairs || [{ out: nx.out, in: nx.in, shift: nx.shift }], nx.moves || []);
  const when = until != null && isNow
    ? (until > 0 ? `over ${M.fmt(until)}` : until > -1 ? 'nu' : `${M.fmt(-until)} te laat`)
    : label(nx.t);
  return html`<div class=${'nextcap story' + (nx.pinned ? ' pinned' : '') + (until != null && isNow && until <= 60 ? ' soon' : '')} key=${'nc' + nx.t}>
    <span class="nc-when">${isNow ? (match.started ? 'Volgende wissel' : 'Eerste wissel') : 'Daarna'} · ${swapNo} van ${total} · ${when}</span>
    <${CallStory} call=${call} nick=${nick} />
    ${nx.pinned
      ? html`<span class="nc-pin"><span class="pinbadge"><${Icon} name="pin" size=${14} />Vastgezet door jou</span><button type="button" class="linkbtn" onClick=${() => onUnpin && onUnpin(nx.t, swapNo)}>Losmaken</button></span>`
      : canPlan ? html`<span class="nc-hint">Sleep op het veld om het zelf te kiezen.</span>` : null}
  </div>`;
}
