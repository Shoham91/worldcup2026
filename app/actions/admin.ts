"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { shuffle, randomScore, pickWinner } from "@/lib/random";
import { syncFromApi } from "@/lib/sync";
import { autofillDuePredictions } from "@/lib/autofill";

function parseDateLocal(v: FormDataEntryValue | null): Date | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

// --- Phase control: open/close + set the lock time (30 min before kickoff) ---
export async function setPhase(formData: FormData): Promise<void> {
  await requireAdmin();
  const key = String(formData.get("key"));
  const isOpen = formData.get("isOpen") === "on";
  const locksAt = parseDateLocal(formData.get("locksAt"));
  await prisma.phase.update({ where: { key }, data: { isOpen, locksAt } });
  revalidatePath("/admin");
  revalidatePath("/dashboard");
}

// --- Random auto-fill for everyone who missed a phase's deadline ---
export async function autofillPhase(formData: FormData): Promise<void> {
  await requireAdmin();
  const key = String(formData.get("key"));
  const users = await prisma.user.findMany({ where: { isAdmin: false } });

  // GROUP also fills the 1/2/3 standings picks.
  if (key === "GROUP") {
    const teams = await prisma.team.findMany();
    const byGroup = new Map<string, number[]>();
    for (const t of teams) {
      if (!byGroup.has(t.groupName)) byGroup.set(t.groupName, []);
      byGroup.get(t.groupName)!.push(t.id);
    }
    for (const u of users) {
      const have = new Set(
        (
          await prisma.groupPrediction.findMany({
            where: { userId: u.id },
            select: { groupName: true },
          })
        ).map((g) => g.groupName),
      );
      for (const [groupName, ids] of byGroup) {
        if (have.has(groupName)) continue;
        const s = shuffle(ids);
        await prisma.groupPrediction.create({
          data: {
            userId: u.id,
            groupName,
            firstTeamId: s[0],
            secondTeamId: s[1],
            isRandom: true,
          },
        });
      }
    }
  }

  // Match scorelines (group: score only; knockout: score + advancer).
  const isGroup = key === "GROUP";
  const matches = isGroup
    ? await prisma.match.findMany({ where: { round: "GROUP" } })
    : await prisma.match.findMany({
        where: { round: key, homeTeamId: { not: null }, awayTeamId: { not: null } },
      });

  for (const u of users) {
    const have = new Set(
      (
        await prisma.matchPrediction.findMany({
          where: { userId: u.id, matchId: { in: matches.map((m) => m.id) } },
          select: { matchId: true },
        })
      ).map((m) => m.matchId),
    );
    for (const m of matches) {
      if (have.has(m.id)) continue;
      const home = randomScore();
      const away = randomScore();
      const winner = isGroup
        ? null
        : pickWinner(m.homeTeamId!, m.awayTeamId!, home, away);
      await prisma.matchPrediction.create({
        data: {
          userId: u.id,
          matchId: m.id,
          homeScore: home,
          awayScore: away,
          winnerTeamId: winner,
          isRandom: true,
        },
      });
    }
  }
  revalidatePath("/admin");
}

// --- Group results: final 1-4 finishing position per team ---
export async function setGroupFinishes(formData: FormData): Promise<void> {
  await requireAdmin();
  const teams = await prisma.team.findMany({ select: { id: true } });
  await prisma.$transaction(
    teams.map((t) => {
      const raw = String(formData.get(`t${t.id}`) ?? "");
      const pos = raw ? Number(raw) : null;
      return prisma.team.update({
        where: { id: t.id },
        data: { groupFinish: pos && pos >= 1 && pos <= 4 ? pos : null },
      });
    }),
  );
  revalidatePath("/bracket");
  revalidatePath("/leaderboard");
  revalidatePath("/admin/groups");
}

// --- Knockout: assign the two teams + kickoff for fixtures in a round ---
export async function setupRoundFixtures(formData: FormData): Promise<void> {
  await requireAdmin();
  const round = String(formData.get("round"));
  const matches = await prisma.match.findMany({ where: { round } });
  await prisma.$transaction(
    matches.map((m) => {
      const home = Number(formData.get(`m${m.id}_home`)) || null;
      const away = Number(formData.get(`m${m.id}_away`)) || null;
      const kickoff = parseDateLocal(formData.get(`m${m.id}_kickoff`));
      return prisma.match.update({
        where: { id: m.id },
        data: { homeTeamId: home, awayTeamId: away, kickoff },
      });
    }),
  );
  revalidatePath(`/admin/ko/${round}`);
  revalidatePath("/bracket");
}

// --- Knockout: enter the result (score + who advanced) ---
export async function setRoundResults(formData: FormData): Promise<void> {
  await requireAdmin();
  const round = String(formData.get("round"));
  const matches = await prisma.match.findMany({ where: { round } });
  await prisma.$transaction(
    matches.map((m) => {
      const hsRaw = formData.get(`m${m.id}_home`);
      const asRaw = formData.get(`m${m.id}_away`);
      const winner = Number(formData.get(`m${m.id}_winner`)) || null;
      const played = formData.get(`m${m.id}_played`) === "on";
      const hs = hsRaw === "" || hsRaw == null ? null : Number(hsRaw);
      const as = asRaw === "" || asRaw == null ? null : Number(asRaw);
      return prisma.match.update({
        where: { id: m.id },
        data: {
          homeScore: hs,
          awayScore: as,
          winnerTeamId: winner,
          played,
        },
      });
    }),
  );
  revalidatePath(`/admin/ko/${round}`);
  revalidatePath("/bracket");
  revalidatePath("/leaderboard");
}

