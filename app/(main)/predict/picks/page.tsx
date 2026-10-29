import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPhase, isEditable } from "@/lib/phases";
import SpecialsForm from "@/components/SpecialsForm";

export default async function PicksPage() {
  const user = await requireUser();
  const phase = await getPhase("GROUP");
  const editable = phase ? isEditable(phase) : false;

  const [teams, playerRows, champion, finalist] = await Promise.all([
    prisma.team.findMany({
      select: { id: true, name: true, groupName: true },
      orderBy: [{ groupName: "asc" }, { id: "asc" }],
    }),
    prisma.player.findMany({
      include: { team: { select: { name: true, groupName: true } } },
      orderBy: [
        { team: { groupName: "asc" } },
        { team: { name: "asc" } },
        { name: "asc" },
      ],
    }),
    user.championTeamId
      ? prisma.team.findUnique({ where: { id: user.championTeamId } })
      : null,
    user.finalistTeamId
      ? prisma.team.findUnique({ where: { id: user.finalistTeamId } })
      : null,
  ]);

  const players = playerRows.map((p) => ({ name: p.name, team: p.team.name }));

  return (
    <div className="max-w-xl space-y-4">
      <div>
        <Link href="/dashboard" className="text-emerald-700 hover:underline">
          ← Dashboard
        </Link>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight">
          Your title picks
        </h1>
        <p className="text-slate-500">
          Champion, finalist &amp; top scorer — your highest-value bets. Editable
          until the tournament kicks off.
        </p>
      </div>

      {editable ? (
        <SpecialsForm
          teams={teams}
          players={players}
          defaults={{
            champion: user.championTeamId,
            finalist: user.finalistTeamId,
            scorer: user.topScorerName,
          }}
        />
      ) : (
        <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-5">
          <p className="rounded-lg bg-slate-100 px-3 py-2 text-slate-600">
            🔒 Locked — the tournament has started, so title picks are final.
          </p>
          <p>🏆 Champion: <b>{champion?.name ?? "—"}</b></p>
          <p>🎟️ Finalist: <b>{finalist?.name ?? "—"}</b></p>
          <p>⚽ Top scorer: <b>{user.topScorerName ?? "—"}</b></p>
        </div>
      )}
    </div>
  );
}
