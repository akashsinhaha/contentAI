import { db } from "@/lib/db";
import { lookup } from "dns/promises";
import { getLLM, parseJson } from "@/lib/ai";

export async function getBrandContext(): Promise<string> {
  const [business, brand, products] = await Promise.all([
    db.business.findUnique({ where: { id: "default" } }),
    db.brandProfile.findUnique({ where: { id: "default" } }),
    db.product.findMany({ take: 30 }),
  ]);
  return [
    `Business: ${business?.name ?? "Unknown"} (${business?.type ?? ""})`,
    `Voice: ${brand?.voice ?? ""}`,
    `Tone: ${brand?.tone ?? ""}`,
    `Always: ${brand?.dos ?? ""}`,
    `Never: ${brand?.donts ?? ""}`,
    `Products: ${products.map((p) => `${p.name}${p.price ? ` (${p.price})` : ""} - ${p.description}`).join("; ")}`,
    `FAQs: ${brand?.faqs ?? "[]"}`,
  ].join("\n");
}

/** True for localhost, private, link-local and other internal hosts, so the server cannot be pointed at them. */
export function isInternalHost(rawHostname: string): boolean {
  const host = rawHostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return true;
  if (host.includes(":")) {
    const mapped = host.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isInternalHost(mapped[1]);
    return host === "::1" || host === "::" || /^f[cd]/.test(host) || host.startsWith("fe80");
  }
  const parts = host.split(".").map(Number);
  if (parts.length === 4 && parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)) {
    const [a, b] = parts;
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  return false;
}

type HostLookup = (hostname: string) => Promise<{ address: string }[]>;
const resolveAll: HostLookup = (hostname) => lookup(hostname, { all: true });

/** Resolves the hostname and refuses it if ANY address is internal (stops public names that point inward). */
export async function isSafePublicHost(hostname: string, resolve: HostLookup = resolveAll): Promise<boolean> {
  if (isInternalHost(hostname)) return false;
  try {
    const addresses = await resolve(hostname);
    return addresses.length > 0 && addresses.every((entry) => !isInternalHost(entry.address));
  } catch {
    return false;
  }
}

/** Fetch the website's visible text (best effort, server side). */
export async function fetchWebsiteText(url: string): Promise<string> {
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol) || !(await isSafePublicHost(parsed.hostname))) return "";
    // Redirects are refused so a public page cannot bounce us to an internal address.
    const response = await fetch(parsed, { signal: AbortSignal.timeout(8000), redirect: "error" });
    const html = await response.text();
    return html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 6000);
  } catch {
    return "";
  }
}

/** Learn the brand voice from website text + sample captions and store an editable profile. */
export async function learnBrand(input: { websiteUrl?: string; sampleCaptions?: string }) {
  const websiteText = input.websiteUrl ? await fetchWebsiteText(input.websiteUrl) : "";
  const raw = await getLLM().complete({
    task: "brand",
    json: true,
    system: "You analyse small-business marketing. Reply ONLY with JSON: {voice,tone,dos,donts,hashtags}.",
    prompt: `Website text:\n${websiteText}\n\nSample captions:\n${input.sampleCaptions ?? ""}`,
  });
  const learned = parseJson(raw, { voice: "", tone: "", dos: "", donts: "", hashtags: "" });
  return db.brandProfile.upsert({
    where: { id: "default" },
    update: { ...learned, websiteText },
    create: { id: "default", ...learned, websiteText },
  });
}
