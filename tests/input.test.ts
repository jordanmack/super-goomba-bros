import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Body } from "../src/game/physics.ts";
import { MAP_TOP, TUNING as T } from "../src/game/config.ts";
import {
  advanceSonami,
  SONAMI,
  SONAMI_LENGTH,
  sonamiStepFromKey,
  padSonamiMismatch,
  sonamiStepsFromPad,
} from "../src/game/sonami.ts";
import {
  backTitlePick,
  cheatBindingsShown,
  cheatKeysLive,
  cheatTrayOpen,
  closeTitlePick,
  initialTitleCheat,
  nextCheatPick,
  openWorldPick,
  selectWorld,
  titleStartAllowed,
  toggleUnlimited,
  unlockTitleCheat,
} from "../src/game/title-cheat.ts";
import {
  bindingLabel,
  bindingPressed,
  capturePadBinding,
  CHEAT_PAD_ACTIONS,
  defaultPadMap,
  GAMEPAD_DEADZONE,
  isCheatPadAction,
  loadPadMap,
  mappedHolds,
  padActivity,
  pickActivePad,
  PAD_MAP_ACTIONS,
  PAD_REMAP_LABELS,
  parsePadMap,
  savePadMap,
  type PadSnapshot,
} from "../src/game/gamepad-map.ts";
import {
  AREA_TOP_ROW,
  CHEAT_ITEM_LABELS,
  CHEAT_ITEMS,
  firstEmptySpawnCell,
  spawnCellBlocked,
  spawnCellCenter,
} from "../src/game/spawn-cell.ts";
import { campaignIndex } from "../src/game/levels.ts";

function buttons(pressed: number[] = []): boolean[] {
  const list = Array.from({ length: 16 }, () => false);
  for (const index of pressed) list[index] = true;
  return list;
}

function snap(
  pressed: number[] = [],
  axes: number[] = [0, 0, 0, 0],
): PadSnapshot {
  return { index: 0, buttons: buttons(pressed), axes };
}

test("Sonami keyboard steps are arrows then letter B then letter A", () => {
  assert.equal(sonamiStepFromKey("ArrowUp"), "up");
  assert.equal(sonamiStepFromKey("ArrowDown"), "down");
  assert.equal(sonamiStepFromKey("ArrowLeft"), "left");
  assert.equal(sonamiStepFromKey("ArrowRight"), "right");
  assert.equal(sonamiStepFromKey("KeyB"), "b");
  assert.equal(sonamiStepFromKey("KeyA"), "a");
  assert.equal(sonamiStepFromKey("KeyW"), null);
  assert.equal(sonamiStepFromKey("KeyS"), null);
  assert.equal(sonamiStepFromKey("KeyD"), null);
  assert.equal(sonamiStepFromKey("Space"), null);
});

test("Sonami extra keys before the sequence are ignored", () => {
  let index = 0;
  index = advanceSonami(index, null);
  index = advanceSonami(index, "down");
  index = advanceSonami(index, "a");
  index = advanceSonami(index, sonamiStepFromKey("KeyW"));
  assert.equal(index, 0);
  index = advanceSonami(index, "up");
  assert.equal(index, 1);
});

test("a wrong Sonami key in the middle restarts the sequence", () => {
  let index = 0;
  index = advanceSonami(index, "up");
  index = advanceSonami(index, "up");
  index = advanceSonami(index, "left");
  assert.equal(index, 0);
  index = advanceSonami(index, "up");
  index = advanceSonami(index, "up");
  index = advanceSonami(index, null);
  assert.equal(index, 0);
  index = advanceSonami(index, "up");
  index = advanceSonami(index, "up");
  index = advanceSonami(index, "down");
  index = advanceSonami(index, "up");
  assert.equal(index, 1);
});

test("the full Sonami sequence completes on arrows then B then A", () => {
  let index = 0;
  for (const code of [
    "ArrowUp",
    "ArrowUp",
    "ArrowDown",
    "ArrowDown",
    "ArrowLeft",
    "ArrowRight",
    "ArrowLeft",
    "ArrowRight",
    "KeyB",
    "KeyA",
  ])
    index = advanceSonami(index, sonamiStepFromKey(code));
  assert.equal(index, SONAMI_LENGTH);
  assert.equal(SONAMI.join(" "), "up up down down left right left right b a");
});

