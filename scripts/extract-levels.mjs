// Offline conversion of public disassembly TEXT tables. Never accepts ROM data.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export const SOURCE_URL =
  "https://gist.githubusercontent.com/WillSams/678a2d8a49d3f01e1d6e0362f83d1fbc/raw/1202d0a4a1feaded9b1f1947d5aade7d91cca0e1/SMBDIS.ASM";
const output = new URL("../src/assets/levels/", import.meta.url);
const supportingTables = [
  "AreaDataHOffsets",
  "AreaDataAddrLow",
  "EnemyAddrHOffsets",
  "EnemyDataAddrLow",
  "BackSceneryData",
  "BackSceneryMetatiles",
  "ForeSceneryData",
  "TerrainMetatiles",
  "TerrainRenderBits",
  "CastleMetatiles",
  "BrickQBlockMetatiles",
  "StaircaseHeightData",
  "StaircaseRowData",
  "LoopCmdWorldNumber",
  "LoopCmdPageNumber",
  "LoopCmdYPosition",
  "AreaDataOfsLoopback",
];

export function parseTables(source) {
  if (!source.includes("L_GroundArea6:") || source.includes("\0"))
    throw new Error(
      "Expected SMB disassembly text with labeled area tables, never a ROM.",
    );
  const tables = {};
  const labels = [...source.matchAll(/^([A-Za-z_][\w]*):/gm)];
  for (let index = 0; index < labels.length; index++) {
    const label = labels[index][1];
    if (
      !/^[LE]_(Ground|Water|Underground|Castle)Area\d+$/.test(label) &&
      !/^World\dAreas$/.test(label) &&
      !supportingTables.includes(label)
    )
      continue;
    const section = source.slice(labels[index].index, labels[index + 1]?.index);
    tables[label] = [...section.matchAll(/\.byte\s+([^;\r\n]+)/g)]
      .flatMap((match) => match[1].trim().split(/\s*,\s*/))
      .map((token) => {
        if (/^\$[\da-f]+$/i.test(token)) return parseInt(token.slice(1), 16);
        if (/^%[01]+$/.test(token)) return parseInt(token.slice(1), 2);
        if (/^\d+$/.test(token)) return Number(token);
        if (/^<[LE]_\w+$/.test(token)) return token.slice(1);
        throw new Error(`Unsupported table value ${label}: ${token}`);
      });
  }
  // GroundArea9's enemy terminator is shared with the following intro table.
  if (tables.E_GroundArea9.at(-1) !== 255) tables.E_GroundArea9.push(255);
  return tables;
}

const areaId = (pointer) => (pointer & 127).toString(16).padStart(2, "0");
const TYPES = ["water", "overworld", "underground", "castle"];
// WarpZoneObject ($34). ScrollLockObject_Warp sets WarpZoneControl; this enemy
// marks the pipes that HandlePipeEntry maps through WarpZoneNumbers.
const WARP_ZONE_OBJECT = 52;
// ScrollLockObject_Warp. Sets WarpZoneControl; 4-2's vine bonus has this
// without a type-52 enemy, so those down pipes still need WarpZoneNumbers.
const SCROLL_LOCK_WARP = 39;
// WarpZoneNumbers. World 1 uses control 4 (4/3/2). Later underground uses
// control 5 (world 5 only). Later overworld uses control 6 (8/7/6), including
// the 4-2 vine bonus 2f.
const WARP_ZONE_WORLDS = { 4: [4, 3, 2], 5: [5], 6: [8, 7, 6] };

function firstStageArea(tables, world) {
  const pointers = tables[`World${world}Areas`];
  const first = areaId(pointers[0]);
  return first === "29" ? areaId(pointers[1]) : first;
}

function worldsUsingArea(tables, id) {
  const worlds = [];
  for (let world = 1; world <= 8; world++) {
    const pointers = tables[`World${world}Areas`];
    if (pointers.some((pointer) => areaId(pointer) === id)) worlds.push(world);
  }
  return worlds;
}

function worldsReachingArea(tables, id) {
  const worlds = worldsUsingArea(tables, id);
  if (worlds.length) return worlds;
  const found = [];
  for (const [label, bytes] of Object.entries(tables)) {
    if (!/^E_(Ground|Water|Underground|Castle)Area\d+$/.test(label)) continue;
    const { destinations } = decodeEnemies(bytes);
    for (const d of destinations) {
      if (d.area === id && !found.includes(d.world)) found.push(d.world);
    }
  }
  return found.length ? found : [1];
}

