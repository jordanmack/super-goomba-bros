import type Phaser from "phaser";
import { emptyInput } from "./simulation";
import type { Input, Mode, TallyPhase } from "./simulation";
import {
  bindingPressed,
  capturePadBinding,
  CHEAT_PAD_ACTIONS,
  GAMEPAD_DEADZONE,
  defaultPadMap,
  loadPadMap,
  mappedHolds,
  padActivity,
  pickActivePad,
  sameBinding,
  savePadMap,
  type CheatPadAction,
  type PadBinding,
  type PadMapAction,
  type PadSnapshot,
} from "./gamepad-map";
import {
  advanceSonami,
  SONAMI_LENGTH,
  sonamiStepFromKey,
  padSonamiMismatch,
  sonamiStepsFromPad,
} from "./sonami";

export type PadAction = keyof Input | "start" | "select";
export type ControlHooks = {
  onSonami: () => void;
  onTitleStart: () => void;
  onEndingTitle: () => void;
  onGamepadUse: () => void;
  onPadMapChange: (map: Record<PadMapAction, PadBinding>) => void;
  onRemapChange: (target: PadMapAction | null) => void;
  onCheat: (action: CheatPadAction) => void;
};
type ControlState = {
  input: Input;
  pulses: Partial<Input>;
  paused: boolean;
  helpOpen: boolean;
  ignoreEscapeUntilUp: boolean;
  sim: { mode: Mode; tallyPhase: TallyPhase };
  padMap: Record<PadMapAction, PadBinding>;
  remapTarget: PadMapAction | null;
};
const KEYS: Record<string, keyof Input> = {
  ArrowLeft: "left",
  KeyA: "left",
  ArrowRight: "right",
  KeyD: "right",
  Space: "jump",
  ArrowUp: "jump",
  KeyW: "jump",
  KeyK: "jump",
  KeyZ: "run",
  KeyJ: "run",
  ShiftLeft: "run",
  ShiftRight: "run",
  ArrowDown: "down",
  KeyS: "down",
};
export const KEY_BINDINGS = [
  { action: "Walk", keys: "Left / Right or A / D" },
  { action: "Run", keys: "Shift, Z, or J" },
  { action: "Jump; swim up", keys: "Space, Up, W, or K" },
  { action: "Enter a pipe", keys: "Down or S; walk into side entrances" },
  { action: "Shoot with a flower", keys: "Shift, Z, or J (press)" },
  { action: "Pause", keys: "Escape" },
] as const;
// Unlimited power-ups tray keys. Help lists them only while the tray is enabled.
const CHEAT_KEYS: Record<string, CheatPadAction> = {
  KeyU: "cheatNext",
  KeyI: "cheatDrop",
};
export const CHEAT_KEY_BINDINGS = [
  { action: "Change power-up", keys: "U" },
  { action: "Drop power-up", keys: "I" },
] as const;

// Phaser owns pointer and key events. DOM listeners only guard browser gestures,
// recover interrupted native touches, and capture mouse/pen outside the controls.
export class GameControls {
  private input: Phaser.Input.InputPlugin;
  private root: HTMLElement;
  private state: ControlState;
  private held = new Map<string, PadAction | null>();
  private releases: (() => void)[] = [];
  private captured = new Set<number>();
  private togglePause: () => void;
  private hooks: ControlHooks;
  private startHeld = false;
  private endingArmed = false;
  private sonamiIndex = 0;
  private prevPad: PadSnapshot | null = null;
  private padIndex: number | null = null;
  private gamepadUsed = false;
  private padNeedRelease = new Set<PadAction>();
  // Last seen state of the tray buttons; null until a pad is polled.
  private cheatDown: Record<CheatPadAction, boolean> | null = null;

