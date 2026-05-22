"use client";

import { useState, useCallback } from "react";
import type { FormSchema, OnboardingData, FormField } from "@/types/onboarding";

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
    // Collect all required fields across all visible sections
    const requiredFields: FormField[] = [];
    for (const section of schema.sections) {
      // Skip sections whose condition is not met
      if (section.condition) {
        const conditionValue = data[section.condition.field];
        if (String(conditionValue) !== String(section.condition.value)) continue;
      }
      for (const field of section.fields) {
        if (field.required) {
          // Don't count conditionally hidden fields
          if (field.condition) {
            const conditionValue = data[field.condition.field];
            const targetValue = field.condition.value;
            if (String(conditionValue) !== String(targetValue)) {
              continue; // Field is conditionally hidden, skip
            }
          }
          requiredFields.push(field);
        }
      }
    }

    if (requiredFields.length === 0) return 100;

    let completed = 0;
    for (const field of requiredFields) {
      const value = data[field.name];
      if (value !== undefined && value !== null && value !== "") {
        // For arrays (checkbox groups), check non-empty
        if (Array.isArray(value) && value.length === 0) {
          continue;
        }
        completed++;
      }
    }

    return (completed / requiredFields.length) * 100;
  }, [data, schema.sections]);

  return {
    data,
    setFieldValue,
    getFieldValue,
    resetForm,
    getCompletionPercentage,
  };
}