"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { decideAction } from "@/lib/approval";
import { generatePost, generateImageOnly, generateUgcVideo, planMonth, submitForPublishing, updateDraft, deleteDraft } from "@/lib/content";
import { createCampaign } from "@/lib/campaigns";
import { handleIncoming, ownerReply, handleCall } from "@/lib/customer";
import { learnBrand } from "@/lib/brand/learn";
import { runScheduledJobs } from "@/lib/scheduler";

const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();

export async function decideActionForm(form: FormData) {
  const edited = text(form, "edited");
  const kind = text(form, "type");
  const edits = kind === "publish_post" ? { caption: edited || undefined } : kind === "launch_campaign" ? { message: edited || undefined } : { body: edited || undefined };
  await decideAction(text(form, "id"), text(form, "decision") === "approve", edits);
  revalidatePath("/", "layout");
}

export async function generateContentForm(form: FormData) {
  const theme = text(form, "theme") || "Product spotlight";
  const kind = text(form, "kind");
  if (kind === "image") await generateImageOnly(theme);
  else if (kind === "video") await generateUgcVideo(theme);
  else await generatePost(theme);
  revalidatePath("/content");
}

export async function submitContentForm(form: FormData) {
  const when = text(form, "scheduledFor");
  await submitForPublishing(text(form, "id"), when ? new Date(when) : null);
  revalidatePath("/", "layout");
}

export async function planMonthForm(form: FormData) {
  const [year, month] = (text(form, "month") || new Date().toISOString().slice(0, 7)).split("-").map(Number);
  await planMonth(year, month - 1, text(form, "focus"));
  revalidatePath("/calendar");
}

export async function createCampaignForm(form: FormData) {
  const budget = text(form, "budget");
  await createCampaign({
    channel: text(form, "channel") === "meta_ad" ? "meta_ad" : "whatsapp",
    name: text(form, "name") || "New campaign",
    objective: text(form, "objective"),
    audience: text(form, "audience"),
    budget: budget ? Number(budget) : null,
    message: text(form, "message"),
    createdBy: "owner",
  });
  revalidatePath("/", "layout");
}

export async function saveBrandForm(form: FormData) {
  const fields = { voice: text(form, "voice"), tone: text(form, "tone"), dos: text(form, "dos"), donts: text(form, "donts"), hashtags: text(form, "hashtags") };
  await db.brandProfile.upsert({ where: { id: "default" }, update: fields, create: { id: "default", ...fields } });
  revalidatePath("/", "layout");
}

export async function learnBrandForm(form: FormData) {
  await learnBrand({ websiteUrl: text(form, "websiteUrl"), sampleCaptions: text(form, "sampleCaptions") });
  const websiteUrl = text(form, "websiteUrl");
  if (websiteUrl) await db.business.update({ where: { id: "default" }, data: { website: websiteUrl } });
  revalidatePath("/", "layout");
}

export async function addProductForm(form: FormData) {
  const price = text(form, "price");
  await db.product.create({ data: { name: text(form, "name"), description: text(form, "description"), price: price ? Number(price) : null } });
  revalidatePath("/onboarding");
}

export async function saveSettingsForm(form: FormData) {
  await db.business.update({
    where: { id: "default" },
    data: {
      name: text(form, "name") || undefined,
      autoReply: form.get("autoReply") === "on",
      autoFollowUp: form.get("autoFollowUp") === "on",
      escalationKeywords: text(form, "escalationKeywords"),
      followUpCadenceHours: text(form, "followUpCadenceHours") || "24,72,168",
    },
  });
  revalidatePath("/", "layout");
}

export async function simulateMessageForm(form: FormData) {
  const channel = text(form, "channel") === "instagram" ? "instagram" : "whatsapp";
  await handleIncoming({ channel, handle: text(form, "handle") || "+911111111111", name: text(form, "name") || undefined, body: text(form, "body") });
  revalidatePath("/", "layout");
}

export async function ownerReplyForm(form: FormData) {
  await ownerReply(text(form, "conversationId"), text(form, "body"));
  revalidatePath("/inbox");
}

export async function simulateCallForm(form: FormData) {
  await handleCall({ callerNumber: text(form, "number") || "+912222222222", callerName: text(form, "name") || undefined, callerSays: text(form, "says") });
  revalidatePath("/", "layout");
}

export async function setLeadStageForm(form: FormData) {
  await db.lead.update({ where: { id: text(form, "id") }, data: { stage: text(form, "stage") } });
  revalidatePath("/leads");
}

export async function runJobsForm() {
  await runScheduledJobs();
  revalidatePath("/", "layout");
}

export async function updateDraftForm(form: FormData) {
  const when = text(form, "scheduledFor");
  await updateDraft(text(form, "id"), {
    caption: text(form, "caption"),
    hashtags: text(form, "hashtags"),
    scheduledFor: when ? new Date(when) : null,
  });
  revalidatePath("/", "layout");
}

export async function deleteDraftForm(form: FormData) {
  await deleteDraft(text(form, "id"));
  revalidatePath("/", "layout");
}
