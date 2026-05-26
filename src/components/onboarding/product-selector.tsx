"use client";

import React from "react";
import type { ProductName } from "@/types/hub";

interface ProductSelectorProps {
  selected: ProductName[];
  onChange: (selected: ProductName[]) => void;
}

const PRODUCTS: { name: ProductName; label: string; description: string }[] = [
  { name: "StackShift", label: "StackShift", description: "Headless CMS & website platform" },
  { name: "PublishForge", label: "PublishForge", description: "Content publishing & blog management" },
  { name: "PipelineForge", label: "PipelineForge", description: "Sales pipeline & outreach automation" },
];

const BUTTON_SELECTED_CLASS: Record<string, string> = {
  StackShift:    "border-[#3358F4] bg-[#3358F408]",
  PublishForge:  "border-[#7C3AED] bg-[#7C3AED08]",
  PipelineForge: "border-[#F97316] bg-[#F9731608]",
};

const ICON_SELECTED_CLASS: Record<string, string> = {
  StackShift:    "bg-[#3358F4] text-white",
  PublishForge:  "bg-[#7C3AED] text-white",
  PipelineForge: "bg-[#F97316] text-white",
};

export default function ProductSelector({ selected, onChange }: ProductSelectorProps) {
  const toggleProduct = (product: ProductName) => {
    if (selected.includes(product)) {
      onChange(selected.filter((p) => p !== product));
    } else {
      onChange([...selected, product]);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13px] text-slate-500 mb-1">
        Select the WebriQ products this customer will use:
      </p>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
        {PRODUCTS.map((product) => {
          const isSelected = selected.includes(product.name);
          return (
            <button
              key={product.name}
              type="button"
              onClick={() => toggleProduct(product.name)}
              className={`flex items-start gap-3 p-[14px_16px] rounded-[10px] cursor-pointer text-left font-[inherit] transition-[border-color,background] duration-150 border-2 ${
                isSelected
                  ? (BUTTON_SELECTED_CLASS[product.name] ?? "border-slate-300 bg-white")
                  : "border-[#E2E8F0] bg-white"
              }`}
            >
              <div
                className={`w-9 h-9 rounded-lg flex items-center justify-center text-base shrink-0 transition-colors duration-150 ${
                  isSelected
                    ? (ICON_SELECTED_CLASS[product.name] ?? "bg-slate-400 text-white")
                    : "bg-[#F1F5F9] text-[#94A3B8]"
                }`}
              >
                {isSelected ? "✓" : product.label[0]}
              </div>
              <div>
                <div className="text-[13px] font-bold text-slate-900">{product.label}</div>
                <div className="text-[11px] text-slate-500 mt-0.5">{product.description}</div>
              </div>
            </button>
          );
        })}
      </div>
      {selected.length === 0 && (
        <p className="text-xs text-red-500 mt-1">
          Please select at least one product.
        </p>
      )}
    </div>
  );
}
