import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { decideAction } from "@/lib/approval";
import { generatePost, submitForPublishing, planMonth, publishDueContent } from "@/lib/content";
import { createCampaign } from "@/lib/campaigns";
import { handleIncoming, processDueFollowUps, needsEscalation } from "@/lib/customer";
import { chat } from "@/lib/agents/chat";
import { parseJson } from "@/lib/ai";
import { fetchWebsiteText } from "@/lib/brand/learn";
import { sentLog } from "@/lib/integrations/mock";
import * as whatsappWebhook from "@/app/api/webhooks/whatsapp/route";
import * as instagramWebhook from "@/app/api/webhooks/instagram/route";

beforeAll(async () => {
  await db.business.upsert({ where: { id: "default" }, update: {}, create: { id: "default", name: "Test Bakery", type: "bakery" } });
});

beforeEach(async () => {
  await db.pendingAction.deleteMany();
  await db.metric.deleteMany();
  await db.contentItem.deleteMany();
  await db.campaign.deleteMany();
  await db.callLog.deleteMany();
  await db.message.deleteMany();
  await db.conversation.deleteMany();
  await db.lead.deleteMany();
  await db.contact.deleteMany();
  await db.business.update({
    where: { id: "default" },
    data: { autoReply: true, autoFollowUp: false, followUpCadenceHours: "24,72,168", escalationKeywords: "refund,complaint,angry,lawyer,cancel,wrong order" },
  });
  sentLog.length = 0;
});

describe("chat intent routing", () => {
  it("asking how last week's posts performed returns metrics and does not create a new post", async () => {
    const reply = await chat("marketing", "How did last week's posts perform?");
    expect(reply).toMatch(/impressions/i);
    expect(await db.contentItem.count()).toBe(0);
  });

  it("asking about campaign performance does not create a new campaign", async () => {
    const reply = await chat("marketing", "Show me my campaign performance");
    expect(reply).toMatch(/impressions/i);
    expect(await db.campaign.count()).toBe(0);
    expect(await db.pendingAction.count()).toBe(0);
  });

  it("a festive campaign request creates approvals only and sends nothing", async () => {
    await chat("marketing", "Plan a Diwali campaign");
    expect(await db.pendingAction.count({ where: { status: "pending" } })).toBeGreaterThan(0);
    expect(sentLog).toHaveLength(0);
  });

  it("customer assistant summarises the inbox and lists leads", async () => {
    await handleIncoming({ channel: "whatsapp", handle: "1", name: "Asha", body: "Price of cake?" });
    expect(await chat("customer", "Summarise my inbox")).toMatch(/1 conversations/);
    expect(await chat("customer", "Show open leads")).toContain("Asha");
  });

  it("unknown requests get a helpful answer instead of an error", async () => {
    expect(await chat("marketing", "asdf qwerty")).toMatch(/Try:/);
  });
});

describe("escalation and replies", () => {
  it("after a complaint the assistant stays silent until the owner replies", async () => {
    await handleIncoming({ channel: "whatsapp", handle: "9", body: "This is a complaint, wrong order" });
    sentLog.length = 0;
    const followUp = await handleIncoming({ channel: "whatsapp", handle: "9", body: "hello? anyone there" });
    expect(followUp.replied).toBe(false);
    expect(sentLog).toHaveLength(0);
  });

  it("does not reply when auto-reply is switched off but still records the lead", async () => {
    await db.business.update({ where: { id: "default" }, data: { autoReply: false } });
    const result = await handleIncoming({ channel: "whatsapp", handle: "5", body: "Price of cookies?" });
    expect(result.replied).toBe(false);
    expect(sentLog).toHaveLength(0);
    expect(await db.lead.count()).toBe(1);
  });

  it("keyword matching ignores case and empty keyword lists never escalate", () => {
    expect(needsEscalation("I want a REFUND", "refund")).toBe(true);
    expect(needsEscalation("anything", "")).toBe(false);
    expect(needsEscalation("anything", " , ,")).toBe(false);
  });

  it("repeat messages from one customer reuse the same contact, conversation and lead", async () => {
    await handleIncoming({ channel: "whatsapp", handle: "7", body: "Hi" });
    await handleIncoming({ channel: "whatsapp", handle: "7", body: "Price?" });
    expect(await db.contact.count()).toBe(1);
    expect(await db.conversation.count()).toBe(1);
    expect(await db.lead.count()).toBe(1);
  });

  it("the same handle on whatsapp and instagram stays two separate contacts", async () => {
    await handleIncoming({ channel: "whatsapp", handle: "same", body: "Hi" });
    await handleIncoming({ channel: "instagram", handle: "same", body: "Hi" });
    expect(await db.contact.count()).toBe(2);
  });
});

