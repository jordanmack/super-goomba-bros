import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";
import campaign from "../../src/assets/levels/campaign.json" with { type: "json" };
import { TUNING as T } from "../../src/game/config";
import { test, expect, skipIntro } from "./skip-intro.ts";
import { WORLD_TILES } from "../fixtures/world-tiles";
import { WORLD_1_1 as LEVEL } from "../fixtures/world-1-1";

test("Starman music follows only player and Mario stars and respects death cues", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "START GAME" }).click();
  await skipIntro(page);
  await page.waitForFunction(
    () => (window as any).__game.audio.buffers.size === 23,
  );
  await page.evaluate(() => {
    const s = (window as any).__game.sim;
    // Keep actors still while the app's real event and music loop runs.
    s.step = () => {};
    s.marioActive = true;
  });
  const isStarMusic = () =>
    page.evaluate(() => {
      const a = (window as any).__game.audio;
      return a.music?.audioBuffer === a.buffers.get("starman");
    });
  const giveStar = (who: "player" | "mario" | "npc") =>
    page.evaluate((who) => {
      const s = (window as any).__game.sim;
      const box = s.obstacles.find((c: any) => c.question && !c.used);
      const previous = s.random;
      s.random = () => 0.5;
      s.hitBlock(box, s.player);
      s.random = previous;
      const item = s.items.at(-1);
      item.kind = "star";
      s.collect(who === "npc" ? s.npcs[0] : s[who], item);
    }, who);
  await giveStar("npc");
  await expect.poll(isStarMusic).toBe(false);
  await giveStar("player");
  await expect.poll(isStarMusic).toBe(true);
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.testStarMusic = g.audio.music;
  });
  await giveStar("mario");
  await page.evaluate(() => {
    (window as any).__game.sim.player.starLeft = 0;
  });
  await expect.poll(isStarMusic).toBe(true);
  expect(
    await page.evaluate(() => {
      const g = (window as any).__game;
      return g.testStarMusic === g.audio.music;
    }),
  ).toBe(true);
  await page.evaluate(() => {
    (window as any).__game.sim.marioActive = false;
  });
  await expect.poll(isStarMusic).toBe(false);
  await page.evaluate(() => {
    (window as any).__game.sim.marioActive = true;
  });
  await expect.poll(isStarMusic).toBe(true);
  await page.evaluate(() => {
    (window as any).__game.sim.mario.starLeft = 0;
  });
  await expect.poll(isStarMusic).toBe(false);
  await giveStar("player");
  await expect.poll(isStarMusic).toBe(true);
  await page.evaluate(() => {
    (window as any).__game.sim.events.push("marioDeath");
  });
  await expect
    .poll(() =>
      page.evaluate(() => {
        const a = (window as any).__game.audio;
        return (
          !a.music &&
          a.musicHoldUntil > a.context.currentTime &&
          [...a.effects].some(
            (source: any) => source.audioBuffer === a.buffers.get("death"),
          )
        );
      }),
    )
    .toBe(true);
  await expect.poll(isStarMusic, { timeout: 6000 }).toBe(true);
});

test("area music resumes after Mario death from the saved seek", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "START GAME" }).click();
  await skipIntro(page);
  await page.waitForFunction(
    () => (window as any).__game.audio.buffers.size === 23,
  );
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.sim.step = () => {};
    g.sim.marioReturn = 1e6;
  });
  const musicState = () =>
    page.evaluate(() => {
      const a = (window as any).__game.audio;
      const music = a.music;
      return {
        key: music?.key ?? null,
        marker: music?.currentMarker?.name ?? null,
        seek: music?.isPlaying ? music.seek : -1,
        starman: music?.audioBuffer === a.buffers.get("starman"),
        deathCue: [...a.effects].some(
          (source: any) => source.audioBuffer === a.buffers.get("death"),
        ),
      };
    });
  await expect
    .poll(
      async () => {
        const state = await musicState();
        return (
          state.key === "overworld" &&
          state.marker === "loop" &&
          state.seek > 2
        );
      },
      { timeout: 12000 },
    )
    .toBe(true);
  await page.evaluate(() => {
    const g = (window as any).__game;
    const a = g.audio;
    const music = a.music;
    (window as any).__savedMusic = {
      key: music.key,
      marker: music.currentMarker?.name ?? null,
      seek: music.seek,
    };
    (window as any).__resumedMusic = null;
    (window as any).__sawDeathCue = false;
    const tick = () => {
      const audio = g.audio;
      const deathCue = [...audio.effects].some(
        (source: any) => source.audioBuffer === audio.buffers.get("death"),
      );
      if (deathCue && !audio.music) (window as any).__sawDeathCue = true;
      if (
        (window as any).__sawDeathCue &&
        audio.music?.isPlaying &&
        !(window as any).__resumedMusic
      ) {
        (window as any).__resumedMusic = {
          key: audio.music.key,
          marker: audio.music.currentMarker?.name ?? null,
          seek: audio.music.seek,
        };
        return;
      }
      if (!(window as any).__resumedMusic) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    g.sim.events.push("marioDeath");
  });
  await expect
    .poll(
      () => page.evaluate(() => !!(window as any).__resumedMusic),
      { timeout: 6000 },
    )
    .toBe(true);
  const pair = await page.evaluate(() => ({
    saved: (window as any).__savedMusic,
    resumed: (window as any).__resumedMusic,
    sawDeathCue: (window as any).__sawDeathCue,
  }));
  expect(pair.sawDeathCue).toBe(true);
  expect(pair.saved.seek).toBeGreaterThan(2);
  expect(pair.resumed.key).toBe(pair.saved.key);
  expect(pair.resumed.marker).toBe(pair.saved.marker);
  expect(pair.resumed.seek).toBeGreaterThan(0);
  expect(Math.abs(pair.resumed.seek - pair.saved.seek)).toBeLessThan(0.25);
  await page.evaluate(() => {
    const s = (window as any).__game.sim;
    const box = s.obstacles.find((c: any) => c.question && !c.used);
    const previous = s.random;
    s.random = () => 0.5;
    s.hitBlock(box, s.player);
    s.random = previous;
    const item = s.items.at(-1);
    item.kind = "star";
    s.collect(s.player, item);
  });
  await expect.poll(async () => (await musicState()).starman).toBe(true);
  await page.evaluate(() => {
    (window as any).__game.sim.events.push("marioDeath");
  });
  await expect
    .poll(async () => {
      const state = await musicState();
      return !state.key && state.deathCue;
    })
    .toBe(true);
  await expect
    .poll(async () => (await musicState()).starman, { timeout: 6000 })
    .toBe(true);
});

test("pipe segments and background bushes retain their map pixels", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForFunction(() => !!(window as any).__game?.renderer.play);
  // Title camera is a static opening shot, so pan samples from play camera.
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.paused = true;
    g.sim.mode = "playing";
  });
  await expect(page.locator(".play-footer")).toBeVisible();
  const cells = LEVEL.pipes.flatMap(({ column, height }) =>
    Array.from({ length: height }, (_, i) =>
      [column, column + 1].map((x) => [x, LEVEL.groundRow - height + i]),
    ).flat(),
  );
  // The removed cover overlays also obscured several bushes near ground level.
  cells.push([13, 12], [24, 12], [43, 12]);
  const mismatches = await page.evaluate(
    async ({ samples, reference }) => {
      const g = (window as any).__game;
      const s = g.sim;
      g.paused = true;
      s.mode = "playing";
      s.player.alive = false;
      for (const n of s.npcs) n.alive = false;
      s.marioActive = false;
      const canvas = document.createElement("canvas");
      const source = g.renderer.game.canvas;
      canvas.width = source.width;
      canvas.height = source.height;
      const ctx = canvas.getContext("2d")!;
      const referenceImage = new Image();
      referenceImage.src = `data:image/png;base64,${reference}`;
      await referenceImage.decode();
      const referenceCanvas = document.createElement("canvas");
      referenceCanvas.width = referenceImage.width;
      referenceCanvas.height = referenceImage.height;
      const referenceContext = referenceCanvas.getContext("2d")!;
      referenceContext.drawImage(referenceImage, 0, 0);
      const errors: string[] = [];
      for (const [x, y, id] of samples) {
        // Sample the center of source pixel (8, 8), not its left/top edge.
        const worldX = x * 32 + 17;
        const worldY = 14 + y * 32 + 17;
        s.player.body.position.x = worldX;
        g.renderer.render(s, 0);
        await new Promise(requestAnimationFrame);
        await new Promise(requestAnimationFrame);
        canvas.width = source.width;
        canvas.height = source.height;
        ctx.drawImage(source, 0, 0);
        const zoom = s.cameraZoom || 1;
        const viewX =
          s.cameraX + (g.renderer.width / 2) * (1 - 1 / zoom);
        const viewY = s.cameraY + (540 / 2) * (1 - 1 / zoom);
        const pixel = ctx.getImageData(
          Math.floor(
            ((worldX - viewX) * zoom / g.renderer.width) * canvas.width,
          ),
          Math.floor(((worldY - viewY) * zoom / 540) * canvas.height),
          1,
          1,
        ).data;
        const expected = referenceContext.getImageData(
          (id % 16) * 16 + 8,
          Math.floor(id / 16) * 16 + 8,
          1,
          1,
        ).data;
        if ([0, 1, 2].some((i) => Math.abs(pixel[i] - expected[i]) > 2))
          errors.push(
            `tile ${x},${y}: ${Array.from(pixel)} vs ${Array.from(expected)}`,
          );
      }
      return errors;
    },
    {
      samples: cells.map(([x, y]) => [x, y, WORLD_TILES[y][x]]),
      reference: readFileSync(
        new URL("../fixtures/world-1-1-tiles.png", import.meta.url),
      ).toString("base64"),
    },
  );
  expect(mismatches).toEqual([]);
});

