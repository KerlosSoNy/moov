
const APP_URL = process.env.EXPO_PUBLIC_APP_URL;
const EXPO_PUBLIC_CLIENT_ID = process.env.EXPO_PUBLIC_CLIENT_ID;


type ApiRequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  data?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
};

export async function apiRequest<T = unknown>(
  endpoint: string,
  options: ApiRequestOptions = {},
  signal: AbortSignal = new AbortController().signal
): Promise<T> {
  if (!APP_URL || !EXPO_PUBLIC_CLIENT_ID) {
    throw new Error("Missing API environment variables");
  }

  const { method = "GET", data, headers = {} } = options;
  signal = options.signal ?? signal;

const response = await fetch(`${APP_URL}${endpoint}`, {
  method,
  headers: {
    "Content-Type": "application/json",
    "trakt-api-version": "2",
    "trakt-api-key": EXPO_PUBLIC_CLIENT_ID,
    ...headers,
  },
  signal,
  ...(data !== undefined
    ? { body: JSON.stringify(data) }
    : {}),
});

  const responseText = await response.text();

  let result: unknown;

  try {
    result = responseText ? JSON.parse(responseText) : null;
  } catch {
    result = responseText;
  }

  if (!response.ok) {
    throw new Error(
      `API Error ${response.status}: ${
        typeof result === "string"
          ? result.slice(0, 200)
          : JSON.stringify(result)
      }`
    );
  }

  return result as T;
}
