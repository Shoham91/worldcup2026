"use client";

import { useActionState, useState } from "react";
import {
  saveKnockoutPredictions,
  type PredState,
} from "@/app/actions/predictions";
import { randomScore, pickWinner, wrapScore } from "@/lib/random";
import RandomButton from "./RandomButton";

type Team = { id: number; name: string; code: string };
type Fixture = { id: number; home: Team; away: Team };
type Pick = { home: string; away: string; winner: string };

export default function KnockoutPredictForm({
  round,
  fixtures,
  defaults,
}: {
  round: string;
  fixtures: Fixture[];
  defaults: Record<number, { home: number; away: number; winner: number }>;
}) {
  const [state, action, pending] = useActionState<PredState, FormData>(
    saveKnockoutPredictions,
    {},
  );

  const [picks, setPicks] = useState<Record<number, Pick>>(() => {
    const p: Record<number, Pick> = {};
    for (const f of fixtures) {
      const d = defaults[f.id];
      p[f.id] = {
        home: d ? String(d.home) : "",
        away: d ? String(d.away) : "",
        winner: d ? String(d.winner) : "",
      };
    }
    return p;
  });

  const upd = (id: number, patch: Partial<Pick>) =>
    setPicks((p) => ({ ...p, [id]: { ...p[id], ...patch } }));

  const setScore = (id: number, side: "home" | "away", v: string) => {
    if (v === "") return upd(id, { [side]: "" });
    const n = Number(v);
    if (Number.isNaN(n)) return;
    upd(id, { [side]: String(wrapScore(n)) });
  };

  const randomOne = (f: Fixture) => {
    const h = randomScore();
    const a = randomScore();
    upd(f.id, {
      home: String(h),
      away: String(a),
      winner: String(pickWinner(f.home.id, f.away.id, h, a)),
    });
  };
  const randomAll = () => fixtures.forEach(randomOne);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="round" value={round} />
      <div className="flex justify-end">
        <RandomButton onClick={randomAll} full />
      </div>

      {fixtures.map((f) => {
        const p = picks[f.id];
        return (
          <div key={f.id} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
              <label
                className={`flex cursor-pointer items-center justify-end gap-2 rounded-lg px-2 py-1 text-right ${
                  p?.winner === String(f.home.id) ? "bg-emerald-50 ring-1 ring-emerald-400" : ""
                }`}
              >
                <span className="font-semibold">{f.home.name}</span>
                <input
                  type="radio"
                  name={`m${f.id}_winner`}
                  value={f.home.id}
                  checked={p?.winner === String(f.home.id)}
                  onChange={() => upd(f.id, { winner: String(f.home.id) })}
                  className="accent-emerald-600"
                />
              </label>

              <div className="flex items-center gap-1">
                <input
                  type="number"
                  inputMode="numeric"
                  name={`m${f.id}_home`}
                  value={p?.home ?? ""}
                  onChange={(e) => setScore(f.id, "home", e.target.value)}
                  className="w-12 rounded-md border border-slate-300 px-2 py-1 text-center"
                />
                <span className="text-slate-400">:</span>
                <input
                  type="number"
                  inputMode="numeric"
                  name={`m${f.id}_away`}
                  value={p?.away ?? ""}
                  onChange={(e) => setScore(f.id, "away", e.target.value)}
                  className="w-12 rounded-md border border-slate-300 px-2 py-1 text-center"
                />
              </div>

              <label
                className={`flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 ${
                  p?.winner === String(f.away.id) ? "bg-emerald-50 ring-1 ring-emerald-400" : ""
                }`}
              >
                <input
                  type="radio"
                  name={`m${f.id}_winner`}
                  value={f.away.id}
                  checked={p?.winner === String(f.away.id)}
                  onChange={() => upd(f.id, { winner: String(f.away.id) })}
                  className="accent-emerald-600"
                />
                <span className="font-semibold">{f.away.name}</span>
              </label>
            </div>
            <div className="mt-1 flex items-center justify-between">
              <span className="text-xs text-slate-400">
                Pick who advances (penalties count)
              </span>
              <RandomButton onClick={() => randomOne(f)} />
            </div>
          </div>
        );
      })}

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
          {pending ? "Saving…" : "Save predictions"}
        </button>
      </div>
    </form>
  );
}
