import { html, useEffect, useRef, useState } from '../../vendor/preact-htm.js';
import { update, activeTeam, hashPin, uid } from '../store.js';
import { Icon, Sheet, Confirm, Switch, Seg, Reveal, toast, POS_COLORS, POS_NAMES, KRACHT_BG } from '../ui.js';
import { haptic } from '../motion.js';
import { KEY_KRACHT } from '../planner.js';

const STRENGTHS = ['Snel', 'Overzicht', 'Techniek', 'Inzet', 'Verdedigen', 'Passen', 'Scoren', 'Samenspel', 'Leiderschap', 'Vrolijk'];
let unlockedUntil = 0;

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
        sub=${second ? 'Nog een keer, ter controle.' : '4 cijfers. Zo zien de kinderen (en anderen) de beoordelingen niet.'}
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
          ${p.kracht >= KEY_KRACHT && html`<span class="badge keybadge">dragend</span>`}
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
      onSave=${(p) => {
        update((d) => {
          const t = activeTeam(d);
          if (p.id) { const i = t.players.findIndex((x) => x.id === p.id); if (i !== -1) t.players[i] = p; }
          else t.players.push({ ...p, id: uid() });
        });
        setEdit(null);
        toast('Opgeslagen');
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
const KR_WORDS = ['Begint net', 'Groeit nog', 'Groeit', 'Doet goed mee', 'Stevige basis', 'Sterk', 'Dragend', 'Echt dragend', 'Draagt het spel'];
const KR_KEY = Math.round(KEY_KRACHT / 12.5);
function KrachtSlider({ value, onChange }) {
  const idx = Math.max(0, Math.min(8, Math.round(value / 12.5)));
  const inner = useRef(null);
  const st = useRef(null);
  const lastK = useRef(idx);
  const [pos, setPos] = useState(null);
  const [tip, setTip] = useState(0);
  const [showTip, setShowTip] = useState(false);
  useEffect(() => {
    if (!tip) return undefined;
    setShowTip(true);
    const t = setTimeout(() => setShowTip(false), 1100);
    return () => clearTimeout(t);
  }, [tip]);
  const root = useRef(null);
  // iPhone: tijdens slepen nooit de pagina laten meeschuiven
  useEffect(() => {
    const el = root.current;
    const block = (e) => { if (st.current && st.current.on) e.preventDefault(); };
    el.addEventListener('touchmove', block, { passive: false });
    return () => el.removeEventListener('touchmove', block);
  }, []);
  const pick = (k) => { if (k !== lastK.current) { lastK.current = k; onChange(k * 12.5); haptic('select'); } };
  const down = (e) => {
    if (e.button > 0) return;
    lastK.current = idx;
    // maten één keer vastleggen; daarna telt alleen hoe ver de vinger schuift (geen gespring)
    const r = inner.current.getBoundingClientRect();
    const w = Math.max(1, r.width);
    st.current = { id: e.pointerId, x: e.clientX, y: e.clientY, on: false, w, start: Math.max(0, Math.min(8, ((e.clientX - r.left) / w) * 8)), raf: 0, p: 0 };
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
    }
    s.p = Math.max(0, Math.min(8, s.start + ((e.clientX - s.x) / s.w) * 8));
    pick(Math.round(s.p));
    if (!s.raf) s.raf = requestAnimationFrame(() => { s.raf = 0; if (st.current === s) setPos(s.p); });
  };
  const up = (e) => {
    const s = st.current;
    st.current = null;
    if (!s) return;
    if (s.raf) cancelAnimationFrame(s.raf);
    if (!s.on) { pick(Math.round(s.start)); setTip((t) => t + 1); }
    setPos(null);
  };
  const cancel = () => { const s = st.current; if (s && s.raf) cancelAnimationFrame(s.raf); st.current = null; setPos(null); };
  const key = (e) => {
    const d = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key];
    let k = d ? idx + d : e.key === 'Home' ? 0 : e.key === 'End' ? 8 : null;
    if (k == null) return;
    e.preventDefault();
    k = Math.max(0, Math.min(8, k));
    if (k !== idx) { lastK.current = k; onChange(k * 12.5); setTip((t) => t + 1); }
  };
  const p = pos != null ? pos : idx;
  const shown = pos != null ? Math.round(pos) : idx;
  return html`<div ref=${root} class=${'kr' + (pos != null ? ' dragging' : '') + (pos != null || showTip ? ' tip' : '') + (shown >= KR_KEY ? ' key' : '')}
    role="slider" tabindex="0" aria-label="Speelkracht" aria-valuemin="0" aria-valuemax="8" aria-valuenow=${idx} aria-valuetext=${KR_WORDS[idx]}
    style=${`--p:${(p / 8).toFixed(4)}`} onPointerDown=${down} onPointerMove=${move} onPointerUp=${up} onPointerCancel=${cancel} onKeyDown=${key} onBlur=${() => setShowTip(false)}>
    <span class="kr-rail" style=${'background:' + KRACHT_BG}><span class="kr-cover"></span></span>
    <span class="kr-inner" ref=${inner}>
      ${Array.from({ length: 9 }, (_, i) => {
        const d = i - p;
        const lift = pos != null ? Math.exp(-(d * d) / 0.7) : 0;
        return html`<i class=${'kr-tick' + (i <= shown ? ' on' : '') + (i >= KR_KEY ? ' k' : '')} style=${`left:${(i / 8) * 100}%;--h:${(1 + 1.5 * lift).toFixed(3)}`}></i>`;
      })}
      <span class="kr-car"><span class="kr-thumb"></span><span class="kr-tip" aria-hidden="true">${KR_WORDS[shown]}</span></span>
    </span>
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
  const save = () => {
    const name = p.name.trim();
    if (!name) { toast('Vul een naam in'); return; }
    if (!(p.prefs || []).filter((x) => x !== 'K').length && !(p.main && p.main !== 'K')) { toast('Kies minstens één veldpositie'); return; }
    onSave({ ...p, name, nick: (p.nick || '').trim().slice(0, 8) || nickDefault });
  };
  return html`<${Sheet} onClose=${onClose} label="Speler">
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
      <div class="between small"><span>groeit nog</span><span class=${'keylabel' + (p.kracht >= KEY_KRACHT ? ' on' : '')}>${p.kracht >= KEY_KRACHT ? 'dragende speler ✓' : 'draagt het spel'}</span></div>
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
