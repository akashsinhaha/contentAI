import type { LLMProvider } from "./types";

export const anthropicLLM: LLMProvider = {
  name: "anthropic",
  async complete({ system, prompt }) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5-5",
        max_tokens: 2048,
        system,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!response.ok) throw new Error(`Anthropic error ${response.status}: ${await response.text()}`);
    const data = await response.json();
    return data.content?.map((part: { text?: string }) => part.text ?? "").join("") ?? "";
  },
};
