# Fabrication Pattern Analysis — What We Caught and How to Fix Each

Based on LLM-benchmarked results across 11 Denver reports.

## Pattern 1: Wrong Subsection Numbers (Most Common)
**Reports affected:** code-analysis, accessibility-review, energy-compliance, site-constraints, consultant-scoping
**Examples:**
- §R404.5 cited for EV charging (actually R404.4)
- §907.2.8 cited for R-2 (actually covers R-1)
- Table 504.3 cited for stories (actually 504.4)
- Table 1006.3.1 cited (old IBC designation, 2024 uses 1006.3.3)
- §208.2.4 (doesn't exist in ADA)
- §216.5 (doesn't exist in ADA)
- §1705.16 cited for fire-resistant penetrations (actually EIFS)

**Root cause:** Model has training data with subsection numbers from multiple IBC/ADA editions. Confidently cites the one it "remembers" without checking against current search results.

**Fix in prompts:** ✅ Already added subsection rule (1b) to anti-fabrication rules. Deploy needed.

**Fix in report prompts:** For energy-compliance, add: "R404.4 = EV charging, R404.5 = additional electric infrastructure. These are commonly confused. Only cite the subsection if search results confirm it."

## Pattern 2: Overgeneralized Requirements
**Reports affected:** accessibility-review, consultant-scoping
**Examples:**
- "ADA 2% minimum for parking" — actually only for R-2/R-3/R-4 with 501-1000 spaces
- "Zoning permit required for all new construction" — exempts minor detached structures
- §206.4 described as "minimum 1 entrance" — actually requires 60%

**Root cause:** Model simplifies nuanced requirements into universal rules. Real code has exceptions and conditions.

**Fix in prompts:** Add to anti-fabrication rules: "When citing a requirement, always specify which occupancy types, building sizes, or conditions trigger it. Never state a requirement as 'required for all' unless the search results explicitly confirm universal applicability."

## Pattern 3: Wrong Agency Names
**Reports affected:** permitting-pathway
**Examples:**
- "Department of Public Works" — Denver uses DOTI (Department of Transportation & Infrastructure)

**Root cause:** Model uses generic/common government department names that don't match the specific jurisdiction.

**Fix in prompts:** Add to anti-fabrication rules: "Agency and department names vary by jurisdiction. Only use the EXACT name found in search results. Denver's 'Department of Transportation & Infrastructure (DOTI)' is NOT 'Department of Public Works.'"

## Pattern 4: Code Name Used as Zone District
**Reports affected:** site-constraints, consultant-scoping
**Examples:**
- "DZC zone district" — DZC is the Denver Zoning Code, not a district

**Root cause:** Model confuses the code's acronym with a zone designation.

**Fix in prompts:** ✅ Already added zone-code-vs-district rule (2b) to anti-fabrication rules. Deploy needed.

## Pattern 5: Fabricated Fee Amounts from Training Data
**Reports affected:** cost-context, risk-due-diligence
**Examples:**
- $1,940/unit water tap fee (real: $2,166-$2,451)
- $5,000 floodplain permit (real: $300-$1,500)
- $39,000 plan review fee (Denver uses percentages, not fixed amounts)

**Root cause:** Model has fee amounts memorized from training data that are outdated or wrong.

**Fix in prompts:** ✅ Already addressed with strict fee-specific rules in anti-fabrication prompt. Cost-context v3 showed 0 fabricated fees (improvement confirmed). But risk-due-diligence still had some — the rules work for cost-context's prompt but not all report types equally.

## Pattern 6: Incorrect Timelines
**Reports affected:** permitting-pathway, project-schedule
**Examples:**
- "30-45 day zoning permit" — Denver targets 180 days
- "10 business day re-evaluation" — actual is 5 business days

**Root cause:** Model generates plausible-sounding timeline estimates that don't match published agency targets.

**Fix in prompts:** ✅ Already addressed in anti-fabrication rules. Partially effective.

## Pattern 7: Math/Logic Errors (Rare)
**Reports affected:** site-constraints
**Examples:**
- "12,000 - 4,000 = 8,100" (correct: 8,000)
- "45,000 SF ÷ 5 = 9,000 SF footprint" (conceptually wrong — footprint ≠ total/stories)

**Root cause:** Arithmetic errors and conceptual misapplications.

**Fix in prompts:** Add: "Double-check all arithmetic. 12,000 - 4,000 = 8,000, not 8,100. Building footprint is measured at grade, not derived by dividing total area by number of stories."

## Summary of Fixes Needed

| Fix | Status | Where |
|---|---|---|
| Subsection rule (1b) | ✅ Written, not deployed | Anti-fab rules in route.ts |
| Zone-code-vs-district (2b) | ✅ Written, not deployed | Anti-fab rules in route.ts |
| Overgeneralization rule | ❌ Need to add | Anti-fab rules |
| Agency name rule | ❌ Need to add | Anti-fab rules |
| Math double-check rule | ❌ Need to add | Anti-fab rules |
| Energy-specific subsection guidance | ❌ Need to add | Energy-compliance prompt |
| Scope-specificity for requirements | ❌ Need to add | All report prompts via anti-fab |

## Remaining anti-fabrication rules to add (items 8-10):

8. REQUIREMENT SCOPE — NEVER OVERGENERALIZE:
   When citing a requirement, always specify which occupancy types, building sizes, or conditions trigger it. Never state a requirement as "required for all" or "applies to all construction" unless the search results explicitly confirm universal applicability with no exceptions.

9. AGENCY AND DEPARTMENT NAMES:
   Government agency names vary by jurisdiction. Only use the EXACT agency name found in search results. Common mistakes: "Department of Public Works" when the actual name is "Department of Transportation & Infrastructure (DOTI)." If unsure of the exact name, write "the responsible municipal department (⚠ VERIFY)."

10. ARITHMETIC AND LOGIC:
    Double-check every calculation before writing it. Common errors: subtraction (12,000 - 4,000 = 8,000, NOT 8,100), building footprint is a measured horizontal area at grade level and CANNOT be derived by dividing total building area by number of stories. If a calculation seems off, redo it.
