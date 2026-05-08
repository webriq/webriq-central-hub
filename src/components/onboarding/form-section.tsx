"use client";

import React from "react";
import type { FormSection as FormSectionType } from "@/types/onboarding";
import FormField from "./form-field";

interface FormSectionProps {
  section: FormSectionType;
  getFieldValue: (name: string) => unknown;
  setFieldValue: (name: string, value: unknown) => void;
  customerId: string;
  productName: string;
}

export default function FormSection({
  section,
  getFieldValue,
  setFieldValue,
  customerId,
  productName,
}: FormSectionProps) {
  const visibleFields = section.fields.filter((field) => {
    if (!field.condition) return true;
    const conditionValue = getFieldValue(field.condition.field);
    return String(conditionValue) === String(field.condition.value);
  });

  return (
    <div className="p-7">
      {/* Section header */}
      <div className="mb-7 pb-5 border-b border-slate-100">
        <p className="text-[0.7rem] font-semibold uppercase tracking-[2px] text-brand font-mono mb-1.5">
          Section
        </p>
        <h3 className="text-[1.5rem] font-bold text-slate-900 leading-tight mb-2">{section.title}</h3>
        {section.description && (
          <p className="text-sm text-slate-500 m-0">{section.description}</p>
        )}
      </div>

      <div className="flex flex-wrap gap-4">
        {visibleFields.map((field) => (
          <FormField
            key={field.name}
            field={field}
            value={getFieldValue(field.name)}
            onChange={setFieldValue}
            customerId={customerId}
            productName={productName}
          />
        ))}
      </div>

      {visibleFields.length === 0 && (
        <p className="text-[13px] text-slate-400 text-center py-8">
          No fields available in this section based on your previous answers.
        </p>
      )}
    </div>
  );
}