test("title cheat unlocks a power-up toggle and stage picker instead of a tray", () => {
  let index = 0;
  for (const code of [
    "ArrowUp",
    "ArrowUp",
    "ArrowDown",
    "ArrowDown",
    "ArrowLeft",
    "ArrowRight",
    "ArrowLeft",
    "ArrowRight",
    "KeyB",
    "KeyA",
  ])
    index = advanceSonami(index, sonamiStepFromKey(code));
  assert.equal(index, SONAMI_LENGTH);
  let cheat = initialTitleCheat();
  assert.equal(cheat.unlocked, false);
  assert.equal(cheat.unlimited, false);
  assert.equal(cheatTrayOpen(cheat, "title"), false);
  cheat = unlockTitleCheat(cheat);
  assert.equal(cheat.unlocked, true);
  assert.equal(cheat.unlimited, false);
  assert.equal(cheat.pick, "title");
  assert.equal(cheatTrayOpen(cheat, "title"), false);
  assert.equal(cheatTrayOpen(cheat, "playing"), false);
  cheat = toggleUnlimited(cheat);
  assert.equal(cheat.unlimited, true);
  assert.equal(cheatTrayOpen(cheat, "title"), false);
  assert.equal(cheatTrayOpen(cheat, "playing"), true);
  cheat = toggleUnlimited(cheat);
  assert.equal(cheat.unlimited, false);
  assert.equal(cheatTrayOpen(cheat, "playing"), false);
});

test("title cheat stage pick selects a world then a stage and can go back", () => {
  let cheat = unlockTitleCheat(initialTitleCheat());
  cheat = openWorldPick(cheat);
  assert.equal(cheat.pick, "world");
  assert.equal(cheat.world, null);
  cheat = selectWorld(cheat, 7);
  assert.equal(cheat.pick, "stage");
  assert.equal(cheat.world, 7);
  cheat = backTitlePick(cheat);
  assert.equal(cheat.pick, "world");
  assert.equal(cheat.world, null);
  cheat = selectWorld(cheat, 1);
  assert.equal(campaignIndex(cheat.world!, 2), 1);
  cheat = closeTitlePick(cheat);
  assert.equal(cheat.pick, "title");
  assert.equal(cheat.world, null);
});

test("title Start is ignored while the stage picker is open", () => {
  let cheat = unlockTitleCheat(initialTitleCheat());
  assert.equal(titleStartAllowed(cheat), true);
  cheat = openWorldPick(cheat);
  assert.equal(titleStartAllowed(cheat), false);
  cheat = selectWorld(cheat, 2);
  assert.equal(titleStartAllowed(cheat), false);
  cheat = backTitlePick(cheat);
  assert.equal(titleStartAllowed(cheat), false);
  cheat = backTitlePick(cheat);
  assert.equal(titleStartAllowed(cheat), true);
});

test("WASD does not complete Sonami", () => {
  let index = 0;
  for (const code of [
    "KeyW",
    "KeyW",
    "KeyS",
    "KeyS",
    "KeyA",
    "KeyD",
    "KeyA",
    "KeyD",
    "KeyB",
    "KeyA",
  ])
    index = advanceSonami(index, sonamiStepFromKey(code));
  assert.ok(index < SONAMI_LENGTH);
});

test("gamepad D-pad plus B then A edges feed Sonami", () => {
  const idle = buttons();
  const seq = [12, 12, 13, 13, 14, 15, 14, 15, 1, 0];
  let index = 0;
  let prev = idle;
  for (const button of seq) {
    const next = buttons([button]);
    for (const step of sonamiStepsFromPad(prev, next))
      index = advanceSonami(index, step);
    prev = next;
    for (const step of sonamiStepsFromPad(prev, idle))
      index = advanceSonami(index, step);
    prev = idle;
  }
  assert.equal(index, SONAMI_LENGTH);
  let mid = 0;
  mid = advanceSonami(mid, "up");
  mid = advanceSonami(mid, "up");
  assert.equal(padSonamiMismatch(idle, buttons([2])), true);
  if (padSonamiMismatch(idle, buttons([2]))) mid = 0;
  assert.equal(mid, 0);
});

