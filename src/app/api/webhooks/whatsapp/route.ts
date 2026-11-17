import { NextResponse } from "next/server";
import { handleIncoming } from "@/lib/customer";
import { readVerifiedWebhook } from "@/lib/webhookSecurity";

// Meta webhook verification handshake
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const expectedToken = process.env.WEBHOOK_VERIFY_TOKEN;
  if (expectedToken && params.get("hub.mode") === "subscribe" && params.get("hub.verify_token") === expectedToken) {
    return new Response(params.get("hub.challenge") ?? "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

// WhatsApp Cloud API inbound messages
export async function POST(request: Request) {
  const verified = await readVerifiedWebhook(request);
  if ("error" in verified) return verified.error;
  const messages = verified.payload?.entry?.flatMap((entry: any) => entry.changes ?? [])
    .flatMap((change: any) => (change.value?.messages ?? []).map((message: any) => ({ message, contacts: change.value?.contacts ?? [] }))) ?? [];
  for (const { message, contacts } of messages) {
    if (message.type !== "text") continue;
    await handleIncoming({ channel: "whatsapp", handle: message.from, name: contacts[0]?.profile?.name, body: message.text.body });
  }
  return NextResponse.json({ ok: true });
}
