# Super Goomba Bros

An 8-bit side-scrolling rescue game built with Phaser 4 and React. Play a Goomba,
warn nearby characters, evade Mario, and reach the castle door. The campaign
follows all 32 original SMB1 stages, including pipe entrances,
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

| Action | Keyboard | Touch | Gamepad |
| --- | --- | --- | --- |
| Walk | Left/Right or A/D | D-pad Left/Right | Stick or D-pad (deadzone 0.35) |
| Run | Shift, Z, or J | B | B (East) |
| Jump; swim upward in water | Space, Up, W, or K | A; Compact Up | A (South) |
| Enter a pipe | Down or S; walk into side entrances | D-pad Down | Down |
| Shoot with a flower | Shift, Z, or J (press) | B (press) | B (East) press |
| Pause | Escape | Pause; NES Start | Start (pause in play; Start Game on title) |
| Select | | NES Select | Unused |

The header Key bindings button shows this keyboard list and the gamepad
defaults. Help remaps Jump, Run, Left, Right, Down, and Pause. The map is the
only setting stored in the browser. Invalid or missing maps use the defaults.

Hold B to run. Jump keeps that ground speed in the air. Hold jump for extra
height. A running jump is higher, as in SMB1, and clears original gaps. Compact is the default on-screen
pad. A header button cycles Compact, NES, and hidden. Compact Up may jump; NES D-pad Up and
gamepad Up do not. The first gamepad stick or button use this session hides the
on-screen pad. Unplug does not bring it back. Releasing direction stops horizontal movement. Springs provide their own
stronger bounce. An unwarned NPC inside warning range automatically hears an
urgent shout.

On the title screen, consecutive `up up down down left right left right B A`
unlocks a session-only power-up tray (star, 2x, 3x, 8x, flower, 1-up). Use
arrow keys then letter B then letter A, or a gamepad D-pad plus B then A.
WASD does not count. A click while playing drops that item in the player
column. Reload clears the tray.

Each touch, mouse pointer, and key has an independent hold. Sliding changes
actions; sliding out releases them. Pause, restart, and interruptions clear input.
Phaser handles pointers and keys; a small DOM bridge preserves moves over the
HTML controls and blocks browser gestures. Real iPhone testing is still needed
to verify Safari's system magnifier behavior.

If a browser cannot decode audio, the sound control shows Audio unavailable.
Gameplay remains available. Reloading retries sound initialization.

## Rules

The in-play header is one SMB1 line: GOOMBA, SCORE, coins, WORLD, and TIME.
Lives stay on the WORLD intro. TIME counts down from the stage timer and kills
at 0. At 100 it hurries the music. SCORE lasts the campaign, keeps across lives,
and zeros on title and GAME OVER. A player-collected coin is +200. A same-size or smaller mushroom
is +1000. 100 coins are a 1-up.

The castle door is always open. At the door the player vanishes, leftover TIME
adds +50 per unit, then an outlined WARNED / SAVED / DIED / FLAG / MARIO tally
updates SCORE. Pause is ignored until that ends. The next WORLD intro starts on
its own. After 8-4 the title returns. There is no NEXT LEVEL button.

Warned, Saved, and Died still count for that tally. NPCs only count as saved at a
castle door, including after leaving an underground or water area. They keep
moving while the player visits another area. Mario notices running crowds and
warnings, then pursues, jumps, and fires when powered.

Visible question blocks release a fully random coin, star, mushroom, or flower.
Head-hit and 8x smash use that same prize rule. Hidden
coin and 1-up blocks keep their original contents. 2x mushrooms are common;
3x and timed 8x mushrooms appear less often. Mushrooms grow Goomba and NPC
size only to a larger tier. A same-size or smaller mushroom scores 1000 for
the player and does not shrink. Flowers turn them white. A 1-up grants an extra life.
2x shots stay small; 3x and 8x shots match those sizes. Player fireballs
use the same two-shot cap as Mario. Stars defeat Mario. Giant-player stomps
and fireballs reduce him through fire, big, and small stages. His power can
increase on return or through items, with no spontaneous upgrade while active.

A campaign starts with three lives. Death spends a life, shows the world intro,
and restarts the current stage. SCORE and coins persist. 0 lives is game over,
then the title. Nothing is stored between browser sessions.

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
Separate tests check NPC routes, powers, Mario, scoring, and controls.
See [the test fixtures](tests/fixtures/README.md) for the scope of these checks.

Gameplay rules are in [the spec](docs/game-spec.md). Tuning values are in
[src/game/config.ts](src/game/config.ts). Issue tracking is in
[the GitHub issues contract](docs/github-issues.md). Other docs are listed in
[docs/README.md](docs/README.md).

This is an unofficial fan prototype, not affiliated with Nintendo. Character
names and original game assets belong to their respective owners.
