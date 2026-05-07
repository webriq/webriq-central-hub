"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { OnboardingData, SaveStatus } from "@/types/onboarding";

export interface UseAutoSaveOptions {
  data: OnboardingData;
  customerId: string;
  productName: string;
  completionPercentage?: number;
  debounceMs?: number;
}

interface UseAutoSaveReturn {
  saveStatus: SaveStatus;
  lastSavedAt: Date | null;
  error: string | null;
  forceSave: () => Promise<void>;
}

export function useAutoSave({
  data,
  customerId,
  productName,
  completionPercentage = 0,
  debounceMs = 2000,
}: UseAutoSaveOptions): UseAutoSaveReturn {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastDataRef = useRef<string>("");

  const performSave = useCallback(async () => {
    setSaveStatus("saving");
    setError(null);

    try {
      const response = await fetch(
        `/api/customers/${customerId}/products/${productName}/onboarding`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data, completedPercentage: completionPercentage }),
        }
      );

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || `Save failed (${response.status})`);
      }

      setSaveStatus("saved");
      setLastSavedAt(new Date());
    } catch (err) {
      setSaveStatus("error");
      setError(err instanceof Error ? err.message : "Failed to save");
    }
  }, [data, customerId, productName, completionPercentage]);

  const forceSave = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    await performSave();
  }, [performSave]);

  // Debounced auto-save on data change
  useEffect(() => {
    const dataString = JSON.stringify(data);

    // Skip if data hasn't actually changed
    if (dataString === lastDataRef.current) return;
    lastDataRef.current = dataString;

    // Don't auto-save if data is empty
    if (Object.keys(data).length === 0) return;

    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    const timer = setTimeout(() => {
      performSave();
    }, debounceMs);

    timerRef.current = timer;

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [data, debounceMs, performSave]);

  return { saveStatus, lastSavedAt, error, forceSave };
}