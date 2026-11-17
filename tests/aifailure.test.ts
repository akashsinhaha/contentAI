import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { handleIncoming } from "@/lib/customer";
import { mockLLM } from "@/lib/ai/mock";
import { sentLog } from "@/lib/integrations/mock";

afterEach(() => vi.restoreAllMocks());

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

describe("AI failures do not break the inbox", () => {
  it("when the AI call throws, the customer message is kept, the owner is flagged, and nothing is sent or thrown", async () => {
    vi.spyOn(mockLLM, "complete").mockRejectedValueOnce(new Error("401 invalid x-api-key"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await handleIncoming({ channel: "whatsapp", handle: "77", body: "Do you have cake?" });
    expect(result).toMatchObject({ replied: false, escalated: true });
    expect(sentLog).toHaveLength(0);
    expect(await db.message.count({ where: { direction: "in" } })).toBe(1);
    expect(await db.message.count({ where: { direction: "out" } })).toBe(0);
    expect((await db.conversation.findFirstOrThrow()).needsOwner).toBe(true);
  });

  it("an empty AI reply is never sent to the customer", async () => {
    vi.spyOn(mockLLM, "complete").mockResolvedValueOnce("   ");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await handleIncoming({ channel: "whatsapp", handle: "78", body: "Hi" });
    expect(result.replied).toBe(false);
    expect(sentLog).toHaveLength(0);
  });
});
