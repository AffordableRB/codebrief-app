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

interface VerificationScore {
  total: number;
  confirmed: number;
  verify: number;
  score: number;
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

function parseVerificationScore(content: string): VerificationScore {
  const lines = content.split("\n");
  const tableRows = lines.filter((line) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) return false;
    if (/^\|[\s\-:]+\|$/.test(trimmed)) return false;
    if (/^\|[\s\-:|]+$/.test(trimmed)) return false;
    const cells = trimmed.split("|").filter((c) => c.trim());
    if (cells.length < 2) return false;
    const first = cells[0].trim().toLowerCase();
    if (
      [
        "requirement", "item", "category", "constraint", "risk", "fee",
        "fixture", "assembly", "standard", "system", "phase", "approval",
        "sign", "hazard", "metric", "scenario", "calculation", "factor",
        "space", "setback", "discipline", "parameter", "code", "overlay",
        "utility", "document", "inspection", "concept", "strategy", "#",
      ].includes(first)
    )
      return false;
    return true;
  });

  const total = tableRows.length;
  const verifyCount = tableRows.filter(
    (row) => row.includes("⚠") || row.toLowerCase().includes("verify")
  ).length;
  const confirmed = total - verifyCount;
  const score = total > 0 ? Math.round((confirmed / total) * 100) : 100;

  return { total, confirmed, verify: verifyCount, score };
}

