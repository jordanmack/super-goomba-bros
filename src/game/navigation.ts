import { Body } from "./physics.ts";
import type { Point } from "./physics.ts";
import { MAP_TOP, TUNING as T } from "./config.ts";
import {
  firebarHits,
  plannerFirebarFrame,
  type Firebar,
} from "./castle.ts";

type Box = { min: Point; max: Point };

// One-tile wells such as the World 1-1 last pipe against the first stair:
// taller solids on both sides, so walking in leaves no room to back up.
export function enclosedWell(solids: { bounds: Box }[], platform: Box) {
  if (platform.max.x - platform.min.x > T.brickSize + 8) return false;
  const taller = (side: "left" | "right") => {
    const edge = side === "left" ? platform.min.x : platform.max.x;
    return solids.some((solid) => {
      const b = solid.bounds;
      if (b.min.y >= platform.min.y - 8 || b.max.y <= platform.min.y)
        return false;
      return side === "left"
        ? Math.abs(b.max.x - edge) <= 4 && b.min.x < edge - 8
        : Math.abs(b.min.x - edge) <= 4 && b.max.x > edge + 8;
    });
  };
  return taller("left") && taller("right");
}

// Try discrete 60 Hz arcs against the same rectangles used by Arcade. NPCs
// choose a safe landing before leaving a ledge; the player's jump is unchanged.
export function planJump(
  body: Body,
  solids: Body[],
  direction: number,
  speed: number,
  impulse: number,
  accept: (landing: { x: number; y: number; frames: number }) => boolean = () =>
    true,
  preferLow = false,
  gravity?: { hold: number; fall: number },
  clear?: (point: { x: number; y: number; frames: number }) => boolean,
  // Drop paths that replay with no hold ask for 0. A higher-scored delayed
  // arc must not hide a delay-0 candidate those paths can still fly.
  maxDelay?: number,
  // A running drop slides across a one-tile hole. Only a detour asks for a
  // straight fall onto the floor under that hole.
  vertical = false,
) {
  const half = body.width / 2,
    tall = body.height / 2;
  const start = body.position;
  const nearby = solids
    .filter(
      (s) => s.bounds.max.x > start.x - 500 && s.bounds.min.x < start.x + 500,
    )
    .map((s) => ({
      bounds: s.bounds,
      headOnly: s.headOnly,
      motion: s.motion,
      width: s.width,
      height: s.height,
    }));
  const options: {
    vx: number;
    delay: number;
    x: number;
    y: number;
    score: number;
  }[] = [];
  const cap = Math.max(0, speed);
  const paces = [
    ...new Set(
      [
        cap,
        Math.min(cap, T.walkSpeed),
        cap * 0.7,
        // A running drop keeps its pace, so it slides off a one-tile hole
        // onto the next pit. Pace 0 falls onto the floor directly below.
        vertical && impulse <= 0 ? 0 : -1,
      ].filter((pace) => pace === 0 || (pace > 0.4 && pace <= cap + 1e-9)),
    ),
  ];
  const holdG = (gravity?.hold ?? T.jumpHoldGravity) / 3600,
    fallG = (gravity?.fall ?? T.npcJumpFallGravity) / 3600;
  for (const delay of [0, 10, 18, 24]) {
    if (maxDelay !== undefined && delay > maxDelay) continue;
    for (const pace of paces) {
      let x = start.x,
        y = start.y;
      const lift = impulse <= 0 ? 0 : impulse;
      let vy = -lift;
      const vx = pace * direction;
      for (let frame = 0; frame < 140; frame++) {
        const oldX = x,
          oldY = y;
        vy += vy < 0 ? holdG : fallG;
        if (frame >= delay) x += vx;
        y += vy;
        let landed = false,
          blocked = false;
        for (const solid of nearby) {
          let b = solid.bounds,
            was = b;
          if (solid.motion) {
            const box = (at: Point) => ({
              min: { x: at.x - solid.width / 2, y: at.y - solid.height / 2 },
              max: { x: at.x + solid.width / 2, y: at.y + solid.height / 2 },
            });
            b = box(solid.motion.at(frame));
            // Which side the body came from is judged against where the
            // solid was a frame ago. A lift sinking onto a rising head
            // otherwise reads as neither a ceiling nor a side, and the arc
            // passes through it.
            was = box(solid.motion.at(Math.max(0, frame - 1)));
          }
          if (
            x + half <= b.min.x ||
            x - half >= b.max.x ||
            y + tall <= b.min.y ||
            y - tall >= b.max.y
          )
            continue;
          if (vy > 0 && oldY + tall <= was.min.y + 0.1 && !solid.headOnly) {
            const progress = (x - start.x) * direction;
            // Pace 0 has no horizontal progress. Count it only for a lower
            // floor, so a body still standing on its ledge does not "land".
            const verticalDrop =
              vertical && lift === 0 && b.min.y - tall > start.y + 16;
            if (
              (progress > 16 || verticalDrop) &&
              b.max.x - b.min.x >= half &&
              // No floor lies below the ground line. A lift down there is
              // sinking out of a pit, not a landing.
              b.min.y <= T.groundY + 0.5 &&
              // The touchdown cell is part of the arc, so it gets the same
              // hazard probe as every airborne frame before it.
              (!clear ||
                clear({ x, y: b.min.y - tall, frames: frame + 1 })) &&
              accept({ x, y: b.min.y - tall, frames: frame + 1 }) &&
              !enclosedWell(nearby, b)
            ) {
              const margin = Math.min(x + half - b.min.x, b.max.x - x + half);
              options.push({
                vx,
                delay,
                x,
                y: b.min.y - tall,
                score: progress + Math.min(20, margin),
              });
            }
            landed = true;
            break;
          }
          if (vy < 0 && oldY - tall >= was.max.y - 0.1) {
            y = b.max.y + tall;
            vy = 0;
            continue;
          }
          if (
            !solid.headOnly &&
            (oldX + half <= was.min.x + 0.1 || oldX - half >= was.max.x - 0.1)
          ) {
            blocked = true;
            break;
          }
        }
        if (landed || blocked || y > 630) break;
        // Probe after the ceiling bump above, so the hazard test uses the y the
        // body actually occupies rather than one it is pushed out of.
        if (clear && !clear({ x, y, frames: frame + 1 })) break;
      }
    }
  }
  return options.sort(
    (a, b) => (preferLow ? b.y - a.y : 0) || b.score - a.score,
  )[0];
}

