"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { AlertTriangle, Archive, ArrowLeft } from "lucide-react";
import type { UploadedFile } from "@/types/onboarding";
import FileUpload from "@/components/onboarding/file-upload";
import { usePMSettings } from "@/hooks/use-pm-settings";
import type { CustomerRow, CustomerProductRow, ProjectRow, Database } from "@/types/database";
import type { ProductName } from "@/types/hub";
import { getIncompleteSections, getOnboardingSchema, computeCompletionPercentage } from "@/config/onboarding-schemas";
import { V2_ROUTES } from "@/config/constants";

type ClassificationRow = Database["public"]["Tables"]["classification_records"]["Row"];
type AssetRow = Database["public"]["Tables"]["customer_assets"]["Row"];
type CustomerDeskContact = Pick<
  Database["public"]["Tables"]["contacts"]["Row"],
  "id" | "first_name" | "last_name" | "email" | "secondary_email" | "phone" | "mobile" | "title"
>;
type NavSection = "company" | "contact" | "products" | "assets" | "activity" | "projects" | "settings";

interface CustomerProfileClientProps {
  customer: CustomerRow & { customer_products: CustomerProductRow[] };
  zohoPortalId: string;
  zohoPortalName: string;
}

const STATUS_CLS_LIGHT: Record<string, string> = {
  onboarding:            "bg-orange-50 text-orange-600",
  active:                "bg-green-50 text-green-600",
  inactive:              "bg-slate-100 text-slate-500",
  completed_onboarding:  "bg-amber-50 text-amber-600",
};
const STATUS_CLS_DARK: Record<string, string> = {
  onboarding:            "text-orange-400 bg-orange-500/15",
  active:                "text-green-400 bg-green-500/15",
  inactive:              "text-slate-400 bg-slate-500/15",
  completed_onboarding:  "text-amber-400 bg-amber-500/15",
};
const statusClass = (status: string, isDark: boolean) =>
  (isDark ? STATUS_CLS_DARK : STATUS_CLS_LIGHT)[status]
  ?? (isDark ? "text-slate-400 bg-slate-500/15" : "bg-slate-100 text-slate-500");

const statusLabel = (status: string) => {
  const map: Record<string, string> = {
    onboarding: "Onboarding",
    active: "Active",
    inactive: "Inactive",
    completed_onboarding: "Completed Onboarding",
  };
  return map[status] ?? status.charAt(0).toUpperCase() + status.slice(1);
};

