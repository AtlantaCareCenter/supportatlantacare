// Event scheduling: which events are live, when they happen next, and how
// repeating events expand into dates. All dates are plain YYYY-MM-DD strings
// (no times, no time zones) so "today" is simply the local calendar date.

export type EventDate = { date: string; start_time?: string; end_time?: string };
export type Repeat = { rule?: string; every?: number; until?: string; summary?: string };
export type EventData = {
  title: string;
  status?: string;            // draft | published | archived
  publish_on?: string;        // blank = live immediately
  remove_after?: string;      // blank = the day after the last date
  dates: EventDate[];
  repeat?: Repeat;
  location?: string;
  link_label?: string;
  link_url?: string;
  image?: string;
  image_alt?: string;
};

const HORIZON_MONTHS = 18;
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const NTH = ['first', 'second', 'third', 'fourth', 'fifth'];

const pad = (n: number) => String(n).padStart(2, '0');
export const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parse = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const today = () => iso(new Date());
const addDays = (s: string, n: number) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };

/** A real calendar date in YYYY-MM-DD form, or undefined for anything else the editor might have saved. */
export function validDate(v: unknown): string | undefined {
  const s = v instanceof Date ? v.toISOString().slice(0, 10) : typeof v === 'string' ? v.trim().slice(0, 10) : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
  return iso(parse(s)) === s ? s : undefined;   // rejects 2026-13-45
}

/** The event's own dates, cleaned: valid, unique, sorted. */
export function anchors(ev: EventData): string[] {
  const list = Array.isArray(ev.dates) ? ev.dates : [];
  return [...new Set(list.map((d) => validDate(d?.date)).filter((x): x is string => !!x))].sort();
}

const RULES = ['weekly', 'monthly_weekday', 'monthly_date', 'yearly'];
const rule = (ev: EventData) => (RULES.includes(ev.repeat?.rule ?? '') ? ev.repeat!.rule! : 'none');
const every = (ev: EventData) => { const n = Math.floor(Number(ev.repeat?.every)); return n >= 1 && n <= 1000 ? n : 1; };

/** The calendar dates an event happens on, in order, out to the horizon. */
export function occurrences(ev: EventData, from = today()): string[] {
  const starts = anchors(ev);
  const r = rule(ev);
  if (r === 'none' || !starts.length) return starts;
  const step = every(ev);
  const limit = parse(from); limit.setMonth(limit.getMonth() + HORIZON_MONTHS);
  const until = validDate(ev.repeat?.until);
  const end = until && parse(until) < limit ? parse(until) : limit;
  const fromDate = parse(from);
  const out = new Set<string>();
  for (const a of starts) {
    const start = parse(a);
    // skip straight to the repetitions near "from", so an anchor years ago costs nothing
    let i = Math.max(0, Math.floor(periodsBetween(start, fromDate, r) / step) - 2);
    for (let n = 0; n < 200; n++, i++) {
      const d = nth(start, r, i * step);
      if (!d) continue;
      if (d > end) break;
      out.add(iso(d));
    }
  }
  return [...out].sort();
}

/** Roughly how many rule periods lie between two dates (used only to skip ahead). */
function periodsBetween(start: Date, to: Date, r: string): number {
  const months = (to.getFullYear() - start.getFullYear()) * 12 + (to.getMonth() - start.getMonth());
  switch (r) {
    case 'weekly': return Math.floor((to.getTime() - start.getTime()) / (7 * 86400000));
    case 'yearly': return to.getFullYear() - start.getFullYear();
    default: return months;
  }
}

/** The i-th repetition of `start` under `rule` (0 = the anchor itself); null if that month has no such day. */
function nth(start: Date, rule: string, i: number): Date | null {
  const d = new Date(start);
  switch (rule) {
    case 'weekly': d.setDate(d.getDate() + 7 * i); return d;
    case 'monthly_date': {
      const t = new Date(start.getFullYear(), start.getMonth() + i, 1);
      const last = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
      if (start.getDate() > last) return null;
      t.setDate(start.getDate()); return t;
    }
    case 'monthly_weekday': {
      const n = Math.ceil(start.getDate() / 7);           // 1st..5th <weekday> of the month
      const t = new Date(start.getFullYear(), start.getMonth() + i, 1);
      const offset = (start.getDay() - t.getDay() + 7) % 7;
      const day = 1 + offset + 7 * (n - 1);
      if (day > new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate()) return null;
      t.setDate(day); return t;
    }
    case 'yearly': d.setFullYear(d.getFullYear() + i); return d;
    default: return i === 0 ? d : null;
  }
}

export const isRepeating = (ev: EventData) => rule(ev) !== 'none' && anchors(ev).length > 0;
/** Repeats with no end date never become "past". */
export const openEnded = (ev: EventData) => isRepeating(ev) && !validDate(ev.repeat?.until);

