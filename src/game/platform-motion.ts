// SMB1 moving-platform motion (LargePlatformSubroutines, $25-$29, $2B, $2C),
// in NES pixels. The screen is 2x. Balance pairs ($24) and the cloud right
// lift ($2A) move elsewhere.
export const PLATFORM_VERTICAL = 37; // YMovingPlatform
export const PLATFORM_LIFT_UP = 38; // MoveLargeLiftPlat after PlatLiftUp
export const PLATFORM_LIFT_DOWN = 39; // MoveLargeLiftPlat after PlatLiftDown
export const PLATFORM_SHUTTLE = 40; // XMovingPlatform
export const PLATFORM_DROP = 41; // DropPlatform
export const PLATFORM_SMALL_UP = 43; // MoveSmallPlatform after PlatLiftUp
export const PLATFORM_SMALL_DOWN = 44; // MoveSmallPlatform after PlatLiftDown

export type PlatformMotion = {
  kind: number;
  // Enemy_Y_Position of the platform top. Lifts wrap it like the NES byte.
  y: number;
  // Horizontal offset from the start, in 1/256 NES px (shuttle only).
  x256: number;
  speed: number; // Enemy_Y_Speed, signed
  force: number; // Enemy_Y_MoveForce, 0-255
  dummy: number; // Enemy_YMF_Dummy, 0-255
  top: number; // YPlatformTopYPos
  center: number; // YPlatformCenterYPos
  primary: number; // XMovePrimaryCounter
  secondary: number; // XMoveSecondaryCounter
};

export function isNesPlatform(kind: number) {
  return (
    (kind >= PLATFORM_VERTICAL && kind <= PLATFORM_DROP) ||
    kind === PLATFORM_SMALL_UP ||
    kind === PLATFORM_SMALL_DOWN
  );
}

// Constant up or down lifts. They never turn around; they wrap.
export function isOneWayLift(kind: number) {
  return (
    kind === PLATFORM_LIFT_UP ||
    kind === PLATFORM_LIFT_DOWN ||
    kind === PLATFORM_SMALL_UP ||
    kind === PLATFORM_SMALL_DOWN
  );
}

export function initPlatformMotion(kind: number, y: number): PlatformMotion {
  const motion: PlatformMotion = {
    kind,
    y,
    x256: 0,
    speed: 0,
    force: 0,
    dummy: 0,
    top: 0,
    center: 0,
    primary: 0,
    secondary: 0,
  };
  if (kind === PLATFORM_VERTICAL) {
    // InitVertPlatform: the center is 64px from the start, below it in the
    // top half of the screen and above it in the bottom half.
    const low = y >= 0x80;
    motion.top = low ? (0x100 - y) & 0xff : y;
    motion.center = (y + (low ? 0xc0 : 0x40)) & 0xff;
  } else if (kind === PLATFORM_LIFT_UP || kind === PLATFORM_SMALL_UP) {
    motion.force = 0x10; // PlatLiftUp
    motion.speed = -1;
  } else if (kind === PLATFORM_LIFT_DOWN || kind === PLATFORM_SMALL_DOWN) {
    motion.force = 0xf0; // PlatLiftDown
  }
  return motion;
}

const signed = (byte: number) => ((byte & 0xff) ^ 0x80) - 0x80;

// ImposeGravity on the Y speed, force, and dummy bytes. dir 0 pulls down only.
function imposeGravity(
  m: PlatformMotion,
  dir: number,
  down: number,
  up: number,
  max: number,
) {
  const dummy = m.dummy + m.force;
  m.dummy = dummy & 0xff;
  m.y += m.speed + (dummy >> 8);
  const force = m.force + down;
  m.force = force & 0xff;
  m.speed = signed(m.speed + (force >> 8));
  if (m.speed >= max && m.force >= 0x80) {
    m.speed = max;
    m.force = 0;
  }
  if (!dir) return;
  const lifted = m.force - up;
  m.force = lifted & 0xff;
  m.speed = signed(m.speed - (lifted < 0 ? 1 : 0));
  if (m.speed < -max && m.force < 0x80) {
    m.speed = -max;
    m.force = 0xff;
  }
}

// One NES frame. frameCounter is FrameCounter for that frame. playerOn is the
// drop platform's PlatformCollisionFlag: only the player's weight moves it.
export function stepPlatformMotion(
  m: PlatformMotion,
  frameCounter: number,
  playerOn: boolean,
) {
  switch (m.kind) {
    case PLATFORM_VERTICAL:
      if (m.speed === 0 && m.force === 0) {
        m.dummy = 0;
        if (m.y < m.top) {
          if ((frameCounter & 7) === 0) m.y += 1;
          return;
        }
      }
      // MovePlatformDown / MovePlatformUp: down $05, up $0a, max 3.
      imposeGravity(m, m.y < m.center ? 0 : 1, 0x05, 0x0a, 3);
      return;
    case PLATFORM_LIFT_UP:
    case PLATFORM_LIFT_DOWN:
    case PLATFORM_SMALL_UP:
    case PLATFORM_SMALL_DOWN: {
      // MoveLiftPlatforms: an 8-bit Y with no high byte, so it wraps.
      const dummy = m.dummy + m.force;
      m.dummy = dummy & 0xff;
      m.y = (m.y + m.speed + (dummy >> 8)) & 0xff;
      return;
    }
    case PLATFORM_SHUTTLE: {
      // XMoveCntr_Platform with $0e, stepped on every 4th frame.
      if ((frameCounter & 3) === 0) {
        if ((m.primary & 1) === 0) {
          if (m.secondary === 0x0e) m.primary += 1;
          else m.secondary += 1;
        } else if (m.secondary === 0) m.primary += 1;
        else m.secondary -= 1;
      }
      // MoveWithXMCntrs: left while d1 of the primary is clear. X speed is in
      // 1/16 px, so each frame moves speed * 16 in 1/256 px.
      const speed = m.primary & 2 ? m.secondary : -m.secondary;
      m.x256 += speed * 16;
      return;
    }
    case PLATFORM_DROP:
      // MoveDropPlatform: down $7f, max 2, and only under the player.
      if (playerOn) imposeGravity(m, 0, 0x7f, 0, 2);
      return;
  }
}
