import { db } from "@/lib/db";
import { saveSettingsForm } from "@/lib/actions";

export default async function SettingsPage() {
  const business = await db.business.findUniqueOrThrow({ where: { id: "default" } });
  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-xl font-semibold">Settings</h1>
      <form action={saveSettingsForm} className="card space-y-3 text-sm">
        <div><label className="label">Business name</label><input name="name" className="input" defaultValue={business.name} /></div>
        <label className="flex items-center gap-2"><input type="checkbox" name="autoReply" defaultChecked={business.autoReply} /> Customer assistant replies to messages automatically</label>
        <div><label className="label">Hand over to me when a message contains (comma separated)</label><input name="escalationKeywords" className="input" defaultValue={business.escalationKeywords} /></div>
        <label className="flex items-center gap-2"><input type="checkbox" name="autoFollowUp" defaultChecked={business.autoFollowUp} /> Send lead follow-ups without asking me (otherwise they wait in Approvals)</label>
        <div><label className="label">Follow-up schedule: hours after the lead arrives (comma separated)</label><input name="followUpCadenceHours" className="input" defaultValue={business.followUpCadenceHours} /></div>
        <p className="text-xs text-stone-500">Posts and campaigns always require your approval and cannot be turned off.</p>
        <button className="btn">Save</button>
      </form>
    </div>
  );
}
