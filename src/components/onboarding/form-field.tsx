"use client";

import React from "react";
import type { FormField as FormFieldType } from "@/types/onboarding";
import { cn } from "@/lib/utils";
import FileUpload from "./file-upload";

interface FormFieldProps {
  field: FormFieldType;
  value: unknown;
  onChange: (name: string, value: unknown) => void;
  customerId: string;
  productName: string;
}

const inputCls = "font-[inherit] w-full text-[0.875rem] py-[10px] px-[14px] border border-slate-200 rounded-[10px] text-slate-900 bg-white outline-none box-border transition-[border-color,box-shadow] duration-200 focus:border-brand focus:shadow-[0_0_0_3px_rgba(51,88,244,0.12)] placeholder:text-slate-400 placeholder:italic";
const labelCls = "block text-[0.78rem] font-semibold text-slate-600 mb-1.5 tracking-[0.2px]";

export default function FormField({ field, value, onChange, customerId, productName }: FormFieldProps) {
  const fieldId = `field-${field.name}`;

  const renderInput = () => {
    switch (field.type) {
      case "text":
      case "email":
      case "url":
        return (
          <input
            id={fieldId}
            type={field.type}
            placeholder={field.placeholder}
            value={(value as string) ?? ""}
            onChange={(e) => onChange(field.name, e.target.value)}
            className={inputCls}
          />
        );

      case "textarea":
        return (
          <textarea
            id={fieldId}
            placeholder={field.placeholder}
            value={(value as string) ?? ""}
            onChange={(e) => onChange(field.name, e.target.value)}
            className={cn(inputCls, "h-25 resize-y min-h-20")}
          />
        );

      case "select":
        return (
          <select
            id={fieldId}
            value={(value as string) ?? ""}
            onChange={(e) => onChange(field.name, e.target.value)}
            className={inputCls}
          >
            <option value="">Select...</option>
            {field.options?.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        );

      case "radio-group":
        return (
          <div className="flex flex-col gap-2">
            {field.options?.map((opt) => {
              const checked = String(value) === opt;
              return (
                <label key={opt} className="flex items-center gap-2 text-[13px] text-slate-900 cursor-pointer">
                  <input
                    type="radio"
                    name={field.name}
                    value={opt}
                    checked={checked}
                    onChange={() => onChange(field.name, opt)}
                    className="accent-brand"
                  />
                  {opt}
                </label>
              );
            })}
          </div>
        );

      case "checkbox-group": {
        const selectedValues: string[] = Array.isArray(value) ? value : [];
        return (
          <div className="flex flex-col gap-2">
            {field.options?.map((opt) => {
              const checked = selectedValues.includes(opt);
              return (
                <label key={opt} className="flex items-center gap-2 text-[13px] text-slate-900 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => {
                      const next = checked
                        ? selectedValues.filter((v) => v !== opt)
                        : [...selectedValues, opt];
                      onChange(field.name, next);
                    }}
                    className="accent-brand"
                  />
                  {opt}
                </label>
              );
            })}
            {field.name === "otherIntegrations" && (
              <input
                type="text"
                placeholder="Other integration..."
                value={selectedValues.find((v) => !field.options?.includes(v)) ?? ""}
                onChange={(e) => {
                  const base = selectedValues.filter((v) => field.options?.includes(v));
                  if (e.target.value) {
                    onChange(field.name, [...base, e.target.value]);
                  } else {
                    onChange(field.name, base);
                  }
                }}
                className={cn(inputCls, "w-[60%] mt-1")}
              />
            )}
          </div>
        );
      }

      case "file":
        return (
          <FileUpload
            fieldName={field.name}
            customerId={customerId}
            productName={productName}
            value={value}
            onChange={(fileData) => onChange(field.name, fileData)}
          />
        );

      case "table":
        return (
          <textarea
            id={fieldId}
            placeholder={field.placeholder ?? "Enter data... (one entry per line)"}
            value={(value as string) ?? ""}
            onChange={(e) => onChange(field.name, e.target.value)}
            className={cn(inputCls, "h-30 resize-y font-mono text-xs")}
          />
        );

      default:
        return (
          <input
            id={fieldId}
            type="text"
            placeholder={field.placeholder}
            value={(value as string) ?? ""}
            onChange={(e) => onChange(field.name, e.target.value)}
            className={inputCls}
          />
        );
    }
  };

  return (
    <div className={cn("min-w-50", field.span === "half" ? "flex-[0_0_calc(50%-7px)]" : "flex-[1_1_100%]")}>
      <label htmlFor={fieldId} className={labelCls}>
        {field.label}
        {field.required && <span className="text-brand ml-0.5">*</span>}
      </label>
      {renderInput()}
      {field.hint && (
        <p className="text-[11px] text-slate-400 mt-1 mb-0">{field.hint}</p>
      )}
    </div>
  );
}
