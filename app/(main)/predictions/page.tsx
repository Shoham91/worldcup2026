import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPhases, isLocked, matchLocked } from "@/lib/phases";
import { ROUND_LABELS, KO_ROUNDS, POINTS, scoreValues } from "@/lib/points";
import { scoreLine } from "@/lib/scoring";
import AutoRefresh from "@/components/AutoRefresh";
import StickyTableScroll from "@/components/StickyTableScroll";

export default async function PredictionsPage() {
  await requireUser();

  const [phases, teams, matches, users] = await Promise.all([
    getPhases(),
    prisma.team.findMany(),
    prisma.match.findMany({ orderBy: { slot: "asc" } }),
    prisma.user.findMany({
      where: { isAdmin: false },
      orderBy: { name: "asc" },
      include: { groupPredictions: true, matchPredictions: true },
    }),
  ]);

  const code = new Map(teams.map((t) => [t.id, t.code]));
  const groupPhase = phases.find((p) => p.key === "GROUP");
  // Title picks are public once they locked for everyone (tournament start).
  const titlePicksVisible = groupPhase ? isLocked(groupPhase) : false;

  // Everything else reveals PER MATCH: a game's predictions become public only
  // once that game is locked (30 min before kickoff) — while a game is still
  // editable, nobody can peek.
  const lockedMatches = matches.filter((m) => matchLocked(m));
  const lockedGroupMatches = lockedMatches.filter((m) => m.round === "GROUP");
  // A group's 1st/2nd picks reveal when the group locks (its first game does).
  const lockedGroups = new Set(
    lockedGroupMatches.map((m) => m.groupName).filter(Boolean) as string[],
  );

  // user -> matchId -> prediction
  const mp = new Map<number, Map<number, { home: number; away: number; winner: number | null }>>();
  for (const u of users) {
    const m = new Map<number, { home: number; away: number; winner: number | null }>();
    for (const p of u.matchPredictions)
      m.set(p.matchId, { home: p.homeScore, away: p.awayScore, winner: p.winnerTeamId });
    mp.set(u.id, m);
  }

  const matchLabel = (m: (typeof matches)[number]) =>
    `${code.get(m.homeTeamId ?? -1) ?? "TBD"} v ${code.get(m.awayTeamId ?? -1) ?? "TBD"}`;

  function ScoreTable({
    rows,
    showWinner,
    maxHeight,
  }: {
    rows: typeof matches;
    showWinner: boolean;
    maxHeight?: string;
  }) {
    // Chronological by kickoff — the most recently played game sits last.
    const ordered = [...rows].sort((a, b) => {
      const ka = a.kickoff ? a.kickoff.getTime() : Infinity;
      const kb = b.kickoff ? b.kickoff.getTime() : Infinity;
      return ka - kb || a.slot - b.slot;
    });
    const table = (
      <table className="min-w-full text-xs">
        <thead className="bg-slate-50 text-left text-slate-500">
          <tr>
            <th className="sticky left-0 top-0 z-30 w-[6.5rem] min-w-[6.5rem] bg-slate-50 px-2 py-2 shadow-[1px_0_0_0_#e2e8f0]">
              Match
            </th>
            <th className="sticky top-0 z-20 bg-slate-50 px-2 py-2 text-center font-medium">
              FT
            </th>
            {users.map((u) => (
              <th
                key={u.id}
                className="sticky top-0 z-20 bg-slate-50 px-2 py-2 text-center font-medium"
              >
                {u.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {ordered.map((m) => {
            const done = m.played && m.homeScore != null && m.awayScore != null;
            return (
              <tr key={m.id}>
                <td className="sticky left-0 z-10 w-[6.5rem] min-w-[6.5rem] bg-white px-2 py-1.5 font-medium whitespace-nowrap shadow-[1px_0_0_0_#e2e8f0]">
                  {matchLabel(m)}
                </td>
                <td className="px-2 py-1.5 text-center font-bold tabular-nums whitespace-nowrap">
                  {done ? (
                      <>
                        {m.homeScore}-{m.awayScore}
                        {showWinner && m.winnerTeamId != null && (
                          <span className="ml-1 text-emerald-700">
                            {code.get(m.winnerTeamId)}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="font-normal text-slate-300">—</span>
                    )}
                  </td>
                  {users.map((u) => {
                    const p = mp.get(u.id)?.get(m.id);
                    if (!p)
                      return (
                        <td key={u.id} className="px-2 py-1.5 text-center text-slate-300">
                          —
                        </td>
                      );
                    const pts = done
                      ? scoreLine(p.home, p.away, m.homeScore!, m.awayScore!, m.round)
                      : null;
                    const v = scoreValues(m.round);
                    const shade =
                      pts === null
                        ? ""
                        : pts === v.exact
                          ? "bg-emerald-100 font-semibold text-emerald-900"
                          : pts === v.resultAndGd
                            ? "bg-emerald-50 text-emerald-800"
                            : pts === v.result
                              ? "bg-amber-50 text-amber-800"
                              : "text-slate-400";
                    const winnerHit =
                      done && m.winnerTeamId != null ? p.winner === m.winnerTeamId : null;
                    return (
                      <td key={u.id} className={`px-2 py-1.5 text-center tabular-nums ${shade}`}>
                        {p.home}-{p.away}
                        {pts != null && pts > 0 && (
                          <span className="ml-0.5 align-super text-[9px] font-bold">
                            +{pts}
                          </span>
                        )}
                        {showWinner && p.winner != null && (
                          <span
                            className={`ml-1 ${
                              winnerHit === null
                                ? "text-emerald-600"
                                : winnerHit
                                  ? "font-semibold text-emerald-700"
                                  : "text-rose-400 line-through"
                            }`}
                          >
                            {code.get(p.winner)}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
    );
    // Capped height -> vertical scroll, pinned to the latest games (bottom).
    if (maxHeight)
      return <StickyTableScroll maxHeight={maxHeight}>{table}</StickyTableScroll>;
    return (
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        {table}
      </div>
    );
  }

  const groupNames = [...new Set(teams.map((t) => t.groupName))].sort();
  const anyVisible = titlePicksVisible || lockedMatches.length > 0;

  // Once the feed assigns finishing positions, a group's standings picks can be
  // graded: +4 per team that actually finished top-2, +5 bonus for nailing the
  // exact 1st/2nd order (mirrors lib/scoring.ts).
  const finishById = new Map(teams.map((t) => [t.id, t.groupFinish]));
  const teamAdvanced = (id: number | null | undefined) => {
    const f = finishById.get(id ?? -1);
    return f === 1 || f === 2;
  };
  const resolvedGroups = new Set(
    groupNames.filter((g) =>
      teams.some((t) => t.groupName === g && (t.groupFinish === 1 || t.groupFinish === 2)),
    ),
  );
  const groupPoints = (firstTeamId: number, secondTeamId: number) => {
    const f1 = finishById.get(firstTeamId);
    const f2 = finishById.get(secondTeamId);
    let pts = 0;
    if (f1 === 1 || f1 === 2) pts += POINTS.group.advancer;
    if (f2 === 1 || f2 === 2) pts += POINTS.group.advancer;
    if (f1 === 1 && f2 === 2) pts += POINTS.group.exactOrder;
    return pts;
  };

  // Once every group game is played the knockout is the live action — it moves
  // to the top and the group tables fold into a collapsed history below.
  const groupMatchesAll = matches.filter((m) => m.round === "GROUP");
  const groupStageComplete =
    groupMatchesAll.length > 0 && groupMatchesAll.every((m) => m.played);

  // --- Section blocks (ordered differently before/after the group stage) ---

  const titleInner = (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white sm:max-w-xl">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
          <tr>
            <th className="px-3 py-2">Player</th>
            <th className="px-3 py-2">🏆 Champion</th>
            <th className="px-3 py-2">🎟️ Finalist</th>
            <th className="px-3 py-2">⚽ Top scorer</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {users.map((u) => (
            <tr key={u.id}>
              <td className="px-3 py-2 font-medium">{u.name}</td>
              <td className="px-3 py-2">{code.get(u.championTeamId ?? -1) ?? "—"}</td>
              <td className="px-3 py-2">{code.get(u.finalistTeamId ?? -1) ?? "—"}</td>
              <td className="px-3 py-2">{u.topScorerName ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  // Title picks are reference info — prominent during the group stage, folded
  // into a collapsed panel once the knockout takes over.
  const titleBlock = !titlePicksVisible ? null : groupStageComplete ? (
    <details className="rounded-xl border border-slate-200 bg-white">
      <summary className="cursor-pointer px-4 py-3 font-bold text-slate-700">
        🔮 Title picks{" "}
        <span className="text-sm font-normal text-slate-400">(tap to expand)</span>
      </summary>
      <div className="border-t border-slate-100 px-4 py-4">{titleInner}</div>
    </details>
  ) : (
    <section className="space-y-3">
      <h2 className="text-lg font-bold">🔮 Title picks</h2>
      {titleInner}
    </section>
  );

  const groupPicksSection = lockedGroups.size > 0 ? (
    <section className="space-y-3">
      <h2 className="text-lg font-bold">📊 Group picks (1st / 2nd)</h2>
      <p className="text-sm text-slate-400">
        A group&apos;s picks appear once its first game locks. Once a group is
        decided, picks are graded: advancing team{" "}
        <span className="font-semibold text-emerald-700">in green</span>,
        missed <span className="text-rose-400">in red</span>, and the{" "}
        <b>+pts</b> earned ({POINTS.group.advancer} per correct top-2 team,{" "}
        +{POINTS.group.exactOrder} bonus for exact order = max{" "}
        {POINTS.group.advancer * 2 + POINTS.group.exactOrder}).
      </p>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-xs">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="sticky left-0 bg-slate-50 px-2 py-2">Player</th>
              {groupNames.map((g) => (
                <th key={g} className="px-2 py-2 text-center font-medium">
                  {g}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((u) => {
              const byGroup = new Map(u.groupPredictions.map((p) => [p.groupName, p]));
              return (
                <tr key={u.id}>
                  <td className="sticky left-0 bg-white px-2 py-1.5 font-medium">
                    {u.name}
                  </td>
                  {groupNames.map((g) => {
                    if (!lockedGroups.has(g))
                      return (
                        <td key={g} className="px-2 py-1.5 text-center text-slate-300">
                          🙈
                        </td>
                      );
                    const p = byGroup.get(g);
                    if (!p)
                      return (
                        <td key={g} className="px-2 py-1.5 text-center text-slate-300">
                          —
                        </td>
                      );
                    const resolved = resolvedGroups.has(g);
                    const pts = resolved
                      ? groupPoints(p.firstTeamId, p.secondTeamId)
                      : null;
                    const cls = (id: number) =>
                      !resolved
                        ? "tabular-nums"
                        : teamAdvanced(id)
                          ? "font-semibold text-emerald-700 tabular-nums"
                          : "text-rose-400 tabular-nums";
                    return (
                      <td
                        key={g}
                        className={`px-2 py-1.5 text-center whitespace-nowrap ${
                          pts ? "bg-emerald-50" : ""
                        }`}
                      >
                        <span className={cls(p.firstTeamId)}>
                          {code.get(p.firstTeamId)}
                        </span>
                        <span className="text-slate-300">/</span>
                        <span className={cls(p.secondTeamId)}>
                          {code.get(p.secondTeamId)}
                        </span>
                        {pts != null && (
                          <span
                            className={`ml-0.5 align-super text-[9px] font-bold ${
                              pts > 0 ? "text-emerald-700" : "text-slate-400"
                            }`}
                          >
                            +{pts}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  ) : null;

  const groupScoresSection = lockedGroupMatches.length > 0 ? (
    <section className="space-y-2">
      <h2 className="text-lg font-bold">🥅 Group scores</h2>
      <p className="text-sm text-slate-400">
        Latest games are in view — scroll up for earlier ones. Showing{" "}
        {lockedGroupMatches.length}/72 locked so far.
      </p>
      <ScoreTable rows={lockedGroupMatches} showWinner={false} maxHeight="11rem" />
    </section>
  ) : null;

  // Knockout rounds: the round(s) currently in play lead the page; a round
  // that's fully played collapses and drops below them — so the relevant stage
  // is always on top (R16 leads while R32 folds beneath it, then QF, etc.).
  const koBlocks = KO_ROUNDS.map((r) => {
    const rows = lockedMatches.filter((m) => m.round === r);
    if (rows.length === 0) return null;
    // "Done" means the WHOLE round is played — not just the games locked so
    // far. A round with games still to come stays open at the top.
    const all = matches.filter((m) => m.round === r);
    return { r, rows, done: all.length > 0 && all.every((m) => m.played) };
  }).filter((b) => b != null);
  const koSections = [
    ...koBlocks.filter((b) => !b.done),
    ...koBlocks.filter((b) => b.done),
  ].map(({ r, rows, done }) =>
    done ? (
      <details key={r} className="rounded-xl border border-slate-200 bg-white">
        <summary className="cursor-pointer px-4 py-3 font-bold text-slate-700">
          🏆 {ROUND_LABELS[r]}{" "}
          <span className="text-sm font-normal text-slate-400">
            (done — tap to expand)
          </span>
        </summary>
        <div className="border-t border-slate-100 px-4 py-4">
          <ScoreTable rows={rows} showWinner maxHeight="20rem" />
        </div>
      </details>
    ) : (
      <section key={r} className="space-y-2">
        <h2 className="text-lg font-bold">🏆 {ROUND_LABELS[r]}</h2>
        <ScoreTable rows={rows} showWinner maxHeight="20rem" />
      </section>
    ),
  );

  const hasGroupBlocks = groupPicksSection || groupScoresSection;
  // After the group stage the group tables are history — tuck them into a
  // collapsed panel so the knockout gets the room.
  const groupHistory = !hasGroupBlocks ? null : groupStageComplete ? (
    <details className="rounded-xl border border-slate-200 bg-white">
      <summary className="cursor-pointer px-4 py-3 font-bold text-slate-700">
        📋 Group-stage predictions{" "}
        <span className="text-sm font-normal text-slate-400">(tap to expand)</span>
      </summary>
      <div className="space-y-6 border-t border-slate-100 px-4 py-4">
        {groupPicksSection}
        {groupScoresSection}
      </div>
    </details>
  ) : (
    <>
      {groupPicksSection}
      {groupScoresSection}
    </>
  );

  return (
    <div className="space-y-6">
      <AutoRefresh seconds={60} />
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">
          Everyone&apos;s Predictions
        </h1>
        <p className="text-slate-500">
          Picks go public per game, once that game locks (10 min before
          kickoff). Anything still editable stays hidden. 🙈
        </p>
        <p className="mt-1 text-sm text-slate-400">
          Finished games show the real score in the <b>FT</b> column, and every
          pick is shaded by what it earned: 🎯 exact · result &amp; goal-diff ·
          result — worth {POINTS.score.exact}/{POINTS.score.resultAndGd}/
          {POINTS.score.result} through the R16 and{" "}
          {POINTS.scoreLate.exact}/{POINTS.scoreLate.resultAndGd}/
          {POINTS.scoreLate.result} from the QF on.
        </p>
      </div>

      {!anyVisible && (
        <p className="rounded-lg bg-slate-100 px-4 py-3 text-slate-600">
          Nothing to see yet — predictions become public as each game locks.
        </p>
      )}

      {groupStageComplete ? (
        <>
          {koSections}
          {titleBlock}
          {groupHistory}
        </>
      ) : (
        <>
          {titleBlock}
          {groupHistory}
          {koSections}
        </>
      )}
    </div>
  );
}
