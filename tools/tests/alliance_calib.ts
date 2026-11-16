import { LocalAllianceBackend } from '../../src/game/alliance/LocalAllianceBackend';
import { SaveSystem } from '../../src/game/systems/SaveSystem';
(globalThis as unknown as { localStorage: unknown }).localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
const HOUR = 3600e3;
for (const power of [1e3, 1e8, 1e25]) {
  const rows: string[] = [];
  for (let trial = 0; trial < 12; trial++) {
    const save = SaveSystem.createDefault();
    const clock = { t: new Date(2026, 10, 9, 0, 30).getTime() + trial * 1000 };
    const b = new LocalAllianceBackend(() => save, { now: () => clock.t });
    const me = { uid: save.social.playerId + trial, name: 'c', level: 30, power };
    const skip = trial; void skip;
    const list = (await b.search(me, { limit: 40 })) as { ok: true; value: { id: string; joinPolicy: string; memberCount: number; memberMax: number; minPlayerLevel: number }[] };
    const open = list.value.find((a) => a.joinPolicy === 'open' && a.memberCount >= 14 && a.memberCount < a.memberMax && a.minPlayerLevel <= 30);
    if (!open) continue;
    await b.join(me, open.id);
    const end = new Date(2026, 10, 15, 23, 30).getTime();
    while (clock.t + HOUR < end) { clock.t += HOUR; await b.load(me); }
    const d = ((await b.load(me)) as { ok: true; value: any }).value;
    const t = d.war.table;
    rows.push(`hp ${(100 * d.raid.hp / d.raid.maxHp).toFixed(0)}% left, defeated=${d.raid.defeatedAt !== null}, war rank ${d.war.rank}/20 pts ${d.war.points} (leader ${t[0].points}, last ${t[19].points}) members ${d.members.length} lv ${d.summary.level}`);
  }
  console.log(`power ${power}:\n  ` + rows.join('\n  '));
}
