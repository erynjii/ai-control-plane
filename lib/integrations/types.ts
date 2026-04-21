export const DESTINATIONS = ["instagram", "facebook", "email", "website"] as const;

export type Destination = (typeof DESTINATIONS)[number];

export const DESTINATION_STATUSES = [
  "idle",
  "assigned",
  "queued",
  "publishing",
  "published",
  "failed"
] as const;

export type DestinationStatus = (typeof DESTINATION_STATUSES)[number];

export type PublishInput = {
  assetId: string;
  content: string;
};

export type PublishSuccess = {
  ok: true;
  externalId: string;
  meta: Record<string, unknown>;
};

export type PublishFailure = {
  ok: false;
  reason: string;
};

export type PublishResult = PublishSuccess | PublishFailure;

export type AssignResult = {
  ok: true;
  meta: Record<string, unknown>;
};

export type QueueResult = {
  ok: true;
  meta: Record<string, unknown>;
};

export interface IntegrationAdapter {
  readonly destination: Destination;
  assignDestination(input: PublishInput): Promise<AssignResult>;
  queuePublish(input: PublishInput): Promise<QueueResult>;
  publish(input: PublishInput): Promise<PublishResult>;
}

export function isDestination(value: unknown): value is Destination {
  return typeof value === "string" && (DESTINATIONS as readonly string[]).includes(value);
}
