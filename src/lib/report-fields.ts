export interface ReportField {
  key: string;
  label: string;
  type: "text" | "select" | "textarea";
  placeholder?: string;
  options?: string[];
  required?: boolean;
}

export const REPORT_FIELDS: Record<string, ReportField[]> = {
  "code-analysis": [
    { key: "occupancyType", label: "Occupancy Classification", type: "select", options: ["Auto-classify", "A-1 Assembly (theater)", "A-2 Assembly (restaurant, bar)", "A-3 Assembly (worship, recreation)", "B Business (office)", "E Educational", "F-1 Factory (moderate hazard)", "H Hazardous", "I-1 Institutional (assisted living)", "I-2 Institutional (hospital)", "M Mercantile (retail)", "R-1 Residential (hotel)", "R-2 Residential (apartment)", "R-3 Residential (1-2 family)", "S-1 Storage (moderate hazard)", "S-2 Storage (low hazard)"] },
    { key: "sprinklered", label: "Sprinklered?", type: "select", options: ["Unknown — analyze requirement", "Yes — NFPA 13", "Yes — NFPA 13R", "No"] },
    { key: "mixedUseBreakdown", label: "Mixed-Use Breakdown (if applicable)", type: "text", placeholder: "e.g., Ground floor retail 5,000 SF, floors 2-4 residential" },
    { key: "fireSeperationDistance", label: "Distance to Nearest Property Line", type: "text", placeholder: "e.g., 10 ft to north, 5 ft to east, or unknown" },
    { key: "occupantLoad", label: "Estimated Occupant Load", type: "text", placeholder: "e.g., 200 (or leave blank to calculate)" },
    { key: "newOrRenovation", label: "Project Scope", type: "select", options: ["New construction", "Renovation / alteration", "Addition to existing", "Change of occupancy"] },
  ],

  "zoning-feasibility": [
    { key: "siteAddress", label: "Site Address (specific)", type: "text", placeholder: "Full street address for parcel lookup", required: true },
    { key: "zoningDistrict", label: "Known Zoning District (if any)", type: "text", placeholder: "e.g., C-MX-5, R-3, or leave blank" },
    { key: "lotSize", label: "Lot Size", type: "text", placeholder: "e.g., 10,000 SF or 0.25 acres", required: true },
    { key: "lotDimensions", label: "Lot Dimensions", type: "text", placeholder: "e.g., 100 ft × 100 ft or irregular" },
    { key: "proposedUse", label: "Proposed Use Description", type: "text", placeholder: "e.g., ground floor retail, 40 residential units above" },
    { key: "proposedHeight", label: "Proposed Building Height (feet)", type: "text", placeholder: "e.g., 55 ft" },
    { key: "proposedUnitCount", label: "Proposed Unit Count / Density", type: "text", placeholder: "e.g., 40 residential units, 3 retail spaces" },
    { key: "intendedFAR", label: "Intended FAR (if known)", type: "text", placeholder: "e.g., 3.5, or leave blank to calculate" },
    { key: "existingStructures", label: "Existing Structures on Site", type: "select", options: ["Vacant lot", "Existing building — to be demolished", "Existing building — to be renovated", "Existing building — addition planned", "Unknown"] },
    { key: "knownOverlays", label: "Known Overlay Districts", type: "text", placeholder: "e.g., historic district, transit overlay, or unknown" },
  ],

  "energy-compliance": [
    { key: "compliancePath", label: "Compliance Path Preference", type: "select", options: ["Not sure — recommend one", "Prescriptive", "Performance (whole-building)", "Energy Rating Index (ERI)"] },
    { key: "targetCodeYear", label: "Target Energy Code Year", type: "select", options: ["Whatever jurisdiction requires", "IECC 2021", "IECC 2024", "ASHRAE 90.1-2019", "ASHRAE 90.1-2022"] },
    { key: "heatingSource", label: "Heating Source", type: "select", options: ["Not decided", "Gas furnace / boiler", "Electric heat pump — air source", "Electric heat pump — ground source", "Electric resistance", "District heating", "Other"] },
    { key: "coolingSystem", label: "Cooling System", type: "select", options: ["Not decided", "Rooftop units (RTU)", "Variable refrigerant flow (VRF)", "Chiller plant", "Split systems", "Heat pump (same as heating)", "Other"] },
    { key: "ventilationStrategy", label: "Ventilation Strategy", type: "select", options: ["Not decided", "Standard RTU with economizer", "Dedicated outdoor air system (DOAS)", "Natural ventilation", "Energy recovery ventilator (ERV)", "Other"] },
    { key: "wallAssembly", label: "Anticipated Wall Assembly", type: "select", options: ["Not decided", "Metal stud with continuous insulation", "CMU / masonry", "Wood frame", "Precast concrete", "Curtain wall", "Other"] },
    { key: "roofAssembly", label: "Anticipated Roof Assembly", type: "select", options: ["Not decided", "Built-up / modified bitumen", "Single-ply membrane (TPO/EPDM)", "Metal roof", "Green roof", "Other"] },
    { key: "windowToWallRatio", label: "Estimated Window-to-Wall Ratio", type: "select", options: ["Not sure", "Less than 30%", "30-40%", "40-50%", "Over 50%"] },
    { key: "renewableGoals", label: "Renewable Energy Goals", type: "select", options: ["None / not required", "Solar-ready only", "Rooftop solar PV planned", "Net-zero energy target", "Other"] },
    { key: "domesticHotWater", label: "Domestic Hot Water Source", type: "select", options: ["Not decided", "Gas", "Electric (standard)", "Heat pump water heater", "Solar thermal", "Other"] },
  ],

  "cost-context": [
    { key: "qualityLevel", label: "Construction Quality Level", type: "select", options: ["Economy / budget", "Standard / mid-range", "Premium / high-end", "Luxury / institutional"], required: true },
    { key: "newOrRenovation", label: "Project Scope", type: "select", options: ["New construction", "Renovation / gut rehab", "Adaptive reuse", "Addition to existing"], required: true },
    { key: "structuralSystem", label: "Anticipated Structural System", type: "select", options: ["Not decided", "Wood frame", "Steel frame", "Concrete", "Masonry bearing wall", "Hybrid", "Mass timber"] },
    { key: "belowGrade", label: "Below-Grade Levels", type: "select", options: ["None", "1 level (parking or utility)", "2+ levels", "Full basement"] },
    { key: "laborMarket", label: "Labor Market", type: "select", options: ["Not sure", "Union / prevailing wage", "Open shop / non-union", "Mixed"] },
    { key: "siteConditions", label: "Site Conditions", type: "select", options: ["Flat / standard", "Sloped / challenging", "Brownfield / contaminated", "Waterfront", "Urban infill / tight access"] },
    { key: "targetCompletion", label: "Target Completion Date", type: "text", placeholder: "e.g., Q4 2027 (for cost escalation)" },
    { key: "siteWorkScope", label: "Site Work Scope", type: "select", options: ["Minimal — basic grading and paving", "Moderate — parking lot, landscaping, utilities", "Extensive — structured parking, retaining walls, significant grading", "Unknown"] },
    { key: "ffeInclusion", label: "FF&E (Furniture, Fixtures, Equipment) in Budget?", type: "select", options: ["No — separate budget", "Yes — included", "Partial — some owner-furnished", "Unknown"] },
  ],

  "risk-due-diligence": [
    { key: "siteAddress", label: "Site Address (specific for mapping)", type: "text", placeholder: "Full street address for flood/seismic lookup", required: true },
    { key: "floodZone", label: "FEMA Flood Zone Status", type: "select", options: ["Unknown — need to check", "Zone X (minimal risk)", "Zone AE / A (100-year floodplain)", "Zone VE (coastal high hazard)", "Not in a flood zone"] },
    { key: "seismicZone", label: "Seismic Design Category", type: "select", options: ["Unknown — need to check", "SDC A (very low)", "SDC B (low)", "SDC C (moderate)", "SDC D (high)", "SDC E/F (very high)"] },
    { key: "phaseOneESA", label: "Phase I Environmental Assessment", type: "select", options: ["Not done", "Done — clean", "Done — RECs identified", "Unknown"] },
    { key: "geotechnical", label: "Geotechnical Investigation", type: "select", options: ["Not done", "Done — no issues", "Done — issues identified", "Unknown"] },
    { key: "historicStatus", label: "Historic Register Status", type: "select", options: ["Not listed / not in district", "In a historic district", "Individually listed", "Unknown — need to check"] },
    { key: "zoningConformance", label: "Current Zoning Conformance", type: "select", options: ["Conforming use", "Legal nonconforming (grandfathered)", "Nonconforming — needs variance", "Unknown"] },
    { key: "knownEasements", label: "Known Easements or Encumbrances", type: "text", placeholder: "e.g., utility easement on west side, or none known" },
    { key: "titleReport", label: "Title Report Available?", type: "select", options: ["Yes", "No", "In progress"] },
  ],

  "site-constraints": [
    { key: "lotSize", label: "Lot Size", type: "text", placeholder: "e.g., 10,000 SF or 0.25 acres", required: true },
    { key: "lotDimensions", label: "Lot Dimensions", type: "text", placeholder: "e.g., 100 ft wide × 120 ft deep" },
    { key: "lotFrontage", label: "Street Frontage", type: "text", placeholder: "e.g., 100 ft on Main St" },
    { key: "topography", label: "Topography", type: "select", options: ["Flat", "Gently sloped", "Steeply sloped", "Varies / complex", "Unknown"] },
    { key: "existingStructures", label: "Existing Structures", type: "select", options: ["Vacant lot", "Structure to be demolished", "Structure to remain", "Unknown"] },
    { key: "surveyAvailable", label: "Survey Available?", type: "select", options: ["Yes — ALTA/boundary survey", "Yes — topographic survey", "No survey yet", "Unknown"] },
    { key: "adjacentUses", label: "Adjacent Uses", type: "text", placeholder: "e.g., residential to north, commercial to south" },
    { key: "utilityAvailability", label: "Utility Availability", type: "select", options: ["All available at street (water, sewer, gas, electric)", "Some available — need to verify capacity", "Limited — may need extensions", "Unknown"] },
    { key: "floodZone", label: "Flood Zone", type: "select", options: ["Unknown", "Not in flood zone", "In 100-year floodplain", "In coastal high hazard zone"] },
    { key: "treeCanopy", label: "Significant Trees / Protected Vegetation", type: "select", options: ["None", "Some trees — may need survey", "Significant canopy — preservation likely required", "Unknown"] },
    { key: "accessPoints", label: "Site Access / Curb Cuts", type: "text", placeholder: "e.g., existing curb cut on Main St, or need new access" },
  ],

  "sustainability-scoping": [
    { key: "certificationTarget", label: "Target Certification", type: "select", options: ["None — meet code only", "LEED Certified", "LEED Silver", "LEED Gold", "LEED Platinum", "WELL Certification", "Fitwel", "Living Building Challenge", "Multiple / exploring"], required: true },
    { key: "ownerPriorityEnergy", label: "Priority: Energy Performance", type: "select", options: ["Not a priority", "Moderate priority", "High priority", "Highest priority"] },
    { key: "ownerPriorityWater", label: "Priority: Water Conservation", type: "select", options: ["Not a priority", "Moderate priority", "High priority", "Highest priority"] },
    { key: "ownerPriorityCarbon", label: "Priority: Carbon / Embodied Carbon", type: "select", options: ["Not a priority", "Moderate priority", "High priority", "Highest priority"] },
    { key: "ownerPriorityWellness", label: "Priority: Occupant Health & Wellness", type: "select", options: ["Not a priority", "Moderate priority", "High priority", "Highest priority"] },
    { key: "budgetForSustainability", label: "Budget for Sustainability Premium", type: "select", options: ["Minimal — code minimum only", "Moderate — 2-5% premium acceptable", "Significant — 5-10% premium acceptable", "Aggressive — performance over cost", "Unknown"] },
    { key: "netZero", label: "Net-Zero Energy Goal?", type: "select", options: ["No", "Net-zero ready", "Net-zero operational", "Exploring"] },
    { key: "stormwaterScope", label: "Stormwater / Green Infrastructure in Scope?", type: "select", options: ["Code minimum only", "Enhanced — rain gardens, bioswales", "Green roof planned", "Full LID (low impact development)", "Unknown"] },
    { key: "waterReduction", label: "Water Reduction Goals", type: "select", options: ["Code minimum", "20% reduction beyond code", "40%+ reduction (LEED Gold level)", "Net-zero water", "Unknown"] },
  ],

  "permitting-pathway": [
    { key: "jurisdictionAuthority", label: "Reviewing Authority / Jurisdiction", type: "text", placeholder: "e.g., City of Portland BDS, or leave blank to determine" },
    { key: "permitTypes", label: "Permit Types Anticipated", type: "text", placeholder: "e.g., building, grading, conditional use, demolition" },
    { key: "preAppMeeting", label: "Pre-Application Meeting Status", type: "select", options: ["Not scheduled", "Scheduled", "Completed", "Not required"] },
    { key: "variancesNeeded", label: "Variances or Special Exceptions?", type: "select", options: ["None anticipated", "Likely — height or density", "Likely — setback or parking", "Likely — use (conditional use permit)", "Unknown — need analysis"] },
    { key: "designReview", label: "Design Review Board Applicable?", type: "select", options: ["Yes", "No", "Unknown"] },
    { key: "environmentalReview", label: "Environmental Review Trigger", type: "select", options: ["None anticipated", "NEPA (federal)", "State equivalent (CEQA, SEPA, etc.)", "Unknown"] },
    { key: "thirdPartyReview", label: "Third-Party Plan Review Expected?", type: "select", options: ["No — jurisdiction review only", "Yes — third-party plan review", "Unknown"] },
    { key: "timelineUrgency", label: "Timeline Urgency", type: "select", options: ["Standard — no rush", "Moderate — prefer expedited", "Urgent — hard deadline", "Fast-track — parallel permitting needed"] },
    { key: "priorApprovals", label: "Any Prior Approvals Obtained?", type: "text", placeholder: "e.g., zoning approved, site plan in review, or none" },
  ],

  "accessibility-review": [
    { key: "publicOrPrivate", label: "Facility Type", type: "select", options: ["Public accommodation (open to public)", "Private / restricted access", "Mixed — public and private areas"], required: true },
    { key: "newOrAlteration", label: "New Construction or Alteration?", type: "select", options: ["New construction", "Alteration — less than 20% of building value", "Alteration — 20% or more of building value", "Alteration — primary function area"], required: true },
    { key: "alterationCostRatio", label: "Alteration Cost vs Building Value (if alteration)", type: "text", placeholder: "e.g., $500K alteration / $3M building = 17% (20% threshold triggers path-of-travel)" },
    { key: "federalFunding", label: "Federal Funding Involved?", type: "select", options: ["No", "Yes — triggers Section 504 / Rehabilitation Act", "Unknown"] },
    { key: "residentialUnits", label: "Residential Units (Fair Housing Act — 4+ units triggers)", type: "text", placeholder: "e.g., 40 units" },
    { key: "verticalCirculation", label: "Elevator Planned?", type: "select", options: ["Yes", "No — analyzing if required", "Not decided"] },
    { key: "stateAccessCode", label: "Known State Accessibility Code", type: "text", placeholder: "e.g., California CBC Ch 11B, Texas TAS, or leave blank" },
  ],

  "consultant-scoping": [
    { key: "deliveryMethod", label: "Project Delivery Method", type: "select", options: ["Design-Bid-Build", "CM at Risk", "Design-Build", "Integrated Project Delivery (IPD)", "Not decided"], required: true },
    { key: "mepComplexity", label: "MEP Complexity", type: "select", options: ["Standard — typical office/residential", "Moderate — restaurant, medical office, lab", "High — hospital, data center, clean room", "Unknown"] },
    { key: "structuralSystem", label: "Structural System", type: "select", options: ["Wood frame", "Steel frame", "Concrete", "Masonry", "Mass timber", "Hybrid / not decided"] },
    { key: "specialSystems", label: "Specialty Systems Anticipated", type: "text", placeholder: "e.g., commercial kitchen, AV/acoustics, security, curtain wall, pool" },
    { key: "commissioningRequired", label: "Commissioning Required?", type: "select", options: ["No", "Yes — fundamental (ASHRAE 202)", "Yes — enhanced (LEED requirement)", "Unknown"] },
    { key: "projectBudget", label: "Approximate Project Budget", type: "text", placeholder: "e.g., $5M-8M (helps scope consultant level)" },
    { key: "inHouseCapabilities", label: "In-House Capabilities", type: "text", placeholder: "e.g., we do interior design in-house, need all engineering external" },
  ],

  "project-schedule": [
    { key: "targetOccupancy", label: "Target Occupancy Date", type: "text", placeholder: "e.g., Fall 2027, or ASAP, or flexible" },
    { key: "deliveryMethod", label: "Project Delivery Method", type: "select", options: ["Design-Bid-Build (sequential)", "CM at Risk (overlapping)", "Design-Build (fast-track)", "Not decided"], required: true },
    { key: "entitlementStatus", label: "Entitlement / Zoning Status", type: "select", options: ["Not started", "Pre-application meeting done", "In progress", "Approved / complete"], required: true },
    { key: "fastTrack", label: "Fast-Track Strategy?", type: "select", options: ["No — standard sequential", "Yes — overlap design and permitting", "Yes — phased permits (foundation first)", "Exploring options"] },
    { key: "phasedOccupancy", label: "Phased Occupancy Required?", type: "select", options: ["No — single move-in", "Yes — phased by floor/wing", "Yes — shell and core then tenant fit-out", "Unknown"] },
    { key: "financingMilestones", label: "Financing / Closing Milestones", type: "text", placeholder: "e.g., construction loan closing Q1 2027, or N/A" },
    { key: "seasonalConstraints", label: "Seasonal Construction Constraints", type: "select", options: ["None significant", "Cold weather — limited winter work", "Rainy season impacts", "Hurricane season", "Unknown"] },
    { key: "longLeadItems", label: "Known Long-Lead Items", type: "text", placeholder: "e.g., structural steel, elevator, switchgear, or none identified" },
  ],

  "program-validation": [
    { key: "lotSize", label: "Lot Size", type: "text", placeholder: "e.g., 10,000 SF or 0.25 acres", required: true },
    { key: "programDescription", label: "Space Program / Owner's Requirements", type: "textarea", placeholder: "e.g., 40 residential units (avg 900 SF), ground floor retail 5,000 SF, fitness center 1,500 SF, lobby/amenity 2,000 SF, 60 parking spaces", required: true },
    { key: "parkingStrategy", label: "Parking Strategy", type: "select", options: ["Surface parking", "Structured parking (above grade)", "Below-grade parking", "Mixed surface + structured", "No parking (transit-oriented)", "Not decided"] },
    { key: "structuralSystem", label: "Anticipated Structural System", type: "select", options: ["Not decided", "Wood frame", "Steel frame", "Concrete", "Mass timber", "Hybrid"] },
    { key: "zoningDistrict", label: "Known Zoning District (if any)", type: "text", placeholder: "e.g., C-MX-5, or leave blank" },
    { key: "knownFAR", label: "Known FAR Limit (if any)", type: "text", placeholder: "e.g., 4.0, or leave blank to research" },
  ],
};

