import Phaser from "phaser";
import { Boot } from "./scenes/Boot";
import { Play } from "./scenes/Play";
import type { Simulation } from "./simulation";
import type { PhysicsWorld } from "./physics";

// React owns screens and HUD; Phaser owns the canvas and its update loop.
export class PhaserGame {
  game: Phaser.Game;
  play?: Play;
  width = 960;
  height = 540;
  observer: ResizeObserver;
  host: HTMLElement;
  ready: Promise<void>;

  constructor(host: HTMLElement) {
    this.host = host;
    this.width = 540 * host.clientWidth / Math.max(1, host.clientHeight);
    this.game = new Phaser.Game({
      type: Phaser.WEBGL, parent: host, width: this.width, height: this.height,
      backgroundColor: "#5c94fc", pixelArt: true, banner: false,
      render: { preserveDrawingBuffer: true },
      scale: { mode: Phaser.Scale.FIT, expandParent: false },
      input: {
        activePointers: 5, windowEvents: false,
        touch: { target: document, capture: false },
        mouse: { target: document, preventDefaultDown: false, preventDefaultUp: false, preventDefaultMove: false, preventDefaultWheel: false },
      },
      physics: { default: "arcade", arcade: { gravity: { x: 0, y: 1500 }, customUpdate: true } },
      scene: [Boot, Play],
    });
    this.ready = new Promise((resolve, reject) => {
      this.game.events.once("asset-error", (message: string) => reject(new Error(message)));
      this.game.events.once("play-ready", (play: Play) => { this.play = play; this.game.canvas.setAttribute("aria-label", "Super Goomba Bros game world"); resolve(); });
    });
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
  }

  resize() {
    this.width = 540 * this.host.clientWidth / Math.max(1, this.host.clientHeight);
    if (this.game.isBooted) this.game.scale.setGameSize(this.width, this.height);
  }
  bindPhysics(physics: PhysicsWorld) { physics.bind(this.play!.physics.world, Phaser.Physics.Arcade); }
  render(sim: Simulation, _time: number) { this.play?.renderState(sim, this.width); }
  screen(x: number, y: number, sim: Simulation) {
    return { x: (x - sim.cameraX) / this.width * 100, y: y / this.height * this.host.clientHeight / this.host.parentElement!.clientHeight * 100 };
  }
  dispose() { this.observer.disconnect(); this.game.destroy(true); }
}
