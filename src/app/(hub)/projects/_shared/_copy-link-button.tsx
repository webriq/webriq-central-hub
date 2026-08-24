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

export function useCopyLink(url?: string) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(resolveUrl(url));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      return true;
    } catch {
      // Clipboard unavailable/denied — no-op, low-stakes convenience action.
      return false;
    }
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
