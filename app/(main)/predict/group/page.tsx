import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { matchLocked } from "@/lib/phases";

export default async function GroupIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const user = await requireUser();
  const { saved } = await searchParams;

  const [teams, standings, matches, matchPreds] = await Promise.all([
    prisma.team.findMany({ orderBy: [{ groupName: "asc" }, { id: "asc" }] }),
    prisma.groupPrediction.findMany({
      where: { userId: user.id },
      select: { groupName: true },
    }),
    prisma.match.findMany({
      where: { round: "GROUP" },
      select: { id: true, groupName: true, kickoff: true, played: true },
    }),
    prisma.matchPrediction.findMany({
      where: { userId: user.id },
      select: { matchId: true },
    }),
  ]);

  // Editable while any group game hasn't reached its lock (10 min pre-kickoff).
  const editable = matches.some((m) => !matchLocked(m));

  const groupNames = [...new Set(teams.map((t) => t.groupName))].sort();
  const hasStanding = new Set(standings.map((s) => s.groupName));
  const predicted = new Set(matchPreds.map((m) => m.matchId));
  const matchesByGroup = new Map<string, number[]>();
  for (const m of matches) {
    if (!m.groupName) continue;
    if (!matchesByGroup.has(m.groupName)) matchesByGroup.set(m.groupName, []);
    matchesByGroup.get(m.groupName)!.push(m.id);
  }

  const progress = (g: string) => {
    const ids = matchesByGroup.get(g) ?? [];
    const filled = ids.filter((id) => predicted.has(id)).length;
    return {
      filled,
      total: ids.length,
      complete: hasStanding.has(g) && filled === ids.length,
      started: hasStanding.has(g) || filled > 0,
    };
  };

  const doneCount = groupNames.filter((g) => progress(g).complete).length;

  return (
    <div className="space-y-5">
      <div>
        <Link href="/dashboard" className="text-sm text-emerald-700 hover:underline">
          ← Dashboard
        </Link>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight">
          Group Stage Predictions
        </h1>
        <p className="text-slate-500">
          Predict each group on its own: who finishes 1st &amp; 2nd, plus the
          scores of all 6 of its games. {doneCount}/12 groups done.{" "}
          <Link href="/rules" className="text-emerald-700 underline">
            Scoring →
          </Link>
        </p>
      </div>

      {saved && (
        <div className="rounded-lg bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
          ✓ Group {saved} saved.
        </div>
      )}

      {!editable && (
        <div className="rounded-lg bg-slate-100 px-4 py-3 text-slate-600">
          Group-stage predictions are locked — you can review but not change them.
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {groupNames.map((g) => {
          const p = progress(g);
          const gTeams = teams.filter((t) => t.groupName === g);
          return (
            <Link
              key={g}
              href={`/predict/group/${g}`}
              className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 transition hover:border-emerald-400 hover:shadow-sm"
            >
              <div>
                <div className="font-bold">Group {g}</div>
                <div className="text-xs text-slate-500">
                  {gTeams.map((t) => t.code).join(" · ")}
                </div>
              </div>
              {p.complete ? (
                <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
                  ✓ Done
                </span>
              ) : p.started ? (
                <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-800">
                  {p.filled}/{p.total} games
                </span>
              ) : (
                <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
                  {editable ? "Predict" : "Incomplete"}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
