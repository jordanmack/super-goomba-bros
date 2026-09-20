import Phaser from "phaser";
import {
  MAP_TOP,
  TUNING as T,
  blockDrawY,
  titleCamera,
} from "../config";
import { isSolidTile, themeFor } from "../levels";
import type { Room } from "../room";
import atlas from "../../assets/smb/metatiles.json";
import {
  actorSpriteBox,
  itemDrawY,
  itemHoldHidden,
  itemSpriteSize,
  walkPace,
  type Actor,
  type Simulation,
} from "../simulation";
import {
  flagTextureKey,
  SWEAT_DROP_HEIGHT,
  SWEAT_DROP_KEY,
  SWEAT_DROP_WIDTH,
} from "../smb-sprites";

export class Play extends Phaser.Scene {
  actors = new Map<number, Phaser.GameObjects.Sprite>();
  obstacles = new Map<number, Phaser.GameObjects.Image>();
  effects: Phaser.GameObjects.Image[] = [];
  private pipeMasks = new Map<
    number,
    { shape: Phaser.GameObjects.Rectangle; mask: Phaser.Filters.Mask }
  >();
  private itemMasks = new Map<
    number,
    {
      sprite: Phaser.GameObjects.Image;
      shape: Phaser.GameObjects.Rectangle;
      mask: Phaser.Filters.Mask;
    }
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
      for (const entry of this.itemMasks.values()) {
        entry.mask.destroy();
        entry.shape.destroy();
      }
      this.itemMasks.clear();
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
    if (sim.mode === "title") {
      const frame = titleCamera();
      sim.cameraX = frame.scrollX;
      sim.cameraY = frame.scrollY;
      sim.cameraZoom = frame.zoom;
    } else {
      sim.cameraY = 0;
      sim.cameraZoom = 1;
      sim.cameraX = Math.max(
        room.offset,
        Math.min(
          room.offset + room.data.width * 32 - width,
          sim.player.body.position.x - width * 0.36,
        ),
      );
    }
    sim.viewWidth = width;
    this.cameras.main.setZoom(sim.cameraZoom);
    this.cameras.main.setScroll(sim.cameraX, sim.cameraY);
    for (const key of room.smashedTiles) {
      const [column, row] = key.split(",").map(Number);
      if (row >= 13) continue;
      this.tiles.removeTileAt(column, row);
    }
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
        .setPosition(c.x, blockDrawY(c.y, c.bounce))
        .setVisible(!c.broken && !(c.hidden && !c.used));
    }
    const liveActors = [sim.player, ...sim.npcs, sim.mario];
    const live = new Set(liveActors.map((actor) => actor.id));
    this.dropStaleActors(live);
    for (const actor of liveActors) this.renderActor(actor, sim);
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
        .setAlpha(1)
        .setVisible(true);
      return sprite;
    };
    for (const coin of room.coins)
      if (!coin.collected)
        image(coin.x, coin.y, 32, 32, "coin", 2).setRotation(0);
    const liveItems = new Set<number>();
    for (const item of sim.items) {
      const size = itemSpriteSize(item.kind);
      const sprite = image(
        item.body.position.x,
        itemDrawY(item),
        size,
        size,
        item.kind,
        4,
      );
      sprite.setRotation(0);
      sprite.setAlpha(itemHoldHidden(item) ? 0.25 : 1);
      if (item.clip) {
        liveItems.add(item.id);
        this.bindItemClip(item.id, sprite, item.clip);
      }
    }
    for (const id of [...this.itemMasks.keys()]) {
      if (!liveItems.has(id)) this.clearItemClip(id);
    }
    for (const pop of sim.coinPops)
      image(pop.x, pop.y - 48 * Math.min(1, pop.age / 0.5), 32, 32, "coin", 6).setRotation(0);
    for (const rope of room.balanceRopes) {
      const leftH = Math.max(2, rope.leftY - rope.pulleyY);
      const rightH = Math.max(2, rope.rightY - rope.pulleyY);
      image(rope.leftX, rope.pulleyY + leftH / 2, 4, leftH, "rope", 3);
      image(rope.rightX, rope.pulleyY + rightH / 2, 4, rightH, "rope", 3);
      image(rope.pulleyX, rope.pulleyY, 16, 12, "pulley", 5);
    }
    for (const platform of room.platforms)
      image(
        platform.body.position.x,
        platform.body.position.y,
        platform.body.width,
        platform.body.height,
        "platform",
        4,
      ).setRotation(0);
    if (room.axe && !room.bridgeDropped)
      image(room.axe.x, room.axe.y, 32, 32, "axe", 6).setRotation(0);
    for (const ball of sim.firebarBalls(room))
      image(ball.x, ball.y, 16, 16, "fireball", 10).setRotation(
        ((Math.floor(sim.elapsed * 12) % 4) * Math.PI) / 2,
      );
    for (const flame of sim.bowserFlames)
      if (flame.areaId === room.data.id)
        image(flame.x, flame.y, 48, 16, "bowserFlame", 10).setFlipX(flame.vx < 0);
    for (const b of sim.bowsers) {
      if (b.areaId !== room.data.id || !b.alive) continue;
      const walking = !sim.marioActive || sim.mario.areaId !== b.areaId;
      image(
        b.x,
        b.y,
        T.bowserWidth,
        T.bowserHeight,
        walking && Math.floor(sim.elapsed * 6) % 2 ? "bowserWalk" : "bowser",
        9,
      ).setFlipX(b.facing > 0);
    }
    for (const vine of sim.vines) {
      if (vine.areaId !== room.data.id || vine.height < 1) continue;
      const top = vine.bottomY - vine.height;
      image(vine.x, top + 16, 32, 32, "vineHead", 3).setRotation(0);
      for (let y = top + 48; y < vine.bottomY + 16; y += 32)
        image(vine.x, y, 32, 32, "vine", 3).setRotation(0);
    }
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
        flagTextureKey(pole.claim),
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
    for (const b of sim.bulletBills)
      image(b.x, b.y, 32, 32, "bulletBill", 9).setFlipX(b.vx < 0);
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
        // Tiny and unscaled: same pixels on 1x and 8x NPCs.
        image(
          n.body.position.x,
          n.body.bounds.max.y -
            actorSpriteBox(n, sim.displayScale(n)).h -
            SWEAT_DROP_HEIGHT -
            2,
          SWEAT_DROP_WIDTH * 2,
          SWEAT_DROP_HEIGHT * 2,
          SWEAT_DROP_KEY,
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
    const shelled = actor.kind === "koopa" && actor.shell !== "none";
    const base = mario
      ? smallMario
        ? "smallMario"
        : sim.marioStage === 2
          ? "fireMario"
          : "mario"
      : actor.flower
        ? actor.kind === "goomba"
          ? "fireGoomba"
          : actor.kind === "koopa"
            ? "fireKoopa"
            : "fireFish"
        : actor.kind;
    const pace = walkPace(actor);
    const moving =
      actor.kind === "fish" ? pace > 0.1 : actor.grounded && pace > 0.1;
    const skid =
      mario &&
      sim.marioChase > 0 &&
      sim.marioReaction === 0 &&
      (sim.marioAim - actor.body.position.x) * actor.body.velocity.x < -20;
    const shake =
      shelled &&
      actor.shell === "stopped" &&
      actor.wakeLeft <= T.shellShake;
    if (shelled) {
      sprite
        .stop()
        .setTexture(
          base +
            (shake && Math.floor(sim.elapsed * 8) % 2 ? "ShellWake" : "Shell"),
        );
    } else if (moving && !skid) {
      sprite.play(`${base}-walk`, true);
      sprite.anims.timeScale = (pace * 60) / 90;
    } else
      sprite
        .stop()
        .setTexture(
          base + (mario && !actor.grounded ? "Jump" : skid ? "Skid" : ""),
        );
    const box = actorSpriteBox(actor, shown);
    sprite.setPosition(
      Math.round(actor.body.position.x) +
        (shake && Math.floor(sim.elapsed * 16) % 2 ? shown : 0),
      Math.round(actor.body.bounds.max.y),
    );
    sprite.setDisplaySize(box.w, box.h).setFlipX(actor.facing < 0);
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

  private dropStaleActors(live: Set<number>) {
    for (const [id, sprite] of [...this.actors]) {
      if (live.has(id)) continue;
      const entry = this.pipeMasks.get(id);
      if (entry) {
        sprite.filters?.external.remove(entry.mask);
        entry.shape.destroy();
        this.pipeMasks.delete(id);
      }
      sprite.destroy();
      this.actors.delete(id);
    }
  }

  private bindItemClip(
    id: number,
    sprite: Phaser.GameObjects.Image,
    clip: { x: number; y: number; w: number; h: number },
  ) {
    let entry = this.itemMasks.get(id);
    if (entry && entry.sprite !== sprite) {
      this.clearItemClip(id);
      entry = undefined;
    }
    if (!entry) {
      sprite.enableFilters();
      const shape = this.add
        .rectangle(0, 0, 1, 1, 0xffffff)
        .setVisible(false);
      entry = {
        sprite,
        shape,
        mask: sprite.filters!.external.addMask(
          shape,
          false,
          this.cameras.main,
        ),
      };
      this.itemMasks.set(id, entry);
    }
    entry.shape.setPosition(clip.x + clip.w / 2, clip.y + clip.h / 2);
    entry.shape.setSize(clip.w, clip.h);
  }

  private clearItemClip(id: number) {
    const entry = this.itemMasks.get(id);
    if (!entry) return;
    entry.sprite.filters?.external.remove(entry.mask);
    entry.shape.destroy();
    this.itemMasks.delete(id);
  }
}
