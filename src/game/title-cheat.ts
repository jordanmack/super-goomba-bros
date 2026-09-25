import { TUNING as T } from "./config.ts";

export const TITLE_WORLDS = [1, 2, 3, 4, 5, 6, 7, 8] as const;
export const TITLE_STAGES = [1, 2, 3, 4] as const;

export type TitlePick = "title" | "world" | "stage";

export type TitleCheat = {
  unlocked: boolean;
  unlimited: boolean;
  pick: TitlePick;
  world: number | null;
};

export function initialTitleCheat(): TitleCheat {
  return {
    unlocked: false,
    unlimited: false,
    pick: "title",
    world: null,
  };
}

export function unlockTitleCheat(cheat: TitleCheat): TitleCheat {
  if (cheat.unlocked) return cheat;
  return { ...cheat, unlocked: true };
}

export function toggleUnlimited(cheat: TitleCheat): TitleCheat {
  return { ...cheat, unlimited: !cheat.unlimited };
}

export function openWorldPick(cheat: TitleCheat): TitleCheat {
  return { ...cheat, pick: "world", world: null };
}

export function selectWorld(cheat: TitleCheat, world: number): TitleCheat {
  return { ...cheat, pick: "stage", world };
}

export function backTitlePick(cheat: TitleCheat): TitleCheat {
  if (cheat.pick === "stage") return { ...cheat, pick: "world", world: null };
  if (cheat.pick === "world") return { ...cheat, pick: "title", world: null };
  return cheat;
}

export function closeTitlePick(cheat: TitleCheat): TitleCheat {
  return { ...cheat, pick: "title", world: null };
}

export function titleStartAllowed(cheat: TitleCheat) {
  return cheat.pick === "title";
}

export function cheatTrayOpen(cheat: TitleCheat, mode: string) {
  return cheat.unlocked && cheat.unlimited && mode !== "title";
}

/** Help lists the tray keys and pad rows only while the tray is enabled. */
export function cheatBindingsShown(cheat: TitleCheat) {
  return cheat.unlocked && cheat.unlimited;
}

/**
 * Change from no highlight picks 2x, then steps 3x, 8x, Flower, Star, 1-up,
 * and back to 2x.
 */
export function nextCheatPick(pick: number | null, count: number) {
  return pick === null ? 0 : (pick + 1) % count;
}

/** Tray keys and pad buttons act only in live play with the tray open. */
export function cheatKeysLive(
  cheat: TitleCheat,
  state: { mode: string; paused: boolean; helpOpen: boolean; inPipe: boolean },
) {
  return (
    cheatTrayOpen(cheat, state.mode) &&
    state.mode === "playing" &&
    !state.paused &&
    !state.helpOpen &&
    !state.inPipe
  );
}

export function startTitleCampaign(
  sim: { levelIndex: number; lives: number; reset: (mode: "intro") => void },
  levelIndex: number,
) {
  sim.levelIndex = levelIndex;
  sim.lives = T.startingLives;
  sim.reset("intro");
}
