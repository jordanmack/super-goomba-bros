import { test } from "node:test";
import assert from "node:assert/strict";
import { Body } from "../src/game/physics.ts";
import { physics } from "./support/arcade.ts";
import {
  Simulation as RulesSimulation,
  emptyInput,
} from "../src/game/simulation.ts";
import { TUNING as T } from "../src/game/config.ts";
import { CAMPAIGN } from "../src/game/levels.ts";
import type { Input } from "../src/game/simulation.ts";

class Simulation extends RulesSimulation {
  constructor(random = Math.random) {
    super(random, physics());
  }
}

const dt = 1 / 60;
function game() {
  const s = new Simulation(() => 0.5);
  s.reset();
  s.marioReturn = 1e6;
  return s;
}
function tick(s: Simulation, seconds: number, input: Partial<Input> = {}) {
  for (let i = 0; i < Math.round(seconds * 60); i++)
    s.step(dt, { ...emptyInput(), ...input });
}
function at(s: Simulation, x: number, y = 415) {
  Body.setPosition(s.player.body, { x, y });
  Body.setVelocity(s.player.body, { x: 0, y: 0 });
}
function stage(id: string) {
  const s = game();
  s.levelIndex = CAMPAIGN.findIndex((level) => level.main === id);
  s.reset();
  s.marioReturn = 1e6;
  return s;
}

test("all 31 cannons load from area tiles, not per-stage hardcodes", () => {
  const s = game();
  const counts: Record<string, number> = {
    "21": 3,
    "2a": 3,
    "31": 2,
    "32": 10,
    "33": 13,
  };
  let total = 0;
  for (const [id, expected] of Object.entries(counts)) {
    const room = s.loadRoom(id);
    assert.equal(room.cannons.length, expected, id);
    total += room.cannons.length;
  }
  assert.equal(total, 31);
});

test("a Bullet Bill kills the player", () => {
  const s = game();
  const p = s.player.body.position;
  s.spawnBulletBill(p.x + 8, p.y, -T.bulletSpeed);
  tick(s, dt);
  assert.equal(s.player.alive, false);
  assert.equal(s.mode, "dead");
});

test("a Bullet Bill kills an NPC", () => {
  const s = game();
  const n = s.npcs[0]!;
  const before = s.died();
  Body.setPosition(n.body, { x: 240, y: 415 });
  Body.setVelocity(n.body, { x: 0, y: 0 });
  s.spawnBulletBill(248, 415, -T.bulletSpeed);
  tick(s, dt);
  assert.equal(n.alive, false);
  assert.equal(s.died(), before + 1);
});

test("a grounded side hit from a Bullet Bill kills; a falling stomp does not", () => {
  const side = game();
  const p = side.player.body.position;
  side.spawnBulletBill(p.x + 8, p.y, -T.bulletSpeed);
  tick(side, dt);
  assert.equal(side.player.alive, false);

  const stomp = game();
  Body.setPosition(stomp.player.body, { x: 200, y: 270 });
  Body.setVelocity(stomp.player.body, { x: 0, y: 8 });
  stomp.player.grounded = false;
  stomp.spawnBulletBill(200, 300, 0);
  tick(stomp, dt);
  assert.equal(stomp.player.alive, true);
  assert.equal(stomp.mode, "playing");
  assert.equal(stomp.player.body.velocity.y, -T.stompBounce);
  assert.equal(stomp.bulletBills.length, 0);
});

test("a cannon withholds fire when the player is too close or in line", () => {
  const s = stage("2a");
  const room = s.activeRoom;
  assert.ok(room.cannons.length >= 1);
  const cannon = room.cannons[0]!;
  const others = room.cannons.filter((c) => c !== cannon);
  const freeze = () => {
    for (const c of others) c.timer = 10_000;
  };
  const waitForAttempt = () => {
    cannon.timer = 0;
    freeze();
    tick(s, dt);
  };

  at(s, cannon.x + 200, T.groundY - 14);
  waitForAttempt();
  assert.ok(
    s.bulletBills.some((b) => Math.abs(b.cannonX - cannon.x) < 1),
    "fires when the player is far",
  );

  s.bulletBills = [];
  at(s, cannon.x, cannon.y);
  waitForAttempt();
  assert.equal(
    s.bulletBills.some((b) => Math.abs(b.cannonX - cannon.x) < 1),
    false,
    "withholds when the player is in line",
  );

  s.bulletBills = [];
  at(s, cannon.x + T.cannonClose / 2, cannon.y);
  waitForAttempt();
  assert.equal(
    s.bulletBills.some((b) => Math.abs(b.cannonX - cannon.x) < 1),
    false,
    "withholds when the player is too close",
  );
});
