"use client";

import { useActionState } from "react";
import { saveTodayScores, type PredState } from "@/app/actions/predictions";
import ScoreFixtureList, { type ScoreFixture } from "./ScoreFixtureList";

export default function TodayScoresForm({
  fixtures,
  defaults,
}: {
  fixtures: ScoreFixture[];
  defaults: Record<number, { home: number; away: number }>;
}) {
  const [state, action, pending] = useActionState<PredState, FormData>(
    saveTodayScores,
    {},
  );

  return (
    <form action={action} className="space-y-3">
      <ScoreFixtureList fixtures={fixtures} defaults={defaults} />

      {state.error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {state.error}
        </p>
      )}

      <div className="flex justify-end">
        <button
          disabled={pending}
          className="rounded-lg bg-emerald-600 px-6 py-2.5 font-semibold text-white shadow transition hover:bg-emerald-700 disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save today's picks"}
        </button>
      </div>
    </form>
  );
}
