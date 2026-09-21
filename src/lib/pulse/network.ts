// Geometry for the *live* multi-connection neuron diagram. A single device
// soma sits at the center; every host it's actually talking to gets its own
// target soma radiating outward in its own direction — the way a real
// neuron's dendrites branch all around the cell body, not fanned to one
// side like a diagram.

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

export interface Dendrite {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface AxonGeometry {
  d: string;
  p0: Point;
  p3: Point;
  ticks: { x1: number; y1: number; x2: number; y2: number }[];
  forks: { d: string }[];
}

// Node's V8 and a browser's V8 can disagree in the last bit of
// Math.sin/cos for the same input — round so SSR and client markup stay
// byte-identical.
function round(n: number): number {
  return Math.round(n * 100) / 100;
}

function seededRand(seed: number) {
  let s = (seed % 2147483646) + 1;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function hashHost(host: string): number {
  let h = 0;
  for (let i = 0; i < host.length; i++) h = (h * 31 + host.charCodeAt(i)) >>> 0;
  return h;
}

export const NETWORK_VIEW = { width: 1000, height: 760 };
export const DEVICE_SOMA: Soma = { cx: 500, cy: 380, r: 50 };

const TARGET_R = 24;
const RING_RADII = [175, 235, 295];
const MAX_RADIUS = 330;

/** Radar rings drawn behind the whole diagram — a software instrument, not a hero graphic. */
export const RADAR_RINGS = [130, RING_RADII[0], RING_RADII[1], RING_RADII[2]];

/**
 * Places a target soma somewhere around the full circle, not just to one
 * side. Position is derived from the host string itself (not array index),
 * so a given host always lands in the same spot even as siblings come and
 * go — it doesn't jump around the moment the connection list re-orders.
 */
export function targetSomaPosition(host: string, index: number, total: number): Soma {
  const n = Math.max(total, 1);
  const hash = hashHost(host);
  const rand = seededRand(hash);

  const angleStep = 360 / n;
  const baseAngle = -90 + index * angleStep;
  const jitter = (rand() - 0.5) * angleStep * 0.5;
  const angleDeg = baseAngle + jitter;
  const angle = (angleDeg * Math.PI) / 180;

  const ring = RING_RADII[hash % RING_RADII.length];
  const radiusJitter = (rand() - 0.5) * 22;
  const radius = Math.min(ring + radiusJitter, MAX_RADIUS);

  return {
    cx: round(DEVICE_SOMA.cx + Math.cos(angle) * radius),
    cy: round(DEVICE_SOMA.cy + Math.sin(angle) * radius),
    r: TARGET_R,
  };
}

/** Angle (radians) pointing from the device soma out to a target — used to aim outward-facing dendrites. */
export function outwardAngle(target: Soma): number {
  return Math.atan2(target.cy - DEVICE_SOMA.cy, target.cx - DEVICE_SOMA.cx);
}

/** An organic, slightly-bowed axon from the device soma to a target soma, plus 1-2 small forking tendrils. */
export function buildAxon(target: Soma, host: string): AxonGeometry {
  const dx = target.cx - DEVICE_SOMA.cx;
  const dy = target.cy - DEVICE_SOMA.cy;
  const dist = Math.hypot(dx, dy) || 1;
  const ux = dx / dist;
  const uy = dy / dist;

  const p0 = { x: DEVICE_SOMA.cx + ux * DEVICE_SOMA.r, y: DEVICE_SOMA.cy + uy * DEVICE_SOMA.r };
  const p3 = { x: target.cx - ux * target.r, y: target.cy - uy * target.r };

  const rand = seededRand(hashHost(host) + 7);
  const nx = -uy;
  const ny = ux;
  const bow = (rand() - 0.5) * dist * 0.32;

  const c1 = {
    x: p0.x + (p3.x - p0.x) * 0.33 + nx * bow,
    y: p0.y + (p3.y - p0.y) * 0.33 + ny * bow,
  };
  const c2 = {
    x: p0.x + (p3.x - p0.x) * 0.66 + nx * bow * 0.55,
    y: p0.y + (p3.y - p0.y) * 0.66 + ny * bow * 0.55,
  };

  const d = `M${round(p0.x)},${round(p0.y)} C${round(c1.x)},${round(c1.y)} ${round(c2.x)},${round(c2.y)} ${round(p3.x)},${round(p3.y)}`;
  const points = sampleCubicBezier(p0, c1, c2, p3, 12);
  const ticks = buildMyelinTicks(points, 5);

  // One or two short offshoot tendrils branching off the main path partway
  // along, the way a real axon collateral splits off before the terminal.
  const forkCount = 1 + (rand() > 0.5 ? 1 : 0);
  const forks: { d: string }[] = [];
  for (let i = 0; i < forkCount; i++) {
    const t = 0.35 + rand() * 0.35;
    const idx = Math.min(points.length - 1, Math.max(1, Math.round(t * points.length)));
    const origin = points[idx];
    const forkSide = rand() > 0.5 ? 1 : -1;
    const forkLen = dist * (0.08 + rand() * 0.08);
    const forkAngle = Math.atan2(ny, nx) + forkSide * (0.5 + rand() * 0.4);
    const end = {
      x: origin.x + Math.cos(forkAngle) * forkLen,
      y: origin.y + Math.sin(forkAngle) * forkLen,
    };
    forks.push({ d: `M${round(origin.x)},${round(origin.y)} L${round(end.x)},${round(end.y)}` });
  }

  return { d, p0, p3, ticks, forks };
}

/** Fine hairs radiating from the device soma in every direction — texture, not a signal path. */
export function buildDeviceHairs(count: number, seed = 1): Dendrite[] {
  const rand = seededRand(seed);
  const hairs: Dendrite[] = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + (rand() - 0.5) * 0.3;
    const len = DEVICE_SOMA.r * (0.3 + rand() * 0.35);
    const x1 = DEVICE_SOMA.cx + Math.cos(angle) * (DEVICE_SOMA.r + 3);
    const y1 = DEVICE_SOMA.cy + Math.sin(angle) * (DEVICE_SOMA.r + 3);
    const x2 = DEVICE_SOMA.cx + Math.cos(angle) * (DEVICE_SOMA.r + 3 + len);
    const y2 = DEVICE_SOMA.cy + Math.sin(angle) * (DEVICE_SOMA.r + 3 + len);
    hairs.push({ x1: round(x1), y1: round(y1), x2: round(x2), y2: round(y2) });
  }
  return hairs;
}

/** Short dendrite hairs at a target soma, branching further outward (away from the device). */
export function buildOutwardHairs(target: Soma, awayAngle: number, count: number, host: string): Dendrite[] {
  const rand = seededRand(hashHost(host) + 19);
  const hairs: Dendrite[] = [];
  const spread = (130 * Math.PI) / 180;
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const angle = awayAngle + (t - 0.5) * spread + (rand() - 0.5) * 0.25;
    const len = target.r * (0.5 + rand() * 0.5);
    const x1 = target.cx + Math.cos(angle) * (target.r + 2);
    const y1 = target.cy + Math.sin(angle) * (target.r + 2);
    const x2 = target.cx + Math.cos(angle) * (target.r + 2 + len);
    const y2 = target.cy + Math.sin(angle) * (target.r + 2 + len);
    hairs.push({ x1: round(x1), y1: round(y1), x2: round(x2), y2: round(y2) });
  }
  return hairs;
}
