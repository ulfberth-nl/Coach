import { html, useState } from '../../vendor/preact-htm.js';
import { update, activeTeam, hashPin, uid } from '../store.js';
import { Icon, Sheet, Confirm, Switch, Seg, toast, POS_COLORS, POS_NAMES, KRACHT_BG } from '../ui.js';
import { KEY_KRACHT } from '../planner.js';

const STRENGTHS = ['Snel', 'Overzicht', 'Techniek', 'Inzet', 'Verdedigen', 'Passen', 'Scoren', 'Samenspel', 'Leiderschap', 'Vrolijk'];
let unlockedUntil = 0;

function PinPad({ title, sub, onDone, error }) {
  const [pin, setPin] = useState('');
  const press = (k) => {
    if (k === 'del') { setPin(pin.slice(0, -1)); return; }
    const next = (pin + k).slice(0, 4);
    setPin(next);
    if (next.length === 4) setTimeout(() => { onDone(next); setPin(''); }, 120);
  };
  return html`<div class="col" style="gap:18px;align-items:stretch;padding-top:12px">
    <div class="col" style="align-items:center;gap:4px;text-align:center">
      <${Icon} name="lock" size=${30} />
      <span class="h2" style="font-size:20px">${title}</span>
      ${sub && html`<span class="sub">${sub}</span>`}
    </div>
    <div class="pindots" aria-label=${pin.length + ' van 4 cijfers'}>${[0, 1, 2, 3].map((i) => html`<span class=${i < pin.length ? 'on' : ''}></span>`)}</div>
    ${error && html`<span class="sub" style="text-align:center;color:var(--danger);font-weight:700">${error}</span>`}
    <div class="pinpad">
      ${['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'].map((k) => k === ''
        ? html`<span></span>`
        : html`<button type="button" aria-label=${k === 'del' ? 'Wissen' : k} onClick=${() => press(k)}>${k === 'del' ? '⌫' : k}</button>`)}
    </div>
  </div>`;
}

export function Spelers({ state }) {
  const team = activeTeam(state);
  const [, force] = useState(0);
  const [stage, setStage] = useState(null); // instellen: { first }
  const [error, setError] = useState('');
  const [edit, setEdit] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const unlocked = state.pinHash && Date.now() < unlockedUntil;

  const back = html`<a class="iconbtn" href="#/team" aria-label="Terug"><${Icon} name="back" /></a>`;

  if (!state.pinHash || stage && stage.change) {
    return html`<main class="screen">
      <div class="topbar">${back}<span></span></div>
      <${PinPad} key=${stage && stage.first ? 'b' : 'a'} error=${error}
        title=${stage && stage.first ? 'Herhaal de pincode' : 'Kies een pincode'}
        sub="4 cijfers. Zo zien de kinderen (en anderen) de beoordelingen niet."
        onDone=${async (pin) => {
          if (!stage || !stage.first) { setStage({ ...(stage || {}), first: pin }); setError(''); return; }
          if (pin !== stage.first) { setStage(stage.change ? { change: true } : null); setError('Niet hetzelfde, probeer opnieuw.'); return; }
          const h = await hashPin(pin);
          update((d) => { d.pinHash = h; });
          unlockedUntil = Date.now() + 15 * 60 * 1000;
          setStage(null); setError('');
          toast('Pincode ingesteld');
        }} />
    </main>`;
  }

  if (!unlocked) {
    return html`<main class="screen">
      <div class="topbar">${back}<span></span></div>
      <${PinPad} title="Spelers en beoordeling" sub="Voer de pincode in" error=${error}
        onDone=${async (pin) => {
          const h = await hashPin(pin);
          if (h === state.pinHash) { unlockedUntil = Date.now() + 15 * 60 * 1000; setError(''); force((x) => x + 1); }
          else setError('Onjuiste pincode');
        }} />
      <button type="button" class="link" style="align-self:center" onClick=${() => setConfirm({
        title: 'Pincode vergeten?', text: 'Je kunt een nieuwe pincode kiezen. Dan worden alle beoordelingen en voorkeursposities gewist; namen en wedstrijden blijven.', yes: 'Wissen en nieuwe pincode', danger: true,
        run: () => update((d) => { d.pinHash = null; for (const t of d.teams) for (const p of t.players) { p.kracht = 50; p.prefs = []; p.strengths = []; } })
      })}>Pincode vergeten?</button>
      ${confirm && html`<${Confirm} ...${confirm} onYes=${confirm.run} onClose=${() => setConfirm(null)} />`}
    </main>`;
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
    <button type="button" class="link" style="align-self:center" onClick=${() => { setStage({ change: true }); setError(''); }}>Pincode wijzigen</button>

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

function PlayerEditor({ player, onClose, onSave, onDelete }) {
  const [p, setP] = useState(player);
  const set = (k, v) => setP({ ...p, [k]: v });
  const toggle = (k, v) => set(k, (p[k] || []).indexOf(v) !== -1 ? p[k].filter((x) => x !== v) : (p[k] || []).concat([v]));
  const nickDefault = (p.name || '').trim().split(/\s+/)[0].slice(0, 8);
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
      <input type="range" class="kracht" min="0" max="8" step="1" value=${Math.round(p.kracht / 12.5)} style=${'background:' + KRACHT_BG} aria-label="Speelkracht" onInput=${(e) => set('kracht', Number(e.target.value) * 12.5)} />
      <div class="ticks" aria-hidden="true">${Array.from({ length: 9 }, (_, i) => html`<i class=${i * 12.5 <= p.kracht ? 'on' : ''}></i>`)}</div>
      <div class="between small"><span>groeit nog</span><span class=${'keylabel' + (p.kracht >= KEY_KRACHT ? ' on' : '')}>${p.kracht >= KEY_KRACHT ? 'dragende speler ✓' : 'draagt het spel'}</span></div>
    </div>
    <div class="col">
      <span class="label">Dominante rol</span>
      <${Seg} label="Dominante rol" value=${p.main || ''} onChange=${(v) => set('main', v || null)} options=${[['', 'Geen'], ['K', 'Keeper'], ['A', 'Achter'], ['M', 'Midden'], ['V', 'Voor']]} />
      ${p.main && html`<div class="setting">
        <div class="col" style="gap:1px"><span class="t">App mag afwijken als het moet</span>
          <span class="small">${p.flex !== false ? 'Krijgt voorrang op ' + POS_NAMES[p.main].toLowerCase() + ', maar de app mag schuiven voor de balans.' : (p.main === 'K' ? 'Wordt bij het klaarzetten als keeper voorgesteld.' : 'Staat altijd ' + POS_NAMES[p.main].toLowerCase() + '.')}</span></div>
        <${Switch} label="App mag afwijken" on=${p.flex !== false} onChange=${(v) => set('flex', v)} />
      </div>`}
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
