export function migrate(sql: (statement: string) => Promise<string>): Promise<void>;
