import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPhases, isEditable, matchLocked } from "@/lib/phases";
import { scoreLine } from "@/lib/scoring";
import { POINTS, ROUND_LABELS, scoreValues } from "@/lib/points";
import { jerusalemDay } from "@/lib/datetime";
import TodayScoresForm from "@/components/TodayScoresForm";
import AutoRefresh from "@/components/AutoRefresh";
import type { ScoreFixture } from "@/components/ScoreFixtureList";

const fmtTime = (d: Date) =>
  new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jerusalem",
  }).format(d);

const fmtDate = (d: Date) =>
  new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Asia/Jerusalem",
  }).format(d);

const fmtDayTime = (d: Date) =>
  new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jerusalem",
  }).format(d);

// How a graded scoreline pick reads on the card (values depend on the round).
function ptsLabel(pts: number, round: string): { text: string; cls: string } {
  const v = scoreValues(round);
  if (pts === v.exact)
    return { text: `🎯 Exact +${pts}`, cls: "bg-emerald-100 text-emerald-800" };
  if (pts === v.resultAndGd)
    return { text: `Result & GD +${pts}`, cls: "bg-emerald-50 text-emerald-700" };
  if (pts === v.result)
    return { text: `Result +${pts}`, cls: "bg-amber-50 text-amber-700" };
  return { text: "0 pts", cls: "bg-slate-100 text-slate-500" };
}

