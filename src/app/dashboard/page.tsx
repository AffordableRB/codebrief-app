"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase-browser";
import { marked } from "marked";

interface Brief {
  id: string;
  created_at: string;
  building_type: string;
  location: string;
  square_footage: string;
  stories: string;
  occupancy_type: string | null;
  brief_content: string;
}

interface Profile {
  plan: string;
  briefs_used: number;
  briefs_limit: number;
  stripe_customer_id: string | null;
}

const PLAN_LIMITS: Record<string, number> = {
  free: 2,
  solo: 15,
  firm: 999,
  enterprise: 999,
};

const PLAN_LABELS: Record<string, string> = {
  free: "Free",
  solo: "Solo",
  firm: "Firm",
  enterprise: "Enterprise",
};

export default function DashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [briefs, setBriefs] = useState<Brief[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.push("/login");
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!user) return;

    async function loadData() {
      setDataLoading(true);
      const [briefsRes, profileRes] = await Promise.all([
        supabase
          .from("briefs")
          .select("id, created_at, building_type, location, square_footage, stories, occupancy_type, brief_content")
          .eq("user_id", user!.id)
          .order("created_at", { ascending: false })
          .limit(20),
        supabase
          .from("profiles")
          .select("plan, briefs_used, briefs_limit, stripe_customer_id")
          .eq("id", user!.id)
          .single(),
      ]);

      if (briefsRes.data) setBriefs(briefsRes.data);
      if (profileRes.data) setProfile(profileRes.data);
      setDataLoading(false);
    }

    loadData();
  }, [user]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/");
  }

  async function handleUpgrade(plan: string) {
    const res = await fetch("/api/create-checkout-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan }),
    });
    const data = await res.json();
    if (data.url) window.location.href = data.url;
  }

  if (authLoading || dataLoading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: "var(--bg-base)" }}
      >
        <div className="flex flex-col items-center gap-4">
          <div
            className="w-8 h-8 border border-t-transparent animate-spin"
            style={{ borderColor: "var(--border-medium)", borderTopColor: "var(--text-primary)" }}
          />
          <p className="text-xs tracking-widest uppercase" style={{ color: "var(--text-muted)" }}>
            Loading
          </p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  const plan = profile?.plan || "free";
  const used = profile?.briefs_used || 0;
  const limit = profile?.briefs_limit || PLAN_LIMITS[plan] || 2;
  const usagePct = limit >= 999 ? 100 : Math.min(100, (used / limit) * 100);
  const usageColor =
    usagePct >= 90 ? "#8b1a1a" : usagePct >= 70 ? "#92400e" : "var(--text-primary)";

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--bg-base)" }}>
      {/* NAV */}
      <nav
        className="sticky top-0 z-50"
        style={{ background: "#111111", borderBottom: "1px solid #222222" }}
      >
        <div className="max-w-7xl mx-auto px-8 py-4 flex items-center justify-between">
          <a href="/" className="flex items-center gap-3">
            <div
              className="w-7 h-7 flex items-center justify-center"
              style={{ border: "1px solid rgba(245,242,238,0.3)" }}
            >
              <span className="text-[10px] font-bold tracking-tight" style={{ color: "#f5f2ee" }}>CB</span>
            </div>
            <span
              className="text-sm font-medium tracking-widest uppercase"
              style={{ color: "#f5f2ee", letterSpacing: "0.12em" }}
            >
              CodeBrief
            </span>
          </a>

          <div className="flex items-center gap-5">
            <span className="text-xs" style={{ color: "rgba(245,242,238,0.35)" }}>
              {user.email}
            </span>
            <a
              href="/#generate"
              className="px-4 py-2 text-xs font-medium tracking-widest uppercase transition-colors"
              style={{ background: "#f5f2ee", color: "#111111" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#e5e0d8")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "#f5f2ee")}
            >
              New Brief
            </a>
            <button
              onClick={handleSignOut}
              className="text-xs tracking-wide transition-colors"
              style={{ color: "rgba(245,242,238,0.35)" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "rgba(245,242,238,0.7)")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(245,242,238,0.35)")}
            >
              Sign out
            </button>
          </div>
        </div>
      </nav>

      <main className="flex-1 max-w-7xl mx-auto px-8 py-12 w-full">
        {/* Page heading */}
        <div className="mb-10">
          <p className="section-label mb-2">Account</p>
          <h1
            className="text-2xl font-light tracking-tight"
            style={{ color: "var(--text-primary)", letterSpacing: "-0.02em" }}
          >
            Dashboard
          </h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* LEFT COLUMN — Plan + Upgrade */}
          <div className="lg:col-span-1 space-y-5">
            {/* Plan card */}
            <div
              style={{
                background: "#ffffff",
                border: "1px solid var(--border-medium)",
                borderTop: "2px solid var(--text-primary)",
              }}
            >
              <div className="px-6 py-5">
                <p
                  className="text-[9px] font-semibold tracking-widest uppercase mb-3"
                  style={{ color: "var(--text-muted)" }}
                >
                  Current Plan
                </p>
                <div className="flex items-baseline gap-2 mb-4">
                  <span
                    className="text-xl font-light tracking-tight"
                    style={{ color: "var(--text-primary)", letterSpacing: "-0.02em" }}
                  >
                    {PLAN_LABELS[plan] || plan}
                  </span>
                  <span
                    className="text-[9px] font-semibold tracking-widest uppercase px-2 py-0.5"
                    style={{
                      background: plan === "free" ? "var(--bg-warm)" : "#111111",
                      color: plan === "free" ? "var(--text-muted)" : "#f5f2ee",
                    }}
                  >
                    {plan}
                  </span>
                </div>

                {/* Usage */}
                <div className="mb-1 flex items-center justify-between">
                  <p className="text-[9px] tracking-widest uppercase" style={{ color: "var(--text-muted)" }}>
                    Briefs used
                  </p>
                  <p
                    className="text-[10px] font-medium"
                    style={{ color: usageColor }}
                  >
                    {limit >= 999 ? `${used} / Unlimited` : `${used} / ${limit}`}
                  </p>
                </div>
                {limit < 999 && (
                  <div
                    className="w-full h-1 overflow-hidden"
                    style={{ background: "var(--bg-stone)" }}
                  >
                    <div
                      className="h-full transition-all"
                      style={{
                        width: `${usagePct}%`,
                        background: usageColor,
                      }}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Upgrade card */}
            {plan === "free" && (
              <div
                style={{
                  background: "#111111",
                  border: "1px solid #222",
                  borderTop: "2px solid #333",
                }}
              >
                <div className="px-6 py-5">
                  <p
                    className="text-[9px] font-semibold tracking-widest uppercase mb-3"
                    style={{ color: "#b5a898" }}
                  >
                    Upgrade
                  </p>
                  <div className="space-y-3">
                    {[
                      { key: "solo", label: "Solo", price: "$49/mo", briefs: "15 briefs" },
                      { key: "firm", label: "Firm", price: "$99/mo", briefs: "Unlimited + 5 users", popular: true },
                      { key: "enterprise", label: "Enterprise", price: "$199/mo", briefs: "Unlimited + priority" },
                    ].map((p) => (
                      <button
                        key={p.key}
                        onClick={() => handleUpgrade(p.key)}
                        className="w-full flex items-center justify-between px-4 py-3 text-left transition-colors"
                        style={{
                          background: p.popular ? "rgba(245,242,238,0.06)" : "transparent",
                          border: "1px solid rgba(245,242,238,0.1)",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(245,242,238,0.1)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = p.popular ? "rgba(245,242,238,0.06)" : "transparent")}
                      >
                        <div>
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-xs font-medium" style={{ color: "#f5f2ee" }}>{p.label}</span>
                            {p.popular && (
                              <span
                                className="text-[8px] font-semibold tracking-widest uppercase px-1.5 py-0.5"
                                style={{ background: "#b5a898", color: "#111111" }}
                              >
                                Popular
                              </span>
                            )}
                          </div>
                          <span className="text-[10px]" style={{ color: "rgba(245,242,238,0.35)" }}>{p.briefs}</span>
                        </div>
                        <span className="text-xs font-medium" style={{ color: "rgba(245,242,238,0.6)" }}>{p.price}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {plan !== "free" && (
              <div
                style={{
                  background: "var(--bg-warm)",
                  border: "1px solid var(--border-light)",
                }}
              >
                <div className="px-6 py-5">
                  <p
                    className="text-[9px] font-semibold tracking-widest uppercase mb-2"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Subscription
                  </p>
                  <p className="text-xs mb-4" style={{ color: "var(--text-secondary)", fontWeight: 300 }}>
                    Manage billing, invoices, and plan changes.
                  </p>
                  <button
                    onClick={() => handleUpgrade("portal")}
                    className="text-xs font-medium tracking-widest uppercase transition-colors"
                    style={{ color: "var(--text-primary)" }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = "var(--accent)")}
                    onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-primary)")}
                  >
                    Manage Billing &rarr;
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* RIGHT COLUMN — Brief history */}
          <div className="lg:col-span-2">
            <div
              style={{
                background: "#ffffff",
                border: "1px solid var(--border-medium)",
                borderTop: "2px solid var(--text-primary)",
              }}
            >
              {/* Header */}
              <div
                className="px-6 py-4 flex items-center justify-between"
                style={{ borderBottom: "1px solid var(--border-light)" }}
              >
                <p
                  className="text-[9px] font-semibold tracking-widest uppercase"
                  style={{ color: "var(--text-muted)" }}
                >
                  Brief History
                </p>
                <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                  {briefs.length} {briefs.length === 1 ? "brief" : "briefs"}
                </span>
              </div>

              {briefs.length === 0 ? (
                <div className="px-6 py-16 text-center">
                  <p className="text-sm mb-1" style={{ color: "var(--text-secondary)", fontWeight: 300 }}>
                    No briefs yet.
                  </p>
                  <a
                    href="/#generate"
                    className="text-xs font-medium tracking-widest uppercase transition-colors"
                    style={{ color: "var(--text-primary)" }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = "var(--accent)")}
                    onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-primary)")}
                  >
                    Generate your first brief &rarr;
                  </a>
                </div>
              ) : (
                <div>
                  {briefs.map((brief, i) => (
                    <div
                      key={brief.id}
                      style={{
                        borderBottom: i < briefs.length - 1 ? "1px solid var(--border-light)" : "none",
                      }}
                    >
                      {/* Row */}
                      <button
                        onClick={() =>
                          setExpandedId(expandedId === brief.id ? null : brief.id)
                        }
                        className="w-full flex items-start justify-between px-6 py-4 text-left transition-colors"
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.background = "var(--bg-warm)")
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.background = "transparent")
                        }
                      >
                        <div className="flex items-start gap-4 flex-1 min-w-0">
                          {/* Icon */}
                          <div
                            className="w-7 h-7 flex items-center justify-center flex-shrink-0 mt-0.5"
                            style={{ border: "1px solid var(--border-light)", background: "var(--bg-warm)" }}
                          >
                            <svg className="w-3.5 h-3.5" viewBox="0 0 14 14" fill="none">
                              <rect x="2" y="1" width="10" height="12" rx="0" stroke="var(--text-muted)" strokeWidth="1" />
                              <path d="M4 4h6M4 6.5h6M4 9h4" stroke="var(--text-muted)" strokeWidth="0.8" strokeLinecap="round" />
                            </svg>
                          </div>
                          <div className="min-w-0">
                            <p
                              className="text-sm font-medium truncate mb-0.5"
                              style={{ color: "var(--text-primary)" }}
                            >
                              {brief.building_type}
                            </p>
                            <p
                              className="text-xs truncate"
                              style={{ color: "var(--text-muted)", fontWeight: 300 }}
                            >
                              {brief.location}
                              {brief.square_footage && ` · ${brief.square_footage} SF`}
                              {brief.stories && ` · ${brief.stories} stories`}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 flex-shrink-0 ml-4">
                          <span
                            className="text-[10px]"
                            style={{ color: "var(--text-muted)" }}
                          >
                            {new Date(brief.created_at).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </span>
                          <span
                            className="text-sm font-light transition-transform"
                            style={{
                              color: "var(--text-muted)",
                              transform: expandedId === brief.id ? "rotate(45deg)" : "none",
                            }}
                          >
                            +
                          </span>
                        </div>
                      </button>

                      {/* Expanded report */}
                      {expandedId === brief.id && (
                        <div
                          style={{
                            borderTop: "1px solid var(--border-light)",
                            background: "var(--bg-base)",
                          }}
                        >
                          {/* Report header */}
                          <div className="px-6 py-4 flex items-center justify-between" style={{ background: "#111111" }}>
                            <div>
                              <p
                                className="text-[8px] font-bold tracking-[0.2em] uppercase mb-1"
                                style={{ color: "#b5a898" }}
                              >
                                Code Analysis Report
                              </p>
                              <p className="text-sm font-light" style={{ color: "#f5f2ee" }}>
                                {brief.building_type} — {brief.location}
                              </p>
                            </div>
                            <button
                              onClick={() => window.print()}
                              className="px-3 py-1.5 text-[9px] font-medium tracking-widest uppercase transition-colors"
                              style={{ border: "1px solid rgba(245,242,238,0.15)", color: "rgba(245,242,238,0.5)" }}
                              onMouseEnter={(e) => (e.currentTarget.style.color = "#f5f2ee")}
                              onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(245,242,238,0.5)")}
                            >
                              Export PDF
                            </button>
                          </div>

                          {/* Content */}
                          <div className="px-6 py-6">
                            <div
                              className="brief-content"
                              dangerouslySetInnerHTML={{
                                __html: marked.parse(brief.brief_content, { async: false }) as string,
                              }}
                            />
                          </div>

                          {/* Footer */}
                          <div
                            className="px-6 py-3 flex items-center justify-between"
                            style={{ background: "#111111" }}
                          >
                            <span className="text-[9px] tracking-widest uppercase" style={{ color: "rgba(245,242,238,0.3)" }}>
                              Generated by CodeBrief
                            </span>
                            <span className="text-[9px]" style={{ color: "rgba(245,242,238,0.2)" }}>
                              codebrief.ai
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer
        style={{
          background: "var(--bg-warm)",
          borderTop: "1px solid var(--border-light)",
        }}
      >
        <div className="max-w-7xl mx-auto px-8 py-5 flex items-center justify-between">
          <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            &copy; {new Date().getFullYear()} CodeBrief
          </span>
          <span className="text-[11px]" style={{ color: "var(--border-medium)" }}>
            Pre-design code intelligence for architects
          </span>
        </div>
      </footer>
    </div>
  );
}
