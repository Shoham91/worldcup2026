"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createSession, destroySession } from "@/lib/session";

export type AuthState = { error?: string };

function cleanName(raw: FormDataEntryValue | null): string {
  return String(raw ?? "").trim();
}

export async function signup(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const name = cleanName(formData.get("name"));
  const pin = String(formData.get("pin") ?? "");
  const joinCode = String(formData.get("joinCode") ?? "").trim();
  const championTeamId = Number(formData.get("championTeamId"));
  const finalistTeamId = Number(formData.get("finalistTeamId"));
  const topScorerName = String(formData.get("topScorerName") ?? "").trim();

  // Shared join code gate (active only when JOIN_CODE is configured).
  const expectedCode = process.env.JOIN_CODE?.trim();
  if (expectedCode && joinCode !== expectedCode)
    return { error: "Wrong join code — ask the organiser." };

  // Registration closes for good when title picks lock (just before kickoff).
  const [tournament, groupPhase] = await Promise.all([
    prisma.tournament.findUnique({ where: { id: 1 } }),
    prisma.phase.findUnique({ where: { key: "GROUP" } }),
  ]);
  const registrationClosed =
    tournament?.registrationClosed ||
    (groupPhase?.locksAt != null && Date.now() >= groupPhase.locksAt.getTime());
  if (registrationClosed)
    return {
      error: "Registration is closed — the tournament has kicked off. See you in 2030 😉",
    };

  if (name.length < 2) return { error: "Please enter your full name." };
  if (!/^\d{4}$/.test(pin)) return { error: "PIN must be exactly 4 digits." };
  if (!championTeamId || !finalistTeamId)
    return { error: "Pick your champion and a finalist." };
  if (championTeamId === finalistTeamId)
    return { error: "Champion and finalist must be different teams." };
  if (topScorerName.length < 2)
    return { error: "Enter your top-scorer pick." };

  const existing = await prisma.user.findUnique({ where: { name } });
  if (existing)
    return { error: "That name is taken — pick another or log in." };

  const pinHash = await bcrypt.hash(pin, 10);
  const user = await prisma.user.create({
    data: {
      name,
      pinHash,
      championTeamId,
      finalistTeamId,
      topScorerName,
    },
  });

  await createSession(user.id);
  redirect("/dashboard");
}

export async function login(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const name = cleanName(formData.get("name"));
  const pin = String(formData.get("pin") ?? "");

  const user = await prisma.user.findUnique({ where: { name } });
  if (!user || !(await bcrypt.compare(pin, user.pinHash)))
    return { error: "Wrong name or PIN." };

  await createSession(user.id);
  redirect(user.isAdmin ? "/admin" : "/dashboard");
}

export async function logout(): Promise<void> {
  await destroySession();
  redirect("/login");
}
