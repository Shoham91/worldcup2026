import { PRIZES } from "./points";

// Split a pot (ILS) into [1st, 2nd, 3rd] using PRIZES, rounded to whole ILS.
// Any rounding remainder is folded into 1st place so the parts sum to the pot.
export function prizeBreakdown(pot: number): [number, number, number] {
  const second = Math.round(pot * PRIZES[1]);
  const third = Math.round(pot * PRIZES[2]);
  const first = pot - second - third;
  return [Math.max(first, 0), second, third];
}
