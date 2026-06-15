export type BootState = 'starting' | 'ready' | 'error';

let bootState: BootState = 'starting';
let bootError: string | null = null;

export function isAppReady(): boolean {
  return bootState === 'ready';
}

export function setAppReady(): void {
  bootState = 'ready';
  bootError = null;
}

export function setBootError(message: string): void {
  bootState = 'error';
  bootError = message;
}

export function getHealthPayload(): {
  status: 'ok' | 'starting' | 'error';
  service: string;
  mode: string;
  error?: string;
} {
  const payload: {
    status: 'ok' | 'starting' | 'error';
    service: string;
    mode: string;
    error?: string;
  } = {
    status: bootState === 'ready' ? 'ok' : bootState,
    service: 'tabernacle-finance-api',
    mode: 'hybrid-local-first',
  };
  if (bootError) payload.error = bootError;
  return payload;
}

export const SPLASH_HTML = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Tabernacle de la Moisson ERP</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: "Segoe UI", system-ui, sans-serif;
      background: linear-gradient(145deg, #0f172a 0%, #1e3a5f 100%);
      color: #f8fafc;
    }
    .card { text-align: center; padding: 2.5rem 2rem; max-width: 440px; }
    h1 { font-size: 1.35rem; font-weight: 600; margin: 0 0 0.5rem; }
    p { margin: 0; opacity: 0.85; line-height: 1.5; }
    .badge {
      display: inline-block;
      margin-top: 0.75rem;
      padding: 0.25rem 0.65rem;
      border-radius: 999px;
      background: #ffffff1a;
      font-size: 0.8rem;
    }
    .spinner {
      width: 36px;
      height: 36px;
      margin: 1.5rem auto 0;
      border: 3px solid #ffffff33;
      border-top-color: #38bdf8;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .error { color: #fca5a5; margin-top: 1rem; font-size: 0.95rem; }
    a { color: #7dd3fc; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Tabernacle de la Moisson ERP</h1>
    <p id="message">Ouverture de l'application…</p>
    <p class="badge">Mode hybride · Local First</p>
    <div class="spinner" id="spinner" aria-label="Chargement"></div>
    <p id="status" class="error" hidden></p>
  </div>
  <script>
    const API = '/health';
    (async function waitForServer() {
      for (let i = 0; i < 200; i++) {
        try {
          const res = await fetch(API, { cache: 'no-store' });
          const data = await res.json();
          if (data && data.status === 'ok') {
            location.replace('/');
            return;
          }
          if (data && data.status === 'error') {
            document.getElementById('spinner').hidden = true;
            const el = document.getElementById('status');
            el.hidden = false;
            el.textContent = data.error || 'Erreur au demarrage.';
            return;
          }
        } catch (_) {}
        await new Promise((r) => setTimeout(r, 200));
      }
      document.getElementById('spinner').hidden = true;
      const el = document.getElementById('status');
      el.hidden = false;
      el.innerHTML = 'Demarrage lent. <a href="/">Reessayer</a>';
    })();
  </script>
</body>
</html>`;
