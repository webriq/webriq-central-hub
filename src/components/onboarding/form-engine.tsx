"use client";

import React, { useState, useEffect, useCallback } from "react";
import Image from "next/image";
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
        <h2 className="text-lg text-foreground mb-2">Product Not Found</h2>
        <p className="text-[13px] text-muted-foreground">
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
      <div className="min-h-screen flex flex-col items-center justify-center px-6 py-20">
        <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
          <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-slate-900 mb-3 text-center">Onboarding Complete</h2>
        <p className="text-sm text-slate-500 leading-relaxed text-center max-w-[440px]">
          Thank you for completing the {schema.productName} onboarding form. Your project manager will review your submission and be in touch shortly.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Sticky header */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-200 px-8 h-[60px] flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <Image src="/logo.png" alt="WebriQ" width={44} height={44} className="flex-shrink-0" />
          <div className="flex items-center gap-1.5">
            <span className="text-[15px] font-bold text-slate-900 tracking-[-0.01em]">{schema.productName}</span>
            <span className="text-[15px] text-slate-400 font-normal">/ Client Onboarding</span>
          </div>
        </div>
        <SaveIndicator status={saveStatus} lastSavedAt={lastSavedAt} error={saveError} />
      </header>

      {/* Sticky progress steps */}
      <div className="sticky top-[60px] z-40 bg-white/90 backdrop-blur-md border-b border-slate-100 px-8 py-3 overflow-x-auto flex-shrink-0">
        <ProgressBar
          sections={schema.sections}
          currentIndex={currentSectionIndex}
          onSectionClick={handleSectionClick}
        />
      </div>

      {/* Main content */}
      <main className="flex-1 max-w-[860px] mx-auto w-full px-6 pt-10 pb-[100px]">
        <div className="bg-white border border-slate-200 rounded-xl shadow-[0_1px_6px_rgba(0,0,0,0.06)]">
          <FormSection
            section={currentSection}
            getFieldValue={getFieldValue}
            setFieldValue={setFieldValue}
            customerId={customerId}
            productName={schema.productName}
          />
        </div>
      </main>

      {/* Fixed bottom nav — left-0 (no sidebar in public routes) */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-slate-200 py-3 px-8 flex justify-between items-center z-50">
        {/* Left: ring + section label */}
        <div className="flex items-center gap-3">
          <div className="relative w-10 h-10 flex-shrink-0">
            <svg className="w-10 h-10 -rotate-90" viewBox="0 0 40 40">
              <circle cx="20" cy="20" r="17" fill="none" stroke="#e2e8f0" strokeWidth="3" />
              <circle
                cx="20" cy="20" r="17"
                fill="none"
                stroke={completionPercentage >= 100 ? "#22C55E" : "#3358F4"}
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={`${(completionPercentage / 100) * 106.8} 106.8`}
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-slate-700 tabular-nums">
              {Math.round(completionPercentage)}%
            </span>
          </div>
          <span className="text-[13px] text-slate-500 font-medium">
            Section {currentSectionIndex + 1} of {totalSections}
            <span className="text-slate-300 mx-1.5">—</span>
            <span className="text-slate-700 font-semibold">{currentSection.title}</span>
          </span>
        </div>

        {/* Right: Back + Continue */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={handleBack}
            disabled={isFirstSection}
            className={cn(
              "font-[inherit] py-2.5 px-5 bg-transparent text-[13px] font-medium border-[1.5px] rounded-full transition-colors",
              isFirstSection
                ? "text-slate-300 border-slate-200 cursor-not-allowed"
                : "text-slate-500 border-slate-300 cursor-pointer hover:border-slate-400 hover:text-slate-700"
            )}
          >
            ← Back
          </button>
          <button
            onClick={handleNext}
            className={cn(
              "font-[inherit] py-2.5 px-5 text-white text-[13px] font-semibold border-none rounded-full cursor-pointer transition-opacity hover:opacity-90",
              isLastSection ? "bg-brand-orange" : "bg-brand"
            )}
          >
            {isLastSection ? "Complete Onboarding ✓" : "Continue →"}
          </button>
        </div>
      </div>
    </div>
  );
}
