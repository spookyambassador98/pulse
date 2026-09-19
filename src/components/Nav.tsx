"use client";

import { useEffect, useRef, useState } from "react";
import { ThemeToggle } from "./ThemeToggle";

// HUD-style top bar: session label, a live elapsed-time readout (part of
// the "diagnostic monitor" fiction), and the theme toggle.
export function Nav() {
  const [elapsed, setElapsed] = useState("00:00:00.0");
  const startRef = useRef<number>(0);

  useEffect(() => {
    startRef.current = Date.now();
    let raf: number;
    const tick = () => {
      const ms = Date.now() - startRef.current;
      const totalSec = ms / 1000;
      const h = String(Math.floor(totalSec / 3600)).padStart(2, "0");
      const m = String(Math.floor((totalSec % 3600) / 60)).padStart(2, "0");
      const s = String(Math.floor(totalSec % 60)).padStart(2, "0");
      const t = String(Math.floor((ms % 1000) / 100));
      setElapsed(`${h}:${m}:${s}.${t}`);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <header className="fixed top-0 inset-x-0 z-40 flex items-center justify-between px-5 md:px-8 py-4 md:py-5 bg-bg/70 backdrop-blur-md border-b border-line">
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-signal animate-pulse" aria-hidden="true" />
        <span className="panel-index">PULSE / DIAGNOSTIC SESSION</span>
      </div>
      <div className="hidden md:block panel-index tabular-nums">{elapsed}</div>
      <ThemeToggle />
    </header>
  );
}
