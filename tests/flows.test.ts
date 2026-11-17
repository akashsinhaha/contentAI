import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { decideAction } from "@/lib/approval";
import { generatePost, submitForPublishing, publishDueContent } from "@/lib/content";
import { createCampaign } from "@/lib/campaigns";
import { handleIncoming, processDueFollowUps, handleCall } from "@/lib/customer";
import { getLLM } from "@/lib/ai";
import { chat } from "@/lib/agents/chat";
import { sentLog } from "@/lib/integrations/mock";

beforeAll(async () => {
  await db.business.upsert({ where: { id: "default" }, update: {}, create: { id: "default", name: "Test Bakery", type: "bakery" } });
});

beforeEach(async () => {
  await db.pendingAction.deleteMany();
  await db.contentItem.deleteMany();
  await db.campaign.deleteMany();
  await db.callLog.deleteMany();
  await db.message.deleteMany();
  await db.conversation.deleteMany();
  await db.lead.deleteMany();
  await db.contact.deleteMany();
  await db.business.update({ where: { id: "default" }, data: { autoReply: true, autoFollowUp: false } });
  sentLog.length = 0;
});

describe("approval gate", () => {
  it("never publishes before approval, publishes after approve", async () => {
    const post = await generatePost("Cake");
    const action = await submitForPublishing(post.id);
    expect((await db.contentItem.findUniqueOrThrow({ where: { id: post.id } })).status).toBe("pending_approval");
    await publishDueContent(new Date(Date.now() + 1e10));
    expect((await db.contentItem.findUniqueOrThrow({ where: { id: post.id } })).status).toBe("pending_approval");
    await decideAction(action.id, true);
    expect((await db.contentItem.findUniqueOrThrow({ where: { id: post.id } })).status).toBe("published");
  });

  it("future posts are scheduled on approval and published by the scheduler only when due", async () => {
    const post = await generatePost("Cake");
    const when = new Date(Date.now() + 3600000);
    const action = await submitForPublishing(post.id, when);
    await decideAction(action.id, true);
    expect((await db.contentItem.findUniqueOrThrow({ where: { id: post.id } })).status).toBe("scheduled");
    await publishDueContent(new Date());
    expect((await db.contentItem.findUniqueOrThrow({ where: { id: post.id } })).status).toBe("scheduled");
    await publishDueContent(new Date(when.getTime() + 1000));
    expect((await db.contentItem.findUniqueOrThrow({ where: { id: post.id } })).status).toBe("published");
  });

  it("rejection keeps content unpublished and an action cannot be decided twice", async () => {
    const post = await generatePost("Cake");
    const action = await submitForPublishing(post.id);
    await decideAction(action.id, false);
    expect((await db.contentItem.findUniqueOrThrow({ where: { id: post.id } })).status).toBe("rejected");
    await expect(decideAction(action.id, true)).rejects.toThrow();
  });

  it("campaigns stay pending until approved and WhatsApp goes only to opted-in contacts", async () => {
    await db.contact.createMany({ data: [
      { name: "A", channel: "whatsapp", handle: "1", optedIn: true },
      { name: "B", channel: "whatsapp", handle: "2", optedIn: false },
    ] });
    const campaign = await createCampaign({ channel: "whatsapp", name: "Diwali" });
    expect(campaign.status).toBe("pending_approval");
    expect(sentLog).toHaveLength(0);
    const action = await db.pendingAction.findFirstOrThrow({ where: { type: "launch_campaign" } });
    await decideAction(action.id, true);
    expect(sentLog.map((entry) => entry.to)).toEqual(["1"]);
    expect((await db.campaign.findUniqueOrThrow({ where: { id: campaign.id } })).status).toBe("live");
  });
});

describe("customer assistant", () => {
  it("replies to a normal enquiry and creates a lead", async () => {
    const result = await handleIncoming({ channel: "whatsapp", handle: "999", name: "Asha", body: "Do you have eggless cake?" });
    expect(result.replied).toBe(true);
    expect(sentLog).toHaveLength(1);
    expect(await db.lead.count()).toBe(1);
  });

  it("escalates complaints instead of replying", async () => {
    const result = await handleIncoming({ channel: "whatsapp", handle: "999", body: "I want a refund, this is a complaint" });
    expect(result.escalated).toBe(true);
    expect(result.replied).toBe(false);
    expect(sentLog).toHaveLength(0);
    expect((await db.conversation.findFirstOrThrow()).needsOwner).toBe(true);
  });

  it("queues due follow-ups for approval by default and sends them directly if the owner opted in", async () => {
    await handleIncoming({ channel: "whatsapp", handle: "777", name: "Ravi", body: "Price of cupcakes?" });
    sentLog.length = 0;
    const later = new Date(Date.now() + 30 * 3600000);
    expect(await processDueFollowUps(later)).toEqual({ queued: 1, sent: 0 });
    expect(sentLog).toHaveLength(0);
    expect(await processDueFollowUps(later)).toEqual({ queued: 0, sent: 0 }); // no duplicate
    await db.pendingAction.deleteMany();
    await db.business.update({ where: { id: "default" }, data: { autoFollowUp: true } });
    expect(await processDueFollowUps(later)).toEqual({ queued: 0, sent: 1 });
    expect(sentLog).toHaveLength(1);
  });

  it("logs a call, summary and lead", async () => {
    const call = await handleCall({ callerNumber: "555", callerName: "Meera", callerSays: "Birthday cake on Sunday" });
    expect(call.summary).toContain("Meera");
    expect(await db.lead.count()).toBe(1);
  });
});

describe("providers and chat", () => {
  it("selects providers and rejects unknown ones", () => {
    expect(getLLM("mock").name).toBe("mock");
    expect(getLLM("openai").name).toBe("openai");
    expect(getLLM("anthropic").name).toBe("anthropic");
    expect(() => getLLM("nope")).toThrow();
  });

  it("a festive campaign request in chat only creates drafts and approvals", async () => {
    await chat("marketing", "Plan a Diwali campaign");
    expect(await db.pendingAction.count({ where: { status: "pending", type: "launch_campaign" } })).toBe(1);
    expect(await db.contentItem.count({ where: { status: "published" } })).toBe(0);
    expect(sentLog).toHaveLength(0);
  });
});
