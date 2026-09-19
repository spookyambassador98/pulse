"use client";

// Single source of truth for GSAP plugin registration.
// Import `gsap` from here everywhere else so plugins are always ready.
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import { Observer } from "gsap/Observer";
import { CustomEase } from "gsap/CustomEase";

let registered = false;

export function registerGsap() {
  if (registered || typeof window === "undefined") return;
  gsap.registerPlugin(ScrollTrigger, SplitText, Observer, CustomEase);

  CustomEase.create("pulse-out", "0.16, 1, 0.3, 1");
  CustomEase.create("pulse-liquid", "0.76, 0, 0.24, 1");
  CustomEase.create("pulse-elastic", "0.34, 1.56, 0.64, 1");

  registered = true;
}

// Register eagerly at module-eval time (client only). Every component's
// mount effect that creates a ScrollTrigger runs as soon as it mounts, and
// React fires child effects before parent effects — so registering only
// inside a top-level provider's effect is too late for children like Hero.
registerGsap();

export { gsap, ScrollTrigger, SplitText, Observer, CustomEase };
