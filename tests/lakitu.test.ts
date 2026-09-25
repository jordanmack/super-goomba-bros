import { test } from "node:test";
import assert from "node:assert/strict";
import { Simulation, emptyInput } from "../src/game/simulation.ts";
import type { Actor } from "../src/game/simulation.ts";
import { Body } from "../src/game/physics.ts";
import { physics } from "./support/arcade.ts";
import { MAP_TOP, TUNING as T } from "../src/game/config.ts";
import { areaData, campaignIndex } from "../src/game/levels.ts";
import { ENEMY_LAKITU, enemyRole } from "../src/game/room.ts";

const dt = 1 / 60;

function start(world: number, stage: number) {
  const s = new Simulation(() => 0, physics());
  s.levelIndex = campaignIndex(world, stage);
  s.reset();
  s.marioReturn = 1e6;
  return s;
}

function step(s: Simulation, frames = 1) {
  for (let i = 0; i < frames; i++) s.step(dt, emptyInput());
}

function stand(actor: Actor, x: number) {
  Body.setPosition(actor.body, {
    x,
    y: T.groundY - actor.body.height / 2,
  });
  Body.setVelocity(actor.body, { x: 0, y: 0 });
}

function enterMario(s: Simulation) {
  s.cameraX = s.activeRoom.offset + 400;
  s.marioDeath = null;
  s.marioReturn = 0;
  for (let i = 0; i < 40 && !s.marioActive; i++) step(s);
  assert.equal(s.marioActive, true);
}

function revealLakitu(s: Simulation) {
  const room = s.rooms.get(s.level.main)!;
  const point = room.lakituPoints[0];
  assert.ok(point, s.level.id);
  Body.setFrozen(s.player.body, true);
  Body.setPosition(s.player.body, { x: point.x, y: MAP_TOP + 96 });
  Body.setVelocity(s.player.body, { x: 0, y: 0 });
  step(s);
  const live = liveLakitu(s);
  assert.equal(live.length, 1, s.level.id);
  return live[0]!;
}

function parkAway(s: Simulation, keep: Actor[] = []) {
  for (const n of s.npcs) {
    if (keep.includes(n)) continue;
    stand(n, 5200);
  }
  stand(s.player, 5600);
}

function liveLakitu(s: Simulation) {
  return s.lakitus.filter((l) => l.alive);
}

test("type-17 points spawn one Lakitu, and he does not join the rescue tally", () => {
  assert.equal(enemyRole(ENEMY_LAKITU), "lakitu");
  const stages: [number, number, number][] = [
    [4, 1, 3],
    [6, 1, 2],
    [8, 2, 1],
  ];
  for (const [world, stage, count] of stages) {
    const s = start(world, stage);
    const room = s.rooms.get(s.level.main)!;
    const placed = areaData(s.level.main).enemies.filter(
      (e) => e.type === ENEMY_LAKITU,
    );
    assert.equal(placed.length, count, s.level.id);
    assert.equal(room.lakituPoints.length, count, s.level.id);
    for (const enemy of placed) {
      const x = room.offset + enemy.column * 32 + 16;
      const y = MAP_TOP + enemy.row * 32 + 16;
      assert.ok(
        room.lakituPoints.some((p) => p.x === x && p.y === y),
        `${s.level.id} point ${enemy.column}`,
      );
    }
    assert.equal(liveLakitu(s).length, 0);
    assert.equal(s.npcs.length, T.population);
    const cloud = revealLakitu(s);
    assert.equal(s.lakitus.length, 1, s.level.id);
    assert.equal(
      s.npcs.some((n) => n.id === cloud.id),
      false,
    );
    Body.setFrozen(s.player.body, false);
    Body.setPosition(s.player.body, { x: cloud.x, y: cloud.y });
    Body.setVelocity(s.player.body, { x: 0, y: 0 });
    step(s);
    assert.equal(s.player.alive, true, s.level.id);
    assert.equal(cloud.alive, true, s.level.id);
    const last = room.lakituPoints[count - 1]!;
    Body.setFrozen(s.player.body, true);
    Body.setPosition(s.player.body, { x: last.x + 64, y: MAP_TOP + 96 });
    step(s, 30);
    assert.equal(liveLakitu(s).length, 1, s.level.id);
    assert.equal(s.npcs.length, T.population, s.level.id);
    s.physics.clear();
  }
  const away = start(4, 1);
  const awayBonus = away.loadRoom("42");
  away.player.areaId = awayBonus.data.id;
  Body.setFrozen(away.player.body, true);
  Body.setPosition(away.player.body, {
    x: awayBonus.offset + 400,
    y: MAP_TOP + 200,
  });
  step(away, 20);
  assert.equal(liveLakitu(away).length, 0);
  assert.ok(away.rooms.get("22")!.lakituUsed.every((used) => !used));
  const held = start(4, 1);
  const parked = revealLakitu(held);
  const heldX = parked.x;
  const heldWait = parked.throwWait;
  const heldUsed = held.rooms.get("22")!.lakituUsed.slice();
  const heldBonus = held.loadRoom("42");
  held.player.areaId = heldBonus.data.id;
  Body.setFrozen(held.player.body, true);
  Body.setPosition(held.player.body, {
    x: heldBonus.offset + 400,
    y: MAP_TOP + 200,
  });
  step(held, 90);
  assert.equal(parked.x, heldX);
  assert.equal(parked.throwWait, heldWait);
  assert.deepEqual(held.rooms.get("22")!.lakituUsed, heldUsed);
  assert.equal(parked.alive, true);
  away.physics.clear();
  held.physics.clear();

  const plain = start(1, 1);
  assert.equal(plain.rooms.get(plain.level.main)!.lakituPoints.length, 0);
  step(plain, 60);
  assert.equal(liveLakitu(plain).length, 0);
  assert.equal(plain.npcs.length, T.population);
  plain.physics.clear();
});

