type SidebarProps = {
  items: string[];
};

export function Sidebar({ items }: SidebarProps) {
  return (
    <aside className="w-full rounded-xl border border-slate-800 bg-slate-900/70 p-4 md:sticky md:top-6 md:h-fit">
      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Navigation</p>
      <nav aria-label="Dashboard sections">
        <ul className="space-y-1">
          {items.map((item, index) => (
            <li key={item}>
              <button
                type="button"
                className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${
                  index === 0 ? "bg-cyan-500/20 text-cyan-200" : "text-slate-300 hover:bg-slate-800 hover:text-slate-100"
                }`}
              >
                {item}
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}
