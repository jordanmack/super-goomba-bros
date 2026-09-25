import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PLATFORM_DROP,
  PLATFORM_LIFT_DOWN,
  PLATFORM_LIFT_UP,
  PLATFORM_SHUTTLE,
  PLATFORM_SMALL_DOWN,
  PLATFORM_SMALL_UP,
  PLATFORM_VERTICAL,
  initPlatformMotion,
  isNesPlatform,
  isOneWayLift,
  stepPlatformMotion,
} from "../src/game/platform-motion.ts";

function run(kind: number, y: number, frames: number, playerOn = false) {
  const m = initPlatformMotion(kind, y);
  const ys = [m.y];
  const xs = [m.x256 / 256];
  for (let f = 1; f <= frames; f++) {
    stepPlatformMotion(m, f, playerOn);
    ys.push(m.y);
    xs.push(m.x256 / 256);
  }
  return { m, ys, xs };
}

test("only the SMB1 moving-platform types use this motion", () => {
  for (const kind of [37, 38, 39, 40, 41, 43, 44])
    assert.equal(isNesPlatform(kind), true, `${kind}`);
  for (const kind of [36, 42, 45]) assert.equal(isNesPlatform(kind), false);
  assert.deepEqual(
    [36, 37, 38, 39, 40, 41, 42, 43, 44].filter(isOneWayLift),
    [38, 39, 43, 44],
  );
});

test("up and down lifts move 15/16 NES px a frame, never turn, and wrap", () => {
  for (const kind of [PLATFORM_LIFT_UP, PLATFORM_SMALL_UP]) {
    const { ys } = run(kind, 200, 32);
    assert.equal(ys[16], 200 - 15, `${kind} after 16 frames`);
    assert.equal(ys[32], 200 - 30);
    for (let i = 1; i < ys.length; i++) assert.ok(ys[i]! <= ys[i - 1]!);
    // An 8-bit Y with no high byte: past the top it comes back at the bottom.
    const wrap = run(kind, 3, 8).ys;
    assert.ok(wrap.some((y) => y > 240), `${kind} wraps: ${wrap}`);
  }
  for (const kind of [PLATFORM_LIFT_DOWN, PLATFORM_SMALL_DOWN]) {
    const { ys } = run(kind, 40, 32);
    assert.equal(ys[16], 40 + 15, `${kind} after 16 frames`);
    assert.equal(ys[32], 40 + 30);
    for (let i = 1; i < ys.length; i++) assert.ok(ys[i]! >= ys[i - 1]!);
    const wrap = run(kind, 252, 8).ys;
    assert.ok(wrap.some((y) => y < 16), `${kind} wraps: ${wrap}`);
  }
});

test("a vertical platform swings about its center with the platform gravity", () => {
  // Top half: it starts at the top and the center is 64px below.
  const high = run(PLATFORM_VERTICAL, 48, 1200);
  assert.equal(high.m.top, 48);
  assert.equal(high.m.center, 112);
  assert.ok(high.ys[30]! > 48, "moves down first");
  // The byte-exact ImposeGravity swing settles on 41-179 around 112.
  assert.equal(Math.min(...high.ys.slice(600)), 41);
  assert.equal(Math.max(...high.ys.slice(600)), 179);
  // Bottom half: the center is 64px above, so it moves up first.
  const low = run(PLATFORM_VERTICAL, 176, 1200);
  assert.equal(low.m.center, 112);
  assert.ok(low.ys[30]! < 176, "moves up first");
  // It keeps swinging, and speed stays under the max of 3.
  for (const { ys } of [high, low]) {
    let turns = 0;
    let heading = 0;
    for (let i = 1; i < ys.length; i++) {
      const step = ys[i]! - ys[i - 1]!;
      assert.ok(Math.abs(step) <= 3);
      if (!step) continue;
      if (heading && Math.sign(step) !== heading) turns++;
      heading = Math.sign(step);
    }
    assert.ok(turns >= 4, `turns ${turns}`);
  }
  // Every campaign start row stays near the screen over ten minutes.
  for (const row of [4, 5, 6, 12, 13]) {
    const m = initPlatformMotion(PLATFORM_VERTICAL, row * 16);
    for (let f = 1; f <= 60 * 600; f++) {
      stepPlatformMotion(m, f, false);
      assert.ok(m.y >= 0 && m.y < 256, `row ${row} frame ${f}: ${m.y}`);
    }
  }
});

test("a horizontal platform shuttles on the 0-14 counter, left first", () => {
  const { xs, m } = run(PLATFORM_SHUTTLE, 100, 240);
  // The counter steps every 4th frame, so the first frames barely move.
  assert.equal(xs[3], 0);
  assert.ok(xs[60]! < 0, "starts left");
  // Left for two counter phases (15 steps each), then right.
  const leftmost = Math.min(...xs);
  const at = xs.indexOf(leftmost);
  assert.ok(at >= 112 && at <= 124, `turns at ${at}`);
  assert.ok(xs[240]! > leftmost, "comes back right");
  for (let i = 1; i < xs.length; i++)
    assert.ok(Math.abs(xs[i]! - xs[i - 1]!) <= 14 / 16 + 1e-9);
  // After a full cycle it is back at the start.
  assert.equal(m.y, 100, "never moves vertically");
  const full = run(PLATFORM_SHUTTLE, 100, 480).xs;
  assert.ok(Math.abs(full[480]!) < 1, `${full[480]}`);
  assert.ok(Math.max(...full) <= 0.01, "the swing is left of the start");
});

test("a drop platform falls only while the player stands on it and never rises", () => {
  const still = run(PLATFORM_DROP, 96, 120);
  assert.ok(still.ys.every((y) => y === 96), "waits for the player");
  const m = initPlatformMotion(PLATFORM_DROP, 96);
  const ys = [m.y];
  for (let f = 1; f <= 40; f++) {
    stepPlatformMotion(m, f, true);
    ys.push(m.y);
  }
  assert.ok(ys[40]! > 96 + 40, `falls: ${ys[40]}`);
  // Max speed 2, plus the carry from the force byte on some frames.
  for (let i = 1; i < ys.length; i++) {
    assert.ok(ys[i]! >= ys[i - 1]!);
    assert.ok(ys[i]! - ys[i - 1]! <= 3);
  }
  // Off the platform it stops where it is. It does not come back.
  const held = m.y;
  for (let f = 41; f <= 100; f++) stepPlatformMotion(m, f, false);
  assert.equal(m.y, held);
});
