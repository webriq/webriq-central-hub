import Link from "next/link";
import { ArrowLeft, Building2, Trash2 } from "lucide-react";
import { V2_ROUTES } from "@/config/constants";
import { formatDate } from "@/lib/utils";
import type { DeletedProjectSummary } from "./_get-deleted-project-summary";

// Task 415 — shown by /projects/v2/[projectId]/layout.tsx in place of the bare 404 when the
// project exists but was soft-deleted (reached, e.g., from a converted StackShift order). Static
// server component: no client JS, no motion. Read-only — there is deliberately no restore action
// (no backend for it). Uses the fixed light v2.0 tokens like the neighbouring project-detail pages.

const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#007BFF]";

// Date-only strings (`2026-09-10`) parse as UTC midnight and render a day early in negative-offset
// timezones; anchor them to local midnight first. Full timestamps pass through untouched.
function formatDeletedOn(value: string): string {
  return formatDate(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value);
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[#5F6A88]">{label}</dt>
      <dd className="mt-1 text-[13px] text-[#0B1533]">{children}</dd>
    </div>
  );
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

export default function DeletedProjectView({
  summary,
  classifications,
  backHref,
}: {
  summary: DeletedProjectSummary;
  classifications: string[];
  backHref: string;
}) {
  const { counts } = summary;
  const keptParts = [
    counts.tasks > 0 && plural(counts.tasks, "task"),
    counts.tickets > 0 && plural(counts.tickets, "ticket"),
    counts.milestones > 0 && plural(counts.milestones, "milestone"),
  ].filter(Boolean);

  return (
    <div className="px-4 py-8 sm:px-8 sm:py-12">
      <article
        role="status"
        aria-labelledby="deleted-project-title"
        className="mx-auto max-w-[720px] overflow-hidden rounded-[14px] border border-[#E2E7F2] bg-white selection:bg-[#E5F1FF]"
      >
        <header className="border-b border-[#F3D5D1] bg-[#FEF4F3] px-6 py-5 sm:px-8">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FDE8E6] px-2.5 py-1 text-[11px] font-semibold text-[#C0392B]">
            <Trash2 size={12} aria-hidden="true" />
            Deleted {formatDeletedOn(summary.deletedOn)}
          </span>
          <h1
            id="deleted-project-title"
            className="mt-3 font-heading text-[22px] font-bold leading-[1.2] tracking-[-0.015em] text-balance text-[#0B1533] sm:text-[26px]"
          >
            {summary.baseName}
          </h1>
          <p className="mt-1.5 max-w-[56ch] text-[13px] leading-relaxed text-[#3A4565]">
            This project was deleted, so its tasks, tickets and files can no longer be opened here.
          </p>
        </header>

        <div className="px-6 py-6 sm:px-8">
          <dl className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">
            <Fact label="Project ID">
              <span className="font-mono text-[12.5px] tabular-nums">{summary.publicId ?? "—"}</span>
            </Fact>
            <Fact label="Customer">
              {summary.customerId && summary.customerName ? (
                <Link
                  href={`${V2_ROUTES.CUSTOMERS}/${summary.customerId}`}
                  className={`text-[#0063D6] underline-offset-2 hover:underline ${FOCUS}`}
                >
                  {summary.customerName}
                </Link>
              ) : (
                "—"
              )}
            </Fact>
            <Fact label="Classification">
              {classifications.length > 0 ? (
                <span className="flex flex-wrap gap-1.5">
                  {classifications.map((c) => (
                    <span key={c} className="rounded-full bg-[#EEF3FF] px-2.5 py-0.5 text-[11px] font-medium text-[#2B4C86]">
                      {c}
                    </span>
                  ))}
                </span>
              ) : (
                "—"
              )}
            </Fact>
            <Fact label="Project type">{summary.projectType ?? "—"}</Fact>
          </dl>

          {keptParts.length > 0 && (
            <p className="mt-6 border-t border-[#EDF0F7] pt-5 text-[12.5px] tabular-nums text-[#5F6A88]">
              Kept on record: {keptParts.join(" · ")}
            </p>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-2.5">
            <Link
              href={backHref}
              className={`inline-flex items-center gap-2 rounded-full bg-[#007BFF] px-4 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-[#0063D6] ${FOCUS}`}
            >
              <ArrowLeft size={14} aria-hidden="true" />
              Back to projects
            </Link>
            {summary.customerId && (
              <Link
                href={`${V2_ROUTES.CUSTOMERS}/${summary.customerId}`}
                className={`inline-flex items-center gap-2 rounded-full border border-[#E2E7F2] bg-white px-4 py-2 text-[12px] font-semibold text-[#3A4565] transition-colors hover:bg-[#F0F7FF] ${FOCUS}`}
              >
                <Building2 size={14} aria-hidden="true" />
                Open customer
              </Link>
            )}
          </div>
        </div>
      </article>
    </div>
  );
}
