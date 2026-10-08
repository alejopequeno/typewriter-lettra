/**
 * The sound of the machine, synthesised rather than sampled.
 *
 * A typebar hitting a platen is a noise burst with a resonance on it, and no
 * two strikes are the same. Synthesising it means every keystroke is genuinely
 * a new sound — with samples you start hearing the loop by the third line.
 */

export interface TypewriterAudio {
  /** A typebar landing on the page. */
  readonly strike: () => void;
  /** The margin bell. */
  readonly bell: () => void;
  /** The carriage being thrown back to the left margin. */
  readonly carriageReturn: () => void;
  /** A key that goes nowhere: the dull knock of a locked mechanism. */
  readonly refuse: () => void;
  /** Browsers hold audio until a gesture; call this from the first keystroke. */
  readonly resume: () => Promise<void>;
  readonly dispose: () => void;
}

const NOISE_SECONDS = 1;

/** Slot-machine arithmetic for "around this value, give or take". */
const around = (value: number, spread: number): number =>
  value * (1 + (Math.random() * 2 - 1) * spread);

const makeNoise = (context: AudioContext): AudioBuffer => {
  const buffer = context.createBuffer(
    1,
    context.sampleRate * NOISE_SECONDS,
    context.sampleRate,
  );
  const samples = buffer.getChannelData(0);
  for (let i = 0; i < samples.length; i += 1) {
    samples[i] = Math.random() * 2 - 1;
  }
  return buffer;
};

export const createTypewriterAudio = (): TypewriterAudio => {
  const context = new AudioContext();
  const noise = makeNoise(context);

  const output = context.createGain();
  output.gain.value = 0.55;
  output.connect(context.destination);

  /** A slice of the noise buffer, shaped by a filter and an envelope. */
  const burst = (options: {
    at: number;
    duration: number;
    gain: number;
    type: BiquadFilterType;
    frequency: number;
    q: number;
  }): void => {
    const source = context.createBufferSource();
    source.buffer = noise;
    source.playbackRate.value = around(1, 0.2);
    // Start somewhere random in the buffer so repeats never line up.
    const offset = Math.random() * (NOISE_SECONDS - options.duration);

    const filter = context.createBiquadFilter();
    filter.type = options.type;
    filter.frequency.value = options.frequency;
    filter.Q.value = options.q;

    const envelope = context.createGain();
    envelope.gain.setValueAtTime(options.gain, options.at);
    envelope.gain.exponentialRampToValueAtTime(
      0.0001,
      options.at + options.duration,
    );

    source.connect(filter).connect(envelope).connect(output);
    source.start(options.at, offset, options.duration);
    source.stop(options.at + options.duration);
  };

  /** A decaying sine, for anything that rings. */
  const tone = (options: {
    at: number;
    duration: number;
    gain: number;
    frequency: number;
  }): void => {
    const oscillator = context.createOscillator();
    oscillator.frequency.value = options.frequency;

    const envelope = context.createGain();
    envelope.gain.setValueAtTime(options.gain, options.at);
    envelope.gain.exponentialRampToValueAtTime(
      0.0001,
      options.at + options.duration,
    );

    oscillator.connect(envelope).connect(output);
    oscillator.start(options.at);
    oscillator.stop(options.at + options.duration);
  };

  const strike = (): void => {
    const at = context.currentTime;
    const force = around(1, 0.3);

    // The key mechanism, before the bar even lands.
    burst({
      at,
      duration: 0.012,
      gain: 0.18 * force,
      type: "highpass",
      frequency: around(4200, 0.2),
      q: 0.7,
    });
    // The slug striking the platen through the ribbon.
    burst({
      at: at + 0.004,
      duration: around(0.04, 0.25),
      gain: 0.5 * force,
      type: "bandpass",
      frequency: around(2300, 0.18),
      q: around(2.4, 0.3),
    });
    // The body of the machine answering it.
    tone({
      at: at + 0.004,
      duration: around(0.07, 0.3),
      gain: 0.1 * force,
      frequency: around(185, 0.12),
    });
  };

  const bell = (): void => {
    const at = context.currentTime;
    // The margin bell: a small brass cup struck by a hammer. Three
    // inharmonic partials with the hum lowest and longest, so it rings like
    // a bell rather than chiming like a coin.
    tone({ at, duration: 1.9, gain: 0.14, frequency: around(1180, 0.01) });
    tone({ at, duration: 1.1, gain: 0.07, frequency: around(2730, 0.01) });
    tone({ at, duration: 0.5, gain: 0.04, frequency: around(4310, 0.01) });
    // The hammer.
    burst({
      at,
      duration: 0.018,
      gain: 0.16,
      type: "bandpass",
      frequency: 2600,
      q: 1,
    });
  };

  const carriageReturn = (): void => {
    const at = context.currentTime;

    // The ratchet running back across the rail.
    for (let i = 0; i < 11; i += 1) {
      burst({
        at: at + i * around(0.016, 0.3),
        duration: 0.014,
        gain: 0.1,
        type: "bandpass",
        frequency: around(3100, 0.25),
        q: 3,
      });
    }
    // Hitting the stop.
    burst({
      at: at + 0.2,
      duration: 0.06,
      gain: 0.42,
      type: "bandpass",
      frequency: around(1500, 0.15),
      q: 1.6,
    });
    tone({ at: at + 0.2, duration: 0.12, gain: 0.14, frequency: 140 });
  };

  const refuse = (): void => {
    const at = context.currentTime;
    burst({
      at,
      duration: 0.03,
      gain: 0.22,
      type: "lowpass",
      frequency: 700,
      q: 0.8,
    });
    tone({ at, duration: 0.09, gain: 0.12, frequency: around(110, 0.08) });
  };

  return {
    strike,
    bell,
    carriageReturn,
    refuse,
    resume: () => context.resume(),
    dispose: () => void context.close(),
  };
};
