// Shared types/components between the Zoho Projects and Zoho Desk migrate tabs (task 296).
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";

export type ImportResult = { imported: number; updated: number; skipped: number; errors: string[] };
export type CardState = "idle" | "running" | "done" | "error";
export interface CardStatus {
  state: CardState;
  result?: ImportResult | null;
  errorMsg?: string;
}

export function ResultChip({ result }: { result: ImportResult }) {
  return (
    <div className="mt-3 text-[12px] space-y-0.5">
      <div className="text-slate-600">
        <span className="font-semibold text-green-700">{result.imported}</span> imported ·{" "}
        <span className="font-semibold text-blue-700">{result.updated}</span> updated ·{" "}
        <span className="font-semibold text-slate-500">{result.skipped}</span> skipped
      </div>
      {result.errors.length > 0 && (
        <div className="text-red-600 font-medium">{result.errors.length} error(s)</div>
      )}
      {result.errors.slice(0, 3).map((e, i) => (
        <div key={i} className="text-red-500 truncate" title={e}>{e}</div>
      ))}
      {result.errors.length > 3 && (
        <div className="text-slate-400">+{result.errors.length - 3} more errors</div>
      )}
    </div>
  );
}

export function StateIcon({ state }: { state: CardState }) {
  if (state === "running") return <Loader2 size={14} className="animate-spin text-blue-500" />;
  if (state === "done") return <CheckCircle2 size={14} className="text-green-600" />;
  if (state === "error") return <XCircle size={14} className="text-red-500" />;
  return null;
}
