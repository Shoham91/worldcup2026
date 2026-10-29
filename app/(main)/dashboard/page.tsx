import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPhases, isEditable, isLocked, matchLocked } from "@/lib/phases";
import { getUserBreakdown } from "@/lib/scoring";
import { ROUND_LABELS } from "@/lib/points";
import { prizeBreakdown } from "@/lib/prizes";
import { jerusalemDay } from "@/lib/datetime";
import Countdown from "@/components/Countdown";

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const user = await requireUser();
  const { saved } = await searchParams;

  const [
    phases,
    breakdown,
    groupCount,
    matchPreds,
    matches,
    players,
    tournament,
    championTeam,
    finalistTeam,
  ] = await Promise.all([
    getPhases(),
    getUserBreakdown(user.id),
    prisma.groupPrediction.count({ where: { userId: user.id } }),
    prisma.matchPrediction.findMany({
      where: { userId: user.id },
      select: { matchId: true },
    }),
    prisma.match.findMany({
      select: {
        id: true,
        round: true,
        slot: true,
        kickoff: true,
        played: true,
        homeTeamId: true,
        awayTeamId: true,
      },
    }),
    prisma.user.count({ where: { isAdmin: false, paid: true } }),
    prisma.tournament.findUnique({ where: { id: 1 } }),
    user.championTeamId
      ? prisma.team.findUnique({ where: { id: user.championTeamId } })
      : null,
    user.finalistTeamId
      ? prisma.team.findUnique({ where: { id: user.finalistTeamId } })
      : null,
  ]);

  const predicted = new Set(matchPreds.map((m) => m.matchId));
  const groupMatches = matches.filter((m) => m.round === "GROUP");
  const koReady = (round: string) =>
    matches.filter((m) => m.round === round && m.homeTeamId && m.awayTeamId);

  const groupPhase = phases.find((p) => p.key === "GROUP");
  const picksEditable = groupPhase ? isEditable(groupPhase) : false;
  // The group stage stays editable as long as some group game hasn't started.
  const groupHasOpen = groupMatches.some((m) => !matchLocked(m));
  // A knockout round is editable only while it still has an open fixture —
  // once every game has locked/been played, the Edit button goes away.
  const koHasOpen = (round: string) =>
    matches.some(
      (m) => m.round === round && m.homeTeamId && m.awayTeamId && !matchLocked(m),
    );

  function status(key: string): { ready: boolean; complete: boolean; href: string } {
    if (key === "GROUP") {
      // Started games don't count against completeness.
      const openGroup = groupMatches.filter((m) => !matchLocked(m));
      const complete =
        groupCount >= 12 && openGroup.every((m) => predicted.has(m.id));
      return { ready: true, complete, href: "/predict/group" };
    }
    const ready = koReady(key);
    const complete = ready.length > 0 && ready.every((m) => predicted.has(m.id));
    return { ready: ready.length > 0, complete, href: `/predict/ko/${key}` };
  }

  // Same two-day window as /today — late-night kickoffs land on tomorrow's
  // calendar day in Jerusalem.
  const today = jerusalemDay(new Date());
  const tomorrow = jerusalemDay(new Date(Date.now() + 24 * 60 * 60 * 1000));
  const todaysGames = matches.filter((m) => {
    if (!m.kickoff) return false;
    const day = jerusalemDay(m.kickoff);
    return day === today || day === tomorrow;
  });
  // A game counts as "still needs your picks" only if you can actually predict
  // it now: group games until they lock; knockout games only once their round
  // is open AND both teams are drawn.
  const phaseByKey = new Map(phases.map((p) => [p.key, p]));
  const predictableNow = (m: (typeof matches)[number]) => {
    if (matchLocked(m)) return false;
    if (m.round === "GROUP") return true;
    const ph = phaseByKey.get(m.round);
    return !!ph && isEditable(ph) && m.homeTeamId != null && m.awayTeamId != null;
  };
  const todaysMissing = todaysGames.filter(
    (m) => predictableNow(m) && !predicted.has(m.id),
  );

  // The pot counts PAID buy-ins only — unpaid players stay on the board but
  // are out of the prize race.
  const pot = players * (tournament?.buyIn ?? 50);
  const prizes = prizeBreakdown(pot);
  // Pot is final once admin closes registration OR signups auto-close at the
  // title-picks lock (kickoff).
  const potFinal =
    (tournament?.registrationClosed ?? false) ||
    (groupPhase ? isLocked(groupPhase) : false);

  const cards = [
    { label: "Signup", v: breakdown?.signup ?? 0 },
    { label: "Group picks", v: breakdown?.group ?? 0 },
    { label: "Group scores", v: breakdown?.groupScore ?? 0 },
    { label: "KO winners", v: breakdown?.koWinner ?? 0 },
    { label: "KO scores", v: breakdown?.koScore ?? 0 },
  ];

  return (
    <div className="space-y-6">
      {saved && (
        <div className="rounded-lg bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
          ✓ Predictions saved. Good luck!
        </div>
      )}

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">
            Hi {user.name} 👋
          </h1>
          <p className="text-slate-500">
            Here&apos;s where you stand.{" "}
            <Link href="/rules" className="text-emerald-700 underline">
              How scoring works →
            </Link>
          </p>
        </div>
        <div className="rounded-xl bg-slate-900 px-5 py-3 text-right text-white">
          <div className="text-3xl font-extrabold tabular-nums">
            {breakdown?.total ?? 0}
          </div>
          <div className="text-xs uppercase tracking-wide text-slate-400">
            points
          </div>
        </div>
      </div>

      {todaysGames.length > 0 && (
        <Link
          href="/today"
          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 transition hover:border-sky-400 hover:shadow-sm"
        >
          <span className="font-semibold text-sky-900">
            ⚡ {todaysGames.length} game{todaysGames.length === 1 ? "" : "s"}{" "}
            today &amp; tomorrow
            {todaysMissing.length > 0 ? (
              <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                {todaysMissing.length} still need your picks
              </span>
            ) : (
              <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                ✓ all picked
              </span>
            )}
          </span>
          <span className="text-sm font-medium text-sky-700">
            View today&apos;s games →
          </span>
        </Link>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {cards.map((c) => (
          <div key={c.label} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-2xl font-bold tabular-nums">{c.v}</div>
            <div className="text-xs text-slate-500">{c.label}</div>
          </div>
        ))}
      </div>

      {/* Title picks (champion / finalist / top scorer) */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
        <div>
          <div className="font-semibold text-amber-900">🔮 Your title picks</div>
          <div className="text-sm text-slate-600">
            🏆 {championTeam?.name ?? "—"} · 🎟️ {finalistTeam?.name ?? "—"} · ⚽{" "}
            {user.topScorerName ?? "—"}
          </div>
          <div className="text-sm text-slate-500">
            {picksEditable && groupPhase?.locksAt ? (
              <>Editable for <Countdown to={groupPhase.locksAt.toISOString()} /></>
            ) : (
              "Locked — tournament has started"
            )}
          </div>
        </div>
        {picksEditable && (
          <Link
            href="/predict/picks"
            className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600"
          >
            Edit picks
          </Link>
        )}
      </div>

      <div>
        <h2 className="mb-3 text-lg font-bold">Your predictions</h2>
        <div className="space-y-3">
          {phases.map((p) => {
            const st = status(p.key);
            const isGroup = p.key === "GROUP";
            const editable = isGroup
              ? groupHasOpen
              : isEditable(p) && koHasOpen(p.key);
            const locked = isGroup
              ? !groupHasOpen
              : isLocked(p) || (p.isOpen && st.ready && !koHasOpen(p.key));
            return (
              <div
                key={p.key}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4"
              >
                <div>
                  <div className="font-semibold">{ROUND_LABELS[p.key] ?? p.label}</div>
                  <div className="text-sm text-slate-500">
                    {isGroup
                      ? locked
                        ? "Locked — all group games have started"
                        : "Each game locks 10 min before its kickoff — edit until then"
                      : !p.isOpen
                        ? "Opens after the previous round finishes"
                        : locked
                          ? "Locked — this round's games have all started"
                          : p.locksAt
                            ? <>Locks in <Countdown to={p.locksAt.toISOString()} /></>
                            : "Open — no deadline set yet"}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {st.complete ? (
                    <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
                      ✓ Submitted
                    </span>
                  ) : st.ready && editable ? (
                    <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
                      Needs your picks
                    </span>
                  ) : null}
                  {editable && st.ready ? (
                    <Link
                      href={st.href}
                      className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                    >
                      {st.complete ? "Edit" : "Submit predictions"}
                    </Link>
                  ) : (
                    <span className="text-sm text-slate-400">—</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
        <span className="font-semibold">💰 Prize pool</span> — winner 70% · 2nd
        20% · 3rd 10%.{" "}
        {potFinal ? (
          <span className="font-medium text-emerald-700">
            Final pot {pot} ILS → 🥇 {prizes[0]} · 🥈 {prizes[1]} · 🥉 {prizes[2]} ILS
          </span>
        ) : (
          <span>
            Projected (so far {players} paid players → {pot} ILS): 🥇 {prizes[0]} · 🥈{" "}
            {prizes[1]} · 🥉 {prizes[2]} ILS.{" "}
            <span className="text-slate-400">
              Final once registration closes.
            </span>
          </span>
        )}
      </div>
    </div>
  );
}
