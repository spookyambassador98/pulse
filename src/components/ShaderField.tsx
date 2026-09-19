"use client";

import { useEffect, useRef } from "react";
import { Renderer, Program, Mesh, Triangle, Vec2, Color } from "ogl";
import { usePrefersReducedMotion } from "@/lib/motion/usePrefersReducedMotion";

// Signature background: a domain-warped fbm field (the classic "liquid ink"
// technique) rendered as a fullscreen WebGL triangle, tinted with the signal
// color and biased toward the pointer. Purely ambient — sits behind the
// hero copy at low opacity, never fights legibility.

const VERTEX = /* glsl */ `
  attribute vec2 position;
  attribute vec2 uv;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 0.0, 1.0);
  }
`;

const FRAGMENT = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime;
  uniform vec2 uResolution;
  uniform vec2 uMouse;
  uniform vec3 uSignal;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += a * noise(p);
      p *= 2.0;
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec2 uv = vUv;
    float aspect = uResolution.x / uResolution.y;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0) * 2.4;

    float t = uTime * 0.035;

    // Domain warp (Iq-style): warp the field through itself twice.
    vec2 q = vec2(fbm(p + vec2(0.0, 0.0) + t), fbm(p + vec2(5.2, 1.3) - t));
    vec2 r = vec2(
      fbm(p + 3.2 * q + vec2(1.7, 9.2) + 0.15 * t),
      fbm(p + 3.2 * q + vec2(8.3, 2.8) - 0.12 * t)
    );
    float f = fbm(p + 3.4 * r);

    vec2 mouse = (uMouse - 0.5) * vec2(aspect, 1.0) * 2.4;
    float distToMouse = length(p - mouse);
    float mouseGlow = smoothstep(1.1, 0.0, distToMouse) * 0.5;

    float field = f + mouseGlow;

    vec3 base = vec3(0.0);
    vec3 color = mix(base, uSignal, smoothstep(0.35, 0.95, field));

    float vignette = smoothstep(1.3, 0.2, length(uv - 0.5) * 1.6);
    float alpha = smoothstep(0.4, 0.85, field) * 0.85 * vignette;

    gl_FragColor = vec4(color, alpha);
  }
`;

export function ShaderField({ className }: { className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    if (reducedMotion) return;
    const container = containerRef.current;
    if (!container) return;

    const renderer = new Renderer({ alpha: true, dpr: Math.min(window.devicePixelRatio, 1.35) });
    const gl = renderer.gl;
    container.appendChild(gl.canvas);
    gl.canvas.style.width = "100%";
    gl.canvas.style.height = "100%";

    const geometry = new Triangle(gl);
    const mouse = new Vec2(0.5, 0.5);
    const targetMouse = new Vec2(0.5, 0.5);

    const computedSignal = getComputedStyle(document.documentElement)
      .getPropertyValue("--signal")
      .trim();

    const program = new Program(gl, {
      vertex: VERTEX,
      fragment: FRAGMENT,
      uniforms: {
        uTime: { value: 0 },
        uResolution: { value: new Vec2(1, 1) },
        uMouse: { value: mouse },
        uSignal: { value: new Color(computedSignal || "#baff29") },
      },
      transparent: true,
    });

    const mesh = new Mesh(gl, { geometry, program });

    function resize() {
      const { clientWidth, clientHeight } = container as HTMLDivElement;
      renderer.setSize(clientWidth, clientHeight);
      program.uniforms.uResolution.value.set(clientWidth, clientHeight);
    }
    resize();
    window.addEventListener("resize", resize);

    function onPointerMove(e: PointerEvent) {
      const rect = container!.getBoundingClientRect();
      targetMouse.set((e.clientX - rect.left) / rect.width, 1 - (e.clientY - rect.top) / rect.height);
    }
    window.addEventListener("pointermove", onPointerMove);

    let visible = true;
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
    });
    io.observe(container);

    let raf = 0;
    let running = true;
    const start = performance.now();

    function loop(now: number) {
      raf = requestAnimationFrame(loop);
      if (!visible || document.hidden || !running) return;
      mouse.x += (targetMouse.x - mouse.x) * 0.04;
      mouse.y += (targetMouse.y - mouse.y) * 0.04;
      program.uniforms.uTime.value = (now - start) / 1000;
      renderer.render({ scene: mesh });
    }
    raf = requestAnimationFrame(loop);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointerMove);
      io.disconnect();
      container.removeChild(gl.canvas);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, [reducedMotion]);

  if (reducedMotion) {
    return (
      <div
        className={className}
        aria-hidden="true"
        style={{
          background:
            "radial-gradient(60% 50% at 50% 40%, var(--signal-dim), transparent 70%)",
        }}
      />
    );
  }

  return <div ref={containerRef} className={className} aria-hidden="true" />;
}
