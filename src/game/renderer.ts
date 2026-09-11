import * as THREE from "three";
import { makeArt } from "./art";
import { movementPose } from "./smb-sprites";
import { GAPS, MAP_TOP, TUNING as T } from "./config";
import { WORLD_TILES } from "./world-tiles";
import { WORLD_1_1 as LEVEL } from "./world-1-1";
import type { Simulation, Actor } from "./simulation";

export class GameRenderer {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.OrthographicCamera(0, 960, 0, 540, 0.1, 500);
  art = makeArt();
  geometry = new THREE.PlaneGeometry(1, 1);
  materials = new Map<string, THREE.MeshBasicMaterial>();
  actors = new Map<number, THREE.Mesh>();
  covers = new Map<number, THREE.Mesh>();
  particles: THREE.Mesh[] = [];
  background = new THREE.Group();
  world = new THREE.Group();
  dynamic = new THREE.Group();
  width = 960;
  height = 540;
  observer: ResizeObserver;
  host: HTMLElement;

  constructor(host: HTMLElement) {
    this.host = host;
    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      alpha: false,
      preserveDrawingBuffer: true,
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setClearColor("#5c94fc");
    this.renderer.domElement.setAttribute(
      "aria-label",
      "Super Goomba Bros game world",
    );
    host.append(this.renderer.domElement);
    this.camera.position.z = 200;
    this.scene.add(this.background, this.world, this.dynamic);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    this.resize();
    this.scenery();
  }
  private material(name: string) {
    if (!this.materials.has(name)) {
      const texture = this.art.textures[name as keyof typeof this.art.textures];
      this.materials.set(
        name,
        new THREE.MeshBasicMaterial({
          map: texture ?? null,
          color: texture ? "#ffffff" : name,
          transparent: true,
          alphaTest: 0.05,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      );
    }
    return this.materials.get(name)!;
  }
  private quad(
    parent: THREE.Group,
    x: number,
    y: number,
    w: number,
    h: number,
    name: string,
    z = 0,
  ) {
    const mesh = new THREE.Mesh(this.geometry, this.material(name));
    mesh.position.set(x, y, z);
    mesh.scale.set(w, h, 1);
    // Canvas textures are upright in a world whose Y axis points down.
    mesh.rotation.x = Math.PI;
    parent.add(mesh);
    return mesh;
  }
  private scenery() {
    const blocks = new Set(
      [...LEVEL.bricks, ...LEVEL.questions].map(([x, y]) => `${x},${y}`),
    );
    const groups = new Map<number, [number, number][]>();
    WORLD_TILES.forEach((row, y) =>
      row.forEach((id, x) => {
        if (id === 0 || blocks.has(`${x},${y}`)) return;
        if (!groups.has(id)) groups.set(id, []);
        groups.get(id)!.push([x, y]);
      }),
    );
    // Batch repeated sprites while keeping each cell as an individual tile.
    const transform = new THREE.Object3D();
    for (const [id, cells] of groups) {
      const mesh = new THREE.InstancedMesh(
        this.geometry,
        this.material(`tile${id}`),
        cells.length,
      );
      cells.forEach(([x, y], index) => {
        transform.position.set(x * 32 + 16, MAP_TOP + y * 32 + 16, 1);
        transform.scale.set(32, 32, 1);
        transform.rotation.x = Math.PI;
        transform.updateMatrix();
        mesh.setMatrixAt(index, transform.matrix);
      });
      this.world.add(mesh);
    }
    for (let x = 0; x < T.worldWidth; x += 32) {
      if (GAPS.some(([left, right]) => x >= left && x < right)) continue;
      for (let y = MAP_TOP + 480; y < 560; y += 32)
        this.quad(this.world, x + 16, y + 16, 32, 32, "ground", 1);
    }
  }
  resize() {
    const w = this.host.clientWidth,
      h = this.host.clientHeight;
    this.width = (540 * w) / Math.max(h, 1);
    this.height = 540;
    this.camera.right = this.width;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }
  private actor(a: Actor, sim: Simulation) {
    let mesh = this.actors.get(a.id);
    if (!mesh) {
      mesh = this.quad(this.dynamic, 0, 0, 36, 36, a.kind, 8);
      this.actors.set(a.id, mesh);
    }
    if (a === sim.mario && sim.marioDeath) {
      mesh.visible = true;
      mesh.position.set(sim.marioDeath.x, sim.marioDeath.y, 15);
      mesh.scale.set(32, 32, 1);
      mesh.rotation.z = 0;
      mesh.material = this.material("marioDeath");
      return;
    }
    mesh.visible =
      a.alive &&
      !a.saved &&
      !(a.kind === "mario" && (!sim.marioActive || sim.marioPipe > 0));
    if (!mesh.visible) return;
    const walking = Math.abs(a.body.velocity.x) > 0.1 && a.grounded;
    if (mesh.userData.body !== a.body) {
      mesh.userData.body = a.body;
      mesh.userData.distance = 0;
      mesh.userData.lastX = a.body.position.x;
    }
    if (walking)
      mesh.userData.distance += Math.min(
        12,
        Math.abs(a.body.position.x - mesh.userData.lastX),
      );
    mesh.userData.lastX = a.body.position.x;
    const height =
      (a.kind === "koopa" ? 48 : a.kind === "mario" ? 64 : 32) * a.scale;
    mesh.position.set(
      Math.round(a.body.position.x),
      Math.round(a.body.bounds.max.y - height / 2),
      8,
    );
    mesh.scale.set(
      (a.facing < 0 ? -1 : 1) * 32 * a.scale,
      height,
      1,
    );
    const base =
      a.kind === "mario"
        ? sim.marioStage === 0
          ? "smallMario"
          : sim.marioStage === 2
            ? "whiteMario"
            : "mario"
        : a.flower
          ? a.kind === "goomba"
            ? "fireGoomba"
            : "fireKoopa"
          : a.kind;
    const skid =
      a.kind === "mario" &&
      sim.marioChase > 0 &&
      sim.marioReaction === 0 &&
      (sim.marioAim - a.body.position.x) * a.body.velocity.x < -20;
    const pose = movementPose(
      a.kind === "mario",
      a.grounded,
      mesh.userData.distance,
      walking,
      skid,
    );
    if (a.starLeft > 0) {
      const key = `power-${a.id}`;
      if (!this.materials.has(key))
        this.materials.set(key, this.material(base + pose).clone());
      const material = this.materials.get(key)!;
      material.map = this.material(base + pose).map;
      material.color.set(
        ["#ffffff", "#ffe060", "#90ff90", "#ff90e8"][
          Math.floor(sim.elapsed * 12) % 4
        ],
      );
      mesh.material = material;
    } else mesh.material = this.material(base + pose);
    if (a === sim.mario && sim.marioStun > 0) {
      const key = `mario-hit-${base + pose}`;
      if (!this.materials.has(key))
        this.materials.set(key, (mesh.material as THREE.MeshBasicMaterial).clone());
      const material = this.materials.get(key)!;
      material.map = (mesh.material as THREE.MeshBasicMaterial).map;
      material.transparent = true;
      material.opacity = Math.floor(sim.elapsed * 18) % 2 ? 0.25 : 1;
      mesh.material = material;
      mesh.rotation.z = 0.18;
    } else {
      mesh.rotation.z = 0;
      if (mesh.material instanceof THREE.MeshBasicMaterial) mesh.material.opacity = 1;
    }
    // Small Mario uses a 16x16 source frame. Keep its width at the same
    // pixel scale as the 16x32 big frame so he does not look pinched.
    if (a.kind === "mario" && sim.marioStage === 0)
      mesh.scale.x = (a.facing < 0 ? -1 : 1) * 32;
  }
  render(sim: Simulation, _time: number) {
    const desired = Math.max(
      0,
      Math.min(
        T.worldWidth - this.width,
        sim.player.body.position.x - this.width * 0.36,
      ),
    );
    sim.cameraX = Math.max(0, desired);
    sim.viewWidth = this.width;
    this.camera.position.x = sim.cameraX;
    this.background.position.x = 0;
    for (const c of sim.covers) {
      // Pipes and bushes are already drawn by the static map tiles.
      if (c.kind !== "brick") continue;
      let mesh = this.covers.get(c.id);
      if (!mesh) {
        mesh = this.quad(
          this.world,
          c.x,
          c.y,
          T.brickSize,
          T.brickSize,
          c.question ? "question" : "brick",
          5,
        );
        this.covers.set(c.id, mesh);
      }
      mesh.visible = !c.broken;
      mesh.material = this.material(
        c.question ? (c.used ? "used" : "question") : "brick",
      );
      mesh.position.y =
        c.y - 10 * Math.sin((Math.PI * c.bounce) / T.blockBounceSeconds);
    }
    for (const a of [sim.player, ...sim.npcs, sim.mario]) this.actor(a, sim);
    for (const p of this.particles) this.dynamic.remove(p);
    this.particles = [];
    for (const item of sim.items)
      this.particles.push(
        this.quad(
          this.dynamic,
          item.body.position.x,
          item.body.position.y,
          32,
          32,
          item.kind,
          4,
        ),
      );
    for (const f of sim.fireballs) {
      const size = 16 * (f.scale ?? 1);
      this.particles.push(
        this.quad(this.dynamic, f.x, f.y, size, size, "fireball", 10),
      );
      this.particles.push(
        this.quad(
          this.dynamic,
          f.x - Math.sign(f.vx) * 3,
          f.y - 2,
          size * 0.5,
          size * 0.5,
          "#ffe578",
          11,
        ),
      );
    }
    for (const p of sim.particles)
      this.particles.push(
        this.quad(
          this.dynamic,
          Math.round(p.x),
          Math.round(p.y),
          p.settled ? p.size * 2 : p.size,
          p.settled ? 2 : p.size,
          p.color,
          14,
        ),
      );
    for (const n of sim.npcs) {
      if (n.warned && n.alive && !n.saved)
        this.particles.push(
          this.quad(
            this.dynamic,
            n.body.position.x,
            n.body.position.y - 29 * n.scale,
            5,
            5,
            "#ffe077",
            12,
          ),
        );
    }
    this.renderer.render(this.scene, this.camera);
  }
  screen(x: number, y: number, sim: Simulation) {
    return {
      x: ((x - sim.cameraX) / this.width) * 100,
      y:
        (((y / this.height) * this.host.clientHeight) /
          this.host.parentElement!.clientHeight) *
        100,
    };
  }
  dispose() {
    this.observer.disconnect();
    this.geometry.dispose();
    for (const m of this.materials.values()) m.dispose();
    for (const t of Object.values(this.art.textures)) t.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
