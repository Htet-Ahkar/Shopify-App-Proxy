import { timingSafeEqual } from "node:crypto";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

Deno.serve((request: Request) => {
  if (request.method !== "GET") {
    return new Response(null, { status: 405, headers: { Allow: "GET" } });
  }

  const secret = Deno.env.get("MOCK_EXTERNAL_API_SECRET");
  if (!secret) {
    return json({ ok: false, error: "Mock API is not configured." }, 503);
  }

  const provided = request.headers.get("x-api-key") ?? "";
  const encoder = new TextEncoder();
  const expectedBytes = encoder.encode(secret);
  const providedBytes = encoder.encode(provided);
  if (
    expectedBytes.length !== providedBytes.length ||
    !timingSafeEqual(expectedBytes, providedBytes)
  ) {
    return json({ ok: false, error: "Invalid API key." }, 401);
  }

  return json({
    userId: 1,
    id: 1,
    title: "Secret-authenticated mock API request succeeded",
    completed: true,
    authenticated: true,
    mock: true,
  });
});
