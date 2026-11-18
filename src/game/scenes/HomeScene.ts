import Phaser from 'phaser';
import { SaveSystem, type SaveData } from '../systems/SaveSystem';
import { IdleSystem } from '../systems/IdleSystem';
import { LoginBonusSystem } from '../systems/LoginBonusSystem';
import { touchEventLogin } from '../systems/EventProgress';
import { TutorialSystem } from '../systems/TutorialSystem';
import { showRewardModal } from '../ui/RewardModal';
import { tilesForGranted, tilesForIdleClaim } from '../ui/RewardTiles';
import { ChatSystem, GLOBAL_CHANNEL, plainPreview } from '../systems/ChatSystem';
import { clipboardIcon, expeditionIcon, hourglassIcon, supplyIcon, villageIcon } from '../ui/ItemIcons';
import { SupplySystem } from '../systems/SupplySystem';
import { openSupplyModal } from '../ui/SupplyModal';
import { VillageGoals } from '../systems/VillageGoals';
import { ExpeditionSystem } from '../systems/ExpeditionSystem';
import { VillageSystem } from '../systems/VillageSystem';
import { MissionSystem } from '../systems/MissionSystem';
import { stopAutoAdvance } from '../ui/AutoAdvanceToggle';
import { getMissionGroup } from '../data/missions';
import { homeLinesFor } from '../data/homeLines';
import { VoiceSystem } from '../systems/VoiceSystem';
import { wrapToWidth } from '../ui/CardParts';
import { InboxSystem } from '../systems/InboxSystem';
import { ResourceBar } from '../ui/ResourceBar';
import { IconNavButton } from '../ui/IconNavButton';
import { CharacterGenerator } from '../characters/CharacterGenerator';
import { pinnedHeroIds, queueHeroArt, trimHeroArt } from '../characters/HeroArt';
import { applyBackground } from '../ui/Background';
import { questIcon, gachaIcon, rosterIcon, notificationIcon, giftBoxIcon, mailIcon, friendIcon, settingsIcon } from '../ui/Icons';
import { Button } from '../ui/Button';
import { formatAgo } from '../ui/format';
import { createPanel, type PanelOptions } from '../ui/Panel';
import { addGoodIcon } from '../ui/RewardIcon';
import { body, caption, CHROME } from '../ui/theme';
import { enter, enterStagger, popIn } from '../ui/Transitions';
import { BottomNavBar } from '../ui/BottomNavBar';
import { buildBannerCarousel } from '../ui/BannerCarousel';
import { getHomeBanners } from '../data/banners';
import { RARITY_COLORS, type HeroData } from '../types';
import { t as tl } from '../i18n';

/** Character-first home hub: a big asymmetric portrait of the player's best
 *  hero layered over the background, with a round icon-cluster nav
 *  underneath instead of a stage-select grid (that lives in
 *  StageSelectScene now) or a stack of long rectangle menu buttons. */
/** Promo banner frame, top-left under the resource bar. The quest/roster
 *  diamonds line their left edge up with this one's. */
const BANNER = { x: 28, y: 138, w: 336, h: 188 };

/** One of the round icon buttons in the right-hand column (see buildCornerButtons). */
interface CornerItem {
  texture: string;
  open: () => void;
  /** The red dot, for a button whose state is known when Home is built. */
  unread: boolean;
  /** The red dot, for one that changes by itself (asked now and every second after); wins over `unread`. */
  watch?: (now: number) => boolean;
}

/** The look the Home info boxes share (放置報酬 / ミッション / メッセージ): dark navy glass with a lilac rim, like the round icon buttons. */
const HOME_PANEL: PanelOptions = { fillColor: 0x1d2034, fillAlpha: 0.9, borderColor: 0x8f8bb3, glowColor: 0x6f6a96, radius: 20, gradient: false };
const HOME_RIM = 0x8f8bb3;
const HOME_TITLE = '#b7b2da';
const HOME_INK = '#0e1020';
/** Heights of 放置報酬 and ミッション (stacked under the promo banner, 8px apart). */
const IDLE_H = 104;
const MISSION_H = 86;

/** The eight round icon buttons (see buildCornerButtons) hug the right edge: the right column's centre, and how far the left one is from it. */
const CORNER_X = 666;
const CORNER_COL_STEP = 80;