test("flower Goombas turn white, Shift runs, and Mario's death cue finishes before music resumes", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "START GAME" }).click();
  await skipIntro(page);
  await expect(page.getByRole("button", { name: "B", exact: true })).toBeVisible();
  await page.waitForFunction(
    () => (window as any).__game.audio.buffers.size === 23,
  );
  await page.keyboard.down("ArrowRight");
  await page.waitForFunction(
    () => (window as any).__game.sim.player.body.velocity.x > 0,
  );
  expect(
    await page.evaluate(
      () => (window as any).__game.sim.player.body.velocity.x,
    ),
  ).toBeCloseTo(T.walkSpeed);
  await page.keyboard.down("Shift");
  await page.waitForFunction(
    () => (window as any).__game.sim.player.body.velocity.x > 4,
  );
  expect(
    await page.evaluate(
      () => (window as any).__game.sim.player.body.velocity.x,
    ),
  ).toBeCloseTo(T.runSpeed);
  await page.keyboard.up("Shift");
  await page.keyboard.up("ArrowRight");
  const appearance = await page.evaluate(() => {
    const g = (window as any).__game;
    g.paused = true;
    const s = g.sim;
    s.marioReturn = 1e6;
    const box = s.obstacles.find((c: any) => c.question);
    const previous = s.random;
    s.random = () => 0.5;
    s.hitBlock(box, s.player);
    s.random = previous;
    s.items[0].kind = "flower";
    s.collect(s.player, s.items[0]);
    g.renderer.render(s, 0);
    const texture = g.renderer.play.actors.get(s.player.id).texture;
    const data = texture
      .getSourceImage()
      .getContext("2d")
      .getImageData(0, 0, 16, 16).data;
    let white = 0,
      dark = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (!data[i + 3]) continue;
      if (data[i] > 245 && data[i + 1] > 245 && data[i + 2] > 245) white++;
      if (data[i] < 40 && data[i + 1] < 40 && data[i + 2] < 40) dark++;
    }
    s.marioActive = true;
    s.mario.body.position.x = 220;
    s.mario.body.position.y = 350;
    s.setMarioStage(2);
    g.renderer.render(s, 0);
    const marioTexture = g.renderer.play.actors.get(s.mario.id).texture;
    const marioData = marioTexture
      .getSourceImage()
      .getContext("2d")
      .getImageData(0, 0, 16, 32).data;
    let marioWhite = 0,
      marioRed = 0,
      marioCream = 0;
    for (let i = 0; i < marioData.length; i += 4) {
      if (!marioData[i + 3]) continue;
      const r = marioData[i],
        gc = marioData[i + 1],
        b = marioData[i + 2];
      if (r > 245 && gc > 245 && b > 245) marioWhite++;
      if (r > 180 && gc < 140 && b < 80) marioRed++;
      if (r > 240 && gc > 200 && b > 140 && b < 220) marioCream++;
    }
    s.defeatMario();
    for (const event of s.events.splice(0)) g.audio.event(event);
    g.renderer.render(s, 0);
    return {
      white,
      dark,
      deathVisible: g.renderer.play.actors.get(s.mario.id).visible,
      deathPose:
        g.renderer.play.actors.get(s.mario.id).texture ===
        g.renderer.game.textures.get("marioDeath"),
      marioWhite,
      marioRed,
      marioCream,
    };
  });
  expect(appearance.white).toBeGreaterThan(60);
  expect(appearance.dark).toBeGreaterThan(20);
  expect(appearance.marioWhite).toBe(0);
  expect(appearance.marioRed).toBeGreaterThan(20);
  expect(appearance.marioCream).toBeGreaterThan(20);
  expect(appearance.deathVisible && appearance.deathPose).toBe(true);
  await page.screenshot({ path: "test-results/white-goomba-mario-death.png" });
  await page.evaluate(() => {
    (window as any).__game.paused = false;
  });
  await expect
    .poll(() =>
      page.evaluate(() => {
        const a = (window as any).__game.audio;
        return (
          !a.music &&
          [...a.effects].some(
            (source: any) => source.audioBuffer === a.buffers.get("death"),
          )
        );
      }),
    )
    .toBe(true);
  await expect
    .poll(() => page.evaluate(() => !!(window as any).__game.audio.music), {
      timeout: 6000,
    })
    .toBe(true);
});

test("blocks bounce and disappear independently; item powers render with touch fire controls", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "START GAME" }).click();
  await skipIntro(page);
  const blocks = await page.evaluate(() => {
    const g = (window as any).__game;
    g.paused = true;
    const s = g.sim;
    s.marioReturn = 1e6;
    const brick = s.obstacles.find(
      (c: any) => c.kind === "brick" && !c.question,
    );
    s.hitBlock(brick, s.player);
    for (let i = 0; i < 3; i++)
      s.step(1 / 60, {
        left: false,
        right: false,
        jump: false,
        down: false,
        fire: false,
        run: false,
      });
    g.renderer.render(s, 0);
    const mesh = g.renderer.play.obstacles.get(brick.id);
    const bounced = mesh.visible && mesh.y < brick.y;
    s.breakBrick(brick);
    g.renderer.render(s, 0);
    const disappeared = !mesh.visible;
    const previous = s.random;
    s.random = () => 0.5;
    for (const kind of ["mushroom", "flower", "star"]) {
      const box = s.obstacles.find((c: any) => c.question && !c.used);
      s.hitBlock(box, s.player);
      const item = s.items.at(-1);
      item.kind = kind;
      s.collect(s.player, item);
    }
    s.random = previous;
    g.renderer.render(s, 0);
    return {
      bounced,
      disappeared,
      scale: g.renderer.play.actors.get(s.player.id).displayWidth,
    };
  });
  expect(blocks).toEqual({ bounced: true, disappeared: true, scale: 64 });
  await expect(page.locator(".power-state")).toHaveCount(0);
  await expect(page.locator(".danger, .danger-meter")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "B", exact: true }),
  ).toBeVisible();
  for (const button of await page.locator(".controls button").all()) {
    const bounds = (await button.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
  }
  await page.screenshot({ path: "test-results/giant-powers-390.png" });
  await page.evaluate(() => {
    (window as any).__game.paused = false;
  });
  await page.keyboard.press("KeyZ");
  await page.waitForFunction(() =>
    (window as any).__game.sim.fireballs.some((f: any) => f.owner === "player"),
  );
  const fire = (await page
    .getByRole("button", { name: "B", exact: true })
    .boundingBox())!;
  await page.mouse.move(fire.x + fire.width / 2, fire.y + fire.height / 2);
  await page.mouse.down();
  await page.waitForFunction(() => (window as any).__game.input.run);
  await page.mouse.up();
});

test("question-block items stay upright after fireball sprite reuse", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "START GAME" }).click();
  await skipIntro(page);
  await page.waitForFunction(() => !!(window as any).__game?.renderer.play);
  const drawn = await page.evaluate(() => {
    const g = (window as any).__game;
    g.paused = true;
    const s = g.sim;
    const play = g.renderer.play;
    s.marioReturn = 1e6;
    for (const coin of s.activeRoom.coins) coin.collected = true;
    s.activeRoom.platforms.length = 0;
    s.items = [];
    s.particles = [];
    const fireball = {
      id: 9001,
      x: s.player.body.position.x + 40,
      y: s.player.body.position.y,
      vx: 6,
      vy: 0,
      age: 0.1,
      owner: "player",
      scale: 1,
    };
    s.fireballs = [fireball];
    g.renderer.render(s, 0);
    const spinning = play.effects.find(
      (sprite: any) => sprite.visible && sprite.texture.key === "fireball",
    );
    const fireballRotation = spinning?.rotation ?? null;
    s.fireballs = [];
    const kinds = [
      "mushroom",
      "mushroom3x",
      "mushroom8x",
      "flower",
      "star",
    ] as const;
    const itemRotations: Record<string, number | null> = {};
    const previous = s.random;
    s.random = () => 0.5;
    for (const kind of kinds) {
      const box = s.obstacles.find((c: any) => c.question && !c.used);
      s.hitBlock(box, s.player);
      const item = s.items.at(-1);
      item.kind = kind;
      g.renderer.render(s, 0);
      const sprite = play.effects.find(
        (entry: any) => entry.visible && entry.texture.key === kind,
      );
      itemRotations[kind] = sprite?.rotation ?? null;
      s.physics.remove(item.body);
      s.items = [];
    }
    const box = s.obstacles.find((c: any) => c.question && !c.used);
    s.hitBlock(box, s.player);
    s.random = previous;
    const live = s.items.at(-1);
    s.fireballs = [{ ...fireball, id: 9002 }];
    g.renderer.render(s, 0);
    const itemWithFireball = play.effects.find(
      (sprite: any) => sprite.visible && sprite.texture.key === live.kind,
    );
    const fireballWithItem = play.effects.find(
      (sprite: any) => sprite.visible && sprite.texture.key === "fireball",
    );
    return {
      fireballRotation,
      itemRotations,
      itemRotationWithFireball: itemWithFireball?.rotation ?? null,
      fireballRotationWithItem: fireballWithItem?.rotation ?? null,
    };
  });
  expect(drawn.fireballRotation).not.toBe(0);
  expect(drawn.fireballRotation).not.toBeNull();
  expect(drawn.itemRotations).toEqual({
    mushroom: 0,
    mushroom3x: 0,
    mushroom8x: 0,
    flower: 0,
    star: 0,
  });
  expect(drawn.itemRotationWithFireball).toBe(0);
  expect(drawn.fireballRotationWithItem).not.toBe(0);
  expect(drawn.fireballRotationWithItem).not.toBeNull();
});

