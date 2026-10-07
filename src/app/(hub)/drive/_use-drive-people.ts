"use client";

import { useEffect, useState } from "react";
import type { DrivePerson } from "@/lib/drive/types";

// Names for the share picker and the "Shared by …" groups. Fetched once per page visit; a failure
// degrades to an empty list (labels fall back to "A teammate", the picker offers roles only).
export function useDrivePeople() {
  const [people, setPeople] = useState<DrivePerson[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/drive/people", { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : []))
      .then((rows: DrivePerson[]) => setPeople(rows))
      .catch(() => { /* aborted or offline — keep the empty list */ });
    return () => controller.abort();
  }, []);
  return people;
}
