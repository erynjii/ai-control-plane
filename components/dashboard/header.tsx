type HeaderProps = {
  email: string | null;
  onLogout: () => Promise<void>;
};

export function Header({ email, onLogout }: HeaderProps) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/70 px-4 py-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-300">AI Control Plane</p>
        <p className="text-sm text-slate-300">Signed in as {email ?? "Unknown user"}</p>
      </div>
      <button
        type="button"
        onClick={onLogout}
        className="rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-slate-100 hover:border-slate-400"
      >
        Logout
      </button>
    </header>
  );
}
