import { test } from "node:test";
import assert from "node:assert/strict";
import { Body } from "../src/game/physics.ts";
import { Simulation as RulesSimulation, emptyInput } from "../src/game/simulation.ts";
import { MAP_TOP, TUNING as T } from "../src/game/config.ts";
import { CAMPAIGN } from "../src/game/levels.ts";
import type { Input } from "../src/game/simulation.ts";
import { physics } from "./support/arcade.ts";

class Simulation extends RulesSimulation {
  constructor(random = Math.random) {
    super(random, physics());
  }
}

const dt = 1 / 60;

function tick(s: Simulation, seconds: number, input: Partial<Input> = {}) {
  for (let i = 0; i < Math.round(seconds * 60); i++)
    s.step(dt, { ...emptyInput(), ...input });
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

function stage(id: string) {
  const s = new Simulation(() => 0.5);
  s.levelIndex = CAMPAIGN.findIndex((level) => level.id === id);
  s.reset();
  s.marioReturn = 1e6;
  finishPipeIntro(s);
  tick(s, T.pipeCooldown + dt);
  return s;
}

function at(s: Simulation, x: number, y = 415) {
  Body.setPosition(s.player.body, { x, y });
  Body.setVelocity(s.player.body, { x: 0, y: 0 });
}

function mouth(s: Simulation, column: number) {
  const room = s.activeRoom;
  const pipe = room.data.pipes.find((entry) => entry.column === column);
  assert.ok(pipe, `column ${column}`);
  return {
    pipe,
    x: room.offset + (pipe.column + pipe.width / 2) * 32,
    y: MAP_TOP + pipe.row * 32,
  };
}

test("warp pages stay blank until the player reaches them", () => {
  const underground = stage("1-2");
  assert.equal(underground.activeRoom.data.id, "40");
  assert.equal(underground.warpSignage(), undefined);
  const ceiling = stage("4-2");
  assert.equal(ceiling.activeRoom.data.id, "41");
  assert.equal(ceiling.warpSignage(), undefined);
  const vine = stage("4-2");
  const room = vine.loadRoom("2f");
  vine.player.areaId = "2f";
  at(vine, room.offset + 100);
  assert.equal(vine.warpSignage(), undefined);
  const overworld = stage("1-1");
  at(overworld, overworld.activeRoom.offset + 180 * 32);
  assert.equal(overworld.warpSignage(), undefined);
});

test("1-2 warp pipes show the banner and worlds 4, 3, and 2", () => {
  const s = stage("1-2");
  const middle = mouth(s, 182);
  at(s, middle.x);
  const sign = s.warpSignage();
  assert.ok(sign);
  assert.equal(sign.banner.text, "WELCOME TO WARP ZONE!");
  assert.ok(sign.banner.y > MAP_TOP);
  const expected = [
    [178, "4"],
    [182, "3"],
    [186, "2"],
  ] as const;
  assert.deepEqual(
    sign.digits.map((digit) => [digit.column, digit.text]),
    expected.map(([column, text]) => [column, text]),
  );
  for (const digit of sign.digits) {
    const pipe = mouth(s, digit.column);
    assert.equal(digit.x, pipe.x);
    assert.ok(digit.y < pipe.y);
    assert.ok(digit.y > sign.banner.y);
    assert.equal(digit.text, String(digit.world));
  }
  const pageLeft = s.activeRoom.offset + Math.floor(178 / 16) * 16 * 32;
  assert.equal(sign.banner.x, pageLeft + 8 * 32);
});

test("4-2 ceiling pipe shows a centered 5 and the inert mouth stays blank", () => {
  const s = stage("4-2");
  const inert = s.activeRoom.data.pipes.find((pipe) => pipe.column === 180);
  assert.ok(inert);
  assert.equal(inert.direction, null);
  assert.equal(inert.destinations.length, 0);
  const pipe = mouth(s, 214);
  at(s, pipe.x);
  const sign = s.warpSignage();
  assert.ok(sign);
  assert.equal(sign.banner.text, "WELCOME TO WARP ZONE!");
  assert.equal(sign.digits.length, 1);
  assert.equal(sign.digits[0]!.text, "5");
  assert.equal(sign.digits[0]!.column, 214);
  assert.equal(sign.digits[0]!.x, pipe.x);
  assert.ok(sign.digits[0]!.y < pipe.y);
  assert.ok(sign.banner.y < sign.digits[0]!.y);
  assert.equal(
    sign.digits.some((digit) => digit.column === inert.column),
    false,
  );
  const ordinary = mouth(s, 84);
  at(s, ordinary.x);
  assert.equal(s.warpSignage(), undefined);
});

test("4-2 vine warp shows worlds 8, 7, and 6 above the pipes", () => {
  const s = stage("4-2");
  const room = s.loadRoom("2f");
  s.player.areaId = "2f";
  const middle = mouth(s, 54);
  at(s, middle.x, MAP_TOP + 10 * 32);
  const sign = s.warpSignage();
  assert.ok(sign);
  assert.equal(sign.banner.text, "WELCOME TO WARP ZONE!");
  assert.deepEqual(
    sign.digits.map((digit) => [digit.column, digit.text]),
    [
      [50, "8"],
      [54, "7"],
      [58, "6"],
    ],
  );
  for (const digit of sign.digits) {
    const pipe = mouth(s, digit.column);
    assert.equal(digit.x, pipe.x);
    assert.ok(digit.y < pipe.y);
    assert.ok(digit.x >= room.offset);
    assert.ok(sign.banner.y > MAP_TOP && sign.banner.y < digit.y);
  }
});
