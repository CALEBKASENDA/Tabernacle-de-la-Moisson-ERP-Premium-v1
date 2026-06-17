export type ApiTransportResult = {
  status: number;
  text: string;
  headers: Record<string, string>;
};

type TauriApiResponse = {
  status: number;
  body: string;
  headers?: Record<string, string>;
};

type TauriInvoke = (command: string, args: Record<string, unknown>) => Promise<TauriApiResponse>;

/** Détecte le shell Tauri (IPC) — pas le mode legacy Edge + Node sur 127.0.0.1:3847. */
export function isTauriRuntime(): boolean {
  if (typeof window === 'undefined') return false;
  if (import.meta.env.TAURI_ENV_PLATFORM) return true;
  if ('__TAURI__' in window || '__TAURI_INTERNALS__' in window) return true;
  const { protocol, hostname } = window.location;
  return protocol === 'tauri:' || hostname === 'tauri.localhost';
}

function resolveHttpUrl(url: string): string {
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  const configured = import.meta.env.VITE_API_BASE_URL;
  if (configured) return `${configured.replace(/\/$/, '')}${url}`;
  if (typeof window !== 'undefined' && window.location.protocol.startsWith('http')) {
    return `${window.location.origin}${url}`;
  }
  return `http://127.0.0.1:3847${url}`;
}

function getTauriInvoke(): TauriInvoke | null {
  const w = window as Window & {
    __TAURI_INTERNALS__?: { invoke?: TauriInvoke };
    __TAURI__?: { core?: { invoke?: TauriInvoke }; invoke?: TauriInvoke };
  };

  if (typeof w.__TAURI_INTERNALS__?.invoke === 'function') {
    return w.__TAURI_INTERNALS__.invoke.bind(w.__TAURI_INTERNALS__);
  }
  if (typeof w.__TAURI__?.core?.invoke === 'function') {
    return w.__TAURI__.core.invoke.bind(w.__TAURI__.core);
  }
  if (typeof w.__TAURI__?.invoke === 'function') {
    return w.__TAURI__.invoke.bind(w.__TAURI__);
  }
  return null;
}

export async function apiTransport(
  url: string,
  options?: RequestInit,
): Promise<ApiTransportResult> {
  if (isTauriRuntime()) {
    const invoke = getTauriInvoke();
    if (!invoke) {
      throw new Error('Pont Tauri non disponible (invoke introuvable).');
    }

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

    const res = await invoke('api_request', { method, path, headers, body });
    return { status: res.status, text: res.body, headers: res.headers ?? {} };
  }

  const res = await fetch(resolveHttpUrl(url), options);
  const text = await res.text();
  const headers: Record<string, string> = {};
  res.headers.forEach((value, key) => {
    headers[key] = value;
  });
  return { status: res.status, text, headers };
}
