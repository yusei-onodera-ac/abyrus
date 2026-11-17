// 本番の Firestore の shopProducts と config/premium を、ゲームと同じ読み方（サインインなし）で **読むだけ** で確かめる。
// 書き込みはしない。ゲームが使えるものと捨てるものを、ゲーム自身の検め方 (systems/RemoteShopConfig.ts) で判定して見せる。
//   node tools/check/remote_shop.mjs [--project <id>]      (project は .env の VITE_FIREBASE_PROJECT_ID が既定)
import { GEM_PRODUCTS, GOLD_PRODUCTS, ITEM_PRODUCTS, PACKS } from '../../src/game/data/shop';
import { applyRemoteShop, parsePremiumConfig, parseShopProduct, resetRemoteShop } from '../../src/game/systems/RemoteShopConfig';

const argv = process.argv.slice(2);
const project = argv.includes('--project') ? argv[argv.indexOf('--project') + 1] : process.env.CHECK_PROJECT_ID ?? '';
if (!project) {
  console.log('project id がない: --project <id> を付けるか、.env の VITE_FIREBASE_PROJECT_ID を読ませる (node tools/check/remote_shop.mjs が読む)');
  process.exit(2);
}

type RestValue = { [k: string]: unknown };
/** Firestore REST の値 ({stringValue: ..} など) を、ふつうの値に戻す。 */
function plain(v: RestValue): unknown {
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (((v.arrayValue as RestValue).values as RestValue[] | undefined) ?? []).map(plain);
  if ('mapValue' in v) return fields((v.mapValue as RestValue).fields as Record<string, RestValue> | undefined);
  return undefined;
}
function fields(f: Record<string, RestValue> | undefined): Record<string, unknown> {
  return Object.fromEntries(Object.entries(f ?? {}).map(([k, v]) => [k, plain(v)]));
}

// (CHECK_BASE_URL is for trying the reader against a fake server)
const BASE = process.env.CHECK_BASE_URL ?? `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(project)}/databases/(default)/documents`;

async function get(path: string): Promise<{ status: number; body: { error?: { message?: string }; documents?: { name: string; fields?: Record<string, RestValue> }[]; fields?: Record<string, RestValue>; nextPageToken?: string } }> {
  const res = await fetch(`${BASE}/${path}`, { method: 'GET' });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as never };
}

const lines: string[] = [];
const say = (s = ''): void => {
  lines.push(s);
  console.log(s);
};
let problems = 0;

say(`プロジェクト: ${project}（サインインなしで読む。ゲームと同じ）`);
say();

// ---- shopProducts
const docs: { id: string; data: unknown }[] = [];
let token = '';
let readable = true;
for (let page = 0; page < 20; page++) {
  const r = await get(`shopProducts?pageSize=300${token ? `&pageToken=${encodeURIComponent(token)}` : ''}`);
  if (r.status !== 200) {
    readable = false;
    say(`shopProducts: 読めない (HTTP ${r.status} ${r.body.error?.message ?? ''})`);
    if (r.status === 403) say('  → ルールが「誰でも読み取り可」になっていない。ゲームは静的データのまま動く。');
    problems++;
    break;
  }
  for (const d of r.body.documents ?? []) docs.push({ id: d.name.split('/').pop() ?? '', data: fields(d.fields) });
  token = r.body.nextPageToken ?? '';
  if (!token) break;
}

if (readable) {
  say(`shopProducts: 読めた。ドキュメント ${docs.length} 件`);
  const groups: Record<string, number> = { pack: 0, gems: 0, gold: 0, item: 0 };
  const dropped: { id: string; data: unknown }[] = [];
  for (const d of docs) {
    const parsed = parseShopProduct(d.id, d.data);
    if (parsed) groups[parsed.group]++;
    else dropped.push(d);
  }
  say(`  使える: pack ${groups.pack} / gems ${groups.gems} / gold ${groups.gold} / item ${groups.item}`);
  if (dropped.length) {
    problems += dropped.length;
    say(`  **ゲームが捨てる: ${dropped.length} 件**（画面に出ない）`);
    for (const d of dropped.slice(0, 20)) say(`    - ${d.id}: ${JSON.stringify(d.data).slice(0, 200)}`);
  }
  const staticIds: Record<string, string[]> = { pack: PACKS.map((p) => p.id), gems: GEM_PRODUCTS.map((p) => p.id), gold: GOLD_PRODUCTS.map((p) => p.id), item: ITEM_PRODUCTS.map((p) => p.id) };
  const remoteIds = new Set(docs.map((d) => d.id));
  for (const [g, ids] of Object.entries(staticIds)) {
    const missing = ids.filter((id) => !remoteIds.has(id));
    if (missing.length && missing.length < ids.length) say(`  ${g}: 静的データにあって、サーバーにない id（そのまま消える）: ${missing.join(', ')}`);
    if (missing.length === ids.length && docs.length > 0) say(`  ${g}: サーバーに1件もない → この売り場は静的データのまま`);
  }
  const known = new Set(Object.values(staticIds).flat());
  const droppedIds = new Set(dropped.map((d) => d.id));
  const added = docs.filter((d) => !known.has(d.id) && !droppedIds.has(d.id)).map((d) => d.id);
  if (added.length) say(`  新しい id（静的データにない）: ${added.join(', ')}`);
  if (docs.length === 0) say('  (空: 管理画面で商品を登録するまで、ゲームは静的データのまま)');
}
say();

// ---- config/premium
const prem = await get('config/premium');
let premiumRaw: unknown = null;
if (prem.status === 200) {
  premiumRaw = fields(prem.body.fields);
  const ok = parsePremiumConfig(premiumRaw);
  const asked = Object.keys(premiumRaw as object);
  say(`config/premium: 読めた。使える項目: ${Object.keys(ok).join(', ') || '(なし)'}`);
  const bad = ['yen', 'durationDays', 'dailyGems', 'battleSpeed', 'idleCapHours', 'joinPack'].filter((k) => asked.includes(k) && !(k in ok));
  if (bad.length) {
    problems += bad.length;
    say(`  **ゲームが捨てる項目: ${bad.join(', ')}**（範囲か形が違う）`);
  }
  const missing = ['yen', 'durationDays', 'dailyGems', 'battleSpeed', 'idleCapHours', 'joinPack'].filter((k) => !asked.includes(k));
  if (missing.length) say(`  無い項目（静的データのまま）: ${missing.join(', ')}`);
} else {
  say(`config/premium: 読めない (HTTP ${prem.status} ${prem.body.error?.message ?? ''})`);
  if (prem.status === 403) say('  → ルールが「誰でも読み取り可」になっていない。ゲームは静的データのまま動く。');
  else if (prem.status === 404) say('  → ドキュメントがない（管理画面でまだ保存していない）。静的データのまま。');
  problems++;
}
say();

// ---- 入れ替えた結果（ゲームの中身）
if (readable || prem.status === 200) {
  const result = applyRemoteShop({ products: docs, premium: premiumRaw });
  say(`ゲームに入る結果: 商品 ${result.products} 件、捨てた ${result.dropped} 件、プレミアム ${result.premium.join(', ') || '(なし)'}`);
  resetRemoteShop();
}
say(problems === 0 ? '→ 問題なし' : `→ 問題 ${problems} 件`);
// (not process.exit: on Windows it can trip a libuv assertion while the fetch connections are still closing)
process.exitCode = problems === 0 ? 0 : 1;
