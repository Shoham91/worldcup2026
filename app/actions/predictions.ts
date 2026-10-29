"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { getPhase, isEditable, matchLocked } from "@/lib/phases";
import { SCORE_MAX } from "@/lib/random";

type Op = Prisma.PrismaPromise<unknown>;

export type PredState = { error?: string; ok?: boolean };

// Read a score field; returns the int (0..SCORE_MAX) or null if missing/invalid.
function readScore(fd: FormData, key: string): number | null {
  const raw = fd.get(key);
  if (raw == null || String(raw).trim() === "") return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > SCORE_MAX) return null;
  return n;
}

// Save-or-clear semantics for one knockout fixture: all three fields empty ->
// delete any previous pick (left for the lock-time auto-fill); any field filled
// -> require both scores AND the advancer; partly filled -> error. This lets a
// round be saved game-by-game instead of all-or-nothing.
function koScoreOps(
  userId: number,
  m: { id: number; homeTeamId: number | null; awayTeamId: number | null },
  fd: FormData,
): { error?: string; ops: Op[] } {
  const home = readScore(fd, `m${m.id}_home`);
  const away = readScore(fd, `m${m.id}_away`);
  const wRaw = fd.get(`m${m.id}_winner`);
  const winner =
    wRaw == null || String(wRaw).trim() === "" ? null : Number(wRaw);

  if (home === null && away === null && winner === null) {
    return {
      ops: [prisma.matchPrediction.deleteMany({ where: { userId, matchId: m.id } })],
    };
  }
  if (home === null || away === null)
    return {
      error: `Each pick needs both scores (0–${SCORE_MAX}) — or leave the whole game blank.`,
      ops: [],
    };
  if (winner !== m.homeTeamId && winner !== m.awayTeamId)
    return { error: "Pick who advances for every game you score.", ops: [] };

  return {
    ops: [
      prisma.matchPrediction.upsert({
        where: { userId_matchId: { userId, matchId: m.id } },
        update: { homeScore: home, awayScore: away, winnerTeamId: winner, isRandom: false },
        create: {
          userId,
          matchId: m.id,
          homeScore: home,
          awayScore: away,
          winnerTeamId: winner,
          isRandom: false,
        },
      }),
    ],
  };
}

// Save-or-clear semantics for one group game's scoreline: both fields filled
// -> upsert, both empty -> delete any previous pick, mixed -> error.
function groupScoreOps(
  userId: number,
  matchId: number,
  fd: FormData,
): { error?: string; ops: Op[] } {
  const home = readScore(fd, `m${matchId}_home`);
  const away = readScore(fd, `m${matchId}_away`);
  if (home === null && away === null) {
    return {
      ops: [
        prisma.matchPrediction.deleteMany({ where: { userId, matchId } }),
      ],
    };
  }
  if (home === null || away === null)
    return {
      error: `A score needs both sides (0–${SCORE_MAX}) — or leave both empty to decide later.`,
      ops: [],
    };
  return {
    ops: [
      prisma.matchPrediction.upsert({
        where: { userId_matchId: { userId, matchId } },
        update: { homeScore: home, awayScore: away, winnerTeamId: null, isRandom: false },
        create: {
          userId,
          matchId,
          homeScore: home,
          awayScore: away,
          winnerTeamId: null,
          isRandom: false,
        },
      }),
    ],
  };
}

// Predict a SINGLE group: 1st & 2nd + the scores of its 6 games.
export async function saveOneGroup(
  _prev: PredState,
  formData: FormData,
): Promise<PredState> {
  const user = await requireUser();

  const group = String(formData.get("group") ?? "");
  if (!/^[A-L]$/.test(group)) return { error: "Unknown group." };

  const groupTeams = await prisma.team.findMany({ where: { groupName: group } });
  const validIds = new Set(groupTeams.map((t) => t.id));

  const matches = await prisma.match.findMany({
    where: { round: "GROUP", groupName: group },
    orderBy: { slot: "asc" },
  });

  // 1st/2nd lock 10 min before the group's first game — you can't change who
  // advances once group play is about to begin.
  const standingsEditable = !matches.some((m) => matchLocked(m));

  const ops: Op[] = [];

  // Standings are optional on save: both picked -> saved; both empty -> left
  // for later; only one picked -> ask for the other.
  if (standingsEditable) {
    const first = Number(formData.get("first")) || 0;
    const second = Number(formData.get("second")) || 0;
    if (first || second) {
      if (!first || !second)
        return { error: "Pick both 1st and 2nd (or leave both empty for now)." };
      if (![first, second].every((id) => validIds.has(id)))
        return { error: "Invalid team selected." };
      if (first === second)
        return { error: "1st and 2nd must be different teams." };
      ops.push(
        prisma.groupPrediction.upsert({
          where: { userId_groupName: { userId: user.id, groupName: group } },
          update: { firstTeamId: first, secondTeamId: second, isRandom: false },
          create: {
            userId: user.id,
            groupName: group,
            firstTeamId: first,
            secondTeamId: second,
            isRandom: false,
          },
        }),
      );
    }
  }

  // Scores save per game: filled -> saved, fully empty -> stays empty (a
  // random pick is auto-filled at lock time), locked games are untouchable.
  for (const m of matches) {
    if (matchLocked(m)) continue;
    const r = groupScoreOps(user.id, m.id, formData);
    if (r.error) return { error: r.error };
    ops.push(...r.ops);
  }

  if (ops.length === 0)
    return { error: "Everything in this group is already locked." };

  await prisma.$transaction(ops);
  revalidatePath("/dashboard");
  revalidatePath("/predict/group");
  redirect(`/predict/group?saved=${group}`);
}