// --- Group match results: scoreline + kickoff for the 72 group fixtures ---
export async function setGroupMatchResults(formData: FormData): Promise<void> {
  await requireAdmin();
  const matches = await prisma.match.findMany({ where: { round: "GROUP" } });
  await prisma.$transaction(
    matches.map((m) => {
      const hsRaw = formData.get(`m${m.id}_home`);
      const asRaw = formData.get(`m${m.id}_away`);
      const played = formData.get(`m${m.id}_played`) === "on";
      const kickoff = parseDateLocal(formData.get(`m${m.id}_kickoff`));
      const hs = hsRaw === "" || hsRaw == null ? null : Number(hsRaw);
      const as = asRaw === "" || asRaw == null ? null : Number(asRaw);
      return prisma.match.update({
        where: { id: m.id },
        data: { homeScore: hs, awayScore: as, played, kickoff },
      });
    }),
  );
  revalidatePath("/admin/group-matches");
  revalidatePath("/leaderboard");
}

// --- Tournament settings: buy-in + close registration (finalises the pot) ---
export async function setTournamentSettings(formData: FormData): Promise<void> {
  await requireAdmin();
  const buyIn = Math.max(0, Number(formData.get("buyIn")) || 0);
  const registrationClosed = formData.get("registrationClosed") === "on";
  await prisma.tournament.update({
    where: { id: 1 },
    data: { buyIn, registrationClosed },
  });
  revalidatePath("/admin");
  revalidatePath("/dashboard");
  revalidatePath("/leaderboard");
}

// --- Pull real results now (admin button); always runs regardless of toggle ---
export async function syncNow(): Promise<void> {
  await requireAdmin();
  await syncFromApi();
  await autofillDuePredictions();
  revalidatePath("/admin");
  revalidatePath("/leaderboard");
  revalidatePath("/bracket");
}

// --- Pause/resume the automatic results sync ---
export async function setSyncEnabled(formData: FormData): Promise<void> {
  await requireAdmin();
  const syncEnabled = formData.get("syncEnabled") === "on";
  await prisma.tournament.update({ where: { id: 1 }, data: { syncEnabled } });
  revalidatePath("/admin");
}

// --- Override a single player's prediction for one match (admin only) ---
// Works even after the match locks — that's the whole point. Group games take
// a scoreline; knockout games also need the advancer.
export async function adminEditPick(formData: FormData): Promise<void> {
  await requireAdmin();
  const userId = Number(formData.get("userId"));
  const matchId = Number(formData.get("matchId"));
  if (!userId || !matchId) redirect("/admin/picks?err=missing");

  const [user, match] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.match.findUnique({ where: { id: matchId } }),
  ]);
  if (!user || !match) redirect("/admin/picks?err=notfound");

  const hsRaw = formData.get("home");
  const asRaw = formData.get("away");
  const home = hsRaw === "" || hsRaw == null ? NaN : Number(hsRaw);
  const away = asRaw === "" || asRaw == null ? NaN : Number(asRaw);
  if (!Number.isInteger(home) || !Number.isInteger(away) || home < 0 || away < 0)
    redirect(`/admin/picks?userId=${userId}&matchId=${matchId}&err=score`);

  // Knockout fixtures need an advancer; group games don't.
  let winnerTeamId: number | null = null;
  if (match.round !== "GROUP") {
    winnerTeamId = Number(formData.get("winner")) || null;
    if (winnerTeamId !== match.homeTeamId && winnerTeamId !== match.awayTeamId)
      redirect(`/admin/picks?userId=${userId}&matchId=${matchId}&err=winner`);
  }

  await prisma.matchPrediction.upsert({
    where: { userId_matchId: { userId, matchId } },
    update: { homeScore: home, awayScore: away, winnerTeamId, isRandom: false },
    create: { userId, matchId, homeScore: home, awayScore: away, winnerTeamId, isRandom: false },
  });

  revalidatePath("/admin/picks");
  revalidatePath("/leaderboard");
  revalidatePath("/predictions");
  redirect(`/admin/picks?userId=${userId}&matchId=${matchId}&saved=1`);
}

// --- Tournament specials: champion, runner-up, top scorer ---
export async function setSpecials(formData: FormData): Promise<void> {
  await requireAdmin();
  const championTeamId = Number(formData.get("championTeamId")) || null;
  const runnerUpTeamId = Number(formData.get("runnerUpTeamId")) || null;
  const topScorerName = String(formData.get("topScorerName") ?? "").trim() || null;
  await prisma.tournament.update({
    where: { id: 1 },
    data: { championTeamId, runnerUpTeamId, topScorerName },
  });
  revalidatePath("/leaderboard");
  revalidatePath("/admin/specials");
}

// --- Mark a player's buy-in as paid / unpaid ---
export async function togglePaid(formData: FormData): Promise<void> {
  await requireAdmin();
  const userId = Number(formData.get("userId"));
  const paid = formData.get("paid") === "true";
  await prisma.user.update({ where: { id: userId }, data: { paid } });
  revalidatePath("/admin");
}
