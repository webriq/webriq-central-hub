export function formatMMSS(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const mm = Math.floor(s / 60).toString().padStart(2, "0");
  const ss = (s % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
}

function decomposeHours(hours: number): { hh: number; mm: number } {
  const totalMinutes = Math.max(0, Math.round(hours * 60));
  return { hh: Math.floor(totalMinutes / 60), mm: totalMinutes % 60 };
}

// Time-logged column display — "00:00" hh:mm, e.g. 1.5 -> "01:30".
export function formatHoursAsHHMM(hours: number): string {
  const { hh, mm } = decomposeHours(hours);
  return `${hh.toString().padStart(2, "0")}:${mm.toString().padStart(2, "0")}`;
}

// Time-logged column tooltip — plain-language total, e.g. 1.5 -> "1 hour and 30 minutes".
export function formatHoursInWords(hours: number): string {
  const { hh, mm } = decomposeHours(hours);
  const hourPart = hh > 0 ? `${hh} hour${hh === 1 ? "" : "s"}` : "";
  const minutePart = mm > 0 ? `${mm} minute${mm === 1 ? "" : "s"}` : "";
  if (hourPart && minutePart) return `${hourPart} and ${minutePart}`;
  return hourPart || minutePart || "0 minutes";
}
