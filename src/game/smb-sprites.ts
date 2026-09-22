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
  const fish = crop(enemies, 0, 32, 16, 16, true);
  const fishWalk = crop(enemies, 32, 32, 16, 16, true);
  // Both Lakitu frames face left. (60, 90) is the right-facing mirror, so flipX
  // would reverse him every other frame. (30, 90) is the cloud pose.
  const lakitu = crop(enemies, 0, 90, 16, 24);
  const lakituWalk = crop(enemies, 30, 90, 16, 24);
  // y=180 is four blank rows. The feet sit on y=199, so the 16px frame starts at 184.
  const spike = crop(enemies, 0, 184, 16, 16, true);
  const spikeWalk = crop(enemies, 30, 184, 16, 16, true);
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
    fish,
    fishWalk,
    lakitu,
    lakituWalk,
    spike,
    spikeWalk,
    koopa,
    koopaWalk,
    koopaShell,
    koopaShellWake,
    fireGoomba: firePalette(goomba),
    fireGoombaWalk: firePalette(goombaWalk),
    fireFish: firePalette(fish),
    fireFishWalk: firePalette(fishWalk),
    fireSpike: firePalette(spike),
    fireSpikeWalk: firePalette(spikeWalk),
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

function isFlagCloth(
  x: number,
  r: number,
  g: number,
  b: number,
  alpha: number,
) {
  if (!alpha || x <= 2) return false;
  return (r > 200 && g > 200 && b > 200) || (r > 180 && g < 100 && b < 100);
}

