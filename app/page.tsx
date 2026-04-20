export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col items-start justify-center gap-4 px-6 py-16">
      <p className="rounded-full border border-cyan-400/40 bg-cyan-400/10 px-3 py-1 text-xs font-medium tracking-wide text-cyan-200">
        AI Control Plane
      </p>
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">App scaffold is ready</h1>
      <p className="max-w-2xl text-sm text-slate-300 sm:text-base">
        Placeholder home page for the AI Control Plane MVP. Next steps are Generate → Scan → Approve → Publish → Track.
      </p>
    </main>
  );
}
