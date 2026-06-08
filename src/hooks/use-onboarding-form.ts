"use client";

import { useState, useCallback } from "react";
import type { FormSchema, OnboardingData } from "@/types/onboarding";
import { computeCompletionPercentage } from "@/config/onboarding-schemas";

interface UseOnboardingFormReturn {
  data: OnboardingData;
  setFieldValue: (name: string, value: unknown) => void;
  getFieldValue: (name: string) => unknown;
  resetForm: () => void;
  getCompletionPercentage: () => number;
}

export function useOnboardingForm(
  schema: FormSchema,
  initialData?: OnboardingData
): UseOnboardingFormReturn {
  const [data, setData] = useState<OnboardingData>(initialData ?? {});

  const setFieldValue = useCallback((name: string, value: unknown) => {
    setData((prev) => ({ ...prev, [name]: value }));
  }, []);

  const getFieldValue = useCallback(
    (name: string): unknown => {
      return data[name];
    },
    [data]
  );

  const resetForm = useCallback(() => {
    setData({});
  }, []);

  const getCompletionPercentage = useCallback((): number => {
    return computeCompletionPercentage(schema, data);
  }, [data, schema]);

  return {
    data,
    setFieldValue,
    getFieldValue,
    resetForm,
    getCompletionPercentage,
  };
}