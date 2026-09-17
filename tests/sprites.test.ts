import { test } from "node:test";
import assert from "node:assert/strict";
import {
  flagTextureKey,
  stampGoombaFlag,
} from "../src/game/smb-sprites.ts";

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
