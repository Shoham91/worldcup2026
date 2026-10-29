import "server-only";
import { prisma } from "./prisma";
import { POINTS, scoreValues } from "./points";

export type Breakdown = {
  signup: number;
  group: number; // group standings (advancers / order / 3rd)
  groupScore: number; // group-match scorelines
  koWinner: number;
  koScore: number;
  total: number;
  // tiebreaker signals
  championHit: boolean;
  topScorerHit: boolean;
  koWinnersCorrect: number;
};

export type Standing = Breakdown & {
  userId: number;
  name: string;
  paid: boolean;
};

const sign = (n: number) => (n > 0 ? 1 : n < 0 ? -1 : 0);
const norm = (s: string | null | undefined) =>
  (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

// Grade one scoreline prediction against the actual result. Values depend on
// the round: group/R32/R16 use the base values, QF onward the late ones.
export function scoreLine(
  ph: number,
  pa: number,
  ah: number,
  aa: number,
  round = "GROUP",
): number {
  const v = scoreValues(round);
  if (ph === ah && pa === aa) return v.exact;
  const sameResult = sign(ph - pa) === sign(ah - aa);
  if (sameResult && ph - pa === ah - aa) return v.resultAndGd;
  if (sameResult) return v.result;
  return 0;
}

export async function computeLeaderboard(): Promise<Standing[]> {
  const [users, teams, matches, tournament] = await Promise.all([
    prisma.user.findMany({
      where: { isAdmin: false },
      include: { groupPredictions: true, matchPredictions: true },
    }),
    prisma.team.findMany(),
    prisma.match.findMany(),
    prisma.tournament.findUnique({ where: { id: 1 } }),
  ]);

  const finishById = new Map<number, number | null>(
    teams.map((t) => [t.id, t.groupFinish]),
  );
  const matchById = new Map(matches.map((m) => [m.id, m]));

  const standings: Standing[] = users.map((u) => {
    const b: Breakdown = {
      signup: 0,
      group: 0,
      groupScore: 0,
      koWinner: 0,
      koScore: 0,
      total: 0,
      championHit: false,
      topScorerHit: false,
      koWinnersCorrect: 0,
    };

    // --- Signup blind picks ---
    if (
      tournament?.championTeamId &&
      u.championTeamId === tournament.championTeamId
    ) {
      b.signup += POINTS.signup.champion;
      b.championHit = true;
    }
    const finalists = [
      tournament?.championTeamId,
      tournament?.runnerUpTeamId,
    ].filter(Boolean);
    if (u.finalistTeamId && finalists.includes(u.finalistTeamId)) {
      b.signup += POINTS.signup.finalist;
    }
    if (
      tournament?.topScorerName &&
      u.topScorerName &&
      norm(u.topScorerName) === norm(tournament.topScorerName)
    ) {
      b.signup += POINTS.signup.topScorer;
      b.topScorerHit = true;
    }

    // --- Group stage (1st & 2nd only) ---
    for (const gp of u.groupPredictions) {
      const f1 = finishById.get(gp.firstTeamId);
      const f2 = finishById.get(gp.secondTeamId);
      if (f1 === 1 || f1 === 2) b.group += POINTS.group.advancer;
      if (f2 === 1 || f2 === 2) b.group += POINTS.group.advancer;
      if (f1 === 1 && f2 === 2) b.group += POINTS.group.exactOrder;
    }

    // --- Match scorelines + knockout winners ---
    for (const mp of u.matchPredictions) {
      const m = matchById.get(mp.matchId);
      if (!m || !m.played) continue;
      const hasScore = m.homeScore != null && m.awayScore != null;

      if (m.round === "GROUP") {
        // Group games: scoreline only (no advancer).
        if (hasScore)
          b.groupScore += scoreLine(mp.homeScore, mp.awayScore, m.homeScore!, m.awayScore!);
        continue;
      }

      // Knockout: advancer + scoreline.
      if (m.winnerTeamId && mp.winnerTeamId === m.winnerTeamId) {
        b.koWinner += POINTS.knockoutWinner[m.round] ?? 0;
        b.koWinnersCorrect += 1;
      }
      if (hasScore)
        b.koScore += scoreLine(mp.homeScore, mp.awayScore, m.homeScore!, m.awayScore!, m.round);
    }

    b.total = b.signup + b.group + b.groupScore + b.koWinner + b.koScore;
    return { userId: u.id, name: u.name, paid: u.paid, ...b };
  });

  // Sort: total, then tiebreakers (champion, top scorer, KO winners), then name.
  standings.sort(
    (a, b) =>
      b.total - a.total ||
      Number(b.championHit) - Number(a.championHit) ||
      Number(b.topScorerHit) - Number(a.topScorerHit) ||
      b.koWinnersCorrect - a.koWinnersCorrect ||
      a.name.localeCompare(b.name),
  );

  return standings;
}

// Convenience: a single user's breakdown (used on the dashboard).
export async function getUserBreakdown(
  userId: number,
): Promise<Breakdown | null> {
  const all = await computeLeaderboard();
  return all.find((s) => s.userId === userId) ?? null;
}
