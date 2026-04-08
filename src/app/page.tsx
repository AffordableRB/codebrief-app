"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase-browser";
import { marked } from "marked";
import { REPORT_TYPES } from "@/lib/report-types";
import { getFieldsForReports } from "@/lib/report-fields";

/* ═══════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════ */

interface ProjectInput {
  buildingType: string;
  location: string;
  squareFootage: string;
  stories: string;
  buildingHeight: string;
  constructionType: string;
  occupancyType: string;
  occupantLoad: string;
  lotSize: string;
  additionalNotes: string;
}

interface SavedBrief {
  id: string;
  building_type: string;
  location: string;
  square_footage: string;
  stories: string;
  occupancy_type: string | null;
  brief_content: string;
  created_at: string;
  input_json: ProjectInput | null;
}

const BUILDING_TYPES = [
  "Single-Family Residential", "Multi-Family Residential",
  "Mixed-Use (Residential/Commercial)", "Office / Commercial", "Retail",
  "Restaurant / Food Service", "Hotel / Hospitality", "K-12 School",
  "Higher Education", "Healthcare / Medical Office", "Hospital",
  "Assembly / Event Space", "Warehouse / Industrial",
  "Religious / House of Worship", "Parking Structure", "Other",
];

const OCCUPANCY_TYPES = [
  "A-1 Assembly (theater, concert hall)", "A-2 Assembly (restaurant, bar, banquet)",
  "A-3 Assembly (worship, recreation, museum)", "A-4 Assembly (arena, indoor sports)",
  "A-5 Assembly (outdoor, stadium)", "B Business (office, professional)",
  "E Educational", "F-1 Factory / Industrial (moderate hazard)",
  "F-2 Factory / Industrial (low hazard)", "H Hazardous",
  "I-1 Institutional (assisted living)", "I-2 Institutional (hospital, nursing home)",
  "I-3 Institutional (detention)", "M Mercantile (retail, department store)",
  "R-1 Residential (hotel, motel)", "R-2 Residential (apartment, dormitory)",
  "R-3 Residential (1-2 family dwelling)", "R-4 Residential (care facility, small)",
  "S-1 Storage (moderate hazard)", "S-2 Storage (low hazard)",
  "U Utility / Miscellaneous", "Not sure — help me classify",
];

const initialForm: ProjectInput = {
  buildingType: "", location: "", squareFootage: "", stories: "",
  buildingHeight: "", constructionType: "", occupancyType: "", occupantLoad: "",
  lotSize: "", additionalNotes: "",
};

/* ═══════════════════════════════════════════
   RESEARCH LOG MESSAGES
   ═══════════════════════════════════════════ */

function getResearchLog(reportId: string, location: string): { text: string; detail: string }[] {
  const city = location.split(",")[0]?.trim() || location;
  const base = [
    { text: `Identifying jurisdiction`, detail: `${city} — municipal code database` },
    { text: `Searching zoning ordinances`, detail: `${city} planning department records` },
  ];
  const reportSpecific: Record<string, { text: string; detail: string }[]> = {
    "code-analysis": [
      { text: "Checking IBC adoption", detail: "International Building Code version & local amendments" },
      { text: "Analyzing fire separation", detail: "IBC Table 508.4 — occupancy separation requirements" },
      { text: "Calculating egress requirements", detail: "IBC Table 1004.5 — occupant load factors" },
      { text: "Reviewing accessibility standards", detail: "ADA 2010 Standards & state equivalents" },
      { text: "Checking energy code", detail: "IECC adoption, climate zone, envelope requirements" },
      { text: "Analyzing parking requirements", detail: "Municipal code — parking ratios by use type" },
      { text: "Computing plumbing fixtures", detail: "IPC Table 403.1 — fixture counts by occupancy" },
      { text: "Compiling risk flags", detail: "Flood zones, seismic, historic overlays, special permits" },
    ],
    "zoning-feasibility": [
      { text: "Analyzing zoning districts", detail: "Permitted uses, conditional uses, overlay zones" },
      { text: "Calculating FAR & lot coverage", detail: "Floor area ratio limits vs. proposed" },
      { text: "Checking dimensional standards", detail: "Height, setbacks, building width/depth" },
      { text: "Reviewing overlay districts", detail: "Historic, conservation, transit-oriented, planned development" },
      { text: "Assessing variance requirements", detail: "Relief needed, approval process, timeline" },
      { text: "Determining feasibility", detail: "Can this project be built on this site?" },
    ],
    "energy-compliance": [
      { text: "Identifying energy code version", detail: "IECC / ASHRAE 90.1 adoption year" },
      { text: "Determining climate zone", detail: "Heating/cooling degree days, humidity classification" },
      { text: "Analyzing envelope requirements", detail: "R-values, U-factors, air barrier standards" },
      { text: "Checking mechanical efficiency", detail: "HVAC minimums, economizer requirements" },
      { text: "Reviewing lighting power density", detail: "Interior/exterior LPD by space type" },
      { text: "Identifying local stretch codes", detail: "Amendments exceeding base energy code" },
    ],
    "cost-context": [
      { text: "Researching construction costs", detail: "Cost per SF by building type & market" },
      { text: "Analyzing permit fees", detail: "Building permit, plan review, inspection fees" },
      { text: "Calculating impact fees", detail: "Schools, transportation, parks, utilities" },
      { text: "Reviewing market conditions", detail: "Labor availability, material cost trends" },
      { text: "Estimating soft costs", detail: "A/E fees, legal, insurance, contingency" },
    ],
    "risk-due-diligence": [
      { text: "Checking FEMA flood maps", detail: "Flood zone designation & base flood elevation" },
      { text: "Analyzing seismic risk", detail: "Design category, ground motion parameters" },
      { text: "Reviewing environmental constraints", detail: "Wetlands, buffers, contamination records" },
      { text: "Checking historic resources", detail: "Landmark status, Section 106, design review" },
      { text: "Identifying regulatory risks", detail: "Variances, public hearings, approval timelines" },
      { text: "Assessing construction risks", detail: "Soil conditions, access, adjacent properties" },
    ],
    "site-constraints": [
      { text: "Mapping setback requirements", detail: "Front, side, rear, corner side distances" },
      { text: "Calculating buildable area", detail: "Lot area minus setbacks, coverage limits" },
      { text: "Checking impervious cover", detail: "Stormwater regulations, drainage requirements" },
      { text: "Reviewing utility availability", detail: "Water, sewer, electric, gas, telecom providers" },
      { text: "Analyzing height & bulk", detail: "Stepbacks, solar access, setback planes" },
    ],
    "sustainability-scoping": [
      { text: "Checking mandatory green requirements", detail: "Local green building ordinances" },
      { text: "Analyzing LEED pathway", detail: "Credit categories, achievable points" },
      { text: "Reviewing WELL standard", detail: "Health & wellness features by concept" },
      { text: "Identifying cost-benefit tradeoffs", detail: "Premium vs. savings for each strategy" },
    ],
    "permitting-pathway": [
      { text: "Mapping required approvals", detail: "Zoning, building, fire, health, DOT" },
      { text: "Sequencing review process", detail: "Parallel vs. sequential approvals" },
      { text: "Estimating timelines", detail: "Jurisdiction-specific review durations" },
      { text: "Identifying potential delays", detail: "Design review, hearings, agency backlog" },
      { text: "Locating agency contacts", detail: "Building dept, planning, fire marshal" },
    ],
    "accessibility-review": [
      { text: "Reviewing federal ADA standards", detail: "2010 ADA Standards for Accessible Design" },
      { text: "Checking state accessibility code", detail: "State amendments exceeding federal ADA" },
      { text: "Calculating accessible parking", detail: "ADA §208 — spaces by total count" },
      { text: "Analyzing Fair Housing requirements", detail: "Covered dwelling units, adaptable features" },
      { text: "Identifying common pitfalls", detail: "Frequently missed requirements for this type" },
    ],
    "consultant-scoping": [
      { text: "Identifying required disciplines", detail: "Code-mandated and practically necessary" },
      { text: "Scoping recommended consultants", detail: "Specialty disciplines for this project type" },
      { text: "Checking special inspections", detail: "IBC Chapter 17 requirements" },
      { text: "Estimating fee ranges", detail: "Typical percentages by discipline" },
    ],
    "project-schedule": [
      { text: "Estimating design phase durations", detail: "SD, DD, CD by project size & type" },
      { text: "Researching permit timelines", detail: "Jurisdiction-specific review periods" },
      { text: "Projecting construction duration", detail: "Months by building type & complexity" },
      { text: "Identifying critical path items", detail: "Long-lead items, approval bottlenecks" },
      { text: "Calculating total timeline", detail: "Best case, typical, worst case" },
    ],
  };

  return [...base, ...(reportSpecific[reportId] || reportSpecific["code-analysis"])];
}

