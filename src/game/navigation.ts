import { Body } from "./physics.ts";
import type { Point } from "./physics.ts";
import { MAP_TOP, TUNING as T } from "./config.ts";

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
  accept: (landing: { x: number; y: number }) => boolean = () => true,
  preferLow = false,
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
      [cap, Math.min(cap, T.walkSpeed), cap * 0.7].filter(
        (pace) => pace > 0.4 && pace <= cap + 1e-9,
      ),
    ),
  ];
  const holdG = T.jumpHoldGravity / 3600,
    fallG = T.jumpFallGravity / 3600;
  for (const delay of [0, 10, 18, 24])
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
          let b = solid.bounds;
          if (solid.motion) {
            const motion = solid.motion;
            const travel =
              Math.sin(
                ((motion.time + frame / 60) * T.platformSpeed) /
                  T.platformTravel +
                  motion.phase,
              ) * T.platformTravel;
            const mx = motion.x + (motion.vertical ? 0 : travel),
              my = motion.y + (motion.vertical ? travel : 0);
            b = {
              min: { x: mx - solid.width / 2, y: my - solid.height / 2 },
              max: { x: mx + solid.width / 2, y: my + solid.height / 2 },
            };
          }
          if (
            x + half <= b.min.x ||
            x - half >= b.max.x ||
            y + tall <= b.min.y ||
            y - tall >= b.max.y
          )
            continue;
          if (vy > 0 && oldY + tall <= b.min.y + 0.1 && !solid.headOnly) {
            const progress = (x - start.x) * direction;
            if (
              progress > 16 &&
              b.max.x - b.min.x >= half &&
              accept({ x, y: b.min.y - tall }) &&
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
          if (vy < 0 && oldY - tall >= b.max.y - 0.1) {
            y = b.max.y + tall;
            vy = 0;
            continue;
          }
          if (
            !solid.headOnly &&
            (oldX + half <= b.min.x + 0.1 || oldX - half >= b.max.x - 0.1)
          ) {
            blocked = true;
            break;
          }
        }
        if (landed || blocked || y > 630) break;
      }
    }
  return options.sort(
    (a, b) => (preferLow ? b.y - a.y : 0) || b.score - a.score,
  )[0];
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
