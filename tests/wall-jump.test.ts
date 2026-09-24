import { test } from "node:test";
import assert from "node:assert/strict";
import { Body } from "../src/game/physics.ts";
import {
  Simulation as RulesSimulation,
  emptyInput,
} from "../src/game/simulation.ts";
import type { Actor, Input } from "../src/game/simulation.ts";
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

// Top of the row 9 bricks on columns 22 and 30. Feet below this are still
// on that wall. Row 9 question blocks use the same underside.
const STACK_TOP = MAP_TOP + 9 * 32;
const QUESTION = MAP_TOP + 10 * 32;

function parkOthers(s: Simulation, keep: "mario" | "npc") {
  for (const npc of s.npcs) {
    if (keep === "npc" && npc === s.npcs[0]) continue;
    Body.setFrozen(npc.body, true);
    Body.setPosition(npc.body, { x: -4000, y: 0 });
  }
  if (keep !== "mario") {
    Body.setFrozen(s.mario.body, true);
    Body.setPosition(s.mario.body, { x: -4000, y: 0 });
  }
  Body.setFrozen(s.player.body, true);
  Body.setPosition(s.player.body, { x: -4000, y: 0 });
}

function settle(s: Simulation, actor: Actor, x: number) {
  actor.areaId = "41";
  Body.setFrozen(actor.body, false);
  Body.setPosition(actor.body, {
    x,
    y: FLOOR - actor.body.height / 2,
  });
  Body.setVelocity(actor.body, { x: 0, y: 0 });
  tick(s, 8);
}

// First apex only. A later hop off the wall top is not this jump.
function apex(s: Simulation, actor: Actor, wall?: number) {
  const startY = actor.body.position.y;
  let peakY = startY;
  let top = actor.body.bounds.min.y;
  let faceMin = actor.body.bounds.max.x;
  let faceMax = faceMin;
  let faceFrames = 0;
  let rising = false;
  let inward = 0;
  for (let frame = 0; frame < 100; frame++) {
    s.step(dt, emptyInput());
    const y = actor.body.position.y;
    const right = actor.body.bounds.max.x;
    const feet = actor.body.bounds.max.y;
    const vy = actor.body.velocity.y;
    if (actor.body.velocity.x > inward) inward = actor.body.velocity.x;
    if (y < peakY) {
      peakY = y;
      top = actor.body.bounds.min.y;
    }
    if (vy < -0.2) rising = true;
    if (wall !== undefined && feet > STACK_TOP) {
      if (faceFrames === 0) {
        faceMin = right;
        faceMax = right;
      } else {
        faceMin = Math.min(faceMin, right);
        faceMax = Math.max(faceMax, right);
      }
      faceFrames++;
    }
    if (rising && vy >= 0) break;
    if (frame > 6 && actor.grounded && rising) break;
  }
  return {
    rise: startY - peakY,
    top,
    faceMin,
    faceMax,
    faceFrames,
    // Positive x speed is into the column 30 and 22 left faces.
    inward: inward,
  };
}