/** Where the Home hero's speech bubble sits: centred over the head (clear of the icon buttons), its lower edge here. */
const BUBBLE_X = 438;
const BUBBLE_W = 208;
const BUBBLE_BOTTOM = 262;

export class HomeScene extends Phaser.Scene {
  private resourceBar!: ResourceBar;

  constructor() {
    super('Home');
  }

  /** The Home hero's big illustration (and the party's); any other that was loaded is let go of - see characters/HeroArt.ts. */
  preload(): void {
    const keep = pinnedHeroIds(this.getSave());
    trimHeroArt(this, keep);
    queueHeroArt(this, keep);
  }

  create(): void {
    const save = this.getSave();
    stopAutoAdvance(this.game);
    // Hand over any gifts/mails the operator has added since the last visit.
    if (InboxSystem.deliver(save)) SaveSystem.save(save);
    // Coming in counts as a day of the login mission of the 期間限定イベント that is on.
    touchEventLogin(save);
    this.cameras.main.setBackgroundColor('#10121c');
    applyBackground(this, 'home');

    this.resourceBar = new ResourceBar(this, 0, 0, 720);
    this.resourceBar.update(save);
    enter(this, this.resourceBar, { dy: -20, duration: 300 });

    // The topbar artwork already has its own "ABYRUS" lettering baked in;
    // only draw this standalone wordmark while running on the plain-panel
    // fallback, so the title isn't duplicated once real art is loaded.
    if (!this.resourceBar.hasArt) {
      const wordmark = caption(this, 24, 86, 'ABYRUS', { fontSize: '15px', color: '#9a93b8', fontStyle: 'bold' }).setOrigin(0, 0.5);
      enter(this, wordmark, { dx: -10, dy: 0, duration: 280, delay: 80 });
    }

    this.buildCharacterShowcase(save);
    this.buildNav();
    this.buildCornerButtons(save);
    this.buildBanners();
    this.buildIdleBox(save);
    this.buildMissionBox(save);
    this.buildMessageWidget(save);
    new BottomNavBar(this, 720, 1280, 'home');
    this.maybeClaimLoginBonus(save);
  }

  private getSave(): SaveData {
    return this.game.registry.get('save');
  }

  private buildCharacterShowcase(save: SaveData): void {
    const hero = SaveSystem.getHomeHero(save);
    if (!hero) return;

    // Driven by target HEIGHT, not a width x height bounding box: the
    // reference composition has the hero filling nearly the full screen
    // height (hair near the top, boots near the bottom), right-of-center.
    // A box-fit (min of two ratios) tends to under-fill on one axis
    // whenever the source art's aspect doesn't exactly match the box's,
    // which is what made an earlier version look small.
    const cx = 460;
    const cy = 600;
    let portrait: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite;

    if (hero.heroId && this.textures.exists(hero.heroId)) {
      // floorY sits above the bottom nav bar, not the screen edge, so the
      // portrait's feet don't land behind it. Measured from the bar itself
      // rather than hardcoded, so it stays correct if that art changes.
      const floorY = 1280 - BottomNavBar.totalHeight() + 6;
      const targetHeight = 960;
      const portraitCy = floorY - targetHeight / 2;
      const shadow = this.add.ellipse(cx, floorY, targetHeight * 0.4, 42, 0x000000, 0.35);
      shadow.setDepth(-1);

      const frame = this.textures.get(hero.heroId).getSourceImage();
      const scale = targetHeight / frame.height;
      portrait = this.add.image(cx, portraitCy, hero.heroId).setScale(scale);
    } else {
      // The procedural portrait is baked at a small, fixed resolution for
      // card-sized use elsewhere (HeroCard, gacha reveals): stretching it to
      // fill a showcase-sized frame just blows up a blurry blob. Cap it to a
      // modest medallion size instead, with its own soft glow backdrop, so a
      // hero without illustrated art still reads as a deliberate placeholder
      // rather than a broken giant sprite.
      const shadow = this.add.ellipse(cx, cy + 103, 330, 42, 0x000000, 0.35);
      shadow.setDepth(-1);

      const medallionSize = 220;
      const glow = this.add.graphics();
      const glowColor = RARITY_COLORS[hero.rarity];
      for (let i = 3; i > 0; i--) {
        glow.fillStyle(glowColor, 0.05 + i * 0.04);
        glow.fillCircle(cx, cy, medallionSize * 0.5 + i * 14);
      }
      const generator = new CharacterGenerator(this);
      const { textureKey } = generator.generate(hero.seed, hero.heroClass, hero.rarity, hero.heroId);
      portrait = this.add.sprite(cx, cy, textureKey).setDisplaySize(medallionSize, medallionSize);
    }

    enter(this, portrait, { dy: 26, duration: 480, ease: 'Cubic.easeOut' });
    this.floatIdle(portrait);

    // Tapping the character: a hop, a line in a speech bubble and (if supplied) their voice.
    const zone = this.add.zone(cx, 590, 400, 860).setOrigin(0.5);
    zone.setInteractive({ useHandCursor: true });
    zone.on('pointerup', () => this.talk(save, hero, portrait));
  }

