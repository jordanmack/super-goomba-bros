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
hide, evade, or risk making noise to warn others.

The tone combines danger with funny, urgent warnings. The warning text must
tell characters to flee or hide because Mario is approaching.

## First-version scope

- One complete level with a reachable goal and routes for backtracking.
- Desktop keyboard and mobile touch support.
- Flat pixel-art sprites and tile scenery rendered with Three.js.
- A side view and 2D movement. No 3D character models are needed.
- Goomba movement, warnings, hiding, NPC rescues, and Mario encounters.
- A title screen named exactly **Super Goomba Bros**.
- Music or heartbeat cues for Mario's approach and a short victory tune.

Multiple levels, player weapons, direct player attacks, and endless NPC
spawning are outside this version's agreed scope.

## Main play loop

1. Move through the level and find NPCs.
2. Get close enough to warn them with a spoken warning.
3. Watch them run toward the goal or seek cover according to their traits.
4. Use approach sounds to judge when Mario is near.
5. Hide or evade his attacks, then continue warning and moving right.
6. Backtrack for more NPCs if too few have reached safety.
7. Enter the goal once the rescue requirement is met.
8. Wait through the short final rescue window, then receive the result.

## Player movement and controls

The Goomba can walk, run, and jump. Running is unlimited. Running makes
footsteps that nearby Mario can hear; walking is quieter and supports sneaking.

**Proposed default:** a small jump suited to gaps, dodging, and access to cover.
The player does not gain an attack by jumping.

**Proposed default controls:**

| Action | Desktop | Mobile |
| --- | --- | --- |
| Walk left or right | Left or Right arrow | Left and Right buttons |
| Run | Hold Shift while moving | Run button while moving |
| Jump | Space | Jump button |
| Hide | Hold Down at cover | Hold Hide at cover |
| Warn | X | Warn button |

Both input methods must provide the same actions. Touch controls must support
simultaneous movement and an action such as jumping or warning.

**Proposed default:** landscape is the preferred phone layout. Portrait should
still provide access to the game and controls without overlap or clipped text.

## Spoken warnings

Pressing Warn makes the Goomba speak and shows a speech bubble near its mouth.
Select a random phrase from a pool. Every phrase must urge escape from incoming
Mario, rather than offer unrelated commentary about him.

Example phrase pool:

- "Run! Mario is coming!"
- "Hide! The plumber is coming!"
- "Run! The demon is coming!"
- "Run! The mustache is coming!"
- "Get out! The red hat is coming!"
- "Run for the goal! Mario is close!"
- "Take cover! Mario is on his way!"
- "Flee! Those boots are coming!"
- "Scramble! The plumber is almost here!"
- "Hide your shells! Mario is coming!"
- "Run! Trouble has a mustache, and it's coming!"
- "Get to safety! Mario is coming!"

A warning affects only nearby NPCs. One shout may warn several NPCs within
range. An NPC counts as warned only once. Repeated warnings do not increase
the counter for that character.

Mario can hear warnings too. The closer he is, the more likely a warning is
to attract him. Shouting can reveal the player even when hidden.

**Proposed default:** use a short warning cooldown to prevent continuous
shouting. Warning range, hearing range, and cooldown require playtesting.
No numerical values for them have been agreed.

## NPC population and behavior

**Starting values:** 12 NPCs in the level; at least 5 must be saved to finish.
These are a fixed population for a run. NPCs do not spawn as replacements.

The NPCs include other Goombas and Koopa Troopas. Randomize their starting
positions and hidden behavior traits when preparing a run. Positions must
allow them to reach the goal.

**Proposed default:** select starting positions from tested locations in a
fixed level layout. Random placement must not put an NPC inside scenery, in a
hazard, at the goal, or beyond a route it can travel.

Each character receives traits that remain fixed for that run:

| Trait | Effect |
| --- | --- |
| Fear | Changes the likelihood of hiding versus continuing to run |
| Reaction time | Changes how soon the character responds to danger or a warning |
| Run speed | Changes how quickly the character moves toward safety |

These values are hidden from players. The game does not expose personality
dials in its player interface.

Warned NPCs may run toward the goal or seek nearby cover. They should behave
differently based on their traits, with random choices weighted by those
traits. Once danger passes, hidden NPCs can resume their escape.

**Proposed default:** make behavior choices when a warning or change in danger
calls for a response. Let the NPC carry out its choice before deciding again,
so random behavior does not cause constant switching between running and hiding.

An NPC is not saved merely because it was warned or reached cover. It is saved
only when it reaches the goal alive. Mario can kill NPCs before they arrive.

NPCs that reach the goal stay safe and cannot return to danger. NPCs outside
the camera view must continue to move, hide, and encounter Mario; scrolling
away must not stop their rescue progress or remove them from the population.

**Proposed default:** unwarned NPCs remain in their local area until warned.
They can still be attacked by Mario. A dead or saved NPC cannot hear a new
warning or contribute to Warned again.

## Counters, goal, and scoring

Show separate **Warned** and **Saved** counters during play.

- Warned increases when a previously unwarned NPC hears a warning.
- Saved increases when an NPC reaches the goal alive.
- An NPC can contribute at most once to each counter.
- Death after a warning does not undo the fact that the NPC was warned.

Display rescue progress against the requirement, for example `Saved: 3/5`.
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
shorter distance. Running can also attract him. If he sees the player entering
cover, he can try to attack before the hiding action completes.

**Proposed default:** use one active Mario at a time. Spawn him outside the
visible play area, with enough approach warning to let the player react. Give
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
evade or reach cover.

