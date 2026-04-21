"use client";

import { Check } from "lucide-react";

type StepKey = "draft" | "pending_review" | "approved" | "published";

type Step = {
  key: StepKey;
  label: string;
  description: string;
};

const STEPS: Step[] = [
  { key: "draft", label: "Draft", description: "Content is being created" },
  { key: "pending_review", label: "Pending Approval", description: "Waiting for review" },
  { key: "approved", label: "Approved", description: "Ready to publish" },
  { key: "published", label: "Published", description: "Live on Instagram" }
];

type ProgressStepperProps = {
  status: string;
  failed?: boolean;
};

function resolveStep(status: string): StepKey {
  if (status === "published") return "published";
  if (status === "approved" || status === "queued" || status === "failed") return "approved";
  if (status === "pending_review") return "pending_review";
  return "draft";
}

export function ProgressStepper({ status, failed = false }: ProgressStepperProps) {
  const currentKey = resolveStep(status);
  const currentIndex = STEPS.findIndex((s) => s.key === currentKey);

  return (
    <div className="flex items-start gap-2">
      {STEPS.map((step, idx) => {
        const isCompleted = idx < currentIndex;
        const isCurrent = idx === currentIndex;
        const isFailedCurrent = failed && isCurrent;
        const isFuture = idx > currentIndex;

        const circleClass = isFailedCurrent
          ? "bg-signal-danger/15 border-signal-danger text-signal-danger"
          : isCompleted
          ? "bg-signal-success/15 border-signal-success text-signal-success"
          : isCurrent
          ? "bg-accent-cyan/15 border-accent-cyan text-accent-cyan"
          : "bg-canvas-input border-line-soft text-ink-500";

        const labelClass = isCompleted || isCurrent ? "text-ink-100" : "text-ink-500";
        const subClass = isCurrent ? "text-ink-400" : "text-ink-500";

        return (
          <div key={step.key} className="flex flex-1 items-start gap-2">
            <div className="flex flex-col items-center">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full border-2 ${circleClass}`}
              >
                {isCompleted ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <span
                    className={`h-2 w-2 rounded-full ${
                      isCurrent
                        ? "bg-accent-cyan"
                        : isFailedCurrent
                        ? "bg-signal-danger"
                        : "bg-transparent"
                    }`}
                  />
                )}
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <p className={`text-xs font-semibold ${labelClass}`}>{step.label}</p>
              <p className={`mt-0.5 text-[10px] ${subClass}`}>{step.description}</p>
            </div>
            {idx < STEPS.length - 1 ? (
              <div className="mt-[13px] h-px flex-1 bg-line-soft" aria-hidden />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
