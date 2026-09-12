// Local-calendar-date helpers.
//
// `Date.toISOString()` always converts to UTC first, so
// `new Date().toISOString().slice(0, 10)` gives the *UTC* calendar date, not
// the viewer's local one -- wrong for anywhere with a positive UTC offset
// (e.g. Australia) any time the local clock is past midnight but the UTC
// clock hasn't crossed over yet (a large part of the morning). That showed
// up first as the roster calendar landing opening-time slots on the wrong
// day, but every "today" default and date-range calculation in the app used
// the same pattern. `isoDate` below reads the Date object's local
// year/month/day fields instead, so it always matches the viewer's own
// calendar day.

export function isoDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function todayIsoDate(): string {
  return isoDate(new Date());
}

export function addDaysIso(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return isoDate(d);
}
