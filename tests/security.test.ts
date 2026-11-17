import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createHmac } from "crypto";
import { db } from "@/lib/db";
import { createSessionToken, verifySessionToken, passwordMatches, authMode, safeEqual } from "@/lib/auth";
import { isValidMetaSignature } from "@/lib/webhookSecurity";
import { isSafePublicHost } from "@/lib/brand/learn";
import { generatePost, submitForPublishing, updateDraft, deleteDraft } from "@/lib/content";
import { decideAction } from "@/lib/approval";
import * as whatsappWebhook from "@/app/api/webhooks/whatsapp/route";
import * as cronRoute from "@/app/api/cron/route";
import { sentLog } from "@/lib/integrations/mock";

const originalEnv = { ...process.env };
afterEach(() => {
  for (const key of ["OWNER_PASSWORD", "AUTH_SECRET", "META_APP_SECRET", "CRON_SECRET", "INTEGRATIONS_MODE"]) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
  (process.env as Record<string, string>).NODE_ENV = originalEnv.NODE_ENV ?? "test";
});

beforeAll(async () => {
  await db.business.upsert({ where: { id: "default" }, update: {}, create: { id: "default", name: "Test Bakery", type: "bakery" } });
});

beforeEach(async () => {
  await db.pendingAction.deleteMany();
  await db.metric.deleteMany();
  await db.contentItem.deleteMany();
  await db.message.deleteMany();
  await db.conversation.deleteMany();
  await db.lead.deleteMany();
  await db.contact.deleteMany();
  sentLog.length = 0;
});

describe("owner login", () => {
  it("is open in development without a password, locked in production without one", () => {
    delete process.env.OWNER_PASSWORD;
    (process.env as Record<string, string>).NODE_ENV = "development";
    expect(authMode()).toBe("open");
    (process.env as Record<string, string>).NODE_ENV = "production";
    expect(authMode()).toBe("locked");
    process.env.OWNER_PASSWORD = "pw";
    expect(authMode()).toBe("password");
  });

  it("accepts the right password and rejects wrong, empty and prefix guesses", async () => {
    process.env.OWNER_PASSWORD = "correct horse";
    expect(await passwordMatches("correct horse")).toBe(true);
    expect(await passwordMatches("correct hors")).toBe(false);
    expect(await passwordMatches("")).toBe(false);
    delete process.env.OWNER_PASSWORD;
    expect(await passwordMatches("")).toBe(false);
  });

  it("session tokens verify, expire, and cannot be forged or reused after the password changes", async () => {
    process.env.OWNER_PASSWORD = "pw1";
    const token = await createSessionToken();
    expect(await verifySessionToken(token)).toBe(true);
    expect(await verifySessionToken(token, Date.now() + 8 * 24 * 3600 * 1000)).toBe(false);
    expect(await verifySessionToken(undefined)).toBe(false);
    expect(await verifySessionToken("garbage")).toBe(false);
    const [expires] = token.split(".");
    expect(await verifySessionToken(`${Number(expires) + 100000}.${token.split(".")[1]}`)).toBe(false);
    process.env.OWNER_PASSWORD = "pw2";
    expect(await verifySessionToken(token)).toBe(false);
  });

  it("safeEqual compares correctly for different lengths", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abcd")).toBe(false);
    expect(safeEqual("", "")).toBe(true);
  });
});

describe("webhook signatures", () => {
  const body = JSON.stringify({ entry: [{ changes: [{ value: { messages: [{ from: "91", type: "text", text: { body: "Hi, price?" } }] } }] }] });
  const sign = (secret: string, payload: string) => `sha256=${createHmac("sha256", secret).update(payload).digest("hex")}`;

  it("validates good signatures and rejects tampered, missing and malformed ones", () => {
    expect(isValidMetaSignature(body, sign("s", body), "s")).toBe(true);
    expect(isValidMetaSignature(body + " ", sign("s", body), "s")).toBe(false);
    expect(isValidMetaSignature(body, sign("other", body), "s")).toBe(false);
    expect(isValidMetaSignature(body, null, "s")).toBe(false);
    expect(isValidMetaSignature(body, "sha256=abc", "s")).toBe(false);
    expect(isValidMetaSignature(body, "md5=" + "0".repeat(64), "s")).toBe(false);
  });

  it("with an app secret set, unsigned and badly signed posts are refused and nothing is processed", async () => {
    process.env.META_APP_SECRET = "s";
    const unsigned = await whatsappWebhook.POST(new Request("http://x/api", { method: "POST", body }));
    expect(unsigned.status).toBe(401);
    const bad = await whatsappWebhook.POST(new Request("http://x/api", { method: "POST", body, headers: { "x-hub-signature-256": sign("wrong", body) } }));
    expect(bad.status).toBe(401);
    expect(await db.message.count()).toBe(0);
  });

  it("a correctly signed post is processed", async () => {
    process.env.META_APP_SECRET = "s";
    const response = await whatsappWebhook.POST(new Request("http://x/api", { method: "POST", body, headers: { "x-hub-signature-256": sign("s", body) } }));
    expect(response.status).toBe(200);
    expect(await db.message.count({ where: { direction: "in" } })).toBe(1);
  });

  it("real mode without an app secret refuses webhooks instead of trusting them", async () => {
    delete process.env.META_APP_SECRET;
    process.env.INTEGRATIONS_MODE = "real";
    const response = await whatsappWebhook.POST(new Request("http://x/api", { method: "POST", body }));
    expect(response.status).toBe(503);
    expect(await db.message.count()).toBe(0);
  });
});

