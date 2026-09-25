import Phaser from "phaser";
import { makeArt } from "../art";
import {
  CHEEP_BASES,
  TROOPA_BASES,
  type SpriteSources,
} from "../smb-sprites";
import mario from "../../assets/smb/mario.png";
import enemies from "../../assets/smb/enemies.png";
import metatiles from "../../assets/smb/metatiles.png";
import items from "../../assets/smb/items.png";
import { RECORDINGS } from "../audio";
import { BundledAudio } from "./BundledAudio";

export class Boot extends Phaser.Scene {
  constructor() {
    super("Boot");
  }

  preload() {
    this.load.spritesheet("metatiles", metatiles, {
      frameWidth: 16,
      frameHeight: 16,
    });
    for (const [name, url] of Object.entries({
      mario,
      enemies,
      items,
    }))
      this.load.image(`source-${name}`, url);
    for (const [name, url] of Object.entries(RECORDINGS)) {
      if ((this.sound as Phaser.Sound.WebAudioSoundManager).context)
        this.load.addFile(new BundledAudio(this, name, url));
      else this.load.audio(name, url);
    }
    this.load.on("loaderror", (file: Phaser.Loader.File) => {
      this.game.events.emit(
        "asset-error",
        `Could not load ${file.key}. Please reload.`,
      );
    });
  }

  create() {
    const sources = Object.fromEntries(
      ["mario", "enemies", "items"].map((key) => [
        key,
        this.textures.get(`source-${key}`).getSourceImage(),
      ]),
    ) as SpriteSources;
    const art = makeArt(sources);
    for (const [key, canvas] of Object.entries(art.assets))
      this.textures.addCanvas(key, canvas);
    for (const base of [
      "goomba",
      "koopa",
      "spike",
      "fireGoomba",
      "fireKoopa",
      "fireSpike",
      ...CHEEP_BASES,
      ...CHEEP_BASES.map((base) => `fire${base[0]!.toUpperCase()}${base.slice(1)}`),
      ...TROOPA_BASES,
      ...TROOPA_BASES.map((base) => `fire${base[0]!.toUpperCase()}${base.slice(1)}`),
      "smallMario",
      "mario",
      "fireMario",
      "bowser",
    ]) {
      const poses = base.toLowerCase().includes("mario")
        ? ["Walk", "Walk2", "Walk3"]
        : ["", "Walk"];
      this.anims.create({
        key: `${base}-walk`,
        frames: poses.map((pose) => ({ key: base + pose })),
        frameRate: 10,
        repeat: -1,
      });
    }
    // Mario's swim stroke steps every 8 frames.
    for (const base of ["smallMario", "mario", "fireMario"])
      this.anims.create({
        key: `${base}-swim`,
        frames: ["Swim", "Swim2", "Swim3"].map((pose) => ({ key: base + pose })),
        frameRate: 7.5,
        repeat: -1,
      });
    this.registry.set("portrait", art.portrait);
    this.registry.set(
      "itemIcons",
      Object.fromEntries(
        ["star", "mushroom", "mushroom3x", "mushroom8x", "flower", "oneUp"].map(
          (key) => [key, art.assets[key as keyof typeof art.assets].toDataURL()],
        ),
      ),
    );
    this.scene.start("Play");
  }
}
