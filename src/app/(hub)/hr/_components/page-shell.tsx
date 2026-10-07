import type { ReactNode } from "react";

/** Standard HR page frame: title block (+ optional actions) and a constrained content column. */
export function PageShell({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-h-full bg-[#F4F6FB]">
      <div className="mx-auto max-w-[1400px] px-4 pb-10 pt-6 sm:px-8">
        <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-heading text-[22px] font-bold tracking-[-0.015em] text-[#0B1533]">{title}</h1>
            {description && <p className="mt-0.5 max-w-[65ch] text-[13px] text-[#5F6A88]">{description}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
        <div className="flex flex-col gap-[18px]">{children}</div>
      </div>
    </div>
  );
}

export function Panel({
  title,
  hint,
  action,
  children,
  className = "",
  bodyClassName = "",
}: {
  title?: string;
  hint?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={`overflow-hidden rounded-[14px] border border-[#E2E7F2] bg-white shadow-[0_1px_2px_rgba(7,17,51,0.05)] ${className}`}>
      {title && (
        <div className="flex items-center justify-between gap-3 border-b border-[#EDF0F7] px-[18px] py-3.5">
          <div className="flex min-w-0 items-baseline gap-2">
            <h2 className="font-heading text-[15px] font-semibold tracking-[-0.01em] text-[#0B1533]">{title}</h2>
            {hint && <span className="truncate text-[11px] text-[#5F6A88]">{hint}</span>}
          </div>
          {action}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}
