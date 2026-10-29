import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ROUND_LABELS, KO_ROUNDS } from "@/lib/points";
import { toLocalInput } from "@/lib/datetime";
import { setupRoundFixtures, setRoundResults } from "@/app/actions/admin";

const KO = new Set(KO_ROUNDS as readonly string[]);

export default async function AdminKnockout({
  params,
}: {
  params: Promise<{ round: string }>;
}) {
  const { round } = await params;
  if (!KO.has(round)) notFound();

  const [matches, teams] = await Promise.all([
    prisma.match.findMany({
      where: { round },
      orderBy: { slot: "asc" },
      include: { homeTeam: true, awayTeam: true },
    }),
    prisma.team.findMany({ orderBy: [{ groupName: "asc" }, { name: "asc" }] }),
  ]);
  const groupNames = [...new Set(teams.map((t) => t.groupName))].sort();

  function TeamOptions() {
    return (
      <>
        <option value="">— TBD —</option>
        {groupNames.map((g) => (
          <optgroup key={g} label={`Group ${g}`}>
            {teams
              .filter((t) => t.groupName === g)
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
          </optgroup>
        ))}
      </>
    );
  }

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold tracking-tight">
        Knockout — {ROUND_LABELS[round]}
      </h1>

      {/* Round tabs */}
      <div className="flex flex-wrap gap-1">
        {KO_ROUNDS.map((r) => (
          <Link
            key={r}
            href={`/admin/ko/${r}`}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              r === round
                ? "bg-slate-800 text-white"
                : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100"
            }`}
          >
            {ROUND_LABELS[r]}
          </Link>
        ))}
      </div>

      {/* Fixtures setup */}
      <form
        action={setupRoundFixtures}
        className="rounded-xl border border-slate-200 bg-white p-4"
      >
        <input type="hidden" name="round" value={round} />
        <h2 className="mb-3 font-bold">1 · Set fixtures &amp; kickoff</h2>
        <div className="space-y-2">
          {matches.map((m) => (
            <div
              key={m.id}
              className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[auto_1fr_1fr_auto]"
            >
              <span className="text-xs font-semibold text-slate-400">
                #{m.slot}
              </span>
              <select
                name={`m${m.id}_home`}
                defaultValue={m.homeTeamId ?? ""}
                className="rounded-md border border-slate-300 px-2 py-1 text-sm"
              >
                <TeamOptions />
              </select>
              <select
                name={`m${m.id}_away`}
                defaultValue={m.awayTeamId ?? ""}
                className="rounded-md border border-slate-300 px-2 py-1 text-sm"
              >
                <TeamOptions />
              </select>
              <input
                type="datetime-local"
                name={`m${m.id}_kickoff`}
                defaultValue={toLocalInput(m.kickoff)}
                className="rounded-md border border-slate-300 px-2 py-1 text-sm"
              />
            </div>
          ))}
        </div>
        <button className="mt-3 rounded-md bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-900">
          Save fixtures
        </button>
      </form>

      {/* Results entry */}
      <form
        action={setRoundResults}
        className="rounded-xl border border-slate-200 bg-white p-4"
      >
        <input type="hidden" name="round" value={round} />
        <h2 className="mb-3 font-bold">2 · Enter results</h2>
        <div className="space-y-3">
          {matches.map((m) => {
            const ready = m.homeTeam && m.awayTeam;
            return (
              <div
                key={m.id}
                className="flex flex-wrap items-center gap-3 border-b border-slate-100 pb-2"
              >
                <span className="w-44 text-sm font-medium">
                  {m.homeTeam?.name ?? "TBD"} v {m.awayTeam?.name ?? "TBD"}
                </span>
                {ready ? (
                  <>
                    <span className="flex items-center gap-1 text-sm">
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
                    <label className="flex items-center gap-1 text-sm">
                      Advances:
                      <select
                        name={`m${m.id}_winner`}
                        defaultValue={m.winnerTeamId ?? ""}
                        className="rounded-md border border-slate-300 px-2 py-1 text-sm"
                      >
                        <option value="">—</option>
                        <option value={m.homeTeamId!}>{m.homeTeam!.name}</option>
                        <option value={m.awayTeamId!}>{m.awayTeam!.name}</option>
                      </select>
                    </label>
                    <label className="flex items-center gap-1 text-sm font-medium">
                      <input
                        type="checkbox"
                        name={`m${m.id}_played`}
                        defaultChecked={m.played}
                        className="accent-emerald-600"
                      />
                      Final
                    </label>
                  </>
                ) : (
                  <span className="text-sm text-slate-400">set fixture first</span>
                )}
              </div>
            );
          })}
        </div>
        <button className="mt-3 rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
          Save results
        </button>
      </form>
    </div>
  );
}
