import { html, useEffect, useLayoutEffect, useRef, useState } from '../../vendor/preact-htm.js';
import { update, activeTeam, hashPin, uid } from '../store.js';
import { Icon, Sheet, Confirm, Switch, Seg, Reveal, toast, POS_COLORS, POS_NAMES, KRACHT_BG } from '../ui.js';
import { haptic } from '../motion.js';
import { KEY_KRACHT } from '../planner.js';

const STRENGTHS = ['Snel', 'Overzicht', 'Techniek', 'Inzet', 'Verdedigen', 'Passen', 'Scoren', 'Samenspel', 'Leiderschap', 'Vrolijk'];
let unlockedUntil = 0;
// tot wanneer het spelersdeel open staat (voor de status op de Team-pagina)
export const pinOpenUntil = () => unlockedUntil;

// ---------- pincode: donker glas, ronde toetsen, slot dat opengaat ----------
function LockIcon() {
  return html`<svg width="34" height="34" viewBox="0 0 48 48" aria-hidden="true">
    <path class="lk-sh" d="M15 22v-6.5a9 9 0 0 1 18 0V22" fill="none" stroke="currentColor" stroke-width="4.2" stroke-linecap="round" />
    <rect x="9.5" y="21" width="29" height="21.5" rx="7" fill="currentColor" />
    <circle class="lk-hole" cx="24" cy="31.8" r="3.2" />
  </svg>`;
}

