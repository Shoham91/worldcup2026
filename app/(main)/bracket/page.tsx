import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ROUND_LABELS } from "@/lib/points";
import AutoRefresh from "@/components/AutoRefresh";

type MatchWithTeams = Awaited<ReturnType<typeof loadMatches>>[number];

function loadMatches() {
  return prisma.match.findMany({
    orderBy: [{ slot: "asc" }],
    include: { homeTeam: true, awayTeam: true },
  });
}

function PosBadge({ pos }: { pos: number | null }) {
  if (!pos) return null;
  const styles: Record<number, string> = {
    1: "bg-amber-100 text-amber-800",
    2: "bg-slate-200 text-slate-700",
    3: "bg-orange-100 text-orange-800",
    4: "bg-slate-100 text-slate-400",
  };
  return (
    <span className={`rounded px-1.5 text-xs font-bold ${styles[pos]}`}>
      {pos}
    </span>
  );
}

// One knockout fixture as a two-row card; the advancing side is highlighted.
function KoCard({ m, big = false }: { m: MatchWithTeams; big?: boolean }) {
  const home = m.homeTeam?.name ?? "TBD";
  const away = m.awayTeam?.name ?? "TBD";
  const hw = m.played && m.winnerTeamId === m.homeTeamId;
  const aw = m.played && m.winnerTeamId === m.awayTeamId;

  const row = (name: string, score: number | null, won: boolean, tbd: boolean) => (
    <div
      className={`flex items-center justify-between gap-2 px-2.5 py-1.5 ${
        won
          ? "font-bold text-emerald-700"
          : tbd
            ? "text-slate-300"
            : "text-slate-600"
      }`}
    >
      <span className="flex items-center gap-1 truncate">
        {won && <span className="text-emerald-500">✓</span>}
        <span className="truncate">{name}</span>
      </span>
      <span className="tabular-nums">{score != null ? score : ""}</span>
    </div>
  );

  return (
    <div
      className={`${big ? "w-52" : "w-40"} overflow-hidden rounded-lg border bg-white text-sm shadow-sm ${
        big ? "border-amber-300 ring-1 ring-amber-200" : "border-slate-200"
      }`}
    >
      {row(home, m.played ? m.homeScore : null, hw, m.homeTeam == null)}
      <div className="border-t border-slate-100" />
      {row(away, m.played ? m.awayScore : null, aw, m.awayTeam == null)}
    </div>
  );
}

