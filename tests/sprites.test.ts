import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AXE_HEIGHT,
  AXE_WIDTH,
  FIREWORK_SHEET,
  flagTextureKey,
  SPRING_DRAW,
  SPINY_SHEET,
  SPRING_SHEET,
  stampAxe,
  stampEmblemInCloth,
  stampMushroomFlag,
  stampSweatDrop,
  SWEAT_DROP_HEIGHT,
  SWEAT_DROP_KEY,
  SWEAT_DROP_WIDTH,
} from "../src/game/smb-sprites.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const W = 16;
const H = 16;

function px(data: Uint8ClampedArray, x: number, y: number, width = W) {
  const i = (y * width + x) * 4;
  return [data[i], data[i + 1], data[i + 2], data[i + 3]] as const;
}

function setPx(
  data: Uint8ClampedArray,
  x: number,
  y: number,
  r: number,
  g: number,
  b: number,
  a = 255,
  width = W,
) {
  const i = (y * width + x) * 4;
  data[i] = r;
  data[i + 1] = g;
  data[i + 2] = b;
  data[i + 3] = a;
}

function between(source: string, start: string, end: string) {
  const from = source.indexOf(start);
  const to = source.indexOf(end);
  if (from < 0) throw new Error(`missing slice anchor: ${start}`);
  if (to < 0) throw new Error(`missing slice anchor: ${end}`);
  return source.slice(from, to);
}

const FIELD = [252, 252, 252] as const;
const MARK = [181, 49, 33] as const;
const HAT = [248, 56, 0] as const;
const SKIN = [255, 164, 64] as const;

type Box = { x0: number; y0: number; x1: number; y1: number };

// Pole at x=2, orb, white field x3-13 y5-13, and a red plus in x6-10 y7-11.
const PLUS_MARK: Box = { x0: 6, y0: 7, x1: 10, y1: 11 };

function syntheticFlag() {
  const flag = new Uint8ClampedArray(W * H * 4);
  setPx(flag, 2, 2, 230, 156, 33);
  setPx(flag, 3, 2, 230, 156, 33);
  for (let y = 5; y <= 15; y++) setPx(flag, 2, y, ...MARK);
  for (let y = 5; y <= 13; y++)
    for (let x = 3; x <= 13; x++) setPx(flag, x, y, ...FIELD);
  for (let d = 6; d <= 10; d++) {
    setPx(flag, d, 9, ...MARK);
    setPx(flag, 8, d + 1, ...MARK);
  }
  return flag;
}

function inBox(box: Box, x: number, y: number) {
  return x >= box.x0 && x <= box.x1 && y >= box.y0 && y <= box.y1;
}

function assertOutsideMarkUnchanged(
  flag: Uint8ClampedArray,
  source: Uint8ClampedArray,
  mark: Box,
) {
  assert.equal(flag.length, source.length);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (!inBox(mark, x, y))
        assert.deepEqual(px(flag, x, y), px(source, x, y), `(${x}, ${y})`);
}

function countInBox(
  flag: Uint8ClampedArray,
  box: Box,
  color: readonly [number, number, number],
) {
  let n = 0;
  for (let y = box.y0; y <= box.y1; y++)
    for (let x = box.x0; x <= box.x1; x++) {
      const [r, g, b, a] = px(flag, x, y);
      if (a && r === color[0] && g === color[1] && b === color[2]) n++;
    }
  return n;
}

test("claim maps to the shipped flag texture keys", () => {
  assert.equal(flagTextureKey("goomba"), "mushroomFlag");
  assert.equal(flagTextureKey("mario"), "marioFlag");
});

test("player flag scales a mushroom into the red mark only, not the whole cloth", () => {
  const flag = syntheticFlag();
  const mushroom = new Uint8ClampedArray(W * H * 4);
  const cap = [228, 88, 16] as const;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) setPx(mushroom, x, y, ...cap);
  const before = new Uint8ClampedArray(flag);
  stampMushroomFlag(flag, mushroom, W, H);
  assertOutsideMarkUnchanged(flag, before, PLUS_MARK);
  // 16x16 scales to the 5x5 mark, so the cap covers the mark box exactly.
  for (let y = PLUS_MARK.y0; y <= PLUS_MARK.y1; y++)
    for (let x = PLUS_MARK.x0; x <= PLUS_MARK.x1; x++)
      assert.deepEqual(px(flag, x, y), [...cap, 255], `(${x}, ${y})`);
});

