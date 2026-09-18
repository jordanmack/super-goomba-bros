import { MAP_TOP, TUNING as T } from "./config.ts";

// SMBDIS.ASM InitEnemyRoutines $1b-$1f: four short firebars then one long.
// FirebarSpinSpdData / FirebarSpinDirData are indexed by Enemy_ID - $1b.
export const FIREBAR_TYPE = {
  0x1b: { length: 6, nesSpeed: 0x28, clockwise: true },
  0x1c: { length: 6, nesSpeed: 0x38, clockwise: true },
  0x1d: { length: 6, nesSpeed: 0x28, clockwise: false },
  0x1e: { length: 6, nesSpeed: 0x38, clockwise: false },
  0x1f: { length: 12, nesSpeed: 0x28, clockwise: true },
} as const;

export type FirebarTypeId = keyof typeof FIREBAR_TYPE;
export const BOWSER_TYPE = 0x2d;
// Row-13 command $42. Opcode 41 is the scroll stop, not the axe.
export const AXE_OPCODE = 36;
export const PLATFORM_TYPE_MIN = 36;
export const PLATFORM_TYPE_MAX = 44;

export function isFirebarType(type: number): type is FirebarTypeId {
  return type in FIREBAR_TYPE;
}

export function isPlatformType(type: number) {
  return type >= PLATFORM_TYPE_MIN && type <= PLATFORM_TYPE_MAX;
}

export function isBowserType(type: number) {
  return type === BOWSER_TYPE;
}

export type Firebar = {
  x: number;
  y: number;
  type: FirebarTypeId;
  length: number;
  nesSpeed: number;
  clockwise: boolean;
};

export type Point = { x: number; y: number };

export function firebarBalls(bar: Firebar, elapsed: number): Point[] {
  const sign = bar.clockwise ? 1 : -1;
  const units = elapsed * 60 * bar.nesSpeed * sign;
  const step = ((Math.floor(units / 256) % 32) + 32) % 32;
  const angle = (step / 32) * Math.PI * 2;
  const balls: Point[] = [];
  for (let i = 0; i < bar.length; i++) {
    const reach = i * T.firebarSpacing;
    balls.push({
      x: bar.x + Math.cos(angle) * reach,
      y: bar.y + Math.sin(angle) * reach,
    });
  }
  return balls;
}

export function firebarHits(
  bar: Firebar,
  elapsed: number,
  x: number,
  y: number,
  halfW: number,
  halfH: number,
) {
  const radius = T.firebarBallRadius;
  for (const ball of firebarBalls(bar, elapsed))
    if (Math.abs(x - ball.x) < halfW + radius && Math.abs(y - ball.y) < halfH + radius)
      return true;
  return false;
}

export function castleActorPos(
  offset: number,
  column: number,
  row: number,
  width: number,
  height: number,
) {
  return {
    x: offset + column * 32 + width / 2,
    y: MAP_TOP + row * 32 + height / 2,
  };
}
