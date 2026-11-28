// Speeltijd per speler, vooraf of achteraf: per speler losse pillen per linie (voor, midden, achter) en de
// doelband (gemiddelde ± halve marge). Tik een speler voor zijn wedstrijd in één strook: wanneer op welke
// linie en wanneer aan de kant. Gebruikt op het Wedstrijd-scherm (Autopilot en game plan) en in Controle.
import { html, useState, useMemo } from '../vendor/preact-htm.js';
import * as M from './match.js';
import { Icon, Sheet, Seg } from './ui.js';

const ORDER = ['V', 'M', 'A'];
const LNAME = { V: 'voor', M: 'midden', A: 'achter' };
const mins = (s) => Math.round(s / 60);
const halfMin = (s) => String(Math.round(s / 30) / 2).replace('.5', '½').replace('.', ',');

// Minuten per linie, strook per speler en bankbeurten, uit de momenten van het plan.
export function playData(match, team, cards) {
  const L = M.periodLen(team);
  const END = team.periods * L;
  const ids = match.present.filter((id) => id !== match.keeperId);
  const per = {};
  const segs = {};
  for (const id of ids) { per[id] = { V: 0, M: 0, A: 0 }; segs[id] = []; }
  cards.forEach((c, i) => {
    const t1 = i + 1 < cards.length ? cards[i + 1].t : END;
    if (t1 <= c.t) return;
    for (const id of ids) {
      const l = ORDER.indexOf(c.pos[id]) !== -1 ? c.pos[id] : null;
      if (l) per[id][l] += t1 - c.t;
      const s = segs[id];
      const last = s[s.length - 1];
      if (last && last.l === l && last.b === c.t) last.b = t1;
      else s.push({ a: c.t, b: t1, l });
    }
  });
  const played = {};
  const bench = {};
  for (const id of ids) {
    played[id] = per[id].V + per[id].M + per[id].A;
    const outs = segs[id].filter((x) => !x.l);
    bench[id] = { n: outs.length, longest: outs.reduce((a, x) => Math.max(a, x.b - x.a), 0) };
  }
  const marge = (M.effRules(match, team).marge || 5) * 60;
  const avg = ids.reduce((a, id) => a + played[id], 0) / Math.max(1, ids.length);
  const band = [Math.max(0, avg - marge / 2), avg + marge / 2];
  const scale = Math.max(band[1], ...ids.map((id) => played[id])) * 1.04 || 1;
  return { ids, per, segs, played, bench, band, scale, avg, marge, END, L };
}

export function PlayTime({ match, team, cards, onKid = null }) {
  const d = useMemo(() => playData(match, team, cards), [match, team, cards]);
  const [open, setOpen] = useState(null);
  const nick = (id) => M.nickOf(team, id);
  const byPlay = d.ids.slice().sort((a, b) => d.played[b] - d.played[a] || nick(a).localeCompare(nick(b)));
  const off = (id) => d.played[id] < d.band[0] - 30 || d.played[id] > d.band[1] + 30;
  return html`<div class="pt">
    <div class="pt-rows" style=${`--a:${d.band[0] / d.scale};--w:${(d.band[1] - d.band[0]) / d.scale}`}>
      <span class="pt-band" aria-hidden="true"></span>
      ${byPlay.map((id, i) => {
        const isOpen = !onKid && open === id;
        const parts = ORDER.filter((l) => d.per[id][l] > 0);
        return html`<div class=${'pt-row' + (isOpen ? ' open' : '')} key=${id} style=${'--i:' + i}>
          <button type="button" class="pt-main" aria-expanded=${onKid ? null : isOpen ? 'true' : 'false'}
            aria-label=${`${nick(id)}: ${mins(d.played[id])} minuten, ${parts.map((l) => LNAME[l] + ' ' + mins(d.per[id][l])).join(', ')}`}
            onClick=${() => (onKid ? onKid(id) : setOpen(isOpen ? null : id))}>
            <span class="pt-n">${nick(id)}</span>
            <span class="pt-track"><span class="pt-fill" style=${'width:' + (d.played[id] / d.scale) * 100 + '%'}>
              ${parts.map((l, j) => html`<i key=${l} class=${'pt-p l' + l} style=${`flex:${d.per[id][l]} 1 0;--j:${j}`}><b>${d.per[id][l] >= 300 ? mins(d.per[id][l]) + '′' : ''}</b></i>`)}
            </span></span>
            <span class=${'pt-m num' + (off(id) ? ' off' : '')}>${mins(d.played[id])}′</span>
          </button>
          ${isOpen && html`<div class="pt-det">
            <span class="pt-strip" aria-hidden="true">
              ${d.segs[id].map((x, k) => html`<i key=${k} class=${x.l ? 'l' + x.l : 'lB'} style=${`left:${(x.a / d.END) * 100}%;width:${((x.b - x.a) / d.END) * 100}%`}></i>`)}
              ${Array.from({ length: team.periods - 1 }, (_, q) => html`<span class="pt-cut" key=${'c' + q} style=${`left:${((q + 1) * d.L / d.END) * 100}%`}></span>`)}
            </span>
            <span class="pt-dt">${parts.map((l) => `${LNAME[l]} ${mins(d.per[id][l])}′`).join(' · ')}${d.bench[id].n ? ` · ${d.bench[id].n}× aan de kant, langst ${halfMin(d.bench[id].longest)} min` : ' · speelt alles'}</span>
          </div>`}
        </div>`;
      })}
    </div>
    <div class="pt-legend"><span><i class="lV"></i>voor</span><span><i class="lM"></i>midden</span><span><i class="lA"></i>achter</span><span><i class="pt-bandkey"></i>doel ± marge</span></div>
  </div>`;
}