export function decodeObjects(bytes) {
  let page = 0;
  const objects = [];
  for (let i = 2; i < bytes.length && bytes[i] !== 253; i += 2) {
    const first = bytes[i],
      second = bytes[i + 1];
    if (second === undefined) throw new Error("Truncated area object");
    const row = first & 15,
      data = second & 15;
    if (second & 128) page++;
    if (row === 13 && !(second & 64)) {
      if (!(second & 128)) page = second & 31;
      continue;
    }
    let opcode;
    if (row === 14) opcode = 46;
    else if (row === 13) opcode = 34 + (second & 63);
    else if (row === 12) opcode = 8 + ((second >> 4) & 7);
    else if (row === 15) opcode = 16 + ((second >> 4) & 7);
    else if (!(second & 112)) opcode = 22 + data;
    else opcode = (second >> 4) & 7;
    if (opcode === 7 && second & 8) opcode = 0;
    objects.push({
      column: page * 16 + (first >> 4),
      row: row + 2,
      opcode,
      data,
      byte: second,
      offset: i,
    });
  }
  return objects;
}

export function decodeEnemies(bytes) {
  let page = 0,
    pageSelected = false;
  const enemies = [],
    destinations = [];
  for (let i = 0; i < bytes.length && bytes[i] !== 255;) {
    const first = bytes[i],
      second = bytes[i + 1];
    if (second === undefined) throw new Error("Truncated enemy object");
    const row = first & 15;
    if (second & 128 && !pageSelected) {
      page++;
      pageSelected = true;
    }
    if (row === 15 && !pageSelected) {
      page = second & 63;
      pageSelected = true;
      i += 2;
      continue;
    }
    const column = page * 16 + (first >> 4);
    if (row === 14) {
      const third = bytes[i + 2];
      if (third === undefined) throw new Error("Truncated area destination");
      destinations.push({
        column,
        area: areaId(second),
        page: third & 31,
        world: (third >> 5) + 1,
        entrance: second >> 7,
      });
      i += 3;
    } else {
      // Y is an absolute screen row for enemies, unlike area object rows.
      enemies.push({ column, row, type: second & 63, hard: !!(second & 64) });
      i += 2;
    }
    pageSelected = false;
  }
  return { enemies, destinations };
}

function objectWidth(o, style) {
  if (o.opcode === 0 || o.opcode === 7) return 2;
  if (o.opcode === 18) return 5;
  if (o.opcode === 20 || o.opcode === 34) return 4;
  if (o.opcode === 38) return 13;
  if (
    (o.opcode === 1 && style !== 2) ||
    (o.opcode >= 2 && o.opcode <= 4) ||
    (o.opcode >= 8 && o.opcode <= 15) ||
    o.opcode === 19
  )
    return o.data + 1;
  return 1;
}

// Same solid IDs as src/game/levels.ts isSolidTile.
export function isSolidMetatile(id) {
  if (id === 36 || id === 37) return false;
  return (
    (id >= 16 && id <= 34) ||
    (id >= 81 && id <= 94) ||
    (id >= 97 && id <= 108) ||
    id === 136 ||
    id === 137 ||
    id === 192 ||
    id === 193 ||
    id === 196
  );
}

export function axeMetatileRow(tiles, column) {
  for (let row = 3; row <= 13; row++) {
    const tile = tiles[row]?.[column] ?? 0;
    const above = tiles[row - 1]?.[column] ?? 0;
    if (isSolidMetatile(tile) && !isSolidMetatile(above)) return row - 1;
  }
  // axeStandY falls back to groundY (top of row 13); the sprite sits one cell above.
  return 12;
}

// Metatile IDs and area commands follow AreaParserCore / RunAObj in the source.
// The first two screen rows are outside its thirteen-row playfield buffer.
// L_UndergroundArea3 holds the one-screen pipe coin rooms. SMB1 never shows
// the columns between a room's exit lip (tiles 20, 21) and the next room's left
// wall, but a wide view does. Fill their empty cells on rows 2-12 with the side
// wall brick.
const COIN_ROOM_AREA = "42";
const COIN_ROOM_BRICK = 82;
const LIP_RIGHT = 21;

