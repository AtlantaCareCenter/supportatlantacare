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

/** The calendar dates an event happens on, in order, out to the horizon. */
export function occurrences(ev: EventData, from = today()): string[] {
  const anchors = (ev.dates ?? []).map((d) => d.date).filter(Boolean).sort();
  const rule = ev.repeat?.rule ?? 'none';
  if (rule === 'none' || !anchors.length) return anchors;
  const every = Math.max(1, Number(ev.repeat?.every) || 1);
  const limit = parse(from); limit.setMonth(limit.getMonth() + HORIZON_MONTHS);
  const until = ev.repeat?.until ? parse(ev.repeat.until) : null;
  const end = until && until < limit ? until : limit;
  const out = new Set<string>();
  for (const a of anchors) {
    const start = parse(a);
    for (let i = 0; i < 400; i++) {
      const d = nth(start, rule, i * every);
      if (!d) continue;
      if (d > end) break;
      out.add(iso(d));
    }
  }
  return [...out].sort();
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

export const isRepeating = (ev: EventData) => (ev.repeat?.rule ?? 'none') !== 'none' && !!ev.dates?.length;
/** Repeats with no end date never become "past". */
export const openEnded = (ev: EventData) => isRepeating(ev) && !ev.repeat?.until;

export function lastDate(ev: EventData): string | undefined {
  const all = occurrences(ev);
  return all[all.length - 1];
}

/** Published, past its go-live date and before its remove-after date. */
export function isLive(ev: EventData, now = today()): boolean {
  if ((ev.status ?? 'published') !== 'published') return false;
  if (ev.publish_on && ev.publish_on > now) return false;
  const removeAfter = ev.remove_after || (openEnded(ev) ? undefined : addDays(lastDate(ev) ?? now, 1));
  if (removeAfter && now > removeAfter) return false;
  return true;
}

export const nextDate = (ev: EventData, now = today()) => occurrences(ev, now).find((d) => d >= now);

/** Events to list as upcoming: live, with a date today or later (or kept on purpose via remove_after). */
export function upcoming(events: EventData[], now = today()): EventData[] {
  return events
    .filter((ev) => isLive(ev, now) && (nextDate(ev, now) || ev.remove_after))
    .sort((a, b) => (nextDate(a, now) ?? lastDate(a) ?? '').localeCompare(nextDate(b, now) ?? lastDate(b) ?? ''));
}

/** Published events whose dates have all passed and that aren't being kept up on purpose.
 *  Drafts and archived events never appear. */
export function past(events: EventData[], now = today()): EventData[] {
  return events
    .filter((ev) => (ev.status ?? 'published') === 'published' && !(ev.publish_on && ev.publish_on > now)
      && !openEnded(ev) && !!lastDate(ev) && lastDate(ev)! < now
      && !(ev.remove_after && now <= ev.remove_after))
    .sort((a, b) => (lastDate(b) ?? '').localeCompare(lastDate(a) ?? ''));
}

const fmtDate = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
export const formatDate = (s: string) => fmtDate.format(parse(s));

export function formatTime(d: EventDate): string {
  if (d.start_time && d.end_time) return `${d.start_time} – ${d.end_time}`;
  return d.start_time || '';
}

/** "First Friday of every month", "Every 2 weeks on Tuesday", ... unless the editor wrote their own. */
export function repeatSummary(ev: EventData): string {
  if (!isRepeating(ev)) return '';
  if (ev.repeat?.summary) return ev.repeat.summary;
  const anchors = ev.dates.map((d) => parse(d.date));
  const every = Math.max(1, Number(ev.repeat?.every) || 1);
  const days = [...new Set(anchors.map((d) => DAY_NAMES[d.getDay()]))].join(' and ');
  let s = '';
  switch (ev.repeat?.rule) {
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
  if (ev.repeat?.until) s += ` until ${formatDate(ev.repeat.until)}`;
  return s;
}

function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/** Time of day for a given calendar date, if the editor entered one. */
export const timeFor = (ev: EventData, date: string) => {
  const exact = ev.dates.find((d) => d.date === date);
  return formatTime(exact ?? ev.dates[0] ?? { date });
};
