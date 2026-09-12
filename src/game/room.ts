import { Body, PhysicsWorld, overlaps } from "./physics.ts";
import { areaData, areaGaps, terrainRects } from "./levels.ts";
import type { Area } from "./levels.ts";
import { MAP_TOP, TUNING as T } from "./config.ts";
import type { Actor, Obstacle } from "./simulation.ts";
import { swimField } from "./navigation.ts";
import type { Point } from "./physics.ts";

export type FlagClaim = "goomba" | "mario";
export type Flagpole = {
  x: number;
  top: number;
  bottom: number;
  claim: FlagClaim | null;
  raise: number;
};

export class Room {
  data: Area;
  offset: number;
  obstacles: Obstacle[] = [];
  solids: Body[] = [];
  gaps: [number, number][];
  goalX: number;
  flagpole?: Flagpole;
  platforms: {
    body: Body;
    origin: { x: number; y: number };
    kind: number;
    phase: number;
  }[] = [];
  private swimFields = new Map<string, (point: Point) => Point[]>();
  coins: { x: number; y: number; collected: boolean }[] = [];

  constructor(
    physics: PhysicsWorld,
    id: string,
    offset: number,
    firstId: number,
  ) {
    this.data = areaData(id);
    this.offset = offset;
    this.gaps = areaGaps(this.data, offset);
    this.goalX =
      offset + (this.data.goal?.column ?? this.data.width - 3) * 32 + 16;
    const pole = this.data.objects.find((o) => o.opcode === 35);
    if (pole)
      this.flagpole = {
        x: offset + pole.column * 32 + 16,
        top: MAP_TOP + 3 * 32 + 16,
        bottom: MAP_TOP + 11 * 32 + 16,
        claim: null,
        raise: 0,
      };
    this.data.tiles.forEach((row, y) =>
      row.forEach((tile, x) => {
        if (tile === 194 || tile === 195)
          this.coins.push({
            x: offset + x * 32 + 16,
            y: MAP_TOP + y * 32 + 16,
            collected: false,
          });
      }),
    );
    for (const rect of terrainRects(this.data, offset))
      this.solids.push(
        physics.rectangle(
          rect.x + rect.width / 2,
          rect.y + rect.height / 2,
          rect.width,
          rect.height,
          true,
        ),
      );
    for (const pipe of this.data.pipes) {
      const x = offset + (pipe.column + pipe.width / 2) * 32;
      const top = MAP_TOP + pipe.row * 32,
        height = pipe.height * 32;
      const body = physics.rectangle(
        x,
        top + height / 2,
        pipe.width * 32,
        height,
        true,
      );
      this.solids.push(body);
      this.obstacles.push({
        id: firstId++,
        x,
        y: top + height - 18,
        height,
        kind: "pipe",
        broken: false,
        used: false,
        bounce: 0,
        body,
      });
    }
    for (const block of [...this.data.blocks].sort(
      (a, b) => Number(a.kind === "question") - Number(b.kind === "question"),
    )) {
      const x = offset + block.column * 32 + 16,
        y = MAP_TOP + block.row * 32 + 16;
      const body = physics.rectangle(x, y, 32, 32, true);
      body.headOnly = block.hidden;
      this.solids.push(body);
      this.obstacles.push({
        id: firstId++,
        x,
        y,
        kind: "brick",
        question: block.kind === "question",
        hidden: block.hidden,
        broken: false,
        used: false,
        bounce: 0,
        body,
      });
    }
    for (const enemy of this.data.enemies)
      if (enemy.type >= 36 && enemy.type <= 44) {
        const width = enemy.type >= 43 ? 48 : 96;
        const origin = {
          x: offset + enemy.column * 32 + width / 2,
          y: MAP_TOP + enemy.row * 32 + 8,
        };
        const body = physics.rectangle(origin.x, origin.y, width, 16, true);
        this.solids.push(body);
        this.platforms.push({
          body,
          origin,
          kind: enemy.type,
          phase: enemy.column % 7,
        });
      }
  }

