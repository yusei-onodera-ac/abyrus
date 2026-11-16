import Phaser from 'phaser';
import { SaveSystem, type SaveData } from '../systems/SaveSystem';
import { IdleSystem } from '../systems/IdleSystem';
import { LoginBonusSystem } from '../systems/LoginBonusSystem';
import { TutorialSystem } from '../systems/TutorialSystem';
import { showRewardModal } from '../ui/RewardModal';
import { tilesForGranted, tilesForIdleClaim } from '../ui/RewardTiles';
import { ChatSystem, GLOBAL_CHANNEL, plainPreview } from '../systems/ChatSystem';
import { clipboardIcon, expeditionIcon, hourglassIcon, supplyIcon, villageIcon } from '../ui/ItemIcons';
import { SUPPLY_SLOTS } from '../data/supply';
import { SupplySystem } from '../systems/SupplySystem';
import { openSupplyModal } from '../ui/SupplyModal';
import { VillageGoals } from '../systems/VillageGoals';
import { ExpeditionSystem } from '../systems/ExpeditionSystem';
import { VillageSystem } from '../systems/VillageSystem';
import { StaminaSystem } from '../systems/StaminaSystem';
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
import { applyBackground } from '../ui/Background';
import { questIcon, gachaIcon, rosterIcon, notificationIcon, giftBoxIcon, mailIcon, settingsIcon } from '../ui/Icons';
import { buildAvatar } from '../ui/CardParts';
import { Button } from '../ui/Button';
import { formatAgo } from '../ui/format';
import { createPanel } from '../ui/Panel';
import { addGoodIcon } from '../ui/RewardIcon';
import { body, caption, CHROME } from '../ui/theme';
import { enter, enterStagger, popIn } from '../ui/Transitions';
import { BottomNavBar } from '../ui/BottomNavBar';
import { buildBannerCarousel } from '../ui/BannerCarousel';
import { BANNERS } from '../data/banners';
import { RARITY_COLORS, type HeroData } from '../types';

/** Character-first home hub: a big asymmetric portrait of the player's best
 *  hero layered over the background, with a round icon-cluster nav
 *  underneath instead of a stage-select grid (that lives in
 *  StageSelectScene now) or a stack of long rectangle menu buttons. */
/** Promo banner frame, top-left under the resource bar. The quest/roster
 *  diamonds line their left edge up with this one's. */
const BANNER = { x: 28, y: 138, w: 336, h: 188 };

/** The 遠征 / 村 / 朝夕の補給 boxes: a column on the right, below the round buttons, over the hero's body - the face
 *  (upper right, behind the old position of these boxes) is left clear. */
const STATUS = { x: 476, w: 232, h: 84, y: 498, step: 92 };

/** Where the Home hero's speech bubble sits: centred over the head, its lower edge here. */
const BUBBLE_X = 494;
const BUBBLE_BOTTOM = 262;

/** "2時間30分" - mirrors IdleScene's own formatter so the two read the same. */
function formatIdleHours(hours: number): string {
  const total = Math.floor(hours * 60);
  return `${Math.floor(total / 60)}時間${String(total % 60).padStart(2, '0')}分`;
}

export class HomeScene extends Phaser.Scene {
  private resourceBar!: ResourceBar;

  constructor() {
    super('Home');
  }

  create(): void {
    const save = this.getSave();
    stopAutoAdvance(this.game);
    // Hand over any gifts/mails the operator has added since the last visit.
    if (InboxSystem.deliver(save)) SaveSystem.save(save);
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
    this.buildExpeditionBox(save);
    this.buildVillageBox(save);
    this.buildSupplyBox(save);
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
    const w = 252;
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
    const quest = new IconNavButton(this, clusterX, 655, 'quest', questIcon(this, 90), 'クエスト', size, () => this.scene.start('StageSelect'));
    const gacha = new IconNavButton(this, 400, 810, 'gacha', gachaIcon(this, 90), '召喚', size, () => this.scene.start('Gacha'));
    const roster = new IconNavButton(this, clusterX, 970, 'roster', rosterIcon(this, 90), '名鑑', size, () => this.scene.start('Roster'));
    enterStagger(this, [quest, gacha, roster], { dy: 24, duration: 320, delay: 150, stagger: 60 });
  }

