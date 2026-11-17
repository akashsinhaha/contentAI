/**
 * Single-owner login. Uses only Web Crypto so it works in middleware (edge) and server code.
 * Set OWNER_PASSWORD (and ideally AUTH_SECRET) in .env. With no OWNER_PASSWORD the app is open in
 * development and locked in production.
 */
export const SESSION_COOKIE = "owner_session";
const SESSION_SECONDS = 60 * 60 * 24 * 7;

const encoder = new TextEncoder();

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hmac(message: string): Promise<string> {
  const secret = process.env.AUTH_SECRET || process.env.OWNER_PASSWORD || "";
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return toHex(await crypto.subtle.sign("HMAC", key, encoder.encode(message)));
}

/** Compares two strings in time that does not depend on where they differ. */
export function safeEqual(a: string, b: string): boolean {
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  let difference = left.length ^ right.length;
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
}

export type AuthMode = "open" | "locked" | "password";

export function authMode(): AuthMode {
  if (process.env.OWNER_PASSWORD) return "password";
  return process.env.NODE_ENV === "production" ? "locked" : "open";
}

export async function passwordMatches(candidate: string): Promise<boolean> {
  const expected = process.env.OWNER_PASSWORD;
  if (!expected) return false;
  // Hash both sides so the comparison length never reveals the password length.
  return safeEqual(await hmac(`pw:${candidate}`), await hmac(`pw:${expected}`));
}

export async function createSessionToken(now = Date.now()): Promise<string> {
  const expires = Math.floor(now / 1000) + SESSION_SECONDS;
  return `${expires}.${await hmac(`session:${expires}`)}`;
}

export async function verifySessionToken(token: string | undefined, now = Date.now()): Promise<boolean> {
  if (!token || !process.env.OWNER_PASSWORD) return false;
  const [expiresText, signature] = token.split(".");
  const expires = Number(expiresText);
  if (!signature || !Number.isFinite(expires) || expires * 1000 < now) return false;
  return safeEqual(signature, await hmac(`session:${expires}`));
}

export const SESSION_MAX_AGE = SESSION_SECONDS;
