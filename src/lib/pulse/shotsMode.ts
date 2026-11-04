/** Photographs of the app must never show this machine's addresses. */
export function isShotsMode() {
  if (typeof window === "undefined") return false;
  try {
    return new URLSearchParams(window.location.search).has("shots");
  } catch {
    return false;
  }
}
