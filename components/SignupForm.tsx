"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { signup, type AuthState } from "@/app/actions/auth";
import { POINTS } from "@/lib/points";
import { pick } from "@/lib/random";
import RandomButton from "./RandomButton";

type Team = { id: number; name: string; groupName: string };
type Player = { name: string; team: string };

const OTHER = "__other__";

export default function SignupForm({
  teams,
  players,
}: {
  teams: Team[];
  players: Player[];
}) {
  const [state, action, pending] = useActionState<AuthState, FormData>(signup, {});

  const [champion, setChampion] = useState("");
  const [finalist, setFinalist] = useState("");
  const [scorer, setScorer] = useState(""); // a player name, or OTHER
  const [scorerOther, setScorerOther] = useState("");

  const teamOptions = (disableId?: string) =>
    [...new Set(teams.map((t) => t.groupName))]
      .sort()
      .map((g) => (
        <optgroup key={g} label={`Group ${g}`}>
          {teams
            .filter((t) => t.groupName === g)
            .map((t) => (
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
  const randScorer = () => setScorer(pick(players).name);
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
      <div>
        <label className="block text-sm font-medium text-slate-700">
          Join code
        </label>
        <input
          name="joinCode"
          autoComplete="off"
          className={selectCls}
          placeholder="The code from the organiser"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-slate-700">Name</label>
          <input
            name="name"
            autoComplete="off"
            className={selectCls}
            placeholder="Your name"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">
            4-digit PIN
          </label>
          <input
            name="pin"
            type="password"
            inputMode="numeric"
            maxLength={4}
            className={`${selectCls} tracking-[0.5em]`}
            placeholder="0000"
          />
        </div>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-amber-900">
            🔮 Your title picks — worth the most points
          </p>
          <RandomButton onClick={randAll} full />
        </div>

        <div className="space-y-3">
          <div>
            <label className="flex items-center justify-between text-sm font-medium text-slate-700">
              🏆 Champion <span className="text-slate-400">(+{POINTS.signup.champion})</span>
            </label>
            <div className="flex items-center gap-2">
              <select
                name="championTeamId"
                value={champion}
                onChange={(e) => setChampion(e.target.value)}
                className={selectCls}
              >
                <option value="" disabled>
                  Choose a team…
                </option>
                {teamOptions(finalist)}
              </select>
              <RandomButton onClick={randChampion} />
            </div>
          </div>

          <div>
            <label className="flex items-center justify-between text-sm font-medium text-slate-700">
              🎟️ A team that reaches the Final{" "}
              <span className="text-slate-400">(+{POINTS.signup.finalist})</span>
            </label>
            <div className="flex items-center gap-2">
              <select
                name="finalistTeamId"
                value={finalist}
                onChange={(e) => setFinalist(e.target.value)}
                className={selectCls}
              >
                <option value="" disabled>
                  Choose a team…
                </option>
                {teamOptions(champion)}
              </select>
              <RandomButton onClick={randFinalist} />
            </div>
          </div>

          <div>
            <label className="flex items-center justify-between text-sm font-medium text-slate-700">
              ⚽ Top scorer (Golden Boot){" "}
              <span className="text-slate-400">(+{POINTS.signup.topScorer})</span>
            </label>
            <div className="flex items-center gap-2">
              <select
                value={scorer}
                onChange={(e) => setScorer(e.target.value)}
                name={scorer === OTHER ? undefined : "topScorerName"}
                className={selectCls}
              >
                <option value="" disabled>
                  Choose a player…
                </option>
                {playerTeams.map((tm) => (
                  <optgroup key={tm} label={tm}>
                    {players
                      .filter((p) => p.team === tm)
                      .map((p) => (
                        <option key={p.name} value={p.name}>
                          {p.name}
                        </option>
                      ))}
                  </optgroup>
                ))}
                <option value={OTHER}>✏️ Other (type a name)…</option>
              </select>
              <RandomButton onClick={randScorer} />
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
        </div>
      </div>

      {state.error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {state.error}
        </p>
      )}

      <button
        disabled={pending}
        className="w-full rounded-lg bg-emerald-600 py-2.5 font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
      >
        {pending ? "Creating…" : "Join the league"}
      </button>

      <p className="text-center text-sm text-slate-500">
        Already in?{" "}
        <Link href="/login" className="font-medium text-emerald-700 hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
