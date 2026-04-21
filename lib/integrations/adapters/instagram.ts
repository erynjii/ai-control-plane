import type { IntegrationAdapter, PublishInput, PublishResult } from "@/lib/integrations/types";
import { delay, mockExternalId, shouldSimulateFailure } from "@/lib/integrations/adapters/mock-utils";

export const instagramAdapter: IntegrationAdapter = {
  destination: "instagram",

  async assignDestination({ assetId }: PublishInput) {
    return {
      ok: true as const,
      meta: {
        account: "@mock-brand",
        assignedAt: new Date().toISOString(),
        assetId
      }
    };
  },

  async queuePublish({ assetId }: PublishInput) {
    return {
      ok: true as const,
      meta: {
        queueId: mockExternalId("ig_queue", assetId),
        queuedAt: new Date().toISOString()
      }
    };
  },

  async publish({ assetId }: PublishInput): Promise<PublishResult> {
    await delay(2000);
    if (shouldSimulateFailure(assetId, "instagram")) {
      return { ok: false, reason: "Image aspect ratio not supported" };
    }
    return {
      ok: true,
      externalId: mockExternalId("ig_post", assetId),
      meta: {
        platform: "instagram",
        permalink: `https://instagram.com/p/${mockExternalId("ig", assetId)}`
      }
    };
  }
};
