"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { ChevronDown, ChevronLeft, ChevronRight, Loader2, RotateCcw, SendHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { Chip } from "../../dashboard/_components/dashboard-shared";

export type OutboxStatusFilter = "all" | "pending" | "sent" | "dead";

export type OutboxEvent = {
  id: string;
  eventType: string;
  sequence: number;
  status: "pending" | "sent" | "dead";
  attempts: number;
  nextAttemptAt: string;
  lastError: string | null;
  lastStatusCode: number | null;
  lastAttemptAt: string | null;
  sentAt: string | null;
  createdAt: string;
  payloadJson: string;
  ticketId: string | null;
  ticketNumber: number | null;
  ticketRef: string | null;
  site: string | null;
};

const FILTERS: { value: OutboxStatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "sent", label: "Sent" },
  { value: "dead", label: "Dead" },
];

const STATUS_TONE = { pending: "warn", sent: "ok", dead: "late" } as const;
const COLS = "grid-cols-[28px_70px_1.3fr_1fr_90px_70px_1.2fr_110px]";

function fmt(iso: string | null) {
  return iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "-";
}

function HeadCell({ children }: { children?: React.ReactNode }) {
  return <span className="text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#5F6A88]">{children}</span>;
}

export default function OutboxIndex({
  events,
  status,
  pagination,
  setupNeeded,
  deliveryConfigured,
}: {
  events: OutboxEvent[];
  status: OutboxStatusFilter;
  pagination: { page: number; pageSize: number; total: number };
  setupNeeded: boolean;
  deliveryConfigured: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [openId, setOpenId] = useState<string | null>(null);
  const [replayingId, setReplayingId] = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(pagination.total / pagination.pageSize));

  function go(overrides: Record<string, string | number | null>) {
    const p = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(overrides)) {
      if (v === null || v === "") p.delete(k);
      else p.set(k, String(v));
    }
    router.push(`?${p.toString()}`);
  }

  async function replay(eventId: string) {
    setReplayingId(eventId);
    try {
      const res = await fetch(`/api/desk/stackshift-outbox/${eventId}/replay`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error ?? "Replay failed");
        return;
      }
      toast.success("Event queued for redelivery");
      router.refresh();
    } finally {
      setReplayingId(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-350 px-6 py-6">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-[20px] font-semibold text-[#0B1533]">StackShift outbox</h1>
          <p className="mt-1 text-[13px] text-[#5F6A88]">
            Events the Hub sends to StackShift for direct tickets. Dead events stopped retrying; replay delivers
            them again with their original sequence.
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-[10px] border border-[#E2E7F2] bg-white p-1" role="tablist" aria-label="Filter by status">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              role="tab"
              aria-selected={status === f.value}
              onClick={() => go({ status: f.value === "all" ? null : f.value, page: null })}
              className={cn(
                "rounded-[7px] px-3 py-1.5 text-[12px] font-medium transition-colors",
                status === f.value ? "bg-[#0B1533] text-white" : "text-[#3A4565] hover:bg-[#F0F7FF]",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {!deliveryConfigured && !setupNeeded && (
        <div className="mb-4 rounded-[10px] border border-[#F3D9A4] bg-[#FFF8E6] px-4 py-3 text-[13px] text-[#8A5A00]">
          Delivery is off: <code>STACKSHIFT_EVENTS_URL</code> and <code>STACKSHIFT_EVENTS_SECRET</code> are not both set, so events stay pending.
        </div>
      )}

      {setupNeeded ? (
        <div className="rounded-[14px] border border-[#E2E7F2] bg-white px-6 py-12 text-center">
          <SendHorizontal className="mx-auto mb-3 h-6 w-6 text-[#5F6A88]" aria-hidden />
          <p className="text-[14px] font-medium text-[#0B1533]">The outbox is not set up yet</p>
          <p className="mt-1 text-[13px] text-[#5F6A88]">Apply migrations 169 and 171 to enable it.</p>
        </div>
      ) : events.length === 0 ? (
        <div className="rounded-[14px] border border-[#E2E7F2] bg-white px-6 py-12 text-center">
          <SendHorizontal className="mx-auto mb-3 h-6 w-6 text-[#5F6A88]" aria-hidden />
          <p className="text-[14px] font-medium text-[#0B1533]">No events{status !== "all" ? ` with status “${status}”` : ""}</p>
          <p className="mt-1 text-[13px] text-[#5F6A88]">Staff replies and status changes on direct StackShift tickets appear here.</p>
          {status !== "all" && (
            <button type="button" onClick={() => go({ status: null, page: null })} className="mt-4 rounded-[8px] border border-[#E2E7F2] px-3 py-1.5 text-[12px] font-medium text-[#0B1533] transition-colors hover:bg-[#F0F7FF]">
              Show all events
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-[14px] border border-[#E2E7F2] bg-white">
          <div className={`grid ${COLS} items-center gap-3 border-b border-[#EDF0F7] bg-[#FAFBFE] px-5 py-2.5`}>
            <HeadCell />
            <HeadCell>Seq</HeadCell>
            <HeadCell>Event</HeadCell>
            <HeadCell>Ticket</HeadCell>
            <HeadCell>Status</HeadCell>
            <HeadCell>Tries</HeadCell>
            <HeadCell>Last result</HeadCell>
            <HeadCell />
          </div>
          {events.map((e) => {
            const open = openId === e.id;
            return (
              <div key={e.id} className="border-b border-[#EDF0F7] last:border-0">
                <div className={`grid ${COLS} items-center gap-3 px-5 py-3 transition-colors hover:bg-[#F0F7FF]`}>
                  <button
                    type="button"
                    onClick={() => setOpenId(open ? null : e.id)}
                    aria-expanded={open}
                    aria-label={open ? "Hide payload" : "Show payload"}
                    className="flex h-6 w-6 items-center justify-center rounded-[6px] text-[#5F6A88] transition-colors hover:bg-white"
                  >
                    <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} aria-hidden />
                  </button>
                  <span className="font-mono text-[12px] text-[#3A4565]">{e.sequence}</span>
                  <span className="truncate text-[13px] text-[#0B1533]" title={e.id}>{e.eventType}</span>
                  <span className="truncate text-[13px] text-[#3A4565]">
                    {e.ticketId && e.ticketNumber !== null ? (
                      <Link href={`/desk/inbox/${e.ticketId}`} className="text-[#0063D6] hover:underline">
                        #{e.ticketNumber}
                      </Link>
                    ) : (
                      "-"
                    )}
                    {e.site && <span className="ml-2 text-[11px] text-[#5F6A88]">{e.site}</span>}
                  </span>
                  <span>
                    <Chip tone={STATUS_TONE[e.status]}>{e.status}</Chip>
                  </span>
                  <span className="font-mono text-[12px] text-[#3A4565]">{e.attempts}</span>
                  <span className="truncate text-[12px] text-[#5F6A88]" title={e.lastError ?? undefined}>
                    {e.status === "sent"
                      ? `Delivered ${fmt(e.sentAt)}`
                      : e.lastError
                        ? `${e.lastStatusCode ? `${e.lastStatusCode} · ` : ""}${e.lastError}`
                        : `Next try ${fmt(e.nextAttemptAt)}`}
                  </span>
                  <span className="flex justify-end">
                    {e.status === "dead" && (
                      <button
                        type="button"
                        onClick={() => replay(e.id)}
                        disabled={replayingId === e.id}
                        className="inline-flex items-center gap-1.5 rounded-[8px] border border-[#E2E7F2] bg-white px-2.5 py-1.5 text-[12px] font-medium text-[#0B1533] transition-colors hover:bg-[#F0F7FF] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {replayingId === e.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <RotateCcw className="h-3.5 w-3.5" aria-hidden />}
                        {replayingId === e.id ? "Replaying…" : "Replay"}
                      </button>
                    )}
                  </span>
                </div>
                {open && (
                  <div className="border-t border-[#EDF0F7] bg-[#FAFBFE] px-5 py-3">
                    <div className="mb-2 flex flex-wrap gap-x-6 gap-y-1 text-[11px] text-[#5F6A88]">
                      <span>Event id: <span className="font-mono">evt_{e.id}</span></span>
                      <span>Created: {fmt(e.createdAt)}</span>
                      <span>Last attempt: {fmt(e.lastAttemptAt)}</span>
                      {e.ticketRef && <span>Ticket ref: <span className="font-mono">{e.ticketRef}</span></span>}
                    </div>
                    {e.lastError && <p className="mb-2 text-[12px] text-[#C0392B]">{e.lastError}</p>}
                    <pre className="max-h-72 overflow-auto rounded-[8px] border border-[#E2E7F2] bg-white p-3 font-mono text-[11px] text-[#3A4565]">{e.payloadJson}</pre>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!setupNeeded && pagination.total > 0 && (
        <div className="mt-4 flex items-center justify-between text-[12px] text-[#5F6A88]">
          <span>
            {pagination.total} event{pagination.total === 1 ? "" : "s"} · page {pagination.page} of {totalPages}
          </span>
          <div className="flex items-center gap-1">
            <button type="button" aria-label="Previous page" disabled={pagination.page <= 1} onClick={() => go({ page: pagination.page - 1 })} className="flex h-8 w-8 items-center justify-center rounded-[8px] border border-[#E2E7F2] bg-white transition-colors hover:bg-[#F0F7FF] disabled:cursor-not-allowed disabled:opacity-40">
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </button>
            <button type="button" aria-label="Next page" disabled={pagination.page >= totalPages} onClick={() => go({ page: pagination.page + 1 })} className="flex h-8 w-8 items-center justify-center rounded-[8px] border border-[#E2E7F2] bg-white transition-colors hover:bg-[#F0F7FF] disabled:cursor-not-allowed disabled:opacity-40">
              <ChevronRight className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