test("Mario flag scales his face into the red mark and clears the rest of it", () => {
  const flag = syntheticFlag();
  const face = new Uint8ClampedArray(W * 8 * 4);
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < W; x++) {
      const [r, g, b] = y < 3 ? HAT : SKIN;
      setPx(face, x, y, r, g, b);
    }
  const before = new Uint8ClampedArray(flag);
  stampEmblemInCloth(flag, face, W, H, W, 8);
  assertOutsideMarkUnchanged(flag, before, PLUS_MARK);
  // 16x8 scales to 5x3 on rows 8-10. The plus ends on rows 7 and 11 go white.
  for (let x = PLUS_MARK.x0; x <= PLUS_MARK.x1; x++) {
    assert.deepEqual(px(flag, x, 7), [...FIELD, 255]);
    assert.deepEqual(px(flag, x, 8), [...HAT, 255]);
    assert.deepEqual(px(flag, x, 9), [...SKIN, 255]);
    assert.deepEqual(px(flag, x, 10), [...SKIN, 255]);
    assert.deepEqual(px(flag, x, 11), [...FIELD, 255]);
  }
});

test("shipped flags keep the 16x16 pole flag and stamp only its red star", () => {
  const items = join(root, "src/assets/smb/items.png");
  const mario = join(root, "src/assets/smb/mario.png");
  const source = new Uint8ClampedArray(atlasRgba(items, "16x16+128+0"));
  const mushroom = new Uint8ClampedArray(atlasRgba(items, "16x16+0+0"));
  const face = new Uint8ClampedArray(atlasRgba(mario, "16x8+180+0"));
  const star: Box = { x0: W, y0: H, x1: -1, y1: -1 };
  for (let y = 0; y < H; y++)
    for (let x = 3; x < W; x++) {
      const [r, g, b, a] = px(source, x, y);
      if (!a || r <= 180 || g >= 100 || b >= 100) continue;
      star.x0 = Math.min(star.x0, x);
      star.y0 = Math.min(star.y0, y);
      star.x1 = Math.max(star.x1, x);
      star.y1 = Math.max(star.y1, y);
    }
  assert.deepEqual(star, { x0: 5, y0: 6, x1: 11, y1: 12 });
  const mushroomFlag = stampMushroomFlag(
    new Uint8ClampedArray(source),
    mushroom,
    W,
    H,
  );
  const marioFlag = stampEmblemInCloth(
    new Uint8ClampedArray(source),
    face,
    W,
    H,
    W,
    8,
  );
  assertOutsideMarkUnchanged(mushroomFlag, source, star);
  assertOutsideMarkUnchanged(marioFlag, source, star);
  assert.ok(countInBox(mushroomFlag, star, [230, 156, 33]) >= 8, "cap gold");
  assert.ok(countInBox(marioFlag, star, HAT) >= 4, "Mario hat");
  assert.ok(countInBox(marioFlag, star, SKIN) >= 2, "Mario skin");
  assert.equal(countInBox(marioFlag, star, MARK), 0, "the star is replaced");
  assert.notDeepEqual(mushroomFlag, source);
  assert.notDeepEqual(mushroomFlag, marioFlag);
});

