import { afterEach, describe, expect, it, vi } from "vitest";
import { getLLM } from "@/lib/ai";
import { ollamaLLM } from "@/lib/ai/ollama";

const saved = { ...process.env };
afterEach(() => {
  vi.unstubAllGlobals();
  for (const key of ["OLLAMA_URL", "OLLAMA_MODEL", "OLLAMA_TIMEOUT_MS"]) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe("ollama provider", () => {
  it("is selectable by name", () => {
    expect(getLLM("ollama").name).toBe("ollama");
  });

  it("calls the local chat endpoint with system and user messages and returns the content", async () => {
    process.env.OLLAMA_MODEL = "qwen2.5:7b";
    const calls: { url: string; body: any }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)) });
      return new Response(JSON.stringify({ message: { content: "Hello from a local model" } }));
    });
    const reply = await ollamaLLM.complete({ system: "Be brief", prompt: "Hi", json: true });
    expect(reply).toBe("Hello from a local model");
    expect(calls[0].url).toBe("http://localhost:11434/api/chat");
    expect(calls[0].body).toMatchObject({ model: "qwen2.5:7b", stream: false, format: "json" });
    expect(calls[0].body.messages.map((message: any) => message.role)).toEqual(["system", "user"]);
  });

  it("explains what to do when no model is configured", async () => {
    delete process.env.OLLAMA_MODEL;
    await expect(ollamaLLM.complete({ system: "s", prompt: "p" })).rejects.toThrow(/OLLAMA_MODEL/);
  });

  it("explains clearly when Ollama is not running", async () => {
    process.env.OLLAMA_MODEL = "m";
    vi.stubGlobal("fetch", async () => { throw new TypeError("fetch failed"); });
    await expect(ollamaLLM.complete({ system: "s", prompt: "p" })).rejects.toThrow(/Is it running/);
  });

  it("surfaces Ollama's error, such as a model that was never pulled", async () => {
    process.env.OLLAMA_MODEL = "missing";
    vi.stubGlobal("fetch", async () => new Response('{"error":"model \\"missing\\" not found"}', { status: 404 }));
    await expect(ollamaLLM.complete({ system: "s", prompt: "p" })).rejects.toThrow(/404.*not found/);
  });
});
