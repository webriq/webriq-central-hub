"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { AlertTriangle } from "lucide-react";
import type { CustomerRow, CustomerProductRow, Database } from "@/types/database";
import type { ProductName } from "@/types/hub";
import { getIncompleteSections, getOnboardingSchema } from "@/config/onboarding-schemas";

type ClassificationRow = Database["public"]["Tables"]["classification_records"]["Row"];
type AssetRow = Database["public"]["Tables"]["customer_assets"]["Row"];
type NavSection = "company" | "contact" | "products" | "assets" | "activity" | "settings";

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

const PRODUCT_ICON_CLASSES: Record<string, string> = {
  StackShift:    "text-[#3358F4] bg-[#3358F418]",
  PublishForge:  "text-[#7C3AED] bg-[#7C3AED18]",
  PipelineForge: "text-[#F97316] bg-[#F9731618]",
  CiteForge:     "text-[#0EA5E9] bg-[#0EA5E918]",
};

const PRODUCT_BAR_CLASSES: Record<string, string> = {
  StackShift:    "bg-[#3358F4]",
  PublishForge:  "bg-[#7C3AED]",
  PipelineForge: "bg-[#F97316]",
  CiteForge:     "bg-[#0EA5E9]",
};

const ALL_PRODUCTS: ProductName[] = ["StackShift", "PublishForge", "PipelineForge"];

const sectionCls = "bg-white border border-slate-200 rounded-xl p-5 shadow-[0_1px_4px_rgba(0,0,0,0.05)] mb-4";
const sectionTitleCls = "text-[10px] font-bold text-slate-400 tracking-[0.06em] uppercase mb-3.5";
const inputCls = "font-[inherit] w-full text-sm py-2.5 px-3.5 border border-slate-200 rounded-lg text-slate-900 bg-white outline-none transition-[border-color,box-shadow] duration-200 focus:border-brand focus:shadow-[0_0_0_3px_rgba(51,88,244,0.1)]";
const labelCls = "block text-xs font-semibold text-slate-600 mb-1.5";

const ASSET_TYPE_LABELS: Record<AssetRow["type"], string> = { file: "FILE", link: "LINK", credential: "CRED" };
const ASSET_TYPE_CLASSES: Record<AssetRow["type"], string> = {
  file: "bg-sky-50 text-sky-600",
  link: "bg-indigo-50 text-indigo-600",
  credential: "bg-amber-50 text-amber-600",
};

function extractMetadata(prods: CustomerProductRow[]) {
  const data = (prods.find(p => p.onboarding_data)?.onboarding_data as Record<string, unknown>) ?? {};
  return {
    companyName: data.companyName as string | undefined,
    website: data.website as string | undefined,
    industry: data.industry as string | undefined,
    region: data.region as string | undefined,
    companySize: data.companySize as string | undefined,
  };
}

function getProductHighlights(product: CustomerProductRow): { label: string; value: string }[] {
  const data = (product.onboarding_data as Record<string, unknown>) ?? {};
  if (product.product_name === "StackShift") {
    return ([
      data.siteType ? { label: "Site Type", value: data.siteType as string } : null,
      { label: "Brand Guide", value: data.brandGuide ? "Uploaded" : "None" },
      data.referenceSites ? { label: "Reference Sites", value: String(data.referenceSites).slice(0, 80) } : null,
    ] as (null | { label: string; value: string })[]).filter((x): x is { label: string; value: string } => x !== null);
  }
  if (product.product_name === "PublishForge") {
    return data.contentInputs
      ? [{ label: "Content Inputs", value: String(data.contentInputs).slice(0, 80) }]
      : [];
  }
  return [];
}

interface EditForm {
  company_name: string;
  contact_name: string;
  contact_email: string;
  communication_tone: string;
  status: string;
  automation_toggle: boolean;
  llm_excluded: boolean;
  daily_token_budget: string;
}

