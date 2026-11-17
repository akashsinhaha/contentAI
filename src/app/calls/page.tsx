import { db } from "@/lib/db";
import { simulateCallForm } from "@/lib/actions";

export default async function CallsPage() {
  const calls = await db.callLog.findMany({ orderBy: { createdAt: "desc" }, take: 50 });
  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-xl font-semibold">Call answering</h1>
      <form action={simulateCallForm} className="card grid gap-2 md:grid-cols-3">
        <div className="md:col-span-3 text-xs text-stone-500">Test tool: simulate an incoming call while you are busy. A real phone provider connects through the voice adapter (see README).</div>
        <input name="name" className="input" placeholder="Caller name" />
        <input name="number" className="input" placeholder="Number" defaultValue="+912222222222" />
        <button className="btn">Simulate call</button>
        <textarea name="says" className="input md:col-span-3" rows={2} placeholder="I want to order a birthday cake for Sunday" required />
      </form>
      {calls.map((call) => (
        <div key={call.id} className="card space-y-1 text-sm">
          <div className="font-medium">{call.callerName ?? call.callerNumber} <span className="text-xs text-stone-500">{call.createdAt.toLocaleString()}</span></div>
          <p>{call.summary}</p>
          <pre className="whitespace-pre-wrap rounded bg-stone-50 p-2 text-xs">{call.transcript}</pre>
        </div>
      ))}
      {calls.length === 0 && <p className="text-sm text-stone-500">No calls yet.</p>}
    </div>
  );
}
