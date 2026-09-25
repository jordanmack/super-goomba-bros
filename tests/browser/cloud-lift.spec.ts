import campaign from "../../src/assets/levels/campaign.json" with { type: "json" };
import { test, expect, skipIntro } from "./skip-intro.ts";

test("a cloud lift draws the puff and a ground lift repeats the girder tile", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "START GAME" }).click();
  await skipIntro(page);
  const groundStage = campaign.levels.findIndex((level) => level.id === "1-3");
  expect(groundStage).toBeGreaterThanOrEqual(0);
  const drawn = await page.evaluate((groundStage) => {
    const g = (window as any).__game;
    const s = g.sim;
    g.paused = true;
    const sample = (key: string) => {
      const image = g.renderer.game.textures.get(key).getSourceImage();
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d")!;
      context.drawImage(image, 0, 0);
      const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let sig = 0;
      let opaque = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3]! < 20) continue;
        opaque++;
        sig = (sig + data[i]! * 3 + data[i + 1]! * 5 + data[i + 2]! * 7) % 1000003;
      }
      return { w: image.width, h: image.height, sig, opaque };
    };
    const visibleKeys = () => {
      g.renderer.render(s, 0);
      return g.renderer.play.effects
        .filter((sprite: { visible: boolean }) => sprite.visible)
        .map((sprite: { texture: { key: string } }) => sprite.texture.key);
    };
    const cloud = s.loadRoom("2b");
    s.player.areaId = "2b";
    s.player.alive = true;
    const cloudKeys = visibleKeys();
    s.levelIndex = groundStage;
    s.reset();
    s.marioReturn = 1e6;
    const groundKeys = visibleKeys();
    return {
      cloudRoom: cloud.data.header.cloud,
      puff: sample("cloudPlatform"),
      girder: sample("girder6"),
      girder4: sample("girder4"),
      girder3: sample("girder3"),
      cloudKeys,
      groundKeys,
      groundCloud: s.activeRoom.data.header.cloud,
      groundPlatforms: s.activeRoom.platforms.length,
    };
  }, groundStage);
  expect(drawn.cloudRoom).toBe(true);
  expect(drawn.puff.w).toBe(48);
  expect(drawn.puff.h).toBe(8);
  expect(drawn.puff.opaque).toBeGreaterThan(0);
  expect(drawn.girder.opaque).toBeGreaterThan(0);
  expect(drawn.puff.sig).not.toBe(drawn.girder.sig);
  // Six, four, and three copies of the 8x8 tile, never one stretched strip.
  expect([drawn.girder, drawn.girder4, drawn.girder3].map((g) => [g.w, g.h])).toEqual([
    [48, 8],
    [32, 8],
    [24, 8],
  ]);
  expect(drawn.girder.opaque).toBe(drawn.girder3.opaque * 2);
  expect(drawn.girder4.opaque * 3).toBe(drawn.girder.opaque * 2);
  expect(drawn.cloudKeys).toContain("cloudPlatform");
  expect(drawn.cloudKeys).not.toContain("girder6");
  expect(drawn.groundCloud).toBe(false);
  expect(drawn.groundPlatforms).toBeGreaterThan(0);
  expect(drawn.groundKeys).toContain("girder6");
  expect(drawn.groundKeys).not.toContain("cloudPlatform");
});

test("a castle deck draws four girder tiles over a 64-wide body", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "START GAME" }).click();
  await skipIntro(page);
  const stage = campaign.levels.findIndex((level) => level.id === "1-4");
  const drawn = await page.evaluate((stage) => {
    const g = (window as any).__game;
    const s = g.sim;
    g.paused = true;
    s.levelIndex = stage;
    s.reset();
    s.marioReturn = 1e6;
    const lift = s.activeRoom.platforms[0];
    s.player.body.position.x = lift.body.position.x - 100;
    g.renderer.render(s, 0);
    const sprite = g.renderer.play.effects.find(
      (e: any) =>
        e.visible &&
        String(e.texture.key).startsWith("girder") &&
        Math.abs(e.x - Math.round(lift.body.position.x)) < 1,
    );
    return {
      width: lift.body.width,
      key: sprite?.texture.key,
      shown: sprite ? [sprite.displayWidth, sprite.displayHeight] : null,
    };
  }, stage);
  expect(drawn).toEqual({ width: 64, key: "girder4", shown: [64, 16] });
});

test("a balance rope repeats the rope metatile from the pulley and stops at the deck", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "START GAME" }).click();
  await skipIntro(page);
  const stage = campaign.levels.findIndex((level) => level.id === "3-3");
  const drawn = await page.evaluate((stage) => {
    const g = (window as any).__game;
    const s = g.sim;
    g.paused = true;
    s.levelIndex = stage;
    s.reset();
    s.marioReturn = 1e6;
    const room = s.activeRoom;
    const rope = room.balanceRopes[0];
    s.player.body.position.x = rope.x - 100;
    // Pull the deck 40px down so the rope ends partway through a tile.
    const deck = room.platforms.find(
      (p: any) => p.body.position.x === rope.x,
    );
    deck.body.position.y += 40;
    room.refreshBalanceRopes();
    const ropeNow = room.balanceRopes.find((r: any) => r.x === rope.x);
    g.renderer.render(s, 0);
    const layer = g.renderer.play.tiles;
    const hidden = [...room.ropeTiles].map((key: string) => {
      const [column, row] = key.split(",").map(Number);
      return layer.getTileAt(column, row)?.index ?? -1;
    });
    const pieces = g.renderer.play.effects
      .filter(
        (e: any) =>
          e.visible &&
          e.texture.key === "metatiles" &&
          Math.abs(e.x - Math.round(ropeNow.x)) < 1,
      )
      .map((e: any) => ({
        frame: Number(e.frame.name) % 256,
        top: e.y - 16,
        size: [e.displayWidth, e.displayHeight],
        crop: e.isCropped ? e._crop.height : null,
      }))
      .sort((a: any, b: any) => a.top - b.top);
    return { hidden, pieces, top: ropeNow.top, bottom: ropeNow.bottom };
  }, stage);
  expect(drawn.hidden.length).toBeGreaterThan(0);
  expect(drawn.hidden.every((index: number) => index === -1)).toBe(true);
  expect(drawn.pieces.length).toBeGreaterThan(1);
  for (const [i, piece] of drawn.pieces.entries()) {
    expect(piece.frame).toBe(64);
    expect(piece.size).toEqual([32, 32]);
    expect(piece.top).toBe(drawn.top + i * 32);
  }
  // Every copy but the last is whole. The last is cut, not squeezed.
  const last = drawn.pieces.at(-1)!;
  const whole = drawn.pieces.slice(0, -1);
  for (const piece of whole) expect([null, 16]).toContain(piece.crop);
  expect(last.crop).toBe((drawn.bottom - last.top) / 2);
  expect(last.crop).toBeLessThan(16);
});
