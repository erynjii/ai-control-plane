"use client";

type MediaDetailsProps = {
  format?: string;
  resolution?: string;
  fileName?: string;
  fileSize?: string;
};

export function MediaDetails({
  format = "Instagram Feed Post (1:1)",
  resolution = "1080 × 1080",
  fileName = "post.jpg",
  fileSize = "—"
}: MediaDetailsProps) {
  const rows: Array<{ label: string; value: string }> = [
    { label: "Format", value: format },
    { label: "Resolution", value: resolution },
    { label: "File", value: fileName },
    { label: "Size", value: fileSize }
  ];

  return (
    <div className="rounded-xl border border-line-soft bg-canvas-card p-4">
      <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-500">
        Media Details
      </p>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-2">
        {rows.map((row) => (
          <div key={row.label} className="flex items-baseline justify-between gap-2">
            <dt className="text-xs text-ink-500">{row.label}</dt>
            <dd className="truncate text-xs font-medium text-ink-100" title={row.value}>
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