  private lastLine = -1;
  private bubble?: Phaser.GameObjects.Container;
  private bubbleTimer?: Phaser.Time.TimerEvent;

  /** A line from the Home hero (never the same twice in a row), in a bubble that fades after a few seconds. */
  private talk(save: SaveData, hero: HeroData, portrait: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite): void {
    const lines = homeLinesFor(hero.heroId, hero.heroClass);
    let index = Math.floor(Math.random() * lines.length);
    if (lines.length > 1 && index === this.lastLine) index = (index + 1) % lines.length;
    this.lastLine = index;
    const line = lines[index];

    this.tweens.add({ targets: portrait, scaleX: portrait.scaleX * 1.025, scaleY: portrait.scaleY * 1.025, duration: 90, yoyo: true, ease: 'Sine.easeOut' });
    VoiceSystem.play(save, line.voice);

    this.bubble?.destroy();
    this.bubbleTimer?.remove();
    // Above the character's head (the free space between the banner and the corner buttons),
    // growing upward, so it never covers the face.
    const w = BUBBLE_W;
    const text = body(this, 0, 0, wrapToWidth(line.text, w - 36, 22, 4, 'bold'), { fontSize: '22px', fontStyle: 'bold', color: '#fff4dc', stroke: '#1c130a', strokeThickness: 4, lineSpacing: 7 }).setOrigin(0.5);
    const nameText = caption(this, 0, 0, hero.name, { fontSize: '17px', fontStyle: 'bold', color: '#ffd9a0', stroke: '#1c130a', strokeThickness: 3 }).setOrigin(0.5);
    const h = text.height + 54;
    const bottom = Math.max(BUBBLE_BOTTOM, 134 + h);
    const box = this.add.container(BUBBLE_X, bottom - h / 2).setDepth(20);
    box.add(createPanel(this, 0, 0, w, h, { fillColor: CHROME.woodFill, fillAlpha: 0.97, borderColor: CHROME.brass, glowColor: CHROME.brassBright, radius: 18, gradient: false }));
    // A tail toward the character.
    const tail = this.add.graphics();
    tail.fillStyle(CHROME.woodFill, 1);
    tail.lineStyle(3, CHROME.brass, 1);
    tail.fillTriangle(-24, h / 2 - 2, 24, h / 2 - 2, 0, h / 2 + 26);
    tail.beginPath();
    tail.moveTo(-24, h / 2);
    tail.lineTo(0, h / 2 + 26);
    tail.lineTo(24, h / 2);
    tail.strokePath();
    box.add(tail);
    nameText.setPosition(0, -h / 2 + 22);
    text.setPosition(0, 10);
    box.add([nameText, text]);
    this.bubble = box;
    popIn(this, box, { duration: 220 });
    this.bubbleTimer = this.time.delayedCall(4200, () => {
      this.tweens.add({ targets: box, alpha: 0, duration: 260, onComplete: () => box.destroy() });
    });
  }

