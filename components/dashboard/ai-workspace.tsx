"use client";

import { FormEvent, useState } from "react";
import { getAccessToken } from "@/lib/supabase/auth";
import { MODEL_MODES, type ModelMode } from "@/lib/ai/model-mapping";

type Status = "idle" | "loading" | "success" | "error";

type AIWorkspaceProps = {
  onGenerated?: () => void;
};

export function AIWorkspace({ onGenerated }: AIWorkspaceProps = {}) {
  const [prompt, setPrompt] = useState("");
  const [modelMode, setModelMode] = useState<ModelMode>("Auto");
  const [status, setStatus] = useState<Status>("idle");
  const [output, setOutput] = useState<string | null>(null);
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
    setErrorMessage(null);

    const { accessToken, error: sessionError } = await getAccessToken();

    if (sessionError || !accessToken) {
      setStatus("error");
      setErrorMessage("You must be signed in to generate content.");
      return;
    }

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: trimmedPrompt,
          modelMode,
          accessToken
        })
      });

      const payload = (await response.json().catch(() => null)) as
        | { output?: string; error?: string }
        | null;

      if (!response.ok) {
        setStatus("error");
        setErrorMessage(payload?.error ?? "Failed to generate content.");
        return;
      }

      setOutput(payload?.output ?? "");
      setStatus("success");
      onGenerated?.();
    } catch {
      setStatus("error");
      setErrorMessage("Network error. Please try again.");
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
        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Output</p>
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100">
            {output || "No output returned."}
          </pre>
        </div>
      ) : null}
    </section>
  );
}
