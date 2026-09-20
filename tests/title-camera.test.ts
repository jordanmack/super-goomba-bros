import { test } from "node:test";
import assert from "node:assert/strict";
import { physics } from "./support/arcade.ts";
import {
  MAP_TOP,
  TUNING as T,
  VIEW_HEIGHT,
  cameraWorldView,
  titleCamera,
} from "../src/game/config.ts";
import { Simulation } from "../src/game/simulation.ts";

function viewFor(clientW: number, clientH: number) {
  return { w: (VIEW_HEIGHT * clientW) / clientH, h: VIEW_HEIGHT };
}

function openingView(
  clientW: number,
  clientH: number,
) {
  const { w, h } = viewFor(clientW, clientH);
  const frame = titleCamera();
  const view = cameraWorldView(frame.scrollX, frame.scrollY, frame.zoom, w, h);
  return { w, h, frame, view };
}

test("title camera uses native play zoom and left-anchors the 1-1 opening", () => {
  const { w, frame, view } = openingView(390, 844);
  assert.equal(frame.zoom, 1);
  assert.equal(frame.scrollX, 0);
  assert.equal(frame.scrollY, 0);
  assert.ok(Math.abs(view.x) < 1e-6, "left-anchored");
  assert.ok(Math.abs(view.y) < 1e-6, "top-anchored");
  assert.ok(Math.abs(view.w - w) < 1e-6);
  assert.ok(view.w < 30 * 32, "portrait crops instead of zooming out");
  const pipeX = 28 * 32 + 16;
  const qX = 16 * 32 + 16;
  const qY = MAP_TOP + 9 * 32 + 16;
  assert.ok(view.x + view.w < pipeX, "portrait crops the first pipe");
  assert.ok(view.x + view.w < qX, "portrait crops the question-block row");
  assert.ok(view.x <= 48 && view.x + view.w > 48, "start hill stays in view");
  assert.ok(view.y <= qY);
});

test("title camera on wide screens keeps zoom 1 and shows extra stage", () => {
  const landscape = openingView(844, 390);
  assert.equal(landscape.frame.zoom, 1);
  assert.ok(Math.abs(landscape.view.x) < 1e-6);
  assert.ok(landscape.view.w > 30 * 32);
  const pipeX = 28 * 32 + 16;
  assert.ok(
    landscape.view.x + landscape.view.w >= pipeX,
    "landscape can show the first pipe without zooming out",
  );

  const wide = openingView(1440, 900);
  assert.equal(wide.frame.zoom, 1);
  assert.ok(Math.abs(wide.view.x) < 1e-6);
  assert.equal(wide.frame.zoom, landscape.frame.zoom);
  assert.ok(wide.view.w !== landscape.view.w);
});

test("title camera numbers do not depend on the player or viewport", () => {
  const a = titleCamera();
  const b = titleCamera();
  assert.deepEqual(a, b);
  assert.equal(a.zoom, 1);
  assert.equal(a.scrollX, 0);
  const narrow = openingView(390, 844);
  const wide = openingView(1440, 900);
  assert.deepEqual(narrow.frame, wide.frame);
});

test("title does not spawn the live NPC population", () => {
  const title = new Simulation(() => 0.5, physics());
  assert.equal(title.mode, "title");
  assert.equal(title.npcs.length, 0);
  title.reset("intro");
  assert.equal(title.npcs.length, T.population);
  title.reset("title");
  assert.equal(title.mode, "title");
  assert.equal(title.npcs.length, 0);
});
