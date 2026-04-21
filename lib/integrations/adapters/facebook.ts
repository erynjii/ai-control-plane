import type { IntegrationAdapter, PublishInput, PublishResult } from "@/lib/integrations/types";
import { delay, mockExternalId, shouldSimulateFailure } from "@/lib/integrations/adapters/mock-utils";

export const facebookAdapter: IntegrationAdapter = {
  destination: "facebook",

  async assignDestination({ assetId }: PublishInput) {
    return {
      ok: true as const,
      meta: {
        page: "mock-brand-page",
        assignedAt: new Date().toISOString(),
        assetId
      }
    };
  },

  async queuePublish({ assetId }: PublishInput) {
    return {
      ok: true as const,
      meta: {
        queueId: mockExternalId("fb_queue", assetId),
        queuedAt: new Date().toISOString()
      }
    };
  },

  async publish({ assetId }: PublishInput): Promise<PublishResult> {
    await delay(2000);
    if (shouldSimulateFailure(assetId, "facebook")) {
      return { ok: false, reason: "Post exceeds character limit" };
    }
    return {
      ok: true,
      externalId: mockExternalId("fb_post", assetId),
      meta: {
        platform: "facebook",
        scheduledPostId: mockExternalId("fb_sched", assetId),
        permalink: `https://facebook.com/mock-brand-page/posts/${mockExternalId("fb", assetId)}`
      }
    };
  }
};
