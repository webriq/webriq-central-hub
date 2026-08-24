"use client";

import { Link2, Check } from "lucide-react";
import { useCopyLink } from "./_copy-link-button";

export function CopyLinkMenuItem({ url, onDone }: { url: string; onDone: () => void }) {
  const { copied, copy } = useCopyLink(url);

  async function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    await copy();
    setTimeout(onDone, 700);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="flex w-full items-center gap-2 border-none bg-transparent px-3 py-1.5 text-left text-[12px] text-[#3A4565] cursor-pointer transition-colors hover:bg-[#F4F6FB]"
    >
      {copied ? <Check size={13} className="text-[#177E48]" /> : <Link2 size={13} className="text-[#5F6A88]" />}
      {copied ? "Copied!" : "Copy Link"}
    </button>
  );
}
