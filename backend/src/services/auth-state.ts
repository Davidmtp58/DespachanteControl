import session from 'express-session';
import type { Store as RateStore } from 'express-rate-limit';
import { createHmac } from 'node:crypto';
import type { PostgresExecutor } from '../database/postgres.js';
import { HttpError } from '../middleware/error-handler.js';

export interface AuthStores { sessionStore?: session.Store; loginStore?: RateStore }
const unavailable = () => new HttpError(503, 'AUTH_STORAGE_UNAVAILABLE', 'Autenticação temporariamente indisponível. Tente novamente.');
type Callback = (error?: unknown) => void;
const keyHash = (secret: string, scope: string, key: string) => createHmac('sha256', secret).update(scope + ':' + key).digest('hex');

export class PostgresSessionStore extends session.Store {
  constructor(private readonly db: PostgresExecutor, private readonly secret: string) { super(); }
  get(sid: string, callback: (error: unknown, data?: session.SessionData | null) => void) {
    void this.db.query<{ data: session.SessionData }>(
      'SELECT data FROM dc_auth.sessions WHERE key_hash=$1 AND NOT revoked AND expires_at > clock_timestamp()',
      [keyHash(this.secret, 'session', sid)],
    ).then(rows => callback(null, rows[0]?.data ?? null), () => callback(unavailable()));
  }
  set(sid: string, data: session.SessionData, callback: Callback = () => {}) {
    // Keep the existing absolute authentication deadline, never extend on touch.
    const now = Date.now();
    if (!Number.isSafeInteger(data.expiresAt) || data.expiresAt <= now || data.expiresAt > now + 86400000) { callback(unavailable()); return; }
    // Snapshot before any await: callers cannot extend a pending save's deadline.
    void this.save(sid, JSON.stringify(data), new Date(data.expiresAt).toISOString()).then(() => callback(), () => callback(unavailable()));
  }
  private async prune() {
    await this.db.query(`DELETE FROM dc_auth.sessions WHERE expires_at <= clock_timestamp() AND key_hash IN
      (SELECT key_hash FROM dc_auth.sessions WHERE expires_at <= clock_timestamp() ORDER BY expires_at LIMIT 100 FOR UPDATE SKIP LOCKED)`);
  }
  private async save(sid: string, data: string, expires: string) {
    await this.prune();
    const rows = await this.db.query(`INSERT INTO dc_auth.sessions AS stored(key_hash,data,expires_at)
      SELECT $1,$2::jsonb,$3::timestamptz WHERE $3::timestamptz > clock_timestamp()
      ON CONFLICT(key_hash) DO UPDATE SET data=EXCLUDED.data
      WHERE NOT stored.revoked AND stored.expires_at > clock_timestamp()
      RETURNING key_hash`, [keyHash(this.secret, 'session', sid), data, expires]);
    if (rows.length !== 1) throw unavailable();
  }
  destroy(sid: string, callback: Callback = () => {}) {
    void this.revoke(sid)
      .then(() => callback(), () => callback(unavailable()));
  }
  private async revoke(sid: string) {
    await this.prune();
    // 48h retention exceeds the 24h maximum session lifetime. No sensitive payload.
    // The unique key serializes this UPSERT against saves on other connections.
    await this.db.query(`INSERT INTO dc_auth.sessions AS stored(key_hash,data,expires_at,revoked)
      VALUES ($1,'{}'::jsonb,clock_timestamp()+interval '48 hours',true)
      ON CONFLICT(key_hash) DO UPDATE SET data='{}'::jsonb,revoked=true,
        expires_at=GREATEST(stored.expires_at,EXCLUDED.expires_at)`, [keyHash(this.secret, 'session', sid)]);
  }
  touch(_sid: string, _data: session.SessionData, callback: Callback = () => {}) {
    // No update needed: expiry is absolute. Crucially, a concurrent request
    // completing after logout must not reinsert or extend a revoked session.
    callback();
  }
}

export class PostgresLoginStore implements RateStore {
  readonly localKeys = false;
  readonly prefix = 'dc-login';
  constructor(private readonly db: PostgresExecutor, private readonly secret: string, private readonly windowMs: number) {}
  async increment(key: string) {
    try {
      await this.db.query(`DELETE FROM dc_auth.login_limits WHERE expires_at <= clock_timestamp() AND key_hash IN
        (SELECT key_hash FROM dc_auth.login_limits WHERE expires_at <= clock_timestamp() ORDER BY expires_at LIMIT 100 FOR UPDATE SKIP LOCKED)`);
      const rows = await this.db.query<{ hits: number; reset_ms: string }>(`
        INSERT INTO dc_auth.login_limits AS bucket(key_hash,hits,expires_at)
        VALUES ($1,1,clock_timestamp()+($2::integer * interval '1 millisecond'))
        ON CONFLICT(key_hash) DO UPDATE SET
          hits=CASE WHEN bucket.expires_at <= clock_timestamp() THEN 1 ELSE LEAST(bucket.hits::bigint+1,2147483647)::integer END,
          expires_at=CASE WHEN bucket.expires_at <= clock_timestamp()
            THEN clock_timestamp()+($2::integer * interval '1 millisecond') ELSE bucket.expires_at END
        RETURNING hits,(extract(epoch FROM expires_at)*1000)::bigint::text AS reset_ms`,
        [keyHash(this.secret, 'login', key), this.windowMs]);
      const row = rows[0];
      if (!row || !Number.isSafeInteger(row.hits) || row.hits < 1 || !Number.isSafeInteger(Number(row.reset_ms))) throw unavailable();
      return { totalHits: row.hits, resetTime: new Date(Number(row.reset_ms)) };
    } catch { throw unavailable(); }
  }
  async decrement(key: string) {
    try { await this.db.query('UPDATE dc_auth.login_limits SET hits=GREATEST(hits-1,0) WHERE key_hash=$1', [keyHash(this.secret, 'login', key)]); }
    catch { throw unavailable(); }
  }
  async resetKey(key: string) {
    try { await this.db.query('DELETE FROM dc_auth.login_limits WHERE key_hash=$1', [keyHash(this.secret, 'login', key)]); }
    catch { throw unavailable(); }
  }
}

export function createAuthStores(env: NodeJS.ProcessEnv, secret: string, windowMs: number,
  database?: PostgresExecutor, serverless = false): AuthStores {
  const mode = env.AUTH_STATE_STORE ?? (serverless ? 'postgres' : 'memory');
  if (!['memory', 'postgres'].includes(mode) || (serverless && mode !== 'postgres')) throw new Error('Serverless exige AUTH_STATE_STORE=postgres.');
  if (mode === 'memory') return {};
  if (env.DB_PROVIDER !== 'postgres' || !database) throw new Error('AUTH_STATE_STORE=postgres exige DB_PROVIDER=postgres.');
  return { sessionStore: new PostgresSessionStore(database, secret), loginStore: new PostgresLoginStore(database, secret, windowMs) };
}
