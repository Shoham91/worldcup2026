import Link from "next/link";
import { redirect } from "next/navigation";
import AuthShell from "@/components/AuthShell";
import SignupForm from "@/components/SignupForm";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function SignupPage() {
  if (await getCurrentUser()) redirect("/dashboard");

  const [tournament, groupPhase] = await Promise.all([
    prisma.tournament.findUnique({ where: { id: 1 } }),
    prisma.phase.findUnique({ where: { key: "GROUP" } }),
  ]);
  const registrationClosed =
    tournament?.registrationClosed ||
    (groupPhase?.locksAt != null && Date.now() >= groupPhase.locksAt.getTime());

  if (registrationClosed)
    return (
      <AuthShell
        title="Registration is closed"
        subtitle="The tournament has kicked off — no late entries, it's an even race."
      >
        <div className="space-y-4 text-center">
          <p className="text-4xl">🚫⚽</p>
          <p className="text-slate-600">
            The whistle blew and the field is locked in. Grab some popcorn and
            follow the race 🍿
          </p>
          <Link
            href="/login"
            className="inline-block rounded-lg bg-emerald-600 px-5 py-2.5 font-semibold text-white hover:bg-emerald-700"
          >
            Already in? Sign in
          </Link>
        </div>
      </AuthShell>
    );

  const [teams, playerRows] = await Promise.all([
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
  ]);

  const players = playerRows.map((p) => ({ name: p.name, team: p.team.name }));

  return (
    <AuthShell
      title="Create your entry"
      subtitle="Buy-in is 50 ILS. Set a PIN and lock your blind picks."
    >
      <SignupForm teams={teams} players={players} />
    </AuthShell>
  );
}
