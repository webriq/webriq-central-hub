import { CloudUpload, SearchX, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { textMuted, textPrimary } from "./_reuse";

function Panel({ icon: Icon, title, hint, action, tone = "dashed" }: {
  icon: LucideIcon; title: string; hint?: string; action?: React.ReactNode; tone?: "dashed" | "plain";
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 rounded-[10px] px-6 py-14 text-center", tone === "dashed" && "border-2 border-dashed border-[#E2E7F2]")}>
      <Icon size={24} className="text-[#A8B3CC]" aria-hidden />
      <p className={cn("text-[13px] font-semibold", textPrimary)}>{title}</p>
      {hint ? <p className={cn("max-w-[52ch] text-[12.5px]", textMuted)}>{hint}</p> : null}
      {action}
    </div>
  );
}

// A ghost (not orange) button: the toolbar's "Upload files" is the screen's one orange CTA.
const chooseBtn = "mt-1 cursor-pointer rounded-full border border-[#E2E7F2] bg-white px-3.5 py-1.5 text-[12px] font-semibold text-[#0063D6] transition-colors hover:border-[#A8C6F5]";

export function EmptyMine({ canWrite, onChoose }: { canWrite: boolean; onChoose: () => void }) {
  return (
    <Panel
      icon={CloudUpload}
      title="Nothing here yet"
      hint="Upload meeting minutes, notes or working files. Only you can see them until you share."
      action={canWrite ? <button type="button" onClick={onChoose} className={chooseBtn}>Choose files</button> : undefined}
    />
  );
}

export function EmptyFolder({ canWrite, onChoose }: { canWrite: boolean; onChoose: () => void }) {
  return (
    <Panel
      icon={CloudUpload}
      title="This folder is empty"
      hint={canWrite ? "Drop files here or use Upload files." : "Nothing has been added to this folder yet."}
      action={canWrite ? <button type="button" onClick={onChoose} className={chooseBtn}>Choose files</button> : undefined}
    />
  );
}

export function EmptyShared() {
  return (
    <Panel
      icon={Users}
      title="Nothing has been shared with you yet"
      hint="When a teammate shares a folder or file, it appears here."
    />
  );
}

export function NoMatches({ query }: { query: string }) {
  return <Panel icon={SearchX} tone="plain" title={`No files match “${query}” in this folder.`} />;
}

export function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Panel
      icon={SearchX}
      title="Couldn't load your files"
      hint={message}
      action={<button type="button" onClick={onRetry} className={chooseBtn}>Try again</button>}
    />
  );
}

export function DriveSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 md:grid-cols-4" aria-busy="true" aria-label="Loading files">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="aspect-[4/3] animate-pulse rounded-[14px] border border-[#EDF0F7] bg-[#F4F6FB] motion-reduce:animate-none" />
      ))}
    </div>
  );
}
