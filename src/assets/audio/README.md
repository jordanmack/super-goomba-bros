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

Custom actions use fitting original cues: Warn uses the bump sound, rescue uses
the coin sound, and bloody impacts use the stomp sound. Block bumps use the
bump effect and item pickups use the power-up effect. The approach heartbeat
and distance-based music ducking have been removed.
Mario's defeat uses the original death recording. It interrupts the overworld
music, which resumes after the cue finishes while the level continues.