test("spike rescue counts sit outside the land population", () => {
  const s = start(4, 1);
  revealLakitu(s);
  Body.setFrozen(s.player.body, false);
  stand(s.player, s.player.body.position.x);
  const land = () =>
    s.npcs.filter((n) => n.kind === "goomba" || n.kind === "koopa").length;
  assert.equal(land(), T.population);
  s.lakitus[0]!.throwWait = 0;
  step(s);
  const spike = s.npcs.find((n) => n.kind === "spike");
  assert.ok(spike);
  assert.equal(land(), T.population);
  assert.equal(
    s.npcs.length,
    T.population + s.npcs.filter((n) => n.kind === "spike").length,
  );
  stand(spike, s.player.body.position.x + 40);
  stand(s.player, s.player.body.position.x);
  step(s);
  assert.equal(spike.warned, true);
  assert.ok(s.warned >= 1);
  const room = s.activeRoom;
  const goal = room.data.goal;
  assert.ok(goal && goal.kind !== "pipe");
  const feet = MAP_TOP + (goal.row - 1) * 32 + 4;
  Body.setPosition(spike.body, {
    x: room.goalX + 4,
    y: feet - spike.body.height / 2,
  });
  Body.setVelocity(spike.body, { x: 0, y: 0 });
  const savedBefore = s.saved;
  step(s);
  assert.equal(spike.saved, true);
  assert.equal(s.saved, savedBefore + 1);
  s.lakitus[0]!.throwWait = 0;
  step(s);
  const next = s.npcs.find((n) => n.kind === "spike" && n.alive && !n.saved);
  assert.ok(next);
  s.fireballs = [
    {
      id: 9001,
      x: next.body.position.x,
      y: next.body.position.y,
      vx: 0,
      vy: 0,
      age: 0,
      owner: "mario",
    },
  ];
  const diedBefore = s.died();
  step(s);
  assert.equal(next.alive, false);
  assert.equal(s.died(), diedBefore + 1);
  assert.equal(land(), T.population);
  assert.equal(s.died() + s.saved + s.living(), s.npcs.length);
  s.physics.clear();
});

