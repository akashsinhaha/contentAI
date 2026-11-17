import type { LLMProvider, LLMRequest, ImageProvider, VideoProvider } from "./types";

/** Deterministic offline provider so the whole app works without API keys. */
export const mockLLM: LLMProvider = {
  name: "mock",
  async complete(request: LLMRequest) {
    const { task, prompt } = request;
    if (task === "caption") {
      const topic = (prompt.match(/about: (.*?)\. Reply ONLY/s)?.[1] ?? prompt.slice(-60)).slice(0, 80);
      return JSON.stringify({
        caption: `Fresh, made with love: ${topic}. Message us to order today!`,
        hashtags: "#handmade #supportlocal #freshdaily",
      });
    }
    if (task === "calendar") {
      const days = Number((prompt.match(/days=(\d+)/) ?? [])[1] ?? 30);
      const themes = ["Product spotlight", "Behind the scenes", "Customer love", "Offer of the week", "Tips and how-to", "Festive special"];
      const entries = [];
      for (let day = 1; day <= days; day += 2) {
        const theme = themes[Math.floor(day / 2) % themes.length];
        entries.push({ day, theme, caption: `${theme}: something special from us today. DM to order!`, hashtags: "#localbusiness #handmade" });
      }
      return JSON.stringify(entries);
    }
    if (task === "brand") {
      return JSON.stringify({
        voice: "Warm, friendly and personal, like talking to a neighbour",
        tone: "Cheerful, helpful, never pushy",
        dos: "Use customer first names; mention freshness and care",
        donts: "No heavy jargon; no discounts unless the owner approves",
        hashtags: "#handmade #supportlocal",
      });
    }
    if (task === "reply") {
      return "Hi! Thanks for reaching out. I can help with that. Could you share a few details (what you would like and by when)? The owner will confirm the final price and timing.";
    }
    if (task === "followup") {
      return "Hi! Just checking in. Are you still interested? Happy to answer any questions or help you place your order.";
    }
    if (task === "call") {
      return "Thanks for calling. The owner is unavailable right now. May I take your name and what you need, and we will call you back shortly?";
    }
    if (task === "video") {
      return "Scene 1 (0-3s): Close-up of the product, natural light.\nScene 2 (3-8s): Customer-style voiceover: \"I finally tried this and wow.\"\nScene 3 (8-12s): Hand-held reveal and smile.\nScene 4 (12-15s): Text overlay: DM to order.";
    }
    return "OK.";
  },
};

export const mockImage: ImageProvider = {
  async generate(prompt: string) {
    const label = prompt.slice(0, 40).replace(/[<>&"']/g, "");
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='640' height='640'><rect width='100%' height='100%' fill='#fde68a'/><text x='50%' y='50%' text-anchor='middle' font-family='sans-serif' font-size='28' fill='#78350f'>${label}</text></svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  },
};

export const mockVideo: VideoProvider = {
  async generate(prompt: string) {
    const script = await mockLLM.complete({ system: "", prompt, task: "video" });
    return { script, mediaUrl: "" };
  },
};