test("Mario keeps a rising jump flush against the World 4-2 walls", () => {
  const openSim = stage();
  parkOthers(openSim, "mario");
  openSim.viewWidth = 8000;
  const openMario = openSim.mario;
  Body.setFrozen(openMario.body, false);
  // Column 69 is floor with only the high row 2 ceiling, so the hop is open.
  const openX = openSim.activeRoom.offset + 69 * 32 + 16;
  settle(openSim, openMario, openX);
  assert.equal(openMario.grounded, true, "Mario is standing before the open jump");
  const openBrick = openSim.obstacles.find(
    (block) => block.kind === "brick" && Math.abs(block.x - openX) < 1,
  );
  assert.ok(openBrick, "column 69 has a brick to aim at");
  openSim.marioActive = true;
  openSim.brickTarget = openBrick.id;
  openSim.marioJumpWait = 0;
  openSim.marioReaction = 0;
  openSim.marioDecision = 30;
  openSim.marioLook = 30;
  openSim.marioChase = 0;
  const open = apex(openSim, openMario);
  assert.ok(open.rise > 80, `open Mario hop ${open.rise}`);

  for (const column of [22, 30]) {
    const s = stage();
    parkOthers(s, "mario");
    s.viewWidth = 8000;
    const mario = s.mario;
    const wall = s.activeRoom.offset + column * 32;
    Body.setFrozen(mario.body, false);
    // Half a pixel short of the face, still inside the 1px land-actor gap.
    // Closing that gap during the rise is the move into the wall.
    settle(s, mario, wall - mario.body.width / 2 - 0.5);
    assert.equal(mario.grounded, true, `column ${column} Mario is standing`);
    const startRight = mario.body.bounds.max.x;
    const gap = wall - startRight;
    assert.ok(
      gap > 0.2 && gap <= 1,
      `column ${column} Mario gap ${gap} is not on the face`,
    );
    const brick = s.obstacles.find(
      (block) => block.kind === "brick" && Math.abs(block.x - (wall + 16)) < 1,
    );
    assert.ok(brick, `column ${column} has a wall brick`);
    s.marioActive = true;
    s.brickTarget = brick.id;
    s.marioJumpWait = 0;
    s.marioReaction = 0;
    s.marioDecision = 30;
    s.marioLook = 30;
    s.marioChase = 0;
    // Carry speed into the face. The brick jump keeps this x speed.
    Body.setVelocity(mario.body, { x: T.runSpeed, y: 0 });
    const jumped = apex(s, mario, wall);
    assert.ok(
      jumped.rise > open.rise * 0.75,
      `column ${column} Mario rise ${jumped.rise} vs open ${open.rise}`,
    );
    assert.ok(jumped.faceFrames > 0, `column ${column} left the wall immediately`);
    assert.ok(
      jumped.faceMax > startRight + 0.2,
      `column ${column} Mario did not move into the wall`,
    );
    assert.ok(
      Math.abs(jumped.faceMin - wall) <= 1 &&
        Math.abs(jumped.faceMax - wall) <= 1,
      `column ${column} left the face ${jumped.faceMin}..${jumped.faceMax} wall ${wall}`,
    );
  }
});

test("an NPC keeps a rising jump flush against the World 4-2 wall", () => {
  const openSim = stage();
  parkOthers(openSim, "npc");
  const openNpc = openSim.npcs[0];
  openNpc.warned = true;
  openNpc.state = "run";
  openNpc.wait = 99;
  // Right lip of the column 17 floor. The next floor is in jump range and
  // the air above this lip is open, so the hop is not against a wall.
  settle(openSim, openNpc, openSim.activeRoom.offset + 17 * 32 + 20);
  assert.equal(openNpc.grounded, true, "NPC is standing before the open jump");
  openNpc.wait = 0;
  const open = apex(openSim, openNpc);
  assert.ok(open.rise > 80, `open NPC hop ${open.rise}`);

  const s = stage();
  parkOthers(s, "npc");
  const npc = s.npcs[0];
  const wall = s.activeRoom.offset + 30 * 32;
  npc.warned = true;
  npc.state = "run";
  npc.wait = 99;
  settle(s, npc, wall - npc.body.width / 2);
  assert.equal(npc.grounded, true, "NPC is standing before the wall jump");
  assert.ok(
    Math.abs(npc.body.bounds.max.x - wall) <= 0.01,
    "NPC is flush before the jump",
  );
  npc.wait = 0;
  const jumped = apex(s, npc, wall);
  assert.ok(
    jumped.rise > open.rise * 0.75,
    `NPC rise ${jumped.rise} vs open ${open.rise}`,
  );
  assert.ok(jumped.faceFrames > 0, "NPC left the wall immediately");
  assert.ok(
    Math.abs(jumped.faceMin - wall) <= 1 &&
      Math.abs(jumped.faceMax - wall) <= 1,
    `NPC left the face ${jumped.faceMin}..${jumped.faceMax} wall ${wall}`,
  );
  assert.ok(
    jumped.inward > 0.2,
    `NPC did not move into the wall (${jumped.inward})`,
  );
});

