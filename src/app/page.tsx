import { db } from "@/lib/db";
import { getPerformance } from "@/lib/metrics";
import ChatPanel from "@/components/ChatPanel";
import { runJobsForm } from "@/lib/actions";

// Rough estimate of manual work avoided, shown to the owner as a motivating (not exact) figure.
const MINUTES_SAVED = { post: 20, reply: 3, call: 10, followUp: 5 };

export default async function Dashboard() {
  const [pending, upcoming, leads, published, replies, calls, followUps, perf, chatRows] = await Promise.all([
    db.pendingAction.count({ where: { status: "pending" } }),
    db.contentItem.findMany({ where: { status: "scheduled" }, orderBy: { scheduledFor: "asc" }, take: 5 }),
    db.lead.groupBy({ by: ["stage"], _count: true }),
    db.contentItem.count({ where: { status: "published" } }),
    db.message.count({ where: { sender: "assistant" } }),
    db.callLog.count(),
    db.lead.aggregate({ _sum: { followUpCount: true } }),
    getPerformance(7),
    db.chatMessage.findMany({ orderBy: { createdAt: "asc" }, take: 100 }),
  ]);
  const minutes = published * MINUTES_SAVED.post + replies * MINUTES_SAVED.reply + calls * MINUTES_SAVED.call + (followUps._sum.followUpCount ?? 0) * MINUTES_SAVED.followUp;
  const initial = { marketing: [] as { role: "user" | "assistant"; body: string }[], customer: [] as { role: "user" | "assistant"; body: string }[] };
  for (const row of chatRows) initial[row.agent as "marketing" | "customer"].push({ role: row.role as "user" | "assistant", body: row.body });

  const stats = [
    ["Waiting for your approval", pending],
    ["Posts published", published],
    ["Replies sent by assistant", replies],
    ["Calls answered", calls],
    ["Est. hours saved", (minutes / 60).toFixed(1)],
  ];
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Dashboard</h1>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {stats.map(([label, value]) => (
          <div key={label} className="card"><div className="text-2xl font-semibold">{value}</div><div className="text-xs text-stone-500">{label}</div></div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <ChatPanel initial={initial} />
        <div className="space-y-4">
          <div className="card text-sm">
            <h2 className="mb-2 font-semibold">Last 7 days</h2>
            <p>{perf.impressions} impressions, {perf.engagements} engagements, {perf.clicks} clicks, {perf.campaignsLive} campaigns live.</p>
          </div>
          <div className="card text-sm">
            <h2 className="mb-2 font-semibold">Lead funnel</h2>
            {leads.length === 0 ? <p className="text-stone-500">No leads yet.</p> : leads.map((row) => <p key={row.stage}>{row.stage}: {row._count}</p>)}
          </div>
          <div className="card text-sm">
            <h2 className="mb-2 font-semibold">Upcoming posts</h2>
            {upcoming.length === 0 ? <p className="text-stone-500">Nothing scheduled.</p> : upcoming.map((item) => <p key={item.id}>{item.scheduledFor?.toLocaleString()} - {item.theme ?? item.caption.slice(0, 40)}</p>)}
          </div>
          <form action={runJobsForm}><button className="btn-ghost">Run scheduler now</button></form>
        </div>
      </div>
    </div>
  );
}
