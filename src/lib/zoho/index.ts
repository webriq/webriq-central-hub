// Zoho API client — implemented in Sprint 2 (M2, M7)
// Covers: Zoho Projects, Zoho Desk, Zoho Cliq

export async function getZohoAccessToken(): Promise<string> {
  throw new Error("Zoho client not yet implemented — Sprint 2");
}

export async function createZohoProject(_customerId: string): Promise<string> {
  throw new Error("Zoho project creation not yet implemented — Sprint 2");
}

export async function syncTaskToZoho(_taskId: string): Promise<void> {
  throw new Error("Zoho task sync not yet implemented — Sprint 4");
}
