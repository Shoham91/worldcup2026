import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const KOW = { R32: 4, R16: 6, QF: 8, SF: 12, THIRD: 4, FINAL: 20 };
const SC = { exact: 5, rgd: 3, r: 2 }, SCL = { exact: 8, rgd: 5, r: 3 };
const SIGNUP = { champion: 60, finalist: 30, topScorer: 50 };
const LATE = new Set(["QF", "SF", "THIRD", "FINAL"]);
const sg = (n) => (n > 0 ? 1 : n < 0 ? -1 : 0);
const norm = (s) => (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
const ln = (ph, pa, ah, aa, rd) => { const v = LATE.has(rd) ? SCL : SC; if (ph === ah && pa === aa) return v.exact; const s = sg(ph - pa) === sg(ah - aa); if (s && ph - pa === ah - aa) return v.rgd; if (s) return v.r; return 0; };

const [users, teams, matches, T] = await Promise.all([
  prisma.user.findMany({ where: { isAdmin: false }, include: { groupPredictions: true, matchPredictions: true } }),
  prisma.team.findMany(),
  prisma.match.findMany(),
  prisma.tournament.findUnique({ where: { id: 1 } }),
]);
const byId = new Map(teams.map((t) => [t.id, t]));
const finById = new Map(teams.map((t) => [t.id, t.groupFinish]));
const mById = new Map(matches.map((m) => [m.id, m]));
const F = matches.find((m) => m.round === "FINAL");

console.log(`FINAL: ${byId.get(F.homeTeamId)?.name} ${F.homeScore}-${F.awayScore} ${byId.get(F.awayTeamId)?.name} | champion=${byId.get(T.championTeamId)?.name} | runner-up=${byId.get(T.runnerUpTeamId)?.name} | boot=${T.topScorerName}`);
console.log("\n--- final-game picks & points ---");
const finals = users.map((u) => ({ u, fp: u.matchPredictions.find((mp) => mp.matchId === F.id) })).filter((x) => x.fp);
finals.sort((a, b) => a.u.name.localeCompare(b.u.name));
for (const { u, fp } of finals) {
  const l = ln(fp.homeScore, fp.awayScore, F.homeScore, F.awayScore, "FINAL");
  const adv = fp.winnerTeamId === F.winnerTeamId ? KOW.FINAL : 0;
  console.log(`  ${u.name.padEnd(16)} ${fp.homeScore}-${fp.awayScore} adv ${(byId.get(fp.winnerTeamId)?.code ?? "—")}${fp.isRandom ? " 🎲" : "  "}  => +${l} line, +${adv} adv = ${l + adv}`);
}

const rows = users.map((u) => {
  let signup = 0, rest = 0;
  if (T.championTeamId && u.championTeamId === T.championTeamId) signup += SIGNUP.champion;
  const fins = [T.championTeamId, T.runnerUpTeamId].filter(Boolean);
  if (u.finalistTeamId && fins.includes(u.finalistTeamId)) signup += SIGNUP.finalist;
  if (T.topScorerName && u.topScorerName && norm(u.topScorerName) === norm(T.topScorerName)) signup += SIGNUP.topScorer;
  for (const gp of u.groupPredictions) { const f1 = finById.get(gp.firstTeamId), f2 = finById.get(gp.secondTeamId); if (f1 === 1 || f1 === 2) rest += 4; if (f2 === 1 || f2 === 2) rest += 4; if (f1 === 1 && f2 === 2) rest += 5; }
  for (const mp of u.matchPredictions) { const m = mById.get(mp.matchId); if (!m || !m.played) continue; const has = m.homeScore != null && m.awayScore != null; if (m.round === "GROUP") { if (has) rest += ln(mp.homeScore, mp.awayScore, m.homeScore, m.awayScore, "GROUP"); continue; } if (m.winnerTeamId && mp.winnerTeamId === m.winnerTeamId) rest += KOW[m.round] || 0; if (has) rest += ln(mp.homeScore, mp.awayScore, m.homeScore, m.awayScore, m.round); }
  return { name: u.name, paid: u.paid, signup, total: signup + rest, champHit: T.championTeamId ? u.championTeamId === T.championTeamId : false, bootHit: T.topScorerName ? norm(u.topScorerName) === norm(T.topScorerName) : false };
});
rows.sort((a, b) => b.total - a.total || Number(b.champHit) - Number(a.champHit) || Number(b.bootHit) - Number(a.bootHit) || a.name.localeCompare(b.name));
console.log("\n--- OFFICIAL FINAL TABLE ---");
rows.forEach((r, i) => console.log(`${String(i + 1).padStart(2)}. ${r.name.padEnd(16)} ${String(r.total).padStart(4)}  (signup bonuses +${r.signup})${r.paid ? "" : "  [UNPAID]"}`));
await prisma.$disconnect();
