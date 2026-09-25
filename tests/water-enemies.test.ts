import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FLY_START_Y,
  blooperExtended,
  initBlooper,
  initFlyCheep,
  stepBlooper,
  stepFlyCheep,
  stepSwimCheep,
  swimCheepHeight,
  swimCheepIsRed,
  type SwimCheepMotion,
} from "../src/game/water-enemies.ts";

test("a Blooper pulses up 2 px/frame at most, then sinks until it nears the player", () => {
  const m = initBlooper();
  let top = 150;
  let x = 0;
  const ys: number[] = [];
  // Frame 1 is not a multiple of 8, so the first pulse step is at frame 8.
  for (let frame = 1; frame <= 40; frame++) {
    const step = stepBlooper(m, frame, top, true);
    top += step.dy;
    x += step.dx;
    ys.push(top);
    assert.ok(step.dy >= -2 && step.dy <= 1);
    assert.equal(step.dx, -m.force, "sideways matches the rise");
  }
  // Force 1 for 8 frames, 2 for 8, 1 for 8: 32px up and 32px left.
  assert.equal(150 - Math.min(...ys), 32);
  assert.equal(x, -32);
  assert.equal(m.timer, 2);
  assert.equal(m.counter, 2);
  // While more than 16px above the player it keeps sinking 1px per 2 frames.
  const sinkFrom = top;
  for (let frame = 41; frame <= 140; frame++) top += stepBlooper(m, frame, top, true).dy;
  assert.equal(top - sinkFrom, 50);
  // Near the player, with the timer out, the next pulse starts.
  assert.equal(m.timer, 0);
  stepBlooper(m, 141, top, false);
  assert.equal(m.counter, 0);
});

test("a Blooper stays below the status bar and draws short only while its timer is 1", () => {
  const m = initBlooper();
  let top = 0x21;
  for (let frame = 1; frame <= 32; frame++) top += stepBlooper(m, frame, top, true).dy;
  assert.ok(top >= 0x20 - 1, `top ${top}`);
  assert.equal(blooperExtended({ ...m, timer: 0 }), true);
  assert.equal(blooperExtended({ ...m, timer: 2 }), true);
  assert.equal(blooperExtended({ ...m, timer: 1 }), false);
});

function swim(red: boolean, wobble: boolean, frames: number) {
  const m: SwimCheepMotion = {
    kind: "swim",
    red,
    xForce: 0,
    yDummy: 0,
    down: false,
    originY: 100,
    wobble,
  };
  let x = 0,
    top = 100,
    low = 100,
    high = 100;
  for (let f = 0; f < frames; f++) {
    const step = stepSwimCheep(m, top);
    x += step.dx;
    top += step.dy;
    low = Math.max(low, top);
    high = Math.min(high, top);
  }
  return { x, top, low, high };
}

test("swimming Cheep Cheeps go left, red twice as fast as grey, and some wobble", () => {
  assert.deepEqual(swim(false, false, 400), { x: -100, top: 100, low: 100, high: 100 });
  assert.equal(swim(true, false, 400).x, -200);
  const wobble = swim(false, true, 60 * 20);
  assert.equal(wobble.high, 100 - 15);
  assert.equal(wobble.low, 100 + 15);
});

test("a flying Cheep Cheep leaps from below the screen and falls at 5 px/frame at most", () => {
  const { motion, offset } = initFlyCheep(0, [0, 0, 0]);
  assert.equal(offset, -0x80);
  assert.equal(motion.xSpeed, 0x0e);
  assert.equal(motion.y, FLY_START_Y);
  let x = 0,
    top = FLY_START_Y,
    apex = top;
  const drops: number[] = [];
  for (let f = 0; f < 240; f++) {
    const step = stepFlyCheep(motion);
    x += step.dx;
    top += step.dy;
    apex = Math.min(apex, top);
    drops.push(step.dy);
  }
  // It rises near the top of the screen, then falls back past its start.
  assert.ok(apex < 0x30, `apex ${apex}`);
  assert.ok(top > FLY_START_Y, `ends at ${top}`);
  assert.ok(Math.max(...drops) <= 5 + 1);
  // $0e is 14/16 px a frame.
  assert.ok(Math.abs(x - (240 * 14) / 16) <= 1, `x ${x}`);
});

test("a flying Cheep Cheep picks its side and speed like InitFlyingCheepCheep", () => {
  // Player walking right at $18: speeds from the second row.
  const walk = initFlyCheep(0x18, [1, 0, 0]);
  assert.equal(walk.motion.xSpeed, 0x20);
  assert.equal(walk.offset, -0x50);
  // Running at $28 uses the third row. Negative speeds count as fast.
  assert.equal(initFlyCheep(0x28, [0, 0, 0]).motion.xSpeed, 0x1e);
  assert.equal(initFlyCheep(-0x18, [0, 0, 0]).motion.xSpeed, 0x1e);
  // Standing still, seed bit 1 sends it left from the player's right.
  const still = initFlyCheep(0, [2, 0, 0]);
  assert.equal(still.motion.xSpeed, -0x06);
  assert.equal(still.offset, 0x40);
  // The third LSFR nybble replaces the seed when the second has low bits.
  assert.equal(initFlyCheep(0, [0, 1, 0x0b]).offset, 0xa0);
});

test("swimming Cheep Cheep heights and colors follow the generator", () => {
  let filter = 0;
  const tops = new Set<number>();
  for (let i = 0; i < 8; i++) {
    const next = swimCheepHeight(filter, 3);
    filter = next.filter;
    tops.add(next.top);
  }
  assert.equal(tops.size, 8, "each height once");
  assert.equal(filter, 0xff);
  assert.equal(swimCheepHeight(filter, 3).filter, 1 << 3, "then it starts over");
  assert.equal(swimCheepIsRed(2, 0x10), false);
  assert.equal(swimCheepIsRed(2, 0xaa), true);
  assert.equal(swimCheepIsRed(7, 0x10), true);
  assert.equal(swimCheepIsRed(7, 0xaa), false);
});
