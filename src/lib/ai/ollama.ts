import type { LLMProvider } from "./types";

/** Local, free models served by Ollama (https://ollama.com). No API key; runs on your own machine. */
export const ollamaLLM: LLMProvider = {
  name: "ollama",
  async complete({ system, prompt, json }) {
    const baseUrl = (process.env.OLLAMA_URL || "http://localhost:11434").replace(/\/$/, "");
    const model = process.env.OLLAMA_MODEL;
    if (!model) throw new Error("OLLAMA_MODEL is not set (for example qwen2.5:7b). Run `ollama pull <model>` first.");
    let response: Response;
    try {
      response = await fetch(`${baseUrl}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model,
          stream: false,
          ...(json ? { format: "json" } : {}),
          options: { temperature: 0.4 },
          messages: [{ role: "system", content: system }, { role: "user", content: prompt }],
        }),
        // Small local models can be slow on the first request while the model loads.
        signal: AbortSignal.timeout(Number(process.env.OLLAMA_TIMEOUT_MS) || 120000),
      });
    } catch (error) {
      throw new Error(`Could not reach Ollama at ${baseUrl}. Is it running? (${error instanceof Error ? error.message : error})`);
    }
    if (!response.ok) throw new Error(`Ollama error ${response.status}: ${(await response.text()).slice(0, 200)}`);
    const data = await response.json();
    return data?.message?.content ?? "";
  },
};
