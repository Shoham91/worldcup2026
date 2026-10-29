import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPhase, isEditable, matchLocked } from "@/lib/phases";
import { ROUND_LABELS, POINTS, scoreValues } from "@/lib/points";
import KnockoutPredictForm from "@/components/KnockoutPredictForm";

const KO = new Set(["R32", "R16", "QF", "SF", "THIRD", "FINAL"]);

export default async function KnockoutPredictPage({
  params,
}: {
  params: Promise<{ round: string }>;
}) {
  const { round } = await params;
  if (!KO.has(round)) notFound();

  const user = await requireUser();
  const phase = await getPhase(round);
  const editable = phase ? isEditable(phase) : false;

  const matches = await prisma.match.findMany({
    where: { round },
    orderBy: { slot: "asc" },
    include: { homeTeam: true, awayTeam: true },
  });
  // Fixtures that are drawn; only the still-open ones are editable — a game
  // drops out of the form the moment it locks (10 min before kickoff).
  const drawn = matches.filter((m) => m.homeTeam && m.awayTeam);
  const ready = drawn.filter((m) => !matchLocked(m));

  const existing = await prisma.matchPrediction.findMany({
    where: { userId: user.id, matchId: { in: ready.map((m) => m.id) } },
  });
  const defaults: Record<
    number,
    { home: number; away: number; winner: number }
  > = {};
  for (const mp of existing)
    defaults[mp.matchId] = {
      home: mp.homeScore,
      away: mp.awayScore,
      winner: mp.winnerTeamId ?? 0,
    };

  const label = ROUND_LABELS[round] ?? round;

  const fixtures = ready.map((m) => ({
    id: m.id,
    home: { id: m.homeTeamId!, name: m.homeTeam!.name, code: m.homeTeam!.code },
    away: { id: m.awayTeamId!, name: m.awayTeam!.name, code: m.awayTeam!.code },
  }));

  return (
    <div className="space-y-4">
      <div>
        <Link href="/dashboard" className="text-sm text-emerald-700 hover:underline">
          ← Dashboard
        </Link>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight">
          {label} — Predictions
        </h1>
        <p className="text-slate-500">
          Pick who advances (+{POINTS.knockoutWinner[round] ?? 0}) and the
          90-min score — extra time &amp; penalties decide only who goes through,
          not the scoreline (exact +{scoreValues(round).exact} · result+GD +
          {scoreValues(round).resultAndGd} · result +{scoreValues(round).result}
          ). You can save as you go — fill the games you want now and come back
          for the rest. Each game locks 10 min before its kickoff.
        </p>
      </div>

      {!editable ? (
        <p className="rounded-lg bg-slate-100 px-4 py-3 text-slate-600">
          This round&apos;s predictions are locked.
        </p>
      ) : drawn.length === 0 ? (
        <p className="rounded-lg bg-slate-100 px-4 py-3 text-slate-600">
          Fixtures for this round haven&apos;t been set yet — check back once the
          previous round wraps up.
        </p>
      ) : fixtures.length === 0 ? (
        <p className="rounded-lg bg-slate-100 px-4 py-3 text-slate-600">
          Every game in this round has locked — predictions are closed.
        </p>
      ) : (
        <KnockoutPredictForm round={round} fixtures={fixtures} defaults={defaults} />
      )}
    </div>
  );
}