  /** The promo banner in the top-left corner, under the resource bar - gacha
   *  pushes, event announcements, limited packs. One banner shows at a time;
   *  swipe or wait 3 seconds for the next. Pure content: see data/banners.ts to
   *  add/swap one without touching this scene. */
  private buildBanners(): void {
    const carousel = buildBannerCarousel(this, BANNER.x, BANNER.y, BANNERS, BANNER.w, BANNER.h);
    // Fade only: the carousel clips to a fixed on-screen frame, so it can't slide in.
    enter(this, carousel, { dx: 0, dy: 0, duration: 400, delay: 220 });
  }

  /** Small round utility buttons stacked in the top-right corner, under the
   *  resource bar: お知らせ / プレゼントBOX / メール / 設定. Each opens its
   *  screen, and the red dot shows while that one has something new (unread
   *  notice, claimable gift, unread mail). */
  private buildCornerButtons(save: SaveData): void {
    const size = 72;
    const spacing = 92;
    const startY = 176;
    const unread = InboxSystem.getUnread(save);
    const items: { texture: string; scene: string; unread: boolean }[] = [
      { texture: notificationIcon(this, size), scene: 'Notice', unread: unread.notification },
      { texture: giftBoxIcon(this, size), scene: 'Gift', unread: unread.giftBox },
      { texture: mailIcon(this, size), scene: 'Mail', unread: unread.mail },
      { texture: settingsIcon(this, size), scene: 'Settings', unread: false },
    ];
    const buttons = items.map((item, i) => this.buildCornerButton(656, startY + i * spacing, size, item));
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
    showRewardModal(this, { setEnabled: () => {} }, { title: 'ログインボーナス', tiles: tilesForGranted([granted]), note: `${LoginBonusSystem.dayOfMonth()}日目の報酬です` });
  }

  /** A small status box on the right of the promo banner: an icon, a label, a line of state and a smaller one under
   *  it, a row of pips, and a red dot when something is waiting. `read` is asked now and every second after, so
   *  what it says (a countdown, a slot coming home) moves by itself. Tapping the box opens its screen. */
  private buildStatusBox(opts: {
    y: number;
    icon: string;
    label: string;
    onOpen: () => void;
    read: (now: number) => { main: string; mainColor: string; sub: string; pips: ('empty' | 'busy' | 'ready')[]; dot: boolean };
    delay: number;
  }): void {
    const x = STATUS.x;
    const w = STATUS.w;
    const h = STATUS.h;
    const box = this.add.container(x, opts.y);
    box.add(createPanel(this, w / 2, h / 2, w, h, { fillColor: CHROME.woodFill, fillAlpha: 0.95, borderColor: CHROME.brassDark, glowColor: CHROME.brass, radius: 14, gradient: false }));
    box.add(this.add.image(38, h / 2, opts.icon).setDisplaySize(52, 52));
    box.add(caption(this, 74, 18, opts.label, { fontSize: '16px', fontStyle: 'bold', color: '#d8c49a', stroke: '#1c130a', strokeThickness: 3 }).setOrigin(0, 0.5));
    const main = body(this, 74, 45, '', { fontSize: '21px', fontStyle: 'bold', color: '#fff4dc', stroke: '#1c130a', strokeThickness: 4 }).setOrigin(0, 0.5);
    const sub = caption(this, 74, 67, '', { fontSize: '16px', fontStyle: 'bold', color: '#cdbb94', stroke: '#1c130a', strokeThickness: 3 }).setOrigin(0, 0.5);
    const pips = this.add.graphics();
    const dot = this.add.graphics();
    box.add([main, sub, pips, dot]);

    const draw = (): void => {
      const state = opts.read(Date.now());
      main.setText(state.main).setColor(state.mainColor);
      sub.setText(state.sub);
      pips.clear();
      state.pips.forEach((pip, i) => {
        const cx = w - 22 - (state.pips.length - 1 - i) * 22;
        pips.fillStyle(pip === 'ready' ? 0xffd23f : pip === 'busy' ? 0xe0822a : 0x0d0905, 1);
        pips.fillCircle(cx, 18, 7);
        pips.lineStyle(2, pip === 'ready' ? 0xfff0b0 : CHROME.brassDark, 1);
        pips.strokeCircle(cx, 18, 7);
      });
      dot.clear();
      if (state.dot) {
        dot.fillStyle(0x1b1d29, 1);
        dot.fillCircle(58, h / 2 - 20, 9);
        dot.fillStyle(0xff4d4d, 1);
        dot.fillCircle(58, h / 2 - 20, 7);
      }
    };
    draw();
    this.time.addEvent({ delay: 1000, loop: true, callback: draw });

    const hit = this.add.zone(w / 2, h / 2, w, h).setOrigin(0.5);
    hit.setInteractive({ useHandCursor: true });
    hit.on('pointerup', opts.onOpen);
    box.add(hit);

    enter(this, box, { dy: 10, duration: 320, delay: opts.delay });
  }

