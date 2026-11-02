import Phaser from 'phaser';
import { createHeroInstance, HERO_ROSTER } from '../game/data/heroes';
import { EQUIP_DEFS, EQUIP_MAX_LEVEL, EQUIP_STAT_LABEL, equipValue, type EquipDef } from '../game/data/equipment';
import { EXP_ITEMS, ITEMS, type ItemId } from '../game/data/items';
import { FERAL_PREFIXES, REGIONS } from '../game/data/regions';
import { formatSkillEffectSummary, getHeroSkillLoadout, MAX_SKILL_LEVEL, SKILL_KIND_LABELS, SKILL_SLOT_UNLOCK_LEVEL } from '../game/data/skills';
import { ENEMY_CLASSES, ProgressionSystem, STAGES_PER_REGION } from '../game/systems/ProgressionSystem';
import { CLASS_LABELS, MAX_LEVEL, MAX_PHASE, type HeroClass, type Rarity } from '../game/types';
import { equipIcon, itemIcon, preloadItemArt, skillEssenceIcon } from '../game/ui/ItemIcons';
import { phaseMaterialIcon } from '../game/ui/Icons';

/**
 * 一覧ページ (catalog.html): every character, enemy, piece of equipment and item the game has now,
 * with its picture, name and numbers - read straight from the game's own data, so it is never out of
 * date. The pictures are the real files where there are any; icons that the game draws in code
 * (equipment, some items) are drawn here by the same code, through a hidden Phaser game.
 */

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const stars = (n: number): string => `<span class="star">${'★'.repeat(n)}</span>`;
const pct = (v: number): string => `${Math.round(v * 1000) / 10}%`;
const attr = (text: string, rarity?: number): string => `data-text="${esc(text.toLowerCase())}"${rarity ? ` data-rarity="${rarity}"` : ''}`;

type Icons = (key: string, size?: number) => string;

/** A picture that says so when its file is missing. */
const picture = (src: string): string => `<img src="${src}" loading="lazy" onerror="this.outerHTML='<span class=miss>画像なし<br>${esc(src.split('/').pop() ?? '')}</span>'" />`;

// ------------------------------------------------------------------ heroes --

function heroesSection(): string {
  const rows = HERO_ROSTER.map((def) => {
    const at = (level: number) => ProgressionSystem.computeHeroStats(createHeroInstance(def.id, `catalog-${def.id}`, level));
    const lo = at(1);
    const hi = at(MAX_LEVEL);
    const skills = getHeroSkillLoadout(def.id)
      .map(
        (s, i) =>
          `<div class="skill"><b>${esc(s.name)}</b> <span class="tag">${esc(SKILL_KIND_LABELS[s.kind])}</span><span class="tag">Lv.${SKILL_SLOT_UNLOCK_LEVEL[i]}で解放</span>` +
          `<small>${esc(s.description)}</small><small>Lv.1：${esc(formatSkillEffectSummary(s, 1))}　→　Lv.${MAX_SKILL_LEVEL}：${esc(formatSkillEffectSummary(s, MAX_SKILL_LEVEL))}</small></div>`,
      )
      .join('');
    return (
      `<tr ${attr(`${def.id} ${def.name} ${CLASS_LABELS[def.heroClass]}`, def.rarity)}>` +
      `<td class="img">${picture(`/assets/characters/${def.id}.png`)}</td>` +
      `<td><b>${esc(def.name)}</b><br><code>${def.id}</code><br>${stars(def.rarity)}<br><span class="tag">${CLASS_LABELS[def.heroClass]}</span></td>` +
      `<td class="num">${lo.maxHp.toString()}<br><small>→ ${hi.maxHp.toString()}</small></td>` +
      `<td class="num">${lo.atk.toString()}<br><small>→ ${hi.atk.toString()}</small></td>` +
      `<td class="num">${lo.def}</td><td class="num">${lo.spd}</td>` +
      `<td class="num">${pct(lo.critRate)}<br><small>×${lo.critMul}</small></td>` +
      `<td>${skills || '<span class="miss">スキルなし</span>'}</td></tr>`
    );
  });
  return (
    `<section id="heroes"><h2>キャラ（${HERO_ROSTER.length}体）</h2>` +
    `<p class="note">HP・攻撃は Lv.1 と、Lv.${MAX_LEVEL} のとき（→）。フェーズ（最大${MAX_PHASE}）・装備なしの値です。防御・素早さ・会心はレベルで変わりません。</p>` +
    `<table><thead><tr><th>画像</th><th>名前 / ID / ★ / 職</th><th>HP</th><th>攻撃</th><th>防御</th><th>素早さ</th><th>会心率 / 倍率</th><th>スキル（解放レベル順）</th></tr></thead><tbody>${rows.join('')}</tbody></table></section>`
  );
}

