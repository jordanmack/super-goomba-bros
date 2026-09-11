import Phaser from "phaser";
import { makeArt } from "../art";
import type { SpriteSources } from "../smb-sprites";
import mario from "../../assets/smb/mario.png";
import enemies from "../../assets/smb/enemies.png";
import scenery from "../../assets/smb/scenery.png";
import tiles from "../../assets/smb/world-tiles.png";
import { RECORDINGS } from "../audio";

export class Boot extends Phaser.Scene {
  constructor() { super("Boot"); }

  preload() {
    for (const [name, url] of Object.entries({ mario, enemies, scenery, tiles }))
      this.load.image(`source-${name}`, url);
    for (const [name, url] of Object.entries(RECORDINGS)) this.load.audio(name, url);
    this.load.on("loaderror", (file: Phaser.Loader.File) => {
      this.game.events.emit("asset-error", `Could not load ${file.key}. Please reload.`);
    });
  }

  create() {
    const sources = Object.fromEntries(["mario", "enemies", "scenery", "tiles"].map(key =>
      [key, this.textures.get(`source-${key}`).getSourceImage()])) as SpriteSources;
    const art = makeArt(sources);
    for (const [key, canvas] of Object.entries(art.assets)) this.textures.addCanvas(key, canvas);
    for (const base of ["goomba", "koopa", "fireGoomba", "fireKoopa", "smallMario", "mario", "whiteMario"]) {
      const poses = base.toLowerCase().includes("mario") ? ["Walk", "Walk2", "Walk3"] : ["", "Walk"];
      this.anims.create({ key: `${base}-walk`, frames: poses.map(pose => ({ key: base + pose })), frameRate: 10, repeat: -1 });
    }
    this.registry.set("portrait", art.portrait);
    this.scene.start("Play");
  }
}
