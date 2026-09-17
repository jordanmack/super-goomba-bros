import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  Ban,
  DoorOpen,
  Gamepad,
  Gamepad2,
  Keyboard,
  Pause,
  Play,
  RotateCcw,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Simulation, emptyInput } from "./game/simulation";
import type { Input, Mode } from "./game/simulation";
import { PhaserGame } from "./game/phaser-game";
import { GameAudio } from "./game/audio";
import { TUNING as T } from "./game/config";
import { GameControls, KEY_BINDINGS, type PadAction } from "./game/controls";
import { CAMPAIGN } from "./game/levels";

type PadLayout = "compact" | "nes" | "hidden";
const PAD_LABEL: Record<PadLayout, string> = {
  compact: "Compact pad",
  nes: "NES pad",
  hidden: "Pad hidden",
};

type Runtime = {
  sim: Simulation;
  renderer: PhaserGame;
  audio: GameAudio;
  input: Input;
  pulses: Partial<Input>;
  paused: boolean;
  helpOpen: boolean;
  ignoreEscapeUntilUp: boolean;
  clearInput: () => void;
};
type Snapshot = {
  mode: Mode;
  warned: number;
  saved: number;
  died: number;
  coins: number;
  lives: number;
  living: number;
  elapsed: number;
  doomed: boolean;
  power: string;
  flower: boolean;
  door: boolean;
  shouts: {
    x: number;
    y: number;
    lines: { id: number; text: string }[];
  }[];
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
  died: 0,
  coins: 0,
  lives: T.startingLives,
  living: T.population,
  elapsed: 0,
  doomed: false,
  power: "",
  flower: false,
  door: true,
  shouts: [],
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
  const [padLayout, setPadLayout] = useState<PadLayout>("compact");
  const [helpOpen, setHelpOpen] = useState(false);
  const helpButton = useRef<HTMLButtonElement>(null);
  const helpCloseButton = useRef<HTMLButtonElement>(null);
  const helpWasOpen = useRef(false);
  useLayoutEffect(() => {
    if (helpOpen) helpCloseButton.current?.focus({ preventScroll: true });
    else if (helpWasOpen.current) helpButton.current?.focus();
    helpWasOpen.current = helpOpen;
  }, [helpOpen]);
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
        helpOpen: false,
        ignoreEscapeUntilUp: false,
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
            () => {
              game.helpOpen = false;
              setHelpOpen(false);
              if (!game.paused && sim.mode === "playing") startAudio(game);
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
        ticks = 0,
        lastShoutCount = 0;
      const update = (now: number, frameDelta: number) => {
        const delta = Math.min(0.1, frameDelta / 1000);
        const frozen = game.paused || game.helpOpen;
        renderer.game.anims.globalTimeScale = frozen ? 0 : 1;
        if (!frozen) {
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
        const clusters: {
          worldX: number;
          worldY: number;
          lines: { id: number; text: string }[];
        }[] = [];
        for (const shout of sim.shouts) {
          const cluster = clusters.find(
            (entry) =>
              Math.abs(entry.worldX - shout.x) < 32 &&
              Math.abs(entry.worldY - shout.y) < 32,
          );
          if (cluster) cluster.lines.push({ id: shout.id, text: shout.text });
          else
            clusters.push({
              worldX: shout.x,
              worldY: shout.y,
              lines: [{ id: shout.id, text: shout.text }],
            });
        }
        const shouts = clusters.map((cluster) => {
          const point = renderer.screen(cluster.worldX, cluster.worldY, sim);
          return { x: point.x, y: point.y, lines: cluster.lines };
        });
        if (ticks++ % 4 === 0 || sim.shouts.length || lastShoutCount) {
          lastShoutCount = sim.shouts.length;
          const p = sim.player.body.position;
          setState({
            mode: sim.mode,
            warned: sim.warned,
            saved: sim.saved,
            died: sim.died(),
            coins: sim.coins,
            lives: sim.lives,
            living: sim.living(),
            elapsed: sim.elapsed,
            doomed: sim.doomed,
            power: [
              sim.player.starLeft > 0
                ? `STAR ${Math.ceil(sim.player.starLeft)}s`
                : "",
              sim.player.scale >= T.hugeScale
                ? `HUGE ${Math.ceil(sim.player.hugeLeft)}s`
                : sim.player.scale > 1
                  ? "GIANT"
                  : "",
              sim.player.flower ? "FIRE: B" : "",
            ]
              .filter(Boolean)
              .join(" / "),
            flower: sim.player.flower,
            door:
              !!sim.activeRoom.data.goal &&
              sim.activeRoom.data.goal.kind !== "pipe",
            shouts,
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

  const enterLevel = (opts?: { lives?: number; levelIndex?: number }) => {
    const game = runtime.current;
    if (!game || !ready) return;
    if (opts?.levelIndex !== undefined) game.sim.levelIndex = opts.levelIndex;
    if (opts?.lives !== undefined) game.sim.lives = opts.lives;
    game.sim.reset("intro");
    game.audio.resetMusic();
    game.clearInput();
    game.paused = false;
    setPaused(false);
    game.helpOpen = false;
    setHelpOpen(false);
    startAudio(game);
    (document.activeElement as HTMLElement)?.blur();
  };
  const start = () => enterLevel({ lives: T.startingLives });
  const restartLevel = () => {
    const game = runtime.current;
    if (!game || game.sim.lives <= 0) return;
    enterLevel();
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
    game.helpOpen = false;
    setHelpOpen(false);
    startAudio(game);
    (document.activeElement as HTMLElement)?.blur();
  };
  const replay = () => enterLevel({ lives: T.startingLives, levelIndex: 0 });
  const mute = () => {
    if (runtime.current) runtime.current.audio.muted = !muted;
    setMuted(!muted);
  };
  const closeHelp = () => {
    setHelpOpen(false);
    const game = runtime.current;
    if (game) {
      game.helpOpen = false;
      if (!game.paused && game.sim.mode === "playing") startAudio(game);
    }
  };
  const toggleHelp = () => {
    if (helpOpen) {
      closeHelp();
      return;
    }
    setHelpOpen(true);
    const game = runtime.current;
    if (game) {
      game.helpOpen = true;
      game.clearInput();
      if (!game.paused && game.sim.mode === "playing") game.audio.pause();
    }
    (document.activeElement as HTMLElement)?.blur();
  };
  const actionButton = (
    action: PadAction,
    label: string,
    icon: React.ReactNode,
    tooltip: string,
    extraClass = "",
  ) => (
    <button
      type="button"
      className={`control control-${action} ${extraClass}`.trim()}
      data-control={action}
      aria-label={label}
      title={tooltip}
      onContextMenu={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
    >
      {icon}
      {!extraClass.includes("nes-hit") &&
        !extraClass.includes("dpad-") &&
        label && <span>{label}</span>}
    </button>
  );
  const cyclePad = () => {
    setPadLayout((layout) =>
      layout === "compact" ? "nes" : layout === "nes" ? "hidden" : "compact",
    );
    runtime.current?.clearInput();
    (document.activeElement as HTMLElement)?.blur();
  };
  const active = state.mode !== "title";
  const playing =
    state.mode === "playing" ||
    state.mode === "finishing" ||
    state.mode === "dead" ||
    state.mode === "won";
  const interstitial = state.mode === "intro" || state.mode === "gameover";
  const padOpen = playing && padLayout !== "hidden";
  useLayoutEffect(() => {
    if (!ready) return;
    runtime.current?.renderer.resize();
  }, [ready, padOpen]);
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
      className={`game ${active ? "in-game" : "at-title"}${interstitial ? " at-intro" : ""}`}
      onContextMenu={(e) => e.preventDefault()}
      onSelect={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
    >
      <div className="playfield" inert={helpOpen || undefined}>
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
            <div className="died-counter">
              <span>DIED</span>
              <strong data-testid="died">
                {String(state.died).padStart(2, "0")}
              </strong>
            </div>
            <div className="coin-counter">
              <span>COINS</span>
              <strong data-testid="coins">
                {String(state.coins).padStart(2, "0")}
              </strong>
            </div>
            <div className="lives-counter">
              <span>LIVES</span>
              <strong data-testid="lives">
                {String(state.lives).padStart(2, "0")}
              </strong>
            </div>
          </div>
        )}
        <div className="tools">
          <button
            ref={helpButton}
            onClick={toggleHelp}
            title="Key bindings"
            aria-label="Key bindings"
            aria-expanded={helpOpen}
            aria-haspopup="dialog"
          >
            <Keyboard />
          </button>
          <button
            onClick={cyclePad}
            title={PAD_LABEL[padLayout]}
            aria-label={PAD_LABEL[padLayout]}
          >
            {padLayout === "hidden" ? (
              <Ban />
            ) : padLayout === "nes" ? (
              <Gamepad />
            ) : (
              <Gamepad2 />
            )}
          </button>
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
          {playing && (
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
      {!active && !helpOpen && (
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
          {!overlay &&
            state.shouts.map((stack) => (
              <div
                key={stack.lines[0]!.id}
                className="speech-stack"
                style={{ left: `${stack.x}%`, top: `${stack.y}%` }}
              >
                {stack.lines.map((line) => (
                  <div key={line.id} className="speech">
                    {line.text}
                  </div>
                ))}
              </div>
            ))}
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
        </>
      )}
      </div>
      {padOpen && (
            <footer className="play-footer" inert={helpOpen || undefined}>
              <div className="journey">
                <span>THE GREAT ESCAPE</span>
                <div>
                  <i style={{ width: `${state.progress * 100}%` }} />
                </div>
                <DoorOpen size={14} />
              </div>
              <div
                className={`controls layout-${padLayout}`}
                aria-label={
                  padLayout === "nes" ? "NES controller" : "Compact controller"
                }
              >
                {padLayout === "compact" ? (
                  <>
                    <div className="dpad">
                      {actionButton(
                        "jump",
                        "Up",
                        <ArrowUp />,
                        "Up / Jump (Up / W)",
                        "dpad-up",
                      )}
                      {actionButton(
                        "left",
                        "Left",
                        <ArrowLeft />,
                        "Walk left (Left / A)",
                        "dpad-left",
                      )}
                      {actionButton(
                        "down",
                        "Down",
                        <ArrowDown />,
                        "Enter pipe (Down / S)",
                        "dpad-down",
                      )}
                      {actionButton(
                        "right",
                        "Right",
                        <ArrowRight />,
                        "Walk right (Right / D)",
                        "dpad-right",
                      )}
                    </div>
                    <div className="face-buttons">
                      {actionButton(
                        "run",
                        "B",
                        null,
                        "Run and fire (Shift / Z / J)",
                        "face-b",
                      )}
                      {actionButton(
                        "jump",
                        "A",
                        null,
                        "Jump (Space / K)",
                        "face-a",
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <NesPadArt />
                    {actionButton("up", "Up", null, "Up", "nes-hit nes-up")}
                    {actionButton(
                      "left",
                      "Left",
                      null,
                      "Walk left (Left / A)",
                      "nes-hit nes-left",
                    )}
                    {actionButton(
                      "down",
                      "Down",
                      null,
                      "Enter pipe (Down / S)",
                      "nes-hit nes-down",
                    )}
                    {actionButton(
                      "right",
                      "Right",
                      null,
                      "Walk right (Right / D)",
                      "nes-hit nes-right",
                    )}
                    {actionButton(
                      "select",
                      "Select",
                      null,
                      "Select",
                      "nes-hit nes-select",
                    )}
                    {actionButton(
                      "start",
                      "Start",
                      null,
                      "Pause (Start)",
                      "nes-hit nes-start",
                    )}
                    {actionButton(
                      "run",
                      "B",
                      null,
                      "Run and fire (Shift / Z / J)",
                      "nes-hit nes-b",
                    )}
                    {actionButton(
                      "jump",
                      "A",
                      null,
                      "Jump (Space / K)",
                      "nes-hit nes-a",
                    )}
                  </>
                )}
              </div>
            </footer>
      )}
      {interstitial && !paused && (
        <section
          className="overlay interstitial-overlay"
          aria-label={state.mode === "gameover" ? "Game over" : "World intro"}
        >
          {state.mode === "gameover" ? (
            <h2>GAME OVER</h2>
          ) : (
            <>
              <p className="intro-world">WORLD {state.level}</p>
              <div className="intro-lives">
                {portrait && <img src={portrait} alt="" />}
                <span>× {String(state.lives).padStart(2, "0")}</span>
              </div>
            </>
          )}
        </section>
      )}
      {overlay && !helpOpen && (
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
              <button className="secondary" onClick={restartLevel}>
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
                <div>
                  <strong data-testid="result-died">{state.died}</strong>
                  <span>DIED</span>
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
      {helpOpen && (
        <section
          className="overlay help-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="help-title"
        >
          <p className="level-label">KEYBOARD</p>
          <h2 id="help-title">KEY BINDINGS</h2>
          <dl className="bindings">
            {KEY_BINDINGS.map((row) => (
              <div key={row.action}>
                <dt>{row.action}</dt>
                <dd>{row.keys}</dd>
              </div>
            ))}
          </dl>
          <button
            ref={helpCloseButton}
            className="primary"
            onClick={closeHelp}
          >
            CLOSE
          </button>
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

function NesPadArt() {
  return (
    <svg
      className="nes-pad-art"
      viewBox="0 0 400 168"
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="8" y="28" width="384" height="124" rx="18" fill="#c8c8c8" />
      <rect x="12" y="32" width="376" height="116" rx="16" fill="#d8d8d8" />
      <rect x="12" y="32" width="376" height="18" rx="8" fill="#b0b0b0" />
      <rect x="22" y="48" width="108" height="88" rx="44" fill="#bcbcbc" />
      <rect x="56" y="58" width="40" height="68" rx="8" fill="#2a2a2a" />
      <rect x="36" y="78" width="80" height="28" rx="8" fill="#2a2a2a" />
      <rect x="64" y="66" width="24" height="52" rx="4" fill="#1a1a1a" />
      <rect x="48" y="84" width="56" height="16" rx="4" fill="#1a1a1a" />
      <circle cx="76" cy="92" r="7" fill="#444" />
      <rect x="150" y="86" width="36" height="14" rx="7" fill="#6a1010" />
      <rect x="196" y="86" width="36" height="14" rx="7" fill="#6a1010" />
      <text
        x="168"
        y="80"
        textAnchor="middle"
        fill="#5a5a5a"
        fontSize="8"
        fontFamily="monospace"
      >
        SELECT
      </text>
      <text
        x="214"
        y="80"
        textAnchor="middle"
        fill="#5a5a5a"
        fontSize="8"
        fontFamily="monospace"
      >
        START
      </text>
      <circle cx="292" cy="100" r="22" fill="#8a1818" />
      <circle cx="292" cy="100" r="18" fill="#c42828" />
      <circle cx="348" cy="78" r="22" fill="#8a1818" />
      <circle cx="348" cy="78" r="18" fill="#c42828" />
      <text
        x="292"
        y="132"
        textAnchor="middle"
        fill="#5a5a5a"
        fontSize="11"
        fontFamily="monospace"
      >
        B
      </text>
      <text
        x="348"
        y="110"
        textAnchor="middle"
        fill="#5a5a5a"
        fontSize="11"
        fontFamily="monospace"
      >
        A
      </text>
    </svg>
  );
}
