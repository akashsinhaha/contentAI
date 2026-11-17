"use client";
import { useRef, useState } from "react";

type Agent = "marketing" | "customer";
interface Line { role: "user" | "assistant"; body: string }

const LABEL: Record<Agent, string> = { marketing: "Marketing Assistant", customer: "Customer Assistant" };
const HINT: Record<Agent, string> = {
  marketing: "e.g. Plan a Diwali campaign, or How did last week's posts perform?",
  customer: "e.g. Show open leads, or Summarise my inbox",
};

export default function ChatPanel({ initial }: { initial: Record<Agent, Line[]> }) {
  const [agent, setAgent] = useState<Agent>("marketing");
  const [lines, setLines] = useState(initial);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    const message = text.trim();
    if (!message || busy) return;
    setText("");
    setBusy(true);
    setLines((current) => ({ ...current, [agent]: [...current[agent], { role: "user", body: message }] }));
    try {
      const response = await fetch("/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ agent, message }) });
      const data = await response.json();
      const reply = data.reply ?? `Error: ${data.error ?? "unknown"}`;
      setLines((current) => ({ ...current, [agent]: [...current[agent], { role: "assistant", body: reply }] }));
    } finally {
      setBusy(false);
      setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    }
  }

  return (
    <div className="card flex h-[28rem] flex-col">
      <div className="mb-2 flex gap-2">
        {(["marketing", "customer"] as Agent[]).map((name) => (
          <button key={name} onClick={() => setAgent(name)} className={agent === name ? "btn" : "btn-ghost"}>{LABEL[name]}</button>
        ))}
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto rounded-lg bg-stone-50 p-3 text-sm">
        {lines[agent].length === 0 && <p className="text-stone-500">Ask the {LABEL[agent]}. {HINT[agent]}</p>}
        {lines[agent].map((line, index) => (
          <div key={index} className={line.role === "user" ? "text-right" : ""}>
            <span className={`inline-block max-w-[85%] whitespace-pre-wrap rounded-xl px-3 py-2 ${line.role === "user" ? "bg-amber-600 text-white" : "border border-stone-200 bg-white"}`}>{line.body}</span>
          </div>
        ))}
        {busy && <p className="text-stone-400">Working...</p>}
        <div ref={endRef} />
      </div>
      <form onSubmit={send} className="mt-2 flex gap-2">
        <input className="input" value={text} onChange={(event) => setText(event.target.value)} placeholder={HINT[agent]} />
        <button className="btn" disabled={busy}>Send</button>
      </form>
    </div>
  );
}