  /** 遠征: how many are back (gold, with a red dot), else how long until the next one, else a nudge to send
   *  someone out. The three pips are the three slots (empty / away / back). */
  private buildExpeditionBox(save: SaveData): void {
    this.buildStatusBox({
      y: STATUS.y,
      icon: expeditionIcon(this, 52),
      label: '遠征',
      delay: 240,
      // The data is always given: starting a scene without any would hand it the last screen's (see ExpeditionScene.init).
      onOpen: () => this.scene.start('Expedition', { view: 'board' }),
      read: (now) => {
        const runs = save.expeditions.slots;
        const ready = ExpeditionSystem.readyCount(save, now);
        const running = ExpeditionSystem.runningCount(save, now);
        const left = runs.filter((run) => run !== null && !ExpeditionSystem.isDone(run, now)).map((run) => ExpeditionSystem.secondsLeft(run!, now));
        const state =
          ready > 0
            ? { main: `帰還 ${ready}`, mainColor: '#ffd23f', sub: running > 0 ? `遠征中 ${running}` : '受け取れます' }
            : running > 0
              ? { main: `遠征中 ${running}/${runs.length}`, mainColor: '#fff4dc', sub: `あと ${StaminaSystem.formatDuration(Math.min(...left))}` }
              : { main: '出発できます', mainColor: '#9fe39f', sub: `${runs.length}枠 空き` };
        return {
          ...state,
          pips: runs.map((run) => (run === null ? 'empty' : ExpeditionSystem.isDone(run, now) ? 'ready' : 'busy')),
          dot: ready > 0,
        };
      },
    });
  }