function fillCoinRoomGaps(tiles, width) {
  for (let lip = 0; lip < width; lip++) {
    if (tiles[2][lip] !== LIP_RIGHT) continue;
    let end = lip + 1;
    while (end < width && !tiles.slice(3, 13).some((row) => row[end])) end++;
    for (let column = lip + 1; column < end; column++)
      for (let row = 2; row <= 12; row++)
        if (!tiles[row][column]) tiles[row][column] = COIN_ROOM_BRICK;
  }
}

export function decodeArea(tables, pointer) {
  const type = (pointer >> 5) & 3,
    id = areaId(pointer);
  const label =
    tables.AreaDataAddrLow[tables.AreaDataHOffsets[type] + (pointer & 31)];
  const enemyLabel =
    tables.EnemyDataAddrLow[tables.EnemyAddrHOffsets[type] + (pointer & 31)];
  const bytes = tables[label];
  if (!bytes) throw new Error(`Unknown area ${id}`);
  const header = {
    foreground: (bytes[0] & 7) < 4 ? bytes[0] & 7 : 0,
    color: (bytes[0] & 7) >= 4 ? bytes[0] & 7 : 0,
    entrance: (bytes[0] >> 3) & 7,
    timer: bytes[0] >> 6,
    terrain: bytes[1] & 15,
    background: (bytes[1] >> 4) & 3,
    style: bytes[1] >> 6,
    cloud: bytes[1] >> 6 === 3,
  };
  const style = header.cloud ? 0 : header.style;
  const objects = decodeObjects(bytes);
  const { enemies, destinations } = decodeEnemies(tables[enemyLabel]);
  const width =
    Math.ceil(
      Math.max(16, ...objects.map((o) => o.column + objectWidth(o, style))) /
        16,
    ) *
      16 +
    16;
  const tiles = Array.from({ length: 15 }, () => Array(width).fill(0));
  const attributes = [];
  const lastCastle = objects
    .filter((o) => o.opcode === 18 && o.column > 16)
    .at(-1);
  // Tall end castles (opcode 18, data 0) already draw two scenery columns on
  // the left. Keep the same two columns on the right, then stop. Short castles
  // stay a closed five-column building with no wing.
  const castleWallWing = lastCastle?.data === 0 ? 2 : 0;
  const castleWallEnd = lastCastle
    ? lastCastle.column + objectWidth(lastCastle, style) + castleWallWing
    : Number.POSITIVE_INFINITY;
  let terrain = header.terrain,
    background = header.background,
    foreground = header.foreground,
    color = header.color;
  for (let x = 0; x < width; x++) {
    // Attribute changes run after base scenery, and thus affect the next column.
    for (const o of objects.filter(
      (o) => o.opcode === 46 && o.column === x - 1,
    )) {
      if (o.byte & 64) {
        foreground = (o.byte & 7) < 4 ? o.byte & 7 : 0;
        if ((o.byte & 7) >= 4) color = o.byte & 7;
      } else {
        terrain = o.byte & 15;
        background = (o.byte >> 4) & 3;
      }
      attributes.push({
        column: x,
        terrain,
        background,
        foreground,
        color,
      });
    }
    const put = (y, value) => {
      if (y >= 2 && y < 15) tiles[y][x] = value;
    };
    if (background) {
      const scenery = tables.BackSceneryData[(background - 1) * 48 + (x % 48)];
      if (scenery)
        for (let n = 0; n < 3 && (scenery >> 4) + n < 11; n++)
          put(
            (scenery >> 4) + n + 2,
            tables.BackSceneryMetatiles[((scenery & 15) - 1) * 3 + n],
          );
    }
    if (foreground) {
      // Foreground 2 is the repeating castle wall. Original data latches it at
      // the end-of-stage castle and never turns it off; extra camera padding
      // then fills to the right edge. Stop at the building, after the two-column
      // right wing on a tall castle. Do not fill out to the area edge.
      const skipCastleWall = foreground === 2 && x >= castleWallEnd;
      if (!skipCastleWall)
        for (let r = 0; r < 13; r++) {
          const tile = tables.ForeSceneryData[(foreground - 1) * 13 + r];
          if (tile) put(r + 2, tile);
        }
    }
    for (let r = 0; r < 13; r++) {
      const bits = tables.TerrainRenderBits[terrain * 2 + (r >> 3)];
      if (bits & (1 << (r % 8)) && !(header.cloud && r >= 8 && r !== 11))
        put(
          r + 2,
          header.cloud
            ? 136
            : type === 2 && r >= 11
              ? 84
              : type === 0 && id === "02"
                ? 98
                : tables.TerrainMetatiles[type],
        );
    }
    const under = (row, length, value) => {
      for (let n = 0; n <= length && row + n < 15; n++) {
        const old = tiles[row + n]?.[x];
        if (
          old === 23 ||
          old === 26 ||
          old > 192 ||
          (old === 84 && value === 80)
        )
          continue;
        put(row + n, value);
      }
    };
    for (const o of objects) {
      const width = objectWidth(o, style),
        dx = x - o.column,
        left = width - dx - 1;
      if (dx < 0 || dx >= width) continue;
      const row = o.row,
        data = o.data;
      const brick = [34, 81, 82, 82][type],
        solid = [105, 97, 97, 98][type];
      switch (o.opcode) {
        case 0:
        case 7:
          put(row, (o.opcode === 0 ? 16 : 18) + dx);
          under(row + 1, (data & 7) - 1, 20 + dx);
          break;
        case 1:
          if (style === 2) {
            put(row, 100);
            if (data > 0) put(row + 1, 101);
            if (data > 1) under(row + 2, data - 2, 102);
          } else if (style === 1) {
            put(row, dx === 0 ? 25 : left === 0 ? 27 : 26);
            if (left > 0 && dx > 0 && left === data >> 1) {
              put(row + 1, 79);
              under(row + 2, 15, 80);
            }
          } else {
            const middle = (x === 0 || dx > 0) && left > 0;
            put(row, middle ? 23 : left === 0 ? 24 : 22);
            if (middle) under(row + 1, 15, 76);
          }
          break;
        case 2:
          under(row, 0, header.cloud ? 136 : brick);
          break;
        case 3:
          under(row, 0, solid);
          break;
        case 4:
          under(row, 0, type === 0 ? 195 : 194);
          break;
        case 5:
          under(row, data, brick);
          break;
        case 6:
          under(row, data, solid);
          break;
        case 8:
          under(10, 15, type === 0 ? 135 : 0);
          break;
        case 9:
          put(2, dx === 0 ? 66 : left === 0 ? 67 : 65);
          break;
        case 10:
        case 11:
        case 12: {
          const y = [8, 9, 11][o.opcode - 10];
          put(y, 11);
          under(y + 1, 0, 99);
          break;
        }
        case 13:
          put(12, 134);
          under(13, 1, 135);
          break;
        case 14:
          put(5, 192);
          break;
        case 15:
          put(9, 192);
          break;
        case 16:
          under(2, 15, 64);
          break;
        case 17:
          under(3, 15, 68);
          under(3, data, 64);
          break;
        case 18:
          for (let y = data + 2; y < 13; y++)
            put(y, tables.CastleMetatiles[(y - data - 2) * 5 + left]);
          // Original invisible stop block is omitted so our castle door is reachable.
          break;
        case 19: {
          const index = Math.max(0, 8 - dx);
          under(
            tables.StaircaseRowData[index] + 2,
            tables.StaircaseHeightData[index],
            97,
          );
          break;
        }
        case 20:
        case 34: {
          const height = o.opcode === 34 ? 10 : data;
          const shaft = [21, 20, 0, 0][left];
          if (shaft) under(2, height - 2, shaft);
          put(height + 1, [21, 30, 29, 28][left]);
          put(height + 2, [21, 33, 32, 31][left]);
          if (o.opcode === 34 && shaft) {
            for (let y = 2; y <= 8; y++) put(y, 0);
            put(9, [17, 16][left]);
          }
          break;
        }
        case 21:
          under(4, data, 109);
          break;
        case 22:
        case 23:
        case 24:
        case 25:
        case 26:
        case 27:
        case 28:
        case 29:
        case 30:
          under(
            row,
            0,
            tables.BrickQBlockMetatiles[
              o.opcode - 22 + (o.opcode >= 26 && type !== 1 ? 5 : 0)
            ],
          );
          break;
        case 31:
          put(row, 107);
          put(row + 1, 108);
          break;
        case 32:
          under(row, 0, 196);
          break;
        case 33:
          put(row, 103);
          put(row + 1, 104);
          break;
        case 35:
          put(2, 36);
          under(3, 8, 37);
          put(12, 97);
          break;
        case 36:
          // Sprite sits in the empty cell on axeStandY, not a hardcoded row.
          under(axeMetatileRow(tiles, x), 0, 197);
          break;
        case 37:
          under(9, 0, 12);
          break;
        case 38:
          under(10, 0, 137);
          break;
        case 39:
        case 40:
        case 41:
        case 42:
        case 43:
        case 44:
        case 45:
        case 46:
          break;
        default:
          throw new Error(`Unknown opcode ${o.opcode} in ${label}`);
      }
    }
  }
  if (id === COIN_ROOM_AREA) fillCoinRoomGaps(tiles, width);
  const blocks = [];
  for (let row = 0; row < 15; row++)
    for (let column = 0; column < width; column++) {
      const tile = tiles[row][column];
      if (
        tile === 81 ||
        tile === 82 ||
        tile === 34 ||
        (tile >= 85 && tile <= 96) ||
        tile === 192 ||
        tile === 193
      ) {
        const content =
          tile === 193 || tile === 85 || tile === 90
            ? "power-up"
            : tile === 86 || tile === 91
              ? "vine"
              : tile === 87 || tile === 92
                ? "star"
                : tile === 88 || tile === 93
                  ? "coins"
                  : tile === 89 || tile === 94 || tile === 96
                    ? "1-up"
                    : tile === 95 || tile === 192
                      ? "coin"
                      : null;
        blocks.push({
          column,
          row,
          kind:
            tile >= 192 || tile === 95 || tile === 96 ? "question" : "brick",
          hidden: tile === 95 || tile === 96,
          content,
        });
      }
    }
  const pipes = objects
    .filter((o) => [0, 7, 20, 31, 34].includes(o.opcode))
    .map((o) => ({
      column: o.column,
      row: o.opcode === 34 ? 11 : o.opcode === 20 ? o.data + 1 : o.row,
      width: o.opcode === 31 ? 1 : o.opcode === 20 || o.opcode === 34 ? 4 : 2,
      height: o.opcode === 0 || o.opcode === 7 ? (o.data & 7) + 1 : 2,
      direction:
        o.opcode === 0
          ? "down"
          : [20, 31, 34].includes(o.opcode)
            ? "right"
            : null,
      destinations:
        o.opcode === 7
          ? []
          : Array.from({ length: 8 }, (_, w) => {
              // The source parses enemies up to three tiles beyond the screen edge.
              // With the player near its seven-tile scroll anchor this is eleven ahead.
              // This also includes commands just beyond a locked bonus-room exit pipe.
              const command = destinations
                .filter((d) => d.world === w + 1 && d.column <= o.column + 11)
                .at(-1);
              return command
                ? {
                    world: w + 1,
                    area: command.area,
                    page: command.page,
                    entrance: command.entrance,
                  }
                : null;
            }).filter(Boolean),
    }));
  // Warp pipes share the last area-pointer latch unless we override them.
  // HandlePipeEntry uses WarpZoneNumbers, not that latch, so each warp mouth
  // gets its own first-stage start. World 1 uses control 4 (4/3/2). A later
  // overworld (type 1) uses control 6 (8/7/6). A later underground uses
  // control 5 (world 5). Extra mouths with no world stay inert.
  const warpColumn = enemies
    .filter((enemy) => enemy.type === WARP_ZONE_OBJECT)
    .reduce((min, enemy) => Math.min(min, enemy.column), Infinity);
  const warpLock = objects.some((o) => o.opcode === SCROLL_LOCK_WARP);
  if (Number.isFinite(warpColumn) || warpLock) {
    const warpPipes = pipes.filter(
      (pipe) =>
        pipe.direction === "down" &&
        (!Number.isFinite(warpColumn) || pipe.column >= warpColumn),
    );
    const sourceWorlds = worldsReachingArea(tables, id);
    for (const sourceWorld of sourceWorlds.length ? sourceWorlds : [1]) {
      const control = sourceWorld === 1 ? 4 : type === 1 ? 6 : 5;
      const warpWorlds = WARP_ZONE_WORLDS[control] ?? [];
      warpPipes.forEach((pipe, index) => {
        const destWorld = warpWorlds[index];
        if (!destWorld) return;
        pipe.destinations = [
          {
            world: sourceWorld,
            area: firstStageArea(tables, destWorld),
            page: 0,
            entrance: 0,
          },
        ];
      });
    }
  }
  const castle = objects.filter((o) => o.opcode === 18 && o.column > 16).at(-1);
  const axe = objects.find((o) => o.opcode === 36);
  const exitPipe = pipes.filter((p) => p.direction === "right").at(-1);
  const goal = castle
    ? { kind: "castle-door", column: castle.column + 2, row: 12 }
    : axe
      ? {
          kind: "castle-room",
          column: Math.min(width - 3, axe.column + 8),
          row: 12,
        }
      : exitPipe
        ? { kind: "pipe", column: exitPipe.column, row: exitPipe.row }
        : null;
  const initialColor =
    attributes.filter((a) => a.column <= 16).at(-1)?.color ?? header.color;
  return {
    id,
    label,
    type: TYPES[type],
    palette:
      type !== 1
        ? TYPES[type]
        : ({ 4: "night", 5: "snow-day", 6: "snow-night", 7: "snow" }[
            initialColor
          ] ?? "day"),
    width,
    height: 15,
    tileSize: 16,
    header,
    tiles,
    blocks,
    pipes,
    enemies,
    destinations,
    attributes,
    objects,
    goal,
  };
}

