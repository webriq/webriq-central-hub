"use client";

import { useState } from "react";
import type { DriveView } from "@/lib/drive/types";
import { DriveBrowser } from "./_drive-browser";
import { DriveHeader } from "./_drive-header";
import { useDrivePeople } from "./_use-drive-people";

// Task 436 — client orchestrator for /drive: owns the active section, remounts the browser on a
// section switch (or retry) so each section loads fresh behind a skeleton, and keeps the URL in sync
// with `replaceState` (task 359 precedent — no server re-render per click).
export function DriveShell({ initialView, initialFolderId, initialFileId }: {
  initialView: DriveView; initialFolderId: string | null; initialFileId: string | null;
}) {
  const [view, setView] = useState<DriveView>(initialView);
  const [reloads, setReloads] = useState(0);
  const people = useDrivePeople();

  const changeView = (next: DriveView) => {
    if (next === view) return;
    setView(next);
    window.history.replaceState(null, "", `${window.location.pathname}?view=${next}`);
  };
  // A deep link only applies to the section it was written for.
  const onInitialView = view === initialView;

  return (
    <div className="min-h-full bg-[#F4F6FB]">
      <div className="mx-auto max-w-[1400px] px-4 pb-10 pt-6 sm:px-8">
        <DriveHeader view={view} onChange={changeView} />
        <section className="rounded-[14px] border border-[#E2E7F2] bg-white p-4 shadow-[0_1px_2px_rgba(7,17,51,0.05)]">
          <DriveBrowser
            key={`${view}-${reloads}`} view={view} people={people}
            initialFolderId={onInitialView ? initialFolderId : null} initialFileId={onInitialView ? initialFileId : null}
            onRetry={() => setReloads((n) => n + 1)}
          />
        </section>
      </div>
    </div>
  );
}
