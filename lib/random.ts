// Shared randomisation — used both by the "TF Should I Know?! Random!" buttons
// (client) and by the missed-deadline auto-fill (server). Same mechanism.

export const SCORE_MAX = 9; // manual entry + validation cap (0..9)

export function randInt(maxExclusive: number): number {
  return Math.floor(Math.random() * maxExclusive);
}

// Weighted to look like real football scores rather than a flat 0–6:
//   0–2 → 70%   ·   3–4 → 20%   ·   5–6 → 10%
export function randomScore(): number {
  const r = Math.random();
  if (r < 0.7) return randInt(3); // 0, 1, 2
  if (r < 0.9) return 3 + randInt(2); // 3, 4
  return 5 + randInt(2); // 5, 6
}

// Wrap a score into 0..SCORE_MAX, looping both ways (10 -> 0, -1 -> 9).
// Lets the number-input arrows cycle past the ends.
export function wrapScore(n: number): number {
  const span = SCORE_MAX + 1;
  return ((n % span) + span) % span;
}

export function pick<T>(arr: T[]): T {
  return arr[randInt(arr.length)];
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Pick the advancing team for a knockout tie — the higher score wins, and a
// drawn 90-min scoreline goes to a coin flip (penalties).
export function pickWinner(
  homeId: number,
  awayId: number,
  home: number,
  away: number,
): number {
  if (home > away) return homeId;
  if (away > home) return awayId;
  return Math.random() < 0.5 ? homeId : awayId;
}
