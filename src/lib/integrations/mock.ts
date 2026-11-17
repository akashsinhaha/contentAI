import type { InstagramPublisher, MetaAds, WhatsAppClient } from "./types";

const fakeId = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
export const sentLog: { to: string; body: string }[] = [];

export const mockInstagram: InstagramPublisher = {
  async publish() { return { externalId: fakeId("ig") }; },
};
export const mockMetaAds: MetaAds = {
  async launch() { return { externalId: fakeId("ad") }; },
  async insights() { return { impressions: Math.floor(Math.random() * 5000) + 500, clicks: Math.floor(Math.random() * 200) + 10 }; },
};
export const mockWhatsApp: WhatsAppClient = {
  async send({ to, body }) { sentLog.push({ to, body }); return { externalId: fakeId("wa") }; },
  async broadcast({ recipients, body }) { recipients.forEach((to) => sentLog.push({ to, body })); return { sent: recipients.length }; },
};
