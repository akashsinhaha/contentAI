import { db } from "@/lib/db";
import { decideActionForm } from "@/lib/actions";

interface Preview { text: string; image?: string | null }

async function previewFor(type: string, payload: Record<string, string>): Promise<Preview> {
  if (type === "publish_post") {
    const content = await db.contentItem.findUnique({ where: { id: payload.contentId } });
    return { text: `${content?.caption ?? ""}\n${content?.hashtags ?? ""}\nScheduled: ${content?.scheduledFor?.toLocaleString() ?? "publish immediately"}`, image: content?.mediaUrl };
  }
  if (type === "launch_campaign") {
    const campaign = await db.campaign.findUnique({ where: { id: payload.campaignId } });
    return { text: `${campaign?.message ?? ""}\nChannel: ${campaign?.channel}. Budget: ${campaign?.budget ?? "n/a"}. Audience: ${campaign?.audience || "opted-in WhatsApp contacts"}` };
  }
  return { text: payload.body ?? "" };
}

export default async function ApprovalsPage() {
  const actions = await db.pendingAction.findMany({ orderBy: { createdAt: "desc" }, take: 80 });
  const pending = actions.filter((action) => action.status === "pending");
  const history = actions.filter((action) => action.status !== "pending");
  const previews = await Promise.all(pending.map((action) => previewFor(action.type, JSON.parse(action.payload))));
  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-xl font-semibold">Approvals</h1>
      <p className="text-sm text-stone-600">Nothing below goes live until you approve it. You can edit the text first.</p>
      {pending.length === 0 && <p className="text-sm text-stone-500">Nothing is waiting for you.</p>}
      {pending.map((action, index) => (
        <form key={action.id} action={decideActionForm} className="card space-y-2 text-sm">
          <input type="hidden" name="id" value={action.id} />
          <input type="hidden" name="type" value={action.type} />
          <div className="flex gap-2"><span className="badge">{action.type}</span><span className="badge">from {action.createdBy} assistant</span></div>
          <div className="font-medium">{action.title}</div>
          {previews[index].image && /* eslint-disable-next-line @next/next/no-img-element */ <img src={previews[index].image!} alt="preview" className="h-32 rounded-lg" />}
          <pre className="whitespace-pre-wrap text-stone-600">{previews[index].text}</pre>
          <div><label className="label">Edit text before approving (optional)</label><textarea name="edited" className="input" rows={2} /></div>
          <div className="flex gap-2">
            <button name="decision" value="approve" className="btn">Approve</button>
            <button name="decision" value="reject" className="btn-danger">Reject</button>
          </div>
        </form>
      ))}
      <h2 className="pt-4 font-semibold">History</h2>
      <ul className="space-y-1 text-sm">
        {history.map((action) => (
          <li key={action.id} className="card py-2"><span className="badge mr-2">{action.status}</span>{action.title}{action.result ? ` - ${action.result}` : ""}</li>
        ))}
      </ul>
    </div>
  );
}
