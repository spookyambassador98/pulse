"use client";

import { useSyncExternalStore } from "react";

function subscribeThemeAttr(callback: () => void) {
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}
function getThemeSnapshot() {
  return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
}
function getThemeServerSnapshot() {
  return "dark" as const;
}

// Ink-drop theme toggle: the new theme floods out from the click point via
// the View Transitions API + a circular clip-path. Falls back to an instant
// swap in browsers without support (Firefox) or reduced-motion. The current
// theme is read straight from the DOM attribute via useSyncExternalStore so
// it always reflects the blocking init script — no effect-based setState.
export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribeThemeAttr, getThemeSnapshot, getThemeServerSnapshot);

  const applyTheme = (next: "dark" | "light") => {
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("pulse-theme", next);
  };

  const toggle = (e: React.MouseEvent<HTMLButtonElement>) => {
    const next = theme === "dark" ? "light" : "dark";
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const supportsViewTransitions =
      "startViewTransition" in document && !reducedMotion;

    if (!supportsViewTransitions) {
      applyTheme(next);
      return;
    }

    const x = e.clientX;
    const y = e.clientY;
    const endRadius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y)
    );

    const transition = (
      document as Document & {
        startViewTransition: (cb: () => void) => { ready: Promise<void> };
      }
    ).startViewTransition(() => applyTheme(next));

    transition.ready.then(() => {
      document.documentElement.animate(
        {
          clipPath: [
            `circle(0px at ${x}px ${y}px)`,
            `circle(${endRadius}px at ${x}px ${y}px)`,
          ],
        },
        {
          duration: 650,
          easing: "cubic-bezier(0.76,0,0.24,1)",
          pseudoElement: "::view-transition-new(root)",
        }
      );
    });
  };

  return (
    <button
      type="button"
      onClick={toggle}
      data-cursor="Toggle"
      aria-label="Toggle theme"
      className="panel-index flex items-center gap-2 border border-line rounded-full px-3 py-1.5 transition-colors hover:border-line-strong"
    >
      <span
        className="inline-block w-2 h-2 rounded-full"
        style={{ background: "var(--signal)" }}
      />
      {theme === "dark" ? "NIGHT" : "DAY"}
    </button>
  );
}
