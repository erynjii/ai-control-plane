import type { Destination, DestinationStatus } from "@/lib/integrations/types";

const DESTINATION_STYLES: Record<Destination, string> = {
  instagram: "border-pink-500/40 bg-pink-500/10 text-pink-200",
  facebook: "border-blue-500/40 bg-blue-500/10 text-blue-200",
  email: "border-violet-500/40 bg-violet-500/10 text-violet-200",
  website: "border-teal-500/40 bg-teal-500/10 text-teal-200"
};

const PUBLISH_STATUS_STYLES: Record<DestinationStatus, string> = {
  idle: "border-slate-700 bg-slate-800 text-slate-300",
  assigned: "border-slate-600 bg-slate-800 text-slate-200",
  queued: "border-amber-500/40 bg-amber-500/10 text-amber-200",
  publishing: "border-cyan-500/40 bg-cyan-500/10 text-cyan-200",
  published: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
  failed: "border-rose-500/40 bg-rose-500/10 text-rose-200"
};

export function DestinationBadge({ destination }: { destination: Destination }) {
  return (
    <span
      className={`shrink-0 rounded-md border px-2 py-0.5 text-[10px] uppercase tracking-wide ${DESTINATION_STYLES[destination]}`}
    >
      {destination}
    </span>
  );
}

export function PublishStatusBadge({ status }: { status: DestinationStatus }) {
  if (status === "idle") return null;
  return (
    <span
      className={`shrink-0 rounded-md border px-2 py-0.5 text-[10px] uppercase tracking-wide ${PUBLISH_STATUS_STYLES[status]}`}
    >
      {status}
    </span>
  );
}
