import Phaser from "phaser";
import { MAP_TOP, TUNING as T } from "../config";
import { isSolidTile, themeFor } from "../levels";
import type { Room } from "../room";
import atlas from "../../assets/smb/metatiles.json";
import type { Actor, Simulation } from "../simulation";

export class Play extends Phaser.Scene {
  actors = new Map<number, Phaser.GameObjects.Sprite>();
  obstacles = new Map<number, Phaser.GameObjects.Image>();
  effects: Phaser.GameObjects.Image[] = [];
  private pipeMasks = new Map<
    number,
    { shape: Phaser.GameObjects.Rectangle; mask: Phaser.Filters.Mask }
  >();
  tiles!: Phaser.Tilemaps.TilemapLayer;
  tick?: (time: number, delta: number) => void;
  draw?: () => void;
  private room?: Room;

  constructor() {
    super("Play");
  }

  create() {
    this.game.events.emit("play-ready", this);
    this.events.once("shutdown", () => {
      this.tick = undefined;
      this.draw = undefined;
      this.actors.clear();
      this.obstacles.clear();
      this.effects = [];
      for (const entry of this.pipeMasks.values()) {
        entry.mask.destroy();
        entry.shape.destroy();
      }
      this.pipeMasks.clear();
      this.room = undefined;
    });
  }

  private loadRoom(room: Room) {
    this.tiles?.tilemap.destroy();
    this.room = room;
    const area = room.data;
    const theme = themeFor(area),
      palette = atlas.themes.indexOf(theme) * 256;
    const blocks = new Set(area.blocks.map((b) => `${b.column},${b.row}`));
    const data = area.tiles.map((row, y) =>
      row.map((id, x) => {
        if (id === 194 || id === 195)
          return area.type === "water" ? palette + 135 : -1;
        return !id || blocks.has(`${x},${y}`) ? -1 : palette + id;
      }),
    );
    for (let row = 15; row < 18; row++)
      data.push(area.tiles[14].map((id) => (!id ? -1 : palette + id)));
    const map = this.make.tilemap({ data, tileWidth: 16, tileHeight: 16 });
    const set = map.addTilesetImage("metatiles", "metatiles", 16, 16, 0, 0)!;
    this.tiles = map.createLayer(
      0,
      set,
      room.offset,
      MAP_TOP,
    ) as Phaser.Tilemaps.TilemapLayer;
    this.tiles.setScale(2);
    this.tiles.setCollision(
      Array.from({ length: 198 }, (_, id) => id)
        .filter(isSolidTile)
        .map((id) => palette + id),
    );
    this.cameras.main.setBackgroundColor(
      theme === "day" || theme === "snow-day" || theme === "water"
        ? "#5c94fc"
        : "#000000",
    );
  }

  update(time: number, delta: number) {
    this.tick?.(time, delta);
    this.draw?.();
  }

  renderState(sim: Simulation, width: number) {
    const room = sim.activeRoom;
    if (this.room !== room) this.loadRoom(room);
    sim.cameraX = Math.max(
      room.offset,
      Math.min(
        room.offset + room.data.width * 32 - width,
        sim.player.body.position.x - width * 0.36,
      ),
    );
    sim.viewWidth = width;
    this.cameras.main.setScroll(sim.cameraX, 0);
    for (const sprite of this.obstacles.values()) sprite.setVisible(false);
    const palette = atlas.themes.indexOf(themeFor(room.data)) * 256;
    for (const c of room.obstacles) {
      if (c.kind !== "brick") continue;
      let sprite = this.obstacles.get(c.id);
      if (!sprite) {
        sprite = this.add
          .image(c.x, c.y, "metatiles", palette + 81)
          .setDisplaySize(32, 32)
          .setDepth(5);
        this.obstacles.set(c.id, sprite);
      }
      const column = Math.floor((c.x - room.offset) / 32),
        row = Math.floor((c.y - MAP_TOP) / 32);
      sprite
        .setTexture(
          "metatiles",
          palette + (c.used ? 196 : room.data.tiles[row][column]),
        )
        .setDisplaySize(32, 32);
      sprite
        .setPosition(c.x, c.y)
        .setVisible(!c.broken && !(c.hidden && !c.used));
      sprite.y =
        c.y - 10 * Math.sin((Math.PI * c.bounce) / T.blockBounceSeconds);
    }
    for (const actor of [sim.player, ...sim.npcs, sim.mario])
      this.renderActor(actor, sim);
    let index = 0;
    const image = (
      x: number,
      y: number,
      w: number,
      h: number,
      key: string,
      depth: number,
      tint = 0xffffff,
    ) => {
      let sprite = this.effects[index++];
      if (!sprite) {
        sprite = this.add.image(0, 0, key);
        this.effects.push(sprite);
      }
      sprite
        .setTexture(key)
        .setPosition(Math.round(x), Math.round(y))
        .setDisplaySize(w, h)
        .setDepth(depth)
        .setTint(tint)
        .setFlipX(false)
        .setRotation(0)
        .setVisible(true);
      return sprite;
    };
    for (const coin of room.coins)
      if (!coin.collected)
        image(coin.x, coin.y, 32, 32, "coin", 2).setRotation(0);
    for (const item of sim.items) {
      const size = item.kind === "mushroom8x" ? 48 : 32;
      image(
        item.body.position.x,
        item.body.position.y,
        size,
        size,
        item.kind,
        4,
      ).setRotation(0);
    }
    for (const pop of sim.coinPops)
      image(pop.x, pop.y - 48 * Math.min(1, pop.age / 0.5), 32, 32, "coin", 6).setRotation(0);
    for (const platform of room.platforms)
      image(
        platform.body.position.x,
        platform.body.position.y,
        platform.body.width,
        platform.body.height,
        "platform",
        4,
      ).setRotation(0);
    if (room.data.goal?.kind === "castle-room") {
      image(room.goalX, T.groundY - 48, 32, 32, "metatiles", 3)
        .setFrame(palette + 74)
        .setDisplaySize(32, 32);
      image(room.goalX, T.groundY - 16, 32, 32, "metatiles", 3)
        .setFrame(palette + 75)
        .setDisplaySize(32, 32);
    }
    const pole = room.flagpole;
    if (pole?.claim)
      image(
        pole.x - 8,
        pole.bottom + (pole.top - pole.bottom) * pole.raise,
        32,
        32,
        pole.claim === "mario" ? "marioFlag" : "goombaFlag",
        6,
      ).setFlipX(true);
    for (const f of sim.fireballs)
      image(
        f.x,
        f.y,
        16 * (f.scale ?? 1),
        16 * (f.scale ?? 1),
        "fireball",
        10,
      ).setRotation(((Math.floor(f.age * 12) % 4) * Math.PI) / 2);
    for (const p of sim.particles)
      image(
        p.x,
        p.y,
        p.settled ? p.size * 2 : p.size,
        p.settled ? 2 : p.size,
        "__WHITE",
        14,
        Phaser.Display.Color.HexStringToColor(p.color).color,
      ).setRotation(0);
    for (const n of sim.npcs)
      if (n.exclaimLeft > 0 && n.alive && !n.saved)
        image(
          n.body.position.x,
          n.body.position.y - 34 * n.scale,
          16 * n.scale,
          32 * n.scale,
          "exclaim",
          12,
        ).setRotation(0);
    for (; index < this.effects.length; index++)
      this.effects[index].setVisible(false);
  }

