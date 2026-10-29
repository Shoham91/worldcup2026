import { prisma } from "@/lib/prisma";
import { ROUND_LABELS } from "@/lib/points";
import { matchLocked } from "@/lib/phases";
import { adminEditPick } from "@/app/actions/admin";

const ERR: Record<string, string> = {
  missing: "Pick a player and a match first.",
  notfound: "That player or match no longer exists.",
  score: "Enter both scores as whole numbers (0 or more).",
  winner: "For knockout games, pick which team advances.",
};

export default async function AdminPicksPage({
  searchParams,
}: {
  searchParams: Promise<{
    userId?: string;
    matchId?: string;
    saved?: string;
    err?: string;
  }>;
}) {
  const sp = await searchParams;
  const userId = sp.userId ? Number(sp.userId) : null;
  const matchId = sp.matchId ? Number(sp.matchId) : null;

  const [users, matches] = await Promise.all([
    prisma.user.findMany({ where: { isAdmin: false }, orderBy: { name: "asc" } }),
    prisma.match.findMany({
      orderBy: [{ round: "asc" }, { slot: "asc" }],
      include: { homeTeam: true, awayTeam: true },
    }),
  ]);

  const label = (m: (typeof matches)[number]) => {
    const home = m.homeTeam?.code ?? "TBD";
    const away = m.awayTeam?.code ?? "TBD";
    const where = m.round === "GROUP" ? `Group ${m.groupName}` : ROUND_LABELS[m.round];
    return `${where} · ${home} v ${away}${m.played ? ` (FT ${m.homeScore}-${m.awayScore})` : ""}`;
  };

  const selUser = userId ? users.find((u) => u.id === userId) : null;
  const selMatch = matchId ? matches.find((m) => m.id === matchId) : null;
  const pred =
    selUser && selMatch
      ? await prisma.matchPrediction.findUnique({
          where: { userId_matchId: { userId: selUser.id, matchId: selMatch.id } },
        })
      : null;

  const isKo = selMatch && selMatch.round !== "GROUP";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Edit a Player&apos;s Pick</h1>
        <p className="text-slate-500">
          Override any player&apos;s prediction for any game — works even after
          the game has locked. Saving marks it as a real (non-random) pick and
          re-grades the leaderboard.
        </p>
      </div>

      {sp.saved && (
        <div className="rounded-lg bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
          ✓ Pick saved and leaderboard re-graded.
        </div>
      )}
      {sp.err && ERR[sp.err] && (
        <div className="rounded-lg bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          {ERR[sp.err]}
        </div>
      )}

      {/* Step 1: choose player + match (GET navigation) */}
      <form className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-600">Player</span>
          <select
            name="userId"
            defaultValue={userId ?? ""}
            className="rounded-md border border-slate-300 px-2 py-1.5"
          >
            <option value="" disabled>
              Choose…
            </option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-600">Match</span>
          <select
            name="matchId"
            defaultValue={matchId ?? ""}
            className="min-w-72 rounded-md border border-slate-300 px-2 py-1.5"
          >
            <option value="" disabled>
              Choose…
            </option>
            {matches.map((m) => (
              <option key={m.id} value={m.id}>
                {label(m)}
              </option>
            ))}
          </select>
        </label>
        <button className="rounded-md bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-900">
          Load pick
        </button>
      </form>

      {/* Step 2: edit the selected pick */}
      {selUser && selMatch && (
        <form
          action={adminEditPick}
          className="space-y-4 rounded-xl border border-amber-200 bg-amber-50 p-4"
        >
          <input type="hidden" name="userId" value={selUser.id} />
          <input type="hidden" name="matchId" value={selMatch.id} />

          <div className="text-sm text-slate-600">
            Editing <b>{selUser.name}</b> · {label(selMatch)}
            {matchLocked(selMatch) && (
              <span className="ml-2 rounded bg-rose-100 px-1.5 text-xs font-semibold text-rose-700">
                locked
              </span>
            )}
            <div className="text-xs text-slate-400">
              Current pick:{" "}
              {pred
                ? `${pred.homeScore}-${pred.awayScore}${pred.isRandom ? " 🎲 random" : ""}`
                : "none yet"}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span className="font-medium">{selMatch.homeTeam?.name ?? "TBD"}</span>
            <input
              type="number"
              min={0}
              name="home"
              defaultValue={pred?.homeScore ?? ""}
              className="w-16 rounded-md border border-slate-300 px-2 py-1.5 text-center"
            />
            <span className="text-slate-400">:</span>
            <input
              type="number"
              min={0}
              name="away"
              defaultValue={pred?.awayScore ?? ""}
              className="w-16 rounded-md border border-slate-300 px-2 py-1.5 text-center"
            />
            <span className="font-medium">{selMatch.awayTeam?.name ?? "TBD"}</span>
          </div>

          {isKo && (
            <label className="flex items-center gap-2 text-sm">
              <span className="font-medium text-slate-600">Advances:</span>
              <select
                name="winner"
                defaultValue={pred?.winnerTeamId ?? ""}
                className="rounded-md border border-slate-300 px-2 py-1.5"
              >
                <option value="" disabled>
                  Choose…
                </option>
                {selMatch.homeTeamId && (
                  <option value={selMatch.homeTeamId}>{selMatch.homeTeam?.name}</option>
                )}
                {selMatch.awayTeamId && (
                  <option value={selMatch.awayTeamId}>{selMatch.awayTeam?.name}</option>
                )}
              </select>
            </label>
          )}

          <button className="rounded-lg bg-emerald-600 px-6 py-2.5 font-semibold text-white shadow hover:bg-emerald-700">
            Save pick
          </button>
        </form>
      )}
    </div>
  );
}
