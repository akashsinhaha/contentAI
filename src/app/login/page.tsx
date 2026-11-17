import { loginForm } from "@/lib/authActions";
import { authMode } from "@/lib/auth";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const mode = authMode();
  return (
    <div className="mx-auto mt-16 max-w-sm space-y-3">
      <h1 className="text-xl font-semibold">Owner login</h1>
      {mode === "locked" && (
        <p className="card text-sm text-red-700">Login is not set up. Set OWNER_PASSWORD in the server environment and restart. The app stays locked until you do.</p>
      )}
      {mode === "open" && <p className="card text-sm text-stone-600">No OWNER_PASSWORD is set, so the app is open in development. Set one to turn login on.</p>}
      {mode === "password" && (
        <form action={loginForm} className="card space-y-2">
          <label className="label" htmlFor="password">Password</label>
          <input id="password" name="password" type="password" className="input" autoFocus required />
          {error && <p className="text-sm text-red-700">Wrong password.</p>}
          <button className="btn">Log in</button>
        </form>
      )}
    </div>
  );
}
