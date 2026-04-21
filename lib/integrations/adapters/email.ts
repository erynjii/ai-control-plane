import type { IntegrationAdapter, PublishInput, PublishResult } from "@/lib/integrations/types";
import { delay, mockExternalId, shouldSimulateFailure } from "@/lib/integrations/adapters/mock-utils";

export const emailAdapter: IntegrationAdapter = {
  destination: "email",

  async assignDestination({ assetId }: PublishInput) {
    return {
      ok: true as const,
      meta: {
        list: "mock-newsletter-list",
        assignedAt: new Date().toISOString(),
        assetId
      }
    };
  },

  async queuePublish({ assetId }: PublishInput) {
    return {
      ok: true as const,
      meta: {
        queueId: mockExternalId("email_queue", assetId),
        queuedAt: new Date().toISOString()
      }
    };
  },

  async publish({ assetId }: PublishInput): Promise<PublishResult> {
    await delay(2000);
    if (shouldSimulateFailure(assetId, "email")) {
      return { ok: false, reason: "Recipient list empty" };
    }
    return {
      ok: true,
      externalId: mockExternalId("email_campaign", assetId),
      meta: {
        platform: "email",
        campaignId: mockExternalId("camp", assetId),
        recipientCount: 1284
      }
    };
  }
};
