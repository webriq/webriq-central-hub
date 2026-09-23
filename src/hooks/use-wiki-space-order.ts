"use client";

import { useSyncExternalStore, useCallback } from "react";
import { WIKI_PRODUCTS, type WikiProduct } from "@/types/wiki";

// Task 399 — per-viewer Wiki space display order (drag-to-reorder in Panel 1). A personal UI
// preference, not shared data, so it lives in localStorage rather than a new DB table/column —
// same useSyncExternalStore pattern as use-pm-settings.ts.

const STORAGE_KEY = "hub_wiki_space_order";
const DEFAULT_ORDER: WikiProduct[] = WIKI_PRODUCTS.map((p) => p.name);

function isWikiProduct(value: unknown): value is WikiProduct {
  return typeof value === "string" && WIKI_PRODUCTS.some((p) => p.name === value);
}

function readOrder(): WikiProduct[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_ORDER;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_ORDER;
    const stored = parsed.filter(isWikiProduct);
    // Any space missing from a stale stored order (or newly added to the catalog) is
    // appended at the end, so the list always contains every known space exactly once.
    const missing = DEFAULT_ORDER.filter((name) => !stored.includes(name));
    return [...stored, ...missing];
  } catch {
    return DEFAULT_ORDER;
  }
}

function writeOrder(order: WikiProduct[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(order));
}

let _cache: WikiProduct[] | null = null;
let _listeners: (() => void)[] = [];

function getSnapshot(): WikiProduct[] {
  if (_cache === null) _cache = readOrder();
  return _cache;
}

function getServerSnapshot(): WikiProduct[] {
  return DEFAULT_ORDER;
}

function subscribe(listener: () => void): () => void {
  _listeners = [..._listeners, listener];
  return () => { _listeners = _listeners.filter((l) => l !== listener); };
}

export function useWikiSpaceOrder() {
  const order = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setOrder = useCallback((next: WikiProduct[]) => {
    _cache = next;
    writeOrder(next);
    _listeners.forEach((l) => l());
  }, []);

  return { order, setOrder };
}