/** Scale an emblem into the flag cloth. Pole (x<=2) and orb stay. */
export function stampEmblemInCloth(
  flag: Uint8ClampedArray,
  emblem: Uint8ClampedArray,
  width: number,
  height: number,
  emblemWidth: number,
  emblemHeight: number,
) {
  let minX = width,
    minY = height,
    maxX = -1,
    maxY = -1;
  for (let i = 0; i < flag.length; i += 4) {
    const x = (i / 4) % width;
    const y = Math.floor(i / 4 / width);
    if (!isFlagCloth(x, flag[i], flag[i + 1], flag[i + 2], flag[i + 3]))
      continue;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  if (maxX < minX) return flag;
  const boxW = maxX - minX + 1;
  const boxH = maxY - minY + 1;
  const scale = Math.min(boxW / emblemWidth, boxH / emblemHeight);
  const destW = Math.max(1, Math.round(emblemWidth * scale));
  const destH = Math.max(1, Math.round(emblemHeight * scale));
  const destX = minX + Math.floor((boxW - destW) / 2);
  const destY = minY + Math.floor((boxH - destH) / 2);
  for (let i = 0; i < flag.length; i += 4) {
    const x = (i / 4) % width;
    const y = Math.floor(i / 4 / width);
    if (!isFlagCloth(x, flag[i], flag[i + 1], flag[i + 2], flag[i + 3]))
      continue;
    const ex = Math.floor(((x - destX) * emblemWidth) / destW);
    const ey = Math.floor(((y - destY) * emblemHeight) / destH);
    if (ex < 0 || ey < 0 || ex >= emblemWidth || ey >= emblemHeight) continue;
    const mi = (ey * emblemWidth + ex) * 4;
    if (!emblem[mi + 3]) continue;
    flag[i] = emblem[mi];
    flag[i + 1] = emblem[mi + 1];
    flag[i + 2] = emblem[mi + 2];
  }
  return flag;
}

export function stampMushroomFlag(
  flag: Uint8ClampedArray,
  mushroom: Uint8ClampedArray,
  width: number,
  height: number,
  mushroomWidth = width,
  mushroomHeight = height,
) {
  return stampEmblemInCloth(
    flag,
    mushroom,
    width,
    height,
    mushroomWidth,
    mushroomHeight,
  );
}

function emblemFlag(flag: HTMLCanvasElement, emblem: HTMLCanvasElement) {
  const canvas = document.createElement("canvas");
  canvas.width = flag.width;
  canvas.height = flag.height;
  const context = canvas.getContext("2d")!;
  context.imageSmoothingEnabled = false;
  context.drawImage(flag, 0, 0);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  const face = emblem
    .getContext("2d")!
    .getImageData(0, 0, emblem.width, emblem.height);
  stampEmblemInCloth(
    pixels.data,
    face.data,
    canvas.width,
    canvas.height,
    emblem.width,
    emblem.height,
  );
  context.putImageData(pixels, 0, 0);
  return canvas;
}

function pixelRope() {
  const canvas = document.createElement("canvas");
  canvas.width = 2;
  canvas.height = 8;
  const context = canvas.getContext("2d")!;
  context.fillStyle = "#7c4c18";
  context.fillRect(0, 0, 2, 8);
  context.fillStyle = "#d09040";
  context.fillRect(0, 0, 1, 8);
  return canvas;
}

export const AXE_WIDTH = 16;
export const AXE_HEIGHT = 16;

const AXE_PIXELS = [
  "..O..........O..",
  ".OGOO..BG..OO.O.",
  ".OGOOOOGGOOOO.O.",
  "OGOOOOOBGOOOOO.O",
  "OGOOOOOBGOOOOO.O",
  "OGOOOOOBGOOOOO.O",
  "OGOOOOOBGOOOOO.O",
  "OGOOOOOBGOOOOO.O",
  ".OGOOOOBGOOOO.O.",
  "..GOO..BG...O.O.",
  "..O....GG....O..",
  ".......BG.......",
  ".......GG.......",
  ".......BG.......",
  ".......GG.......",
  ".......BG.......",
] as const;

const AXE_COLORS: Record<string, [number, number, number]> = {
  O: [234, 158, 34],
  B: [153, 78, 0],
  G: [102, 102, 102],
};

export function stampAxe(data: Uint8ClampedArray, width = AXE_WIDTH) {
  for (let y = 0; y < AXE_PIXELS.length; y++) {
    const row = AXE_PIXELS[y];
    for (let x = 0; x < row.length; x++) {
      const color = AXE_COLORS[row[x]];
      if (!color) continue;
      const i = (y * width + x) * 4;
      data[i] = color[0];
      data[i + 1] = color[1];
      data[i + 2] = color[2];
      data[i + 3] = 255;
    }
  }
  return data;
}

function pixelAxe() {
  const canvas = document.createElement("canvas");
  canvas.width = AXE_WIDTH;
  canvas.height = AXE_HEIGHT;
  const context = canvas.getContext("2d")!;
  context.imageSmoothingEnabled = false;
  const pixels = context.createImageData(AXE_WIDTH, AXE_HEIGHT);
  stampAxe(pixels.data);
  context.putImageData(pixels, 0, 0);
  return canvas;
}

function pixelPulley() {
  const canvas = document.createElement("canvas");
  canvas.width = 16;
  canvas.height = 10;
  const context = canvas.getContext("2d")!;
  context.imageSmoothingEnabled = false;
  const pixels = context.createImageData(16, 10);
  const d = pixels.data;
  const put = (x: number, y: number, r: number, g: number, b: number) => {
    const i = (y * 16 + x) * 4;
    d[i] = r;
    d[i + 1] = g;
    d[i + 2] = b;
    d[i + 3] = 255;
  };
  for (let x = 4; x <= 11; x++) {
    put(x, 0, 0, 0, 0);
    put(x, 9, 0, 0, 0);
  }
  for (let y = 1; y <= 8; y++) {
    put(3, y, 0, 0, 0);
    put(12, y, 0, 0, 0);
  }
  for (let y = 1; y <= 8; y++)
    for (let x = 4; x <= 11; x++) {
      const rim = y === 1 || y === 8 || x === 4 || x === 11;
      if (rim) put(x, y, 188, 188, 188);
      else put(x, y, 252, 252, 252);
    }
  put(7, 4, 0, 0, 0);
  put(8, 4, 0, 0, 0);
  put(7, 5, 0, 0, 0);
  put(8, 5, 0, 0, 0);
  context.putImageData(pixels, 0, 0);
  return canvas;
}

// (304, 96) starts 4px right and 2px down, so the left fins are missing.
export const BULLET_BILL_CROP = { x: 300, y: 94, width: 16, height: 16 };

// Three JumpspringObject poses on the overworld strip of items.png.
// Extended is idle and the launch pose. Mid and compressed are the squash.
export const SPRING_SHEET = {
  extended: { x: 80, y: 97, width: 16, height: 24 },
  mid: { x: 96, y: 105, width: 16, height: 16 },
  compressed: { x: 112, y: 113, width: 16, height: 8 },
} as const;

// The pad is two 32px tiles. Draw heights keep the plate on the landing
// surface and the base on the bottom of that column.
export const SPRING_DRAW = {
  extended: { width: 32, height: 64 },
  mid: { width: 32, height: 48 },
  compressed: { width: 32, height: 32 },
} as const;

export function scenerySprites({ mario, enemies, items }: SpriteSources) {
  const flag = crop(items, 128, 0, 16, 16);
  const mushroom = crop(items, 0, 0, 16, 16);
  const marioFace = crop(mario, 180, 0, 16, 8);
  return {
    fireball: crop(enemies, 364, 188, 8, 8),
    bulletBill: crop(
      enemies,
      BULLET_BILL_CROP.x,
      BULLET_BILL_CROP.y,
      BULLET_BILL_CROP.width,
      BULLET_BILL_CROP.height,
    ),
    bowser: crop(enemies, 2, 211, 32, 32),
    bowserWalk: crop(enemies, 42, 211, 32, 32),
    bowserFlame: crop(enemies, 101, 253, 24, 8),
    axe: pixelAxe(),
    platform: crop(items, 80, 24, 48, 8),
    rope: pixelRope(),
    pulley: pixelPulley(),
    coin: crop(items, 0, 80, 16, 16),
    mushroom,
    oneUp: crop(items, 16, 0, 16, 16),
    mushroom3x: mushroomCap(mushroom, [32, 136, 252]),
    mushroom8x: mushroomCap(mushroom, [252, 200, 32]),
    flower: crop(items, 0, 32, 16, 16),
    star: crop(items, 0, 48, 16, 16),
    marioFlag: emblemFlag(flag, marioFace),
    mushroomFlag: emblemFlag(flag, mushroom),
    vineHead: crop(items, 64, 48, 16, 16),
    vine: crop(items, 64, 64, 16, 16),
    springExtended: crop(
      items,
      SPRING_SHEET.extended.x,
      SPRING_SHEET.extended.y,
      SPRING_SHEET.extended.width,
      SPRING_SHEET.extended.height,
    ),
    springMid: crop(
      items,
      SPRING_SHEET.mid.x,
      SPRING_SHEET.mid.y,
      SPRING_SHEET.mid.width,
      SPRING_SHEET.mid.height,
    ),
    springCompressed: crop(
      items,
      SPRING_SHEET.compressed.x,
      SPRING_SHEET.compressed.y,
      SPRING_SHEET.compressed.width,
      SPRING_SHEET.compressed.height,
    ),
    [SWEAT_DROP_KEY]: pixelSweatDrop(),
  };
}