test("a question-block ceiling stops Mario's head", () => {
  const s = stage();
  parkOthers(s, "mario");
  s.viewWidth = 8000;
  const mario = s.mario;
  Body.setFrozen(mario.body, false);
  // Columns 50-51 row 9 are question blocks, so the solid stays when bumped.
  const x = s.activeRoom.offset + 51 * 32;
  settle(s, mario, x);
  assert.equal(mario.grounded, true, "Mario is standing under the blocks");
  assert.ok(mario.body.bounds.min.y > QUESTION, "head starts below the blocks");
  const block = s.obstacles.find(
    (item) => item.question && Math.abs(item.x - (x - 16)) < 1,
  );
  assert.ok(block, "column 50 question block");
  assert.ok(
    mario.body.bounds.min.x > block.x - 16 &&
      mario.body.bounds.max.x < block.x + 16 + 32,
    "Mario is under the question mass, not on its face",
  );
  s.marioActive = true;
  s.brickTarget = block.id;
  s.marioJumpWait = 0;
  s.marioReaction = 0;
  s.marioDecision = 30;
  s.marioLook = 30;
  s.marioChase = 0;
  const jumped = apex(s, mario);
  // Super Mario's head is 58px under this underside, so a bonk rises about
  // that far and then stops. An open hop is much taller.
  assert.ok(jumped.rise < 70, `question ceiling rise ${jumped.rise}`);
  assert.ok(
    jumped.top <= QUESTION + 2 && jumped.top >= QUESTION - 1,
    `head did not stop on the question underside: ${jumped.top}`,
  );
});

