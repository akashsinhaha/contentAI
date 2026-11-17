import type { InstagramPublisher, MetaAds, WhatsAppClient } from "./types";

const GRAPH = "https://graph.facebook.com/v21.0";
const need = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set (see README)`);
  return value;
};

export const realInstagram: InstagramPublisher = {
  async publish({ caption, mediaUrl }) {
    if (!mediaUrl || !mediaUrl.startsWith("http")) throw new Error("Instagram requires a public image URL");
    const accountId = need("INSTAGRAM_BUSINESS_ID");
    const token = need("META_ACCESS_TOKEN");
    const container = await (await fetch(`${GRAPH}/${accountId}/media`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ image_url: mediaUrl, caption, access_token: token }),
    })).json();
    if (!container.id) throw new Error(`Instagram container failed: ${JSON.stringify(container)}`);
    const published = await (await fetch(`${GRAPH}/${accountId}/media_publish`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ creation_id: container.id, access_token: token }),
    })).json();
    if (!published.id) throw new Error(`Instagram publish failed: ${JSON.stringify(published)}`);
    return { externalId: published.id };
  },
};

export const realMetaAds: MetaAds = {
  async launch() {
    // Full Marketing API flow: campaign -> ad set -> creative -> ad. Requires app review + ad account.
    throw new Error("Real Meta Ads launch is not implemented yet: build campaign/adset/ad calls with META_AD_ACCOUNT_ID (see README)");
  },
  async insights() { return { impressions: 0, clicks: 0 }; },
};

/** Meta wants digits only, with country code and no "+" or spaces. */
export function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, "");
}

async function postToWhatsApp(body: Record<string, unknown>): Promise<string> {
  const phoneId = need("WHATSAPP_PHONE_NUMBER_ID");
  const response = await fetch(`${GRAPH}/${phoneId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${need("WHATSAPP_TOKEN")}`, "content-type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", ...body }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`WhatsApp error ${response.status}: ${data?.error?.message ?? "unknown error"}`);
  }
  return data.messages?.[0]?.id ?? "unknown";
}

export const realWhatsApp: WhatsAppClient = {
  /** Free-text message. Meta only delivers these inside the 24 hours after the customer last wrote. */
  async send({ to, body }) {
    return { externalId: await postToWhatsApp({ to: normalizePhone(to), type: "text", text: { body } }) };
  },
  /**
   * Marketing broadcast. WhatsApp only allows these as an approved template, so WHATSAPP_TEMPLATE_NAME is required.
   * The template must have one body variable, {{1}}, which receives the campaign message.
   */
  async broadcast({ recipients, body }) {
    const templateName = process.env.WHATSAPP_TEMPLATE_NAME;
    if (!templateName) {
      throw new Error("Set WHATSAPP_TEMPLATE_NAME to an approved message template. WhatsApp does not allow free-text marketing messages.");
    }
    const language = process.env.WHATSAPP_TEMPLATE_LANGUAGE || "en";
    let sent = 0;
    let firstError = "";
    for (const to of recipients) {
      try {
        await postToWhatsApp({
          to: normalizePhone(to),
          type: "template",
          template: { name: templateName, language: { code: language }, components: [{ type: "body", parameters: [{ type: "text", text: body }] }] },
        });
        sent++;
      } catch (error) {
        firstError ||= error instanceof Error ? error.message : String(error);
      }
    }
    if (sent === 0 && recipients.length > 0) throw new Error(`Broadcast failed for every recipient. First error: ${firstError}`);
    return { sent };
  },
};
