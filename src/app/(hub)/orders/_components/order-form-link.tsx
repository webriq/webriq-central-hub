"use client";

import { useState } from "react";
import { Check, ExternalLink, KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const ORDER_FORM_URL = "https://www.webriq.com/stackshift-order-form";
const COPY_ERROR = "Couldn't copy the order form password";

// Task 504 — fetches the password from the guarded route. Errors carry the route's message.
async function fetchPassword(): Promise<string> {
  const res = await fetch("/api/stackshift-orders/form-password", { cache: "no-store" });
  const body = (await res.json().catch(() => ({}))) as { password?: string; error?: string };
  if (!res.ok || !body.password) throw new Error(body.error ?? COPY_ERROR);
  return body.password;
}

// Safari only allows a clipboard write inside the click's user gesture, which an awaited fetch
// would end. ClipboardItem accepts a promise, so the write starts synchronously and resolves when
// the fetch does; writeText after the await is the fallback where ClipboardItem is missing.
async function copyPassword(): Promise<void> {
  const password = fetchPassword();
  if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
    const blob = password.then((p) => new Blob([p], { type: "text/plain" }));
    try {
      await navigator.clipboard.write([new ClipboardItem({ "text/plain": blob })]);
      return;
    } catch (err) {
      await password; // surface the fetch error (with its message) over a generic clipboard one
      throw err;
    }
  }
  await navigator.clipboard.writeText(await password);
}

export default function OrderFormLink() {
  const [state, setState] = useState<"idle" | "loading" | "copied">("idle");

  const onCopy = async () => {
    if (state === "loading") return;
    setState("loading");
    try {
      await copyPassword();
      setState("copied");
      setTimeout(() => setState("idle"), 1500);
    } catch (err) {
      setState("idle");
      toast.error(err instanceof Error && err.message ? err.message : COPY_ERROR);
    }
  };

  const label = state === "copied" ? "Password copied" : "Copy password";

  return (
    <div className="flex items-center gap-1.5">
      <a
        href={ORDER_FORM_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[13px] font-medium text-[#007BFF] transition-colors hover:bg-[#F0F7FF] hover:text-[#2B4C86] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]/40"
      >
        Order form
        <ExternalLink size={13} aria-hidden />
      </a>
      <Tooltip>
        <TooltipTrigger render={
          <button
            type="button"
            onClick={onCopy}
            disabled={state === "loading"}
            aria-label={label}
            className={cn(
              "inline-flex h-7 w-7 items-center justify-center rounded-md border border-[#E2E7F2] bg-white text-[#5F6A88] transition-colors",
              "hover:bg-[#F4F6FB] hover:text-[#0B1533] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]/40",
              "disabled:cursor-wait disabled:opacity-70",
              state === "copied" && "text-[#16A34A] hover:text-[#16A34A]"
            )}
          >
            {state === "loading" ? <Loader2 size={14} className="animate-spin" aria-hidden />
              : state === "copied" ? <Check size={14} aria-hidden />
              : <KeyRound size={14} aria-hidden />}
          </button>
        } />
        <TooltipContent side="top">{state === "copied" ? "Copied!" : "Copy password"}</TooltipContent>
      </Tooltip>
    </div>
  );
}
