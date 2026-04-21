"use client";

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { MODEL_MODES, type ModelMode } from "@/lib/ai/model-mapping";
import type { ScanResult } from "@/lib/scan";
import type { Asset } from "@/lib/types";
import { RiskBadge } from "@/components/dashboard/risk-badge";

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

type UserTurn = { id: string; role: "user"; content: string };
type AssistantTurn = {
  id: string;
  role: "assistant";
  content: string;
  assetId: string;
  scan: ScanResult;
  promoted: boolean;
};
type ChatTurn = UserTurn | AssistantTurn;

type AIWorkspaceProps = {
  onAssetChanged?: () => void;
};

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function AIWorkspace({ onAssetChanged }: AIWorkspaceProps = {}) {
  const [messages, setMessages] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SYSTEM_PROMPT);
  const [systemPromptOpen, setSystemPromptOpen] = useState(false);
  const [modelMode, setModelMode] = useState<ModelMode>("Auto");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [promotingId, setPromotingId] = useState<string | null>(null);
  const [promoteError, setPromoteError] = useState<string | null>(null);

  const threadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = threadRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, isPending]);

  const sendMessage = async () => {
    const trimmed = input.trim();
    if (!trimmed || isPending) return;

    const userTurn: UserTurn = { id: newId(), role: "user", content: trimmed };
    const nextMessages: ChatTurn[] = [...messages, userTurn];

    setMessages(nextMessages);
    setInput("");
    setIsPending(true);
    setError(null);
    setPromoteError(null);

    const apiMessages = nextMessages.map(({ role, content }) => ({ role, content }));

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: apiMessages,
          systemPrompt: systemPrompt.trim() || DEFAULT_SYSTEM_PROMPT,
          modelMode
        })
      });

      const payload = (await response.json().catch(() => null)) as
        | { output?: string; asset?: Asset; scan?: ScanResult; error?: string }
        | null;

      if (!response.ok || !payload?.output || !payload.asset || !payload.scan) {
        setError(payload?.error ?? "Failed to get a response.");
        return;
      }

      const assistantTurn: AssistantTurn = {
        id: newId(),
        role: "assistant",
        content: payload.output,
        assetId: payload.asset.id,
        scan: payload.scan,
        promoted: payload.asset.promoted
      };
      setMessages((current) => [...current, assistantTurn]);
      onAssetChanged?.();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setIsPending(false);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    sendMessage();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  };

  const handleCopy = async (turnId: string, content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedId(turnId);
      window.setTimeout(() => {
        setCopiedId((current) => (current === turnId ? null : current));
      }, 2000);
    } catch {
      // Clipboard access denied; ignore.
    }
  };

  const handlePromote = async (turnId: string, assetId: string) => {
    setPromotingId(turnId);
    setPromoteError(null);

    try {
      const response = await fetch(`/api/assets/${assetId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ promoted: true, status: "pending_review" })
      });
      const payload = (await response.json().catch(() => null)) as
        | { asset?: Asset; error?: string }
        | null;

      if (!response.ok || !payload?.asset) {
        setPromoteError(payload?.error ?? "Failed to save as asset.");
        return;
      }

      setMessages((current) =>
        current.map((turn) => (turn.id === turnId && turn.role === "assistant" ? { ...turn, promoted: true } : turn))
      );
      onAssetChanged?.();
    } catch {
      setPromoteError("Network error. Please try again.");
    } finally {
      setPromotingId(null);
    }
  };

  const isSystemPromptCustom = systemPrompt.trim() && systemPrompt.trim() !== DEFAULT_SYSTEM_PROMPT;

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-900/70 p-4 md:p-5">
      <div>
        <h2 className="text-lg font-semibold text-slate-100">AI Workspace</h2>
        <p className="mt-1 text-sm text-slate-400">
          Iterate in chat. Save responses that matter as assets to route them through review.
        </p>
      </div>

      <div className="rounded-lg border border-slate-800 bg-slate-950/40">
        <button
          type="button"
          onClick={() => setSystemPromptOpen((open) => !open)}
          aria-expanded={systemPromptOpen}
          className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm font-medium text-slate-200 hover:text-slate-100"
        >
          <span>
            System Prompt
            {isSystemPromptCustom ? (
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
              disabled={isPending}
              placeholder={DEFAULT_SYSTEM_PROMPT}
              className="min-h-20 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none disabled:opacity-60"
            />
            <div className="mt-2 flex items-center justify-between">
              <p className="text-xs text-slate-500">Applied to the whole thread.</p>
              <button
                type="button"
                onClick={() => setSystemPrompt(DEFAULT_SYSTEM_PROMPT)}
                disabled={isPending || systemPrompt === DEFAULT_SYSTEM_PROMPT}
                className="text-xs text-slate-400 hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Reset to default
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <div
        ref={threadRef}
        className="flex h-[28rem] flex-col gap-3 overflow-y-auto rounded-lg border border-slate-800 bg-slate-950/50 p-3"
        aria-live="polite"
      >
        {messages.length === 0 && !isPending ? (
          <p className="m-auto text-sm text-slate-500">Start the conversation below.</p>
        ) : null}

        {messages.map((turn) =>
          turn.role === "user" ? (
            <div key={turn.id} className="flex justify-end">
              <div className="max-w-[80%] whitespace-pre-wrap rounded-lg bg-cyan-500/15 px-3 py-2 text-sm text-cyan-100">
                {turn.content}
              </div>
            </div>
          ) : (
            <div key={turn.id} className="flex flex-col gap-1.5">
              <div className="max-w-[90%] rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100">
                <ReactMarkdown components={MARKDOWN_COMPONENTS}>{turn.content}</ReactMarkdown>
              </div>
              <div className="flex items-center gap-2 pl-1 text-xs">
                <RiskBadge risk={turn.scan.riskLevel} />
                <button
                  type="button"
                  onClick={() => handleCopy(turn.id, turn.content)}
                  className="text-slate-400 hover:text-slate-200"
                >
                  {copiedId === turn.id ? "Copied" : "Copy"}
                </button>
                <span className="text-slate-700">·</span>
                <button
                  type="button"
                  onClick={() => handlePromote(turn.id, turn.assetId)}
                  disabled={turn.promoted || promotingId === turn.id}
                  className={`transition ${
                    turn.promoted
                      ? "text-emerald-300"
                      : "text-cyan-300 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
                  }`}
                >
                  {turn.promoted ? "Saved as asset" : promotingId === turn.id ? "Saving..." : "Save as Asset"}
                </button>
              </div>
            </div>
          )
        )}

        {isPending ? (
          <div className="flex justify-start">
            <div className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-400">
              Thinking...
            </div>
          </div>
        ) : null}

        {error ? (
          <div className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
            {error}
          </div>
        ) : null}
      </div>

      {promoteError ? (
        <p className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
          {promoteError}
        </p>
      ) : null}

      <form onSubmit={handleSubmit} className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isPending}
          rows={1}
          placeholder="Message the assistant... (Enter to send, Shift+Enter for newline)"
          className="min-h-[42px] w-full flex-1 resize-none rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none disabled:opacity-60"
        />
        <div className="flex items-center gap-2">
          <label htmlFor="model-mode" className="sr-only">
            Model Mode
          </label>
          <select
            id="model-mode"
            value={modelMode}
            onChange={(event) => setModelMode(event.target.value as ModelMode)}
            disabled={isPending}
            className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-sm text-slate-100 focus:border-cyan-400 focus:outline-none disabled:opacity-60"
          >
            {MODEL_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {mode}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={isPending || !input.trim()}
            className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? "Sending..." : "Send"}
          </button>
        </div>
      </form>
    </section>
  );
}
