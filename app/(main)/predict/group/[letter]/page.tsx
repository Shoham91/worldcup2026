import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { matchLocked } from "@/lib/phases";
import OneGroupForm from "@/components/OneGroupForm";
import type { ScoreFixture } from "@/components/ScoreFixtureList";

const fmt = (d: Date) =>
  new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jerusalem",
  }).format(d);

export default async function OneGroupPage({
  params,
}: {
  params: Promise<{ letter: string }>;
}) {
  const { letter } = await params;
  const group = letter.toUpperCase();
  if (!/^[A-L]$/.test(group)) notFound();

  const user = await requireUser();

  const [teams, standing, fixtureRows, scorePreds] = await Promise.all([
    prisma.team.findMany({ where: { groupName: group }, orderBy: { id: "asc" } }),
    prisma.groupPrediction.findUnique({
      where: { userId_groupName: { userId: user.id, groupName: group } },
    }),
    prisma.match.findMany({
      where: { round: "GROUP", groupName: group },
      orderBy: { kickoff: "asc" },
      include: { homeTeam: true, awayTeam: true },
    }),
    prisma.matchPrediction.findMany({ where: { userId: user.id } }),
  ]);

  // 1st/2nd lock once any group game has started.
  const standingsLocked = fixtureRows.some((m) => matchLocked(m));

  const fixtures: ScoreFixture[] = fixtureRows.map((m) => {
    const locked = matchLocked(m);
    const note = m.played
      ? `FT ${m.homeScore}-${m.awayScore}`
      : m.kickoff
        ? fmt(m.kickoff)
        : null;
    return {
      id: m.id,
      home: m.homeTeam?.name ?? "TBD",
      away: m.awayTeam?.name ?? "TBD",
      locked,
      note,
    };
  });

  const scoreDefaults: Record<number, { home: number; away: number }> = {};
  for (const mp of scorePreds)
    scoreDefaults[mp.matchId] = { home: mp.homeScore, away: mp.awayScore };

  return (
    <div className="space-y-4">
      <div>
        <Link href="/predict/group" className="text-emerald-700 hover:underline">
          ← All groups
        </Link>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight">Group {group}</h1>
        <p className="text-slate-500">{teams.map((t) => t.name).join(" · ")}</p>
        <p className="mt-1 text-sm text-slate-400">
          Each game locks 10 min before kickoff (times in Jerusalem). Not sure
          yet? Leave a score empty and come back — anything still empty at lock
          time gets a 🎲 random pick.
        </p>
      </div>

      <OneGroupForm
        group={group}
        teams={teams.map((t) => ({ id: t.id, name: t.name }))}
        standingDefault={
          standing
            ? { first: standing.firstTeamId, second: standing.secondTeamId }
            : undefined
        }
        standingsLocked={standingsLocked}
        fixtures={fixtures}
        scoreDefaults={scoreDefaults}
      />
    </div>
  );
}