  /** 村: a nudge when a builder is free and something can be built or strengthened (red dot), else how the work is
   *  going. The pips are the builders (dark = free). */
  private buildVillageBox(save: SaveData): void {
    this.buildStatusBox({
      y: STATUS.y + STATUS.step,
      icon: villageIcon(this, 52),
      label: '村',
      delay: 260,
      onOpen: () => this.scene.start('Village'),
      read: (now) => {
        // Brings the village up to date first, so a 襲撃 that has come (or gone) shows here without opening it.
        VillageSystem.settle(save, now);
        const summary = VillageSystem.summary(save, now);
        const job = VillageSystem.hasJob(save, now);
        const need = VillageSystem.attention(save, now);
        // 村の目標 that are met and not yet collected.
        const goals = VillageGoals.claimable(save, now).length;
        // The most pressing thing first: a 襲撃 waiting, then broken buildings, 依頼 to collect, 行商人 / 宝箱 on the map.
        const state = need.raid
          ? { main: '襲撃！', mainColor: '#ff9a8a', sub: `あと ${StaminaSystem.formatDuration(VillageSystem.raidSecondsLeft(save, now))}` }
          : need.broken > 0
            ? { main: '壊れています', mainColor: '#ffb07a', sub: `${need.broken}件　直しましょう` }
            : need.quests > 0
              ? { main: '依頼の報酬', mainColor: '#9fe39f', sub: `${need.quests}件　受け取れます` }
              : goals > 0
                ? { main: '村の目標', mainColor: '#9fe39f', sub: `${goals}件　達成しています` }
                : need.wanderers > 0
                ? { main: '宝箱・行商人', mainColor: '#9fe39f', sub: '村で受け取れます' }
                : job
                  ? { main: '建てられます', mainColor: '#9fe39f', sub: `売上 ×${summary.multiplier.toFixed(2)}` }
                  : summary.busy > 0
                    ? { main: `建築中 ${summary.busy}/${summary.builders}`, mainColor: '#fff4dc', sub: `あと ${StaminaSystem.formatDuration(summary.nextSeconds)}` }
                    : { main: `売上 ×${summary.multiplier.toFixed(2)}`, mainColor: '#fff4dc', sub: 'ゴールドをためよう' };
        const dot = need.raid || need.broken > 0 || need.quests > 0 || goals > 0 || need.wanderers > 0 || job;
        return { ...state, pips: Array.from({ length: summary.builders }, (_, i) => (i < summary.busy ? 'busy' : 'empty')), dot };
      },
    });
  }

  /** 朝夕の補給, under 村: the slot that can be taken now (red dot, with how long it stays open), else the one coming next
   *  and when, else that today is done. The two pips are the two slots (gold = can be taken, orange = taken). Tapping it
   *  opens the list to take them from. */
  private buildSupplyBox(save: SaveData): void {
    this.buildStatusBox({
      y: STATUS.y + STATUS.step * 2,
      icon: supplyIcon(this, 52),
      label: '朝夕の補給',
      delay: 270,
      onOpen: () => openSupplyModal(this, save, () => this.resourceBar.update(save)),
      read: (now) => {
        const next = SupplySystem.next(save, now);
        let state: { main: string; mainColor: string; sub: string };
        if (next?.state === 'open') state = { main: next.slot.name, mainColor: '#ffd23f', sub: `あと${StaminaSystem.formatDuration(next.seconds)}で終了` };
        else if (next) state = { main: next.slot.name, mainColor: '#fff4dc', sub: `あと${StaminaSystem.formatDuration(next.seconds)}で開始` };
        else {
          const first = SUPPLY_SLOTS[0];
          state = { main: SupplySystem.allTaken(save, now) ? '本日分 完了' : '本日は終了', mainColor: SupplySystem.allTaken(save, now) ? '#9fe39f' : '#cdbb94', sub: `次は ${first.startHour}:00から` };
        }
        return {
          ...state,
          pips: SUPPLY_SLOTS.map((slot) => {
            const slotState = SupplySystem.state(save, slot, now);
            return slotState === 'claimed' ? 'busy' : slotState === 'open' ? 'ready' : 'empty';
          }),
          dot: SupplySystem.openCount(save, now) > 0,
        };
      },
    });
  }

