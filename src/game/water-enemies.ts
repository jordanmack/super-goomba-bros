import { imposeGravity } from "./platform-motion.ts";

// SMB1 Bloopers and Cheep Cheeps, in NES pixels. The screen is 2x. Each step
// is one frame and returns that frame's move in NES pixels. Y grows down, and
// `top` is Enemy_Y_Position, the top of the enemy.

export type BlooperMotion = {
  kind: "blooper";
  counter: number; // BlooperMoveCounter
  force: number; // Enemy_Y_MoveForce, also BlooperMoveSpeed
  timer: number; // EnemyIntervalTimer
  dir: 1 | -1; // Enemy_MovingDir
};

export type SwimCheepMotion = {
  kind: "swim";
  red: boolean;
  xForce: number; // Enemy_X_MoveForce
  yDummy: number; // Enemy_YMF_Dummy
  down: boolean; // CheepCheepMoveMFlag is $10
  originY: number; // CheepCheepOrigYPos
  // Only enemy slots 2 and up drift up and down.
  wobble: boolean;
};

export type FlyCheepMotion = {
  kind: "fly";
  xSpeed: number; // Enemy_X_Speed, signed, in 1/16 px
  xForce: number; // Enemy_X_MoveForce
  y: number; // Enemy_Y_Position with the high byte
  speed: number; // Enemy_Y_Speed
  force: number; // Enemy_Y_MoveForce
  dummy: number; // Enemy_YMF_Dummy
};

export type WaterMotion = BlooperMotion | SwimCheepMotion | FlyCheepMotion;

export type Step = { dx: number; dy: number };

// Interval timers count down once every 21 frames.
const INTERVAL_FRAMES = 21;

export function initBlooper(): BlooperMotion {
  // InitBloober and SetBBox: no speed, moving left.
  return { kind: "blooper", counter: 0, force: 0, timer: 0, dir: -1 };
}

// MoveBloober with ProcSwimmingB. A pulse speeds up to 2 px/frame and back
// to 0 in 8-frame steps, moving up and sideways by the same amount. Then it
// floats down 1 px every other frame until its timer runs out and it is no
// longer more than 16px above the player (`above`), and pulses again.
export function stepBlooper(
  m: BlooperMotion,
  frame: number,
  top: number,
  above: boolean,
): Step {
  if (m.timer > 0 && frame % INTERVAL_FRAMES === 0) m.timer--;
  let dy = 0;
  if (m.counter & 2) {
    if (m.timer > 0 || above) {
      if (!(frame & 1)) dy = 1;
    } else m.counter = 0;
  } else if ((frame & 7) === 0) {
    if (m.counter & 1) {
      m.force--;
      if (m.force === 0) {
        m.counter++;
        m.timer = 2;
      }
    } else {
      m.force++;
      if (m.force === 2) m.counter++;
    }
  }
  // It does not rise above the status bar edge.
  if (top + dy - m.force >= 0x20) dy -= m.force;
  return { dx: m.dir * m.force, dy };
}

// EnemyGfxHandler draws the tall frame, 3px lower, unless the timer is 1.
export function blooperExtended(m: BlooperMotion) {
  return m.timer !== 1;
}

// MoveSwimmingCheepCheep. Always left: grey loses $40 of force a frame and
// red $80, so grey moves 1px every 4 frames and red every 2. A wobbling one
// drifts 1px every 8 frames and turns 15px from where it started.
// A `heading` (each axis -1, 0, or 1) replaces the left move: each of those
// 1px steps goes along it, and its y moves the wobble's center too.
export function stepSwimCheep(
  m: SwimCheepMotion,
  top: number,
  heading?: { x: number; y: number },
): Step {
  const x = m.xForce - (m.red ? 0x80 : 0x40);
  m.xForce = x & 0xff;
  const carry = x < 0;
  const dx = !carry ? 0 : heading ? heading.x : -1;
  const drift = carry && heading ? heading.y : 0;
  const wobble = swimWobble(m, top);
  m.originY += drift;
  return { dx, dy: wobble + drift };
}

