// The HP and Pw bars warn as Cocoa's level indicators do (StatsView.m SetMeter).

export type MeterLevel = "normal" | "warning" | "critical";

export function meterLevel(current: number, maximum: number): MeterLevel {
  if (!(maximum > 0)) return "normal";
  if (current < maximum / 3) return "critical";
  if (current < (maximum * 2) / 3) return "warning";
  return "normal";
}
