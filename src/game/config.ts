/** Peak target applied to bundled WAV cues, as a fraction of full scale. */
export const WAV_PEAK_TARGET = 10 ** (-1 / 20);

export const MIX = {
  managerVolume: 0.8,
  musicVolume: 0.55,
  tallyVolume: 0.25,
} as const;

// Sfx_Blast is the fireworks sample. Cannon fire must not add a wav.
export const CANNON_BLAST = {
  event: "blast",
  cue: "fireworks",
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
  fireworkScore: 500,
  // Castle-door fireworks from NPCs saved when leftover TIME hits 0.
  fireworkModest: 6,
  fireworkGood: 12,
  fireworkStrong: 20,
  fireworkInterval: 0.4,
  // RunFireworks shows graphics 0, 1, 2 and resets ExplosionTimerCounter to
  // $08 for each. Then that firework is gone.
  fireworkFrames: 3,
  fireworkFrameHold: 8,
  timeScore: 50,
  coinsForLife: 100,
  tallyLineSeconds: 0.7,
  tallyEndHold: 0.8,
  clearSeconds: 5.5,
  // 2x NES SMB1: 16 px tiles and 16 subpixels/px scale to 32 px tiles.
  walkSpeed: 3,
  runSpeed: 5,
  // SMB1 PlayerYSpdData / JumpMForceData / FallMForceData at 2x tiles.
  // Small and Super Mario share these; only the body is taller.
  jumpSpeed: 8,
  runJumpSpeed: 10,
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
  // Balance-pair lift speed, px/s.
  platformSpeed: 64,
  areaSpacing: 20000,
  pipeCooldown: 0.8,
  pipeSpeed: 2,
  // SMB1 pipe-intro cutscene (entrance 6/7), at 2x. The walk is capped by
  // MaxRightXSpdData $0c, EnterSidePipe slides at $08, and ChangeAreaTimer is
  // AreaChangeTimerData $a0 on page 0, counted from pipe contact.
  introWalkSpeed: 1.5,
  introPipeSlide: 1,
  introPipeFrames: 160,
  // NES RightPlatform sets Enemy_X_Speed to $10 (1 px/frame) on contact.
  // 2x tiles use 2 px/frame, the same scale as shellSpeed and vineClimbSpeed.
  rightLiftSpeed: 2,
  // NES vine grow/climb are 1 px/frame; 2x tiles use 2 px/frame.
  vineGrowSpeed: 2,
  vineClimbSpeed: 2,
  vineIgnore: 0.4,
  npcPipeEscapeChance: 0.2,
  // SMB1 Jumpspring_Y_PosData $08,$10,$08,$00 at 2x, held 4 frames each.
  // The last offset is the launch pose, not another held squat.
  springSquash: [16, 32, 16, 0],
  springStepFrames: 4,
  // JumpspringForce $f9 and a new A press $f4, at 2x tiles.
  springVy: 14,
  springVyJump: 24,
  swimImpulse: 4.5,
  swimGravity: 0.25,
  swimFallSpeed: 3,
  // Water rooms only. Below walkSpeed so a swimming player can pull away.
  marioSwimSpeed: 2,
  npcSwimSpeed: 2,
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
  marioItemDetourSeconds: 2,
  marioReaction: 0.25,
  marioCrowdLimit: 5,
  marioCrowdRange: 800,
  marioCrowdSpeedBonus: 2,
  // Added to Mario's current run pace so the shot stays ahead of that run,
  // including the crowd bonus. The player's shot does not use this.
  marioFireLead: 1,
  starSeconds: 10,
  mushroomScale: 2,
  giantScale: 3,
  hugeScale: 8,
  hugeSeconds: 15,
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
  // ProcessCannons writes Cannon_Timer $0e and counts it down only when that
  // slot is the LSFR select. The mean gap is still about 80 frames.
  cannonReload: 0x0e,
  cannonSlots: 3,
  // Masked LSFR nybble. A select >= this is a miss, so slots are 0..5.
  cannonSelectMax: 6,
  // PlayerEnemyDiff adc #$28 / cmp #$50: |dx| < 40 NES px, including same column.
  cannonClose: 80,
  blockBounceSeconds: 0.22,
  pipeWidth: 64,
  pipeHeight: 64,
  brickSize: 32,
  // Exhaustion and 8x smash cap. SMB1 BrickWithCoins has no per-block count.
  multiCoinCount: 10,
  // BrickCoinTimer $0b ticks of the 21-frame interval from the first hit.
  multiCoinTimerFrames: 11 * 21,
  flagRaiseSeconds: 1,
  groundY: 430,
  bloodBurst: 64,
  brickBurst: 12,
  // NES firebar: 8 px between balls, 8 px ball, spin bytes $28/$38 per frame.
  firebarSpacing: 16,
  firebarBallRadius: 8,
  bowserWidth: 64,
  bowserHeight: 64,
  bowserWalkSpeed: 1.2,
  bowserFlameSpeed: 2.4,
  bowserFlamePeriod: 2.2,
  bowserFlameLife: 3.2,
  bowserShoutRange: 240,
  bowserShoutCooldown: 3.2,
  // Least distance between the player and Mario's spawn in a coin room.
  coinRoomMarioGap: 96,
  // One cloud Lakitu. Type-17 rows are spawn points, not extra riders.
  lakituWidth: 32,
  lakituHeight: 48,
  lakituSpeed: 1.6,
  lakituThrow: 2.2,
  lakituSpikeCap: 4,
  // CheckForLakitu shows the drop frame while FrenzyEnemyTimer is below $10:
  // the last 16 frames before the throw.
  lakituDropFrames: 16,
  // SMB1 CreateSpiny: the egg starts 8px above Lakitu with Enemy_Y_Speed $fd
  // and no X speed. MoveD_EnemyVertically uses force $20 and SetHiMax $03 for
  // it. At 2x: -6 px/frame, 0.25 px/frame^2 (900 px/s^2), and a 6 px/frame cap.
  spinyEggRise: 16,
  spinyEggVy: -6,
  spinyEggGravity: 900,
  spinyEggMaxFall: 6,
  // FrameCounter bit 3 picks the egg frame, so each frame shows for 8 ticks.
  spinyEggFrameTicks: 8,
  // LandEnemyProperly gives a hatched Spiny Enemy_X_Speed $08 = 1 px/frame at 2x.
  spinyWalkSpeed: 1,
  // Hammer Bro. NES speeds are 2x, matching shellSpeed and bulletSpeed.
  // Shimmy Enemy_X_Speed is $04/$fc (0.25 px/frame). Chase after the walk
  // timer is $f8. Jump Y is $fa or $fd. Throw timer is HammerThrowTmrData $30.
  hammerBroWidth: 24,
  hammerBroHeight: 40,
  hammerBroShimmy: 0.5,
  hammerBroChase: 1,
  hammerBroWalkFrames: 0x80,
  hammerBroJumpHigh: 12,
  hammerBroJumpLow: 6,
  hammerBroJumpMin: 0xc0,
  hammerThrowFrames: 0x30,
  // Misc_State counts from $10 down to $02 before the hammer leaves the hand.
  hammerWindupFrames: 14,
  // HammerXSpdData $10 and launch Y $fe.
  hammerSpeed: 2,
  hammerThrowVy: -4,
  // ImposeGravity adds $10 to the fraction byte: 1 px / 16 frames.
  // 2x tiles use 0.125, the same scale as the -4 launch and the max of 8.
  hammerGravity: 0.125,
  hammerMaxVy: 8,
  hammerSlots: 9,
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

// A standing hop has no run speed, so it is the vx=0 arc the player gets.
export const STANDING_JUMP_IMPULSE = jumpArc(0).impulse;

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

export const BOWSER_PHRASES = [
  "Run! I will hold Mario off!",
  "Go! I will stop the plumber!",
  "Escape! Mario will not pass me!",
  "Keep running! I have the plumber!",
  "Get to the door! I will stall Mario!",
];

export const HAMMER_BRO_PHRASES = [
  "Hold Mario off! The kingdom stands!",
  "Stand fast! I defend the kingdom!",
  "Protect the people! Mario stops here!",
  "For the king! I will hold the plumber!",
  "The king is safe! Mario shall not pass!",
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

// Native play zoom, left-anchored 1-1 opening. Narrow views crop; they do not
// zoom out. Extra width on a wide screen shows more stage to the right.
export function titleCamera() {
  return { scrollX: 0, scrollY: 0, zoom: 1 };
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
