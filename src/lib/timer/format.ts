export function formatMMSS(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const mm = Math.floor(s / 60).toString().padStart(2, "0");
  const ss = (s % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
}

// Live elapsed-timer display — "00:00:00" hh:mm:ss, rolls over past 60 minutes
// (unlike formatMMSS, which is only correct for durations under an hour).
export function formatHHMMSS(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hh = Math.floor(s / 3600).toString().padStart(2, "0");
  const mm = Math.floor((s % 3600) / 60).toString().padStart(2, "0");
  const ss = (s % 60).toString().padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
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

function to12Hour(date: Date): { hh: string; mm: string; meridiem: "am" | "pm" } {
  const hours24 = date.getHours();
  const hh12 = hours24 % 12 || 12;
  return {
    hh: hh12.toString().padStart(2, "0"),
    mm: date.getMinutes().toString().padStart(2, "0"),
    meridiem: hours24 < 12 ? "am" : "pm",
  };
}

// Time Period column — "hh:mm am/pm", lowercase meridiem, e.g. "05:15 pm".
export function formatClockTime(iso: string): string {
  const { hh, mm, meridiem } = to12Hour(new Date(iso));
  return `${hh}:${mm} ${meridiem}`;
}

// Timer timeline popover — "hh:mm am/pm, mm-dd-yyyy", matches the reference screenshot's own
// tooltip style exactly (deliberately not the same date format as the tab's date-group headers).
export function formatFullTimestamp(iso: string): string {
  const date = new Date(iso);
  const { hh, mm, meridiem } = to12Hour(date);
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const day = date.getDate().toString().padStart(2, "0");
  return `${hh}:${mm} ${meridiem}, ${month}-${day}-${date.getFullYear()}`;
}
