export const GAMEPAD_DEADZONE = 0.35;
export const PAD_MAP_KEY = "sgb-gamepad-map";

export type PadMapAction = "jump" | "run" | "left" | "right" | "down" | "pause";
export type PadBinding =
  | { type: "button"; index: number }
  | { type: "hat"; dir: "up" | "down" | "left" | "right" };

export const PAD_MAP_ACTIONS = [
  "jump",
  "run",
  "left",
  "right",
  "down",
  "pause",
] as const satisfies readonly PadMapAction[];

export const HAT_BUTTON = {
  up: 12,
  down: 13,
  left: 14,
  right: 15,
} as const;

export const DEFAULT_PAD_MAP: Record<PadMapAction, PadBinding> = {
  jump: { type: "button", index: 0 },
  run: { type: "button", index: 1 },
  left: { type: "hat", dir: "left" },
  right: { type: "hat", dir: "right" },
  down: { type: "hat", dir: "down" },
  pause: { type: "button", index: 9 },
};

export const GAMEPAD_BINDINGS = [
  { action: "Walk", keys: "Stick or D-pad (deadzone 0.35)" },
  { action: "Run", keys: "B (East); press fires if flowered" },
  { action: "Jump; swim up", keys: "A (South)" },
  { action: "Enter a pipe", keys: "Down" },
  { action: "Pause", keys: "Start" },
  { action: "Select", keys: "Unused" },
] as const;

export const PAD_REMAP_LABELS: Record<PadMapAction, string> = {
  jump: "Jump",
  run: "Run",
  left: "Left",
  right: "Right",
  down: "Down",
  pause: "Pause",
};

export type PadSnapshot = {
  index: number;
  buttons: boolean[];
  axes: number[];
};

export type PadHolds = {
  left: boolean;
  right: boolean;
  jump: boolean;
  run: boolean;
  down: boolean;
  pause: boolean;
};

const BUTTON_NAMES: Record<number, string> = {
  0: "A (South)",
  1: "B (East)",
  2: "X (West)",
  3: "Y (North)",
  4: "LB",
  5: "RB",
  6: "LT",
  7: "RT",
  8: "Select",
  9: "Start",
  10: "L3",
  11: "R3",
  12: "D-pad Up",
  13: "D-pad Down",
  14: "D-pad Left",
  15: "D-pad Right",
};

export function defaultPadMap(): Record<PadMapAction, PadBinding> {
  return {
    jump: { ...DEFAULT_PAD_MAP.jump },
    run: { ...DEFAULT_PAD_MAP.run },
    left: { ...DEFAULT_PAD_MAP.left },
    right: { ...DEFAULT_PAD_MAP.right },
    down: { ...DEFAULT_PAD_MAP.down },
    pause: { ...DEFAULT_PAD_MAP.pause },
  };
}

function parseBinding(value: unknown): PadBinding | null {
  if (!value || typeof value !== "object") return null;
  const rec = value as { type?: unknown; index?: unknown; dir?: unknown };
  if (rec.type === "button" && Number.isInteger(rec.index)) {
    const index = rec.index as number;
    if (index >= 0 && index <= 31) return { type: "button", index };
  }
  if (
    rec.type === "hat" &&
    (rec.dir === "up" ||
      rec.dir === "down" ||
      rec.dir === "left" ||
      rec.dir === "right")
  )
    return { type: "hat", dir: rec.dir };
  return null;
}

export function parsePadMap(value: unknown): Record<PadMapAction, PadBinding> {
  if (!value || typeof value !== "object") return defaultPadMap();
  const rec = value as Record<string, unknown>;
  const next = defaultPadMap();
  for (const action of PAD_MAP_ACTIONS) {
    const parsed = parseBinding(rec[action]);
    if (parsed) next[action] = parsed;
  }
  return next;
}

