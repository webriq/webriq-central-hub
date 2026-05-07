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
    <div>
      <div className="mb-5">
        <h3 className="text-base font-bold text-slate-900 mb-1">{section.title}</h3>
        {section.description && (
          <p className="text-[13px] text-slate-500 m-0">{section.description}</p>
        )}
      </div>

      <div className="flex flex-wrap gap-[14px]">
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
        <p className="text-[13px] text-slate-400 text-center py-5">
          No fields available in this section based on your previous answers.
        </p>
      )}
    </div>
  );
}
