# Super Goomba Bros

An 8-bit side-scrolling rescue game built with Phaser 4 and React. Play a Goomba,
warn nearby characters, evade Mario, and reach the castle door after enough NPCs
escape. The campaign follows all 32 original SMB1 stages, including pipe entrances,
underground rooms, water, moving platforms, and castles.

The world uses individual tiles from bundled level data. No full-map background,
ROM file, or runtime asset download is required. Asset sources are in the
[level credits](src/assets/levels/README.md), [sprite credits](src/assets/smb/README.md),
and [audio credits](src/assets/audio/README.md).

## Run

Check for an existing server before starting another.

```sh
bun install
ionice -c3 nice -n19 bun run dev --host 0.0.0.0
```

The development build accepts `?level=4-3` to inspect a stage. The production game
starts at World 1-1 and progresses in order.

## Controls

| Action | Keyboard | Touch |
| --- | --- | --- |
| Walk | Left/Right or A/D | D-pad Left/Right |
| Run | Shift, Z, or J | B |
| Jump; swim upward in water | Space, Up, W, or K | A; Compact Up |
| Enter a pipe | Down or S; walk into side entrances | D-pad Down |
| Shoot with a flower | Shift, Z, or J (press) | B (press) |
| Pause | Escape | Pause; NES Start |

The header Key bindings button shows this keyboard list.

Hold B to run. Jump keeps that ground speed in the air. Hold jump for extra
height; running jumps clear original gaps. Compact is the default on-screen
pad; switch to an NES pad from pause. Compact Up may jump; NES D-pad Up does
not. Releasing direction stops horizontal movement. Springs provide their own
stronger bounce. An unwarned NPC inside warning range automatically hears an
urgent shout.

Each touch, mouse pointer, and key has an independent hold. Sliding changes
actions; sliding out releases them. Pause, restart, and interruptions clear input.
Phaser handles pointers and keys; a small DOM bridge preserves moves over the
HTML controls and blocks browser gestures. Real iPhone testing is still needed
to verify Safari's system magnifier behavior.

If a browser cannot decode audio, the sound control shows Audio unavailable.
Gameplay remains available. Reloading retries sound initialization.

## Rules

Warned, Saved, and Died are separate counters. NPCs only count as saved at a castle
door, including after leaving an underground or water area. They keep moving
while the player visits another area. Mario notices running crowds and warnings,
then pursues, jumps, and fires when powered.

Visible question blocks release random stars, mushrooms, or flowers. Hidden
coin and 1-up blocks keep their original contents. 2x mushrooms are common;
3x and timed 8x mushrooms appear less often. Mushrooms set Goomba and NPC
size to that tier; flowers turn them white. A 1-up grants an extra life.
2x shots stay small; 3x and 8x shots match those sizes. Player fireballs
use the same two-shot cap as Mario. Stars defeat Mario. Giant-player stomps
and fireballs reduce him through fire, big, and small stages. His power can
increase on return or through items, with no spontaneous upgrade while active.

A campaign starts with three lives. Death spends a life, shows the world intro,
and restarts the current stage. 0 lives is game over, then the title. The goal
stays locked if too many NPCs die. A successful entry gives the remaining NPCs
one fixed rescue window. Next Level starts a fresh stage through the intro;
Play Again on the final result starts a new campaign. Nothing is stored between
browser sessions.

## Checks and build

```sh
ionice -c3 nice -n19 bun run test
ionice -c3 nice -n19 bun run lint
ionice -c3 nice -n19 bun run build
ionice -c3 nice -n19 bun run test:browser
```

Browser checks need Playwright Chromium installed. The build produces one
self-contained `dist/index.html`, which can open directly without a server.
Phaser's official Arcade distribution excludes the unused Matter engine.

The Node tests run the actual Arcade implementation without a DOM. Recorded
player inputs reach each stage's doorway without teleporting during replay.
Separate tests check NPC routes, rescue quotas, powers, Mario, and controls.
See [the test fixtures](tests/fixtures/README.md) for the scope of these checks.

Gameplay rules are in [the spec](docs/game-spec.md). Tuning values are in
[src/game/config.ts](src/game/config.ts). Issue tracking is in
[the GitHub issues contract](docs/github-issues.md). Other docs are listed in
[docs/README.md](docs/README.md).

This is an unofficial fan prototype, not affiliated with Nintendo. Character
names and original game assets belong to their respective owners.
