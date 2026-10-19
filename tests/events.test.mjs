// Pure logic tests for event scheduling. Run with: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { occurrences, upcoming, past, isLive, nextDate, repeatSummary, iso } from '../src/lib/events.ts';

const d = (offset) => { const x = new Date(2026, 9, 12); x.setDate(x.getDate() + offset); return iso(x); }; // 2026-10-12 + n
const NOW = d(0);
const ev = (o) => ({ title: 't', status: 'published', dates: [], ...o });

test('single date in the future is upcoming; in the past is past; today is upcoming', () => {
  assert.equal(upcoming([ev({ dates: [{ date: d(5) }] })], NOW).length, 1);
  assert.equal(past([ev({ dates: [{ date: d(5) }] })], NOW).length, 0);
  assert.equal(upcoming([ev({ dates: [{ date: d(-5) }] })], NOW).length, 0);
  assert.equal(past([ev({ dates: [{ date: d(-5) }] })], NOW).length, 1);
  assert.equal(upcoming([ev({ dates: [{ date: NOW }] })], NOW).length, 1);
});

test('multi-day event stays up until its last day, then is past', () => {
  const e = ev({ dates: [{ date: d(-3) }, { date: d(2) }] });
  assert.equal(upcoming([e], NOW).length, 1);
  assert.equal(upcoming([e], d(3)).length, 0);
  assert.equal(past([e], d(3)).length, 1);
});

test('remove_after keeps an event up and out of "past" until that day; publish_on delays it', () => {
  const kept = ev({ dates: [{ date: d(-1) }], remove_after: d(5) });
  assert.equal(upcoming([kept], NOW).length, 1);
  assert.equal(past([kept], NOW).length, 0);
  assert.equal(upcoming([kept], d(6)).length, 0);
  assert.equal(past([kept], d(6)).length, 1);
  const early = ev({ dates: [{ date: d(9) }], remove_after: d(1) });
  assert.equal(upcoming([early], d(2)).length, 0, 'removed early');
  const later = ev({ dates: [{ date: d(9) }], publish_on: d(3) });
  assert.equal(upcoming([later], NOW).length, 0);
  assert.equal(upcoming([later], d(3)).length, 1);
});

test('drafts and archived never list anywhere; bogus status is treated as draft', () => {
  for (const status of ['draft', 'archived', 'pubished', '', null, undefined]) {
    const e = ev({ status, dates: [{ date: d(5) }] });
    const expected = status === undefined || status === null || status === '' ? 1 : 0; // blank = published (the default)
    assert.equal(upcoming([e], NOW).length, expected, `status=${status}`);
    assert.equal(past([ev({ status, dates: [{ date: d(-5) }] })], NOW).length, expected, `past status=${status}`);
  }
});

test('weekly repeat from an old anchor still produces upcoming dates', () => {
  const e = ev({ dates: [{ date: '2019-01-04' }], repeat: { rule: 'weekly', every: 1 } }); // a Friday
  const next = nextDate(e, NOW);
  assert.ok(next && next >= NOW, `next=${next}`);
  assert.equal(new Date(next + 'T12:00').getDay(), 5, 'still a Friday');
  assert.equal(upcoming([e], NOW).length, 1);
  assert.equal(past([e], NOW).length, 0, 'open-ended repeats are never past');
});

test('every-2-weeks, monthly weekday, monthly date, yearly', () => {
  const biweekly = occurrences(ev({ dates: [{ date: d(-28) }], repeat: { rule: 'weekly', every: 2 } }), NOW).filter((x) => x >= NOW);
  assert.equal(biweekly[0], d(0));
  assert.equal(biweekly[1], d(14));
  const firstFri = ev({ dates: [{ date: '2026-11-06' }], repeat: { rule: 'monthly_weekday' } });
  assert.deepEqual(occurrences(firstFri, NOW).slice(0, 3), ['2026-11-06', '2026-12-04', '2027-01-01']);
  assert.equal(repeatSummary(firstFri), 'The first Friday of every month');
  const the31st = ev({ dates: [{ date: '2026-10-31' }], repeat: { rule: 'monthly_date' } });
  assert.deepEqual(occurrences(the31st, NOW).slice(0, 3), ['2026-10-31', '2026-12-31', '2027-01-31'], 'skips months without a 31st');
  const yearly = ev({ dates: [{ date: '2020-02-29' }], repeat: { rule: 'yearly' } });
  assert.ok(nextDate(yearly, NOW) >= NOW, 'leap-day anchor still yields a next date');
});

test('repeat until, and nonsense values for every/rule', () => {
  const ending = ev({ dates: [{ date: d(-7) }], repeat: { rule: 'weekly', until: d(10) } });
  assert.ok(occurrences(ending, NOW).every((x) => x <= d(10)));
  assert.equal(past([ending], d(11)).length, 1, 'finished repeats become past');
  for (const every of [0, -3, 'abc', null, 1e9]) {
    const e = ev({ dates: [{ date: d(1) }], repeat: { rule: 'weekly', every } });
    assert.ok(nextDate(e, NOW), `every=${every}`);
  }
  const weird = ev({ dates: [{ date: d(1) }], repeat: { rule: 'fortnightly-ish' } });
  assert.equal(nextDate(weird, NOW), d(1), 'unknown rule = does not repeat');
});

test('garbage dates do not throw and are ignored', () => {
  for (const dates of [[], null, undefined, [{}], [{ date: '' }], [{ date: 'yesterday' }], [{ date: '2026-13-45' }], [{ date: null }], 'not a list']) {
    const e = ev({ dates });
    assert.doesNotThrow(() => { upcoming([e], NOW); past([e], NOW); isLive(e, NOW); repeatSummary(e); occurrences(e, NOW); }, `dates=${JSON.stringify(dates)}`);
    assert.equal(upcoming([e], NOW).length, 0, `dates=${JSON.stringify(dates)} should not be listed`);
  }
});

test('custom summary wins over the generated one', () => {
  const e = ev({ dates: [{ date: '2026-11-06' }], repeat: { rule: 'monthly_weekday', summary: 'First Fridays, 7:30 am' } });
  assert.equal(repeatSummary(e), 'First Fridays, 7:30 am');
});

test('a location becomes a Google Maps search link, whatever was typed', async () => {
  const { mapsUrl } = await import('../src/lib/events.ts');
  assert.equal(mapsUrl('Peachtree Road UMC, 3180 Peachtree Rd NE, Atlanta'), 'https://www.google.com/maps/search/?api=1&query=Peachtree%20Road%20UMC%2C%203180%20Peachtree%20Rd%20NE%2C%20Atlanta');
  assert.equal(mapsUrl('  Zoom  \n(online) '), 'https://www.google.com/maps/search/?api=1&query=Zoom%20(online)');
  assert.equal(mapsUrl('<b>x</b>&y'), 'https://www.google.com/maps/search/?api=1&query=%3Cb%3Ex%3C%2Fb%3E%26y');
  for (const bad of [null, undefined, 42, {}]) assert.equal(mapsUrl(bad), 'https://www.google.com/maps/search/?api=1&query=');
});
