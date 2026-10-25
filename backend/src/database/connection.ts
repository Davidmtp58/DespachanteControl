import sql from 'mssql';
import { readDatabaseConfig } from '../config/env.js';
import { diagnostic, type PoolState } from '../diagnostics.js';

export interface Pool extends PoolState {
  connect(): Promise<unknown>;
  close(): Promise<unknown>;
  on(event: 'error', listener: (error: Error) => void): unknown;
  request(): { input?(name: string, type: sql.ISqlType, value: unknown): unknown; query(statement: string): Promise<unknown> };
}

export interface SqlParameter { name: string; type: sql.ISqlType; value: unknown }
export interface QueryExecutor {
  query<T>(statement: string, parameters?: SqlParameter[]): Promise<T[]>;
}

export class SqlDatabase {
  private connection?: Promise<Pool>;
  private closed = false;
  private observedPool?: Pool;

  constructor(
    private readonly config = readDatabaseConfig,
    private readonly factory: (config: sql.config) => Pool = (config) => new sql.ConnectionPool(config),
  ) {}

  private getPool(): Promise<Pool> {
    if (this.closed) return Promise.reject(new Error('Pool encerrado.'));
    if (!this.connection) {
      const started = performance.now();
      let pool: Pool;
      try { pool = this.factory(this.config()); }
      catch (error) { diagnostic(error, 'pool_init', started); throw error; }
      this.observedPool = pool;
      // Nunca registrar o objeto de erro do driver: pode conter dados de conexão.
      pool.on('error', error => {
        diagnostic(error, 'pool_event', undefined, pool);
        console.error('SQL Server: erro no pool de conexões.');
      });
      this.connection = pool.connect().then(() => pool).catch(async (error: unknown) => {
        diagnostic(error, 'pool_init', started, pool);
        const closing = performance.now();
        try { await pool.close(); } catch (closeError) { diagnostic(closeError, 'pool_close', closing, pool); }
        this.connection = undefined;
        throw error;
      });
    }
    return this.connection;
  }

  async check(): Promise<void> {
    const pool = await this.waitPool();
    const started = performance.now();
    try { await pool.request().query('SELECT 1 AS ok'); }
    catch (error) { diagnostic(error, 'query', started, pool); throw error; }
  }

  private async waitPool(): Promise<Pool> {
    const started = performance.now();
    try { return await this.getPool(); }
    catch (error) { diagnostic(error, 'pool_wait', started, this.observedPool); throw error; }
  }

  async query<T>(statement: string, parameters: SqlParameter[] = []): Promise<T[]> {
    const pool = await this.waitPool();
    const started = performance.now();
    try {
      const request = pool.request();
      for (const parameter of parameters) {
        if (!request.input) throw new Error('Request não suporta parâmetros.');
        request.input(parameter.name, parameter.type, parameter.value);
      }
      const result = await request.query(statement) as { recordset: T[] };
      return result.recordset;
    } catch (error) { diagnostic(error, 'query', started, pool); throw error; }
  }

  async close(): Promise<void> {
    this.closed = true;
    const connection = this.connection;
    if (!connection) return;
    let pool: Pool;
    try { pool = await connection; } catch { return; }
    const started = performance.now();
    try { await pool.close(); }
    catch (error) { diagnostic(error, 'pool_close', started, pool); throw error; }
    this.connection = undefined;
  }
}