test("Mario contact with a spike is a loss and not a stomp", () => {
  const control = start(1, 1);
  enterMario(control);
  const goomba = control.npcs.find((n) => n.kind === "goomba")!;
  parkAway(control, [goomba]);
  const mx = control.cameraX - 80;
  stand(control.mario, mx);
  stand(goomba, mx + 48);
  control.marioLook = 0;
  let stompedGoomba = false;
  for (let i = 0; i < 15 && control.mario.alive; i++) {
    step(control);
    if (control.marioGoal === "stomp" && control.marioTarget === goomba.id)
      stompedGoomba = true;
  }
  assert.equal(stompedGoomba, true);
  control.physics.clear();

  const s = start(4, 1);
  s.cameraX = s.activeRoom.offset + 400;
  revealLakitu(s);
  enterMario(s);
  parkAway(s);
  s.lakitus[0]!.throwWait = 0;
  step(s);
  const spike = s.npcs.find((n) => n.kind === "spike")!;
  assert.ok(spike);
  stand(s.mario, mx);
  stand(spike, mx + 48);
  stand(s.player, 5600);
  s.marioLook = 0;
  let stompedSpike = false;
  for (let i = 0; i < 20 && s.mario.alive; i++) {
    step(s);
    if (s.marioGoal === "stomp" && s.marioTarget === spike.id)
      stompedSpike = true;
  }
  assert.equal(stompedSpike, false);

  const loss = start(4, 1);
  loss.cameraX = loss.activeRoom.offset + 400;
  revealLakitu(loss);
  enterMario(loss);
  parkAway(loss);
  loss.lakitus[0]!.throwWait = 0;
  step(loss);
  const hazard = loss.npcs.find((n) => n.kind === "spike")!;
  const bystander = loss.npcs.find((n) => n.kind === "goomba")!;
  Body.setPosition(loss.mario.body, { x: 800, y: 300 });
  Body.setPosition(hazard.body, { x: 800, y: 300 });
  Body.setVelocity(loss.mario.body, { x: 0, y: 0 });
  Body.setVelocity(hazard.body, { x: 0, y: 0 });
  stand(bystander, 5200);
  stand(loss.player, 5600);
  step(loss);
  assert.equal(loss.mario.alive, false);
  assert.equal(loss.marioActive, false);
  assert.ok(loss.events.includes("marioDeath"));
  assert.equal(hazard.alive, true);
  assert.equal(loss.player.alive, true);
  assert.equal(bystander.alive, true);

  const crowd = start(4, 1);
  revealLakitu(crowd);
  crowd.lakitus[0]!.throwWait = 0;
  step(crowd);
  const friend = crowd.npcs.find((n) => n.kind === "spike")!;
  const other = crowd.npcs.find((n) => n.kind === "goomba")!;
  Body.setPosition(crowd.player.body, { x: 700, y: 280 });
  Body.setPosition(friend.body, { x: 700, y: 280 });
  Body.setPosition(other.body, { x: 700, y: 280 });
  Body.setVelocity(crowd.player.body, { x: 0, y: 0 });
  Body.setVelocity(friend.body, { x: 0, y: 0 });
  Body.setVelocity(other.body, { x: 0, y: 0 });
  step(crowd);
  assert.equal(crowd.player.alive, true);
  assert.equal(friend.alive, true);
  assert.equal(other.alive, true);
  crowd.physics.clear();
  loss.physics.clear();
  s.physics.clear();
});

test("a spike touch waits out Mario's stun after a hit", () => {
  const s = start(4, 1);
  s.cameraX = s.activeRoom.offset + 400;
  revealLakitu(s);
  enterMario(s);
  parkAway(s);
  s.lakitus[0]!.throwWait = 0;
  step(s);
  const spike = s.npcs.find((n) => n.kind === "spike")!;
  stand(spike, 5200);
  s.setMarioStage(1);
  const hold = (a: Actor) => {
    Body.setPosition(a.body, { x: 800, y: 300 });
    Body.setVelocity(a.body, { x: 0, y: 0 });
  };
  hold(s.mario);
  s.fireballs.push({ id: 1, x: 800, y: 300, vx: 0, age: 0, owner: "player" });
  step(s);
  assert.equal(s.marioStage, 0);
  assert.ok(s.marioStun > 0);
  while (s.marioStun > 2 * dt) {
    hold(s.mario);
    hold(spike);
    step(s);
    assert.equal(s.marioActive, true);
  }
  // Once the stun ends, the same touch is a loss.
  for (let i = 0; i < 5 && s.marioActive; i++) {
    hold(s.mario);
    hold(spike);
    step(s);
  }
  assert.equal(s.marioActive, false);
  assert.ok(s.events.includes("marioDeath"));
  s.physics.clear();
});

