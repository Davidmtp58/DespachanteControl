import { randomUUID } from 'node:crypto';

const codes: Record<string, string> = {
  ETIMEOUT: 'timeout', ESOCKET: 'network', ECONNRESET: 'network', ECONNREFUSED: 'network',
  EPIPE: 'network', ENOTFOUND: 'network', EAI_AGAIN: 'network', ELOGIN: 'authentication',
  EINSTLOOKUP: 'instance_lookup', ENOTOPEN: 'pool_state', ECONNCLOSED: 'pool_state',
  ECANCEL: 'cancelled', EREQUEST: 'sql_request', EALREADYCONNECTED: 'pool_state',
  EALREADYCONNECTING: 'pool_state', DEPTH_ZERO_SELF_SIGNED_CERT: 'tls',
  CERT_HAS_EXPIRED: 'tls', ERR_TLS_CERT_ALTNAME_INVALID: 'tls',
  UNABLE_TO_VERIFY_LEAF_SIGNATURE: 'tls',
};
const ids = new WeakMap<object, string>();
export type Stage = 'pool_init' | 'pool_wait' | 'pool_event' | 'query' | 'pool_close' | 'health_db' | 'http_unhandled';
export interface PoolState {
  readonly connected?: boolean; readonly connecting?: boolean; readonly healthy?: boolean;
  readonly size?: number; readonly available?: number; readonly borrowed?: number; readonly pending?: number;
}
// No messages, stacks, SQL text, parameters, URLs or arbitrary object serialization.
export function diagnostic(error: unknown, stage: Stage, started?: number, pool?: PoolState) {
  try {
    if (process.env.NODE_ENV === 'production' || process.env.SQL_DIAGNOSTICS !== 'true') return;
    const object = error !== null && typeof error === 'object' ? error as Record<string, unknown> : undefined;
    let id = object && ids.get(object);
    if (!id) { id = randomUUID(); if (object) ids.set(object, id); }
    const technical: Array<{ code: string; category: string; number?: number }> = [];
    const seen = new Set<object>();
    let current = object;
    for (let depth = 0; current && depth < 3 && !seen.has(current); depth++) {
      if (depth > 0 && ids.has(current)) id = ids.get(current)!;
      seen.add(current);
      const code = typeof current.code === 'string' && Object.hasOwn(codes, current.code) ? current.code : 'UNKNOWN';
      const number = current.number;
      technical.push({ code, category: codes[code] ?? (current.name === 'TimeoutError' ? 'timeout' : 'unknown'),
        ...(typeof number === 'number' && Number.isInteger(number) && number >= 0 && number <= 2147483647 ? { number } : {}) });
      const nested = current.originalError ?? current.cause;
      current = nested !== null && typeof nested === 'object' ? nested as Record<string, unknown> : undefined;
    }
    for (const cause of seen) ids.set(cause, id);
    const state: Record<string, boolean | number> = {};
    if (pool) {
      for (const key of ['connected', 'connecting', 'healthy'] as const)
        if (typeof pool[key] === 'boolean') state[key] = pool[key]!;
      for (const key of ['size', 'available', 'borrowed', 'pending'] as const)
        if (typeof pool[key] === 'number' && Number.isSafeInteger(pool[key]) && pool[key]! >= 0) state[key] = pool[key]!;
    }
    console.error(JSON.stringify({ event: 'backend_diagnostic', timestamp: new Date().toISOString(),
      correlationId: id, stage, ...(started === undefined ? {} : { durationMs: Math.max(0, Math.round(performance.now() - started)) }),
      errors: technical, pool: state }));
  } catch { /* Diagnostics must never change the operation's outcome. */ }
}
