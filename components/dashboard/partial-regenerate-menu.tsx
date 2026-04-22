"use client";

import { useState } from "react";
import { MoreVertical, PenTool, Camera, Sparkles, X, type LucideIcon } from "lucide-react";
import type { StrategyBrief } from "@/lib/agents/types";

// Kebab menu next to Approve/Reject on an approval card. Three actions:
//   - Regenerate caption  → POST /api/assets/:id/regenerate?step=copy
//   - Regenerate image    → POST /api/assets/:id/regenerate?step=photo
//   - Adjust strategy     → opens a modal to edit the brief, then POSTs
//                           step=strategy with briefOverride.
//
// Cost estimates surface as tooltips on each action.

type Step = "copy" | "photo" | "strategy";

interface MenuItem {
  step: Step;
  label: string;
  icon: LucideIcon;
  /** Approx cost for the downstream agents that will re-run. Static for
   *  the MVP; if the app grows a per-account pricing source these become
   *  a quick derivation. */
  estimatedCost: string;
  tooltip: string;
}

const MENU_ITEMS: MenuItem[] = [
  {
    step: "copy",
    label: "Regenerate caption",
    icon: PenTool,
    estimatedCost: "~$0.15",
    tooltip: "Re-runs copy + brand + compliance. Image is preserved. (~$0.15)"
  },
  {
    step: "photo",
    label: "Regenerate image",
    icon: Camera,
    estimatedCost: "~$0.06",
    tooltip: "Re-runs photo + compliance. Caption is preserved. (~$0.06)"
  },
  {
    step: "strategy",
    label: "Adjust strategy & regenerate",
    icon: Sparkles,
    estimatedCost: "~$0.25",
    tooltip: "Edit the brief and cascade through copy + photo + brand + compliance. (~$0.25)"
  }
];

export interface PartialRegenerateMenuProps {
  assetId: string;
  /** Current brief — used to pre-fill the "Adjust strategy" modal. */
  brief: StrategyBrief | undefined;
  /** Fires after the regenerate endpoint responds successfully. Callers
   *  can bump a refreshKey or re-fetch card data. */
  onRegenerated?: (result: { runId: string; runSetAgents: string[] }) => void;
  /** Disable the menu entirely (e.g. v1 cards that can't regenerate). */
  disabled?: boolean;
}