describe("lead follow-ups", () => {
  it("a rejected follow-up is not queued again on the next scheduler run", async () => {
    await handleIncoming({ channel: "whatsapp", handle: "8", name: "Ravi", body: "Price of cupcakes?" });
    const later = new Date(Date.now() + 30 * 3600000);
    await processDueFollowUps(later);
    const action = await db.pendingAction.findFirstOrThrow({ where: { type: "send_followup" } });
    await decideAction(action.id, false);
    const second = await processDueFollowUps(later);
    expect(second.queued).toBe(0);
    expect(await db.pendingAction.count({ where: { status: "pending" } })).toBe(0);
  });

  it("an approved follow-up is sent and the next one is scheduled", async () => {
    await handleIncoming({ channel: "whatsapp", handle: "8", name: "Ravi", body: "Price of cupcakes?" });
    sentLog.length = 0;
    await processDueFollowUps(new Date(Date.now() + 30 * 3600000));
    const action = await db.pendingAction.findFirstOrThrow({ where: { type: "send_followup" } });
    await decideAction(action.id, true, { body: "Edited follow-up text" });
    expect(sentLog.map((entry) => entry.body)).toEqual(["Edited follow-up text"]);
    const lead = await db.lead.findFirstOrThrow();
    expect(lead.followUpCount).toBe(1);
    expect(lead.stage).toBe("contacted");
    expect(lead.nextFollowUpAt!.getTime()).toBeGreaterThan(Date.now() + 40 * 3600000);
  });

  it("won and lost leads are never followed up", async () => {
    await handleIncoming({ channel: "whatsapp", handle: "8", body: "Price?" });
    await db.lead.updateMany({ data: { stage: "won" } });
    expect(await processDueFollowUps(new Date(Date.now() + 1e10))).toEqual({ queued: 0, sent: 0 });
  });

  it("follow-ups stop after the configured cadence is used up", async () => {
    await db.business.update({ where: { id: "default" }, data: { autoFollowUp: true, followUpCadenceHours: "1,2" } });
    await handleIncoming({ channel: "whatsapp", handle: "8", body: "Price?" });
    sentLog.length = 0;
    let clock = Date.now();
    for (let round = 0; round < 5; round++) {
      clock += 24 * 3600000;
      await processDueFollowUps(new Date(clock));
    }
    expect(sentLog).toHaveLength(2);
    expect((await db.lead.findFirstOrThrow()).nextFollowUpAt).toBeNull();
  });

  it("garbage cadence settings do not crash or spam", async () => {
    await db.business.update({ where: { id: "default" }, data: { followUpCadenceHours: "abc,,-5" } });
    await handleIncoming({ channel: "whatsapp", handle: "8", body: "Price?" });
    expect(await processDueFollowUps(new Date(Date.now() + 1e10))).toEqual({ queued: 0, sent: 0 });
  });
});

