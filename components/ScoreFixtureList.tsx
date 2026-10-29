"use client";

import { useState } from "react";
import { randomScore, wrapScore } from "@/lib/random";
import RandomButton from "./RandomButton";

export type ScoreFixture = {
  id: number;
  group?: string | null;
  home: string;
  away: string;
  locked?: boolean;
  note?: string | null; // shown on locked rows (e.g. kickoff time or "FT 2-1")
};
type Scores = Record<number, { home: string; away: string }>;

export default function ScoreFixtureList({
  fixtures,
  defaults,
}: {
  fixtures: ScoreFixture[];
  defaults: Record<number, { home: number; away: number }>;
}) {
  const [scores, setScores] = useState<Scores>(() => {
    const s: Scores = {};
    for (const f of fixtures) {
      const d = defaults[f.id];
      s[f.id] = { home: d ? String(d.home) : "", away: d ? String(d.away) : "" };
    }
    return s;
  });

  const set = (id: number, side: "home" | "away", v: string) => {
    const next =
      v === "" ? "" : Number.isNaN(Number(v)) ? undefined : String(wrapScore(Number(v)));
    if (next === undefined) return;
    setScores((p) => ({ ...p, [id]: { ...p[id], [side]: next } }));
  };

  const randomOne = (id: number) =>
    setScores((p) => ({
      ...p,
      [id]: { home: String(randomScore()), away: String(randomScore()) },
    }));

  const randomAll = () =>
    setScores((p) => {
      const s: Scores = { ...p };
      for (const f of fixtures)
        if (!f.locked)
          s[f.id] = { home: String(randomScore()), away: String(randomScore()) };
      return s;
    });

  const anyOpen = fixtures.some((f) => !f.locked);

  return (
    <div className="space-y-2">
      {anyOpen && (
        <div className="flex justify-end">
          <RandomButton onClick={randomAll} full />
        </div>
      )}
      {fixtures.map((f) => (
        <div
          key={f.id}
          className={`rounded-lg border px-3 py-2 ${
            f.locked ? "border-slate-200 bg-slate-50" : "border-slate-200 bg-white"
          }`}
        >
          {(f.group || f.note) && (
            <div className="mb-1 flex items-center justify-between text-xs text-slate-400">
              <span>{f.group ? `Group ${f.group}` : ""}</span>
              <span className="whitespace-nowrap">
                {f.locked ? "🔒 " : ""}
                {f.note}
              </span>
            </div>
          )}
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            <span className="text-right font-medium">{f.home}</span>
            <div className="flex items-center gap-1">
              <input
                type="number"
                inputMode="numeric"
                disabled={f.locked}
                value={scores[f.id]?.home ?? ""}
                onChange={(e) => set(f.id, "home", e.target.value)}
                name={f.locked ? undefined : `m${f.id}_home`}
                className="w-12 rounded-md border border-slate-300 px-1 py-1.5 text-center disabled:bg-slate-100 disabled:text-slate-400"
              />
              <span className="text-slate-400">:</span>
              <input
                type="number"
                inputMode="numeric"
                disabled={f.locked}
                value={scores[f.id]?.away ?? ""}
                onChange={(e) => set(f.id, "away", e.target.value)}
                name={f.locked ? undefined : `m${f.id}_away`}
                className="w-12 rounded-md border border-slate-300 px-1 py-1.5 text-center disabled:bg-slate-100 disabled:text-slate-400"
              />
            </div>
            <span className="font-medium">{f.away}</span>
          </div>
          {!f.locked && (
            <div className="mt-1 flex justify-end">
              <RandomButton onClick={() => randomOne(f.id)} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
