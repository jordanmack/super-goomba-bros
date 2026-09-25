# Original NES audio

Original Super Mario Bros. recordings by Nintendo (music by Koji Kondo), archived
by Mario Mayhem. These replace the prototype's synthesized music and game effects.

- Music page: https://www.mariomayhem.com/downloads/sound_tracks/super_mario_bros_1_soundtrack.php
- Recording: https://www.mariomayhem.com/downloads/sound_tracks/Super_Mario_Bros._1/01-main-theme-overworld.mp3
- Starman recording: https://www.mariomayhem.com/downloads/sound_tracks/Super_Mario_Bros._1/05-starman.mp3
- Underground: https://www.mariomayhem.com/downloads/sound_tracks/Super_Mario_Bros._1/02-underworld.mp3
- Water: https://www.mariomayhem.com/downloads/sound_tracks/Super_Mario_Bros._1/03-underwater.mp3
- Castle: https://www.mariomayhem.com/downloads/sound_tracks/Super_Mario_Bros._1/04-castle.mp3
- Ending (`ending.mp3`): https://www.mariomayhem.com/downloads/sound_tracks/Super_Mario_Bros._1/12-ending.mp3
- Effects page: https://www.mariomayhem.com/downloads/sounds/super_mario_bros_nes_sounds.php
- Each WAV comes from `https://www.mariomayhem.com/downloads/sounds/super_mario_bros/smb_<filename>.wav`.

The original prototype recordings are unchanged. The three added area tracks
retain their openings and first loop sections, with unused repeats removed by
MP3 stream copy. WAV cues and effects are peak-normalized to -1 dBFS (peak
0.891) so no file is left with large unused headroom and none clips. Sample
rates stay as archived; 8-bit files are stored as 16-bit after that gain.
Looping MP3s are not peak-normalized. Playback still uses manager volume 0.8
and music volume 0.55; those were re-checked after the WAV gain. Nintendo owns
the recordings; the archive is not a license grant. Bundling supports offline
play.

The overworld recording includes opening silence, an intro, repeated music,
and a fade. Playback skips the opening silence and loops an interior 86.4-second
segment, measured from the repeated waveform envelope. Exact offsets and effect
mappings are in `../../game/audio.ts`.
Starman skips its opening silence and loops an interior 12.8-second segment.
It plays while the player or active Mario has a star, and while the current
area is a cloud bonus. That is the original CloudMusic recording, not a new
file. NPC stars do not change the music. Leaving a cloud area restores the
area theme unless a star is still active. Death and level-clear cues take
priority.

Area tracks preserve their opening and then loop an interior section before the
recording's fade. Loop periods were checked against waveform energy and pitch
changes. The loop markers in `../../game/audio.ts` are the source of timing data.

Rescue and coin collection use the coin sound; bloody impacts use the stomp
sound; kicked shells use the original kick sound. Block bumps, breaks, pipe
travel, shrinking, and power-up pickups use the corresponding original effects.
A player or Mario fireball that disappears on a solid hit plays the bump cue
once. A floor bounce stays silent. A fireball removed past the screen plays
nothing. The throw still uses the fireball cue. In water, each new player jump
press plays the stomp cue instead of the land jump. NPCs and Mario do not gain
a swim sound.
Pause and resume play the original pause cue while music is held. A
question-block item uses the original appear effect with the bump. A 1-up uses
`smb_1-up.wav`. Game over uses `smb_gameover.wav`. TIME 100 uses
`smb_warning.wav`, then the area theme plays faster. Leftover TIME tally
retriggers a quieter copy of the coin sample on one voice. Flagpole fireworks
use `smb_fireworks.wav` as each burst scores. Each Bowser flame spawn uses
`smb_bowserfire.wav`, not the fireball or fireworks cue. On the World 8-4
ending screen, after the castle tally, `smb_world_clear.wav` plays once. When
it ends, the ending theme plays one statement and then loops the next until
the player returns to the title.

The ending recording is about 77 seconds: twelve plays of the one 384-frame
(6.4 s) VictoryMusic statement, then a fade. `ending.mp3` keeps the first 536
MP3 frames (14.0 s) with the original tags, which cover the opening silence,
the first statement, and the looped second statement. The rest was cut at a
frame boundary, not stream copied or re-encoded, so the kept audio decodes
sample for sample the same as the full file and needs no decoder-padding
offset. Playback starts at 0.52 s, just before the first note, and loops 6.92
to 13.32 s, where the wrap lands on a phrase start.
Warnings use a custom short square-wave voice, picked at random from a small
pool of chirps. Pitch shapes live in `../../game/config.ts`. There is no
approach heartbeat or distance-based music change. The world intro is silent.
Mario's defeat uses the original death recording. It interrupts the overworld
music, which resumes after the cue finishes while the level continues.

Major death, clear, and game-over cues are serialized so none is cut off or
played over another. A new stage preserves an unfinished cue. Unsupported audio
decoding is recorded and shown as unavailable; it does not stop the game's
controls.
