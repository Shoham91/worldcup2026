import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

// --- mirror lib/points.ts + lib/scoring.ts ---
const SIGNUP = { champion: 60, topScorer: 50, finalist: 30 };
const GROUP = { advancer: 4, exactOrder: 5 };
const KOW = { R32: 4, R16: 6, QF: 8, SF: 12, THIRD: 4, FINAL: 20 };
const SCORE = { exact: 5, resultAndGd: 3, result: 2 };
const SCORE_LATE = { exact: 8, resultAndGd: 5, result: 3 };
const LATE = new Set(["QF", "SF", "THIRD", "FINAL"]);
const scoreVals = (round) => (LATE.has(round) ? SCORE_LATE : SCORE);
const sign = (n) => (n > 0 ? 1 : n < 0 ? -1 : 0);
const norm = (s) => (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
function scoreLine(ph, pa, ah, aa, round = "GROUP") {
  const v = scoreVals(round);
  if (ph === ah && pa === aa) return v.exact;
  const same = sign(ph - pa) === sign(ah - aa);
  if (same && ph - pa === ah - aa) return v.resultAndGd;
  if (same) return v.result;
  return 0;
}

const [users, teams, matches, tournament] = await Promise.all([
  prisma.user.findMany({
    where: { isAdmin: false },
    include: { groupPredictions: true, matchPredictions: true },
  }),
  prisma.team.findMany(),
  prisma.match.findMany(),
  prisma.tournament.findUnique({ where: { id: 1 } }),
]);
const byId = new Map(teams.map((t) => [t.id, t]));
const finishById = new Map(teams.map((t) => [t.id, t.groupFinish]));
const matchById = new Map(matches.map((m) => [m.id, m]));

// --- current totals (same as computeLeaderboard; title outcomes unset so signup=0) ---
const standings = users.map((u) => {
  let group = 0, groupScore = 0, koWinner = 0, koScore = 0;
  for (const gp of u.groupPredictions) {
    const f1 = finishById.get(gp.firstTeamId);
    const f2 = finishById.get(gp.secondTeamId);
    if (f1 === 1 || f1 === 2) group += GROUP.advancer;
    if (f2 === 1 || f2 === 2) group += GROUP.advancer;
    if (f1 === 1 && f2 === 2) group += GROUP.exactOrder;
  }
  for (const mp of u.matchPredictions) {
    const m = matchById.get(mp.matchId);
    if (!m || !m.played) continue;
    const has = m.homeScore != null && m.awayScore != null;
    if (m.round === "GROUP") {
      if (has) groupScore += scoreLine(mp.homeScore, mp.awayScore, m.homeScore, m.awayScore);
      continue;
    }
    if (m.winnerTeamId && mp.winnerTeamId === m.winnerTeamId) koWinner += KOW[m.round] ?? 0;
    if (has) koScore += scoreLine(mp.homeScore, mp.awayScore, m.homeScore, m.awayScore, m.round);
  }
  return { u, total: group + groupScore + koWinner + koScore };
});

// --- alive teams: the 32 drawn into R32, minus losers of played KO games ---
const r32 = matches.filter((m) => m.round === "R32");
const alive = new Set();
for (const m of r32) { if (m.homeTeamId) alive.add(m.homeTeamId); if (m.awayTeamId) alive.add(m.awayTeamId); }
for (const m of matches) {
  if (m.round === "GROUP" || !m.played || !m.winnerTeamId) continue;
  if (m.round === "THIRD") continue; // 3rd-place loser was already out of the title race
  if (m.homeTeamId && m.homeTeamId !== m.winnerTeamId) alive.delete(m.homeTeamId);
  if (m.awayTeamId && m.awayTeamId !== m.winnerTeamId) alive.delete(m.awayTeamId);
}

// --- remaining KO pool: every unplayed KO game can still yield exact(5)+advancer ---
const remaining = matches.filter((m) => m.round !== "GROUP" && !m.played);
let koPool = 0;
const remByRound = {};
for (const m of remaining) {
  koPool += scoreVals(m.round).exact + (KOW[m.round] ?? 0);
  remByRound[m.round] = (remByRound[m.round] ?? 0) + 1;
}

// --- top-scorer race (display chart) ---
const chart = tournament?.topScorers ?? [];
const maxGoals = chart.length ? chart[0].goals : 0;
console.log("Remaining games:", JSON.stringify(remByRound), "→ KO pool (max for everyone):", koPool);
console.log("Alive teams:", [...alive].map((id) => byId.get(id)?.code).join(" "));
console.log("Top-scorer chart:", chart.map((s) => `${s.name} (${s.team}) ${s.goals}`).join(" · ") || "—");
console.log("");

// --- per player: title upside + max final ---
const rows = standings.map(({ u, total }) => {
  const champAlive = u.championTeamId != null && alive.has(u.championTeamId);
  const finAlive = u.finalistTeamId != null && alive.has(u.finalistTeamId);
  // scorer upside: alive if his team is alive (can add goals), or he already
  // leads/ties the chart (could stay top even if eliminated).
  const pickNorm = norm(u.topScorerName);
  const inChart = chart.find((s) => norm(s.name) === pickNorm);
  const scorerTeam = teams.find((t) => inChart && t.code === inChart.team);
  const scorerTeamAlive = scorerTeam ? alive.has(scorerTeam.id) : null; // null = unknown team
  const scorerAlive =
    (inChart && inChart.goals >= maxGoals) || // leads or ties the race now
    scorerTeamAlive === true ||
    (!inChart); // not on chart: alive only if his team is alive — unknown, be generous? No: unknown → check below
  // For picks not on the top-5 chart we can't see goals; assume alive only if we
  // can't prove the team is out. We don't map free-text names to teams, so be
  // conservative-generous: count it alive (upper bound stays a true upper bound).
  const title =
    (champAlive ? SIGNUP.champion : 0) +
    (finAlive ? SIGNUP.finalist : 0) +
    (scorerAlive ? SIGNUP.topScorer : 0);
  return {
    name: u.name,
    total,
    champ: `${byId.get(u.championTeamId)?.code ?? "—"}${champAlive ? "✓" : "✗"}`,
    fin: `${byId.get(u.finalistTeamId)?.code ?? "—"}${finAlive ? "✓" : "✗"}`,
    scorer: `${u.topScorerName ?? "—"}${scorerAlive ? "✓" : "✗"}`,
    title,
    max: total + koPool + title,
  };
});
rows.sort((a, b) => b.total - a.total);

console.log("Rank Player            Now   Champ      Finalist   Scorer                     Title$  MaxFinal");
rows.forEach((r, i) =>
  console.log(
    `${String(i + 1).padStart(2)}   ${r.name.padEnd(16)} ${String(r.total).padStart(4)}  ${r.champ.padEnd(9)} ${r.fin.padEnd(9)} ${r.scorer.padEnd(26)} ${String(r.title).padStart(4)}   ${r.max}`,
  ),
);

// --- mathematical elimination: guaranteed floor of others vs X's ceiling ---
console.log("\n--- Prize-race status (top-3 pay out) ---");
for (const r of rows) {
  const ahead = rows.filter((o) => o !== r && o.total > r.max).length;
  const status =
    ahead >= 3 ? "OUT of prizes (mathematically)" :
    ahead >= 1 ? `cannot finish 1st${ahead >= 2 ? " or 2nd" : ""} (worst case)` :
    "fully alive";
  if (ahead >= 1) console.log(`${r.name.padEnd(16)} max ${r.max} — ${ahead} player(s) already above that → ${status}`);
}
const anyOut = rows.some((r) => rows.filter((o) => o !== r && o.total > r.max).length >= 1);
if (!anyOut) console.log("Nobody can be ruled out of anything yet — every player's ceiling clears the current leader.");

await prisma.$disconnect();