export default async function BracketPage() {
  await requireUser();
  const [teams, matches, tournament] = await Promise.all([
    prisma.team.findMany({ orderBy: [{ groupName: "asc" }, { id: "asc" }] }),
    loadMatches(),
    prisma.tournament.findUnique({ where: { id: 1 } }),
  ]);

  const topScorers =
    (tournament?.topScorers as { name: string; team: string; goals: number }[] | null) ?? [];

  const groupNames = [...new Set(teams.map((t) => t.groupName))].sort();
  const groupMatches = matches.filter((m) => m.round === "GROUP");
  const groupStageComplete =
    groupMatches.length > 0 && groupMatches.every((m) => m.played);

  // Live table for one group, computed from played games. The final order
  // (groupFinish) takes precedence once set; until then it's the usual
  // points / goal-difference / goals-scored tiebreak.
  function tableFor(g: string) {
    const rows = teams
      .filter((t) => t.groupName === g)
      .map((team) => ({ team, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 }));
    const byTeam = new Map(rows.map((r) => [r.team.id, r]));
    for (const m of groupMatches) {
      if (m.groupName !== g || !m.played || m.homeScore == null || m.awayScore == null)
        continue;
      const h = byTeam.get(m.homeTeamId ?? -1);
      const a = byTeam.get(m.awayTeamId ?? -1);
      if (!h || !a) continue;
      h.p++; a.p++;
      h.gf += m.homeScore; h.ga += m.awayScore;
      a.gf += m.awayScore; a.ga += m.homeScore;
      if (m.homeScore > m.awayScore) { h.w++; a.l++; h.pts += 3; }
      else if (m.homeScore < m.awayScore) { a.w++; h.l++; a.pts += 3; }
      else { h.d++; a.d++; h.pts++; a.pts++; }
    }
    return rows.sort(
      (x, y) =>
        (x.team.groupFinish ?? 9) - (y.team.groupFinish ?? 9) ||
        y.pts - x.pts ||
        (y.gf - y.ga) - (x.gf - x.ga) ||
        y.gf - x.gf ||
        x.team.name.localeCompare(y.team.name),
    );
  }

  // ---- Section renderers (ordered differently before/after the group stage) ----

  const groupsSection = (compact: boolean) => (
    <section>
      <h2 className="mb-3 text-lg font-bold">
        {compact ? "Final group standings" : "Group Stage"}
      </h2>
      <div
        className={`grid gap-3 ${
          compact
            ? "grid-cols-2 sm:grid-cols-4 lg:grid-cols-6"
            : "sm:grid-cols-3 lg:grid-cols-4"
        }`}
      >
        {groupNames.map((g) => {
          const rows = tableFor(g);
          const gAll = groupMatches.filter((m) => m.groupName === g);
          const played = gAll.filter((m) => m.played);
          const isFinal =
            rows.length > 0 && rows.every((r) => r.team.groupFinish != null);
          const started = played.length > 0;
          return (
            <div
              key={g}
              className="rounded-xl border border-slate-200 bg-white p-3"
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-bold">Group {g}</span>
                {isFinal ? (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                    ✓ Final
                  </span>
                ) : started ? (
                  <span className="flex items-center gap-1.5 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-500 opacity-75" />
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-amber-600" />
                    </span>
                    In play · {played.length}/{gAll.length}
                  </span>
                ) : null}
              </div>
              {started ? (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-[10px] uppercase text-slate-400">
                      <th className="py-0.5 font-medium">Team</th>
                      <th className="w-6 py-0.5 text-center font-medium">P</th>
                      <th className="w-8 py-0.5 text-center font-medium">+/−</th>
                      <th className="w-8 py-0.5 text-center font-medium">Pts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const gd = r.gf - r.ga;
                      return (
                        <tr
                          key={r.team.id}
                          className={
                            r.team.groupFinish && r.team.groupFinish <= 2
                              ? "font-semibold text-emerald-700"
                              : r.team.groupFinish === 3
                                ? "text-orange-700"
                                : "text-slate-700"
                          }
                        >
                          <td className="py-0.5">
                            <div className="flex items-center gap-1">
                              <span>{r.team.name}</span>
                              <PosBadge pos={r.team.groupFinish} />
                            </div>
                          </td>
                          <td className="py-0.5 text-center tabular-nums">{r.p}</td>
                          <td className="py-0.5 text-center tabular-nums">
                            {gd > 0 ? `+${gd}` : gd}
                          </td>
                          <td className="py-0.5 text-center font-bold tabular-nums">
                            {r.pts}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <ul className="space-y-1 text-sm">
                  {rows.map((r) => (
                    <li key={r.team.id} className="px-1 text-slate-600">
                      {r.team.name}
                    </li>
                  ))}
                </ul>
              )}
              {!compact && played.length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-[11px] font-medium text-slate-400 hover:text-slate-600">
                    Results ({played.length}/{gAll.length})
                  </summary>
                  <ul className="mt-1 space-y-0.5 text-[11px] text-slate-600">
                    {played.map((m) => (
                      <li key={m.id} className="tabular-nums">
                        {m.homeTeam?.code}{" "}
                        <span className="font-bold">
                          {m.homeScore}-{m.awayScore}
                        </span>{" "}
                        {m.awayTeam?.code}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );

  const FLOW_ROUNDS = ["R32", "R16", "QF", "SF", "FINAL"] as const;
  const thirdPlace = matches.filter((m) => m.round === "THIRD");

  const knockoutSection = () => {
    const anyKo = matches.some(
      (m) => m.round !== "GROUP" && (m.homeTeam || m.awayTeam || m.played),
    );
    return (
      <section>
        <h2 className="mb-3 text-lg font-bold">🏆 Knockout Bracket</h2>
        {!anyKo ? (
          <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
            The bracket unlocks once the group stage wraps up — teams are drawn
            in as each round resolves.
          </p>
        ) : (
          <>
            <div className="overflow-x-auto pb-2">
              <div className="flex min-w-max gap-4">
                {FLOW_ROUNDS.map((round) => {
                  const ms = matches.filter((m) => m.round === round);
                  if (ms.length === 0) return null;
                  const isFinal = round === "FINAL";
                  return (
                    <div key={round} className="flex flex-col">
                      <div className="mb-2 text-center">
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                          {ROUND_LABELS[round]}
                        </span>
                      </div>
                      {/* justify-around gives the column a centred, bracket-like
                          feel as later rounds have fewer games. */}
                      <div className="flex flex-1 flex-col justify-around gap-2">
                        {ms.map((m) => (
                          <KoCard key={m.id} m={m} big={isFinal} />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            {thirdPlace.length > 0 && (
              <div className="mt-4">
                <span className="rounded-full bg-orange-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-orange-700">
                  🥉 {ROUND_LABELS.THIRD}
                </span>
                <div className="mt-2 flex gap-2">
                  {thirdPlace.map((m) => (
                    <KoCard key={m.id} m={m} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </section>
    );
  };

  const topScorersSection = () =>
    topScorers.length > 0 ? (
      <section>
        <h2 className="mb-3 text-lg font-bold">⚽ Top Scorers</h2>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white sm:max-w-md">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">#</th>
                <th className="px-3 py-2">Player</th>
                <th className="px-3 py-2">Team</th>
                <th className="px-3 py-2 text-right">Goals</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {topScorers.map((s, i) => (
                <tr key={`${s.name}-${i}`}>
                  <td className="px-3 py-2 font-semibold text-slate-400">{i + 1}</td>
                  <td className="px-3 py-2 font-medium">{s.name}</td>
                  <td className="px-3 py-2 text-slate-500">{s.team}</td>
                  <td className="px-3 py-2 text-right font-bold tabular-nums">{s.goals}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-1 text-xs text-slate-400">
          Live chart — updates with each results sync. The signup top-scorer
          bonus is settled only when the tournament ends.
        </p>
      </section>
    ) : null;

  return (
    <div className="space-y-8">
      <AutoRefresh seconds={60} />
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">
          Tournament Progress
        </h1>
        <p className="text-slate-500">
          {groupStageComplete
            ? "Group stage done — it's knockout time. The bracket fills in as each round resolves."
            : "Group standings update live as results come in — they're only final once a group shows ✓."}
        </p>
      </div>

      {groupStageComplete ? (
        <>
          {knockoutSection()}
          {topScorersSection()}
          {groupsSection(true)}
        </>
      ) : (
        <>
          {groupsSection(false)}
          {topScorersSection()}
          {knockoutSection()}
        </>
      )}
    </div>
  );
}