export default async function TodayPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const user = await requireUser();
  const { saved } = await searchParams;

  const [matches, preds, phases] = await Promise.all([
    prisma.match.findMany({
      where: { kickoff: { not: null } },
      include: { homeTeam: true, awayTeam: true },
      orderBy: { kickoff: "asc" },
    }),
    prisma.matchPrediction.findMany({ where: { userId: user.id } }),
    getPhases(),
  ]);

  const phaseByKey = new Map(phases.map((p) => [p.key, p]));
  // A knockout game is predictable only once its round's phase is open (and not
  // yet locked) AND both teams are drawn — otherwise the predict page would
  // just tell you it's locked.
  const koPredictable = (m: (typeof matches)[number]) => {
    const ph = phaseByKey.get(m.round);
    return !!ph && isEditable(ph) && m.homeTeamId != null && m.awayTeamId != null;
  };

  const now = new Date();
  const today = jerusalemDay(now);
  const tomorrow = jerusalemDay(new Date(now.getTime() + 24 * 60 * 60 * 1000));
  // North-America kickoffs land deep into the Jerusalem night, so "tonight's
  // games" often fall on tomorrow's calendar day — show a two-day window.
  const upcoming = matches.filter((m) => {
    const day = jerusalemDay(m.kickoff!);
    return day === today || day === tomorrow;
  });
  const byMatch = new Map(preds.map((p) => [p.matchId, p]));

  // Kickoff label: bare time for today, weekday + time for tomorrow's games.
  const when = (m: (typeof matches)[number]) =>
    m.kickoff
      ? jerusalemDay(m.kickoff) === today
        ? fmtTime(m.kickoff)
        : fmtDayTime(m.kickoff)
      : "";

  const open = upcoming.filter((m) => !matchLocked(m));
  const openGroup = open.filter((m) => m.round === "GROUP");
  const openKo = open.filter((m) => m.round !== "GROUP" && koPredictable(m));
  // Knockout games in the window whose round hasn't opened for predictions yet
  // — shown as a heads-up, not as something you can act on.
  const koComingSoon = open.filter(
    (m) => m.round !== "GROUP" && !koPredictable(m),
  );
  const locked = upcoming.filter((m) => matchLocked(m));

  const fixtures: ScoreFixture[] = openGroup.map((m) => ({
    id: m.id,
    group: m.groupName,
    home: m.homeTeam?.name ?? "TBD",
    away: m.awayTeam?.name ?? "TBD",
    locked: false,
    note: when(m) || null,
  }));
  const defaults: Record<number, { home: number; away: number }> = {};
  for (const m of openGroup) {
    const p = byMatch.get(m.id);
    if (p) defaults[m.id] = { home: p.homeScore, away: p.awayScore };
  }

  // Where to point people on a quiet day.
  const next = matches.find((m) => jerusalemDay(m.kickoff!) > tomorrow);

  return (
    <div className="space-y-6">
      <AutoRefresh seconds={60} />

      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">
          ⚡ Today &amp; Tomorrow
        </h1>
        <p className="text-slate-500">
          {fmtDate(now)} — all games for the next two days, in one place (the
          late-night kickoffs spill past midnight here). Times in Jerusalem;
          each game locks 10 min before kickoff.
        </p>
      </div>

      {saved && (
        <div className="rounded-lg bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
          ✓ Today&apos;s picks saved. Good luck!
        </div>
      )}

      {upcoming.length === 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-slate-600">
          No games today or tomorrow. 😴{" "}
          {next?.kickoff ? (
            <>
              Next up: <b>{fmtDate(next.kickoff)}</b> — check the{" "}
              <Link href="/bracket" className="text-emerald-700 underline">
                tournament page
              </Link>{" "}
              meanwhile.
            </>
          ) : (
            "The schedule has no upcoming kickoffs yet."
          )}
        </div>
      )}

      {openGroup.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-bold">✏️ Still open — get your picks in</h2>
          <TodayScoresForm fixtures={fixtures} defaults={defaults} />
        </section>
      )}

      {openKo.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-bold">✏️ Knockout games today</h2>
          <div className="space-y-2">
            {openKo.map((m) => {
              const p = byMatch.get(m.id);
              return (
                <div
                  key={m.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3"
                >
                  <div>
                    <div className="text-xs text-slate-400">
                      {ROUND_LABELS[m.round]} · {when(m)}
                    </div>
                    <div className="font-semibold">
                      {m.homeTeam?.name ?? "TBD"} v {m.awayTeam?.name ?? "TBD"}
                    </div>
                    <div className="text-sm text-slate-500">
                      Your pick:{" "}
                      {p ? (
                        <b className="tabular-nums">
                          {p.homeScore}-{p.awayScore}
                        </b>
                      ) : (
                        "—"
                      )}
                    </div>
                  </div>
                  <Link
                    href={`/predict/ko/${m.round}`}
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                  >
                    {p ? "Edit" : "Predict"} in {ROUND_LABELS[m.round]}
                  </Link>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {koComingSoon.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-bold">⏳ Knockout coming up</h2>
          <div className="space-y-2">
            {koComingSoon.map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
              >
                <div>
                  <div className="text-xs text-slate-400">
                    {ROUND_LABELS[m.round]} · {when(m)}
                  </div>
                  <div className="font-semibold text-slate-700">
                    {m.homeTeam?.name ?? "TBD"} v {m.awayTeam?.name ?? "TBD"}
                  </div>
                </div>
                <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-medium text-slate-600">
                  Predictions open soon
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {locked.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-bold">🔒 Locked — in play or finished</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {locked.map((m) => {
              const p = byMatch.get(m.id);
              const done = m.played && m.homeScore != null && m.awayScore != null;
              const pts =
                done && p
                  ? scoreLine(p.homeScore, p.awayScore, m.homeScore!, m.awayScore!, m.round)
                  : null;
              const winnerPts =
                done &&
                p &&
                m.round !== "GROUP" &&
                m.winnerTeamId != null &&
                p.winnerTeamId === m.winnerTeamId
                  ? (POINTS.knockoutWinner[m.round] ?? 0)
                  : 0;
              const label = pts != null ? ptsLabel(pts, m.round) : null;
              return (
                <div
                  key={m.id}
                  className="rounded-xl border border-slate-200 bg-white p-4"
                >
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>
                      {m.round === "GROUP"
                        ? `Group ${m.groupName}`
                        : ROUND_LABELS[m.round]}
                    </span>
                    <span>{done ? "FT" : `🔒 ${when(m)}`}</span>
                  </div>
                  <div className="mt-1 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                    <span className="text-right text-sm font-semibold">
                      {m.homeTeam?.name ?? "TBD"}
                    </span>
                    <span className="text-lg font-extrabold tabular-nums">
                      {done ? `${m.homeScore} - ${m.awayScore}` : "– : –"}
                    </span>
                    <span className="text-sm font-semibold">
                      {m.awayTeam?.name ?? "TBD"}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-1.5 text-sm">
                    <span className="text-slate-600">
                      Your pick:{" "}
                      <b className="tabular-nums">
                        {p ? `${p.homeScore}-${p.awayScore}` : "—"}
                      </b>
                      {p?.isRandom && " 🎲"}
                    </span>
                    {label && (
                      <span className="flex items-center gap-1">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${label.cls}`}
                        >
                          {label.text}
                        </span>
                        {winnerPts > 0 && (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                            Advancer +{winnerPts}
                          </span>
                        )}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
