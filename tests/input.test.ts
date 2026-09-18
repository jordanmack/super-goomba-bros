import { test } from "node:test";
import assert from "node:assert/strict";
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
  capturePadBinding,
  defaultPadMap,
  GAMEPAD_DEADZONE,
  loadPadMap,
  mappedHolds,
  padActivity,
  pickActivePad,
  parsePadMap,
  savePadMap,
  type PadSnapshot,
} from "../src/game/gamepad-map.ts";
import {
  AREA_TOP_ROW,
  firstEmptySpawnCell,
  spawnCellBlocked,
  spawnCellCenter,
} from "../src/game/spawn-cell.ts";

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
    jump: false,
    run: false,
    down: false,
    pause: false,
  });
  const walk = mappedHolds(snap([14, 15, 13], [0, 0]), map);
  assert.equal(walk.left, true);
  assert.equal(walk.right, true);
  assert.equal(walk.down, true);
  assert.equal(walk.jump, false);
  const stick = mappedHolds(
    snap([], [-GAMEPAD_DEADZONE, GAMEPAD_DEADZONE, 0, 0]),
    map,
  );
  assert.equal(stick.left, true);
  assert.equal(stick.down, true);
  assert.equal(stick.jump, false);
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
});
