import "server-only";
import { prisma } from "./prisma";

export type Phase = {
  id: number;
  key: string;
  label: string;
  sort: number;
  isOpen: boolean;
  locksAt: Date | null;
};

// Predictions for a phase are editable while it is open AND the lock time
// (30 min before the round's first game) has not passed.
export function isEditable(phase: Pick<Phase, "isOpen" | "locksAt">): boolean {
  if (!phase.isOpen) return false;
  if (phase.locksAt && Date.now() >= phase.locksAt.getTime()) return false;
  return true;
}

export function isLocked(phase: Pick<Phase, "isOpen" | "locksAt">): boolean {
  return !!phase.locksAt && Date.now() >= phase.locksAt.getTime();
}

// A match's predictions lock 10 minutes before its kickoff (or as soon as it
// has a result, even if a kickoff time were missing). A group's 1st/2nd picks
// lock when ANY of its games locks.
// NOTE: keep the autofill cron interval well under this lead (≈5 min) so empty
// picks always get a random fill inside the [lock, kickoff] window.
export const LOCK_LEAD_MS = 10 * 60 * 1000;

export function matchLocked(m: {
  played?: boolean | null;
  kickoff: Date | null;
}): boolean {
  if (m.played) return true;
  return m.kickoff != null && Date.now() >= m.kickoff.getTime() - LOCK_LEAD_MS;
}

export async function getPhases(): Promise<Phase[]> {
  return prisma.phase.findMany({ orderBy: { sort: "asc" } });
}

export async function getPhase(key: string): Promise<Phase | null> {
  return prisma.phase.findUnique({ where: { key } });
}
