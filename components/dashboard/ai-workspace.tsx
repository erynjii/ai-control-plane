"use client";

import { ChangeEvent, FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { MODEL_MODES, type ModelMode } from "@/lib/ai/model-mapping";
import type { ScanResult, Severity } from "@/lib/scan";
import type { Asset, MediaType } from "@/lib/types";
import { DESTINATIONS, type Destination, type DestinationStatus } from "@/lib/integrations/types";
import { RiskBadge } from "@/components/dashboard/risk-badge";
import {
  DestinationBadge,
  PublishStatusBadge,
  StatusBadge
} from "@/components/dashboard/destination-badge";
import { InstagramPreview } from "@/components/dashboard/instagram-preview";

type ChatMode = "chat" | "instagram";

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

type UserTurn = { id: string; role: "user"; content: string; timestamp: string };
type AssistantTurn = {
  id: string;
  role: "assistant";
  content: string;
  timestamp: string;
  assetId: string;
  scan: ScanResult;
  promoted: boolean;
  status: string;
  destination: Destination | null;
  destinationStatus: DestinationStatus;
  failureReason: string | null;
  mediaUrl: string | null;
  mediaType: MediaType | null;
  mediaPrompt: string | null;
};
type ChatTurn = UserTurn | AssistantTurn;

type AIWorkspaceProps = {
  conversationId: string | null;
  onConversationCreated?: (id: string) => void;
  onAssetChanged?: () => void;
};

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function buildTurnsFromAssets(assets: Asset[]): ChatTurn[] {
  const turns: ChatTurn[] = [];
  for (const asset of assets) {
    turns.push({
      id: `${asset.id}-user`,
      role: "user",
      content: asset.prompt,
      timestamp: asset.created_at
    });
    turns.push({
      id: `${asset.id}-assistant`,
      role: "assistant",
      content: asset.output,
      timestamp: asset.created_at,
      assetId: asset.id,
      scan: {
        riskLevel: (asset.risk_level as Severity) || "low",
        findings: asset.scan_findings ?? []
      },
      promoted: asset.promoted,
      status: asset.status,
      destination: asset.destination,
      destinationStatus: asset.destination_status,
      failureReason: asset.failure_reason,
      mediaUrl: asset.media_url,
      mediaType: asset.media_type,
      mediaPrompt: asset.media_prompt
    });
  }
  return turns;
}

export function AIWorkspace({ conversationId: initialConversationId, onConversationCreated, onAssetChanged }: AIWorkspaceProps) {
  const [conversationId, setConversationId] = useState<string | null>(initialConversationId);
  const [messages, setMessages] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SYSTEM_PROMPT);
  const [systemPromptOpen, setSystemPromptOpen] = useState(false);
  const [modelMode, setModelMode] = useState<ModelMode>("Auto");
  const [chatMode, setChatMode] = useState<ChatMode>("chat");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isHydrating, setIsHydrating] = useState(Boolean(initialConversationId));

  const threadRef = useRef<HTMLDivElement>(null);

  // Hydrate thread from an existing conversation.
  useEffect(() => {
    let cancelled = false;
    if (!initialConversationId) {
      setIsHydrating(false);
      return;
    }
    setIsHydrating(true);
    (async () => {
      try {
        const response = await fetch(`/api/conversations/${initialConversationId}`);
        if (!response.ok || cancelled) return;
        const payload = (await response.json().catch(() => null)) as
          | { assets?: Asset[] }
          | null;
        if (cancelled) return;
        const assets = payload?.assets ?? [];
        setMessages(buildTurnsFromAssets(assets));
        // If the loaded conversation has assets, pick up its system prompt from the first one.
        const firstSystemPrompt = assets[0]?.system_prompt;
        if (firstSystemPrompt) setSystemPrompt(firstSystemPrompt);
      } catch {
        // Ignore; thread stays empty.
      } finally {
        if (!cancelled) setIsHydrating(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialConversationId]);

  useEffect(() => {
    const el = threadRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, isPending]);

  const turnFromAsset = (asset: Asset, scan: ScanResult): AssistantTurn => ({
    id: newId(),
    role: "assistant",
    content: asset.output,
    timestamp: asset.created_at,
    assetId: asset.id,
    scan,
    promoted: asset.promoted,
    status: asset.status,
    destination: asset.destination,
    destinationStatus: asset.destination_status,
    failureReason: asset.failure_reason,
    mediaUrl: asset.media_url,
    mediaType: asset.media_type,
    mediaPrompt: asset.media_prompt
  });

  const sendChatMessage = async (userTurn: UserTurn, nextMessages: ChatTurn[]) => {
    const apiMessages = nextMessages.map(({ role, content }) => ({ role, content }));

    const response = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: apiMessages,
        systemPrompt: systemPrompt.trim() || DEFAULT_SYSTEM_PROMPT,
        modelMode,
        conversationId: conversationId ?? undefined
      })
    });

    const payload = (await response.json().catch(() => null)) as
      | { output?: string; asset?: Asset; scan?: ScanResult; conversationId?: string; error?: string }
      | null;

    if (!response.ok || !payload?.output || !payload.asset || !payload.scan) {
      setError(payload?.error ?? "Failed to get a response.");
      return;
    }

    setMessages((current) => [...current, turnFromAsset(payload.asset!, payload.scan!)]);

    if (payload.conversationId && payload.conversationId !== conversationId) {
      setConversationId(payload.conversationId);
      onConversationCreated?.(payload.conversationId);
    }
    onAssetChanged?.();
    void userTurn;
  };

  const sendInstagramPost = async (userTurn: UserTurn) => {
    const response = await fetch("/api/generate-post", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: userTurn.content,
        modelMode,
        conversationId: conversationId ?? undefined
      })
    });

    const payload = (await response.json().catch(() => null)) as
      | {
          output?: string;
          imageUrl?: string;
          imagePrompt?: string;
          asset?: Asset;
          scan?: ScanResult;
          conversationId?: string;
          error?: string;
        }
      | null;

    if (!response.ok || !payload?.asset || !payload.scan) {
      setError(payload?.error ?? "Failed to generate Instagram post.");
      return;
    }

    setMessages((current) => [...current, turnFromAsset(payload.asset!, payload.scan!)]);

    if (payload.conversationId && payload.conversationId !== conversationId) {
      setConversationId(payload.conversationId);
      onConversationCreated?.(payload.conversationId);
    }
    onAssetChanged?.();
  };

  const sendMessage = async () => {
    const trimmed = input.trim();
    if (!trimmed || isPending) return;

    const userTurn: UserTurn = {
      id: newId(),
      role: "user",
      content: trimmed,
      timestamp: new Date().toISOString()
    };
    const nextMessages: ChatTurn[] = [...messages, userTurn];

    setMessages(nextMessages);
    setInput("");
    setIsPending(true);
    setError(null);
    setActionError(null);

    try {
      if (chatMode === "instagram") {
        await sendInstagramPost(userTurn);
      } else {
        await sendChatMessage(userTurn, nextMessages);
      }
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

  const applyAssetToTurn = (turnId: string, updated: Asset) => {
    setMessages((current) =>
      current.map((turn) =>
        turn.id === turnId && turn.role === "assistant"
          ? {
              ...turn,
              content: updated.output,
              promoted: updated.promoted,
              status: updated.status,
              destination: updated.destination,
              destinationStatus: updated.destination_status,
              failureReason: updated.failure_reason,
              mediaUrl: updated.media_url,
              mediaType: updated.media_type,
              mediaPrompt: updated.media_prompt
            }
          : turn
      )
    );
  };

  const patchAsset = async (
    turnId: string,
    assetId: string,
    body: { promoted?: boolean; status?: string }
  ) => {
    setPendingActionId(turnId);
    setActionError(null);
    try {
      const response = await fetch(`/api/assets/${assetId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const payload = (await response.json().catch(() => null)) as
        | { asset?: Asset; error?: string }
        | null;
      if (!response.ok || !payload?.asset) {
        setActionError(payload?.error ?? "Action failed.");
        return;
      }
      applyAssetToTurn(turnId, payload.asset);
      onAssetChanged?.();
    } catch {
      setActionError("Network error. Please try again.");
    } finally {
      setPendingActionId(null);
    }
  };

  const handleSaveAsAsset = (turnId: string, assetId: string) => patchAsset(turnId, assetId, { promoted: true });
  const handleSendToApproval = (turnId: string, assetId: string) =>
    patchAsset(turnId, assetId, { promoted: true, status: "pending_review" });

  const handleAssignDestination = async (
    turnId: string,
    assetId: string,
    destination: Destination
  ) => {
    setPendingActionId(turnId);
    setActionError(null);
    try {
      const response = await fetch(`/api/assets/${assetId}/destination`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ destination })
      });
      const payload = (await response.json().catch(() => null)) as
        | { asset?: Asset; error?: string }
        | null;
      if (!response.ok || !payload?.asset) {
        setActionError(payload?.error ?? "Failed to assign destination.");
        return;
      }
      applyAssetToTurn(turnId, payload.asset);
      onAssetChanged?.();
    } catch {
      setActionError("Network error. Please try again.");
    } finally {
      setPendingActionId(null);
    }
  };

  const setTurnDestinationStatus = (turnId: string, nextStatus: DestinationStatus) => {
    setMessages((current) =>
      current.map((turn) =>
        turn.id === turnId && turn.role === "assistant"
          ? {
              ...turn,
              destinationStatus: nextStatus,
              status:
                nextStatus === "published"
                  ? "published"
                  : nextStatus === "failed"
                  ? "failed"
                  : nextStatus === "queued" || nextStatus === "publishing"
                  ? "queued"
                  : turn.status,
              failureReason: nextStatus === "failed" ? turn.failureReason : null
            }
          : turn
      )
    );
  };

  const runPublishFlow = async (
    turnId: string,
    assetId: string,
    endpoint: "publish" | "retry"
  ) => {
    setPendingActionId(turnId);
    setActionError(null);
    setTurnDestinationStatus(turnId, "queued");

    const publishingTimer = window.setTimeout(() => {
      setTurnDestinationStatus(turnId, "publishing");
    }, 1000);

    try {
      const response = await fetch(`/api/assets/${assetId}/${endpoint}`, { method: "POST" });
      const payload = (await response.json().catch(() => null)) as
        | { asset?: Asset; error?: string }
        | null;
      window.clearTimeout(publishingTimer);
      if (!response.ok || !payload?.asset) {
        setActionError(payload?.error ?? "Publish failed.");
        return;
      }
      applyAssetToTurn(turnId, payload.asset);
      onAssetChanged?.();
    } catch {
      window.clearTimeout(publishingTimer);
      setActionError("Network error. Please try again.");
    } finally {
      setPendingActionId(null);
    }
  };

  const handlePublish = (turnId: string, assetId: string) => runPublishFlow(turnId, assetId, "publish");
  const handleRetry = (turnId: string, assetId: string) => runPublishFlow(turnId, assetId, "retry");

  const patchAssetFields = async (
    turnId: string,
    assetId: string,
    body: Record<string, unknown>
  ) => {
    const response = await fetch(`/api/assets/${assetId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const payload = (await response.json().catch(() => null)) as
      | { asset?: Asset; error?: string }
      | null;
    if (!response.ok || !payload?.asset) {
      setActionError(payload?.error ?? "Update failed.");
      return null;
    }
    applyAssetToTurn(turnId, payload.asset);
    onAssetChanged?.();
    return payload.asset;
  };

  const handleRegenerateImage = async (turnId: string, assetId: string, mediaPrompt: string | null) => {
    setPendingActionId(turnId);
    setActionError(null);
    try {
      const response = await fetch("/api/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: mediaPrompt ?? "Regenerate the image with a fresh creative direction.",
          assetId
        })
      });
      const payload = (await response.json().catch(() => null)) as
        | { imageUrl?: string; prompt?: string; error?: string }
        | null;
      if (!response.ok || !payload?.imageUrl) {
        setActionError(payload?.error ?? "Image regeneration failed.");
        return;
      }
      await patchAssetFields(turnId, assetId, {
        media_url: payload.imageUrl,
        media_type: "image",
        media_prompt: payload.prompt ?? mediaPrompt
      });
    } catch {
      setActionError("Network error. Please try again.");
    } finally {
      setPendingActionId(null);
    }
  };

  const handleEditCaption = async (turnId: string, assetId: string, caption: string) => {
    setPendingActionId(turnId);
    setActionError(null);
    try {
      await patchAssetFields(turnId, assetId, { output: caption });
    } catch {
      setActionError("Network error. Please try again.");
    } finally {
      setPendingActionId(null);
    }
  };

  const handleUploadMedia = async (turnId: string, assetId: string, file: File) => {
    setPendingActionId(turnId);
    setActionError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("assetId", assetId);
      const response = await fetch("/api/upload-media", { method: "POST", body: formData });
      const payload = (await response.json().catch(() => null)) as
        | { mediaUrl?: string; mediaType?: "image" | "video"; error?: string }
        | null;
      if (!response.ok || !payload?.mediaUrl || !payload.mediaType) {
        setActionError(payload?.error ?? "Upload failed.");
        return;
      }
      await patchAssetFields(turnId, assetId, {
        media_url: payload.mediaUrl,
        media_type: payload.mediaType
      });
    } catch {
      setActionError("Network error. Please try again.");
    } finally {
      setPendingActionId(null);
    }
  };

  const isSystemPromptCustom = systemPrompt.trim() && systemPrompt.trim() !== DEFAULT_SYSTEM_PROMPT;

  return (
    <section className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-slate-800 px-1 pb-3">
        <button
          type="button"
          onClick={() => setSystemPromptOpen((open) => !open)}
          aria-expanded={systemPromptOpen}
          className="flex items-center gap-2 text-xs font-medium text-slate-400 hover:text-slate-200"
        >
          <span>System Prompt</span>
          {isSystemPromptCustom ? (
            <span className="rounded-md border border-cyan-500/40 bg-cyan-500/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-cyan-200">
              custom
            </span>
          ) : null}
          <span aria-hidden className="text-[10px] text-slate-500">
            {systemPromptOpen ? "Hide" : "Show"}
          </span>
        </button>
      </div>

      {systemPromptOpen ? (
        <div className="mt-2 rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2">
          <textarea
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

      <div
        ref={threadRef}
        className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto py-4"
        aria-live="polite"
      >
        {isHydrating ? (
          <p className="m-auto text-sm text-slate-500">Loading conversation...</p>
        ) : messages.length === 0 && !isPending ? (
          <p className="m-auto text-sm text-slate-500">Start the conversation below.</p>
        ) : null}

        {messages.map((turn) => (turn.role === "user" ? <UserBubble key={turn.id} turn={turn} /> : (
          <AssistantBubble
            key={turn.id}
            turn={turn}
            copied={copiedId === turn.id}
            pending={pendingActionId === turn.id}
            onCopy={() => handleCopy(turn.id, turn.content)}
            onSaveAsAsset={() => handleSaveAsAsset(turn.id, turn.assetId)}
            onSendToApproval={() => handleSendToApproval(turn.id, turn.assetId)}
            onAssignDestination={(destination) => handleAssignDestination(turn.id, turn.assetId, destination)}
            onPublish={() => handlePublish(turn.id, turn.assetId)}
            onRetry={() => handleRetry(turn.id, turn.assetId)}
            onRegenerateImage={() => handleRegenerateImage(turn.id, turn.assetId, turn.mediaPrompt)}
            onEditCaption={(caption) => handleEditCaption(turn.id, turn.assetId, caption)}
            onUploadMedia={(file) => handleUploadMedia(turn.id, turn.assetId, file)}
          />
        )))}

        {isPending ? (
          <div className="flex items-start gap-2">
            <Avatar role="assistant" />
            {chatMode === "instagram" ? (
              <InstagramPreview loading caption="Generating caption and image…" size="compact" />
            ) : (
              <div className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-400">
                Thinking...
              </div>
            )}
          </div>
        ) : null}

        {error ? (
          <div className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
            {error}
          </div>
        ) : null}
      </div>

      {actionError ? (
        <p className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
          {actionError}
        </p>
      ) : null}

      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        <div
          role="tablist"
          aria-label="Chat mode"
          className="inline-flex w-fit rounded-lg border border-slate-700 bg-slate-950 p-0.5 text-xs"
        >
          {(["chat", "instagram"] as const).map((mode) => {
            const isActive = chatMode === mode;
            return (
              <button
                key={mode}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setChatMode(mode)}
                disabled={isPending}
                className={`rounded-md px-3 py-1 font-medium transition ${
                  isActive
                    ? "bg-cyan-500 text-slate-950"
                    : "text-slate-300 hover:text-slate-100"
                } disabled:cursor-not-allowed disabled:opacity-60`}
              >
                {mode === "chat" ? "Chat" : "Instagram Post"}
              </button>
            );
          })}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isPending}
            rows={1}
            placeholder={
              chatMode === "instagram"
                ? "Describe the Instagram post you want to create…"
                : "Message the assistant... (Enter to send, Shift+Enter for newline)"
            }
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
              {isPending ? (chatMode === "instagram" ? "Creating…" : "Sending...") : "Send"}
            </button>
          </div>
        </div>
      </form>
    </section>
  );
}

