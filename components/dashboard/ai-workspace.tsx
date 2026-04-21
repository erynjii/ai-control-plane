"use client";

import { FormEvent, useState } from "react";
import ReactMarkdown from "react-markdown";
import { MODEL_MODES, type ModelMode } from "@/lib/ai/model-mapping";
import type { ScanResult } from "@/lib/scan";
import type { Asset } from "@/lib/types";
import { RiskBadge } from "@/components/dashboard/risk-badge";

type Status = "idle" | "loading" | "success" | "error";
type SubmitStatus = "idle" | "loading" | "submitted" | "error";

const DEFAULT_SYSTEM_PROMPT = "You are a marketing content assistant.";

const MARKDOWN_COMPONENTS = {
  h1: ({ children }: { children?: React.ReactNode }) => (
    <h1 className="mb-2 mt-3 text-lg font-semibold text-slate-100">{children}</h1>
  ),
  h2: ({ children }: { children?: React.ReactNode }) => (
    <h2 className="mb-2 mt-3 text-base font-semibold text-slate-100">{children}</h2>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <h3 className="mb-1 mt-3 text-sm font-semibold text-slate-100">{children}</h3>
  ),
  p: ({ children }: { children?: React.ReactNode }) => <p className="mb-2 leading-relaxed">{children}</p>,
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="mb-2 list-disc space-y-1 pl-5">{children}</ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="mb-2 list-decimal space-y-1 pl-5">{children}</ol>
  ),
  code: ({ children }: { children?: React.ReactNode }) => (
    <code className="rounded bg-slate-900 px-1 py-0.5 text-xs">{children}</code>
  ),
  pre: ({ children }: { children?: React.ReactNode }) => (
    <pre className="mb-2 overflow-auto rounded bg-slate-900 p-2 text-xs">{children}</pre>
  ),
  a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
    <a href={href} className="text-cyan-300 underline" target="_blank" rel="noreferrer">
      {children}
    </a>
  ),
  blockquote: ({ children }: { children?: React.ReactNode }) => (
    <blockquote className="mb-2 border-l-2 border-slate-700 pl-3 text-slate-300">{children}</blockquote>
  )
};

type AIWorkspaceProps = {
  onAssetChanged?: () => void;
};

export function AIWorkspace({ onAssetChanged }: AIWorkspaceProps = {}) {
  const [prompt, setPrompt] = useState("");
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SYSTEM_PROMPT);
  const [systemPromptOpen, setSystemPromptOpen] = useState(false);
  const [modelMode, setModelMode] = useState<ModelMode>("Auto");
  const [status, setStatus] = useState<Status>("idle");
  const [output, setOutput] = useState<string | null>(null);
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [asset, setAsset] = useState<Asset | null>(null);
  const [submitStatus, setSubmitStatus] = useState<SubmitStatus>("idle");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      setStatus("error");
      setErrorMessage("Prompt cannot be empty.");
      return;
    }

    const trimmedSystemPrompt = systemPrompt.trim() || DEFAULT_SYSTEM_PROMPT;

    setStatus("loading");
    setOutput(null);
    setScan(null);
    setAsset(null);
    setSubmitStatus("idle");
    setSubmitError(null);
    setErrorMessage(null);
    setCopied(false);

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: trimmedPrompt,
          systemPrompt: trimmedSystemPrompt,
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

  const handleCopy = async () => {
    if (!output) return;
    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access denied; ignore.
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
        <div className="rounded-lg border border-slate-800 bg-slate-950/40">
          <button
            type="button"
            onClick={() => setSystemPromptOpen((open) => !open)}
            aria-expanded={systemPromptOpen}
            className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm font-medium text-slate-200 hover:text-slate-100"
          >
            <span>
              System Prompt
              {systemPrompt.trim() && systemPrompt.trim() !== DEFAULT_SYSTEM_PROMPT ? (
                <span className="ml-2 rounded-md border border-cyan-500/40 bg-cyan-500/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-cyan-200">
                  custom
                </span>
              ) : null}
            </span>
            <span aria-hidden className="text-xs text-slate-400">{systemPromptOpen ? "Hide" : "Show"}</span>
          </button>
          {systemPromptOpen ? (
            <div className="border-t border-slate-800 px-3 py-2">
              <textarea
                id="system-prompt"
                value={systemPrompt}
                onChange={(event) => setSystemPrompt(event.target.value)}
                disabled={isLoading}
                placeholder={DEFAULT_SYSTEM_PROMPT}
                className="min-h-20 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none disabled:opacity-60"
              />
              <div className="mt-2 flex items-center justify-between">
                <p className="text-xs text-slate-500">Sent as the system role to the model.</p>
                <button
                  type="button"
                  onClick={() => setSystemPrompt(DEFAULT_SYSTEM_PROMPT)}
                  disabled={isLoading || systemPrompt === DEFAULT_SYSTEM_PROMPT}
                  className="text-xs text-slate-400 hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Reset to default
                </button>
              </div>
            </div>
          ) : null}
        </div>

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
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Output</p>
            <div className="flex items-center gap-2">
              {scan ? (
                <>
                  <span className="text-xs text-slate-400">Risk</span>
                  <RiskBadge risk={scan.riskLevel} />
                </>
              ) : null}
              <button
                type="button"
                onClick={handleCopy}
                disabled={!output}
                className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200 hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>
          <div className="max-h-96 overflow-auto rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100">
            {output ? (
              <ReactMarkdown components={MARKDOWN_COMPONENTS}>{output}</ReactMarkdown>
            ) : (
              <p className="text-slate-400">No output returned.</p>
            )}
          </div>
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
