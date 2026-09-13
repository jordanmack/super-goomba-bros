export const TUNING = {
  population: 30,
  idleRadius: 65,
  idleSpeed: 0.65,
  required: 12,
  finishWindow: 5,
  // 2x NES SMB1: 16 px tiles and 16 subpixels/px scale to 32 px tiles.
  walkSpeed: 3,
  runSpeed: 5,
  // SMB1 PlayerYSpdData / JumpMForceData / FallMForceData at 2x tiles.
  // Small and Super Mario share these; only the body is taller.
  jumpSpeed: 8,
  runJumpSpeed: 10,
  giantJumpSpeed: 15,
  jumpHoldGravity: 900,
  jumpFallGravity: 3150,
  walkJumpHoldGravity: 843.75,
  walkJumpFallGravity: 2700,
  runJumpHoldGravity: 1125,
  runJumpFallGravity: 4050,
  // NPC rescue routes still use the older hang; they do not match SMB1.
  npcJumpFallGravity: 1500,
  stompBounce: 8,
  // NES kicked-shell X speed $30 = 3 px/frame, at this game's 2x tile scale.
  shellSpeed: 6,
  // RevivalRateData $10 * 21-frame interval timer = 336 frames.
  shellWake: 5.6,
  // Legs-out shake while EnemyIntervalTimer is 1-4 (4 * 21 frames).
  shellShake: 1.4,
  gravity: 1500,
  platformSpeed: 64,
  platformTravel: 96,
  areaSpacing: 20000,
  pipeCooldown: 0.8,
  pipeSpeed: 2,
  springImpulse: 17,
  swimImpulse: 4.5,
  swimGravity: 0.25,
  swimFallSpeed: 3,
  deathSequenceSeconds: 2.8,
  deathHopSpeed: 420,
  deathHopDelay: 0.15,
  deathFallGravity: 900,
  startingLives: 3,
  introSeconds: 2.45,
  gameoverSeconds: 3.15,
  warningRange: 96,
  hearingRange: 440,
  warningCooldown: 1.3,
  warningSound: 0.35,
  bubbleTime: 2.1,
  exclaimTime: 0.7,
  fasterAt: 30,
  fireballsAt: 60,
  firstMarioAt: 3,
  marioSight: 520,
  marioChaseSeconds: 6,
  marioReaction: 0.25,
  marioCrowdLimit: 5,
  marioCrowdRange: 800,
  marioCrowdSpeedBonus: 2,
  starSeconds: 10,
  mushroomScale: 2,
  giantScale: 3,
  hugeScale: 8,
  hugeSeconds: 10,
  mushroom3xChance: 0.25,
  mushroom8xChance: 0.1,
  transformSeconds: 0.8,
  transformBlinkHz: 12,
  marioStunSeconds: 2,
  marioDefeatSeconds: 3,
  fireballSlots: 2,
  playerFireballScale: 3,
  blockBounceSeconds: 0.22,
  pipeWidth: 64,
  pipeHeight: 64,
  brickSize: 32,
  flagRaiseSeconds: 1,
  groundY: 430,
  bloodBurst: 64,
  brickBurst: 12,
} as const;

// NES X-speed byte is our 2x px/frame * 8. Cutoffs 16 and 25 match SMB1.
export function jumpArc(vx: number) {
  const nes = Math.abs(vx) * 8;
  if (nes >= 25)
    return {
      impulse: TUNING.runJumpSpeed,
      hold: TUNING.runJumpHoldGravity,
      fall: TUNING.runJumpFallGravity,
    };
  if (nes >= 16)
    return {
      impulse: TUNING.jumpSpeed,
      hold: TUNING.walkJumpHoldGravity,
      fall: TUNING.walkJumpFallGravity,
    };
  return {
    impulse: TUNING.jumpSpeed,
    hold: TUNING.jumpHoldGravity,
    fall: TUNING.jumpFallGravity,
  };
}

export const PHRASES = [
  "Run! Mario is coming!",
  "Move! The plumber is coming!",
  "Run! The demon is coming!",
  "Run! The mustache is coming!",
  "Get out! The red hat is coming!",
  "Run for the goal! Mario is close!",
  "Keep moving! Mario is on his way!",
  "Flee! Those boots are coming!",
  "Scramble! The plumber is almost here!",
  "Run your shells off! Mario is coming!",
  "Run! Trouble has a mustache, and it's coming!",
  "Get to safety! Mario is coming!",
  "Run my brothers or perish!",
  "Flee my brothers! Mario is coming!",
  "Run, brothers! The plumber is coming!",
  "Brothers, scramble or perish!",
];

export const MAP_TOP = TUNING.groundY - 13 * 32;
