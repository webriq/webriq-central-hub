import { ArrowRight } from "lucide-react";

interface AuthSubmitButtonProps {
  loading: boolean;
  loadingLabel: string;
  label: string;
  disabled?: boolean;
}

export function AuthSubmitButton({ loading, loadingLabel, label, disabled }: AuthSubmitButtonProps) {
  return (
    <button
      type="submit"
      disabled={disabled ?? loading}
      className="group inline-flex items-center justify-center gap-2 h-12 w-full rounded-full bg-auth-orange text-auth-cta-ink font-semibold text-sm shadow cursor-pointer hover:bg-auth-orange-600 hover:text-white transition-all disabled:opacity-60 disabled:pointer-events-none"
    >
      {loading ? loadingLabel : label}
      {!loading && (
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
      )}
    </button>
  );
}
