import { db } from "@/lib/db";
import { getLLM } from "@/lib/ai";
import { getBrandContext } from "@/lib/brand/learn";
import { requestApproval } from "@/lib/approval";
import { getWhatsApp } from "@/lib/integrations";

export type Channel = "whatsapp" | "instagram";

const REPLY_SYSTEM =
  "You are the customer assistant for a small business. Reply briefly in the brand voice. Never invent prices, stock or promises: " +
  "if unsure, say the owner will confirm. Do not discuss refunds or complaints; hand those to the owner.";

function nextFollowUpDate(cadenceHours: string, followUpCount: number, from = new Date()): Date | null {
  const hours = cadenceHours.split(",").map((value) => Number(value.trim())).filter((value) => value > 0);
  if (followUpCount >= hours.length) return null;
  return new Date(from.getTime() + hours[followUpCount] * 3600000);
}

export function needsEscalation(text: string, keywords: string): boolean {
  const lower = text.toLowerCase();
  return keywords.split(",").map((word) => word.trim().toLowerCase()).filter(Boolean).some((word) => lower.includes(word));
}

async function deliver(channel: string, handle: string, body: string) {
  // WhatsApp goes through the adapter. Instagram DM sending uses the same Meta messaging API; the mock records it only.
  if (channel === "whatsapp") await getWhatsApp().send({ to: handle, body });
}

/** Entry point for webhooks and the simulator. */
export async function handleIncoming(input: { channel: Channel; handle: string; name?: string; body: string }) {
  const business = await db.business.findUniqueOrThrow({ where: { id: "default" } });
  const contact = await db.contact.upsert({
    where: { channel_handle: { channel: input.channel, handle: input.handle } },
    update: {},
    create: { channel: input.channel, handle: input.handle, name: input.name ?? input.handle },
  });
  let conversation = await db.conversation.findFirst({ where: { contactId: contact.id, channel: input.channel } });
  conversation ??= await db.conversation.create({ data: { contactId: contact.id, channel: input.channel } });

  const alreadyWaitingForOwner = conversation.needsOwner;
  await db.message.create({ data: { conversationId: conversation.id, direction: "in", sender: "customer", body: input.body } });

  // Every inbound contact becomes a lead we can follow up with.
  let lead = await db.lead.findFirst({ where: { contactId: contact.id, stage: { notIn: ["won", "lost"] } } });
  lead ??= await db.lead.create({
    data: { contactId: contact.id, source: input.channel, interest: input.body.slice(0, 120), nextFollowUpAt: nextFollowUpDate(business.followUpCadenceHours, 0) },
  });

  // Once a conversation was handed to the owner, the assistant stays quiet until the owner replies.
  if (alreadyWaitingForOwner) {
    return { replied: false, escalated: true, reply: null };
  }
  if (needsEscalation(input.body, business.escalationKeywords)) {
    await db.conversation.update({ where: { id: conversation.id }, data: { needsOwner: true } });
    return { replied: false, escalated: true, reply: null };
  }
  if (!business.autoReply) {
    return { replied: false, escalated: false, reply: null };
  }

  const history = await db.message.findMany({ where: { conversationId: conversation.id }, orderBy: { createdAt: "desc" }, take: 8 });
  const transcript = history.reverse().map((message) => `${message.sender}: ${message.body}`).join("\n");
  let reply: string;
  try {
    reply = (await getLLM().complete({
      task: "reply",
      system: REPLY_SYSTEM,
      prompt: `${await getBrandContext()}\n\nConversation:\n${transcript}\n\nWrite the next reply.`,
    })).trim();
    if (!reply) throw new Error("The AI returned an empty reply");
  } catch (error) {
    // A bad key, no credit or an outage must not crash the webhook (Meta would retry the same message endlessly).
    console.error("AI reply failed", error);
    await db.conversation.update({ where: { id: conversation.id }, data: { needsOwner: true } });
    return { replied: false, escalated: true, reply: null };
  }
  const outgoing = await db.message.create({ data: { conversationId: conversation.id, direction: "out", sender: "assistant", body: reply } });
  try {
    await deliver(input.channel, input.handle, reply);
  } catch (error) {
    // Do not fail the webhook: Meta would retry and the customer's message would be processed twice.
    console.error("Reply could not be delivered", error);
    await db.message.update({ where: { id: outgoing.id }, data: { status: "failed" } });
    await db.conversation.update({ where: { id: conversation.id }, data: { needsOwner: true } });
    return { replied: false, escalated: true, reply };
  }
  return { replied: true, escalated: false, reply };
}

