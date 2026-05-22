"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { AlertTriangle } from "lucide-react";
import type { CustomerRow, CustomerProductRow, Database } from "@/types/database";
import type { ProductName } from "@/types/hub";

type ClassificationRow = Database["public"]["Tables"]["classification_records"]["Row"];

interface CustomerProfileClientProps {
  customer: CustomerRow & { customer_products: CustomerProductRow[] };
  zohoPortalId: string;
  zohoPortalName: string;
}

const statusClass = (status: string) => {
  const map: Record<string, string> = {
    onboarding: "bg-[#FFF4EC] text-orange-500",
    active: "bg-green-50 text-green-600",
    inactive: "bg-slate-100 text-slate-500",
    completed_onboarding: "bg-amber-50 text-amber-600",
  };
  return map[status] ?? "bg-slate-100 text-slate-500";
};

const statusLabel = (status: string) => {
  const map: Record<string, string> = {
    onboarding: "Onboarding",
    active: "Active",
    inactive: "Inactive",
    completed_onboarding: "Completed Onboarding",
  };
  return map[status] ?? status.charAt(0).toUpperCase() + status.slice(1);
};

const ZOHO_PROJECT_DEFAULTS: Record<string, string> = {
  StackShift: "App",
  PublishForge: "Content Site",
  PipelineForge: "Pipeline",
};

const PRODUCT_COLORS: Record<string, string> = {
  StackShift: "#3358F4",
  PublishForge: "#7C3AED",
  PipelineForge: "#F97316",
  CiteForge: "#0EA5E9",
};

const ALL_PRODUCTS: ProductName[] = ["StackShift", "PublishForge", "PipelineForge"];

const sectionCls = "bg-white border border-slate-200 rounded-xl p-5 shadow-[0_1px_4px_rgba(0,0,0,0.05)] mb-4";
const sectionTitleCls = "text-[10px] font-bold text-slate-400 tracking-[0.06em] uppercase mb-3.5";
const inputCls = "font-[inherit] w-full text-sm py-2.5 px-3.5 border border-slate-200 rounded-lg text-slate-900 bg-white outline-none transition-[border-color,box-shadow] duration-200 focus:border-brand focus:shadow-[0_0_0_3px_rgba(51,88,244,0.1)]";
const labelCls = "block text-xs font-semibold text-slate-600 mb-1.5";

interface EditForm {
  company_name: string;
  contact_name: string;
  contact_email: string;
  communication_tone: string;
  status: string;
}

