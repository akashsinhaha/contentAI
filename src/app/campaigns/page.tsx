import { db } from "@/lib/db";
import { createCampaignForm } from "@/lib/actions";

export default async function CampaignsPage() {
  const [campaigns, optedIn] = await Promise.all([
    db.campaign.findMany({ orderBy: { createdAt: "desc" } }),
    db.contact.count({ where: { channel: "whatsapp", optedIn: true } }),
  ]);
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Campaigns</h1>
      <form action={createCampaignForm} className="card grid gap-2 md:grid-cols-2">
        <div><label className="label">Type</label>
          <select name="channel" className="input"><option value="whatsapp">WhatsApp marketing ({optedIn} opted-in contacts)</option><option value="meta_ad">Meta ad (Facebook / Instagram)</option></select></div>
        <div><label className="label">Name</label><input name="name" className="input" required placeholder="Diwali gift boxes" /></div>
        <div><label className="label">Objective</label><input name="objective" className="input" placeholder="Get 20 gift-box orders" /></div>
        <div><label className="label">Audience (ads)</label><input name="audience" className="input" placeholder="Women 25-45 within 10 km" /></div>
        <div><label className="label">Budget (ads)</label><input name="budget" type="number" className="input" /></div>
        <div className="md:col-span-2"><label className="label">Message (leave empty to draft with AI)</label><textarea name="message" className="input" rows={2} /></div>
        <button className="btn md:col-span-2">Create and send for approval</button>
      </form>
      <div className="grid gap-3 md:grid-cols-2">
        {campaigns.map((campaign) => (
          <div key={campaign.id} className="card text-sm">
            <div className="flex gap-2"><span className="badge">{campaign.channel === "meta_ad" ? "Meta ad" : "WhatsApp"}</span><span className="badge">{campaign.status}</span></div>
            <div className="mt-1 font-medium">{campaign.name}</div>
            <p className="whitespace-pre-wrap text-stone-600">{campaign.message}</p>
            {campaign.budget && <p className="text-xs text-stone-500">Budget: {campaign.budget}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
