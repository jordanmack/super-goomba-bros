import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  DoorOpen,
  Pause,
  Play,
  RotateCcw,
  Volume2,
  VolumeX,
  Flame,
} from "lucide-react";
import { Simulation, emptyInput } from "./game/simulation";
import type { Input, Mode } from "./game/simulation";
import { PhaserGame } from "./game/phaser-game";
import { GameAudio } from "./game/audio";
import { TUNING as T } from "./game/config";
import { GameControls } from "./game/controls";
import { CAMPAIGN } from "./game/levels";

type Runtime = {
  sim: Simulation;
  renderer: PhaserGame;
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
  coins: number;
  living: number;
  elapsed: number;
  doomed: boolean;
  power: string;
  flower: boolean;
  door: boolean;
  bubble: string;
  x: number;
  y: number;
  cooldown: number;
  finishLeft: number;
  progress: number;
  level: string;
  lastLevel: boolean;
};
const initial: Snapshot = {
  mode: "title",
  warned: 0,
  saved: 0,
  coins: 0,
  living: T.population,
  elapsed: 0,
  doomed: false,
  power: "",
  flower: false,
  door: true,
  bubble: "",
  x: 0,
  y: 0,
  cooldown: 0,
  finishLeft: 0,
  progress: 0,
  level: "1-1",
  lastLevel: false,
};
export default function App() {
  const surface = useRef<HTMLElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const runtime = useRef<Runtime | null>(null);
  const [state, setState] = useState(initial);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const [audioUnavailable, setAudioUnavailable] = useState(false);
  const [error, setError] = useState("");
  const [portrait, setPortrait] = useState("");
  const [ready, setReady] = useState(false);
  const startAudio = (game: Runtime) => {
    void game.audio.start().catch(() => {
      game.audio.disable();
      setMuted(true);
      setAudioUnavailable(true);
    });
  };

  useEffect(() => {
    let stopped = false;
    let cleanup: (() => void) | undefined;
    const initialize = () => {
      let renderer: PhaserGame;
      try {
        renderer = new PhaserGame(host.current!);
      } catch {
        queueMicrotask(() =>
          setError(
            "WebGL could not start. Please enable hardware acceleration and reload.",
          ),
        );
        return;
      }
      const sim = new Simulation();
      if (import.meta.env.DEV) {
        const requested = new URLSearchParams(location.search).get("level");
        const index = CAMPAIGN.findIndex((level) => level.id === requested);
        if (index >= 0) {
          sim.levelIndex = index;
          sim.reset("title");
        }
      }
      const audio = new GameAudio(renderer.game);
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
      let disposed = false;
      let controls: GameControls | undefined;
      void renderer.ready
        .then(() => {
          if (disposed) return;
          renderer.bindPhysics(sim.physics);
          controls = new GameControls(
            renderer.play!.input,
            surface.current!,
            game,
            () => {
              game.paused = !game.paused;
              setPaused(game.paused);
              game.clearInput();
              if (game.paused) audio.pause();
              else startAudio(game);
            },
            () => {
              if (sim.mode === "playing" || sim.mode === "finishing") {
                game.paused = true;
                setPaused(true);
                audio.pause();
              }
            },
          );
          game.clearInput = () => controls?.clear();
          setPortrait(renderer.game.registry.get("portrait"));
          if (!audio.available) {
            audio.disable();
            setMuted(true);
            setAudioUnavailable(true);
          }
          setReady(true);
          renderer.play!.tick = update;
        })
        .catch((error: Error) => {
          if (!disposed) setError(error.message);
        });
      // Development-only access supports deterministic browser checks, never the built game.
      if (import.meta.env.DEV)
        (window as unknown as { __game: Runtime }).__game = game;
      let accumulator = 0,
        ticks = 0;
      const update = (now: number, frameDelta: number) => {
        const delta = Math.min(0.1, frameDelta / 1000);
        renderer.game.anims.globalTimeScale = game.paused ? 0 : 1;
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
            sim.activeRoom.data.type,
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
            coins: sim.coins,
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
            door:
              !!sim.activeRoom.data.goal &&
              sim.activeRoom.data.goal.kind !== "pipe",
            bubble: sim.bubbleLeft > 0 ? sim.bubble : "",
            x: point.x,
            y: point.y,
            cooldown: sim.cooldown,
            finishLeft: sim.finishLeft,
            progress: Math.min(
              1,
              (p.x - sim.activeRoom.offset) /
                (sim.goalX - sim.activeRoom.offset),
            ),
            level: sim.level.id,
            lastLevel: sim.levelIndex === 31,
          });
        }
      };
      return () => {
        disposed = true;
        controls?.dispose();
        audio.dispose();
        renderer.dispose();
        runtime.current = null;
      };
    };
    // React's development probe must not create and immediately close an
    // AudioContext while Phaser is decoding its preload queue.
    queueMicrotask(() => {
      if (!stopped) cleanup = initialize();
    });
    return () => {
      stopped = true;
      cleanup?.();
    };
  }, []);

  const start = () => {
    const game = runtime.current;
    if (!game || !ready) return;
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
    if (game.paused) game.audio.pause();
    else startAudio(game);
    (document.activeElement as HTMLElement)?.blur();
  };
  const nextLevel = () => {
    const game = runtime.current;
    if (!game) return;
    game.sim.nextLevel();
    game.clearInput();
    game.audio.resetMusic(true);
    game.paused = false;
    setPaused(false);
    startAudio(game);
    (document.activeElement as HTMLElement)?.blur();
  };
  const replay = () => {
    if (runtime.current) runtime.current.sim.levelIndex = 0;
    start();
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
  const overlay = paused || state.mode === "won";
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
          <div className="counters" aria-label="Game counters">
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
            <div className="coin-counter">
              <span>COINS</span>
              <strong data-testid="coins">
                {String(state.coins).padStart(2, "0")}
              </strong>
            </div>
          </div>
        )}
        <div className="tools">
          <button
            onClick={mute}
            disabled={audioUnavailable}
            title={
              audioUnavailable
                ? "Audio unavailable. Reload to try sound again."
                : muted
                  ? "Unmute"
                  : "Mute"
            }
            aria-label={
              audioUnavailable ? "Audio unavailable" : muted ? "Unmute" : "Mute"
            }
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
          <button
            className="primary"
            onClick={start}
            disabled={!!error || !ready}
          >
            <Play size={20} fill="currentColor" />{" "}
            {ready ? "START GAME" : "LOADING..."}
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
            <span>WORLD {state.level}</span>
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
            state.door &&
            state.progress > 0.92 &&
            state.mode === "playing" &&
            state.saved < T.required && (
              <div className="goal-message">
                <DoorOpen size={18} /> {T.required - state.saved} MORE RESCUES
                TO OPEN THE CASTLE DOOR
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
                {actionButton(
                  "down",
                  "Pipe",
                  <ArrowDown />,
                  "Enter pipe (Down / S)",
                )}
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
          className="overlay"
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
              <button
                className="primary"
                onClick={state.lastLevel ? replay : nextLevel}
              >
                <Play size={20} />{" "}
                {state.lastLevel ? "PLAY AGAIN" : "NEXT LEVEL"}
              </button>
              {!state.lastLevel && (
                <button className="secondary" onClick={start}>
                  <RotateCcw size={16} /> PLAY AGAIN
                </button>
              )}
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
