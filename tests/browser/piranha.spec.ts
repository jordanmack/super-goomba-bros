import campaign from "../../src/assets/levels/campaign.json" with { type: "json" };
import { test, expect, skipIntro } from "./skip-intro.ts";

test("a Piranha Plant draws behind the pipe tiles in its area's colors", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "START GAME" }).click();
  await skipIntro(page);
  const land = campaign.levels.findIndex((level) => level.id === "2-2");
  const cave = campaign.levels.findIndex((level) => level.id === "1-2");
  const drawn = await page.evaluate(
    ({ land, cave }) => {
      const g = (window as any).__game;
      const s = g.sim;
      g.paused = true;
      const plants = () =>
        g.renderer.play.effects
          .filter(
            (e: any) => e.visible && String(e.texture.key).startsWith("piranha"),
          )
          .map((e: any) => ({
            key: e.texture.key,
            depth: e.depth,
            size: [e.displayWidth, e.displayHeight],
            x: e.x,
            y: e.y,
          }));
      const show = (areaId: string, column: number, frame: number) => {
        const room = s.loadRoom(areaId);
        const plant = room.plants.find((p: any) => p.column === column);
        s.player.areaId = areaId;
        s.player.body.position.x = plant.x - 200;
        s.frame = frame;
        return { room, plant };
      };
      s.levelIndex = land;
      s.reset();
      s.marioReturn = 1e6;
      const { plant } = show("25", 28, 0);
      plant.motion = { rise: 24, speed: -1, moving: false, timer: 40 };
      g.renderer.render(s, 0);
      const up = plants().find((p: any) => Math.abs(p.x - plant.x) < 1);
      const tiles = g.renderer.play.tiles.depth;
      s.frame = 8;
      g.renderer.render(s, 0);
      const open = plants().find((p: any) => Math.abs(p.x - plant.x) < 1);
      // Waiting at the bottom, SMB1 does not draw it at all.
      plant.motion = { rise: 0, speed: 1, moving: false, timer: 40 };
      g.renderer.render(s, 0);
      const waiting = plants().filter((p: any) => Math.abs(p.x - plant.x) < 1);
      s.levelIndex = cave;
      s.reset();
      s.marioReturn = 1e6;
      const low = show("40", 109, 0);
      low.plant.motion = { rise: 24, speed: -1, moving: false, timer: 40 };
      g.renderer.render(s, 0);
      const teal = plants().find((p: any) => Math.abs(p.x - low.plant.x) < 1);
      return {
        up,
        open,
        waiting,
        teal,
        tiles,
        top: plant.pipeTop - 48 + 24,
      };
    },
    { land, cave },
  );
  expect(drawn.up.key).toBe("piranha");
  expect(drawn.up.size).toEqual([32, 48]);
  expect(drawn.up.y).toBe(drawn.top);
  // Below the tile layer, so the pipe hides the part still inside it.
  expect(drawn.up.depth).toBeLessThan(drawn.tiles);
  expect(drawn.open.key).toBe("piranhaOpen");
  expect(drawn.waiting).toEqual([]);
  expect(drawn.teal.key).toBe("piranhaTeal");
});

test("a Piranha Plant hit by a fireball flips, hops, and falls away", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "START GAME" }).click();
  await skipIntro(page);
  const land = campaign.levels.findIndex((level) => level.id === "2-2");
  const drawn = await page.evaluate(
    ({ land }) => {
      const g = (window as any).__game;
      const s = g.sim;
      g.paused = true;
      const input = {
        left: false,
        right: false,
        up: false,
        jump: false,
        fire: false,
        down: false,
        run: false,
      };
      s.levelIndex = land;
      s.reset();
      s.marioReturn = 1e6;
      const room = s.loadRoom("25");
      const plant = room.plants.find((p: any) => p.column === 28);
      const ground = plant.pipeTop + 64;
      s.player.areaId = "25";
      s.player.body.position.x = plant.x - 200;
      s.player.body.position.y = ground - s.player.body.height / 2;
      s.player.body.velocity.x = s.player.body.velocity.y = 0;
      s.cameraX = plant.x - 480;
      plant.motion = { rise: 24, speed: -1, moving: false, timer: 60 };
      const plants = () =>
        g.renderer.play.effects
          .filter(
            (e: any) =>
              e.visible &&
              String(e.texture.key).startsWith("piranha") &&
              Math.abs(e.x - plant.x) < 1,
          )
          .map((e: any) => ({ key: e.texture.key, flipY: e.flipY, y: e.y }));
      const steps = (count: number) => {
        for (let i = 0; i < count; i++) s.step(1 / 60, input);
        g.renderer.render(s, 0);
        return plants();
      };
      g.renderer.render(s, 0);
      const alive = plants();
      s.fireballs = [
        {
          id: 9000,
          x: plant.x - 18,
          y: plant.pipeTop - 14,
          vx: 6,
          vy: 0,
          age: 0,
          owner: "player",
          scale: 1,
        },
      ];
      const hit = steps(1);
      const shots = s.fireballs.length;
      const hop = steps(30);
      const gone = steps(150);
      return {
        alive,
        hit,
        shots,
        hop,
        gone,
        mode: s.mode,
        top: plant.pipeTop - 48 + 24,
      };
    },
    { land },
  );
  expect(drawn.alive).toEqual([
    { key: "piranha", flipY: false, y: drawn.top },
  ]);
  expect(drawn.shots).toBe(0);
  expect(drawn.hit).toEqual([{ key: "piranha", flipY: true, y: drawn.top }]);
  expect(drawn.hop).toHaveLength(1);
  expect(drawn.hop[0].flipY).toBe(true);
  expect(drawn.hop[0].y).toBeLessThan(drawn.top - 40);
  expect(drawn.gone).toEqual([]);
  expect(drawn.mode).toBe("playing");
});
