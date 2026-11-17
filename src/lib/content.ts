import { db } from "@/lib/db";
import { getLLM, getImageProvider, getVideoProvider, parseJson } from "@/lib/ai";
import { getBrandContext } from "@/lib/brand/learn";
import { requestApproval } from "@/lib/approval";
import { getInstagram } from "@/lib/integrations";
import { recordMetric } from "@/lib/metrics";

const SYSTEM = "You are a marketing assistant for a small business. Follow the brand profile exactly. Be concise, specific and honest.";

export async function generatePost(theme: string, options: { withImage?: boolean } = {}) {
  const brand = await getBrandContext();
  const raw = await getLLM().complete({
    task: "caption",
    json: true,
    system: SYSTEM,
    prompt: `${brand}\n\nWrite an Instagram caption and hashtags about: ${theme}. Reply ONLY JSON {caption,hashtags}.`,
  });
  const parsed = parseJson(raw, { caption: raw, hashtags: "" });
  const mediaUrl = options.withImage === false ? null : await getImageProvider().generate(theme);
  return db.contentItem.create({
    data: { kind: "post", caption: parsed.caption, hashtags: parsed.hashtags, mediaUrl, theme, status: "draft" },
  });
}

export async function generateImageOnly(theme: string) {
  const mediaUrl = await getImageProvider().generate(`Product photo, ${theme}`);
  return db.contentItem.create({ data: { kind: "image", theme, mediaUrl, status: "draft" } });
}

/** UGC-style video: script + storyboard. Real video rendering plugs in at VideoProvider. */
export async function generateUgcVideo(theme: string) {
  const brand = await getBrandContext();
  const video = await getVideoProvider().generate(`${brand}\n\nUGC-style 15 second video about: ${theme}`);
  return db.contentItem.create({
    data: { kind: "video", theme, script: video.script, mediaUrl: video.mediaUrl || null, caption: `UGC-style video: ${theme}`, status: "draft" },
  });
}

/** Builds a month of draft posts (not scheduled, not published). */
export async function planMonth(year: number, monthIndex: number, focus = "") {
  const days = new Date(year, monthIndex + 1, 0).getDate();
  const brand = await getBrandContext();
  const raw = await getLLM().complete({
    task: "calendar",
    json: true,
    system: SYSTEM,
    prompt: `${brand}\n\nPlan Instagram posts for days=${days} of ${year}-${monthIndex + 1}. Focus: ${focus || "general, include festivals"}. Reply ONLY JSON array [{day,theme,caption,hashtags}].`,
  });
  const entries = parseJson<{ day: number; theme: string; caption: string; hashtags: string }[]>(raw, []);
  const created = [];
  for (const entry of entries) {
    const day = Math.min(Math.max(1, Number(entry.day) || 1), days);
    created.push(await db.contentItem.create({
      data: {
        kind: "post", theme: entry.theme, caption: entry.caption, hashtags: entry.hashtags ?? "",
        mediaUrl: await getImageProvider().generate(entry.theme),
        scheduledFor: new Date(year, monthIndex, day, 10, 0, 0), status: "draft",
      },
    }));
  }
  return created;
}

/** Owner asks to publish/schedule: this only creates an approval request. */
export async function submitForPublishing(contentId: string, scheduledFor?: Date | null) {
  const content = await db.contentItem.findUniqueOrThrow({ where: { id: contentId } });
  if (!["draft", "rejected", "failed"].includes(content.status)) throw new Error(`Content is already ${content.status}`);
  await db.contentItem.update({
    where: { id: contentId },
    data: { status: "pending_approval", ...(scheduledFor ? { scheduledFor } : {}) },
  });
  return requestApproval({
    type: "publish_post",
    title: `Publish: ${content.theme ?? content.caption.slice(0, 40)}`,
    payload: { contentId },
  });
}

/** Called only from the approval gate. Future-dated posts are scheduled, others publish now. */
export async function approvePost(contentId: string, editedCaption?: string): Promise<string> {
  const content = await db.contentItem.update({
    where: { id: contentId },
    data: { status: "approved", ...(editedCaption ? { caption: editedCaption } : {}) },
  });
  if (content.scheduledFor && content.scheduledFor.getTime() > Date.now()) {
    await db.contentItem.update({ where: { id: contentId }, data: { status: "scheduled" } });
    return `Scheduled for ${content.scheduledFor.toISOString()}`;
  }
  return publishNow(contentId);
}

export async function publishNow(contentId: string): Promise<string> {
  const content = await db.contentItem.findUniqueOrThrow({ where: { id: contentId } });
  if (!["approved", "scheduled"].includes(content.status)) throw new Error("Only approved content can be published");
  let externalId: string;
  try {
    ({ externalId } = await getInstagram().publish({
      caption: `${content.caption}\n\n${content.hashtags}`.trim(),
      mediaUrl: content.mediaUrl,
    }));
  } catch (error) {
    // Do not leave it "approved"/"scheduled": the scheduler would retry forever and the owner could not resubmit.
    await db.contentItem.update({ where: { id: contentId }, data: { status: "failed" } });
    throw error;
  }
  await db.contentItem.update({ where: { id: contentId }, data: { status: "published", publishedAt: new Date(), externalId } });
  await recordMetric("content", contentId);
  return `Published (${externalId})`;
}

/** Publishes approved posts whose time has come. Never touches unapproved content. */
export async function publishDueContent(now = new Date()) {
  const due = await db.contentItem.findMany({ where: { status: "scheduled", scheduledFor: { lte: now } } });
  const results: string[] = [];
  for (const item of due) {
    try { results.push(await publishNow(item.id)); }
    catch (error) { results.push(`Failed ${item.id}: ${error instanceof Error ? error.message : error}`); }
  }
  return results;
}

const EDITABLE_STATUSES = ["draft", "rejected", "failed"];

/** Edits a post that is not waiting for approval or already live. */
export async function updateDraft(contentId: string, changes: { caption?: string; hashtags?: string; scheduledFor?: Date | null }) {
  const content = await db.contentItem.findUniqueOrThrow({ where: { id: contentId } });
  if (!EDITABLE_STATUSES.includes(content.status)) throw new Error(`A ${content.status} post cannot be edited`);
  return db.contentItem.update({
    where: { id: contentId },
    data: {
      ...(changes.caption !== undefined ? { caption: changes.caption } : {}),
      ...(changes.hashtags !== undefined ? { hashtags: changes.hashtags } : {}),
      ...(changes.scheduledFor !== undefined ? { scheduledFor: changes.scheduledFor } : {}),
      // An edited rejected or failed post goes back to being a draft.
      status: "draft",
    },
  });
}

export async function deleteDraft(contentId: string) {
  const content = await db.contentItem.findUniqueOrThrow({ where: { id: contentId } });
  if (!EDITABLE_STATUSES.includes(content.status)) throw new Error(`A ${content.status} post cannot be deleted`);
  await db.contentItem.delete({ where: { id: contentId } });
}
