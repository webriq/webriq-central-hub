"use client";

import React from "react";
import { usePMSettings } from "@/hooks/use-pm-settings";
import { getTokens } from "@/components/hub/pm-tabs/shared";
import SettingsTab from "@/components/hub/pm-tabs/settings-tab";

export default function PMSettingsPage() {
  const { settings, updateSetting } = usePMSettings();
  const C = getTokens(settings);
  return (
    <div
      className="flex-1 overflow-y-auto py-[26px] px-8 bg-[var(--c-page-bg)]"
      style={{ "--c-page-bg": C.bg } as React.CSSProperties}
    >
      <SettingsTab settings={settings} onUpdate={updateSetting} />
    </div>
  );
}