const PROJECT_TYPES = ["Content Site", "Ecommerce (B2C)", "Ecommerce (B2B)", "Custom App"] as const;
const PROJECT_TYPE_SUFFIXES: Record<string, string> = {
  "Content Site":    "Content Site",
  "Ecommerce (B2C)": "Ecommerce",
  "Ecommerce (B2B)": "Ecommerce B2B",
  "Custom App":      "App",
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

const sectionTitleCls = "text-[10px] font-bold text-slate-400 tracking-[0.06em] uppercase mb-3.5";
const inputCls = "font-[inherit] w-full text-sm py-2.5 px-3.5 border border-slate-200 rounded-lg text-slate-900 bg-white outline-none transition-[border-color,box-shadow] duration-200 focus:border-brand focus:shadow-[0_0_0_3px_rgba(51,88,244,0.1)]";
const labelCls = "block text-xs font-semibold text-slate-600 mb-1.5";

const ASSET_TYPE_LABELS: Record<AssetRow["type"], string> = { file: "FILE", link: "LINK", credential: "CRED" };
const ASSET_TYPE_CLS_LIGHT: Record<AssetRow["type"], string> = {
  file:       "bg-sky-50 text-sky-600",
  link:       "bg-indigo-50 text-indigo-600",
  credential: "bg-amber-50 text-amber-600",
};
const ASSET_TYPE_CLS_DARK: Record<AssetRow["type"], string> = {
  file:       "text-sky-400 bg-sky-500/15",
  link:       "text-indigo-400 bg-indigo-500/15",
  credential: "text-amber-400 bg-amber-500/15",
};
const assetTypeCls = (type: AssetRow["type"], isDark: boolean) =>
  (isDark ? ASSET_TYPE_CLS_DARK : ASSET_TYPE_CLS_LIGHT)[type];

// Matches the upload route's MIME allowlist + customer-assets bucket limit
// (src/app/api/customers/[customerId]/assets/upload/route.ts).
const ASSET_TYPE_HELP: Record<AssetRow["type"], string> = {
  link: "e.g. staging URL, admin dashboard, documentation page.",
  file: "Accepted: images, PDF, Word docs, Excel spreadsheets — up to 25MB.",
  credential: "e.g. payment API keys, DNS registrar access, CMS admin login. Store references only (e.g. LastPass item name, vault path) — not actual passwords or API keys.",
};

const ASSET_ROLE_OPTIONS = [
  { value: "super_admin", label: "Super Admin" },
  { value: "admin", label: "Admin" },
  { value: "pm", label: "PM" },
  { value: "developer", label: "Developer" },
] as const;
const ASSET_ROLE_LABELS: Record<string, string> = Object.fromEntries(ASSET_ROLE_OPTIONS.map(r => [r.value, r.label]));
const isValidAssetUrl = (v: string) => /^https?:\/\//i.test(v.trim());

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
  const { settings } = usePMSettings();
  const isDark = settings.theme === "dark";
  const sectionCls = isDark
    ? "bg-[#121726] border border-white/[0.08] rounded-xl p-5 shadow-[0_1px_4px_rgba(0,0,0,0.15)] mb-4"
    : "bg-white border border-slate-200 rounded-xl p-5 shadow-[0_1px_4px_rgba(0,0,0,0.05)] mb-4";
  const textPrimary = isDark ? "text-slate-200" : "text-slate-900";
  const tabBorder = isDark ? "border-b border-white/[0.08]" : "border-b border-slate-200";
  const [copied, setCopied] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [classifications, setClassifications] = useState<ClassificationRow[]>([]);
  const [activeSection, setActiveSection] = useState<NavSection>("company");

  // Edit product metadata modal
  const [editProduct, setEditProduct] = useState<CustomerProductRow | null>(null);
  const [editProductForm, setEditProductForm] = useState({ product_instance_id: "" });
  const [editProductSaving, setEditProductSaving] = useState(false);
  const [editProductError, setEditProductError] = useState<string | null>(null);

  const [editProject, setEditProject] = useState<ProjectRow | null>(null);
  const [editProjectForm, setEditProjectForm] = useState({ project_name: "", project_type: "", zoho_project_id: "", sanity_project_id: "", github_repo: "", dedicated_developers: "" });
  const [editProjectSaving, setEditProjectSaving] = useState(false);
  const [editProjectError, setEditProjectError] = useState<string | null>(null);

  // Add product modal
  const [addProductOpen, setAddProductOpen] = useState(false);
  const [addProductForm, setAddProductForm] = useState({ product_name: "", product_instance_id: "" });
  const [addProductSaving, setAddProductSaving] = useState(false);
  const [addProductError, setAddProductError] = useState<string | null>(null);

  // Archive product confirmation (soft-delete)
  const [archiveProduct, setArchiveProduct] = useState<CustomerProductRow | null>(null);
  const [archiveProductSaving, setArchiveProductSaving] = useState(false);
  const [archiveProductError, setArchiveProductError] = useState<string | null>(null);

  // Edit onboarding responses (PM-side, active products only)
  const [editResponses, setEditResponses] = useState<CustomerProductRow | null>(null);
  const [editResponsesData, setEditResponsesData] = useState<Record<string, unknown>>({});
  const [editResponsesSaving, setEditResponsesSaving] = useState(false);
  const [editResponsesError, setEditResponsesError] = useState<string | null>(null);

  // Products sub-tab: active vs archived
  const [productTab, setProductTab] = useState<"active" | "archived">("active");

  // View onboarding responses inline
  const [viewingResponsesInline, setViewingResponsesInline] = useState<CustomerProductRow | null>(null);

  // Reopen onboarding
  const [reopening, setReopening] = useState(false);
  const [reopenError, setReopenError] = useState<string | null>(null);

  // Projects tab
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const hasFetchedProjectsRef = useRef(false);
  const [addProjectDialogOpen, setAddProjectDialogOpen] = useState(false);
  const [addProjectForm, setAddProjectForm] = useState({
    project_type: "", project_name: "", zoho_project_id: "",
    sanity_project_id: "", github_repo: "", dedicated_developers: "",
  });
  const [addProjectCreating, setAddProjectCreating] = useState(false);
  const [addProjectError, setAddProjectError] = useState<string | null>(null);
  const [createZohoWithProject, setCreateZohoWithProject] = useState(false);

  // Assets
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const hasFetchedAssetsRef = useRef(false);
  const [showAddAsset, setShowAddAsset] = useState(false);
  const [addAssetForm, setAddAssetForm] = useState<{
    type: AssetRow["type"];
    label: string;
    value: string;
    masked: boolean;
    fields: { label: string; value: string }[];
    allowedRoles: string[];
  }>({
    type: "link", label: "", value: "", masked: false, fields: [{ label: "", value: "" }], allowedRoles: [],
  });
  const [addAssetFile, setAddAssetFile] = useState<File | null>(null);
  const [addAssetSaving, setAddAssetSaving] = useState(false);
  const [addAssetError, setAddAssetError] = useState<string | null>(null);
  const [revealedAssets, setRevealedAssets] = useState<Set<string>>(new Set());
  const [openingAssetId, setOpeningAssetId] = useState<string | null>(null);

  // Desk Contacts (Zoho Desk, matched — task 117/119)
  const [deskContacts, setDeskContacts] = useState<CustomerDeskContact[]>([]);
  const [deskContactsLoading, setDeskContactsLoading] = useState(false);
  const hasFetchedDeskContactsRef = useRef(false);

  useEffect(() => {
    if (activeSection !== "contact" || hasFetchedDeskContactsRef.current) return;
    hasFetchedDeskContactsRef.current = true;
    setDeskContactsLoading(true);
    fetch(`/api/customers/${customer.customer_id}/contacts`)
      .then((r) => r.json())
      .then((data: unknown) => setDeskContacts(Array.isArray(data) ? (data as CustomerDeskContact[]) : []))
      .catch(() => {})
      .finally(() => setDeskContactsLoading(false));
  }, [activeSection, customer.customer_id]);

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
    if (activeSection !== "projects" || hasFetchedProjectsRef.current) return;
    hasFetchedProjectsRef.current = true;
    setProjectsLoading(true);
    fetch(`/api/customers/${customer.customer_id}/projects`)
      .then(r => r.json())
      .then((data: unknown) => setProjects(Array.isArray(data) ? (data as ProjectRow[]) : []))
      .catch(() => {})
      .finally(() => setProjectsLoading(false));
  }, [activeSection, customer.customer_id]);

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
    setEditProductForm({ product_instance_id: product.product_instance_id ?? "" });
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

  const handleOpenEditProject = (proj: ProjectRow) => {
    setEditProjectForm({
      project_name: proj.name,
      project_type: proj.project_type,
      zoho_project_id: proj.zoho_project_id ?? "",
      sanity_project_id: proj.sanity_project_id ?? "",
      github_repo: proj.github_repo ?? "",
      dedicated_developers: proj.dedicated_developers.join(", "),
    });
    setEditProjectError(null);
    setEditProject(proj);
  };

  const handleSaveProject = async () => {
    if (!editProject) return;
    setEditProjectSaving(true);
    setEditProjectError(null);
    try {
      const res = await fetch(
        `/api/customers/${customer.customer_id}/projects/${editProject.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            project_name: editProjectForm.project_name,
            project_type: editProjectForm.project_type,
            sanity_project_id: editProjectForm.sanity_project_id || null,
            github_repo: editProjectForm.github_repo || null,
            dedicated_developers: editProjectForm.dedicated_developers
              .split(",")
              .map(s => s.trim())
              .filter(Boolean),
          }),
        }
      );
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? "Save failed");
      }
      const updated = await res.json();
      setProjects(prev => prev.map(p => p.id === updated.id ? updated : p));
      if (updated.zoho_rename_failed) {
        setEditProjectError("Saved, but Zoho rename failed. Update Zoho manually.");
        return;
      }
      setEditProject(null);
    } catch (err) {
      setEditProjectError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setEditProjectSaving(false);
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
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? "Failed to add product");
      }
      setAddProductOpen(false);
      setAddProductForm({ product_name: "", product_instance_id: "" });
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

  // Primary Contact select/deselect (task 120) — writes into the same customers.contact_name/
  // contact_email fields the Edit modal above already uses; no new schema.
  const [primaryContactSavingId, setPrimaryContactSavingId] = useState<string | null>(null);
  const [primaryContactError, setPrimaryContactError] = useState<string | null>(null);

  function isPrimaryContact(contact: CustomerDeskContact): boolean {
    return !!customer.contact_email && !!contact.email &&
      customer.contact_email.trim().toLowerCase() === contact.email.trim().toLowerCase();
  }

  async function patchPrimaryContact(contactName: string | null, contactEmail: string | null) {
    try {
      const res = await fetch(`/api/customers/${customer.customer_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contact_name: contactName, contact_email: contactEmail }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? "Failed to update primary contact");
      }
      router.refresh();
    } catch (err) {
      setPrimaryContactError(err instanceof Error ? err.message : "Failed to update primary contact");
    }
  }

  const handleSetPrimaryContact = async (contact: CustomerDeskContact) => {
    setPrimaryContactSavingId(contact.id);
    setPrimaryContactError(null);
    const fullName = [contact.first_name, contact.last_name].filter(Boolean).join(" ") || null;
    await patchPrimaryContact(fullName, contact.email ?? null);
    setPrimaryContactSavingId(null);
  };

  const handleRemovePrimaryContact = async (contactId: string) => {
    setPrimaryContactSavingId(contactId);
    setPrimaryContactError(null);
    await patchPrimaryContact(null, null);
    setPrimaryContactSavingId(null);
  };

  const handleArchiveProduct = async () => {
    if (!archiveProduct) return;
    setArchiveProductSaving(true);
    setArchiveProductError(null);
    try {
      const res = await fetch(
        `/api/customers/${customer.customer_id}/products/${encodeURIComponent(archiveProduct.product_name)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "archived" }),
        }
      );
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? "Failed to archive product");
      }
      setArchiveProduct(null);
      router.refresh();
    } catch (err) {
      setArchiveProductError(err instanceof Error ? err.message : "Failed to archive product");
    } finally {
      setArchiveProductSaving(false);
    }
  };

  const handleRestoreProduct = async (product: CustomerProductRow) => {
    try {
      const res = await fetch(
        `/api/customers/${customer.customer_id}/products/${encodeURIComponent(product.product_name)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "active" }),
        }
      );
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? "Failed to restore product");
      }
      router.refresh();
    } catch (err) {
      console.error("Restore product error:", err);
    }
  };

  const handleSaveResponses = async () => {
    if (!editResponses) return;
    setEditResponsesSaving(true);
    setEditResponsesError(null);
    try {
      const res = await fetch(
        `/api/customers/${customer.customer_id}/products/${editResponses.product_name}/onboarding`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data: editResponsesData }),
        }
      );
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? "Save failed");
      }
      setEditResponses(null);
      router.refresh();
    } catch (err) {
      setEditResponsesError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setEditResponsesSaving(false);
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

  const handleGenerateProjectName = () => {
    if (!addProjectForm.project_type) return;
    const suffix = PROJECT_TYPE_SUFFIXES[addProjectForm.project_type] ?? addProjectForm.project_type;
    setAddProjectForm(f => ({ ...f, project_name: `${customer.company_name} ${suffix}` }));
  };

  const handleAddProjectSubmit = async () => {
    if (!addProjectForm.project_name.trim() || !addProjectForm.project_type) {
      setAddProjectError("Project name and type are required.");
      return;
    }
    setAddProjectCreating(true);
    setAddProjectError(null);
    try {
      const res = await fetch(`/api/customers/${customer.customer_id}/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_name: addProjectForm.project_name,
          project_type: addProjectForm.project_type,
          zoho_project_id: addProjectForm.zoho_project_id || null,
          sanity_project_id: addProjectForm.sanity_project_id || null,
          github_repo: addProjectForm.github_repo || null,
          dedicated_developers: addProjectForm.dedicated_developers
            ? addProjectForm.dedicated_developers.split(",").map(s => s.trim()).filter(Boolean)
            : [],
          create_zoho_project: createZohoWithProject,
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? "Failed to create project");
      }
      const payload = await res.json();
      const { zoho_creation_failed, ...newProject } = payload as ProjectRow & { zoho_creation_failed?: boolean };
      setProjects(p => [newProject, ...p]);
      setAddProjectDialogOpen(false);
      setAddProjectForm({ project_type: "", project_name: "", zoho_project_id: "",
                          sanity_project_id: "", github_repo: "", dedicated_developers: "" });
      setCreateZohoWithProject(false);
      if (zoho_creation_failed) {
        setAddProjectError("Project saved, but Zoho project creation failed — check ZOHO_PORTAL_ID and token config.");
        setAddProjectDialogOpen(true);
      }
      router.refresh();
    } catch (err) {
      setAddProjectError(err instanceof Error ? err.message : "Failed to create project");
    } finally {
      setAddProjectCreating(false);
    }
  };

  const isAddAssetValid =
    addAssetForm.label.trim().length > 0 &&
    (addAssetForm.type === "link"
      ? addAssetForm.value.trim().length > 0 && isValidAssetUrl(addAssetForm.value)
      : addAssetForm.type === "credential"
      ? addAssetForm.fields.some(f => f.label.trim() && f.value.trim())
      : addAssetForm.type === "file"
      ? addAssetFile !== null
      : false);

  const handleAddAsset = async () => {
    if (!isAddAssetValid) return;
    setAddAssetSaving(true);
    setAddAssetError(null);
    try {
      let filePayload: { file_path: string; file_name: string; file_size: number; file_mime_type: string } | null = null;

      if (addAssetForm.type === "file") {
        if (!addAssetFile) throw new Error("Please choose a file");
        const formData = new FormData();
        formData.append("file", addAssetFile);
        const uploadRes = await fetch(`/api/customers/${customer.customer_id}/assets/upload`, {
          method: "POST",
          body: formData,
        });
        if (!uploadRes.ok) {
          const json = await uploadRes.json().catch(() => ({}));
          throw new Error(json.error ?? "Failed to upload file");
        }
        const uploaded = await uploadRes.json();
        filePayload = {
          file_path: uploaded.path,
          file_name: uploaded.filename,
          file_size: uploaded.size,
          file_mime_type: uploaded.mimeType,
        };
      }

      const cleanFields = addAssetForm.fields
        .map(f => ({ label: f.label.trim(), value: f.value.trim() }))
        .filter(f => f.label && f.value);

      const body = {
        type: addAssetForm.type,
        label: addAssetForm.label.trim(),
        masked: addAssetForm.masked,
        allowed_roles: addAssetForm.allowedRoles,
        ...(addAssetForm.type === "link" ? { value: addAssetForm.value.trim() } : {}),
        ...(addAssetForm.type === "credential" ? { fields: cleanFields } : {}),
        ...(addAssetForm.type === "file" && filePayload ? filePayload : {}),
      };

      const res = await fetch(`/api/customers/${customer.customer_id}/assets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? "Failed to add asset");
      }
      const newAsset: AssetRow = await res.json();
      setAssets(prev => [...prev, newAsset]);
      setShowAddAsset(false);
      setAddAssetForm({ type: "link", label: "", value: "", masked: false, fields: [{ label: "", value: "" }], allowedRoles: [] });
      setAddAssetFile(null);
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

  const handleOpenAssetFile = async (id: string) => {
    setOpeningAssetId(id);
    try {
      const res = await fetch(`/api/customers/${customer.customer_id}/assets/${id}/file-url`);
      if (!res.ok) throw new Error("Failed to get file URL");
      const { url } = await res.json();
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      // best-effort — matches handleDeleteAsset's existing silent-failure precedent
    } finally {
      setOpeningAssetId(null);
    }
  };

  const status = customer.status ?? "onboarding";
  const products = customer.customer_products ?? [];
  const activeProducts = products.filter(p => p.status !== "archived");
  const archivedProducts = products.filter(p => p.status === "archived");
  const assignedNames = products.map(p => p.product_name);
  const availableProducts = ALL_PRODUCTS.filter(p => !assignedNames.includes(p));
  const metadata = extractMetadata(products);

  const stackshiftProduct = products.find(p => p.product_name === "StackShift");
  const hasCiteForge = (stackshiftProduct?.onboarding_data as Record<string, unknown>)?.includeCiteForge === "Yes";
  const totalProductCount = activeProducts.length + (hasCiteForge ? 1 : 0);

  const navItems: { id: NavSection; label: string }[] = [
    { id: "company", label: "Company Info" },
    { id: "contact", label: "Primary Contact" },
    { id: "products", label: `Products (${totalProductCount})` },
    { id: "assets", label: "Assets" },
    { id: "projects", label: `Projects (${projects.length})` },
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

      {/* Edit Project Modal */}
      {editProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-130 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div>
                <h2 className="text-base font-bold text-slate-900">Edit Project</h2>
                <p className="text-xs text-slate-400 mt-0.5">{editProject.name}</p>
              </div>
              <button
                onClick={() => setEditProject(null)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors border-none bg-transparent cursor-pointer text-lg leading-none"
              >
                ×
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className={labelCls}>Project Name</label>
                <input
                  type="text"
                  value={editProjectForm.project_name}
                  onChange={e => setEditProjectForm(f => ({ ...f, project_name: e.target.value }))}
                  className={inputCls}
                  placeholder="e.g. My Ecommerce Site"
                />
              </div>
              <div>
                <label className={labelCls}>Project Type</label>
                <select
                  value={editProjectForm.project_type}
                  onChange={e => setEditProjectForm(f => ({ ...f, project_type: e.target.value }))}
                  className={inputCls}
                >
                  {PROJECT_TYPES.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Zoho Project ID</label>
                <p className="text-sm text-slate-500 py-2.5 px-3.5 border border-slate-100 rounded-lg bg-slate-50 font-mono">
                  {editProjectForm.zoho_project_id || <span className="text-slate-300 font-sans">Not linked</span>}
                </p>
              </div>
              <div>
                <label className={labelCls}>Sanity Project ID</label>
                <input
                  type="text"
                  value={editProjectForm.sanity_project_id}
                  onChange={e => setEditProjectForm(f => ({ ...f, sanity_project_id: e.target.value }))}
                  className={inputCls}
                  placeholder="e.g. abc12def"
                />
              </div>
              <div>
                <label className={labelCls}>GitHub Repo</label>
                <input
                  type="text"
                  value={editProjectForm.github_repo}
                  onChange={e => setEditProjectForm(f => ({ ...f, github_repo: e.target.value }))}
                  className={inputCls}
                  placeholder="owner/repo"
                />
              </div>
              <div>
                <label className={labelCls}>Dedicated Developers (comma-separated)</label>
                <input
                  type="text"
                  value={editProjectForm.dedicated_developers}
                  onChange={e => setEditProjectForm(f => ({ ...f, dedicated_developers: e.target.value }))}
                  className={inputCls}
                  placeholder="e.g. dev1@example.com, dev2@example.com"
                />
              </div>
              {editProjectError && (
                <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                  {editProjectError}
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2.5 px-6 py-4 border-t border-slate-100 bg-slate-50/50">
              <button
                onClick={() => setEditProject(null)}
                className="py-2 px-4 bg-transparent text-slate-600 text-sm font-medium border border-slate-200 rounded-full cursor-pointer hover:border-slate-300 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveProject}
                disabled={editProjectSaving}
                className="py-2 px-5 bg-brand text-white text-sm font-semibold border-none rounded-full cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-60"
              >
                {editProjectSaving ? "Saving…" : "Save Changes"}
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

      {/* Archive Product Confirmation Modal */}
      {archiveProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-105 overflow-hidden">
            <div className="px-6 pt-6 pb-4">
              <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center mb-4">
                <Archive className="w-5 h-5 text-amber-500" />
              </div>
              <h2 className="text-base font-bold text-slate-900 mb-1">Archive {archiveProduct.product_name}?</h2>
              <p className="text-sm text-slate-500">
                This will archive <strong>{archiveProduct.product_name}</strong> for{" "}
                <strong>{customer.company_name}</strong>. All onboarding data is preserved and the
                product can be restored from the Archived tab at any time.
              </p>
              {archiveProductError && (
                <p className="mt-3 text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                  {archiveProductError}
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2.5 px-6 py-4 border-t border-slate-100 bg-slate-50/50">
              <button
                onClick={() => { setArchiveProduct(null); setArchiveProductError(null); }}
                disabled={archiveProductSaving}
                className="py-2 px-4 bg-transparent text-slate-600 text-sm font-medium border border-slate-200 rounded-full cursor-pointer hover:border-slate-300 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleArchiveProduct}
                disabled={archiveProductSaving}
                className="py-2 px-5 bg-amber-500 text-white text-sm font-semibold border-none rounded-full cursor-pointer hover:bg-amber-600 transition-colors disabled:opacity-60"
              >
                {archiveProductSaving ? "Archiving…" : "Archive Product"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Onboarding Responses Modal */}
      {editResponses && (() => {
        const schema = getOnboardingSchema(editResponses.product_name);
        if (!schema) return null;
        const visibleSections = schema.sections.filter(s => {
          if (!s.condition) return true;
          return String(editResponsesData[s.condition.field]) === String(s.condition.value);
        });
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl overflow-hidden flex flex-col max-h-[90vh]">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
                <div>
                  <h2 className="text-base font-bold text-slate-900">Edit Responses</h2>
                  <p className="text-[11px] text-slate-400 mt-0.5">{editResponses.product_name}</p>
                </div>
                <button
                  onClick={() => { setEditResponses(null); setEditResponsesError(null); }}
                  disabled={editResponsesSaving}
                  className="text-slate-400 hover:text-slate-600 bg-transparent border-none cursor-pointer p-1 disabled:opacity-50"
                >
                  ✕
                </button>
              </div>
              <div className="overflow-y-auto flex-1 px-6 py-4 space-y-6">
                {visibleSections.map(section => (
                  <div key={section.id}>
                    <div className="text-[10px] font-bold text-slate-400 tracking-[0.06em] uppercase mb-3">{section.title}</div>
                    <div className="space-y-3">
                      {section.fields
                        .filter(field => {
                          if (!field.condition) return true;
                          return String(editResponsesData[field.condition.field]) === String(field.condition.value);
                        })
                        .map(field => (
                          <div key={field.name}>
                            <label className={labelCls}>{field.label}</label>
                            {field.type === "file" ? (
                              <FileUpload
                                fieldName={field.name}
                                customerId={customer.customer_id}
                                productName={editResponses.product_name}
                                value={editResponsesData[field.name]}
                                onChange={(file) => setEditResponsesData(prev => ({ ...prev, [field.name]: file }))}
                              />
                            ) : field.type === "textarea" ? (
                              <textarea
                                value={String(editResponsesData[field.name] ?? "")}
                                onChange={e => setEditResponsesData(prev => ({ ...prev, [field.name]: e.target.value }))}
                                rows={3}
                                className={cn(inputCls, "resize-y")}
                                placeholder={field.placeholder ?? ""}
                              />
                            ) : field.type === "select" ? (
                              <select
                                value={String(editResponsesData[field.name] ?? "")}
                                onChange={e => setEditResponsesData(prev => ({ ...prev, [field.name]: e.target.value }))}
                                className={inputCls}
                              >
                                <option value="">Select…</option>
                                {field.options?.map(opt => (
                                  <option key={opt} value={opt}>{opt}</option>
                                ))}
                              </select>
                            ) : field.type === "radio-group" ? (
                              <div className="flex flex-wrap gap-3 mt-1">
                                {field.options?.map(opt => (
                                  <label key={opt} className="flex items-center gap-1.5 cursor-pointer text-sm text-slate-700">
                                    <input
                                      type="radio"
                                      name={`edit-${field.name}`}
                                      value={opt}
                                      checked={editResponsesData[field.name] === opt}
                                      onChange={() => setEditResponsesData(prev => ({ ...prev, [field.name]: opt }))}
                                      className="accent-brand"
                                    />
                                    {opt}
                                  </label>
                                ))}
                              </div>
                            ) : field.type === "checkbox-group" ? (
                              <div className="flex flex-wrap gap-3 mt-1">
                                {field.options?.map(opt => {
                                  const selected = Array.isArray(editResponsesData[field.name])
                                    ? (editResponsesData[field.name] as string[])
                                    : [];
                                  return (
                                    <label key={opt} className="flex items-center gap-1.5 cursor-pointer text-sm text-slate-700">
                                      <input
                                        type="checkbox"
                                        checked={selected.includes(opt)}
                                        onChange={e => {
                                          const next = e.target.checked
                                            ? [...selected, opt]
                                            : selected.filter(v => v !== opt);
                                          setEditResponsesData(prev => ({ ...prev, [field.name]: next }));
                                        }}
                                        className="accent-brand w-4 h-4"
                                      />
                                      {opt}
                                    </label>
                                  );
                                })}
                              </div>
                            ) : (
                              <input
                                type={field.type === "url" ? "url" : "text"}
                                value={String(editResponsesData[field.name] ?? "")}
                                onChange={e => setEditResponsesData(prev => ({ ...prev, [field.name]: e.target.value }))}
                                className={inputCls}
                                placeholder={field.placeholder ?? ""}
                              />
                            )}
                          </div>
                        ))}
                    </div>
                  </div>
                ))}
                {editResponsesError && (
                  <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                    {editResponsesError}
                  </p>
                )}
              </div>
              <div className="flex justify-end gap-2.5 px-6 py-4 border-t border-slate-100 bg-slate-50/50 shrink-0">
                <button
                  onClick={() => { setEditResponses(null); setEditResponsesError(null); }}
                  disabled={editResponsesSaving}
                  className="py-2 px-4 bg-transparent text-slate-600 text-sm font-medium border border-slate-200 rounded-full cursor-pointer hover:border-slate-300 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveResponses}
                  disabled={editResponsesSaving}
                  className="py-2 px-5 bg-brand text-white text-sm font-semibold border-none rounded-full cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-60"
                >
                  {editResponsesSaving ? "Saving…" : "Save Responses"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Add Project Dialog */}
      {addProjectDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-130 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div>
                <h2 className="text-base font-bold text-slate-900">Add Project</h2>
                <p className="text-xs text-slate-400 mt-0.5">{customer.company_name}</p>
              </div>
              <button
                onClick={() => { setAddProjectDialogOpen(false); setAddProjectError(null); }}
                className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors border-none bg-transparent cursor-pointer text-lg leading-none"
              >
                ×
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className={labelCls}>Project Type <span className="text-red-400">*</span></label>
                <select
                  value={addProjectForm.project_type}
                  onChange={e => setAddProjectForm(f => ({ ...f, project_type: e.target.value }))}
                  className={inputCls}
                >
                  <option value="">Select type…</option>
                  {PROJECT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Project Name <span className="text-red-400">*</span></label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={addProjectForm.project_name}
                    onChange={e => setAddProjectForm(f => ({ ...f, project_name: e.target.value }))}
                    className={cn(inputCls, "flex-1")}
                    placeholder="e.g. Acme Corp Content Site"
                  />
                  <button
                    onClick={handleGenerateProjectName}
                    disabled={!addProjectForm.project_type}
                    className="py-2 px-3 text-[11px] font-semibold text-brand border border-brand/30 rounded-lg hover:bg-brand/5 transition-colors cursor-pointer bg-transparent whitespace-nowrap disabled:opacity-40"
                  >
                    Generate
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>GitHub Repo</label>
                  <input
                    type="text"
                    value={addProjectForm.github_repo}
                    onChange={e => setAddProjectForm(f => ({ ...f, github_repo: e.target.value }))}
                    className={inputCls}
                    placeholder="https://github.com/org/repo"
                  />
                </div>
                <div>
                  <label className={labelCls}>Sanity Project ID</label>
                  <input
                    type="text"
                    value={addProjectForm.sanity_project_id}
                    onChange={e => setAddProjectForm(f => ({ ...f, sanity_project_id: e.target.value }))}
                    className={inputCls}
                    placeholder="abc123"
                  />
                </div>
              </div>
              <div>
                <label className={labelCls}>Dedicated Developers</label>
                <input
                  type="text"
                  value={addProjectForm.dedicated_developers}
                  onChange={e => setAddProjectForm(f => ({ ...f, dedicated_developers: e.target.value }))}
                  className={inputCls}
                  placeholder="dev1@webriq.com, dev2@webriq.com (comma-separated)"
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={createZohoWithProject}
                  onChange={e => setCreateZohoWithProject(e.target.checked)}
                  className="rounded border-slate-300"
                />
                Create Zoho Project now
              </label>
              {addProjectError && (
                <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                  {addProjectError}
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2.5 px-6 py-4 border-t border-slate-100 bg-slate-50/50">
              <button
                onClick={() => { setAddProjectDialogOpen(false); setAddProjectError(null); }}
                className="font-[inherit] py-2 px-4 bg-transparent text-slate-600 text-sm font-medium border border-slate-200 rounded-full cursor-pointer hover:border-slate-300 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddProjectSubmit}
                disabled={addProjectCreating}
                className="font-[inherit] py-2 px-5 bg-brand text-white text-sm font-semibold border-none rounded-full cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-60"
              >
                {addProjectCreating ? "Creating…" : "Add Project"}
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
                  onChange={e => {
                    const nextType = e.target.value as AssetRow["type"];
                    setAddAssetForm(f => ({
                      ...f,
                      type: nextType,
                      masked: nextType === "credential",
                      value: "",
                      fields: [{ label: "", value: "" }],
                    }));
                    setAddAssetFile(null);
                  }}
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

              {addAssetForm.type === "link" && (
                <div>
                  <label className={labelCls}>Value <span className="text-brand">*</span></label>
                  <input
                    type="url"
                    value={addAssetForm.value}
                    onChange={e => setAddAssetForm(f => ({ ...f, value: e.target.value }))}
                    className={inputCls}
                    placeholder="https://"
                  />
                  {addAssetForm.value.trim().length > 0 && !isValidAssetUrl(addAssetForm.value) && (
                    <p className="text-xs text-red-500 mt-1.5">Must start with http:// or https://</p>
                  )}
                </div>
              )}

              {addAssetForm.type === "file" && (
                <div>
                  <label className={labelCls}>File <span className="text-brand">*</span></label>
                  {addAssetFile ? (
                    <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 border border-slate-200 rounded-lg bg-slate-50">
                      <span className="text-sm text-slate-700 truncate">{addAssetFile.name}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs text-slate-400">{(addAssetFile.size / 1024).toFixed(0)} KB</span>
                        <button
                          type="button"
                          onClick={() => setAddAssetFile(null)}
                          className="text-xs font-medium text-slate-400 hover:text-red-500 transition-colors bg-transparent border-none cursor-pointer"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ) : (
                    <label className="flex items-center justify-center gap-2 px-3.5 py-2.5 border border-dashed border-slate-300 rounded-lg text-sm text-slate-500 cursor-pointer hover:border-brand hover:text-brand transition-colors">
                      Choose File
                      <input
                        type="file"
                        className="hidden"
                        onChange={e => setAddAssetFile(e.target.files?.[0] ?? null)}
                      />
                    </label>
                  )}
                </div>
              )}

              {addAssetForm.type === "credential" && (
                <div>
                  <label className={labelCls}>Fields <span className="text-brand">*</span></label>
                  <div className="flex flex-col gap-2">
                    {addAssetForm.fields.map((field, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={field.label}
                          onChange={e => setAddAssetForm(f => ({
                            ...f,
                            fields: f.fields.map((ff, ii) => ii === i ? { ...ff, label: e.target.value } : ff),
                          }))}
                          className={inputCls}
                          placeholder="e.g. Username"
                        />
                        <input
                          type="text"
                          value={field.value}
                          onChange={e => setAddAssetForm(f => ({
                            ...f,
                            fields: f.fields.map((ff, ii) => ii === i ? { ...ff, value: e.target.value } : ff),
                          }))}
                          className={inputCls}
                          placeholder="Value"
                        />
                        <button
                          type="button"
                          onClick={() => setAddAssetForm(f => ({ ...f, fields: f.fields.filter((_, ii) => ii !== i) }))}
                          className="w-8 h-8 shrink-0 rounded-lg border border-slate-200 text-slate-400 hover:text-red-500 hover:border-red-200 transition-colors bg-transparent cursor-pointer text-base leading-none"
                          aria-label="Remove field"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setAddAssetForm(f => ({ ...f, fields: [...f.fields, { label: "", value: "" }] }))}
                    className="mt-2 text-[12px] font-semibold text-brand bg-transparent border-none cursor-pointer p-0"
                  >
                    + Add Field
                  </button>
                </div>
              )}

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

              <div>
                <label className={labelCls}>Visible To</label>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setAddAssetForm(f => ({ ...f, allowedRoles: [] }))}
                    className={cn(
                      "px-3 py-1.5 rounded-full text-[12px] font-medium border cursor-pointer transition-colors",
                      addAssetForm.allowedRoles.length === 0
                        ? "bg-brand text-white border-brand"
                        : "bg-transparent text-slate-500 border-slate-200 hover:border-slate-300"
                    )}
                  >
                    All
                  </button>
                  {ASSET_ROLE_OPTIONS.map(role => {
                    const active = addAssetForm.allowedRoles.includes(role.value);
                    return (
                      <button
                        key={role.value}
                        type="button"
                        onClick={() => setAddAssetForm(f => ({
                          ...f,
                          allowedRoles: active ? f.allowedRoles.filter(r => r !== role.value) : [...f.allowedRoles, role.value],
                        }))}
                        className={cn(
                          "px-3 py-1.5 rounded-full text-[12px] font-medium border cursor-pointer transition-colors",
                          active
                            ? "bg-brand text-white border-brand"
                            : "bg-transparent text-slate-500 border-slate-200 hover:border-slate-300"
                        )}
                      >
                        {role.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <p className="text-[11px] text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                {ASSET_TYPE_HELP[addAssetForm.type]}
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
                disabled={addAssetSaving || !isAddAssetValid}
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
          <button
            onClick={() => router.push(V2_ROUTES.CUSTOMERS)}
            className="inline-flex items-center gap-1.5 text-[12px] font-medium text-slate-500 hover:text-brand transition-colors bg-transparent border-none cursor-pointer mb-3 p-0"
          >
            <ArrowLeft size={14} /> Back to Customers
          </button>
          {/* Header card — always visible */}
          <div className={cn(sectionCls, "px-6")}>
            <div className="flex justify-between items-start flex-wrap gap-4">
              <div>
                <h1 className={cn("text-[22px] font-bold mb-2", textPrimary)}>{customer.company_name}</h1>
                <div className="flex items-center gap-2.5">
                  <span className={cn("font-mono text-sm font-semibold tracking-[0.04em]", isDark ? "text-slate-400" : "text-slate-600")}>
                    {customer.customer_id}
                  </span>
                  <span className={cn("inline-block px-2.5 py-px rounded text-[11px] font-semibold", statusClass(status, isDark))}>
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
                    onClick={() => setActiveSection("projects")}
                    className="font-[inherit] py-2 px-4 bg-green-500 text-white text-xs font-semibold border-none rounded-full cursor-pointer hover:opacity-90 transition-opacity"
                  >
                    Add Project
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
          <div className={cn("flex gap-0.5 mb-5 flex-wrap", tabBorder)}>
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
                    <div className={cn("text-[13px] font-medium", textPrimary)}>{value ?? "—"}</div>
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
                {(() => {
                  const matched = deskContacts.find((c) => isPrimaryContact(c));
                  const fields = [
                    { label: "Contact Name", value: customer.contact_name || "—" },
                    { label: "Email", value: customer.contact_email || "—" },
                  ];
                  if (matched) {
                    fields.push(
                      { label: "Phone", value: matched.phone ?? matched.mobile ?? "—" },
                      { label: "Title", value: matched.title ?? "—" }
                    );
                  }
                  return fields.map(({ label, value }) => (
                    <div key={label}>
                      <div className="text-[11px] text-slate-400 mb-0.5">{label}</div>
                      <div className={cn("text-[13px] font-medium", textPrimary)}>{value}</div>
                    </div>
                  ));
                })()}
              </div>
            </div>
          )}

          {/* Desk Contacts (Zoho Desk, matched — task 117/119) */}
          {activeSection === "contact" && (
            <div className={cn(sectionCls, "mt-4")}>
              <div className={sectionTitleCls}>
                Desk Contacts{deskContacts.length > 0 && ` (${deskContacts.length})`}
              </div>
              {deskContactsLoading ? (
                <div className="text-[13px] text-slate-400 text-center py-4">Loading…</div>
              ) : deskContacts.length === 0 ? (
                <div className={cn("text-[13px] text-slate-400 text-center py-4 rounded-lg border border-dashed", isDark ? "bg-white/[0.02] border-white/[0.08]" : "bg-slate-50 border-slate-200")}>
                  No Desk contacts matched to this customer yet.
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {deskContacts.map((c) => {
                    const primary = isPrimaryContact(c);
                    return (
                      <div key={c.id} className={cn("flex items-center gap-3 py-2.5 px-3 rounded-lg border", isDark ? "border-white/[0.06] bg-white/[0.03]" : "border-slate-100 bg-slate-50/50")}>
                        <div className="min-w-0 flex-1">
                          <div className={cn("text-[13px] font-medium flex items-center gap-1.5", textPrimary)}>
                            {[c.first_name, c.last_name].filter(Boolean).join(" ") || "—"}
                            {primary && (
                              <span className="text-[10px] font-semibold text-brand border border-brand/30 rounded-full px-1.5 py-px">
                                Primary
                              </span>
                            )}
                          </div>
                          {c.title && <div className="text-[11px] text-slate-400 truncate">{c.title}</div>}
                        </div>
                        <div className="text-[12px] text-slate-500 truncate min-w-0 flex-1">{c.email ?? "—"}</div>
                        <div className="text-[12px] text-slate-500 shrink-0">{c.phone ?? c.mobile ?? "—"}</div>
                        <button
                          onClick={() => (primary ? handleRemovePrimaryContact(c.id) : handleSetPrimaryContact(c))}
                          disabled={primaryContactSavingId === c.id}
                          className={cn(
                            "shrink-0 text-[11px] font-medium px-2.5 py-1 rounded-full border cursor-pointer transition-colors disabled:opacity-50",
                            primary
                              ? "text-slate-400 border-slate-200 hover:border-red-300 hover:text-red-500 bg-transparent"
                              : "text-brand border-brand/30 hover:bg-brand/5 bg-transparent"
                          )}
                        >
                          {primaryContactSavingId === c.id ? "…" : primary ? "Remove Primary" : "Set as Primary"}
                        </button>
                      </div>
                    );
                  })}
                  {primaryContactError && (
                    <p className="text-[11px] text-red-500 mt-1">{primaryContactError}</p>
                  )}
                </div>
              )}
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
                  <div className="flex items-center justify-between mb-5">
                    <div>
                      <div className={cn("text-sm font-bold", textPrimary)}>{viewingResponsesInline.product_name}</div>
                      <div className="text-[11px] text-slate-400">Onboarding Responses</div>
                    </div>
                    {viewingResponsesInline.status !== "archived" && (
                      <button
                        onClick={() => {
                          setEditResponsesData((viewingResponsesInline.onboarding_data as Record<string, unknown>) ?? {});
                          setEditResponsesError(null);
                          setEditResponses(viewingResponsesInline);
                        }}
                        className="text-[11px] font-semibold text-brand border border-brand/30 rounded-full px-3 py-1 hover:bg-brand/5 transition-colors cursor-pointer bg-transparent"
                      >
                        Edit Responses
                      </button>
                    )}
                  </div>
                  <div className="space-y-5">
                    <ResponsesView product={viewingResponsesInline} isDark={isDark} />
                  </div>
                </div>
              ) : (
              <>
              <div className="flex items-center justify-between mb-3">
                <div className={cn(sectionTitleCls, "mb-0")}>Products ({totalProductCount})</div>
                {availableProducts.length > 0 && productTab === "active" && (
                  <button
                    onClick={() => setAddProductOpen(true)}
                    className="text-[11px] font-semibold text-brand border border-brand/30 rounded-full px-3 py-1 hover:bg-brand/5 transition-colors cursor-pointer bg-transparent"
                  >
                    + Add Product
                  </button>
                )}
              </div>
              <div className="flex gap-1.5 mb-4">
                <button
                  onClick={() => setProductTab("active")}
                  className={cn(
                    "text-[11px] font-semibold px-3 py-1 rounded-full border cursor-pointer transition-colors",
                    productTab === "active"
                      ? "bg-brand text-white border-brand"
                      : (isDark ? "bg-transparent text-slate-400 border-white/10 hover:border-white/20" : "bg-transparent text-slate-500 border-slate-200 hover:border-slate-300")
                  )}
                >
                  Active ({activeProducts.length + (hasCiteForge ? 1 : 0)})
                </button>
                <button
                  onClick={() => setProductTab("archived")}
                  className={cn(
                    "text-[11px] font-semibold px-3 py-1 rounded-full border cursor-pointer transition-colors",
                    productTab === "archived"
                      ? (isDark ? "bg-slate-600 text-white border-slate-600" : "bg-slate-700 text-white border-slate-700")
                      : (isDark ? "bg-transparent text-slate-400 border-white/10 hover:border-white/20" : "bg-transparent text-slate-500 border-slate-200 hover:border-slate-300")
                  )}
                >
                  Archived ({archivedProducts.length})
                </button>
              </div>
              {productTab === "active" ? (
              activeProducts.length === 0 ? (
                <p className="text-[13px] text-slate-400 text-center py-4">
                  No active products yet.{" "}
                  <button
                    onClick={() => setAddProductOpen(true)}
                    className="text-brand bg-transparent border-none cursor-pointer p-0 text-[13px]"
                  >
                    Add a product
                  </button>
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {activeProducts.map((product) => {
                    const isComplete = product.onboarding_complete;
                    const productSchema = getOnboardingSchema(product.product_name);
                    const pct = isComplete
                      ? 100
                      : productSchema
                      ? Math.round(computeCompletionPercentage(productSchema, (product.onboarding_data as Record<string, unknown>) ?? {}))
                      : Math.round(product.completed_percentage ?? 0);
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
                          isComplete
                            ? (isDark ? "border border-green-500/20 bg-green-500/5" : "border border-green-100 bg-green-50/20")
                            : (isDark ? "border border-white/[0.08] bg-[#1a2235]" : "border border-slate-200 bg-white")
                        )}
                      >
                        <div className="flex justify-between items-center mb-3">
                          <div className="flex items-center gap-2">
                            <div
                              className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold ${PRODUCT_ICON_CLASSES[product.product_name] ?? "text-slate-400 bg-slate-100"}`}
                            >
                              {product.product_name[0]}
                            </div>
                            <span className={cn("text-sm font-bold", textPrimary)}>{product.product_name}</span>
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
                              onClick={() => { setArchiveProductError(null); setArchiveProduct(product); }}
                              className="text-[11px] font-medium text-slate-400 hover:text-amber-500 transition-colors px-2 py-1 rounded bg-transparent border-none cursor-pointer"
                              title="Archive product"
                            >
                              Archive
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
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-[11px] text-slate-400">
                            {pct}%
                          </span>
                          <span
                            className={cn(
                              "inline-block px-2 py-px rounded text-[11px] font-semibold",
                              isComplete
                                ? (isDark ? "text-green-400 bg-green-500/15" : "bg-green-50 text-green-600")
                                : (isDark ? "text-orange-400 bg-orange-500/15" : "bg-orange-50 text-orange-500")
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
                          <div className={cn("mt-2 mb-2 pt-2 border-t", isDark ? "border-white/[0.06]" : "border-slate-100")}>
                            <div className="text-[10px] font-bold text-slate-400 tracking-[0.06em] uppercase mb-1.5">Onboarding Highlights</div>
                            <div className="flex flex-col gap-1">
                              {highlights.map(h => (
                                <div key={h.label} className="flex gap-1.5 text-[11px]">
                                  <span className="text-slate-400 shrink-0">{h.label}:</span>
                                  <span className={cn("truncate", isDark ? "text-slate-300" : "text-slate-700")}>{h.value}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="flex flex-col gap-1.5 text-xs">
                          {product.product_instance_id && (
                            <div className="text-slate-500">
                              <span className="font-semibold">Instance: </span>
                              <span className="font-mono">{product.product_instance_id}</span>
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
                    <div className={cn("rounded-[10px] p-4", isDark ? "border border-sky-500/20 bg-sky-500/5" : "border border-sky-100 bg-sky-50/20")}>
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold bg-[#0EA5E918] text-[#0EA5E9] shrink-0">
                          Ci
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={cn("text-sm font-bold", isDark ? "text-slate-200" : "text-slate-900")}>CiteForge</span>
                            <span className="text-[10px] text-slate-400 font-medium">Add-on to StackShift</span>
                          </div>
                        </div>
                        <span className={cn("inline-block px-2 py-px rounded text-[11px] font-semibold shrink-0", isDark ? "text-sky-400 bg-sky-500/15" : "bg-sky-50 text-sky-600")}>
                          Enabled
                        </span>
                      </div>
                      <p className="mt-3 text-[11px] text-slate-400 leading-snug">
                        Citation management is included as part of the StackShift onboarding.
                      </p>
                    </div>
                  )}
                </div>
              )
              ) : (
              archivedProducts.length === 0 ? (
                <p className="text-[13px] text-slate-400 text-center py-4">No archived products yet.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {archivedProducts.map(product => {
                    const highlights = getProductHighlights(product);
                    return (
                      <div
                        key={product.id}
                        className={cn(
                          "rounded-[10px] p-4 opacity-60",
                          isDark ? "border border-white/[0.06] bg-[#1a2235]" : "border border-slate-200 bg-slate-50"
                        )}
                      >
                        <div className="flex justify-between items-center mb-3">
                          <div className="flex items-center gap-2">
                            <div
                              className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold ${PRODUCT_ICON_CLASSES[product.product_name] ?? "text-slate-400 bg-slate-100"}`}
                            >
                              {product.product_name[0]}
                            </div>
                            <span className={cn("text-sm font-bold", isDark ? "text-slate-400" : "text-slate-500")}>{product.product_name}</span>
                          </div>
                          <span className={cn("inline-block px-2 py-px rounded text-[11px] font-semibold", isDark ? "text-slate-500 bg-white/5" : "bg-slate-100 text-slate-400")}>
                            Archived
                          </span>
                        </div>
                        {highlights.length > 0 && (
                          <div className={cn("mb-3 pb-2 pt-2 border-t", isDark ? "border-white/[0.06]" : "border-slate-100")}>
                            <div className="flex flex-col gap-1">
                              {highlights.map(h => (
                                <div key={h.label} className="flex gap-1.5 text-[11px]">
                                  <span className="text-slate-400 shrink-0">{h.label}:</span>
                                  <span className="text-slate-500 truncate">{h.value}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        <button
                          onClick={() => handleRestoreProduct(product)}
                          className="text-xs text-brand font-semibold text-left bg-transparent border-none cursor-pointer p-0 transition-colors hover:opacity-80"
                        >
                          Restore →
                        </button>
                      </div>
                    );
                  })}
                </div>
              )
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
                <div className={cn("text-[13px] text-slate-400 text-center py-6 rounded-lg border border-dashed", isDark ? "bg-white/[0.02] border-white/[0.08]" : "bg-slate-50 border-slate-200")}>
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
                    const credentialFields = asset.type === "credential" && Array.isArray(asset.fields)
                      ? (asset.fields as { label: string; value: string }[])
                      : [];
                    const hasRoleRestriction = !!asset.allowed_roles && asset.allowed_roles.length > 0;
                    return (
                      <div key={asset.id} className={cn("flex items-center gap-3 py-2.5 px-3 rounded-lg border", isDark ? "border-white/[0.06] bg-white/[0.03]" : "border-slate-100 bg-slate-50/50")}>
                        <span className={cn("text-[10px] font-bold rounded px-1.5 py-px shrink-0", assetTypeCls(asset.type, isDark))}>
                          {ASSET_TYPE_LABELS[asset.type]}
                        </span>
                        <span className={cn("text-[12px] font-semibold shrink-0 min-w-20", isDark ? "text-slate-300" : "text-slate-700")}>{asset.label}</span>
                        <div className="flex-1 min-w-0">
                          {asset.type === "credential" ? (
                            <div className="flex flex-col gap-0.5">
                              {credentialFields.map((field, i) => (
                                <div key={i} className="text-[12px] font-mono text-slate-500 truncate">
                                  <span className="text-slate-400">{field.label}: </span>
                                  {asset.masked && !isRevealed ? "••••••••" : field.value}
                                </div>
                              ))}
                            </div>
                          ) : asset.type === "file" ? (
                            <span className="text-[12px] text-slate-500 truncate">
                              {asset.file_name}
                              {asset.file_size ? ` (${(asset.file_size / 1024).toFixed(0)} KB)` : ""}
                            </span>
                          ) : (
                            <span className="text-[12px] text-slate-500 font-mono truncate">{asset.value}</span>
                          )}
                        </div>
                        {hasRoleRestriction && (
                          <span className="text-[10px] font-medium text-slate-400 border border-slate-200 rounded-full px-2 py-0.5 shrink-0 whitespace-nowrap">
                            {asset.allowed_roles!.map(r => ASSET_ROLE_LABELS[r] ?? r).join(", ")}
                          </span>
                        )}
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
                          {asset.type === "link" && (
                            <a
                              href={asset.value ?? "#"}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[11px] font-medium text-brand hover:opacity-70 transition-opacity"
                            >
                              Open
                            </a>
                          )}
                          {asset.type === "file" && (
                            <button
                              onClick={() => handleOpenAssetFile(asset.id)}
                              disabled={openingAssetId === asset.id}
                              className="text-[11px] font-medium text-brand hover:opacity-70 transition-opacity bg-transparent border-none cursor-pointer disabled:opacity-50"
                            >
                              {openingAssetId === asset.id ? "Opening…" : "Open"}
                            </button>
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
                <div className={cn("text-[13px] text-slate-400 text-center py-6 rounded-lg border border-dashed", isDark ? "bg-white/[0.02] border-white/[0.08]" : "bg-slate-50 border-slate-200")}>
                  No classification records yet.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-[12px]">
                    <thead>
                      <tr className={cn("border-b", isDark ? "border-white/[0.08]" : "border-slate-100")}>
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
                        const priorityClass: Record<string, string> = isDark
                          ? { CRITICAL: "text-red-400 bg-red-500/15", HIGH: "text-amber-400 bg-amber-500/15", NORMAL: "text-sky-400 bg-sky-500/15", LOW: "text-slate-400 bg-slate-500/15" }
                          : { CRITICAL: "text-red-700 bg-red-50", HIGH: "text-amber-700 bg-amber-50", NORMAL: "text-sky-700 bg-sky-50", LOW: "text-slate-500 bg-slate-50" };
                        return (
                          <tr key={c.id} className={i < classifications.length - 1 ? (isDark ? "border-b border-white/[0.04]" : "border-b border-slate-50") : ""}>
                            <td className={cn("py-2.5 px-3 font-medium max-w-60 truncate", isDark ? "text-slate-300" : "text-slate-800")}>{c.title}</td>
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
                                c.status === "reviewed"
                                  ? (isDark ? "text-green-400 bg-green-500/15" : "text-green-700 bg-green-50")
                                  : (isDark ? "text-amber-400 bg-amber-500/15" : "text-amber-700 bg-amber-50")
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

          {/* Projects */}
          {activeSection === "projects" && (
            <div className={sectionCls}>
              <div className="flex items-center justify-between mb-4">
                <div className={sectionTitleCls}>Projects</div>
                <button
                  onClick={() => { setAddProjectDialogOpen(true); setAddProjectError(null); }}
                  className="text-[11px] font-semibold text-brand border border-brand/30 rounded-full px-3 py-1 hover:bg-brand/5 transition-colors cursor-pointer bg-transparent"
                >
                  + Add Project
                </button>
              </div>
              {projectsLoading ? (
                <p className="text-sm text-slate-400">Loading…</p>
              ) : projects.length === 0 ? (
                <p className="text-sm text-slate-400">No projects yet. Add one above.</p>
              ) : (
                <div className="space-y-3">
                  {projects.map(proj => (
                    <div
                      key={proj.id}
                      className={cn("rounded-xl p-4 space-y-2 border", isDark ? "border-white/[0.08] bg-white/[0.03]" : "border-slate-200 bg-white")}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className={cn("text-sm font-semibold", textPrimary)}>{proj.name}</p>
                          <p className="text-[11px] text-slate-400 mt-0.5">{proj.project_type}</p>
                        </div>
                        <button
                          onClick={() => handleOpenEditProject(proj)}
                          className="text-[11px] font-semibold text-slate-400 hover:text-brand border border-slate-200 rounded-full px-2.5 py-0.5 hover:border-brand/30 transition-colors cursor-pointer bg-transparent shrink-0"
                        >
                          Edit
                        </button>
                      </div>
                      <div className="flex flex-col gap-1.5 text-xs">
                        {proj.zoho_project_id && (
                          <div className="flex items-center gap-1.5 text-slate-500">
                            <span className="font-semibold">Zoho:</span>
                            <a
                              href={`https://projects.zoho.com/portal/${zohoPortalName}#zp/projects/${proj.zoho_project_id}/dashboard`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-brand hover:underline font-mono"
                            >
                              {proj.zoho_project_id}
                            </a>
                          </div>
                        )}
                        {proj.github_repo && (
                          <div className="flex items-center gap-1.5 text-slate-500">
                            <span className="font-semibold">GitHub:</span>
                            <a
                              href={proj.github_repo}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-brand hover:underline truncate"
                            >
                              {proj.github_repo}
                            </a>
                          </div>
                        )}
                        {proj.sanity_project_id && (
                          <div className="flex items-center gap-1.5 text-slate-500">
                            <span className="font-semibold">Sanity:</span>
                            <span className="font-mono">{proj.sanity_project_id}</span>
                          </div>
                        )}
                        {proj.dedicated_developers.length > 0 && (
                          <div className="flex items-center gap-1.5 text-slate-500">
                            <span className="font-semibold">Devs:</span>
                            <span>{proj.dedicated_developers.join(", ")}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
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
                      customer.communication_tone === "formal"    ? (isDark ? "text-blue-400 bg-blue-500/15"   : "bg-blue-50 text-blue-600") :
                      customer.communication_tone === "technical" ? (isDark ? "text-violet-400 bg-violet-500/15" : "bg-purple-50 text-purple-600") :
                      customer.communication_tone === "casual"    ? (isDark ? "text-green-400 bg-green-500/15" : "bg-green-50 text-green-600") :
                      (isDark ? "text-slate-400 bg-slate-500/15" : "bg-slate-100 text-slate-500")
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
                      customer.automation_toggle
                        ? (isDark ? "text-green-400 bg-green-500/15" : "bg-green-50 text-green-600")
                        : (isDark ? "text-slate-400 bg-slate-500/15" : "bg-slate-100 text-slate-500")
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
                      customer.llm_excluded
                        ? (isDark ? "text-red-400 bg-red-500/15" : "bg-red-50 text-red-600")
                        : (isDark ? "text-green-400 bg-green-500/15" : "bg-green-50 text-green-600")
                    )}>
                      {customer.llm_excluded ? "Human Only" : "AI Enabled"}
                    </span>
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-400 mb-0.5">Daily Token Budget</div>
                  <div className={cn("text-[13px] font-medium", textPrimary)}>
                    {customer.daily_token_budget != null ? customer.daily_token_budget.toLocaleString() : "Unlimited"}
                  </div>
                </div>
                {customer.automation_paused && (
                  <div>
                    <div className="text-[11px] text-slate-400 mb-0.5">Circuit Breaker</div>
                    <div className="text-[13px] font-medium">
                      <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold", isDark ? "text-amber-400 bg-amber-500/15" : "bg-amber-50 text-amber-600")}>
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

function ResponsesView({ product, isDark }: { product: CustomerProductRow; isDark: boolean }) {
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
                const displayValue: React.ReactNode =
                  value === undefined || value === null || value === ""
                    ? "—"
                    : typeof value === "boolean"
                      ? (value ? "Yes" : "No")
                      : Array.isArray(value)
                        ? value.join(", ")
                        : typeof value === "object" && "url" in (value as object)
                          ? (
                            <a
                              href={(value as UploadedFile).url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-brand underline break-all"
                            >
                              {(value as UploadedFile).filename}
                            </a>
                          )
                          : String(value);
                return (
                  <div key={field.name} className={cn("flex gap-3 py-2 border-b last:border-0", isDark ? "border-white/[0.04]" : "border-slate-50")}>
                    <span className="text-[11px] text-slate-400 w-44 shrink-0 pt-px">{field.label}</span>
                    <span className={cn("text-[13px] font-medium flex-1 break-words", isDark ? "text-slate-300" : "text-slate-800")}>{displayValue}</span>
                  </div>
                );
              })}
          </div>
        </div>
      ))}
    </>
  );
}