test("star, 8x, and fireballs keep their rules against a spike", () => {
  const starred = start(4, 1);
  starred.cameraX = starred.activeRoom.offset + 400;
  revealLakitu(starred);
  enterMario(starred);
  parkAway(starred);
  starred.lakitus[0]!.throwWait = 0;
  step(starred);
  const starSpike = starred.npcs.find((n) => n.kind === "spike")!;
  starred.mario.starLeft = 5;
  Body.setPosition(starred.mario.body, { x: 800, y: 300 });
  Body.setPosition(starSpike.body, { x: 800, y: 300 });
  Body.setVelocity(starred.mario.body, { x: 0, y: 0 });
  Body.setVelocity(starSpike.body, { x: 0, y: 0 });
  step(starred);
  assert.equal(starred.mario.alive, true);
  assert.equal(starred.marioActive, true);
  assert.equal(starSpike.alive, true);

  const huge = start(4, 1);
  huge.cameraX = huge.activeRoom.offset + 400;
  revealLakitu(huge);
  enterMario(huge);
  parkAway(huge);
  huge.lakitus[0]!.throwWait = 0;
  step(huge);
  const hugeSpike = huge.npcs.find((n) => n.kind === "spike")!;
  huge.mario.scale = T.hugeScale;
  huge.mario.hugeLeft = 5;
  Body.setPosition(huge.mario.body, { x: 820, y: 300 });
  Body.setPosition(hugeSpike.body, { x: 820, y: 300 });
  Body.setVelocity(huge.mario.body, { x: 0, y: 0 });
  Body.setVelocity(hugeSpike.body, { x: 0, y: 0 });
  step(huge);
  assert.equal(huge.mario.alive, true);
  assert.equal(huge.marioActive, true);
  assert.equal(hugeSpike.alive, false);

  const spinyHuge = start(4, 1);
  spinyHuge.cameraX = spinyHuge.activeRoom.offset + 400;
  revealLakitu(spinyHuge);
  enterMario(spinyHuge);
  parkAway(spinyHuge);
  spinyHuge.lakitus[0]!.throwWait = 0;
  step(spinyHuge);
  const armored = spinyHuge.npcs.find((n) => n.kind === "spike")!;
  armored.scale = T.hugeScale;
  armored.hugeLeft = 5;
  assert.equal(spinyHuge.marioStage, 2);
  Body.setPosition(spinyHuge.mario.body, { x: 840, y: 300 });
  Body.setPosition(armored.body, { x: 840, y: 300 });
  Body.setVelocity(spinyHuge.mario.body, { x: 0, y: 0 });
  Body.setVelocity(armored.body, { x: 0, y: 0 });
  step(spinyHuge);
  assert.equal(spinyHuge.mario.alive, true);
  assert.equal(spinyHuge.marioStage, 1);
  assert.equal(armored.alive, true);

  const shots = start(4, 1);
  revealLakitu(shots);
  shots.lakitus[0]!.throwWait = 0;
  step(shots);
  const fromMario = shots.npcs.find((n) => n.kind === "spike")!;
  shots.fireballs = [
    {
      id: 1,
      x: fromMario.body.position.x,
      y: fromMario.body.position.y,
      vx: 0,
      vy: 0,
      age: 0,
      owner: "mario",
    },
  ];
  step(shots);
  assert.equal(fromMario.alive, false);
  shots.lakitus[0]!.throwWait = 0;
  step(shots);
  const fromPlayer = shots.npcs.find((n) => n.kind === "spike" && n.alive)!;
  shots.fireballs = [
    {
      id: 2,
      x: fromPlayer.body.position.x,
      y: fromPlayer.body.position.y,
      vx: 0,
      vy: 0,
      age: 0,
      owner: "player",
    },
  ];
  step(shots);
  assert.equal(fromPlayer.alive, true);
  shots.physics.clear();
  starred.physics.clear();
  huge.physics.clear();
  spinyHuge.physics.clear();
});

function throwEgg(s: Simulation) {
  const before = new Set(s.npcs);
  s.lakitus[0]!.throwWait = 0;
  step(s);
  const egg = s.npcs.find((n) => !before.has(n));
  assert.ok(egg);
  assert.equal(egg.kind, "spike");
  assert.equal(egg.egg, true);
  return egg;
}

