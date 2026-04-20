import { ReactNode } from "react";

type PanelCardProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
};

export function PanelCard({ title, subtitle, children }: PanelCardProps) {
  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-slate-100">{title}</h2>
        {subtitle ? <p className="mt-1 text-sm text-slate-400">{subtitle}</p> : null}
      </div>
      {children}
    </section>
  );
}
