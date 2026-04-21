// Cost accounting for agent steps.
//
// Prices are in USD per 1M tokens (chat) or per image (image). Update as
// OpenAI pricing changes.
// TODO(pipeline-v2 follow-up): pull these from env or a config table so a
// pricing bump doesn't require a deploy.

export type ChatPricing = {
  /** USD per 1,000,000 input tokens. */
  inputPerMillion: number;
  /** USD per 1,000,000 output tokens. */
  outputPerMillion: number;
};

const CHAT_PRICING: Record<string, ChatPricing> = {
  "gpt-4.1": { inputPerMillion: 3, outputPerMillion: 12 },
  "gpt-4.1-mini": { inputPerMillion: 0.15, outputPerMillion: 0.6 },
  "gpt-4o": { inputPerMillion: 2.5, outputPerMillion: 10 },
  "gpt-4o-mini": { inputPerMillion: 0.15, outputPerMillion: 0.6 }
};

const CHAT_PRICING_FALLBACK: ChatPricing = { inputPerMillion: 3, outputPerMillion: 12 };

// Flat per-image price for gpt-image-1 at 1024x1024 (standard quality).
const IMAGE_PRICING: Record<string, number> = {
  "gpt-image-1": 0.04
};

const IMAGE_PRICING_FALLBACK = 0.04;

/** Cost in USD for a chat completion with the given token usage. */
export function costFor(params: {
  model: string;
  inputTokens: number;
  outputTokens: number;
}): number {
  const price = CHAT_PRICING[params.model] ?? CHAT_PRICING_FALLBACK;
  const cost =
    (params.inputTokens / 1_000_000) * price.inputPerMillion +
    (params.outputTokens / 1_000_000) * price.outputPerMillion;
  // Round to 6 decimals; at fractions of a cent we don't need more.
  return Math.round(cost * 1_000_000) / 1_000_000;
}

/** Cost in USD for a single image generation at the given size. */
export function imageCost(params: { model: string }): number {
  return IMAGE_PRICING[params.model] ?? IMAGE_PRICING_FALLBACK;
}
