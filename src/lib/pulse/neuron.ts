// Deterministic geometry helpers for the neuron diagram. Pure functions so
// server and client render identical markup (no hydration mismatches).

export interface Dendrite {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

// Node's V8 and a browser's V8 can disagree in the last bit or two of
// Math.sin/cos output for the same input (transcendental functions aren't
// guaranteed bit-identical across builds). Rounding to 2 decimals keeps SSR
// and client markup byte-identical so React doesn't flag a hydration
// mismatch over a difference of 1e-14.
function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Short dendrite strokes radiating from a soma, avoiding the arc that faces
 * the axon (so they read as "receiving" branches, not crossing the signal
 * path).
 */
export function buildDendrites(
  cx: number,
  cy: number,
  radius: number,
  count: number,
  facing: "left" | "right",
  seed = 1
): Dendrite[] {
  let s = seed;
  const rand = () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };

  const dendrites: Dendrite[] = [];
  // Sweep angles on the side opposite the axon connection.
  const baseAngle = facing === "left" ? 100 : -80;
  const spread = 220;

  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const angleDeg = baseAngle + (t - 0.5) * spread + (rand() - 0.5) * 18;
    const angle = (angleDeg * Math.PI) / 180;
    const len = radius * (0.55 + rand() * 0.55);
    const bend = radius * (0.15 + rand() * 0.2);

    const midX = cx + Math.cos(angle) * (radius + bend);
    const midY = cy + Math.sin(angle) * (radius + bend);
    const endX = cx + Math.cos(angle + (rand() - 0.5) * 0.5) * (radius + len);
    const endY = cy + Math.sin(angle + (rand() - 0.5) * 0.5) * (radius + len);

    dendrites.push({ x1: round(midX), y1: round(midY), x2: round(endX), y2: round(endY) });
  }

  return dendrites;
}

/** Small perpendicular ticks along the axon path, mimicking myelin sheaths. */
export function buildMyelinTicks(
  points: { x: number; y: number }[],
  tickLength = 10
): { x1: number; y1: number; x2: number; y2: number }[] {
  const ticks: { x1: number; y1: number; x2: number; y2: number }[] = [];
  for (let i = 1; i < points.length - 1; i += 2) {
    const prev = points[i - 1];
    const next = points[i + 1] ?? points[i];
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const p = points[i];
    ticks.push({
      x1: round(p.x - nx * tickLength),
      y1: round(p.y - ny * tickLength),
      x2: round(p.x + nx * tickLength),
      y2: round(p.y + ny * tickLength),
    });
  }
  return ticks;
}

/** Sample points along a cubic bezier for tick placement. */
export function sampleCubicBezier(
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number },
  steps: number
) {
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const mt = 1 - t;
    const x = mt * mt * mt * p0.x + 3 * mt * mt * t * p1.x + 3 * mt * t * t * p2.x + t * t * t * p3.x;
    const y = mt * mt * mt * p0.y + 3 * mt * mt * t * p1.y + 3 * mt * t * t * p2.y + t * t * t * p3.y;
    points.push({ x, y });
  }
  return points;
}
