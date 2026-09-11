import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  DoorOpen,
  Pause,
  Play,
  RotateCcw,
  Volume2,
  VolumeX,
  Flame,
  X,
} from "lucide-react";
import { Simulation, emptyInput } from "./game/simulation";
import type { Input, Mode } from "./game/simulation";
import { GameRenderer } from "./game/renderer";
import { GameAudio } from "./game/audio";
import { TUNING as T } from "./game/config";

type Runtime = {
  sim: Simulation;
  renderer: GameRenderer;
  audio: GameAudio;
  input: Input;
  pulses: Partial<Input>;
  paused: boolean;
  clearInput: () => void;
};
type Snapshot = {
  mode: Mode;
  warned: number;
  saved: number;
  living: number;
  elapsed: number;
  doomed: boolean;
  power: string;
  flower: boolean;
  phase: number;
  bubble: string;
  x: number;
  y: number;
  cooldown: number;
  finishLeft: number;
  progress: number;
};
const initial: Snapshot = {
  mode: "title",
  warned: 0,
  saved: 0,
  living: T.population,
  elapsed: 0,
  doomed: false,
  power: "",
  flower: false,
  phase: 0,
  bubble: "",
  x: 0,
  y: 0,
  cooldown: 0,
  finishLeft: 0,
  progress: 0,
};
const keyMap: Record<string, keyof Input> = {
  ArrowLeft: "left",
  KeyA: "left",
  ArrowRight: "right",
  KeyD: "right",
  Space: "jump",
  ArrowUp: "jump",
  KeyW: "jump",
  KeyZ: "fire",
};