/** Published unless the editor said otherwise; anything unexpected is treated as a draft (hidden). */
export function status(ev: EventData): 'draft' | 'published' | 'archived' {
  const s = ev.status;
  if (s === undefined || s === null || s === '' || s === 'published') return 'published';
  return s === 'archived' ? 'archived' : 'draft';
}

export function lastDate(ev: EventData): string | undefined {
  const all = occurrences(ev);
  return all[all.length - 1];
}

/** Published, past its go-live date and before its remove-after date. */
export function isLive(ev: EventData, now = today()): boolean {
  if (status(ev) !== 'published') return false;
  const from = validDate(ev.publish_on);
  if (from && from > now) return false;
  const removeAfter = validDate(ev.remove_after) || (openEnded(ev) ? undefined : addDays(lastDate(ev) ?? now, 1));
  if (removeAfter && now > removeAfter) return false;
  return true;
}

export const nextDate = (ev: EventData, now = today()) => occurrences(ev, now).find((d) => d >= now);

/** Events to list as upcoming: live, with a date today or later (or kept on purpose via remove_after). */
export function upcoming(events: EventData[], now = today()): EventData[] {
  return events
    .filter((ev) => isLive(ev, now) && (nextDate(ev, now) || validDate(ev.remove_after)))
    .sort((a, b) => (nextDate(a, now) ?? lastDate(a) ?? '').localeCompare(nextDate(b, now) ?? lastDate(b) ?? ''));
}

/** Published events whose dates have all passed and that aren't being kept up on purpose.
 *  Drafts and archived events never appear. */
export function past(events: EventData[], now = today()): EventData[] {
  return events
    .filter((ev) => status(ev) === 'published' && !(validDate(ev.publish_on) && validDate(ev.publish_on)! > now)
      && !openEnded(ev) && !!lastDate(ev) && lastDate(ev)! < now
      && !(validDate(ev.remove_after) && now <= validDate(ev.remove_after)!))
    .sort((a, b) => (lastDate(b) ?? '').localeCompare(lastDate(a) ?? ''));
}

const fmtDate = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
export const formatDate = (s: string) => fmtDate.format(parse(s));

export function formatTime(d: EventDate): string {
  const a = String(d.start_time ?? '').trim(), b = String(d.end_time ?? '').trim();
  if (a && b) return `${a} – ${b}`;
  return a || b;
}

/** "First Friday of every month", "Every 2 weeks on Tuesday", ... unless the editor wrote their own. */
export function repeatSummary(ev: EventData): string {
  if (!isRepeating(ev)) return '';
  if (ev.repeat?.summary) return String(ev.repeat.summary);
  const anchors = anchorDates(ev);
  const every = everyOf(ev);
  const days = [...new Set(anchors.map((d) => DAY_NAMES[d.getDay()]))].join(' and ');
  let s = '';
  switch (rule(ev)) {
    case 'weekly': s = every === 1 ? `Every ${days}` : `Every ${every} weeks on ${days}`; break;
    case 'monthly_weekday': {
      const parts = anchors.map((d) => `${NTH[Math.ceil(d.getDate() / 7) - 1]} ${DAY_NAMES[d.getDay()]}`);
      const which = [...new Set(parts)].join(' and ');
      s = (every === 1 ? `The ${which} of every month` : `The ${which} every ${every} months`);
      s = s.charAt(0).toUpperCase() + s.slice(1); break;
    }
    case 'monthly_date': {
      const nums = [...new Set(anchors.map((d) => ordinal(d.getDate())))].join(' and ');
      s = every === 1 ? `The ${nums} of every month` : `The ${nums} every ${every} months`; break;
    }
    case 'yearly': {
      const when = [...new Set(anchors.map((d) => d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })))].join(' and ');
      s = every === 1 ? `Every year on ${when}` : `Every ${every} years on ${when}`; break;
    }
  }
  const until = validDate(ev.repeat?.until);
  if (until) s += ` until ${formatDate(until)}`;
  return s;
}
const anchorDates = (ev: EventData) => anchors(ev).map(parse);
const everyOf = every;

function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/** Time of day for a given calendar date, if the editor entered one. */
export const timeFor = (ev: EventData, date: string) => {
  const list = Array.isArray(ev.dates) ? ev.dates.filter((d) => d && typeof d === 'object') : [];
  const exact = list.find((d) => validDate(d.date) === date);
  return formatTime(exact ?? list[0] ?? { date });
};

/** A Google Maps search link for whatever the editor typed as the location (a venue name, an address, or both). */
export function mapsUrl(location: unknown): string {
  const q = typeof location === 'string' ? location.replace(/\s+/g, ' ').trim() : '';
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}
