import { NextResponse } from "next/server";
import { chat } from "@/lib/agents/chat";

export async function POST(request: Request) {
  const { agent, message } = await request.json();
  if (!["marketing", "customer"].includes(agent) || typeof message !== "string" || !message.trim()) {
    return NextResponse.json({ error: "agent and message required" }, { status: 400 });
  }
  try {
    return NextResponse.json({ reply: await chat(agent, message.trim()) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed" }, { status: 500 });
  }
}