export function PartialRegenerateMenu({
  assetId,
  brief,
  onRegenerated,
  disabled = false
}: PartialRegenerateMenuProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [strategyOpen, setStrategyOpen] = useState(false);
  const [pendingStep, setPendingStep] = useState<Step | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async (step: Step, briefOverride?: StrategyBrief) => {
    setError(null);
    setPendingStep(step);
    try {
      const res = await fetch(
        `/api/assets/${encodeURIComponent(assetId)}/regenerate?step=${step}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(briefOverride ? { briefOverride } : {})
        }
      );
      const payload = (await res.json().catch(() => null)) as {
        ok?: boolean;
        runId?: string;
        runSetAgents?: string[];
        error?: string;
      } | null;
      if (!res.ok || !payload?.ok || !payload.runId) {
        setError(payload?.error ?? `Regenerate ${step} failed.`);
        return;
      }
      onRegenerated?.({ runId: payload.runId, runSetAgents: payload.runSetAgents ?? [] });
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setPendingStep(null);
    }
  };

  const handleMenuClick = (step: Step) => {
    setMenuOpen(false);
    if (step === "strategy") {
      setStrategyOpen(true);
      return;
    }
    void submit(step);
  };

  return (
    <div className="relative inline-flex items-start">
      <button
        type="button"
        onClick={() => setMenuOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-label="More regenerate options"
        disabled={disabled || pendingStep !== null}
        className="rounded-md border border-line-soft p-1.5 text-ink-400 hover:bg-canvas-hover hover:text-ink-100 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <MoreVertical className="h-4 w-4" />
      </button>

      {menuOpen ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-20 mt-1 w-64 overflow-hidden rounded-lg border border-line-soft bg-canvas-card shadow-xl"
        >
          {MENU_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.step}
                type="button"
                role="menuitem"
                title={item.tooltip}
                onClick={() => handleMenuClick(item.step)}
                disabled={item.step === "strategy" && !brief}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-ink-100 hover:bg-canvas-hover disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Icon className="h-4 w-4 text-ink-400" />
                <span className="flex-1">{item.label}</span>
                <span className="text-[10px] text-ink-500">{item.estimatedCost}</span>
              </button>
            );
          })}
        </div>
      ) : null}

      {error ? (
        <p className="absolute right-0 top-full z-10 mt-1 w-64 rounded-md border border-signal-danger/40 bg-signal-danger/10 px-2 py-1 text-[10px] text-signal-danger">
          {error}
        </p>
      ) : null}

      {strategyOpen && brief ? (
        <AdjustStrategyModal
          brief={brief}
          submitting={pendingStep === "strategy"}
          onClose={() => setStrategyOpen(false)}
          onSubmit={async (override) => {
            await submit("strategy", override);
            setStrategyOpen(false);
          }}
        />
      ) : null}

      {pendingStep && pendingStep !== "strategy" ? (
        <span className="pointer-events-none absolute right-10 top-1 text-[10px] text-ink-500">
          Regenerating…
        </span>
      ) : null}
    </div>
  );
}

interface AdjustStrategyModalProps {
  brief: StrategyBrief;
  submitting: boolean;
  onSubmit: (override: StrategyBrief) => Promise<void> | void;
  onClose: () => void;
}

function AdjustStrategyModal({ brief, submitting, onSubmit, onClose }: AdjustStrategyModalProps) {
  const [audience, setAudience] = useState(brief.audience);
  const [tone, setTone] = useState(brief.tone);
  const [ctaType, setCtaType] = useState(brief.cta.type);
  const [ctaText, setCtaText] = useState(brief.cta.text);
  const [visualConcept, setVisualConcept] = useState(brief.visualConcept);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const override: StrategyBrief = {
      ...brief,
      audience: audience.trim(),
      tone: tone.trim(),
      cta: { type: ctaType.trim(), text: ctaText.trim() },
      visualConcept: visualConcept.trim()
    };
    void onSubmit(override);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Adjust strategy and regenerate"
      className="fixed inset-0 z-50 flex items-center justify-center bg-canvas-base/70 p-4"
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-lg overflow-hidden rounded-xl border border-line-soft bg-canvas-card shadow-2xl"
      >
        <header className="flex items-center justify-between border-b border-line-soft px-4 py-3">
          <h2 className="text-sm font-semibold text-ink-100">Adjust strategy</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="rounded-md p-1 text-ink-400 hover:bg-canvas-hover hover:text-ink-100"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="space-y-3 p-4">
          <LabeledField label="Audience" id="adj-audience">
            <input
              id="adj-audience"
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
              className="w-full rounded-md border border-line-soft bg-canvas-input px-2 py-1 text-xs text-ink-100"
              required
            />
          </LabeledField>
          <LabeledField label="Tone" id="adj-tone">
            <input
              id="adj-tone"
              value={tone}
              onChange={(e) => setTone(e.target.value)}
              className="w-full rounded-md border border-line-soft bg-canvas-input px-2 py-1 text-xs text-ink-100"
              required
            />
          </LabeledField>
          <LabeledField label="CTA type" id="adj-cta-type">
            <input
              id="adj-cta-type"
              value={ctaType}
              onChange={(e) => setCtaType(e.target.value)}
              className="w-full rounded-md border border-line-soft bg-canvas-input px-2 py-1 text-xs text-ink-100"
              required
            />
          </LabeledField>
          <LabeledField label="CTA text" id="adj-cta-text">
            <input
              id="adj-cta-text"
              value={ctaText}
              onChange={(e) => setCtaText(e.target.value)}
              className="w-full rounded-md border border-line-soft bg-canvas-input px-2 py-1 text-xs text-ink-100"
              required
            />
          </LabeledField>
          <LabeledField label="Visual concept" id="adj-visual">
            <textarea
              id="adj-visual"
              value={visualConcept}
              onChange={(e) => setVisualConcept(e.target.value)}
              rows={3}
              className="w-full resize-none rounded-md border border-line-soft bg-canvas-input px-2 py-1 text-xs text-ink-100"
              required
            />
          </LabeledField>
        </div>
        <footer className="flex items-center justify-end gap-2 border-t border-line-soft px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-line-soft px-3 py-1.5 text-xs text-ink-300 hover:bg-canvas-hover"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-accent-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Regenerating…" : "Regenerate"}
          </button>
        </footer>
      </form>
    </div>
  );
}

function LabeledField({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return (
    <label htmlFor={id} className="flex flex-col gap-1 text-[10px] uppercase tracking-wide text-ink-500">
      {label}
      {children}
    </label>
  );
}
