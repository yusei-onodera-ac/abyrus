import Phaser from 'phaser';
import { SUPPLY_BOTH_BONUS, SUPPLY_SLOTS, type SupplySlot } from '../data/supply';
import { SaveSystem, type SaveData } from '../systems/SaveSystem';
import { StaminaSystem } from '../systems/StaminaSystem';
import { SupplySystem, type SupplyState } from '../systems/SupplySystem';
import { Button } from './Button';
import { openModal, type ModalHandle } from './Modal';
import { createPanel } from './Panel';
import { showRewardModal } from './RewardModal';
import { buildRewardGrid, tileForReward, tilesForGranted } from './RewardTiles';
import { body, caption, heading, CHROME } from './theme';

const INK = '#1c130a';
const W = 640;
const CARD_W = W - 40;
const GAP = 14;
const noLock = { setEnabled: () => {} };

/** "6:00〜14:00" */
export function supplyHours(slot: SupplySlot): string {
  return `${slot.startHour}:00〜${slot.endHour === 24 ? '24:00' : `${slot.endHour}:00`}`;
}

/** What the status button of a slot says. */
function statusLabel(state: SupplyState, slot: SupplySlot, now: number): string {
  switch (state) {
    case 'open':
      return '受け取る';
    case 'claimed':
      return '受け取り済み';
    case 'upcoming':
      return `あと ${StaminaSystem.formatDuration(SupplySystem.secondsUntilOpen(slot, now))}`;
    default:
      return '受付終了';
  }
}

/**
 * 朝夕の補給: both slots of the day with their hours, what they give and a button to take each, and the bonus for
 * taking both. Taking one shows what came in a 確認 popup. `onChange` runs after anything was taken (so the screen
 * under this can bring its numbers and the Home box up to date).
 */
export function openSupplyModal(scene: Phaser.Scene, save: SaveData, onChange: () => void): ModalHandle {
  const handle = openModal(scene, noLock, 0.78, true);
  const content = scene.add.container(0, 0);
  handle.container.add(content);

  let signature = '';
  const draw = (): void => {
    if (!content.active) return;
    const now = Date.now();
    content.removeAll(true);
    const states = SUPPLY_SLOTS.map((slot) => SupplySystem.state(save, slot, now));
    signature = states.join() + `|${Math.floor(now / 60000)}|${SupplySystem.bonusTaken(save, now)}`;

    const tilesH = 132;
    const slotH = 74 + tilesH + 18;
    const bonusH = 96 + tilesH + 14;
    const h = 100 + SUPPLY_SLOTS.length * (slotH + GAP) + bonusH + 100;
    const top = 640 - h / 2;
    content.add(createPanel(scene, 360, 640, W, h, { fillColor: CHROME.woodFill, fillAlpha: 1, borderColor: CHROME.brass, glowColor: CHROME.brassBright, radius: 20, rarity: 5, gradient: false }));
    content.add(scene.add.zone(360, 640, W, h).setInteractive());
    content.add(heading(scene, 360, top + 48, '朝夕の補給', { fontSize: '38px', color: '#ffe9b8', stroke: INK, strokeThickness: 6 }).setOrigin(0.5));
    content.add(caption(scene, 360, top + 86, '朝と夕に1回ずつ。両方受け取るとボーナス！', { fontSize: '18px', color: '#d8c49a', stroke: INK, strokeThickness: 3 }).setOrigin(0.5));

    let y = top + 108;
    SUPPLY_SLOTS.forEach((slot, i) => {
      const state = states[i];
      const left = 360 - CARD_W / 2;
      content.add(createPanel(scene, 360, y + slotH / 2, CARD_W, slotH, { fillColor: 0x241810, fillAlpha: 1, borderColor: state === 'open' ? CHROME.brass : CHROME.brassDark, glowColor: CHROME.brassDark, radius: 12, gradient: false }));
      content.add(heading(scene, left + 18, y + 30, slot.name, { fontSize: '28px', color: state === 'missed' ? '#8a7a5c' : '#ffe9b8', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));
      content.add(caption(scene, left + 18, y + 58, supplyHours(slot), { fontSize: '17px', fontStyle: 'bold', color: '#cdbb94', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
      const claim = new Button(scene, left + CARD_W - 18 - 100, y + 44, 200, 56, statusLabel(state, slot, now), () => claimSlot(slot), {
        variant: state === 'open' ? 'gold' : 'wood',
        fontSize: state === 'open' ? '26px' : '19px',
      });
      claim.setEnabled(state === 'open');
      content.add(claim);
      const grid = buildRewardGrid(scene, slot.rewards.map(tileForReward), CARD_W - 20);
      grid.container.setPosition(left + 10, y + 74);
      if (state === 'claimed' || state === 'missed') grid.container.setAlpha(0.5);
      content.add(grid.container);
      y += slotH + GAP;
    });

    // The bonus for taking both.
    const taken = SupplySystem.bonusTaken(save, now);
    const reachable = SupplySystem.bonusReachable(save, now);
    const left = 360 - CARD_W / 2;
    content.add(createPanel(scene, 360, y + bonusH / 2, CARD_W, bonusH, { fillColor: 0x2c1c10, fillAlpha: 1, borderColor: CHROME.brassDark, glowColor: CHROME.brassDark, radius: 12, gradient: false }));
    content.add(heading(scene, left + 18, y + 30, '両方受け取るとボーナス', { fontSize: '24px', color: '#ffe9b8', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));
    const note = taken ? '本日分は受け取り済みです' : reachable ? '朝と夕の両方を受け取ると、もらえます' : '今日は受け取れなかった枠があるため、もらえません';
    content.add(body(scene, left + 18, y + 62, note, { fontSize: '17px', fontStyle: 'bold', color: taken ? '#9fe39f' : reachable ? '#cdbb94' : '#ff9a8a', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
    const bonusGrid = buildRewardGrid(scene, SUPPLY_BOTH_BONUS.map(tileForReward), CARD_W - 20);
    bonusGrid.container.setPosition(left + 10, y + 82);
    if (taken || !reachable) bonusGrid.container.setAlpha(0.5);
    content.add(bonusGrid.container);

    content.add(new Button(scene, 360, top + h - 52, 220, 62, '閉じる', () => handle.close(), { variant: 'wood', fontSize: '26px' }));
  };

  const claimSlot = (slot: SupplySlot): void => {
    const result = SupplySystem.claim(save, slot.id);
    if (!result) return;
    SaveSystem.save(save);
    onChange();
    // Redrawn after this tap has finished: the button being replaced is still handling it.
    scene.time.delayedCall(0, draw);
    showRewardModal(scene, noLock, {
      title: `${slot.name}を受け取りました`,
      tiles: tilesForGranted([...result.granted, ...result.bonus]),
      note: result.bonus.length > 0 ? '両方受け取ったボーナスを含みます' : undefined,
    });
  };

  draw();
  // The clock moves on while this is open: a slot opens, or the minutes in a countdown change.
  const ticker = scene.time.addEvent({
    delay: 1000,
    loop: true,
    callback: () => {
      if (!content.active) {
        ticker.remove();
        return;
      }
      const now = Date.now();
      const next = SUPPLY_SLOTS.map((slot) => SupplySystem.state(save, slot, now)).join() + `|${Math.floor(now / 60000)}|${SupplySystem.bonusTaken(save, now)}`;
      if (next !== signature) scene.time.delayedCall(0, draw);
    },
  });
  return handle;
}
