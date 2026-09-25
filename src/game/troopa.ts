import { imposeGravity, type GravityBytes } from "./platform-motion.ts";

// SMB1 Koopa Troopas, Buzzy Beetles, and Paratroopas while unwarned, in NES
// pixels. The screen is 2x. Each step is one frame.

// NormalXSpdData $f8 and InitJumpGPTroopa: 8/16 NES px a frame, moving left.
export const TROOPA_WALK = 0.5;
// MoveD_EnemyVertically: an enemy that walks off a ledge falls with $3d.
export const TROOPA_FALL_GRAVITY = 0x3d;
// MoveJ_EnemyVertically: a hopping Paratroopa's gravity is $1c.
export const HOP_GRAVITY = 0x1c;
// EnemyJump: it leaves the ground at $fd each time it lands.
export const HOP_SPEED = -3;
export const TROOPA_MAX_FALL = 3;

// Enemy_Y_Speed, Enemy_Y_MoveForce, and Enemy_YMF_Dummy.
export type VerticalBytes = { speed: number; force: number; dummy: number };

export function restingBytes(): VerticalBytes {
  return { speed: 0, force: 0, dummy: 0 };
}

// One frame of falling or hopping under `gravity`, at most 3 px a frame down.
// Returns the frame's move in NES px.
export function troopaFall(v: VerticalBytes, gravity: number) {
  const m = { y: 0, ...v };
  imposeGravity(m, 0, gravity, 0, TROOPA_MAX_FALL);
  v.speed = m.speed;
  v.force = m.force;
  v.dummy = m.dummy;
  return m.y;
}

// EnemyLanding then EnemyJump: a hopping Paratroopa takes off again.
export function hopTakeoff(v: VerticalBytes) {
  v.speed = HOP_SPEED;
  v.force = 0;
}

// A green flying Paratroopa (InitHorizFlySwimEnemy, MoveFlyGreenPTroopa).
// XMovePrimaryCounter and XMoveSecondaryCounter share Enemy_Y_Speed and
// Enemy_X_Speed. `x256` and `y` are offsets from where it started.
export type FlyMotion = {
  primary: number;
  secondary: number;
  x256: number; // X position and Enemy_X_MoveForce, in 1/256 NES px
  y: number;
};

export function initFlyParatroopa(): FlyMotion {
  return { primary: 0, secondary: 0, x256: 0, y: 0 };
}

// XMoveCntr_GreenPTroopa: every 4th frame the speed steps 1/16 px toward $13
// and back. MoveWithXMCntrs: primary counter d1 picks right, else left. The
// flight sways 1 px every 4th frame, down while FrameCounter d6 is set.
export function stepFlyParatroopa(m: FlyMotion, frame: number) {
  if ((frame & 3) === 0) {
    if (m.primary & 1) {
      if (m.secondary === 0) m.primary = (m.primary + 1) & 0xff;
      else m.secondary--;
    } else if (m.secondary === 0x13) m.primary = (m.primary + 1) & 0xff;
    else m.secondary++;
  }
  m.x256 += (m.primary & 2 ? m.secondary : -m.secondary) * 16;
  if ((frame & 3) === 0) m.y += frame & 0x40 ? 1 : -1;
}

export function flyX(m: FlyMotion) {
  return Math.floor(m.x256 / 256);
}

// Facing follows Enemy_MovingDir: right while primary counter d1 is set.
export function flyFacing(m: FlyMotion) {
  return m.primary & 2 ? 1 : -1;
}

// A red Paratroopa (InitRedPTroopa, ProcMoveRedPTroopa). `y` is its top from
// the top of the screen.
export type BobMotion = GravityBytes & {
  orig: number; // RedPTroopaOrigXPos, which holds the starting Y
  center: number; // RedPTroopaCenterYPos
};

// The center is 48 px below a start in the top half of the screen, else
// 32 px above it.
export function initRedParatroopa(y: number): BobMotion {
  return {
    y,
    speed: 0,
    force: 0,
    dummy: 0,
    orig: y,
    center: y < 0x80 ? y + 0x30 : y - 0x20,
  };
}

// Down toward the center with $03, up past it with $06 - $03, at most 2 px a
// frame, so it swings between its start and as far past the center.
export function stepRedParatroopa(m: BobMotion, frame: number) {
  if (m.speed === 0 && m.force === 0) {
    m.dummy = 0;
    if (m.y < m.orig) {
      if ((frame & 7) === 0) m.y++;
      return;
    }
  }
  imposeGravity(m, m.y < m.center ? 0 : 1, 0x03, 0x06, 2);
}

// The highest and lowest y a red Paratroopa reaches from a start at y, over
// one full swing and more.
const bobRanges = new Map<number, { lo: number; hi: number }>();
export function bobRange(y: number) {
  let range = bobRanges.get(y);
  if (!range) {
    const m = initRedParatroopa(y);
    range = { lo: y, hi: y };
    for (let frame = 1; frame <= 900; frame++) {
      stepRedParatroopa(m, frame);
      range.lo = Math.min(range.lo, m.y);
      range.hi = Math.max(range.hi, m.y);
    }
    bobRanges.set(y, range);
  }
  return range;
}
