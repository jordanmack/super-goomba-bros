import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  decodeAll,
  decodeArea,
  decodeObjects,
  decodeEnemies,
  parseTables,
} from "../scripts/extract-levels.mjs";
import { WORLD_1_1 } from "./fixtures/world-1-1.ts";
import {
  isCannonBarrel,
  isCannonTile,
  isFlagpoleTile,
  isSmashExemptTile,
  isSolidTile,
} from "../src/game/levels.ts";

const root = new URL("../src/assets/levels/", import.meta.url);
const read = (name: string) =>
  JSON.parse(readFileSync(new URL(name, root), "utf8"));
const { tables } = read("source-tables.json");
const { areas, levels } = decodeAll(tables);

test("World 1-1 decoded collision anchors match the existing reference map", () => {
  const area = decodeArea(tables, 0x25);
  assert.equal(area.width, WORLD_1_1.columns);
  assert.equal(area.goal.column, WORLD_1_1.castleDoorX);
  assert.deepEqual(
    area.pipes.map(({ column, height }) => ({ column, height })),
    WORLD_1_1.pipes,
  );
  const sorted = (points: readonly (readonly number[])[]) =>
    points.map((p) => p.join(",")).sort();
  assert.deepEqual(
    sorted(
      area.blocks
        .filter((b) => b.kind === "brick")
        .map((b) => [b.column, b.row]),
    ),
    sorted(WORLD_1_1.bricks),
  );
  assert.deepEqual(
    sorted(
      area.blocks
        .filter((b) => b.kind === "question" && !b.hidden)
        .map((b) => [b.column, b.row]),
    ),
    sorted(WORLD_1_1.questions),
  );
  const gaps = WORLD_1_1.gaps.flatMap(([start, end]) =>
    Array.from({ length: end - start }, (_, i) => start + i),
  );
  assert.deepEqual(
    area.tiles[13].flatMap((tile, x) => (tile === 0 ? [x] : [])),
    gaps,
  );
  const stairs = WORLD_1_1.stairs.flatMap(([row, first, last]) =>
    Array.from({ length: last - first + 1 }, (_, i) => [first + i, row]),
  );
  assert.deepEqual(
    sorted(
      area.tiles.flatMap((row, y) =>
        row.flatMap((tile, x) => (tile === 97 ? [[x, y]] : [])),
      ),
    ),
    sorted(stairs),
  );
});

test("cannon tiles stay solid and 8x-unsmashable, and all 31 barrels exist", () => {
  assert.equal(isCannonBarrel(100), true);
  assert.equal(isCannonTile(100), true);
  assert.equal(isCannonTile(101), true);
  assert.equal(isCannonTile(102), true);
  assert.equal(isSolidTile(100), true);
  assert.equal(isSolidTile(101), true);
  assert.equal(isSolidTile(102), true);
  assert.equal(isSmashExemptTile(100), true);
  assert.equal(isSmashExemptTile(101), true);
  assert.equal(isSmashExemptTile(102), true);
  const counts: Record<string, number> = {
    "21": 3,
    "2a": 3,
    "31": 2,
    "32": 10,
    "33": 13,
  };
  let total = 0;
  for (const [id, expected] of Object.entries(counts)) {
    const area = areas.find((a) => a.id === id);
    assert.ok(area, id);
    const barrels = area.tiles.flatMap((row, y) =>
      row.flatMap((tile, x) => (isCannonBarrel(tile) ? [[x, y]] : [])),
    );
    assert.equal(barrels.length, expected, id);
    for (const [column, row] of barrels) {
      const object = area.objects.find(
        (o) => o.opcode === 1 && o.column === column && o.row === row,
      );
      assert.ok(object, `${id} cannon at ${column},${row}`);
    }
    total += barrels.length;
  }
  assert.equal(total, 31);
});

test("spring tiles stay solid and 8x-unsmashable", () => {
  assert.equal(isSolidTile(103), true);
  assert.equal(isSolidTile(104), true);
  assert.equal(isSmashExemptTile(103), true);
  assert.equal(isSmashExemptTile(104), true);
  for (const id of ["24", "28", "2d", "31", "32", "33"]) {
    const area = areas.find((a) => a.id === id);
    const springs = area.objects.filter((o) => o.opcode === 33);
    assert.ok(springs.length >= 1, `${id}: has a spring`);
    for (const spring of springs) {
      assert.equal(area.tiles[spring.row][spring.column], 103);
      assert.equal(area.tiles[spring.row + 1][spring.column], 104);
    }
  }
});

test("flagpole shaft tiles are scenery and World 1-1 keeps its original pole", () => {
  assert.equal(isFlagpoleTile(36), true);
  assert.equal(isFlagpoleTile(37), true);
  assert.equal(isSolidTile(36), false);
  assert.equal(isSolidTile(37), false);
  assert.equal(isSolidTile(97), true);
  const area = decodeArea(tables, 0x25);
  const pole = area.objects.find((o) => o.opcode === 35);
  assert.equal(pole?.column, 198);
  assert.equal(area.tiles[2][198], 36);
  assert.equal(area.tiles[3][198], 37);
  assert.equal(area.tiles[12][198], 97);
});

