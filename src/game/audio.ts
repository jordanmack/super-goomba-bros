import type { GameEvent } from "./simulation";
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

const RECORDINGS = {
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
  context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private loading: Promise<void> | null = null;
  private music: AudioBufferSourceNode | null = null;
  private effects = new Set<AudioBufferSourceNode>();
  private silent = false;
  private disposed = false;
  private musicHoldUntil = 0;

  get muted() {
    return this.silent;
  }
  set muted(value: boolean) {
    this.silent = value;
    if (this.context && this.masterGain)
      this.masterGain.gain.setValueAtTime(
        value ? 0 : 0.8,
        this.context.currentTime,
      );
  }

  async start() {
    if (this.disposed) return;
    if (!this.context) {
      this.context = new AudioContext();
      this.masterGain = this.context.createGain();
      this.masterGain.gain.value = this.muted ? 0 : 0.8;
      this.masterGain.connect(this.context.destination);
      this.musicGain = this.context.createGain();
      this.musicGain.connect(this.masterGain);
    }
    await this.context.resume();
    this.loading ??= this.load();
    try {
      await this.loading;
    } catch (error) {
      this.loading = null;
      throw error;
    }
  }

  private async load() {
    await Promise.all(
      Object.entries(RECORDINGS).map(async ([name, url]) => {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Could not load ${name} audio`);
        const buffer = await this.context!.decodeAudioData(
          await response.arrayBuffer(),
        );
        if (!this.disposed) this.buffers.set(name, buffer);
      }),
    );
  }

  private stopMusic() {
    this.music?.stop();
    this.music?.disconnect();
    this.music = null;
  }
  private stopEffects() {
    for (const source of this.effects) {
      source.stop();
      source.disconnect();
    }
    this.effects.clear();
  }
  resetMusic() {
    this.stopMusic();
    this.stopEffects();
    this.musicHoldUntil = 0;
  }

  private play(name: keyof typeof RECORDINGS) {
    const buffer = this.buffers.get(name);
    if (
      !this.context ||
      !buffer ||
      this.muted ||
      this.context.state !== "running"
    )
      return;
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.masterGain!);
    source.start();
    this.effects.add(source);
    source.onended = () => {
      this.effects.delete(source);
      source.disconnect();
    };
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
    oscillator.connect(gain).connect(this.masterGain);
    oscillator.start(now);
    oscillator.stop(now + 0.21);
  }

  event(event: GameEvent) {
    if (event === "death" || event === "win" || event === "marioDeath")
      this.resetMusic();
    if ((event === "death" || event === "marioDeath") && this.context)
      this.musicHoldUntil =
        this.context.currentTime +
        (this.buffers.get("death")?.duration ?? 2.7);
    if (event === "warn") this.playWarning();
    else this.play(EFFECTS[event]);
  }

  update(music = true, star = false) {
    const buffer = this.buffers.get(star ? "starman" : "overworld");
    if (this.music && this.music.buffer !== buffer) this.stopMusic();
    if (
      music &&
      !this.music &&
      buffer &&
      this.context?.state === "running" &&
      this.context.currentTime >= this.musicHoldUntil
    ) {
      this.music = this.context.createBufferSource();
      this.music.buffer = buffer;
      this.music.loop = true;
      // Loop inside each recording, past the opening silence and before its fade.
      this.music.loopStart = star ? 0.53 : 5;
      this.music.loopEnd = star ? 13.33 : 91.4;
      this.music.connect(this.musicGain!);
      this.music.start(0, star ? 0.53 : 1.02);
    } else if (!music) this.stopMusic();
    if (this.context && this.musicGain)
      this.musicGain.gain.setTargetAtTime(0.55, this.context.currentTime, 0.1);
  }

  dispose() {
    this.disposed = true;
    this.resetMusic();
    this.buffers.clear();
    void this.context?.close();
  }
}
