export type SpriteSources = Record<
  "mario" | "enemies" | "items",
  HTMLImageElement
>;

function repeatTile(tile: HTMLCanvasElement, copies: number) {
  const canvas = document.createElement("canvas");
  canvas.width = tile.width * copies;
  canvas.height = tile.height;
  const context = canvas.getContext("2d")!;
  context.imageSmoothingEnabled = false;
  for (let i = 0; i < copies; i++) context.drawImage(tile, i * tile.width, 0);
  return canvas;
}

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

// Overworld Hammer Bro frames face left. (180, 90) and (210, 90) are the
// right-facing mirrors. The hammer is the vertical frame beside that row.
export const HAMMER_BRO_SHEET = {
  stand: { x: 120, y: 90, width: 16, height: 24 },
  walk: { x: 150, y: 90, width: 16, height: 24 },
  hammer: { x: 282, y: 86, width: 16, height: 16 },
} as const;

// SMB1 Lakitu frame 1 rides with his head up and faces left. (60, 90) is its
// mirror. Frame 2 ($96) is the drop pose: a blank head row, both hands, and
// the cloud. The sheet draws it 4px higher, so y=86 lines the clouds up.
export const LAKITU_SHEET = {
  ride: { x: 0, y: 90 },
  drop: { x: 30, y: 86 },
} as const;

// Spiny walk frames face left, so they are flipped. (150, 154) and (180, 154)
// are the right-facing mirrors. y=184 is the red Cheep Cheep. The two egg
// frames follow them. (60, 154) is a Podoboo: PODOBOO_SHEET.
export const SPINY_SHEET = {
  stand: { x: 90, y: 154 },
  walk: { x: 120, y: 154 },
  egg: { x: 210, y: 154 },
  eggTurn: { x: 240, y: 154 },
} as const;

// Bloober frame 1 ($3c) is the short pose and frame 2 ($42) the tall one.
// Cheep Cheep frames at y=184 face left, so they are flipped. Red is sprite
// palette 2. Grey uses palette 1: grey in water, green on land.
export const WATER_ENEMY_SHEET = {
  blooperShort: { x: 390, y: 4, width: 16, height: 16 },
  blooperTall: { x: 420, y: 0, width: 16, height: 24 },
  cheepY: 184,
  redCheep: [0, 30],
  greenCheep: [120, 150],
  greyCheep: [240, 270],
} as const;

function waterEnemySprites(enemies: HTMLImageElement) {
  const sheet = WATER_ENEMY_SHEET;
  const art: Record<string, HTMLCanvasElement> = {
    blooper: crop(
      enemies,
      sheet.blooperShort.x,
      sheet.blooperShort.y,
      sheet.blooperShort.width,
      sheet.blooperShort.height,
    ),
    blooperTall: crop(
      enemies,
      sheet.blooperTall.x,
      sheet.blooperTall.y,
      sheet.blooperTall.width,
      sheet.blooperTall.height,
    ),
  };
  for (const key of ["redCheep", "greenCheep", "greyCheep"] as const) {
    const [x, walkX] = sheet[key];
    art[key] = crop(enemies, x, sheet.cheepY, 16, 16, true);
    art[`${key}Walk`] = crop(enemies, walkX, sheet.cheepY, 16, 16, true);
  }
  for (const [key, canvas] of Object.entries(art))
    art[`fire${key[0]!.toUpperCase()}${key.slice(1)}`] = firePalette(canvas);
  return art;
}

// The Podoboo's one frame ($d0 over $d7, mirrored), moving up. It is drawn
// upside down while it falls.
export const PODOBOO_SHEET = { x: 60, y: 154 } as const;

// Piranha Plant frames: closed and open, in sprite palette 1. That is green
// on overworld areas and teal underground and in castles.
export const PIRANHA_SHEET = { x: [390, 420], greenY: 30, tealY: 60 } as const;

