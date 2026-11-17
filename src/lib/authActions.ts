"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, SESSION_MAX_AGE, createSessionToken, passwordMatches } from "@/lib/auth";

export async function loginForm(form: FormData) {
  const password = String(form.get("password") ?? "");
  if (!(await passwordMatches(password))) {
    await new Promise((resolve) => setTimeout(resolve, 800)); // slows down guessing
    redirect("/login?error=1");
  }
  (await cookies()).set(SESSION_COOKIE, await createSessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  redirect("/");
}

export async function logoutForm() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}
