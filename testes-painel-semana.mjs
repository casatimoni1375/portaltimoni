import test from 'node:test';
import assert from 'node:assert/strict';
import { getPanelWeekWindow } from './timoni-portal/lib/panel-week.ts';

for (const [instant, start, end] of [
  ['2026-11-06T12:00:00Z', '2026-11-02', '2026-11-09'],
  ['2026-11-09T02:59:59Z', '2026-11-02', '2026-11-09'],
  ['2026-11-09T03:00:00Z', '2026-11-09', '2026-11-16'],
  ['2027-01-01T12:00:00Z', '2026-12-28', '2027-01-04'],
]) {
  test(`semana local: ${instant}`, () => {
    const window = getPanelWeekWindow(new Date(instant));
    assert.equal(window.timeMin, `${start}T00:00:00-03:00`);
    assert.equal(window.timeMax, `${end}T00:00:00-03:00`);
    assert.equal(window.endExclusive - window.start, 7 * 86400000);
  });
}
