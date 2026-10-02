import RecordProjectView from "@/app/(hub)/projects/_shared/_record-project-view";

// Task 416 — records "the current user opened this project" for the Projects listing's
// "Recently accessed" sort. [projectId]-level (not (tabs)) so the tab pages and the task / ticket /
// milestone detail routes all count as one open; the layout persists across tab navigation. The
// recorder endpoint ignores unknown and deleted projects, so no existence check is needed here.
export default async function LegacyProjectLayout({
  params,
  children,
}: {
  params: Promise<{ projectId: string }>;
  children: React.ReactNode;
}) {
  const { projectId } = await params;
  return (
    <>
      <RecordProjectView projectId={projectId} />
      {children}
    </>
  );
}
