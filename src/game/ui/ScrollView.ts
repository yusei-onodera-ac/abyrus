import Phaser from 'phaser';
import { CHROME } from './theme';

/** How far a press may wander before it counts as a drag instead of a tap. */
const TAP_SLOP = 10;
const SCROLLBAR_WIDTH = 8;
const FRICTION_PER_FRAME = 0.94;

/** Vertical scrolling viewport: children go in `content` (positioned relative
 *  to the viewport's top-left), and anything outside the rectangle is
 *  clipped. Supports drag with inertia, the mouse wheel, and a brass
 *  scrollbar just right of the viewport.
 *
 *  Interactive children still receive pointer events while clipped or while
 *  the list is being dragged, so give their handlers `isTap()` as a guard. */
export class ScrollView {
  readonly content: Phaser.GameObjects.Container;
  private readonly scene: Phaser.Scene;
  private readonly left: number;
  private readonly top: number;
  private readonly width: number;
  private readonly height: number;
  private readonly maskShape: Phaser.GameObjects.Graphics;
  private readonly scrollbar: Phaser.GameObjects.Graphics;

  private contentHeight = 0;
  private scrollY = 0;
  /** px per ms, positive = scrolling down the list. */
  private velocity = 0;
  private pressed = false;
  private moved = false;
  private enabled = true;
  private lastPointerY = 0;
  private lastMoveTime = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, width: number, height: number) {
    this.scene = scene;
    this.left = x;
    this.top = y;
    this.width = width;
    this.height = height;

    this.content = scene.add.container(x, y);
    // Not added to the display list: a mask shape only needs to exist, and
    // drawing it would paint a white rectangle over the screen.
    this.maskShape = scene.make.graphics({}, false);
    this.maskShape.fillStyle(0xffffff, 1);
    this.maskShape.fillRect(x, y, width, height);
    this.content.setMask(this.maskShape.createGeometryMask());

    this.scrollbar = scene.add.graphics();

    scene.input.on(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown, this);
    scene.input.on(Phaser.Input.Events.POINTER_MOVE, this.onPointerMove, this);
    scene.input.on(Phaser.Input.Events.POINTER_UP, this.onPointerUp, this);
    scene.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onPointerUp, this);
    scene.input.on(Phaser.Input.Events.POINTER_WHEEL, this.onWheel, this);
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.onUpdate, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
  }

  setContentHeight(height: number): void {
    this.contentHeight = height;
    this.setScroll(this.scrollY);
  }

  /** Turn dragging/wheel off while a modal sits on top of the list. */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.pressed = false;
      this.velocity = 0;
    }
  }

  /** True when the current press is a tap that landed inside the viewport -
   *  use as a click guard for anything placed in `content`. */
  isTap(): boolean {
    return !this.moved && this.contains(this.scene.input.activePointer);
  }

  contains(pointer: Phaser.Input.Pointer): boolean {
    return pointer.x >= this.left && pointer.x <= this.left + this.width && pointer.y >= this.top && pointer.y <= this.top + this.height;
  }

  private maxScroll(): number {
    return Math.max(0, this.contentHeight - this.height);
  }

  private setScroll(value: number): void {
    const clamped = Phaser.Math.Clamp(value, 0, this.maxScroll());
    if (clamped !== value) this.velocity = 0;
    this.scrollY = clamped;
    this.content.y = this.top - clamped;
    this.drawScrollbar();
  }

  private drawScrollbar(): void {
    this.scrollbar.clear();
    const max = this.maxScroll();
    if (max <= 0) return;
    const x = this.left + this.width + 12;
    this.scrollbar.fillStyle(CHROME.woodGrain, 0.9);
    this.scrollbar.fillRoundedRect(x - SCROLLBAR_WIDTH / 2, this.top, SCROLLBAR_WIDTH, this.height, SCROLLBAR_WIDTH / 2);
    const thumbH = Math.max(44, (this.height / this.contentHeight) * this.height);
    const thumbY = this.top + (this.scrollY / max) * (this.height - thumbH);
    this.scrollbar.fillStyle(CHROME.brass, 1);
    this.scrollbar.fillRoundedRect(x - SCROLLBAR_WIDTH / 2, thumbY, SCROLLBAR_WIDTH, thumbH, SCROLLBAR_WIDTH / 2);
  }

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    if (!this.enabled || !this.contains(pointer)) return;
    this.pressed = true;
    this.moved = false;
    this.velocity = 0;
    this.lastPointerY = pointer.y;
    this.lastMoveTime = this.scene.time.now;
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    if (!this.pressed) return;
    const now = this.scene.time.now;
    if (!this.moved) {
      if (Phaser.Math.Distance.Between(pointer.downX, pointer.downY, pointer.x, pointer.y) <= TAP_SLOP) return;
      this.moved = true;
      // Start tracking from here so the slop distance doesn't cause a jump.
      this.lastPointerY = pointer.y;
      this.lastMoveTime = now;
      return;
    }
    const dy = pointer.y - this.lastPointerY;
    const dt = Math.max(1, now - this.lastMoveTime);
    this.velocity = this.velocity * 0.5 + (-dy / dt) * 0.5;
    this.lastPointerY = pointer.y;
    this.lastMoveTime = now;
    this.setScroll(this.scrollY - dy);
  }

  private onPointerUp(): void {
    if (!this.pressed) return;
    this.pressed = false;
    // A finger that stopped before lifting shouldn't fling the list.
    if (this.scene.time.now - this.lastMoveTime > 80) this.velocity = 0;
  }

  private onWheel(pointer: Phaser.Input.Pointer, _over: unknown, _dx: number, dy: number): void {
    if (!this.enabled || !this.contains(pointer)) return;
    this.velocity = 0;
    this.setScroll(this.scrollY + dy);
  }

  private onUpdate(_time: number, delta: number): void {
    if (this.pressed || Math.abs(this.velocity) < 0.02) return;
    this.setScroll(this.scrollY + this.velocity * delta);
    this.velocity *= Math.pow(FRICTION_PER_FRAME, delta / 16.67);
  }

  destroy(): void {
    const { input, events } = this.scene;
    input.off(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown, this);
    input.off(Phaser.Input.Events.POINTER_MOVE, this.onPointerMove, this);
    input.off(Phaser.Input.Events.POINTER_UP, this.onPointerUp, this);
    input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onPointerUp, this);
    input.off(Phaser.Input.Events.POINTER_WHEEL, this.onWheel, this);
    events.off(Phaser.Scenes.Events.UPDATE, this.onUpdate, this);
    this.maskShape.destroy();
  }
}