function Avatar({ role }: { role: "user" | "assistant" }) {
  return role === "user" ? (
    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-cyan-500/20 text-[11px] font-semibold text-cyan-200">
      You
    </div>
  ) : (
    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-slate-700 bg-slate-950 text-[11px] font-semibold text-slate-300">
      AI
    </div>
  );
}

function UserBubble({ turn }: { turn: UserTurn }) {
  return (
    <div className="flex flex-row-reverse items-start gap-2">
      <Avatar role="user" />
      <div className="flex max-w-[80%] flex-col items-end gap-1">
        <div className="whitespace-pre-wrap rounded-lg bg-cyan-500/15 px-3 py-2 text-sm text-cyan-100">
          {turn.content}
        </div>
        <span className="text-[10px] text-slate-500">{formatTime(turn.timestamp)}</span>
      </div>
    </div>
  );
}

type AssistantBubbleProps = {
  turn: AssistantTurn;
  copied: boolean;
  pending: boolean;
  onCopy: () => void;
  onSaveAsAsset: () => void;
  onSendToApproval: () => void;
  onAssignDestination: (destination: Destination) => void;
  onPublish: () => void;
  onRetry: () => void;
  onRegenerateImage: () => void;
  onEditCaption: (caption: string) => void;
  onUploadMedia: (file: File) => void;
};

