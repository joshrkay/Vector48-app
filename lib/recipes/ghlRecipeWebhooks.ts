const GHL_BASE_URL = "https://services.leadconnectorhq.com";
const GHL_API_VERSION = "2021-07-28";

export async function registerGhlRecipeWebhook(input: {
  token: string;
  locationId: string;
  url: string;
  events: string[];
}): Promise<{ webhookId: string } | { error: string }> {
  const res = await fetch(`${GHL_BASE_URL}/webhooks/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.token}`,
      "Content-Type": "application/json",
      Version: GHL_API_VERSION,
    },
    body: JSON.stringify({
      locationId: input.locationId,
      url: input.url,
      events: input.events,
    }),
  });

  if (!res.ok) {
    return { error: `GHL webhook registration failed (${res.status})` };
  }

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    return { error: "GHL webhook response was not valid JSON" };
  }

  const webhookId =
    typeof body === "object" && body !== null
      ? ((body as { webhook?: { id?: string }; id?: string }).webhook?.id ??
          (body as { webhook?: { id?: string }; id?: string }).id)
      : null;

  if (!webhookId) {
    return { error: "GHL webhook response missing webhook id" };
  }

  return { webhookId };
}

/** Deletes a GHL outbound webhook. Treats 404 as success (already removed). */
export async function deleteGhlRecipeWebhook(
  token: string,
  webhookId: string,
  fetchFn: typeof fetch = fetch,
): Promise<{ ok: true } | { error: string }> {
  const res = await fetchFn(`${GHL_BASE_URL}/webhooks/${webhookId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
      Version: GHL_API_VERSION,
    },
  });

  if (res.ok || res.status === 404) {
    return { ok: true };
  }

  return { error: `GHL webhook delete failed (${res.status})` };
}
