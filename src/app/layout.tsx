import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { authMode } from "@/lib/auth";
import { logoutForm } from "@/lib/authActions";

export const metadata: Metadata = { title: "Business Assistant", description: "AI marketing and customer assistants for small businesses" };
export const dynamic = "force-dynamic";

const NAV = [
  ["/", "Chat & Dashboard"],
  ["/onboarding", "Brand"],
  ["/content", "Content"],
  ["/calendar", "Calendar"],
  ["/campaigns", "Campaigns"],
  ["/approvals", "Approvals"],
  ["/inbox", "Inbox"],
  ["/calls", "Calls"],
  ["/leads", "Leads"],
  ["/settings", "Settings"],
] as const;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const pending = await db.pendingAction.count({ where: { status: "pending" } }).catch(() => 0);
  return (
    <html lang="en">
      <body>
        <div className="flex min-h-screen flex-col md:flex-row">
          <nav className="shrink-0 border-b border-stone-200 bg-white p-3 md:w-52 md:border-b-0 md:border-r">
            <div className="mb-3 px-2 text-lg font-semibold text-amber-700">Business Assistant</div>
            <ul className="flex flex-wrap gap-1 md:flex-col">
              {NAV.map(([href, label]) => (
                <li key={href}>
                  <Link href={href} className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm text-stone-700 hover:bg-amber-50">
                    {label}
                    {href === "/approvals" && pending > 0 && <span className="ml-2 rounded-full bg-amber-600 px-1.5 text-xs text-white">{pending}</span>}
                  </Link>
                </li>
              ))}
            </ul>
            {authMode() === "password" && (
              <form action={logoutForm} className="mt-3 px-2"><button className="text-xs text-stone-500 underline">Log out</button></form>
            )}
          </nav>
          <main className="flex-1 p-4 md:p-6">{children}</main>
        </div>
      </body>
    </html>
  );
}