  constructor(
    input: Phaser.Input.InputPlugin,
    root: HTMLElement,
    state: ControlState,
    togglePause: () => void,
    interrupt: () => void,
    closeHelp: () => void,
    hooks: ControlHooks,
  ) {
    this.input = input;
    this.root = root;
    this.state = state;
    this.togglePause = togglePause;
    this.hooks = hooks;
    this.state.padMap = loadPadMap();
    this.hooks.onPadMapChange(this.state.padMap);
    const event = (
      name: string,
      fn: (pointer: Phaser.Input.Pointer) => void,
    ) => {
      input.on(name, fn);
      this.releases.push(() => input.off(name, fn));
    };
    const down = (pointer: Phaser.Input.Pointer) => {
      if (
        !this.playing() ||
        !this.inControls(pointer.downElement) ||
        (!pointer.wasTouch && pointer.button !== 0)
      )
        return;
      this.held.set(`pointer:${pointer.id}`, this.actionAt(pointer));
      this.sync();
    };
    const up = (pointer: Phaser.Input.Pointer) => {
      this.held.delete(`pointer:${pointer.id}`);
      this.sync();
    };
    const move = (pointer: Phaser.Input.Pointer) => {
      const id = `pointer:${pointer.id}`;
      if (!this.held.has(id)) return;
      if (!pointer.isDown || (!pointer.wasTouch && pointer.buttons === 0))
        return up(pointer);
      this.held.set(id, this.actionAt(pointer));
      this.sync();
    };
    event("pointerdown", down);
    event("pointerdownoutside", down);
    event("pointerup", up);
    event("pointerupoutside", up);
    event("pointermove", move);

    const listen = (
      target: EventTarget,
      name: string,
      callback: (event: Event) => void,
      options?: AddEventListenerOptions | boolean,
    ) => {
      target.addEventListener(name, callback, options);
      this.releases.push(() =>
        target.removeEventListener(name, callback, options),
      );
    };
    const key = (e: KeyboardEvent, pressed: boolean) => {
      if (e.code === "Escape") {
        if (!pressed) {
          state.ignoreEscapeUntilUp = false;
          return;
        }
        if (e.repeat) return;
        if (state.helpOpen || state.ignoreEscapeUntilUp) {
          state.ignoreEscapeUntilUp = true;
          if (state.remapTarget) this.cancelRemap();
          else if (state.helpOpen) closeHelp();
          return;
        }
        if (state.sim.mode !== "title" && state.sim.mode !== "finishing") {
          togglePause();
          return;
        }
        if (state.sim.mode === "title" && this.sonamiIndex > 0)
          this.sonamiIndex = 0;
      }
      if (state.helpOpen) return;
      if (state.sim.mode === "title" && pressed && !e.repeat) {
        const step = sonamiStepFromKey(e.code);
        if ((step || this.sonamiIndex > 0) && this.feedSonami(step)) return;
      }
      const cheat = CHEAT_KEYS[e.code];
      if (cheat) {
        if (pressed && !e.repeat && this.playing()) this.hooks.onCheat(cheat);
        return;
      }
      const action = KEYS[e.code],
        id = `key:${e.code}`;
      if (!action) return;
      if (
        pressed &&
        (!this.playing() ||
          (e.code === "Space" &&
            e.target instanceof Element &&
            e.target.closest("button") &&
            !this.inControls(e.target)))
      )
        return;
      if (pressed && e.repeat && !this.held.has(id)) return;
      if (!pressed && !this.held.has(id)) return;
      if (e.cancelable) e.preventDefault();
      if (pressed) this.held.set(id, action);
      else this.held.delete(id);
      if (e.code === "ArrowUp") {
        if (pressed) this.held.set("key:ArrowUp-up", "up");
        else this.held.delete("key:ArrowUp-up");
      }
      this.sync();
    };
    const keyDown = (e: Event) => key(e as KeyboardEvent, true),
      keyUp = (e: Event) => key(e as KeyboardEvent, false);
    listen(document, "keydown", keyDown, true);
    listen(document, "keyup", keyUp, true);
    listen(window, "gamepaddisconnected", (event) => {
      const index = (event as GamepadEvent).gamepad?.index;
      if (this.padIndex !== null && index !== this.padIndex) return;
      this.clearPadHolds();
      this.prevPad = null;
      this.padIndex = null;
      this.cheatDown = null;
    });

    const clearAndInterrupt = () => {
      this.clear();
      interrupt();
    };
    listen(
      document,
      "mousedown",
      (e) => {
        if (this.inControls(e.target) && e.cancelable) e.preventDefault();
      },
      { passive: false },
    );
    for (const name of ["blur", "pagehide", "orientationchange"])
      listen(window, name, clearAndInterrupt);
    if (screen.orientation)
      listen(screen.orientation, "change", clearAndInterrupt);
    listen(document, "visibilitychange", () => {
      if (document.hidden) clearAndInterrupt();
    });
    listen(root, "contextmenu", (e) => {
      if (this.inControls(e.target)) {
        e.preventDefault();
        this.clear();
      }
    });

    const reconcile = (event: Event) => {
      const touches = new Set(
        Array.from((event as TouchEvent).touches, (t) => t.identifier),
      );
      for (const pointer of input.manager.pointers) {
        if (
          !pointer.wasTouch ||
          !pointer.active ||
          touches.has(pointer.identifier)
        )
          continue;
        this.held.delete(`pointer:${pointer.id}`);
        pointer.reset();
      }
      this.sync();
    };
    const guard = (event: Event) => {
      if (
        event.cancelable &&
        (this.inControls(event.target) ||
          [...this.held.keys()].some((k) => k.startsWith("pointer:")))
      )
        event.preventDefault();
    };
    // Recovery runs before Phaser; gesture suppression runs after Phaser's
    // non-capturing handlers so defaultPrevented cannot make it lose the input.
    for (const name of ["touchstart", "touchmove", "touchend", "touchcancel"]) {
      listen(document, name, reconcile, true);
      listen(document, name, guard, { passive: false });
    }
    listen(
      document,
      "touchmove",
      (event) => {
        const e = event as TouchEvent;
        // Phaser's TouchManager ignores moves whenever elementFromPoint is not
        // its canvas. Keep its existing pointer moving across the React controls
        // and outside them; creation, ownership, release and cancel stay in Phaser.
        for (const touch of e.changedTouches) {
          const pointer = input.manager.pointers.find(
            (p) => p.active && p.wasTouch && p.identifier === touch.identifier,
          );
          if (
            !pointer ||
            pointer.event === e ||
            !this.held.has(`pointer:${pointer.id}`)
          )
            continue;
          pointer.x = input.scene.scale.transformX(touch.pageX);
          pointer.y = input.scene.scale.transformY(touch.pageY);
          pointer.event = e;
          input.emit("pointermove", pointer, []);
        }
      },
      { passive: false },
    );
    listen(root, "pointerdown", (e) => {
      const pointer = e as PointerEvent;
      if (
        pointer.pointerType === "touch" ||
        pointer.button !== 0 ||
        !this.inControls(e.target) ||
        !this.playing()
      )
        return;
      root.setPointerCapture(pointer.pointerId);
      this.captured.add(pointer.pointerId);
    });
    listen(document, "lostpointercapture", (e) => {
      const pointer = e as PointerEvent;
      if (
        pointer.pointerType === "touch" ||
        !this.captured.delete(pointer.pointerId)
      )
        return;
      this.held.delete("pointer:0");
      input.mousePointer.reset();
      this.sync();
    });
    listen(document, "pointercancel", (e) => {
      if ((e as PointerEvent).pointerType !== "touch") {
        this.held.delete("pointer:0");
        input.mousePointer.reset();
        this.sync();
      }
    });
  }

