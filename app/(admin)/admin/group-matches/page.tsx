import { prisma } from "@/lib/prisma";
import { toLocalInput } from "@/lib/datetime";
import { setGroupMatchResults } from "@/app/actions/admin";

export default async function AdminGroupMatches() {
  const matches = await prisma.match.findMany({
    where: { round: "GROUP" },
    orderBy: { slot: "asc" },
    include: { homeTeam: true, awayTeam: true },
  });
  const groupNames = [...new Set(matches.map((m) => m.groupName))].sort();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">
          Group Match Results
        </h1>
        <p className="text-slate-500">
          Enter each group game&apos;s score (grades the scoreline predictions).
          Set kickoff times too if you like. Matches 1–36 are the first window,
          37–72 the second.
        </p>
      </div>

      <form action={setGroupMatchResults} className="space-y-5">
        {groupNames.map((g) => (
          <div key={g} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-2 font-bold">Group {g}</div>
            <div className="space-y-2">
              {matches
                .filter((m) => m.groupName === g)
                .map((m) => (
                  <div
                    key={m.id}
                    className="flex flex-wrap items-center gap-3 border-b border-slate-100 pb-2 text-sm last:border-0"
                  >
                    <span className="w-10 text-xs font-semibold text-slate-400">
                      #{m.slot}
                    </span>
                    <span className="w-48 font-medium">
                      {m.homeTeam?.name} v {m.awayTeam?.name}
                    </span>
                    <span className="flex items-center gap-1">
                      <input
                        type="number"
                        min={0}
                        name={`m${m.id}_home`}
                        defaultValue={m.homeScore ?? ""}
                        className="w-12 rounded-md border border-slate-300 px-2 py-1 text-center"
                      />
                      :
                      <input
                        type="number"
                        min={0}
                        name={`m${m.id}_away`}
                        defaultValue={m.awayScore ?? ""}
                        className="w-12 rounded-md border border-slate-300 px-2 py-1 text-center"
                      />
                    </span>
                    <input
                      type="datetime-local"
                      name={`m${m.id}_kickoff`}
                      defaultValue={toLocalInput(m.kickoff)}
                      className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                    />
                    <label className="flex items-center gap-1 font-medium">
                      <input
                        type="checkbox"
                        name={`m${m.id}_played`}
                        defaultChecked={m.played}
                        className="accent-emerald-600"
                      />
                      Final
                    </label>
                  </div>
                ))}
            </div>
          </div>
        ))}
        <div className="sticky bottom-4 flex justify-end">
          <button className="rounded-lg bg-emerald-600 px-6 py-3 font-semibold text-white shadow-lg hover:bg-emerald-700">
            Save group results
          </button>
        </div>
      </form>
    </div>
  );
}