  place(actor: Actor, desiredX: number) {
    const half = actor.body.width / 2,
      height = actor.body.height;
    for (let attempt = 0; attempt < this.data.width; attempt++) {
      const x = Math.max(
        this.offset + half + 1,
        Math.min(
          this.goalX - 48,
          desiredX + (attempt % 2 ? 1 : -1) * Math.ceil(attempt / 2) * 32,
        ),
      );
      const supports = this.solids
        .filter(
          (s) =>
            !s.headOnly &&
            x + half > s.bounds.min.x &&
            x - half < s.bounds.max.x &&
            s.bounds.min.y >= MAP_TOP + 80,
        )
        .sort((a, b) => b.bounds.min.y - a.bounds.min.y);
      for (const support of supports) {
        Body.setPosition(actor.body, {
          x,
          y: support.bounds.min.y - height / 2,
        });
        if (!overlaps(actor.body, this.solids, 0.01).length) {
          Body.setVelocity(actor.body, { x: 0, y: 0 });
          actor.homeX = x;
          actor.grounded = true;
          return;
        }
      }
    }
    throw new Error(`No safe entrance in area ${this.data.id} at ${desiredX}`);
  }

  updatePlatforms(elapsed: number, actors: Actor[]) {
    for (const platform of this.platforms) {
      const { body, origin, kind, phase } = platform;
      const before = { ...body.position };
      const riding = actors.filter(
        (a) =>
          a.alive &&
          !a.saved &&
          a.body.velocity.y >= 0 &&
          Math.abs(a.body.bounds.max.y - body.bounds.min.y) < 3 &&
          a.body.bounds.max.x > body.bounds.min.x &&
          a.body.bounds.min.x < body.bounds.max.x,
      );
      const angle = (elapsed * T.platformSpeed) / T.platformTravel + phase;
      const vertical =
        kind === 36 ||
        kind === 37 ||
        kind === 38 ||
        kind === 39 ||
        kind === 41 ||
        kind >= 43;
      body.motion = {
        x: origin.x,
        y: origin.y,
        vertical,
        phase,
        time: elapsed,
      };
      body.position.x =
        origin.x + (vertical ? 0 : Math.sin(angle) * T.platformTravel);
      body.position.y =
        origin.y + (vertical ? Math.sin(angle) * T.platformTravel : 0);
      for (const actor of riding)
        Body.setPosition(actor.body, {
          x: actor.body.position.x + body.position.x - before.x,
          y: actor.body.position.y + body.position.y - before.y,
        });
    }
  }
  onSpring(actor: Actor) {
    return this.data.objects.some(
      (o) =>
        o.opcode === 33 &&
        Math.abs(actor.body.position.x - this.offset - o.column * 32 - 16) <
          28 &&
        Math.abs(actor.body.bounds.max.y - MAP_TOP - o.row * 32) < 12,
    );
  }
  swimPath(actor: Actor, target?: Point) {
    target ??= {
      x: this.goalX - 16 - actor.body.width / 2 + 1,
      y: MAP_TOP + (this.data.goal?.row ?? 8) * 32 + 32,
    };
    const key = `${actor.body.width},${actor.body.height},${Math.round(target.x / 16)},${Math.round(target.y / 16)}`;
    let field = this.swimFields.get(key);
    if (!field) {
      field = swimField(
        this.solids,
        this.offset,
        this.data.width * 32,
        actor.body,
        target,
      );
      if (this.swimFields.size > 12) this.swimFields.clear();
      this.swimFields.set(key, field);
    }
    return field(actor.body.position);
  }
  clearNavigation() {
    this.swimFields.clear();
  }
  atDoor(actor: Actor) {
    const goal = this.data.goal;
    return (
      !!goal &&
      goal.kind !== "pipe" &&
      actor.body.position.x >= this.goalX &&
      actor.body.bounds.max.y >= MAP_TOP + (goal.row - 1) * 32 &&
      actor.body.bounds.min.y < T.groundY + 16
    );
  }
}