/* ═══════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════ */

export default function AppWorkspace() {
  const { user, signOut, loading: authLoading } = useAuth();

  // Sidebar
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [savedBriefs, setSavedBriefs] = useState<SavedBrief[]>([]);
  const [activeBriefId, setActiveBriefId] = useState<string | null>(null);

  // Wizard steps: 1=project, 2=select reports, 3=report-specific fields, 4=generating, 5=results
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [substep, setSubstep] = useState<1 | 2 | 3 | 4>(1);
  const [form, setForm] = useState<ProjectInput>(initialForm);
  const [selectedReports, setSelectedReports] = useState<string[]>(["code-analysis"]);
  const [extraFields, setExtraFields] = useState<Record<string, string>>({});

  // Generation
  const [streamText, setStreamText] = useState("");
  const [completedBrief, setCompletedBrief] = useState("");
  const [error, setError] = useState("");
  const [researchLogIndex, setResearchLogIndex] = useState(0);
  const [currentReportId, setCurrentReportId] = useState("code-analysis");
  const [reportMetadata, setReportMetadata] = useState<{
    searchQueries: string[];
    searchLog: { query: string; status: string; summary: string }[];
    reportName: string;
    generatedAt: string;
  } | null>(null);
  const [showMethodology, setShowMethodology] = useState(false);

  // Keep/Change verification state
  const [verificationDecisions, setVerificationDecisions] = useState<Record<number, { action: "keep" | "change"; newText?: string }>>({});
  const [showVerification, setShowVerification] = useState(true);

  const briefRef = useRef<HTMLDivElement>(null);
  const logInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const canSubmit = form.buildingType && form.location && form.squareFootage && form.stories;

  // Load saved briefs
  const loadBriefs = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("briefs").select("*").eq("user_id", user.id)
      .order("created_at", { ascending: false }).limit(50);
    if (data) setSavedBriefs(data);
  }, [user]);

  useEffect(() => { loadBriefs(); }, [loadBriefs]);

  // Research log animation
  const researchLog = getResearchLog(currentReportId, form.location);
  useEffect(() => {
    if (step === 4 && !streamText) {
      setResearchLogIndex(0);
      logInterval.current = setInterval(() => {
        setResearchLogIndex((prev) => prev < researchLog.length - 1 ? prev + 1 : prev);
      }, 3000);
    } else if (logInterval.current) {
      clearInterval(logInterval.current);
      logInterval.current = null;
    }
    return () => { if (logInterval.current) clearInterval(logInterval.current); };
  }, [step, streamText, researchLog.length]);

  const update = (field: keyof ProjectInput, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  function handleNewBrief() {
    setForm(initialForm);
    setStep(1);
    setSubstep(1);
    setStreamText("");
    setCompletedBrief("");
    setError("");
    setActiveBriefId(null);
    setSelectedReports(["code-analysis"]);
    setExtraFields({});
    setReportMetadata(null);
    setShowMethodology(false);
    setVerificationDecisions({});
    setShowVerification(true);
  }

  function handleSelectBrief(brief: SavedBrief) {
    setActiveBriefId(brief.id);
    setCompletedBrief(brief.brief_content);
    setStreamText("");
    setStep(5);
    setError("");
    if (brief.input_json) setForm(brief.input_json);
    else setForm({ ...initialForm, buildingType: brief.building_type, location: brief.location, squareFootage: brief.square_footage, stories: brief.stories, occupancyType: brief.occupancy_type || "" });
  }

  function toggleReport(id: string) {
    setSelectedReports((prev) =>
      prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]
    );
  }

  async function handleGenerate() {
    if (!canSubmit || selectedReports.length === 0) return;

    setStep(4);
    setError("");
    setStreamText("");
    setCompletedBrief("");
    setActiveBriefId(null);
    setCurrentReportId(selectedReports[0]);

    try {
      const reportId = selectedReports[0];
      setCurrentReportId(reportId);

      // Merge extra fields into additionalNotes for the API
      const extraContext = Object.entries(extraFields)
        .filter(([, v]) => v && v !== "Auto-classify" && v !== "Not sure" && v !== "Unknown" && v !== "Not decided")
        .map(([k, v]) => `${k}: ${v}`)
        .join("; ");

      const enrichedForm = {
        ...form,
        additionalNotes: [form.additionalNotes, extraContext].filter(Boolean).join("\n\n"),
        reportType: reportId,
      };

      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(enrichedForm),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Request failed (${res.status})`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response stream");

      const decoder = new TextDecoder();
      let accumulated = "";
      let metadataParsed = false;
      const DELIMITER = "\n<!--CODEBRIEF_METADATA_END-->\n";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });

        // Parse metadata from the first chunk
        if (!metadataParsed && accumulated.includes(DELIMITER)) {
          const delimIdx = accumulated.indexOf(DELIMITER);
          const metaJson = accumulated.slice(0, delimIdx);
          try {
            setReportMetadata(JSON.parse(metaJson));
          } catch { /* ignore parse errors */ }
          accumulated = accumulated.slice(delimIdx + DELIMITER.length);
          metadataParsed = true;
        }

        if (metadataParsed) {
          setStreamText(accumulated);
        }
      }

      // In case metadata wasn't found (backwards compatibility)
      if (!metadataParsed && accumulated.includes(DELIMITER)) {
        const delimIdx = accumulated.indexOf(DELIMITER);
        const metaJson = accumulated.slice(0, delimIdx);
        try { setReportMetadata(JSON.parse(metaJson)); } catch { /* */ }
        accumulated = accumulated.slice(delimIdx + DELIMITER.length);
      }

      setCompletedBrief(accumulated);
      setStreamText("");
      setStep(5);

      if (user) {
        const { data } = await supabase
          .from("briefs").insert({
            user_id: user.id, building_type: form.buildingType,
            location: form.location, square_footage: form.squareFootage,
            stories: form.stories, occupancy_type: form.occupancyType || null,
            brief_content: accumulated, input_json: form,
          }).select("id").single();
        if (data) { setActiveBriefId(data.id); loadBriefs(); }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setStep(3);
    }
  }

  async function handleDeleteBrief(id: string) {
    await supabase.from("briefs").delete().eq("id", id);
    if (activeBriefId === id) handleNewBrief();
    loadBriefs();
  }

  const displayContent = streamText || completedBrief;
  const currentReportName = REPORT_TYPES.find((r) => r.id === currentReportId)?.name || "Report";

  return (
    <div className="h-screen flex overflow-hidden" style={{ background: "var(--bg-base)" }}>
      {/* ═══ SIDEBAR ═══ */}
      <aside
        className={`${sidebarOpen ? "w-72" : "w-0"} flex-shrink-0 flex flex-col transition-all duration-200 overflow-hidden no-print`}
        style={{ background: "var(--bg-dark)", borderRight: "1px solid #222" }}
      >
        <div className="flex flex-col h-full w-72">
          <div className="px-4 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid #222" }}>
            <a href="/" className="flex items-center gap-2.5">
              <div className="w-6 h-6 flex items-center justify-center flex-shrink-0" style={{ border: "1px solid rgba(245,242,238,0.3)" }}>
                <span className="text-[8px] font-bold" style={{ color: "#f5f2ee" }}>CB</span>
              </div>
              <span className="text-xs font-medium tracking-widest uppercase" style={{ color: "#f5f2ee", letterSpacing: "0.12em" }}>CodeBrief</span>
            </a>
          </div>

          <div className="px-3 py-3">
            <button onClick={handleNewBrief} className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-medium tracking-wide transition-colors" style={{ background: "rgba(245,242,238,0.08)", color: "#f5f2ee", border: "1px solid rgba(245,242,238,0.12)" }} onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(245,242,238,0.14)")} onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(245,242,238,0.08)")}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" /></svg>
              New Brief
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-2">
            <p className="px-2 py-2 text-[9px] font-semibold tracking-widest uppercase" style={{ color: "rgba(245,242,238,0.3)" }}>History</p>
            {savedBriefs.length === 0 ? (
              <p className="px-2 py-4 text-xs" style={{ color: "rgba(245,242,238,0.2)" }}>No briefs yet</p>
            ) : (
              <div className="space-y-0.5">
                {savedBriefs.map((brief) => (
                  <button key={brief.id} onClick={() => handleSelectBrief(brief)} className="w-full text-left px-3 py-2.5 rounded-sm transition-colors group relative" style={{ background: activeBriefId === brief.id ? "rgba(245,242,238,0.1)" : "transparent", color: activeBriefId === brief.id ? "#f5f2ee" : "rgba(245,242,238,0.5)" }} onMouseEnter={(e) => { if (activeBriefId !== brief.id) e.currentTarget.style.background = "rgba(245,242,238,0.06)"; }} onMouseLeave={(e) => { if (activeBriefId !== brief.id) e.currentTarget.style.background = "transparent"; }}>
                    <p className="text-xs font-medium truncate">{brief.building_type}</p>
                    <p className="text-[10px] mt-0.5 truncate" style={{ color: "rgba(245,242,238,0.3)" }}>{brief.location}</p>
                    <p className="text-[9px] mt-0.5" style={{ color: "rgba(245,242,238,0.2)" }}>{new Date(brief.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</p>
                    <span onClick={(e) => { e.stopPropagation(); handleDeleteBrief(brief.id); }} className="absolute right-2 top-2.5 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer" style={{ color: "rgba(245,242,238,0.3)" }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg></span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="px-4 py-3" style={{ borderTop: "1px solid #222" }}>
            {user ? (
              <div className="flex items-center justify-between">
                <span className="text-[10px] truncate" style={{ color: "rgba(245,242,238,0.4)" }}>{user.email}</span>
                <button onClick={signOut} className="text-[10px] transition-colors" style={{ color: "rgba(245,242,238,0.25)" }}>Sign out</button>
              </div>
            ) : (
              <a href="/login" className="block text-center text-[10px] py-1.5 transition-colors" style={{ color: "rgba(245,242,238,0.5)", border: "1px solid rgba(245,242,238,0.12)" }}>Sign in to save briefs</a>
            )}
          </div>
        </div>
      </aside>

      {/* ═══ MAIN ═══ */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <div className="flex items-center justify-between px-6 py-2.5 flex-shrink-0 no-print" style={{ borderBottom: "1px solid var(--border-light)" }}>
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-1.5" style={{ color: "var(--text-muted)" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 6h18M3 12h18M3 18h18" /></svg>
            </button>
            {/* Step indicator */}
            <div className="flex items-center gap-1.5">
              {[1, 2, 3, 4, 5].map((s) => (
                <div key={s} className="flex items-center gap-1.5">
                  <div className="w-5 h-5 flex items-center justify-center text-[9px] font-bold" style={{
                    background: step >= s ? "var(--bg-dark)" : "var(--bg-warm)",
                    color: step >= s ? "var(--text-inverse)" : "var(--text-muted)",
                  }}>{s}</div>
                  {s < 5 && <div className="w-4 h-px" style={{ background: step > s ? "var(--bg-dark)" : "var(--border-light)" }} />}
                </div>
              ))}
              <span className="ml-2 text-[9px] tracking-widest uppercase" style={{ color: "var(--text-muted)" }}>
                {step === 1 && "Project"}
                {step === 2 && "Reports"}
                {step === 3 && "Details"}
                {step === 4 && "Researching"}
                {step === 5 && "Results"}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {step === 5 && (
              <>
                <button onClick={() => window.print()} className="text-[10px] tracking-widest uppercase" style={{ color: "var(--text-muted)" }}>Export PDF</button>
                <button onClick={handleNewBrief} className="px-3 py-1.5 text-[10px] font-medium tracking-widest uppercase" style={{ background: "var(--bg-dark)", color: "var(--text-inverse)" }}>New Brief</button>
              </>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">

          {/* ═══ STEP 1: PROJECT DETAILS (micro-steps) ═══ */}
          {step === 1 && (
            <div className="flex-1 flex items-center justify-center px-6">
              <div className="w-full max-w-md">
                {/* Progress dots */}
                <div className="flex items-center justify-center gap-2 mb-12">
                  {[1, 2, 3, 4].map((s) => (
                    <div
                      key={s}
                      className="h-1 transition-all duration-300"
                      style={{
                        width: substep === s ? 32 : 8,
                        background: substep >= s ? "var(--text-primary)" : "var(--border-light)",
                      }}
                    />
                  ))}
                </div>

                {/* Substep 1: What are you building? */}
                {substep === 1 && (
                  <div className="text-center">
                    <h1 className="text-3xl font-light tracking-tight mb-8" style={{ color: "var(--text-primary)", letterSpacing: "-0.02em" }}>
                      What are you building?
                    </h1>
                    <div className="grid grid-cols-2 gap-2 mb-8">
                      {BUILDING_TYPES.map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => { update("buildingType", t); setSubstep(2); }}
                          className="text-left px-4 py-3 text-sm transition-colors"
                          style={{
                            background: form.buildingType === t ? "var(--bg-dark)" : "#fff",
                            color: form.buildingType === t ? "var(--text-inverse)" : "var(--text-primary)",
                            border: form.buildingType === t ? "1px solid var(--bg-dark)" : "1px solid var(--border-medium)",
                          }}
                          onMouseEnter={(e) => { if (form.buildingType !== t) e.currentTarget.style.background = "var(--bg-warm)"; }}
                          onMouseLeave={(e) => { if (form.buildingType !== t) e.currentTarget.style.background = "#fff"; }}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Substep 2: Where? */}
                {substep === 2 && (
                  <div className="text-center">
                    <p className="text-[9px] font-semibold tracking-widest uppercase mb-3" style={{ color: "var(--accent)" }}>{form.buildingType}</p>
                    <h1 className="text-3xl font-light tracking-tight mb-8" style={{ color: "var(--text-primary)", letterSpacing: "-0.02em" }}>
                      Where is it located?
                    </h1>
                    <input
                      type="text"
                      value={form.location}
                      onChange={(e) => update("location", e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && form.location.length >= 3) setSubstep(3); }}
                      placeholder="City, State or full address"
                      className="form-input text-center text-lg py-4 mb-6"
                      autoFocus
                    />
                    <div className="flex items-center justify-between">
                      <button onClick={() => setSubstep(1)} className="text-[10px] tracking-widest uppercase" style={{ color: "var(--text-muted)" }}>Back</button>
                      <button
                        onClick={() => form.location.length >= 3 && setSubstep(3)}
                        disabled={form.location.length < 3}
                        className="px-6 py-2.5 text-[10px] font-semibold tracking-widest uppercase transition-opacity disabled:opacity-30"
                        style={{ background: "var(--bg-dark)", color: "var(--text-inverse)" }}
                      >
                        Continue
                      </button>
                    </div>
                  </div>
                )}

                {/* Substep 3: How big? */}
                {substep === 3 && (
                  <div className="text-center">
                    <p className="text-[9px] font-semibold tracking-widest uppercase mb-3" style={{ color: "var(--accent)" }}>
                      {form.buildingType} — {form.location}
                    </p>
                    <h1 className="text-3xl font-light tracking-tight mb-8" style={{ color: "var(--text-primary)", letterSpacing: "-0.02em" }}>
                      Size &amp; structure
                    </h1>
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div>
                        <label className="block text-[9px] font-semibold tracking-widest uppercase mb-2 text-left" style={{ color: "var(--text-muted)" }}>
                          Gross Area (SF) *
                        </label>
                        <input
                          type="text"
                          value={form.squareFootage}
                          onChange={(e) => update("squareFootage", e.target.value)}
                          placeholder="e.g., 25,000"
                          className="form-input text-center text-lg py-3"
                          autoFocus
                        />
                      </div>
                      <div>
                        <label className="block text-[9px] font-semibold tracking-widest uppercase mb-2 text-left" style={{ color: "var(--text-muted)" }}>
                          Stories Above Grade *
                        </label>
                        <input
                          type="text"
                          value={form.stories}
                          onChange={(e) => update("stories", e.target.value)}
                          placeholder="e.g., 4"
                          className="form-input text-center text-lg py-3"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 mb-6">
                      <div>
                        <label className="block text-[9px] font-semibold tracking-widest uppercase mb-2 text-left" style={{ color: "var(--text-muted)" }}>
                          Building Height (feet)
                        </label>
                        <input
                          type="text"
                          value={form.buildingHeight}
                          onChange={(e) => update("buildingHeight", e.target.value)}
                          placeholder="e.g., 52 ft (or leave blank)"
                          className="form-input text-center py-2.5"
                        />
                      </div>
                      <div>
                        <label className="block text-[9px] font-semibold tracking-widest uppercase mb-2 text-left" style={{ color: "var(--text-muted)" }}>
                          Construction Type
                        </label>
                        <select
                          value={form.constructionType}
                          onChange={(e) => update("constructionType", e.target.value)}
                          className="form-input py-2.5"
                        >
                          <option value="">Not sure — analyze</option>
                          <option value="Type I-A (noncombustible, highest fire rating)">Type I-A</option>
                          <option value="Type I-B (noncombustible)">Type I-B</option>
                          <option value="Type II-A (noncombustible, 1-hour)">Type II-A</option>
                          <option value="Type II-B (noncombustible, unrated)">Type II-B</option>
                          <option value="Type III-A (exterior noncombustible, 1-hour interior)">Type III-A</option>
                          <option value="Type III-B (exterior noncombustible, unrated interior)">Type III-B</option>
                          <option value="Type IV (heavy timber)">Type IV</option>
                          <option value="Type V-A (wood frame, 1-hour)">Type V-A</option>
                          <option value="Type V-B (wood frame, unrated)">Type V-B</option>
                        </select>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <button onClick={() => setSubstep(2)} className="text-[10px] tracking-widest uppercase" style={{ color: "var(--text-muted)" }}>Back</button>
                      <button
                        onClick={() => form.squareFootage && form.stories && setSubstep(4)}
                        disabled={!form.squareFootage || !form.stories}
                        className="px-6 py-2.5 text-[10px] font-semibold tracking-widest uppercase transition-opacity disabled:opacity-30"
                        style={{ background: "var(--bg-dark)", color: "var(--text-inverse)" }}
                      >
                        Continue
                      </button>
                    </div>
                  </div>
                )}

                {/* Substep 4: Anything else? (optional, skippable) */}
                {substep === 4 && (
                  <div className="text-center">
                    <p className="text-[9px] font-semibold tracking-widest uppercase mb-3" style={{ color: "var(--accent)" }}>
                      {form.buildingType} — {form.location} — {form.squareFootage} SF — {form.stories} stories
                    </p>
                    <h1 className="text-3xl font-light tracking-tight mb-2" style={{ color: "var(--text-primary)", letterSpacing: "-0.02em" }}>
                      Anything else?
                    </h1>
                    <p className="text-sm mb-8" style={{ color: "var(--text-muted)" }}>Optional — skip if you&apos;re not sure.</p>

                    <div className="text-left space-y-4 mb-8" style={{ background: "#fff", border: "1px solid var(--border-medium)", padding: "1.25rem" }}>
                      <FormField label="Occupancy Classification">
                        <select value={form.occupancyType} onChange={(e) => update("occupancyType", e.target.value)} className="form-input">
                          <option value="">Auto-classify</option>
                          {OCCUPANCY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </FormField>
                      <div className="grid grid-cols-2 gap-4">
                        <FormField label="Occupant Load">
                          <input type="text" value={form.occupantLoad} onChange={(e) => update("occupantLoad", e.target.value)} placeholder="e.g., 200" className="form-input" />
                        </FormField>
                        <FormField label="Lot Size">
                          <input type="text" value={form.lotSize} onChange={(e) => update("lotSize", e.target.value)} placeholder="e.g., 10,000 SF" className="form-input" />
                        </FormField>
                      </div>
                      <FormField label="Project Notes">
                        <textarea value={form.additionalNotes} onChange={(e) => update("additionalNotes", e.target.value)} rows={2} placeholder="Renovation vs. new construction, specific concerns..." className="form-input" />
                      </FormField>
                    </div>

                    <div className="flex items-center justify-between">
                      <button onClick={() => setSubstep(3)} className="text-[10px] tracking-widest uppercase" style={{ color: "var(--text-muted)" }}>Back</button>
                      <button
                        onClick={() => setStep(2)}
                        className="px-6 py-2.5 text-[10px] font-semibold tracking-widest uppercase"
                        style={{ background: "var(--bg-dark)", color: "var(--text-inverse)" }}
                      >
                        Continue — Select Reports
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ═══ STEP 2: SELECT REPORTS ═══ */}
          {step === 2 && (
            <div className="max-w-3xl mx-auto px-6 py-16">
              <div className="text-center mb-8">
                <p className="text-[9px] font-semibold tracking-widest uppercase mb-3" style={{ color: "var(--accent)" }}>Step 2 of 4</p>
                <h1 className="text-2xl font-light tracking-tight mb-2" style={{ color: "var(--text-primary)", letterSpacing: "-0.02em" }}>
                  Select your reports
                </h1>
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                  {form.buildingType} — {form.location} — {form.squareFootage} SF — {form.stories} stories
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                {REPORT_TYPES.map((rt) => {
                  const isSelected = selectedReports.includes(rt.id);
                  return (
                    <button
                      key={rt.id}
                      onClick={() => toggleReport(rt.id)}
                      className="text-left px-4 py-3.5 transition-all relative"
                      style={{
                        background: isSelected ? "var(--bg-dark)" : "#fff",
                        color: isSelected ? "var(--text-inverse)" : "var(--text-primary)",
                        border: isSelected ? "1px solid var(--bg-dark)" : "1px solid var(--border-medium)",
                      }}
                    >
                      {/* Checkmark */}
                      {isSelected && (
                        <div className="absolute top-2.5 right-2.5 w-4 h-4 flex items-center justify-center" style={{ background: "var(--accent)" }}>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><path d="M20 6L9 17l-5-5" /></svg>
                        </div>
                      )}
                      <div className="flex items-center gap-2.5 mb-1.5">
                        <span className="text-sm">{rt.icon}</span>
                        <span className="text-xs font-semibold tracking-wide">{rt.shortName}</span>
                      </div>
                      <p className="text-[10px] leading-relaxed" style={{ color: isSelected ? "rgba(245,242,238,0.55)" : "var(--text-muted)" }}>
                        {rt.description}
                      </p>
                    </button>
                  );
                })}
              </div>

              {error && (
                <div className="mt-4 px-4 py-3 text-xs" style={{ background: "#fef2f2", border: "1px solid #fca5a5", color: "var(--error)" }}>{error}</div>
              )}

              <div className="mt-6 flex items-center justify-between">
                <button onClick={() => setStep(1)} className="text-[10px] tracking-widest uppercase" style={{ color: "var(--text-muted)" }}>
                  Back
                </button>
                <div className="flex items-center gap-4">
                  <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                    {selectedReports.length} report{selectedReports.length !== 1 ? "s" : ""} selected — {selectedReports.length} brief{selectedReports.length !== 1 ? "s" : ""} used
                  </span>
                  <button
                    onClick={() => setStep(3)}
                    disabled={selectedReports.length === 0}
                    className="px-6 py-2.5 text-[10px] font-semibold tracking-widest uppercase transition-opacity disabled:opacity-30"
                    style={{ background: "var(--bg-dark)", color: "var(--text-inverse)" }}
                  >
                    Continue — Report Details
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ═══ STEP 3: REPORT-SPECIFIC FIELDS ═══ */}
          {step === 3 && (
            <div className="max-w-2xl mx-auto px-6 py-16">
              <div className="text-center mb-8">
                <p className="text-[9px] font-semibold tracking-widest uppercase mb-3" style={{ color: "var(--accent)" }}>Step 3 of 5</p>
                <h1 className="text-2xl font-light tracking-tight mb-2" style={{ color: "var(--text-primary)", letterSpacing: "-0.02em" }}>
                  Report-specific details
                </h1>
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                  These fields improve accuracy for your selected reports. Leave blank if unsure.
                </p>
              </div>

              <div className="space-y-6">
                {getFieldsForReports(selectedReports).map(({ reportId, reportName, fields }) => (
                  <div key={reportId} style={{ background: "#fff", border: "1px solid var(--border-medium)" }}>
                    <div className="px-5 py-2.5" style={{ background: "var(--bg-warm)", borderBottom: "1px solid var(--border-light)" }}>
                      <p className="text-[9px] font-semibold tracking-widest uppercase" style={{ color: "var(--text-secondary)" }}>
                        {reportName}
                      </p>
                    </div>
                    <div className="px-5 py-4 space-y-3.5">
                      {fields.map((field) => (
                        <div key={field.key}>
                          <label className="block text-[9px] font-semibold tracking-widest uppercase mb-1.5" style={{ color: "var(--text-muted)" }}>
                            {field.label}{field.required && <span style={{ color: "var(--error)" }}> *</span>}
                          </label>
                          {field.type === "select" ? (
                            <select
                              value={extraFields[field.key] || ""}
                              onChange={(e) => setExtraFields((prev) => ({ ...prev, [field.key]: e.target.value }))}
                              className="form-input"
                            >
                              <option value="">{field.options?.[0] || "Select..."}</option>
                              {field.options?.slice(1).map((opt) => (
                                <option key={opt} value={opt}>{opt}</option>
                              ))}
                            </select>
                          ) : field.type === "textarea" ? (
                            <textarea
                              value={extraFields[field.key] || ""}
                              onChange={(e) => setExtraFields((prev) => ({ ...prev, [field.key]: e.target.value }))}
                              rows={2}
                              placeholder={field.placeholder}
                              className="form-input"
                            />
                          ) : (
                            <input
                              type="text"
                              value={extraFields[field.key] || ""}
                              onChange={(e) => setExtraFields((prev) => ({ ...prev, [field.key]: e.target.value }))}
                              placeholder={field.placeholder}
                              className="form-input"
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 flex items-center justify-between">
                <button onClick={() => setStep(2)} className="text-[10px] tracking-widest uppercase" style={{ color: "var(--text-muted)" }}>
                  Back
                </button>
                <button
                  onClick={handleGenerate}
                  className="px-6 py-2.5 text-[10px] font-semibold tracking-widest uppercase"
                  style={{ background: "var(--bg-dark)", color: "var(--text-inverse)" }}
                >
                  Generate {selectedReports.length} Report{selectedReports.length !== 1 ? "s" : ""}
                </button>
              </div>
            </div>
          )}

          {/* ═══ STEP 4: RESEARCHING ═══ */}
          {step === 4 && !streamText && (
            <div className="max-w-2xl mx-auto px-6 py-16">
              <div className="text-center mb-10">
                <p className="text-[9px] font-semibold tracking-widest uppercase mb-3" style={{ color: "var(--accent)" }}>Step 4 of 5</p>
                <h1 className="text-2xl font-light tracking-tight mb-2" style={{ color: "var(--text-primary)", letterSpacing: "-0.02em" }}>
                  Researching {form.location}
                </h1>
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                  Searching public code databases and synthesizing your {currentReportName.toLowerCase()}
                </p>
              </div>

              {/* Live research log */}
              <div style={{ background: "var(--bg-dark)", border: "1px solid #222" }}>
                <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid #333" }}>
                  <span className="text-[9px] font-semibold tracking-widest uppercase" style={{ color: "var(--accent-light)" }}>
                    Research Log
                  </span>
                  <span className="text-[9px]" style={{ color: "rgba(245,242,238,0.3)" }}>
                    {researchLogIndex + 1} / {researchLog.length}
                  </span>
                </div>

                <div className="px-5 py-4 font-mono text-xs space-y-2.5" style={{ minHeight: 300 }}>
                  {researchLog.map((entry, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-3 transition-all duration-500"
                      style={{ opacity: i <= researchLogIndex ? 1 : 0.08 }}
                    >
                      <div className="flex-shrink-0 mt-0.5">
                        {i < researchLogIndex ? (
                          <span style={{ color: "#4ade80" }}>✓</span>
                        ) : i === researchLogIndex ? (
                          <div className="w-3 h-3 border border-t-transparent animate-spin mt-0.5" style={{ borderColor: "var(--accent-light)", borderTopColor: "transparent" }} />
                        ) : (
                          <span style={{ color: "#333" }}>○</span>
                        )}
                      </div>
                      <div>
                        <p style={{ color: i <= researchLogIndex ? "#f5f2ee" : "#333" }}>
                          {entry.text}
                        </p>
                        <p className="mt-0.5" style={{ color: i <= researchLogIndex ? "rgba(245,242,238,0.35)" : "#222" }}>
                          → {entry.detail}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Progress bar */}
                <div className="px-5 py-3" style={{ borderTop: "1px solid #333" }}>
                  <div className="w-full h-1" style={{ background: "#222" }}>
                    <div
                      className="h-full transition-all duration-1000"
                      style={{
                        width: `${((researchLogIndex + 1) / researchLog.length) * 100}%`,
                        background: "var(--accent)",
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ═══ STEP 4 → 5: STREAMING ═══ */}
          {step === 4 && streamText && (
            <div className="max-w-4xl mx-auto px-6 py-8">
              <div className="mb-4">
                <span className="text-[9px] font-semibold tracking-widest uppercase" style={{ color: "var(--accent)" }}>
                  Generating report...
                </span>
              </div>
              <div className="report-document" style={{ background: "#fff", border: "1px solid var(--border-medium)" }}>
                <ReportHeader form={form} reportName={currentReportName} />
                <div className="px-8 py-6 streaming-cursor">
                  <div className="brief-content" dangerouslySetInnerHTML={{ __html: marked.parse(streamText, { async: false }) as string }} />
                </div>
              </div>
            </div>
          )}

          {/* ═══ STEP 5: RESULTS ═══ */}
          {step === 5 && completedBrief && (
            <div ref={briefRef} className="max-w-4xl mx-auto px-6 py-8">
              <div className="mb-4 flex items-center justify-between">
                <span className="text-[9px] font-semibold tracking-widest uppercase" style={{ color: "var(--accent)" }}>
                  {currentReportName}
                </span>
                <span className="text-[9px]" style={{ color: "var(--text-muted)" }}>
                  Generated {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                </span>
              </div>

              <div className="report-document" style={{ background: "#fff", border: "1px solid var(--border-medium)" }}>
                <ReportHeader form={form} reportName={currentReportName} />
                <div className="px-8 py-6">
                  <div className="brief-content" dangerouslySetInnerHTML={{ __html: marked.parse(completedBrief, { async: false }) as string }} />
                </div>

                <div className="px-8 py-4" style={{ borderTop: "1px solid var(--border-light)" }}>
                  <p className="text-[10px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
                    <strong style={{ color: "var(--text-secondary)" }}>Disclaimer:</strong> This report is AI-generated research guidance and does not constitute legal or professional advice. Verify all requirements with the Authority Having Jurisdiction (AHJ) before proceeding with design or permit applications.
                  </p>
                </div>

                <div className="px-8 py-3 flex items-center justify-between" style={{ background: "var(--bg-dark)" }}>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 flex items-center justify-center" style={{ border: "1px solid rgba(245,242,238,0.3)" }}>
                      <span className="text-[6px] font-bold" style={{ color: "#f5f2ee" }}>CB</span>
                    </div>
                    <span className="text-[9px] tracking-widest uppercase" style={{ color: "rgba(245,242,238,0.5)" }}>Generated by CodeBrief</span>
                  </div>
                  <span className="text-[9px]" style={{ color: "rgba(245,242,238,0.25)" }}>codebrief.ai</span>
                </div>
              </div>

              {/* Verification Panel — Keep/Change for flagged items */}
              {(() => {
                const flaggedItems = extractFlaggedItems(completedBrief);
                return flaggedItems.length > 0 || Object.keys(verificationDecisions).length > 0 ? (
                  <VerificationPanel
                    flaggedItems={flaggedItems}
                    decisions={verificationDecisions}
                    onDecision={(id, action, newText) => {
                      setVerificationDecisions((prev) => ({
                        ...prev,
                        [id]: { action, newText },
                      }));
                    }}
                    onExportVerified={() => {
                      const flaggedItems = extractFlaggedItems(completedBrief);
                      const verifiedBrief = applyVerifications(completedBrief, flaggedItems, verificationDecisions);
                      // Create a new window with the verified report for printing
                      const printWindow = window.open("", "_blank");
                      if (printWindow) {
                        const html = marked.parse(verifiedBrief, { async: false }) as string;
                        printWindow.document.write(`
                          <html><head><title>${currentReportName} — Verified</title>
                          <style>
                            body { font-family: -apple-system, Helvetica, Arial, sans-serif; max-width: 7.5in; margin: 2rem auto; padding: 0 1rem; font-size: 11pt; line-height: 1.6; color: #1a1a1a; }
                            h1 { display: none; }
                            h2 { font-size: 10pt; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; padding: 0.4rem 0.6rem; background: #f5f2ee; border-left: 3px solid #111; margin: 1.5rem 0 0.5rem; }
                            h3 { font-size: 10pt; font-weight: 600; color: #333; margin: 1rem 0 0.4rem; padding: 0.4rem 0.6rem; background: #f5f2ee; border-left: 3px solid #8c7b6b; }
                            table { width: 100%; border-collapse: collapse; margin: 0.5rem 0; font-size: 9.5pt; }
                            th { background: #1a1a1a; color: #f5f2ee; font-size: 8pt; letter-spacing: 0.08em; text-transform: uppercase; padding: 0.5rem 0.6rem; text-align: left; border: 1px solid #000; }
                            td { border: 1px solid #e5e0d8; padding: 0.4rem 0.6rem; }
                            tbody tr:nth-child(even) { background: #faf8f5; }
                            td:first-child { font-weight: 600; }
                            p { margin: 0 0 0.5rem; }
                            ul, ol { margin: 0.5rem 0 0.75rem 1.25rem; }
                            strong { font-weight: 600; }
                            .verified-stamp { text-align: center; margin: 2rem 0; padding: 1rem; border: 2px solid #16a34a; color: #1a4a2e; font-size: 10pt; }
                          </style></head><body>
                          <div class="verified-stamp">✓ VERIFIED BY ARCHITECT — All flagged items reviewed and confirmed</div>
                          ${html}
                          <div style="margin-top:2rem;padding-top:1rem;border-top:1px solid #e5e0d8;font-size:9pt;color:#888;">
                            <p>Generated by CodeBrief — codebrief.ai</p>
                            <p>Verified by architect on ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</p>
                          </div>
                          </body></html>
                        `);
                        printWindow.document.close();
                        printWindow.print();
                      }
                    }}
                  />
                ) : (
                  <div className="mt-4 no-print" style={{ background: "#f0fdf4", border: "1px solid #86efac", padding: "1rem 1.25rem" }}>
                    <div className="flex items-center gap-2">
                      <span style={{ color: "#16a34a" }}>✓</span>
                      <span className="text-xs font-medium" style={{ color: "#1a4a2e" }}>
                        No items flagged for verification. All claims generated with source backing.
                      </span>
                    </div>
                  </div>
                );
              })()}

              {/* Methodology Panel */}
              {reportMetadata && (
                <div className="mt-4 no-print">
                  <button
                    onClick={() => setShowMethodology(!showMethodology)}
                    className="w-full flex items-center justify-between px-5 py-3 transition-colors"
                    style={{ background: "var(--bg-warm)", border: "1px solid var(--border-light)" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-stone)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "var(--bg-warm)")}
                  >
                    <div className="flex items-center gap-2.5">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5">
                        <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                        View methodology — how this report was generated
                      </span>
                    </div>
                    <svg
                      width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2"
                      style={{ transform: showMethodology ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}
                    >
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </button>

                  {showMethodology && (
                    <div style={{ border: "1px solid var(--border-light)", borderTop: "none", background: "#fff" }}>
                      {/* Search Queries */}
                      <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--border-light)" }}>
                        <p className="text-[9px] font-semibold tracking-widest uppercase mb-3" style={{ color: "var(--accent)" }}>
                          Search Queries Executed
                        </p>
                        <div className="space-y-1.5">
                          {reportMetadata.searchQueries.map((q, i) => (
                            <div key={i} className="flex items-start gap-2">
                              <span className="text-[10px] font-mono flex-shrink-0 mt-0.5" style={{ color: "var(--text-muted)" }}>{i + 1}.</span>
                              <span className="text-[11px] font-mono" style={{ color: "var(--text-secondary)" }}>{q}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Search Results Log */}
                      <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--border-light)" }}>
                        <p className="text-[9px] font-semibold tracking-widest uppercase mb-3" style={{ color: "var(--accent)" }}>
                          Sources Found
                        </p>
                        <div className="space-y-2.5">
                          {reportMetadata.searchLog.map((entry, i) => (
                            <div key={i} className="flex items-start gap-2.5">
                              <span className="flex-shrink-0 mt-0.5">
                                {entry.status === "success" ? (
                                  <span className="text-xs" style={{ color: "#16a34a" }}>✓</span>
                                ) : (
                                  <span className="text-xs" style={{ color: "var(--error)" }}>✗</span>
                                )}
                              </span>
                              <div className="min-w-0">
                                <p className="text-[11px] font-medium truncate" style={{ color: "var(--text-primary)" }}>
                                  {entry.query}
                                </p>
                                <p className="text-[10px] mt-0.5 leading-relaxed" style={{ color: "var(--text-muted)" }}>
                                  {entry.summary}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Generation Info */}
                      <div className="px-5 py-4">
                        <p className="text-[9px] font-semibold tracking-widest uppercase mb-3" style={{ color: "var(--accent)" }}>
                          Generation Details
                        </p>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <p className="text-[9px] tracking-widest uppercase" style={{ color: "var(--text-muted)" }}>Report Type</p>
                            <p className="text-xs" style={{ color: "var(--text-primary)" }}>{reportMetadata.reportName}</p>
                          </div>
                          <div>
                            <p className="text-[9px] tracking-widest uppercase" style={{ color: "var(--text-muted)" }}>Generated</p>
                            <p className="text-xs" style={{ color: "var(--text-primary)" }}>{new Date(reportMetadata.generatedAt).toLocaleString()}</p>
                          </div>
                          <div>
                            <p className="text-[9px] tracking-widest uppercase" style={{ color: "var(--text-muted)" }}>Searches Executed</p>
                            <p className="text-xs" style={{ color: "var(--text-primary)" }}>{reportMetadata.searchQueries.length}</p>
                          </div>
                          <div>
                            <p className="text-[9px] tracking-widest uppercase" style={{ color: "var(--text-muted)" }}>Successful</p>
                            <p className="text-xs" style={{ color: "var(--text-primary)" }}>{reportMetadata.searchLog.filter(e => e.status === "success").length} / {reportMetadata.searchLog.length}</p>
                          </div>
                        </div>
                        <p className="text-[9px] mt-4 leading-relaxed" style={{ color: "var(--text-muted)" }}>
                          This report was generated by searching public code databases for jurisdiction-specific requirements,
                          then synthesizing the results with IBC, IFC, IPC, ADA, IECC, and local amendment knowledge.
                          Items marked ⚠ VERIFY WITH AHJ indicate requirements that could not be confirmed from available sources
                          and should be verified with the Authority Having Jurisdiction.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   SUB-COMPONENTS
   ═══════════════════════════════════════════ */

function FormField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[9px] font-semibold tracking-widest uppercase mb-1.5" style={{ color: "var(--text-muted)" }}>
        {label}{required && <span style={{ color: "var(--error)" }}> *</span>}
      </label>
      {children}
    </div>
  );
}

function ReportHeader({ form, reportName }: { form: ProjectInput; reportName: string }) {
  return (
    <div className="px-8 py-5" style={{ background: "var(--bg-dark)" }}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[9px] font-semibold tracking-widest uppercase" style={{ color: "var(--accent-light)" }}>{reportName}</p>
          <h2 className="text-lg font-light tracking-tight mt-1" style={{ color: "#f5f2ee", letterSpacing: "-0.02em" }}>{form.buildingType}</h2>
          <p className="text-sm mt-0.5" style={{ color: "rgba(245,242,238,0.5)" }}>{form.location}</p>
        </div>
        <div className="text-right">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-5 h-5 flex items-center justify-center" style={{ border: "1px solid rgba(245,242,238,0.3)" }}>
              <span className="text-[7px] font-bold" style={{ color: "#f5f2ee" }}>CB</span>
            </div>
            <span className="text-[9px] font-medium tracking-widest uppercase" style={{ color: "rgba(245,242,238,0.6)" }}>CodeBrief</span>
          </div>
          <p className="text-[10px]" style={{ color: "rgba(245,242,238,0.3)" }}>
            {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
          </p>
        </div>
      </div>
      <div className="flex gap-8 mt-4 pt-3" style={{ borderTop: "1px solid #333" }}>
        <DataPoint label="Area" value={`${form.squareFootage} SF`} />
        <DataPoint label="Stories" value={form.stories} />
        {form.occupancyType && <DataPoint label="Occupancy" value={form.occupancyType.split(" ")[0]} />}
        {form.lotSize && <DataPoint label="Lot" value={form.lotSize} />}
      </div>
    </div>
  );
}

function DataPoint({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[8px] tracking-widest uppercase" style={{ color: "rgba(245,242,238,0.35)" }}>{label}</p>
      <p className="text-sm font-light" style={{ color: "#f5f2ee" }}>{value}</p>
    </div>
  );
}

/* ═══════════════════════════════════════════
   FLAGGED ITEM EXTRACTION
   Parses ⚠ markers from the completed brief
   ═══════════════════════════════════════════ */

interface FlaggedItem {
  id: number;
  fullMatch: string;
  context: string;
  flagText: string;
  lineIndex: number;
}

function extractFlaggedItems(briefText: string): FlaggedItem[] {
  const items: FlaggedItem[] = [];
  const lines = briefText.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Match lines containing ⚠ with various patterns
    if (line.includes("⚠")) {
      // Extract the meaningful part around the ⚠
      // Common patterns:
      // "⚠ VERIFY WITH AHJ"
      // "⚠ VERIFY WITH DENVER WATER"
      // "⚠ VERIFY SUBSECTION"
      // Table cells: "| Something | ⚠ VERIFY WITH AHJ | Details |"
      const flagMatch = line.match(/⚠\s*(?:VERIFY\s*(?:WITH\s+)?)?([^|⚠\n]*)/i);
      const flagText = flagMatch ? flagMatch[0].trim() : "⚠ VERIFY";

      // Get surrounding context (the table row or paragraph)
      let context = line.trim();
      // Clean up markdown table syntax for display
      if (context.startsWith("|")) {
        context = context.replace(/^\||\|$/g, "").split("|").map(c => c.trim()).filter(c => c).join(" — ");
      }
      // Remove markdown formatting
      context = context.replace(/\*\*/g, "").replace(/\*/g, "").replace(/`/g, "");

      items.push({
        id: items.length,
        fullMatch: line,
        context: context.slice(0, 300),
        flagText,
        lineIndex: i,
      });
    }
  }

  return items;
}

function applyVerifications(
  briefText: string,
  flaggedItems: FlaggedItem[],
  decisions: Record<number, { action: "keep" | "change"; newText?: string }>
): string {
  const lines = briefText.split("\n");

  for (const item of flaggedItems) {
    const decision = decisions[item.id];
    if (!decision) continue;

    if (decision.action === "keep") {
      // Replace ⚠ VERIFY with ✓ VERIFIED BY ARCHITECT
      lines[item.lineIndex] = lines[item.lineIndex]
        .replace(/⚠\s*VERIFY\s*(?:WITH\s+\w+)?(?:\s*—[^|]*)*/gi, "✓ VERIFIED")
        .replace(/⚠[^|]*/g, "✓ VERIFIED");
    } else if (decision.action === "change" && decision.newText) {
      // Replace the flagged content with the architect's correction
      lines[item.lineIndex] = lines[item.lineIndex]
        .replace(/⚠\s*VERIFY\s*(?:WITH\s+\w+)?(?:\s*—[^|]*)*/gi, `✓ ${decision.newText}`)
        .replace(/⚠[^|]*/g, `✓ ${decision.newText}`);
    }
  }

  return lines.join("\n");
}

/* ═══════════════════════════════════════════
   VERIFICATION PANEL COMPONENT
   ═══════════════════════════════════════════ */

function VerificationPanel({
  flaggedItems,
  decisions,
  onDecision,
  onExportVerified,
}: {
  flaggedItems: FlaggedItem[];
  decisions: Record<number, { action: "keep" | "change"; newText?: string }>;
  onDecision: (id: number, action: "keep" | "change", newText?: string) => void;
  onExportVerified: () => void;
}) {
  const reviewedCount = Object.keys(decisions).length;
  const totalCount = flaggedItems.length;
  const allReviewed = reviewedCount === totalCount;
  const progressPercent = totalCount > 0 ? Math.round((reviewedCount / totalCount) * 100) : 100;

  if (flaggedItems.length === 0) {
    return (
      <div className="mt-4 no-print" style={{ background: "#f0fdf4", border: "1px solid #86efac", padding: "1rem 1.25rem" }}>
        <div className="flex items-center gap-2">
          <span style={{ color: "#16a34a" }}>✓</span>
          <span className="text-xs font-medium" style={{ color: "#1a4a2e" }}>
            No items flagged for verification. All claims were generated with source backing.
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 no-print">
      {/* Header */}
      <div
        className="px-5 py-3 flex items-center justify-between"
        style={{ background: "var(--bg-dark)", borderBottom: "1px solid #333" }}
      >
        <div>
          <p className="text-[9px] font-semibold tracking-widest uppercase" style={{ color: "var(--accent-light)" }}>
            Verification Required
          </p>
          <p className="text-xs mt-0.5" style={{ color: "rgba(245,242,238,0.5)" }}>
            {totalCount} item{totalCount !== 1 ? "s" : ""} flagged — review each to finalize your report
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm font-semibold" style={{ color: "#f5f2ee" }}>
            {reviewedCount} / {totalCount}
          </p>
          <p className="text-[9px]" style={{ color: "rgba(245,242,238,0.35)" }}>reviewed</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full h-1" style={{ background: "var(--border-light)" }}>
        <div
          className="h-full transition-all duration-300"
          style={{
            width: `${progressPercent}%`,
            background: allReviewed ? "#16a34a" : "var(--accent)",
          }}
        />
      </div>

      {/* Flagged items */}
      <div style={{ border: "1px solid var(--border-light)", borderTop: "none" }}>
        {flaggedItems.map((item) => {
          const decision = decisions[item.id];
          const isReviewed = !!decision;

          return (
            <div
              key={item.id}
              className="px-5 py-4"
              style={{
                borderBottom: "1px solid var(--border-light)",
                background: isReviewed
                  ? decision.action === "keep" ? "#f0fdf4" : "#eff6ff"
                  : "#fff",
              }}
            >
              {/* Claim context */}
              <p className="text-xs leading-relaxed mb-3" style={{ color: "var(--text-secondary)" }}>
                <span className="font-semibold" style={{ color: "var(--accent)" }}>⚠</span>{" "}
                {item.context}
              </p>

              {/* Action buttons */}
              {!isReviewed ? (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onDecision(item.id, "keep")}
                    className="px-3 py-1.5 text-[10px] font-medium tracking-wide transition-colors"
                    style={{ background: "#f0fdf4", border: "1px solid #86efac", color: "#1a4a2e" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "#dcfce7")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "#f0fdf4")}
                  >
                    ✓ Keep as-is
                  </button>
                  <ChangeButton
                    onSubmit={(text) => onDecision(item.id, "change", text)}
                  />
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-medium" style={{ color: decision.action === "keep" ? "#16a34a" : "#2563eb" }}>
                    {decision.action === "keep" ? "✓ Verified — kept as-is" : `✓ Changed to: "${decision.newText}"`}
                  </span>
                  <button
                    onClick={() => onDecision(item.id, "keep")}
                    className="text-[9px] underline"
                    style={{ color: "var(--text-muted)" }}
                  >
                    re-review
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Export verified report */}
      <div
        className="px-5 py-4 flex items-center justify-between"
        style={{
          background: allReviewed ? "#f0fdf4" : "var(--bg-warm)",
          border: "1px solid var(--border-light)",
          borderTop: "none",
        }}
      >
        <p className="text-[10px]" style={{ color: allReviewed ? "#1a4a2e" : "var(--text-muted)" }}>
          {allReviewed
            ? "All items verified. Your report is ready to export."
            : `${totalCount - reviewedCount} item${totalCount - reviewedCount !== 1 ? "s" : ""} remaining`}
        </p>
        <button
          onClick={onExportVerified}
          disabled={!allReviewed}
          className="px-4 py-2 text-[10px] font-semibold tracking-widest uppercase transition-opacity disabled:opacity-30"
          style={{
            background: allReviewed ? "#16a34a" : "var(--bg-dark)",
            color: "#fff",
          }}
        >
          {allReviewed ? "Export Verified Report" : "Review All Items First"}
        </button>
      </div>
    </div>
  );
}

function ChangeButton({ onSubmit }: { onSubmit: (text: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="px-3 py-1.5 text-[10px] font-medium tracking-wide transition-colors"
        style={{ background: "#eff6ff", border: "1px solid #93c5fd", color: "#1e40af" }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "#dbeafe")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "#eff6ff")}
      >
        ✎ Change to...
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2 flex-1">
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Enter the correct information..."
        className="form-input text-xs flex-1"
        autoFocus
        onKeyDown={(e) => {
          if (e.key === "Enter" && text.trim()) {
            onSubmit(text.trim());
            setEditing(false);
            setText("");
          }
          if (e.key === "Escape") {
            setEditing(false);
            setText("");
          }
        }}
      />
      <button
        onClick={() => {
          if (text.trim()) {
            onSubmit(text.trim());
            setEditing(false);
            setText("");
          }
        }}
        disabled={!text.trim()}
        className="px-3 py-1.5 text-[10px] font-medium disabled:opacity-30"
        style={{ background: "#2563eb", color: "#fff" }}
      >
        Save
      </button>
      <button
        onClick={() => { setEditing(false); setText(""); }}
        className="text-[10px]"
        style={{ color: "var(--text-muted)" }}
      >
        Cancel
      </button>
    </div>
  );
}
