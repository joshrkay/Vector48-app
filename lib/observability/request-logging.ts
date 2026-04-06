const REQUEST_ID_HEADER = "x-request-id";

export function getOrCreateRequestId(headers: Headers): string {
  return headers.get(REQUEST_ID_HEADER) ?? crypto.randomUUID();
}

export function attachRequestIdHeader(
  response: Response,
  requestId: string,
): Response {
  response.headers.set(REQUEST_ID_HEADER, requestId);
  return response;
}
