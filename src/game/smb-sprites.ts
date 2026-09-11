import { TILE_COUNT, WORLD_TILES } from "./world-tiles";

export type SpriteSources = Record<
  "mario" | "enemies" | "scenery" | "tiles" | "items",
  HTMLImageElement
>;

function crop(
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
  flip = false,
) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d")!;
  context.imageSmoothingEnabled = false;
  if (flip) {
    context.translate(width, 0);
    context.scale(-1, 1);
  }
  context.drawImage(image, x, y, width, height, 0, 0, width, height);
  return canvas;
}

export function characterSprites({ mario, enemies }: SpriteSources) {
  const goomba = crop(enemies, 0, 4, 16, 16);
  const goombaWalk = crop(enemies, 30, 4, 16, 16);
  const koopa = crop(enemies, 150, 0, 16, 24, true);
  const koopaWalk = crop(enemies, 180, 0, 16, 24, true);
  const smallMario = crop(mario, 180, 0, 16, 16);
  const smallMarioWalk = crop(mario, 209, 0, 16, 16);
  const smallMarioWalk2 = crop(mario, 239, 0, 16, 16);
  const smallMarioWalk3 = crop(mario, 269, 0, 16, 16);
  const smallMarioSkid = crop(mario, 299, 0, 16, 16);
  const smallMarioJump = crop(mario, 359, 0, 16, 16);
  const fireMario = crop(mario, 180, 122, 16, 32);
  const fireMarioWalk = crop(mario, 209, 122, 16, 32);
  const fireMarioWalk2 = crop(mario, 237, 122, 16, 32);
  const fireMarioWalk3 = crop(mario, 262, 122, 16, 32);
  const fireMarioSkid = crop(mario, 287, 122, 16, 32);
  const fireMarioJump = crop(mario, 362, 122, 16, 32);
  return {
    goomba,
    goombaWalk,
    koopa,
    koopaWalk,
    fireGoomba: firePalette(goomba),
    fireGoombaWalk: firePalette(goombaWalk),
    fireKoopa: firePalette(koopa),
    fireKoopaWalk: firePalette(koopaWalk),
    smallMario,
    smallMarioWalk,
    smallMarioWalk2,
    smallMarioWalk3,
    smallMarioSkid,
    smallMarioJump,
    marioDeath: crop(mario, 0, 16, 16, 16),
    mario: crop(mario, 180, 52, 16, 32),
    marioWalk: crop(mario, 209, 52, 16, 32),
    marioWalk2: crop(mario, 239, 52, 16, 32),
    marioWalk3: crop(mario, 269, 52, 16, 32),
    marioSkid: crop(mario, 299, 52, 16, 32),
    marioJump: crop(mario, 359, 52, 16, 32),
    fireMario,
    fireMarioWalk,
    fireMarioWalk2,
    fireMarioWalk3,
    fireMarioSkid,
    fireMarioJump,
    whiteMario: firePalette(fireMario),
    whiteMarioWalk: firePalette(fireMarioWalk),
    whiteMarioWalk2: firePalette(fireMarioWalk2),
    whiteMarioWalk3: firePalette(fireMarioWalk3),
    whiteMarioSkid: firePalette(fireMarioSkid),
    whiteMarioJump: firePalette(fireMarioJump),
  };
}

function firePalette(source: HTMLCanvasElement) {
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  const context = canvas.getContext("2d")!;
  context.drawImage(source, 0, 0);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < pixels.data.length; i += 4) {
    const [r, g, b, alpha] = pixels.data.slice(i, i + 4);
    if (alpha && ((r > 180 && g < 140 && b < 80) || g > r * 1.4)) {
      pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = 252;
    }
  }
  context.putImageData(pixels, 0, 0);
  return canvas;
}

export function scenerySprites({
  scenery,
  tiles,
  enemies,
  items,
}: SpriteSources) {
  const tile = (id: number) =>
    crop(tiles, (id % 16) * 16, Math.floor(id / 16) * 16, 16, 16);
  return {
    ...Object.fromEntries(
      Array.from({ length: TILE_COUNT }, (_, id) => [
        `tile${id}`,
        crop(tiles, (id % 16) * 16, Math.floor(id / 16) * 16, 16, 16),
      ]),
    ),
    question: tile(WORLD_TILES[9][16]),
    ground: tile(WORLD_TILES[13][0]),
    brick: tile(WORLD_TILES[9][20]),
    used: crop(scenery, 48, 0, 16, 16),
    fireball: crop(enemies, 364, 188, 8, 8),
    platform: crop(items, 80, 24, 48, 8),
    coin: crop(items, 0, 80, 16, 16),
    mushroom: crop(items, 0, 0, 16, 16),
    flower: crop(items, 0, 32, 16, 16),
    star: crop(items, 0, 48, 16, 16),
  };
}

export function movementPose(
  isMario: boolean,
  grounded: boolean,
  distance: number,
  moving: boolean,
  skidding = false,
) {
  if (isMario && !grounded) return "Jump";
  if (isMario && skidding) return "Skid";
  if (!grounded || !moving) return "";
  const frame = Math.floor(distance / 9);
  return isMario
    ? ["Walk", "Walk2", "Walk3"][frame % 3]
    : frame % 2
      ? "Walk"
      : "";
}
