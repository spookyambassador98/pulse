/** SalonTech (Ops Hub) — центр управления, куда пишутся визиты. */
const VISITS_URL =
  process.env.NEXT_PUBLIC_VISITS_URL || "https://salontech-mu.vercel.app/api/visits";

export const VISIT_COMPANY_KEY = "salon-visit-company";
export const VISIT_NAME_KEY = "salon-visit-name";
export const VISIT_ROLE_KEY = "salon-visit-role";
/** Cookie, по которой /download понимает, какая компания скачала. */
export const VISIT_COOKIE = "pulse_visit";
export const VISIT_VID_KEY = "salon-visit-vid";
export const VISIT_MODE_KEY = "salon-visit-mode";
export const VISIT_START_KEY = "salon-visit-start";
export const VISIT_LAND_KEY = "salon-visit-land";

export const GATE_KEY = "pulse-gate";
export const VISIT_PROJECT = "pulse" as const;

export function isGateOpen() {
  try {
    return sessionStorage.getItem(GATE_KEY) === "1";
  } catch {
    return false;
  }
}

function clean(v: string) {
  return v.replace(/\s+/g, " ").trim().slice(0, 80);
}

/** Свои заходы не считаем: открой сайт один раз с ?visit-gate=off (вернуть: ?visit-gate=on). */
export function isOwnerBrowser() {
  try {
    const q = new URLSearchParams(location.search).get("visit-gate");
    if (q === "off") localStorage.setItem("vg-off", "1");
    if (q === "on") localStorage.removeItem("vg-off");
    return localStorage.getItem("vg-off") === "1";
  } catch {
    return false;
  }
}

export function savedIdentity() {
  try {
    return {
      company: localStorage.getItem(VISIT_COMPANY_KEY) || "",
      name: localStorage.getItem(VISIT_NAME_KEY) || "",
      role: localStorage.getItem(VISIT_ROLE_KEY) || "",
    };
  } catch {
    return { company: "", name: "", role: "" };
  }
}

