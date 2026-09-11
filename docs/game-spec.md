# Super Goomba Bros

## Purpose and status

This document specifies the first playable version of an HTML browser game
rendered with Three.js. It records the design agreed during the planning
conversation and defines checks for the implementation.

Unmarked rules describe the agreed design and its direct consequences. Values
marked **Starting value** are initial tuning choices. Items marked **Proposed**
fill gaps in the discussion and are working assumptions, not confirmed choices.

## Concept

Play as a Goomba in an 8-bit, 2D side-scrolling platform game with reversed
Mario roles. Reach the goal while warning other Goombas and Koopa Troopas that
Mario is coming. Help them escape and survive his attacks yourself.
These other characters are referred to as non-player characters (NPCs).

Mario is a computer-controlled threat with his own general goal of moving
right through the level. He explores, backtracks, attacks, and regularly
returns to the player's area. His arrival should create tension and a choice:
evade attacks or risk making noise to warn others.

The tone combines danger with funny, urgent warnings. The warning text must
tell characters to flee because Mario is approaching.

## First-version scope

Latest layout revision: use the original NES World 1-1 surface map. Tile
coordinates are in `../src/game/world-1-1.ts`; artwork provenance is in
`../src/assets/smb/README.md`. Match all three gaps, the six pipes and their
different heights, floating block rows, permanent stairs, and the castle door.
Keep the custom NPC population, rescue quota, hunting, and blood effects.
Use original bushes, pipes, and floating blocks as scenery and obstacles; extra
logs and random scenery from the prototype are not placed on this map. Pipes
remain solid obstacles and are not hiding entrances.
The map is built from individual 16-pixel sprites and tile coordinates. Static
tiles are batched for rendering; interactive blocks have their own sprites.
No full-map background image or sky patches are used at runtime. Jump height
must allow passage over the original tall pipes. Stair collision columns must
not trap NPCs at tile seams; test varied speeds and giant NPCs on the full route.

- One complete level with a reachable goal and routes for backtracking.
- Desktop keyboard and mobile touch support.
- Flat pixel-art sprites and tile scenery rendered with Three.js.
- A side view and 2D movement. No 3D character models are needed.
- Goomba movement, warnings, NPC rescues, and Mario encounters.
- A title screen named exactly **Super Goomba Bros**.
- Original background music, game effects, and a short victory tune.

Multiple levels and endless NPC spawning remain outside this version's scope.

## Main play loop

1. Move through the level and find NPCs.
2. Get close enough to warn them with a spoken warning.
3. Watch them run toward the castle door according to their traits.
4. Hit question blocks for power-ups and watch for Mario.
5. Evade his attacks, then continue warning and moving right.
6. Backtrack for more NPCs if too few have reached safety.
7. Enter the castle door once the rescue requirement is met.
8. Wait through the short final rescue window, then receive the result.

## Player movement and controls

The Goomba walks at one fixed pace and can jump. There is no player sprint,
Run button, or Shift speed boost. Mario and fleeing NPCs can still run.
Small and giant player forms use the same standard jump height. Holding Jump
does not add lift or trigger repeated jumps.

Normal jumps cross gaps, dodge, and reach blocks. A giant player's stomp can
kill Mario; normal jumps do not damage him.

**Proposed default controls:**

| Action | Desktop | Mobile |
| --- | --- | --- |
| Walk left or right | Left or Right arrow | Left and Right buttons |
| Jump | Space | Jump button |
| Fire (with flower) | Z | Fire button |

Both input methods must provide the same actions. Touch controls must support
simultaneous movement and an action such as jumping or firing.
Track each finger, pointer, and keyboard key separately. Sliding between buttons
changes the held action; sliding outside releases it. One finger lifting must
not release another finger or key holding the same action. Native non-passive
touch handlers block default gestures only in the gameplay control area.
Clear all holds on pause, restart, death, focus loss, page hiding, or rotation.
Verify tap-then-hold and long-press behavior on a real iPhone; desktop touch
emulation does not verify iOS system gestures.

