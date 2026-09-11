// Node-only test harness. It uses the installed Arcade implementation without
// Phaser's browser renderer, DOM shims, or a different physics solver.
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { PhysicsWorld } from "../../src/game/physics.ts";

const require = createRequire(import.meta.url);
const root = dirname(require.resolve("phaser/package.json"));
// Phaser exports the complete browser bundle only. Resolve the pinned package's
// source files here; runtime code uses the public Phaser.Physics.Arcade API.
const load = (name: string) => require(join(root, "src/physics/arcade", `${name}.js`));
const World = load("World"), classes = { Body: load("Body"), StaticBody: load("StaticBody") };

export function physics() {
  const port = new PhysicsWorld();
  port.bind(new World({ sys: { scale: { width: 960, height: 540 } } }, { debug: false }), classes);
  return port;
}