test("Lakitu tosses a Spiny egg straight up, and it hatches into a walker on landing", () => {
  const s = start(4, 1);
  const cloud = revealLakitu(s);
  // 4-1 ground runs from 1088 to 2496. The player stays out of warning range,
  // so the hatched Spiny idles instead of fleeing.
  Body.setPosition(s.player.body, { x: 1300, y: MAP_TOP + 96 });
  cloud.x = 1500;
  const egg = throwEgg(s);
  const x = cloud.x;
  assert.ok(x > 1400 && x < 1600, `${x}`);
  const spawnTop = cloud.y - T.lakituHeight / 2 - T.spinyEggRise;
  const gravity = T.spinyEggGravity / 3600;
  assert.equal(egg.body.position.x, x);
  assert.equal(egg.body.velocity.x, 0);
  assert.ok(Math.abs(egg.body.velocity.y - (T.spinyEggVy + gravity)) < 1e-6);
  const top = egg.body.bounds.min.y;
  assert.ok(top < spawnTop && top >= spawnTop + T.spinyEggVy - 0.5, `${top}`);
  let rise = 1;
  while (egg.body.velocity.y < 0 && rise < 60) {
    step(s);
    rise++;
    assert.equal(egg.body.position.x, x);
    assert.equal(egg.egg, true);
  }
  // $fd at $20 force: SMB1 rises for 24 frames.
  assert.equal(rise, 24);
  let fastest = 0;
  for (let i = 0; i < 300 && egg.egg; i++) {
    step(s);
    if (!egg.egg) break;
    assert.equal(egg.body.position.x, x);
    assert.equal(egg.body.velocity.x, 0);
    fastest = Math.max(fastest, egg.body.velocity.y);
  }
  assert.equal(egg.egg, false);
  assert.equal(egg.alive, true);
  assert.ok(fastest >= T.spinyEggMaxFall, `${fastest}`);
  assert.ok(fastest <= T.spinyEggMaxFall + gravity + 1e-9, `${fastest}`);
  assert.equal(egg.warned, false);
  assert.equal(egg.body.velocity.y, 0);
  assert.equal(Math.abs(egg.body.velocity.x), T.spinyWalkSpeed);
  const landed = egg.body.position.x;
  step(s, 10);
  assert.equal(Math.abs(egg.body.position.x - landed), 10 * T.spinyWalkSpeed);
  s.physics.clear();
});

test("a Spiny egg is a rescue NPC from the throw and a loss in the air counts", () => {
  const s = start(4, 1);
  revealLakitu(s);
  const warnedBefore = s.warned;
  const egg = throwEgg(s);
  step(s);
  assert.equal(egg.egg, true);
  assert.equal(egg.warned, true, "the player beside Lakitu warns the egg");
  assert.equal(s.warned, warnedBefore + 1);
  assert.equal(s.npcs.length, T.population + 1);
  s.fireballs = [
    {
      id: 9101,
      x: egg.body.position.x,
      y: egg.body.position.y,
      vx: 0,
      vy: 0,
      age: 0,
      owner: "player",
    },
  ];
  step(s);
  assert.equal(egg.alive, true, "player fireballs do not hit it");
  assert.equal(egg.egg, true);
  const diedBefore = s.died();
  s.fireballs = [
    {
      id: 9102,
      x: egg.body.position.x,
      y: egg.body.position.y,
      vx: 0,
      vy: 0,
      age: 0,
      owner: "mario",
    },
  ];
  step(s);
  assert.equal(egg.alive, false);
  assert.equal(s.died(), diedBefore + 1);
  assert.equal(s.died() + s.saved + s.living(), s.npcs.length);
  s.physics.clear();
});

test("a Spiny egg does not hurt the player or NPCs and defeats Mario, even from above", () => {
  const friendly = start(4, 1);
  revealLakitu(friendly);
  const egg = throwEgg(friendly);
  const other = friendly.npcs.find((n) => n.kind === "goomba")!;
  Body.setFrozen(friendly.player.body, false);
  for (const a of [friendly.player, egg, other]) {
    Body.setPosition(a.body, { x: 700, y: 200 });
    Body.setVelocity(a.body, { x: 0, y: 0 });
  }
  step(friendly);
  assert.equal(friendly.player.alive, true);
  assert.equal(other.alive, true);
  assert.equal(egg.alive, true);
  assert.equal(egg.egg, true);
  friendly.physics.clear();

  const s = start(4, 1);
  s.cameraX = s.activeRoom.offset + 400;
  revealLakitu(s);
  enterMario(s);
  parkAway(s);
  const hazard = throwEgg(s);
  assert.equal(s.marioStage, 2);
  const x = s.cameraX - 80;
  stand(s.mario, x);
  // Mario lands on the airborne egg. That is not a stomp.
  Body.setPosition(hazard.body, {
    x,
    y: T.groundY - s.mario.body.height - hazard.body.height / 2 - 2,
  });
  Body.setVelocity(hazard.body, { x: 0, y: 0 });
  Body.setPosition(s.mario.body, {
    x,
    y: hazard.body.bounds.min.y - s.mario.body.height / 2 - 1,
  });
  Body.setVelocity(s.mario.body, { x: 0, y: 4 });
  for (let i = 0; i < 4 && s.mario.alive; i++) step(s);
  assert.equal(s.mario.alive, false);
  assert.ok(s.events.includes("marioDeath"));
  assert.equal(hazard.alive, true);
  assert.equal(hazard.egg, true, "a stomp does not hatch it");
  assert.notEqual(s.marioTarget, hazard.id);
  s.physics.clear();
});

