export type SoundName = 'hit' | 'miss' | 'defeat' | 'decide' | 'rescue';

interface Tone {
  frequency: number;
  endFrequency: number;
  durationMs: number;
  type: OscillatorType;
}

const TONES: Readonly<Record<SoundName, Tone>> = {
  hit: { frequency: 520, endFrequency: 180, durationMs: 120, type: 'square' },
  miss: { frequency: 160, endFrequency: 90, durationMs: 160, type: 'sawtooth' },
  defeat: { frequency: 300, endFrequency: 900, durationMs: 450, type: 'triangle' },
  decide: { frequency: 440, endFrequency: 660, durationMs: 90, type: 'sine' },
  rescue: { frequency: 660, endFrequency: 990, durationMs: 220, type: 'sine' },
};

let context: AudioContext | null = null;

/**
 * Plays a short synthesised sound effect. No audio files are downloaded; the
 * AudioContext is created lazily on the first sound (after a user gesture).
 * @param name Which effect to play.
 */
export function playSound(name: SoundName): void {
  try {
    const AudioCtor = window.AudioContext as typeof AudioContext | undefined;
    if (!AudioCtor) return;
    context ??= new AudioCtor();
    const tone = TONES[name];
    const now = context.currentTime;
    const end = now + tone.durationMs / 1000;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = tone.type;
    oscillator.frequency.setValueAtTime(tone.frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(tone.endFrequency, end);
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(now);
    oscillator.stop(end);
  } catch {
    // Audio is decoration only; never let it break the game.
  }
}
