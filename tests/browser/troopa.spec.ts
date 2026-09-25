import campaign from "../../src/assets/levels/campaign.json" with { type: "json" };
import { test, expect, skipIntro } from "./skip-intro.ts";

test("red Koopas, Buzzy Beetles, and Paratroopas draw their own frames", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "START GAME" }).click();
  await skipIntro(page);
  const stage = campaign.levels.findIndex((level) => level.id === "1-1");
  const drawn = await page.evaluate((stage) => {
    const g = (window as any).__game;
    const s = g.sim;
    g.paused = true;
    s.levelIndex = stage;
    s.reset();
    s.marioReturn = 1e6;
    const n = s.npcs.find((a: any) => a.kind === "koopa");
    s.player.body.position.x = n.body.position.x - 200;
    const look = (setup: () => void, frame = 0) => {
      setup();
      s.frame = frame;
      g.renderer.render(s, 0);
      const sprite = g.renderer.play.actors.get(n.id);
      return {
        key: sprite?.texture?.key,
        size: [sprite?.displayWidth, sprite?.displayHeight],
      };
    };
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
      let count = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3]! < 20) continue;
        for (let c = 0; c < 3; c++) sum[c] += data[i + c]!;
        count++;
      }
      return sum.map((v) => Math.round(v / count));
    };
    return {
      red: look(() => {
        n.troopa = "red";
        n.wings = undefined;
      }),
      redShell: look(() => {
        n.shell = "stopped";
        n.wakeLeft = 5;
      }),
      buzzy: look(() => {
        n.shell = "none";
        n.troopa = "buzzy";
      }),
      buzzyShell: look(() => {
        n.shell = "stopped";
      }),
      wingsUp: look(() => {
        n.shell = "none";
        n.troopa = undefined;
        n.wings = "fly";
      }, 0),
      wingsDown: look(() => undefined, 8),
      redWings: look(() => {
        n.troopa = "red";
        n.wings = "bob";
      }, 0),
      fire: look(() => {
        n.troopa = "buzzy";
        n.wings = undefined;
        n.flower = true;
      }),
      tones: {
        redKoopa: tone("redKoopa"),
        koopa: tone("koopa"),
        buzzy: tone("buzzy"),
      },
    };
  }, stage);
  expect(drawn.red).toEqual({ key: "redKoopa", size: [32, 48] });
  expect(drawn.redShell).toEqual({ key: "redKoopaShell", size: [32, 32] });
  expect(drawn.buzzy).toEqual({ key: "buzzy", size: [32, 32] });
  expect(drawn.buzzyShell).toEqual({ key: "buzzyShell", size: [32, 32] });
  expect(drawn.wingsUp).toEqual({ key: "paraKoopa", size: [32, 48] });
  expect(drawn.wingsDown.key).toBe("paraKoopaWalk");
  expect(drawn.redWings.key).toBe("paraRedKoopa");
  expect(drawn.fire.key).toBe("fireBuzzy");
  const [rr, rg] = drawn.tones.redKoopa;
  expect(rr).toBeGreaterThan(rg + 40);
  const [, gg] = drawn.tones.koopa;
  expect(gg).toBeGreaterThan(drawn.tones.koopa[0]!);
  // The Buzzy shell is dark.
  expect(Math.max(...drawn.tones.buzzy)).toBeLessThan(150);
});