## Cover and vulnerability

Mark usable hiding places so the player can recognize them. Cover types are
bushes, hollow logs, pipes, and some overhead breakable bricks.

Entering cover takes time. The player remains vulnerable throughout that
action, including to attacks from Mario after he sees them entering.

**Starting value:** hiding takes 0.5 seconds. A visible animation shows entry
and makes completed hiding distinct from the vulnerable transition.

Once fully hidden and silent, bushes, logs, and pipes protect the player from
Mario's attacks, including fireballs. Brick cover is different: Mario can
break the occupied brick and kill the player if he saw them hide there.

Moving out of cover ends its protection. Shouting can expose the player.

**Proposed default hiding rules:**

| State | Protection and transitions |
| --- | --- |
| Exposed | No protection; hold Hide at valid cover to begin entry |
| Entering | Vulnerable for the full delay; releasing Hide, moving out, or jumping cancels entry |
| Hidden | Normal cover protects while Hide is held and the player is silent; brick cover remains breakable |

**Proposed default:** shouting cancels entry or completed hiding. The player
must complete the hiding delay again to regain protection, even if still
holding Hide. Do not restart entry until the warning's brief sound ends.
Speech-bubble display time does not extend the audible warning. Hearing still
depends on Mario's distance; shouting does not give him unlimited detection.

Seeing an entry gives Mario a chance to strike during the delay. It does not
let his attacks bypass completed normal cover. For brick cover, remembering
the occupied brick lets him attack it after entry has completed.

**Proposed default:** jumping places the player within reach of overhead brick
cover; the normal Hide action then enters it. Each marked cover location must
have a reachable entry point.

## Death, failure, and restart

One successful hit from Mario kills the player. There is no health bar or
multi-hit allowance. Death restarts the level and clears both counters, rescue
progress, NPC states, and Mario's escalation timer.

If too few NPCs remain alive to meet the rescue requirement, end the attempt
and offer a quick retry. Count saved NPCs as already safe when deciding
whether the target remains possible.

The target is impossible when `saved + living_unsaved < required_saved`.
Include both warned and unwarned living NPCs. With the starting values, 4
saved plus 1 living NPC is still possible; 4 saved plus none living is not.

**Proposed default:** falling into a lethal gap also kills the player. Keep
death feedback brief before the automatic restart. NPC losses use the same
rescue-impossibility rule whether caused by Mario or level hazards.

Restart must restore the level's bricks and reset Mario's position and pursuit.
It must remove fireballs and clear warning cooldowns, hiding progress, speech
bubbles, and any finish countdown. No progress carries into the next attempt.

## Presentation and sound

Use an 8-bit visual style, readable sprites, and clear platform edges. Keep the
camera side-on. Show marked cover, distinguish hidden and exposed states, and
keep speech bubbles readable above the player.

An approach cue must grow more urgent as Mario gets closer. A heartbeat, a
music change, or both can provide the cue. Avoid unexplained attacks from an
off-screen spawn without warning.

Provide the victory tune at successful goal entry. Warning phrases appear as
text; recorded or synthesized speech is not required by this design.

**Proposed default:** use short game sounds for shouting, danger, hiding, and
NPC arrivals. Start browser audio after the player starts the game, and offer
a mute control. Keep important danger information visible when audio is off.

## Acceptance checks

These are checks to run against the playable game, not completed test results.
Use the starting tuning values below unless playtesting has changed them.

- The title reads `Super Goomba Bros`.
- The same level is playable with a keyboard and with touch controls.
- The player can walk, run without a stamina limit, jump, hide, and warn.
- Running and warnings can attract nearby Mario; walking is quieter.
- Each warning phrase urges escape from approaching Mario.
- A warning affects nearby NPCs and does not recount a previously warned NPC.
- A warning can reach a group; NPCs beyond its range remain unwarned.
- Exactly 12 NPCs start a run under the starting population setting.
- NPC deaths do not cause replacement spawns.
- NPC traits differ between characters and remain fixed within a run.
- Warned NPCs can run or hide, then continue toward the goal.
- NPC rescue progress continues outside the camera view.
- Saved increases only on arrival at the goal, never on warning or hiding.
- A warned NPC's death leaves Warned unchanged and does not increase Saved.
- The player must save 5 NPCs under the starting rescue setting to finish.
- NPCs can enter safety while the player's goal remains locked.
- The player can backtrack when arriving below the rescue requirement.
- Successful goal entry grants safety and starts the tune and final window.
- Arrivals within the 5-second window count; later arrivals do not.
- Mario can pass, pursue, backtrack, interact with scenery, and return.
- Mario's return preserves NPC states, counters, and his current strength.
- Mario's approach is signaled, and elapsed time eventually unlocks fireballs.
- The player can be killed during the 0.5-second hiding transition.
- Mario can target the player after seeing entry, before hiding completes.
- Completed silent normal cover blocks attacks, including fireballs.
- Breaking an occupied brick kills the player even after hiding completes.
- Shouting from cover can attract Mario; closer warnings are more likely to do so.
- One successful hit kills the player and restarts the level with reset state.
- An impossible rescue target ends the attempt and offers a retry.
- Saved NPCs and all living unsaved NPCs count toward whether rescue is possible.

## Implementation handoff

Implement the agreed rules first. Treat proposed defaults as explicit working
assumptions, and validate timing, controls, and difficulty in a playable build.
Keep gameplay tuning in one implementation source when that source exists;
update this document to reference it instead of duplicating changing values.

This specification does not claim that gameplay, browser compatibility, or
balance has been tested. Those checks require the game implementation.
