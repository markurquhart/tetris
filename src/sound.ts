type SoundName =
  | 'move'
  | 'rotate'
  | 'hard_drop'
  | 'lock'
  | 'line_clear'
  | 'tetris'
  | 'level_up'
  | 'hold'
  | 'game_over'
  | 'select';

export class SoundManager {
  enabled = true;
  private ctx: AudioContext | null = null;
  private unlocked = false;

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return null;
      this.ctx = new Ctx();
    }
    return this.ctx;
  }

  async unlock(): Promise<void> {
    const ctx = this.ensureContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch {
        // Ignore autoplay restrictions until next gesture
      }
    }
    this.unlocked = ctx.state === 'running';
  }

  private tone(
    frequency: number,
    duration: number,
    volume = 0.15,
    type: OscillatorType = 'square',
  ): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.unlocked) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = frequency;
    gain.gain.value = volume;
    osc.connect(gain);
    gain.connect(ctx.destination);

    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  private noise(duration: number, volume = 0.12): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.unlocked) return;

    const sampleRate = ctx.sampleRate;
    const length = Math.floor(sampleRate * duration);
    const buffer = ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (length / 5));
    }
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    source.buffer = buffer;
    gain.gain.value = volume;
    source.connect(gain);
    gain.connect(ctx.destination);
    source.start();
  }

  private arpeggio(frequencies: number[], noteDuration: number, volume = 0.2): void {
    frequencies.forEach((freq, i) => {
      window.setTimeout(() => this.tone(freq, noteDuration, volume, 'square'), i * noteDuration * 1000);
    });
  }

  play(name: SoundName): void {
    if (!this.enabled) return;
    void this.unlock();

    switch (name) {
      case 'move':
        this.tone(200, 0.03, 0.1);
        break;
      case 'rotate':
        this.tone(300, 0.05, 0.1);
        break;
      case 'hard_drop':
        this.tone(150, 0.1, 0.18);
        break;
      case 'lock':
        this.noise(0.08, 0.12);
        break;
      case 'line_clear':
        this.arpeggio([523, 659, 784], 0.08, 0.18);
        break;
      case 'tetris':
        this.arpeggio([523, 659, 784, 1047], 0.1, 0.25);
        break;
      case 'level_up':
        this.arpeggio([440, 554, 659, 880], 0.12, 0.22);
        break;
      case 'hold':
        this.tone(400, 0.05, 0.12, 'triangle');
        break;
      case 'game_over':
        this.arpeggio([440, 349, 294, 220], 0.2, 0.22);
        break;
      case 'select':
        this.tone(600, 0.08, 0.15);
        break;
    }
  }

  toggleMute(): boolean {
    this.enabled = !this.enabled;
    return this.enabled;
  }

  isEnabled(): boolean {
    return this.enabled;
  }
}
