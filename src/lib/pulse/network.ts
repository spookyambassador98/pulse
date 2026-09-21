// Geometry for the *live* multi-connection neuron diagram. Unlike the
// single fixed pair in neuron.ts, this supports N target somas (one per
// host the browser is actually talking to) fanned out to the right of a
// single device soma on the left.

import { buildMyelinTicks, sampleCubicBezier } from "./neuron";

export interface Point {
  x: number;
  y: number;
}

export interface Soma {
  cx: number;
  cy: number;
  r: number;
}

export interface AxonGeometry {
  d: string;
  p0: Point;
  p3: Point;
  ticks: { x1: number; y1: number; x2: number; y2: number }[];
}

export const NETWORK_VIEW = { width: 1000, height: 480 };
export const DEVICE_SOMA: Soma = { cx: 150, cy: 240, r: 42 };

const TARGET_R = 30;
const TARGET_X = 830;
const USABLE_TOP = 70;
const USABLE_BOTTOM = 410;

/** Fans target somas out vertically; a single connection sits level with the device. */
export function targetSomaPosition(index: number, total: number): Soma {
  const n = Math.max(total, 1);
  if (n === 1) return { cx: TARGET_X, cy: DEVICE_SOMA.cy, r: TARGET_R };
  const span = USABLE_BOTTOM - USABLE_TOP;
  const cy = USABLE_TOP + ((index + 0.5) * span) / n;
  return { cx: TARGET_X, cy, r: TARGET_R };
}

/** An S-curve axon from the device soma to a given target soma. */
export function buildAxon(target: Soma): AxonGeometry {
  const p0 = { x: DEVICE_SOMA.cx + DEVICE_SOMA.r, y: DEVICE_SOMA.cy };
  const p3 = { x: target.cx - target.r, y: target.cy };
  const c1 = { x: p0.x + (p3.x - p0.x) * 0.35, y: p0.y - 70 };
  const c2 = { x: p0.x + (p3.x - p0.x) * 0.65, y: p3.y + 65 };
  const d = `M${p0.x},${p0.y} C${c1.x},${c1.y} ${c2.x},${c2.y} ${p3.x},${p3.y}`;
  const ticks = buildMyelinTicks(sampleCubicBezier(p0, c1, c2, p3, 14), 8);
  return { d, p0, p3, ticks };
}
