// Local leaderboard (Ticket-04). Pure functions, shared by server.js (disk storage + export) and tests.
export const MAX_ENTRIES = 10;
// 3-12 characters: letters (incl. Vietnamese with diacritics), digits, underscore
const NAME_RE = /^[\p{L}\p{N}_]{3,12}$/u;

export function normalizeName(name) {
  return typeof name === 'string' ? name.normalize('NFC').trim() : '';
}
export function validName(name) {
  const n = normalizeName(name);
  return NAME_RE.test(n) && [...n].length >= 3 && [...n].length <= 12;
}

// ISO 8601 with the local time-zone offset, e.g. 2026-11-20T16:05:09+07:00
export function isoWithOffset(date = new Date()) {
  const pad = (n) => String(Math.floor(Math.abs(n))).padStart(2, '0');
  const off = -date.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}${sign}${pad(off / 60)}:${pad(off % 60)}`;
}

export function validEntry(e) {
  return e && validName(e.name) && Number.isInteger(e.score) && e.score >= 0 && Number.isInteger(e.nights_won) &&
    e.nights_won >= 0 && e.nights_won <= 3 && typeof e.achieved_at === 'string' && !Number.isNaN(Date.parse(e.achieved_at)) &&
    Number.isInteger(e.seed);
}

// score desc; equal score -> whoever achieved it first stays above (stable for identical times)
export function sortEntries(entries) {
  return entries
    .map((e, i) => ({ e, i }))
    .sort((a, b) => b.e.score - a.e.score || Date.parse(a.e.achieved_at) - Date.parse(b.e.achieved_at) || a.i - b.i)
    .map((x) => x.e);
}

export function addEntry(entries, entry) {
  if (!validEntry(entry)) throw new Error('invalid leaderboard entry');
  const clean = { name: normalizeName(entry.name), score: entry.score, nights_won: entry.nights_won, achieved_at: entry.achieved_at, seed: entry.seed };
  return sortEntries([...entries, clean]).slice(0, MAX_ENTRIES);
}
