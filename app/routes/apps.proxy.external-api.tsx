import type { LoaderFunctionArgs } from "react-router";

import { authenticate } from "../shopify.server";

const EXTERNAL_API_TIMEOUT_MS = 5000;

type TodoResponse = {
  userId?: unknown;
  id?: unknown;
  title?: unknown;
  completed?: unknown;
  authenticated?: unknown;
};

function sanitizeTodo(data: TodoResponse) {
  return {
    ok: true,
    userId: typeof data.userId === "number" ? data.userId : null,
    id: typeof data.id === "number" ? data.id : null,
    title: typeof data.title === "string" ? data.title : "",
    completed: typeof data.completed === "boolean" ? data.completed : false,
    apiAuthenticated: data.authenticated === true,
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

  return 500;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const proxyRequestInfo = {
    method: request.method,
    pathname: url.pathname,
    shop: url.searchParams.get("shop"),
    pathPrefix: url.searchParams.get("path_prefix"),
    timestamp: url.searchParams.get("timestamp"),
    hasLoggedInCustomer: Boolean(url.searchParams.get("logged_in_customer_id")),
    hasSignature: url.searchParams.has("signature"),
  };

  console.log("[app-proxy] Request received", proxyRequestInfo);

  try {
    const authContext = await authenticate.public.appProxy(request);

    console.log("[app-proxy] Authentication successful", {
      shop: authContext.session?.shop ?? proxyRequestInfo.shop,
      hasSession: Boolean(authContext.session),
      hasAdminClient: Boolean(authContext.admin),
      hasStorefrontClient: Boolean(authContext.storefront),
      hasLiquidHelper: Boolean(authContext.liquid),
    });
  } catch (error) {
    console.error("[app-proxy] Authentication failed", {
      ...proxyRequestInfo,
      error:
        error instanceof Response
          ? {
              status: error.status,
              statusText: error.statusText,
            }
          : error instanceof Error
            ? {
                name: error.name,
                message: error.message,
              }
            : String(error),
    });

    const status = getErrorStatus(error);
    const isClientError = status >= 400 && status < 500;
    return json(
      {
        ok: false,
        error: isClientError
          ? "App proxy request could not be verified by Shopify."
          : "App proxy session storage is unavailable.",
      },
      { status },
    );
  }

  const externalApiUrl = process.env.EXTERNAL_API_URL;
  if (!externalApiUrl) {
    return json(
      { ok: false, error: "External API URL is not configured." },
      { status: 500 },
    );
  }

  const externalApiSecret = process.env.EXTERNAL_API_SECRET;
  if (!externalApiSecret) {
    return json(
      { ok: false, error: "External API secret is not configured." },
      { status: 500 },
    );
  }

  try {
    if (new URL(externalApiUrl).protocol !== "https:") {
      throw new Error("HTTPS required");
    }
  } catch {
    return json(
      { ok: false, error: "External API URL must use HTTPS." },
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
        "x-api-key": externalApiSecret,
      },
      signal: controller.signal,
      redirect: "error",
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