// Vooraf bekijken vanaf het Wedstrijd-scherm: hoe lang speelt wie, en waar.
export function PlayTimeSheet({ match, team, onClose, onOpenPlan = null }) {
  const own = M.isOwn(match, team);
  const gp = match.gameplan;
  const empty = own && !(gp && gp.base);
  const cards = useMemo(() => (empty ? [] : M.timeline(match, team).cards), [match, team, empty]);
  const d = useMemo(() => (empty ? null : playData(match, team, cards)), [cards]);
  const swaps = cards.filter((c) => c.kind === 'swap').reduce((a, c) => a + (c.ins ? c.ins.length : 1), 0);
  const keeper = match.keeperId ? M.nickOf(team, match.keeperId) : null;
  // schakelaar bovenin: speeltijd of rooster, zodat je niet hoeft te scrollen
  const [view, setView] = useState('tijd');
  const ros = view === 'rooster';
  return html`<${Sheet} onClose=${onClose} label=${ros ? 'Rooster per speler' : 'Speeltijd per speler'}>
    <span class="pt-kicker">${own ? html`<${Icon} name="edit" size=${13} />Volgens je game plan` : html`<span class="ai-grad">✦ Volgens Autopilot</span>`}</span>
    <span class="h2" style="font-size:22px">${ros ? 'Rooster per speler' : 'Speeltijd per speler'}</span>
    ${!empty && html`<${Seg} label="Weergave" value=${view} onChange=${setView} options=${[['tijd', 'Speeltijd'], ['rooster', 'Rooster']]} />`}
    ${empty
      ? html`<span class="sub">Je game plan is nog leeg. Zodra er een startopstelling staat, zie je hier wie hoe lang speelt en waar.</span>
          ${onOpenPlan && html`<button type="button" class="btn primary block" onClick=${onOpenPlan}>Open game plan</button>`}`
      : ros
        ? html`<span class="sub">Wie waar speelt, de hele wedstrijd. ${swaps} ${swaps === 1 ? 'wissel' : 'wissels'}.</span>
          <div class="pt-view" key="rooster"><${Rooster} match=${match} team=${team} cards=${cards} /></div>`
        : html`<span class="sub">${swaps} ${swaps === 1 ? 'wissel' : 'wissels'} · doel ${halfMin(d.avg)} min, marge ${mins(d.marge)} min. Tik een speler voor zijn wedstrijd.</span>
          <div class="pt-view" key="tijd"><${PlayTime} match=${match} team=${team} cards=${cards} /></div>`}
    ${!empty && keeper && html`<span class="small pt-keep"><span class="kbadge">K</span>${keeper} keept${team.rules && team.rules.keeperCounts ? '' : ' (telt niet mee)'}</span>`}
  </${Sheet}>`;
}

// ---------- rooster per speler (voor het standaardplan én in de controle) ----------
export function Rooster({ match, team, cards: given, onKid = null }) {
  const nick = (id) => M.nickOf(team, id);
  const cards = given || M.timeline(match, team).cards;
  const L = M.periodLen(team);
  const END = team.periods * L;
  if (!cards.length) return null;
  const ids = Object.keys(cards[0].pos).concat(cards[0].bench);
  const played = {};
  for (const id of ids) played[id] = 0;
  cards.forEach((c, i) => { const t1 = i + 1 < cards.length ? cards[i + 1].t : END; for (const id in c.pos) if (id in played) played[id] += Math.max(0, t1 - c.t); });
  const order = ids.slice().sort((a, b) => played[b] - played[a]);
  // aaneengesloten stukken op dezelfde plek samenvoegen (de rust blijft een naad)
  const segsOf = (id) => {
    const out = [];
    cards.forEach((c, i) => {
      const s = { t: c.t, t1: i + 1 < cards.length ? cards[i + 1].t : END, line: c.pos[id] || null };
      if (s.t1 <= s.t) return;
      const last = out[out.length - 1];
      if (last && last.line === s.line && s.t % L !== 0) last.t1 = s.t1; else out.push(s);
    });
    return out;
  };
  return html`<div class="rooster">
    ${order.map((id, k) => html`<button type="button" class="rt-row" key=${id} style=${'--i:' + k} onClick=${onKid ? () => onKid(id) : null} disabled=${!onKid}><span class="rr-n">${nick(id)}</span><span class="rr-bar">
      ${segsOf(id).map((s) => html`<i class=${s.line ? 'l' + s.line : 'off'} style=${`flex:${s.t1 - s.t}` + (s.t > 0 && s.t % L === 0 ? ';margin-left:3px' : '')}></i>`)}
    </span><span class="rr-m num">${mins(played[id])}′</span></button>`)}
    <div class="rt-legend2"><span><i class="lV"></i>voor</span><span><i class="lM"></i>midden</span><span><i class="lA"></i>achter</span><span><i class="off"></i>aan de kant</span></div>
  </div>`;
}

