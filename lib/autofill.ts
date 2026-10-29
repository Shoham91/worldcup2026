import "server-only";
import { prisma } from "./prisma";
import { matchLocked } from "./phases";
import { randomScore, pickWinner, shuffle } from "./random";

export type AutofillSummary = { scores: number; standings: number };

// Once a match's lock has passed (10 min before kickoff), every player who
// left it empty gets a random pick — the same weighted mechanism as the 🎲
// button. Likewise a group's missing 1st/2nd once that group locks.
// Idempotent: only fills gaps, never touches existing predictions.
export async function autofillDuePredictions(): Promise<AutofillSummary> {
  const [users, matches, teams] = await Promise.all([
    prisma.user.findMany({ where: { isAdmin: false }, select: { id: true } }),
    prisma.match.findMany(),
    prisma.team.findMany({ select: { id: true, groupName: true } }),
  ]);
  const summary: AutofillSummary = { scores: 0, standings: 0 };
  if (users.length === 0) return summary;

  // --- Match scores (group: score only; knockout: score + advancer) ---
  const due = matches.filter(
    (m) =>
      matchLocked(m) &&
      (m.round === "GROUP" || (m.homeTeamId && m.awayTeamId)),
  );
  if (due.length) {
    const existing = await prisma.matchPrediction.findMany({
      where: { matchId: { in: due.map((m) => m.id) } },
      select: { userId: true, matchId: true },
    });
    const have = new Set(existing.map((e) => `${e.userId}:${e.matchId}`));
    const rows = [];
    for (const u of users)
      for (const m of due) {
        if (have.has(`${u.id}:${m.id}`)) continue;
        const home = randomScore();
        const away = randomScore();
        rows.push({
          userId: u.id,
          matchId: m.id,
          homeScore: home,
          awayScore: away,
          winnerTeamId:
            m.round === "GROUP"
              ? null
              : pickWinner(m.homeTeamId!, m.awayTeamId!, home, away),
          isRandom: true,
        });
      }
    if (rows.length) {
      const res = await prisma.matchPrediction.createMany({
        data: rows,
        skipDuplicates: true,
      });
      summary.scores = res.count;
    }
  }

  // --- Group standings (1st/2nd) for groups whose lock has passed ---
  const groups = [...new Set(teams.map((t) => t.groupName))];
  const lockedGroups = groups.filter((g) =>
    matches.some((m) => m.round === "GROUP" && m.groupName === g && matchLocked(m)),
  );
  if (lockedGroups.length) {
    const existing = await prisma.groupPrediction.findMany({
      where: { groupName: { in: lockedGroups } },
      select: { userId: true, groupName: true },
    });
    const have = new Set(existing.map((e) => `${e.userId}:${e.groupName}`));
    const rows = [];
    for (const u of users)
      for (const g of lockedGroups) {
        if (have.has(`${u.id}:${g}`)) continue;
        const ids = shuffle(
          teams.filter((t) => t.groupName === g).map((t) => t.id),
        );
        rows.push({
          userId: u.id,
          groupName: g,
          firstTeamId: ids[0],
          secondTeamId: ids[1],
          isRandom: true,
        });
      }
    if (rows.length) {
      const res = await prisma.groupPrediction.createMany({
        data: rows,
        skipDuplicates: true,
      });
      summary.standings = res.count;
    }
  }

  return summary;
}