// ----------------------------------------------------------------- enemies --

function enemiesSection(): string {
  const parts = REGIONS.map((region) => {
    const first = ProgressionSystem.getStage(region.index * STAGES_PER_REGION).difficulty;
    const last = ProgressionSystem.getStage(region.index * STAGES_PER_REGION + STAGES_PER_REGION - 1).difficulty;
    const rarity = (region.index + 1) as Rarity;
    const card = (name: string, art: string | undefined, sub: string): string =>
      `<div class="card" ${attr(`${name} ${art ?? ''} ${region.name}`)}><div class="pic">${art ? picture(`/assets/enemies/${art}.png`) : '<span>画像なし（シルエット）</span>'}</div><b>${esc(name)}</b><br><small>${esc(sub)}</small></div>`;
    const animals = region.feralAnimals.map((a) => card(a.name, a.art, a.art ?? '画像なし')).join('');
    const boss = card(region.bossName, region.bossArt, `ボス / ${CLASS_LABELS[region.bossClass]}`);

    const statRows = ENEMY_CLASSES.map((cls: HeroClass) => {
      const at = (difficulty: number) => ProgressionSystem.computeEnemyStats({ seed: 1, heroClass: cls, rarity, name: '', art: undefined }, difficulty);
      const a = at(first);
      const b = at(last);
      return `<tr><td>${CLASS_LABELS[cls]}</td><td class="num">${a.maxHp.toString()}</td><td class="num">${b.maxHp.toString()}</td><td class="num">${a.atk.toString()}</td><td class="num">${b.atk.toString()}</td><td class="num">${Math.round(a.def * 10) / 10} → ${Math.round(b.def * 10) / 10}</td><td class="num">${Math.round(a.spd * 10) / 10}</td></tr>`;
    }).join('');
    return (
      `<h3>${esc(region.name)}（★${rarity}相当・敵の名前は「${esc(FERAL_PREFIXES.slice(0, 3).join('・'))}…」＋動物名）</h3>` +
      `<div class="grid">${animals}${boss}</div>` +
      `<table style="margin-top:8px"><thead><tr><th>職（ランダム）</th><th>HP 第1層</th><th>HP 第${STAGES_PER_REGION}層</th><th>攻撃 第1層</th><th>攻撃 第${STAGES_PER_REGION}層</th><th>防御</th><th>素早さ</th></tr></thead><tbody>${statRows}</tbody></table>`
    );
  });
  return `<section id="enemies"><h2>敵</h2><p class="note">敵は地方ごとに、動物名の前に形容詞が付いて出ます。強さは、その地方の層（難易度）で上がります。ボスの強さは通常の2.2倍＋防御+6です。</p>${parts.join('')}</section>`;
}

// --------------------------------------------------------------- equipment --

const SLOT_LABEL: Record<string, string> = { weapon: '武器', armor: '防具', accessory: '装飾' };

function equipmentSection(icon: Icons): string {
  const fmt = (def: EquipDef, level: number): string => {
    const v = equipValue(def, level);
    const percent = def.stat === 'atkPct' || def.stat === 'hpPct' || def.stat === 'critRate';
    return `${EQUIP_STAT_LABEL[def.stat]} +${percent ? v.toFixed(1) : Math.round(v)}${percent ? '%' : ''}`;
  };
  const rows = EQUIP_DEFS.map((def) => {
    const max = EQUIP_MAX_LEVEL[def.rarity];
    return (
      `<tr ${attr(`${def.id} ${def.name} ${SLOT_LABEL[def.slot]} ${def.glyph}`, def.rarity)}>` +
      `<td class="icon"><img src="${icon(`equip:${def.glyph}:${def.rarity}`, 64)}" /></td>` +
      `<td><b>${esc(def.name)}</b><br><code>${def.id}</code></td><td>${SLOT_LABEL[def.slot]}</td><td>${stars(def.rarity)}</td>` +
      `<td>${esc(fmt(def, 1))}</td><td>${esc(fmt(def, max))}</td><td class="num">${max}</td></tr>`
    );
  }).join('');
  return (
    `<section id="equipment"><h2>装備（${EQUIP_DEFS.length}個）</h2>` +
    `<p class="note">装備は、絵のファイルがなく、ゲーム内で形から描いています（形は「${[...new Set(EQUIP_DEFS.map((d) => d.glyph))].join('・')}」）。効果はレベルごとに、基本値の10%ずつ増えます。</p>` +
    `<table><thead><tr><th>見た目</th><th>名前 / ID</th><th>部位</th><th>★</th><th>効果 Lv.1</th><th>効果 最大Lv</th><th>最大Lv</th></tr></thead><tbody>${rows}</tbody></table></section>`
  );
}

