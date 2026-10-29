import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { syncFromApi } from "@/lib/sync";
import { autofillDuePredictions } from "@/lib/autofill";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

// Called by the external cron (cron-job.org) every ~5 min:
//   GET /api/sync?key=<SYNC_SECRET>
export async function GET(req: Request) {
  const key = new URL(req.url).searchParams.get("key");
  if (!process.env.SYNC_SECRET || key !== process.env.SYNC_SECRET)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const t = await prisma.tournament.findUnique({ where: { id: 1 } });
    const syncEnabled = !t || t.syncEnabled !== false;

    // Results sync first (so kickoffs/results are fresh), then random-fill
    // whatever players left empty past each match's lock time. The autofill
    // is a game rule, so it runs even when the results sync is paused.
    const results = syncEnabled ? await syncFromApi() : null;
    const autofill = await autofillDuePredictions();

    revalidatePath("/leaderboard");
    revalidatePath("/bracket");
    revalidatePath("/predictions");
    revalidatePath("/today");
    revalidatePath("/dashboard");
    return NextResponse.json({
      ok: true,
      autofill,
      ...(results ?? { skipped: "results sync disabled" }),
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "sync failed" },
      { status: 500 },
    );
  }
}
