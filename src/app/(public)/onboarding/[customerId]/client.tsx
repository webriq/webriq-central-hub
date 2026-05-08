"use client";

import React, { useState } from "react";
import type { ProductName } from "@/types/hub";
import FormEngine from "@/components/onboarding/form-engine";

interface ProductInfo {
  id: string;
  product_name: string;
  onboarding_data: Record<string, unknown>;
}

interface OnboardingFormClientProps {
  customerId: string;
  companyName: string;
  products: ProductInfo[];
}

export default function OnboardingFormClient({ customerId, companyName, products }: OnboardingFormClientProps) {
  const [selectedProduct, setSelectedProduct] = useState<ProductName | null>(
    products.length === 1 ? (products[0].product_name as ProductName) : null
  );

  if (products.length === 0) {
    return (
      <div className="p-12 text-center">
        <h1 className="text-xl font-bold text-slate-900 mb-2">Welcome, {companyName}!</h1>
        <p className="text-sm text-slate-500">
          Your onboarding hasn&rsquo;t been set up yet. Please contact your project manager for assistance.
        </p>
      </div>
    );
  }

  if (!selectedProduct && products.length > 1) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 py-20">
        <div className="w-7 h-7 rounded-lg bg-brand flex items-center justify-center mb-6">
          <span className="text-white font-bold text-xs leading-none">W</span>
        </div>
        <h1 className="text-2xl font-bold text-slate-900 mb-2 text-center">Welcome, {companyName}!</h1>
        <p className="text-sm text-slate-500 mb-10 text-center">
          You have multiple products to onboard. Select one to get started:
        </p>
        <div className="flex flex-col gap-3 w-full max-w-[520px]">
          {products.map((product) => (
            <button
              key={product.id}
              onClick={() => setSelectedProduct(product.product_name as ProductName)}
              className="font-[inherit] flex items-center justify-between py-4 px-5 bg-white border border-slate-200 rounded-xl cursor-pointer text-left shadow-[0_1px_4px_rgba(0,0,0,0.06)] hover:border-brand/30 hover:shadow-[0_2px_8px_rgba(51,88,244,0.08)] transition-all duration-200"
            >
              <div>
                <div className="text-[15px] font-bold text-slate-900">{product.product_name}</div>
                <div className="text-xs text-slate-500 mt-0.5">Click to start onboarding form</div>
              </div>
              <span className="text-brand font-semibold">→</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const activeProduct = selectedProduct ?? (products[0].product_name as ProductName);
  const productData = products.find((p) => p.product_name === activeProduct);

  return (
    <FormEngine
      productName={activeProduct}
      customerId={customerId}
      initialData={productData?.onboarding_data}
    />
  );
}
