import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { WIKI_PRODUCTS, type WikiPageSummary, type WikiProduct } from "@/types/wiki";
import { WikiShell } from "./_wiki-shell";

export const metadata: Metadata = { title: "Wiki" };
export const dynamic = "force-dynamic";

const WRITE_ROLES = ["admin", "super_admin", "pm", "developer"];

function isWikiProduct(value: string | undefined): value is WikiProduct {
  return WIKI_PRODUCTS.some((p) => p.name === value);
}

export default async function KbPage({
  searchParams,
}: {
  searchParams: Promise<{ space?: string; page?: string }>;
}) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/auth/login");

  const userId = data.claims.sub as string;
  const { data: profile } = await supabase.from("profiles").select("role, full_name").eq("id", userId).single();
  const role = (profile?.role as string | null) ?? null;
  const canWrite = role !== null && WRITE_ROLES.includes(role);
  // Task 402 — identity shown to other /kb users on the presence channel ("X is editing now").
  const email = typeof data.claims.email === "string" ? data.claims.email : null;
  const currentUser = { id: userId, name: profile?.full_name ?? email ?? "Unknown", email };

  const { data: pageRows } = await supabase
    .from("wiki_pages")
    .select("id, product, parent_id, title, status, sort_order, version, updated_at, tags")
    .order("product", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  const pages: WikiPageSummary[] = (pageRows ?? []).map((row) => ({
    id: row.id,
    product: row.product as WikiProduct,
    parentId: row.parent_id,
    title: row.title,
    status: row.status,
    sortOrder: row.sort_order,
    version: row.version,
    updatedAt: row.updated_at,
    tags: row.tags,
  }));

  const { space, page } = await searchParams;
  const initialProduct: WikiProduct = isWikiProduct(space) ? space : WIKI_PRODUCTS[0].name;

  const requestedPage = page ? pages.find((p) => p.id === page) : undefined;
  const firstPageInSpace = pages
    .filter((p) => p.product === initialProduct && p.status !== "archived")
    .sort((a, b) => a.sortOrder - b.sortOrder)[0];
  const initialPageId = requestedPage?.id ?? firstPageInSpace?.id ?? null;

  return (
    <WikiShell
      initialPages={pages}
      initialProduct={requestedPage?.product ?? initialProduct}
      initialPageId={initialPageId}
      canWrite={canWrite}
      currentUser={currentUser}
    />
  );
}
