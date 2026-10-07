"use client";

import { createContext, useContext } from "react";
import { hashIndex, initialsOf } from "@/lib/hr/format";

// Fixed 6-colour rotation from the design system, assigned per person and stable across screens.
const COLORS = ["bg-[#0063D6]", "bg-[#6A48E0]", "bg-[#0B8A93]", "bg-[#B85512]", "bg-[#177E48]", "bg-[#44508A]"];
const SIZES = { sm: "size-5 text-[8px]", md: "size-6 text-[9px]", lg: "size-[30px] text-[11px]" } as const;

/** employee id → profile photo URL, provided once by the HR layout. */
const AvatarUrlContext = createContext<Record<string, string | null>>({});
export const AvatarUrlProvider = AvatarUrlContext.Provider;

/** Profile photo when the person has one (as on the rest of the Hub), coloured initials otherwise. */
export function PersonAvatar({ id, name, size = "lg" }: { id: string; name: string; size?: keyof typeof SIZES }) {
  const url = useContext(AvatarUrlContext)[id];
  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold text-white ${SIZES[size]} ${COLORS[hashIndex(id, COLORS.length)]}`}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- external auth-provider avatar URL, not an optimizable static asset
        <img src={url} alt="" className="size-full object-cover" />
      ) : (
        initialsOf(name)
      )}
    </span>
  );
}