  private renderActor(actor: Actor, sim: Simulation) {
    let sprite = this.actors.get(actor.id);
    if (!sprite) {
      sprite = this.add.sprite(0, 0, actor.kind).setDepth(8).setOrigin(0.5, 1);
      this.actors.set(actor.id, sprite);
    }
    if (actor === sim.mario && sim.marioDeath) {
      sprite
        .stop()
        .setTexture("marioDeath")
        .setVisible(true)
        .setPosition(sim.marioDeath.x, sim.marioDeath.y + 16)
        .setDisplaySize(32, 32)
        .setAlpha(1)
        .clearTint();
      return;
    }
    if (actor === sim.player && sim.playerDeath) {
      sprite
        .stop()
        .setTexture(actor.flower ? "fireGoomba" : "goomba")
        .setVisible(true)
        .setPosition(
          sim.playerDeath.x,
          sim.playerDeath.y + 16 * actor.scale,
        )
        .setDisplaySize(32 * actor.scale, 32 * actor.scale)
        .setFlipX(actor.facing < 0)
        .setAlpha(1)
        .clearTint();
      return;
    }
    sprite.setVisible(
      actor.alive && !actor.saved && !(actor === sim.mario && !sim.marioActive),
    );
    sprite.setDepth(8);
    const clip = actor.pipeTravel?.clip;
    if (clip) {
      sprite.enableFilters();
      let entry = this.pipeMasks.get(actor.id);
      if (!entry) {
        const shape = this.add
          .rectangle(0, 0, 1, 1, 0xffffff)
          .setVisible(false);
        entry = {
          shape,
          mask: sprite.filters!.external.addMask(
            shape,
            false,
            this.cameras.main,
          ),
        };
        this.pipeMasks.set(actor.id, entry);
      }
      entry.shape.setPosition(clip.x + clip.w / 2, clip.y + clip.h / 2);
      entry.shape.setSize(clip.w, clip.h);
    } else {
      const entry = this.pipeMasks.get(actor.id);
      if (entry) {
        sprite.filters?.external.remove(entry.mask);
        entry.shape.destroy();
        this.pipeMasks.delete(actor.id);
      }
    }
    if (!sprite.visible) {
      sprite.stop();
      return;
    }
    const mario = actor === sim.mario;
    const shown = sim.displayScale(actor);
    const smallMario = mario && shown < 1;
    const base = mario
      ? smallMario
        ? "smallMario"
        : sim.marioStage === 2
          ? "whiteMario"
          : "mario"
      : actor.flower
        ? actor.kind === "goomba"
          ? "fireGoomba"
          : "fireKoopa"
        : actor.kind;
    const moving = actor.grounded && Math.abs(actor.body.velocity.x) > 0.1;
    const skid =
      mario &&
      sim.marioChase > 0 &&
      sim.marioReaction === 0 &&
      (sim.marioAim - actor.body.position.x) * actor.body.velocity.x < -20;
    if (moving && !skid) {
      sprite.play(`${base}-walk`, true);
      sprite.anims.timeScale = (Math.abs(actor.body.velocity.x) * 60) / 90;
    } else
      sprite
        .stop()
        .setTexture(
          base + (mario && !actor.grounded ? "Jump" : skid ? "Skid" : ""),
        );
    const height =
      (actor.kind === "koopa" ? 48 : mario ? 64 : 32) * shown;
    sprite.setPosition(
      Math.round(actor.body.position.x),
      Math.round(actor.body.bounds.max.y),
    );
    sprite
      .setDisplaySize(smallMario ? 32 : 32 * shown, height)
      .setFlipX(actor.facing < 0);
    sprite.setAlpha(
      mario && sim.marioStun > 0 && Math.floor(sim.elapsed * 18) % 2 ? 0.25 : 1,
    );
    sprite.setTint(
      actor.starLeft > 0
        ? [0xffffff, 0xffe060, 0x90ff90, 0xff90e8][
            Math.floor(sim.elapsed * 12) % 4
          ]
        : 0xffffff,
    );
  }
}