test("Fire Mario draw path uses original fireMario frames, not the white palette", () => {
  const play = readFileSync(join(root, "src/game/scenes/Play.ts"), "utf8");
  const boot = readFileSync(join(root, "src/game/scenes/Boot.ts"), "utf8");
  const sprites = readFileSync(join(root, "src/game/smb-sprites.ts"), "utf8");
  const pose = between(play, "const base = mario", "const moving =");
  assert.match(pose, /marioStage === 2\s*\n\s*\? "fireMario"/);
  assert.doesNotMatch(play, /whiteMario/);
  assert.match(boot, /"fireMario"/);
  assert.doesNotMatch(boot, /whiteMario/);
  assert.doesNotMatch(sprites, /whiteMario/);
  assert.match(sprites, /fireMario,/);
  assert.match(sprites, /fireMarioWalk,/);
  assert.match(sprites, /fireMarioWalk2,/);
  assert.match(sprites, /fireMarioWalk3,/);
  assert.match(sprites, /fireMarioSkid,/);
  assert.match(sprites, /fireMarioJump,/);
  assert.match(sprites, /fireGoomba: firePalette\(goomba\)/);
  assert.match(sprites, /fireKoopa: firePalette\(koopa\)/);
});

test("the warned-NPC mark is a tiny outlined sweat drop, not a white bang", () => {
  assert.ok(SWEAT_DROP_WIDTH <= 6);
  assert.ok(SWEAT_DROP_HEIGHT <= 8);
  assert.notEqual(SWEAT_DROP_WIDTH, 8);
  assert.notEqual(SWEAT_DROP_HEIGHT, 16);
  const data = new Uint8ClampedArray(SWEAT_DROP_WIDTH * SWEAT_DROP_HEIGHT * 4);
  stampSweatDrop(data);
  const at = (x: number, y: number) => px(data, x, y, SWEAT_DROP_WIDTH);
  const opaqueXs = (y: number) => {
    const xs: number[] = [];
    for (let x = 0; x < SWEAT_DROP_WIDTH; x++)
      if (at(x, y)[3]) xs.push(x);
    return xs;
  };
  const top = opaqueXs(0);
  const mid = opaqueXs(Math.floor(SWEAT_DROP_HEIGHT / 2));
  const bottom = opaqueXs(SWEAT_DROP_HEIGHT - 1);
  assert.equal(top.length, 1);
  assert.ok(mid.length > top.length);
  assert.ok(bottom.length <= top.length);
  assert.equal(at(0, 0)[3], 0);
  assert.equal(at(SWEAT_DROP_WIDTH - 1, 0)[3], 0);
  let dark = 0,
    light = 0,
    white = 0;
  for (let y = 0; y < SWEAT_DROP_HEIGHT; y++) {
    for (let x = 0; x < SWEAT_DROP_WIDTH; x++) {
      const [r, g, b, a] = at(x, y);
      if (!a) continue;
      const lum = (r + g + b) / 3;
      if (lum < 40) dark++;
      if (lum > 180) light++;
      if (r > 250 && g > 250 && b > 250) white++;
    }
  }
  assert.ok(dark >= 8);
  assert.ok(light >= 4);
  assert.ok(white < dark + light);
  const tip = at(top[0], 0);
  assert.deepEqual(tip, [0, 0, 0, 255]);
  const fill = at(Math.floor(SWEAT_DROP_WIDTH / 2), 3);
  assert.ok(fill[3] === 255 && fill[2] > fill[0] && fill[1] > 180);
});

function atlasRgba(atlas: string, crop: string) {
  try {
    return execFileSync(
      "convert",
      [atlas, "-crop", crop, "-depth", "8", "rgba:-"],
      { maxBuffer: 2e6 },
    );
  } catch (error) {
    const err = error as { code?: string };
    if (err.code === "ENOENT")
      throw new Error("convert required to inspect sprite sheets");
    throw error;
  }
}

