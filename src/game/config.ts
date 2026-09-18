/** Peak target applied to bundled WAV cues, as a fraction of full scale. */
export const WAV_PEAK_TARGET = 10 ** (-1 / 20);

export const MIX = {
  managerVolume: 0.8,
  musicVolume: 0.55,
  tallyVolume: 0.25,
} as const;

export const TUNING = {
  population: 30,
  elevatedSpawnShare: 1 / 3,
  elevatedSpawnNear: 192,
  idleRadius: 65,
  idleSpeed: 0.65,
  // header.timer: 0=400, 1=300, 2=200. In-play tick is SMB1's 24-frame clock.
  // Tally drains one TIME unit per frame, matching SMB1.
  timerByHeader: [400, 300, 200],
  timerTickFrames: 24,
  timerTallyFrames: 1,
  hurryAt: 100,
  hurryRate: 1.5,
  coinScore: 200,
  mushroomScore: 1000,
  warnedScore: 100,
  savedScore: 1000,
  diedScore: -2000,
  flagScore: 2000,
  marioScore: 1000,
  timeScore: 50,
  coinsForLife: 100,
  tallyLineSeconds: 0.7,
  tallyEndHold: 0.8,
  clearSeconds: 5.5,
  endingSeconds: 6.3,
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
  cheatDropHold: 0.8,
  marioStunSeconds: 2,
  marioDefeatSeconds: 3,
  fireballSlots: 2,
  playerFireballScale: 3,
  // NES BulletBillXSpdData $18 at 2x tiles.
  bulletSpeed: 3,
  bulletSize: 24,
  // Cannon_Timer $0e plus LSFR select (~3/16) is about 80 frames.
  cannonReload: 80,
  cannonSlots: 3,
  // PlayerEnemyDiff adc #$28 / cmp #$50: |dx| < 40 NES px.
  cannonClose: 80,
  blockBounceSeconds: 0.22,
  pipeWidth: 64,
  pipeHeight: 64,
  brickSize: 32,
  multiCoinCount: 10,
  flagRaiseSeconds: 1,
  groundY: 430,
  bloodBurst: 64,
  brickBurst: 12,
} as const;

export function blockDrawY(y: number, bounce: number) {
  return y - 10 * Math.sin((Math.PI * bounce) / TUNING.blockBounceSeconds);
}

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
  "RUUUUUUUUUUUUUUUN!",
  "Everybody run! He'll kill us all!",
  "Hide yo kids, hide yo wife, hide everybody! He's stomping everybody out here!",
];

export const WARNING_CHIRPS = [
  { startHz: 520, peakHz: 940, endHz: 360, peakAt: 0.08, endAt: 0.18, stopAt: 0.21 },
  { startHz: 700, peakHz: 1200, endHz: 520, peakAt: 0.06, endAt: 0.16, stopAt: 0.2 },
  { startHz: 360, peakHz: 780, endHz: 240, peakAt: 0.09, endAt: 0.19, stopAt: 0.22 },
  { startHz: 840, peakHz: 1360, endHz: 640, peakAt: 0.05, endAt: 0.14, stopAt: 0.19 },
  { startHz: 480, peakHz: 620, endHz: 980, peakAt: 0.07, endAt: 0.17, stopAt: 0.21 },
] as const;

export function pickWarningChirp(random: () => number) {
  return WARNING_CHIRPS[Math.floor(random() * WARNING_CHIRPS.length)]!;
}

export const MAP_TOP = TUNING.groundY - 13 * 32;
export const VIEW_HEIGHT = 540;
// 1-1 opening: start hill through the first pipe (column 28, 2 tiles).
export const TITLE_SHOT = { x: 0, y: 0, w: 30 * 32, h: VIEW_HEIGHT } as const;

export function titleCamera(
  viewWidth: number,
  viewHeight: number,
  shot: { x: number; y: number; w: number; h: number } = TITLE_SHOT,
) {
  const zoom = Math.min(1, viewWidth / shot.w, viewHeight / shot.h);
  return {
    scrollX: shot.x + (viewWidth / 2) * (1 / zoom - 1),
    scrollY: shot.y + shot.h - viewHeight / 2 - viewHeight / (2 * zoom),
    zoom,
  };
}

export function cameraWorldView(
  scrollX: number,
  scrollY: number,
  zoom: number,
  viewWidth: number,
  viewHeight: number,
) {
  return {
    x: scrollX + viewWidth / 2 - viewWidth / (2 * zoom),
    y: scrollY + viewHeight / 2 - viewHeight / (2 * zoom),
    w: viewWidth / zoom,
    h: viewHeight / zoom,
  };
}
