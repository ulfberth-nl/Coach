// Haalt het programma en de uitslagen op bij de KNHB Match Center en zet ze in data/knhb.json.
// Draait op GitHub (zie .github/workflows/knhb.yml), zodat de app ze van hetzelfde adres kan lezen.
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const API = 'https://publicaties.hockeyweerelt.nl/mc';
const cfg = JSON.parse(await readFile('data/knhb-config.json', 'utf8'));
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

async function get(path) {
  const r = await fetch(API + path, { headers: { Accept: 'application/json', 'User-Agent': 'spabo-coach/1.0 (GitHub Actions)' } });
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
  const j = await r.json();
  return Array.isArray(j) ? j : (j.data ?? j);
}

const name = (x) => (x && typeof x === 'object' ? x.name ?? x.title ?? null : x ?? null);
const match = (x) => ({
  id: x.id ?? null,
  datetime: x.datetime ?? x.date ?? null,
  home: name(x.home_team),
  away: name(x.away_team),
  homeScore: x.home_score ?? null,
  awayScore: x.away_score ?? null,
  location: [x.location?.description, x.location?.street, x.location?.city].filter(Boolean).join(', ') || null,
  city: x.location?.city ?? null,
  field: name(x.field),
  status: name(x.status),
  competition: name(x.competition),
  poule: name(x.poule)
});

const clubs = await get('/clubs');
const club = clubs.find((c) => norm(c.name).includes(norm(cfg.club)));
if (!club) throw new Error(`Club "${cfg.club}" niet gevonden (${clubs.length} clubs)`);
const teams = await get(`/clubs/${club.id}/teams`);
const out = { updated: new Date().toISOString(), club: { id: club.id, name: club.name, logo: club.logo ?? null }, teams: [] };

for (const want of cfg.teams) {
  const names = (t) => [t.name, t.short_name];
  const t = teams.find((x) => names(x).some((n) => norm(n) === norm(want))) ||
    teams.find((x) => names(x).some((n) => norm(n).endsWith(norm(want)) || norm(n).includes(norm(want))));
  if (!t) {
    out.teams.push({ want, error: 'niet gevonden', options: teams.map((x) => x.name) });
    continue;
  }
  const [up, done] = await Promise.all([
    get(`/teams/${t.id}/matches/upcoming`).catch((e) => { console.warn(e.message); return []; }),
    get(`/teams/${t.id}/matches/official`).catch((e) => { console.warn(e.message); return []; })
  ]);
  out.teams.push({ want, id: t.id, name: t.name, shortName: t.short_name ?? null, type: name(t.type), upcoming: up.map(match), official: done.map(match) });
}

await mkdir('data', { recursive: true });
await writeFile('data/knhb.json', JSON.stringify(out, null, 2) + '\n');
for (const t of out.teams) console.log(t.error ? `${t.want}: ${t.error}` : `${t.name}: ${t.upcoming.length} komend, ${t.official.length} gespeeld`);
