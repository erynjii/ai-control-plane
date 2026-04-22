// Test-only helpers. Not imported by production code.
//
// Lives alongside lib/agents/ (colocated style) rather than under a
// dedicated tests folder so agent specs stay in one directory.

import type {
  AgentRuntime,
  ChatRequest,
  ChatResponse,
  ImageRequest,
  ImageResponse
} from "@/lib/agents/runtime";
import type { PipelineContext, PipelineInit } from "@/lib/agents/types";
import type { BrandEditHistoryEntry } from "@/lib/types";

export type ChatStub = (req: ChatRequest) => ChatResponse | Promise<ChatResponse>;
export type ImageStub = (req: ImageRequest) => ImageResponse | Promise<ImageResponse>;
export type FetchBrandEditsStub = (
  workspaceId: string
) => BrandEditHistoryEntry[] | Promise<BrandEditHistoryEntry[]>;

export interface StubRuntimeOptions {
  chat?: ChatStub;
  image?: ImageStub;
  fetchBrandEdits?: FetchBrandEditsStub;
}

export function stubRuntime(options: StubRuntimeOptions = {}): AgentRuntime {
  const runtime: AgentRuntime = {
    async chat(req) {
      if (!options.chat) throw new Error("chat stub not provided");
      return options.chat(req);
    },
    async image(req) {
      if (!options.image) throw new Error("image stub not provided");
      return options.image(req);
    }
  };
  if (options.fetchBrandEdits) {
    runtime.fetchBrandEdits = async (workspaceId) => {
      return options.fetchBrandEdits!(workspaceId);
    };
  }
  return runtime;
}

export function baseContext(overrides: Partial<PipelineInit> = {}): PipelineContext {
  const init: PipelineInit = {
    postId: "post_test",
    userPrompt: "Write a grand-opening announcement for a new head spa.",
    workspaceId: "ws_test",
    connectedAccountId: null,
    platform: "instagram",
    ...overrides
  };
  return {
    ...init,
    flags: [],
    stepLog: []
  };
}
