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
    <div className="flex items-center min-w-max">
      {sections.map((section, i) => {
        const isActive = i === currentIndex;
        const isDone = i < currentIndex;

        return (
          <React.Fragment key={section.id}>
            <button
              onClick={() => onSectionClick(i)}
              title={section.title}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-full text-[0.78rem] font-medium whitespace-nowrap cursor-pointer border transition-all duration-200 font-[inherit]",
                isActive
                  ? "bg-brand/10 border-brand/25 text-brand"
                  : isDone
                  ? "bg-transparent border-transparent text-green-600"
                  : "bg-transparent border-transparent text-slate-400 hover:text-slate-600"
              )}
            >
              <span
                className={cn(
                  "w-5 h-5 rounded-full flex items-center justify-center text-[0.65rem] font-bold font-mono flex-shrink-0 border transition-all duration-200",
                  isActive
                    ? "bg-brand border-brand text-white"
                    : isDone
                    ? "bg-green-500 border-green-500 text-white"
                    : "bg-transparent border-slate-300 text-slate-400"
                )}
              >
                {isDone ? (
                  <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  i + 1
                )}
              </span>
              <span className="hidden sm:inline">{section.title}</span>
            </button>

            {i < sections.length - 1 && (
              <div
                className={cn(
                  "flex-shrink-0 w-5 h-px mx-0.5",
                  isDone ? "bg-green-300" : "bg-slate-200"
                )}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
