import type { GameEvent } from "./simulation";
import type Phaser from "phaser";
import overworld from "../assets/audio/overworld.mp3?inline";
import starman from "../assets/audio/starman.mp3?inline";
import underground from "../assets/audio/underground.mp3?inline";
import water from "../assets/audio/water.mp3?inline";
import castle from "../assets/audio/castle.mp3?inline";
import jump from "../assets/audio/jumpsmall.wav?inline";
import coin from "../assets/audio/coin.wav?inline";
import death from "../assets/audio/mariodie.wav?inline";
import pipe from "../assets/audio/pipe.wav?inline";
import clear from "../assets/audio/stage_clear.wav?inline";
import stomp from "../assets/audio/stomp.wav?inline";
import bump from "../assets/audio/bump.wav?inline";
import fireball from "../assets/audio/fireball.wav?inline";
import brick from "../assets/audio/breakblock.wav?inline";
import powerup from "../assets/audio/powerup.wav?inline";
import oneUp from "../assets/audio/1-up.wav?inline";
import gameover from "../assets/audio/gameover.wav?inline";

export const RECORDINGS = {
  overworld,
  starman,
  underground,
  water,
  castle,
  jump,
  coin,
  death,
  pipe,
  clear,
  stomp,
  bump,
  fireball,
  brick,
  powerup,
  oneUp,
  gameover,
};
const MUSIC_LOOPS: Record<
  string,
  { intro: number; start: number; duration: number }
> = {
  overworld: { intro: 1.02, start: 5, duration: 86.4 },
  starman: { intro: 0.53, start: 0.53, duration: 12.8 },
  // Stream copying these trimmed MP3s removes 529 samples of decoder padding.
  underground: {
    intro: 0.52 - 529 / 44100,
    start: 13.12 - 529 / 44100,
    duration: 12.6,
  },
  water: {
    intro: 0.82 - 529 / 44100,
    start: 26.42 - 529 / 44100,
    duration: 25.6,
  },
  castle: { intro: 0.52 - 529 / 44100, start: 8.52 - 529 / 44100, duration: 8 },
};
const EFFECTS: Record<GameEvent, keyof typeof RECORDINGS> = {
  jump: "jump",
  bump: "bump",
  warn: "bump",
  saved: "coin",
  death: "death",
  marioDeath: "death",
  pipe: "pipe",
  coin: "coin",
  fire: "fireball",
  break: "brick",
  power: "powerup",
  shrink: "pipe",
  win: "clear",
  splat: "stomp",
  oneUp: "oneUp",
  gameover: "gameover",
};

export class GameAudio {
  private game: Phaser.Game;
  music: Phaser.Sound.WebAudioSound | null = null;
  effects = new Set<Phaser.Sound.WebAudioSound>();
  musicHoldUntil = 0;
  private pausedAt: number | null = null;
  private voices = new Set<OscillatorNode>();
  private disabled = false;
  private cue: Phaser.Sound.WebAudioSound | null = null;
  private cueQueue: ("death" | "clear" | "gameover")[] = [];
  private musicResume: { key: string; seek: number } | null = null;

