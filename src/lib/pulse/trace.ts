// Procedural ECG-style trace generator. Produces straight-line-segment
// paths (real cardiograph traces are linear, not smoothed curves) so the
// same generator can render a "healthy" steady rhythm or an "arrhythmia"
// irregular one just by changing its parameters.

export type TraceVariant = "healthy" | "alert";

interface TraceOptions {
  width: number;
  height: number;
  variant: TraceVariant;
  seed?: number;
}

// Deterministic pseudo-random so server and client render the same path
// (avoids hydration mismatches from Math.random()).
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function beatShape(cycleWidth: number, amp: number): [number, number][] {
  // Points as [xFraction of cycle, yFraction of amplitude], baseline = 0.
  return [
    [0, 0],
    [0.16, 0],
    [0.22, -0.12], // P wave
    [0.28, 0],
    [0.36, 0],
    [0.4, 0.08], // Q dip
    [0.44, -1], // R spike
    [0.48, 0.35], // S dip
    [0.53, 0],
    [0.62, 0],
    [0.72, -0.22], // T wave
    [0.82, 0],
    [1, 0],
  ].map(([x, y]) => [x * cycleWidth, y * amp]);
}

export function buildTracePath({ width, height, variant, seed = 1 }: TraceOptions): string {
  const rand = mulberry32(seed);
  const baseline = height / 2;
  const points: [number, number][] = [];

  let x = -20;
  const amp = height * 0.38;

  while (x < width + 20) {
    const jitterRate = variant === "alert" ? 0.55 + rand() * 0.9 : 1;
    const cycleWidth = (variant === "alert" ? 90 + rand() * 70 : 118) * jitterRate;
    const ampScale = variant === "alert" ? 0.6 + rand() * 0.9 : 0.95 + rand() * 0.1;

    // Occasionally drop a beat entirely on the alert trace (flatline blip).
    if (variant === "alert" && rand() < 0.12) {
      points.push([x, 0], [x + cycleWidth * 0.6, 0]);
      x += cycleWidth * 0.6;
      continue;
    }

    const shape = beatShape(cycleWidth, amp * ampScale);
    for (const [px, py] of shape) {
      const noise = variant === "alert" ? (rand() - 0.5) * amp * 0.18 : 0;
      points.push([x + px, py + noise]);
    }
    x += cycleWidth;
  }

  const d = points
    .map(([px, py], i) => `${i === 0 ? "M" : "L"}${px.toFixed(2)},${(baseline + py).toFixed(2)}`)
    .join(" ");

  return d;
}
