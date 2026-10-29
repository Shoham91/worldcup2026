"use client";

import { useActionState, useState } from "react";
import { saveOneGroup, type PredState } from "@/app/actions/predictions";
import { shuffle } from "@/lib/random";
import RandomButton from "./RandomButton";
import ScoreFixtureList, { type ScoreFixture } from "./ScoreFixtureList";

type Team = { id: number; name: string };
type Standing = { first: string; second: string };

export default function OneGroupForm({
  group,
  teams,
  standingDefault,
  standingsLocked = false,
  fixtures,
  scoreDefaults,
}: {
  group: string;
  teams: Team[];
  standingDefault?: { first: number; second: number };
  standingsLocked?: boolean;
  fixtures: ScoreFixture[];
  scoreDefaults: Record<number, { home: number; away: number }>;
}) {
  const [state, action, pending] = useActionState<PredState, FormData>(
    saveOneGroup,
    {},
  );

  const [st, setSt] = useState<Standing>({
    first: standingDefault ? String(standingDefault.first) : "",
    second: standingDefault ? String(standingDefault.second) : "",
  });

  const setPos = (pos: keyof Standing, v: string) =>
    setSt((p) => ({ ...p, [pos]: v }));
  const randomStandings = () => {
    const o = shuffle(teams.map((t) => String(t.id)));
    setSt({ first: o[0], second: o[1] });
  };

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="group" value={group} />

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-bold">1 · Who advances (1st &amp; 2nd)</h2>
          {standingsLocked ? (
            <span className="text-sm text-slate-400">🔒 locked</span>
          ) : (
            <RandomButton onClick={randomStandings} />
          )}
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="mb-2 text-sm text-slate-500">
            {standingsLocked
              ? "This group's games have started — advance picks are locked."
              : "Pick the two teams you think advance (3rd-placed qualifiers show up later in the Round of 32). You can save without these and decide later."}
          </p>
          <div className="space-y-2">
            {(["first", "second"] as const).map((pos, i) => {
              const other = pos === "first" ? st.second : st.first;
              return (
                <label key={pos} className="flex items-center gap-2">
                  <span className="w-14 shrink-0 font-semibold">
                    {["🥇 1st", "🥈 2nd"][i]}
                  </span>
                  <select
                    name={standingsLocked ? undefined : pos}
                    value={st[pos]}
                    disabled={standingsLocked}
                    onChange={(e) => setPos(pos, e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 disabled:bg-slate-100 disabled:text-slate-400"
                  >
                    <option value="" disabled>
                      Choose…
                    </option>
                    {teams.map((t) => (
                      <option
                        key={t.id}
                        value={t.id}
                        disabled={String(t.id) === other}
                      >
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>
              );
            })}
          </div>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="font-bold">2 · All 6 group games — predict the scores</h2>
        <ScoreFixtureList fixtures={fixtures} defaults={scoreDefaults} />
      </section>

      {state.error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {state.error}
        </p>
      )}

      <div className="sticky bottom-20 z-30 flex justify-end md:bottom-4">
        <button
          disabled={pending}
          className="rounded-lg bg-emerald-600 px-6 py-3 font-semibold text-white shadow-lg transition hover:bg-emerald-700 disabled:opacity-60"
        >
          {pending ? "Saving…" : `Save Group ${group}`}
        </button>
      </div>
    </form>
  );
}