function extractSources(content: string): string {
  const parts = content.split(/###\s*Sources\s*\n/i);
  if (parts.length < 2) return "";
  return parts[parts.length - 1].trim();
}

function getBriefWithoutSources(content: string): string {
  const idx = content.search(/###\s*Sources/i);
  if (idx === -1) return content;
  return content.slice(0, idx).trim();
}

export default function DashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [briefs, setBriefs] = useState<Brief[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showSourcesInBrief, setShowSourcesInBrief] = useState(false);

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
          .select(
            "id, created_at, building_type, location, square_footage, stories, occupancy_type, brief_content"
          )
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

  function handleDownloadSources(brief: Brief) {
    const sources = extractSources(brief.brief_content);
    const blob = new Blob(
      [
        `Sources — ${brief.building_type} | ${brief.location}\n${"—".repeat(
          50
        )}\n\n${sources}`,
      ],
      { type: "text/plain" }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sources-${brief.location
      .replace(/[^a-zA-Z0-9]/g, "-")
      .toLowerCase()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
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
            style={{
              borderColor: "var(--border-medium)",
              borderTopColor: "var(--text-primary)",
            }}
          />
          <p
            className="text-xs tracking-widest uppercase"
            style={{ color: "var(--text-muted)" }}
          >
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

  const selectedBrief = briefs.find((b) => b.id === selectedId) || null;
  const score = selectedBrief
    ? parseVerificationScore(selectedBrief.brief_content)
    : null;
  const sources = selectedBrief
    ? extractSources(selectedBrief.brief_content)
    : "";
  const briefContent = selectedBrief
    ? showSourcesInBrief
      ? selectedBrief.brief_content
      : getBriefWithoutSources(selectedBrief.brief_content)
    : "";

  const scoreColor = score
    ? score.score >= 90
      ? "var(--success)"
      : score.score >= 70
        ? "#92400e"
        : "var(--error)"
    : "var(--success)";

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: "var(--bg-base)" }}
    >
      {/* ═══ NAV — existing codebrief-app pattern ═══ */}
      <nav
        className="sticky top-0 z-50"
        style={{ background: "#111111", borderBottom: "1px solid #222222" }}
      >
        <div className="px-6 py-3 flex items-center justify-between">
          <a href="/" className="flex items-center gap-3">
            <div
              className="w-7 h-7 flex items-center justify-center"
              style={{ border: "1px solid rgba(245,242,238,0.3)" }}
            >
              <span
                className="text-[10px] font-bold tracking-tight"
                style={{ color: "#f5f2ee" }}
              >
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

          <div className="flex items-center gap-5">
            <span
              className="text-xs hidden sm:inline"
              style={{ color: "rgba(245,242,238,0.35)" }}
            >
              {user.email}
            </span>
            <a
              href="/#generate"
              className="px-4 py-2 text-xs font-medium tracking-widest uppercase transition-colors"
              style={{ background: "#f5f2ee", color: "#111111" }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = "#e5e0d8")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = "#f5f2ee")
              }
            >
              New Brief
            </a>
            <button
              onClick={handleSignOut}
              className="text-xs tracking-wide transition-colors"
              style={{ color: "rgba(245,242,238,0.35)" }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.color = "rgba(245,242,238,0.7)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.color = "rgba(245,242,238,0.35)")
              }
            >
              Sign out
            </button>
          </div>
        </div>
      </nav>

      {/* ═══ 3-PANEL LAYOUT — Grammarly canvas root: display flex, flex 1 1 0% ═══ */}
      <div
        style={{
          display: "flex",
          flex: "1 1 0%",
          overflow: "hidden",
        }}
      >
        {/* ─── LEFT SIDEBAR — Brief list + Plan (desktop) ─── */}
        <aside
          className="hidden lg:flex"
          style={{
            width: "300px",
            minWidth: "300px",
            borderRight: "1px solid var(--border-light)",
            flexDirection: "column",
            overflow: "hidden",
            background: "var(--bg-warm)",
          }}
        >
          {/* Plan summary — compact, from existing plan card */}
          <div
            style={{
              padding: "16px",
              borderBottom: "1px solid var(--border-light)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "8px",
              }}
            >
              <p
                className="text-[9px] font-semibold tracking-widest uppercase"
                style={{ color: "var(--text-muted)" }}
              >
                {PLAN_LABELS[plan]} Plan
              </p>
              <span
                className="text-[10px] font-medium"
                style={{ color: "var(--text-secondary)" }}
              >
                {limit >= 999 ? `${used} used` : `${used} / ${limit}`}
              </span>
            </div>
            {limit < 999 && (
              <div
                style={{
                  height: "2px",
                  background: "var(--bg-stone)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${usagePct}%`,
                    background:
                      usagePct >= 90
                        ? "var(--error)"
                        : "var(--text-primary)",
                    transition: "width 0.3s ease",
                  }}
                />
              </div>
            )}
            {plan === "free" && (
              <button
                onClick={() => handleUpgrade("solo")}
                className="w-full mt-3 py-1.5 text-[9px] font-semibold tracking-widest uppercase transition-colors"
                style={{
                  background: "var(--text-primary)",
                  color: "var(--bg-base)",
                  border: "none",
                  cursor: "pointer",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = "var(--text-secondary)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = "var(--text-primary)")
                }
              >
                Upgrade
              </button>
            )}
          </div>

          {/* Brief list header */}
          <div
            style={{
              padding: "12px 16px",
              borderBottom: "1px solid var(--border-light)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <p
              className="text-[9px] font-semibold tracking-widest uppercase"
              style={{ color: "var(--text-muted)" }}
            >
              Briefs
            </p>
            <span
              className="text-[10px]"
              style={{ color: "var(--text-muted)" }}
            >
              {briefs.length}
            </span>
          </div>

          {/* Brief list — scrollable, from existing brief history */}
          <div style={{ flex: "1 1 0%", overflow: "auto" }}>
            {briefs.length === 0 ? (
              <div style={{ padding: "32px 16px", textAlign: "center" }}>
                <p
                  className="text-xs mb-2"
                  style={{ color: "var(--text-muted)", fontWeight: 300 }}
                >
                  No briefs yet.
                </p>
                <a
                  href="/#generate"
                  className="text-[10px] font-medium tracking-widest uppercase"
                  style={{ color: "var(--text-primary)" }}
                >
                  Generate your first &rarr;
                </a>
              </div>
            ) : (
              briefs.map((brief) => (
                <button
                  key={brief.id}
                  onClick={() =>
                    setSelectedId(
                      selectedId === brief.id ? null : brief.id
                    )
                  }
                  className="w-full text-left transition-colors"
                  style={{
                    padding: "12px 16px",
                    borderBottom: "1px solid var(--border-light)",
                    borderLeft:
                      selectedId === brief.id
                        ? "2px solid var(--text-primary)"
                        : "2px solid transparent",
                    background:
                      selectedId === brief.id
                        ? "var(--bg-base)"
                        : "transparent",
                    cursor: "pointer",
                    display: "block",
                  }}
                  onMouseEnter={(e) => {
                    if (selectedId !== brief.id)
                      e.currentTarget.style.background = "var(--bg-stone)";
                  }}
                  onMouseLeave={(e) => {
                    if (selectedId !== brief.id)
                      e.currentTarget.style.background = "transparent";
                  }}
                >
                  <p
                    className="text-xs font-medium truncate mb-0.5"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {brief.building_type}
                  </p>
                  <p
                    className="text-[10px] truncate"
                    style={{
                      color: "var(--text-muted)",
                      fontWeight: 300,
                    }}
                  >
                    {brief.location}
                    {brief.square_footage &&
                      ` · ${brief.square_footage} SF`}
                  </p>
                  <p
                    className="text-[9px] mt-1"
                    style={{ color: "var(--border-medium)" }}
                  >
                    {new Date(brief.created_at).toLocaleDateString(
                      "en-US",
                      { month: "short", day: "numeric", year: "numeric" }
                    )}
                  </p>
                </button>
              ))
            )}
          </div>
        </aside>

        {/* ─── CENTER — Document viewer ─── */}
        <main
          style={{
            flex: "1 1 0%",
            overflow: "auto",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {selectedBrief ? (
            <>
              {/* Mobile back button */}
              <button
                className="lg:hidden px-4 py-3 text-left text-xs font-medium"
                onClick={() => setSelectedId(null)}
                style={{
                  color: "var(--text-muted)",
                  borderBottom: "1px solid var(--border-light)",
                  background: "var(--bg-warm)",
                }}
              >
                &larr; Back to briefs
              </button>

              {/* Report header — existing dark pattern from codebrief-app */}
              <div
                className="flex items-center justify-between px-8 py-4"
                style={{ background: "#111111", flexShrink: 0 }}
              >
                <div>
                  <p
                    className="text-[8px] font-bold tracking-[0.2em] uppercase mb-1"
                    style={{ color: "#b5a898" }}
                  >
                    Code Analysis Report
                  </p>
                  <p
                    className="text-sm font-light"
                    style={{ color: "#f5f2ee" }}
                  >
                    {selectedBrief.building_type} —{" "}
                    {selectedBrief.location}
                  </p>
                </div>
                <button
                  onClick={() => window.print()}
                  className="px-3 py-1.5 text-[9px] font-medium tracking-widest uppercase transition-colors"
                  style={{
                    border: "1px solid rgba(245,242,238,0.15)",
                    color: "rgba(245,242,238,0.5)",
                    background: "transparent",
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.color = "#f5f2ee")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.color =
                      "rgba(245,242,238,0.5)")
                  }
                >
                  Export PDF
                </button>
              </div>

              {/* Document content — Grammarly editor: 800px max-width */}
              <div
                style={{
                  flex: "1 1 0%",
                  overflow: "auto",
                  padding: "32px",
                }}
              >
                <div style={{ maxWidth: "800px", margin: "0 auto" }}>
                  <div
                    className="brief-content"
                    dangerouslySetInnerHTML={{
                      __html: marked.parse(briefContent, {
                        async: false,
                      }) as string,
                    }}
                  />
                </div>
              </div>

              {/* Mobile scoring — shown below document on small screens */}
              {score && (
                <div
                  className="lg:hidden"
                  style={{
                    borderTop: "1px solid var(--border-light)",
                    padding: "16px 24px",
                    background: "var(--bg-warm)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "16px",
                      marginBottom: "12px",
                    }}
                  >
                    <div>
                      <p
                        className="text-[9px] font-semibold tracking-widest uppercase mb-1"
                        style={{ color: "var(--text-muted)" }}
                      >
                        Verification Score
                      </p>
                      <span
                        style={{
                          fontSize: "1.25rem",
                          fontWeight: 600,
                          color: scoreColor,
                        }}
                      >
                        {score.score}
                      </span>
                      <span
                        style={{
                          fontSize: "0.75rem",
                          color: "var(--text-muted)",
                          marginLeft: "4px",
                        }}
                      >
                        / 100
                      </span>
                    </div>
                    <div
                      style={{
                        flex: 1,
                        display: "flex",
                        gap: "12px",
                        fontSize: "0.6875rem",
                      }}
                    >
                      <span style={{ color: "var(--success)" }}>
                        {score.confirmed} confirmed
                      </span>
                      <span style={{ color: "#92400e" }}>
                        {score.verify} verify
                      </span>
                    </div>
                  </div>
                  {sources && (
                    <button
                      onClick={() => handleDownloadSources(selectedBrief)}
                      className="text-[9px] font-medium tracking-widest uppercase"
                      style={{
                        color: "var(--text-muted)",
                        background: "none",
                        border: "1px solid var(--border-light)",
                        padding: "4px 10px",
                        cursor: "pointer",
                      }}
                    >
                      ↓ Download Sources
                    </button>
                  )}
                </div>
              )}

              {/* Report footer — existing dark pattern from codebrief-app */}
              <div
                className="px-8 py-3 flex items-center justify-between"
                style={{ background: "#111111", flexShrink: 0 }}
              >
                <span
                  className="text-[9px] tracking-widest uppercase"
                  style={{ color: "rgba(245,242,238,0.3)" }}
                >
                  Generated by CodeBrief
                </span>
                <span
                  className="text-[9px]"
                  style={{ color: "rgba(245,242,238,0.2)" }}
                >
                  codebrief.codes
                </span>
              </div>
            </>
          ) : (
            <>
              {/* ─── Mobile: show brief list when nothing selected ─── */}
              <div className="lg:hidden" style={{ flex: "1 1 0%" }}>
                {/* Mobile plan summary */}
                <div
                  style={{
                    padding: "16px",
                    borderBottom: "1px solid var(--border-light)",
                    background: "var(--bg-warm)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <div>
                      <p className="section-label mb-1">Account</p>
                      <h1
                        className="text-xl font-light tracking-tight"
                        style={{ color: "var(--text-primary)" }}
                      >
                        Dashboard
                      </h1>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <p
                        className="text-[9px] font-semibold tracking-widest uppercase"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {PLAN_LABELS[plan]} Plan
                      </p>
                      <p
                        className="text-[10px]"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {limit >= 999
                          ? `${used} used`
                          : `${used} / ${limit} briefs`}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Mobile brief list */}
                <div
                  style={{
                    borderBottom: "1px solid var(--border-light)",
                    padding: "12px 16px",
                  }}
                >
                  <p
                    className="text-[9px] font-semibold tracking-widest uppercase"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {briefs.length} {briefs.length === 1 ? "Brief" : "Briefs"}
                  </p>
                </div>
                {briefs.length === 0 ? (
                  <div
                    style={{
                      padding: "48px 16px",
                      textAlign: "center",
                    }}
                  >
                    <p
                      className="text-sm mb-2"
                      style={{
                        color: "var(--text-secondary)",
                        fontWeight: 300,
                      }}
                    >
                      No briefs yet.
                    </p>
                    <a
                      href="/#generate"
                      className="text-xs font-medium tracking-widest uppercase"
                      style={{ color: "var(--text-primary)" }}
                    >
                      Generate your first brief &rarr;
                    </a>
                  </div>
                ) : (
                  briefs.map((brief) => (
                    <button
                      key={brief.id}
                      onClick={() => setSelectedId(brief.id)}
                      className="w-full text-left transition-colors"
                      style={{
                        padding: "12px 16px",
                        borderBottom: "1px solid var(--border-light)",
                        display: "flex",
                        alignItems: "start",
                        gap: "12px",
                        cursor: "pointer",
                        background: "transparent",
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.background =
                          "var(--bg-warm)")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.background = "transparent")
                      }
                    >
                      {/* Icon — existing codebrief-app document icon */}
                      <div
                        className="w-7 h-7 flex items-center justify-center flex-shrink-0 mt-0.5"
                        style={{
                          border: "1px solid var(--border-light)",
                          background: "var(--bg-warm)",
                        }}
                      >
                        <svg
                          className="w-3.5 h-3.5"
                          viewBox="0 0 14 14"
                          fill="none"
                        >
                          <rect
                            x="2"
                            y="1"
                            width="10"
                            height="12"
                            rx="0"
                            stroke="var(--text-muted)"
                            strokeWidth="1"
                          />
                          <path
                            d="M4 4h6M4 6.5h6M4 9h4"
                            stroke="var(--text-muted)"
                            strokeWidth="0.8"
                            strokeLinecap="round"
                          />
                        </svg>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p
                          className="text-sm font-medium truncate mb-0.5"
                          style={{ color: "var(--text-primary)" }}
                        >
                          {brief.building_type}
                        </p>
                        <p
                          className="text-xs truncate"
                          style={{
                            color: "var(--text-muted)",
                            fontWeight: 300,
                          }}
                        >
                          {brief.location}
                          {brief.square_footage &&
                            ` · ${brief.square_footage} SF`}
                          {brief.stories &&
                            ` · ${brief.stories} stories`}
                        </p>
                      </div>
                      <span
                        className="text-[10px] flex-shrink-0"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {new Date(brief.created_at).toLocaleDateString(
                          "en-US",
                          {
                            month: "short",
                            day: "numeric",
                          }
                        )}
                      </span>
                    </button>
                  ))
                )}
              </div>

              {/* ─── Desktop: empty state when nothing selected ─── */}
              <div
                className="hidden lg:flex"
                style={{
                  flex: "1 1 0%",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <div style={{ textAlign: "center" }}>
                  {/* Document icon — existing codebrief-app SVG */}
                  <div
                    className="w-12 h-12 mx-auto mb-4 flex items-center justify-center"
                    style={{
                      border: "1px solid var(--border-light)",
                      background: "var(--bg-warm)",
                    }}
                  >
                    <svg
                      className="w-5 h-5"
                      viewBox="0 0 14 14"
                      fill="none"
                    >
                      <rect
                        x="2"
                        y="1"
                        width="10"
                        height="12"
                        rx="0"
                        stroke="var(--text-muted)"
                        strokeWidth="1"
                      />
                      <path
                        d="M4 4h6M4 6.5h6M4 9h4"
                        stroke="var(--text-muted)"
                        strokeWidth="0.8"
                        strokeLinecap="round"
                      />
                    </svg>
                  </div>
                  <p
                    className="text-sm font-light mb-1"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Select a brief to view
                  </p>
                  <p
                    className="text-[10px]"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Or{" "}
                    <a
                      href="/#generate"
                      className="font-medium tracking-wide uppercase"
                      style={{ color: "var(--text-primary)" }}
                    >
                      generate a new one
                    </a>
                  </p>
                </div>
              </div>
            </>
          )}
        </main>

        {/* ─── RIGHT SIDEBAR — Scoring panel (Grammarly _writingScoreView pattern) ─── */}
        {selectedBrief && score && (
          <aside
            className="hidden lg:flex"
            style={{
              width: "342px",
              minWidth: "342px",
              borderLeft: "1px solid var(--border-light)",
              flexDirection: "column",
              overflow: "auto",
              background: "var(--bg-base)",
            }}
          >
            {/* Score section — Grammarly: font-size 1.25rem, font-weight 600, progress bar */}
            <div
              style={{
                padding: "16px 16px 12px",
                borderBottom: "1px solid var(--border-light)",
              }}
            >
              <p
                className="text-[9px] font-semibold tracking-widest uppercase mb-2"
                style={{ color: "var(--text-muted)" }}
              >
                Verification Score
              </p>
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: "4px",
                }}
              >
                <span
                  style={{
                    fontSize: "1.25rem",
                    fontWeight: 600,
                    color: scoreColor,
                  }}
                >
                  {score.score}
                </span>
                <span
                  style={{
                    fontSize: "0.75rem",
                    color: "var(--text-muted)",
                  }}
                >
                  / 100
                </span>
              </div>
              {/* Progress bar — Grammarly --bar-progress pattern */}
              <div
                style={{
                  height: "4px",
                  background: "var(--bg-stone)",
                  marginTop: "8px",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${score.score}%`,
                    background: scoreColor,
                    transition: "width 0.3s ease",
                  }}
                />
              </div>
            </div>

            {/* Categories — Grammarly colored dot + title + counter pattern */}
            <div
              style={{
                padding: "12px 16px",
                borderBottom: "1px solid var(--border-light)",
              }}
            >
              <p
                className="text-[9px] font-semibold tracking-widest uppercase mb-3"
                style={{ color: "var(--text-muted)" }}
              >
                Breakdown
              </p>

              {/* CONFIRMED — Grammarly teal dot mapped to CodeBrief success green */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "6px 0",
                }}
              >
                <span
                  style={{
                    width: "8px",
                    height: "8px",
                    borderRadius: "50%",
                    background: "var(--success)",
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    flex: 1,
                    fontSize: "0.8125rem",
                    color: "var(--text-primary)",
                  }}
                >
                  Confirmed
                </span>
                <span
                  style={{
                    fontSize: "0.6875rem",
                    fontWeight: 600,
                    color: "var(--success)",
                    minWidth: "20px",
                    textAlign: "right",
                  }}
                >
                  {score.confirmed}
                </span>
              </div>

              {/* VERIFY — Grammarly red/amber dot mapped to CodeBrief warning */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "6px 0",
                }}
              >
                <span
                  style={{
                    width: "8px",
                    height: "8px",
                    borderRadius: "50%",
                    background: "#92400e",
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    flex: 1,
                    fontSize: "0.8125rem",
                    color: "var(--text-primary)",
                  }}
                >
                  Verify with AHJ
                </span>
                <span
                  style={{
                    fontSize: "0.6875rem",
                    fontWeight: 600,
                    color: "#92400e",
                    minWidth: "20px",
                    textAlign: "right",
                  }}
                >
                  {score.verify}
                </span>
              </div>

              {/* Total */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "6px 0",
                  borderTop: "1px solid var(--border-light)",
                  marginTop: "4px",
                }}
              >
                <span
                  style={{
                    width: "8px",
                    height: "8px",
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    flex: 1,
                    fontSize: "0.8125rem",
                    color: "var(--text-muted)",
                  }}
                >
                  Total requirements
                </span>
                <span
                  style={{
                    fontSize: "0.6875rem",
                    fontWeight: 600,
                    color: "var(--text-secondary)",
                    minWidth: "20px",
                    textAlign: "right",
                  }}
                >
                  {score.total}
                </span>
              </div>
            </div>

            {/* Project details — from existing codebrief-app brief metadata */}
            <div
              style={{
                padding: "12px 16px",
                borderBottom: "1px solid var(--border-light)",
              }}
            >
              <p
                className="text-[9px] font-semibold tracking-widest uppercase mb-3"
                style={{ color: "var(--text-muted)" }}
              >
                Project Details
              </p>
              {[
                {
                  label: "Type",
                  value: selectedBrief.building_type,
                },
                {
                  label: "Location",
                  value: selectedBrief.location,
                },
                {
                  label: "Size",
                  value: selectedBrief.square_footage
                    ? `${selectedBrief.square_footage} SF`
                    : "—",
                },
                {
                  label: "Stories",
                  value: selectedBrief.stories || "—",
                },
                ...(selectedBrief.occupancy_type
                  ? [
                      {
                        label: "Occupancy",
                        value: selectedBrief.occupancy_type,
                      },
                    ]
                  : []),
              ].map((item) => (
                <div
                  key={item.label}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "4px 0",
                  }}
                >
                  <span
                    className="text-[10px]"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {item.label}
                  </span>
                  <span
                    className="text-[10px] font-medium"
                    style={{
                      color: "var(--text-primary)",
                      textAlign: "right",
                      maxWidth: "60%",
                    }}
                  >
                    {item.value}
                  </span>
                </div>
              ))}
              <p
                className="text-[9px] mt-2"
                style={{ color: "var(--border-medium)" }}
              >
                {new Date(selectedBrief.created_at).toLocaleDateString(
                  "en-US",
                  {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  }
                )}
              </p>
            </div>

            {/* Sources — with download + incorporate toggle */}
            <div
              style={{
                padding: "12px 16px",
                flex: "1 1 0%",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: "12px",
                }}
              >
                <p
                  className="text-[9px] font-semibold tracking-widest uppercase"
                  style={{ color: "var(--text-muted)" }}
                >
                  Sources
                </p>
                <div
                  style={{
                    display: "flex",
                    gap: "8px",
                    alignItems: "center",
                  }}
                >
                  <button
                    onClick={() =>
                      setShowSourcesInBrief(!showSourcesInBrief)
                    }
                    className="text-[9px] tracking-wide transition-colors"
                    style={{
                      color: showSourcesInBrief
                        ? "var(--text-primary)"
                        : "var(--text-muted)",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                    }}
                  >
                    {showSourcesInBrief ? "In doc ✓" : "Show in doc"}
                  </button>
                  {sources && (
                    <button
                      onClick={() =>
                        handleDownloadSources(selectedBrief)
                      }
                      className="text-[9px] font-medium tracking-widest uppercase transition-colors"
                      style={{
                        color: "var(--text-muted)",
                        background: "none",
                        border: "1px solid var(--border-light)",
                        padding: "3px 8px",
                        cursor: "pointer",
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.color =
                          "var(--text-primary)")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.color =
                          "var(--text-muted)")
                      }
                    >
                      ↓
                    </button>
                  )}
                </div>
              </div>

              {sources ? (
                <div
                  className="brief-content"
                  style={{ fontSize: "0.6875rem", lineHeight: 1.6 }}
                  dangerouslySetInnerHTML={{
                    __html: marked.parse(sources, {
                      async: false,
                    }) as string,
                  }}
                />
              ) : (
                <p
                  className="text-[10px]"
                  style={{
                    color: "var(--text-muted)",
                    fontStyle: "italic",
                  }}
                >
                  No sources found in this brief.
                </p>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
