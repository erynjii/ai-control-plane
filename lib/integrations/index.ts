import { emailAdapter } from "@/lib/integrations/adapters/email";
import { facebookAdapter } from "@/lib/integrations/adapters/facebook";
import { instagramAdapter } from "@/lib/integrations/adapters/instagram";
import { websiteAdapter } from "@/lib/integrations/adapters/website";
import type { Destination, IntegrationAdapter } from "@/lib/integrations/types";

export * from "@/lib/integrations/types";

const REGISTRY: Record<Destination, IntegrationAdapter> = {
  instagram: instagramAdapter,
  facebook: facebookAdapter,
  email: emailAdapter,
  website: websiteAdapter
};

export function getAdapter(destination: Destination): IntegrationAdapter {
  return REGISTRY[destination];
}
