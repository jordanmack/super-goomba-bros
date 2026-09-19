# Super Goomba Bros

## Concept

Play a Goomba in an 8-bit side-scrolling game with reversed Mario roles. Warn
other Goombas and Koopa Troopas, help them reach safety, and evade Mario.
Mario roams, hunts, backtracks, enters pipes, and returns to the player's area.
He is the main attacking enemy. The tone combines danger with funny, urgent
warnings and pixel blood.

This spec records the current design. The earlier single-stage design is kept
in Git history. The [migration plan](phaser-migration-plan.md) records the engine
and level-data work. [Tuning](../src/game/config.ts) is the source of numeric
settings unless a rule below explicitly fixes their relationship.

## Campaign and world

- Use Phaser 4 for rendering, sprite animation, cameras, audio, input, and Arcade
  collisions. React provides screens and the HUD.
- The campaign includes all 32 original SMB1 stages. Warp-zone pipes skip
  worlds as in SMB1. The remaining stages stay in world-stage order.
- Build the world from individual native tiles and bundled JSON. The
  [level data](../src/assets/levels/README.md) comes from public disassembly text.
  Never read or require a ROM.
- Keep the original gaps, pipe dimensions, block rows, stairs, ledges, and castle
  locations. Keep the custom NPC population and rescue rules.
- Include underground, water, and castle areas with their corresponding art and
  music. Moving platforms carry characters. Balance-lift pairs (original enemy
  type 36 / $24) are coupled: weight on one lowers it and raises its partner,
  and removing the weight reverses that motion. A rope and pulley are drawn and
  move with the pair. Ordinary moving platforms keep their independent motion.
  Original springs give a stronger bounce.
- Enterable pipes use world-specific destinations and entrance pages. Side
  entrances work when approached at their opening. Arrival follows the source
  pipe: a side pipe rises from a `null`-direction pipe on the destination page
  (nearest to page*512+100; never a `down` or `right` mouth). A down pipe uses
  the destination `header.entrance` (0/1 fall in from above with gravity, 2
  stand, 3 mid-air drop), except castle-source down pipes rise like a side pipe
  (`AltEntranceControl = 2` in SMB1 `VerticalPipeEntry`). Destination-record
  `entrance` is unread. Solid pipes with no entry direction are arrival mouths.
- Pipe travel preserves elapsed time, powers, NPC states, broken blocks, items,
  and counters within the stage. A fleeing NPC that finishes entering a
  non-goal enterable pipe is rescued and does not arrive in the destination.
  Goal pipes still carry NPCs through. Pipe travel does not rescue the player.
- Stages whose route starts off the main area (1-2, 2-2, 4-2, 7-2) play that
  overworld pipe strip as a script on first arrival. After the WORLD n-n intro,
  walk, jump, and pipe input are ignored. The player auto-walks into the pipe
  and emerges at the start of main, then gets control. Pause and Mute still
  work. TIME does not run, and Mario does not spawn or hunt, until control on
  main. The script is not a death. Death with lives left, Pause Restart, and
  other retries of that stage skip the strip and spawn at the start of main.
