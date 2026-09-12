import Phaser from "phaser";

// Phaser's callback decoder leaves the returned Promise unhandled on WebKit.
// Keep successful data in its normal audio cache, and explicitly record an
// unavailable decoder without substituting fake buffers or blocking gameplay.
export class BundledAudio extends Phaser.Loader.FileTypes.AudioFile {
  private unavailable = false;
  private registry: Phaser.Data.DataManager;

  constructor(scene: Phaser.Scene, key: string, url: string) {
    super(
      scene.load,
      key,
      { url, type: "" },
      undefined,
      (scene.sound as Phaser.Sound.WebAudioSoundManager)
        .context as AudioContext,
    );
    this.registry = scene.registry;
  }

  override onProcess() {
    this.state = Phaser.Loader.FILE_PROCESSING;
    const context = this.config.context as AudioContext;
    this.config.context = null;
    void context.decodeAudioData(this.xhrLoader!.response).then(
      (buffer) => {
        if (!this.loader || this.state === Phaser.Loader.FILE_DESTROYED) return;
        this.data = buffer;
        this.onProcessComplete();
      },
      (error: Error) => {
        if (!this.loader || this.state === Phaser.Loader.FILE_DESTROYED) return;
        this.unavailable = true;
        const failures = this.registry.get("audioFailures") ?? [];
        this.registry.set("audioFailures", [
          ...failures,
          { key: this.key, reason: error.message },
        ]);
        this.onProcessComplete();
      },
    );
  }

  override addToCache() {
    if (!this.unavailable) super.addToCache();
  }
}