  /** 放置報酬, pinned just under the promo banner: how long has piled up (with a
   *  bar towards the cap) and a 受け取る button, so cashing in doesn't need a
   *  trip to the Idle screen. The rest of the box opens that screen (ad boost,
   *  the full list of what has piled up). */
  private buildIdleBox(save: SaveData): void {
    const x = BANNER.x;
    const y = BANNER.y + BANNER.h + 12;
    const w = BANNER.w;
    const h = 100;
    const box = this.add.container(x, y);
    box.add(createPanel(this, w / 2, h / 2, w, h, { fillColor: CHROME.woodFill, fillAlpha: 0.95, borderColor: CHROME.brassDark, glowColor: CHROME.brass, radius: 14, gradient: false }));

    const preview = IdleSystem.preview(save);
    const claimable = preview.hours >= 1 / 60;
    box.add(this.add.image(42, 38, hourglassIcon(this, 54)));
    box.add(caption(this, 80, 20, '放置報酬', { fontSize: '16px', fontStyle: 'bold', color: '#d8c49a', stroke: '#1c130a', strokeThickness: 3 }).setOrigin(0, 0.5));
    box.add(body(this, 80, 46, formatIdleHours(preview.hours), { fontSize: '22px', fontStyle: 'bold', color: preview.full ? '#ffd23f' : '#fff4dc', stroke: '#1c130a', strokeThickness: 4 }).setOrigin(0, 0.5));

    // How full it is, as a thin bar along the bottom of the box.
    const barX = 18;
    const barW = w - 36;
    const bar = this.add.graphics();
    bar.fillStyle(0x0d0905, 1);
    bar.fillRoundedRect(barX, 80, barW, 9, 4);
    bar.fillStyle(preview.full ? 0xffd23f : 0xe0822a, 1);
    bar.fillRoundedRect(barX, 80, Math.max(9, barW * Math.min(1, preview.hours / preview.capHours)), 9, 4);
    bar.lineStyle(1.5, CHROME.brassDark, 1);
    bar.strokeRoundedRect(barX, 80, barW, 9, 4);
    box.add(bar);

    // Tapping the box itself opens the full screen; the button on top claims.
    const hit = this.add.zone(w / 2, h / 2, w, h).setOrigin(0.5);
    hit.setInteractive({ useHandCursor: true });
    hit.on('pointerup', () => this.scene.start('Idle'));
    box.add(hit);

    box.add(addGoodIcon(this, 'gold', w - 124, 24, 24));
    box.add(body(this, w - 108, 24, `+${preview.gold.toString()}`, { fontSize: '15px', fontStyle: 'bold', color: '#ffe79a', stroke: '#1c130a', strokeThickness: 3 }).setOrigin(0, 0.5));
    const claim = new Button(this, w - 74, 52, 124, 40, '受け取る', () => this.claimIdle(save, box), { variant: claimable ? 'gold' : 'wood', fontSize: '20px' });
    claim.setEnabled(claimable);
    box.add(claim);

    enter(this, box, { dy: 10, duration: 320, delay: 260 });
  }