test("mushroom types use distinct colors and the 8x item draws larger", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "START GAME" }).click();
  await page.waitForFunction(() => !!(window as any).__game?.renderer.play);
  const drawn = await page.evaluate(() => {
    const g = (window as any).__game;
    g.paused = true;
    const s = g.sim;
    const play = g.renderer.play;
    const textures = g.renderer.game.textures.list;
    const pixels = (name: string) => {
      const image = textures[name].getSourceImage() as HTMLCanvasElement;
      return image.getContext("2d")!.getImageData(0, 0, 16, 16).data;
    };
    const caps = (name: string) => {
      const data = pixels(name);
      let red = 0,
        green = 0,
        gold = 0,
        blue = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (!data[i + 3]) continue;
        const r = data[i],
          gch = data[i + 1],
          b = data[i + 2];
        if (r > 140 && gch < 90 && b < 80) red++;
        if (gch > r && gch > 100 && b < 80) green++;
        if (r > 200 && gch > 180 && b < 80) gold++;
        if (b > 200 && r < 80 && gch > 80 && gch < 180) blue++;
      }
      return { red, green, gold, blue };
    };
    const exact = (name: string, rgb: [number, number, number]) => {
      const data = pixels(name);
      let n = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (
          data[i + 3] &&
          data[i] === rgb[0] &&
          data[i + 1] === rgb[1] &&
          data[i + 2] === rgb[2]
        )
          n++;
      }
      return n;
    };
    const sizes: Record<string, number | null> = {};
    const overhangs: Record<string, number | null> = {};
    const previous = s.random;
    s.random = () => 0.5;
    for (const kind of [
      "mushroom",
      "mushroom3x",
      "mushroom8x",
      "oneUp",
    ] as const) {
      const box = s.obstacles.find((c: any) => c.question && !c.used);
      s.hitBlock(box, s.player);
      const item = s.items.at(-1);
      item.kind = kind;
      g.renderer.render(s, 0);
      const sprite = play.effects.find(
        (entry: any) => entry.visible && entry.texture.key === kind,
      );
      sizes[kind] = sprite?.displayWidth ?? null;
      overhangs[kind] =
        sprite != null
          ? sprite.y +
            sprite.displayHeight / 2 -
            (item.body.position.y + item.body.height / 2)
          : null;
      s.physics.remove(item.body);
      s.items = [];
    }
    s.random = previous;
    return {
      mushroom: caps("mushroom"),
      mushroom3x: caps("mushroom3x"),
      mushroom8x: caps("mushroom8x"),
      oneUp: caps("oneUp"),
      blue3x: exact("mushroom3x", [32, 136, 252]),
      gold8x: exact("mushroom8x", [252, 200, 32]),
      blueOnOneUp: exact("oneUp", [32, 136, 252]),
      blueOn2x: exact("mushroom", [32, 136, 252]),
      sizes,
      overhangs,
    };
  });
  expect(drawn.mushroom.red).toBeGreaterThan(drawn.mushroom.green);
  expect(drawn.mushroom.red).toBeGreaterThan(drawn.mushroom.gold);
  expect(drawn.mushroom.red).toBeGreaterThan(drawn.mushroom.blue);
  expect(drawn.mushroom3x.blue).toBeGreaterThan(drawn.mushroom3x.red);
  expect(drawn.mushroom3x.blue).toBeGreaterThan(drawn.mushroom3x.green);
  expect(drawn.mushroom3x.blue).toBeGreaterThan(drawn.mushroom3x.gold);
  expect(drawn.mushroom8x.gold).toBeGreaterThan(drawn.mushroom8x.red);
  expect(drawn.mushroom8x.gold).toBeGreaterThan(drawn.mushroom8x.blue);
  expect(drawn.oneUp.green).toBeGreaterThan(drawn.oneUp.red);
  expect(drawn.oneUp.green).toBeGreaterThan(drawn.oneUp.blue);
  expect(drawn.blue3x).toBeGreaterThan(0);
  expect(drawn.gold8x).toBeGreaterThan(0);
  expect(drawn.blueOnOneUp).toBe(0);
  expect(drawn.blueOn2x).toBe(0);
  expect(drawn.sizes.mushroom).toBe(32);
  expect(drawn.sizes.mushroom3x).toBe(32);
  expect(drawn.sizes.mushroom8x).toBe(48);
  expect(drawn.sizes.oneUp).toBe(32);
  expect(drawn.overhangs.mushroom8x).toBe(drawn.overhangs.mushroom);
  expect(drawn.overhangs.mushroom3x).toBe(drawn.overhangs.mushroom);
  expect(drawn.overhangs.oneUp).toBe(drawn.overhangs.mushroom);
});

test("player flagpole flag stamps a mushroom and Mario stamps a face in the cloth", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "START GAME" }).click();
  await skipIntro(page);
  await page.waitForFunction(() => !!(window as any).__game?.renderer.play);
  const drawn = await page.evaluate(() => {
    const g = (window as any).__game;
    g.paused = true;
    const s = g.sim;
    const play = g.renderer.play;
    const textures = g.renderer.game.textures.list;
    const pixelsOf = (name: string) => {
      const image = textures[name].getSourceImage() as HTMLCanvasElement;
      return image.getContext("2d")!.getImageData(0, 0, image.width, image.height);
    };
    const mushroom = pixelsOf("mushroom");
    const marioFlag = pixelsOf("marioFlag");
    const mushroomFlag = pixelsOf("mushroomFlag");
    const clothStats = (data: ImageData) => {
      let pole = 0,
        orb = 0,
        clothWhite = 0,
        mushroomRed = 0,
        mushroomCap = 0,
        hat = 0,
        skin = 0,
        oneToOne = 0;
      const w = data.width;
      for (let i = 0; i < data.data.length; i += 4) {
        if (!data.data[i + 3]) continue;
        const x = (i / 4) % w;
        const y = Math.floor(i / 4 / w);
        const r = data.data[i],
          gc = data.data[i + 1],
          b = data.data[i + 2];
        if (x <= 2 && r > 160 && gc < 80 && b < 80) pole++;
        if (y <= 4 && r > 200 && gc > 140 && b < 80) orb++;
        if (x > 2 && r > 200 && gc > 200 && b > 200) clothWhite++;
        if (x > 2 && y >= 5 && r > 160 && gc < 100 && b < 80) mushroomRed++;
        if (x > 2 && y >= 5 && r > 200 && gc > 140 && b < 80) mushroomCap++;
        if (x > 2 && r > 220 && gc < 80 && b < 40) hat++;
        if (x > 2 && r > 220 && gc > 140 && gc < 200 && b > 40 && b < 100) skin++;
        const mx = x - 1;
        const my = y - 1;
        if (
          mx >= 0 &&
          my >= 0 &&
          mx < mushroom.width &&
          my < mushroom.height
        ) {
          const mi = (my * mushroom.width + mx) * 4;
          if (
            mushroom.data[mi + 3] &&
            r === mushroom.data[mi] &&
            gc === mushroom.data[mi + 1] &&
            b === mushroom.data[mi + 2]
          )
            oneToOne++;
        }
      }
      return { pole, orb, clothWhite, mushroomRed, mushroomCap, hat, skin, oneToOne };
    };
    const idle = {
      left: false,
      right: false,
      jump: false,
      down: false,
      fire: false,
      run: false,
    };
    const pole = s.activeRoom.flagpole;
    s.marioReturn = 1e6;
    s.marioActive = false;
    s.player.body.position.x = pole.x;
    s.player.body.position.y = pole.top;
    s.step(1 / 60, idle);
    pole.raise = 1;
    g.renderer.render(s, 0);
    const flagsOf = () =>
      play.effects
        .filter(
          (entry: {
            visible: boolean;
            texture: { key: string };
            displayWidth: number;
            displayHeight: number;
          }) =>
            entry.visible &&
            (entry.texture.key === "mushroomFlag" ||
              entry.texture.key === "marioFlag"),
        )
        .map(
          (entry: {
            texture: { key: string };
            displayWidth: number;
            displayHeight: number;
          }) => ({
            key: entry.texture.key,
            width: entry.displayWidth,
            height: entry.displayHeight,
          }),
        );
    const playerFlags = flagsOf();
    const playerClaim = pole.claim;
    pole.claim = null;
    pole.raise = 0;
    s.player.body.position.x = pole.x - 80;
    s.marioActive = true;
    s.mario.body.frozen = false;
    s.mario.body.position.x = pole.x;
    s.mario.body.position.y = pole.top;
    s.step(1 / 60, idle);
    pole.raise = 1;
    g.renderer.render(s, 0);
    const marioFlags = flagsOf();
    const marioClaim = pole.claim;
    const sheet = document.createElement("canvas");
    sheet.id = "debug-flag-sheet";
    sheet.width = 160;
    sheet.height = 80;
    sheet.style.cssText = "position:fixed;top:100px;left:0;z-index:100";
    const ctx = sheet.getContext("2d")!;
    ctx.fillStyle = "#5c94fc";
    ctx.fillRect(0, 0, 160, 80);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(textures.mushroomFlag.getSourceImage(), 8, 8, 64, 64);
    ctx.drawImage(textures.marioFlag.getSourceImage(), 88, 8, 64, 64);
    document.body.append(sheet);
    return {
      mushroomFlag: clothStats(mushroomFlag),
      marioFlag: clothStats(marioFlag),
      playerClaim,
      playerFlags,
      marioClaim,
      marioFlags,
      hasGoombaFlag: !!textures.goombaFlag,
      sameCanvas:
        textures.mushroomFlag.getSourceImage() ===
        textures.marioFlag.getSourceImage(),
    };
  });
  expect(drawn.sameCanvas).toBe(false);
  expect(drawn.hasGoombaFlag).toBe(false);
  expect(drawn.mushroomFlag.pole).toBeGreaterThan(0);
  expect(drawn.mushroomFlag.orb).toBeGreaterThan(0);
  expect(drawn.mushroomFlag.mushroomRed + drawn.mushroomFlag.mushroomCap).toBeGreaterThan(8);
  expect(drawn.mushroomFlag.clothWhite).toBeGreaterThan(4);
  expect(drawn.mushroomFlag.oneToOne).toBeLessThan(50);
  expect(drawn.marioFlag.pole).toBeGreaterThan(0);
  expect(drawn.marioFlag.orb).toBeGreaterThan(0);
  expect(drawn.marioFlag.hat).toBeGreaterThan(4);
  expect(drawn.marioFlag.skin).toBeGreaterThan(4);
  expect(drawn.playerClaim).toBe("goomba");
  expect(drawn.playerFlags.map((f: { key: string }) => f.key)).toEqual([
    "mushroomFlag",
  ]);
  expect(drawn.playerFlags[0].width).toBe(32);
  expect(drawn.playerFlags[0].height).toBe(32);
  expect(drawn.marioClaim).toBe("mario");
  expect(drawn.marioFlags.map((f: { key: string }) => f.key)).toEqual([
    "marioFlag",
  ]);
  expect(drawn.marioFlags[0].width).toBe(32);
  expect(drawn.marioFlags[0].height).toBe(32);
  await page
    .locator("#debug-flag-sheet")
    .screenshot({ path: "test-results/mushroom-mario-flags.png" });
});

