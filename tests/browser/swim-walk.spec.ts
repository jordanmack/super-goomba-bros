import campaign from "../../src/assets/levels/campaign.json" with { type: "json" };
import { test, expect, skipIntro } from "./skip-intro.ts";

test("swimming goombas and koopas play the walk cycle off the floor", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "START GAME" }).click();
  await skipIntro(page);
  const waterStage = campaign.levels.findIndex((level) => level.id === "2-2");
  const landStage = campaign.levels.findIndex((level) => level.id === "1-1");
  expect(waterStage).toBeGreaterThanOrEqual(0);
  const drawn = await page.evaluate(
    ({ waterStage, landStage }) => {
      const g = (window as any).__game;
      const s = g.sim;
      g.paused = true;
      const sample = (actor: any) => {
        g.renderer.render(s, 0);
        const sprite = g.renderer.play.actors.get(actor.id);
        return {
          anim: sprite?.anims?.currentAnim?.key ?? null,
          playing: !!sprite?.anims?.isPlaying,
          texture: sprite?.texture?.key ?? null,
        };
      };
      const pose = (
        actor: any,
        vx: number,
        vy: number,
        grounded: boolean,
      ) => {
        actor.alive = true;
        actor.saved = false;
        actor.grounded = grounded;
        actor.body.velocity.x = vx;
        actor.body.velocity.y = vy;
        return sample(actor);
      };
      s.levelIndex = waterStage;
      s.reset();
      const goomba = s.npcs.find(
        (n: { kind: string; flower: boolean }) => n.kind === "goomba" && !n.flower,
      );
      const koopa = s.npcs.find(
        (n: { kind: string; flower: boolean; shell: string }) =>
          n.kind === "koopa" && n.shell === "none" && !n.flower,
      );
      const fish = s.npcs.find(
        (n: { kind: string }) => n.kind === "fish",
      );
      if (!goomba || !koopa || !fish) return null;
      s.player.areaId = goomba.areaId;
      s.player.alive = true;
      s.player.flower = false;
      s.marioActive = true;
      s.mario.alive = true;
      s.mario.areaId = goomba.areaId;
      s.setMarioStage(1);
      const water = {
        room: s.roomFor(goomba).data.type,
        goombaUp: pose(goomba, 0, -1.6, false),
        goombaDown: pose(goomba, 0, 1.4, false),
        goombaStill: pose(goomba, 0, 0, false),
        koopaUp: pose(koopa, 0, -1.5, false),
        koopaStill: pose(koopa, 0, 0, false),
        playerUp: pose(s.player, 0, -1.5, false),
        playerStill: pose(s.player, 0, 0, false),
        fishUp: pose(fish, 0, -1.5, false),
        marioAir: pose(s.mario, 0, -2, false),
        shell: (() => {
          koopa.shell = "moving";
          const frame = pose(koopa, 1.5, -1, false);
          koopa.shell = "none";
          return frame;
        })(),
      };
      s.levelIndex = landStage;
      s.reset();
      const landGoomba = s.npcs.find(
        (n: { kind: string; flower: boolean }) => n.kind === "goomba" && !n.flower,
      );
      if (!landGoomba) return null;
      return {
        water,
        landRoom: s.roomFor(landGoomba).data.type,
        landWalk: pose(landGoomba, 2, 0, true),
        landAir: pose(landGoomba, 2, -1, false),
      };
    },
    { waterStage, landStage },
  );
  expect(drawn).not.toBeNull();
  expect(drawn!.water.room).toBe("water");
  expect(drawn!.water.goombaUp.anim).toBe("goomba-walk");
  expect(drawn!.water.goombaUp.playing).toBe(true);
  expect(drawn!.water.goombaDown.anim).toBe("goomba-walk");
  expect(drawn!.water.goombaStill.playing).toBe(false);
  expect(drawn!.water.goombaStill.texture).toBe("goomba");
  expect(drawn!.water.koopaUp.anim).toBe("koopa-walk");
  expect(drawn!.water.koopaUp.playing).toBe(true);
  expect(drawn!.water.koopaStill.texture).toBe("koopa");
  expect(drawn!.water.playerUp.anim).toBe("goomba-walk");
  expect(drawn!.water.playerUp.playing).toBe(true);
  expect(drawn!.water.playerStill.playing).toBe(false);
  // A Blooper shows its MoveBloober frame, not a walk cycle.
  expect(drawn!.water.fishUp.texture).toBe("blooperTall");
  expect(drawn!.water.fishUp.playing).toBe(false);
  expect(drawn!.water.shell.texture).toBe("koopaShell");
  expect(drawn!.water.shell.playing).toBe(false);
  expect(drawn!.water.marioAir.texture).toBe("marioJump");
  expect(drawn!.water.marioAir.anim).not.toBe("mario-walk");
  expect(drawn!.landRoom).not.toBe("water");
  expect(drawn!.landWalk.anim).toBe("goomba-walk");
  expect(drawn!.landAir.playing).toBe(false);
  expect(drawn!.landAir.texture).toBe("goomba");
});
