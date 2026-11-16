/**
 * Development only: `?date=2027-01-05` (or `?date=2027-01-05T09:30`, local time) starts the game's clock at that moment - it keeps running
 * from there - so the year's calendar (data/schedule.ts) can be looked at on any day: which event is on, which gacha is listed, what the
 * 年間予定 shows. A date alone means noon. It works on the local dev server and on the dev environment (built with VITE_DEV_ENV=1, see
 * deploy/dev/deploy.sh); a real release build ignores it. Called first in main.ts, so every later read of the time sees it.
 */
export function installDevClock(): void {
  if (!import.meta.env.DEV && import.meta.env.VITE_DEV_ENV !== '1') return;
  const raw = new URLSearchParams(location.search).get('date');
  if (!raw) return;
  const target = new Date(raw.length <= 10 ? `${raw}T12:00:00` : raw).getTime();
  if (!Number.isFinite(target)) return;
  const offset = target - Date.now();
  const RealDate = Date;
  class ShiftedDate extends RealDate {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(...args: any[]) {
      super(...((args.length === 0 ? [RealDate.now() + offset] : args) as [number]));
    }

    static now(): number {
      return RealDate.now() + offset;
    }
  }
  (globalThis as { Date: DateConstructor }).Date = ShiftedDate as unknown as DateConstructor;
  console.info(`[dev] the clock starts at ${new Date().toString()}`);
}