export function decodeAll(tables) {
  const areas = [3, 22, 3, 6].flatMap((count, type) =>
    Array.from({ length: count }, (_, n) => decodeArea(tables, type * 32 + n)),
  );
  const levels = [];
  for (let world = 1; world <= 8; world++) {
    const pointers = tables[`World${world}Areas`];
    let stage = 1;
    for (let i = 0; i < pointers.length; i++, stage++) {
      const intro = areaId(pointers[i]) === "29";
      const route = intro
        ? [areaId(pointers[i]), areaId(pointers[++i])]
        : [areaId(pointers[i])];
      levels.push({
        id: `${world}-${stage}`,
        world,
        stage,
        route,
        main: route.at(-1),
      });
    }
  }
  if (levels.length !== 32)
    throw new Error(`Expected 32 levels, got ${levels.length}`);
  return { areas, levels };
}

async function main() {
  const argument = process.argv[2];
  let tables, sourceHash;
  if (argument === "--refresh") {
    const response = await fetch(SOURCE_URL);
    if (!response.ok)
      throw new Error(`Source download failed: ${response.status}`);
    const source = await response.text();
    tables = parseTables(source);
    sourceHash = createHash("sha256").update(source).digest("hex");
  } else if (argument) {
    if (!/\.asm$/i.test(argument))
      throw new Error("Only a public .asm text file or --refresh is accepted");
    const source = readFileSync(argument, "utf8");
    tables = parseTables(source);
    sourceHash = createHash("sha256").update(source).digest("hex");
  } else {
    ({ tables, sourceHash } = JSON.parse(
      readFileSync(new URL("source-tables.json", output), "utf8"),
    ));
  }
  const { areas, levels } = decodeAll(tables);
  mkdirSync(output, { recursive: true });
  const write = (name, data) =>
    writeFileSync(new URL(name, output), JSON.stringify(data) + "\n");
  write("source-tables.json", { source: SOURCE_URL, sourceHash, tables });
  write("campaign.json", { levels });
  for (const area of areas) write(`area-${area.id}.json`, area);
  writeFileSync(
    new URL("index.ts", output),
    "// Generated by scripts/extract-levels.mjs. Bundled JSON; no runtime fetch.\n" +
      areas
        .map(
          (area) =>
            `import area${area.id} from "./area-${area.id}.json" with { type: "json" };`,
        )
        .join("\n") +
      "\nexport const AREAS = {\n" +
      areas.map((area) => `  "${area.id}": area${area.id},`).join("\n") +
      "\n};\n",
  );
  console.log(
    `Decoded ${areas.length} areas and ${levels.length} levels from public text tables.`,
  );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await main();
