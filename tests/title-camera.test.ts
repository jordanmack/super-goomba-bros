import { test } from "node:test";
import assert from "node:assert/strict";
import { physics } from "./support/arcade.ts";
import {
  MAP_TOP,
  TITLE_SHOT,
  TUNING as T,
  VIEW_HEIGHT,
  cameraWorldView,
  titleCamera,
} from "../src/game/config.ts";
import { Simulation } from "../src/game/simulation.ts";

function viewFor(clientW: number, clientH: number) {
  return { w: (VIEW_HEIGHT * clientW) / clientH, h: VIEW_HEIGHT };
}

function shotFits(
  view: { x: number; y: number; w: number; h: number },
  label: string,
) {
  assert.ok(view.x <= TITLE_SHOT.x + 1e-6, label);
  assert.ok(view.x + view.w >= TITLE_SHOT.x + TITLE_SHOT.w - 1e-6, label);
  assert.ok(view.y + view.h >= TITLE_SHOT.y + TITLE_SHOT.h - 1e-6, label);
  const pipeX = 28 * 32 + 16;
  const qX = 16 * 32 + 16;
  const qY = MAP_TOP + 9 * 32 + 16;
  assert.ok(view.x <= 48 && view.x + view.w >= pipeX, `${label} hill+pipe`);
  assert.ok(view.x <= qX && view.x + view.w >= qX, `${label} question x`);
  assert.ok(view.y <= qY && view.y + view.h >= qY, `${label} question y`);
}

test("title camera zooms out on portrait until the 1-1 shot fits", () => {
  const { w, h } = viewFor(390, 844);
  const frame = titleCamera(w, h);
  assert.ok(frame.zoom < 1);
  const view = cameraWorldView(frame.scrollX, frame.scrollY, frame.zoom, w, h);
  shotFits(view, "390x844");
  assert.ok(Math.abs(view.w - TITLE_SHOT.w) < 1);
});

test("title camera on wide screens keeps the shot and shows extra stage", () => {
  const landscape = viewFor(844, 390);
  const landFrame = titleCamera(landscape.w, landscape.h);
  assert.equal(landFrame.zoom, 1);
  const landView = cameraWorldView(
    landFrame.scrollX,
    landFrame.scrollY,
    landFrame.zoom,
    landscape.w,
    landscape.h,
  );
  shotFits(landView, "844x390");
  assert.ok(landView.w > TITLE_SHOT.w);

  const wide = viewFor(1440, 900);
  const wideFrame = titleCamera(wide.w, wide.h);
  const wideView = cameraWorldView(
    wideFrame.scrollX,
    wideFrame.scrollY,
    wideFrame.zoom,
    wide.w,
    wide.h,
  );
  shotFits(wideView, "1440x900");
  assert.ok(wideView.w >= TITLE_SHOT.w - 1e-6);
});

test("title camera numbers do not depend on the player", () => {
  const a = titleCamera(960, VIEW_HEIGHT);
  const b = titleCamera(249.5, VIEW_HEIGHT);
  assert.equal(a.scrollX, titleCamera(960, VIEW_HEIGHT).scrollX);
  assert.ok(b.zoom < a.zoom);
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
