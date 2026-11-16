import { WifiOff } from "lucide-react";

export type LiveStatus = "live" | "paused";

// Maps a Supabase channel `subscribe()` status onto the Timeline's two-state indicator.
export function toLiveStatus(status: string): LiveStatus | null {
  if (status === "SUBSCRIBED") return "live";
  if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") return "paused";
  return null;
}

// Task 422 (also closes audit M11) — a dropped Realtime subscription used to fail silently.
export function LiveUpdatesNotice({ status }: { status: LiveStatus }) {
  if (status === "live") return null;
  return (
    <div role="status" className="flex items-center gap-1.5 rounded-lg border border-[#F0D896] bg-[#FFF3D6] px-3 py-1.5 text-[11.5px] font-semibold text-[#8A5A00]">
      <WifiOff size={12} aria-hidden="true" /> Live updates paused — reload to refresh.
    </div>
  );
}