// A warned fish's hop on land (#229). Each pace flies a discrete 60 Hz arc
// with one gravity, sliding along a wall face as Arcade does, to its first
// landing. An arc that falls below the ground line has no floor and is left
// out. Returns the pace that lands farthest along `direction`, or undefined.
export function planHop(
  body: Body,
  solids: Body[],
  direction: number,
  paces: number[],
  impulse: number,
  gravity: number,
) {
  const half = body.width / 2,
    tall = body.height / 2;
  const start = body.position;
  const nearby = solids.filter(
    (s) => s.bounds.max.x > start.x - 300 && s.bounds.min.x < start.x + 300,
  );
  let best: { vx: number; x: number; y: number } | undefined;
  for (const pace of paces) {
    const vx = pace * direction;
    let x = start.x,
      y = start.y,
      vy = -impulse,
      landing: Point | undefined;
    for (let frame = 0; frame < 140 && !landing && y < 630; frame++) {
      const oldX = x,
        oldY = y;
      vy += gravity;
      x += vx;
      y += vy;
      for (const solid of nearby) {
        const b = solid.bounds;
        if (
          x + half <= b.min.x ||
          x - half >= b.max.x ||
          y + tall <= b.min.y ||
          y - tall >= b.max.y
        )
          continue;
        if (vy > 0 && oldY + tall <= b.min.y + 0.1 && !solid.headOnly) {
          if (b.min.y <= T.groundY + 0.5) landing = { x, y: b.min.y - tall };
          else y = 630;
          break;
        }
        if (vy < 0 && oldY - tall >= b.max.y - 0.1) {
          y = b.max.y + tall;
          vy = 0;
        } else if (!solid.headOnly) x = oldX;
      }
    }
    if (landing && (!best || (landing.x - best.x) * direction > 0))
      best = { vx, ...landing };
  }
  return best;
}