test("all 32 campaign levels and 34 shared areas reproduce the bundled data", () => {
  assert.equal(levels.length, 32);
  assert.equal(areas.length, 34);
  assert.deepEqual(read("campaign.json").levels, levels);
  for (const area of areas) {
    assert.deepEqual(read(`area-${area.id}.json`), area, area.label);
    assert.equal(area.tiles.length, area.height);
    for (const row of area.tiles) {
      assert.equal(row.length, area.width);
      assert.ok(
        row.every((tile) => Number.isInteger(tile) && tile >= 0 && tile <= 197),
      );
    }
    for (const destination of area.destinations) {
      const target = areas.find((a) => a.id === destination.area);
      assert.ok(target, `${area.id} -> ${destination.area}`);
      assert.ok(
        destination.page * 16 < target.width,
        `${area.id}: destination page in bounds`,
      );
    }
  }
  assert.deepEqual(
    levels.map((l) => l.id),
    Array.from(
      { length: 32 },
      (_, i) => `${Math.floor(i / 4) + 1}-${(i % 4) + 1}`,
    ),
  );
  for (const level of levels)
    for (const id of level.route) assert.ok(areas.some((a) => a.id === id));
  assert.deepEqual(levels.find((l) => l.id === "1-2").route, ["29", "40"]);
  assert.deepEqual(levels.find((l) => l.id === "2-2").route, ["29", "01"]);
  assert.deepEqual(levels.find((l) => l.id === "4-2").route, ["29", "41"]);
});

test("extracted hidden blocks keep 19 coins, 8 one-ups, and two 1-up bricks", () => {
  const hidden = areas.flatMap((area) =>
    area.blocks.filter((block) => block.hidden),
  );
  assert.equal(hidden.filter((block) => block.content === "coin").length, 19);
  assert.equal(hidden.filter((block) => block.content === "1-up").length, 8);
  assert.equal(hidden.length, 27);
  assert.equal(
    areas.flatMap((area) =>
      area.blocks.filter((block) => block.content === "1-up" && !block.hidden),
    ).length,
    2,
  );
});

test("1-2 and 4-2 warp-zone pipes go to distinct first stages", () => {
  const area40 = areas.find((a) => a.id === "40");
  const dest = (column) =>
    area40.pipes
      .find((p) => p.column === column)
      .destinations.find((d) => d.world === 1);
  assert.deepEqual(dest(178), {
    world: 1,
    area: "22",
    page: 0,
    entrance: 0,
  });
  assert.deepEqual(dest(182), {
    world: 1,
    area: "24",
    page: 0,
    entrance: 0,
  });
  assert.deepEqual(dest(186), {
    world: 1,
    area: "28",
    page: 0,
    entrance: 0,
  });
  const area41 = areas.find((a) => a.id === "41");
  assert.deepEqual(
    area41.pipes
      .find((p) => p.column === 214)
      .destinations.find((d) => d.world === 4),
    { world: 4, area: "2a", page: 0, entrance: 0 },
  );
  assert.equal(levels.find((l) => l.id === "4-1").main, "22");
  assert.equal(levels.find((l) => l.id === "3-1").main, "24");
  assert.equal(levels.find((l) => l.id === "2-1").main, "28");
  assert.equal(levels.find((l) => l.id === "5-1").main, "2a");
});

test("pipe routes preserve world-specific underground return pages and 8-4 connections", () => {
  const entry = areas
    .find((a) => a.id === "25")
    .pipes.find((p) => p.direction === "down");
  assert.equal(entry.column, 57);
  assert.deepEqual(
    entry.destinations.find((d) => d.world === 1),
    { world: 1, area: "42", page: 0, entrance: 1 },
  );
  const returnPipe = areas
    .find((a) => a.id === "42")
    .pipes.find((p) => p.column === 13);
  assert.equal(returnPipe.destinations.find((d) => d.world === 1).area, "25");
  assert.equal(returnPipe.destinations.find((d) => d.world === 1).page, 10);
  const finalCastle = areas.find((a) => a.id === "65");
  assert.ok(
    finalCastle.pipes.some((p) =>
      p.destinations.some((d) => d.area === "02" && d.world === 8),
    ),
  );
  assert.ok(
    areas
      .find((a) => a.id === "02")
      .pipes.some((p) =>
        p.destinations.some((d) => d.area === "65" && d.world === 8),
      ),
  );
});

test("table decoding handles page commands, overlapping objects, and three-byte destinations", () => {
  const objects = decodeObjects([0, 1, 0x07, 0x81, 0x0d, 5, 0x13, 0x22, 0xfd]);
  assert.deepEqual(
    objects.map((o) => [o.column, o.row, o.opcode]),
    [
      [16, 9, 23],
      [81, 5, 2],
    ],
  );
  const decoded = decodeEnemies([
    0x0f, 5, 0x1e, 0xc2, 0x2a, 0x6b, 6, 0x8b, 0x86, 0xff,
  ]);
  assert.deepEqual(decoded.destinations, [
    { column: 81, area: "42", page: 10, world: 2, entrance: 1 },
  ]);
  assert.deepEqual(
    decoded.enemies.map((e) => e.column),
    [86, 104],
  );
  assert.throws(() => parseTables("NES\0binary"), /never a ROM/);
});

