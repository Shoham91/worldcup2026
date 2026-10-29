// All scoring values live here so the rules are trivial to tweak in one place.

export const POINTS = {
  // Blind picks made at signup. Rebalanced mid-group-stage (none resolved yet)
  // so a single blind pre-tournament guess can't dwarf five weeks of play —
  // champion stays highest (hardest call), finalist lowest (easiest).
  signup: {
    champion: 60,
    topScorer: 50,
    finalist: 30,
  },
  // Group stage
  group: {
    advancer: 4, // per correctly-picked top-2 team (order independent)
    exactOrder: 5, // bonus: got BOTH 1st and 2nd exactly right in the group
  },
  // Knockout: points for correctly picking the team that advances from a tie.
  // QF onward was rebalanced mid-tournament (before any QF kicked off): QF was
  // 10, SF 15, THIRD 5, FINAL 25 — trimmed so late rounds aren't decided by
  // advancer coin-flips alone. R32/R16 were played under their original values.
  knockoutWinner: {
    R32: 4,
    R16: 6,
    QF: 8,
    SF: 12,
    FINAL: 20,
    THIRD: 4,
  } as Record<string, number>,
  // Per-game scoreline accuracy (graded on the 90-min / regulation score —
  // extra time & penalties decide only who advances, not the scoreline).
  // `score` covers the group stage + R32/R16; from the QF on, `scoreLate`
  // applies (same forward-only rebalance as above — sharper scoreline calls
  // are worth more in the rounds that used to be advancer-dominated).
  score: {
    exact: 5, // exact scoreline
    resultAndGd: 3, // right result AND right goal difference
    result: 2, // right result only (W/D/L)
  },
  scoreLate: {
    exact: 8,
    resultAndGd: 5,
    result: 3,
  },
} as const;

// Rounds that grade scorelines at the late-stage (higher) values.
export const LATE_ROUNDS = new Set(["QF", "SF", "THIRD", "FINAL"]);

// The scoreline values in force for a given round.
export function scoreValues(round: string): {
  exact: number;
  resultAndGd: number;
  result: number;
} {
  return LATE_ROUNDS.has(round) ? POINTS.scoreLate : POINTS.score;
}

// Prize split as fractions of the pot (1st, 2nd, 3rd).
export const PRIZES = [0.7, 0.2, 0.1] as const;

// Knockout rounds in tournament order.
export const KO_ROUNDS = ["R32", "R16", "QF", "SF", "THIRD", "FINAL"] as const;
export type KoRound = (typeof KO_ROUNDS)[number];

export const ROUND_LABELS: Record<string, string> = {
  GROUP: "Group Stage",
  R32: "Round of 32",
  R16: "Round of 16",
  QF: "Quarter-finals",
  SF: "Semi-finals",
  THIRD: "Third-place Playoff",
  FINAL: "Final",
};

// How many fixtures each knockout round has.
export const ROUND_SIZE: Record<string, number> = {
  R32: 16,
  R16: 8,
  QF: 4,
  SF: 2,
  THIRD: 1,
  FINAL: 1,
};