describe("publishing and approvals", () => {
  it("edits made while approving replace the caption that gets published", async () => {
    const post = await generatePost("Cake");
    const action = await submitForPublishing(post.id);
    await decideAction(action.id, true, { caption: "Owner edited caption" });
    const saved = await db.contentItem.findUniqueOrThrow({ where: { id: post.id } });
    expect(saved.caption).toBe("Owner edited caption");
    expect(saved.status).toBe("published");
  });

  it("a failed publish marks the action failed and lets the owner resubmit the post", async () => {
    const post = await generatePost("Cake");
    const action = await submitForPublishing(post.id);
    process.env.INTEGRATIONS_MODE = "real"; // real Instagram rejects the mock data-URI image
    try {
      await decideAction(action.id, true);
    } finally {
      process.env.INTEGRATIONS_MODE = "mock";
    }
    expect((await db.pendingAction.findUniqueOrThrow({ where: { id: action.id } })).status).toBe("failed");
    const saved = await db.contentItem.findUniqueOrThrow({ where: { id: post.id } });
    expect(saved.status).not.toBe("published");
    await expect(submitForPublishing(post.id)).resolves.toBeTruthy();
  });

  it("a post cannot be submitted twice or published while still a draft", async () => {
    const post = await generatePost("Cake");
    await submitForPublishing(post.id);
    await expect(submitForPublishing(post.id)).rejects.toThrow();
    await db.contentItem.update({ where: { id: post.id }, data: { status: "draft", scheduledFor: new Date(Date.now() - 1000) } });
    await publishDueContent(new Date());
    expect((await db.contentItem.findUniqueOrThrow({ where: { id: post.id } })).status).toBe("draft");
  });

  it("deciding an unknown action fails cleanly", async () => {
    await expect(decideAction("does-not-exist", true)).rejects.toThrow(/not found/i);
  });

  it("two simultaneous approvals run the action only once", async () => {
    const post = await generatePost("Cake");
    const action = await submitForPublishing(post.id);
    const results = await Promise.allSettled([decideAction(action.id, true), decideAction(action.id, true)]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(await db.contentItem.count({ where: { status: "published" } })).toBe(1);
  });
});

describe("campaigns", () => {
  it("an edited message is what gets broadcast and rejected campaigns send nothing", async () => {
    await db.contact.create({ data: { name: "A", channel: "whatsapp", handle: "1" } });
    await createCampaign({ channel: "whatsapp", name: "Holi" });
    const action = await db.pendingAction.findFirstOrThrow({ where: { type: "launch_campaign" } });
    await decideAction(action.id, true, { message: "Owner approved text" });
    expect(sentLog.map((entry) => entry.body)).toEqual(["Owner approved text"]);

    sentLog.length = 0;
    await createCampaign({ channel: "whatsapp", name: "Eid" });
    const second = await db.pendingAction.findFirstOrThrow({ where: { type: "launch_campaign", status: "pending" } });
    await decideAction(second.id, false);
    expect(sentLog).toHaveLength(0);
    expect((await db.campaign.findFirstOrThrow({ where: { name: "Eid" } })).status).toBe("rejected");
  });

  it("a Meta ad campaign goes live only after approval and records metrics", async () => {
    const campaign = await createCampaign({ channel: "meta_ad", name: "Ad", budget: 500, audience: "Locals" });
    expect(campaign.status).toBe("pending_approval");
    const action = await db.pendingAction.findFirstOrThrow({ where: { type: "launch_campaign" } });
    await decideAction(action.id, true);
    const live = await db.campaign.findUniqueOrThrow({ where: { id: campaign.id } });
    expect(live.status).toBe("live");
    expect(live.externalId).toBeTruthy();
    expect(await db.metric.count({ where: { refId: campaign.id } })).toBe(1);
  });

  it("a campaign message drafted by the AI is plain text, not JSON", async () => {
    const campaign = await createCampaign({ channel: "whatsapp", name: "Diwali" });
    expect(campaign.message.trim().startsWith("{")).toBe(false);
    expect(campaign.message.length).toBeGreaterThan(0);
  });

  it("a WhatsApp campaign with nobody opted in is not marked live", async () => {
    await db.contact.create({ data: { name: "A", channel: "whatsapp", handle: "1", optedIn: false } });
    const campaign = await createCampaign({ channel: "whatsapp", name: "Diwali" });
    const action = await db.pendingAction.findFirstOrThrow({ where: { type: "launch_campaign" } });
    await decideAction(action.id, true);
    expect((await db.pendingAction.findUniqueOrThrow({ where: { id: action.id } })).status).toBe("failed");
    expect((await db.campaign.findUniqueOrThrow({ where: { id: campaign.id } })).status).not.toBe("live");
  });
});

describe("content calendar", () => {
  it.each([
    [2026, 1, 28],
    [2028, 1, 29],
    [2026, 11, 31],
  ])("plans only dates inside the month for %i month index %i", async (year, monthIndex, days) => {
    const items = await planMonth(year, monthIndex);
    expect(items.length).toBeGreaterThan(5);
    for (const item of items) {
      expect(item.scheduledFor!.getFullYear()).toBe(year);
      expect(item.scheduledFor!.getMonth()).toBe(monthIndex);
      expect(item.scheduledFor!.getDate()).toBeLessThanOrEqual(days);
    }
    expect(items.every((item) => item.status === "draft")).toBe(true);
  });

  it("generated captions talk about the requested theme, not the prompt scaffolding", async () => {
    const post = await generatePost("Eggless chocolate cake");
    expect(post.caption).toContain("Eggless chocolate cake");
    expect(post.caption).not.toContain("Voice:");
  });

  it("planned posts are never published by the scheduler without approval", async () => {
    await planMonth(2020, 0);
    expect(await publishDueContent(new Date())).toEqual([]);
    expect(await db.contentItem.count({ where: { status: "published" } })).toBe(0);
  });
});

describe("webhooks", () => {
  it("whatsapp verification accepts the right token and rejects the wrong or missing one", async () => {
    process.env.WEBHOOK_VERIFY_TOKEN = "secret";
    const ok = await whatsappWebhook.GET(new Request("http://x/api?hub.mode=subscribe&hub.verify_token=secret&hub.challenge=abc"));
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe("abc");
    expect((await whatsappWebhook.GET(new Request("http://x/api?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=abc"))).status).toBe(403);
    expect((await whatsappWebhook.GET(new Request("http://x/api"))).status).toBe(403);
  });

  it("verification is refused when no verify token is configured", async () => {
    delete process.env.WEBHOOK_VERIFY_TOKEN;
    const response = await whatsappWebhook.GET(new Request("http://x/api?hub.mode=subscribe&hub.verify_token=&hub.challenge=abc"));
    expect(response.status).toBe(403);
  });

  it("an inbound whatsapp text creates a conversation and a reply; non-text messages are ignored", async () => {
    const payload = { entry: [{ changes: [{ value: { contacts: [{ profile: { name: "Asha" } }], messages: [
      { from: "9199", type: "text", text: { body: "Hi, price of cake?" } },
      { from: "9199", type: "image" },
    ] } }] }] };
    const response = await whatsappWebhook.POST(new Request("http://x/api", { method: "POST", body: JSON.stringify(payload) }));
    expect(response.status).toBe(200);
    expect(await db.message.count({ where: { direction: "in" } })).toBe(1);
    expect(sentLog).toHaveLength(1);
  });

  it("malformed webhook bodies get a 400 instead of crashing", async () => {
    const whatsapp = await whatsappWebhook.POST(new Request("http://x/api", { method: "POST", body: "not json" }));
    expect(whatsapp.status).toBe(400);
    const instagram = await instagramWebhook.POST(new Request("http://x/api", { method: "POST", body: "not json" }));
    expect(instagram.status).toBe(400);
  });

  it("instagram echoes of our own messages are ignored", async () => {
    const payload = { entry: [{ messaging: [
      { sender: { id: "u1" }, message: { text: "hello", is_echo: true } },
      { sender: { id: "u2" }, message: { text: "hello" } },
    ] }] };
    await instagramWebhook.POST(new Request("http://x/api", { method: "POST", body: JSON.stringify(payload) }));
    expect(await db.contact.count()).toBe(1);
    expect((await db.contact.findFirstOrThrow()).handle).toBe("u2");
  });
});

describe("brand learning safety and parsing", () => {
  it("does not fetch non-http URLs or internal addresses", async () => {
    expect(await fetchWebsiteText("file:///etc/passwd")).toBe("");
    expect(await fetchWebsiteText("not a url")).toBe("");
    for (const url of ["http://127.0.0.1:1/", "http://localhost:1/", "http://169.254.169.254/latest/meta-data", "http://10.0.0.5/", "http://[::1]/"]) {
      let fetched = false;
      const realFetch = globalThis.fetch;
      globalThis.fetch = (async () => { fetched = true; return new Response("secret"); }) as typeof fetch;
      try {
        expect(await fetchWebsiteText(url)).toBe("");
      } finally {
        globalThis.fetch = realFetch;
      }
      expect(fetched, `must not request ${url}`).toBe(false);
    }
  });

  it("parseJson copes with code fences, prose and garbage", () => {
    expect(parseJson('```json\n{"a":1}\n```', {})).toEqual({ a: 1 });
    expect(parseJson('Sure! [1,2,3] hope that helps', [])).toEqual([1, 2, 3]);
    expect(parseJson("no json here", { fallback: true })).toEqual({ fallback: true });
    expect(parseJson("{broken", { fallback: true })).toEqual({ fallback: true });
  });
});