**Proposed default:** landscape is the preferred phone layout. Portrait should
still provide access to the game and controls without overlap or clipped text.

## Spoken warnings

Touching an unwarned NPC makes the Goomba speak and shows a speech bubble near
its mouth. Select a random phrase from a pool. Every phrase must urge escape
from incoming Mario, rather than offer unrelated commentary about him. Play a
short squeaky voice cue with each automatic warning.

Example phrase pool:

- "Run! Mario is coming!"
- "Move! The plumber is coming!"
- "Run! The demon is coming!"
- "Run! The mustache is coming!"
- "Get out! The red hat is coming!"
- "Run for the goal! Mario is close!"
- "Keep moving! Mario is on his way!"
- "Flee! Those boots are coming!"
- "Scramble! The plumber is almost here!"
- "Run your shells off! Mario is coming!"
- "Run! Trouble has a mustache, and it's coming!"
- "Get to safety! Mario is coming!"

A warning affects only nearby NPCs. One contact may warn several NPCs within
range. An NPC counts as warned only once. Repeated warnings do not increase
the counter for that character.

Mario can hear warnings too. The closer he is, the more likely a warning is
to attract him. Contact warnings happen while the player is exposed.

**Proposed default:** use a short warning cooldown to prevent continuous
shouting. Warning range, hearing range, and cooldown require playtesting.
No numerical values for them have been agreed.

## NPC population and behavior

Use the population and rescue requirement in `../src/game/config.ts`.
The population was increased after playtesting to create crowded encounters.
These are a fixed population for a run. NPCs do not spawn as replacements.

The NPCs include other Goombas and Koopa Troopas. Randomize their starting
positions and behavior traits when preparing a run. Positions must
allow them to reach the goal.

**Proposed default:** select starting positions from tested locations in a
fixed level layout. Random placement must not put an NPC inside scenery, in a
hazard, at the goal, or beyond a route it can travel.

Each character receives traits that remain fixed for that run:

| Trait | Effect |
| --- | --- |
| Fear | Changes urgency and risk tolerance while running |
| Reaction time | Changes how soon the character responds to danger or a warning |
| Run speed | Changes how quickly the character moves toward safety |

These values are hidden from players. The game does not expose personality
dials in its player interface.

Warned NPCs run toward the castle door. They behave differently based on their
traits, with random choices weighted by those traits.

**Proposed default:** make behavior choices when a warning or change in danger
calls for a response. Let the NPC carry out its choice before deciding again,
so random behavior does not cause constant switching between movement choices.

An NPC is not saved merely because it was warned. It is saved
only when it reaches the goal alive. Mario can kill NPCs before they arrive.

NPCs that reach the goal stay safe and cannot return to danger. NPCs outside
the camera view must continue to move and encounter Mario; scrolling
away must not stop their rescue progress or remove them from the population.

Unwarned NPCs slowly patrol their local area, pausing and changing direction.
They step off blocks, pipes, and stairs when there is safe ground below, keep
moving horizontally while falling, then set a new patrol center after landing.
They turn away from lethal gaps and walls. If both directions are blocked,
they pause instead of turning every frame. Warning interrupts the patrol
and starts their normal reaction and escape behavior. Patrol tuning lives in
`../src/game/config.ts`.
They can still be attacked by Mario. A dead or saved NPC cannot hear a new
warning or contribute to Warned again.

## Counters, goal, and scoring

Show separate **Warned** and **Saved** counters during play.

- Warned increases when a previously unwarned NPC hears a warning.
- Saved increases when an NPC reaches the goal alive.
- An NPC can contribute at most once to each counter.
- Death after a warning does not undo the fact that the NPC was warned.

Display rescue progress against the requirement in `../src/game/config.ts`.
Allow the saved total to exceed the requirement, up to the level population.
Saving additional NPCs contributes to the player's result.

