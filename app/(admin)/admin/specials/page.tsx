import { prisma } from "@/lib/prisma";
import { setSpecials } from "@/app/actions/admin";

function TeamSelect({
  name,
  teams,
  selected,
}: {
  name: string;
  teams: { id: number; name: string; groupName: string }[];
  selected: number | null;
}) {
  const groups = [...new Set(teams.map((t) => t.groupName))].sort();
  return (
    <select
      name={name}
      defaultValue={selected ?? ""}
      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
    >
      <option value="">— not decided —</option>
      {groups.map((g) => (
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
    </select>
  );
}

export default async function AdminSpecials() {
  const [teams, tournament] = await Promise.all([
    prisma.team.findMany({ orderBy: [{ groupName: "asc" }, { name: "asc" }] }),
    prisma.tournament.findUnique({ where: { id: 1 } }),
  ]);

  return (
    <div className="max-w-lg space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">
          Tournament Specials
        </h1>
        <p className="text-slate-500">
          These grade everyone&apos;s blind signup picks. Set them once the
          final and Golden Boot are decided.
        </p>
      </div>
      <form
        action={setSpecials}
        className="space-y-4 rounded-xl border border-slate-200 bg-white p-5"
      >
        <div>
          <label className="block text-sm font-medium text-slate-700">
            🏆 Champion
          </label>
          <TeamSelect
            name="championTeamId"
            teams={teams}
            selected={tournament?.championTeamId ?? null}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">
            🥈 Runner-up (the other finalist)
          </label>
          <TeamSelect
            name="runnerUpTeamId"
            teams={teams}
            selected={tournament?.runnerUpTeamId ?? null}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">
            ⚽ Top scorer (Golden Boot)
          </label>
          <input
            name="topScorerName"
            defaultValue={tournament?.topScorerName ?? ""}
            placeholder="Player name"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
          />
          <p className="mt-1 text-xs text-slate-400">
            Matched case-insensitively against players&apos; picks.
          </p>
        </div>
        <button className="rounded-lg bg-emerald-600 px-5 py-2.5 font-semibold text-white hover:bg-emerald-700">
          Save specials
        </button>
      </form>
    </div>
  );
}
