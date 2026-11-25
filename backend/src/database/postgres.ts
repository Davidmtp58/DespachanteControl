import { Pool, type PoolConfig } from 'pg';
import { readPostgresConfig } from '../config/postgres.js';
import { diagnostic } from '../diagnostics.js';

export interface PostgresExecutor { query<T>(statement: string, values?: unknown[]): Promise<T[]> }
export class PostgresDatabase implements PostgresExecutor {
  private pool?: Pool;
  private closed = false;
  private timeout = 15000;
  constructor(private readonly config: () => PoolConfig = readPostgresConfig,
    private readonly factory: (config: PoolConfig) => Pool = config => new Pool(config)) {}
  async query<T>(statement: string, values: unknown[] = []): Promise<T[]> {
    const started = performance.now();
    try {
      if (this.closed) throw Object.assign(new Error('Pool encerrado.'), { code: 'ECONNCLOSED' });
      if (!this.pool) {
        const config = this.config();
        this.timeout = Number(config.statement_timeout ?? 15000);
        if (!Number.isSafeInteger(this.timeout) || this.timeout < 1 || this.timeout > 300000) throw new Error('Invalid statement timeout.');
        const pool = this.factory(config);
        pool.on('error', error => diagnostic(error, 'pool_event', undefined, this.state()));
        this.pool = pool;
      }
      const client = await this.pool.connect();
      let discard = false;
      try {
        // Await session setup on every checkout (also reused/replacement connections).
        // Session pooler only; no asynchronous pool event or startup-only assumption.
        await client.query("SELECT set_config('statement_timeout', $1, false)", [`${this.timeout}ms`]);
        const effective = await client.query("SELECT setting FROM pg_settings WHERE name = 'statement_timeout'");
        if (effective.rows[0]?.setting !== String(this.timeout)) throw new Error('Statement timeout verification failed.');
        return (await client.query(statement, values)).rows as T[];
      } catch (error) {
        discard = true;
        throw error;
      } finally {
        client.release(discard);
      }
    } catch (error) {
      diagnostic(error, this.pool ? 'query' : 'pool_init', started, this.state());
      throw error;
    }
  }
  private state() {
    return { size: this.pool?.totalCount, available: this.pool?.idleCount, pending: this.pool?.waitingCount };
  }
  async check() { await this.query('SELECT 1'); }
  async close() {
    if (this.closed) return;
    this.closed = true;
    const started = performance.now();
    try { await this.pool?.end(); }
    catch (error) { diagnostic(error, 'pool_close', started, this.state()); throw error; }
  }
}
