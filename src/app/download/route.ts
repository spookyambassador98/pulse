import { NextRequest, NextResponse } from "next/server";
import { PULSE_DOWNLOAD_URL } from "@/lib/pulse/download";

export const dynamic = "force-dynamic";

/** Счётчик скачиваний живёт в SalonTech. Здесь его никто не видит. */
const DOWNLOADS_URL =
  process.env.SALONTECH_DOWNLOADS_URL || "https://salontech-mu.vercel.app/api/downloads";

function isBot(ua: string) {
  return /bot|crawl|spider|slurp|preview|facebookexternalhit|headless|curl|wget|python-requests/i.test(ua);
}

export async function GET(req: NextRequest) {
  const ua = req.headers.get("user-agent") || "";

  if (!isBot(ua)) {
    // cookie ставит гейт: "<vid>|<company>"
    const raw = req.cookies.get("pulse_visit")?.value || "";
    let vid: string | null = null;
    let company: string | null = null;
    try {
      const [v, ...rest] = decodeURIComponent(raw).split("|");
      vid = v || null;
      company = rest.join("|") || null;
    } catch {
      /* битая cookie — пишем без компании */
    }
    const fwd = req.headers.get("x-forwarded-for") || "";

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 1500);
    try {
      await fetch(DOWNLOADS_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(process.env.DOWNLOADS_SECRET ? { "x-downloads-secret": process.env.DOWNLOADS_SECRET } : {}),
        },
        body: JSON.stringify({
          vid,
          company,
          source: "pulse/download",
          referrer: req.headers.get("referer"),
          ip: fwd.split(",")[0]?.trim() || req.headers.get("x-real-ip"),
          country: req.headers.get("x-vercel-ip-country"),
          city: req.headers.get("x-vercel-ip-city"),
          ua,
        }),
        signal: ctrl.signal,
        cache: "no-store",
      });
    } catch {
      /* счётчик не должен ломать скачивание */
    } finally {
      clearTimeout(timer);
    }
  }

  return NextResponse.redirect(PULSE_DOWNLOAD_URL, 302);
}