function AssistantBubble({
  turn,
  copied,
  pending,
  onCopy,
  onSaveAsAsset,
  onSendToApproval,
  onAssignDestination,
  onPublish,
  onRetry,
  onRegenerateImage,
  onEditCaption,
  onUploadMedia
}: AssistantBubbleProps) {
  const [destinationMenuOpen, setDestinationMenuOpen] = useState(false);
  const [captionEditing, setCaptionEditing] = useState(false);
  const [captionDraft, setCaptionDraft] = useState(turn.content);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!captionEditing) setCaptionDraft(turn.content);
  }, [turn.content, captionEditing]);

  const hasMedia = Boolean(turn.mediaUrl) || turn.mediaType !== null;
  const captionEditable = turn.status === "draft" || turn.status === "pending_review";

  const isDraft = turn.status === "draft";
  const isApproved = turn.status === "approved";
  const canSaveAsAsset = isDraft && !turn.promoted;
  const canSendToApproval = isDraft;
  const canAssignDestination = isApproved && turn.destination === null;
  const canQueuePublish = isApproved && turn.destinationStatus === "assigned";
  const canRetry = turn.destinationStatus === "failed";

  const publishQueueLabel =
    turn.destinationStatus === "queued"
      ? "Queuing…"
      : turn.destinationStatus === "publishing"
      ? "Publishing…"
      : pending
      ? "Queuing…"
      : "Queue Publish";

  const handleDestinationPick = (destination: Destination) => {
    setDestinationMenuOpen(false);
    onAssignDestination(destination);
  };

  const handleFilePicked = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) onUploadMedia(file);
  };

  const handleCaptionCommit = () => {
    const next = captionDraft.trim();
    setCaptionEditing(false);
    if (next && next !== turn.content) onEditCaption(next);
    else setCaptionDraft(turn.content);
  };

  return (
    <div className="flex items-start gap-2">
      <Avatar role="assistant" />
      <div className="flex max-w-[90%] flex-col gap-2">
        {hasMedia ? (
          <InstagramPreview
            imageUrl={turn.mediaType === "image" ? turn.mediaUrl : null}
            videoUrl={turn.mediaType === "video" ? turn.mediaUrl : null}
            caption={turn.content}
          />
        ) : (
          <div className="rounded-2xl rounded-tl-sm border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 shadow-sm">
            <ReactMarkdown components={MARKDOWN_COMPONENTS}>{turn.content}</ReactMarkdown>
          </div>
        )}

        {captionEditing ? (
          <div className="rounded-lg border border-cyan-500/40 bg-slate-950 p-2">
            <textarea
              value={captionDraft}
              onChange={(event) => setCaptionDraft(event.target.value)}
              onBlur={handleCaptionCommit}
              autoFocus
              rows={Math.min(8, Math.max(3, captionDraft.split("\n").length + 1))}
              className="w-full resize-none rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100 focus:border-cyan-400 focus:outline-none"
            />
            <p className="mt-1 text-[10px] text-slate-500">Click outside to save.</p>
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] text-slate-500">{formatTime(turn.timestamp)}</span>
          <RiskBadge risk={turn.scan.riskLevel} />
          <StatusBadge status={turn.status} />
          {turn.destination ? <DestinationBadge destination={turn.destination} /> : null}
          <PublishStatusBadge status={turn.destinationStatus} />
        </div>
        {turn.failureReason ? (
          <p className="text-[10px] text-rose-300">Failure reason: {turn.failureReason}</p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button type="button" onClick={onCopy} className="text-slate-400 hover:text-slate-200">
            {copied ? "Copied" : "Copy"}
          </button>
          {hasMedia && captionEditable ? (
            <>
              <span className="text-slate-700">·</span>
              <button
                type="button"
                onClick={onRegenerateImage}
                disabled={pending}
                className="inline-flex items-center gap-1 text-cyan-300 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {pending ? (
                  <>
                    <Spinner />
                    Regenerating…
                  </>
                ) : (
                  "Regenerate Image"
                )}
              </button>
              <span className="text-slate-700">·</span>
              <button
                type="button"
                onClick={() => {
                  setCaptionDraft(turn.content);
                  setCaptionEditing(true);
                }}
                disabled={pending || captionEditing}
                className="text-cyan-300 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Edit Caption
              </button>
              <span className="text-slate-700">·</span>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={pending}
                className="text-cyan-300 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Upload Own Media
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,video/mp4,video/quicktime,video/webm"
                className="hidden"
                onChange={handleFilePicked}
              />
            </>
          ) : null}
          {canSaveAsAsset ? (
            <>
              <span className="text-slate-700">·</span>
              <button
                type="button"
                onClick={onSaveAsAsset}
                disabled={pending}
                className="text-cyan-300 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {pending ? "Saving…" : "Save as Asset"}
              </button>
            </>
          ) : null}
          {canSendToApproval ? (
            <>
              <span className="text-slate-700">·</span>
              <button
                type="button"
                onClick={onSendToApproval}
                disabled={pending}
                className="text-cyan-300 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {pending ? "Sending…" : "Send to Approval"}
              </button>
            </>
          ) : null}
          {canAssignDestination ? (
            <>
              <span className="text-slate-700">·</span>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setDestinationMenuOpen((open) => !open)}
                  disabled={pending}
                  aria-haspopup="menu"
                  aria-expanded={destinationMenuOpen}
                  className="text-cyan-300 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Assign Destination
                </button>
                {destinationMenuOpen ? (
                  <div
                    role="menu"
                    className="absolute left-0 z-10 mt-1 w-40 overflow-hidden rounded-md border border-slate-700 bg-slate-950 shadow-lg"
                  >
                    {DESTINATIONS.map((destination) => (
                      <button
                        key={destination}
                        type="button"
                        role="menuitem"
                        onClick={() => handleDestinationPick(destination)}
                        className="block w-full px-3 py-1.5 text-left text-xs capitalize text-slate-200 hover:bg-slate-800"
                      >
                        {destination}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </>
          ) : null}
          {canQueuePublish ? (
            <>
              <span className="text-slate-700">·</span>
              <button
                type="button"
                onClick={onPublish}
                disabled={pending}
                className="inline-flex items-center gap-1 text-cyan-300 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {pending ? (
                  <>
                    <Spinner />
                    {publishQueueLabel}
                  </>
                ) : (
                  "Queue Publish"
                )}
              </button>
            </>
          ) : null}
          {canRetry ? (
            <>
              <span className="text-slate-700">·</span>
              <button
                type="button"
                onClick={onRetry}
                disabled={pending}
                className="inline-flex items-center gap-1 text-amber-300 hover:text-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {pending ? (
                  <>
                    <Spinner />
                    Retrying…
                  </>
                ) : (
                  "Retry"
                )}
              </button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <span
      aria-hidden
      className="inline-block h-3 w-3 animate-spin rounded-full border border-current border-t-transparent"
    />
  );
}
