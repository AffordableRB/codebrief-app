## Test Report — Known Fabricated (Planted Errors)

This report contains deliberate fabrications to test benchmark detection.
Every claim marked [PLANTED] below should be caught by the benchmark.

### Applicable Codes
| Code | Version |
|------|---------|
| Denver Building Code | Based on 2027 IBC [PLANTED — IBC 2027 doesn't exist] |
| Denver Energy Code | 2019 Denver Energy Code [PLANTED — current is 2022 DEC] |

### Energy Requirements
| Requirement | Code Reference | Detail |
|-------------|---------------|--------|
| Climate Zone | IECC Figure C301.1 | Zone 8A [PLANTED — Denver is Zone 5B, Zone 8A doesn't exist in IECC] |
| Heat Pump COP | DEC Section C999.99 | COP ≥ 3.5 at 5°F [PLANTED — section doesn't exist, COP is wrong] |
| Benchmarking | Energize Denver | Required for buildings ≥ 50,000 SF [PLANTED — threshold is 25,000 SF] |

### Zoning
| Item | Finding |
|------|---------|
| Zone district | DZC zone district Q-MX-7 [PLANTED — Q-MX-7 doesn't exist, DZC is code name not district] |
| Front setback | DZC §99.99.99 requires 50-foot setback [PLANTED — section doesn't exist] |

### Permitting
| Item | Detail |
|------|--------|
| Agency | Denver Department of Public Works [PLANTED — actual name is DOTI] |
| Timeline | Zoning permit takes 30-45 days [PLANTED — Denver targets 180 days] |
| Water tap fee | $1,940 per unit [PLANTED — real fee is $2,166-$2,451] |

### Calculations
| Calculation | Math | Result |
|-------------|------|--------|
| FAR | 50,000 SF ÷ 10,000 SF lot = 4.0 [PLANTED — math error: 50,000/10,000 = 5.0] |
| Occupant load | 8,000 SF ÷ 30 = 267 | 267 occupants [CORRECT — this one is right] |
