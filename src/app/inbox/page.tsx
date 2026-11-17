import { db } from "@/lib/db";
import { simulateMessageForm, ownerReplyForm } from "@/lib/actions";

export default async function InboxPage() {
  const conversations = await db.conversation.findMany({
    include: { contact: true, messages: { orderBy: { createdAt: "asc" } } },
    orderBy: { updatedAt: "desc" },
  });
  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-xl font-semibold">Inbox (WhatsApp and Instagram)</h1>
      <form action={simulateMessageForm} className="card grid gap-2 md:grid-cols-4">
        <div className="md:col-span-4 text-xs text-stone-500">Test tool: pretend a customer sent a message. Real messages arrive via /api/webhooks/whatsapp and /api/webhooks/instagram.</div>
        <select name="channel" className="input"><option value="whatsapp">WhatsApp</option><option value="instagram">Instagram</option></select>
        <input name="name" className="input" placeholder="Customer name" />
        <input name="handle" className="input" placeholder="Phone / IG id" defaultValue="+911111111111" />
        <button className="btn">Send as customer</button>
        <textarea name="body" className="input md:col-span-4" rows={2} placeholder="Hi, do you have eggless chocolate cake for Saturday?" required />
      </form>
      {conversations.map((conversation) => (
        <div key={conversation.id} className="card space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <span className="font-medium">{conversation.contact.name}</span>
            <span className="badge">{conversation.channel}</span>
            {conversation.needsOwner && <span className="badge bg-red-100 text-red-700">needs you</span>}
          </div>
          <div className="space-y-1">
            {conversation.messages.map((message) => (
              <div key={message.id} className={message.direction === "out" ? "text-right" : ""}>
                <span className={`inline-block max-w-[85%] rounded-xl px-3 py-1.5 ${message.direction === "out" ? "bg-amber-100" : "bg-stone-100"}`}>
                  <span className="mr-1 text-xs text-stone-500">{message.sender}</span>{message.body}
                </span>
              </div>
            ))}
          </div>
          <form action={ownerReplyForm} className="flex gap-2">
            <input type="hidden" name="conversationId" value={conversation.id} />
            <input name="body" className="input" placeholder="Reply yourself..." required />
            <button className="btn-ghost">Reply</button>
          </form>
        </div>
      ))}
      {conversations.length === 0 && <p className="text-sm text-stone-500">No conversations yet.</p>}
    </div>
  );
}
