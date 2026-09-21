"use client";

// Task 379 — password gate + orchestration for the public ticket view. Stateless: the correct
// password is required on every visit (no session cookie), and no ticket data is fetched or
// rendered until POST /api/public/tickets/[ticketId]/view returns it.
import { useState } from "react";
import Image from "next/image";
import { Lock } from "lucide-react";
import { TicketSummary, type PublicTicketData, type PublicTicketMessage } from "./_ticket-summary";

type ViewResponse = {
  ticket: PublicTicketData;
  messages: PublicTicketMessage[];
};

type ErrorResponse = {
  error: string;
  locked?: boolean;
  lockedUntil?: string | null;
  attemptsRemaining?: number | null;
};

export default function TicketViewClient({ ticketId }: { ticketId: string }) {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attemptsRemaining, setAttemptsRemaining] = useState<number | null>(null);
  const [revealed, setRevealed] = useState<ViewResponse | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch(`/api/public/tickets/${ticketId}/view`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = (await res.json()) as ViewResponse | ErrorResponse;

      if (!res.ok || "error" in data) {
        const err = data as ErrorResponse;
        setError(err.error);
        setAttemptsRemaining(err.attemptsRemaining ?? null);
        setLoading(false);
        return;
      }

      setRevealed(data);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-16 bg-[#F4F6FB]">
      <div className="flex items-center gap-2.5 mb-8">
        <Image src="/webriq_logo.webp" alt="WebriQ" width={32} height={32} />
        <span className="font-heading text-[15px] font-semibold text-[#0B1533]">WebriQ Central Hub</span>
      </div>

      {revealed ? (
        <TicketSummary ticket={revealed.ticket} messages={revealed.messages} />
      ) : (
        <div className="w-full max-w-[400px] rounded-[14px] border border-[#E2E7F2] bg-white shadow-[0_1px_2px_rgba(7,17,51,.05)] px-7 py-8">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-auth-blue/10 mb-4">
            <Lock className="h-5 w-5 text-auth-blue" aria-hidden />
          </div>
          <h1 className="font-heading text-[15px] font-semibold tracking-[-0.01em] text-[#0B1533] mb-1.5">
            View your ticket
          </h1>
          <p className="text-[13px] text-[#3A4565] mb-6">
            Enter the password from your ticket confirmation email.
          </p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label htmlFor="ticket-password" className="block text-[11px] font-semibold text-[#0B1533] mb-1.5">
                Password
              </label>
              <input
                id="ticket-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                autoFocus
                className="w-full rounded-[10px] bg-[#F4F6FB] border border-transparent px-3 py-2.5 text-[13px] text-[#0B1533] outline-none transition-colors focus:bg-white focus:border-auth-blue focus:ring-[3px] focus:ring-auth-blue/[.14] disabled:opacity-60"
              />
            </div>

            {error && (
              <div className="rounded-[10px] px-3.5 py-2.5 text-[13px] text-auth-late bg-auth-late-bg border border-auth-late/20">
                {error}
                {attemptsRemaining !== null && attemptsRemaining > 0 && (
                  <> {attemptsRemaining} attempt{attemptsRemaining === 1 ? "" : "s"} remaining.</>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || password.length === 0}
              className="h-11 w-full rounded-full bg-auth-orange text-auth-cta-ink font-semibold text-[13px] transition-colors hover:bg-auth-orange-600 hover:text-white disabled:opacity-45 disabled:pointer-events-none cursor-pointer"
            >
              {loading ? "Verifying…" : "View ticket"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
