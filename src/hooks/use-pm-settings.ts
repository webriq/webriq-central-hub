"use client";

import { useSyncExternalStore, useCallback } from "react";

export interface PMSettings {
  homeLayout: "digest" | "stats";
  theme: "light" | "dark";
}

const STORAGE_KEY = "hub_pm_settings";
const DEFAULTS: PMSettings = { homeLayout: "digest", theme: "light" };

function readSettings(): PMSettings {
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

function writeSettings(s: PMSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

// Module-level store — browser-only (this file is "use client")
let _cache: PMSettings | null = null;
let _listeners: (() => void)[] = [];

function getSnapshot(): PMSettings {
  if (_cache === null) _cache = readSettings();
  return _cache;
}

function getServerSnapshot(): PMSettings {
  return DEFAULTS;
}

function subscribe(listener: () => void): () => void {
  _listeners = [..._listeners, listener];
  return () => { _listeners = _listeners.filter(l => l !== listener); };
}

export function usePMSettings() {
  const settings = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const updateSetting = useCallback(<K extends keyof PMSettings>(key: K, value: PMSettings[K]) => {
    const next = { ...getSnapshot(), [key]: value };
    _cache = next;
    writeSettings(next);
    _listeners.forEach(l => l());
  }, []);

  return { settings, updateSetting };
}
