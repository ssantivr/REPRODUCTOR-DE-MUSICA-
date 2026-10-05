import type { Genre, Track } from "@/types/music";
import { hashString, mulberry32 } from "./utils";

/** Length of the synthesized preview, in seconds. */
export const PREVIEW_SECONDS = 45;

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];

const LEAD_WAVE: Record<Genre, OscillatorType> = {
  electronic: "sawtooth",
  rock: "square",
  pop: "triangle",
  urban: "square",
  jazz: "sine",
  ambient: "sine",
  classical: "triangle",
  indie: "triangle",
};

/** Square and sawtooth waves sound louder, so their gain is reduced. */
const WAVE_GAIN: Record<OscillatorType, number> = {
  sine: 1,
  triangle: 0.9,
  square: 0.45,
  sawtooth: 0.45,
  custom: 1,
};

const midiToFreq = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

function scaleNote(scale: number[], degree: number): number {
  const octave = Math.floor(degree / 7);
  const index = ((degree % 7) + 7) % 7;
  return scale[index] + 12 * octave;
}

/**
 * Web Audio API engine.
 * It does not play files: it generates a short piece in real time from the
 * song attributes (tempo, key, energy, valence, genre).
 *
 * Graph: voices → bus (per song) → low-pass filter → master → analyser → output
 */
export class SynthEngine {
  private ctx: AudioContext | null = null;
  private tone: BiquadFilterNode | null = null;
  private master: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private noise: AudioBuffer | null = null;
  private bus: GainNode | null = null;

  private timer: ReturnType<typeof setInterval> | null = null;
  private track: Track | null = null;
  private random: () => number = Math.random;
  private progression: number[] = [0, 5, 3, 4];
  private startedAt = 0;
  private nextStepTime = 0;
  private step = 0;
  private endedFired = false;

  private volume = 0.7;
  private night = false;

  onEnded: (() => void) | null = null;

  get loadedUid(): string | null {
    return this.track?.uid ?? null;
  }

  /** Seconds played of the current track (frozen while paused). */
  get position(): number {
    if (!this.ctx || !this.track) return 0;
    return Math.max(0, this.ctx.currentTime - this.startedAt);
  }

  getAnalyser(): AnalyserNode | null {
    return this.analyser;
  }

  /** Creates the AudioContext (must happen after a user gesture). */
  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    if (typeof window === "undefined") return null;

    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;

    const ctx = new Ctor();

    const tone = ctx.createBiquadFilter();
    tone.type = "lowpass";
    tone.Q.value = 0.7;

    const master = ctx.createGain();
    master.gain.value = this.volume * 0.8;

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.82;

    tone.connect(master);
    master.connect(analyser);
    analyser.connect(ctx.destination);