// ------------------------------------------------------------------- items --

function itemsSection(icon: Icons): string {
  const ids = Object.keys(ITEMS) as ItemId[];
  const order = [...EXP_ITEMS, ...ids.filter((id) => !EXP_ITEMS.includes(id))];
  const itemRows = order.map((id) => {
    const def = ITEMS[id];
    return (
      `<tr ${attr(`${id} ${def.name}`)}><td class="icon"><img src="${icon(`item:${id}`, 64)}" /></td>` +
      `<td><b style="color:${def.color}">${esc(def.name)}</b><br><code>${id}</code></td><td>${esc(def.description)}</td>` +
      `<td class="num">${def.exp ? def.exp.toLocaleString('ja-JP') : '—'}</td></tr>`
    );
  }).join('');
  const goods: [string, string, string, string][] = [
    ['gold', 'ゴールド', '/assets/ui/coin.png', 'キャラ・装備の強化や、ショップの買い物に使うコイン。'],
    ['gems', '魔晶石', '/assets/ui/gem.png', 'ガチャを引く、スタミナを買うなどに使う。課金で手に入る。'],
    ['stamina', 'スタミナ', '/assets/ui/stamina.png', 'クエストに出撃するたびに使う。時間で回復する。'],
    ['phaseMaterials', 'フェーズ素材', `icon:phase`, '使うとキャラのフェーズが1上がる。'],
    ['skillEssence', '技素', `icon:essence`, 'スキルのレベルを上げるのに使う。'],
  ];
  const goodRows = goods
    .map(([id, name, src, desc]) => {
      const img = src.startsWith('icon:') ? `<img src="${icon(src, 64)}" />` : picture(src);
      return `<tr ${attr(`${id} ${name}`)}><td class="icon">${img}</td><td><b>${esc(name)}</b><br><code>${id}</code></td><td>${esc(desc)}</td><td class="num">—</td></tr>`;
    })
    .join('');
  return (
    `<section id="items"><h2>アイテム・通貨</h2>` +
    `<p class="note">経験値素材の絵は <code>public/assets/items/&lt;ID&gt;.png</code>（なければ、ゲーム内で描いた瓶）です。</p>` +
    `<table><thead><tr><th>見た目</th><th>名前 / ID</th><th>説明</th><th>経験値</th></tr></thead><tbody>${itemRows}${goodRows}</tbody></table></section>`
  );
}

// ------------------------------------------------------------------- start --

class CatalogScene extends Phaser.Scene {
  constructor() {
    super('Catalog');
  }

  preload(): void {
    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, () => {});
    preloadItemArt(this);
  }

  create(): void {
    // Each icon is drawn once by the game's own code, then handed to the page as a picture.
    const cache = new Map<string, string>();
    const icon: Icons = (key, size = 64) => {
      const id = `${key}@${size}`;
      let url = cache.get(id);
      if (!url) {
        const [kind, a, b] = key.split(':');
        let textureKey: string;
        if (kind === 'equip') textureKey = equipIcon(this, a as EquipDef['glyph'], Number(b) as Rarity, size);
        else if (kind === 'item') textureKey = itemIcon(this, a as ItemId, size);
        else if (a === 'phase') textureKey = phaseMaterialIcon(this, size);
        else textureKey = skillEssenceIcon(this, size);
        url = this.textures.getBase64(textureKey) as string;
        cache.set(id, url);
      }
      return url;
    };

    const app = document.getElementById('app');
    if (!app) return;
    app.innerHTML = heroesSection() + enemiesSection() + equipmentSection(icon) + itemsSection(icon);

    // Narrowing down: by text, and by ★ (rows and cards that carry one).
    const q = document.getElementById('q') as HTMLInputElement;
    const rar = document.getElementById('rarity') as HTMLSelectElement;
    const apply = (): void => {
      const text = q.value.trim().toLowerCase();
      app.querySelectorAll<HTMLElement>('[data-text]').forEach((el) => {
        const okText = !text || (el.dataset.text ?? '').includes(text);
        const okRarity = !rar.value || !el.dataset.rarity || el.dataset.rarity === rar.value;
        el.classList.toggle('hidden', !(okText && okRarity));
      });
    };
    q.addEventListener('input', apply);
    rar.addEventListener('change', apply);
  }
}

new Phaser.Game({
  type: Phaser.CANVAS,
  width: 64,
  height: 64,
  parent: 'phaser',
  audio: { noAudio: true },
  scene: CatalogScene,
});
