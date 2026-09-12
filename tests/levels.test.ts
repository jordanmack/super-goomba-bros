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
import { isFlagpoleTile, isSolidTile } from "../src/game/levels.ts";

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
  for (const level of ["1-2", "2-1", "2-2", "3-1", "5-2", "6-2"])
    assert.equal(
      atlas.regions.find((region) => region.level === level).offsetY,
      240,
      `${level}: main map strip`,
    );
});
