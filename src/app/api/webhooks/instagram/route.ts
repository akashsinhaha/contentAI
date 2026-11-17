import { NextResponse } from "next/server";
import { handleIncoming } from "@/lib/customer";
import { readVerifiedWebhook } from "@/lib/webhookSecurity";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const expectedToken = process.env.WEBHOOK_VERIFY_TOKEN;
  if (expectedToken && params.get("hub.mode") === "subscribe" && params.get("hub.verify_token") === expectedToken) {
    return new Response(params.get("hub.challenge") ?? "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

// Instagram messaging webhook
export async function POST(request: Request) {
  const verified = await readVerifiedWebhook(request);
  if ("error" in verified) return verified.error;
  for (const entry of verified.payload?.entry ?? []) {
    for (const event of entry.messaging ?? []) {
      if (event.message?.text && !event.message.is_echo) {
        await handleIncoming({ channel: "instagram", handle: event.sender.id, body: event.message.text });
      }
    }
  }
  return NextResponse.json({ ok: true });
}
