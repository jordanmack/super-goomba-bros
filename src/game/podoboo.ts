import { imposeGravity, type GravityBytes } from "./platform-motion.ts";

// SMB1 Podoboos (InitPodoboo, MovePodoboo), in NES pixels. The screen is 2x.
// `y` is Enemy_Y_Position from the top of the screen, with the high byte, so
// 240 and past is below it.

// Enemy_Y_HighPos 2 and Enemy_Y_Position 2: just below the screen.
export const PODOBOO_START_Y = 0x102;
// MovePodoboo's leap speed, $f9.
export const PODOBOO_LEAP = -7;
// MoveJ_EnemyVertically: $1c down, at most 3 px a frame.
export const PODOBOO_GRAVITY = 0x1c;
export const PODOBOO_MAX_SPEED = 3;
// Interval timers count down once every 21 frames.
export const PODOBOO_INTERVAL_FRAMES = 21;
// Bounding box control $09 from the sprite's top-left: x 3-13, y 14-20 of a
// 16px wide sprite, so a 10x6 box centered on its column.
export const PODOBOO_BOX = { halfW: 5, top: 14, bottom: 20 } as const;

export type PodobooMotion = GravityBytes & {
  timer: number; // EnemyIntervalTimer
};

// InitPodoboo: below the screen, with one interval before the first leap.
export function initPodoboo(): PodobooMotion {
  return { y: PODOBOO_START_Y, speed: 0, force: 0, dummy: 0, timer: 1 };
}

// One frame. `random` is PseudoRandomBitReg+1,x for this frame. When the
// timer runs out it starts over below the screen and leaps, and the next leap
// waits at least six intervals plus the random low nybble.
export function stepPodoboo(m: PodobooMotion, frame: number, random: number) {
  if (m.timer > 0 && frame % PODOBOO_INTERVAL_FRAMES === 0) m.timer--;
  if (m.timer === 0) {
    m.y = PODOBOO_START_Y;
    m.force = random | 0x80;
    m.timer = (m.force & 0x0f) | 0x06;
    m.speed = PODOBOO_LEAP;
  }
  imposeGravity(m, 0, PODOBOO_GRAVITY, 0, PODOBOO_MAX_SPEED);
}

// EnemyGfxHandler flips it upside down unless it is moving up.
export function podobooFalling(m: PodobooMotion) {
  return m.speed >= 0;
}
