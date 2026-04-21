// AgentRuntime is a dependency-injection seam so tests can provide stub
// chat/image clients without touching real OpenAI. Production wires these to
// the existing `lib/ai/image.ts` + OpenAI chat completions helpers.

export interface ChatRequest {
  /** Human-labelled agent for cost accounting / debugging. */
  agent: string;
  model: string;
  /** System prompt sent first. */
  system: string;
  /** User prompt sent second. */
  user: string;
  /** Optional JSON schema description. Implementations may use response_format. */
  jsonSchemaHint?: string;
  temperature?: number;
}

export interface ChatResponse {
  /** Raw assistant text — JSON-mode callers should JSON.parse this. */
  text: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export interface ImageRequest {
  agent: string;
  prompt: string;
  size?: string;
}

export interface ImageResponse {
  /** Publicly reachable URL for the generated image. */
  imageUrl: string;
  model: string;
  /** Images are priced per image, not per token; surfaced as costUsd. */
  costUsd: number;
}

/**
 * Production AgentRuntime hits real model APIs and uploads to Supabase
 * Storage. Test runtimes return canned responses and never touch the network.
 */
export interface AgentRuntime {
  chat(req: ChatRequest): Promise<ChatResponse>;
  image(req: ImageRequest): Promise<ImageResponse>;
}
