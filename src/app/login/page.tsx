"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase-browser";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    const { error: authError } =
      mode === "signin"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });

    setLoading(false);

    if (authError) {
      setError(authError.message);
    } else if (mode === "signup") {
      setSuccess("Check your email to confirm your account, then sign in below.");
      setMode("signin");
    } else {
      router.push("/dashboard");
    }
  }

  async function handleGoogle() {
    setError("");
    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/dashboard` },
    });
    if (authError) setError(authError.message);
  }

  return (
    <div className="min-h-screen flex" style={{ background: "var(--bg-base)" }}>
      {/* LEFT — Branding Panel */}
      <div
        className="hidden lg:flex lg:w-1/2 flex-col justify-between p-14"
        style={{ background: "#111111" }}
      >
        <a href="/" className="flex items-center gap-3">
          <div
            className="w-7 h-7 flex items-center justify-center"
            style={{ border: "1px solid rgba(245,242,238,0.3)" }}
          >
            <span className="text-[10px] font-bold tracking-tight" style={{ color: "#f5f2ee" }}>
              CB
            </span>
          </div>
          <span
            className="text-sm font-medium tracking-widest uppercase"
            style={{ color: "#f5f2ee", letterSpacing: "0.12em" }}
          >
            CodeBrief
          </span>
        </a>

        <div className="max-w-sm">
          <p
            className="text-[9px] font-semibold tracking-widest uppercase mb-6"
            style={{ color: "#b5a898" }}
          >
            Pre-Design Code Intelligence
          </p>
          <h2
            className="text-3xl font-light leading-tight mb-8"
            style={{ color: "#f5f2ee", letterSpacing: "-0.02em" }}
          >
            Know your code constraints
            <br />
            before schematic design.
          </h2>
          <ul className="space-y-4">
            {[
              "Zoning, IBC, ADA, IECC — one report",
              "20,000+ US jurisdictions covered",
              "IBC section citations, not summaries",
              "Risk flags before they become RFIs",
            ].map((item) => (
              <li key={item} className="flex items-start gap-3">
                <span className="mt-0.5 text-xs flex-shrink-0" style={{ color: "#b5a898" }}>—</span>
                <span className="text-sm" style={{ color: "rgba(245,242,238,0.55)", fontWeight: 300 }}>
                  {item}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-[10px] tracking-widest uppercase" style={{ color: "rgba(245,242,238,0.2)" }}>
          For architects. Not contractors. Not engineers.
        </p>
      </div>

      {/* RIGHT — Auth Panel */}
      <div className="flex-1 flex flex-col justify-center items-center px-8 py-16">
        <div className="lg:hidden mb-10 flex items-center gap-3">
          <div
            className="w-7 h-7 flex items-center justify-center"
            style={{ border: "1px solid var(--border-medium)" }}
          >
            <span className="text-[10px] font-bold" style={{ color: "var(--text-primary)" }}>CB</span>
          </div>
          <span
            className="text-sm font-medium tracking-widest uppercase"
            style={{ color: "var(--text-primary)", letterSpacing: "0.12em" }}
          >
            CodeBrief
          </span>
        </div>

        <div className="w-full max-w-sm">
          <div className="mb-8">
            <h1
              className="text-2xl font-light tracking-tight mb-1.5"
              style={{ color: "var(--text-primary)", letterSpacing: "-0.02em" }}
            >
              {mode === "signin" ? "Sign in" : "Create account"}
            </h1>
            <p className="text-sm" style={{ color: "var(--text-muted)", fontWeight: 300 }}>
              {mode === "signin"
                ? "Welcome back to CodeBrief."
                : "Start with 2 free briefs per month."}
            </p>
          </div>

          {success && (
            <div
              className="mb-5 px-4 py-3 text-xs"
              style={{ background: "#f0fdf4", border: "1px solid #86efac", color: "#1a4a2e" }}
            >
              {success}
            </div>
          )}

          {error && (
            <div
              className="mb-5 px-4 py-3 text-xs"
              style={{ background: "#fef2f2", border: "1px solid #fca5a5", color: "#8b1a1a" }}
            >
              {error}
            </div>
          )}

          <button
            onClick={handleGoogle}
            className="w-full flex items-center justify-center gap-3 py-2.5 mb-5 text-xs font-medium tracking-wide transition-colors"
            style={{
              border: "1px solid var(--border-medium)",
              background: "#ffffff",
              color: "var(--text-primary)",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-warm)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "#ffffff")}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Continue with Google
          </button>

          <div className="relative flex items-center mb-5">
            <div className="flex-1 h-px" style={{ background: "var(--border-light)" }} />
            <span className="px-3 text-[10px] tracking-widest uppercase" style={{ color: "var(--text-muted)" }}>or</span>
            <div className="flex-1 h-px" style={{ background: "var(--border-light)" }} />
          </div>

          <form onSubmit={handleEmail} className="space-y-3.5">
            <div>
              <label
                className="block text-[9px] font-semibold tracking-widest uppercase mb-1.5"
                style={{ color: "var(--text-muted)" }}
              >
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@firm.com"
                className="form-input"
                required
                autoComplete="email"
              />
            </div>
            <div>
              <label
                className="block text-[9px] font-semibold tracking-widest uppercase mb-1.5"
                style={{ color: "var(--text-muted)" }}
              >
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="form-input"
                required
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 text-xs font-medium tracking-widest uppercase transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: "#111111", color: "#f5f2ee" }}
              onMouseEnter={(e) => { if (!loading) e.currentTarget.style.background = "#333333"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "#111111"; }}
            >
              {loading ? "Please wait..." : mode === "signin" ? "Sign In" : "Create Account"}
            </button>
          </form>

          <p className="mt-6 text-xs text-center" style={{ color: "var(--text-muted)" }}>
            {mode === "signin" ? "Don't have an account?" : "Already have an account?"}{" "}
            <button
              onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(""); setSuccess(""); }}
              className="font-medium transition-colors"
              style={{ color: "var(--text-primary)" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "var(--accent)")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-primary)")}
            >
              {mode === "signin" ? "Create account" : "Sign in"}
            </button>
          </p>

          <p className="mt-4 text-center">
            <a
              href="/"
              className="text-[10px] tracking-wide transition-colors"
              style={{ color: "var(--border-medium)" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "var(--border-medium)")}
            >
              &larr; Back to CodeBrief
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