test("mapped gamepad holds use stick plus D-pad and ignore stick up for jump", () => {
  const map = defaultPadMap();
  const idle = mappedHolds(snap(), map);
  assert.deepEqual(idle, {
    left: false,
    right: false,
    up: false,
    jump: false,
    run: false,
    down: false,
    pause: false,
  });
  const walk = mappedHolds(snap([14, 15, 13], [0, 0]), map);
  assert.equal(walk.left, true);
  assert.equal(walk.right, true);
  assert.equal(walk.down, true);
  assert.equal(walk.up, false);
  assert.equal(walk.jump, false);
  const stick = mappedHolds(
    snap([], [-GAMEPAD_DEADZONE, GAMEPAD_DEADZONE, 0, 0]),
    map,
  );
  assert.equal(stick.left, true);
  assert.equal(stick.down, true);
  assert.equal(stick.jump, false);
  const stickUp = mappedHolds(snap([], [0, -GAMEPAD_DEADZONE]), map);
  assert.equal(stickUp.up, true);
  assert.equal(stickUp.jump, false);
  const dead = mappedHolds(snap([], [-(GAMEPAD_DEADZONE - 0.01), -1]), map);
  assert.equal(dead.left, false);
  assert.equal(dead.jump, false);
  const face = mappedHolds(snap([0, 1, 9]), map);
  assert.equal(face.jump, true);
  assert.equal(face.run, true);
  assert.equal(face.pause, true);
});

test("invalid or missing pad maps fall back to defaults", () => {
  assert.deepEqual(parsePadMap(null), defaultPadMap());
  assert.deepEqual(parsePadMap({ jump: { type: "nope" } }), defaultPadMap());
  const storage = new Map<string, string>();
  const mem = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      storage.set(key, value);
    },
  };
  assert.deepEqual(loadPadMap(mem), defaultPadMap());
  const custom = defaultPadMap();
  custom.jump = { type: "button", index: 2 };
  savePadMap(custom, mem);
  assert.deepEqual(loadPadMap(mem).jump, { type: "button", index: 2 });
  storage.set("sgb-gamepad-map", "{not json");
  assert.deepEqual(loadPadMap(mem), defaultPadMap());
});

test("tray pad actions default to X and Y, fill older saved maps, and remap", () => {
  const map = defaultPadMap();
  assert.deepEqual(map.cheatNext, { type: "button", index: 2 });
  assert.deepEqual(map.cheatDrop, { type: "button", index: 3 });
  assert.equal(bindingLabel(map.cheatNext), "X (West)");
  assert.equal(bindingLabel(map.cheatDrop), "Y (North)");
  assert.equal(PAD_REMAP_LABELS.cheatNext, "Change power-up");
  assert.equal(PAD_REMAP_LABELS.cheatDrop, "Drop power-up");
  assert.deepEqual([...CHEAT_PAD_ACTIONS], ["cheatNext", "cheatDrop"]);
  for (const action of CHEAT_PAD_ACTIONS)
    assert.ok((PAD_MAP_ACTIONS as readonly string[]).includes(action));
  assert.deepEqual(
    PAD_MAP_ACTIONS.filter((action) => !isCheatPadAction(action)),
    ["jump", "run", "left", "right", "down", "pause"],
  );
  assert.equal(bindingPressed(snap([2]), map.cheatNext), true);
  assert.equal(bindingPressed(snap([2]), map.cheatDrop), false);
  const x = mappedHolds(snap([2]), map);
  assert.equal(x.jump || x.run, false);
  assert.equal(bindingPressed(snap([3]), map.cheatDrop), true);
  assert.equal(bindingPressed(snap([3]), map.cheatNext), false);
  // A map saved before these rows existed keeps its rows and gains X and Y.
  const older = parsePadMap({
    jump: { type: "button", index: 5 },
    run: { type: "button", index: 1 },
    left: { type: "hat", dir: "left" },
    right: { type: "hat", dir: "right" },
    down: { type: "hat", dir: "down" },
    pause: { type: "button", index: 9 },
  });
  assert.deepEqual(older.jump, { type: "button", index: 5 });
  assert.deepEqual(older.cheatNext, map.cheatNext);
  assert.deepEqual(older.cheatDrop, map.cheatDrop);
  const custom = parsePadMap({ ...map, cheatDrop: { type: "button", index: 5 } });
  assert.equal(bindingPressed(snap([5]), custom.cheatDrop), true);
  assert.equal(bindingPressed(snap([3]), custom.cheatDrop), false);
});