export function getFieldsForReports(reportIds: string[]): { reportId: string; reportName: string; fields: ReportField[] }[] {
  const seenKeys = new Set<string>();
  const result: { reportId: string; reportName: string; fields: ReportField[] }[] = [];

  const nameMap: Record<string, string> = {
    "code-analysis": "Code Analysis",
    "zoning-feasibility": "Zoning Feasibility",
    "energy-compliance": "Energy Compliance",
    "cost-context": "Cost Context",
    "risk-due-diligence": "Risk & Due Diligence",
    "site-constraints": "Site Constraints",
    "sustainability-scoping": "Sustainability",
    "permitting-pathway": "Permitting Pathway",
    "accessibility-review": "Accessibility",
    "consultant-scoping": "Consultant Scoping",
    "project-schedule": "Project Schedule",
    "program-validation": "Program Validation",
  };

  for (const id of reportIds) {
    const fields = REPORT_FIELDS[id];
    if (!fields) continue;

    const uniqueFields = fields.filter((f) => {
      if (seenKeys.has(f.key)) return false;
      seenKeys.add(f.key);
      return true;
    });

    if (uniqueFields.length > 0) {
      result.push({ reportId: id, reportName: nameMap[id] || id, fields: uniqueFields });
    }
  }

  return result;
}
