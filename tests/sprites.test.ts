import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  flagTextureKey,
  stampGoombaFlag,
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
  assert.equal(flagTextureKey("goomba"), "goombaFlag");
  assert.equal(flagTextureKey("mario"), "marioFlag");
});

test("Goomba flag stamps Goomba art into the cloth, not a Mario-flag recolor", () => {
  const flag = new Uint8ClampedArray(W * H * 4);
  const goomba = new Uint8ClampedArray(W * H * 4);
  const brown = [228, 88, 16] as const;
  const eye = [32, 32, 32] as const;
  const skin = [244, 212, 180] as const;
  const mark = [10, 20, 30] as const;
  setPx(goomba, 8, 0, ...brown);
  setPx(goomba, 4, 5, ...eye);
  setPx(goomba, 7, 7, ...skin);
  setPx(goomba, 5, 6, ...mark);
  setPx(flag, 2, 2, 230, 156, 33);
  setPx(flag, 2, 6, 181, 49, 33);
  setPx(flag, 5, 6, 252, 252, 252);
  setPx(flag, 8, 8, 181, 49, 33);
  setPx(flag, 6, 7, 252, 252, 252);
  const before = new Uint8ClampedArray(flag);
  stampGoombaFlag(flag, goomba, W, H);
  assert.deepEqual(px(flag, 2, 2), px(before, 2, 2));
  assert.deepEqual(px(flag, 2, 6), px(before, 2, 6));
  assert.deepEqual(px(flag, 5, 6), [...eye, 255]);
  assert.deepEqual(px(flag, 8, 8), [...skin, 255]);
  assert.deepEqual(px(flag, 6, 7), [...mark, 255]);
  const recolor = recolorMarioFlag(before);
  assert.notDeepEqual(px(flag, 5, 6), px(recolor, 5, 6));
  assert.notDeepEqual(px(flag, 8, 8), px(recolor, 8, 8));
  assert.notDeepEqual(px(flag, 6, 7), px(recolor, 6, 7));
  assert.notEqual(Buffer.from(flag).compare(Buffer.from(recolor)), 0);
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
