"use client";

export default function OfflinePage() {
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="text-center space-y-4">
        <div className="text-6xl">📡</div>
        <h1 className="text-2xl font-semibold text-slate-100">You&apos;re offline</h1>
        <p className="text-slate-400 max-w-sm">
          WebriQ Central Hub requires a connection. Please check your internet and try again.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="mt-4 px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-md text-sm transition-colors"
        >
          Retry
        </button>
      </div>
    </div>
  );
}