The player cannot finish until enough NPCs have reached safety. If the player
reaches the goal too early, they must be able to go back and warn more NPCs.
The requirement blocks only the player's finish. NPCs can enter safety before
the requirement is met, so they can unlock the player's goal.

**Proposed default:** the area before the locked goal gives the player no
special protection. Show the remaining rescue requirement there.

When the requirement is met and the player enters the goal:

1. Make the player safe from Mario.
2. Play a short victory tune.
3. Allow a final rescue window for NPCs still on their way.
4. End the level and lock the final saved count when the window ends.

**Starting value:** the final rescue window lasts 5 seconds.

The window begins only once, on successful player entry. NPCs still outside
safety continue their escape during it. Mario remains a threat to those NPCs.
At the cutoff, NPCs still outside safety do not count as saved. The level does
not restart or extend the window when another NPC arrives.

**Proposed default:** use the saved total as the score and show both final
counters. A separate points formula has not been specified.

## Mario behavior

Latest playtest revision: Mario actively hunts visible Goombas and Koopas,
selects another victim after a kill, and returns more frequently. He observes
at intervals, reacts with a delay, and aims jumps ahead of moving targets.
Solid scenery blocks sight. Jumps commit to their
takeoff velocity, allowing dodges. Side contact alone does not kill; landing
a stomp or hitting with a fireball does.
Current population, obstacle sizes, and escalation settings live in `../src/game/config.ts`.

Running NPC crowds on screen attract Mario. Nearby exposed runners increase
his hearing range and draw his target choice toward the crowd. As the crowd
grows, he returns sooner, reacts faster, runs faster, and attacks more often.
The boost is capped and fades after runners stop, die, reach safety, or
leave the screen. Idle patrols do not count. Fireballs still unlock by elapsed
time, not crowd size. Crowd settings live in
the same tuning file.

Mario is computer-controlled. He roams the same general area as the player and
usually moves right toward the goal, with stops and changes of direction.

He can:

- Run past without noticing the player.
- Stop to break bricks or enter pipes.
- Move left while backtracking.
- Pursue and attempt to stomp a detected player.
- Break a brick containing the hidden player.
- Later gain fireballs as his strength increases.
- Leave toward the right and later reappear off-screen to the left.

His returns are a random game dynamic. They may suggest that he died elsewhere
and restarted, but the game does not explain why. Mario should remain a
recurring threat throughout a run.
His return does not reset the run, replace NPCs, or reset his escalation.

Sight and sound influence detection. Hearing a warning is more likely at
shorter distance. Running NPC crowds also attract him. If he sees the player,
he can try to attack immediately.

**Proposed default:** use one active Mario at a time. Spawn him outside the
visible play area so he must enter the scene before reaching the player. Give
pursuit a limit so he eventually resumes roaming or moving toward the goal.
Detection distances, return intervals, and pursuit duration are tuning work.
If Mario reaches the goal, let him leave and become able to return. His
arrival does not itself end the player's attempt.

## Escalation

Mario grows stronger based on elapsed level time, not the rescue count.
Restarting the level resets his strength and the timer.

**Proposed progression:**

| Phase | Behavior |
| --- | --- |
| Early | Chase, jump, stomp, and break bricks |
| Middle | Move faster, making escape harder |
| Late | Retain earlier abilities and gain fireballs |

Exact transition times and speeds require playtesting. Give each power-up a
clear visual and sound cue. Fireballs must be visible and allow a chance to
evade.

## Obstacles and vulnerability

Pipes and floating blocks are solid World 1-1 obstacles. The player, NPCs, and
Mario must jump over pipes. Ordinary bricks break when Mario or a giant player
strikes their underside; small-player head hits only bounce them. Breaking a
brick removes its collision body and emits debris. No character can hide, and
all characters remain vulnerable in the open. NPCs must keep moving when idle
and navigate stairs, pipes, blocks, and gaps without getting stuck.

