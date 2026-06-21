export default function PendingApprovalPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f5f4f1] px-4">
      <div className="max-w-md w-full bg-white rounded-xl border border-slate-200 shadow-sm p-8">
        <div className="w-10 h-10 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center mb-5">
          <svg className="w-5 h-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z" />
          </svg>
        </div>
        <h1 className="text-base font-bold text-slate-900 mb-1">
          Account pending approval
        </h1>
        <p className="text-[13px] text-slate-500 leading-relaxed mb-5">
          You signed in successfully, but your Hub account hasn&apos;t been approved yet.
          An admin will review your access and assign your role.
        </p>
        <div className="bg-slate-50 border border-slate-100 rounded-lg px-4 py-3 text-[12px] text-slate-500 leading-relaxed">
          <p className="font-semibold text-slate-700 mb-1">What happens next?</p>
          <ol className="list-decimal list-inside space-y-1">
            <li>Admin reviews your account in Hub Users</li>
            <li>Your role (Dev or PM) gets assigned</li>
            <li>Sign in again — you&apos;ll have full access</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
