/**
 * Deterministic UUID generation is handled at persistence/sync layer.
 * In domain, we only need a UUID-like string for identifiers.
 *
 * Prefer Node's `crypto.randomUUID()` when available; fall back otherwise.
 */
export function newId(prefix?: string): string {
  const c: unknown = globalThis as unknown as { crypto?: { randomUUID?: () => string } };
  const cryptoObj = (c as any).crypto;
  const uuid = typeof cryptoObj?.randomUUID === 'function' ? cryptoObj.randomUUID() : fallbackUuid();
  return prefix ? `${prefix}_${uuid}` : uuid;
}

function fallbackUuid(): string {
  // Minimal fallback: RFC4122-ish via random bytes if available.
  // If crypto is not available, this still returns a unique-enough value for local IDs.
  const rnd = new Uint8Array(16);
  for (let i = 0; i < rnd.length; i++) rnd[i] = Math.floor(Math.random() * 256);
  // Set version 4
  rnd[6] = (rnd[6] & 0x0f) | 0x40;
  rnd[8] = (rnd[8] & 0x3f) | 0x80;
  const hex = Array.from(rnd, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

