"use client";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { HubUser } from "./page";
import { getDisplayName } from "./_user-row";
import type { DeactivationImpact } from "./_use-deactivate-user";

// Task 378 — thin wrapper over the shared ConfirmDialog (tasks 230/231/371). ConfirmDialog
// itself is unchanged: `body` is a plain string and `confirmDisabled` already exists, which is
// all the pre-flight needs.

// Module-private — only membershipParts() below calls this. (Was exported until a /simplify
// round-5 pass caught the export as dead: page.tsx imports membershipParts, not this, and the
// comment that used to sit here described membershipParts' consumer, not this function's.)
function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

// Exported for page.tsx's toast copy too — it was hand-rolling this exact same "project(s) and
// phase(s)" array-building next to it, duplicating this file's own logic in the same diff that
// introduced plural() to kill an equivalent duplication (round 2).
export function membershipParts(impact: DeactivationImpact): string[] {
  const parts: string[] = [];
  if (impact.projectMemberships > 0) parts.push(plural(impact.projectMemberships, "project"));
  if (impact.phaseMemberships > 0) parts.push(plural(impact.phaseMemberships, "phase"));
  return parts;
}

/**
 * Builds the dialog copy. The membership sentence is omitted entirely when the user has no
 * memberships (rather than saying "0 projects and 0 phases"), and the ownership warning only
 * appears when an is_owner row is actually at stake — migration 073's partial unique indexes
 * mean removing one leaves that project/phase with no owner, which nothing else surfaces.
 */
function buildDeactivateBody(impact: DeactivationImpact | null, loading: boolean): string {
  const lines = ["They'll be signed out immediately and won't be able to log in again."];

  if (loading || !impact) {
    lines.push("Checking what else this will affect…");
  } else {
    const parts = membershipParts(impact);

    if (parts.length > 0) {
      const owned = impact.ownedProjects + impact.ownedPhases;
      let ownerNote = "";
      if (owned === 1) {
        ownerNote = " One of those is an ownership, so that project/phase will be left without an owner.";
      } else if (owned > 1) {
        ownerNote = ` ${owned} of those are ownerships, so those projects/phases will be left without an owner.`;
      }
      lines.push(`Removing them from ${parts.join(" and ")}.${ownerNote}`);
    }

    lines.push("Their name stays on all tasks, comments, time logs and activity.");
    lines.push("Reactivating later restores login, but not their memberships.");
  }

  return lines.join(" ");
}

export function DeactivateUserDialog({
  pending, impact, loadingImpact, submitting, onConfirm, onCancel,
}: {
  pending: HubUser | null;
  impact: DeactivationImpact | null;
  loadingImpact: boolean;
  submitting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <ConfirmDialog
      open={!!pending}
      title={pending ? `Deactivate ${getDisplayName(pending)}?` : "Deactivate user?"}
      body={buildDeactivateBody(impact, loadingImpact)}
      confirmLabel={submitting ? "Deactivating…" : "Deactivate"}
      confirmDisabled={loadingImpact || submitting}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
