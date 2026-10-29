import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const GROUP = { advancer: 4, exactOrder: 5 };
const KOW = { R32: 4, R16: 6, QF: 8, SF: 12, THIRD: 4, FINAL: 20 };
const SCORE = { exact: 5, resultAndGd: 3, result: 2 };
const SCORE_LATE = { exact: 8, resultAndGd: 5, result: 3 };
const SIGNUP = { champion: 60, finalist: 30, topScorer: 50 };
const LATE = new Set(["QF", "SF", "THIRD", "FINAL"]);
const sv = (r) => (LATE.has(r) ? SCORE_LATE : SCORE);
const sign = (n) => (n > 0 ? 1 : n < 0 ? -1 : 0);
const norm = (s) => (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
function line(ph, pa, ah, aa, r) {
  const v = sv(r);
  if (ph === ah && pa === aa) return v.exact;
  const same = sign(ph - pa) === sign(ah - aa);
  if (same && ph - pa === ah - aa) return v.resultAndGd;
  if (same) return v.result;
  return 0;
}

const [users, teams, matches, tournament, players] = await Promise.all([
  prisma.user.findMany({ where: { isAdmin: false }, include: { groupPredictions: true, matchPredictions: true } }),
  prisma.team.findMany(),
  prisma.match.findMany(),
  prisma.tournament.findUnique({ where: { id: 1 } }),
  prisma.player.findMany(),
]);
const byId = new Map(teams.map((t) => [t.id, t]));
const finishById = new Map(teams.map((t) => [t.id, t.groupFinish]));
const matchById = new Map(matches.map((m) => [m.id, m]));

function current(u) {
  let g = 0, gs = 0, kw = 0, ks = 0;
  for (const gp of u.groupPredictions) {
    const f1 = finishById.get(gp.firstTeamId), f2 = finishById.get(gp.secondTeamId);
    if (f1 === 1 || f1 === 2) g += GROUP.advancer;
    if (f2 === 1 || f2 === 2) g += GROUP.advancer;
    if (f1 === 1 && f2 === 2) g += GROUP.exactOrder;
  }
  for (const mp of u.matchPredictions) {
    const m = matchById.get(mp.matchId);
    if (!m || !m.played) continue;
    const has = m.homeScore != null && m.awayScore != null;
    if (m.round === "GROUP") { if (has) gs += line(mp.homeScore, mp.awayScore, m.homeScore, m.awayScore, "GROUP"); continue; }
    if (m.winnerTeamId && mp.winnerTeamId === m.winnerTeamId) kw += KOW[m.round] ?? 0;
    if (has) ks += line(mp.homeScore, mp.awayScore, m.homeScore, m.awayScore, m.round);
  }
  return g + gs + kw + ks;
}

// End-state facts, read from the fixtures
const final = matches.find((m) => m.round === "FINAL");
const bronze = matches.find((m) => m.round === "THIRD");
const finalists = [final.homeTeamId, final.awayTeamId];      // ESP, ARG (locked)
const bronzeTeams = [bronze.homeTeamId, bronze.awayTeamId];  // FRA, ENG
const remainingTeams = new Set([...finalists, ...bronzeTeams]);

// Remaining KO points open to everyone (nobody's final/bronze picks locked yet)
const remaining = matches.filter((m) => ["THIRD", "FINAL"].includes(m.round) && !m.played);
const KO_OPEN = remaining.reduce((s, m) => s + SCORE_LATE.exact + (KOW[m.round] ?? 0), 0);

// Boot: only picks within 2 of the lead whose team still has a game
const chart = tournament?.topScorers ?? [];
const lead = chart.length ? chart[0].goals : 0;
const playerTeam = new Map(players.map((p) => [norm(p.name), p.teamId]));
const bootCandidates = chart
  .filter((s) => s.goals >= lead - 2)
  .map((s) => norm(s.name))
  .filter((n) => { const tid = playerTeam.get(n); return tid == null || remainingTeams.has(tid); });

const base = users.map((u) => {
  const lockedFinalist = u.finalistTeamId != null && finalists.includes(u.finalistTeamId) ? SIGNUP.finalist : 0;
  return { u, cur: current(u), fin: lockedFinalist };
});

const scenarios = [];
for (const champ of finalists) for (const boot of [null, ...bootCandidates]) scenarios.push({ champ, boot });
function titleVar(u, sc) {
  let t = 0;
  if (u.championTeamId === sc.champ) t += SIGNUP.champion;
  if (sc.boot && norm(u.topScorerName) === sc.boot) t += SIGNUP.topScorer;
  return t;
}

const rows = base.map(({ u, cur, fin }) => {
  let best = Infinity, worst = 0;
  for (const sc of scenarios) {
    const tX = titleVar(u, sc);
    const ceilX = cur + fin + tX + KO_OPEN;
    const floorX = cur + fin + tX;
    let above = 0, couldBeAbove = 0;
    for (const b of base) {
      if (b.u.id === u.id) continue;
      const tR = titleVar(b.u, sc);
      if (b.cur + b.fin + tR > ceilX) above++;
      if (b.cur + b.fin + tR + KO_OPEN > floorX) couldBeAbove++;
    }
    best = Math.min(best, above + 1);
    worst = Math.max(worst, couldBeAbove + 1);
  }
  return {
    name: u.name, banked: cur, fin, best, worst,
    ch: byId.get(u.championTeamId)?.code, chLive: finalists.includes(u.championTeamId),
    sc: u.topScorerName, scLive: bootCandidates.includes(norm(u.topScorerName)),
  };
});
rows.sort((a, b) => b.banked + b.fin - (a.banked + a.fin));

console.log(`Final: ${finalists.map((id) => byId.get(id)?.code).join(" v ")} | Bronze: ${bronzeTeams.map((id) => byId.get(id)?.code).join(" v ")}`);
console.log(`KO points still open to everyone: ${KO_OPEN} | Boot still winnable by: ${bootCandidates.join(", ")}\n`);
console.log("Player           Banked  +Fin  Champ    Scorer          Best Worst  Verdict");
for (const r of rows) {
  const canWin = r.best === 1, canPodium = r.best <= 3;
  const verdict = !canPodium ? "OUT of the money"
    : canWin ? `CAN WIN (${r.best}–${r.worst})`
    : `podium only, not 1st (${r.best}–${r.worst})`;
  const ch = `${r.ch}${r.chLive ? "●" : "✗"}`;
  const sc = `${(r.sc ?? "—").slice(0, 13)}${r.scLive ? "●" : "✗"}`;
  console.log(`${r.name.padEnd(15)} ${String(r.banked).padStart(4)}   ${(r.fin ? "+30" : "  0").padStart(4)}  ${ch.padEnd(7)} ${sc.padEnd(15)} ${String(r.best).padStart(3)} ${String(r.worst).padStart(4)}   ${verdict}`);
}
console.log("\nBanked = live leaderboard. +Fin = LOCKED finalist bonus (paid at the final). ●=live ✗=dead");
await prisma.$disconnect();
