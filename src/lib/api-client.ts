/** Sends the browser to the sign-in page, returning here afterwards. */
function toSignIn(): void {
  window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname)}`);
}

/** Small fetch wrapper for the browser: JSON in, JSON out, readable errors. */
export async function api<T>(
  path: string,
  opts: { method?: string; json?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  const hasBody = opts.json !== undefined;
  const res = await fetch(path, {
    method: opts.method ?? (hasBody ? "POST" : "GET"),
    headers: hasBody ? { "Content-Type": "application/json" } : undefined,
    body: hasBody ? JSON.stringify(opts.json) : undefined,
    signal: opts.signal,
  });
  if (res.status === 204) return undefined as T;
  if (res.status === 401 && !path.startsWith("/api/auth/")) toSignIn();
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data as T;
}

/** POSTs to a server-sent-events endpoint and calls `onEvent` for each event. */
export async function streamEvents<E>(
  path: string,
  json: unknown,
  onEvent: (event: E) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(json),
    signal,
  });
  if (res.status === 401) toSignIn();
  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? `Request failed (${res.status})`);
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let end: number;
    while ((end = buffer.indexOf("\n\n")) >= 0) {
      const chunk = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      for (const line of chunk.split("\n")) {
        if (line.startsWith("data: ")) onEvent(JSON.parse(line.slice(6)) as E);
      }
    }
  }
}
