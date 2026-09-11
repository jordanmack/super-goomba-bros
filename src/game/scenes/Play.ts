import Phaser from "phaser";
import { GAPS, MAP_TOP, TUNING as T } from "../config";
import area from "../../assets/levels/area-25.json";
import type { Actor, Simulation } from "../simulation";

export class Play extends Phaser.Scene {
  actors = new Map<number, Phaser.GameObjects.Sprite>();
  covers = new Map<number, Phaser.GameObjects.Image>();
  effects: Phaser.GameObjects.Image[] = [];
  tiles!: Phaser.Tilemaps.TilemapLayer;
  tick?: (time: number, delta: number) => void;
  draw?: () => void;

  constructor() { super("Play"); }

  create() {
    const blocks = new Set(area.blocks.map(b => `${b.column},${b.row}`));
    const data = area.tiles.map((row, y) => row.map((id, x) => !id || blocks.has(`${x},${y}`) ? -1 : id));
    for (let row = 15; row < 18; row++) data.push(Array.from({ length: area.width }, (_, x) =>
      GAPS.some(([left, right]) => x * 32 >= left && x * 32 < right) ? -1 : 84));
    const map = this.make.tilemap({ data, tileWidth: 16, tileHeight: 16 });
    const set = map.addTilesetImage("metatiles", "metatiles", 16, 16, 0, 0)!;
    this.tiles = map.createLayer(0, set, 0, MAP_TOP) as Phaser.Tilemaps.TilemapLayer;
    this.tiles.setScale(2);
    this.tiles.setCollision([16, 17, 18, 19, 20, 21, 84, 97]);
    this.cameras.main.setBackgroundColor("#5c94fc");
    this.game.events.emit("play-ready", this);
    this.events.once("shutdown", () => { this.tick = undefined; this.draw = undefined; this.actors.clear(); this.covers.clear(); this.effects = []; });
  }

  update(time: number, delta: number) { this.tick?.(time, delta); this.draw?.(); }

  renderState(sim: Simulation, width: number) {
    sim.cameraX = Math.max(0, Math.min(T.worldWidth - width, sim.player.body.position.x - width * 0.36));
    sim.viewWidth = width;
    this.cameras.main.setScroll(sim.cameraX, 0);
    for (const c of sim.covers) {
      if (c.kind !== "brick") continue;
      let sprite = this.covers.get(c.id);
      if (!sprite) { sprite = this.add.image(c.x, c.y, "brick").setDisplaySize(32, 32).setDepth(5); this.covers.set(c.id, sprite); }
      sprite.setVisible(!c.broken).setTexture(c.question ? c.used ? "used" : "question" : "brick");
      sprite.y = c.y - 10 * Math.sin(Math.PI * c.bounce / T.blockBounceSeconds);
    }
    for (const actor of [sim.player, ...sim.npcs, sim.mario]) this.renderActor(actor, sim);
    let index = 0;
    const image = (x: number, y: number, w: number, h: number, key: string, depth: number, tint = 0xffffff) => {
      let sprite = this.effects[index++];
      if (!sprite) { sprite = this.add.image(0, 0, key); this.effects.push(sprite); }
      sprite.setTexture(key).setPosition(Math.round(x), Math.round(y)).setDisplaySize(w, h).setDepth(depth).setTint(tint).setVisible(true);
      return sprite;
    };
    for (const item of sim.items) image(item.body.position.x, item.body.position.y, 32, 32, item.kind, 4);
    for (const f of sim.fireballs) image(f.x, f.y, 16 * (f.scale ?? 1), 16 * (f.scale ?? 1), "fireball", 10).setRotation(Math.floor(f.age * 12) % 4 * Math.PI / 2);
    for (const p of sim.particles) image(p.x, p.y, p.settled ? p.size * 2 : p.size, p.settled ? 2 : p.size, "__WHITE", 14, Phaser.Display.Color.HexStringToColor(p.color).color).setRotation(0);
    for (const n of sim.npcs) if (n.warned && n.alive && !n.saved)
      image(n.body.position.x, n.body.position.y - 29 * n.scale, 5, 5, "__WHITE", 12, 0xffe077).setRotation(0);
    for (; index < this.effects.length; index++) this.effects[index].setVisible(false);
  }

  private renderActor(actor: Actor, sim: Simulation) {
    let sprite = this.actors.get(actor.id);
    if (!sprite) { sprite = this.add.sprite(0, 0, actor.kind).setDepth(8).setOrigin(0.5, 1); this.actors.set(actor.id, sprite); }
    if (actor === sim.mario && sim.marioDeath) {
      sprite.stop().setTexture("marioDeath").setVisible(true).setPosition(sim.marioDeath.x, sim.marioDeath.y + 16).setDisplaySize(32, 32).setAlpha(1).clearTint();
      return;
    }
    sprite.setVisible(actor.alive && !actor.saved && !(actor === sim.mario && (!sim.marioActive || sim.marioPipe > 0)));
    if (!sprite.visible) { sprite.stop(); return; }
    const mario = actor === sim.mario;
    const base = mario ? sim.marioStage === 0 ? "smallMario" : sim.marioStage === 2 ? "whiteMario" : "mario" : actor.flower ? actor.kind === "goomba" ? "fireGoomba" : "fireKoopa" : actor.kind;
    const moving = actor.grounded && Math.abs(actor.body.velocity.x) > 0.1;
    const skid = mario && sim.marioChase > 0 && sim.marioReaction === 0 && (sim.marioAim - actor.body.position.x) * actor.body.velocity.x < -20;
    if (moving && !skid) {
      sprite.play(`${base}-walk`, true);
      sprite.anims.timeScale = Math.abs(actor.body.velocity.x) * 60 / 90;
    } else sprite.stop().setTexture(base + (mario && !actor.grounded ? "Jump" : skid ? "Skid" : ""));
    const smallMario = mario && sim.marioStage === 0;
    const height = (actor.kind === "koopa" ? 48 : mario ? 64 : 32) * actor.scale;
    sprite.setPosition(Math.round(actor.body.position.x), Math.round(actor.body.bounds.max.y));
    sprite.setDisplaySize(smallMario ? 32 : 32 * actor.scale, height).setFlipX(actor.facing < 0);
    sprite.setAlpha(mario && sim.marioStun > 0 && Math.floor(sim.elapsed * 18) % 2 ? 0.25 : 1);
    sprite.setTint(actor.starLeft > 0 ? [0xffffff, 0xffe060, 0x90ff90, 0xff90e8][Math.floor(sim.elapsed * 12) % 4] : 0xffffff);
  }
}
