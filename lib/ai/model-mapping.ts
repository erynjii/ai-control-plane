export const MODEL_MODES = ["Auto", "Fast", "Balanced", "High Quality"] as const;

export type ModelMode = (typeof MODEL_MODES)[number];

const MODEL_BY_MODE: Record<ModelMode, string> = {
  Auto: "gpt-4.1-mini",
  Fast: "gpt-4.1-mini",
  Balanced: "gpt-4.1-mini",
  "High Quality": "gpt-4.1"
};

export function resolveModelForMode(mode: ModelMode): string {
  return MODEL_BY_MODE[mode];
}