export default function CustomerProfileClient({ customer, zohoPortalId, zohoPortalName }: CustomerProfileClientProps) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [classifications, setClassifications] = useState<ClassificationRow[]>([]);

  // Edit product metadata modal
  const [editProduct, setEditProduct] = useState<CustomerProductRow | null>(null);
  const [editProductForm, setEditProductForm] = useState({
    product_instance_id: "", zoho_project_id: "", sanity_project_id: "", github_repo: "",
  });
  const [editProductSaving, setEditProductSaving] = useState(false);
  const [editProductError, setEditProductError] = useState<string | null>(null);

  // Add product modal
  const [addProductOpen, setAddProductOpen] = useState(false);
  const [addProductForm, setAddProductForm] = useState({
    product_name: "", product_instance_id: "", zoho_project_id: "", sanity_project_id: "", github_repo: "",
  });
  const [addProductSaving, setAddProductSaving] = useState(false);
  const [addProductError, setAddProductError] = useState<string | null>(null);

  // Remove product confirmation
  const [removeProduct, setRemoveProduct] = useState<CustomerProductRow | null>(null);
  const [removeProductSaving, setRemoveProductSaving] = useState(false);
  const [removeProductError, setRemoveProductError] = useState<string | null>(null);

  // Create Zoho Projects dialog
  const [zohoDialogOpen, setZohoDialogOpen] = useState(false);
  const [zohoProjectNames, setZohoProjectNames] = useState<Record<string, string>>({});
  const [zohoCreating, setZohoCreating] = useState(false);
  const [zohoError, setZohoError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("classification_records")
      .select("id, title, task_type, priority, confidence_score, status, created_at")
      .eq("customer_id", customer.customer_id)
      .order("created_at", { ascending: false })
      .limit(10)
      .then(({ data }) => { if (data) setClassifications(data as ClassificationRow[]); });
  }, [customer.customer_id]);

  const [form, setForm] = useState<EditForm>({
    company_name: customer.company_name ?? "",
    contact_name: customer.contact_name ?? "",
    contact_email: customer.contact_email ?? "",
    communication_tone: customer.communication_tone ?? "",
    status: customer.status ?? "onboarding",
  });

  const handleCopyLink = () => {
    const onboardingUrl = `${window.location.origin}/onboarding/${customer.customer_id}`;
    navigator.clipboard.writeText(onboardingUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenEdit = () => {
    setForm({
      company_name: customer.company_name ?? "",
      contact_name: customer.contact_name ?? "",
      contact_email: customer.contact_email ?? "",
      communication_tone: customer.communication_tone ?? "",
      status: customer.status ?? "onboarding",
    });
    setSaveError(null);
    setEditOpen(true);
  };

  const handleOpenEditProduct = (product: CustomerProductRow) => {
    setEditProductForm({
      product_instance_id: product.product_instance_id ?? "",
      zoho_project_id: product.zoho_project_id ?? "",
      sanity_project_id: product.sanity_project_id ?? "",
      github_repo: product.github_repo ?? "",
    });
    setEditProductError(null);
    setEditProduct(product);
  };

  const handleSaveProduct = async () => {
    if (!editProduct) return;
    setEditProductSaving(true);
    setEditProductError(null);
    try {
      const res = await fetch(
        `/api/customers/${customer.customer_id}/products/${editProduct.product_name}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            product_instance_id: editProductForm.product_instance_id || null,
            zoho_project_id: editProductForm.zoho_project_id || null,
            sanity_project_id: editProductForm.sanity_project_id || null,
            github_repo: editProductForm.github_repo || null,
          }),
        }
      );
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? "Save failed");
      }
      setEditProduct(null);
      router.refresh();
    } catch (err) {
      setEditProductError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setEditProductSaving(false);
    }
  };

  const handleAddProduct = async () => {
    if (!addProductForm.product_name) return;
    setAddProductSaving(true);
    setAddProductError(null);
    try {
      const res = await fetch(`/api/customers/${customer.customer_id}/products`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_name: addProductForm.product_name,
          product_instance_id: addProductForm.product_instance_id || null,
          zoho_project_id: addProductForm.zoho_project_id || null,
          sanity_project_id: addProductForm.sanity_project_id || null,
          github_repo: addProductForm.github_repo || null,
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? "Failed to add product");
      }
      setAddProductOpen(false);
      setAddProductForm({ product_name: "", product_instance_id: "", zoho_project_id: "", sanity_project_id: "", github_repo: "" });
      router.refresh();
    } catch (err) {
      setAddProductError(err instanceof Error ? err.message : "Failed to add product");
    } finally {
      setAddProductSaving(false);
    }
  };

  const handleSave = async () => {
    if (!form.company_name.trim()) {
      setSaveError("Company name is required.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/customers/${customer.customer_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_name: form.company_name,
          contact_name: form.contact_name || null,
          contact_email: form.contact_email || null,
          communication_tone: form.communication_tone || null,
          status: form.status,
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? "Save failed");
      }
      setEditOpen(false);
      router.refresh();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveProduct = async () => {
    if (!removeProduct) return;
    setRemoveProductSaving(true);
    setRemoveProductError(null);
    try {
      const res = await fetch(
        `/api/customers/${customer.customer_id}/products?product_name=${encodeURIComponent(removeProduct.product_name)}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? "Failed to remove product");
      }
      setRemoveProduct(null);
      router.refresh();
    } catch (err) {
      setRemoveProductError(err instanceof Error ? err.message : "Failed to remove product");
    } finally {
      setRemoveProductSaving(false);
    }
  };

  const handleOpenZohoDialog = () => {
    const names: Record<string, string> = {};
    products.forEach(p => { names[p.product_name] = ""; });
    setZohoProjectNames(names);
    setZohoError(null);
    setZohoDialogOpen(true);
  };

  const handleGenerateName = (productName: string) => {
    const suffix = ZOHO_PROJECT_DEFAULTS[productName] ?? productName;
    setZohoProjectNames(n => ({ ...n, [productName]: `${customer.company_name} ${suffix}` }));
  };

  const handleGenerateAll = () => {
    const names: Record<string, string> = {};
    products.forEach(p => {
      const suffix = ZOHO_PROJECT_DEFAULTS[p.product_name] ?? p.product_name;
      names[p.product_name] = `${customer.company_name} ${suffix}`;
    });
    setZohoProjectNames(names);
  };

  const handleCreateZohoProjects = async () => {
    const hasAny = Object.values(zohoProjectNames).some(n => n.trim() !== "");
    if (!hasAny) {
      setZohoError("Please enter at least one project name.");
      return;
    }
    setZohoCreating(true);
    setZohoError(null);
    try {
      const res = await fetch(`/api/customers/${customer.customer_id}/zoho-projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projects: zohoProjectNames }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? "Failed to create projects");
      }
      setZohoDialogOpen(false);
      setZohoProjectNames({});
      router.refresh();
    } catch (err) {
      setZohoError(err instanceof Error ? err.message : "Failed to create projects");
    } finally {
      setZohoCreating(false);
    }
  };

  const status = customer.status ?? "onboarding";
  const products = customer.customer_products ?? [];
  const assignedNames = products.map(p => p.product_name);
  const availableProducts = ALL_PRODUCTS.filter(p => !assignedNames.includes(p));

  return (
    <>
      {/* Edit Modal */}
      {editOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
        >
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-130 overflow-hidden">
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div>
                <h2 className="text-base font-bold text-slate-900">Edit Customer</h2>
                <p className="text-xs text-slate-400 mt-0.5 font-mono">{customer.customer_id}</p>
              </div>
              <button
                onClick={() => setEditOpen(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors font-[inherit] border-none bg-transparent cursor-pointer text-lg leading-none"
              >
                ×
              </button>
            </div>

            {/* Modal body */}
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className={labelCls}>
                  Company Name <span className="text-brand">*</span>
                </label>
                <input
                  type="text"
                  value={form.company_name}
                  onChange={(e) => setForm((f) => ({ ...f, company_name: e.target.value }))}
                  className={inputCls}
                  placeholder="Acme Corp"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Contact Name</label>
                  <input
                    type="text"
                    value={form.contact_name}
                    onChange={(e) => setForm((f) => ({ ...f, contact_name: e.target.value }))}
                    className={inputCls}
                    placeholder="Jane Smith"
                  />
                </div>
                <div>
                  <label className={labelCls}>Contact Email</label>
                  <input
                    type="email"
                    value={form.contact_email}
                    onChange={(e) => setForm((f) => ({ ...f, contact_email: e.target.value }))}
                    className={inputCls}
                    placeholder="jane@acme.com"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Communication Tone</label>
                  <select
                    value={form.communication_tone}
                    onChange={(e) => setForm((f) => ({ ...f, communication_tone: e.target.value }))}
                    className={inputCls}
                  >
                    <option value="">Select...</option>
                    <option value="formal">Formal</option>
                    <option value="technical">Technical</option>
                    <option value="casual">Casual</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Status</label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                    className={inputCls}
                  >
                    <option value="onboarding">Onboarding</option>
                    <option value="completed_onboarding">Completed Onboarding</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>

              {saveError && (
                <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                  {saveError}
                </p>
              )}
            </div>

            {/* Modal footer */}
            <div className="flex justify-end gap-2.5 px-6 py-4 border-t border-slate-100 bg-slate-50/50">
              <button
                onClick={() => setEditOpen(false)}
                className="font-[inherit] py-2 px-4 bg-transparent text-slate-600 text-sm font-medium border border-slate-200 rounded-full cursor-pointer hover:border-slate-300 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="font-[inherit] py-2 px-5 bg-brand text-white text-sm font-semibold border-none rounded-full cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Product Metadata Modal */}
      {editProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-130 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div>
                <h2 className="text-base font-bold text-slate-900">Edit Product Metadata</h2>
                <p className="text-xs text-slate-400 mt-0.5">{editProduct.product_name}</p>
              </div>
              <button
                onClick={() => setEditProduct(null)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors border-none bg-transparent cursor-pointer text-lg leading-none"
              >
                ×
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Product Instance ID</label>
                  <input
                    type="text"
                    value={editProductForm.product_instance_id}
                    onChange={e => setEditProductForm(f => ({ ...f, product_instance_id: e.target.value }))}
                    className={inputCls}
                    placeholder="e.g. stackshift-001"
                  />
                </div>
                <div>
                  <label className={labelCls}>Zoho Project ID</label>
                  <input
                    type="text"
                    value={editProductForm.zoho_project_id}
                    onChange={e => setEditProductForm(f => ({ ...f, zoho_project_id: e.target.value }))}
                    className={inputCls}
                    placeholder="e.g. 123456789"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Sanity Project ID</label>
                  <input
                    type="text"
                    value={editProductForm.sanity_project_id}
                    onChange={e => setEditProductForm(f => ({ ...f, sanity_project_id: e.target.value }))}
                    className={inputCls}
                    placeholder="e.g. abc12def"
                  />
                </div>
                <div>
                  <label className={labelCls}>GitHub Repo URL</label>
                  <input
                    type="url"
                    value={editProductForm.github_repo}
                    onChange={e => setEditProductForm(f => ({ ...f, github_repo: e.target.value }))}
                    className={inputCls}
                    placeholder="https://github.com/org/repo"
                  />
                </div>
              </div>
              {editProductError && (
                <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                  {editProductError}
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2.5 px-6 py-4 border-t border-slate-100 bg-slate-50/50">
              <button
                onClick={() => setEditProduct(null)}
                className="py-2 px-4 bg-transparent text-slate-600 text-sm font-medium border border-slate-200 rounded-full cursor-pointer hover:border-slate-300 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveProduct}
                disabled={editProductSaving}
                className="py-2 px-5 bg-brand text-white text-sm font-semibold border-none rounded-full cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-60"
              >
                {editProductSaving ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Product Modal */}
      {addProductOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-130 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div>
                <h2 className="text-base font-bold text-slate-900">Add Product</h2>
                <p className="text-xs text-slate-400 mt-0.5">{customer.customer_id}</p>
              </div>
              <button
                onClick={() => setAddProductOpen(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors border-none bg-transparent cursor-pointer text-lg leading-none"
              >
                ×
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className={labelCls}>
                  Product <span className="text-brand">*</span>
                </label>
                <select
                  value={addProductForm.product_name}
                  onChange={e => setAddProductForm(f => ({ ...f, product_name: e.target.value }))}
                  className={inputCls}
                >
                  <option value="">Select a product…</option>
                  {availableProducts.map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Product Instance ID</label>
                  <input
                    type="text"
                    value={addProductForm.product_instance_id}
                    onChange={e => setAddProductForm(f => ({ ...f, product_instance_id: e.target.value }))}
                    className={inputCls}
                    placeholder="Optional"
                  />
                </div>
                <div>
                  <label className={labelCls}>Zoho Project ID</label>
                  <input
                    type="text"
                    value={addProductForm.zoho_project_id}
                    onChange={e => setAddProductForm(f => ({ ...f, zoho_project_id: e.target.value }))}
                    className={inputCls}
                    placeholder="Optional"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Sanity Project ID</label>
                  <input
                    type="text"
                    value={addProductForm.sanity_project_id}
                    onChange={e => setAddProductForm(f => ({ ...f, sanity_project_id: e.target.value }))}
                    className={inputCls}
                    placeholder="Optional"
                  />
                </div>
                <div>
                  <label className={labelCls}>GitHub Repo URL</label>
                  <input
                    type="url"
                    value={addProductForm.github_repo}
                    onChange={e => setAddProductForm(f => ({ ...f, github_repo: e.target.value }))}
                    className={inputCls}
                    placeholder="Optional"
                  />
                </div>
              </div>
              {addProductError && (
                <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                  {addProductError}
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2.5 px-6 py-4 border-t border-slate-100 bg-slate-50/50">
              <button
                onClick={() => setAddProductOpen(false)}
                className="py-2 px-4 bg-transparent text-slate-600 text-sm font-medium border border-slate-200 rounded-full cursor-pointer hover:border-slate-300 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddProduct}
                disabled={addProductSaving || !addProductForm.product_name}
                className="py-2 px-5 bg-brand-orange text-white text-sm font-semibold border-none rounded-full cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {addProductSaving ? "Adding…" : "Add Product"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Remove Product Confirmation Modal */}
      {removeProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-105 overflow-hidden">
            <div className="px-6 pt-6 pb-4">
              <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center mb-4">
                <AlertTriangle className="w-5 h-5 text-red-500" />
              </div>
              <h2 className="text-base font-bold text-slate-900 mb-1">Remove {removeProduct.product_name}?</h2>
              <p className="text-sm text-slate-500">
                This will remove <strong>{removeProduct.product_name}</strong> from{" "}
                <strong>{customer.company_name}</strong> and delete all associated onboarding data.
                This action cannot be undone.
              </p>
              {removeProductError && (
                <p className="mt-3 text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                  {removeProductError}
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2.5 px-6 py-4 border-t border-slate-100 bg-slate-50/50">
              <button
                onClick={() => { setRemoveProduct(null); setRemoveProductError(null); }}
                disabled={removeProductSaving}
                className="py-2 px-4 bg-transparent text-slate-600 text-sm font-medium border border-slate-200 rounded-full cursor-pointer hover:border-slate-300 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleRemoveProduct}
                disabled={removeProductSaving}
                className="py-2 px-5 bg-red-500 text-white text-sm font-semibold border-none rounded-full cursor-pointer hover:bg-red-600 transition-colors disabled:opacity-60"
              >
                {removeProductSaving ? "Removing…" : "Remove Product"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className={cn(sectionCls, "px-6")}>
        <div className="flex justify-between items-start flex-wrap gap-4">
          <div>
            <h1 className="text-[22px] font-bold text-slate-900 mb-2">{customer.company_name}</h1>
            <div className="flex items-center gap-2.5">
              <span className="font-mono text-sm font-semibold text-slate-600 tracking-[0.04em]">
                {customer.customer_id}
              </span>
              <span className={cn("inline-block px-2.5 py-px rounded text-[11px] font-semibold", statusClass(status))}>
                {statusLabel(status)}
              </span>
            </div>
          </div>
          <div className="flex gap-2.5 flex-wrap">
            <button
              onClick={handleOpenEdit}
              className="font-[inherit] py-2 px-4 bg-transparent text-brand text-xs font-semibold border-[1.5px] border-brand rounded-full cursor-pointer hover:bg-brand/5 transition-colors"
            >
              Edit
            </button>
            {status === "completed_onboarding" && (
              <button
                onClick={handleOpenZohoDialog}
                className="font-[inherit] py-2 px-4 bg-green-500 text-white text-xs font-semibold border-none rounded-full cursor-pointer hover:opacity-90 transition-opacity"
              >
                Create Zoho Projects
              </button>
            )}
            <button
              onClick={handleCopyLink}
              className={cn(
                "font-[inherit] py-2 px-4 text-white text-xs font-semibold border-none rounded-full cursor-pointer transition-colors duration-200",
                copied ? "bg-green-500" : "bg-brand-orange"
              )}
            >
              {copied ? "Copied! ✓" : "Copy Onboarding Link"}
            </button>
          </div>
        </div>
      </div>

      {/* Contact Info */}
      <div className={sectionCls}>
        <div className={sectionTitleCls}>Contact Information</div>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-x-6 gap-y-3">
          {[
            { label: "Contact Name", value: customer.contact_name || "—" },
            { label: "Email", value: customer.contact_email || "—" },
            { label: "Communication Tone", value: customer.communication_tone || "—" },
            {
              label: "Created",
              value: new Date(customer.created_at).toLocaleDateString("en-US", {
                year: "numeric", month: "long", day: "numeric",
              }),
            },
          ].map(({ label, value }) => (
            <div key={label}>
              <div className="text-[11px] text-slate-400 mb-0.5">{label}</div>
              <div className="text-[13px] text-slate-900 font-medium">{value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Products */}
      <div className={sectionCls}>
        <div className="flex items-center justify-between mb-3.5">
          <div className={cn(sectionTitleCls, "mb-0")}>Products ({products.length})</div>
          {availableProducts.length > 0 && (
            <button
              onClick={() => setAddProductOpen(true)}
              className="text-[11px] font-semibold text-brand border border-brand/30 rounded-full px-3 py-1 hover:bg-brand/5 transition-colors cursor-pointer bg-transparent"
            >
              + Add Product
            </button>
          )}
        </div>
        {products.length === 0 ? (
          <p className="text-[13px] text-slate-400 text-center py-4">
            No products associated yet.{" "}
            <button
              onClick={() => setAddProductOpen(true)}
              className="text-brand bg-transparent border-none cursor-pointer p-0 text-[13px]"
            >
              Add a product
            </button>
          </p>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3.5">
            {products.map((product) => {
              const color = PRODUCT_COLORS[product.product_name] ?? "#94A3B8";
              const isComplete = product.onboarding_complete;
              const productSlug = product.product_name.toLowerCase().replace(/\s+/g, "");
              return (
                <div
                  key={product.id}
                  className={cn(
                    "rounded-[10px] p-4",
                    isComplete ? "border border-green-100 bg-green-50/20" : "border border-slate-200 bg-white"
                  )}
                >
                  <div className="flex justify-between items-center mb-3">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold"
                        style={{ background: `${color}18`, color: color }}
                      >
                        {product.product_name[0]}
                      </div>
                      <span className="text-sm font-bold text-slate-900">{product.product_name}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleOpenEditProduct(product)}
                        className="text-[11px] font-medium text-slate-400 hover:text-brand transition-colors px-1.5 py-0.5 rounded bg-transparent border-none cursor-pointer"
                        title="Edit product metadata"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => { setRemoveProductError(null); setRemoveProduct(product); }}
                        className="text-[11px] font-medium text-slate-400 hover:text-red-500 transition-colors px-1.5 py-0.5 rounded bg-transparent border-none cursor-pointer"
                        title="Remove product"
                      >
                        Remove
                      </button>
                      <span
                        className={cn(
                          "inline-block px-2 py-px rounded text-[11px] font-semibold",
                          isComplete ? "bg-green-50 text-green-600" : "bg-[#FFF4EC] text-orange-500"
                        )}
                      >
                        {isComplete ? "Complete" : "In Progress"}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 mb-3">
                    <div className="flex-1 h-1.25 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full transition-[width] duration-300",
                          isComplete && "bg-green-500"
                        )}
                        style={{
                          width: `${product.completed_percentage ?? 0}%`,
                          ...(!isComplete && { background: color }),
                        }}
                      />
                    </div>
                    <span className="text-[11px] text-slate-400">
                      {Math.round(product.completed_percentage ?? 0)}%
                    </span>
                  </div>

                  <div className="flex flex-col gap-1.5 text-xs">
                    {product.product_instance_id && (
                      <div className="text-slate-500">
                        <span className="font-semibold">Instance: </span>
                        <span className="font-mono">{product.product_instance_id}</span>
                      </div>
                    )}
                    {product.sanity_project_id && (
                      <div className="text-slate-500">
                        <span className="font-semibold">Sanity: </span>
                        <span>{product.sanity_project_id}</span>
                      </div>
                    )}
                    {product.zoho_project_id && (
                      <div>
                        {zohoPortalId ? (
                          <a
                            href={`https://projects.zoho.com/portal/${zohoPortalName}#zp/projects/${product.zoho_project_id}/dashboard`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-brand font-medium"
                          >
                            Zoho Project →
                          </a>
                        ) : (
                          <div className="text-slate-500">
                            <span className="font-semibold">Zoho: </span>
                            <span className="font-mono">{product.zoho_project_id}</span>
                          </div>
                        )}
                      </div>
                    )}
                    {product.github_repo && (
                      <div>
                        <a
                          href={product.github_repo}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-brand font-medium"
                        >
                          GitHub Repo →
                        </a>
                      </div>
                    )}
                  </div>

                  <a
                    href={`/onboarding/${customer.customer_id}/${productSlug}`}
                    className="block mt-3 text-xs text-brand font-semibold no-underline"
                  >
                    View Onboarding Form →
                  </a>
                </div>
              );
            })}
            {/* CiteForge add-on card — rendered when opted in via StackShift onboarding_data */}
            {(() => {
              const stackshift = products.find(p => p.product_name === "StackShift");
              const hasCiteForge =
                (stackshift?.onboarding_data as Record<string, unknown>)?.includeCiteForge === "Yes";
              if (!hasCiteForge) return null;
              const cfColor = "#0EA5E9";
              return (
                <div className="rounded-[10px] p-4 border border-sky-100 bg-sky-50/20">
                  <div className="flex justify-between items-center mb-3">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold"
                        style={{ background: `${cfColor}18`, color: cfColor }}
                      >
                        Ci
                      </div>
                      <div>
                        <span className="text-sm font-bold text-slate-900">CiteForge</span>
                        <span className="ml-2 text-[10px] text-slate-400 font-medium">Add-on to StackShift</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-[5px] bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-green-500" style={{ width: "100%" }} />
                    </div>
                    <span className="text-[11px] text-slate-400">100%</span>
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {/* Create Zoho Projects Dialog */}
      {zohoDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-130 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div>
                <h2 className="text-base font-bold text-slate-900">Create Zoho Projects</h2>
                <p className="text-xs text-slate-400 mt-0.5">{customer.company_name}</p>
              </div>
              <button
                onClick={() => { setZohoDialogOpen(false); setZohoError(null); }}
                className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors border-none bg-transparent cursor-pointer text-lg leading-none"
              >
                ×
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-500">Enter a project name for each product. Leave blank to skip.</p>
                <button
                  onClick={handleGenerateAll}
                  className="text-[11px] font-semibold text-brand border border-brand/30 rounded-full px-3 py-1 hover:bg-brand/5 transition-colors cursor-pointer bg-transparent whitespace-nowrap ml-3"
                >
                  Generate All
                </button>
              </div>
              {products.map((product) => (
                <div key={product.id}>
                  <label className={labelCls}>{product.product_name}</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={zohoProjectNames[product.product_name] ?? ""}
                      onChange={e => setZohoProjectNames(n => ({ ...n, [product.product_name]: e.target.value }))}
                      className={cn(inputCls, "flex-1")}
                      placeholder={`e.g. ${customer.company_name} ${ZOHO_PROJECT_DEFAULTS[product.product_name] ?? "Project"}`}
                    />
                    <button
                      onClick={() => handleGenerateName(product.product_name)}
                      className="py-2 px-3 text-[11px] font-semibold text-brand border border-brand/30 rounded-lg hover:bg-brand/5 transition-colors cursor-pointer bg-transparent whitespace-nowrap"
                    >
                      Generate
                    </button>
                  </div>
                </div>
              ))}
              {zohoError && (
                <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                  {zohoError}
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2.5 px-6 py-4 border-t border-slate-100 bg-slate-50/50">
              <button
                onClick={() => { setZohoDialogOpen(false); setZohoError(null); }}
                className="font-[inherit] py-2 px-4 bg-transparent text-slate-600 text-sm font-medium border border-slate-200 rounded-full cursor-pointer hover:border-slate-300 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateZohoProjects}
                disabled={zohoCreating}
                className="font-[inherit] py-2 px-5 bg-green-500 text-white text-sm font-semibold border-none rounded-full cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-60"
              >
                {zohoCreating ? "Creating…" : "Create Project(s)"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Classifications */}
      <div className={sectionCls}>
        <div className={sectionTitleCls}>Classifications ({classifications.length})</div>
        {classifications.length === 0 ? (
          <div className="text-[13px] text-slate-400 text-center py-6 bg-slate-50 rounded-lg border border-dashed border-slate-200">
            No classification records yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[12px]">
              <thead>
                <tr className="border-b border-slate-100">
                  {["Title", "Type", "Priority", "Confidence", "Status", "Age"].map(h => (
                    <th key={h} className="py-2 px-3 text-left text-[10px] font-bold text-slate-400 tracking-[0.06em] uppercase whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {classifications.map((c, i) => {
                  const age = (() => {
                    const diff = Date.now() - new Date(c.created_at).getTime();
                    const mins = Math.floor(diff / 60000);
                    if (mins < 60) return `${mins}m`;
                    const hrs = Math.floor(mins / 60);
                    if (hrs < 24) return `${hrs}h`;
                    return `${Math.floor(hrs / 24)}d`;
                  })();
                  const priorityClass: Record<string, string> = {
                    CRITICAL: "text-red-700 bg-red-50",
                    HIGH: "text-amber-700 bg-amber-50",
                    NORMAL: "text-sky-700 bg-sky-50",
                    LOW: "text-slate-500 bg-slate-50",
                  };
                  return (
                    <tr key={c.id} className={i < classifications.length - 1 ? "border-b border-slate-50" : ""}>
                      <td className="py-2.5 px-3 text-slate-800 font-medium max-w-60 truncate">{c.title}</td>
                      <td className="py-2.5 px-3 text-slate-500 whitespace-nowrap">
                        {c.task_type ? c.task_type.replace(/_/g, " ") : "—"}
                      </td>
                      <td className="py-2.5 px-3">
                        {c.priority ? (
                          <span className={cn("text-[10px] font-bold rounded px-1.5 py-px", priorityClass[c.priority] ?? "text-slate-500 bg-slate-50")}>
                            {c.priority}
                          </span>
                        ) : <span className="text-slate-400">—</span>}
                      </td>
                      <td className="py-2.5 px-3 text-slate-500 font-mono">
                        {c.confidence_score != null ? `${Math.round(Number(c.confidence_score))}%` : "—"}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className={cn(
                          "text-[10px] font-semibold rounded px-1.5 py-px",
                          c.status === "reviewed" ? "text-green-700 bg-green-50" : "text-amber-700 bg-amber-50"
                        )}>
                          {c.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-400 whitespace-nowrap">{age}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