export default function App() {
  const surface = useRef<HTMLElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const runtime = useRef<Runtime | null>(null);
  const [state, setState] = useState(initial);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState("");
  const [portrait, setPortrait] = useState("");
  const startAudio = (game: Runtime) => {
    void game.audio.start().catch(() => {
      game.audio.muted = true;
      setMuted(true);
    });
  };

  useEffect(() => {
    let renderer: GameRenderer;
    try {
      renderer = new GameRenderer(host.current!);
    } catch {
      queueMicrotask(() =>
        setError(
          "WebGL could not start. Please enable hardware acceleration and reload.",
        ),
      );
      return;
    }
    const sim = new Simulation();
    const audio = new GameAudio();
    const game: Runtime = {
      sim,
      renderer,
      audio,
      input: emptyInput(),
      pulses: {},
      paused: false,
      clearInput: () => {},
    };
    runtime.current = game;
    queueMicrotask(() => setPortrait(renderer.art.portrait));
    // Development-only access supports deterministic browser checks, never the built game.
    if (import.meta.env.DEV)
      (window as unknown as { __game: Runtime }).__game = game;
    let frame = 0,
      last = performance.now(),
      accumulator = 0,
      ticks = 0;
    const update = (now: number) => {
      const delta = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (!game.paused) {
        accumulator += delta;
        while (accumulator >= 1 / 60) {
          sim.step(1 / 60, { ...game.input, ...game.pulses });
          game.pulses = {};
          if (sim.mode !== "playing") game.clearInput();
          accumulator -= 1 / 60;
        }
        for (const event of sim.events.splice(0)) audio.event(event);
        audio.update(
          sim.mode === "playing",
          (sim.player.alive && sim.player.starLeft > 0) ||
            (sim.marioActive && sim.mario.alive && sim.mario.starLeft > 0),
        );
      }
      renderer.render(sim, now / 1000);
      if (ticks++ % 4 === 0) {
        const p = sim.player.body.position;
        const point = renderer.screen(p.x, p.y - 42 * sim.player.scale, sim);
        setState({
          mode: sim.mode,
          warned: sim.warned,
          saved: sim.saved,
          living: sim.living(),
          elapsed: sim.elapsed,
          doomed: sim.doomed,
          power: [
            sim.player.starLeft > 0
              ? `STAR ${Math.ceil(sim.player.starLeft)}s`
              : "",
            sim.player.scale > 1 ? "GIANT" : "",
            sim.player.flower ? "FIRE: Z" : "",
          ]
            .filter(Boolean)
            .join(" / "),
          flower: sim.player.flower,
          phase: sim.phase,
          bubble: sim.bubbleLeft > 0 ? sim.bubble : "",
          x: point.x,
          y: point.y,
          cooldown: sim.cooldown,
          finishLeft: sim.finishLeft,
          progress: Math.min(1, p.x / T.goalX),
        });
      }
      frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    const root = surface.current!;
    // Touch identifiers, pointer IDs, and keyboard keys are independent holds.
    const held = new Map<string, keyof Input | null>();
    const playing = () => !game.paused && sim.mode === "playing";
    const sync = () => {
      const next = emptyInput();
      for (const action of held.values()) if (action) next[action] = true;
      for (const action of ["jump", "fire"] as const)
        if (next[action] && !game.input[action]) game.pulses[action] = true;
      Object.assign(game.input, next);
      for (const button of root.querySelectorAll<HTMLButtonElement>(
        "[data-control]",
      ))
        button.toggleAttribute(
          "data-pressed",
          next[button.dataset.control as keyof Input],
        );
    };
    const clear = () => {
      const pointers = [...held.keys()]
        .filter((id) => id.startsWith("pointer:"))
        .map((id) => Number(id.slice(8)));
      held.clear();
      sync();
      game.pulses = {};
      for (const id of pointers)
        if (root.hasPointerCapture(id)) root.releasePointerCapture(id);
    };
    game.clearInput = clear;
    const inControls = (target: EventTarget | null) =>
      target instanceof Element &&
      !!target.closest(".controls") &&
      root.contains(target);
    const actionAt = (x: number, y: number): keyof Input | null => {
      const button = document
        .elementFromPoint(x, y)
        ?.closest<HTMLButtonElement>("[data-control]");
      return button && root.contains(button) && !button.disabled
        ? (button.dataset.control as keyof Input)
        : null;
    };
    const preventGesture = (event: Event) => {
      if (event.cancelable) event.preventDefault();
    };
    const reconcileTouches = (event: TouchEvent) => {
      const active = new Set(
        Array.from(event.touches, (touch) => `touch:${touch.identifier}`),
      );
      for (const id of held.keys())
        if (id.startsWith("touch:") && !active.has(id)) held.delete(id);
      sync();
    };
    const touchStart = (event: TouchEvent) => {
      if (!inControls(event.target)) return;
      // Native non-passive touch listeners suppress Safari's tap-and-hold loupe.
      // Touch events alone own finger input; ignore their companion pointer events.
      preventGesture(event);
      if (!playing()) return;
      for (const touch of event.changedTouches)
        held.set(
          `touch:${touch.identifier}`,
          actionAt(touch.clientX, touch.clientY),
        );
      reconcileTouches(event);
    };
    const touchMove = (event: TouchEvent) => {
      for (const touch of event.changedTouches) {
        const id = `touch:${touch.identifier}`;
        if (!held.has(id)) continue;
        preventGesture(event);
        held.set(id, actionAt(touch.clientX, touch.clientY));
      }
      reconcileTouches(event);
    };
    const touchEnd = (event: TouchEvent) => {
      for (const touch of event.changedTouches)
        held.delete(`touch:${touch.identifier}`);
      reconcileTouches(event);
    };
    const pointerDown = (event: PointerEvent) => {
      if (
        event.pointerType === "touch" ||
        event.button !== 0 ||
        !playing() ||
        !inControls(event.target)
      )
        return;
      preventGesture(event);
      root.setPointerCapture(event.pointerId);
      held.set(`pointer:${event.pointerId}`, actionAt(event.clientX, event.clientY));
      sync();
    };
    const pointerEnd = (event: PointerEvent) => {
      if (!held.delete(`pointer:${event.pointerId}`)) return;
      sync();
      if (root.hasPointerCapture(event.pointerId))
        root.releasePointerCapture(event.pointerId);
    };
    const pointerMove = (event: PointerEvent) => {
      const id = `pointer:${event.pointerId}`;
      if (!held.has(id)) return;
      if (event.buttons === 0) return pointerEnd(event);
      held.set(id, actionAt(event.clientX, event.clientY));
      sync();
    };
    const contextMenu = (event: Event) => {
      if (!inControls(event.target)) return;
      preventGesture(event);
      clear();
    };
    const key = (event: KeyboardEvent, down: boolean) => {
      const action = keyMap[event.code];
      if (action) {
        if (
          down &&
          (!playing() ||
            (event.target instanceof Element &&
              event.target.closest("button") &&
              event.code === "Space"))
        )
          return;
        if (!down && !held.has(`key:${event.code}`)) return;
        event.preventDefault();
        // A repeat after an interruption must not restore a cleared hold.
        if (down && event.repeat && !held.has(`key:${event.code}`)) return;
        if (down) held.set(`key:${event.code}`, action);
        else held.delete(`key:${event.code}`);
        sync();
      }
      if (
        down &&
        !event.repeat &&
        event.code === "Escape" &&
        sim.mode !== "title"
      ) {
        game.paused = !game.paused;
        setPaused(game.paused);
        clear();
        if (game.paused) void audio.context?.suspend();
        else startAudio(game);
      }
    };
    const down = (e: KeyboardEvent) => key(e, true);
    const up = (e: KeyboardEvent) => key(e, false);
    const blur = () => {
      clear();
      if (sim.mode === "playing" || sim.mode === "finishing") {
        game.paused = true;
        setPaused(true);
        void audio.context?.suspend();
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    window.addEventListener("pagehide", blur);
    window.addEventListener("orientationchange", blur);
    screen.orientation?.addEventListener("change", blur);
    root.addEventListener("touchstart", touchStart, { passive: false });
    root.addEventListener("pointerdown", pointerDown);
    root.addEventListener("contextmenu", contextMenu);
    document.addEventListener("touchmove", touchMove, {
      capture: true,
      passive: false,
    });
    document.addEventListener("touchend", touchEnd, true);
    document.addEventListener("touchcancel", touchEnd, true);
    document.addEventListener("pointermove", pointerMove, true);
    document.addEventListener("pointerup", pointerEnd, true);
    document.addEventListener("pointercancel", pointerEnd, true);
    document.addEventListener("lostpointercapture", pointerEnd, true);
    const visibility = () => {
      if (document.hidden) blur();
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
      window.removeEventListener("pagehide", blur);
      window.removeEventListener("orientationchange", blur);
      screen.orientation?.removeEventListener("change", blur);
      root.removeEventListener("touchstart", touchStart);
      root.removeEventListener("pointerdown", pointerDown);
      root.removeEventListener("contextmenu", contextMenu);
      document.removeEventListener("touchmove", touchMove, true);
      document.removeEventListener("touchend", touchEnd, true);
      document.removeEventListener("touchcancel", touchEnd, true);
      document.removeEventListener("pointermove", pointerMove, true);
      document.removeEventListener("pointerup", pointerEnd, true);
      document.removeEventListener("pointercancel", pointerEnd, true);
      document.removeEventListener("lostpointercapture", pointerEnd, true);
      document.removeEventListener("visibilitychange", visibility);
      clear();
      renderer.dispose();
      audio.dispose();
      runtime.current = null;
    };
  }, []);

  const start = () => {
    const game = runtime.current;
    if (!game) return;
    game.sim.reset();
    game.audio.resetMusic();
    game.clearInput();
    game.paused = false;
    setPaused(false);
    startAudio(game);
    (document.activeElement as HTMLElement)?.blur();
  };
  const pause = () => {
    const game = runtime.current;
    if (!game) return;
    game.paused = !game.paused;
    game.clearInput();
    setPaused(game.paused);
    if (game.paused) void game.audio.context?.suspend();
    else startAudio(game);
    (document.activeElement as HTMLElement)?.blur();
  };
  const mute = () => {
    if (runtime.current) runtime.current.audio.muted = !muted;
    setMuted(!muted);
  };
  const actionButton = (
    action: keyof Input,
    label: string,
    icon: React.ReactNode,
    tooltip: string,
  ) => (
    <button
      type="button"
      className={`control control-${action}`}
      data-control={action}
      aria-label={label}
      title={tooltip}
      onContextMenu={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
  const active = state.mode !== "title";
  const overlay = paused || ["dead", "won"].includes(state.mode);
  const minutes = Math.floor(state.elapsed / 60)
    .toString()
    .padStart(2, "0");
  const seconds = Math.floor(state.elapsed % 60)
    .toString()
    .padStart(2, "0");

  return (
    <main
      ref={surface}
      className={`game ${active ? "in-game" : "at-title"}`}
      onContextMenu={(e) => e.preventDefault()}
      onSelect={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
    >
      <div ref={host} className="world" />
      <div className="scanlines" />
      <header className="topbar">
        <div className="brand">
          {portrait && <img src={portrait} alt="" />}
          <span>
            SUPER
            <br />
            GOOMBA BROS
          </span>
        </div>
        {active && (
          <div className="counters" aria-label="Rescue counters">
            <div>
              <span>WARNED</span>
              <strong data-testid="warned">
                {String(state.warned).padStart(2, "0")}
                <small> / {T.population}</small>
              </strong>
            </div>
            <div className="saved-counter">
              <span>SAVED</span>
              <strong data-testid="saved">
                {String(state.saved).padStart(2, "0")}
                <small> / {T.required}</small>
              </strong>
            </div>
          </div>
        )}
        <div className="tools">
          <button
            onClick={mute}
            title={muted ? "Unmute" : "Mute"}
            aria-label={muted ? "Unmute" : "Mute"}
          >
            {muted ? <VolumeX /> : <Volume2 />}
          </button>
          {active && (
            <button
              onClick={pause}
              title={paused ? "Resume" : "Pause"}
              aria-label={paused ? "Resume" : "Pause"}
            >
              {paused ? <Play /> : <Pause />}
            </button>
          )}
        </div>
      </header>
      {!active && (
        <section className="title-screen" aria-label="Title screen">
          <p className="level-label">A LITTLE COURAGE. A BIG MUSTACHE.</p>
          <h1 aria-label="Super Goomba Bros">
            <span>SUPER</span>GOOMBA<span>BROS</span>
          </h1>
          <button className="primary" onClick={start} disabled={!!error}>
            <Play size={20} fill="currentColor" /> START GAME
          </button>
          <p className="edition">
            WORLD 1 <span>/</span> THE GREAT ESCAPE
          </p>
        </section>
      )}
      {active && (
        <>
          {state.power && (
            <div className="power-state" role="status">
              {state.power}
            </div>
          )}
          <div className="phase">
            <span>
              {state.phase === 2
                ? "FIRE MARIO"
                : state.phase === 1
                  ? "MARIO IS FASTER"
                  : "WORLD 1-1"}
            </span>
            <time>
              {minutes}:{seconds}
            </time>
          </div>
          {state.bubble && !overlay && (
            <div
              className="speech"
              style={{
                left: `${Math.max(15, Math.min(85, state.x))}%`,
                top: `${state.y}%`,
              }}
            >
              {state.bubble}
            </div>
          )}
          {state.doomed && state.mode === "playing" && (
            <div className="goal-message" role="status">
              TOO MANY LOST. THE GOAL IS LOCKED.
            </div>
          )}
          {!state.doomed &&
            state.progress > 0.92 &&
            state.mode === "playing" &&
            state.saved < T.required && (
              <div className="goal-message">
                <DoorOpen size={18} /> {T.required - state.saved} MORE RESCUES TO
                OPEN THE CASTLE DOOR
              </div>
            )}
          {state.mode === "finishing" && (
            <div className="finish-banner">
              <DoorOpen /> CASTLE REACHED!{" "}
              <span>LAST RESCUES: {Math.ceil(state.finishLeft)}</span>
            </div>
          )}
          <footer className="play-footer">
            <div className="journey">
              <span>THE GREAT ESCAPE</span>
              <div>
                <i style={{ width: `${state.progress * 100}%` }} />
              </div>
              <DoorOpen size={14} />
            </div>
            <div className="controls">
              <div className="movement">
                {actionButton(
                  "left",
                  "Left",
                  <ArrowLeft />,
                  "Walk left (Left / A)",
                )}
                {actionButton(
                  "right",
                  "Right",
                  <ArrowRight />,
                  "Walk right (Right / D)",
                )}
              </div>
              <div className="actions">
        {state.flower &&
                  actionButton("fire", "Fire", <Flame />, "Shoot fireball (Z)")}
                {actionButton(
                  "jump",
                  "Jump",
                  <ArrowUp />,
                  "Jump (Space / Up / W)",
                )}
              </div>
            </div>
          </footer>
        </>
      )}
      {overlay && (
        <section
          className={`overlay ${state.mode === "dead" && !paused ? "death-overlay" : ""}`}
          aria-label={paused ? "Paused" : "Result"}
        >
          {paused ? (
            <>
              <p className="level-label">TAKE A BREATHER</p>
              <h2>PAUSED</h2>
              <button className="primary" onClick={pause}>
                <Play size={20} /> RESUME
              </button>
              <button className="secondary" onClick={start}>
                <RotateCcw size={16} /> RESTART LEVEL
              </button>
            </>
          ) : state.mode === "dead" ? (
            <>
              <X className="death-icon" />
              <h2>STOMPED!</h2>
              <p>Back to the beginning...</p>
            </>
          ) : (
            <>
              <p className="level-label">THE BROTHERHOOD LIVES</p>
              <h2>
                SMALL FEET.
                <br />
                BIG HERO.
              </h2>
              <div className="final-counts">
                <div>
                  <strong>{state.warned}</strong>
                  <span>WARNED</span>
                </div>
                <div>
                  <strong>{state.saved}</strong>
                  <span>SAVED</span>
                </div>
              </div>
              <button className="primary" onClick={start}>
                <RotateCcw size={20} /> PLAY AGAIN
              </button>
            </>
          )}
        </section>
      )}
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
    </main>
  );
}