// Frame-by-frame walk from here to exitX: 1 steps at vx, 0 holds. Undefined
// when no route stays off every bar and every x where `wall` is true. A
// crossing usually advances, waits out a ball, then advances again.
export function firebarCrossing(
  startX: number,
  y: number,
  vx: number,
  exitX: number,
  half: number,
  tall: number,
  simFrame: number,
  bars: Firebar[],
  wall: (x: number) => boolean = () => false,
  // Other timed hazards, such as Podoboos, at a planner flight.
  blocked: (x: number, flight: number) => boolean = () => false,
): Uint8Array | undefined {
  const direction = Math.sign(vx);
  const pace = Math.abs(vx);
  const cells = Math.ceil(Math.abs(exitX - startX) / Math.max(0.01, pace));
  if (cells <= 0) return new Uint8Array(0);
  const lo = Math.min(startX, exitX),
    hi = Math.max(startX, exitX);
  // Keep every bar whose arm can reach the walked span. A flat margin drops
  // the very bar being crossed, since a length-12 hub sits 184 px away.
  const reach = bars.filter((bar) => {
    const span =
      (bar.length - 1) * T.firebarSpacing + T.firebarBallRadius + half;
    return bar.x > lo - span && bar.x < hi + span;
  });
  if (!reach.length) return new Uint8Array(0);
  const xAt = (cell: number) => startX + direction * cell * pace;
  const hit = (cell: number, flight: number) => {
    const x = xAt(cell);
    const frame = plannerFirebarFrame(simFrame, flight);
    for (const bar of reach)
      if (firebarHits(bar, frame, x, y, half, tall)) return true;
    return blocked(x, flight);
  };
  // Two bars at different speeds realign only at their joint period, so allow
  // the slower one a full revolution plus the walk itself.
  const horizon =
    Math.ceil((32 * 256) / Math.min(...reach.map((b) => b.nesSpeed))) + cells;
  const width = horizon + 1;
  const from = new Int32Array((cells + 1) * width).fill(-1);
  from[0] = -2;
  const queue = [0];
  let goal = -1;
  for (let head = 0; head < queue.length && goal < 0; head++) {
    const node = queue[head]!;
    const cell = Math.floor(node / width),
      frame = node % width;
    if (frame >= horizon) continue;
    for (const move of [1, 0]) {
      const next = cell + move;
      if (next > cells) continue;
      const index = next * width + frame + 1;
      if (from[index] !== -1) continue;
      // A solid inside the span stops the step. Holding does not cross it.
      if (move && wall(xAt(next))) continue;
      if (hit(next, frame + 1)) continue;
      from[index] = node;
      if (next === cells) {
        goal = index;
        break;
      }
      queue.push(index);
    }
  }
  if (goal < 0) return;
  const moves: number[] = [];
  for (let node = goal; from[node]! >= 0; node = from[node]!)
    moves.push(
      Math.floor(node / width) > Math.floor(from[node]! / width) ? 1 : 0,
    );
  return Uint8Array.from(moves.reverse());
}

// A shared distance field lets swimmers route around coral and pipe walls.
// Grid points include tile centers, so normal bodies fit one-tile corridors.
export function swimField(
  solids: Body[],
  offset: number,
  widthPixels: number,
  body: Body,
  target: Point,
) {
  const width = widthPixels / 16 + 1,
    height = 31;
  const free = new Uint8Array(width * height).fill(1);
  const distance = new Int32Array(width * height).fill(-1);
  const halfW = body.width / 2,
    halfH = body.height / 2;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (
        x * 16 < halfW ||
        x * 16 > widthPixels - halfW ||
        y * 16 < 64 + halfH ||
        y * 16 > 480 - halfH
      )
        free[y * width + x] = 0;
  for (const solid of solids) {
    if (solid.headOnly) continue;
    const b = solid.bounds;
    const left = Math.max(0, Math.floor((b.min.x - halfW - offset) / 16) + 1);
    const right = Math.min(
      width - 1,
      Math.ceil((b.max.x + halfW - offset) / 16) - 1,
    );
    const top = Math.max(0, Math.floor((b.min.y - halfH - MAP_TOP) / 16) + 1);
    const bottom = Math.min(
      height - 1,
      Math.ceil((b.max.y + halfH - MAP_TOP) / 16) - 1,
    );
    for (let y = top; y <= bottom; y++)
      for (let x = left; x <= right; x++) free[y * width + x] = 0;
  }
  const point = (index: number) => ({
    x: offset + (index % width) * 16,
    y: MAP_TOP + Math.floor(index / width) * 16,
  });
  const nearest = (p: Point, reachable: boolean) => {
    let best = -1,
      score = Infinity;
    for (let i = 0; i < free.length; i++)
      if (free[i] && (!reachable || distance[i] >= 0)) {
        const q = point(i),
          d = (q.x - p.x) ** 2 + (q.y - p.y) ** 2;
        if (d < score) {
          score = d;
          best = i;
        }
      }
    return best;
  };
  const neighbors = (index: number) =>
    [
      index - width,
      index + width,
      index % width ? index - 1 : -1,
      index % width < width - 1 ? index + 1 : -1,
    ].filter((next) => next >= 0 && next < free.length && free[next]);
  const goal = nearest(target, false);
  if (goal < 0) return (_start: Point): Point[] => [];
  const queue = [goal];
  distance[goal] = 0;
  for (let head = 0; head < queue.length; head++) {
    const node = queue[head];
    for (const next of neighbors(node))
      if (distance[next] < 0) {
        distance[next] = distance[node] + 1;
        queue.push(next);
      }
  }
  return (start: Point) => {
    let node = nearest(start, true);
    if (node < 0) return [];
    const result = [point(node)];
    while (distance[node] > 0) {
      const next = neighbors(node).find(
        (n) => distance[n] === distance[node] - 1,
      );
      if (next === undefined) break;
      node = next;
      result.push(point(node));
    }
    result.push(target);
    return result;
  };
}
