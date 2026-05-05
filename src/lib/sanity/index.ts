// Sanity CMS client — implemented in Sprint 5 (M6)
// Isolation key: sanity_project_id per customer_products row

export async function getSanityClient(_sanityProjectId: string) {
  throw new Error("Sanity client not yet implemented — Sprint 5");
}

export async function publishSanityDocument(_projectId: string, _document: unknown): Promise<void> {
  throw new Error("Sanity publish not yet implemented — Sprint 5");
}