    const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    this.ctx = ctx;
    this.tone = tone;
    this.master = master;
    this.analyser = analyser;
    this.noise = noise;
    this.applyTone();
    return ctx;
  }

  unlock(): void {
    const ctx = this.ensure();
    if (ctx && ctx.state === "suspended") void ctx.resume();
  }

  play(track: Track): void {
    const ctx = this.ensure();
    if (!ctx || !this.tone) return;

    this.stop();

    this.track = track;
    this.random = mulberry32(hashString(track.id));
    this.progression = this.buildProgression(track);
    this.step = 0;
    this.endedFired = false;

    const bus = ctx.createGain();
    bus.gain.value = 1;
    bus.connect(this.tone);
    this.bus = bus;

    void ctx.resume();
    this.startedAt = ctx.currentTime + 0.05;
    this.nextStepTime = this.startedAt;
    this.applyTone();

    this.timer = setInterval(() => this.schedule(), 25);
    this.schedule();
  }

  pause(): void {
    // No "running" check: a resume() may still be pending when pause arrives
    if (this.ctx && this.ctx.state !== "closed") void this.ctx.suspend();
  }

  resume(): void {
    if (this.ctx && this.ctx.state === "suspended") void this.ctx.resume();
  }

  /** Stops the current track with a quick fade-out. */
  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.bus && this.ctx) {
      const bus = this.bus;
      bus.gain.setTargetAtTime(0, this.ctx.currentTime, 0.03);
      setTimeout(() => bus.disconnect(), 300);
    }
    this.bus = null;
    this.track = null;
  }

  setVolume(volume: number): void {
    this.volume = volume;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(volume * 0.8, this.ctx.currentTime, 0.05);
    }
  }

  setNight(night: boolean): void {
    this.night = night;
    this.applyTone();
  }

  dispose(): void {
    this.stop();
    this.onEnded = null;
    if (this.ctx) void this.ctx.close();
    this.ctx = null;
    this.tone = null;
    this.master = null;
    this.analyser = null;
    this.noise = null;
  }

  // ---------------------------------------------------------------------------

  private applyTone(): void {
    if (!this.tone || !this.ctx) return;
    const energy = this.track?.energy ?? 0.5;
    const cutoff = (1400 + energy * 6000) * (this.night ? 0.3 : 1);
    this.tone.frequency.setTargetAtTime(cutoff, this.ctx.currentTime, 0.2);
  }

  private buildProgression(track: Track): number[] {
    const options =
      track.valence >= 0.5
        ? [[0, 5, 3, 4], [0, 4, 5, 3], [0, 3, 4, 4]]
        : [[0, 5, 2, 6], [0, 3, 6, 4], [0, 6, 5, 6]];
    return options[Math.floor(this.random() * options.length)];
  }

  /** Lookahead scheduler: queues the notes of the next 120 ms. */
  private schedule(): void {
    const ctx = this.ctx;
    const track = this.track;
    if (!ctx || !track || ctx.state !== "running") return;

    const stepDuration = 60 / track.tempo / 4; // sixteenth note
    while (this.nextStepTime < ctx.currentTime + 0.12) {
      this.playStep(track, this.step, this.nextStepTime, stepDuration);
      this.nextStepTime += stepDuration;
      this.step++;
    }

    if (!this.endedFired && this.position >= PREVIEW_SECONDS) {
      this.endedFired = true;
      // Unload the track so the same song can be started again
      this.stop();
      this.onEnded?.();
    }
  }

  private playStep(track: Track, step: number, time: number, stepDuration: number): void {
    const stepInBar = step % 16;
    const bar = Math.floor(step / 16);
    const scale = track.valence >= 0.5 ? MAJOR : MINOR;
    const root = 36 + track.key;
    const degree = this.progression[bar % this.progression.length];
    const energy = track.energy;

    // Background chord at the start of every bar
    if (stepInBar === 0) {
      const padGain = 0.035 + (1 - energy) * 0.04;
      for (const offset of [0, 2, 4]) {
        this.voice(root + 24 + scaleNote(scale, degree + offset), time, stepDuration * 16, "sine", padGain, 0.4);
      }
    }

    // Bass line
    const bassEvery = energy > 0.6 ? 2 : energy > 0.3 ? 4 : 8;
    if (stepInBar % bassEvery === 0) {
      this.voice(root + 12 + scaleNote(scale, degree), time, stepDuration * bassEvery * 0.9, "triangle", 0.13, 0.01);
    }

    // Percussion depends on energy
    if (energy > 0.35 && stepInBar % 4 === 0) this.kick(time, 0.25 + energy * 0.35);
    if (energy > 0.55 && stepInBar % 8 === 4) this.hat(time, 0.18, 0.12, 2000);
    if (energy > 0.45 && stepInBar % 2 === 1) this.hat(time, 0.05 + energy * 0.04, 0.04, 7000);

    // Melody / arpeggio
    const melodyEvery = energy > 0.5 ? 1 : 2;
    if (stepInBar % melodyEvery === 0 && this.random() < 0.15 + energy * 0.5) {
      const intervals = [0, 2, 4, 7];
      const note = degree + intervals[Math.floor(this.random() * intervals.length)];
      const wave = LEAD_WAVE[track.genre];
      this.voice(root + 36 + scaleNote(scale, note), time, stepDuration * (1.5 + this.random() * 2), wave, 0.07, 0.01);
    }
  }

  private voice(midi: number, time: number, duration: number, type: OscillatorType, gain: number, attack: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.bus) return;

    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = midiToFreq(midi);

    const amp = ctx.createGain();
    const peak = gain * WAVE_GAIN[type];
    const safeAttack = Math.min(attack, duration * 0.5);
    amp.gain.setValueAtTime(0.0001, time);
    amp.gain.exponentialRampToValueAtTime(peak, time + safeAttack);
    amp.gain.exponentialRampToValueAtTime(0.0001, time + duration);

    osc.connect(amp);
    amp.connect(this.bus);
    osc.start(time);
    osc.stop(time + duration + 0.05);
    osc.onended = () => {
      osc.disconnect();
      amp.disconnect();
    };
  }

  private kick(time: number, gain: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.bus) return;

    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(40, time + 0.12);

    const amp = ctx.createGain();
    amp.gain.setValueAtTime(gain, time);
    amp.gain.exponentialRampToValueAtTime(0.0001, time + 0.28);

    osc.connect(amp);
    amp.connect(this.bus);
    osc.start(time);
    osc.stop(time + 0.3);
    osc.onended = () => {
      osc.disconnect();
      amp.disconnect();
    };
  }

  private hat(time: number, gain: number, duration: number, cutoff: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.bus || !this.noise) return;

    const source = ctx.createBufferSource();
    source.buffer = this.noise;

    const filter = ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = cutoff;

    const amp = ctx.createGain();
    amp.gain.setValueAtTime(gain, time);
    amp.gain.exponentialRampToValueAtTime(0.0001, time + duration);

    source.connect(filter);
    filter.connect(amp);
    amp.connect(this.bus);
    source.start(time, Math.random() * 0.5);
    source.stop(time + duration + 0.02);
    source.onended = () => {
      source.disconnect();
      filter.disconnect();
      amp.disconnect();
    };
  }
}
