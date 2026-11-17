import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { realWhatsApp, normalizePhone } from "@/lib/integrations/real";
import { mockWhatsApp, sentLog } from "@/lib/integrations/mock";
import { handleIncoming } from "@/lib/customer";

const savedEnv = { ...process.env };
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const key of ["WHATSAPP_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_TEMPLATE_NAME", "WHATSAPP_TEMPLATE_LANGUAGE"]) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

function stubFetch(responses: { status: number; json: unknown }[]) {
  const calls: { url: string; body: any; headers: any }[] = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init.body)), headers: init.headers });
    const next = responses[Math.min(calls.length - 1, responses.length - 1)];
    return new Response(JSON.stringify(next.json), { status: next.status });
  });
  return calls;
}

describe("real WhatsApp adapter", () => {
  beforeEach(() => {
    process.env.WHATSAPP_TOKEN = "tok";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "123";
  });

  it("normalises phone numbers to digits only", () => {
    expect(normalizePhone("+91 98765-43210")).toBe("919876543210");
  });

  it("sends a text message with the right URL, auth and number format", async () => {
    const calls = stubFetch([{ status: 200, json: { messages: [{ id: "wamid.1" }] } }]);
    const result = await realWhatsApp.send({ to: "+91 98765 43210", body: "Hello" });
    expect(result.externalId).toBe("wamid.1");
    expect(calls[0].url).toContain("/123/messages");
    expect(calls[0].headers.Authorization).toBe("Bearer tok");
    expect(calls[0].body).toMatchObject({ messaging_product: "whatsapp", to: "919876543210", type: "text", text: { body: "Hello" } });
  });

  it("throws Meta's error message instead of pretending the message was sent", async () => {
    stubFetch([{ status: 400, json: { error: { message: "Re-engagement message" } } }]);
    await expect(realWhatsApp.send({ to: "1", body: "x" })).rejects.toThrow(/Re-engagement message/);
  });

  it("refuses to broadcast without an approved template", async () => {
    delete process.env.WHATSAPP_TEMPLATE_NAME;
    const calls = stubFetch([{ status: 200, json: { messages: [{ id: "x" }] } }]);
    await expect(realWhatsApp.broadcast({ recipients: ["1"], body: "Sale" })).rejects.toThrow(/WHATSAPP_TEMPLATE_NAME/);
    expect(calls).toHaveLength(0);
  });

  it("broadcasts as a template with the message as the variable", async () => {
    process.env.WHATSAPP_TEMPLATE_NAME = "festive_offer";
    const calls = stubFetch([{ status: 200, json: { messages: [{ id: "x" }] } }]);
    const result = await realWhatsApp.broadcast({ recipients: ["+911", "+912"], body: "Diwali sale" });
    expect(result.sent).toBe(2);
    expect(calls[0].body.type).toBe("template");
    expect(calls[0].body.template).toMatchObject({ name: "festive_offer", language: { code: "en" } });
    expect(calls[0].body.template.components[0].parameters[0].text).toBe("Diwali sale");
  });

  it("counts partial failures and fails loudly only if every recipient failed", async () => {
    process.env.WHATSAPP_TEMPLATE_NAME = "t";
    stubFetch([{ status: 200, json: { messages: [{ id: "a" }] } }, { status: 400, json: { error: { message: "bad number" } } }]);
    expect((await realWhatsApp.broadcast({ recipients: ["1", "2"], body: "x" })).sent).toBe(1);
    stubFetch([{ status: 400, json: { error: { message: "bad number" } } }]);
    await expect(realWhatsApp.broadcast({ recipients: ["1", "2"], body: "x" })).rejects.toThrow(/bad number/);
  });

  it("reports missing credentials clearly", async () => {
    delete process.env.WHATSAPP_TOKEN;
    await expect(realWhatsApp.send({ to: "1", body: "x" })).rejects.toThrow(/WHATSAPP_TOKEN/);
  });
});

describe("delivery failures in the inbox", () => {
  beforeAll(async () => {
    await db.business.upsert({ where: { id: "default" }, update: {}, create: { id: "default", name: "T", type: "t" } });
  });
  beforeEach(async () => {
    await db.message.deleteMany();
    await db.conversation.deleteMany();
    await db.lead.deleteMany();
    await db.contact.deleteMany();
    await db.business.update({ where: { id: "default" }, data: { autoReply: true } });
    sentLog.length = 0;
  });

  it("a failed WhatsApp send does not throw, marks the message failed and flags the conversation for the owner", async () => {
    vi.spyOn(mockWhatsApp, "send").mockRejectedValueOnce(new Error("outside 24h window"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await handleIncoming({ channel: "whatsapp", handle: "55", body: "Price?" });
    expect(result.replied).toBe(false);
    expect(result.escalated).toBe(true);
    const outgoing = await db.message.findFirstOrThrow({ where: { direction: "out" } });
    expect(outgoing.status).toBe("failed");
    expect((await db.conversation.findFirstOrThrow()).needsOwner).toBe(true);
  });
});
