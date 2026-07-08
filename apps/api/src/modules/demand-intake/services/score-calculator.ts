// ScoreCalculator — pure, total, deterministic domain logic (no I/O). The primary
// PBT surface for demand-intake (P1: computeWeightedTotal; P2: rank).

/** A weighted criterion: relative `weight` and per-criterion `maxScore` upper bound. */
export interface WeightedCriterion {
  id: string;
  weight: number;
  maxScore: number;
}

/** A raw score entered for a criterion. */
export interface RawScore {
  criterionId: string;
  rawScore: number;
}

/** An item eligible for ranking. `submittedAt` is an ISO 8601 UTC string. */
export interface Rankable {
  demandRequestId: string;
  weightedTotal: number;
  submittedAt: string;
}

/** A ranked item — 1-based `rank`, descending weightedTotal, stable tie-break. */
export type RankedItem = Rankable & { rank: number };

export class ScoreCalculator {
  /**
   * BR-203: normalized weighted total in [0, 100]:
   *   ( Σᵢ ( weightᵢ × ( rawScoreᵢ / maxScoreᵢ ) ) / Σᵢ weightᵢ ) × 100
   * Each raw score is normalized to [0, 1] by its own maxScore, weighted, summed, divided
   * by the total weight, and scaled to [0, 100]. When Σweight = 0 (all-zero weights or no
   * criteria) the result is a defined 0 — never NaN, never Infinity. Result is clamped to
   * [0, 100] to absorb floating-point rounding at the bound (P1).
   */
  static computeWeightedTotal(criteria: WeightedCriterion[], scores: RawScore[]): number {
    if (criteria.length === 0) return 0;

    const totalWeight = criteria.reduce((sum, c) => sum + c.weight, 0);
    if (totalWeight === 0) return 0; // guarded: never NaN

    const byId = new Map(scores.map((s) => [s.criterionId, s.rawScore]));
    const weighted = criteria.reduce((sum, c) => {
      const raw = byId.get(c.id) ?? 0;
      return sum + c.weight * (raw / c.maxScore); // normalized 0..1 per criterion
    }, 0);

    const total = (weighted / totalWeight) * 100;
    return Math.min(100, Math.max(0, total)); // ∈ [0, 100]
  }

  /**
   * BR-204: total order over the input — descending `weightedTotal`, stable tie-break by
   * `submittedAt` ascending (earlier submission ranks higher). The comparator is a strict
   * weak ordering (antisymmetric + transitive), so the result is permutation-invariant:
   * any input ordering of the same set yields the identical id → rank assignment (P2).
   */
  static rank(items: Rankable[]): RankedItem[] {
    const ordered = [...items].sort(
      (a, b) =>
        b.weightedTotal - a.weightedTotal ||
        (a.submittedAt < b.submittedAt ? -1 : a.submittedAt > b.submittedAt ? 1 : 0),
    );
    return ordered.map((item, index) => ({ ...item, rank: index + 1 }));
  }
}
