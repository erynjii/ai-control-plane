"use client";

import { FormEvent, useState } from "react";
import { MODEL_MODES, type ModelMode } from "@/lib/ai/model-mapping";
import type { ScanResult } from "@/lib/scan";
import type { Asset } from "@/lib/types";
import { RiskBadge } from "@/components/dashboard/risk-badge";

type Status = "idle" | "loading" | "success" | "error";
type SubmitStatus = "idle" | "loading" | "submitted" | "error";

type AIWorkspaceProps = {
  onAssetChanged?: () => void;
};

export function AIWorkspace({ onAssetChanged }: AIWorkspaceProps = {}) {
  const [prompt, setPrompt] = useState("");
  const [modelMode, setModelMode] = useState<ModelMode>("Auto");
  const [status, setStatus] = useState<Status>("idle");
  const [output, setOutput] = useState<string | null>(null);
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [asset, setAsset] = useState<Asset | null>(null);
  const [submitStatus, setSubmitStatus] = useState<SubmitStatus>("idle");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      setStatus("error");
      setErrorMessage("Prompt cannot be empty.");
      return;
    }

    setStatus("loading");
    setOutput(null);
    setScan(null);
    setAsset(null);
    setSubmitStatus("idle");
    setSubmitError(null);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: trimmedPrompt,
          modelMode
        })
      });

      const payload = (await response.json().catch(() => null)) as
        | { output?: string; scan?: ScanResult; asset?: Asset; error?: string }
        | null;

      if (!response.ok) {
        setStatus("error");
        setErrorMessage(payload?.error ?? "Failed to generate content.");
        return;
      }

      setOutput(payload?.output ?? "");
      setScan(payload?.scan ?? null);
      setAsset(payload?.asset ?? null);
      setStatus("success");
      onAssetChanged?.();
    } catch {
      setStatus("error");
      setErrorMessage("Network error. Please try again.");
    }
  };

  const handleSubmitForReview = async () => {
    if (!asset) return;

    setSubmitStatus("loading");
    setSubmitError(null);

    try {
      const response = await fetch(`/api/assets/${asset.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "pending_review" })
      });

      const payload = (await response.json().catch(() => null)) as
        | { asset?: Asset; error?: string }
        | null;

      if (!response.ok || !payload?.asset) {
        setSubmitStatus("error");
        setSubmitError(payload?.error ?? "Failed to submit for review.");
        return;
      }

      setAsset(payload.asset);
      setSubmitStatus("submitted");
      onAssetChanged?.();
    } catch {
      setSubmitStatus("error");
      setSubmitError("Network error. Please try again.");
    }
  };

  const isLoading = status === "loading";

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 md:p-5">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-slate-100">AI Workspace</h2>
        <p className="mt-1 text-sm text-slate-400">Draft and stage content before scanning and approval.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <label htmlFor="prompt" className="block text-sm font-medium text-slate-200">
          Prompt
        </label>
        <textarea
          id="prompt"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          disabled={isLoading}
          placeholder="Describe the content you want to generate..."
          className="min-h-36 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none disabled:opacity-60"
        />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="w-full max-w-xs">
            <label htmlFor="model-mode" className="mb-1 block text-sm font-medium text-slate-200">
              Model Mode
            </label>
            <select
              id="model-mode"
              value={modelMode}
              onChange={(event) => setModelMode(event.target.value as ModelMode)}
              disabled={isLoading}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-cyan-400 focus:outline-none disabled:opacity-60"
            >
              {MODEL_MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {mode}
                </option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? "Generating..." : "Generate"}
          </button>
        </div>
      </form>

      {status === "error" && errorMessage ? (
        <p className="mt-4 rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
          {errorMessage}
        </p>
      ) : null}

      {status === "success" && output !== null ? (
        <div className="mt-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Output</p>
            {scan ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">Risk</span>
                <RiskBadge risk={scan.riskLevel} />
              </div>
            ) : null}
          </div>
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100">
            {output || "No output returned."}
          </pre>
          {scan && scan.findings.length > 0 ? (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                Findings ({scan.findings.length})
              </p>
              <ul className="space-y-1">
                {scan.findings.map((finding, index) => (
                  <li
                    key={`${finding.rule}-${index}`}
                    className="flex items-center justify-between gap-2 rounded-md border border-slate-800 bg-slate-950 px-2 py-1 text-xs text-slate-300"
                  >
                    <span className="truncate">
                      <span className="text-slate-400">{finding.source}</span> · {finding.rule} ·{" "}
                      <span className="text-slate-100">{finding.match}</span>
                    </span>
                    <RiskBadge risk={finding.severity} />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {asset ? (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 pt-3">
              <p className="text-xs text-slate-400">
                Status: <span className="text-slate-200">{asset.status}</span>
              </p>
              {asset.status === "draft" ? (
                <button
                  type="button"
                  onClick={handleSubmitForReview}
                  disabled={submitStatus === "loading"}
                  className="rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-1.5 text-xs font-medium text-cyan-200 hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitStatus === "loading" ? "Submitting..." : "Submit for Review"}
                </button>
              ) : (
                <p className="text-xs text-slate-400">Submitted for review.</p>
              )}
            </div>
          ) : null}

          {submitStatus === "error" && submitError ? (
            <p className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
              {submitError}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