  /** Gentle drifting bob so the showcase hero reads as hovering rather than
   *  pasted on flat. Two independent yoyo tweens at different periods, so
   *  the vertical and horizontal drift fall out of phase instead of
   *  tracing a perfectly repeating diagonal line. */
  private floatIdle(target: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite): void {
    this.tweens.add({ targets: target, y: target.y - 26, duration: 2600, delay: 400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.tweens.add({ targets: target, x: target.x + 16, duration: 3400, delay: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  /** Cascading diamond cluster in the lower-left, overlapping the bottom of
   *  the character showcase. Quest (biggest) sits directly above roster on
   *  a shared centerline; gacha (mid-sized) offsets to the right, bridging
   *  the two with diagonal overlap on both sides. */
  private buildNav(): void {
    // clusterX is set so the diamond's left-most point (clusterX - size/2)
    // lines up with the banner's own left edge.
    const size = 300;
    const clusterX = BANNER.x + size / 2;
    const quest = new IconNavButton(this, clusterX, 655, 'quest', questIcon(this, 90), tl('home.quest'), size, () => this.scene.start('StageSelect'));
    const gacha = new IconNavButton(this, 400, 810, 'gacha', gachaIcon(this, 90), tl('home.summon'), size, () => this.scene.start('Gacha'));
    const roster = new IconNavButton(this, clusterX, 970, 'roster', rosterIcon(this, 90), tl('home.collection'), size, () => this.scene.start('Roster'));
    enterStagger(this, [quest, gacha, roster], { dy: 24, duration: 320, delay: 150, stagger: 60 });
  }

  /** The promo banner in the top-left corner, under the resource bar - gacha
   *  pushes, event announcements, limited packs. One banner shows at a time;
   *  swipe or wait 3 seconds for the next. Pure content: see data/banners.ts to
   *  add/swap one without touching this scene. */
  private buildBanners(): void {
    const carousel = buildBannerCarousel(this, BANNER.x, BANNER.y, getHomeBanners(), BANNER.w, BANNER.h);
    // Fade only: the carousel clips to a fixed on-screen frame, so it can't slide in.
    enter(this, carousel, { dx: 0, dy: 0, duration: 400, delay: 220 });
  }

  /** Eight round icon buttons of one size, two across and four down at the top right, under the resource bar. The right column:
   *  お知らせ / プレゼントBOX / メール / フレンド; the left one: 遠征 / 村 / 朝夕の補給 / 設定. Each opens its screen, and the red dot
   *  shows while that one has something waiting (unread notice, claimable gift, unread mail, a friend's request, an expedition back,
   *  a village to see to, a supply to take). */
  private buildCornerButtons(save: SaveData): void {
    const size = 72;
    const rowStep = 88;
    const startY = 176;
    const unread = InboxSystem.getUnread(save);
    const go = (key: string, data?: object) => () => this.scene.start(key, data);
    const right: CornerItem[] = [
      { texture: notificationIcon(this, size), open: go('Notice'), unread: unread.notification },
      { texture: giftBoxIcon(this, size), open: go('Gift'), unread: unread.giftBox },
      { texture: mailIcon(this, size), open: go('Mail'), unread: unread.mail },
      { texture: friendIcon(this, size), open: go('Friend'), unread: save.social.incoming.length > 0 },
    ];
    const left: CornerItem[] = [
      // 遠征: someone is back. (The data is always given: starting a scene without any would hand it the last screen's - see ExpeditionScene.init.)
      { texture: expeditionIcon(this, size), open: go('Expedition', { view: 'board' }), unread: false, watch: (now) => ExpeditionSystem.readyCount(save, now) > 0 },
      // 村: a 襲撃, broken buildings, 依頼 / 村の目標 to collect, 行商人 / 宝箱 on the map, or something that can be built.
      {
        texture: villageIcon(this, size),
        open: go('Village'),
        unread: false,
        watch: (now) => {
          // Brings the village up to date first, so a 襲撃 that has come (or gone) shows here without opening it.
          VillageSystem.settle(save, now);
          const need = VillageSystem.attention(save, now);
          return need.raid || need.broken > 0 || need.quests > 0 || VillageGoals.claimable(save, now).length > 0 || need.wanderers > 0 || VillageSystem.hasJob(save, now);
        },
      },
      // 朝夕の補給: a slot that can be taken now. Opens the list to take them from.
      { texture: supplyIcon(this, size), open: () => openSupplyModal(this, save, () => this.resourceBar.update(save)), unread: false, watch: (now) => SupplySystem.openCount(save, now) > 0 },
      { texture: settingsIcon(this, size), open: go('Settings'), unread: false },
    ];
    const buttons = [
      ...right.map((item, i) => this.buildCornerButton(CORNER_X, startY + i * rowStep, size, item)),
      ...left.map((item, i) => this.buildCornerButton(CORNER_X - CORNER_COL_STEP, startY + i * rowStep, size, item)),
    ];
    enterStagger(this, buttons, { dx: 18, dy: 0, duration: 280, delay: 220, stagger: 70 });
  }

  /** ログインボーナス is handed over the moment Home is first shown on a new day - there is
   *  nothing to tap to get it, but what came is shown, with a 確認 button. While the
   *  チュートリアル is still going it waits (its lit spots could not be pressed through the
   *  popup), and comes on the first Home after. お知らせ has the calendar of what each day gives. */
  private maybeClaimLoginBonus(save: SaveData): void {
    if (TutorialSystem.current(save)) return;
    if (!LoginBonusSystem.canClaim(save)) return;
    const granted = LoginBonusSystem.claim(save);
    if (!granted) return;
    SaveSystem.save(save);
    this.resourceBar.update(save);
    showRewardModal(this, { setEnabled: () => {} }, { title: tl('home.loginBonus'), tiles: tilesForGranted([granted]), note: tl('home.dayReward', { dayOfMonth: LoginBonusSystem.dayOfMonth() }) });
  }

  /** 放置報酬, pinned just under the promo banner: how long has piled up (with a
   *  bar towards the cap) and a 受け取る button, so cashing in doesn't need a
   *  trip to the Idle screen. The rest of the box opens that screen (ad boost,
   *  the full list of what has piled up). */
  private buildIdleBox(save: SaveData): void {
    const x = BANNER.x;
    const y = BANNER.y + BANNER.h + 12;
    const w = BANNER.w;
    const h = IDLE_H;
    const box = this.add.container(x, y);
    box.add(createPanel(this, w / 2, h / 2, w, h, HOME_PANEL));

    const preview = IdleSystem.preview(save);
    const claimable = preview.hours >= 1 / 60;
    box.add(this.add.image(40, 46, hourglassIcon(this, 56)).setDisplaySize(56, 56));
    box.add(caption(this, 80, 19, tl('home.idleRewards'), { fontSize: '17px', fontStyle: 'bold', color: HOME_TITLE, stroke: HOME_INK, strokeThickness: 3 }).setOrigin(0, 0.5));

    // How long has piled up: the numbers big, 時間 and 分 small.
    const total = Math.floor(preview.hours * 60);
    const numberColor = preview.full ? '#ffd23f' : '#ffffff';
    let tx = 80;
    const parts: [string, boolean][] = [[String(Math.floor(total / 60)), true], [tl('home.units.hour'), false], [String(total % 60).padStart(2, '0'), true], [tl('home.units.minute'), false]];
    for (const [text, big] of parts) {
      const t = body(this, tx, big ? 55 : 60, text, big ? { fontSize: '32px', fontStyle: 'bold', color: numberColor, stroke: HOME_INK, strokeThickness: 5 } : { fontSize: '17px', fontStyle: 'bold', color: '#cfcbe8', stroke: HOME_INK, strokeThickness: 3 }).setOrigin(0, 0.5);
      box.add(t);
      tx += t.width + (big ? 3 : 8);
    }

    // How full it is, as a bar along the bottom of the box.
    const barX = 20;
    const barW = w - 40;
    const barY = h - 20;
    const bar = this.add.graphics();
    bar.fillStyle(0x0e1020, 1);
    bar.fillRoundedRect(barX, barY, barW, 10, 5);
    bar.fillStyle(preview.full ? 0xffd23f : 0xf2a33a, 1);
    bar.fillRoundedRect(barX, barY, Math.max(10, barW * Math.min(1, preview.hours / preview.capHours)), 10, 5);
    bar.lineStyle(1.5, HOME_RIM, 1);
    bar.strokeRoundedRect(barX, barY, barW, 10, 5);
    box.add(bar);

    // Tapping the box itself opens the full screen; the button on top claims.
    const hit = this.add.zone(w / 2, h / 2, w, h).setOrigin(0.5);
    hit.setInteractive({ useHandCursor: true });
    hit.on('pointerup', () => this.scene.start('Idle'));
    box.add(hit);

    // What the gold is worth, small, above the button (only when there is some).
    if (claimable) {
      const gold = body(this, w - 20, 19, `+${preview.gold.toString()}`, { fontSize: '17px', fontStyle: 'bold', color: '#ffe79a', stroke: HOME_INK, strokeThickness: 3 }).setOrigin(1, 0.5);
      box.add(gold);
      box.add(addGoodIcon(this, 'gold', gold.x - gold.width - 14, 19, 22));
    }
    const claim = new Button(this, w - 62, 56, 98, 50, tl('common.claim'), () => this.claimIdle(save, box), { variant: claimable ? 'gold' : 'wood', fontSize: '20px' });
    claim.setEnabled(claimable);
    box.add(claim);

    enter(this, box, { dy: 10, duration: 320, delay: 260 });
  }

  /** ミッション, just under 放置報酬: how far along デイリー / ウィークリー / 実績 are (done / total),
   *  with a red dot while something can be taken. Tapping it opens the list that has a reward
   *  waiting (the daily one otherwise). */
  private buildMissionBox(save: SaveData): void {
    const x = BANNER.x;
    const y = BANNER.y + BANNER.h + 12 + IDLE_H + 8;
    const w = BANNER.w;
    const h = MISSION_H;
    const box = this.add.container(x, y);
    box.add(createPanel(this, w / 2, h / 2, w, h, HOME_PANEL));

    const summary = MissionSystem.summary(save);
    const waiting = summary.find((g) => g.claimable > 0 || MissionSystem.bonusClaimable(save, g.group));
    box.add(this.add.image(40, h / 2, clipboardIcon(this, 56)).setDisplaySize(56, 56));
    if (MissionSystem.hasReward(save)) {
      const dot = this.add.graphics();
      dot.fillStyle(0x1b1d29, 1);
      dot.fillCircle(62, 18, 10);
      dot.fillStyle(0xff4d4d, 1);
      dot.fillCircle(62, 18, 8);
      box.add(dot);
    }
    box.add(caption(this, 84, 19, tl('home.missions'), { fontSize: '17px', fontStyle: 'bold', color: HOME_TITLE, stroke: HOME_INK, strokeThickness: 3 }).setOrigin(0, 0.5));
    // done / total of デイリー, ウィークリー and 実績: the label small, the numbers big (gold while one can be taken).
    const columns = [84, 158, 266];
    summary.forEach((g, i) => {
      const cx = columns[i];
      const ready = g.claimable > 0;
      box.add(caption(this, cx, 43, getMissionGroup(g.group).short, { fontSize: '15px', color: '#b7b2da', stroke: HOME_INK, strokeThickness: 3 }).setOrigin(0, 0.5));
      box.add(body(this, cx, 66, `${g.done}/${g.total}`, { fontSize: '25px', fontStyle: 'bold', color: ready ? '#ffd23f' : '#ffffff', stroke: HOME_INK, strokeThickness: 4 }).setOrigin(0, 0.5));
    });

    const hit = this.add.zone(w / 2, h / 2, w, h).setOrigin(0.5);
    hit.setInteractive({ useHandCursor: true });
    hit.on('pointerup', () => this.scene.start('Mission', { group: waiting?.group ?? 'daily' }));
    box.add(hit);

    enter(this, box, { dy: 10, duration: 320, delay: 280 });
  }

  /** Claims whatever 放置報酬 has piled up and rebuilds the box in place. */
  private claimIdle(save: SaveData, box: Phaser.GameObjects.Container): void {
    const result = IdleSystem.claim(save);
    SaveSystem.save(save);
    this.resourceBar.update(save);
    showRewardModal(this, { setEnabled: () => {} }, { title: tl('home.idleRewardsClaimed'), tiles: tilesForIdleClaim(result.preview, result.equipment) });
    // Rebuilt after this tap has finished: the button being replaced is still handling it.
    this.time.delayedCall(0, () => {
      box.destroy();
      this.buildIdleBox(save);
    });
  }

  /** The latest メッセージ (across 全体 / 軍団 / フレンド), bottom-right and always
   *  there: who said it, how long ago, and as much of the line as fits. Tapping
   *  it opens that conversation. Rebuilt every time Home loads. */
  private buildMessageWidget(save: SaveData): void {
    const w = 410;
    const h = 130;
    const x = 720 - 14 - w;
    const y = 1280 - BottomNavBar.totalHeight() - 12 - h;
    const box = this.add.container(x, y).setDepth(5);
    box.add(createPanel(this, w / 2, h / 2, w, h, HOME_PANEL));

    const latest = ChatSystem.latestMessage(save);
    const textX = 26;
    const textW = w - textX - 18;
    box.add(caption(this, textX, 24, tl('home.messages'), { fontSize: '19px', fontStyle: 'bold', color: HOME_TITLE, stroke: HOME_INK, strokeThickness: 3 }).setOrigin(0, 0.5));

    if (latest) {
      box.add(caption(this, w - 18, 24, formatAgo(latest.sentAt), { fontSize: '17px', color: '#9a96c0', stroke: HOME_INK, strokeThickness: 3 }).setOrigin(1, 0.5));
      box.add(this.fitted(body(this, textX, 62, latest.senderName, { fontSize: '25px', fontStyle: 'bold', color: '#ffffff', stroke: HOME_INK, strokeThickness: 4 }).setOrigin(0, 0.5), textW));
      box.add(this.fitted(caption(this, textX, 98, plainPreview(latest.text), { fontSize: '22px', color: '#e6e3f4', stroke: HOME_INK, strokeThickness: 3 }).setOrigin(0, 0.5), textW));
    } else {
      box.add(caption(this, textX, 76, tl('home.noMessagesYet'), { fontSize: '22px', color: '#9a96c0' }).setOrigin(0, 0.5));
    }

    const hit = this.add.zone(w / 2, h / 2, w, h).setOrigin(0.5);
    hit.setInteractive({ useHandCursor: true });
    hit.on('pointerup', () => this.openLatestMessage(latest));
    box.add(hit);

    enter(this, box, { dy: 10, duration: 320, delay: 300 });
  }

  /** Cuts a line of text down with … until it fits `maxWidth` px (Japanese has no spaces to wrap at). */
  private fitted(text: Phaser.GameObjects.Text, maxWidth: number): Phaser.GameObjects.Text {
    const full = Array.from(text.text);
    let keep = full.length;
    while (text.width > maxWidth && keep > 1) {
      keep -= 1;
      text.setText(full.slice(0, keep).join('') + '…');
    }
    return text;
  }

  private openLatestMessage(latest: ReturnType<typeof ChatSystem.latestMessage>): void {
    if (!latest || latest.channel === GLOBAL_CHANNEL) {
      this.scene.start('Message', { tab: 'global' });
    } else if (latest.channel.startsWith('dm:')) {
      this.scene.start('Message', { tab: 'friends', friendId: latest.channel.slice(3) });
    } else if (latest.channel.startsWith('group:')) {
      this.scene.start('Message', { tab: 'groups', groupId: latest.channel.slice(6) });
    } else {
      this.scene.start('Message');
    }
  }

  /** One round icon button: the neutral badge, a red dot while `unread` (or, when `watch` is given, while that says so - asked now
   *  and every second after), and a press / hover wobble. Tapping it runs `open`. */
  private buildCornerButton(x: number, y: number, size: number, item: CornerItem): Phaser.GameObjects.Container {
    const container = this.add.container(x, y);
    const icon = this.add.image(0, 0, item.texture).setDisplaySize(size, size);
    container.add(icon);

    const dot = this.add.graphics();
    dot.fillStyle(0x1b1d29, 1);
    dot.fillCircle(size * 0.34, -size * 0.34, 9);
    dot.fillStyle(0xff4d4d, 1);
    dot.fillCircle(size * 0.34, -size * 0.34, 7);
    container.add(dot);
    const { watch } = item;
    if (watch) {
      dot.setVisible(watch(Date.now()));
      this.time.addEvent({ delay: 1000, loop: true, callback: () => dot.setVisible(watch(Date.now())) });
    } else {
      dot.setVisible(item.unread);
    }

    const hitZone = this.add.zone(0, 0, size, size).setOrigin(0.5);
    hitZone.setInteractive({ useHandCursor: true });
    hitZone.on('pointerover', () => this.tweens.add({ targets: container, scale: 1.08, duration: 110, ease: 'Sine.easeOut' }));
    hitZone.on('pointerout', () => this.tweens.add({ targets: container, scale: 1, duration: 140, ease: 'Sine.easeOut' }));
    hitZone.on('pointerdown', () => this.tweens.add({ targets: container, scale: 0.92, duration: 70, ease: 'Sine.easeOut' }));
    hitZone.on('pointerup', () => {
      this.tweens.add({ targets: container, scale: 1.08, duration: 90, ease: 'Sine.easeOut' });
      item.open();
    });
    container.add(hitZone);
    return container;
  }
}