test("the tray highlight starts empty, cycles 2x to 1-up, and needs live play", () => {
  assert.deepEqual(
    CHEAT_ITEMS.map((kind) => CHEAT_ITEM_LABELS[kind]),
    ["2x", "3x", "8x", "Flower", "Star", "1-up"],
  );
  const labels = [];
  let pick: number | null = null;
  for (let i = 0; i <= CHEAT_ITEMS.length; i++) {
    pick = nextCheatPick(pick, CHEAT_ITEMS.length);
    labels.push(CHEAT_ITEM_LABELS[CHEAT_ITEMS[pick]!]);
  }
  assert.deepEqual(labels, ["2x", "3x", "8x", "Flower", "Star", "1-up", "2x"]);

  const on = toggleUnlimited(unlockTitleCheat(initialTitleCheat()));
  const live = { mode: "playing", paused: false, helpOpen: false, inPipe: false };
  assert.equal(cheatKeysLive(on, live), true);
  assert.equal(cheatKeysLive(on, { ...live, paused: true }), false);
  assert.equal(cheatKeysLive(on, { ...live, helpOpen: true }), false);
  assert.equal(cheatKeysLive(on, { ...live, inPipe: true }), false);
  for (const mode of ["title", "intro", "dead", "gameover", "finishing"])
    assert.equal(cheatKeysLive(on, { ...live, mode }), false, mode);
  assert.equal(cheatKeysLive(toggleUnlimited(on), live), false);
  assert.equal(
    cheatKeysLive(toggleUnlimited(initialTitleCheat()), live),
    false,
    "Unlimited without the unlock",
  );

  assert.equal(cheatBindingsShown(initialTitleCheat()), false);
  assert.equal(cheatBindingsShown(unlockTitleCheat(initialTitleCheat())), false);
  assert.equal(cheatBindingsShown(on), true);
});

test("tray keys are U and I, and J and K keep Run and Jump", () => {
  const controls = readFileSync(
    new URL("../src/game/controls.ts", import.meta.url),
    "utf8",
  );
  assert.match(controls, /KeyU: "cheatNext"/);
  assert.match(controls, /KeyI: "cheatDrop"/);
  assert.match(controls, /KeyJ: "run"/);
  assert.match(controls, /KeyK: "jump"/);
  assert.match(controls, /\{ action: "Change power-up", keys: "U" \}/);
  assert.match(controls, /\{ action: "Drop power-up", keys: "I" \}/);
  // Key repeat never fires a tray action again.
  assert.match(controls, /if \(pressed && !e\.repeat && this\.playing\(\)\) this\.hooks\.onCheat\(cheat\);/);
});

test("pickActivePad prefers sticky then activity then first connected", () => {
  const idle = snap([], [0, 0]);
  idle.index = 0;
  const used = snap([0]);
  used.index = 1;
  assert.equal(pickActivePad([idle, used], null)?.index, 1);
  assert.equal(pickActivePad([idle, used], 1)?.index, 1);
  assert.equal(pickActivePad([idle], null)?.index, 0);
  assert.equal(pickActivePad([idle, used], 0)?.index, 0);
});

test("pad activity and remap capture use buttons or D-pad, not stick below deadzone", () => {
  assert.equal(padActivity(snap()), false);
  assert.equal(padActivity(snap([], [0.2, 0])), false);
  assert.equal(padActivity(snap([], [GAMEPAD_DEADZONE, 0])), true);
  assert.equal(padActivity(snap([], [0, 0, 1, 1])), false);
  assert.equal(padActivity(snap([0])), true);
  const prev = snap();
  assert.deepEqual(capturePadBinding(prev, snap([12])), {
    type: "hat",
    dir: "up",
  });
  assert.deepEqual(capturePadBinding(prev, snap([2])), {
    type: "button",
    index: 2,
  });
});

