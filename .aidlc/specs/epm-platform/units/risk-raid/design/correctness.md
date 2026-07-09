# risk-raid — Correctness Design

## Property-Based Tests (PBT)

### P1 — Risk Score Formula
**Property**: For any Risk-type item with severity ∈ [1,5] and probability ∈ [1,5], `riskScore === severity × probability`.

```
∀ s ∈ [1,5], p ∈ [1,5]: computeRiskScore(s, p) === s * p
```

**Generator**: `fc.integer({min:1,max:5})` for severity and probability.
**Runs**: 50

---

### P2 — Escalation Detection Completeness
**Property**: After creating N risk items with random scores, every item with `riskScore >= threshold` is escalated, and none below threshold is escalated.

```
∀ items[]: item.escalated ⟺ item.riskScore >= THRESHOLD
```

**Generator**: Array of `{severity: integer(1,5), probability: integer(1,5)}`.
**Runs**: 50

---

### P3 — Score Bounds are Exhaustive
**Property**: `riskScore` always lies in [1, 25] for Risk-type items; bands map exhaustively to Low (1–4), Medium (5–9), High (10–14), Critical (15–25).

```
∀ s,p ∈ [1,5]: score = s*p; 1 <= score <= 25
riskBand(score) ∈ {Low, Medium, High, Critical}
[Low, Medium, High, Critical].filter(b => b === riskBand(score)).length === 1
```

**Runs**: 100

---

### P4 — Circular Dependency Detection is Order-Independent
**Property**: `isCircular(A→B, existing=[B→A])` returns true regardless of the order existing dependencies are presented; and `isCircular(A→B, existing=[])` returns false.

```
∀ A,B where A ≠ B:
  isCircular(A, B, [{from:B,to:A}]) === true
  isCircular(A, B, []) === false
  isCircular(A, B, [{from:C,to:D}]) === false  (unrelated pair)
```

**Runs**: 50

---

## Deterministic Unit Assertions

| # | Test | Assertion |
|---|------|-----------|
| 1 | Risk score computation | `computeRiskScore(4,4)` === 16 |
| 2 | Risk score for non-Risk | `computeRiskScore(null,null)` === null |
| 3 | Escalation at threshold | score=15, threshold=15 → `escalated=true` |
| 4 | No escalation below threshold | score=14, threshold=15 → `escalated=false` |
| 5 | Open→InProgress on owner set | `updateStatus('Open', ownerId='x')` === 'InProgress' |
| 6 | Terminal status blocks transition | `isValidTransition('Resolved','InProgress')` === false |
| 7 | Circular dep detected | `isCircular('A','B', [{from:'B',to:'A'}])` === true |
| 8 | Non-circular passes | `isCircular('A','B', [{from:'A',to:'C'}])` === false |
| 9 | Self-loop rejected | `fromProjectId === toProjectId` → RISK_001 |
| 10 | Risk fields required | `type='Risk', severity=null` → RISK_001 |

## Risk Bands (informational; used by reporting-dashboards)

| Score | Band |
|-------|------|
| 1–4 | Low |
| 5–9 | Medium |
| 10–14 | High |
| 15–25 | Critical |

Exported as `riskBand(score: number): RiskBand` from `@epm/shared`.