  /** ミッション, just under 放置報酬: how far along デイリー / ウィークリー / 実績 are (done / total),
   *  with a red dot while something can be taken. Tapping it opens the list that has a reward
   *  waiting (the daily one otherwise). */
  private buildMissionBox(save: SaveData): void {
    const x = BANNER.x;
    const y = BANNER.y + BANNER.h + 12 + 100 + 8;
    const w = BANNER.w;
    const h = 74;
    const box = this.add.container(x, y);
    box.add(createPanel(this, w / 2, h / 2, w, h, { fillColor: CHROME.woodFill, fillAlpha: 0.95, borderColor: CHROME.brassDark, glowColor: CHROME.brass, radius: 14, gradient: false }));

    const summary = MissionSystem.summary(save);
    const waiting = summary.find((g) => g.claimable > 0 || MissionSystem.bonusClaimable(save, g.group));
    box.add(this.add.image(38, h / 2, clipboardIcon(this, 54)).setDisplaySize(54, 54));
    if (MissionSystem.hasReward(save)) {
      const dot = this.add.graphics();
      dot.fillStyle(0x1b1d29, 1);
      dot.fillCircle(58, 14, 9);
      dot.fillStyle(0xff4d4d, 1);
      dot.fillCircle(58, 14, 7);
      box.add(dot);
    }
    box.add(caption(this, 76, 16, 'ミッション', { fontSize: '16px', fontStyle: 'bold', color: '#d8c49a', stroke: '#1c130a', strokeThickness: 3 }).setOrigin(0, 0.5));
    const columns = [76, 154, 264];
    summary.forEach((g, i) => {
      const cx = columns[i];
      const ready = g.claimable > 0;
      box.add(caption(this, cx, 40, getMissionGroup(g.group).short, { fontSize: '14px', color: '#cdbb94', stroke: '#1c130a', strokeThickness: 3 }).setOrigin(0, 0.5));
      box.add(body(this, cx, 58, `${g.done}/${g.total}`, { fontSize: '20px', fontStyle: 'bold', color: ready ? '#ffd23f' : '#fff4dc', stroke: '#1c130a', strokeThickness: 4 }).setOrigin(0, 0.5));
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
    showRewardModal(this, { setEnabled: () => {} }, { title: '放置報酬を受け取りました', tiles: tilesForIdleClaim(result.preview, result.equipment) });
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
    box.add(createPanel(this, w / 2, h / 2, w, h, { fillColor: CHROME.woodFill, fillAlpha: 0.95, borderColor: CHROME.brassDark, glowColor: CHROME.brass, radius: 18, gradient: false }));

    const latest = ChatSystem.latestMessage(save);
    const textX = 104;
    const textW = w - textX - 18;
    box.add(buildAvatar(this, 54, h / 2 + 6, 35, latest?.senderName ?? save.playerName));
    box.add(caption(this, textX, 24, 'メッセージ', { fontSize: '19px', fontStyle: 'bold', color: '#d8c49a', stroke: '#1c130a', strokeThickness: 3 }).setOrigin(0, 0.5));

    if (latest) {
      box.add(caption(this, w - 18, 24, formatAgo(latest.sentAt), { fontSize: '17px', color: '#a89a78', stroke: '#1c130a', strokeThickness: 3 }).setOrigin(1, 0.5));
      box.add(this.fitted(body(this, textX, 62, latest.senderName, { fontSize: '25px', fontStyle: 'bold', color: '#ffe9b8', stroke: '#1c130a', strokeThickness: 4 }).setOrigin(0, 0.5), textW));
      box.add(this.fitted(caption(this, textX, 98, plainPreview(latest.text), { fontSize: '22px', color: '#f5e6c8', stroke: '#1c130a', strokeThickness: 3 }).setOrigin(0, 0.5), textW));
    } else {
      box.add(caption(this, textX, 76, 'まだメッセージがありません', { fontSize: '22px', color: '#9a8a6a' }).setOrigin(0, 0.5));
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

  private buildCornerButton(
    x: number,
    y: number,
    size: number,
    item: { texture: string; scene: string; unread: boolean },
  ): Phaser.GameObjects.Container {
    const container = this.add.container(x, y);
    const icon = this.add.image(0, 0, item.texture).setDisplaySize(size, size);
    container.add(icon);

    if (item.unread) {
      const dot = this.add.graphics();
      dot.fillStyle(0x1b1d29, 1);
      dot.fillCircle(size * 0.34, -size * 0.34, 9);
      dot.fillStyle(0xff4d4d, 1);
      dot.fillCircle(size * 0.34, -size * 0.34, 7);
      container.add(dot);
    }

    const hitZone = this.add.zone(0, 0, size, size).setOrigin(0.5);
    hitZone.setInteractive({ useHandCursor: true });
    hitZone.on('pointerover', () => this.tweens.add({ targets: container, scale: 1.08, duration: 110, ease: 'Sine.easeOut' }));
    hitZone.on('pointerout', () => this.tweens.add({ targets: container, scale: 1, duration: 140, ease: 'Sine.easeOut' }));
    hitZone.on('pointerdown', () => this.tweens.add({ targets: container, scale: 0.92, duration: 70, ease: 'Sine.easeOut' }));
    hitZone.on('pointerup', () => {
      this.tweens.add({ targets: container, scale: 1.08, duration: 90, ease: 'Sine.easeOut' });
      this.scene.start(item.scene);
    });
    container.add(hitZone);
    return container;
  }
}
