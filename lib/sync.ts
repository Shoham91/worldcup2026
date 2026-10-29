import "server-only";
import { prisma } from "./prisma";
import { ROUND_LABELS } from "./points";

// Pulls real results from football-data.org and updates the database:
// group scores, group standings, knockout fixtures + winners, top scorer,
// champion/runner-up. Safe to run repeatedly (idempotent updates).

const BASE = "https://api.football-data.org/v4";

const STAGE_TO_ROUND: Record<string, string> = {
  LAST_32: "R32",
  LAST_16: "R16",
  QUARTER_FINALS: "QF",
  SEMI_FINALS: "SF",
  THIRD_PLACE: "THIRD",
  FINAL: "FINAL",
};

type ApiTeam = { id: number; name: string; tla?: string | null } | null;

function norm(s: string | null | undefined): string {
  // NFD splits accents into combining marks; the final strip drops them too.
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[^a-z0-9]/g, "");
}

// "GROUP_A" / "Group A" -> "A"
function groupLetter(g: string | null | undefined): string | null {
  if (!g) return null;
  const c = g.trim().slice(-1).toUpperCase();
  return /[A-L]/.test(c) ? c : null;
}

async function api<T>(path: string): Promise<T> {
  const token = process.env.FOOTBALL_DATA_TOKEN;
  if (!token) throw new Error("FOOTBALL_DATA_TOKEN is not set");
  const r = await fetch(`${BASE}${path}`, {
    headers: { "X-Auth-Token": token },
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`football-data ${path} -> ${r.status}`);
  return r.json() as Promise<T>;
}

export type SyncSummary = {
  groupScores: number;
  koFixtures: number;
  koResults: number;
  standings: number;
  topScorer: string | null;
  champion: boolean;
};

export async function syncFromApi(): Promise<SyncSummary> {
  const [teams, matchesRes, standingsRes, scorersRes, ourGroupMatches] =
    await Promise.all([
      prisma.team.findMany(),
      api<{ matches: any[] }>("/competitions/WC/matches"),
      api<{ standings: any[] }>("/competitions/WC/standings"),
      api<{ scorers: any[] }>("/competitions/WC/scorers").catch(() => ({
        scorers: [],
      })),
      prisma.match.findMany({ where: { round: "GROUP" } }),
    ]);

  // Team resolver: TLA (our `code`) first, then normalised name.
  const byCode = new Map<string, number>();
  const byName = new Map<string, number>();
  for (const t of teams) {
    byCode.set(t.code.toUpperCase(), t.id);
    byName.set(norm(t.name), t.id);
  }
  const resolve = (t: ApiTeam): number | null => {
    if (!t) return null;
    if (t.tla && byCode.has(t.tla.toUpperCase())) return byCode.get(t.tla.toUpperCase())!;
    const n = norm(t.name);
    return byName.has(n) ? byName.get(n)! : null;
  };

  const pairKey = (a: number, b: number) => [a, b].sort((x, y) => x - y).join("-");
  const groupByPair = new Map<string, (typeof ourGroupMatches)[number]>();
  for (const m of ourGroupMatches)
    if (m.homeTeamId && m.awayTeamId)
      groupByPair.set(pairKey(m.homeTeamId, m.awayTeamId), m);

  const ops: import("@prisma/client").Prisma.PrismaPromise<unknown>[] = [];
  const summary: SyncSummary = {
    groupScores: 0,
    koFixtures: 0,
    koResults: 0,
    standings: 0,
    topScorer: null,
    champion: false,
  };

  // --- Group matches: kickoff time (always) + score (when finished) ---
  for (const am of matchesRes.matches) {
    if (am.stage !== "GROUP_STAGE") continue;
    const home = resolve(am.homeTeam);
    const away = resolve(am.awayTeam);
    if (home == null || away == null) continue;
    const m = groupByPair.get(pairKey(home, away));
    if (!m) continue;
    const data: Record<string, unknown> = {};
    if (am.utcDate) data.kickoff = new Date(am.utcDate);
    const fh = am.score?.fullTime?.home;
    const fa = am.score?.fullTime?.away;
    if (am.status === "FINISHED" && fh != null && fa != null) {
      data.homeScore = m.homeTeamId === home ? fh : fa;
      data.awayScore = m.homeTeamId === home ? fa : fh;
      data.played = true;
      summary.groupScores++;
    }
    if (Object.keys(data).length)
      ops.push(prisma.match.update({ where: { id: m.id }, data }));
  }

  // A stage is "done" only when every one of its games has finished. We use
  // this to decide when a knockout round's matchups are actually settled —
  // teams must not be drawn into a round while its feeder stage is still in
  // play (e.g. R32 must not fill while group games are ongoing).
  const stageFinished = (stage: string) => {
    const ms = matchesRes.matches.filter((m) => m.stage === stage);
    return ms.length > 0 && ms.every((m) => m.status === "FINISHED");
  };
  // Only R32 needs a stage-wide gate: group qualifiers (and thus the R32
  // matchups) can shuffle until the last group game finishes. From R16 on, each
  // fixture is settled the moment its two feeder games finish, and the feed only
  // names a team in a slot once that's true — so draw those per-fixture as they
  // resolve, filling the bracket progressively rather than all-at-once.
  const teamsSettledFor = (round: string) =>
    round === "R32" ? stageFinished("GROUP_STAGE") : true;

  // --- Knockout fixtures + results (assign to our slots in kickoff order) ---
  const koByRound: Record<string, any[]> = {};
  for (const am of matchesRes.matches) {
    const round = STAGE_TO_ROUND[am.stage];
    if (round) (koByRound[round] ||= []).push(am);
  }
  // Rounds whose teams are fully drawn this run — predictions should open.
  const koRoundsReady = new Set<string>();
  for (const [round, list] of Object.entries(koByRound)) {
    list.sort((a, b) =>
      a.utcDate < b.utcDate ? -1 : a.utcDate > b.utcDate ? 1 : a.id - b.id,
    );
    // Only draw teams into this round once its feeder stage has fully finished.
    // Kickoff times and results are always safe to record (a finished KO game
    // implies its feeder is done anyway).
    const assignTeams = teamsSettledFor(round);
    if (
      assignTeams &&
      list.length > 0 &&
      list.every((am) => resolve(am.homeTeam) != null && resolve(am.awayTeam) != null)
    )
      koRoundsReady.add(round);
    for (let i = 0; i < list.length; i++) {
      const am = list[i];
      const slot = i + 1;
      const home = resolve(am.homeTeam);
      const away = resolve(am.awayTeam);
      const data: Record<string, unknown> = {};
      if (am.utcDate) data.kickoff = new Date(am.utcDate);
      if (assignTeams && home != null) data.homeTeamId = home;
      if (assignTeams && away != null) data.awayTeamId = away;
      if (assignTeams && (home != null || away != null)) summary.koFixtures++;
      // Scorelines grade against the 90-MINUTE (regulation) score. Extra time
      // and penalties decide only WHO ADVANCES, never the scoreline — so a
      // match tied at 90 stays a tie for scoring even if it was won in ET or on
      // pens. The feed exposes the 90-min score as `regularTime` for any game
      // that went past 90; for games settled in regulation it omits that field,
      // so `fullTime` is the 90-min score. The advancer comes from `winner`.
      const reg = am.score?.regularTime;
      const ft = am.score?.fullTime;
      let regHome = reg?.home != null ? reg.home : ft?.home;
      let regAway = reg?.away != null ? reg.away : ft?.away;
      // The feed sometimes leaves `regularTime` null even for ET/pens games
      // (it did for the 2026 final) — derive the 90-min score instead:
      // regulation = fullTime − extraTime − penalties.
      if (
        reg?.home == null &&
        am.score?.duration &&
        am.score.duration !== "REGULAR" &&
        ft?.home != null
      ) {
        regHome = ft.home - (am.score?.extraTime?.home ?? 0) - (am.score?.penalties?.home ?? 0);
        regAway = ft.away - (am.score?.extraTime?.away ?? 0) - (am.score?.penalties?.away ?? 0);
      }
      if (am.status === "FINISHED" && regHome != null && regAway != null) {
        data.homeScore = regHome;
        data.awayScore = regAway;
        data.played = true;
        data.winnerTeamId =
          am.score.winner === "HOME_TEAM"
            ? home
            : am.score.winner === "AWAY_TEAM"
              ? away
              : null;
        summary.koResults++;
      }
      if (Object.keys(data).length)
        ops.push(
          prisma.match.update({ where: { round_slot: { round, slot } }, data }),
        );
    }
  }

  // --- Auto-open prediction phases for rounds that are now fully drawn ---
  // The per-match lock (10 min before each kickoff) still governs individual
  // games; opening the phase just makes the round editable in the app. We
  // UPSERT so a round with no Phase row yet (e.g. the 3rd-place playoff, which
  // isn't in the original seed) gets created + opened rather than silently
  // staying un-predictable.
  const KO_SORT: Record<string, number> = { R32: 2, R16: 3, QF: 4, SF: 5, THIRD: 6, FINAL: 7 };
  for (const key of koRoundsReady) {
    const sort = KO_SORT[key] ?? 99;
    const label = ROUND_LABELS[key] ?? key;
    ops.push(
      prisma.phase.upsert({
        where: { key },
        update: { isOpen: true, sort, label },
        create: { key, label, sort, isOpen: true },
      }),
    );
  }

  // --- Group standings (final positions 1..4) ---
  // Completeness is judged by OUR count of FINISHED group games per group, not
  // the feed's `playedGames` — that field bumps the moment a match goes live,
  // which would let positions land while the final round is still in play.
  const teamGroup = new Map(teams.map((t) => [t.id, t.groupName]));
  const groupGames = new Map<string, { total: number; finished: number }>();
  for (const am of matchesRes.matches) {
    if (am.stage !== "GROUP_STAGE") continue;
    const h = resolve(am.homeTeam);
    const g = h != null ? teamGroup.get(h) : undefined;
    if (!g) continue;
    const rec = groupGames.get(g) ?? { total: 0, finished: 0 };
    rec.total++;
    if (am.status === "FINISHED") rec.finished++;
    groupGames.set(g, rec);
  }
  const groupComplete = (g: string) => {
    const rec = groupGames.get(g);
    return !!rec && rec.total > 0 && rec.finished === rec.total;
  };

  // Final position per team, as reported by the feed's standings table.
  const posByTeam = new Map<number, number>();
  for (const s of standingsRes.standings ?? []) {
    if (s.type && s.type !== "TOTAL") continue;
    for (const row of s.table ?? []) {
      const tid = resolve(row.team);
      if (tid != null && row.position) posByTeam.set(tid, row.position);
    }
  }

  // Write positions only for groups that are fully finished; for any group
  // still in play, clear stale positions so nothing is scored prematurely
  // (self-heals positions an earlier sync may have written too early).
  const allGroups = [...new Set(teams.map((t) => t.groupName))];
  for (const g of allGroups) {
    const gTeams = teams.filter((t) => t.groupName === g);
    if (groupComplete(g)) {
      for (const t of gTeams) {
        const pos = posByTeam.get(t.id);
        if (pos && t.groupFinish !== pos) {
          ops.push(
            prisma.team.update({ where: { id: t.id }, data: { groupFinish: pos } }),
          );
          summary.standings++;
        }
      }
    } else {
      for (const t of gTeams) {
        if (t.groupFinish != null)
          ops.push(
            prisma.team.update({ where: { id: t.id }, data: { groupFinish: null } }),
          );
      }
    }
  }

  // --- Top scorer + champion/runner-up (ONLY once the tournament is over) ---
  // These feed the signup bonuses, so they must not be awarded mid-tournament:
  // the "current" top scorer changes game to game. Gate all three on the FINAL
  // being played — otherwise anyone who picked the current leader is paid the
  // +150 prematurely.
  const tData: Record<string, unknown> = {};

  // Live top-5 scorer chart — DISPLAY ONLY, refreshed every sync. (Goals field
  // is `goals` in v4; older payloads use `numberOfGoals` — accept either.)
  const top5 = (scorersRes.scorers ?? []).slice(0, 5).map((s) => ({
    name: s.player?.name ?? "Unknown",
    team: s.team?.tla ?? s.team?.shortName ?? s.team?.name ?? "",
    goals: s.goals ?? s.numberOfGoals ?? 0,
  }));
  if (top5.length) tData.topScorers = top5;

  const finalAm = matchesRes.matches.find((m) => m.stage === "FINAL");
  if (finalAm && finalAm.status === "FINISHED") {
    const topName = scorersRes.scorers?.[0]?.player?.name;
    if (topName) {
      tData.topScorerName = topName;
      summary.topScorer = topName;
    }
    const h = resolve(finalAm.homeTeam);
    const a = resolve(finalAm.awayTeam);
    if (finalAm.score?.winner === "HOME_TEAM") {
      tData.championTeamId = h;
      tData.runnerUpTeamId = a;
    } else if (finalAm.score?.winner === "AWAY_TEAM") {
      tData.championTeamId = a;
      tData.runnerUpTeamId = h;
    }
    if (tData.championTeamId) summary.champion = true;
  }
  if (Object.keys(tData).length)
    ops.push(prisma.tournament.update({ where: { id: 1 }, data: tData }));

  // Apply everything.
  for (let i = 0; i < ops.length; i += 25)
    await prisma.$transaction(ops.slice(i, i + 25));

  return summary;
}
