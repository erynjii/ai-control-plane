const FAILURE_RATE = 0.15;

// Deterministic hash-based "random" so behavior is reproducible per asset.
export function shouldSimulateFailure(assetId: string, salt: string): boolean {
  let hash = 0;
  const source = `${assetId}:${salt}`;
  for (let i = 0; i < source.length; i += 1) {
    hash = (hash * 31 + source.charCodeAt(i)) | 0;
  }
  const bucket = (Math.abs(hash) % 1000) / 1000;
  return bucket < FAILURE_RATE;
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function mockExternalId(prefix: string, assetId: string): string {
  const short = assetId.replace(/-/g, "").slice(0, 10);
  return `${prefix}_${short}_${Date.now().toString(36)}`;
}
