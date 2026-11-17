import type { LLMProvider, ImageProvider } from "./types";

export const openaiLLM: LLMProvider = {
  name: "openai",
  async complete({ system, prompt, json }) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
        messages: [{ role: "system", content: system }, { role: "user", content: prompt }],
        ...(json ? { response_format: { type: "json_object" } } : {}),
      }),
    });
    if (!response.ok) throw new Error(`OpenAI error ${response.status}: ${await response.text()}`);
    const data = await response.json();
    return data.choices?.[0]?.message?.content ?? "";
  },
};

export const openaiImage: ImageProvider = {
  async generate(prompt: string) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
    const response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ model: process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-1", prompt, size: "1024x1024" }),
    });
    if (!response.ok) throw new Error(`OpenAI image error ${response.status}`);
    const data = await response.json();
    const first = data.data?.[0];
    return first?.url ?? `data:image/png;base64,${first?.b64_json}`;
  },
};
