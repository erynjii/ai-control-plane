"use client";

import { FormEvent, useState } from "react";

export function AIWorkspace() {
  const [prompt, setPrompt] = useState("");
  const [modelMode, setModelMode] = useState("Auto");

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
  };

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
          placeholder="Describe the content you want to generate..."
          className="min-h-36 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
        />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="w-full max-w-xs">
            <label htmlFor="model-mode" className="mb-1 block text-sm font-medium text-slate-200">
              Model Mode
            </label>
            <select
              id="model-mode"
              value={modelMode}
              onChange={(event) => setModelMode(event.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-cyan-400 focus:outline-none"
            >
              <option>Auto</option>
              <option>Fast</option>
              <option>Balanced</option>
              <option>High Quality</option>
            </select>
          </div>

          <button
            type="submit"
            className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-cyan-400"
          >
            Generate
          </button>
        </div>
      </form>
    </section>
  );
}
