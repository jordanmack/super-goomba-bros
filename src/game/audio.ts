import type { GameEvent } from "./simulation";
import type Phaser from "phaser";
import overworld from "../assets/audio/overworld.mp3?inline";
import starman from "../assets/audio/starman.mp3?inline";
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

export const RECORDINGS = {
  overworld,
  starman,
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
};
const EFFECTS: Record<GameEvent, keyof typeof RECORDINGS> = {
  jump: "jump",
  bump: "bump",
  warn: "bump",
  saved: "coin",
  death: "death",
  marioDeath: "death",
  hide: "pipe",
  fire: "fireball",
  break: "brick",
  power: "powerup",
  win: "clear",
  splat: "stomp",
};

export class GameAudio {
  private game: Phaser.Game;
  music: Phaser.Sound.WebAudioSound | null = null;
  effects = new Set<Phaser.Sound.WebAudioSound>();
  musicHoldUntil = 0;
  private pausedAt: number | null = null;
  private voices = new Set<OscillatorNode>();

  constructor(game: Phaser.Game) { this.game = game; this.manager.volume = 0.8; this.manager.pauseOnBlur = false; }
  get manager() { return this.game.sound as Phaser.Sound.WebAudioSoundManager; }
  get context() { return this.manager.context as AudioContext; }
  get masterGain() { return this.manager.masterVolumeNode; }
  get buffers(): Map<string, AudioBuffer> {
    return new Map(Object.keys(RECORDINGS).filter(key => this.game.cache.audio.exists(key)).map(key => [key, this.game.cache.audio.get(key)]));
  }
  get muted() { return this.manager.mute; }
  set muted(value: boolean) { this.manager.mute = value; }
  async start() {
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
  private stopMusic() { this.music?.destroy(); this.music = null; }
  resetMusic() {
    this.stopMusic();
    for (const effect of this.effects) effect.destroy();
    this.effects.clear(); this.musicHoldUntil = 0; this.pausedAt = null;
  }
  private play(name: keyof typeof RECORDINGS) {
    if (!this.game.cache.audio.exists(name)) return;
    const effect = this.manager.add(name) as Phaser.Sound.WebAudioSound;
    this.effects.add(effect);
    effect.once("complete", () => { this.effects.delete(effect); effect.destroy(); });
    effect.play();
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
    oscillator.onended = () => { this.voices.delete(oscillator); oscillator.disconnect(); gain.disconnect(); };
  }

  event(event: GameEvent) {
    if (event === "death" || event === "win" || event === "marioDeath") {
      this.stopMusic();
      const name = event === "win" ? "clear" : "death";
      // Concurrent deaths share a complete cue instead of cutting it off.
      if ([...this.effects].some(effect => effect.key === name && effect.isPlaying)) return;
      this.musicHoldUntil = this.context.currentTime + (this.buffers.get(name)?.duration ?? 2.8);
    }
    if (event === "warn") this.playWarning();
    else this.play(EFFECTS[event]);
  }

  update(music = true, star = false) {
    const key = star ? "starman" : "overworld";
    if (this.music && (this.music.key !== key || !music)) this.stopMusic();
    if (!music || this.music || !this.game.cache.audio.exists(key) || this.context?.state !== "running" || this.context.currentTime < this.musicHoldUntil) return;
    const track = this.manager.add(key, { volume: 0.55 }) as Phaser.Sound.WebAudioSound;
    this.music = track;
    track.addMarker({ name: "loop", start: star ? 0.53 : 5, duration: star ? 12.8 : 86.4, config: { loop: true, volume: 0.55 } });
    if (star) track.play("loop");
    else {
      track.addMarker({ name: "intro", start: 1.02, duration: 3.98, config: { volume: 0.55 } });
      track.once("complete", () => { if (this.music === track) track.play("loop"); });
      track.play("intro");
    }
  }

  dispose() {
    this.resetMusic();
  }
}