test("Bowser snout, castle axe, and rescue door pixels match the shipped art", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "START GAME" }).click();
  await skipIntro(page);
  await page.waitForFunction(() => !!(window as any).__game?.renderer.play);
  const drawn = await page.evaluate(() => {
    const g = (window as any).__game;
    g.paused = true;
    const textures = g.renderer.game.textures.list;
    const pixelsOf = (name: string) => {
      const image = textures[name].getSourceImage() as HTMLCanvasElement;
      return image.getContext("2d")!.getImageData(0, 0, image.width, image.height);
    };
    const leftmostOpaque = (data: ImageData) => {
      let minX = data.width;
      for (let i = 0; i < data.data.length; i += 4) {
        if (!data.data[i + 3]) continue;
        const x = (i / 4) % data.width;
        if (x < minX) minX = x;
      }
      return minX;
    };
    const snoutYellow = (data: ImageData) => {
      let n = 0;
      for (let i = 0; i < data.data.length; i += 4) {
        if (!data.data[i + 3]) continue;
        const x = (i / 4) % data.width;
        if (x > 8) continue;
        const r = data.data[i],
          gc = data.data[i + 1],
          b = data.data[i + 2];
        if (r > 180 && gc > 140 && b < 80) n++;
      }
      return n;
    };
    const bowser = pixelsOf("bowser");
    const bowserWalk = pixelsOf("bowserWalk");
    const axe = pixelsOf("axe");
    let axeBrown = 0,
      axeGray = 0,
      axePink = 0,
      axeOpaque = 0,
      axeHandle = 0;
    for (let i = 0; i < axe.data.length; i += 4) {
      if (!axe.data[i + 3]) continue;
      axeOpaque++;
      const x = (i / 4) % axe.width;
      const y = Math.floor(i / 4 / axe.width);
      const r = axe.data[i],
        gc = axe.data[i + 1],
        b = axe.data[i + 2];
      if (r > 240 && b > 240 && gc < 100) axePink++;
      if (r > 120 && gc > 50 && gc < 160 && b < 80) axeBrown++;
      if (Math.abs(r - gc) < 25 && Math.abs(gc - b) < 25 && r > 70 && r < 180)
        axeGray++;
      if (y >= 11 && x >= 6 && x <= 9) axeHandle++;
    }
    const metatiles = textures.metatiles;
    const frameOf = (id: number) => {
      const frame = metatiles.get(id);
      const src = metatiles.getSourceImage() as HTMLImageElement;
      const canvas = document.createElement("canvas");
      canvas.width = 16;
      canvas.height = 16;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(src, frame.cutX, frame.cutY, 16, 16, 0, 0, 16, 16);
      return ctx.getImageData(0, 0, 16, 16);
    };
    const castleIndex = 5;
    const door = frameOf(castleIndex * 256 + 74);
    const overworld = frameOf(74);
    const doorColors = new Set<string>();
    let doorGray = 0,
      doorWhite = 0,
      doorBlack = 0;
    for (let i = 0; i < door.data.length; i += 4) {
      const r = door.data[i],
        gc = door.data[i + 1],
        b = door.data[i + 2];
      doorColors.add(`${r},${gc},${b}`);
      if (r === 255 && gc === 255 && b === 255) doorWhite++;
      else if (r === 0 && gc === 0 && b === 0) doorBlack++;
      else if (Math.abs(r - gc) < 8 && Math.abs(gc - b) < 8 && r > 40 && r < 160)
        doorGray++;
    }
    let overworldDark = 0;
    for (let i = 0; i < overworld.data.length; i += 4) {
      const r = overworld.data[i],
        gc = overworld.data[i + 1],
        b = overworld.data[i + 2];
      if ((r + gc + b) / 3 < 40) overworldDark++;
    }
    const s = g.sim;
    s.levelIndex = 3;
    s.reset();
    s.mode = "playing";
    g.renderer.render(s, 0);
    const play = g.renderer.play;
    const axeSprite = play.effects.find(
      (entry: { visible: boolean; texture: { key: string } }) =>
        entry.visible && entry.texture.key === "axe",
    );
    return {
      bowserLeft: leftmostOpaque(bowser),
      walkLeft: leftmostOpaque(bowserWalk),
      bowserSnout: snoutYellow(bowser),
      walkSnout: snoutYellow(bowserWalk),
      axe: {
        brown: axeBrown,
        gray: axeGray,
        pink: axePink,
        opaque: axeOpaque,
        handle: axeHandle,
        width: axe.width,
        height: axe.height,
      },
      door: {
        colors: [...doorColors],
        gray: doorGray,
        white: doorWhite,
        black: doorBlack,
      },
      overworldDark,
      axeDraw: axeSprite
        ? { w: axeSprite.displayWidth, h: axeSprite.displayHeight }
        : null,
      goal: s.activeRoom.data.goal?.kind,
    };
  });
  expect(drawn.bowserLeft).toBe(0);
  expect(drawn.walkLeft).toBe(0);
  expect(drawn.bowserSnout).toBeGreaterThan(8);
  expect(drawn.walkSnout).toBeGreaterThan(8);
  expect(drawn.axe.pink).toBe(0);
  expect(drawn.axe.brown).toBeGreaterThan(8);
  expect(drawn.axe.gray).toBeGreaterThan(8);
  expect(drawn.axe.handle).toBeGreaterThan(3);
  expect(drawn.axe.opaque).toBeLessThan(200);
  expect(drawn.axe.width).toBe(16);
  expect(drawn.axe.height).toBe(16);
  expect(drawn.door.gray).toBe(0);
  expect(drawn.door.white).toBeGreaterThan(200);
  expect(drawn.door.black).toBeGreaterThan(10);
  expect(drawn.door.colors.sort()).toEqual(["0,0,0", "255,255,255"]);
  expect(drawn.overworldDark).toBeGreaterThan(200);
  expect(drawn.goal).toBe("castle-room");
  expect(drawn.axeDraw).toEqual({ w: 32, h: 32 });
});

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
]) {
  test(`render and controls ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/");
    await expect(
      page.getByRole("button", { name: "START GAME" }),
    ).toBeEnabled({ timeout: 15000 });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: `test-results/title-${viewport.width}.png` });
    const colors = await page.locator("canvas").evaluate((canvas) => {
      const source = canvas as HTMLCanvasElement;
      const copy = document.createElement("canvas");
      copy.width = 120;
      copy.height = 80;
      const ctx = copy.getContext("2d")!;
      ctx.drawImage(source, 0, 0, 120, 80);
      const pixels = ctx.getImageData(0, 0, 120, 80).data;
      const unique = new Set<string>();
      for (let i = 0; i < pixels.length; i += 4)
        unique.add(`${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`);
      return unique.size;
    });
    expect(colors).toBeGreaterThan(30);
    await page.getByRole("button", { name: "START GAME" }).click();
  await skipIntro(page);
    await expect(page.getByTestId("score")).toHaveText("000000");
    await expect(page.getByTestId("world")).toHaveText("1-1");
    const before = await page.evaluate(
      () => (window as any).__game.sim.player.body.position.x,
    );
    const pixelsBefore = await page
      .locator("canvas")
      .evaluate((c) => (c as HTMLCanvasElement).toDataURL());
    await page.keyboard.down("ArrowRight");
    await page.waitForFunction(() => {
      const s = (window as any).__game.sim;
      return (
        Math.abs(s.player.body.position.x - s.npcs[0].body.position.x) < 140
      );
    });
    await page.keyboard.up("ArrowRight");
    const after = await page.evaluate(
      () => (window as any).__game.sim.player.body.position.x,
    );
    expect(after).toBeGreaterThan(before + 50);
    expect(
      await page
        .locator("canvas")
        .evaluate((c) => (c as HTMLCanvasElement).toDataURL()),
    ).not.toBe(pixelsBefore);
    await page.evaluate(() => {
      const s = (window as any).__game.sim;
      s.player.body.position.x = s.npcs[0].body.position.x;
      s.player.body.position.y = s.npcs[0].body.position.y;
    });
    await expect(page.locator(".speech")).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => (window as any).__game.sim.warned))
      .toBeGreaterThan(0);
    await page.screenshot({ path: `test-results/game-${viewport.width}.png` });
    await page.getByRole("button", { name: "Pause", exact: true }).click();
    await expect(page.getByRole("heading", { name: "PAUSED" })).toBeVisible();
    const elapsed = await page.evaluate(
      () => (window as any).__game.sim.elapsed,
    );
    await page.waitForTimeout(150);
    expect(await page.evaluate(() => (window as any).__game.sim.elapsed)).toBe(
      elapsed,
    );
    await page
      .getByRole("button", { name: "RESUME", exact: true })
      .last()
      .click();
    await expect(page.getByRole("heading", { name: "PAUSED" })).toBeHidden();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    );
    expect(overflow).toBe(false);
    for (const button of await page.locator(".controls button").all()) {
      const box = (await button.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
      expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
    }
    expect(errors).toEqual([]);
  });
}

test("touch movement supports simultaneous jump and clears on release", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 844, height: 390 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  await page.goto("/");
  await page.getByRole("button", { name: "START GAME" }).tap();
  await skipIntro(page);
  const client = await context.newCDPSession(page);
  const right = (await page
    .getByRole("button", { name: "Right", exact: true })
    .boundingBox())!;
  const jump = (await page
    .getByRole("button", { name: "A", exact: true })
    .boundingBox())!;
  const points = [
    { x: right.x + right.width / 2, y: right.y + right.height / 2, id: 1 },
    { x: jump.x + jump.width / 2, y: jump.y + jump.height / 2, id: 2 },
  ];
  await page.waitForTimeout(200);
  await client.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: points,
  });
  await page.waitForTimeout(160);
  const active = await page.evaluate(() => ({
    ...(window as any).__game.input,
    y: (window as any).__game.sim.player.body.position.y,
  }));
  expect(active.right).toBe(true);
  expect(active.jump).toBe(true);
  expect(active.y).toBeLessThan(405);
  // Exercise a long two-finger hold, beyond the browser's long-press threshold.
  await page.waitForTimeout(1000);
  expect(await page.evaluate(() => (window as any).__game.input.right)).toBe(
    true,
  );
  expect(await page.evaluate(() => (window as any).__game.input.jump)).toBe(
    true,
  );
  await client.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  expect(await page.evaluate(() => (window as any).__game.input.right)).toBe(
    false,
  );
  expect(await page.evaluate(() => (window as any).__game.input.jump)).toBe(
    false,
  );
  await context.close();
});

test("player bubble is 8-bit and warned NPCs flash a tiny unscaled sweat drop", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "START GAME" }).click();
  await skipIntro(page);
  await page.waitForFunction(() => !!(window as any).__game?.sim);
  await page.evaluate(() => {
    (window as any).readSweatMark = (play: any, game: any) => {
      const bang = play.effects.some(
        (e: any) => e.visible && e.texture.key === "exclaim",
      );
      if (bang) throw new Error("white bang still visible");
      const mark = play.effects.find(
        (e: any) => e.visible && e.texture.key === "sweatDrop",
      );
      if (!mark) return null;
      const src = game.textures.get(mark.texture.key).getSourceImage();
      const canvas = document.createElement("canvas");
      canvas.width = src.width;
      canvas.height = src.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(src, 0, 0);
      const data = ctx.getImageData(0, 0, src.width, src.height).data;
      let dark = 0,
        cyan = 0,
        white = 0,
        opaque = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (!data[i + 3]) continue;
        opaque++;
        const r = data[i],
          g = data[i + 1],
          b = data[i + 2];
        if ((r + g + b) / 3 < 40) dark++;
        if (b > r + 20 && g > 180) cyan++;
        if (r > 250 && g > 250 && b > 250) white++;
      }
      return {
        key: mark.texture.key,
        x: mark.x,
        y: mark.y,
        displayWidth: mark.displayWidth,
        displayHeight: mark.displayHeight,
        sourceWidth: src.width,
        sourceHeight: src.height,
        dark,
        cyan,
        allWhiteOpaque: opaque > 0 && white === opaque,
      };
    };
  });
  await page.evaluate((range) => {
    const s = (window as any).__game.sim;
    const n = s.npcs[0];
    s.player.body.position.x = n.body.position.x - range + 8;
    s.player.body.position.y = n.body.position.y;
  }, T.warningRange);
  const speech = page.locator(".speech");
  await expect(speech).toBeVisible();
  const style = await speech.evaluate((el) => {
    const c = getComputedStyle(el);
    const after = getComputedStyle(el, ":after");
    return {
      bg: c.backgroundColor,
      border: c.borderTopWidth,
      shadow: c.boxShadow,
      color: c.color,
      family: c.fontFamily.toLowerCase(),
      textShadow: c.textShadow,
      afterContent: after.content,
      afterDisplay: after.display,
    };
  });
  expect(style.bg.replace(/\s/g, "")).toMatch(
    /^(transparent|rgba\(0,0,0,0\))$/,
  );
  expect(parseFloat(style.border) || 0).toBe(0);
  expect(style.shadow).toBe("none");
  expect(style.color).toBe("rgb(255, 255, 255)");
  expect(style.family).toContain("press start");
  expect(style.textShadow).not.toBe("none");
  expect(style.textShadow).toMatch(/rgb\(0,\s*0,\s*0\)|#000/i);
  expect(style.afterContent === "none" || style.afterDisplay === "none").toBe(
    true,
  );
  await expect
    .poll(() =>
      page.evaluate(() => {
        const play = (window as any).__game.renderer.play;
        const standingYellow = play.effects.some(
          (e: {
            visible: boolean;
            texture: { key: string };
            displayWidth: number;
            displayHeight: number;
          }) =>
            e.visible &&
            e.texture.key === "__WHITE" &&
            e.displayWidth === 5 &&
            e.displayHeight === 5,
        );
        return {
          mark: (window as any).readSweatMark(
            play,
            (window as any).__game.renderer.game,
          ),
          standingYellow,
        };
      }),
    )
    .toMatchObject({ standingYellow: false, mark: expect.anything() });
  const first = await page.evaluate(() =>
    (window as any).readSweatMark(
      (window as any).__game.renderer.play,
      (window as any).__game.renderer.game,
    ),
  );
  expect(first).toBeTruthy();
  expect(first!.key).not.toBe("exclaim");
  expect(first!.sourceWidth).toBeLessThanOrEqual(6);
  expect(first!.sourceHeight).toBeLessThanOrEqual(8);
  expect(first!.displayWidth).toBeLessThanOrEqual(16);
  expect(first!.displayHeight).toBeLessThanOrEqual(16);
  expect(first!.displayWidth).toBe(first!.sourceWidth * 2);
  expect(first!.displayHeight).toBe(first!.sourceHeight * 2);
  expect(first!.dark).toBeGreaterThan(0);
  expect(first!.cyan).toBeGreaterThan(0);
  expect(first!.allWhiteOpaque).toBe(false);
  const aboveHead = await page.evaluate(() => {
    const g = (window as any).__game;
    const n = g.sim.npcs[0];
    const mark = (window as any).readSweatMark(g.renderer.play, g.renderer.game);
    const sprite = g.renderer.play.actors.get(n.id);
    return mark.y + mark.displayHeight / 2 <= sprite.y - sprite.displayHeight;
  });
  expect(aboveHead).toBe(true);
  for (const scale of [2, 3, 8]) {
    const sized = await page.evaluate((scale) => {
      const g = (window as any).__game;
      g.paused = true;
      const n = g.sim.npcs[0];
      n.scale = scale;
      n.exclaimLeft = 0.7;
      n.alive = true;
      n.saved = false;
      g.renderer.play.renderState(g.sim, g.renderer.width);
      const mark = (window as any).readSweatMark(
        g.renderer.play,
        g.renderer.game,
      );
      const sprite = g.renderer.play.actors.get(n.id);
      return {
        mark,
        aboveHead:
          mark &&
          mark.y + mark.displayHeight / 2 <= sprite.y - sprite.displayHeight,
      };
    }, scale);
    expect(sized.mark?.displayWidth).toBe(first!.displayWidth);
    expect(sized.mark?.displayHeight).toBe(first!.displayHeight);
    expect(sized.mark?.key).toBe(first!.key);
    expect(sized.aboveHead).toBe(true);
  }
  expect(
    await page.evaluate(() => {
      const g = (window as any).__game;
      g.paused = true;
      for (const a of g.sim.npcs) a.exclaimLeft = 0;
      const n = g.sim.npcs.find((a: { kind: string }) => a.kind === "koopa");
      if (!n) return null;
      n.exclaimLeft = 0.7;
      n.alive = true;
      n.saved = false;
      g.renderer.play.renderState(g.sim, g.renderer.width);
      const mark = (window as any).readSweatMark(
        g.renderer.play,
        g.renderer.game,
      );
      const sprite = g.renderer.play.actors.get(n.id);
      n.exclaimLeft = 0;
      return {
        aboveHead:
          !!mark &&
          mark.y + mark.displayHeight / 2 <= sprite.y - sprite.displayHeight,
        displayWidth: mark?.displayWidth,
      };
    }),
  ).toMatchObject({ aboveHead: true, displayWidth: first!.displayWidth });
  expect(
    await page.evaluate(() => {
      const g = (window as any).__game;
      g.paused = true;
      const n = g.sim.npcs[0];
      n.scale = 1;
      n.exclaimLeft = 0.7;
      n.alive = true;
      n.saved = true;
      g.renderer.play.renderState(g.sim, g.renderer.width);
      const saved = (window as any).readSweatMark(
        g.renderer.play,
        g.renderer.game,
      );
      n.saved = false;
      n.alive = false;
      g.renderer.play.renderState(g.sim, g.renderer.width);
      const dead = (window as any).readSweatMark(
        g.renderer.play,
        g.renderer.game,
      );
      n.alive = true;
      n.exclaimLeft = 0;
      g.renderer.play.renderState(g.sim, g.renderer.width);
      const spent = (window as any).readSweatMark(
        g.renderer.play,
        g.renderer.game,
      );
      n.exclaimLeft = 0.7;
      g.paused = false;
      return { saved, dead, spent };
    }),
  ).toEqual({ saved: null, dead: null, spent: null });
  await expect
    .poll(() =>
      page.evaluate(() => {
        const g = (window as any).__game;
        return (
          g.sim.npcs[0].exclaimLeft === 0 &&
          !(window as any).readSweatMark(g.renderer.play, g.renderer.game)
        );
      }),
    )
    .toBe(true);
  await page.evaluate(() => {
    const s = (window as any).__game.sim;
    for (const n of s.npcs) n.warned = true;
    s.shouts = [];
    s.warn();
    s.warn();
  });
  await expect(speech).toHaveCount(2);
  await expect(page.locator(".speech-stack")).toHaveCount(1);
  const boxes = await Promise.all(
    (await speech.all()).map((el) => el.boundingBox()),
  );
  expect(boxes[0]).toBeTruthy();
  expect(boxes[1]).toBeTruthy();
  const a = boxes[0]!;
  const b = boxes[1]!;
  expect(a.y < b.y + b.height && b.y < a.y + a.height).toBe(false);
  // Stacked phrases are centered, so left edges diverge with line length.
  expect(Math.abs(a.x + a.width / 2 - (b.x + b.width / 2))).toBeLessThan(48);
  expect(Math.abs(a.y - b.y)).toBeGreaterThan(8);
  const stackLeft = await page
    .locator(".speech-stack")
    .evaluate((el) => el.style.left);
  await page.evaluate(() => {
    const s = (window as any).__game.sim;
    s.player.body.position.x += 400;
  });
  await expect
    .poll(async () =>
      page.locator(".speech-stack").evaluate((el) => el.style.left),
    )
    .not.toBe(stackLeft);
  await page.evaluate(() => {
    const s = (window as any).__game.sim;
    for (const n of s.npcs) n.warned = true;
    s.shouts = [
      { id: 9001, text: "LOW", left: 2, x: 220, y: 400 },
      { id: 9002, text: "HIGH", left: 2, x: 220, y: 280 },
    ];
  });
  const stacks = page.locator(".speech-stack");
  await expect(stacks).toHaveCount(2);
  const tops = await stacks.evaluateAll((els) =>
    els.map((el) => (el as HTMLElement).style.top),
  );
  expect(tops[0]).not.toBe(tops[1]);
});

test("death restart, open castle door, tally, and no finish banner", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "START GAME" }).click();
  await skipIntro(page);
  await page.waitForFunction(
    () => (window as any).__game.audio.buffers.size === 23,
  );
  await page.evaluate(() => {
    const s = (window as any).__game.sim;
    s.kill(s.player);
  });
  await expect
    .poll(() =>
      page.evaluate(() => {
        const g = (window as any).__game;
        return {
          mode: g.sim.mode,
          deathCue: [...g.audio.effects].some(
            (source: any) => source.audioBuffer === g.audio.buffers.get("death"),
          ),
        };
      }),
    )
    .toEqual({ mode: "dead", deathCue: true });
  await expect(page.getByRole("heading", { name: "STOMPED!" })).toHaveCount(0);
  await page.waitForFunction(() => {
    const mode = (window as any).__game.sim.mode;
    return mode === "intro" || mode === "playing";
  });
  await skipIntro(page);
  await expect(page.getByTestId("score")).toHaveText("000000");
  await expect(page.getByText("TOO MANY LOST. THE GOAL IS LOCKED.")).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.getByRole("button", { name: "RESTART LEVEL" }).click();
  await skipIntro(page);
  await page.evaluate(() => {
    const s = (window as any).__game.sim;
    s.timeLeft = 0;
    s.finish();
  });
  await expect(page.locator(".finish-banner")).toHaveCount(0);
  await expect(page.getByText("CASTLE REACHED")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "NEXT LEVEL" })).toHaveCount(0);
  await expect(page.locator(".tally")).toBeVisible();
  await expect(page.getByRole("button", { name: "Key bindings" })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { name: "PAUSED" })).toHaveCount(0);
  await page.screenshot({ path: "test-results/victory.png" });
  await page.getByRole("button", { name: "Mute", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Unmute", exact: true }),
  ).toBeVisible();
});

test("HUD coin counter increases on collection and persists across restart and next stage", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "START GAME" }).click();
  await skipIntro(page);
  const coins = page.getByTestId("coins");
  const score = page.getByTestId("score");
  const hud = page.locator(".smb-hud");
  await expect(coins).toHaveText("00");
  await expect(score).toHaveText("000000");
  await expect(page.getByTestId("world")).toHaveText("1-1");
  await expect(page.getByTestId("time")).toBeVisible();
  await expect(hud).toContainText("GOOMBA");
  await expect(hud).toContainText("COINS");
  await expect(hud).not.toContainText("Ⓒ");
  await expect(page.locator(".smb-coins-spacer")).toHaveCount(0);
  await expect(page.locator(".power-state")).toHaveCount(0);
  const coinsCell = hud.locator(":scope > div").filter({ has: coins });
  await expect(coinsCell.locator("span")).toHaveText("COINS");
  await expect(coinsCell.locator("strong")).toHaveText("00");
  const labelBox = (await coinsCell.locator("span").boundingBox())!;
  const valueBox = (await coins.boundingBox())!;
  expect(labelBox.y + labelBox.height).toBeLessThanOrEqual(valueBox.y + 1);
  const cellBoxes = [];
  for (const cell of await hud.locator(":scope > div").all())
    cellBoxes.push((await cell.boundingBox())!);
  expect(cellBoxes).toHaveLength(4);
  const cellTops = cellBoxes.map((box) => box.y);
  expect(Math.max(...cellTops) - Math.min(...cellTops)).toBeLessThan(8);
  await expect(page.locator(".phase")).toHaveCount(0);
  await expect(page.getByTestId("lives")).toHaveCount(0);
  expect(valueBox.y).toBeLessThan(80);
  const collect = () =>
    page.evaluate(() => {
      const s = (window as any).__game.sim;
      s.marioReturn = 1e6;
      const room = s.loadRoom("42");
      const coin = room.coins.find((c: any) => !c.collected);
      if (!coin) throw new Error("no uncollected coin");
      const p = s.player.body.position;
      coin.x = p.x;
      coin.y = p.y;
    });
  await collect();
  await expect.poll(() => coins.textContent()).toBe("01");
  await expect.poll(() => score.textContent()).toBe("000200");
  expect(
    await page.evaluate(() => {
      const s = (window as any).__game.sim;
      return {
        coins: s.coins,
        score: s.score,
        warned: s.warned,
        saved: s.saved,
        died: s.died(),
      };
    }),
  ).toEqual({ coins: 1, score: 200, warned: 0, saved: 0, died: 0 });
  await collect();
  await expect.poll(() => coins.textContent()).toBe("02");
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.getByRole("button", { name: "RESTART LEVEL" }).click();
  await skipIntro(page);
  await expect(coins).toHaveText("02");
  await collect();
  await expect.poll(() => coins.textContent()).toBe("03");
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.sim.timeLeft = 0;
    g.sim.finish();
  });
  await expect(page.getByRole("button", { name: "NEXT LEVEL" })).toHaveCount(0);
  await page.waitForFunction(() => {
    const s = (window as any).__game.sim;
    if (s.mode === "finishing") s.tallyHold = 0;
    return s.level.id === "1-2";
  });
  await expect(page.getByTestId("coins")).toHaveText("03");
  await expect(page.getByTestId("world")).toHaveText("1-2");
});

test("castle tally Died line tracks NPC deaths only and resets on the next stage", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "START GAME" }).click();
  await skipIntro(page);
  await page.evaluate(() => {
    const s = (window as any).__game.sim;
    s.npcs[0].warned = true;
    s.warned = 1;
    s.kill(s.npcs[0]);
    s.kill(s.npcs[1]);
    s.kill(s.npcs[2]);
    s.save(s.npcs[3]);
  });
  expect(
    await page.evaluate(() => {
      const s = (window as any).__game.sim;
      return { died: s.died(), warned: s.warned, saved: s.saved };
    }),
  ).toEqual({ died: 3, warned: 1, saved: 1 });
  await page.evaluate(() => {
    const s = (window as any).__game.sim;
    s.kill(s.player);
  });
  await expect(page.getByRole("heading", { name: "STOMPED!" })).toHaveCount(0);
  await page.waitForFunction(() => {
    const mode = (window as any).__game.sim.mode;
    return mode === "intro" || mode === "playing";
  });
  await skipIntro(page);
  expect(
    await page.evaluate(() => {
      const s = (window as any).__game.sim;
      return { died: s.died(), warned: s.warned, saved: s.saved };
    }),
  ).toEqual({ died: 0, warned: 0, saved: 0 });
  await page.evaluate(() => {
    const s = (window as any).__game.sim;
    s.kill(s.npcs[0]);
    s.kill(s.npcs[1]);
    s.save(s.npcs[2]);
    s.timeLeft = 0;
    s.finish();
  });
  await expect(page.getByTestId("tally-died")).toContainText("02");
  await expect(page.getByRole("button", { name: "NEXT LEVEL" })).toHaveCount(0);
  await page.waitForFunction(() => {
    const s = (window as any).__game.sim;
    if (s.mode === "finishing") s.tallyHold = 0;
    return s.level.id === "1-2";
  });
  expect(
    await page.evaluate(() => {
      const s = (window as any).__game.sim;
      return { died: s.died(), saved: s.saved, warned: s.warned };
    }),
  ).toEqual({ died: 0, saved: 0, warned: 0 });
});

test("standalone production HTML runs without a server or external assets", async ({
  page,
}) => {
  const errors: string[] = [];
  const network: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (/^https?:/.test(r.url())) network.push(r.url());
  });
  await page.goto(pathToFileURL(resolve("dist/index.html")).href);
  await page.getByRole("button", { name: "START GAME" }).click();
  await expect(page.getByTestId("score")).toHaveText("000000");
  expect(await page.evaluate(() => "__game" in window)).toBe(false);
  expect(errors).toEqual([]);
  expect(network).toEqual([]);
});

test("background music produces audio, pauses, and mutes", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "START GAME" }).click();
  await skipIntro(page);
  await page.evaluate(() => {
    const game = (window as any).__game;
    game.sim.marioReturn = 1000;
    const analyser = game.audio.context.createAnalyser();
    analyser.fftSize = 2048;
    game.audio.masterGain.connect(analyser);
    (window as any).__musicAnalyser = analyser;
  });
  const level = () =>
    page.evaluate(() => {
      const analyser = (window as any).__musicAnalyser;
      const data = new Float32Array(analyser.fftSize);
      analyser.getFloatTimeDomainData(data);
      return Math.max(...data.map(Math.abs));
    });
  await expect.poll(level).toBeGreaterThan(0.001);
  await page.getByRole("button", { name: "Mute", exact: true }).click();
  await expect.poll(level).toBe(0);
  await page.getByRole("button", { name: "Unmute", exact: true }).click();
  await expect.poll(level).toBeGreaterThan(0.001);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const a = (window as any).__game.audio;
        return (
          a.music.isPaused &&
          [...a.effects].some(
            (source: any) =>
              source.audioBuffer === a.buffers.get("pause") &&
              source.isPlaying &&
              !source.isPaused,
          )
        );
      }),
    )
    .toBe(true);
  await expect.poll(level).toBeGreaterThan(0.001);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const a = (window as any).__game.audio;
        return ![...a.effects].some(
          (source: any) => source.audioBuffer === a.buffers.get("pause"),
        );
      }),
    )
    .toBe(true);
  await expect.poll(level).toBe(0);
  await page.getByRole("button", { name: "RESUME", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const a = (window as any).__game.audio;
        return (
          a.music.isPlaying &&
          [...a.effects].some(
            (source: any) =>
              source.audioBuffer === a.buffers.get("pause") &&
              source.isPlaying &&
              !source.isPaused,
          )
        );
      }),
    )
    .toBe(true);
  await expect.poll(level).toBeGreaterThan(0.001);
});

test("original recordings decode and play as effects, with level clear replacing music", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "START GAME" }).click();
  await skipIntro(page);
  await page.waitForFunction(
    () => (window as any).__game.audio.buffers.size === 23,
  );
  await page.waitForFunction(
    () => !!(window as any).__game?.audio?.music?.markers?.loop,
  );
  const playback = await page.evaluate(() => {
    const a = (window as any).__game.audio;
    const effects = [
      "jump",
      "saved",
      "pipe",
      "fire",
      "break",
      "power",
      "splat",
      "appear",
      "kick",
      "firework",
    ];
    const names = [
      "jump",
      "coin",
      "pipe",
      "fireball",
      "brick",
      "powerup",
      "stomp",
      "appear",
      "kick",
      "fireworks",
    ];
    const valid = effects.every((event, i) => {
      a.event(event);
      return [...a.effects].some(
        (source: any) => source.audioBuffer === a.buffers.get(names[i]),
      );
    });
    a.event("warn");
    const s = (window as any).__game.sim;
    const box = s.obstacles.find((c: any) => c.question && !c.used);
    const previous = s.random;
    s.random = () => 0.5;
    s.hitBlock(box, s.player);
    s.random = previous;
    const released = s.events.slice();
    for (const event of s.events.splice(0)) a.event(event);
    const bumpAndAppear =
      released.includes("bump") &&
      released.includes("appear") &&
      [...a.effects].some(
        (source: any) => source.audioBuffer === a.buffers.get("bump"),
      ) &&
      [...a.effects].some(
        (source: any) => source.audioBuffer === a.buffers.get("appear"),
      );
    s.collect(s.player, s.items[0]);
    for (const event of s.events.splice(0)) a.event(event);
    const powerPlaying = [...a.effects].some(
      (source: any) => source.audioBuffer === a.buffers.get("powerup"),
    );
    const duration = a.buffers.get("overworld").duration;
    const loop = a.music.markers.loop.duration;
    const pauseDuration = a.buffers.get("pause").duration;
    const appearDuration = a.buffers.get("appear").duration;
    (window as any).__game.sim.finish();
    a.event("win");
    return {
      valid,
      duration,
      loop,
      pauseDuration,
      appearDuration,
      bumpAndAppear,
      powerPlaying,
      musicStopped: a.music === null,
      clearPlaying: [...a.effects].some(
        (source: any) => source.audioBuffer === a.buffers.get("clear"),
      ),
    };
  });
  expect(playback.valid).toBe(true);
  expect(playback.duration).toBeGreaterThan(180);
  expect(playback.loop).toBeCloseTo(86.4);
  expect(playback.pauseDuration).toBeGreaterThan(0.5);
  expect(playback.pauseDuration).toBeLessThan(1);
  expect(playback.appearDuration).toBeGreaterThan(0.4);
  expect(playback.appearDuration).toBeLessThan(1);
  expect(playback.bumpAndAppear).toBe(true);
  expect(playback.powerPlaying).toBe(true);
  expect(playback.musicStopped).toBe(true);
  expect(playback.clearPlaying).toBe(true);
});

test("game text and controls cannot be selected by dragging", async ({
  page,
}) => {
  await page.goto("/");
  const title = (await page
    .getByRole("heading", { name: "Super Goomba Bros" })
    .boundingBox())!;
  await page.mouse.move(title.x, title.y + title.height / 2);
  await page.mouse.down();
  await page.mouse.move(title.x + title.width, title.y + title.height / 2, {
    steps: 12,
  });
  await page.mouse.up();
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe("");
  await page.getByRole("button", { name: "START GAME" }).click();
  await skipIntro(page);
  for (const selector of [".counters", ".brand img"]) {
    expect(
      await page
        .locator(selector)
        .evaluate((el) => getComputedStyle(el).userSelect),
    ).toBe("none");
  }
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe("");
});

test("Fire Mario uses the SMB1 palette on idle, walk, skid, and jump", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "START GAME" }).click();
  await skipIntro(page);
  await page.waitForFunction(() => !!(window as any).__game?.renderer.play);
  const drawn = await page.evaluate(() => {
    const g = (window as any).__game;
    g.paused = true;
    const s = g.sim;
    const play = g.renderer.play;
    const textures = g.renderer.game.textures.list;
    const poses = [
      "fireMario",
      "fireMarioWalk",
      "fireMarioWalk2",
      "fireMarioWalk3",
      "fireMarioSkid",
      "fireMarioJump",
    ];
    const missing = poses.filter((name) => !textures[name]);
    const whiteKeys = Object.keys(textures).filter((key) =>
      key.startsWith("whiteMario"),
    );
    const palette = (name: string) => {
      const image = textures[name].getSourceImage() as HTMLCanvasElement;
      const data = image
        .getContext("2d")!
        .getImageData(0, 0, image.width, image.height).data;
      let opaque = 0,
        cream = 0,
        white = 0,
        red = 0,
        flat = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (!data[i + 3]) continue;
        opaque++;
        const r = data[i],
          gc = data[i + 1],
          b = data[i + 2];
        if (r > 240 && gc > 200 && b > 140 && b < 220) cream++;
        if (r > 200 && gc > 200 && b > 200) white++;
        if (r > 180 && gc < 140 && b < 80) red++;
        if (r === 252 && gc === 252 && b === 252) flat++;
      }
      return { opaque, cream, white, red, flat };
    };
    const palettes = Object.fromEntries(poses.map((pose) => [pose, palette(pose)]));
    s.marioActive = true;
    s.marioDeath = null;
    s.mario.alive = true;
    s.mario.saved = false;
    s.setMarioStage(2);
    s.marioStun = 0;
    s.mario.starLeft = 0;
    s.mario.pipeTravel = null;
    s.mario.grounded = true;
    s.mario.body.velocity.x = 0;
    s.marioChase = 0;
    s.marioReaction = 0;
    g.renderer.render(s, 0);
    const sprite = play.actors.get(s.mario.id);
    const idle = sprite.texture.key;
    s.mario.body.velocity.x = 80;
    g.renderer.render(s, 0);
    const walk = {
      texture: sprite.texture.key,
      anim: sprite.anims?.currentAnim?.key ?? null,
    };
    s.marioChase = 1;
    s.marioAim = s.mario.body.position.x - 100;
    g.renderer.render(s, 0);
    const skid = sprite.texture.key;
    s.marioChase = 0;
    s.mario.grounded = false;
    s.mario.body.velocity.x = 0;
    g.renderer.render(s, 0);
    const jump = sprite.texture.key;
    s.player.flower = true;
    s.player.alive = true;
    s.player.saved = false;
    s.playerDeath = null;
    s.player.grounded = true;
    s.player.body.velocity.x = 0;
    s.player.pipeTravel = null;
    g.renderer.render(s, 0);
    const player = play.actors.get(s.player.id);
    return {
      missing,
      whiteKeys,
      palettes,
      fireGoomba: palette("fireGoomba"),
      fireKoopa: palette("fireKoopa"),
      idle,
      walk,
      skid,
      jump,
      playerFlower: player.texture.key,
      hasFireWalkAnim: play.anims.exists("fireMario-walk"),
      hasWhiteWalkAnim: play.anims.exists("whiteMario-walk"),
    };
  });
  expect(drawn.missing).toEqual([]);
  expect(drawn.whiteKeys).toEqual([]);
  expect(drawn.hasFireWalkAnim).toBe(true);
  expect(drawn.hasWhiteWalkAnim).toBe(false);
  for (const pose of [
    "fireMario",
    "fireMarioWalk",
    "fireMarioWalk2",
    "fireMarioWalk3",
    "fireMarioSkid",
    "fireMarioJump",
  ] as const) {
    const pal = drawn.palettes[pose];
    expect(pal.red, pose).toBeGreaterThan(20);
    expect(pal.cream, pose).toBeGreaterThan(20);
    expect(pal.flat / pal.opaque, pose).toBeLessThan(0.2);
  }
  expect(drawn.idle).toBe("fireMario");
  expect(drawn.walk.anim).toBe("fireMario-walk");
  expect(drawn.skid).toBe("fireMarioSkid");
  expect(drawn.jump).toBe("fireMarioJump");
  expect(drawn.playerFlower).toBe("fireGoomba");
  expect(drawn.fireGoomba.white).toBeGreaterThan(drawn.fireGoomba.red);
  expect(drawn.fireKoopa.white).toBeGreaterThan(drawn.fireKoopa.red);
});

test("pixel sprite poses render at native proportions", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => !!(window as any).__game?.renderer.play);
  const count = await page.evaluate(() => {
    const textures = (window as any).__game.renderer.game.textures.list;
    const names = [
      "goomba",
      "goombaWalk",
      "koopa",
      "koopaWalk",
      "koopaShell",
      "koopaShellWake",
      "mario",
      "marioWalk",
      "marioJump",
      "fireMario",
    ];
    const canvas = document.createElement("canvas");
    canvas.id = "debug-sprite-sheet";
    canvas.width = 800;
    canvas.height = 160;
    canvas.style.cssText = "position:fixed;top:100px;left:0;z-index:100";
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#7dc9d1";
    ctx.fillRect(0, 0, 800, 160);
    ctx.imageSmoothingEnabled = false;
    names.forEach((name, i) => {
      const image = textures[name].getSourceImage();
      if (image.width !== 16) throw new Error(`Invalid sprite width: ${name}`);
      ctx.drawImage(
        image,
        i * 80 + 8,
        144 - image.height * 4,
        64,
        image.height * 4,
      );
    });
    document.body.append(canvas);
    return names.length;
  });
  expect(count).toBe(10);
  await page
    .locator("#debug-sprite-sheet")
    .screenshot({ path: "test-results/sprite-poses.png" });
});

test("NES scenery, solid pipes, brick debris, and blood are visible together", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: "START GAME" }).click();
  await skipIntro(page);
  const effect = await page.evaluate(() => {
    const game = (window as any).__game;
    game.paused = true;
    const s = game.sim;
    s.marioReturn = 1e6;
    const input = {
      left: false,
      right: true,
      jump: false,
      down: false,
    };
    for (let i = 0; i < 400 && s.player.body.position.x < 1080; i++)
      s.step(1 / 60, input);
    const n = [...s.npcs]
      .filter((a: any) => a.alive && !a.saved)
      .sort(
        (a: any, b: any) =>
          Math.abs(a.body.position.x - s.player.body.position.x) -
          Math.abs(b.body.position.x - s.player.body.position.x),
      )[0];
    s.kill(n);
    const brick = s.obstacles.find(
      (c: any) => c.kind === "brick" && c.x === 784,
    );
    s.breakBrick(brick);
    input.right = false;
    for (let i = 0; i < 10; i++) s.step(1 / 60, input);
    return {
      particles: s.particles.length,
      bricks: s.obstacles.filter((c: any) => c.broken).length,
    };
  });
  expect(effect.particles).toBeGreaterThan(32);
  expect(effect.bricks).toBe(1);
  await page.waitForTimeout(150);
  await page.screenshot({ path: "test-results/chaos-scenery.png" });
  const red = await page.locator(".world canvas").evaluate((el) => {
    const c = document.createElement("canvas");
    c.width = 1440;
    c.height = 900;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(el as HTMLCanvasElement, 0, 0, 1440, 900);
    const data = ctx.getImageData(0, 0, 1440, 900).data;
    let pixels = 0;
    for (let i = 0; i < data.length; i += 4)
      if (
        data[i] > 150 &&
        data[i + 1] < 45 &&
        data[i + 2] > 10 &&
        data[i + 2] < 70
      )
        pixels++;
    return pixels;
  });
  expect(red).toBeGreaterThan(100);
  const sceneryHasNoBrickOverlays = await page.evaluate(() => {
    const g = (window as any).__game;
    return g.sim.obstacles
      .filter((c: any) => c.kind !== "brick")
      .every((c: any) => !g.renderer.play.obstacles.has(c.id));
  });
  expect(sceneryHasNoBrickOverlays).toBe(true);
});

test("a vertically swimming fish keeps its walk animation running", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "START GAME" }).click();
  await skipIntro(page);
  const waterStage = campaign.levels.findIndex((level) => level.id === "2-2");
  expect(waterStage).toBeGreaterThanOrEqual(0);
  const swim = await page.evaluate((waterStage) => {
    const g = (window as any).__game,
      s = g.sim;
    g.paused = true;
    s.levelIndex = waterStage;
    s.reset();
    const fish = s.npcs.find(
      (n: { kind: string; flower: boolean }) => n.kind === "fish" && !n.flower,
    );
    if (!fish) return null;
    fish.alive = true;
    fish.saved = false;
    fish.grounded = false;
    s.player.body.position.x = fish.body.position.x;
    const sample = (vx: number, vy: number) => {
      fish.body.velocity.x = vx;
      fish.body.velocity.y = vy;
      g.renderer.render(s, 0);
      const sprite = g.renderer.play.actors.get(fish.id);
      return {
        anim: sprite.anims?.currentAnim?.key ?? null,
        playing: !!sprite.anims?.isPlaying,
        timeScale: sprite.anims?.timeScale ?? 0,
      };
    };
    return {
      vertical: sample(0, -1.5),
      horizontal: sample(1.5, 0),
      diagonal: sample(0.9, -1.2),
    };
  }, waterStage);
  expect(swim).not.toBeNull();
  expect(swim!.vertical.anim).toBe("fish-walk");
  expect(swim!.vertical.playing).toBe(true);
  expect(swim!.vertical.timeScale).toBeCloseTo(swim!.horizontal.timeScale, 5);
  expect(swim!.vertical.timeScale).toBeGreaterThan(0);
  expect(swim!.diagonal.timeScale).toBeCloseTo((1.5 * 60) / 90, 5);
});

test("original 1-1 map art and collision anchors agree", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "START GAME" }).click();
  await skipIntro(page);
  const map = await page.evaluate(() => {
    const game = (window as any).__game;
    const textures = game.renderer.game.textures.list;
    const atlas = textures.metatiles;
    const tiles = atlas.getFrameNames();
    return {
      noBackdrop: !textures.world,
      tiles: tiles.length,
      native: tiles.every(
        (k: string) =>
          atlas.frames[k].cutWidth === 16 && atlas.frames[k].cutHeight === 16,
      ),
      instances: game.renderer.play.tiles.layer.data
        .flat()
        .filter((tile: any) => tile.index >= 0).length,
      pipe: game.sim.obstacles.find((c: any) => c.kind === "pipe").body.bounds,
      question: game.sim.obstacles.find((c: any) => c.question && c.x === 528)
        .body.bounds,
    };
  });
  expect(map.noBackdrop).toBe(true);
  expect(map.tiles).toBeGreaterThan(20);
  expect(map.native).toBe(true);
  expect(map.instances).toBeGreaterThan(500);
  expect(map.pipe.min).toEqual({ x: 896, y: 366 });
  expect(map.pipe.max).toEqual({ x: 960, y: 430 });
  expect(map.question.min).toEqual({ x: 512, y: 302 });
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.paused = true;
    g.sim.player.body.position.x = 6120;
  });
  await page.waitForTimeout(150);
  await page.screenshot({ path: "test-results/world-1-1-finish.png" });
});
