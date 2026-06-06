import fs from 'node:fs';
import path from 'node:path';

export type CloudConfig = {
  remoteUrl: string;
  syncToken?: string;
  publicLabel?: string;
  notes?: string;
  lastRemoteCheckAt?: string;
  lastRemoteCheckOk?: boolean;
  updatedAt?: string;
};

export type DeploymentInfo = {
  deploymentMode: 'local-desktop' | 'cloud-server';
  servesWebUi: boolean;
  networkAccessible: boolean;
  publicUrl: string | null;
  httpsEnabled: boolean;
  domain: string | null;
};

const DEFAULT: CloudConfig = { remoteUrl: '' };

function configFilePath(dataDir: string): string {
  return path.join(dataDir, 'cloud-config.json');
}

export function normalizeRemoteUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, '');
}

export function readCloudConfig(dataDir: string): CloudConfig {
  const file = configFilePath(dataDir);
  if (!fs.existsSync(file)) return { ...DEFAULT };
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<CloudConfig>;
    return {
      ...DEFAULT,
      ...raw,
      remoteUrl: normalizeRemoteUrl(raw.remoteUrl ?? ''),
    };
  } catch {
    return { ...DEFAULT };
  }
}

export function writeCloudConfig(dataDir: string, patch: Partial<CloudConfig>): CloudConfig {
  fs.mkdirSync(dataDir, { recursive: true });
  const current = readCloudConfig(dataDir);
  const next: CloudConfig = {
    ...current,
    ...patch,
    remoteUrl: normalizeRemoteUrl(patch.remoteUrl ?? current.remoteUrl),
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(configFilePath(dataDir), JSON.stringify(next, null, 2), 'utf8');
  return next;
}

export function resolveDeploymentInfo(): DeploymentInfo {
  const servesWebUi = Boolean(process.env.WEB_DIST_DIR);
  const host = process.env.HOST ?? (servesWebUi ? '0.0.0.0' : '127.0.0.1');
  const networkAccessible = host === '0.0.0.0' || host === '::';
  const domain = process.env.DOMAIN?.trim() || null;
  const httpsEnabled = Boolean(domain && domain !== 'localhost');
  const publicUrl = httpsEnabled && domain ? `https://${domain}` : null;
  const deploymentMode =
    servesWebUi && networkAccessible ? 'cloud-server' : 'local-desktop';

  return {
    deploymentMode,
    servesWebUi,
    networkAccessible,
    publicUrl,
    httpsEnabled,
    domain,
  };
}

export async function probeRemoteHealth(
  baseUrl: string,
  timeoutMs = 12_000
): Promise<{ ok: boolean; latencyMs: number; message: string; status?: string }> {
  const url = `${normalizeRemoteUrl(baseUrl)}/health`;
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    const latencyMs = Date.now() - started;
    if (!res.ok) {
      return {
        ok: false,
        latencyMs,
        message: `Réponse HTTP ${res.status}`,
      };
    }
    const body = (await res.json()) as { status?: string; service?: string };
    if (body.status === 'ok') {
      return {
        ok: true,
        latencyMs,
        status: body.status,
        message: 'Serveur cloud accessible',
      };
    }
    return {
      ok: false,
      latencyMs,
      message: 'Réponse inattendue du serveur distant',
    };
  } catch (err) {
    const latencyMs = Date.now() - started;
    const message =
      err instanceof Error && err.name === 'AbortError'
        ? 'Délai dépassé — serveur injoignable'
        : err instanceof Error
          ? err.message
          : 'Erreur de connexion';
    return { ok: false, latencyMs, message };
  } finally {
    clearTimeout(timer);
  }
}