describe("cron endpoint", () => {
  it("requires the bearer secret when one is set", async () => {
    process.env.CRON_SECRET = "cron-secret";
    expect((await cronRoute.POST(new Request("http://x/api/cron", { method: "POST" }))).status).toBe(401);
    expect((await cronRoute.POST(new Request("http://x/api/cron", { method: "POST", headers: { authorization: "Bearer nope" } }))).status).toBe(401);
    const ok = await cronRoute.POST(new Request("http://x/api/cron", { method: "POST", headers: { authorization: "Bearer cron-secret" } }));
    expect(ok.status).toBe(200);
  });

  it("is disabled in production when no secret is configured", async () => {
    delete process.env.CRON_SECRET;
    (process.env as Record<string, string>).NODE_ENV = "production";
    expect((await cronRoute.POST(new Request("http://x/api/cron", { method: "POST" }))).status).toBe(503);
  });
});

describe("safe website fetching", () => {
  const resolvesTo = (...addresses: string[]) => async () => addresses.map((address) => ({ address }));

  it("allows names that resolve only to public addresses", async () => {
    expect(await isSafePublicHost("example.com", resolvesTo("93.184.216.34"))).toBe(true);
  });

  it("refuses public-looking names that resolve to internal addresses, even if only one record is internal", async () => {
    expect(await isSafePublicHost("evil.example", resolvesTo("127.0.0.1"))).toBe(false);
    expect(await isSafePublicHost("evil.example", resolvesTo("93.184.216.34", "10.0.0.8"))).toBe(false);
    expect(await isSafePublicHost("evil.example", resolvesTo("::ffff:169.254.169.254"))).toBe(false);
    expect(await isSafePublicHost("evil.example", resolvesTo("fd00::1"))).toBe(false);
  });

  it("refuses names that do not resolve or resolve to nothing", async () => {
    expect(await isSafePublicHost("nxdomain.example", async () => { throw new Error("ENOTFOUND"); })).toBe(false);
    expect(await isSafePublicHost("empty.example", resolvesTo())).toBe(false);
  });

  it("refuses internal hostnames without even resolving them", async () => {
    let resolved = false;
    const spy = async () => { resolved = true; return [{ address: "93.184.216.34" }]; };
    expect(await isSafePublicHost("localhost", spy)).toBe(false);
    expect(await isSafePublicHost("printer.local", spy)).toBe(false);
    expect(resolved).toBe(false);
  });
});

describe("editing and deleting drafts", () => {
  it("edits caption, hashtags and date of a draft", async () => {
    const post = await generatePost("Cake");
    const when = new Date(Date.now() + 86400000);
    const updated = await updateDraft(post.id, { caption: "New caption", hashtags: "#new", scheduledFor: when });
    expect(updated.caption).toBe("New caption");
    expect(updated.hashtags).toBe("#new");
    expect(updated.scheduledFor!.getTime()).toBe(when.getTime());
  });

  it("cannot edit or delete a post that is waiting for approval, scheduled or published", async () => {
    const post = await generatePost("Cake");
    const action = await submitForPublishing(post.id);
    await expect(updateDraft(post.id, { caption: "sneaky" })).rejects.toThrow();
    await expect(deleteDraft(post.id)).rejects.toThrow();
    await decideAction(action.id, true);
    await expect(updateDraft(post.id, { caption: "sneaky" })).rejects.toThrow();
    await expect(deleteDraft(post.id)).rejects.toThrow();
    expect((await db.contentItem.findUniqueOrThrow({ where: { id: post.id } })).caption).not.toBe("sneaky");
  });

  it("an edited rejected post becomes a draft again and can be resubmitted", async () => {
    const post = await generatePost("Cake");
    const action = await submitForPublishing(post.id);
    await decideAction(action.id, false);
    await updateDraft(post.id, { caption: "Better caption" });
    expect((await db.contentItem.findUniqueOrThrow({ where: { id: post.id } })).status).toBe("draft");
    await expect(submitForPublishing(post.id)).resolves.toBeTruthy();
  });

  it("deletes a draft", async () => {
    const post = await generatePost("Cake");
    await deleteDraft(post.id);
    expect(await db.contentItem.count()).toBe(0);
  });
});
