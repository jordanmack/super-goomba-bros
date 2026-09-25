// SMB1 Piranha Plants (InitPiranhaPlant, MovePiranhaPlant), in NES pixels.
// The screen is 2x. `rise` is how far the plant's top is above its down
// position, the pipe top.

export const PLANT_RISE = 0x18;
// EnemyFrameTimer at each end.
export const PLANT_WAIT = 0x40;
// It stays in its pipe while someone is this close horizontally.
export const PLANT_CLEAR = 0x21;
// Bounding box control $09 from the plant's top: x 3-13, y 14-20 of a 16px
// wide sprite, so a 10x6 box centered on the pipe.
export const PLANT_BOX = { halfW: 5, top: 14, bottom: 20 } as const;

export type PlantMotion = {
  rise: number;
  speed: 1 | -1; // PiranhaPlant_Y_Speed: +1 down, -1 up
  moving: boolean; // PiranhaPlant_MoveFlag
  timer: number; // EnemyFrameTimer
};

export function initPlant(): PlantMotion {
  return { rise: 0, speed: 1, moving: false, timer: 0 };
}

// One frame. `near` is true while someone the plant yields to is within
// PLANT_CLEAR. It only matters at the bottom: a plant that is out still goes
// back down on its own.
export function stepPlant(m: PlantMotion, frame: number, near: boolean) {
  if (m.timer > 0) m.timer--;
  if (m.timer > 0) return;
  if (!m.moving) {
    if (m.speed > 0 && near) return;
    m.speed = m.speed > 0 ? -1 : 1;
    m.moving = true;
  }
  // RiseFallPiranhaPlant moves on odd frames only.
  if (!(frame & 1)) return;
  m.rise -= m.speed;
  if (m.rise === (m.speed > 0 ? 0 : PLANT_RISE)) {
    m.moving = false;
    m.timer = PLANT_WAIT;
  }
}

// Down in its pipe and not moving: it cannot come out while someone is near.
export function plantResting(m: PlantMotion) {
  return !m.moving && m.speed > 0;
}

// EnemyGfxHandler skips a plant that is waiting at the bottom.
export function plantShown(m: PlantMotion) {
  return !(m.speed > 0 && m.timer > 0);
}
