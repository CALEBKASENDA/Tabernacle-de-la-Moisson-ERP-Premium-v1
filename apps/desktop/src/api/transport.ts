export type ApiTransportResult = {
  status: number;
  text: string;
  headers: Record<string, string>;
};

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export async function apiTransport(
  url: string,
  options?: RequestInit,
): Promise<ApiTransportResult> {
  if (isTauriRuntime()) {
    const method = (options?.method ?? 'GET').toUpperCase();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };

    if (options?.headers) {
      if (options.headers instanceof Headers) {
        options.headers.forEach((value, key) => {
          headers[key] = value;
        });
      } else if (Array.isArray(options.headers)) {
        for (const [key, value] of options.headers) {
          headers[key] = value;
        }
      } else {
        Object.assign(headers, options.headers as Record<string, string>);
      }
    }

    let body: string | null = null;
    if (options?.body != null && method !== 'GET' && method !== 'HEAD') {
      body = typeof options.body === 'string' ? options.body : String(options.body);
    }

    const path = url.startsWith('http') ? new URL(url).pathname + new URL(url).search : url;

    const invokeFn = (window as any)?.__TAURI_INTERNALS__?.invoke;
    if (typeof invokeFn !== 'function') {
      throw new Error('Pont Tauri non disponible (invoke introuvable).');
    }

    const res = await invokeFn('api_request', { method, path, headers, body });
    return { status: res.status, text: res.body, headers: res.headers ?? {} };
  }

  const res = await fetch(url, options);
  const text = await res.text();
  const headers: Record<string, string> = {};
  res.headers.forEach((value, key) => {
    headers[key] = value;
  });
  return { status: res.status, text, headers };
}
