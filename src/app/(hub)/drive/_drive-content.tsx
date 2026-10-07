"use client";

import { useMemo, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { DriveFile, DriveFolder, DrivePerson, DriveView } from "@/lib/drive/types";
import { textMuted, textPrimary } from "./_reuse";
import { EmptyFolder, EmptyMine, EmptyShared, NoMatches } from "./_drive-empty";

const GRID = "grid grid-cols-2 gap-3.5 sm:grid-cols-3 md:grid-cols-4";

type Props = {
  view: DriveView;
  atSharedRoot: boolean;
  atRoot: boolean;
  canWrite: boolean;
  search: string;
  viewMode: "grid" | "list";
  total: number;
  newFolderOpen: boolean;
  folders: DriveFolder[];
  files: DriveFile[];
  people: DrivePerson[];
  renderFolder: (f: DriveFolder) => ReactNode;
  renderFile: (f: DriveFile) => ReactNode;
  newFolderTile: ReactNode;
  onChoose: () => void;
  onDrop: (e: React.DragEvent) => void;
};

function Items({ folders, files, viewMode, renderFolder, renderFile, tail }: Pick<Props, "folders" | "files" | "viewMode" | "renderFolder" | "renderFile"> & { tail?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3.5">
      {folders.length > 0 || tail ? <div className={GRID}>{folders.map(renderFolder)}{tail}</div> : null}
      {files.length > 0 ? <div className={viewMode === "grid" ? GRID : "flex flex-col gap-2"}>{files.map(renderFile)}</div> : null}
    </div>
  );
}

// Shared entry points, grouped by who shared them.
function SharedRoots({ folders, files, people, ...rest }: Pick<Props, "folders" | "files" | "people" | "viewMode" | "renderFolder" | "renderFile">) {
  const groups = useMemo(() => {
    const byOwner = new Map<string, { folders: DriveFolder[]; files: DriveFile[] }>();
    const slot = (id: string) => byOwner.get(id) ?? byOwner.set(id, { folders: [], files: [] }).get(id)!;
    for (const f of folders) slot(f.owner_id).folders.push(f);
    for (const f of files) slot(f.owner_id).files.push(f);
    const name = (id: string) => people.find((p) => p.id === id)?.full_name ?? "A teammate";
    return Array.from(byOwner, ([id, g]) => ({ id, name: name(id), ...g })).sort((a, b) => a.name.localeCompare(b.name));
  }, [folders, files, people]);

  return (
    <div className="flex flex-col gap-6">
      {groups.map((g) => (
        <section key={g.id} aria-label={`Shared by ${g.name}`}>
          <h3 className={cn("mb-2.5 text-[13px] font-semibold", textPrimary)}>
            Shared by {g.name} <span className={cn("ml-1 font-mono text-[11px] font-medium", textMuted)}>{g.folders.length + g.files.length}</span>
          </h3>
          <Items folders={g.folders} files={g.files} {...rest} />
        </section>
      ))}
    </div>
  );
}

// Task 436 — what fills the browser body: the section root (own top level / shared entry points) or
// the open folder. The whole body is a drop zone for uploads (folder tiles stop propagation and
// take their own drops).
export function DriveContent(p: Props) {
  const [dragOver, setDragOver] = useState(false);
  const searching = p.search.trim().length > 0;
  const empty = p.total === 0 && !p.newFolderOpen;
  const nothingMatches = p.total > 0 && p.folders.length === 0 && p.files.length === 0 && searching;

  let body: ReactNode;
  if (empty) {
    body = p.view === "shared" && p.atRoot ? <EmptyShared /> : p.atRoot ? <EmptyMine canWrite={p.canWrite} onChoose={p.onChoose} /> : <EmptyFolder canWrite={p.canWrite} onChoose={p.onChoose} />;
  } else if (nothingMatches) {
    body = <NoMatches query={p.search.trim()} />;
  } else if (p.atSharedRoot) {
    body = <SharedRoots folders={p.folders} files={p.files} people={p.people} viewMode={p.viewMode} renderFolder={p.renderFolder} renderFile={p.renderFile} />;
  } else {
    body = <Items folders={p.folders} files={p.files} viewMode={p.viewMode} renderFolder={p.renderFolder} renderFile={p.renderFile}
      tail={p.canWrite && !searching ? p.newFolderTile : null} />;
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); if (p.canWrite) setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => { setDragOver(false); p.onDrop(e); }}
      className={cn("min-h-64 rounded-[10px] transition-colors", dragOver && p.canWrite && "bg-[#F0F7FF] ring-2 ring-[#007BFF]/30")}
    >
      {body}
    </div>
  );
}