test("palette controls stay latched and every area has matching tile art", () => {
  const atlas = JSON.parse(
    readFileSync(
      new URL("../src/assets/smb/metatiles.json", import.meta.url),
      "utf8",
    ),
  );
  for (const [id, palette] of [
    ["24", "snow-night"],
    ["2a", "snow-day"],
    ["2d", "snow"],
    ["2e", "night"],
    ["40", "underground"],
    ["01", "water"],
    ["60", "castle"],
  ])
    assert.equal(areas.find((area) => area.id === id).palette, palette);
  assert.ok(
    areas
      .find((area) => area.id === "2e")
      .attributes.every((attribute) => attribute.color === 4),
  );
  for (const area of areas) {
    assert.ok(atlas.themes.includes(area.palette));
    for (const tile of new Set(area.tiles.flat()))
      if (tile && tile !== 95 && tile !== 96)
        assert.ok(
          atlas.coverage[area.palette].includes(tile),
          `${area.id}: tile ${tile} has art`,
        );
  }
  // One-colour harvests such as the flagpole shaft stay covered.
  assert.ok(atlas.coverage.day.includes(37));
  const extract = readFileSync(
    new URL("../scripts/extract-metatiles.mjs", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(extract, /colors\.size < 2/);
  for (const level of ["1-2", "2-1", "2-2", "3-1", "5-2", "6-2"])
    assert.equal(
      atlas.regions.find((region) => region.level === level).offsetY,
      240,
      `${level}: main map strip`,
    );
});

test("end-of-stage castles stay 5-wide and do not fill terrain to the right edge", () => {
  const castleBody = new Set([69, 70, 71, 72, 73, 74, 75]);
  for (const area of areas) {
    if (area.type !== "overworld" || area.goal?.kind !== "castle-door")
      continue;
    const castle = area.objects
      .filter((o) => o.opcode === 18 && o.column > 16)
      .at(-1);
    if (!castle) continue;
    const after = castle.column + 5;
    for (let y = 2; y < 13; y++) {
      assert.equal(
        castleBody.has(area.tiles[y][area.width - 1]),
        false,
        `${area.id} row ${y}: castle wall does not run to the right edge`,
      );
      for (let x = after; x < area.width; x++)
        assert.equal(
          castleBody.has(area.tiles[y][x]),
          false,
          `${area.id} row ${y} col ${x}: no trailing castle fill`,
        );
    }
    assert.equal(area.tiles[13][after], 84, `${area.id}: ground past castle`);
  }
  const area26 = areas.find((area) => area.id === "26");
  const area25 = areas.find((area) => area.id === "25");
  const castle26 = area26.objects
    .filter((o) => o.opcode === 18 && o.column > 16)
    .at(-1);
  const castle25 = area25.objects
    .filter((o) => o.opcode === 18 && o.column > 16)
    .at(-1);
  const slice = (area, castle, y) =>
    area.tiles[y].slice(castle.column, castle.column + 5);
  // 1-3 keeps a 5-wide body with both side walls, like 1-1's short castle.
  assert.deepEqual(slice(area26, castle26, 4), [69, 73, 73, 73, 69]);
  assert.deepEqual(slice(area26, castle26, 5), [71, 71, 74, 71, 71]);
  assert.deepEqual(slice(area25, castle25, 10), [69, 73, 73, 73, 69]);
  assert.deepEqual(slice(area25, castle25, 11), [71, 71, 74, 71, 71]);
  // Foreground-2 wall still draws in the two columns before 1-3's castle.
  assert.equal(area26.tiles[7][castle26.column - 2], 69);
  assert.equal(area26.tiles[8][castle26.column - 2], 71);
  assert.equal(area26.tiles[7][castle26.column], 73);
  // Start-of-stage fg=2 (2-1) is not clipped by the end-castle bound.
  const area28 = areas.find((area) => area.id === "28");
  assert.equal(area28.tiles[7][5], 69);
  assert.equal(area28.tiles[8][5], 71);
});

test("castle-room goals overlay the inverted door rather than punching a hole", () => {
  const rooms = areas.filter((area) => area.goal?.kind === "castle-room");
  assert.ok(rooms.length >= 6, "every castle interior has a rescue door");
  for (const area of rooms) {
    assert.equal(area.palette, "castle", `${area.id}: castle-room uses castle art`);
    const used = new Set(area.tiles.flat());
    assert.equal(
      used.has(74) || used.has(75),
      false,
      `${area.id}: rescue door is not a tilemap hole of 74/75`,
    );
    assert.equal(area.goal.row, 12, `${area.id}: door sits on the same two-tile row`);
  }
});
