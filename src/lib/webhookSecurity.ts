import { createHmac, timingSafeEqual } from "crypto";

/** Verifies Meta's X-Hub-Signature-256 header (HMAC-SHA256 of the raw body with the app secret). */
export function isValidMetaSignature(rawBody: string, signatureHeader: string | null, appSecret: string): boolean {
  if (!signatureHeader?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const received = signatureHeader.slice("sha256=".length);
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);
  return expectedBuffer.length === receivedBuffer.length && timingSafeEqual(expectedBuffer, receivedBuffer);
}

/**
 * Reads and authenticates a webhook body. Returns the parsed JSON, or a Response to send back.
 * With META_APP_SECRET set the signature is always required. Without it, unsigned requests are accepted
 * only in mock mode (local simulator and tests); real mode refuses them.
 */
export async function readVerifiedWebhook(request: Request): Promise<{ payload: any } | { error: Response }> {
  const rawBody = await request.text();
  const appSecret = process.env.META_APP_SECRET;
  if (appSecret) {
    if (!isValidMetaSignature(rawBody, request.headers.get("x-hub-signature-256"), appSecret)) {
      return { error: new Response("Invalid signature", { status: 401 }) };
    }
  } else if (process.env.INTEGRATIONS_MODE === "real") {
    return { error: new Response("META_APP_SECRET is not configured", { status: 503 }) };
  }
  try {
    return { payload: JSON.parse(rawBody) };
  } catch {
    return { error: Response.json({ error: "Invalid JSON" }, { status: 400 }) };
  }
}
