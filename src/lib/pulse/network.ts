// Geometry for the *live* multi-connection neuron diagram. A single device
// soma sits at the center; every host gets a fixed slot on the circle derived
// only from its own identity — never from how many siblings exist or what
// index it holds in the list. That way new connections appear without
// shoving the ones already on screen.

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

export const DEVICE_SOMA: Soma = { cx: 0, cy: 0, r: 42 };

const NODE_R = 16;
/** Minimum centre-to-centre distance between two synapses. */
const MIN_SPACING = 148;
const INNER_RADIUS = 168;
const RING_GAP = 148;

export interface SlotLayout {
  somata: Map<string, Soma>;
  maxRadius: number;
  viewExtent: number;
  rings: number[];
}

function ringSpec(ringIndex: number): { radius: number; slots: number } {
  const radius = INNER_RADIUS + ringIndex * RING_GAP;
  const slots = Math.max(6, Math.floor((2 * Math.PI * radius) / MIN_SPACING));
  return { radius, slots };
}

function polarForSlot(slot: number): { radius: number; angle: number } {
  let remaining = slot;
  let ring = 0;
  while (true) {
    const spec = ringSpec(ring);
    if (remaining < spec.slots) {
      const stagger = ring * (Math.PI / spec.slots);
      const angle = (remaining / spec.slots) * Math.PI * 2 + stagger - Math.PI / 2;
      return { radius: spec.radius, angle };
    }
    remaining -= spec.slots;
    ring += 1;
  }
}

/**
 * Concentric rings with a hard minimum gap. Slot index is permanent per host,
 * so existing synapses never jump when new ones appear — newcomers take the
 * next free seat on an outer ring.
 */
export function layoutSomataFromSlots(slotByHost: Map<string, number>): SlotLayout {
  const somata = new Map<string, Soma>();
  let maxRadius = INNER_RADIUS;

  for (const [host, slot] of slotByHost) {
    const { radius, angle } = polarForSlot(slot);
    maxRadius = Math.max(maxRadius, radius);
    somata.set(host, {
      cx: round(DEVICE_SOMA.cx + Math.cos(angle) * radius),
      cy: round(DEVICE_SOMA.cy + Math.sin(angle) * radius),
      r: NODE_R,
    });
  }

  const viewExtent = Math.ceil(maxRadius + NODE_R + 72);
  const ringCount = Math.max(3, Math.ceil((maxRadius - INNER_RADIUS) / RING_GAP) + 1);
  const rings = Array.from({ length: ringCount }, (_, i) => ringSpec(i).radius);

  return { somata, maxRadius, viewExtent, rings };
}

export function shortHostLabel(name: string, max = 22): string {
  if (!name.includes(".")) return name.length <= max ? name : `${name.slice(0, max - 1)}…`;
  const first = name.split(".")[0];
  if (first && first.length >= 3 && first.length <= max && !/^\d+$/.test(first)) return first;
  if (name.length <= max) return name;
  return `${name.slice(0, max - 1)}…`;
}

/** @deprecated — use layoutSomataFromSlots for live monitor */
export function targetSomaPosition(host: string): Soma {
  const { radius, angle } = polarForSlot(hashHost(host) % 24);
  return {
    cx: round(DEVICE_SOMA.cx + Math.cos(angle) * radius),
    cy: round(DEVICE_SOMA.cy + Math.sin(angle) * radius),
    r: NODE_R,
  };
}

export function outwardAngle(target: Soma): number {
  return Math.atan2(target.cy - DEVICE_SOMA.cy, target.cx - DEVICE_SOMA.cx);
}

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
