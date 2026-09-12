# Original NES audio

Original Super Mario Bros. recordings by Nintendo (music by Koji Kondo), archived
by Mario Mayhem. These replace the prototype's synthesized music and game effects.

- Music page: https://www.mariomayhem.com/downloads/sound_tracks/super_mario_bros_1_soundtrack.php
- Recording: https://www.mariomayhem.com/downloads/sound_tracks/Super_Mario_Bros._1/01-main-theme-overworld.mp3
- Starman recording: https://www.mariomayhem.com/downloads/sound_tracks/Super_Mario_Bros._1/05-starman.mp3
- Underground: https://www.mariomayhem.com/downloads/sound_tracks/Super_Mario_Bros._1/02-underworld.mp3
- Water: https://www.mariomayhem.com/downloads/sound_tracks/Super_Mario_Bros._1/03-underwater.mp3
- Castle: https://www.mariomayhem.com/downloads/sound_tracks/Super_Mario_Bros._1/04-castle.mp3
- Effects page: https://www.mariomayhem.com/downloads/sounds/super_mario_bros_nes_sounds.php
- Each WAV comes from `https://www.mariomayhem.com/downloads/sounds/super_mario_bros/smb_<filename>.wav`.

The original prototype recordings are unchanged. The three added area tracks
retain their openings and first loop sections, with unused repeats removed by
MP3 stream copy. No audio was recomposed or re-encoded. Nintendo owns the
recordings; the archive is not a license grant. Bundling supports offline play.

The overworld recording includes opening silence, an intro, repeated music,
and a fade. Playback skips the opening silence and loops an interior 86.4-second
segment, measured from the repeated waveform envelope. Exact offsets and effect
mappings are in `../../game/audio.ts`.
Starman skips its opening silence and loops an interior 12.8-second segment.
It plays only while the player or active Mario has a star. NPC stars do not
change the music. Death and level-clear cues take priority.

Area tracks preserve their opening and then loop an interior section before the
recording's fade. Loop periods were checked against waveform energy and pitch
changes. The loop markers in `../../game/audio.ts` are the source of timing data.

Rescue and coin collection use the coin sound; bloody impacts use the stomp
sound. Block bumps, breaks, pipe travel, shrinking, and power-up pickups use
the corresponding original effects. Pause and resume play the original pause
cue while music is held. A question-block item uses the original appear effect
with the bump. A 1-up uses `smb_1-up.wav`. Game over uses `smb_gameover.wav`.
Warnings use a custom short square-wave voice. There is no approach heartbeat
or distance-based music change. The world intro is silent.
Mario's defeat uses the original death recording. It interrupts the overworld
music, which resumes after the cue finishes while the level continues.

Major death, clear, and game-over cues are serialized so none is cut off or
played over another. A new stage preserves an unfinished cue. Unsupported audio
decoding is recorded and shown as unavailable; it does not stop the game's
controls.
