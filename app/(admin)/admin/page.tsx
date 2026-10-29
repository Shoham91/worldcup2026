import { prisma } from "@/lib/prisma";
import { getPhases, isLocked } from "@/lib/phases";
import { ROUND_LABELS } from "@/lib/points";
import { toLocalInput } from "@/lib/datetime";
import { prizeBreakdown } from "@/lib/prizes";
import {
  setPhase,
  autofillPhase,
  togglePaid,
  setTournamentSettings,
  syncNow,
  setSyncEnabled,
} from "@/app/actions/admin";

export default async function AdminOverview() {
  const [phases, users, tournament] = await Promise.all([
    getPhases(),
    prisma.user.findMany({
      where: { isAdmin: false },
      orderBy: { createdAt: "asc" },
    }),
    prisma.tournament.findUnique({ where: { id: 1 } }),
  ]);
  const buyIn = tournament?.buyIn ?? 50;
  // Pot = paid buy-ins only; unpaid players are out of the prize race.
  const paidCount = users.filter((u) => u.paid).length;
  const pot = paidCount * buyIn;
  const prizes = prizeBreakdown(pot);

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-2xl font-extrabold tracking-tight">
          Phases &amp; deadlines
        </h1>
        <p className="mb-4 text-slate-500">
          Open a round, set its lock time (10 min before the first game), then
          after it locks hit <b>Auto-fill</b> to give random picks to anyone who
          missed it.
        </p>
        <div className="space-y-3">
          {phases.map((p) => (
            <div
              key={p.key}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4"
            >
              <div className="w-40 font-semibold">
                {ROUND_LABELS[p.key] ?? p.label}
                {isLocked(p) && (
                  <span className="ml-2 rounded bg-rose-100 px-1.5 text-xs font-semibold text-rose-700">
                    locked
                  </span>
                )}
              </div>
              <form
                action={setPhase}
                className="flex flex-wrap items-center gap-3"
              >
                <input type="hidden" name="key" value={p.key} />
                <label className="flex items-center gap-1 text-sm">
                  <input
                    type="checkbox"
                    name="isOpen"
                    defaultChecked={p.isOpen}
                    className="accent-emerald-600"
                  />
                  Open
                </label>
                <label className="flex items-center gap-1 text-sm text-slate-600">
                  Locks at
                  <input
                    type="datetime-local"
                    name="locksAt"
                    defaultValue={toLocalInput(p.locksAt)}
                    className="rounded-md border border-slate-300 px-2 py-1 text-sm"
                  />
                </label>
                <button className="rounded-md bg-slate-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-900">
                  Save
                </button>
              </form>
              <form action={autofillPhase}>
                <input type="hidden" name="key" value={p.key} />
                <button className="rounded-md border border-amber-400 px-3 py-1.5 text-sm font-medium text-amber-800 hover:bg-amber-50">
                  Auto-fill missing
                </button>
              </form>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-bold">Results sync</h2>
        <div className="flex flex-wrap items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 text-sm">
          <form action={syncNow}>
            <button className="rounded-md bg-emerald-600 px-4 py-2 font-semibold text-white hover:bg-emerald-700">
              ⟳ Sync results now
            </button>
          </form>
          <form action={setSyncEnabled} className="flex items-center gap-2">
            <label className="flex items-center gap-2 font-medium">
              <input
                type="checkbox"
                name="syncEnabled"
                defaultChecked={tournament?.syncEnabled ?? true}
                className="accent-emerald-600"
              />
              Auto-sync every ~5 min (cron)
            </label>
            <button className="rounded-md border border-slate-300 px-3 py-1.5 font-medium text-slate-600 hover:bg-slate-100">
              Save
            </button>
          </form>
          <span className="text-slate-500">
            Pulls live scores, standings, knockout &amp; top scorer from
            football-data.org. Manual entry below still overrides until the next
            sync.
          </span>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-bold">Pot &amp; registration</h2>
        <form
          action={setTournamentSettings}
          className="flex flex-wrap items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 text-sm"
        >
          <label className="flex items-center gap-2">
            Buy-in (ILS)
            <input
              type="number"
              name="buyIn"
              min={0}
              defaultValue={buyIn}
              className="w-20 rounded-md border border-slate-300 px-2 py-1"
            />
          </label>
          <label className="flex items-center gap-2 font-medium">
            <input
              type="checkbox"
              name="registrationClosed"
              defaultChecked={tournament?.registrationClosed ?? false}
              className="accent-emerald-600"
            />
            Registration closed (finalise pot)
          </label>
          <button className="rounded-md bg-slate-800 px-3 py-1.5 font-medium text-white hover:bg-slate-900">
            Save
          </button>
          <span className="text-slate-500">
            {paidCount}/{users.length} paid → pot <b>{pot} ILS</b> · 🥇 {prizes[0]} · 🥈{" "}
            {prizes[1]} · 🥉 {prizes[2]}
            {tournament?.registrationClosed ? " (final)" : " (projected)"}
          </span>
        </form>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-bold">
          Players ({users.length}) ·{" "}
          {users.filter((u) => u.paid).length * buyIn} ILS collected
        </h2>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Joined</th>
                <th className="px-3 py-2 text-right">Buy-in</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-3 py-6 text-center text-slate-400">
                    No players yet.
                  </td>
                </tr>
              )}
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="px-3 py-2 font-medium">{u.name}</td>
                  <td className="px-3 py-2 text-slate-500">
                    {u.createdAt.toLocaleDateString()}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <form action={togglePaid} className="inline">
                      <input type="hidden" name="userId" value={u.id} />
                      <input
                        type="hidden"
                        name="paid"
                        value={u.paid ? "false" : "true"}
                      />
                      <button
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          u.paid
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {u.paid ? "Paid ✓" : "Mark paid"}
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
