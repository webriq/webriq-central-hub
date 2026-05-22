"use client";

import React from "react";
import type { ProductName } from "@/types/hub";

interface ProductSelectorProps {
  selected: ProductName[];
  onChange: (selected: ProductName[]) => void;
}

const PRODUCTS: { name: ProductName; label: string; description: string; color: string }[] = [
  { name: "StackShift", label: "StackShift", description: "Headless CMS & website platform", color: "#3358F4" },
  { name: "PublishForge", label: "PublishForge", description: "Content publishing & blog management", color: "#7C3AED" },
  { name: "PipelineForge", label: "PipelineForge", description: "Sales pipeline & outreach automation", color: "#F97316" },
];

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
              className="flex items-start gap-3 p-[14px_16px] rounded-[10px] cursor-pointer text-left font-[inherit] transition-[border-color,background] duration-150"
              style={{
                border: `2px solid ${isSelected ? product.color : "#E2E8F0"}`,
                background: isSelected ? `${product.color}08` : "#fff",
              }}
            >
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center text-base flex-shrink-0 transition-colors duration-150"
                style={{
                  background: isSelected ? product.color : "#F1F5F9",
                  color: isSelected ? "#fff" : "#94A3B8",
                }}
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