function piranhaSprites(enemies: HTMLImageElement) {
  const [closed, open] = PIRANHA_SHEET.x;
  const { greenY, tealY } = PIRANHA_SHEET;
  return {
    piranha: crop(enemies, closed, greenY, 16, 24),
    piranhaOpen: crop(enemies, open, greenY, 16, 24),
    piranhaTeal: crop(enemies, closed, tealY, 16, 24),
    piranhaTealOpen: crop(enemies, open, tealY, 16, 24),
  };
}

// Cheep Cheep animation bases, each with a Walk frame and a fire variant.
export const CHEEP_BASES = ["redCheep", "greenCheep", "greyCheep"] as const;

export function characterSprites({ mario, enemies }: SpriteSources) {
  const goomba = crop(enemies, 0, 4, 16, 16);
  const goombaWalk = crop(enemies, 30, 4, 16, 16);
  const lakitu = crop(
    enemies,
    LAKITU_SHEET.ride.x,
    LAKITU_SHEET.ride.y,
    16,
    24,
  );
  const lakituDrop = crop(
    enemies,
    LAKITU_SHEET.drop.x,
    LAKITU_SHEET.drop.y,
    16,
    24,
  );
  // Overworld frames, not the teal row at y=120. The hammer is not a shot.
  const hammerBro = crop(
    enemies,
    HAMMER_BRO_SHEET.stand.x,
    HAMMER_BRO_SHEET.stand.y,
    HAMMER_BRO_SHEET.stand.width,
    HAMMER_BRO_SHEET.stand.height,
  );
  const hammerBroWalk = crop(
    enemies,
    HAMMER_BRO_SHEET.walk.x,
    HAMMER_BRO_SHEET.walk.y,
    HAMMER_BRO_SHEET.walk.width,
    HAMMER_BRO_SHEET.walk.height,
  );
  const hammer = crop(
    enemies,
    HAMMER_BRO_SHEET.hammer.x,
    HAMMER_BRO_SHEET.hammer.y,
    HAMMER_BRO_SHEET.hammer.width,
    HAMMER_BRO_SHEET.hammer.height,
  );
  const spike = crop(
    enemies,
    SPINY_SHEET.stand.x,
    SPINY_SHEET.stand.y,
    16,
    16,
    true,
  );
  const spikeWalk = crop(
    enemies,
    SPINY_SHEET.walk.x,
    SPINY_SHEET.walk.y,
    16,
    16,
    true,
  );
  const spikeEgg = crop(enemies, SPINY_SHEET.egg.x, SPINY_SHEET.egg.y, 16, 16);
  const spikeEggTurn = crop(
    enemies,
    SPINY_SHEET.eggTurn.x,
    SPINY_SHEET.eggTurn.y,
    16,
    16,
  );
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
    ...waterEnemySprites(enemies),
    ...piranhaSprites(enemies),
    podoboo: crop(enemies, PODOBOO_SHEET.x, PODOBOO_SHEET.y, 16, 16),
    lakitu,
    lakituDrop,
    hammerBro,
    hammerBroWalk,
    hammer,
    spike,
    spikeWalk,
    spikeEgg,
    spikeEggTurn,
    koopa,
    koopaWalk,
    koopaShell,
    koopaShellWake,
    fireGoomba: firePalette(goomba),
    fireGoombaWalk: firePalette(goombaWalk),
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

function isFlagWhite(r: number, g: number, b: number, alpha: number) {
  return !!alpha && r > 200 && g > 200 && b > 200;
}

// The red star in the white field. The pole edge (x<=2) is red too.
function isFlagMark(
  x: number,
  r: number,
  g: number,
  b: number,
  alpha: number,
) {
  return !!alpha && x > 2 && r > 180 && g < 100 && b < 100;
}

/** Scale an emblem into the flag's red mark. Orb, pole, and field stay. */
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
    maxY = -1,
    field = -1;
  for (let i = 0; i < flag.length; i += 4) {
    const x = (i / 4) % width;
    const y = Math.floor(i / 4 / width);
    const white = isFlagWhite(flag[i], flag[i + 1], flag[i + 2], flag[i + 3]);
    if (field < 0 && white) field = i;
    if (!isFlagMark(x, flag[i], flag[i + 1], flag[i + 2], flag[i + 3]))
      continue;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  if (maxX < minX || field < 0) return flag;
  const fieldColor = flag.slice(field, field + 3);
  const boxW = maxX - minX + 1;
  const boxH = maxY - minY + 1;
  const scale = Math.min(boxW / emblemWidth, boxH / emblemHeight);
  const destW = Math.max(1, Math.round(emblemWidth * scale));
  const destH = Math.max(1, Math.round(emblemHeight * scale));
  const destX = minX + Math.floor((boxW - destW) / 2);
  const destY = minY + Math.floor((boxH - destH) / 2);
  // Nearest-neighbor from pixel centers. The emblem replaces the mark, and
  // mark pixels it leaves bare become field. Nothing outside the mark moves.
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const i = (y * width + x) * 4;
      const ex = Math.floor(((x - destX + 0.5) * emblemWidth) / destW);
      const ey = Math.floor(((y - destY + 0.5) * emblemHeight) / destH);
      const mi = (ey * emblemWidth + ex) * 4;
      const inside =
        x >= destX && y >= destY && x < destX + destW && y < destY + destH;
      if (inside && emblem[mi + 3]) {
        flag[i] = emblem[mi];
        flag[i + 1] = emblem[mi + 1];
        flag[i + 2] = emblem[mi + 2];
      } else if (isFlagMark(x, flag[i], flag[i + 1], flag[i + 2], flag[i + 3]))
        flag.set(fieldColor, i);
    }
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

// The bill at (60, 125) faces right. (0, 125) is its left-facing mirror, so
// Play flips this crop only when the bill flies left. The art is 14px tall
// over 2 clear rows. Drawn 2x, it moves 2px down to center on the barrel.
export const BULLET_BILL_CROP = { x: 60, y: 125, width: 16, height: 16 };
export const BULLET_BILL_DRAW_Y = 2;

// SMB1 RunFireworks graphics 0, 1, 2 on the enemy sheet, small to large.
// Each crop is the frame's exact bounds, so drawing each one centered on the
// burst point keeps one center. The small frame is the same pixels as the
// fireball.
export const FIREWORK_SHEET = [
  { key: "fireworkSmall", x: 364, y: 188, width: 8, height: 8 },
  { key: "fireworkMedium", x: 392, y: 185, width: 12, height: 14 },
  { key: "fireworkLarge", x: 420, y: 184, width: 16, height: 16 },
] as const;

function fireworkSprites(enemies: HTMLImageElement) {
  return Object.fromEntries(
    FIREWORK_SHEET.map((frame) => [
      frame.key,
      crop(enemies, frame.x, frame.y, frame.width, frame.height),
    ]),
  ) as Record<(typeof FIREWORK_SHEET)[number]["key"], HTMLCanvasElement>;
}

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

// DrawLargePlatform and DrawSmallPlatform sprite tile $5B. One crop serves
// every area. Large decks are six tiles (four in a castle), small ones three.
export const GIRDER_TILE = { x: 64, y: 128, width: 8, height: 8 } as const;
export const GIRDER_LENGTHS = [3, 4, 6] as const;
export const girderKey = (tiles: number) => `girder${tiles}`;

function girderSprites(items: HTMLImageElement) {
  const tile = crop(
    items,
    GIRDER_TILE.x,
    GIRDER_TILE.y,
    GIRDER_TILE.width,
    GIRDER_TILE.height,
  );
  return Object.fromEntries(
    GIRDER_LENGTHS.map((tiles) => [girderKey(tiles), repeatTile(tile, tiles)]),
  );
}

export function scenerySprites({ mario, enemies, items }: SpriteSources) {
  const flag = crop(items, 128, 0, 16, 16);
  const mushroom = crop(items, 0, 0, 16, 16);
  const marioFace = crop(mario, 180, 0, 16, 8);
  return {
    fireball: crop(enemies, 364, 188, 8, 8),
    ...fireworkSprites(enemies),
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
    ...girderSprites(items),
    // DrawLargePlatform tile $75. The sheet stores one puff; the lift is six.
    cloudPlatform: repeatTile(crop(items, 96, 160, 8, 8), 6),
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
