import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { computeLeaderboard } from "@/lib/scoring";
import { prizeBreakdown } from "@/lib/prizes";
import { getPhase, isLocked } from "@/lib/phases";
import AutoRefresh from "@/components/AutoRefresh";

const MEDAL = ["🥇", "🥈", "🥉"];

export default async function LeaderboardPage() {
  const user = await requireUser();
  const [standings, tournament, groupPhase] = await Promise.all([
    computeLeaderboard(),
    prisma.tournament.findUnique({ where: { id: 1 } }),
    getPhase("GROUP"),
  ]);
  // The pot counts PAID buy-ins only, and prizes go to the top 3 among paid
  // players — unpaid players stay on the board but are out of the prize race.
  const paid = standings.filter((s) => s.paid);
  const pot = paid.length * (tournament?.buyIn ?? 50);
  const prizes = prizeBreakdown(pot);
  const potFinal =
    (tournament?.registrationClosed ?? false) ||
    (groupPhase ? isLocked(groupPhase) : false);
  const PRIZE = prizes.map(
    (p) => `${p} ILS${potFinal ? "" : "*"}`,
  );
  // userId -> rank within the paid-only prize race (0-based; medals for <3).
  const prizeRank = new Map(paid.map((s, i) => [s.userId, i]));

  return (
    <div className="space-y-4">
      <AutoRefresh seconds={40} />
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Leaderboard</h1>
        <p className="text-slate-500">
          Live standings — auto-refreshes every 20s as results come in.
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr className="border-b border-slate-200">
              <th className="px-3 py-1.5" colSpan={3}></th>
              <th
                className="border-l border-slate-200 px-2 py-1.5 text-center font-medium normal-case text-slate-400"
                colSpan={3}
              >
                Points by stage
              </th>
            </tr>
            <tr className="text-left">
              <th className="px-3 py-2">#</th>
              <th className="px-3 py-2">Player</th>
              <th className="px-3 py-2 text-right">Total</th>
              <th className="border-l border-slate-200 px-2 py-2 text-right">
                Signup
              </th>
              <th className="px-2 py-2 text-right">Group</th>
              <th className="px-2 py-2 text-right">Knockout</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {standings.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-slate-400">
                  No players yet — be the first to sign up!
                </td>
              </tr>
            )}
            {standings.map((s, i) => {
              const pr = prizeRank.get(s.userId);
              return (
              <tr
                key={s.userId}
                className={s.userId === user.id ? "bg-emerald-50" : ""}
              >
                <td className="px-3 py-2 font-semibold">
                  {pr != null && pr < 3 ? MEDAL[pr] : i + 1}
                </td>
                <td className="px-3 py-2 font-medium">
                  {s.name}
                  {s.userId === user.id && (
                    <span className="ml-1 text-xs text-emerald-600">(you)</span>
                  )}
                  {pr != null && pr < 3 && (
                    <span className="ml-2 whitespace-nowrap text-xs text-slate-400">
                      {PRIZE[pr]}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-right text-base font-bold tabular-nums">
                  {s.total}
                </td>
                <td className="border-l border-slate-200 px-2 py-2 text-right tabular-nums text-slate-400">
                  {s.signup}
                </td>
                <td className="px-2 py-2 text-right tabular-nums text-slate-400">
                  {s.group + s.groupScore}
                </td>
                <td className="px-2 py-2 text-right tabular-nums text-slate-400">
                  {s.koWinner + s.koScore}
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-400">
        Tiebreakers: champion → top scorer → correct knockout winners → name.
        {!potFinal && (
          <> · Prizes (70/20/10% of {pot} ILS) are <b>projected*</b> until
          registration closes.</>
        )}
      </p>
    </div>
  );
}
