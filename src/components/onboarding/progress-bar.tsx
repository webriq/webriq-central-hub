"use client";

import React from "react";
import { cn } from "@/lib/utils";
import type { FormSection } from "@/types/onboarding";

interface ProgressBarProps {
  sections: FormSection[];
  currentIndex: number;
  onSectionClick: (index: number) => void;
}

export default function ProgressBar({ sections, currentIndex, onSectionClick }: ProgressBarProps) {
  return (
    <div className="flex items-center flex-wrap mb-6">
      {sections.map((section, i) => {
        const isActive = i === currentIndex;
        const isDone = i < currentIndex;

        return (
          <React.Fragment key={section.id}>
            <button
              onClick={() => onSectionClick(i)}
              className="flex flex-col items-center gap-1.5 bg-none border-none cursor-pointer px-2 py-1 font-[inherit]"
              title={section.title}
            >
              <span
                className={cn(
                  "w-8 h-8 rounded-full text-[13px] font-bold flex items-center justify-center transition-colors duration-200",
                  isActive || isDone ? "bg-brand text-white" : "bg-slate-200 text-slate-400"
                )}
              >
                {isDone ? "✓" : i + 1}
              </span>
              <span
                className={cn(
                  "text-[11px] whitespace-nowrap max-w-[100px] overflow-hidden text-ellipsis text-center transition-colors duration-200",
                  isActive ? "font-bold text-brand" : isDone ? "font-medium text-slate-500" : "font-medium text-slate-400"
                )}
              >
                {section.title}
              </span>
            </button>
            {i < sections.length - 1 && (
              <div
                className={cn(
                  "flex-[0_0_24px] h-0.5 mb-[22px] transition-colors duration-200",
                  isDone ? "bg-brand" : "bg-slate-200"
                )}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
