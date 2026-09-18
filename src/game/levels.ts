import { AREAS } from "../assets/levels/index.ts";
import campaign from "../assets/levels/campaign.json" with { type: "json" };
import { MAP_TOP, TUNING } from "./config.ts";

export const CAMPAIGN = campaign.levels;
export function campaignIndex(world: number, stage: number) {
  const index = CAMPAIGN.findIndex(
    (level) => level.world === world && level.stage === stage,
  );
  if (index < 0) throw new Error(`Unknown stage ${world}-${stage}`);
  return index;
}
export type Area = (typeof AREAS)["25"];
export type AreaId = keyof typeof AREAS;
export function areaData(id: string): Area {
  const area = AREAS[id as AreaId];
  if (!area) throw new Error(`Unknown bundled area: ${id}`);
  return area as Area;
}
export function stageTimer(area: Area) {
  return TUNING.timerByHeader[area.header.timer] ?? TUNING.timerByHeader[0];
}
export function isFlagpoleTile(id: number) {
  return id === 36 || id === 37;
}
export function isSmashExemptTile(id: number) {
  // Springs 103-104 and castle bridge 137 stay solid for 8x.
  return id === 103 || id === 104 || id === 137 || isFlagpoleTile(id);
}
export function isSolidTile(id: number) {
  if (isFlagpoleTile(id)) return false;
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
export function themeFor(area: Area) {
  return area.palette;
}

export type LevelRect = { x: number; y: number; width: number; height: number };
export function terrainRects(
  area: Area,
  offset = 0,
  smashed?: ReadonlySet<string>,
): LevelRect[] {
  const interactive = new Set(area.blocks.map((b) => `${b.column},${b.row}`));
  for (const pipe of area.pipes)
    for (let y = pipe.row; y < pipe.row + pipe.height; y++)
      for (let x = pipe.column; x < pipe.column + pipe.width; x++)
        interactive.add(`${x},${y}`);
  const columns: LevelRect[] = [];
  for (let x = 0; x < area.width; x++) {
    let top = -1;
    for (let y = 2; y <= 18; y++) {
      const row = y < 15 ? y : 14;
      const tile = y < 15 ? area.tiles[y][x] : area.tiles[14][x];
      const key = `${x},${row}`;
      const smashedHere = !!smashed?.has(key);
      const keepFloor = smashedHere && row >= 13;
      const solid =
        y < 18 &&
        isSolidTile(tile) &&
        (keepFloor ||
          (!(y < 15 && interactive.has(`${x},${y}`)) && !smashedHere));
      if (solid && top < 0) top = y;
      if (!solid && top >= 0) {
        columns.push({
          x: offset + x * 32,
          y: MAP_TOP + top * 32,
          width: 32,
          height: (y - top) * 32,
        });
        top = -1;
      }
    }
  }
  // Merge adjacent equal-height columns; preserve continuous stair faces.
  const rectangles: LevelRect[] = [];
  for (const column of columns) {
    const previous = rectangles.find(
      (r) =>
        r.x + r.width === column.x &&
        r.y === column.y &&
        r.height === column.height,
    );
    if (previous) previous.width += 32;
    else rectangles.push({ ...column });
  }
  if (isSolidTile(area.tiles[14][0]))
    rectangles.push({
      x: offset - 300,
      y: TUNING.groundY,
      width: 300,
      height: 160,
    });
  if (isSolidTile(area.tiles[14].at(-1)!))
    rectangles.push({
      x: offset + area.width * 32,
      y: TUNING.groundY,
      width: 300,
      height: 160,
    });
  return rectangles;
}

export function areaGaps(area: Area, offset = 0): [number, number][] {
  const gaps: [number, number][] = [];
  let start = -1;
  for (let x = 0; x <= area.width; x++) {
    const gap = x < area.width && !isSolidTile(area.tiles[13][x]);
    if (gap && start < 0) start = x;
    if (!gap && start >= 0) {
      gaps.push([offset + start * 32, offset + x * 32]);
      start = -1;
    }
  }
  return gaps;
}
