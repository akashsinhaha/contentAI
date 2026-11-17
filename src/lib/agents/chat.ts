import { db } from "@/lib/db";
import { getLLM } from "@/lib/ai";
import { generatePost, planMonth } from "@/lib/content";
import { createCampaign } from "@/lib/campaigns";
import { getPerformance } from "@/lib/metrics";

export type AgentName = "marketing" | "customer";

/**
 * Chat for the two assistants. Intent routing is keyword based so it behaves the same with any AI provider
 * (including the offline mock). Write tools only create drafts and approval requests, never live actions.
 */
const FESTIVALS = ["diwali", "christmas", "eid", "holi", "valentine", "new year", "raksha bandhan", "onam", "pongal", "easter", "halloween", "black friday", "mother", "father", "independence", "navratri", "durga"];

async function marketingTool(message: string): Promise<string | null> {
  const lower = message.toLowerCase();
  const festival = FESTIVALS.find((name) => lower.includes(name));

  // Questions about results come first so "how did my posts perform" never creates new content.
  const asksForResults = /perform|metric|how did|how are|results|stats|insights/.test(lower);
  const asksToCreate = /(plan|create|launch|set up|draft|write|generate|make|run a)/.test(lower);
  if (asksForResults && !asksToCreate) {
    const days = /month|30/.test(lower) ? 30 : 7;
    const stats = await getPerformance(days);
    return `Last ${days} days: ${stats.published} posts published, ${stats.impressions} impressions, ${stats.engagements} engagements, ${stats.clicks} clicks, ${stats.campaignsLive} campaigns live.`;
  }
  if (/campaign|festive|festival|offer|promo|sale|broadcast/.test(lower) || festival) {
    const name = festival ? `${festival[0].toUpperCase()}${festival.slice(1)} special` : "Seasonal promotion";
    const wantsAd = /\bad\b|ads|meta|facebook|instagram ad/.test(lower);
    const wantsWhatsApp = /whatsapp|broadcast/.test(lower) || !wantsAd;
    const created: string[] = [];
    if (wantsWhatsApp) { await createCampaign({ channel: "whatsapp", name, objective: `Drive orders for ${name}` }); created.push("WhatsApp campaign"); }
    if (wantsAd) { await createCampaign({ channel: "meta_ad", name, objective: `Drive orders for ${name}`, audience: "Local customers 22-45", budget: 1000 }); created.push("Meta ad campaign"); }
    const post = await generatePost(`${name} announcement`);
    return `I drafted a ${created.join(" and ")} for "${name}" plus an Instagram post draft ("${post.caption.slice(0, 80)}..."). Nothing is live yet. Please review and approve in the Approvals page.`;
  }
  if (/calendar|plan.*(month|week)|content plan/.test(lower)) {
    const now = new Date();
    const items = await planMonth(now.getFullYear(), now.getMonth());
    return `I built a draft content calendar with ${items.length} posts for this month. Review them in Calendar and submit the ones you like for approval.`;
  }
  if (/post|caption|write|create|generate/.test(lower)) {
    const theme = message.replace(/^(please\s+)?(can you\s+)?(create|write|generate|make)\s+(me\s+)?(a\s+|an\s+)?/i, "").slice(0, 120) || "Product spotlight";
    const post = await generatePost(theme);
    return `Draft ready: "${post.caption}" ${post.hashtags}. Find it in Content and submit it for approval when you are happy.`;
  }
  if (/performance|metric|how did|results|stats|reach|engagement/.test(lower)) {
    const days = /month|30/.test(lower) ? 30 : 7;
    const stats = await getPerformance(days);
    return `Last ${days} days: ${stats.published} posts published, ${stats.impressions} impressions, ${stats.engagements} engagements, ${stats.clicks} clicks, ${stats.campaignsLive} campaigns live.`;
  }
  return null;
}

async function customerTool(message: string): Promise<string | null> {
  const lower = message.toLowerCase();
  if (/lead|prospect|follow/.test(lower)) {
    const leads = await db.lead.findMany({ where: { stage: { notIn: ["won", "lost"] } }, include: { contact: true }, orderBy: { createdAt: "desc" }, take: 8 });
    if (!leads.length) return "No open leads right now.";
    return `Open leads (${leads.length}):\n` + leads.map((lead) => `- ${lead.contact.name} (${lead.stage}) via ${lead.source}: ${lead.interest}`).join("\n");
  }
  if (/inbox|message|enquir|customer|reply|summar|unread|waiting/.test(lower)) {
    const waiting = await db.conversation.count({ where: { needsOwner: true } });
    const total = await db.conversation.count();
    const calls = await db.callLog.count();
    return `${total} conversations, ${waiting} need your attention (complaints or things I should not answer), ${calls} calls handled.`;
  }
  if (/call/.test(lower)) {
    const recent = await db.callLog.findMany({ orderBy: { createdAt: "desc" }, take: 3 });
    return recent.length ? "Recent calls:\n" + recent.map((call) => `- ${call.summary}`).join("\n") : "No calls yet.";
  }
  return null;
}

export async function chat(agent: AgentName, message: string): Promise<string> {
  await db.chatMessage.create({ data: { agent, role: "user", body: message } });
  let reply = agent === "marketing" ? await marketingTool(message) : await customerTool(message);
  if (!reply) {
    reply = agent === "marketing"
      ? "I can plan a month of content, write posts and captions, set up festive campaigns (WhatsApp or Meta ads) and report performance. Try: \"Plan a Diwali campaign\" or \"How did last week's posts perform?\""
      : "I can summarise your inbox, list open leads, and tell you about missed calls. Try: \"Show open leads\" or \"Summarise my inbox\".";
    if (process.env.AI_PROVIDER && process.env.AI_PROVIDER !== "mock") {
      reply = await getLLM().complete({
        system: `You are the ${agent} assistant for a small business. You can: ${reply} Answer briefly.`,
        prompt: message,
      });
    }
  }
  await db.chatMessage.create({ data: { agent, role: "assistant", body: reply } });
  return reply;
}
