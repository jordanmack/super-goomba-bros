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
- Progress through all 32 original SMB1 stages in order.
- Build the world from individual native tiles and bundled JSON. The
  [level data](../src/assets/levels/README.md) comes from public disassembly text.
  Never read or require a ROM.
- Keep the original gaps, pipe dimensions, block rows, stairs, ledges, and castle
  locations. Keep the custom NPC population and rescue rules.
- Include underground, water, and castle areas with their corresponding art and
  music. Moving platforms carry characters. Original springs give a stronger
  bounce.
- Enterable pipes use world-specific destinations and entrance pages. Side
  entrances work when approached at their opening. Decorative pipes stay solid.
- Pipe travel preserves elapsed time, powers, NPC states, broken blocks, items,
  and counters within the stage. It does not itself rescue a character.
- Preserve source warp/vine commands in the data. Campaign progression remains
  sequential; the custom power-up system does not recreate the original vine
  and world-skip rules.
- No logs or hiding spots are added. Bushes are scenery.
- The goal is the castle doorway. Castle interiors use a rescue doorway after
  the original bridge. On stages with a flagpole, the first of the player or
  Mario to pass it raises a matching flag (Goomba or Mario). NPCs do not claim
  it. The pole and flag never add collision or change velocity. The castle door
  remains the real goal.

Original asset sources and frame details are in the
[sprite credits](../src/assets/smb/README.md) and
[audio credits](../src/assets/audio/README.md).

## Player and controls

Walk and run use original SMB1 caps scaled to 32-pixel tiles (2x NES). Hold B
to run. Jump keeps the horizontal speed from the ground (a walk jump or a
running jump). Hold jump for extra height; a running jump goes farther, so
original gaps stay reachable. Normal and giant forms use the same jump. Jump
does not repeat from a held press. Walking off a ledge keeps the last ground
pace. Releasing direction stops horizontal motion. Player and NPCs both walk,
run, and running-jump. An NPC does not jump faster than its current ground
speed.

In water, each Jump press is an upward swim stroke. Gravity is reduced and the
player stays below the top of the playfield. Pipes have a short re-entry delay.

On-screen layouts switch from the pause menu. Compact is the default and does
not persist across sessions. Compact Up may also jump. NES D-pad Up does not
jump. A is jump. B is run (hold) and fire (press, flower required). NES Start
pauses. Select does nothing.

| Action | Keyboard | Touch |
| --- | --- | --- |
| Walk | Left/Right or A/D | D-pad Left/Right |
| Run | Shift or Z | B |
| Jump or swim upward | Space, Up, or W | A; Compact Up |
| Enter pipe | Down or S | D-pad Down |
| Fire with a flower | Shift or Z (press) | B (press) |
| Pause | Escape | Pause; NES Start |

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
No contact is required. An 8-bit bubble appears near the player and a short
squeaky voice cue plays. The same radius warns those NPCs. Each character
counts as warned only once. A warned NPC shows a brief 8-bit exclamation mark
above its head, then the mark goes away.

Every phrase must urge escape from incoming Mario. Use the phrase pool in
[tuning](../src/game/config.ts), with lines such as “Run! Mario is coming!”
and “Run my brothers or perish!” Avoid unrelated jokes.

Warnings have a limited range and a short cooldown. Mario can hear them too.
A closer warning is more likely to draw him. Speaking does not grant safety.

## NPCs

Use a fixed population per stage. Do not replace dead or saved NPCs. Randomize
safe starting positions and hidden traits for fear, reaction time, and speed.
These traits stay fixed during an attempt.

Unwarned NPCs patrol, pause, turn, and step off safe surfaces. They avoid lethal
gaps and do not rapidly flip direction on a small block. A warning starts their
reaction delay and then their escape.

Warned NPCs move toward a rescue door. They plan landings, use platforms and
springs, back up for higher routes, and find lower paths through castle passages.
Swimmers route around coral and pipes. NPCs keep moving and can collect items
outside the camera view, including while the player is in another area.

NPCs collect items by contact without seeking them or intentionally attacking
Mario. A giant NPC still flees. Only the giant player can stomp Mario.
A falling player that lands on an NPC bounces upward a little. That bounce does
not kill or warn the NPC. Side contact is not a bounce.
Saved NPCs stay safe and cannot return to danger.

## Counters and finish

Display separate Warned and Saved counters plus rescue progress against the
configured requirement. Display collected coins and remaining lives at the top
of the screen.

Warned increases on the first warning heard by an NPC. A later death does not
reduce it. Saved increases only when an NPC reaches a rescue door alive.
No character can count twice. Coins can be collected, but do not change rescue
scores or requirements.

NPCs can enter safety before the player meets the quota. The player may backtrack
to find more NPCs. The area before a locked door gives no special protection.

Once enough NPCs are saved and the player contacts the doorway:

1. Make the player safe.
2. Play the original clear tune.
3. Start one fixed final rescue window.
4. Let remaining NPCs continue moving and facing Mario.
5. At the cutoff, lock the counts and show the result.

Later arrivals do not count and cannot extend the window. Next Level starts the
next stage through the intro with fresh counters, actors, blocks, and powers.
Lives persist. The final Play Again starts a new campaign with three lives.

A rescue is impossible when `saved + living_unsaved < required`. Include warned
and unwarned living NPCs. Keep the goal locked, show that too many were lost,
and let Mario keep hunting. The player may restart through Pause.

