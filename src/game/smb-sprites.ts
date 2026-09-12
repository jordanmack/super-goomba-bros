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

function pixelExclaim() {
  const canvas = document.createElement("canvas");
  canvas.width = 8;
  canvas.height = 16;
  const context = canvas.getContext("2d")!;
  context.imageSmoothingEnabled = false;
  context.fillStyle = "#ffffff";
  context.fillRect(3, 0, 2, 9);
  context.fillRect(2, 0, 4, 2);
  context.fillRect(2, 7, 4, 2);
  context.fillRect(3, 12, 2, 4);
  context.fillRect(2, 13, 4, 2);
  return canvas;
}

function goombaFlag(source: HTMLCanvasElement) {
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  const context = canvas.getContext("2d")!;
  context.drawImage(source, 0, 0);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < pixels.data.length; i += 4) {
    const [r, g, b, alpha] = pixels.data.slice(i, i + 4);
    if (!alpha) continue;
    const x = (i / 4) % canvas.width;
    if (r > 200 && g > 200 && b > 200) {
      pixels.data[i] = 228;
      pixels.data[i + 1] = 92;
      pixels.data[i + 2] = 16;
    } else if (x > 3 && r > 180 && g < 100 && b < 100) {
      pixels.data[i] = 252;
      pixels.data[i + 1] = 216;
      pixels.data[i + 2] = 168;
    }
  }
  context.putImageData(pixels, 0, 0);
  return canvas;
}

export function scenerySprites({ enemies, items }: SpriteSources) {
  const marioFlag = crop(items, 128, 0, 16, 16);
  return {
    fireball: crop(enemies, 364, 188, 8, 8),
    platform: crop(items, 80, 24, 48, 8),
    coin: crop(items, 0, 80, 16, 16),
    mushroom: crop(items, 0, 0, 16, 16),
    flower: crop(items, 0, 32, 16, 16),
    star: crop(items, 0, 48, 16, 16),
    marioFlag,
    goombaFlag: goombaFlag(marioFlag),
    exclaim: pixelExclaim(),
  };
}
