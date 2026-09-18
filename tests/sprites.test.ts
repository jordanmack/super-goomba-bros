import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  flagTextureKey,
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

function recolorMarioFlag(flag: Uint8ClampedArray, width = W) {
  const out = new Uint8ClampedArray(flag);
  for (let i = 0; i < out.length; i += 4) {
    if (!out[i + 3]) continue;
    const x = (i / 4) % width;
    const r = out[i],
      g = out[i + 1],
      b = out[i + 2];
    if (r > 200 && g > 200 && b > 200) {
      out[i] = 228;
      out[i + 1] = 92;
      out[i + 2] = 16;
    } else if (x > 3 && r > 180 && g < 100 && b < 100) {
      out[i] = 252;
      out[i + 1] = 216;
      out[i + 2] = 168;
    }
  }
  return out;
}

test("claim maps to the shipped flag texture keys", () => {
  assert.equal(flagTextureKey("goomba"), "mushroomFlag");
  assert.equal(flagTextureKey("mario"), "marioFlag");
});

test("player flag stamps mushroom art into the cloth, not a Mario-flag recolor", () => {
  const flag = new Uint8ClampedArray(W * H * 4);
  const mushroom = new Uint8ClampedArray(W * H * 4);
  const cap = [228, 88, 16] as const;
  const outline = [0, 0, 0] as const;
  const stem = [252, 160, 68] as const;
  const spot = [252, 252, 252] as const;
  setPx(mushroom, 8, 0, ...cap);
  setPx(mushroom, 4, 5, ...outline);
  setPx(mushroom, 7, 7, ...stem);
  setPx(mushroom, 5, 6, ...spot);
  setPx(flag, 2, 2, 230, 156, 33);
  setPx(flag, 2, 6, 181, 49, 33);
  setPx(flag, 5, 6, 252, 252, 252);
  setPx(flag, 8, 8, 181, 49, 33);
  setPx(flag, 6, 7, 252, 252, 252);
  const before = new Uint8ClampedArray(flag);
  stampMushroomFlag(flag, mushroom, W, H);
  assert.deepEqual(px(flag, 2, 2), px(before, 2, 2));
  assert.deepEqual(px(flag, 2, 6), px(before, 2, 6));
  assert.deepEqual(px(flag, 5, 6), [...outline, 255]);
  assert.deepEqual(px(flag, 8, 8), [...stem, 255]);
  assert.deepEqual(px(flag, 6, 7), [...spot, 255]);
  const recolor = recolorMarioFlag(before);
  assert.notDeepEqual(px(flag, 5, 6), px(recolor, 5, 6));
  assert.notDeepEqual(px(flag, 8, 8), px(recolor, 8, 8));
  assert.notDeepEqual(px(flag, 6, 7), px(recolor, 6, 7));
  assert.notEqual(Buffer.from(flag).compare(Buffer.from(recolor)), 0);
});

test("Fire Mario draw path uses original fireMario frames, not the white palette", () => {
  const play = readFileSync(join(root, "src/game/scenes/Play.ts"), "utf8");
  const boot = readFileSync(join(root, "src/game/scenes/Boot.ts"), "utf8");
  const sprites = readFileSync(join(root, "src/game/smb-sprites.ts"), "utf8");
  const pose = play.slice(
    play.indexOf("const base = mario"),
    play.indexOf("const moving ="),
  );
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
      throw new Error("convert required to inspect metatiles.png");
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
  assert.ok(top.colors.size >= 2, "castle 74: inverted door keeps its frame");
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
  const draw = play.slice(
    play.indexOf('goal?.kind === "castle-room"'),
    play.indexOf("const pole = room.flagpole"),
  );
  assert.match(draw, /palette \+ 74/);
  assert.match(draw, /palette \+ 75/);
  assert.match(draw, /T\.groundY - 48/);
  assert.match(draw, /T\.groundY - 16/);
});

test("Play draws the sweat drop unscaled, never a scaling exclaim bang", () => {
  const play = readFileSync(join(root, "src/game/scenes/Play.ts"), "utf8");
  const sprites = readFileSync(join(root, "src/game/smb-sprites.ts"), "utf8");
  const draw = play.slice(
    play.indexOf("n.exclaimLeft"),
    play.indexOf("this.effects[index]"),
  );
  assert.equal(SWEAT_DROP_KEY, "sweatDrop");
  assert.match(draw, /SWEAT_DROP_WIDTH \* 2/);
  assert.match(draw, /SWEAT_DROP_HEIGHT \* 2/);
  assert.match(draw, /SWEAT_DROP_KEY/);
  assert.doesNotMatch(draw, /n\.scale/);
  assert.doesNotMatch(play, /["']exclaim["']/);
  assert.doesNotMatch(sprites, /pixelExclaim/);
  assert.match(sprites, /sweatDrop/);
});
