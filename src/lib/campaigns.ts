import { db } from "@/lib/db";
import { getLLM } from "@/lib/ai";
import { getBrandContext } from "@/lib/brand/learn";
import { requestApproval } from "@/lib/approval";
import { getMetaAds, getWhatsApp } from "@/lib/integrations";
import { recordMetric } from "@/lib/metrics";

export async function createCampaign(input: {
  channel: "meta_ad" | "whatsapp";
  name: string;
  objective?: string;
  audience?: string;
  budget?: number | null;
  message?: string;
  createdBy?: "marketing" | "owner";
}) {
  let message = input.message?.trim();
  if (!message) {
    const brand = await getBrandContext();
    message = await getLLM().complete({
      task: "caption",
      system: "Write a short, honest marketing message in the brand voice. Plain text only.",
      prompt: `${brand}\n\nCampaign: ${input.name}. Objective: ${input.objective ?? ""}. Channel: ${input.channel}.`,
    });
    // The mock returns JSON for the caption task; unwrap it if so.
    try { const parsed = JSON.parse(message); if (parsed.caption) message = parsed.caption; } catch { /* plain text already */ }
  }
  const campaign = await db.campaign.create({
    data: {
      channel: input.channel, name: input.name, objective: input.objective ?? "", audience: input.audience ?? "",
      budget: input.budget ?? null, message, status: "pending_approval",
    },
  });
  await requestApproval({
    type: "launch_campaign",
    title: `Launch ${input.channel === "meta_ad" ? "Meta ad" : "WhatsApp"} campaign: ${input.name}`,
    payload: { campaignId: campaign.id },
    createdBy: input.createdBy ?? "marketing",
  });
  return campaign;
}

/** Called only from the approval gate. */
export async function launchCampaign(campaignId: string, editedMessage?: string): Promise<string> {
  const campaign = await db.campaign.findUniqueOrThrow({ where: { id: campaignId } });
  const message = editedMessage ?? campaign.message;
  if (campaign.channel === "meta_ad") {
    const { externalId } = await getMetaAds().launch({
      name: campaign.name, objective: campaign.objective, audience: campaign.audience, budget: campaign.budget, message,
    });
    await db.campaign.update({ where: { id: campaignId }, data: { status: "live", externalId, message } });
    await recordMetric("campaign", campaignId);
    return `Meta ad live (${externalId})`;
  }
  // WhatsApp marketing goes only to contacts who opted in.
  const recipients = await db.contact.findMany({ where: { channel: "whatsapp", optedIn: true } });
  if (recipients.length === 0) {
    await db.campaign.update({ where: { id: campaignId }, data: { status: "failed" } });
    throw new Error("No opted-in WhatsApp contacts to send to");
  }
  const { sent } = await getWhatsApp().broadcast({ recipients: recipients.map((contact) => contact.handle), body: message });
  await db.campaign.update({ where: { id: campaignId }, data: { status: "live", message } });
  await recordMetric("campaign", campaignId);
  return `WhatsApp broadcast sent to ${sent} opted-in contacts`;
}
