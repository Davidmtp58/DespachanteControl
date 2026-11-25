export function startCluster(): Promise<{
  sql(statement: string): Promise<string>;
  stop(): Promise<void>;
  connection(): { host: string; port: number; database: string; user: string; password: string; ssl: false };
}>;
