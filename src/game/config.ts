import { WORLD_1_1 as LEVEL } from "./world-1-1.ts";

export const TUNING = {
  population: 30,
  idleRadius: 65,
  idleSpeed: 0.65,
  required: 12,
  finishWindow: 5,
  walkSpeed: 2.6,
  jumpSpeed: 11,
  deathSequenceSeconds: 2.8,
  warningRange: 185,
  hearingRange: 440,
  warningCooldown: 1.3,
  warningSound: 0.35,
  bubbleTime: 2.1,
  fasterAt: 30,
  fireballsAt: 60,
  firstMarioAt: 5,
  marioSight: 520,
  marioChaseSeconds: 6,
  marioReaction: 0.25,
  marioCrowdLimit: 5,
  marioCrowdRange: 800,
  marioCrowdSpeedBonus: 2,
  starSeconds: 10,
  giantScale: 3,
  marioStunSeconds: 2,
  marioDefeatSeconds: 3,
  playerFireCooldown: 1,
  playerFireballScale: 3,
  blockBounceSeconds: 0.22,
  pipeWidth: 64,
  pipeHeight: 64,
  brickSize: 32,
  groundY: 430,
  goalX: LEVEL.castleDoorX * 32 + 16,
  worldWidth: LEVEL.columns * 32,
} as const;

export const PHRASES = [
  "Run! Mario is coming!",
  "Move! The plumber is coming!",
  "Run! The demon is coming!",
  "Run! The mustache is coming!",
  "Get out! The red hat is coming!",
  "Run for the goal! Mario is close!",
  "Take cover! Mario is on his way!",
  "Flee! Those boots are coming!",
  "Scramble! The plumber is almost here!",
  "Run your shells off! Mario is coming!",
  "Run! Trouble has a mustache, and it's coming!",
  "Get to safety! Mario is coming!",
];

export const GAPS = LEVEL.gaps.map(
  ([left, right]) => [left * 32, right * 32] as const,
);
export const MAP_TOP = TUNING.groundY - LEVEL.groundRow * 32;
export const COVER_LAYOUT: {
  x: number;
  y: number;
  kind: "bush" | "pipe" | "brick";
  height?: number;
  question?: boolean;
}[] = [
  ...Array.from({ length: 5 }, (_, repeat) =>
    [216, 392, 688].map((x) => ({
      x: (x + repeat * 768) * 2,
      y: TUNING.groundY - 18,
      kind: "bush" as const,
    })),
  )
    .flat()
    .filter(
      (c) =>
        c.x < TUNING.goalX &&
        !LEVEL.stairs.some(
          ([row, first, last]) =>
            row === 12 && c.x >= first * 32 && c.x <= (last + 1) * 32,
        ),
    ),
  ...LEVEL.pipes.map((p) => ({
    x: (p.column + 1) * 32,
    y: TUNING.groundY - 18,
    height: p.height * 32,
    kind: "pipe" as const,
  })),
  ...LEVEL.bricks.map(([column, row]) => ({
    x: column * 32 + 16,
    y: MAP_TOP + row * 32 + 16,
    kind: "brick" as const,
  })),
  ...LEVEL.questions.map(([column, row]) => ({
    x: column * 32 + 16,
    y: MAP_TOP + row * 32 + 16,
    kind: "brick" as const,
    question: true,
  })),
];
