"use client";

import React, { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import type { FormSchema, OnboardingData } from "@/types/onboarding";
import { getOnboardingSchema } from "@/config/onboarding-schemas";
import { useOnboardingForm } from "@/hooks/use-onboarding-form";
import { useAutoSave } from "@/hooks/use-auto-save";
import FormSection from "./form-section";
import ProgressBar from "./progress-bar";
import SaveIndicator from "./save-indicator";

interface FormEngineProps {
  productName: string;
  customerId: string;
  initialData?: OnboardingData;
}

export default function FormEngine({ productName, customerId, initialData }: FormEngineProps) {
  const schema = getOnboardingSchema(productName);

  if (!schema) {
    return (
      <div className="p-8 text-center">
        <h2 className="text-lg text-slate-900 mb-2">Product Not Found</h2>
        <p className="text-[13px] text-slate-500">
          No onboarding form found for &ldquo;{productName}&rdquo;.
        </p>
      </div>
    );
  }

  return <FormEngineInner schema={schema} customerId={customerId} initialData={initialData} />;
}

function FormEngineInner({
  schema,
  customerId,
  initialData,
}: {
  schema: FormSchema;
  customerId: string;
  initialData?: OnboardingData;
}) {
  const { data, setFieldValue, getFieldValue, getCompletionPercentage } = useOnboardingForm(schema, initialData);
  const completionPercentage = getCompletionPercentage();
  const { saveStatus, lastSavedAt, error: saveError } = useAutoSave({
    data,
    customerId,
    productName: schema.productName,
    completionPercentage,
  });

  const [currentSectionIndex, setCurrentSectionIndex] = useState(0);
  const [isCompleted, setIsCompleted] = useState(false);

  const totalSections = schema.sections.length;
  const currentSection = schema.sections[currentSectionIndex];

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [currentSectionIndex]);

  const handleComplete = useCallback(async () => {
    try {
      await fetch(`/api/customers/${customerId}/products/${schema.productName}/onboarding`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data, completedPercentage: 100 }),
      });
    } catch {
      // best-effort — auto-save already persists data
    }
    setIsCompleted(true);
  }, [customerId, schema.productName, data]);

  const handleNext = useCallback(() => {
    if (currentSectionIndex < totalSections - 1) {
      setCurrentSectionIndex((i) => i + 1);
    } else {
      handleComplete();
    }
  }, [currentSectionIndex, totalSections, handleComplete]);

  const handleBack = useCallback(() => {
    if (currentSectionIndex > 0) {
      setCurrentSectionIndex((i) => i - 1);
    }
  }, [currentSectionIndex]);

  const handleSectionClick = useCallback((index: number) => {
    setCurrentSectionIndex(index);
  }, []);

  const isLastSection = currentSectionIndex === totalSections - 1;
  const isFirstSection = currentSectionIndex === 0;

  if (isCompleted) {
    return (
      <div className="max-w-[600px] mx-auto mt-20 px-12 py-12 text-center">
        <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6 text-2xl text-green-600 font-bold">
          ✓
        </div>
        <h2 className="text-[22px] font-bold text-slate-900 mb-3">Onboarding Complete</h2>
        <p className="text-sm text-slate-500 leading-relaxed">
          Thank you for completing the {schema.productName} onboarding form. Your project manager will review your submission and be in touch shortly.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-[860px] mx-auto px-6 pt-6 pb-[100px]">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900 m-0">{schema.productName} Onboarding</h1>
          <p className="text-[13px] text-slate-500 mt-1 mb-0">
            Complete the form to help us configure your {schema.productName} experience
          </p>
        </div>
        <SaveIndicator status={saveStatus} lastSavedAt={lastSavedAt} error={saveError} />
      </div>

      {/* Progress Steps */}
      <ProgressBar sections={schema.sections} currentIndex={currentSectionIndex} onSectionClick={handleSectionClick} />

      {/* Current Section */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-[0_1px_4px_rgba(0,0,0,0.05)]">
        <FormSection
          section={currentSection}
          getFieldValue={getFieldValue}
          setFieldValue={setFieldValue}
          customerId={customerId}
          productName={schema.productName}
        />
      </div>

      {/* Bottom Navigation — fixed bar, offset by sidebar width */}
      <div className="fixed bottom-0 left-[280px] right-0 bg-white border-t border-slate-200 py-4 px-6 flex justify-between items-center z-10">
        <button
          onClick={handleBack}
          disabled={isFirstSection}
          className={cn(
            "font-[inherit] py-2.5 px-[22px] bg-transparent text-[13px] font-medium border-[1.5px] border-slate-200 rounded-full",
            isFirstSection ? "text-slate-300 cursor-not-allowed" : "text-slate-500 cursor-pointer"
          )}
        >
          ← Back
        </button>

        <div className="flex items-center gap-3">
          {/* Completion ring */}
          <div
            className="w-9 h-9 rounded-full border-[3px] border-slate-200"
            style={{
              borderTopColor: completionPercentage >= 100 ? "#22C55E" : "#3358F4",
              transform: `rotate(${completionPercentage * 3.6}deg)`,
            }}
          />
          <span className="text-[13px] text-slate-500 font-semibold">{Math.round(completionPercentage)}%</span>
        </div>

        <button
          onClick={handleNext}
          className={cn(
            "font-[inherit] py-2.5 px-[22px] text-white text-[13px] font-semibold border-none rounded-full cursor-pointer",
            isLastSection ? "bg-brand-orange" : "bg-brand"
          )}
        >
          {isLastSection ? "Complete Onboarding ✓" : "Continue →"}
        </button>
      </div>
    </div>
  );
}
