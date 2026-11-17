import type { LLMProvider, ImageProvider, VideoProvider } from "./types";
import { mockLLM, mockImage, mockVideo } from "./mock";
import { anthropicLLM } from "./anthropic";
import { openaiLLM, openaiImage } from "./openai";
import { ollamaLLM } from "./ollama";

export function getLLM(providerName = process.env.AI_PROVIDER ?? "mock"): LLMProvider {
  switch (providerName) {
    case "ollama": return ollamaLLM;
    case "anthropic": return anthropicLLM;
    case "openai": return openaiLLM;
    case "mock": return mockLLM;
    default: throw new Error(`Unknown AI_PROVIDER "${providerName}"`);
  }
}
export function getImageProvider(providerName = process.env.AI_PROVIDER ?? "mock"): ImageProvider {
  return providerName === "openai" ? openaiImage : mockImage;
}
export function getVideoProvider(): VideoProvider {
  // Real video generation vendors vary widely; plug one in here. Mock returns a script.
  return mockVideo;
}

/** Parse JSON from an LLM response, tolerating code fences or surrounding prose. */
export function parseJson<T>(text: string, fallback: T): T {
  const match = text.match(/[\[{][\s\S]*[\]}]/);
  if (!match) return fallback;
  try { return JSON.parse(match[0]) as T; } catch { return fallback; }
}
