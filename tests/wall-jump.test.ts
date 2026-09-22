import { test } from "node:test";
import assert from "node:assert/strict";
import { Body } from "../src/game/physics.ts";
import {
  Simulation as RulesSimulation,
  emptyInput,
} from "../src/game/simulation.ts";
import type { Input } from "../src/game/simulation.ts";
import { MAP_TOP, TUNING as T } from "../src/game/config.ts";
import { CAMPAIGN } from "../src/game/levels.ts";
import { physics } from "./support/arcade.ts";

class Simulation extends RulesSimulation {
  constructor(random = Math.random) {
    super(random, physics());
  }
}

const dt = 1 / 60;
const FLOOR = MAP_TOP + 13 * 32;
// Row 11 brick underside. A 1x body on the floor has 4px of air under it.
const OVERHANG = MAP_TOP + 12 * 32;

function tick(s: Simulation, frames: number, input: Partial<Input> = {}) {
  for (let i = 0; i < frames; i++) s.step(dt, { ...emptyInput(), ...input });
}

function finishPipeIntro(s: Simulation) {
  for (
    let frame = 0;
    frame < 60 * 20 && (s.mode === "intro" || s.pipeIntro);
    frame++
  )
    s.step(dt, emptyInput());
  assert.equal(s.pipeIntro, false);
  assert.equal(s.mode, "playing");
}

function stage() {
  const s = new Simulation(() => 0.5);
  s.levelIndex = CAMPAIGN.findIndex((level) => level.id === "4-2");
  s.reset();
  s.marioReturn = 1e6;
  finishPipeIntro(s);
  tick(s, Math.round((T.pipeCooldown + dt) * 60));
  assert.equal(s.activeRoom.data.id, "41");
  for (const npc of s.npcs) {
    Body.setFrozen(npc.body, true);
    Body.setPosition(npc.body, { x: -4000, y: 0 });
  }
  Body.setFrozen(s.mario.body, true);
  assert.equal(s.player.scale, 1);
  assert.equal(s.player.body.height, 28);
  return s;
}

function stand(s: Simulation, x: number) {
  const body = s.player.body;
  Body.setPosition(body, { x, y: FLOOR - body.height / 2 });
  Body.setVelocity(body, { x: 0, y: 0 });
  s.player.areaId = s.activeRoom.data.id;
  // Ground the body before the jump press. The jump itself is an input edge
  // inside step, not a velocity written after jump() has already accepted.
  tick(s, 8);
  assert.equal(s.player.grounded, true, "player is standing before the jump");
  assert.ok(Math.abs(s.player.body.velocity.y) < 1, "standing, not already rising");
  s.events = [];
}

// Tap jump from rest. Direction is held for the whole arc, jump for one frame.
function tap(s: Simulation, input: Partial<Input>) {
  const startY = s.player.body.position.y;
  let peakY = startY;
  let peakRight = s.player.body.bounds.max.x;
  let minRight = peakRight;
  let maxRight = peakRight;
  let faceFrames = 0;
  let faceMin = peakRight;
  let faceMax = peakRight;
  for (let frame = 0; frame < 90; frame++) {
    s.step(dt, { ...emptyInput(), ...input, jump: frame === 0 });
    const right = s.player.body.bounds.max.x;
    const top = s.player.body.bounds.min.y;
    if (s.player.body.position.y < peakY) {
      peakY = s.player.body.position.y;
      peakRight = right;
    }
    minRight = Math.min(minRight, right);
    maxRight = Math.max(maxRight, right);
    // Head is in the corner band. Later frames may walk under the gap.
    if (top <= OVERHANG) {
      if (faceFrames === 0) {
        faceMin = right;
        faceMax = right;
      } else {
        faceMin = Math.min(faceMin, right);
        faceMax = Math.max(faceMax, right);
      }
      faceFrames++;
    }
    if (frame > 4 && s.player.grounded) break;
  }
  return {
    rise: startY - peakY,
    jumps: s.events.filter((event) => event === "jump").length,
    minRight,
    maxRight,
    peakRight,
    faceFrames,
    faceMin,
    faceMax,
    top: peakY - s.player.body.height / 2,
  };
}

test("1x jump flush against the World 4-2 walls goes straight up", () => {
  const free = stage();
  const room = free.activeRoom;
  stand(free, room.offset + 29 * 32 + 16);
  const open = tap(free, {});
  assert.equal(open.jumps, 1);
  assert.ok(open.rise > 30, `open tap ${open.rise}`);

  for (const column of [22, 30]) {
    const s = stage();
    const wall = s.activeRoom.offset + column * 32;
    stand(s, wall - s.player.body.width / 2);
    assert.ok(
      Math.abs(s.player.body.bounds.max.x - wall) <= 0.01,
      `column ${column} is flush before the jump`,
    );
    const jumped = tap(s, { right: true });
    assert.equal(jumped.jumps, 1, `column ${column} accepted the shipped jump`);
    assert.ok(
      jumped.rise > open.rise * 0.75,
      `column ${column} rise ${jumped.rise} vs open ${open.rise}`,
    );
    assert.ok(
      jumped.top < OVERHANG - 8,
      `column ${column} did not clear the corner: top ${jumped.top}`,
    );
    assert.ok(jumped.faceFrames > 0, `column ${column} never reached the corner`);
    assert.ok(
      Math.abs(jumped.peakRight - wall) <= 1 &&
        Math.abs(jumped.faceMin - wall) <= 1 &&
        Math.abs(jumped.faceMax - wall) <= 1,
      `column ${column} slid off the face ${jumped.faceMin}..${jumped.faceMax} wall ${wall}`,
    );
    // Column 30 is a wall down to the floor, so holding right cannot walk through it.
    if (column === 30) {
      assert.ok(
        jumped.maxRight <= wall + 1,
        `column 30 passed the wall ${jumped.maxRight}`,
      );
    }
  }
});

test("the World 4-2 overhang still bonks a head that meets it", () => {
  const s = stage();
  const room = s.activeRoom;
  // Column 24 is the middle of the columns 22-26 brick mass, not its face.
  stand(s, room.offset + 24 * 32 + 16);
  const brickLeft = room.offset + 24 * 32;
  const brickRight = brickLeft + 32;
  const body = s.player.body;
  assert.ok(body.bounds.min.x > brickLeft && body.bounds.max.x < brickRight);
  assert.ok(body.bounds.min.y > OVERHANG, "head starts below the overhang");
  const jumped = tap(s, {});
  assert.equal(jumped.jumps, 1, "the jump is accepted, then the ceiling stops it");
  assert.ok(jumped.rise < 16, `overhang rise ${jumped.rise}`);
  assert.ok(
    jumped.top >= OVERHANG - 1,
    `head passed the overhang: ${jumped.top}`,
  );
});
