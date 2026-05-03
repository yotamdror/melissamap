import type { OpenPeriod } from '../types';

export function isOpenNow(periods: OpenPeriod[]): boolean {
  const now = new Date();
  const day = now.getDay();
  const time = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;

  return periods.some(({ day: openDay, open, close }) => {
    const closeDay = close < open ? (openDay + 1) % 7 : openDay;

    if (openDay === day && closeDay === day) {
      return time >= open && time < close;
    }
    // overnight period: check if we're before the close (next day)
    if (closeDay === day && time < close) return true;
    // overnight period: check if we're after the open (today)
    if (openDay === day && time >= open) return true;
    return false;
  });
}