## Blocks and power-ups

Question-block contents are randomized from a star, mushroom, and fire flower.
Each block releases one item, which emerges upward before becoming collectible.
Stars bounce, mushrooms walk and fall, and flowers stay where they land.
The player, active Mario, or any living NPC can collect an item by touching it.
NPCs never seek items or deliberately attack Mario. Saved and dead NPCs cannot
collect. Items disappear after collection,
falling out of the level, or their lifetime limit.

- Star: temporary immunity. Player and NPC star contact kills Mario unless he
  also has a star. Mario's star also protects him from stomps and fireballs.
  He avoids visible star holders and can return later without resetting the run.
- Mushroom: three times the sprite width and height, with a matching larger body
  for Goombas and NPCs. The player's jump stays at standard height. Mario grows
  from small to big. Giant characters can still be killed by Mario fireballs.
  Only the player can stomp Mario to kill him; giant NPCs keep fleeing. Giants
  remain exposed and cannot hide.
  Growth must resolve overlap with scenery. Giant NPCs can back up and jump
  vertically to get out from under low ceilings.
- Flower: unlocks player fireballs with Z and a touch Fire button. The player
  can launch one fireball per second. Small Goombas shoot normal fireballs;
  giant Goombas shoot fireballs three times larger. Fireballs bounce on solid surfaces,
  stop at walls, and step Mario down one power stage without hurting NPCs.
  Goombas and Koopas use a white power-up palette. NPCs can collect flowers
  and show their power but do not fire them.
  Mario becomes Fire Mario when he collects a flower.

Stars and giant-player stomps kill Mario. His original death tune replaces the
music while his death sprite hops up and falls through the scenery. The tune
finishes before background music resumes. Mario returns quickly; the delay is
in the tuning file and is not shortened by crowd pressure during death.
Fireballs step Mario from fire to big, big to small, then kill small Mario.
Mushroom and flower powers last for the run; stars expire. Powers can coexist. Durations, cooldowns,
and growth size use `../src/game/config.ts`. A power label and sprite effects
show the player's current powers. Restart clears all powers, items, and used blocks.

## Death, failure, and restart

One successful hit from Mario kills an unprotected player. Stars and mushrooms
provide immunity to his attacks. There is no health bar or
multi-hit allowance. Death restarts the level and clears both counters, rescue
progress, NPC states, and Mario's escalation timer.

Mario's kills produce red pixel-blood bursts, impact sounds, and temporary
stains on surfaces. This applies to the player and NPCs, including stomp,
fireball, and occupied-brick kills. Effects continue during the brief player
death pause, remain visible behind its text, and clear on restart. Cosmetic
randomness does not affect AI decisions. Particle counts and lifetimes are
bounded. Falling out of the level does not create an off-screen blood burst.

The rescue requirement is higher than the initial prototype; use the current
tuning file. If too few NPCs remain to meet it, keep the attempt running with
the goal locked. Show that too many were lost. Mario keeps hunting, gives the
player higher target priority, and moves faster. Death still restarts the level;
the pause menu also permits a manual restart.

The target is impossible when `saved + living_unsaved < required_saved`.
Include both warned and unwarned living NPCs, plus those already saved.

**Proposed default:** falling into a lethal gap also kills the player. Keep
death feedback brief before the automatic restart. NPC losses use the same
rescue-impossibility rule whether caused by Mario or level hazards.

Restart must restore the level's bricks and reset Mario's position and pursuit.
It must remove fireballs and clear warning cooldowns, hiding progress, speech
bubbles, and any finish countdown. No progress carries into the next attempt.

## Presentation and sound