  poll() {
    const snap = this.activePad();
    if (!snap) {
      if (this.padIndex !== null) this.clearPadHolds();
      this.prevPad = null;
      this.padIndex = null;
      this.cheatDown = null;
      return;
    }
    if (this.padIndex !== null && this.padIndex !== snap.index) {
      this.clearPadHolds();
      this.prevPad = null;
      this.cheatDown = null;
    }
    if (padActivity(snap)) this.padIndex = snap.index;
    if (!this.gamepadUsed && padActivity(snap)) {
      this.gamepadUsed = true;
      this.clearPointerHolds();
      this.hooks.onGamepadUse();
    }
    if (this.state.remapTarget) {
      const captured = capturePadBinding(this.prevPad, snap);
      if (captured) {
        const current = this.state.padMap[this.state.remapTarget];
        if (sameBinding(captured, current)) this.cancelRemap();
        else this.applyRemap(this.state.remapTarget, captured);
      }
      this.prevPad = snap;
      this.trackCheatPad(snap, false);
      return;
    }
    if (this.state.sim.mode === "title" && !this.state.helpOpen) {
      const prevButtons = this.prevPad?.buttons ?? null;
      if (this.sonamiIndex > 0 && padSonamiMismatch(prevButtons, snap.buttons))
        this.sonamiIndex = 0;
      for (const step of sonamiStepsFromPad(prevButtons, snap.buttons)) {
        if (this.feedSonami(step)) {
          this.latchPadHolds();
          break;
        }
      }
    }
    this.prevPad = snap;
    if (this.state.helpOpen) {
      this.clearPadHolds();
      this.trackCheatPad(snap, false);
      return;
    }
    const holds = mappedHolds(snap, this.state.padMap, GAMEPAD_DEADZONE);
    const live = this.playing();
    this.applyPadHold("left", holds.left, live);
    this.applyPadHold("right", holds.right, live);
    this.applyPadHold("up", holds.up, live);
    this.applyPadHold("jump", holds.jump, live);
    this.applyPadHold("run", holds.run, live);
    this.applyPadHold("down", holds.down, live);
    if (this.onEndingScreen()) {
      if (!this.endingArmed) {
        this.endingArmed = true;
        // A Start already held when the card appears must not leave by itself.
        this.padNeedRelease.add("start");
      }
    } else this.endingArmed = false;
    this.applyPadHold(
      "start",
      holds.pause,
      this.state.sim.mode === "playing" ||
        this.state.sim.mode === "title" ||
        this.onEndingScreen(),
    );
    this.trackCheatPad(snap, this.playing());
    this.sync();
  }
  clearPointerHolds() {
    for (const id of [...this.held.keys()])
      if (id.startsWith("pointer:")) this.held.delete(id);
    this.sync();
  }
  beginRemap(action: PadMapAction) {
    this.state.remapTarget = action;
    this.hooks.onRemapChange(action);
    this.clearPadHolds();
  }
  resetPadMap() {
    this.state.padMap = defaultPadMap();
    savePadMap(this.state.padMap);
    this.state.remapTarget = null;
    this.latchPadHolds();
    this.hooks.onPadMapChange(this.state.padMap);
    this.hooks.onRemapChange(null);
  }
  private applyRemap(action: PadMapAction, binding: PadBinding) {
    this.state.padMap = { ...this.state.padMap, [action]: binding };
    savePadMap(this.state.padMap);
    this.state.remapTarget = null;
    this.latchPadHolds();
    this.hooks.onPadMapChange(this.state.padMap);
    this.hooks.onRemapChange(null);
  }
  cancelRemap() {
    this.state.remapTarget = null;
    this.latchPadHolds();
    this.hooks.onRemapChange(null);
  }
  // Tray buttons act once per press. A button already down when a pad first
  // polls, when a dialog closes, or after a remap waits for its release.
  private trackCheatPad(snap: PadSnapshot, live: boolean) {
    const before = this.cheatDown;
    const now = {
      cheatNext: bindingPressed(snap, this.state.padMap.cheatNext),
      cheatDrop: bindingPressed(snap, this.state.padMap.cheatDrop),
    };
    this.cheatDown = now;
    if (!before || !live) return;
    for (const action of CHEAT_PAD_ACTIONS)
      if (now[action] && !before[action]) this.hooks.onCheat(action);
  }
  private feedSonami(step: ReturnType<typeof sonamiStepFromKey>) {
    this.sonamiIndex = advanceSonami(this.sonamiIndex, step);
    if (this.sonamiIndex < SONAMI_LENGTH) return false;
    this.sonamiIndex = 0;
    this.hooks.onSonami();
    return true;
  }
  private setPadHold(action: PadAction, pressed: boolean) {
    const id = `pad:${action}`;
    if (pressed) this.held.set(id, action);
    else this.held.delete(id);
  }
  private applyPadHold(action: PadAction, physical: boolean, enable: boolean) {
    if (!physical) this.padNeedRelease.delete(action);
    this.setPadHold(
      action,
      enable && physical && !this.padNeedRelease.has(action),
    );
  }
  private latchPadHolds() {
    const snap = this.activePad();
    if (snap) {
      const holds = mappedHolds(snap, this.state.padMap, GAMEPAD_DEADZONE);
      if (holds.left) this.padNeedRelease.add("left");
      if (holds.right) this.padNeedRelease.add("right");
      if (holds.up) this.padNeedRelease.add("up");
      if (holds.jump) this.padNeedRelease.add("jump");
      if (holds.run) this.padNeedRelease.add("run");
      if (holds.down) this.padNeedRelease.add("down");
      if (holds.pause) this.padNeedRelease.add("start");
    }
    for (const [id, action] of this.held)
      if (id.startsWith("pad:") && action) this.padNeedRelease.add(action);
  }
  private clearPadHolds() {
    for (const id of [...this.held.keys()])
      if (id.startsWith("pad:")) this.held.delete(id);
    this.startHeld = [...this.held.values()].some((action) => action === "start");
    this.sync();
  }
  private snapshotPad(
    index: number,
    buttons: ReadonlyArray<{ pressed?: boolean } | GamepadButton>,
    axes: ReadonlyArray<{ value?: number } | number>,
  ): PadSnapshot {
    return {
      index,
      buttons: [...buttons].map((button) =>
        typeof button === "object" ? !!button.pressed : !!button,
      ),
      axes: [...axes].map((axis) =>
        typeof axis === "number" ? axis : (axis?.value ?? 0),
      ),
    };
  }
  private activePad(): PadSnapshot | null {
    const snaps: PadSnapshot[] = [];
    for (const native of navigator.getGamepads?.() ?? []) {
      if (!native?.connected) continue;
      snaps.push(this.snapshotPad(native.index, native.buttons, native.axes));
    }
    return pickActivePad(snaps, this.padIndex);
  }
  private playing() {
    return !this.state.paused && this.state.sim.mode === "playing";
  }
  private onEndingScreen() {
    return (
      this.state.sim.mode === "finishing" &&
      this.state.sim.tallyPhase === "ending"
    );
  }
  private inControls(target: EventTarget | null) {
    return (
      target instanceof Element &&
      this.root.contains(target) &&
      !!target.closest(".controls")
    );
  }
  private actionAt(pointer: Phaser.Input.Pointer): PadAction | null {
    const scale = this.input.scene.scale,
      rect = scale.canvasBounds;
    const x = rect.left + (pointer.x / scale.width) * rect.width;
    const y = rect.top + (pointer.y / scale.height) * rect.height;
    const button = document
      .elementFromPoint(x, y)
      ?.closest<HTMLButtonElement>("[data-control]");
    return button && !button.disabled && this.root.contains(button)
      ? (button.dataset.control as PadAction)
      : null;
  }
  private sync() {
    const next = emptyInput();
    const pressed = new Set<PadAction>();
    for (const action of this.held.values()) if (action) pressed.add(action);
    for (const action of pressed)
      if (action in next) next[action as keyof Input] = true;
    let compactUp = false;
    for (const [id, action] of this.held)
      if (action === "up" && id.startsWith("pointer:")) compactUp = true;
    if (
      compactUp &&
      this.root.querySelector(".controls.layout-compact")
    )
      next.jump = true;
    const start = pressed.has("start");
    if (start && !this.startHeld) {
      if (this.state.sim.mode === "playing") {
        this.togglePause();
        return;
      }
      if (this.onEndingScreen()) {
        this.startHeld = true;
        this.hooks.onEndingTitle();
        return;
      }
      if (this.state.sim.mode === "title" && !this.state.helpOpen) {
        this.startHeld = true;
        this.hooks.onTitleStart();
        return;
      }
    }
    this.startHeld = [...this.held.values()].some((action) => action === "start");
    for (const action of ["jump", "fire", "down"] as const)
      if (next[action] && !this.state.input[action])
        this.state.pulses[action] = true;
    if (next.run && !this.state.input.run) this.state.pulses.fire = true;
    Object.assign(this.state.input, next);
    for (const button of this.root.querySelectorAll<HTMLButtonElement>(
      "[data-control]",
    ))
      button.toggleAttribute(
        "data-pressed",
        pressed.has(button.dataset.control as PadAction),
      );
  }
  clear() {
    this.latchPadHolds();
    this.held.clear();
    this.startHeld = false;
    this.state.ignoreEscapeUntilUp = false;
    this.sync();
    this.state.pulses = {};
    for (const pointer of this.input.manager.pointers) pointer.reset();
    this.input.keyboard?.resetKeys();
    for (const id of this.captured)
      if (this.root.hasPointerCapture(id)) this.root.releasePointerCapture(id);
    this.captured.clear();
  }
  dispose() {
    this.clear();
    for (const release of this.releases) release();
    this.releases = [];
  }
}