export default function CustomerProfileClient({ customer, zohoPortalId, zohoPortalName }: CustomerProfileClientProps) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [classifications, setClassifications] = useState<ClassificationRow[]>([]);
  const [activeSection, setActiveSection] = useState<NavSection>("company");

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

  // View onboarding responses inline
  const [viewingResponsesInline, setViewingResponsesInline] = useState<CustomerProductRow | null>(null);

  // Reopen onboarding
  const [reopening, setReopening] = useState(false);
  const [reopenError, setReopenError] = useState<string | null>(null);

  // Create Zoho Projects dialog
  const [zohoDialogOpen, setZohoDialogOpen] = useState(false);
  const [zohoProjectNames, setZohoProjectNames] = useState<Record<string, string>>({});
  const [zohoCreating, setZohoCreating] = useState(false);
  const [zohoError, setZohoError] = useState<string | null>(null);

  // Assets
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const hasFetchedAssetsRef = useRef(false);
  const [showAddAsset, setShowAddAsset] = useState(false);
  const [addAssetForm, setAddAssetForm] = useState<{ type: AssetRow["type"]; label: string; value: string; masked: boolean }>({
    type: "link", label: "", value: "", masked: false,
  });
  const [addAssetSaving, setAddAssetSaving] = useState(false);
  const [addAssetError, setAddAssetError] = useState<string | null>(null);
  const [revealedAssets, setRevealedAssets] = useState<Set<string>>(new Set());

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

  useEffect(() => {
    if (activeSection !== "assets" || hasFetchedAssetsRef.current) return;
    hasFetchedAssetsRef.current = true;
    setAssetsLoading(true);
    fetch(`/api/customers/${customer.customer_id}/assets`)
      .then(r => r.json())
      .then((data: unknown) => setAssets(Array.isArray(data) ? (data as AssetRow[]) : []))
      .catch(() => {})
      .finally(() => setAssetsLoading(false));
  }, [activeSection, customer.customer_id]);

  const [form, setForm] = useState<EditForm>({
    company_name: customer.company_name ?? "",
    contact_name: customer.contact_name ?? "",
    contact_email: customer.contact_email ?? "",
    communication_tone: customer.communication_tone ?? "",
    status: customer.status ?? "onboarding",
    automation_toggle: customer.automation_toggle ?? false,
    llm_excluded: customer.llm_excluded ?? false,
    daily_token_budget: customer.daily_token_budget != null ? String(customer.daily_token_budget) : "",
  });

  const handleCopyLink = () => {
    const onboardingUrl = `${window.location.origin}/onboard/${customer.customer_id}`;
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
      automation_toggle: customer.automation_toggle ?? false,
      llm_excluded: customer.llm_excluded ?? false,
      daily_token_budget: customer.daily_token_budget != null ? String(customer.daily_token_budget) : "",
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
          automation_toggle: form.automation_toggle,
          llm_excluded: form.llm_excluded,
          daily_token_budget: form.daily_token_budget ? Number(form.daily_token_budget) : null,
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

  const handleReopen = async () => {
    setReopening(true);
    setReopenError(null);
    try {
      const res = await fetch(`/api/customers/${customer.customer_id}/reopen-onboarding`, {
        method: "POST",
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? "Failed to reopen onboarding");
      }
      router.refresh();
    } catch (err) {
      setReopenError(err instanceof Error ? err.message : "Failed to reopen onboarding");
    } finally {
      setReopening(false);
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

  const handleAddAsset = async () => {
    if (!addAssetForm.label.trim() || !addAssetForm.value.trim()) return;
    setAddAssetSaving(true);
    setAddAssetError(null);
    try {
      const res = await fetch(`/api/customers/${customer.customer_id}/assets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(addAssetForm),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? "Failed to add asset");
      }
      const newAsset: AssetRow = await res.json();
      setAssets(prev => [...prev, newAsset]);
      setShowAddAsset(false);
      setAddAssetForm({ type: "link", label: "", value: "", masked: false });
    } catch (err) {
      setAddAssetError(err instanceof Error ? err.message : "Failed to add asset");
    } finally {
      setAddAssetSaving(false);
    }
  };

  const handleDeleteAsset = async (id: string) => {
    try {
      await fetch(`/api/customers/${customer.customer_id}/assets?id=${id}`, { method: "DELETE" });
      setAssets(prev => prev.filter(x => x.id !== id));
      setRevealedAssets(prev => { const next = new Set(prev); next.delete(id); return next; });
    } catch {
      // silently ignore delete failure
    }
  };

  const status = customer.status ?? "onboarding";
  const products = customer.customer_products ?? [];
  const assignedNames = products.map(p => p.product_name);
  const availableProducts = ALL_PRODUCTS.filter(p => !assignedNames.includes(p));
  const metadata = extractMetadata(products);

  const stackshiftProduct = products.find(p => p.product_name === "StackShift");
  const hasCiteForge = (stackshiftProduct?.onboarding_data as Record<string, unknown>)?.includeCiteForge === "Yes";
  const totalProductCount = products.length + (hasCiteForge ? 1 : 0);

  const navItems: { id: NavSection; label: string }[] = [
    { id: "company", label: "Company Info" },
    { id: "contact", label: "Primary Contact" },
    { id: "products", label: `Products (${totalProductCount})` },
    { id: "assets", label: "Assets" },
    { id: "activity", label: `Activity (${classifications.length})` },
    { id: "settings", label: "Settings" },
  ];

  return (
    <>
      {/* Edit Customer Modal */}
      {editOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-130 overflow-hidden">
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
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Automation</label>
                  <div className="flex items-center gap-2 pt-2.5">
                    <input
                      type="checkbox"
                      id="automation_toggle"
                      checked={form.automation_toggle}
                      onChange={(e) => setForm((f) => ({ ...f, automation_toggle: e.target.checked }))}
                      className="w-4 h-4 rounded border-slate-200 accent-brand cursor-pointer"
                    />
                    <label htmlFor="automation_toggle" className="text-sm text-slate-700 cursor-pointer">
                      Enable auto-plan generation
                    </label>
                  </div>
                </div>
                <div>
                  <label className={labelCls}>LLM Pipeline</label>
                  <div className="flex items-center gap-2 pt-2.5">
                    <input
                      type="checkbox"
                      id="llm_excluded"
                      checked={form.llm_excluded}
                      onChange={(e) => setForm((f) => ({ ...f, llm_excluded: e.target.checked }))}
                      className="w-4 h-4 rounded border-slate-200 accent-brand cursor-pointer"
                    />
                    <label htmlFor="llm_excluded" className="text-sm text-slate-700 cursor-pointer">
                      Exclude from AI pipeline
                    </label>
                  </div>
                </div>
              </div>
              <div>
                <label className={labelCls}>Daily Token Budget</label>
                <input
                  type="number"
                  value={form.daily_token_budget}
                  onChange={(e) => setForm((f) => ({ ...f, daily_token_budget: e.target.value }))}
                  className={inputCls}
                  placeholder="Leave empty for unlimited"
                  min="0"
                />
              </div>
              {saveError && (
                <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                  {saveError}
                </p>
              )}
            </div>
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

      {/* Add Asset Modal */}
      {showAddAsset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-130 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div>
                <h2 className="text-base font-bold text-slate-900">Add Asset</h2>
                <p className="text-xs text-slate-400 mt-0.5">{customer.company_name}</p>
              </div>
              <button
                onClick={() => { setShowAddAsset(false); setAddAssetError(null); }}
                className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors border-none bg-transparent cursor-pointer text-lg leading-none"
              >
                ×
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className={labelCls}>Type</label>
                <select
                  value={addAssetForm.type}
                  onChange={e => setAddAssetForm(f => ({
                    ...f,
                    type: e.target.value as AssetRow["type"],
                    masked: e.target.value === "credential",
                  }))}
                  className={inputCls}
                >
                  <option value="link">Link</option>
                  <option value="file">File</option>
                  <option value="credential">Credential</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Label <span className="text-brand">*</span></label>
                <input
                  type="text"
                  value={addAssetForm.label}
                  onChange={e => setAddAssetForm(f => ({ ...f, label: e.target.value }))}
                  className={inputCls}
                  placeholder={
                    addAssetForm.type === "credential" ? "e.g. DNS Access (LastPass)" :
                    addAssetForm.type === "file" ? "e.g. Brand Guide" :
                    "e.g. Staging URL"
                  }
                />
              </div>
              <div>
                <label className={labelCls}>Value <span className="text-brand">*</span></label>
                <input
                  type={addAssetForm.type === "credential" ? "text" : "url"}
                  value={addAssetForm.value}
                  onChange={e => setAddAssetForm(f => ({ ...f, value: e.target.value }))}
                  className={inputCls}
                  placeholder={addAssetForm.type === "credential" ? "e.g. LastPass item name or vault path" : "https://"}
                />
              </div>
              {addAssetForm.type === "credential" && (
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="asset_masked"
                    checked={addAssetForm.masked}
                    onChange={e => setAddAssetForm(f => ({ ...f, masked: e.target.checked }))}
                    className="w-4 h-4 rounded border-slate-200 accent-brand cursor-pointer"
                  />
                  <label htmlFor="asset_masked" className="text-sm text-slate-700 cursor-pointer">
                    Mask value in UI
                  </label>
                </div>
              )}
              <p className="text-[11px] text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                Store references only (e.g. LastPass item name, vault path) — not actual passwords or API keys.
              </p>
              {addAssetError && (
                <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                  {addAssetError}
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2.5 px-6 py-4 border-t border-slate-100 bg-slate-50/50">
              <button
                onClick={() => { setShowAddAsset(false); setAddAssetError(null); }}
                className="py-2 px-4 bg-transparent text-slate-600 text-sm font-medium border border-slate-200 rounded-full cursor-pointer hover:border-slate-300 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddAsset}
                disabled={addAssetSaving || !addAssetForm.label.trim() || !addAssetForm.value.trim()}
                className="py-2 px-5 bg-brand text-white text-sm font-semibold border-none rounded-full cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {addAssetSaving ? "Adding…" : "Add Asset"}
              </button>
            </div>
          </div>
        </div>
      )}


      {/* Page content */}
      <div className="p-6 max-w-5xl mx-auto">
          {/* Header card — always visible */}
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
                {status === "completed_onboarding" ? (
                  <div className="flex flex-col items-end gap-1">
                    <button
                      onClick={handleReopen}
                      disabled={reopening}
                      className="font-[inherit] py-2 px-4 bg-slate-600 text-white text-xs font-semibold border-none rounded-full cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-60"
                    >
                      {reopening ? "Reopening…" : "Reopen for Update"}
                    </button>
                    {reopenError && (
                      <span className="text-[11px] text-red-500">{reopenError}</span>
                    )}
                  </div>
                ) : (status === "onboarding" || status === "inactive") ? (
                  <button
                    onClick={handleCopyLink}
                    className={cn(
                      "font-[inherit] py-2 px-4 text-white text-xs font-semibold border-none rounded-full cursor-pointer transition-colors duration-200",
                      copied ? "bg-green-500" : "bg-brand-orange"
                    )}
                  >
                    {copied ? "Copied! ✓" : "Copy Onboarding Link"}
                  </button>
                ) : null}
              </div>
            </div>
          </div>

          {/* Section quick-links */}
          <div className="flex gap-0.5 border-b border-slate-200 mb-5 flex-wrap">
            {navItems.map(item => (
              <button
                key={item.id}
                onClick={() => setActiveSection(item.id)}
                className={cn(
                  "font-[inherit] text-[12px] font-medium pb-2 px-2.5 border-b-2 -mb-px transition-colors bg-transparent cursor-pointer whitespace-nowrap",
                  activeSection === item.id
                    ? "border-brand text-brand"
                    : "border-transparent text-slate-500 hover:text-slate-700"
                )}
              >
                {item.label}
              </button>
            ))}
          </div>

          {/* Company Info */}
          {activeSection === "company" && (
            <div className={sectionCls}>
              <div className={sectionTitleCls}>Company Info</div>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-x-6 gap-y-3">
                {([
                  { label: "Company Name", value: customer.company_name },
                  { label: "Website", value: metadata.website },
                  { label: "Industry", value: metadata.industry },
                  { label: "Region", value: metadata.region },
                  { label: "Company Size", value: metadata.companySize },
                  {
                    label: "Member Since",
                    value: new Date(customer.created_at).toLocaleDateString("en-US", {
                      year: "numeric", month: "long", day: "numeric",
                    }),
                  },
                ] as { label: string; value: string | undefined }[]).map(({ label, value }) => (
                  <div key={label}>
                    <div className="text-[11px] text-slate-400 mb-0.5">{label}</div>
                    <div className="text-[13px] text-slate-900 font-medium">{value ?? "—"}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Primary Contact */}
          {activeSection === "contact" && (
            <div className={sectionCls}>
              <div className={sectionTitleCls}>Primary Contact</div>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-x-6 gap-y-3">
                {[
                  { label: "Contact Name", value: customer.contact_name || "—" },
                  { label: "Email", value: customer.contact_email || "—" },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <div className="text-[11px] text-slate-400 mb-0.5">{label}</div>
                    <div className="text-[13px] text-slate-900 font-medium">{value}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Products */}
          {activeSection === "products" && (
            <>
              {viewingResponsesInline && (
                <button
                  onClick={() => setViewingResponsesInline(null)}
                  className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 border border-slate-200 rounded-full px-3 py-1.5 transition-colors cursor-pointer bg-transparent mb-3 block"
                >
                  ← Back to Products
                </button>
              )}
            <div className={sectionCls}>
              {viewingResponsesInline ? (
                <div>
                  <div className="mb-5">
                    <div className="text-sm font-bold text-slate-900">{viewingResponsesInline.product_name}</div>
                    <div className="text-[11px] text-slate-400">Onboarding Responses</div>
                  </div>
                  <div className="space-y-5">
                    <ResponsesView product={viewingResponsesInline} />
                  </div>
                </div>
              ) : (
              <>
              <div className="flex items-center justify-between mb-3.5">
                <div className={cn(sectionTitleCls, "mb-0")}>Products ({totalProductCount})</div>
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {products.map((product) => {
                    const isComplete = product.onboarding_complete;
                    const productSlug = product.product_name.toLowerCase().replace(/\s+/g, "");
                    const missingSections = isComplete
                      ? []
                      : getIncompleteSections(
                          product.product_name,
                          (product.onboarding_data as Record<string, unknown>) ?? {}
                        );
                    const highlights = getProductHighlights(product);
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
                              className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold ${PRODUCT_ICON_CLASSES[product.product_name] ?? "text-slate-400 bg-slate-100"}`}
                            >
                              {product.product_name[0]}
                            </div>
                            <span className="text-sm font-bold text-slate-900">{product.product_name}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleOpenEditProduct(product)}
                              className="text-[11px] font-medium text-slate-400 hover:text-brand transition-colors px-2 py-1 rounded bg-transparent border-none cursor-pointer"
                              title="Edit product metadata"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => { setRemoveProductError(null); setRemoveProduct(product); }}
                              className="text-[11px] font-medium text-slate-400 hover:text-red-500 transition-colors px-2 py-1 rounded bg-transparent border-none cursor-pointer"
                              title="Remove product"
                            >
                              Remove
                            </button>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 mb-3">
                          <div className="flex-1 h-1.25 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className={cn(
                                "h-full rounded-full transition-[width] duration-300",
                                isComplete ? "bg-green-500" : (PRODUCT_BAR_CLASSES[product.product_name] ?? "bg-slate-400")
                              )}
                              style={{ width: `${product.completed_percentage ?? 0}%` }}
                            />
                          </div>
                          <span className="text-[11px] text-slate-400">
                            {Math.round(product.completed_percentage ?? 0)}%
                          </span>
                          <span
                            className={cn(
                              "inline-block px-2 py-px rounded text-[11px] font-semibold",
                              isComplete ? "bg-green-50 text-green-600" : "bg-[#FFF4EC] text-orange-500"
                            )}
                          >
                            {isComplete ? "Complete" : "In Progress"}
                          </span>
                        </div>

                        {missingSections.length > 0 && (
                          <div className="text-[11px] text-slate-400 mb-2 leading-snug">
                            <span className="text-orange-400 font-medium">Missing: </span>
                            {missingSections.slice(0, 3).join(", ")}
                            {missingSections.length > 3 ? ` +${missingSections.length - 3} more` : ""}
                          </div>
                        )}

                        {highlights.length > 0 && (
                          <div className="mt-2 mb-2 pt-2 border-t border-slate-100">
                            <div className="text-[10px] font-bold text-slate-400 tracking-[0.06em] uppercase mb-1.5">Onboarding Highlights</div>
                            <div className="flex flex-col gap-1">
                              {highlights.map(h => (
                                <div key={h.label} className="flex gap-1.5 text-[11px]">
                                  <span className="text-slate-400 shrink-0">{h.label}:</span>
                                  <span className="text-slate-700 truncate">{h.value}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="flex flex-col gap-1.5 text-xs">
                          {product.dedicated_developers && product.dedicated_developers.length > 0 ? (
                            <div className="text-[11px] text-slate-500">
                              Dedicated devs: {product.dedicated_developers.length}
                            </div>
                          ) : (
                            <div className="text-[11px] text-slate-400">No dedicated developers</div>
                          )}
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

                        <div className="flex flex-col gap-1 mt-3">
                          {!isComplete && (
                            <a
                              href={`/onboard/${customer.customer_id}/${productSlug}`}
                              className="text-xs text-brand font-semibold no-underline"
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              View Onboarding Form →
                            </a>
                          )}
                          <button
                            onClick={() => setViewingResponsesInline(product)}
                            className="text-xs text-brand font-semibold text-left bg-transparent border-none cursor-pointer p-0"
                          >
                            View Responses →
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {/* CiteForge add-on card */}
                  {hasCiteForge && (
                    <div className="rounded-[10px] p-4 border border-sky-100 bg-sky-50/20">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold bg-[#0EA5E918] text-[#0EA5E9] shrink-0">
                          Ci
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-bold text-slate-900">CiteForge</span>
                            <span className="text-[10px] text-slate-400 font-medium">Add-on to StackShift</span>
                          </div>
                        </div>
                        <span className="inline-block px-2 py-px rounded text-[11px] font-semibold bg-sky-50 text-sky-600 shrink-0">
                          Enabled
                        </span>
                      </div>
                      <p className="mt-3 text-[11px] text-slate-400 leading-snug">
                        Citation management is included as part of the StackShift onboarding.
                      </p>
                    </div>
                  )}
                </div>
              )}
              </>
              )}
            </div>
            </>
          )}

          {/* Assets */}
          {activeSection === "assets" && (
            <div className={sectionCls}>
              <div className="flex items-center justify-between mb-3.5">
                <div className={cn(sectionTitleCls, "mb-0")}>Assets ({assets.length})</div>
                <button
                  onClick={() => { setAddAssetError(null); setShowAddAsset(true); }}
                  className="text-[11px] font-semibold text-brand border border-brand/30 rounded-full px-3 py-1 hover:bg-brand/5 transition-colors cursor-pointer bg-transparent"
                >
                  + Add Asset
                </button>
              </div>
              {assetsLoading ? (
                <div className="text-[13px] text-slate-400 text-center py-6">Loading…</div>
              ) : assets.length === 0 ? (
                <div className="text-[13px] text-slate-400 text-center py-6 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                  No assets yet.{" "}
                  <button
                    onClick={() => { setAddAssetError(null); setShowAddAsset(true); }}
                    className="text-brand bg-transparent border-none cursor-pointer p-0 text-[13px]"
                  >
                    Add one
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {assets.map(asset => {
                    const isRevealed = revealedAssets.has(asset.id);
                    const displayValue = asset.masked && !isRevealed ? "••••••••" : asset.value;
                    return (
                      <div key={asset.id} className="flex items-center gap-3 py-2.5 px-3 rounded-lg border border-slate-100 bg-slate-50/50">
                        <span className={cn("text-[10px] font-bold rounded px-1.5 py-px shrink-0", ASSET_TYPE_CLASSES[asset.type])}>
                          {ASSET_TYPE_LABELS[asset.type]}
                        </span>
                        <span className="text-[12px] font-semibold text-slate-700 shrink-0 min-w-20">{asset.label}</span>
                        <span className="text-[12px] text-slate-500 font-mono flex-1 truncate">{displayValue}</span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {asset.masked && (
                            <button
                              onClick={() => setRevealedAssets(prev => {
                                const next = new Set(prev);
                                isRevealed ? next.delete(asset.id) : next.add(asset.id);
                                return next;
                              })}
                              className="text-[11px] font-medium text-slate-400 hover:text-brand transition-colors px-1.5 py-0.5 rounded bg-transparent border-none cursor-pointer"
                            >
                              {isRevealed ? "Hide" : "Show"}
                            </button>
                          )}
                          {(asset.type === "link" || asset.type === "file") && (
                            <a
                              href={asset.value}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[11px] font-medium text-brand hover:opacity-70 transition-opacity"
                            >
                              Open
                            </a>
                          )}
                          <button
                            onClick={() => handleDeleteAsset(asset.id)}
                            className="text-[11px] font-medium text-slate-400 hover:text-red-500 transition-colors px-1.5 py-0.5 rounded bg-transparent border-none cursor-pointer"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Activity */}
          {activeSection === "activity" && (
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
          )}

          {/* Settings */}
          {activeSection === "settings" && (
            <div className={sectionCls}>
              <div className={sectionTitleCls}>Settings</div>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-x-6 gap-y-3">
                <div>
                  <div className="text-[11px] text-slate-400 mb-0.5">Communication Tone</div>
                  <div className="text-[13px] font-medium">
                    <span className={cn(
                      "inline-block px-2 py-0.5 rounded text-[11px] font-semibold",
                      customer.communication_tone === "formal" ? "bg-blue-50 text-blue-600" :
                      customer.communication_tone === "technical" ? "bg-purple-50 text-purple-600" :
                      customer.communication_tone === "casual" ? "bg-green-50 text-green-600" :
                      "bg-slate-100 text-slate-500"
                    )}>
                      {customer.communication_tone || "Not set"}
                    </span>
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-400 mb-0.5">Automation</div>
                  <div className="text-[13px] font-medium">
                    <span className={cn(
                      "inline-block px-2 py-0.5 rounded text-[11px] font-semibold",
                      customer.automation_toggle ? "bg-green-50 text-green-600" : "bg-slate-100 text-slate-500"
                    )}>
                      {customer.automation_toggle ? "ON" : "OFF"}
                    </span>
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-400 mb-0.5">LLM Pipeline</div>
                  <div className="text-[13px] font-medium">
                    <span className={cn(
                      "inline-block px-2 py-0.5 rounded text-[11px] font-semibold",
                      customer.llm_excluded ? "bg-red-50 text-red-600" : "bg-green-50 text-green-600"
                    )}>
                      {customer.llm_excluded ? "Human Only" : "AI Enabled"}
                    </span>
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-400 mb-0.5">Daily Token Budget</div>
                  <div className="text-[13px] text-slate-900 font-medium">
                    {customer.daily_token_budget != null ? customer.daily_token_budget.toLocaleString() : "Unlimited"}
                  </div>
                </div>
                {customer.automation_paused && (
                  <div>
                    <div className="text-[11px] text-slate-400 mb-0.5">Circuit Breaker</div>
                    <div className="text-[13px] font-medium">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-50 text-amber-600">
                        ⚠ Automation Paused
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
      </div>
    </>
  );
}

function ResponsesView({ product }: { product: CustomerProductRow }) {
  const schema = getOnboardingSchema(product.product_name);
  const data = (product.onboarding_data as Record<string, unknown>) ?? {};

  if (!schema) {
    return <p className="text-[13px] text-slate-400">No schema found for {product.product_name}.</p>;
  }

  if (Object.keys(data).length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-[13px] text-slate-400">No responses saved yet.</p>
      </div>
    );
  }

  const visibleSections = schema.sections.filter(s => {
    if (!s.condition) return true;
    return String(data[s.condition.field]) === String(s.condition.value);
  });

  return (
    <>
      {visibleSections.map(section => (
        <div key={section.id}>
          <div className="text-[10px] font-bold text-slate-400 tracking-[0.06em] uppercase mb-3">
            {section.title}
          </div>
          <div className="flex flex-col">
            {section.fields
              .filter(field => {
                if (!field.condition) return true;
                return String(data[field.condition.field]) === String(field.condition.value);
              })
              .map(field => {
                const value = data[field.name];
                const displayValue =
                  value === undefined || value === null || value === ""
                    ? "—"
                    : typeof value === "boolean"
                      ? (value ? "Yes" : "No")
                      : String(value);
                return (
                  <div key={field.name} className="flex gap-3 py-2 border-b border-slate-50 last:border-0">
                    <span className="text-[11px] text-slate-400 w-44 shrink-0 pt-px">{field.label}</span>
                    <span className="text-[13px] text-slate-800 font-medium flex-1 break-words">{displayValue}</span>
                  </div>
                );
              })}
          </div>
        </div>
      ))}
    </>
  );
}
