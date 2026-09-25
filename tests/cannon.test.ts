import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Body } from "../src/game/physics.ts";
import { physics } from "./support/arcade.ts";
import {
  Simulation as RulesSimulation,
  emptyInput,
} from "../src/game/simulation.ts";
import { CANNON_BLAST, TUNING as T } from "../src/game/config.ts";
import {
  BULLET_BILL_CROP,
  BULLET_BILL_DRAW_Y,
} from "../src/game/smb-sprites.ts";
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

test("a falling stomp on a Bullet Bill pushes a stomp or kick event", () => {
  const s = game();
  Body.setPosition(s.player.body, { x: 200, y: 270 });
  Body.setVelocity(s.player.body, { x: 0, y: 8 });
  s.player.grounded = false;
  s.spawnBulletBill(200, 300, 0);
  tick(s, dt);
  assert.equal(s.player.alive, true);
  assert.equal(s.bulletBills.length, 0);
  assert.ok(
    s.events.includes("splat") || s.events.includes("kick"),
    "stomp or kick audio",
  );
});

test("a fireball overlap leaves the Bullet Bill alive and does not treat the fireball as a miss", () => {
  const s = game();
  at(s, 100, 415);
  s.spawnBulletBill(200, 300, 0);
  const bill = s.bulletBills[0]!;
  s.fireballs.push({
    id: 1,
    x: bill.x,
    y: bill.y,
    vx: 4,
    age: 0,
    owner: "player",
  });
  tick(s, dt);
  assert.equal(s.bulletBills.length, 1);
  assert.equal(s.bulletBills[0]!.id, bill.id);
  const fireball = s.fireballs[0];
  assert.ok(
    !fireball || (fireball.vy ?? 0) < 0 || fireball.age >= 5,
    "fireball bounced or was consumed, not a miss",
  );
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

test("Bullet Bill crop is the 16x16 at (60, 125), drawn 32x32 facing travel", () => {
  assert.deepEqual(BULLET_BILL_CROP, {
    x: 60,
    y: 125,
    width: 16,
    height: 16,
  });
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const play = readFileSync(join(root, "src/game/scenes/Play.ts"), "utf8");
  const sprites = readFileSync(join(root, "src/game/smb-sprites.ts"), "utf8");
  assert.match(sprites, /bulletBill: crop\(\s*enemies,\s*BULLET_BILL_CROP\.x/);
  assert.match(
    play,
    /image\(b\.x, b\.y \+ BULLET_BILL_DRAW_Y, 32, 32, "bulletBill", 9\)\.setFlipX\(\s*b\.vx < 0,?\s*\)/,
  );

  // Play flips only when vx < 0, so the source must point its nose right:
  // the square back band fills the left column and the round nose tapers
  // to a few pixels in the right column.
  const { x, y, width: w, height: h } = BULLET_BILL_CROP;
  const rgba = execFileSync(
    "convert",
    [
      join(root, "src/assets/smb/enemies.png"),
      "-crop",
      `${w}x${h}+${x}+${y}`,
      "-depth",
      "8",
      "rgba:-",
    ],
    { maxBuffer: 1e6 },
  );
  const opaque = (px: number, py: number) => rgba[(py * w + px) * 4 + 3]! >= 128;
  const count = (n: number, hit: (i: number) => boolean) => {
    let total = 0;
    for (let i = 0; i < n; i++) if (hit(i)) total++;
    return total;
  };
  const column = (px: number) => count(h, (py) => opaque(px, py));
  const row = (py: number) => count(w, (px) => opaque(px, py));
  assert.equal(column(0), 14, "back band on the left");
  assert.ok(column(w - 1) <= 4, "nose tip on the right");
  assert.ok(row(0) > 0 && row(13) > 0, "14 rows of art");
  assert.equal(row(14) + row(15), 0, "2 clear rows under the art");
  assert.equal(BULLET_BILL_DRAW_Y, 2, "one clear source row down centers it");
});

test("a cannon shot plays the fireworks blast only when the bill leaves", () => {
  assert.equal(CANNON_BLAST.cue, "fireworks");
  assert.equal(CANNON_BLAST.event, "blast");
  const s = stage("2a");
  const room = s.activeRoom;
  const cannon = room.cannons[0]!;
  const others = room.cannons.filter((c) => c !== cannon);
  const arm = () => {
    cannon.timer = 0;
    for (const c of others) c.timer = 10_000;
    s.bulletBills = [];
    s.events.length = 0;
  };

  at(s, cannon.x + 200, T.groundY - 14);
  arm();
  tick(s, dt);
  assert.ok(
    s.bulletBills.some((b) => Math.abs(b.cannonX - cannon.x) < 1),
    "bill leaves the barrel",
  );
  assert.ok(s.events.includes(CANNON_BLAST.event), "blast cue");
  assert.equal(s.events.includes("firework"), false);
  assert.equal(s.fireworks.length, 0, "no firework frames");
  // Cold-boot LSFR selects slot 0 from all three enemy slots: write $0e,
  // then count the same barrel down on the two selects that follow.
  assert.equal(cannon.timer, T.cannonReload - 2);
  assert.equal(T.cannonReload, 0x0e);

  at(s, cannon.x, cannon.y);
  arm();
  tick(s, dt);
  assert.equal(
    s.bulletBills.some((b) => Math.abs(b.cannonX - cannon.x) < 1),
    false,
  );
  assert.equal(s.events.includes(CANNON_BLAST.event), false);
  assert.equal(cannon.timer, T.cannonReload - 2);
});

test("a barrel outside the visible camera reloads with no bill and no blast", () => {
  const s = stage("2a");
  const room = s.activeRoom;
  const cannon = room.cannons[0]!;
  const width = s.viewWidth;
  // Right edge 8px past the camera, still inside the 32px cull pad.
  const cam = Math.max(
    room.offset,
    Math.min(
      room.offset + room.data.width * 32 - width,
      cannon.x + 24,
    ),
  );
  assert.equal(cam, cannon.x + 24);
  at(s, cam + width * T.cameraAnchor, T.groundY - 14);
  cannon.timer = 0;
  for (const other of room.cannons) if (other !== cannon) other.timer = 10_000;
  s.bulletBills = [];
  s.events.length = 0;
  tick(s, dt);
  assert.equal(s.bulletBills.length, 0);
  assert.equal(s.events.includes(CANNON_BLAST.event), false);
  assert.equal(cannon.timer, T.cannonReload - 2);
});

test("two barrels on one LSFR slot do not volley into the same enemy slot", () => {
  const s = stage("32");
  const pair = s.activeRoom.cannons.filter((c) => c.column === 93);
  assert.equal(pair.length, 2);
  assert.equal(pair[0]!.slot, pair[1]!.slot);
  const others = s.activeRoom.cannons.filter((c) => !pair.includes(c));
  let saw = false;
  for (let i = 0; i < 400 && !saw; i++) {
    for (const c of pair) c.timer = 0;
    for (const c of others) c.timer = 10_000;
    s.bulletBills = [];
    at(s, pair[0]!.x + 200, T.groundY - 14);
    tick(s, dt);
    const fired = s.bulletBills.filter(
      (b) => Math.abs(b.cannonX - pair[0]!.x) < 1,
    );
    if (!fired.length) continue;
    saw = true;
    assert.equal(fired.length, 1);
  }
  assert.ok(saw, "the shared slot eventually fires one bill");
});

test("shared-slot barrels take turns, including a later column beside an earlier one", () => {
  const s = stage("33");
  const room = s.activeRoom;
  const pair = room.cannons.filter(
    (c) => c.column === 64 || c.column === 36,
  );
  assert.equal(pair.length, 2);
  assert.equal(pair[0]!.slot, pair[1]!.slot);
  const left = pair.reduce((a, b) => (a.x < b.x ? a : b));
  const width = s.viewWidth;
  const cam = left.x - 32;
  assert.equal(
    Math.max(room.offset, Math.min(room.offset + room.data.width * 32 - width, cam)),
    cam,
  );
  const seen = new Set<number>();
  const others = room.cannons.filter((c) => !pair.includes(c));
  for (let i = 0; i < 180 && seen.size < 2; i++) {
    for (const c of pair) c.timer = 0;
    for (const c of others) c.timer = 10_000;
    s.bulletBills = [];
    at(s, cam + width * T.cameraAnchor, T.groundY - 14);
    tick(s, dt);
    for (const bill of s.bulletBills) {
      const source = pair.find(
        (c) => Math.abs(c.x - bill.cannonX) < 1 && Math.abs(c.y - bill.y) < 1,
      );
      if (source) seen.add(source.column);
    }
  }
  assert.ok(seen.has(36) && seen.has(64), `saw columns ${[...seen].join(",")}`);
});

test("cannon timers count on an LSFR select, not a flat 80-frame metronome", () => {
  assert.equal(T.cannonReload, 0x0e);
  assert.equal(T.cannonSelectMax, 6);
  assert.notEqual(T.cannonReload, 80);
  const s = stage("2a");
  const cannons = s.activeRoom.cannons;
  assert.equal(cannons.length, 3);
  const before = cannons.map((c) => c.timer);
  for (const timer of before)
    assert.ok(timer >= T.cannonReload && timer < T.cannonReload * 2);
  assert.ok(Math.max(...before) < 80);
  tick(s, dt);
  const changed = cannons.filter((c, i) => c.timer !== before[i]).length;
  assert.ok(changed > 0 && changed < cannons.length, "only the LSFR slot ticks");
  for (const cannon of cannons) assert.ok(cannon.timer < 80);
});
