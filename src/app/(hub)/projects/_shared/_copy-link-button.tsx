"use client";

import { useState } from "react";
import { Link2, Check } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

function resolveUrl(url?: string): string {
  if (!url) return window.location.href;
  try {
    return new URL(url, window.location.origin).href;
  } catch {
    return url;
  }
}

// Task 359 — the imperative half of useCopyLink, split out so callers that copy a URL computed
// per-click (the Files tab's Copy Folder/File URL menu actions, one handler serving every tile)
// can reuse the same relative-to-absolute resolution instead of re-implementing it. useCopyLink
// stays the hook for the fixed-url, shows-a-checkmark case.
export async function copyLink(url?: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(resolveUrl(url));
    return true;
  } catch {
    // Clipboard unavailable/denied — no-op, low-stakes convenience action.
    return false;
  }
}

export function useCopyLink(url?: string) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    const ok = await copyLink(url);
    if (!ok) return false;
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
    return true;
  };

  return { copied, copy };
}

export function CopyLinkButton({ className, size = 18, url }: { className?: string; size?: number; url?: string }) {
  const { copied, copy } = useCopyLink(url);

  return (
    <Tooltip>
      <TooltipTrigger render={
        <button
          type="button"
          onClick={copy}
          aria-label={copied ? "Link copied" : "Copy link"}
          className={className}
        >
          {copied ? <Check size={size} /> : <Link2 size={size} />}
        </button>
      } />
      <TooltipContent side="top">{copied ? "Copied!" : "Copy link"}</TooltipContent>
    </Tooltip>
  );
}
