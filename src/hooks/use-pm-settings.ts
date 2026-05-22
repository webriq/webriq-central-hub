"use client";

import { useState, useEffect, useCallback } from "react";

export interface PMSettings {
  homeLayout: "digest" | "stats";
  theme: "light" | "dark";
}

const STORAGE_KEY = "hub_pm_settings";
const DEFAULTS: PMSettings = { homeLayout: "digest", theme: "light" };

function readSettings(): PMSettings {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw);
    return {
      homeLayout: parsed.homeLayout === "stats" ? "stats" : "digest",
      theme: parsed.theme === "dark" ? "dark" : "light",
    };
  } catch {
    return DEFAULTS;
  }
}

function writeSettings(settings: PMSettings) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function usePMSettings() {
  const [settings, setSettings] = useState<PMSettings>(DEFAULTS);

  useEffect(() => {
    setSettings(readSettings());
  }, []);

  const updateSetting = useCallback(
    <K extends keyof PMSettings>(key: K, value: PMSettings[K]) => {
      setSettings((prev) => {
        const next = { ...prev, [key]: value };
        writeSettings(next);
        return next;
      });
    },
    []
  );

  return { settings, updateSetting };
}