// onComplete(pin) → 'ok' | 'next' | { error: 'tekst' }; bij 'ok' gaat het slot open en volgt onDone
function PinPad({ title, sub, onComplete, onDone, footer }) {
  const [pin, setPin] = useState('');
  const [st, setSt] = useState('idle');
  const [msg, setMsg] = useState('');
  const busy = st !== 'idle';
  const pinRef = useRef('');
  pinRef.current = pin;
  const finish = async (p) => {
    setSt('busy');
    await new Promise((r) => setTimeout(r, 160));
    const r = await onComplete(p);
    if (r === 'ok') {
      setSt('ok');
      haptic('success');
      setTimeout(() => onDone && onDone(), 720);
    } else if (r === 'next') {
      setSt('idle');
      setPin('');
    } else {
      setMsg((r && r.error) || 'Onjuiste pincode');
      setSt('error');
      haptic('no');
      setTimeout(() => { setPin(''); setSt('idle'); }, 560);
    }
  };
  const press = (k) => {
    if (busy) return;
    if (k === 'del') { setPin((x) => x.slice(0, -1)); return; }
    const next = (pinRef.current + k).slice(0, 4);
    pinRef.current = next;
    setPin(next);
    if (msg && next.length === 1) setMsg('');
    if (next.length === 4) finish(next);
  };
  // ook met een toetsenbord
  useEffect(() => {
    const onKey = (e) => {
      if (/^[0-9]$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') press('del');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  const key = (k) => html`<button type="button" class="pin-key" data-press="none" aria-label=${k} onClick=${() => press(k)}>${k}</button>`;
  return html`<div class="pin-step">
    <div class="pin-head">
      <span class=${'pin-lock ' + st}><${LockIcon} /></span>
      <h1 class="pin-title">${title}</h1>
      <p class=${'pin-sub' + (msg ? ' err' : '')} role=${msg ? 'alert' : undefined}>${msg || sub}</p>
      <div class=${'pin-dots ' + st} aria-label=${pin.length + ' van 4 cijfers'}>
        ${[0, 1, 2, 3].map((i) => html`<i class=${i < pin.length || st === 'ok' ? 'on' : ''} style=${'--k:' + i}></i>`)}
      </div>
    </div>
    <div class="pin-pad">
      ${['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(key)}
      ${footer || html`<span></span>`}
      ${key('0')}
      <button type="button" class=${'pin-key text' + (pin.length ? '' : ' hide')} data-press="none" aria-label="Wissen" onClick=${() => press('del')}><${Icon} name="back" size=${26} /></button>
    </div>
  </div>`;
}

function PinScreen({ children }) {
  return html`<main class="pinscreen">
    <div class="pin-bg" aria-hidden="true"><i class="b1"></i><i class="b2"></i><i class="b3"></i></div>
    <div class="pin-top"><a class="pin-back" href="#/team" aria-label="Terug"><${Icon} name="back" /></a></div>
    ${children}
  </main>`;
}

export function Spelers({ state }) {
  const team = activeTeam(state);
  const [, force] = useState(0);
  const [stage, setStage] = useState(null); // instellen: { first }
  const newHash = useRef(null);
  const [edit, setEdit] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const unlocked = state.pinHash && Date.now() < unlockedUntil;

  const back = html`<a class="iconbtn" href="#/team" aria-label="Terug"><${Icon} name="back" /></a>`;

  if (!state.pinHash || stage && stage.change) {
    const second = !!(stage && stage.first);
    return html`<${PinScreen}>
      <${PinPad} key=${second ? 'b' : 'a'}
        title=${second ? 'Herhaal de pincode' : (stage && stage.change ? 'Nieuwe pincode' : 'Kies een pincode')}
        sub=${second ? 'Nog een keer, ter controle.' : '4 cijfers. Zo zien de spelers (en anderen) de beoordelingen niet.'}
        onComplete=${async (pin) => {
          if (!second) { setStage({ ...(stage || {}), first: pin }); return 'next'; }
          if (pin !== stage.first) { setTimeout(() => setStage(stage.change ? { change: true } : null), 650); return { error: 'Niet hetzelfde, probeer opnieuw.' }; }
          // pas na het openen van het slot opslaan, anders verspringt het scherm halverwege
          newHash.current = await hashPin(pin);
          return 'ok';
        }}
        onDone=${() => { const h = newHash.current; unlockedUntil = Date.now() + 15 * 60 * 1000; update((d) => { d.pinHash = h; }); setStage(null); toast('Pincode ingesteld'); }} />
    </${PinScreen}>`;
  }

  if (!unlocked) {
    return html`<${PinScreen}>
      <${PinPad} title="Spelers en beoordeling" sub="Voer je pincode in"
        onComplete=${async (pin) => ((await hashPin(pin)) === state.pinHash ? 'ok' : { error: 'Onjuiste pincode' })}
        onDone=${() => { unlockedUntil = Date.now() + 15 * 60 * 1000; force((x) => x + 1); }}
        footer=${html`<button type="button" class="pin-key text small" data-press="none" onClick=${() => setConfirm({
          title: 'Pincode vergeten?', text: 'Je kunt een nieuwe pincode kiezen. Dan worden alle beoordelingen en voorkeursposities gewist; namen en wedstrijden blijven.', yes: 'Wissen en nieuwe pincode', danger: true,
          run: () => update((d) => { d.pinHash = null; for (const t of d.teams) for (const p of t.players) { p.kracht = 50; p.prefs = []; p.strengths = []; } })
        })}>Vergeten?</button>`} />
      ${confirm && html`<${Confirm} ...${confirm} onYes=${confirm.run} onClose=${() => setConfirm(null)} />`}
    </${PinScreen}>`;
  }

  const active = team.players.filter((p) => p.active !== false);
  const archived = team.players.filter((p) => p.active === false);
  const row = (p) => html`<button type="button" class="choice" key=${p.id} onClick=${() => setEdit({ ...p })}>
    <span class="col grow" style="gap:4px;min-width:0">
      <span class="between"><span style="font-weight:800">${p.nick || p.name}</span><span class="small" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.name !== p.nick ? p.name : ''}</span></span>
      <span class="row" style="gap:8px">
        <span class="minibar" style=${`background:linear-gradient(90deg, transparent ${p.kracht}%, var(--line) ${p.kracht}%), ${KRACHT_BG}`}></span>
        <span class="row" style="gap:4px;flex-wrap:wrap">
          <span class=${'badge lvbadge' + (p.kracht >= KEY_KRACHT ? ' keybadge' : '')}>${KR_LEVELS[levelOf(p.kracht)][0]}</span>
          ${p.main && html`<span class="badge" style=${`background:${POS_COLORS[p.main]};color:#fff;padding:2px 8px;box-shadow:0 0 0 2px #fff,0 0 0 3px ${POS_COLORS[p.main]}`}>${POS_NAMES[p.main]}${p.flex === false ? ' · vast' : ''}</span>`}
          ${(p.prefs || []).filter((k) => k !== p.main).map((k) => html`<span class="badge" style=${`background:${POS_COLORS[k]};color:#fff;padding:2px 8px;opacity:.75`}>${POS_NAMES[k]}</span>`)}
        </span>
      </span>
    </span>
    <${Icon} name="chev" size=${18} />
  </button>`;

  return html`<main class="screen">
    <div class="topbar">
      ${back}
      <span class="h2">Spelers en beoordeling</span>
      <button type="button" class="link" onClick=${() => { unlockedUntil = 0; force((x) => x + 1); }}>Vergrendel</button>
    </div>
    <span class="small">Alleen voor coaches. Speelkracht en voorkeur zie je nergens anders in de app; ze sturen alleen de wisselberekening.</span>
    <section class="card" style="gap:8px">
      ${active.map(row)}
      ${!active.length && html`<p class="sub" style="margin:0">Nog geen spelers.</p>`}
      <button type="button" class="btn soft block" onClick=${() => setEdit({ id: null, name: '', nick: '', kracht: 50, main: null, flex: true, prefs: [], strengths: [], active: true })}><${Icon} name="plus" size=${18} /> Speler toevoegen</button>
    </section>
    ${archived.length > 0 && html`<section class="card" style="gap:8px"><span class="label">Niet meer in de selectie</span>${archived.map(row)}</section>`}
    <button type="button" class="link" style="align-self:center" onClick=${() => setStage({ change: true })}>Pincode wijzigen</button>

    ${edit && html`<${PlayerEditor} player=${edit} onClose=${() => setEdit(null)}
      onSave=${(p, auto) => {
        let prev = null;
        update((d) => {
          const t = activeTeam(d);
          prev = JSON.parse(JSON.stringify(t.players));
          if (p.id) { const i = t.players.findIndex((x) => x.id === p.id); if (i !== -1) t.players[i] = p; }
          else t.players.push({ ...p, id: uid() });
        });
        setEdit(null);
        if (auto) toast(p.id ? `${p.nick || p.name} bewaard` : `${p.nick || p.name} toegevoegd`, { label: 'Ongedaan', run: () => update((d) => { activeTeam(d).players = prev; }) });
        else toast('Opgeslagen');
      }}
      onDelete=${(p) => setConfirm({
        title: (p.nick || p.name) + ' verwijderen?', text: 'Liever bewaren voor het seizoensoverzicht? Zet dan "In de selectie" uit.', yes: 'Verwijderen', danger: true,
        run: () => { update((d) => { const t = activeTeam(d); t.players = t.players.filter((x) => x.id !== p.id); }); setEdit(null); toast('Verwijderd'); }
      })} />`}
    ${confirm && html`<${Confirm} ...${confirm} onYes=${confirm.run} onClose=${() => setConfirm(null)} />`}
  </main>`;
}

// ---------- speelkracht-schuif: 9 klikpunten, wolkje met een woord (geen cijfers), golvende streepjes ----------
// Alleen hier, achter de pincode. Tik = naar het dichtstbijzijnde punt; slepen = elk punt geeft een tikje.
// De 9 niveaus van Raymond: label boven de balk, omschrijving eronder. Alleen hier, achter de pincode.
export const KR_LEVELS = [
  ['Beginner', 'Ontdekt het spel met aandacht en inzet. De basis (stick vasthouden, lopen met de bal) is er nog niet helemaal, patronen en het overzicht zijn nog in opbouw.'],
  ['Startende Speler', 'Rent enthousiast mee en raakt steeds vaker de bal, terwijl de blik nog geregeld omlaag gaat en het overzicht bij drukte soms wegglijdt.'],
  ['Zoekende Basisspeler', 'Pakt in rustige fases de bal op en speelt die door, al wordt er soms nog wat laat geschakeld of gezocht naar de juiste plek op het veld.'],
  ['Betrouwbare Schakel', 'Blijft netjes in de eigen zone en houdt het spel simpel met breedte- en terugballen, terwijl het zoeken naar voorwaartse opties nog groeit.'],
  ['Stevige Middenmotor', 'Blijft volop in beweging over het veld en houdt het tempo goed bij, met nog ruimte om sneller om te gaan schakelen en vaker beslissend te zijn.'],
  ['Vaste Waarde', 'Je brengt energie, overzicht en kwaliteit in het spel, zoekt teamgenoten op en houdt het spel levendig, soms laat je nog een kans liggen op intensieve momenten.'],
  ['Bepalende Speler', 'Vraagt actief om de bal, zet gerichte acties of passes in en brengt beweging in het spel, met fases waarin het tempo iets kan terugzakken.'],
  ['Motor van het Team', 'Houdt het tempo hoog, zet door als het spel stokt en trekt anderen mee, al vraagt dat veel energie en wordt de bal soms iets langer vastgehouden.'],
  ['Draagt Het Hele Team', 'Is op veel plekken aanwezig, verdedigt, valt aan en stuurt het spel met veel initiatief, waarbij het lastig kan zijn om alles gedoseerd te houden en niet te veel naar zich toe te trekken.']
];
const levelOf = (kracht) => Math.max(0, Math.min(8, Math.round(kracht / 12.5)));
const KR_KEY = Math.round(KEY_KRACHT / 12.5);
function KrachtSlider({ value, onChange }) {
  const idx = Math.max(0, Math.min(8, Math.round(value / 12.5)));
  const root = useRef(null);
  const inner = useRef(null);
  const st = useRef(null);
  const lastK = useRef(idx);
  const cb = useRef(onChange);
  cb.current = onChange;
  const [drag, setDrag] = useState(false);
  const [shownK, setShownK] = useState(null);
  const [tip, setTip] = useState(0);
  const tipRef = useRef(null);
  // positie en golf rechtstreeks op de schuif (elk beeldje, zonder opnieuw te tekenen)
  const paint = (p, wave) => {
    const el = root.current;
    if (!el) return;
    el.style.setProperty('--p', (p / 8).toFixed(4));
    el.querySelectorAll('.kr-tick').forEach((t, i) => {
      const d = i - p;
      t.style.setProperty('--h', wave ? (1 + 1.5 * Math.exp(-(d * d) / 0.7)).toFixed(3) : '1');
    });
  };
  // buiten het slepen volgt de schuif de waarde
  useLayoutEffect(() => { if (!st.current || !st.current.on) paint(idx, false); });
  // het wolkje krijgt de breedte van het label dat er nu staat (veert mee bij een ander niveau)
  const shownNow = drag && shownK != null ? shownK : idx;
  useLayoutEffect(() => {
    const el = tipRef.current;
    const b = el && el.querySelector('b.on');
    if (b) el.style.width = Math.ceil(b.offsetWidth + 26) + 'px';
  }, [shownNow]);
  useEffect(() => {
    // lettertype later geladen: breedte opnieuw meten
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { const el = tipRef.current; const b = el && el.querySelector('b.on'); if (b) el.style.width = Math.ceil(b.offsetWidth + 26) + 'px'; });
  }, []);
  // iPhone: tijdens slepen nooit de pagina laten meeschuiven
  useEffect(() => {
    const el = root.current;
    const block = (e) => { if (st.current && st.current.on) e.preventDefault(); };
    el.addEventListener('touchmove', block, { passive: false });
    return () => el.removeEventListener('touchmove', block);
  }, []);
  const pick = (k) => { if (k !== lastK.current) { lastK.current = k; cb.current(k * 12.5); haptic('select'); } };
  const down = (e) => {
    if (e.button > 0) return;
    lastK.current = idx;
    // maten één keer vastleggen; daarna telt alleen hoe ver de vinger schuift
    const r = inner.current.getBoundingClientRect();
    const w = Math.max(1, r.width);
    st.current = { id: e.pointerId, x: e.clientX, y: e.clientY, on: false, w, start: Math.max(0, Math.min(8, ((e.clientX - r.left) / w) * 8)), raf: 0, p: 0, k: idx };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (x) { /* oud toestel */ }
  };
  const move = (e) => {
    const s = st.current;
    if (!s || e.pointerId !== s.id) return;
    if (!s.on) {
      const dx = Math.abs(e.clientX - s.x), dy = Math.abs(e.clientY - s.y);
      if (dx < 4 && dy < 4) return;
      if (dy > dx) { st.current = null; return; }
      s.on = true;
      setDrag(true);
    }
    s.p = Math.max(0, Math.min(8, s.start + ((e.clientX - s.x) / s.w) * 8));
    const k = Math.round(s.p);
    if (k !== s.k) { s.k = k; setShownK(k); pick(k); }
    if (!s.raf) s.raf = requestAnimationFrame(() => { s.raf = 0; if (st.current === s) paint(s.p, true); });
  };
  const end = (tapAt) => {
    const s = st.current;
    st.current = null;
    if (!s) return;
    if (s.raf) cancelAnimationFrame(s.raf);
    if (!s.on && tapAt) { pick(Math.round(s.start)); setTip((t) => t + 1); }
    setDrag(false);
    setShownK(null);
    paint(lastK.current, false);
  };
  const key = (e) => {
    const d = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key];
    let k = d ? idx + d : e.key === 'Home' ? 0 : e.key === 'End' ? 8 : null;
    if (k == null) return;
    e.preventDefault();
    k = Math.max(0, Math.min(8, k));
    if (k !== idx) { lastK.current = k; cb.current(k * 12.5); setTip((t) => t + 1); }
  };
  const shown = shownNow;
  const where = (i) => (i < shown ? 'b' : i > shown ? 'a' : 'on');
  return html`<div class=${'krw' + (shown >= KR_KEY ? ' key' : '') + (drag ? ' dragging' : '')}>
    <div ref=${root} class=${'kr' + (drag ? ' dragging' : '') + (shown >= KR_KEY ? ' key' : '') + (tip ? ' t' + (tip % 2) : '')}
      role="slider" tabindex="0" aria-label="Speelkracht" aria-valuemin="1" aria-valuemax="9" aria-valuenow=${idx + 1} aria-valuetext=${KR_LEVELS[idx][0]}
      onPointerDown=${down} onPointerMove=${move} onPointerUp=${() => end(true)} onPointerCancel=${() => end(false)} onKeyDown=${key}>
      <span class="kr-rail" style=${'background:' + KRACHT_BG}><span class="kr-cover"></span></span>
      <span class="kr-inner" ref=${inner}>
        ${Array.from({ length: 9 }, (_, i) => html`<i class=${'kr-tick' + (i <= shown ? ' on' : '') + (i >= KR_KEY ? ' k' : '')} style=${`left:${(i / 8) * 100}%`}></i>`)}
        <span class="kr-car"><span class="kr-thumb"></span>
          <span class="kr-tip" ref=${tipRef} aria-hidden="true">${KR_LEVELS.map(([l], i) => html`<b class=${where(i)}>${l}</b>`)}</span>
        </span>
      </span>
    </div>
    <div class="kr-desc" aria-live="polite">
      ${KR_LEVELS.map(([, d], i) => html`<p class=${where(i)} aria-hidden=${i === shown ? undefined : 'true'}>${d}</p>`)}
    </div>
  </div>`;
}

function PlayerEditor({ player, onClose, onSave, onDelete }) {
  const [p, setP] = useState(player);
  const set = (k, v) => setP({ ...p, [k]: v });
  const toggle = (k, v) => set(k, (p[k] || []).indexOf(v) !== -1 ? p[k].filter((x) => x !== v) : (p[k] || []).concat([v]));
  const nickDefault = (p.name || '').trim().split(/\s+/)[0].slice(0, 8);
  // bij dichtklappen blijft de laatste rol zichtbaar tot het blok weg is
  const lastMain = useRef(p.main || 'A');
  if (p.main) lastMain.current = p.main;
  const main = p.main || lastMain.current;
  const problem = () => (!p.name.trim() ? 'Vul een naam in' : !(p.prefs || []).filter((x) => x !== 'K').length && !(p.main && p.main !== 'K') ? 'Kies minstens één veldpositie' : null);
  const clean = () => ({ ...p, name: p.name.trim(), nick: (p.nick || '').trim().slice(0, 8) || nickDefault });
  const save = () => {
    const pr = problem();
    if (pr) { toast(pr); return; }
    onSave(clean());
  };
  // wegtikken of omlaag vegen: wat je invulde blijft bewaard (met Ongedaan in de melding).
  // Een lege nieuwe speler verdwijnt gewoon; klopt er nog iets niet, dan blijft het venster staan.
  const dirty = JSON.stringify(p) !== JSON.stringify(player);
  const keep = useRef(false);
  const dismiss = () => {
    if (!dirty) return true;
    if (!player.id && !p.name.trim()) return true;
    const pr = problem();
    if (pr) { toast(pr + ', of tik Annuleren'); return false; }
    keep.current = true;
    return true;
  };
  return html`<${Sheet} onClose=${() => (keep.current ? onSave(clean(), true) : onClose())} onDismiss=${dismiss} label="Speler">
    <span class="h2" style="font-size:20px">${player.id ? 'Speler aanpassen' : 'Nieuwe speler'}</span>
    <div class="col">
      <label class="label" for="pname">Volledige naam</label>
      <input id="pname" class="input" value=${p.name} autocomplete="off" onInput=${(e) => set('name', e.target.value)} />
    </div>
    <div class="col">
      <div class="between"><label class="label" for="pnick">Bijnaam (in het veld)</label><span class="small">${(p.nick || '').length}/8</span></div>
      <input id="pnick" class="input" value=${p.nick} maxLength="8" placeholder=${nickDefault} autocomplete="off" onInput=${(e) => set('nick', e.target.value)} />
    </div>
    <div class="col">
      <span class="label">Speelkracht</span>
      <${KrachtSlider} value=${p.kracht} onChange=${(v) => setP((q) => ({ ...q, kracht: v }))} />
    </div>
    <div class="col">
      <span class="label">Dominante rol</span>
      <${Seg} label="Dominante rol" value=${p.main || ''} onChange=${(v) => set('main', v || null)} options=${[['', 'Geen'], ['K', 'Keeper'], ['A', 'Achter'], ['M', 'Midden'], ['V', 'Voor']]} />
      <${Reveal} open=${!!p.main}><div class="setting">
        <div class="col" style="gap:1px"><span class="t">App mag afwijken als het moet</span>
          <span class="small">${p.flex !== false ? 'Krijgt voorrang op ' + POS_NAMES[main].toLowerCase() + ', maar de app mag schuiven voor de balans.' : (main === 'K' ? 'Wordt bij het klaarzetten als keeper voorgesteld.' : 'Staat altijd ' + POS_NAMES[main].toLowerCase() + '.')}</span></div>
        <${Switch} label="App mag afwijken" on=${p.flex !== false} onChange=${(v) => set('flex', v)} />
      </div></${Reveal}>
    </div>
    <div class="col">
      <span class="label">Voorkeursposities</span>
      <div class="wrap">${['K', 'A', 'M', 'V'].map((k) => html`<button type="button" class="chip" aria-pressed=${(p.prefs || []).indexOf(k) !== -1 ? 'true' : 'false'} onClick=${() => toggle('prefs', k)}>
        <span style=${`display:inline-block;width:10px;height:10px;border-radius:99px;margin-right:6px;background:${POS_COLORS[k]}`}></span>${k === 'K' ? 'Keeper (wil graag)' : POS_NAMES[k]}
      </button>`)}</div>
    </div>
    <div class="col">
      <span class="label">Sterke kanten (optioneel)</span>
      <div class="wrap">${STRENGTHS.map((s) => html`<button type="button" class="chip warm" aria-pressed=${(p.strengths || []).indexOf(s) !== -1 ? 'true' : 'false'} onClick=${() => toggle('strengths', s)}>${s}</button>`)}</div>
    </div>
    <div class="setting">
      <span class="t">In de selectie</span>
      <${Switch} label="In de selectie" on=${p.active !== false} onChange=${(v) => set('active', v)} />
    </div>
    <button type="button" class="btn primary block" onClick=${save}>Opslaan</button>
    <div class="row">
      ${player.id && html`<button type="button" class="btn danger grow" onClick=${() => onDelete(player)}>Verwijderen</button>`}
      <button type="button" class="btn plain grow" onClick=${onClose}>Annuleren</button>
    </div>
  </${Sheet}>`;
}