function storageOf(
  storage?: Pick<Storage, "getItem" | "setItem"> | null,
): Pick<Storage, "getItem" | "setItem"> | null {
  if (storage) return storage;
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function loadPadMap(
  storage?: Pick<Storage, "getItem" | "setItem"> | null,
): Record<PadMapAction, PadBinding> {
  const store = storageOf(storage);
  if (!store) return defaultPadMap();
  try {
    const raw = store.getItem(PAD_MAP_KEY);
    if (!raw) return defaultPadMap();
    return parsePadMap(JSON.parse(raw) as unknown);
  } catch {
    return defaultPadMap();
  }
}

export function savePadMap(
  map: Record<PadMapAction, PadBinding>,
  storage?: Pick<Storage, "getItem" | "setItem"> | null,
) {
  const store = storageOf(storage);
  if (!store) return;
  try {
    store.setItem(PAD_MAP_KEY, JSON.stringify(map));
  } catch {
    /* ignore quota / private-mode failures */
  }
}

export function bindingPressed(
  snap: PadSnapshot,
  binding: PadBinding,
): boolean {
  const index =
    binding.type === "hat" ? HAT_BUTTON[binding.dir] : binding.index;
  return !!snap.buttons[index];
}

export function sameBinding(a: PadBinding, b: PadBinding): boolean {
  if (a.type === "hat" && b.type === "hat") return a.dir === b.dir;
  if (a.type === "button" && b.type === "button") return a.index === b.index;
  if (a.type === "hat" && b.type === "button")
    return HAT_BUTTON[a.dir] === b.index;
  if (a.type === "button" && b.type === "hat")
    return a.index === HAT_BUTTON[b.dir];
  return false;
}

export function bindingLabel(binding: PadBinding): string {
  if (binding.type === "hat") {
    const name = binding.dir[0]!.toUpperCase() + binding.dir.slice(1);
    return `D-pad ${name}`;
  }
  return BUTTON_NAMES[binding.index] ?? `Button ${binding.index}`;
}

export function pickActivePad(
  snaps: PadSnapshot[],
  sticky: number | null,
  deadzone = GAMEPAD_DEADZONE,
): PadSnapshot | null {
  if (sticky !== null) {
    const kept = snaps.find((snap) => snap.index === sticky);
    if (kept) return kept;
  }
  return snaps.find((snap) => padActivity(snap, deadzone)) ?? snaps[0] ?? null;
}

export function padActivity(snap: PadSnapshot, deadzone = GAMEPAD_DEADZONE) {
  if (snap.buttons.some(Boolean)) return true;
  const ax = snap.axes[0] ?? 0;
  const ay = snap.axes[1] ?? 0;
  return Math.abs(ax) >= deadzone || Math.abs(ay) >= deadzone;
}

export function mappedHolds(
  snap: PadSnapshot,
  map: Record<PadMapAction, PadBinding>,
  deadzone = GAMEPAD_DEADZONE,
): PadHolds {
  const holds: PadHolds = {
    left: bindingPressed(snap, map.left),
    right: bindingPressed(snap, map.right),
    jump: bindingPressed(snap, map.jump),
    run: bindingPressed(snap, map.run),
    down: bindingPressed(snap, map.down),
    pause: bindingPressed(snap, map.pause),
  };
  const ax = snap.axes[0] ?? 0;
  const ay = snap.axes[1] ?? 0;
  if (ax <= -deadzone) holds.left = true;
  if (ax >= deadzone) holds.right = true;
  if (ay >= deadzone) holds.down = true;
  return holds;
}

export function capturePadBinding(
  prev: PadSnapshot | null,
  next: PadSnapshot,
): PadBinding | null {
  for (const dir of ["up", "down", "left", "right"] as const) {
    const index = HAT_BUTTON[dir];
    if (next.buttons[index] && !prev?.buttons[index])
      return { type: "hat", dir };
  }
  const hatIndexes = new Set<number>(Object.values(HAT_BUTTON));
  const limit = Math.max(next.buttons.length, prev?.buttons.length ?? 0);
  for (let index = 0; index < limit; index++) {
    if (hatIndexes.has(index)) continue;
    if (next.buttons[index] && !prev?.buttons[index])
      return { type: "button", index };
  }
  return null;
}
