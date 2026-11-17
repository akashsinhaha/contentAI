import { NextResponse } from "next/server";
import { runScheduledJobs } from "@/lib/scheduler";
import { safeEqual } from "@/lib/auth";

// External scheduler trigger: POST /api/cron with header "Authorization: Bearer <CRON_SECRET>".
// With no CRON_SECRET the endpoint is only open outside production.
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const provided = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!safeEqual(provided, secret)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  } else if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Set CRON_SECRET to enable this endpoint" }, { status: 503 });
  }
  return NextResponse.json(await runScheduledJobs());
}
