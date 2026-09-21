import { NextResponse } from "next/server";
import { PULSE_DOWNLOAD_URL } from "@/lib/pulse/download";

export function GET() {
  return NextResponse.redirect(PULSE_DOWNLOAD_URL, 302);
}
