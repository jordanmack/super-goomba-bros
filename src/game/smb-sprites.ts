export type SpriteSources = Record<
  "mario" | "enemies" | "items",
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
  const koopaShell = crop(enemies, 360, 4, 16, 16);
  const koopaShellWake = crop(enemies, 330, 4, 16, 16);
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
    koopaShell,
    koopaShellWake,
    fireGoomba: firePalette(goomba),
    fireGoombaWalk: firePalette(goombaWalk),
    fireKoopa: firePalette(koopa),
    fireKoopaWalk: firePalette(koopaWalk),
    fireKoopaShell: firePalette(koopaShell),
    fireKoopaShellWake: firePalette(koopaShellWake),
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

function mushroomCap(source: HTMLCanvasElement, cap: [number, number, number]) {
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  const context = canvas.getContext("2d")!;
  context.drawImage(source, 0, 0);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < pixels.data.length; i += 4) {
    const r = pixels.data[i],
      g = pixels.data[i + 1],
      b = pixels.data[i + 2];
    if (pixels.data[i + 3] && r > 140 && g < 90 && b < 80) {
      pixels.data[i] = cap[0];
      pixels.data[i + 1] = cap[1];
      pixels.data[i + 2] = cap[2];
    }
  }
  context.putImageData(pixels, 0, 0);
  return canvas;
}

export const SWEAT_DROP_KEY = "sweatDrop";
export const SWEAT_DROP_WIDTH = 5;
export const SWEAT_DROP_HEIGHT = 7;

const SWEAT_DROP_PIXELS = [
  "..#..",
  ".#C#.",
  "#CWC#",
  "#CCC#",
  "#CCC#",
  ".#C#.",
  "..#..",
] as const;

export function stampSweatDrop(
  data: Uint8ClampedArray,
  width = SWEAT_DROP_WIDTH,
) {
  for (let y = 0; y < SWEAT_DROP_PIXELS.length; y++) {
    const row = SWEAT_DROP_PIXELS[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === ".") continue;
      const i = (y * width + x) * 4;
      if (ch === "#") {
        data[i] = data[i + 1] = data[i + 2] = 0;
      } else if (ch === "W") {
        data[i] = data[i + 1] = data[i + 2] = 255;
      } else {
        data[i] = 184;
        data[i + 1] = 224;
        data[i + 2] = 252;
      }
      data[i + 3] = 255;
    }
  }
  return data;
}

function pixelSweatDrop() {
  const canvas = document.createElement("canvas");
  canvas.width = SWEAT_DROP_WIDTH;
  canvas.height = SWEAT_DROP_HEIGHT;
  const context = canvas.getContext("2d")!;
  context.imageSmoothingEnabled = false;
  const pixels = context.createImageData(SWEAT_DROP_WIDTH, SWEAT_DROP_HEIGHT);
  stampSweatDrop(pixels.data);
  context.putImageData(pixels, 0, 0);
  return canvas;
}

export function flagTextureKey(claim: "goomba" | "mario") {
  return claim === "mario" ? "marioFlag" : "mushroomFlag";
}

export function stampMushroomFlag(
  flag: Uint8ClampedArray,
  mushroom: Uint8ClampedArray,
  width: number,
  height: number,
  mushroomWidth = width,
  mushroomHeight = height,
) {
  let fillR = 228,
    fillG = 88,
    fillB = 16;
  for (let i = 0; i < mushroom.length; i += 4) {
    if (
      mushroom[i + 3] &&
      mushroom[i] > 160 &&
      mushroom[i + 1] < 120 &&
      mushroom[i + 2] < 80
    ) {
      fillR = mushroom[i];
      fillG = mushroom[i + 1];
      fillB = mushroom[i + 2];
      break;
    }
  }
  for (let i = 0; i < flag.length; i += 4) {
    const x = (i / 4) % width;
    const y = Math.floor(i / 4 / width);
    const r = flag[i],
      g = flag[i + 1],
      b = flag[i + 2],
      alpha = flag[i + 3];
    if (!alpha || x <= 2) continue;
    const cloth =
      (r > 200 && g > 200 && b > 200) || (r > 180 && g < 100 && b < 100);
    if (!cloth) continue;
    // 1:1 stamp so the mushroom sits in the cloth; pole and orb stay.
    const mx = x - 1;
    const my = y - 1;
    const mi = (my * mushroomWidth + mx) * 4;
    if (
      mx >= 0 &&
      my >= 0 &&
      mx < mushroomWidth &&
      my < mushroomHeight &&
      mushroom[mi + 3]
    ) {
      flag[i] = mushroom[mi];
      flag[i + 1] = mushroom[mi + 1];
      flag[i + 2] = mushroom[mi + 2];
    } else {
      flag[i] = fillR;
      flag[i + 1] = fillG;
      flag[i + 2] = fillB;
    }
  }
  return flag;
}

function mushroomFlag(flag: HTMLCanvasElement, mushroom: HTMLCanvasElement) {
  const canvas = document.createElement("canvas");
  canvas.width = flag.width;
  canvas.height = flag.height;
  const context = canvas.getContext("2d")!;
  context.imageSmoothingEnabled = false;
  context.drawImage(flag, 0, 0);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  const face = mushroom
    .getContext("2d")!
    .getImageData(0, 0, mushroom.width, mushroom.height);
  stampMushroomFlag(
    pixels.data,
    face.data,
    canvas.width,
    canvas.height,
    mushroom.width,
    mushroom.height,
  );
  context.putImageData(pixels, 0, 0);
  return canvas;
}

export function scenerySprites({ enemies, items }: SpriteSources) {
  const marioFlag = crop(items, 128, 0, 16, 16);
  const mushroom = crop(items, 0, 0, 16, 16);
  return {
    fireball: crop(enemies, 364, 188, 8, 8),
    bulletBill: crop(enemies, 304, 96, 16, 16),
    platform: crop(items, 80, 24, 48, 8),
    coin: crop(items, 0, 80, 16, 16),
    mushroom,
    oneUp: crop(items, 16, 0, 16, 16),
    mushroom3x: mushroomCap(mushroom, [32, 136, 252]),
    mushroom8x: mushroomCap(mushroom, [252, 200, 32]),
    flower: crop(items, 0, 32, 16, 16),
    star: crop(items, 0, 48, 16, 16),
    marioFlag,
    mushroomFlag: mushroomFlag(marioFlag, mushroom),
    [SWEAT_DROP_KEY]: pixelSweatDrop(),
  };
}
