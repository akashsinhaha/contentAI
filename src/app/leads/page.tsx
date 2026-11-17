import { db } from "@/lib/db";
import { setLeadStageForm } from "@/lib/actions";

const STAGES = ["new", "contacted", "interested", "won", "lost"];

export default async function LeadsPage() {
  const leads = await db.lead.findMany({ include: { contact: true }, orderBy: { createdAt: "desc" } });
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Leads</h1>
      <div className="grid gap-3 md:grid-cols-5">
        {STAGES.map((stage) => (
          <div key={stage} className="space-y-2">
            <h2 className="text-sm font-semibold capitalize">{stage} ({leads.filter((lead) => lead.stage === stage).length})</h2>
            {leads.filter((lead) => lead.stage === stage).map((lead) => (
              <div key={lead.id} className="card space-y-1 p-3 text-xs">
                <div className="text-sm font-medium">{lead.contact.name}</div>
                <div className="text-stone-500">{lead.source} - {lead.contact.handle}</div>
                <div>{lead.interest}</div>
                <div className="text-stone-500">Follow-ups sent: {lead.followUpCount}{lead.nextFollowUpAt ? `, next ${lead.nextFollowUpAt.toLocaleString()}` : ""}</div>
                <form action={setLeadStageForm} className="flex gap-1">
                  <input type="hidden" name="id" value={lead.id} />
                  <select name="stage" defaultValue={lead.stage} className="input py-1 text-xs">{STAGES.map((option) => <option key={option}>{option}</option>)}</select>
                  <button className="btn-ghost px-2 py-1 text-xs">Set</button>
                </form>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
