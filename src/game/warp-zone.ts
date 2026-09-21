import { MAP_TOP } from "./config.ts";
import { CAMPAIGN, type Area } from "./levels.ts";

export const WARP_BANNER = "WELCOME TO WARP ZONE!";

// 2x NES glyphs, same face as the HUD. World objects, not the status bar.
export const WARP_TEXT = {
  fontFamily: '"Press Start 2P", monospace',
  fontSize: "16px",
  color: "#ffffff",
  stroke: "#000000",
  strokeThickness: 2,
} as const;

export type WarpLabel = { text: string; x: number; y: number };

export type WarpDigit = WarpLabel & { column: number; world: number };

export type WarpSignage = { banner: WarpLabel; digits: WarpDigit[] };

const TILE = 32;
const PAGE = 16;
// WarpZoneObject ($34) and ScrollLockObject_Warp. Same marks the extractor uses.
const WARP_ZONE_ENEMY = 52;
const WARP_SCROLL_LOCK = 39;

function warpColumn(area: Area) {
  let column = Infinity;
  for (const enemy of area.enemies)
    if (enemy.type === WARP_ZONE_ENEMY)
      column = Math.min(column, enemy.column);
  return column;
}

function zonePipes(area: Area) {
  const column = warpColumn(area);
  const locked = area.objects.some((object) => object.opcode === WARP_SCROLL_LOCK);
  if (!Number.isFinite(column) && !locked) return [];
  return area.pipes.filter(
    (pipe) =>
      pipe.direction === "down" &&
      (!Number.isFinite(column) || pipe.column >= column),
  );
}

function firstStageWorld(areaId: string) {
  return CAMPAIGN.find((level) => level.stage === 1 && level.main === areaId)
    ?.world;
}

// Digits follow each mouth's shipped first-stage destination. Mouths with no
// warp world stay blank. Nothing is drawn until the player is on that page.
export function warpZoneSignage(
  area: Area,
  offset: number,
  sourceWorld: number,
  playerX: number,
): WarpSignage | undefined {
  const pipes = zonePipes(area);
  if (!pipes.length) return;
  const playerColumn = Math.floor((playerX - offset) / TILE);
  const page = Math.floor(playerColumn / PAGE);
  const onPage = pipes.filter(
    (pipe) => Math.floor(pipe.column / PAGE) === page,
  );
  if (!onPage.length) return;
  const digits: WarpDigit[] = [];
  for (const pipe of onPage) {
    const dest = pipe.destinations.find((entry) => entry.world === sourceWorld);
    if (!dest || dest.page !== 0) continue;
    const world = firstStageWorld(dest.area);
    if (world === undefined || world === sourceWorld) continue;
    digits.push({
      column: pipe.column,
      world,
      text: String(world),
      x: offset + (pipe.column + pipe.width / 2) * TILE,
      y: MAP_TOP + (pipe.row - 1) * TILE + TILE / 2,
    });
  }
  const topRow = Math.min(...onPage.map((pipe) => pipe.row));
  const bannerRow = Math.max(2, topRow - 4);
  return {
    banner: {
      text: WARP_BANNER,
      x: offset + (page * PAGE + PAGE / 2) * TILE,
      y: MAP_TOP + bannerRow * TILE + TILE / 2,
    },
    digits,
  };
}
