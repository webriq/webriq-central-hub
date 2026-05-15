"use client";

import React from "react";
import { usePMSettings } from "@/hooks/use-pm-settings";
import { getTokens } from "@/components/hub/pm-tabs/shared";
import PipelineTab from "@/components/hub/pm-tabs/pipeline-tab";

export default function PMPipelinePage() {
  const { settings } = usePMSettings();
  const C = getTokens(settings);
  return (
    <div
      className="flex-1 overflow-y-auto py-[26px] px-8 bg-[var(--c-page-bg)]"
      style={{ "--c-page-bg": C.bg } as React.CSSProperties}
    >
      <PipelineTab settings={settings} />
    </div>
  );
}
