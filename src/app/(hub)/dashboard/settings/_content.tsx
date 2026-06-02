"use client";

import React from "react";
import { usePMSettings } from "@/hooks/use-pm-settings";
import SettingsTab from "@/components/hub/pm-tabs/settings-tab";

export default function SettingsContent() {
  const { settings, updateSetting } = usePMSettings();
  return (
    <div
      className={`flex-1 overflow-y-auto py-6.5 px-8 ${settings.theme === "dark" ? "bg-[#090c18]" : "bg-[#f5f4f1]"}`}
    >
      <SettingsTab settings={settings} onUpdate={updateSetting} />
    </div>
  );
}
