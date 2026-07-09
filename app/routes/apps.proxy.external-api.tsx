import type { LoaderFunctionArgs } from "react-router";

import { authenticate } from "../shopify.server";

const EXTERNAL_API_TIMEOUT_MS = 5000;

type TodoResponse = {
  userId?: unknown;
  id?: unknown;
  title?: unknown;
  completed?: unknown;
};

function sanitizeTodo(data: TodoResponse) {
  return {
    ok: true,
    userId: typeof data.userId === "number" ? data.userId : null,
    id: typeof data.id === "number" ? data.id : null,
    title: typeof data.title === "string" ? data.title : "",
    completed: typeof data.completed === "boolean" ? data.completed : false,
  };
}

function json(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...init?.headers,
    },
  });
}

function getErrorStatus(error: unknown) {
  if (
    error &&
    typeof error === "object" &&
    "status" in error &&
    typeof error.status === "number"
  ) {
    return error.status;
  }

  return 400;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    await authenticate.public.appProxy(request);
  } catch (error) {
    console.error("App proxy authentication failed", error);

    return json(
      {
        ok: false,
        error: "App proxy request could not be verified by Shopify.",
      },
      { status: getErrorStatus(error) },
    );
  }

  const externalApiUrl = process.env.EXTERNAL_API_URL;
  if (!externalApiUrl) {
    return json(
      { ok: false, error: "External API URL is not configured." },
      { status: 500 },
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), EXTERNAL_API_TIMEOUT_MS);

  try {
    const response = await fetch(externalApiUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      return json(
        { ok: false, error: "External API request failed." },
        { status: response.status },
      );
    }

    const data = (await response.json()) as TodoResponse;
    return json(sanitizeTodo(data));
  } catch (error) {
    const message =
      error instanceof DOMException && error.name === "AbortError"
        ? "External API request timed out."
        : "External API request failed.";

    return json({ ok: false, error: message }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
};