test("Lakitu shows the drop pose only for the 16 frames before each throw", () => {
  const s = start(4, 1);
  const cloud = revealLakitu(s);
  const drops: boolean[] = [];
  const throws: number[] = [];
  for (let frame = 0; frame < 300; frame++) {
    const count = s.npcs.length;
    step(s);
    if (s.npcs.length > count) throws.push(frame);
    drops.push(s.lakituDropping(cloud));
  }
  assert.equal(throws.length, 2);
  // Float steps can land 2.2 s on frame 133.
  const gap = throws[1]! - throws[0]!;
  assert.ok(Math.abs(gap - T.lakituThrow * 60) <= 1, `${gap}`);
  for (let frame = 0; frame < drops.length; frame++) {
    const before = throws.some(
      (t) => frame < t && frame >= t - T.lakituDropFrames,
    );
    assert.equal(drops[frame], before, `frame ${frame}`);
  }

  // At the spike cap he rides. A freed slot gets a full drop pose first.
  for (let i = 0; i < T.lakituSpikeCap - 2; i++) throwEgg(s);
  const spikes = s.npcs.filter((n) => n.kind === "spike");
  assert.equal(spikes.length, T.lakituSpikeCap);
  for (let frame = 0; frame < 200; frame++) {
    step(s);
    assert.equal(s.lakituDropping(cloud), false, `capped ${frame}`);
    assert.equal(s.npcs.length, T.population + T.lakituSpikeCap);
  }
  for (const n of spikes) if (n.alive) stand(n, 5200);
  spikes.find((n) => n.alive)!.alive = false;
  let posed = 0;
  for (let frame = 0; frame < 30 && s.npcs.length === T.population + 4; frame++) {
    step(s);
    if (s.lakituDropping(cloud)) posed++;
  }
  assert.equal(s.npcs.length, T.population + T.lakituSpikeCap + 1);
  assert.equal(posed, T.lakituDropFrames);
  s.physics.clear();
});

test("Lakitu stages return Fire Mario and other stages keep the timer", () => {
  for (const [world, stage] of [
    [4, 1],
    [6, 1],
    [8, 2],
  ] as const) {
    const s = start(world, stage);
    assert.equal(s.marioStage, 2, s.level.id);
    assert.equal(s.mario.flower, true, s.level.id);
    assert.equal(s.elapsed < T.fasterAt, true);
    enterMario(s);
    assert.equal(s.marioStage, 2, s.level.id);
    assert.equal(s.mario.flower, true, s.level.id);
    Body.setPosition(s.mario.body, { x: s.cameraX - 700, y: 400 });
    step(s);
    assert.equal(s.marioActive, false, s.level.id);
    s.elapsed = 0;
    s.marioDeath = null;
    s.marioReturn = 0;
    step(s);
    assert.equal(s.marioActive, true, s.level.id);
    assert.equal(s.marioStage, 2, s.level.id);
    assert.equal(s.mario.flower, true, s.level.id);
    s.physics.clear();
  }

  const plain = start(1, 1);
  assert.equal(plain.marioStage, 1);
  assert.equal(plain.mario.flower, false);
  enterMario(plain);
  assert.equal(plain.marioStage, 1);
  assert.equal(plain.mario.flower, false);
  Body.setPosition(plain.mario.body, { x: plain.cameraX - 700, y: 400 });
  step(plain);
  assert.equal(plain.marioActive, false);
  plain.elapsed = 0;
  plain.marioDeath = null;
  plain.marioReturn = 0;
  step(plain);
  assert.equal(plain.marioActive, true);
  assert.equal(plain.marioStage, 1);
  assert.equal(plain.phase < 2, true);
  Body.setPosition(plain.mario.body, { x: plain.cameraX - 700, y: 400 });
  step(plain);
  assert.equal(plain.marioActive, false);
  plain.elapsed = T.fireballsAt;
  plain.marioDeath = null;
  plain.marioReturn = 0;
  step(plain);
  assert.equal(plain.phase, 2);
  assert.equal(plain.marioActive, true);
  assert.equal(plain.marioStage, 2);
  assert.equal(plain.mario.flower, true);
  plain.physics.clear();
});
