import Phaser from "phaser";
import { Boot } from "./scenes/Boot";
import { Play } from "./scenes/Play";
import type { Simulation } from "./simulation";
import type { PhysicsWorld } from "./physics";
import { TUNING, VIEW_HEIGHT } from "./config";

// React owns screens and HUD; Phaser owns the canvas and its update loop.
export class PhaserGame {
  game: Phaser.Game;
  play?: Play;
  width = 960;
  height = VIEW_HEIGHT;
  observer: ResizeObserver;
  host: HTMLElement;
  ready: Promise<void>;

  constructor(host: HTMLElement) {
    this.host = host;
    this.width = (VIEW_HEIGHT * host.clientWidth) / Math.max(1, host.clientHeight);
    this.game = new Phaser.Game({
      type: Phaser.WEBGL,
      parent: host,
      width: this.width,
      height: this.height,
      backgroundColor: "#5c94fc",
      pixelArt: true,
      banner: false,
      render: { preserveDrawingBuffer: true },
      scale: { mode: Phaser.Scale.FIT, expandParent: false },
      input: {
        gamepad: true,
        activePointers: 5,
        windowEvents: false,
        touch: { target: document, capture: false },
        mouse: {
          target: document,
          preventDefaultDown: false,
          preventDefaultUp: false,
          preventDefaultMove: false,
          preventDefaultWheel: false,
        },
      },
      physics: {
        default: "arcade",
        arcade: { gravity: { x: 0, y: TUNING.gravity }, customUpdate: true },
      },
      scene: [Boot, Play],
    });
    this.ready = new Promise((resolve, reject) => {
      this.game.events.once("asset-error", (message: string) =>
        reject(new Error(message)),
      );
      this.game.events.once("play-ready", (play: Play) => {
        this.play = play;
        this.game.canvas.setAttribute(
          "aria-label",
          "Super Goomba Bros game world",
        );
        resolve();
      });
    });
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
  }

  resize() {
    this.width =
      (VIEW_HEIGHT * this.host.clientWidth) / Math.max(1, this.host.clientHeight);
    if (!this.game.isBooted) return;
    // FIT caches parent bounds. Update them before setGameSize or the canvas
    // keeps the previous letterbox after the pad unmounts.
    this.game.scale.getParentBounds();
    this.game.scale.setGameSize(this.width, this.height);
  }
  bindPhysics(physics: PhysicsWorld) {
    physics.bind(this.play!.physics.world, Phaser.Physics.Arcade);
  }
  render(sim: Simulation, _time: number) {
    this.play?.renderState(sim, this.width);
  }
  screen(x: number, y: number, sim: Simulation) {
    const zoom = sim.cameraZoom || 1;
    const viewX = sim.cameraX + (this.width / 2) * (1 - 1 / zoom);
    const viewY = sim.cameraY + (this.height / 2) * (1 - 1 / zoom);
    return {
      x: (((x - viewX) * zoom) / this.width) * 100,
      y:
        ((((y - viewY) * zoom) / this.height) *
          this.host.clientHeight /
          this.host.parentElement!.clientHeight) *
        100,
    };
  }
  dispose() {
    this.observer.disconnect();
    this.game.destroy(true);
  }
}