test("atlas tiles 103 and 104 hold trampoline art, not empty or brick fills", () => {
  const atlas = join(root, "src/assets/smb/metatiles.png");
  const meta = JSON.parse(
    readFileSync(join(root, "src/assets/smb/metatiles.json"), "utf8"),
  );
  for (const [themeIndex, theme] of meta.themes.entries()) {
    const brick81 = atlasRgba(atlas, `16x16+16+${themeIndex * 256 + 80}`);
    const brick34 = atlasRgba(atlas, `16x16+32+${themeIndex * 256 + 32}`);
    for (const id of [103, 104]) {
      assert.ok(
        meta.coverage[theme].includes(id),
        `${theme}: tile ${id} is covered`,
      );
      const x = (id % 16) * 16;
      const y = themeIndex * 256 + Math.floor(id / 16) * 16;
      const tile = atlasRgba(atlas, `16x16+${x}+${y}`);
      let opaque = 0;
      const colors = new Set();
      for (let i = 0; i < tile.length; i += 4) {
        if (tile[i + 3] < 128) continue;
        opaque++;
        colors.add(tile.subarray(i, i + 3).toString("hex"));
      }
      assert.ok(opaque >= 16, `${theme} ${id}: spring pixels are opaque`);
      assert.ok(colors.size >= 2, `${theme} ${id}: spring is not a flat fill`);
      assert.notEqual(
        Buffer.from(tile).compare(brick81),
        0,
        `${theme} ${id}: spring is not brick 81`,
      );
      assert.notEqual(
        Buffer.from(tile).compare(brick34),
        0,
        `${theme} ${id}: spring is not brick 34`,
      );
      const rowOpaque = (row: number) => {
        let n = 0;
        for (let col = 0; col < 16; col++)
          if (tile[(row * 16 + col) * 4 + 3] >= 128) n++;
        return n;
      };
      if (id === 103)
        assert.ok(
          rowOpaque(0) >= 12,
          `${theme} 103: plate sits at the top of the tile`,
        );
      else
        assert.ok(
          rowOpaque(15) >= 12,
          `${theme} 104: base sits at the bottom of the tile`,
        );
    }
  }
});

test("spring frames are the three item-sheet poses, not one stretched tile", () => {
  const sheet = join(root, "src/assets/smb/items.png");
  const poses = ["extended", "mid", "compressed"] as const;
  assert.ok(SPRING_SHEET.extended.height > SPRING_SHEET.mid.height);
  assert.ok(SPRING_SHEET.mid.height > SPRING_SHEET.compressed.height);
  assert.equal(SPRING_DRAW.extended.height, 64);
  assert.equal(SPRING_DRAW.mid.height, 48);
  assert.equal(SPRING_DRAW.compressed.height, 32);
  const reds = poses.map((pose) => {
    const frame = SPRING_SHEET[pose];
    const raw = atlasRgba(
      sheet,
      `${frame.width}x${frame.height}+${frame.x}+${frame.y}`,
    );
    let red = 0;
    let opaque = 0;
    for (let i = 0; i < raw.length; i += 4) {
      if (raw[i + 3] < 128) continue;
      opaque++;
      if (raw[i] === 181 && raw[i + 1] === 49 && raw[i + 2] === 33) red++;
    }
    assert.ok(opaque > 40, `${pose}: empty crop`);
    assert.ok(red >= 32, `${pose}: missing the red plate`);
    return Buffer.from(raw).toString("hex");
  });
  assert.notEqual(reds[0], reds[1]);
  assert.notEqual(reds[1], reds[2]);
});

