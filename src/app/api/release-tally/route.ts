import { NextRequest, NextResponse } from "next/server";
import { readOwnerDownloadStats } from "@/lib/pulse/ownerStats";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";
export const runtime = "nodejs";

const NO_STORE = {
  "Cache-Control": "private, no-store, no-cache, must-revalidate",
  Pragma: "no-cache",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
};

export async function GET(req: NextRequest) {
  const stats = await readOwnerDownloadStats(req.headers);
  if (!stats) {
    return new NextResponse(null, { status: 404, headers: NO_STORE });
  }
  return NextResponse.json(stats, { headers: NO_STORE });
}
