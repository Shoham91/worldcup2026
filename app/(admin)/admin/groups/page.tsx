import { prisma } from "@/lib/prisma";
import { setGroupFinishes } from "@/app/actions/admin";

export default async function AdminGroups() {
  const teams = await prisma.team.findMany({
    orderBy: [{ groupName: "asc" }, { id: "asc" }],
  });
  const groups = [...new Set(teams.map((t) => t.groupName))].sort();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Group Results</h1>
        <p className="text-slate-500">
          Set each team&apos;s final finishing position (1–4). 1 &amp; 2 advance
          directly; the best 3rd-placed teams also reach the Round of 32.
        </p>
      </div>

      <form action={setGroupFinishes} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((g) => (
            <div
              key={g}
              className="rounded-xl border border-slate-200 bg-white p-4"
            >
              <div className="mb-2 font-bold">Group {g}</div>
              <div className="space-y-2">
                {teams
                  .filter((t) => t.groupName === g)
                  .map((t) => (
                    <label
                      key={t.id}
                      className="flex items-center justify-between gap-2 text-sm"
                    >
                      <span>{t.name}</span>
                      <select
                        name={`t${t.id}`}
                        defaultValue={t.groupFinish ?? ""}
                        className="rounded-md border border-slate-300 px-2 py-1"
                      >
                        <option value="">—</option>
                        <option value="1">1st</option>
                        <option value="2">2nd</option>
                        <option value="3">3rd</option>
                        <option value="4">4th</option>
                      </select>
                    </label>
                  ))}
              </div>
            </div>
          ))}
        </div>
        <div className="sticky bottom-4 flex justify-end">
          <button className="rounded-lg bg-emerald-600 px-6 py-3 font-semibold text-white shadow-lg hover:bg-emerald-700">
            Save group results
          </button>
        </div>
      </form>
    </div>
  );
}