Use the original NES overworld recording and original game sound effects.
Audio sources and action mappings are documented in `../src/assets/audio/README.md`.
There is no approach heartbeat, distance meter, or music ducking based on Mario's
distance. Background music stays at a steady volume.
The original Starman music replaces the overworld music while the player or
active Mario has a star. NPC stars do not change the music. When neither the
player nor active Mario has a star, the overworld music returns. Death and
level-clear cues take priority and play in full.
Pause freezes playback, mute silences music and effects, and level-clear/death
cues replace the background music. Restart begins the music again.

Use NES scenery sprites, the original blue sky palette, black HUD and readable
pixel controls. Keep native character pixels and proportions, scaled for giants.
Keep the camera side-on and speech bubbles readable above the player.

Mario still enters from outside the visible area; no proximity warning is shown.

Provide the victory tune at successful goal entry. Warning phrases appear as
text; recorded or synthesized speech is not required by this design.

**Proposed default:** use short game sounds for warnings, item pickup, and NPC
arrivals. Start browser audio after the player starts the game, and offer
a mute control.

## Acceptance checks

These are checks to run against the playable game, not completed test results.
Use the starting tuning values below unless playtesting has changed them.

- The title reads `Super Goomba Bros`.
- The same level is playable with a keyboard and with touch controls.
- The player can walk, jump, and fire with a flower. Both player sizes use the same standard jump height. Contact automatically warns nearby NPCs. Shift does not change speed.
- Small-player head hits bounce bricks; giant-player hits break them without killing NPCs on top.
- Question blocks release one random item and turn into used blocks.
- NPCs collect items by contact without seeking them or attacking Mario.
- Stars and giant-player stomps kill Mario with his death tune and hop-and-fall animation; fireballs step him through fire, big, and small stages.
- Normal and giant NPCs can complete the full route through pipes, stairs, and gaps.
- Running NPC crowds and warnings can attract nearby Mario.
- Each warning phrase urges escape from approaching Mario.
- A warning affects nearby NPCs and does not recount a previously warned NPC.
- A warning can reach a group; NPCs beyond its range remain unwarned.
- The configured fixed NPC population starts each run.
- NPC deaths do not cause replacement spawns.
- NPC traits differ between characters and remain fixed within a run.
- Warned NPCs run toward the castle door.
- NPC rescue progress continues outside the camera view.
- Saved increases only on arrival at the castle door, never on warning.
- A warned NPC's death leaves Warned unchanged and does not increase Saved.
- The player must reach the rescue requirement in the tuning file to finish.
- NPCs can enter safety while the player's goal remains locked.
- The player can backtrack when arriving below the rescue requirement.
- Successful goal entry grants safety and starts the tune and final window.
- Arrivals within the 5-second window count; later arrivals do not.
- Mario can pass, pursue, backtrack, interact with scenery, and return.
- Mario's return preserves NPC states, counters, and his current strength.
- No heartbeat or distance meter remains; elapsed time still unlocks Mario's fireballs.
- The player can be killed during the 0.5-second hiding transition.
- Mario can target the player after seeing entry, before hiding completes.
- All characters remain vulnerable to Mario in the open.
- Contact warnings can attract Mario; closer warnings are more likely to do so.
- One successful hit kills the player and restarts the level with reset state.
- An impossible rescue target locks the goal while play and Mario's hunting continue.
- Saved NPCs and all living unsaved NPCs count toward whether rescue is possible.

## Implementation handoff

The playable implementation is now in `src/`. See `../README.md` for run,
build, and control instructions. `../src/game/config.ts` is the source of truth
for current tuning; numerical values in this spec record the initial design.
Automated simulation checks are in `../tests/simulation.test.ts`, and browser
checks are in `../tests/browser/game.spec.ts`.

Implement the agreed rules first. Treat proposed defaults as explicit working
assumptions, and validate timing, controls, and difficulty in a playable build.
Keep gameplay tuning in one implementation source when that source exists;
update this document to reference it instead of duplicating changing values.

This specification does not claim that gameplay, browser compatibility, or
balance has been tested. Those checks require the game implementation.
