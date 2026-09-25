import { MAP_TOP, TUNING as T } from "./config.ts";
import type { Body } from "./physics.ts";

export const AREA_TOP_ROW = 2;
export const AREA_BOTTOM_ROW = 14;
export const CHEAT_ITEMS = [
  "mushroom",
  "mushroom3x",
  "mushroom8x",
  "flower",
  "star",
  "oneUp",
] as const;

export const CHEAT_ITEM_LABELS: Record<(typeof CHEAT_ITEMS)[number], string> = {
  star: "Star",
  mushroom: "2x",
  mushroom3x: "3x",
  mushroom8x: "8x",
  flower: "Flower",
  oneUp: "1-up",
};

export function spawnCellCenter(
  roomOffset: number,
  column: number,
  row: number,
) {
  return {
    x: roomOffset + column * T.brickSize + T.brickSize / 2,
    y: MAP_TOP + row * T.brickSize + T.brickSize / 2,
  };
}

export function spawnCellBlocked(
  solids: ReadonlyArray<Body>,
  x: number,
  y: number,
) {
  const halfW = 12;
  const halfH = 14;
  return solids.some((solid) => {
    if (solid.headOnly) return false;
    const b = solid.bounds;
    return (
      x + halfW > b.min.x &&
      x - halfW < b.max.x &&
      y + halfH > b.min.y &&
      y - halfH < b.max.y
    );
  });
}

export function firstEmptySpawnCell(
  solids: ReadonlyArray<Body>,
  roomOffset: number,
  roomWidth: number,
  playerX: number,
  playerY: number,
  minRow = AREA_TOP_ROW,
): { x: number; y: number } | null {
  if (roomWidth <= 0) return null;
  const column = Math.max(
    0,
    Math.min(roomWidth - 1, Math.floor((playerX - roomOffset) / T.brickSize)),
  );
  const playerRow = Math.floor((playerY - MAP_TOP) / T.brickSize);
  let startRow = minRow;
  const top = Math.max(minRow, Math.min(AREA_BOTTOM_ROW, playerRow - 1));
  for (let row = top; row >= minRow; row--) {
    const cell = spawnCellCenter(roomOffset, column, row);
    if (spawnCellBlocked(solids, cell.x, cell.y)) {
      startRow = row + 1;
      break;
    }
  }
  for (let row = startRow; row <= AREA_BOTTOM_ROW; row++) {
    const cell = spawnCellCenter(roomOffset, column, row);
    if (!spawnCellBlocked(solids, cell.x, cell.y)) return cell;
  }
  return null;
}
