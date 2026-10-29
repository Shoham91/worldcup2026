"use client";

import { useActionState, useState } from "react";
import { updateSignupPicks, type PredState } from "@/app/actions/predictions";
import { POINTS } from "@/lib/points";
import { pick } from "@/lib/random";
import RandomButton from "./RandomButton";

type Team = { id: number; name: string; groupName: string };
type Player = { name: string; team: string };

const OTHER = "__other__";

export default function SpecialsForm({
  teams,
  players,
  defaults,
}: {
  teams: Team[];
  players: Player[];
  defaults: { champion: number | null; finalist: number | null; scorer: string | null };
}) {
  const [state, action, pending] = useActionState<PredState, FormData>(
    updateSignupPicks,
    {},
  );

  const knownScorer = players.some((p) => p.name === defaults.scorer);
  const [champion, setChampion] = useState(defaults.champion ? String(defaults.champion) : "");
  const [finalist, setFinalist] = useState(defaults.finalist ? String(defaults.finalist) : "");
  const [scorer, setScorer] = useState(
    defaults.scorer ? (knownScorer ? defaults.scorer : OTHER) : "",
  );
  const [scorerOther, setScorerOther] = useState(
    defaults.scorer && !knownScorer ? defaults.scorer : "",
  );

  const teamOptions = (disableId?: string) =>
    [...new Set(teams.map((t) => t.groupName))].sort().map((g) => (
      <optgroup key={g} label={`Group ${g}`}>
        {teams.filter((t) => t.groupName === g).map((t) => (
          <option key={t.id} value={t.id} disabled={disableId === String(t.id)}>
            {t.name}
          </option>
        ))}
      </optgroup>
    ));
  const playerTeams = [...new Set(players.map((p) => p.team))];

  // Champion and finalist must stay different teams.
  const randChampion = () =>
    setChampion(String(pick(teams.filter((t) => String(t.id) !== finalist)).id));
  const randFinalist = () =>
    setFinalist(String(pick(teams.filter((t) => String(t.id) !== champion)).id));
  const randAll = () => {
    const champ = pick(teams);
    const fin = pick(teams.filter((t) => t.id !== champ.id));
    setChampion(String(champ.id));
    setFinalist(String(fin.id));
    setScorer(pick(players).name);
  };

  const selectCls =
    "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200";

  return (
    <form action={action} className="space-y-4">
      <div className="flex justify-end">
        <RandomButton onClick={randAll} full />
      </div>

      <div>
        <label className="flex items-center justify-between font-medium text-slate-700">
          🏆 Champion <span className="text-slate-400">(+{POINTS.signup.champion})</span>
        </label>
        <div className="flex items-center gap-2">
          <select name="championTeamId" value={champion} onChange={(e) => setChampion(e.target.value)} className={selectCls}>
            <option value="" disabled>Choose a team…</option>
            {teamOptions(finalist)}
          </select>
          <RandomButton onClick={randChampion} />
        </div>
      </div>

      <div>
        <label className="flex items-center justify-between font-medium text-slate-700">
          🎟️ A team that reaches the Final <span className="text-slate-400">(+{POINTS.signup.finalist})</span>
        </label>
        <div className="flex items-center gap-2">
          <select name="finalistTeamId" value={finalist} onChange={(e) => setFinalist(e.target.value)} className={selectCls}>
            <option value="" disabled>Choose a team…</option>
            {teamOptions(champion)}
          </select>
          <RandomButton onClick={randFinalist} />
        </div>
      </div>

      <div>
        <label className="flex items-center justify-between font-medium text-slate-700">
          ⚽ Top scorer (Golden Boot) <span className="text-slate-400">(+{POINTS.signup.topScorer})</span>
        </label>
        <div className="flex items-center gap-2">
          <select
            value={scorer}
            onChange={(e) => setScorer(e.target.value)}
            name={scorer === OTHER ? undefined : "topScorerName"}
            className={selectCls}
          >
            <option value="" disabled>Choose a player…</option>
            {playerTeams.map((tm) => (
              <optgroup key={tm} label={tm}>
                {players.filter((p) => p.team === tm).map((p) => (
                  <option key={p.name} value={p.name}>{p.name}</option>
                ))}
              </optgroup>
            ))}
            <option value={OTHER}>✏️ Other (type a name)…</option>
          </select>
          <RandomButton onClick={() => setScorer(pick(players).name)} />
        </div>
        {scorer === OTHER && (
          <input
            name="topScorerName"
            value={scorerOther}
            onChange={(e) => setScorerOther(e.target.value)}
            autoComplete="off"
            placeholder="Player name"
            className={`${selectCls} mt-2`}
          />
        )}
      </div>

      {state.error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{state.error}</p>
      )}

      <div className="flex justify-end">
        <button
          disabled={pending}
          className="rounded-lg bg-emerald-600 px-6 py-3 font-semibold text-white shadow-lg transition hover:bg-emerald-700 disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save title picks"}
        </button>
      </div>
    </form>
  );
}
