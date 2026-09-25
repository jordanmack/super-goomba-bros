import campaign from "../../src/assets/levels/campaign.json" with { type: "json" };
import { test, expect, skipIntro } from "./skip-intro.ts";

test("Bloopers and Cheep Cheeps draw their own frames, not a teal Goomba", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "START GAME" }).click();
  await skipIntro(page);
  const water = campaign.levels.findIndex((level) => level.id === "2-2");
  const land = campaign.levels.findIndex((level) => level.id === "2-3");
  const drawn = await page.evaluate(
    ({ water, land }) => {
      const g = (window as any).__game;
      const s = g.sim;
      g.paused = true;
      // Average color of a texture's opaque pixels.
      const tone = (key: string) => {
        const image = g.renderer.game.textures.get(key).getSourceImage();
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext("2d")!;
        context.drawImage(image, 0, 0);
        const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
        const sum = [0, 0, 0];
        let n = 0;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3]! < 20) continue;
          for (let c = 0; c < 3; c++) sum[c] += data[i + c]!;
          n++;
        }
        return {
          w: image.width,
          h: image.height,
          rgb: sum.map((v) => Math.round(v / n)),
        };
      };
      const look = (sim: any, actor: any, elapsed: number) => {
        sim.elapsed = elapsed;
        g.renderer.render(sim, 0);
        const sprite = g.renderer.play.actors.get(actor.id);
        return {
          key: sprite?.texture?.key,
          size: [sprite?.displayWidth, sprite?.displayHeight],
          bottom: sprite ? Math.round(sprite.y - actor.body.bounds.max.y) : null,
        };
      };
      s.levelIndex = water;
      s.reset();
      s.marioReturn = 1e6;
      const blooper = s.npcs.find((n: any) => n.species === "blooper");
      s.player.areaId = blooper.areaId;
      s.player.body.position.x = blooper.body.position.x - 100;
      blooper.waterMotion.timer = 0;
      const tall = look(s, blooper, 1);
      blooper.waterMotion.timer = 1;
      const short = look(s, blooper, 1);
      blooper.species = "grey-cheep";
      blooper.waterMotion = {
        kind: "swim",
        red: false,
        xForce: 0,
        yDummy: 0,
        down: false,
        originY: 0,
        wobble: false,
      };
      const greyA = look(s, blooper, 0.5 / 60);
      const greyB = look(s, blooper, 8.5 / 60);
      blooper.species = "red-cheep";
      const red = look(s, blooper, 0.5 / 60);
      s.levelIndex = land;
      s.reset();
      s.marioReturn = 1e6;
      const placed = s.npcs.find((n: any) => n.species === "grey-cheep");
      s.player.body.position.x = placed.body.position.x - 100;
      const green = look(s, placed, 0.5 / 60);
      return {
        tall,
        short,
        greyA,
        greyB,
        red,
        green,
        tones: Object.fromEntries(
          ["blooper", "blooperTall", "greyCheep", "greenCheep", "redCheep"].map(
            (key) => [key, tone(key)],
          ),
        ),
      };
    },
    { water, land },
  );
  expect(drawn.tall).toEqual({ key: "blooperTall", size: [32, 48], bottom: 6 });
  expect(drawn.short).toEqual({ key: "blooper", size: [32, 32], bottom: 0 });
  expect([drawn.greyA.key, drawn.greyB.key]).toEqual(["greyCheep", "greyCheepWalk"]);
  expect(drawn.red.key).toBe("redCheep");
  expect(drawn.green.key).toBe("greenCheep");
  const { tones } = drawn;
  expect([tones.blooper.w, tones.blooper.h]).toEqual([16, 16]);
  expect([tones.blooperTall.w, tones.blooperTall.h]).toEqual([16, 24]);
  // The Blooper is white, the water Cheep Cheep grey, red is red, and the
  // land grey Cheep Cheep is green.
  const [br, bg, bb] = tones.blooper.rgb;
  expect(Math.min(br, bg, bb)).toBeGreaterThan(150);
  const [rr, rg] = tones.redCheep.rgb;
  expect(rr).toBeGreaterThan(rg + 60);
  const [gr, gg] = tones.greenCheep.rgb;
  expect(gg).toBeGreaterThan(gr + 30);
  const [yr, yg, yb] = tones.greyCheep.rgb;
  expect(Math.max(yr, yg, yb) - Math.min(yr, yg, yb)).toBeLessThan(60);
});