test("first empty spawn cell is under the ceiling or at the area top", () => {
  const width = 20;
  const playerX = 100;
  const playerY = T.groundY - 15;
  const open = firstEmptySpawnCell([], 0, width, playerX, playerY);
  const column = Math.floor(playerX / T.brickSize);
  assert.deepEqual(open, spawnCellCenter(0, column, AREA_TOP_ROW));
  const ceiling = new Body(
    spawnCellCenter(0, column, 5).x,
    spawnCellCenter(0, column, 5).y,
    32,
    32,
    true,
  );
  const under = firstEmptySpawnCell([ceiling], 0, width, playerX, playerY);
  assert.deepEqual(under, spawnCellCenter(0, column, 6));
  assert.equal(spawnCellBlocked([ceiling], ceiling.position.x, ceiling.position.y), true);
  assert.equal(
    spawnCellBlocked([ceiling], spawnCellCenter(0, column, 6).x, spawnCellCenter(0, column, 6).y),
    false,
  );
  assert.equal(open!.y, MAP_TOP + AREA_TOP_ROW * T.brickSize + T.brickSize / 2);
  const hidden = new Body(
    spawnCellCenter(0, column, 4).x,
    spawnCellCenter(0, column, 4).y,
    32,
    32,
    true,
  );
  hidden.headOnly = true;
  assert.deepEqual(
    firstEmptySpawnCell([hidden], 0, width, playerX, playerY),
    spawnCellCenter(0, column, AREA_TOP_ROW),
  );
  assert.deepEqual(
    firstEmptySpawnCell([], 0, width, playerX, playerY, 0),
    spawnCellCenter(0, column, 0),
  );
  assert.deepEqual(
    firstEmptySpawnCell([ceiling], 0, width, playerX, playerY, 0),
    spawnCellCenter(0, column, 6),
  );
});

test("the Choose stage click updates the title-cheat ref, not just React state", () => {
  const app = readFileSync(
    new URL("../src/App.tsx", import.meta.url),
    "utf8",
  );
  const end = app.indexOf("Choose stage");
  assert.ok(end > 0, "App.tsx has a Choose stage button");
  const start = app.lastIndexOf("onClick=", end);
  assert.ok(start > 0 && start < end, "that button has a click handler");
  const handler = app.slice(start, end);
  assert.match(handler, /titleCheatRef\.current = openWorldPick\(/);
  assert.match(handler, /setTitleCheat\(openWorldPick\)/);
  assert.ok(
    handler.indexOf("titleCheatRef.current =") <
      handler.indexOf("setTitleCheat(openWorldPick)"),
  );
  // Start reads the ref, so the ref must be current before the next pad poll.
  assert.match(app, /titleStartAllowed\(titleCheatRef\.current\)/);
});

test("title Back buttons update the title-cheat ref in the same frame", () => {
  const app = readFileSync(
    new URL("../src/App.tsx", import.meta.url),
    "utf8",
  );
  const handlers: string[] = [];
  let from = 0;
  while (true) {
    const marker = app.indexOf("title-back", from);
    if (marker < 0) break;
    const start = app.indexOf("onClick=", marker);
    assert.ok(start > marker, "each Back button has a click handler");
    const end = app.indexOf("Back", start);
    assert.ok(end > start, "each Back button keeps its label");
    handlers.push(app.slice(start, end));
    from = marker + 1;
  }
  assert.equal(handlers.length, 2, "world pick and stage pick each have Back");
  for (const handler of handlers) {
    assert.match(handler, /titleCheatRef\.current = backTitlePick\(/);
    assert.match(handler, /setTitleCheat\(backTitlePick\)/);
    assert.ok(
      handler.indexOf("titleCheatRef.current =") <
        handler.indexOf("setTitleCheat(backTitlePick)"),
    );
  }
});

test("gamepad inject log path is repo-derived, not a stale /tmp agent path", () => {
  const spec = readFileSync(
    new URL("./browser/gamepad.spec.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(spec, /\/tmp\/grok-goal-/);
  assert.match(spec, /fileURLToPath\(import\.meta\.url\)/);
  assert.match(spec, /test-results\/gamepad-inject\.log/);
  assert.match(spec, /process\.env\.GAMEPAD_INJECT_LOG/);
});

test("START GAME wait uses a load-tolerant budget, not a nested 20s cap", () => {
  const skip = readFileSync(
    new URL("./browser/skip-intro.ts", import.meta.url),
    "utf8",
  );
  const config = readFileSync(
    new URL("../playwright.config.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(skip, /timeout:\s*20000/);
  assert.match(skip, /timeout:\s*60_?000/);
  assert.match(config, /timeout:\s*60_?000/);
});