/** Owner replies manually from the inbox. */
export async function ownerReply(conversationId: string, body: string) {
  const conversation = await db.conversation.findUniqueOrThrow({ where: { id: conversationId }, include: { contact: true } });
  await db.message.create({ data: { conversationId, direction: "out", sender: "owner", body } });
  await db.conversation.update({ where: { id: conversationId }, data: { needsOwner: false } });
  await deliver(conversation.channel, conversation.contact.handle, body);
}

/** Called only from the approval gate (or directly when the owner enabled auto follow-up). */
export async function sendFollowUp(leadId: string, body: string): Promise<string> {
  const lead = await db.lead.findUniqueOrThrow({ where: { id: leadId }, include: { contact: true } });
  const business = await db.business.findUniqueOrThrow({ where: { id: "default" } });
  let conversation = await db.conversation.findFirst({ where: { contactId: lead.contactId } });
  conversation ??= await db.conversation.create({ data: { contactId: lead.contactId, channel: lead.contact.channel } });
  await db.message.create({ data: { conversationId: conversation.id, direction: "out", sender: "assistant", body } });
  await deliver(lead.contact.channel, lead.contact.handle, body);
  const followUpCount = lead.followUpCount + 1;
  await db.lead.update({
    where: { id: leadId },
    data: { followUpCount, stage: lead.stage === "new" ? "contacted" : lead.stage, nextFollowUpAt: nextFollowUpDate(business.followUpCadenceHours, followUpCount) },
  });
  return `Follow-up sent to ${lead.contact.name}`;
}

/** The owner rejected a follow-up: skip it and move on to the next step of the cadence. */
export async function skipFollowUp(leadId: string) {
  const lead = await db.lead.findUnique({ where: { id: leadId } });
  if (!lead) return;
  const business = await db.business.findUniqueOrThrow({ where: { id: "default" } });
  const followUpCount = lead.followUpCount + 1;
  await db.lead.update({
    where: { id: leadId },
    data: { followUpCount, nextFollowUpAt: nextFollowUpDate(business.followUpCadenceHours, followUpCount) },
  });
}

/** Finds due leads and queues (or, if owner opted in, sends) follow-ups. */
export async function processDueFollowUps(now = new Date()) {
  const business = await db.business.findUniqueOrThrow({ where: { id: "default" } });
  const leads = await db.lead.findMany({
    where: { stage: { notIn: ["won", "lost"] }, nextFollowUpAt: { lte: now } },
    include: { contact: true },
  });
  let queued = 0;
  let sent = 0;
  for (const lead of leads) {
    const alreadyPending = await db.pendingAction.findFirst({ where: { type: "send_followup", status: "pending", payload: { contains: lead.id } } });
    if (alreadyPending) continue;
    const body = await getLLM().complete({
      task: "followup",
      system: REPLY_SYSTEM,
      prompt: `${await getBrandContext()}\n\nCustomer: ${lead.contact.name}. Interest: ${lead.interest}. This is follow-up number ${lead.followUpCount + 1}.`,
    });
    if (business.autoFollowUp) {
      await sendFollowUp(lead.id, body);
      sent++;
    } else {
      await requestApproval({ type: "send_followup", title: `Follow up with ${lead.contact.name}`, payload: { leadId: lead.id, body }, createdBy: "customer" });
      queued++;
    }
  }
  return { queued, sent };
}

/** Answers an incoming call (simulated text version): logs transcript, summary and captures a lead. */
export async function handleCall(input: { callerNumber: string; callerName?: string; callerSays: string }) {
  const greeting = await getLLM().complete({
    task: "call", system: REPLY_SYSTEM, prompt: `${await getBrandContext()}\n\nCaller says: ${input.callerSays}`,
  });
  const transcript = `Assistant: Hello, you have reached the business. The owner is unavailable, how can I help?\nCaller: ${input.callerSays}\nAssistant: ${greeting}`;
  const summary = `${input.callerName ?? input.callerNumber} called: "${input.callerSays.slice(0, 160)}". Callback requested.`;

  const contact = await db.contact.upsert({
    where: { channel_handle: { channel: "phone", handle: input.callerNumber } },
    update: {},
    create: { channel: "phone", handle: input.callerNumber, name: input.callerName ?? input.callerNumber },
  });
  const business = await db.business.findUniqueOrThrow({ where: { id: "default" } });
  let lead = await db.lead.findFirst({ where: { contactId: contact.id, stage: { notIn: ["won", "lost"] } } });
  lead ??= await db.lead.create({
    data: { contactId: contact.id, source: "phone", interest: input.callerSays.slice(0, 120), nextFollowUpAt: nextFollowUpDate(business.followUpCadenceHours, 0) },
  });
  return db.callLog.create({
    data: { callerNumber: input.callerNumber, callerName: input.callerName, transcript, summary, leadId: lead.id, callbackRequested: true },
  });
}
