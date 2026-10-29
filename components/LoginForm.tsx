"use client";

import { useActionState } from "react";
import Link from "next/link";
import { login, type AuthState } from "@/app/actions/auth";

export default function LoginForm() {
  const [state, action, pending] = useActionState<AuthState, FormData>(login, {});

  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-700">Name</label>
        <input
          name="name"
          autoComplete="off"
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
          placeholder="The name you signed up with"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700">PIN</label>
        <input
          name="pin"
          type="password"
          inputMode="numeric"
          maxLength={4}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 tracking-[0.5em] focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
          placeholder="4 digits"
        />
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
        {pending ? "Signing in…" : "Sign in"}
      </button>

      <p className="text-center text-sm text-slate-500">
        New here?{" "}
        <Link href="/signup" className="font-medium text-emerald-700 hover:underline">
          Create your entry
        </Link>
      </p>
    </form>
  );
}
