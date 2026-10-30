import Phaser from 'phaser';
import { SaveSystem, type SaveData } from '../systems/SaveSystem';
import { IdleSystem } from '../systems/IdleSystem';
import { LoginBonusSystem } from '../systems/LoginBonusSystem';
import { ChatSystem, GLOBAL_CHANNEL, plainPreview } from '../systems/ChatSystem';
import { clipboardIcon, hourglassIcon, personIcon } from '../ui/ItemIcons';
import { MissionSystem } from '../systems/MissionSystem';
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
import { showToast } from '../ui/Toast';
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
    this.buildIdleBox(save);
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
    const w = 380;
    const text = body(this, 0, 0, wrapToWidth(line.text, w - 44, 24, 4, 'bold'), { fontSize: '24px', fontStyle: 'bold', color: '#fff4dc', stroke: '#1c130a', strokeThickness: 4, lineSpacing: 8 }).setOrigin(0.5);
    const nameText = caption(this, 0, 0, hero.name, { fontSize: '17px', fontStyle: 'bold', color: '#ffd9a0', stroke: '#1c130a', strokeThickness: 3 }).setOrigin(0.5);
    const h = text.height + 58;
    const box = this.add.container(470, 470).setDepth(20);
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
    text.setPosition(0, 12);
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
      { texture: personIcon(this, size), scene: 'HomeHero', unread: false },
      { texture: clipboardIcon(this, size), scene: 'Mission', unread: MissionSystem.hasReward(save) },
    ];
    const buttons = items.map((item, i) => this.buildCornerButton(656, startY + i * spacing, size, item));
    enterStagger(this, buttons, { dx: 18, dy: 0, duration: 280, delay: 220, stagger: 70 });
  }

  /** ログインボーナス is handed over the moment Home is first shown on a new
   *  day - no popup, no button to tap. お知らせ has the calendar of what each
   *  day gives, for anyone curious what just arrived. */
  private maybeClaimLoginBonus(save: SaveData): void {
    if (!LoginBonusSystem.canClaim(save)) return;
    if (!LoginBonusSystem.claim(save)) return;
    SaveSystem.save(save);
    this.resourceBar.update(save);
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

  /** Claims whatever 放置報酬 has piled up and rebuilds the box in place. */
  private claimIdle(save: SaveData, box: Phaser.GameObjects.Container): void {
    const result = IdleSystem.claim(save);
    SaveSystem.save(save);
    this.resourceBar.update(save);
    showToast(this, `放置報酬を受け取りました：+${result.preview.gold.toString()}`);
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
    const w = 330;
    const h = 100;
    const x = 720 - 14 - w;
    const y = 1280 - BottomNavBar.totalHeight() - 12 - h;
    const box = this.add.container(x, y).setDepth(5);
    box.add(createPanel(this, w / 2, h / 2, w, h, { fillColor: CHROME.woodFill, fillAlpha: 0.95, borderColor: CHROME.brassDark, glowColor: CHROME.brass, radius: 16, gradient: false }));

    const latest = ChatSystem.latestMessage(save);
    const textX = 84;
    const textW = w - textX - 14;
    box.add(buildAvatar(this, 44, h / 2 + 4, 27, latest?.senderName ?? save.playerName));
    box.add(caption(this, textX, 20, 'メッセージ', { fontSize: '15px', fontStyle: 'bold', color: '#d8c49a', stroke: '#1c130a', strokeThickness: 3 }).setOrigin(0, 0.5));

    if (latest) {
      box.add(caption(this, w - 14, 20, formatAgo(latest.sentAt), { fontSize: '14px', color: '#a89a78', stroke: '#1c130a', strokeThickness: 3 }).setOrigin(1, 0.5));
      box.add(this.fitted(body(this, textX, 50, latest.senderName, { fontSize: '19px', fontStyle: 'bold', color: '#ffe9b8', stroke: '#1c130a', strokeThickness: 3 }).setOrigin(0, 0.5), textW));
      box.add(this.fitted(caption(this, textX, 78, plainPreview(latest.text), { fontSize: '17px', color: '#f5e6c8', stroke: '#1c130a', strokeThickness: 3 }).setOrigin(0, 0.5), textW));
    } else {
      box.add(caption(this, textX, 60, 'まだメッセージがありません', { fontSize: '17px', color: '#9a8a6a' }).setOrigin(0, 0.5));
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
