// Deterministic spike-train generator — a raster of firing events, the
// neuroscience equivalent of what the old ECG waveform was trying to be.
// A "healthy" train fires at a steady interval; an "alert" train bursts,
// drops beats, and jitters — a neuron losing its rhythm, not a heart.

export type SpikeVariant = "healthy" | "alert";

export interface Spike {
  x: number;
  height: number; // 0..1
}

function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface BuildOptions {
  width: number;
  variant: SpikeVariant;
  seed?: number;
  /** Average spikes per 100 units of width for a healthy train. */
  density?: number;
}

export function buildSpikeTrain({ width, variant, seed = 1, density = 6 }: BuildOptions): Spike[] {
  const rand = mulberry32(seed);
  const spikes: Spike[] = [];
  const baseInterval = 100 / density;

  let x = baseInterval * 0.4;

  while (x < width) {
    if (variant === "healthy") {
      spikes.push({ x, height: 0.72 + rand() * 0.28 });
      x += baseInterval * (0.85 + rand() * 0.3);
      continue;
    }

    const r = rand();
    if (r < 0.16) {
      // Dropped signal — a silent gap, like a misfire.
      x += baseInterval * (2.2 + rand() * 2.2);
    } else if (r < 0.34) {
      // Burst — two spikes fired close together.
      spikes.push({ x, height: 0.45 + rand() * 0.55 });
      x += baseInterval * (0.18 + rand() * 0.16);
      spikes.push({ x, height: 0.35 + rand() * 0.6 });
      x += baseInterval * (0.7 + rand() * 0.8);
    } else {
      spikes.push({ x, height: 0.3 + rand() * 0.7 });
      x += baseInterval * (0.5 + rand() * 1.5);
    }
  }

  return spikes;
}