- Warp-zone pipes skip to that world's first stage, as in SMB1: 1-2 columns
  178/182/186 go to worlds 4/3/2; 4-2 column 214 starts world 5. Power-ups,
  score, coins, and lives persist across a warp. Preserve source warp/vine
  commands in the data. Climbing a vine goes to that vine's named destination
  and does not skip worlds. See [Vines](#vines).
- No logs or hiding spots are added. Bushes are scenery.
- The goal is the castle doorway. Castle interiors use a visible inverted-white
  rescue doorway after the original bridge. On stages with a flagpole, the first of the player or
  Mario to pass it raises a matching flag. The player flag stamps mushroom art
  onto the original flag silhouette. Mario keeps the original flag. NPCs do
  not claim it. The pole and flag never add collision or change velocity. The
  castle door remains the real goal.

Original asset sources and frame details are in the
[sprite credits](../src/assets/smb/README.md) and
[audio credits](../src/assets/audio/README.md).

## Player and controls

Walk and run use original SMB1 caps scaled to 32-pixel tiles (2x NES). Hold B
to run. Jump keeps the horizontal speed from the ground (a walk jump or a
running jump). Hold jump for extra height. A running jump is higher and
farther, matching SMB1 (about five tiles for the small player), so original
gaps stay reachable. Normal and giant
forms use the same jump physics; giant only reaches higher because the body
is taller. Jump does not repeat from a held press. Walking off a ledge keeps
the last ground
pace. Releasing direction stops horizontal motion. Player and NPCs both walk,
run, and running-jump. An NPC does not jump faster than its current ground
speed.

In water, each Jump press is an upward swim stroke. Gravity is reduced and the
player stays below the top of the playfield. Pipes have a short re-entry delay.

On-screen layouts switch from a header button: Compact, NES, or hidden.
Compact is the default and does not persist across sessions. Compact Up may also jump. NES D-pad Up does not
jump. A is jump. B is run (hold) and fire (press, flower required). NES Start
pauses. Select does nothing. Hidden removes the on-screen pad and gives that
space to the playfield. The pad must sit below the game, not over it.

Phaser gamepad input is on. The first active pad merges into the same Input
flags as keyboard and touch. Stick and D-pad walk, with stick deadzone 0.35.
Down enters a pipe. D-pad Up and stick Up do not jump. South (A) jumps and
swims. East (B) holds run and presses fire if the player has a flower. Start
pauses in play and starts the game on the title screen. Select is unused.
Disconnect clears that pad's holds.

The first gamepad button or stick use this session hides the on-screen pad.
The header cycle still works. Unplug does not force the pad back.

Help lists the keyboard and gamepad defaults. Remap Jump, Run, Left, Right,
Down, and Pause by pressing a controller button or D-pad direction. Esc or the
previous binding cancels. There is no separate Fire row; a Run press still
pulses fire. The map is the only localStorage setting. Invalid or missing maps
fall back to the defaults. Reset to defaults is in Help.

| Action | Keyboard | Touch | Gamepad |
| --- | --- | --- | --- |
| Walk | Left/Right or A/D | D-pad Left/Right | Stick or D-pad (deadzone 0.35) |
| Run | Shift, Z, or J | B | B (East) |
| Jump or swim upward | Space, Up, W, or K | A; Compact Up | A (South) |
| Enter pipe | Down or S | D-pad Down | Down |
| Fire with a flower | Shift, Z, or J (press) | B (press) | B (East) press |
| Pause | Escape | Pause; NES Start | Start |
| Select | | NES Select | Unused |

A header Key bindings button shows this keyboard list and the gamepad
defaults in a dialog.

On the title screen, the consecutive Konami sequence up, up, down, down, left,
right, left, right, B, A unlocks two session-only title buttons rather than
the tray. Extra keys before the sequence are fine. A wrong key in the middle
starts the sequence over. Completing it does not press Start Game. Keyboard
uses the arrow keys, then letter B, then letter A. Letter A is not walk. WASD
does not count as the final A. A gamepad uses the D-pad plus B then A the same
way. Unlock plays the coin sound. Mute still unlocks and skips the sound.
Reload clears the unlock, the toggle, and any half-finished world pick.
Nothing is stored.

Unlimited power-ups is a visible on/off toggle. Off is the default after
unlock. On shows the existing in-play tray. Off hides it. Title clicks never
spawn items.

Choose stage replaces the title actions with Select world (one button per
world 1-8). After a world, Choose the stage (one button per stage 1-4). Back
to world select is allowed until a stage is picked. Picking a stage starts it
immediately: lives reset as Start Game, that campaign index, the WORLD n-n
intro, then play. Campaign then continues in order through 8-4. Pipe-intro
stages 1-2, 2-2, 4-2, and 7-2 still play their overworld strip on that first
arrival.

The tray sits at the bottom of the playfield, above the on-screen pad, with
star, 2x, 3x, 8x, flower, and 1-up. A click while playing spawns that item in
the player column. It hangs in the sky when that column is open, or at the
first empty cell under a ceiling. It blinks in place for the cheat-drop hold,
stays at that world position, and is not collectable until it lands. Then it
falls straight down with no horizontal spawn drift. Any character can collect
it after it lands. It plays the appear cue. Ignore clicks on the title, intro,
GAME OVER, dead, or finishing screens, and while the player is in a pipe.

A side pipe can also be entered by walking into its opening. There is no Hide
or manual Warn button.

Track fingers and keys separately. One release must not clear another hold.
A finger can slide between controls, slide out to release, and slide back in.
Missed touch ends and capture loss must not leave a control stuck. Clear holds
and action pulses on pause, restart, death, blur, page hiding, or rotation.
A cleared hold requires a fresh press; key repeat or finger motion cannot revive it.

Block selection, touch callouts, and browser gestures in the control area.
Keep menus usable by keyboard and touch. Landscape is preferred, but portrait
controls and text must remain visible. Desktop emulation does not prove that
iOS system gestures are suppressed on a physical phone.

## Warnings

An unwarned NPC inside the warning radius automatically makes the player speak.
No contact is required. White pixel text with a black outline appears at the
world position where the player spoke, and a short squeaky voice cue plays.
The cue is one of a small pool of synthesized chirps, picked at random.
A new shout does not replace earlier lines; each line expires on its own after
about two seconds. The same radius warns those NPCs. Each character counts as
warned only once. A warned NPC shows a tiny 8-bit sweat drop above its head,
then the mark goes away. The drop stays the same pixel size at every mushroom
scale.

Every phrase must urge escape from incoming Mario. Use the phrase pool in
[tuning](../src/game/config.ts), with lines such as “Run! Mario is coming!”
and “Run my brothers or perish!” Avoid unrelated jokes.

Warnings have a limited range measured from body edges, so a larger player
still warns an NPC that is touching or standing beside them. Mario can hear
them too. A closer warning is more likely to draw him. Speaking does not
grant safety.

## NPCs

Use a fixed land population per stage (`population` in tuning). Do not replace
dead or saved NPCs. Randomize safe starting positions and hidden traits for
fear, reaction time, and speed. About one in three land NPCs start on a nearby
brick, question block, pipe lid, or moving platform when those tops exist. The
rest start on the floor. Unrevealed hidden blocks are not standable starts.
Two NPCs do not share a spawn cell. These traits stay fixed during an attempt.

Water areas also spawn fish from original type-7 enemy placements. Those fish
are rescue NPCs, not a synthetic extra population and not SMB1 chase-the-player
Cheep Cheeps. They use Cheep Cheep art from the enemy sheet. Fish appear only
in water areas. WARNED, SAVED, and DIED count every NPC including fish, so the
tally uses the actual NPC count rather than the land population alone.

Unwarned NPCs patrol, pause, turn, and step off safe surfaces. They avoid lethal
gaps and do not rapidly flip direction on a small block. A warning starts their
reaction delay and then their escape.

Warned NPCs move toward a rescue door. They plan landings, use platforms and
springs, back up for higher routes, and find lower paths through castle passages
and down from a ceiling above an exit. A fleeing NPC that meets a non-goal
enterable pipe may duck in and count as saved after the entry animation.
Swimmers, including warned fish, route around coral and pipes toward the rescue
door. NPCs keep moving and can collect items
outside the camera view, including while the player is in another area.

NPCs collect items by contact without seeking them or intentionally attacking
Mario. A giant NPC still flees. Only the giant player can stomp Mario.
When the player and Mario overlap in the air, compare feet
(`body.bounds.max.y`). Smaller Y is higher. The higher feet deal the hit. Equal
feet (within a tiny epsilon) are a side and not a stomp. A small player with
higher feet does not hurt Mario and does not take that hit.
A falling player that lands on an NPC does not bounce upward. That landing does
not kill or warn the NPC. Side contact is not a bounce. After the landing
contact ends, the NPC can be warned without leaving the warning radius.
A Mario stomp on a walking Koopa turns the Koopa into a
stationary shell. Mario bounces from that stomp. The player cannot shell, kick,
or stop a Koopa. Landing on a walking Koopa leaves it walking. The player does
not hop. That is not a death and has no blood.
A stopped shell is kicked by Mario's side bump or stomp, in Mario's direction.
The player cannot kick a stopped shell. A moving shell that Mario stomps stops.
The player cannot stop a moving shell. Side contact with a moving shell kills
unprotected characters and uses Mario's existing damage rules, with a short
grace after the kick. Landing on or touching a moving shell still kills the
player. Moving shells use the original shell speed, reverse on
walls, and fall off ledges. A stopped shell shakes and then walks again on the
original wake timer, keeping its warned flag. Fireballs, pits, and other moving
shells still kill. A shelled Koopa is still living and can still be saved.
Goombas have no shell.
Saved NPCs stay safe and cannot return to danger.

## Counters and finish

The in-play header is one non-wrapping SMB1 status block: `GOOMBA`, SCORE, `COINS`,
WORLD, and TIME. Icon tools stay on the right and must not wrap over the
playfield. Lives appear only on the WORLD n-n intro (`× 03`), not the in-play
bar. WORLD intro text, the life portrait, and GAME OVER scale with the
playfield so they stay in proportion at phone and desktop widths, stay
pixelated, and do not clip or overflow. There is no in-world elapsed WORLD
overlay.

TIME counts down from the original per-stage timer (`header.timer`: 0=400, 1=300,
2=200) at the original 24-frame tick. TIME starts when the player has control on
the main area, not during a pipe-intro strip. TIME 0 is a death and spends a
life; 8x does not ignore it. At 100, play the hurry cue, then the area theme
faster.

SCORE is campaign-long. Title and GAME OVER zero it. A lost life keeps SCORE and
coins. SCORE may go negative; the HUD shows a minus. 100 coins grant a 1-up and
wrap coins to 0.

Only coins the player Goomba acquires add to the coin count and SCORE. A Mario
or NPC hit, collection, or smash may still pop and play sound.

Live scoring during play:

- Coin: +200
- Same-size or smaller mushroom (no size change): +1000

Warned increases on the first warning heard by an NPC. A later death does not
reduce it. Saved increases when an NPC reaches a rescue door alive, or when a fleeing NPC
finishes entering a non-goal enterable pipe.
No character can count twice. Warn and rescue still exist for score only.

The castle door is always open. Reaching it completes the stage:

1. The player vanishes. Mario and NPCs keep playing.
2. Play the original clear tune.
3. Leftover TIME ticks to 0 at one unit per frame. SCORE rises +50 per remaining
   TIME unit with a quieter tally beep on one voice.
4. Then outlined white-on-black lines, no box: WARNED, SAVED, DIED, FLAG, MARIO.
   Each line is count × points, then SCORE updates. Saves, deaths, and Mario
   finishes during the tally still count.
5. On castle-door (flagpole) stages, fireworks start when leftover TIME hits 0
   and overlap those lines. They do not wait for the lines to finish, and they
   do not hold auto-advance. castle-room and pipe-goal stages produce none.
   Pause and Escape stay ignored for the whole finishing sequence. Mute still
   works.
6. Auto-advance to the next WORLD n-n intro. There is no NEXT LEVEL button.
   After 8-4, play the short world-clear cue, then return to the title.

Castle breakdown points:

- Each warned: +100
- Each saved: +1000
- Each died: −2000
- Player beat Mario to the flag: +2000 (0 if Mario was first)
- Each time the player finishes Mario: +1000
- Leftover TIME: +50 per unit
- Flagpole fireworks, from NPCs saved when leftover TIME hits 0 (saves during
  the TIME drain count; later tally saves do not change the count):
  - 20 or more saved: 6 fireworks
  - 12 to 19 saved: 3 fireworks
  - 6 to 11 saved: 1 firework
  - 5 or fewer: 0
- Each firework: +500, added to SCORE as that firework fires, with the original
  fireworks cue. Fireworks burst above the castle against the sky.

Pipe travel can rescue a fleeing NPC on a non-goal enterable pipe. That NPC
leaves play after the entry animation and does not arrive in the destination.
Goal pipes still carry NPCs through to the next area, where they save at that
area's door. The player may backtrack to find more NPCs.

## Mario

Use one active Mario. He normally advances right, but can pause, backtrack,
break bricks, enter pipes, and return from the left. Returns are an unexplained
game dynamic. They do not replace NPCs or reset the attempt.

Mario observes at intervals, reacts with a delay, and aims ahead of targets.
Scenery blocks sight. Warnings and running crowds also draw attention.
His jumps keep their launch direction so targets can dodge.
Side contact alone is not a stomp, including grounded contact and air overlap
with equal feet. He still hunts a giant player and giant NPCs, including 8x.
2x and 3x size is not star immunity. 8x (player, NPC, or Mario) cannot be
killed or shrunk by stomp, fireball, moving shell, side contact, or player
attacks. Falling out of the level still kills player and NPC 8x. 8x Mario
who falls out ends the hunt and returns on the existing timer. TIME 0 still
kills 8x. Any contact between 8x and an enemy is one hit, not a star-kill, and does
not require a falling stomp: 8x player or 8x NPC contact drops Mario one power
stage; 8x Mario contact shrinks 2x or 3x to 1x and kills only 1x. Both sides
8x means no hit. A player or NPC star still defeats him on contact. Mario
hitting a 2x or 3x player still uses shrink-then-kill.

Running NPCs in view increase capped crowd pressure. More pressure makes Mario
return sooner, react faster, run faster, and attack more often. Idle, dead,
saved, offscreen, star, and 8x NPCs do not contribute. Pressure fades when the
crowd stops.

After he flees a visible star holder, he picks the next goal from high to low:

1. An easy nearby stomp (clear sight, about 8-125px). Size does not change this,
   except a small Mario does not dive a 2x or larger player.
2. An on-screen crowd of fleeing NPCs. Star and 8x holders do not add.
3. A visible, already-emerged mushroom, 3x mushroom, 8x mushroom, flower, or
   star, only when 1 and 2 are not live. He detours about two seconds, then
   reassesses. He does not chase coins or 1-up mushrooms.
4. A visible unused question block. Stronger when he is small
   (`marioStage === 0`). Never above 1-3.
5. The existing chase timer and patrol.

He keeps his reaction delay, committed jump direction, Fire Mario fireballs
while chasing, and the 6s chase timer.

Mario can walk and run. He uses running to pursue crowds and evade star holders.
Fire Mario fires aggressively while still trying to stomp targets. In water,
he can swim and attack.

His power stages are small, big, and fire. A player fireball or a giant-player
stomp reduces one stage: fire to big, big to small, then small to defeated.
8x Mario ignores those hits. Shrink and grow blink between the two sizes.
Damage causes blinking, with no frozen hit pose. An active Mario can upgrade
only by collecting an item. Elapsed stage time can affect the form in which
he returns; it cannot spontaneously change his active power. Restarting a
stage resets its timer.

## Castle interiors

Castle areas spawn the original rotating firebars from the enemy tables. Each
bar is a chain of fireballs about a fixed block, at the original length and
spin speed, including both rotation directions. Contact uses the same hurt and
kill rules as other lethal hits. It kills or shrinks the player and NPCs, adds
NPC deaths to DIED, and can damage Mario. A star makes the player immune. 8x
does not smash a firebar. Warned NPCs path around a bar when they can. They
may still die on one.

Bowser stands on the bridge at the end of every castle, placed from that
area's enemy data. He is an ally. He never harms the player or NPCs. He blocks
Mario and delays or damages him with ground fire breath along the bridge. He
does not throw fireballs. He shouts with the existing shout system when the
player or NPCs approach, and every line urges them to run.

The axe sits at the original castle ending (the row-13 axe command, on the
block at the end of the bridge). Only Mario triggers it. That drops the bridge
and kills Bowser. The player touching the axe does nothing. With the bridge
gone, falling is a normal death and spends a life. 8x does not smash Bowser or
the axe.

## Blocks and items

Floating bricks and question blocks are solid. A small-player head hit bounces
a brick without breaking it. A giant-player or Mario head hit breaks an ordinary
brick and removes its collision. A bounce or break from a head hit collects each
coin sitting on that block, with the same coin pop and sound as a hidden coin
block. Only the player Goomba adds that coin to the count and SCORE. It knocks
up each NPC standing on the block. A player bounce or break
does not kill that NPC. Mario's bounce or break kills them, including Koopas,
unless they are 8x; this is not a stomp into a shell.

Visible question blocks that are not hidden 1-up or hidden coin blocks release
one fully random prize from a shared pool of a coin plus the existing
power-ups (star, mushroom, or flower) and become a used block. Head-hit from
below and 8x smash use that same prize rule. Smash may break the box; the
prize is still that roll. Visible question prizes are not authored per block
and do not use random percentages. Original hidden
blocks are revealed by a head hit. An unrevealed hidden block does not support
a character landing from above. Hidden coin blocks release a coin, then stay as
a used platform. A player head hit adds that coin to the count and SCORE. A
Mario head hit pops and plays sound only. Hidden 1-up blocks and the original
non-hidden 1-up bricks release the green 1-up mushroom, not a red mushroom or
other power. A brick with `content: "coins"` yields one coin per head hit. That
coin uses the same player, Mario, or NPC scoring rule as other coins, and the
remaining count goes down by one. Hits continue until remaining is 0 or the
original first-hit window expires (`BrickCoinTimer` $0b ticks of the 21-frame
interval, in `TUNING.multiCoinTimerFrames`); then it becomes a used block. SMB1
does not author a per-block coin count, so remaining starts at
`TUNING.multiCoinCount`. A large player or Mario never breaks an unspent
multi-coin brick. The omitted castle stop block stays omitted so the rescue door
remains open.

An item emerges before it can be collected. While it rises, only the part above
the block is visible. Mushrooms and 1-up mushrooms move
and fall, stars bounce, and flowers remain where they land. Living characters
can collect by contact. Items expire after their lifetime or when they leave
the level. A 1-up grants an extra life and plays the original 1-up sound.

- A star grants temporary immunity. Player and NPC star contact defeats Mario
  unless he also has a star. Mario avoids visible star holders.
- Mushrooms grow Goomba and NPC size only when the mushroom's tier is larger
  than the current size (2x < 3x < 8x). A same-size or smaller mushroom does
  not change size, does not reset the 8x timer, still consumes the item, and
  plays the power-up sound. The player scores 1000 points for that same-size
  or smaller mushroom. NPCs follow the same size rule and do not score.
  Red 2x is the common mushroom. Blue 3x and gold 8x appear less often than
  2x. Star and flower stay in the pool. Any 2x or 3x mushroom grows small
  Mario to Super Mario. `mushroom8x` grows an active Mario to 8x
  (`hugeScale`). While 8x, Mario uses the same smash and walk rules as the
  player and 8x NPCs. 8x lasts 15 seconds, independent of the star, then
  Mario becomes Super Mario (stage 1, big). He does not become 3x or small.
  Fire Mario who took 8x also expires to Super Mario. A same-size or smaller
  mushroom does not reset that timer. An extra mushroom while Mario is already
  Super or Fire and not 8x still scores 1000 and does not change his stage.
  Shrink and grow
  blink between the two sizes. Growth resolves overlap with scenery. Giant
  NPCs can back up to leave low ceilings. The first damaging stomp or hit on
  2x or 3x form shrinks to small instead of killing, and also removes a
  flower. 8x ignores those hits. Collecting a flower never changes Goomba
  or NPC size.
- Player fireballs match the shooter's scale at every size. Existing shots
  keep their launch size.
- 8x lasts 15 seconds, independent of the star, then the player and NPCs
  become 3x. A same-size or smaller mushroom does not reset that timer.
  While 8x, overlap destroys breakable bricks, question and content blocks,
  pipes, and unbreakable wall tiles that are not floors. Destroyed solids play
  the brick-break burst and lose collision. A question or content block yields
  its prize first, then
  breaks. Player coin contents add to the coin count. Mario or NPC coin
  contents pop and play sound only. An 8x smash on a multi-coin
  brick claims all remaining coins at once, then the brick is gone. An item
  spawns already free (`emerge` 0, not frozen) and flies out; it does not use
  the emerge rise or the appear cue. Unrevealed hidden blocks stay hidden.
  Floors, stairs you stand on, moving platforms, the flagpole, the goal door,
  a goal pipe, castle bridges, the axe, springs, and cannons stay. 8x never smashes a
  goal pipe or castle door. The door stays solid. 8x no longer passes through
  an intact pipe: contact destroys it, and that mouth cannot be entered after
  it is gone. Non-goal pipes stay smashable. When the player, an NPC, or Mario
  tries to enter a goal pipe or castle door while 8x, they shrink to the timer
  fallback in that same action (player and NPC to 3x, Mario to Super Mario),
  the 8x timer ends, then they enter, save, or finish. Player, NPC, and Mario
  8x use the same smash rule. The character can still walk. 8x ignores stomp,
  fireball, moving shell, side contact, and player attacks.
- A flower gives the player fireballs and a white palette. NPCs can show the
  flower palette but do not shoot. Mario becomes SMB1 Fire Mario. Collecting
  a flower never changes Goomba or NPC size. A damaging hit while large
  strips the flower with the size for those actors. A small Goomba or NPC
  with a flower still dies on that hit. Mario keeps his SMB1 power ladder.
- Powers can coexist. 2x, 3x, and flower powers last for the stage until a
  damaging hit strips the flower with the size; stars and 8x expire.
  Restart and a new stage clear them.

Mario and a fire-powered player each keep at most two of their own fireballs
in play. Either may throw again when a slot is free. Size does not change that
rate. Player fireballs match the shooter's scale. Existing shots keep their
launch size. Fireballs bounce
on surfaces and stop at walls. Only a 3x or 8x player's fireball breaks an ordinary
breakable brick on side or bottom contact. Top contact bounces and does not
break. Question blocks, used blocks, and unbreakable tiles are not broken this
way. Player fireballs do not harm NPCs. A Mario fireball is a normal hit: it
shrinks 2x or 3x to 1x and kills only 1x, matching a stomp or moving shell.
Stars and 8x ignore that fireball.

## Vines

A brick whose contents are a vine sprouts a climbable vine when hit from
below. A large player or Mario never destroys that brick before it has
sprouted; the brick becomes a used block. The vine grows upward from the
block with the original head and body art.

The player grabs a grown vine by touching it. Up and Down climb. Jump leaves
the vine with a hop. Climbing off the top of the screen goes to the vine's
latched destination area, using the same world-specific area command the
pipes use. TIME, powers, and the rest of the stage stay as they are. The
player arrives still climbing the vine that comes up through the destination
floor hole, then can climb onto that area and jump off. Falling out of a
goal-less vine destination returns to that area's latched overworld page.

NPCs and Mario ignore vines. They do not grab, climb, or block them.

Warp-zone pipes at a vine destination follow the same pipe rules as other
areas.

## Cannons and Bullet Bills

Cannons are terrain (metatiles 100 barrel, 101 pedestal, 102 shaft). They stay
solid. 8x does not smash them. Every cannon barrel in the level data fires; do
not hard-code per stage. Timing follows SMB1. A cannon does not fire when the
player is too close or in the same column. Bullet Bills travel horizontally at
the original speed, ignore gravity, and are removed when they leave the area.
Contact uses the same lethal terms as other hits for the player, NPCs, and
Mario. A bill can be stomped. A star makes the player immune. An NPC killed by
a bill counts in DIED. Escorted NPCs jump rather than walk a cannon firing
lane as a matter of course. They may still be hit.

## Death and audio

A campaign starts with three lives. Lives persist across stages in one
campaign. Play Again resets to three. One successful attack kills an
unprotected player. 2x and 3x form shrinks on the first damaging stomp, shell,
or fireball hit and loses a flower; that size is not full immunity. 8x ignores
those hits.
Falling out of the level also kills, including 8x. TIME 0 still kills 8x. Stars
grant full immunity. Death spends a life. If lives remain, the original-style
black intro shows WORLD n-n and the player Goomba × remaining lives at
playfield scale, then the current stage restarts with cleared counters,
powers, items, speech, used blocks, and pursuit state. Pipe-intro stages skip the overworld strip and
spawn on main. The intro is silent; area music starts with play.
Start Game, auto-continue after a castle tally, and Pause Restart Level go
through that intro when lives remain. The title screen stays the title screen.
When lives reach 0, the
death cue still finishes, then GAME OVER appears on that same black screen
with the original game-over music. When that cue finishes, return to the title.

Mario's kills produce bounded pixel-blood bursts and temporary stains. NPC
deaths have no death-song sequence. Player and Mario deaths play the complete
original death tune. The player Goomba hops up, then falls off the screen. Pit
deaths skip the hop. Mario uses his original upward hop and fall pose, then
returns quickly. His return must not cut off the cue.

Play the original area music and effects. Start audio after a user gesture.
Pause stops playback progress and plays the original pause cue on pause and
resume; mute silences music and effects. A question-block item plays the
original appear effect with the bump; pickup still uses the power-up collect
sound. Player or active Mario stars use Starman music. NPC stars do not change
music. Death, clear, and game-over cues take priority and must finish. There is
no heartbeat, distance meter, or approach-based volume change.

An unavailable audio decoder must not break controls or leave uncaught errors.
Record the failure and show sound as unavailable. Do not insert fake decoded
buffers or claim audio playback was verified on that device.

## Verification

The executable checks are under [tests](../tests). They cover decoded World 1-1
anchors, all stage data, player input replays, NPC routes and quotas, powers,
warnings, Mario behavior, and browser controls. Test fixtures are never bundled.

Player route replays use ordinary controls, with Mario disabled and no random
power-up required. Separate tests cover rescues and active Mario. These checks
do not prove that every random attempt wins, or replace physical phone testing.

Run the commands in [README](../README.md). Builds must remain one standalone
HTML file, with no external runtime assets. Report failed or skipped checks and
the limits of mobile testing plainly.
