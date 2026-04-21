import type { IntegrationAdapter, PublishInput, PublishResult } from "@/lib/integrations/types";
import { delay, mockExternalId, shouldSimulateFailure } from "@/lib/integrations/adapters/mock-utils";

export const websiteAdapter: IntegrationAdapter = {
  destination: "website",

  async assignDestination({ assetId }: PublishInput) {
    return {
      ok: true as const,
      meta: {
        site: "mock-site",
        collection: "posts",
        assignedAt: new Date().toISOString(),
        assetId
      }
    };
  },

  async queuePublish({ assetId }: PublishInput) {
    return {
      ok: true as const,
      meta: {
        queueId: mockExternalId("cms_queue", assetId),
        queuedAt: new Date().toISOString()
      }
    };
  },

  async publish({ assetId }: PublishInput): Promise<PublishResult> {
    await delay(2000);
    if (shouldSimulateFailure(assetId, "website")) {
      return { ok: false, reason: "CMS connection timeout" };
    }
    return {
      ok: true,
      externalId: mockExternalId("cms_entry", assetId),
      meta: {
        platform: "website",
        entryId: mockExternalId("entry", assetId),
        url: `https://mock-site.example.com/posts/${mockExternalId("slug", assetId)}`
      }
    };
  }
};
