// Preloaded (node --import) before every logic test: the game's clock starts at a fixed day and keeps running from there.
// Why: which characters are in the game depends on the date (src/game/data/heroRelease.ts), so a test that counts heroes (the one ★6 of the
// 特設ガチャ, the 図鑑's total ...) must not start failing on the day a new one comes out. A test that cares about another day sets its own.
const START = Date.parse('2026-11-20T12:00:00+09:00');
const RealDate = Date;
const offset = START - RealDate.now();
class FixedDate extends RealDate {
  constructor(...args) {
    super(...(args.length === 0 ? [RealDate.now() + offset] : args));
  }
  static now() {
    return RealDate.now() + offset;
  }
}
globalThis.Date = FixedDate;
