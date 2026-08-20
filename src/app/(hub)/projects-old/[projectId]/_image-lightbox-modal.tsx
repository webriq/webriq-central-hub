"use client";

import { useEffect } from "react";
import { motion } from "framer-motion";
import { X } from "lucide-react";

// Direct-`src` image preview modal (task 257, Requirement B) — a further reduction of
// `tasks/[taskId]/_task-attachment-viewer-modal.tsx`'s own `kind === "image"` branch, which is
// itself a reduced port of `portfolio-tracker/[projectId]/_onboarding-wizard.tsx`'s
// `FileViewerModal` (the "existing Preview dialog on Onboarding Wizard/Workspace" the task names).
// No `fetchUrl`/signed-URL round-trip here — Description/comment inline images are already
// resolved, public, or Zoho-absolutized `src` strings baked straight into rendered HTML.
export function ImageLightboxModal({
  src,
  alt,
  onClose,
}: {
  src: string;
  alt: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15, ease: "easeOut" }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#071133]/60 p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
        role="dialog"
        aria-modal="true"
        aria-label={alt || "Image preview"}
        className="w-[1100px] max-w-[96vw] h-[88vh] bg-white border border-[#E2E7F2] rounded-xl shadow-xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-[#EDF0F7] shrink-0">
          <h2 className="text-[13.5px] font-semibold text-[#0B1533] truncate">{alt || "Image preview"}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close preview"
            className="p-2 rounded-md text-[#5F6A88] hover:bg-[#5F6A88]/10 cursor-pointer border-none bg-transparent transition-colors"
          >
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 min-h-0 min-w-0 relative bg-[#EDF0F7]">
          <div className="w-full h-full flex items-center justify-center overflow-auto p-4">
            {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary Description/comment-embedded src (Zoho-absolutized or Supabase Storage public URL), not a static/optimizable src next/image can allowlist */}
            <img src={src} alt={alt} className="max-w-full max-h-full object-contain" />
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
