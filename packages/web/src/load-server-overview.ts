import type { ApiClient } from "./api/api-client.js";

export type ServerOverviewData = Awaited<ReturnType<typeof loadServerOverview>>;

export async function loadServerOverview(client: ApiClient) {
  const [health, limits, capabilities] = await Promise.all([
    client.getHealth(),
    client.getLimits(),
    client.getCapabilities(),
  ]);
  return { health, limits, capabilities };
}