  constructor(game: Phaser.Game) {
    this.game = game;
    this.manager.volume = 0.8;
    this.manager.pauseOnBlur = false;
  }
  get manager() {
    return this.game.sound as Phaser.Sound.WebAudioSoundManager;
  }
  get context() {
    return this.manager.context as AudioContext;
  }
  get masterGain() {
    return this.manager.masterVolumeNode;
  }
  get buffers(): Map<string, AudioBuffer> {
    return new Map(
      Object.keys(RECORDINGS)
        .filter((key) => this.game.cache.audio.exists(key))
        .map((key) => [key, this.game.cache.audio.get(key)]),
    );
  }
  get muted() {
    return this.manager.mute;
  }
  get available() {
    return (
      !this.disabled &&
      !!this.context &&
      !this.game.registry.get("audioFailures")?.length
    );
  }
  disable() {
    this.disabled = true;
    this.muted = true;
    this.resetMusic();
  }
  set muted(value: boolean) {
    this.manager.mute = value;
  }
  async start() {
    if (!this.available) return;
    await this.context?.resume();
    if (this.pausedAt !== null) {
      this.musicHoldUntil += this.context.currentTime - this.pausedAt;
      this.pausedAt = null;
      this.manager.resumeAll();
    }
  }
  pause() {
    if (this.pausedAt !== null) return;
    this.pausedAt = this.context.currentTime;
    this.manager.pauseAll();
    for (const voice of this.voices) voice.stop();
    this.voices.clear();
  }
  private stopMusic(saveResume = false) {
    if (
      saveResume &&
      this.music &&
      (this.music.isPlaying || this.music.isPaused)
    ) {
      const marker = this.music.currentMarker;
      this.musicResume = {
        key: this.music.key,
        seek: (marker?.start ?? 0) + this.music.seek,
      };
    }
    this.music?.destroy();
    this.music = null;
  }
  resetMusic(preserveCue = false) {
    this.stopMusic();
    this.musicResume = null;
    for (const voice of this.voices) voice.stop();
    this.voices.clear();
    for (const effect of this.effects) {
      if (preserveCue && effect === this.cue) continue;
      effect.destroy();
      this.effects.delete(effect);
    }
    if (!preserveCue) {
      this.cue = null;
      this.cueQueue = [];
      this.musicHoldUntil = 0;
      this.pausedAt = null;
    }
  }
  private play(name: keyof typeof RECORDINGS, complete?: () => void) {
    if (!this.game.cache.audio.exists(name)) return;
    const effect = this.manager.add(name) as Phaser.Sound.WebAudioSound;
    this.effects.add(effect);
    effect.once("complete", () => {
      this.effects.delete(effect);
      complete?.();
      effect.destroy();
    });
    effect.play();
    return effect;
  }
  private playCue(name: "death" | "clear" | "gameover", saveResume = false) {
    this.stopMusic(saveResume);
    if (this.cue) {
      if (this.cue.key !== name && !this.cueQueue.includes(name))
        this.cueQueue.push(name);
      return;
    }
    const effect = this.play(name, () => {
      if (this.cue !== effect) return;
      this.cue = null;
      const next = this.cueQueue.shift();
      if (next) this.playCue(next);
    });
    this.cue = effect ?? null;
    this.musicHoldUntil =
      this.context.currentTime + (this.buffers.get(name)?.duration ?? 0);
  }
  private playWarning() {
    if (!this.context || !this.masterGain || this.muted) return;
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = "square";
    oscillator.frequency.setValueAtTime(520, now);
    oscillator.frequency.exponentialRampToValueAtTime(940, now + 0.08);
    oscillator.frequency.exponentialRampToValueAtTime(360, now + 0.18);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.16, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
    // Feed the custom voice through Phaser's mute and volume nodes too.
    oscillator.connect(gain).connect(this.manager.masterMuteNode);
    oscillator.start(now);
    oscillator.stop(now + 0.21);
    this.voices.add(oscillator);
    oscillator.onended = () => {
      this.voices.delete(oscillator);
      oscillator.disconnect();
      gain.disconnect();
    };
  }

  event(event: GameEvent) {
    if (!this.available) return;
    if (
      event === "death" ||
      event === "win" ||
      event === "marioDeath" ||
      event === "gameover"
    ) {
      this.playCue(
        event === "win" ? "clear" : event === "gameover" ? "gameover" : "death",
        event === "marioDeath",
      );
      return;
    }
    if (event === "warn") this.playWarning();
    else this.play(EFFECTS[event]);
  }

  update(music = true, star = false, areaType = "overworld") {
    if (!this.available) return;
    const key = star
      ? "starman"
      : areaType in MUSIC_LOOPS
        ? areaType
        : "overworld";
    if (this.music && (this.music.key !== key || !music)) this.stopMusic();
    if (!music) this.musicResume = null;
    if (
      !music ||
      this.music ||
      this.cue ||
      this.cueQueue.length > 0 ||
      !this.game.cache.audio.exists(key) ||
      this.context?.state !== "running" ||
      this.context.currentTime < this.musicHoldUntil
    )
      return;
    const track = this.manager.add(key, {
      volume: 0.55,
    }) as Phaser.Sound.WebAudioSound;
    this.music = track;
    const loop = MUSIC_LOOPS[key];
    track.addMarker({
      name: "loop",
      start: loop.start,
      duration: loop.duration,
      config: { loop: true, volume: 0.55 },
    });
    const resume =
      this.musicResume?.key === key ? this.musicResume.seek : null;
    this.musicResume = null;
    const resumeAt =
      resume !== null && Number.isFinite(resume) ? resume : null;
    const useLoop =
      loop.intro === loop.start ||
      (resumeAt !== null && resumeAt >= loop.start);
    if (useLoop) {
      const period = loop.duration;
      const loopSeek =
        resumeAt === null
          ? 0
          : (((resumeAt - loop.start) % period) + period) % period;
      track.play("loop", loopSeek ? { seek: loopSeek } : undefined);
      return;
    }
    track.addMarker({
      name: "intro",
      start: loop.intro,
      duration: loop.start - loop.intro,
      config: { volume: 0.55 },
    });
    track.once("complete", () => {
      if (this.music === track) track.play("loop");
    });
    const introSeek =
      resumeAt === null ? 0 : Math.max(0, resumeAt - loop.intro);
    track.play("intro", introSeek ? { seek: introSeek } : undefined);
  }

  dispose() {
    this.resetMusic();
  }
}