test("a running 1x jump that arrives a few pixels from the World 4-2 wall still rises", () => {
  const free = stage();
  stand(free, free.activeRoom.offset + 29 * 32 + 16);
  const open = tap(free, { right: true, run: true });
  assert.ok(open.rise > 30, `open run ${open.rise}`);

  const s = stage();
  const wall = s.activeRoom.offset + 30 * 32;
  // Do not walk during the settle. The jump frame is the one that closes the gap.
  stand(s, wall - 3 - s.player.body.width / 2);
  const gap = wall - s.player.body.bounds.max.x;
  assert.ok(gap > 1 && gap < 5, `arrival gap ${gap}`);
  const jumped = tap(s, { right: true, run: true });
  assert.equal(jumped.jumps, 1);
  assert.ok(
    jumped.rise > open.rise * 0.75,
    `arrival rise ${jumped.rise} vs open ${open.rise}`,
  );
  assert.ok(jumped.faceFrames > 0, "arrival never reached the corner");
  assert.ok(
    Math.abs(jumped.faceMin - wall) <= 1 &&
      Math.abs(jumped.faceMax - wall) <= 1,
    `arrival left the face ${jumped.faceMin}..${jumped.faceMax}`,
  );
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

test("a mid-air rise into a World 4-2 wall does not release Mario", () => {
  const openSim = stage();
  parkOthers(openSim, "mario");
  openSim.viewWidth = 8000;
  const openMario = openSim.mario;
  Body.setFrozen(openMario.body, false);
  const openX = openSim.activeRoom.offset + 69 * 32 + 16;
  settle(openSim, openMario, openX);
  const openBrick = openSim.obstacles.find(
    (block) => block.kind === "brick" && Math.abs(block.x - openX) < 1,
  );
  assert.ok(openBrick, "column 69 has a brick to aim at");
  openSim.marioActive = true;
  openSim.brickTarget = openBrick.id;
  openSim.marioJumpWait = 0;
  openSim.marioReaction = 0;
  openSim.marioDecision = 30;
  openSim.marioLook = 30;
  openSim.marioChase = 0;
  const open = apex(openSim, openMario);
  assert.ok(open.rise > 80, `open Mario hop ${open.rise}`);

  const s = stage();
  parkOthers(s, "mario");
  s.viewWidth = 8000;
  const mario = s.mario;
  const wall = s.activeRoom.offset + 30 * 32;
  Body.setFrozen(mario.body, false);
  // Outside the 1px face. The jump starts on the ground, but not flush.
  settle(s, mario, wall - mario.body.width / 2 - 4);
  assert.equal(mario.grounded, true, "Mario is standing before the jump");
  const gap0 = wall - mario.body.bounds.max.x;
  assert.ok(gap0 > 1 && gap0 < 6, `start gap ${gap0} is not a flush face`);
  const near = s.solids.flatMap((solid) => {
    const b = mario.body.bounds;
    const sb = solid.bounds;
    const overlapY = Math.min(b.max.y, sb.max.y) - Math.max(b.min.y, sb.min.y);
    const gapLeft = b.min.x - sb.max.x;
    const gapRight = sb.min.x - b.max.x;
    if (overlapY <= 1) return [];
    if (
      (gapLeft <= 1 && gapLeft >= -1) ||
      (gapRight <= 1 && gapRight >= -1)
    )
      return [`L${gapLeft.toFixed(2)} R${gapRight.toFixed(2)} y${overlapY.toFixed(1)}`];
    return [];
  });
  assert.equal(near.length, 0, `flush faces at takeoff: ${near.join(" | ")}`);
  const brick = s.obstacles.find(
    (block) => block.kind === "brick" && Math.abs(block.x - (wall + 16)) < 1,
  );
  assert.ok(brick, "column 30 has a wall brick");
  s.marioActive = true;
  s.brickTarget = brick.id;
  s.marioJumpWait = 0;
  s.marioReaction = 0;
  s.marioDecision = 30;
  s.marioLook = 30;
  s.marioChase = 0;
  Body.setVelocity(mario.body, { x: 4, y: 0 });
  let minGap = gap0;
  let enteredBand = false;
  let stuck = 0;
  let armed = false;
  const startY = mario.body.position.y;
  let peakY = startY;
  for (let frame = 0; frame < 100; frame++) {
    if (!mario.grounded) mario.navVx = 5;
    s.step(dt, emptyInput());
    armed ||= mario.body.wallRiseArmed;
    const gap = wall - mario.body.bounds.max.x;
    const vy = mario.body.velocity.y;
    const risen = startY - mario.body.position.y;
    if (vy < -0.2) {
      minGap = Math.min(minGap, gap);
      if (gap <= 1 && gap > -1) enteredBand = true;
    }
    if (vy < -0.2 && risen > 24 && Math.abs(gap) <= 0.75) stuck++;
    if (mario.body.position.y < peakY) peakY = mario.body.position.y;
    if (frame > 6 && mario.grounded && peakY < startY) break;
    if (vy >= 0 && peakY < startY - 4) break;
  }
  const rise = startY - peakY;
  assert.equal(armed, false, "a non-flush takeoff must not arm the wall release");
  assert.ok(
    rise < open.rise * 0.55,
    `mid-air Mario rise ${rise} band ${enteredBand} minGap ${minGap} stuck ${stuck} (open ${open.rise})`,
  );
});

test("a mid-air rise into a World 4-2 wall does not release an NPC", () => {
  const openSim = stage();
  parkOthers(openSim, "npc");
  const openNpc = openSim.npcs[0];
  openNpc.warned = true;
  openNpc.state = "run";
  openNpc.wait = 99;
  settle(openSim, openNpc, openSim.activeRoom.offset + 17 * 32 + 20);
  openNpc.wait = 0;
  const open = apex(openSim, openNpc);
  assert.ok(open.rise > 80, `open NPC hop ${open.rise}`);

  const s = stage();
  parkOthers(s, "npc");
  const npc = s.npcs[0];
  const wall = s.activeRoom.offset + 30 * 32;
  npc.warned = true;
  npc.state = "run";
  npc.wait = 99;
  // Run speed crosses into the 1px band only after the feet have left the ground.
  settle(s, npc, wall - npc.body.width / 2 - 6);
  assert.equal(npc.grounded, true, "NPC is standing before the jump");
  const gap0 = wall - npc.body.bounds.max.x;
  assert.ok(gap0 > 1, `NPC start gap ${gap0} is already flush`);
  npc.wait = 0;
  let minGap = gap0;
  let enteredBand = false;
  let stuck = 0;
  let armed = false;
  const startY = npc.body.position.y;
  let peakY = startY;
  let leftGround = false;
  for (let frame = 0; frame < 100; frame++) {
    s.step(dt, emptyInput());
    armed = npc.body.wallRiseArmed;
    const gap = wall - npc.body.bounds.max.x;
    const vy = npc.body.velocity.y;
    const risen = startY - npc.body.position.y;
    if (!npc.grounded) leftGround = true;
    if (leftGround && vy < -0.2 && gap > 0.02) {
      minGap = Math.min(minGap, gap);
      if (gap <= 1) enteredBand = true;
    }
    if (leftGround && vy < -0.2 && risen > 24 && Math.abs(gap) <= 0.75) stuck++;
    if (npc.body.position.y < peakY) peakY = npc.body.position.y;
    if (leftGround && vy >= 0) break;
    if (frame > 6 && npc.grounded && leftGround) break;
  }
  assert.ok(leftGround, "NPC never left the ground");
  assert.equal(armed, false, "a non-flush takeoff must not arm the wall release");
  assert.ok(
    enteredBand,
    `NPC rise never entered the 1px band (min gap ${minGap})`,
  );
  assert.ok(
    stuck < 3,
    `mid-air NPC stayed on the face for ${stuck} frames (open rise ${open.rise})`,
  );
});

test("a Mario or NPC head within 1px of a wall face stops on that ceiling", () => {
  const marioSim = stage();
  parkOthers(marioSim, "mario");
  marioSim.viewWidth = 8000;
  const mario = marioSim.mario;
  Body.setFrozen(mario.body, false);
  const room = marioSim.activeRoom;
  // 0.2px under the column 50 question block, with a crawl toward that face.
  // A faster crawl leaves the 1px band before the head arrives, and the old
  // deep-overlap stop would pass even if this release let the corner through.
  const face = room.offset + 50 * 32;
  settle(marioSim, mario, face + 0.2 - mario.body.width / 2);
  assert.equal(mario.grounded, true, "Mario is standing");
  const marioGap = mario.body.bounds.max.x - face;
  assert.ok(
    marioGap > 0 && marioGap <= 1,
    `Mario overlap ${marioGap} is not within 1px of the face`,
  );
  assert.ok(mario.body.bounds.min.y > QUESTION, "head starts below the blocks");
  const block = marioSim.obstacles.find(
    (item) => item.question && Math.abs(item.x - (face + 16)) < 1,
  );
  assert.ok(block, "column 50 question block");
  marioSim.marioActive = true;
  marioSim.brickTarget = block.id;
  marioSim.marioJumpWait = 0;
  marioSim.marioReaction = 0;
  marioSim.marioDecision = 30;
  marioSim.marioLook = 30;
  marioSim.marioChase = 0;
  Body.setVelocity(mario.body, { x: 0.05, y: 0 });
  let marioArmed = false;
  let marioFace = 0;
  const marioStart = mario.body.position.y;
  let marioPeak = marioStart;
  let marioTop = mario.body.bounds.min.y;
  for (let frame = 0; frame < 100; frame++) {
    marioSim.step(dt, emptyInput());
    if (mario.body.wallRiseArmed) {
      marioArmed = true;
      marioFace = mario.body.wallRiseFaceX ?? marioFace;
    }
    if (mario.body.position.y < marioPeak) {
      marioPeak = mario.body.position.y;
      marioTop = mario.body.bounds.min.y;
    }
    if (frame > 6 && mario.grounded && marioPeak < marioStart) break;
    if (mario.body.velocity.y >= 0 && marioPeak < marioStart - 4) break;
  }
  const marioHop = { rise: marioStart - marioPeak, top: marioTop };
  assert.equal(marioArmed, true, "Mario jump started flush, so the release is armed");
  assert.ok(
    Math.abs(marioFace - face) <= 1,
    `Mario armed a different face ${marioFace}`,
  );
  assert.ok(marioHop.rise < 70, `Mario corner rise ${marioHop.rise}`);
  assert.ok(
    marioHop.top <= QUESTION + 2 && marioHop.top >= QUESTION - 1,
    `Mario head did not stop on the corner underside: ${marioHop.top}`,
  );

  const s = stage();
  parkOthers(s, "npc");
  s.viewWidth = 8000;
  const npc = s.npcs[0];
  // Column 22's left face is the lip of the row 11 overhang. The head is a
  // few pixels under that underside and 0.2px into the lip, so this frame is
  // the 1px release, not a body already buried under the slab.
  const npcFace = s.activeRoom.offset + 22 * 32;
  npc.warned = true;
  npc.state = "run";
  npc.wait = 99;
  settle(s, npc, npcFace + 0.2 - npc.body.width / 2);
  assert.equal(npc.grounded, true, "NPC is standing");
  const gap = npc.body.bounds.max.x - npcFace;
  assert.ok(gap > 0 && gap <= 1, `NPC overlap ${gap} is not within 1px of the face`);
  assert.ok(
    npc.body.bounds.min.y > OVERHANG && npc.body.bounds.min.y - OVERHANG < 8,
    `NPC head is not in the lip band: ${npc.body.bounds.min.y}`,
  );
  npc.wait = 0;
  npc.scale = 2;
  npc.lastX = npc.body.position.x;
  npc.blockedFor = 1;
  let npcArmed = false;
  let npcFaceX = 0;
  const npcStart = npc.body.position.y;
  let npcPeak = npcStart;
  let npcTop = npc.body.bounds.min.y;
  for (let frame = 0; frame < 100; frame++) {
    s.step(dt, emptyInput());
    if (npc.body.wallRiseArmed) {
      npcArmed = true;
      npcFaceX = npc.body.wallRiseFaceX ?? npcFaceX;
    }
    if (npc.body.position.y < npcPeak) {
      npcPeak = npc.body.position.y;
      npcTop = npc.body.bounds.min.y;
    }
    if (frame > 6 && npc.grounded && npcPeak < npcStart) break;
    if (npc.body.velocity.y >= 0 && npcPeak < npcStart - 2) break;
  }
  const jumped = { rise: npcStart - npcPeak, top: npcTop };
  assert.equal(npcArmed, true, "NPC jump started flush, so the release is armed");
  assert.ok(
    Math.abs(npcFaceX - npcFace) <= 1,
    `NPC armed a different face ${npcFaceX}`,
  );
  assert.ok(jumped.rise < 20, `NPC corner rise ${jumped.rise}`);
  assert.ok(
    jumped.top <= OVERHANG + 2 && jumped.top >= OVERHANG - 1,
    `NPC head did not stop on the lip: ${jumped.top}`,
  );
});

test("a jump that starts flush with one face does not release a different face", () => {
  const s = stage();
  parkOthers(s, "mario");
  s.viewWidth = 8000;
  const mario = s.mario;
  const rear = s.activeRoom.offset + 27 * 32;
  const ahead = s.activeRoom.offset + 30 * 32;
  Body.setFrozen(mario.body, false);
  settle(s, mario, rear + mario.body.width / 2);
  const rearGap = mario.body.bounds.min.x - rear;
  assert.ok(Math.abs(rearGap) <= 1, `not flush with the rear face ${rearGap}`);
  const aheadGap = ahead - mario.body.bounds.max.x;
  assert.ok(aheadGap > 20, `already on the far wall ${aheadGap}`);
  const brick = s.obstacles.find(
    (block) => block.kind === "brick" && Math.abs(block.x - (ahead + 16)) < 1,
  );
  assert.ok(brick, "column 30 wall brick");
  s.marioActive = true;
  s.brickTarget = brick.id;
  s.marioJumpWait = 0;
  s.marioReaction = 0;
  s.marioDecision = 30;
  s.marioLook = 30;
  s.marioChase = 0;
  Body.setVelocity(mario.body, { x: 5, y: 0 });
  let armed = false;
  let faceX = 0;
  let stuck = 0;
  const startY = mario.body.position.y;
  let peakY = startY;
  for (let frame = 0; frame < 80; frame++) {
    if (!mario.grounded) mario.navVx = 5;
    s.step(dt, emptyInput());
    if (mario.body.wallRiseArmed) {
      armed = true;
      faceX = mario.body.wallRiseFaceX ?? faceX;
    }
    const gap = ahead - mario.body.bounds.max.x;
    const risen = startY - mario.body.position.y;
    if (mario.body.velocity.y < -0.2 && risen > 16 && Math.abs(gap) <= 0.75)
      stuck++;
    if (mario.body.position.y < peakY) peakY = mario.body.position.y;
    if (frame > 6 && mario.grounded && peakY < startY) break;
    if (mario.body.velocity.y >= 0 && peakY < startY - 4) break;
  }
  assert.equal(armed, true, "the takeoff was flush");
  assert.ok(Math.abs(faceX - rear) <= 1, `armed the far face ${faceX} not ${rear}`);
  assert.ok(
    stuck < 3,
    `released the other face for ${stuck} frames, rise ${startY - peakY}`,
  );
});
