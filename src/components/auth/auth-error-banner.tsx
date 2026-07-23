export function AuthErrorBanner({ message, suffix }: { message: string | null; suffix?: React.ReactNode }) {
  if (!message) return null;
  return (
    <div className="rounded-lg px-4 py-2.5 text-sm text-auth-late bg-auth-late-bg border border-auth-late/20">
      {message}
      {suffix && <> {suffix}</>}
    </div>
  );
}
