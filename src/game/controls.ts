import type Phaser from "phaser";
import { emptyInput } from "./simulation";
import type { Input, Mode } from "./simulation";

export type PadAction = keyof Input | "start" | "select" | "up";
type ControlState = {
  input: Input;
  pulses: Partial<Input>;
  paused: boolean;
  helpOpen: boolean;
  sim: { mode: Mode };
};
const KEYS: Record<string, keyof Input> = {
  ArrowLeft: "left",
  KeyA: "left",
  ArrowRight: "right",
  KeyD: "right",
  Space: "jump",
  ArrowUp: "jump",
  KeyW: "jump",
  KeyZ: "run",
  ShiftLeft: "run",
  ShiftRight: "run",
  ArrowDown: "down",
  KeyS: "down",
};
export const KEY_BINDINGS = [
  { action: "Walk", keys: "Left / Right or A / D" },
  { action: "Run", keys: "Shift or Z" },
  { action: "Jump; swim up", keys: "Space, Up, or W" },
  { action: "Enter a pipe", keys: "Down or S" },
  { action: "Shoot with a flower", keys: "Shift or Z (press)" },
  { action: "Pause", keys: "Escape" },
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
  private startHeld = false;

  constructor(
    input: Phaser.Input.InputPlugin,
    root: HTMLElement,
    state: ControlState,
    togglePause: () => void,
    interrupt: () => void,
    closeHelp: () => void,
  ) {
    this.input = input;
    this.root = root;
    this.state = state;
    this.togglePause = togglePause;
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

    const key = (e: KeyboardEvent, pressed: boolean) => {
      if (pressed && e.code === "Escape" && !e.repeat) {
        if (state.helpOpen) {
          closeHelp();
          return;
        }
        if (state.sim.mode !== "title") {
          togglePause();
          return;
        }
      }
      if (state.helpOpen) return;
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
      this.sync();
    };
    const keyDown = (e: KeyboardEvent) => key(e, true),
      keyUp = (e: KeyboardEvent) => key(e, false);
    input.keyboard!.on("keydown", keyDown).on("keyup", keyUp);
    this.releases.push(() =>
      input.keyboard?.off("keydown", keyDown).off("keyup", keyUp),
    );

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

  private playing() {
    return !this.state.paused && this.state.sim.mode === "playing";
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
    const start = pressed.has("start");
    if (start && !this.startHeld && this.playing()) {
      this.togglePause();
      return;
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
    this.held.clear();
    this.startHeld = false;
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