## Mario

Use one active Mario. He normally advances right, but can pause, backtrack,
break bricks, enter pipes, and return from the left. Returns are an unexplained
game dynamic. They do not replace NPCs or reset the attempt.

Mario observes at intervals, reacts with a delay, and aims ahead of targets.
Scenery blocks sight. Warnings and running crowds also draw attention.
His jumps keep their launch direction so targets can dodge.
Side contact alone is not a stomp. He still hunts a giant player and giant
NPCs. Giant size is not star immunity.

Running NPCs in view increase capped crowd pressure. More pressure makes Mario
return sooner, react faster, run faster, and attack more often. Idle, dead,
saved, and offscreen NPCs do not contribute. Pressure fades when the crowd stops.

Mario can walk and run. He uses running to pursue crowds and evade star holders.
Fire Mario fires aggressively while still trying to stomp targets. In water,
he can swim and attack.

His power stages are small, big, and fire. A player fireball or a giant-player
stomp reduces one stage: fire to big, big to small, then small to defeated.
Shrink and grow blink between the two sizes. Damage causes blinking, with no
frozen hit pose. An active Mario can upgrade only by collecting an item.
Elapsed stage time can affect the form in which he returns; it cannot
spontaneously change his active power. Restarting a stage resets its timer.

## Blocks and items

Floating bricks and question blocks are solid. A small-player head hit bounces
a brick without breaking it. A giant-player or Mario head hit breaks an ordinary
brick and removes its collision. Breaking a brick under an NPC does not kill it.
A bounce or break from a head hit collects each coin sitting on that block.

Visible question blocks that are not hidden 1-up or hidden coin blocks release
one random star, mushroom, or flower and become a used block. Original hidden
blocks are revealed by a head hit. An unrevealed hidden block does not support
a character landing from above. Hidden coin blocks release a coin, then stay as
a used platform. Hidden 1-up blocks and the original non-hidden 1-up bricks
release the green 1-up mushroom, not a red mushroom or other power. The omitted
castle stop block stays omitted so the rescue door remains open.

An item emerges before it can be collected. Mushrooms and 1-up mushrooms move
and fall, stars bounce, and flowers remain where they land. Living characters
can collect by contact. Items expire after their lifetime or when they leave
the level. A 1-up grants an extra life and plays the original 1-up sound.

- A star grants temporary immunity. Player and NPC star contact defeats Mario
  unless he also has a star. Mario avoids visible star holders.
- Mushrooms set Goomba and NPC size to that mushroom's tier, including shrink.
  Red 2x is the common mushroom. Green 3x and gold 8x appear less often than
  2x. Star and flower stay in the pool. Any mushroom grows small Mario to big
  Mario; this size ladder is only for the player Goomba and NPCs. Shrink and
  grow blink between the two sizes. Growth resolves overlap with scenery.
  Giant NPCs can back up to leave low ceilings. The first damaging stomp or
  hit on mushroom form shrinks to small instead of killing. A flower can
  remain on the small form.
- 2x keeps player fireballs at 1x. 3x uses the current giant fireball scale.
  8x fireballs match that size. Existing shots keep their launch size.
- 8x lasts the star duration, then size becomes 3x. Collecting another
  mushroom cancels the 8x timer. While 8x, walking smashes breakable bricks
  and treats unbreakable walls and pipe solids as empty. Floors still hold.
  Down at a real pipe entrance still enters. The character can still walk.
- A flower gives the player fireballs and a white palette. NPCs can show the
  flower palette but do not shoot. Mario becomes Fire Mario.
- Powers can coexist. 2x, 3x, and flower powers last for the stage; stars and
  8x expire. Restart and a new stage clear them.

Mario and a fire-powered player each keep at most two of their own fireballs
in play. Either may throw again when a slot is free. Size does not change that
rate. 2x keeps player fireballs at 1x. 3x uses the giant fireball scale. 8x
fireballs match that size. Existing shots keep their launch size. Fireballs bounce
on surfaces and stop at walls. Only a 3x or 8x player's fireball breaks an ordinary
breakable brick on side or bottom contact. Top contact bounces and does not
break. Question blocks, used blocks, and unbreakable tiles are not broken this
way. Player fireballs do not harm NPCs. Mario's fireballs kill unprotected
characters, including giants. Stars protect against those fireballs.

## Death and audio

A campaign starts with three lives. Lives persist across stages in one
campaign. Play Again resets to three. One successful attack kills an
unprotected player. Mushroom form shrinks on the first damaging stomp or hit;
it is not full immunity. Mario's fireballs still kill characters who are not
star-protected, including giants. Stars grant full immunity. Falling out of
the level also kills. Death spends a life. If lives remain, the original-style
black intro shows WORLD n-n and the player Goomba × remaining lives, then the
current stage restarts with cleared counters, powers, items, speech, used
blocks, and pursuit state. The intro is silent; area music starts with play.
Start Game, Next Level, and Pause Restart Level go through that intro when
lives remain. The title screen stays the title screen. When lives reach 0, the
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

Player route replays use ordinary controls, with Mario disabled, the quota
pre-satisfied, and no random power-up required. Separate tests cover rescues
and active Mario. These checks do not prove that every random attempt wins,
or replace physical phone testing.

Run the commands in [README](../README.md). Builds must remain one standalone
HTML file, with no external runtime assets. Report failed or skipped checks and
the limits of mobile testing plainly.
