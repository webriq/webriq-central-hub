"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { ClassificationTabId } from "@/app/(hub)/projects/_classification-tabs";

// Task 414 — the sidebar's Projects links normally pick the active classification from `?tab=`,
// but project detail URLs carry no `tab`. The open project's layout publishes its classification
// tab ids here so the sidebar can highlight the right link(s).
type Ctx = {
  projectTabs: ClassificationTabId[];
  setProjectTabs: (tabs: ClassificationTabId[]) => void;
};

const SidebarProjectContext = createContext<Ctx>({ projectTabs: [], setProjectTabs: () => {} });

export function SidebarProjectProvider({ children }: { children: React.ReactNode }) {
  const [projectTabs, setProjectTabs] = useState<ClassificationTabId[]>([]);
  return <SidebarProjectContext.Provider value={{ projectTabs, setProjectTabs }}>{children}</SidebarProjectContext.Provider>;
}

export function useSidebarProjectTabs(): ClassificationTabId[] {
  return useContext(SidebarProjectContext).projectTabs;
}

// Rendered by the project detail layout; clears on unmount so leaving the project drops the highlight.
export function SidebarClassificationSync({ tabs }: { tabs: ClassificationTabId[] }) {
  const { setProjectTabs } = useContext(SidebarProjectContext);
  const key = tabs.join(",");
  useEffect(() => {
    setProjectTabs(key ? (key.split(",") as ClassificationTabId[]) : []);
    return () => setProjectTabs([]);
  }, [key, setProjectTabs]);
  return null;
}
