"use client";

import { useEffect, useState } from "react";
import type { CreditSummary } from "@/lib/hr/types";

/** Loads the requester's credit position for the drawer. `null` while loading or when unavailable. */
export function useRequestCredit(requestId: string) {
  const [credit, setCredit] = useState<CreditSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    fetch(`/api/hr/leave-requests/${requestId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { credit: CreditSummary | null } | null) => live && setCredit(j?.credit ?? null))
      .catch(() => undefined)
      .finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [requestId]);

  return { credit, loading };
}
