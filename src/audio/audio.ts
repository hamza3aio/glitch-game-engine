export class AudioEngine {
  private ctx: AudioContext | null = null;
  enabled = false;

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.enabled = true;
  }

  resume() {
    this.init();
    if (this.ctx?.state === "suspended") void this.ctx.resume();
  }

  blip(freq = 440, duration = 0.12, type: OscillatorType = "square", gain = 0.08) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(g).connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  jump() { this.blip(520, 0.12, "square", 0.06); }
  land() { this.blip(180, 0.1, "triangle", 0.07); }
  pickup() { this.blip(880, 0.15, "sine", 0.08); }
}
