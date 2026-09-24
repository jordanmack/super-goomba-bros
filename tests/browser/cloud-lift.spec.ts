import campaign from "../../src/assets/levels/campaign.json" with { type: "json" };
import { test, expect, skipIntro } from "./skip-intro.ts";

test("a cloud lift draws the puff and a ground lift draws the girder", async ({
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
      girder: sample("platform"),
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
  expect(drawn.cloudKeys).toContain("cloudPlatform");
  expect(drawn.cloudKeys).not.toContain("platform");
  expect(drawn.groundCloud).toBe(false);
  expect(drawn.groundPlatforms).toBeGreaterThan(0);
  expect(drawn.groundKeys).toContain("platform");
  expect(drawn.groundKeys).not.toContain("cloudPlatform");
});