test("castle-room rescue door is an inverted white door, not a black hole", () => {
  const atlas = join(root, "src/assets/smb/metatiles.png");
  const meta = JSON.parse(
    readFileSync(join(root, "src/assets/smb/metatiles.json"), "utf8"),
  );
  const extract = readFileSync(
    join(root, "scripts/extract-metatiles.mjs"),
    "utf8",
  );
  const play = readFileSync(join(root, "src/game/scenes/Play.ts"), "utf8");
  const castleIndex = meta.themes.indexOf("castle");
  assert.ok(castleIndex >= 0);
  const tileRgba = (themeIndex: number, id: number) => {
    const x = (id % 16) * 16;
    const y = themeIndex * 256 + Math.floor(id / 16) * 16;
    return atlasRgba(atlas, `16x16+${x}+${y}`);
  };
  const stats = (tile: Buffer) => {
    let opaque = 0,
      lum = 0;
    const colors = new Set<string>();
    for (let i = 0; i < tile.length; i += 4) {
      if (tile[i + 3] < 128) continue;
      opaque++;
      lum += (tile[i] + tile[i + 1] + tile[i + 2]) / 3;
      colors.add(tile.subarray(i, i + 3).toString("hex"));
    }
    return { opaque, mean: opaque ? lum / opaque / 255 : 0, colors };
  };
  for (const id of [74, 75]) {
    assert.ok(
      meta.coverage.castle.includes(id),
      `castle: tile ${id} is covered`,
    );
    const door = stats(tileRgba(castleIndex, id));
    assert.equal(
      door.opaque,
      256,
      `castle ${id}: rescue door is a solid door, not a hole`,
    );
    assert.ok(
      door.mean >= 0.85,
      `castle ${id}: rescue door is light against black (mean ${door.mean.toFixed(3)})`,
    );
  }
  const top = stats(tileRgba(castleIndex, 74));
  const bottom = stats(tileRgba(castleIndex, 75));
  const onlyBw = [...top.colors].every(
    (c) => c === "000000" || c === "ffffff",
  );
  assert.equal(top.colors.size, 2, "castle 74: white fill plus black arch");
  assert.ok(top.colors.has("000000") && top.colors.has("ffffff"));
  assert.ok(onlyBw, "castle 74: no gray or brown fringe");
  assert.ok(
    bottom.mean > top.mean,
    "castle 75: lower door is the inverted black fill",
  );
  const dayIndex = meta.themes.indexOf("day");
  const overworld = stats(tileRgba(dayIndex, 75));
  assert.ok(
    overworld.mean < 0.1,
    "day 75: overworld castle door stays the original dark opening",
  );
  assert.match(
    extract,
    /theme === "castle" && \(id === 74 \|\| id === 75\)/,
  );
  assert.match(extract, /255 - image\[p\]/);
  assert.match(extract, /lum >= 200/);
  const draw = between(
    play,
    'goal?.kind === "castle-room"',
    "const pole = room.flagpole",
  );
  assert.match(draw, /palette \+ 74/);
  assert.match(draw, /palette \+ 75/);
  assert.match(draw, /T\.groundY - 48/);
  assert.match(draw, /T\.groundY - 16/);
});

test("Play draws the sweat drop unscaled, never a scaling exclaim bang", () => {
  const play = readFileSync(join(root, "src/game/scenes/Play.ts"), "utf8");
  const sprites = readFileSync(join(root, "src/game/smb-sprites.ts"), "utf8");
  const draw = between(play, "n.exclaimLeft", "this.effects[index]");
  assert.equal(SWEAT_DROP_KEY, "sweatDrop");
  assert.match(draw, /SWEAT_DROP_WIDTH \* 2/);
  assert.match(draw, /SWEAT_DROP_HEIGHT \* 2/);
  assert.match(draw, /SWEAT_DROP_KEY/);
  assert.match(draw, /actorSpriteBox\([\s\S]*?\)\.h/);
  assert.doesNotMatch(play, /actorSpriteHeight/);
  assert.doesNotMatch(draw, /n\.scale/);
  assert.doesNotMatch(play, /["']exclaim["']/);
  assert.doesNotMatch(sprites, /pixelExclaim/);
  assert.match(sprites, /sweatDrop/);
});

test("the walk animation timescale comes from walkPace, not raw x-speed", () => {
  const play = readFileSync(join(root, "src/game/scenes/Play.ts"), "utf8");
  const draw = between(play, "const pace =", "const box = actorSpriteBox");
  assert.match(draw, /const pace = walkPace\(actor, inWater\)/);
  assert.match(draw, /actorWalkMoving\(actor, inWater\)/);
  assert.match(draw, /anims\.timeScale = \(pace \* 60\) \/ 90/);
  assert.doesNotMatch(draw, /Math\.abs\(actor\.body\.velocity\.x\)/);
  assert.match(play, /import \{[^}]*\bwalkPace\b[^}]*\} from "\.\.\/simulation"/s);
});

