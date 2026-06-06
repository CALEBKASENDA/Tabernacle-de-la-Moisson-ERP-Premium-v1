/** Rend les réponses JSON sérialisables (bigint → string, récursif). */
export function sanitizeForJson<T>(value: T): T {
  if (typeof value === 'bigint') return value.toString() as T;
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((item) => sanitizeForJson(item)) as T;
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = sanitizeForJson(val);
    }
    return out as T;
  }
  return value;
}

export function installBigIntJsonSupport(): void {
  if (!(BigInt.prototype as unknown as { toJSON?: () => string }).toJSON) {
    Object.defineProperty(BigInt.prototype, 'toJSON', {
      value(): string {
        return this.toString();
      },
      configurable: true,
    });
  }
}

export function businessErrorMessage(err: unknown, fallback = 'Opération impossible'): string {
  return err instanceof Error ? err.message : fallback;
}
