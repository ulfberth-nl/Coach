// Haalt het programma en de uitslagen op bij de KNHB Match Center en zet ze in data/knhb.json.
// Draait op GitHub (zie .github/workflows/knhb.yml), zodat de app ze van hetzelfde adres kan lezen.
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const API = 'https://publicaties.hockeyweerelt.nl/mc';
const cfg = JSON.parse(await readFile('data/knhb-config.json', 'utf8'));
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

import { execFileSync } from 'node:child_process';
const JAR = '/tmp/knhb-cookies.txt';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';

// curl met een cookie-pot: de server stuurt eerst door om een cookie te zetten
function get(path) {
  const args = ['-sS', '-L', '--max-redirs', '10', '-c', JAR, '-b', JAR, '-A', UA, '-H', 'Accept: application/json', '--compressed', API + path];
  let body;
  try {
    body = execFileSync('curl', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  } catch (e) {
    console.log(execFileSync('curl', ['-sS', '-I', '-L', '--max-redirs', '5', '-A', UA, API + path], { encoding: 'utf8' }).slice(0, 2000));
    throw e;
  }
  let j;
  try { j = JSON.parse(body); } catch (e) {
    console.log('Geen JSON voor ' + path + ':\n' + body.slice(0, 800));
    throw new Error('Geen JSON voor ' + path);
  }
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

const clubs = get('/clubs');
const club = clubs.find((c) => norm(c.name).includes(norm(cfg.club)));
if (!club) throw new Error(`Club "${cfg.club}" niet gevonden (${clubs.length} clubs)`);
const teams = get(`/clubs/${club.id}/teams`);
const out = { updated: new Date().toISOString(), club: { id: club.id, name: club.name, logo: club.logo ?? null }, teams: [] };

for (const want of cfg.teams) {
  const names = (t) => [t.name, t.short_name];
  const t = teams.find((x) => names(x).some((n) => norm(n) === norm(want))) ||
    teams.find((x) => names(x).some((n) => norm(n).endsWith(norm(want)) || norm(n).includes(norm(want))));
  if (!t) {
    out.teams.push({ want, error: 'niet gevonden', options: teams.map((x) => x.name) });
    continue;
  }
  const safe = (p) => { try { return get(p); } catch (e) { console.warn(e.message); return []; } };
  const up = safe(`/teams/${t.id}/matches/upcoming`);
  const done = safe(`/teams/${t.id}/matches/official`);
  out.teams.push({ want, id: t.id, name: t.name, shortName: t.short_name ?? null, type: name(t.type), upcoming: up.map(match), official: done.map(match) });
}

await mkdir('data', { recursive: true });
await writeFile('data/knhb.json', JSON.stringify(out, null, 2) + '\n');
for (const t of out.teams) console.log(t.error ? `${t.want}: ${t.error}` : `${t.name}: ${t.upcoming.length} komend, ${t.official.length} gespeeld`);