test("Bowser walk uses the first two packed 32x32 frames so the snout is visible", () => {
  const sprites = readFileSync(join(root, "src/game/smb-sprites.ts"), "utf8");
  const play = readFileSync(join(root, "src/game/scenes/Play.ts"), "utf8");
  assert.match(sprites, /bowser: crop\(enemies, 2, 211, 32, 32\)/);
  assert.match(sprites, /bowserWalk: crop\(enemies, 42, 211, 32, 32\)/);
  assert.doesNotMatch(sprites, /bowser: crop\(enemies, 0, 211/);
  assert.doesNotMatch(sprites, /bowserWalk: crop\(enemies, 128, 211/);
  const walk = between(play, "for (const b of sim.bowsers)", "for (const vine of");
  assert.match(walk, /"bowserWalk" : "bowser"/);
  assert.match(walk, /setFlipX\(b\.facing > 0\)/);
  const sheet = atlasRgba(join(root, "src/assets/smb/enemies.png"), "436x261+0+0");
  const isSprite = (r: number, g: number, b: number, a: number) =>
    a >= 128 && !(r === 0 && g === 136 && b === 255);
  const opaqueLeft = (x0: number) => {
    let minX = 32;
    for (let y = 0; y < 32; y++) {
      for (let x = 0; x < 32; x++) {
        const i = ((211 + y) * 436 + (x0 + x)) * 4;
        if (!isSprite(sheet[i], sheet[i + 1], sheet[i + 2], sheet[i + 3]))
          continue;
        if (x < minX) minX = x;
      }
    }
    return minX;
  };
  const snout = (x0: number) => {
    let n = 0;
    for (let y = 0; y < 32; y++) {
      for (let x = 0; x < 6; x++) {
        const i = ((211 + y) * 436 + (x0 + x)) * 4;
        if (!isSprite(sheet[i], sheet[i + 1], sheet[i + 2], sheet[i + 3]))
          continue;
        if (sheet[i] > 180 && sheet[i + 1] > 140 && sheet[i + 2] < 80) n++;
      }
    }
    return n;
  };
  assert.equal(opaqueLeft(2), 0, "first packed frame snout sits on the left edge");
  assert.equal(opaqueLeft(42), 0, "second packed frame snout sits on the left edge");
  assert.ok(opaqueLeft(0) > 0, "x=0 crop is left of the packed frame");
  assert.ok(snout(2) > 8 && snout(42) > 8, "walk frames keep the yellow snout");
});

test("spike NPCs use the flipped Spiny walk frames, not the red Cheep Cheep", () => {
  assert.deepEqual(SPINY_SHEET, {
    stand: { x: 90, y: 154 },
    walk: { x: 120, y: 154 },
  });
  const sprites = readFileSync(join(root, "src/game/smb-sprites.ts"), "utf8");
  const spike = between(sprites, "const spike = crop(", "const koopa = crop(");
  assert.equal(spike.match(/\btrue,/g)?.length, 2, "both frames are flipped");
  const enemies = join(root, "src/assets/smb/enemies.png");
  const frame = (x: number, y: number) =>
    new Uint8ClampedArray(atlasRgba(enemies, `16x16+${x}+${y}`));
  const fish = frame(0, 184);
  for (const { x, y } of [SPINY_SHEET.stand, SPINY_SHEET.walk]) {
    const left = frame(x, y);
    const right = frame(x + 60, y);
    let opaque = 0;
    for (let row = 0; row < H; row++)
      for (let col = 0; col < W; col++) {
        const pixel = px(left, col, row);
        if (pixel[3]) opaque++;
        assert.deepEqual(pixel, px(right, W - 1 - col, row), `(${x}, ${y})`);
      }
    assert.ok(opaque >= 80, `(${x}, ${y}) holds a sprite`);
    assert.notDeepEqual(left, fish);
  }
  assert.notDeepEqual(frame(90, 154), frame(120, 154), "two walk poses");
});

test("flagpole fireworks draw the three SMB1 frames at 2x on one center", () => {
  assert.deepEqual(FIREWORK_SHEET, [
    { key: "fireworkSmall", x: 364, y: 188, width: 8, height: 8 },
    { key: "fireworkMedium", x: 392, y: 185, width: 12, height: 14 },
    { key: "fireworkLarge", x: 420, y: 184, width: 16, height: 16 },
  ]);
  const sheet = atlasRgba(join(root, "src/assets/smb/enemies.png"), "436x261+0+0");
  const isSprite = (x: number, y: number) => {
    const i = (y * 436 + x) * 4;
    return sheet[i + 3] >= 128 && !(sheet[i] === 0 && sheet[i + 1] === 136);
  };
  for (const frame of FIREWORK_SHEET) {
    // Opaque bounds within a 2px ring match the crop exactly, so each crop's
    // center is its frame's center.
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (let y = frame.y - 2; y < frame.y + frame.height + 2; y++)
      for (let x = frame.x - 2; x < Math.min(436, frame.x + frame.width + 2); x++) {
        if (!isSprite(x, y)) continue;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    assert.deepEqual(
      { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 },
      { x: frame.x, y: frame.y, width: frame.width, height: frame.height },
      frame.key,
    );
    assert.equal(frame.y + frame.height / 2, 192, `${frame.key} center row`);
  }
  const sprites = readFileSync(join(root, "src/game/smb-sprites.ts"), "utf8");
  const play = readFileSync(join(root, "src/game/scenes/Play.ts"), "utf8");
  const simulation = readFileSync(join(root, "src/game/simulation.ts"), "utf8");
  assert.match(sprites, /fireball: crop\(enemies, 364, 188, 8, 8\)/);
  assert.match(sprites, /\.\.\.fireworkSprites\(enemies\)/);
  const draw = between(play, "for (const firework of sim.fireworks)", "for (const n of sim.npcs)");
  assert.match(draw, /FIREWORK_SHEET\[fireworkFrame\(firework\)\]/);
  assert.match(draw, /frame\.width \* 2/);
  assert.match(draw, /frame\.height \* 2/);
  assert.match(draw, /frame\.key/);
  assert.doesNotMatch(simulation, /fireworkBurst|firework: true/);
});

test("castle axe is the SMB1 hatchet, not brick debris", () => {
  const sprites = readFileSync(join(root, "src/game/smb-sprites.ts"), "utf8");
  const play = readFileSync(join(root, "src/game/scenes/Play.ts"), "utf8");
  assert.match(sprites, /axe: pixelAxe\(\)/);
  assert.doesNotMatch(sprites, /axe: crop\(items, 64, 192/);
  const draw = between(play, "if (room.axe && !room.bridgeDropped)", "for (const ball of");
  assert.match(draw, /32, 32, "axe"/);
  const data = new Uint8ClampedArray(AXE_WIDTH * AXE_HEIGHT * 4);
  stampAxe(data);
  const at = (x: number, y: number) => px(data, x, y, AXE_WIDTH);
  assert.equal(at(0, 0)[3], 0);
  assert.equal(at(15, 15)[3], 0);
  let brown = 0,
    gray = 0,
    pink = 0,
    opaque = 0;
  let topOpaque = 0,
    handleOpaque = 0;
  for (let y = 0; y < AXE_HEIGHT; y++) {
    for (let x = 0; x < AXE_WIDTH; x++) {
      const [r, g, b, a] = at(x, y);
      if (!a) continue;
      opaque++;
      if (r > 240 && b > 240 && g < 100) pink++;
      if (r > 120 && g > 50 && g < 160 && b < 80) brown++;
      if (Math.abs(r - g) < 25 && Math.abs(g - b) < 25 && r > 70 && r < 180)
        gray++;
      if (y < 10) topOpaque++;
      if (y >= 11 && x >= 6 && x <= 9) handleOpaque++;
    }
  }
  assert.equal(pink, 0, "axe has no leftover sheet pink");
  assert.ok(brown >= 8, "axe has a brown handle/outline");
  assert.ok(gray >= 8, "axe has a gray blade");
  assert.ok(topOpaque > handleOpaque, "blade is wider than the handle");
  assert.ok(handleOpaque >= 4, "handle runs down the bottom center");
  assert.ok(opaque < 200, "axe is a hatchet, not a filled brick");
  const debris = atlasRgba(join(root, "src/assets/smb/items.png"), "16x16+64+192");
  assert.notEqual(Buffer.from(data).compare(debris.subarray(0, data.length)), 0);
});
