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
import { ENDING_LINE, Simulation, emptyInput } from "./game/simulation";
import type { Input, ItemKind, Mode, TallyPhase } from "./game/simulation";
import { PhaserGame } from "./game/phaser-game";
import { GameAudio } from "./game/audio";
import { TUNING as T } from "./game/config";
import { GameControls, KEY_BINDINGS, type PadAction } from "./game/controls";
import { CAMPAIGN, campaignIndex } from "./game/levels";
import {
  TITLE_STAGES,
  TITLE_WORLDS,
  backTitlePick,
  cheatTrayOpen,
  closeTitlePick,
  initialTitleCheat,
  openWorldPick,
  selectWorld,
  startTitleCampaign,
  titleStartAllowed,
  toggleUnlimited,
  unlockTitleCheat,
} from "./game/title-cheat";
import {
  bindingLabel,
  defaultPadMap,
  GAMEPAD_BINDINGS,
  PAD_REMAP_LABELS,
  type PadBinding,
  type PadMapAction,
} from "./game/gamepad-map";
import {
  CHEAT_ITEM_LABELS,
  CHEAT_ITEMS,
} from "./game/spawn-cell";

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
  padMap: Record<PadMapAction, PadBinding>;
  remapTarget: PadMapAction | null;
  clearInput: () => void;
  leaveEnding: () => void;
  controls?: GameControls;
};
type Snapshot = {
  mode: Mode;
  warned: number;
  saved: number;
  died: number;
  coins: number;
  score: number;
  lives: number;
  living: number;
  elapsed: number;
  flower: boolean;
  door: boolean;
  shouts: {
    x: number;
    y: number;
    lines: { id: number; text: string }[];
  }[];
  cooldown: number;
  timeLeft: number;
  tallyPhase: TallyPhase;
  marioKills: number;
  flagClaim: boolean;
  progress: number;
  level: string;
};
const initial: Snapshot = {
  mode: "title",
  warned: 0,
  saved: 0,
  died: 0,
  coins: 0,
  score: 0,
  lives: T.startingLives,
  living: T.population,
  elapsed: 0,
  flower: false,
  door: true,
  shouts: [],
  cooldown: 0,
  timeLeft: 400,
  tallyPhase: "",
  marioKills: 0,
  flagClaim: false,
  progress: 0,
  level: "1-1",
};
const TALLY_LINES = ["warned", "saved", "died", "flag", "mario"] as const;
function formatScore(n: number) {
  const body = String(Math.abs(n)).padStart(6, "0");
  return n < 0 ? `-${body}` : body;
}
function tallyVisible(phase: TallyPhase, line: (typeof TALLY_LINES)[number]) {
  if (phase === "ending") return true;
  const shown = TALLY_LINES.indexOf(phase as (typeof TALLY_LINES)[number]);
  const want = TALLY_LINES.indexOf(line);
  return shown >= 0 && want >= 0 && shown >= want;
}
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
  const [titleCheat, setTitleCheat] = useState(initialTitleCheat);
  const titleCheatRef = useRef(titleCheat);
  const [itemIcons, setItemIcons] = useState<Record<string, string>>({});
  const [padMap, setPadMap] = useState(defaultPadMap);
  const [remapTarget, setRemapTarget] = useState<PadMapAction | null>(null);
  const hidPad = useRef(false);
  const helpButton = useRef<HTMLButtonElement>(null);
  const helpCloseButton = useRef<HTMLButtonElement>(null);
  const helpWasOpen = useRef(false);
  useLayoutEffect(() => {
    if (helpOpen) helpCloseButton.current?.focus({ preventScroll: true });
    else if (helpWasOpen.current) helpButton.current?.focus();
    helpWasOpen.current = helpOpen;
  }, [helpOpen]);
  useEffect(() => {
    titleCheatRef.current = titleCheat;
  }, [titleCheat]);
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
        padMap: defaultPadMap(),
        remapTarget: null,
        clearInput: () => {},
        leaveEnding: () => {},
      };
      runtime.current = game;
      let disposed = false;
      let controls: GameControls | undefined;
      void renderer.ready
        .then(() => {
          if (disposed) return;
          renderer.bindPhysics(sim.physics);
          let sonamiDone = false;
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
              if (sim.mode === "playing") {
                game.paused = true;
                setPaused(true);
                audio.pause();
              }
            },
            () => {
              game.helpOpen = false;
              setHelpOpen(false);
              game.controls?.cancelRemap();
              if (!game.paused && sim.mode === "playing") startAudio(game);
            },
            {
              onSonami: () => {
                if (sonamiDone) return;
                sonamiDone = true;
                setTitleCheat(unlockTitleCheat);
                void game.audio
                  .start()
                  .then(() => game.audio.event("coin"))
                  .catch(() => {});
              },
              onTitleStart: () => {
                if (game.sim.mode !== "title") return;
                if (!titleStartAllowed(titleCheatRef.current)) return;
                setTitleCheat(closeTitlePick);
                game.sim.lives = T.startingLives;
                game.sim.reset("intro");
                game.audio.resetMusic();
                game.clearInput();
                game.paused = false;
                setPaused(false);
                game.helpOpen = false;
                setHelpOpen(false);
                startAudio(game);
                (document.activeElement as HTMLElement)?.blur();
              },
              onEndingTitle: () => game.leaveEnding(),
              onGamepadUse: () => {
                if (hidPad.current) return;
                hidPad.current = true;
                setPadLayout("hidden");
              },
              onPadMapChange: (map) => {
                game.padMap = map;
                setPadMap(map);
              },
              onRemapChange: (target) => {
                game.remapTarget = target;
                setRemapTarget(target);
              },
            },
          );
          game.controls = controls;
          game.clearInput = () => controls?.clear();
          game.leaveEnding = () => {
            if (sim.mode !== "finishing" || sim.tallyPhase !== "ending") return;
            sim.leaveEnding();
            audio.resetMusic();
            game.clearInput();
            game.paused = false;
            setPaused(false);
            game.helpOpen = false;
            setHelpOpen(false);
            (document.activeElement as HTMLElement)?.blur();
          };
          setPortrait(renderer.game.registry.get("portrait"));
          setItemIcons(renderer.game.registry.get("itemIcons") ?? {});
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
        controls?.poll();
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
          audio.syncVictory(sim.victoryLoop);
          audio.update(sim.mode === "playing", sim.musicKey(), sim.hurry);
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
        if (
          ticks++ % 4 === 0 ||
          sim.shouts.length ||
          lastShoutCount ||
          sim.mode === "finishing"
        ) {
          lastShoutCount = sim.shouts.length;
          const p = sim.player.body.position;
          setState({
            mode: sim.mode,
            warned: sim.warned,
            saved: sim.saved,
            died: sim.died(),
            coins: sim.coins,
            score: sim.score,
            lives: sim.lives,
            living: sim.living(),
            elapsed: sim.elapsed,
            flower: sim.player.flower,
            door:
              !!sim.activeRoom.data.goal &&
              sim.activeRoom.data.goal.kind !== "pipe",
            shouts,
            cooldown: sim.cooldown,
            timeLeft: sim.timeLeft,
            tallyPhase: sim.tallyPhase,
            marioKills: sim.marioKills,
            flagClaim: sim.playerClaimedFlag(),
            progress: Math.min(
              1,
              (p.x - sim.activeRoom.offset) /
                (sim.goalX - sim.activeRoom.offset),
            ),
            level: sim.level.id,
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

  const afterEnter = (game: Runtime) => {
    game.audio.resetMusic();
    game.clearInput();
    game.paused = false;
    setPaused(false);
    game.helpOpen = false;
    setHelpOpen(false);
    startAudio(game);
    (document.activeElement as HTMLElement)?.blur();
  };
  const enterLevel = (opts?: { lives?: number; levelIndex?: number }) => {
    const game = runtime.current;
    if (!game || !ready) return;
    if (opts?.levelIndex !== undefined) game.sim.levelIndex = opts.levelIndex;
    if (opts?.lives !== undefined) game.sim.lives = opts.lives;
    game.sim.reset("intro");
    afterEnter(game);
  };
  const start = () => enterLevel({ lives: T.startingLives });
  const startStage = (world: number, stage: number) => {
    const game = runtime.current;
    if (!game || !ready) return;
    startTitleCampaign(game.sim, campaignIndex(world, stage));
    setTitleCheat(closeTitlePick);
    afterEnter(game);
  };
  const restartLevel = () => {
    const game = runtime.current;
    if (!game || game.sim.lives <= 0) return;
    enterLevel();
  };
  const leaveEnding = () => runtime.current?.leaveEnding();
  const pause = () => {
    const game = runtime.current;
    if (!game || game.sim.mode === "finishing") return;
    game.paused = !game.paused;
    game.clearInput();
    setPaused(game.paused);
    if (game.paused) game.audio.pause();
    else startAudio(game);
    (document.activeElement as HTMLElement)?.blur();
  };
  const mute = () => {
    if (runtime.current) runtime.current.audio.muted = !muted;
    setMuted(!muted);
  };
  const closeHelp = () => {
    setHelpOpen(false);
    const game = runtime.current;
    if (game) {
      game.helpOpen = false;
      game.controls?.cancelRemap();
      if (!game.paused && game.sim.mode === "playing") startAudio(game);
    }
  };
  const dropCheat = (kind: ItemKind) => {
    const game = runtime.current;
    if (!game || game.paused) return;
    game.sim.dropCheatItem(kind);
    (document.activeElement as HTMLElement)?.blur();
  };
  const toggleHelp = () => {
    if (runtime.current?.sim.mode === "finishing") return;
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
  const overlay = paused;
  const pickedWorld = titleCheat.world;

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
          <div className="smb-hud counters" aria-label="Game status">
            <div>
              <span>GOOMBA</span>
              <strong data-testid="score">{formatScore(state.score)}</strong>
            </div>
            <div>
              <span>COINS</span>
              <strong data-testid="coins">
                {String(state.coins).padStart(2, "0")}
              </strong>
            </div>
            <div>
              <span>WORLD</span>
              <strong data-testid="world">{state.level}</strong>
            </div>
            <div>
              <span>TIME</span>
              <strong data-testid="time">
                {String(Math.max(0, state.timeLeft)).padStart(3, "0")}
              </strong>
            </div>
          </div>
        )}
        <div className="tools">
          <button
            ref={helpButton}
            onClick={toggleHelp}
            disabled={state.mode === "finishing"}
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
          {playing && state.mode !== "finishing" && (
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
      {cheatTrayOpen(titleCheat, state.mode) && (
        <div
          className="cheat-tray"
          role="toolbar"
          aria-label="Power-up tray"
          inert={paused || helpOpen || undefined}
        >
          {CHEAT_ITEMS.map((kind) => (
            <button
              key={kind}
              type="button"
              className="cheat-item"
              aria-label={CHEAT_ITEM_LABELS[kind]}
              title={CHEAT_ITEM_LABELS[kind]}
              onClick={() => dropCheat(kind)}
            >
              {itemIcons[kind] ? (
                <img src={itemIcons[kind]} alt="" />
              ) : (
                <span>{CHEAT_ITEM_LABELS[kind]}</span>
              )}
            </button>
          ))}
        </div>
      )}
      {!active && !helpOpen && (
        <section
          className={`title-screen${titleCheat.unlocked ? " title-unlocked" : ""}`}
          aria-label="Title screen"
        >
          <p className="level-label">A LITTLE COURAGE. A BIG MUSTACHE.</p>
          <h1 aria-label="Super Goomba Bros">
            <span>SUPER</span>GOOMBA<span>BROS</span>
          </h1>
          {titleCheat.pick === "title" && (
            <>
              <button
                className="primary"
                onClick={start}
                disabled={!!error || !ready}
              >
                <Play size={20} fill="currentColor" />{" "}
                {ready ? "START GAME" : "LOADING..."}
              </button>
              {titleCheat.unlocked && (
                <div className="title-cheats">
                  <button
                    type="button"
                    className="title-cheat"
                    aria-pressed={titleCheat.unlimited}
                    onClick={() => setTitleCheat(toggleUnlimited)}
                  >
                    Unlimited power-ups {titleCheat.unlimited ? "ON" : "OFF"}
                  </button>
                  <button
                    type="button"
                    className="title-cheat"
                    onClick={() => {
                      // The pad polls before the effect syncs the ref, so a
                      // Start in this frame would otherwise launch 1-1.
                      titleCheatRef.current = openWorldPick(
                        titleCheatRef.current,
                      );
                      setTitleCheat(openWorldPick);
                    }}
                  >
                    Choose stage
                  </button>
                </div>
              )}
            </>
          )}
          {titleCheat.pick === "world" && (
            <>
              <p className="level-label">Select world</p>
              <div className="title-pick" role="group" aria-label="Select world">
                {TITLE_WORLDS.map((world) => (
                  <button
                    key={world}
                    type="button"
                    className="title-cheat"
                    onClick={() =>
                      setTitleCheat((cheat) => selectWorld(cheat, world))
                    }
                  >
                    World {world}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="secondary title-back"
                onClick={() => {
                  titleCheatRef.current = backTitlePick(titleCheatRef.current);
                  setTitleCheat(backTitlePick);
                }}
              >
                Back
              </button>
            </>
          )}
          {titleCheat.pick === "stage" && pickedWorld != null && (
            <>
              <p className="level-label">Choose the stage</p>
              <div
                className="title-pick"
                role="group"
                aria-label="Choose the stage"
              >
                {TITLE_STAGES.map((stage) => (
                  <button
                    key={stage}
                    type="button"
                    className="title-cheat"
                    onClick={() => startStage(pickedWorld, stage)}
                  >
                    Stage {stage}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="secondary title-back"
                onClick={() => {
                  titleCheatRef.current = backTitlePick(titleCheatRef.current);
                  setTitleCheat(backTitlePick);
                }}
              >
                Back
              </button>
            </>
          )}
        </section>
      )}
      {active && (
        <>
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
          {state.mode === "finishing" && state.tallyPhase !== "time" && (
            <div className="tally" aria-label="Stage tally">
              {tallyVisible(state.tallyPhase, "warned") && (
                <div data-testid="tally-warned">
                  WARNED {String(state.warned).padStart(2, "0")} × {T.warnedScore}
                </div>
              )}
              {tallyVisible(state.tallyPhase, "saved") && (
                <div data-testid="tally-saved">
                  SAVED {String(state.saved).padStart(2, "0")} × {T.savedScore}
                </div>
              )}
              {tallyVisible(state.tallyPhase, "died") && (
                <div data-testid="tally-died">
                  DIED {String(state.died).padStart(2, "0")} × {T.diedScore}
                </div>
              )}
              {tallyVisible(state.tallyPhase, "flag") && (
                <div data-testid="tally-flag">
                  FLAG {state.flagClaim ? 1 : 0} × {T.flagScore}
                </div>
              )}
              {tallyVisible(state.tallyPhase, "mario") && (
                <div data-testid="tally-mario">
                  MARIO {state.marioKills} × {T.marioScore}
                </div>
              )}
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
                        "up",
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
      {state.mode === "finishing" && state.tallyPhase === "ending" && !paused && (
        <section className="overlay ending-overlay" aria-label="Ending">
          <h2>{ENDING_LINE}</h2>
          <p className="ending-score" data-testid="ending-score">
            SCORE {formatScore(state.score)}
          </p>
          <button type="button" className="primary" onClick={leaveEnding}>
            TITLE
          </button>
        </section>
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
                <span data-testid="lives">
                  × {String(state.lives).padStart(2, "0")}
                </span>
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
          {paused && (
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
          <p className="level-label">GAMEPAD</p>
          <dl className="bindings">
            {GAMEPAD_BINDINGS.map((row) => (
              <div key={row.action}>
                <dt>{row.action}</dt>
                <dd>{row.keys}</dd>
              </div>
            ))}
          </dl>
          <div className="remap-list">
            {(Object.keys(PAD_REMAP_LABELS) as PadMapAction[]).map((action) => (
              <button
                key={action}
                type="button"
                className={
                  remapTarget === action ? "remap-row listening" : "remap-row"
                }
                onClick={() =>
                  runtime.current?.controls?.beginRemap(action)
                }
              >
                <span>{PAD_REMAP_LABELS[action]}</span>
                <span>
                  {remapTarget === action
                    ? "Press a button"
                    : bindingLabel(padMap[action])}
                </span>
              </button>
            ))}
          </div>
          <button
            type="button"
            className="secondary"
            onClick={() => runtime.current?.controls?.resetPadMap()}
          >
            RESET GAMEPAD
          </button>
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
