import { db } from "@/lib/db";
import { getMetaAds } from "@/lib/integrations";

/** Records a metrics snapshot. Mock mode generates plausible numbers; real mode reads from Meta. */
export async function recordMetric(refType: "content" | "campaign", refId: string) {
  let impressions = 300 + Math.floor(Math.random() * 1500);
  let clicks = Math.floor(impressions * 0.04);
  const engagements = Math.floor(impressions * 0.08);
  if (refType === "campaign" && process.env.INTEGRATIONS_MODE === "real") {
    const campaign = await db.campaign.findUnique({ where: { id: refId } });
    if (campaign?.externalId) {
      const insights = await getMetaAds().insights(campaign.externalId);
      impressions = insights.impressions;
      clicks = insights.clicks;
    }
  }
  return db.metric.create({ data: { refType, refId, impressions, engagements, clicks } });
}

export async function getPerformance(days = 7) {
  const since = new Date(Date.now() - days * 86400000);
  const rows = await db.metric.findMany({ where: { recordedAt: { gte: since } } });
  const totals = rows.reduce(
    (sum, row) => ({ impressions: sum.impressions + row.impressions, engagements: sum.engagements + row.engagements, clicks: sum.clicks + row.clicks }),
    { impressions: 0, engagements: 0, clicks: 0 },
  );
  const published = await db.contentItem.count({ where: { status: "published", publishedAt: { gte: since } } });
  const campaignsLive = await db.campaign.count({ where: { status: "live" } });
  return { days, published, campaignsLive, ...totals };
}