function swimWobble(m: SwimCheepMotion, top: number) {
  if (!m.wobble) return 0;
  let dy: number;
  if (m.down) {
    const d = m.yDummy + 0x20;
    m.yDummy = d & 0xff;
    dy = d >> 8;
  } else {
    const d = m.yDummy - 0x20;
    m.yDummy = d & 0xff;
    dy = d < 0 ? -1 : 0;
  }
  const diff = top + dy - m.originY;
  if (Math.abs(diff) >= 15) m.down = diff < 0;
  return dy;
}

// PRandomSubtracter. The force index reaches past its five bytes into
// FlyCCBPriority and the first bytes of MoveFlyingCheepCheep.
const FLY_SUBTRACTER = [
  0xf8, 0xa0, 0x70, 0xbd, 0x00, 0x20, 0x20, 0x20, 0x00, 0x00, 0xb5, 0x1e, 0x29,
  0x20, 0xf0, 0x08,
];

const signed = (byte: number) => ((byte & 0xff) ^ 0x80) - 0x80;

// MoveFlyingCheepCheep: MoveEnemyHorizontally, then gravity $0d down with a
// max fall of 5.
export function stepFlyCheep(m: FlyCheepMotion): Step {
  const speed = signed(m.xSpeed);
  const force = m.xForce + ((speed << 4) & 0xff);
  m.xForce = force & 0xff;
  const dx = (speed >> 4) + (force >> 8);
  const before = m.y;
  imposeGravity(m, 0, 0x0d, 0, 5);
  const diff = (m.y - FLY_SUBTRACTER[m.force >> 4]!) & 0xff;
  if ((diff & 0x80 ? 0x100 - diff : diff) < 8) m.force = (m.force + 0x10) & 0xff;
  return { dx, dy: m.y - before };
}

// FlyCCXPositionData, FlyCCXSpeedData, and FlyCCTimerData.
const FLY_X_POSITION = [
  0x80, 0x30, 0x40, 0x80, 0x30, 0x50, 0x50, 0x70, 0x20, 0x40, 0x80, 0xa0, 0x70,
  0x40, 0x90, 0x68,
];
const FLY_X_SPEED = [
  0x0e, 0x05, 0x06, 0x0e, 0x1c, 0x20, 0x10, 0x0c, 0x1e, 0x22, 0x18, 0x14,
];
export const FLY_TIMER = [0x10, 0x60, 0x20, 0x48];
// The leap starts below the screen at $f8, rising at 5 px/frame.
export const FLY_START_Y = 0xf8;

// InitFlyingCheepCheep. `playerSpeed` is Player_X_Speed in 1/16 px. The
// three bytes are the pseudorandom bits. Returns the motion and the X offset
// from the player in NES px.
export function initFlyCheep(
  playerSpeed: number,
  lsfr: [number, number, number],
): { motion: FlyCheepMotion; offset: number } {
  const low = lsfr[0] & 3;
  let add = 0;
  if (playerSpeed) {
    add = 4;
    if ((playerSpeed & 0xff) >= 0x19) add = 8;
  }
  let seed = add + low;
  if (lsfr[1] & 3) seed = lsfr[2] & 0x0f;
  let xSpeed = FLY_X_SPEED[add + low]!;
  if (!playerSpeed && seed & 2) xSpeed = -xSpeed;
  const offset = seed & 2 ? FLY_X_POSITION[seed]! : -FLY_X_POSITION[seed]!;
  return {
    motion: {
      kind: "fly",
      xSpeed,
      xForce: 0,
      y: FLY_START_Y,
      speed: -5,
      force: 0,
      dummy: 0,
    },
    offset,
  };
}

// Enemy17YPosData: the heights a swimming Cheep Cheep enters at.
const SWIM_Y = [0x40, 0x30, 0x90, 0x50, 0x20, 0x60, 0xa0, 0x70];

// BulletBillCheepCheep in water. Uses BitMFilter so each of the eight heights
// is used once before any repeats. Returns the height and the new filter.
export function swimCheepHeight(filter: number, lsfr: number) {
  if (filter === 0xff) filter = 0;
  let i = lsfr & 7;
  while (filter & (1 << i)) i = (i + 1) & 7;
  return { top: SWIM_Y[i]!, filter: filter | (1 << i) };
}

// SwimCC_IDData: world 2 picks grey unless the LSFR byte is $aa or more.
// Other worlds flip that choice, so red is the usual one.
export function swimCheepIsRed(world: number, lsfr: number) {
  const high = lsfr >= 0xaa;
  return world === 2 ? high : !high;
}