// Quick-save scorelines from the Today page. Group games only — knockout
// picks also need an advancer, so those stay on their round's page. The match
// set is re-derived from the submitted field names and validated server-side.
export async function saveTodayScores(
  _prev: PredState,
  formData: FormData,
): Promise<PredState> {
  const user = await requireUser();

  const ids = [
    ...new Set(
      [...formData.keys()]
        .map((k) => /^m(\d+)_(?:home|away)$/.exec(k)?.[1])
        .filter((v): v is string => v != null)
        .map(Number),
    ),
  ];
  if (ids.length === 0) return { error: "Nothing to save." };

  const matches = await prisma.match.findMany({
    where: { id: { in: ids }, round: "GROUP" },
  });

  const ops: Op[] = [];
  for (const m of matches) {
    if (matchLocked(m)) continue;
    const r = groupScoreOps(user.id, m.id, formData);
    if (r.error) return { error: r.error };
    ops.push(...r.ops);
  }
  if (ops.length === 0)
    return { error: "These games have already locked." };

  await prisma.$transaction(ops);
  revalidatePath("/today");
  revalidatePath("/dashboard");
  redirect("/today?saved=1");
}

// Edit the blind title picks (champion / finalist / top scorer).
// Allowed until the tournament starts (GROUP lock = 30 min before the opener).
export async function updateSignupPicks(
  _prev: PredState,
  formData: FormData,
): Promise<PredState> {
  const user = await requireUser();
  const phase = await getPhase("GROUP");
  if (!phase || !isEditable(phase))
    return { error: "Title picks are locked — the tournament has started." };

  const championTeamId = Number(formData.get("championTeamId"));
  const finalistTeamId = Number(formData.get("finalistTeamId"));
  const topScorerName = String(formData.get("topScorerName") ?? "").trim();
  if (!championTeamId || !finalistTeamId)
    return { error: "Pick your champion and a finalist." };
  if (championTeamId === finalistTeamId)
    return { error: "Champion and finalist must be different teams." };
  if (topScorerName.length < 2) return { error: "Enter your top-scorer pick." };

  const ids = new Set(
    (await prisma.team.findMany({ select: { id: true } })).map((t) => t.id),
  );
  if (!ids.has(championTeamId) || !ids.has(finalistTeamId))
    return { error: "Invalid team." };

  await prisma.user.update({
    where: { id: user.id },
    data: { championTeamId, finalistTeamId, topScorerName },
  });
  revalidatePath("/dashboard");
  redirect("/dashboard?saved=picks");
}

// Knockout round: advancer + scoreline for every fixture in the round.
export async function saveKnockoutPredictions(
  _prev: PredState,
  formData: FormData,
): Promise<PredState> {
  const user = await requireUser();
  const round = String(formData.get("round") ?? "");
  const phase = await getPhase(round);
  if (!phase || !isEditable(phase))
    return { error: "This round's predictions are locked." };

  const matches = await prisma.match.findMany({ where: { round } });
  // Only fixtures that are set AND haven't locked (10 min before kickoff /
  // already played) are writable. Each game saves on its own — fill some now
  // and the rest later; locked games are simply skipped.
  const ready = matches.filter(
    (m) => m.homeTeamId && m.awayTeamId && !matchLocked(m),
  );
  if (ready.length === 0)
    return { error: "No open fixtures in this round — they're locked or not set yet." };

  const ops: Op[] = [];
  for (const m of ready) {
    const r = koScoreOps(user.id, m, formData);
    if (r.error) return { error: r.error };
    ops.push(...r.ops);
  }

  await prisma.$transaction(ops);
  revalidatePath("/dashboard");
  redirect(`/dashboard?saved=${round}`);
}