export function rememberCompanyVisit(company: string, person: { name?: string; role?: string } = {}) {
  const name = clean(company);
  const who = clean(person.name || "");
  const role = clean(person.role || "");
  const vid = (
    globalThis.crypto?.randomUUID?.() ||
    `v${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
  ).replace(/[^a-zA-Z0-9_-]/g, "");
  sessionStorage.setItem(VISIT_COMPANY_KEY, name);
  sessionStorage.setItem(VISIT_VID_KEY, vid);
  sessionStorage.setItem(VISIT_MODE_KEY, "company");
  sessionStorage.setItem(VISIT_START_KEY, String(Date.now()));
  sessionStorage.setItem(VISIT_LAND_KEY, location.href);
  sessionStorage.setItem(GATE_KEY, "1");
  sessionStorage.setItem(VISIT_NAME_KEY, who);
  sessionStorage.setItem(VISIT_ROLE_KEY, role);
  try {
    localStorage.setItem(VISIT_COMPANY_KEY, name);
    localStorage.setItem(VISIT_NAME_KEY, who);
    localStorage.setItem(VISIT_ROLE_KEY, role);
  } catch {
    /* private mode */
  }
  document.cookie = `${VISIT_COOKIE}=${encodeURIComponent(`${vid}|${name}`)}; path=/; max-age=86400; samesite=lax`;
  return { name, vid };
}

function isCompanyVisit() {
  try {
    return sessionStorage.getItem(VISIT_MODE_KEY) === "company";
  } catch {
    return false;
  }
}

function here() {
  return location.pathname + location.search + location.hash;
}

function clickLabel(el: Element) {
  const node = el as HTMLElement;
  return (
    node.getAttribute("data-track") ||
    node.getAttribute("aria-label") ||
    node.getAttribute("title") ||
    node.getAttribute("href") ||
    node.innerText?.trim().replace(/\s+/g, " ").slice(0, 80) ||
    node.tagName
  );
}

export function sendVisit(events: { type: string; path?: string; detail?: string }[]) {
  if (typeof window === "undefined" || !isCompanyVisit()) return;
  let company = "";
  let vid = "";
  try {
    company = sessionStorage.getItem(VISIT_COMPANY_KEY) || "";
    vid = sessionStorage.getItem(VISIT_VID_KEY) || "";
  } catch {
    return;
  }
  if (!company || !vid) return;

  const started = Number(sessionStorage.getItem(VISIT_START_KEY) || Date.now());
  const body = JSON.stringify({
    vid,
    company,
    name: sessionStorage.getItem(VISIT_NAME_KEY) || "",
    role: sessionStorage.getItem(VISIT_ROLE_KEY) || "",
    project: VISIT_PROJECT,
    events: events.map((e) => ({
      type: e.type,
      path: e.path || here(),
      detail: e.detail,
      at: new Date().toISOString(),
    })),
    referrer: document.referrer || null,
    landing: sessionStorage.getItem(VISIT_LAND_KEY) || location.href,
    href: location.href,
    ua: navigator.userAgent,
    lang: navigator.language,
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    screen: `${window.screen.width}x${window.screen.height}`,
    durationSec: Math.max(1, Math.round((Date.now() - started) / 1000)),
  });

  const blob = new Blob([body], { type: "text/plain" });
  if (navigator.sendBeacon && navigator.sendBeacon(VISITS_URL, blob)) return;
  void fetch(VISITS_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body,
    keepalive: true,
    mode: "cors",
  }).catch(() => undefined);
}

export function attachVisitTracker() {
  if (typeof window === "undefined" || !isCompanyVisit()) return () => undefined;

  sendVisit([
    { type: "gate", detail: "unlocked" },
    { type: "page", detail: document.title.slice(0, 80) },
  ]);

  const seenScroll = new Set<number>();

  const onClick = (e: MouseEvent) => {
    const el = (e.target as HTMLElement | null)?.closest(
      "a,button,[role='button'],input[type='submit'],[data-track]",
    );
    if (!el) return;
    sendVisit([
      { type: "click", detail: `${el.tagName.toLowerCase()}:${clickLabel(el)}` },
    ]);
  };

  const onSubmit = (e: Event) => {
    const form = e.target as HTMLFormElement;
    sendVisit([{ type: "form", detail: form?.id || "submit" }]);
  };

  const onScroll = () => {
    const doc = document.documentElement;
    const max = Math.max(1, doc.scrollHeight - window.innerHeight);
    const pct = Math.min(100, Math.round((window.scrollY / max) * 100));
    for (const mark of [25, 50, 75, 100]) {
      if (pct >= mark && !seenScroll.has(mark)) {
        seenScroll.add(mark);
        sendVisit([{ type: "scroll", detail: `${mark}%` }]);
      }
    }
  };

  const ping = () => {
    const started = Number(sessionStorage.getItem(VISIT_START_KEY) || Date.now());
    const sec = Math.max(1, Math.round((Date.now() - started) / 1000));
    sendVisit([{ type: "dwell", detail: `${sec}s` }]);
  };

  const onHide = () => {
    if (document.visibilityState !== "hidden") return;
    ping();
    sendVisit([{ type: "leave", detail: "hidden" }]);
  };

  const dwell = window.setInterval(() => {
    if (document.visibilityState === "visible") ping();
  }, 15_000);
  document.addEventListener("click", onClick, true);
  document.addEventListener("submit", onSubmit, true);
  document.addEventListener("visibilitychange", onHide);
  window.addEventListener("pagehide", ping);
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  return () => {
    window.clearInterval(dwell);
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("submit", onSubmit, true);
    document.removeEventListener("visibilitychange", onHide);
    window.removeEventListener("pagehide", ping);
    window.removeEventListener("scroll", onScroll);
  };
}
