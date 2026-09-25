import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PODOBOO_INTERVAL_FRAMES,
  PODOBOO_LEAP,
  PODOBOO_START_Y,
  initPodoboo,
  podobooFalling,
  stepPodoboo,
} from "../src/game/podoboo.ts";

test("a Podoboo waits below the screen, then leaps and falls back under $1c gravity", () => {
  const m = initPodoboo();
  assert.equal(m.y, PODOBOO_START_Y);
  assert.ok(PODOBOO_START_Y >= 240, "below the 240px screen");
  assert.equal(m.timer, 1);
  const ys: number[] = [];
  const restarts: number[] = [];
  for (let frame = 1; frame <= 400; frame++) {
    const timer = m.timer;
    stepPodoboo(m, frame, 0x35);
    if (m.timer > timer) restarts.push(frame);
    ys.push(m.y);
    if (frame === PODOBOO_INTERVAL_FRAMES) {
      // $35 | $80 is the force, and ($35 & $0f) | 6 = 7 intervals.
      assert.equal(m.speed, PODOBOO_LEAP);
      assert.equal(m.timer, 7);
      assert.ok(m.y < PODOBOO_START_Y && m.y >= PODOBOO_START_Y - 8);
    }
  }
  // It only sinks until the first interval runs out.
  for (const y of ys.slice(0, PODOBOO_INTERVAL_FRAMES - 1))
    assert.ok(y >= PODOBOO_START_Y);
  // Then it restarts every 7 intervals of 21 frames.
  assert.deepEqual(restarts, [21, 21 + 7 * 21, 21 + 14 * 21]);
  const leap = ys.slice(20, 21 + 7 * 21 - 1);
  const apex = Math.min(...leap);
  assert.ok(apex > 40 && apex < 110, `apex ${apex}`);
  // Down from the apex, at most 3px a frame plus the carried fraction, and
  // back below the screen before the next leap.
  const top = leap.indexOf(apex);
  for (let i = top + 1; i < leap.length; i++) {
    const fall = leap[i]! - leap[i - 1]!;
    assert.ok(fall >= 0 && fall <= 4, `fall ${fall}`);
  }
  assert.ok(leap.at(-1)! >= 240);
});

test("the wait between leaps is at least six intervals plus the random low nybble", () => {
  const seen = new Set<number>();
  for (let random = 0; random < 256; random++) {
    const m = initPodoboo();
    stepPodoboo(m, PODOBOO_INTERVAL_FRAMES, random);
    assert.equal(m.timer, (random & 0x0f) | 6);
    seen.add(m.timer);
  }
  assert.deepEqual([...seen].sort((a, b) => a - b), [6, 7, 14, 15]);
});

test("a Podoboo is drawn upside down once it stops rising", () => {
  const m = initPodoboo();
  stepPodoboo(m, PODOBOO_INTERVAL_FRAMES, 0);
  assert.equal(podobooFalling(m), false);
  let frame = PODOBOO_INTERVAL_FRAMES;
  while (m.speed < 0) stepPodoboo(m, ++frame, 0);
  assert.equal(podobooFalling(m), true);
});
