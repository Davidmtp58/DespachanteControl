import assert from 'node:assert/strict';
import { test } from 'node:test';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { PostgresFinanceiroRepository } from '../src/repositories/postgres-financeiro.js';
import { SqlFinanceiroRepository } from '../src/repositories/financeiro-repository.js';
import type { SqlParameter } from '../src/database/connection.js';
import { createTestApp, authenticatedFetch } from './auth-helper.js';
import { financialExpected, financialRows, financialSummary } from './financial-fixtures.js';

test('PG financeiro: somente Views/função, parâmetro seguro, casts e nenhuma conta JS', async () => {
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  const huge = { ...financialRows[0], custo_total: '9007199254740993.01', resultado_liquido: '-9007199254740843.00' };
  const repository = new PostgresFinanceiroRepository({ async query<T>(sql: string, values: unknown[] = []) {
    calls.push({ sql, values }); return [sql.includes('vw_dashboard') ? financialExpected : huge] as T[];
  } });
  assert.deepEqual(await repository.dashboard(), financialExpected);
  assert.deepEqual(await repository.list(), [huge]);
  assert.deepEqual(await repository.find(9), huge);
  assert.match(calls[0].sql, /quantidade_servicos::integer/);
  assert.match(calls[1].sql, /numeric\(38,2\)::text/);
  assert.match(calls[1].sql, /FROM app.vw_resumo_financeiro_servico ORDER BY id_servico/);
  assert.match(calls[2].sql, /FROM app.resumo_financeiro_servico\(\$1::integer\)/);
  assert.deepEqual(calls[2].values, [9]);
  for (const call of calls) assert.doesNotMatch(call.sql, /SUM\(|INSERT |UPDATE |DELETE |FROM app.servico\b/i);
});
test('SQL Server simulado: os cenários financeiros compartilham expectativas HTTP com PG real', async () => {
  const repository = new SqlFinanceiroRepository({ async query<T>(sql: string, parameters: SqlParameter[] = []) {
    if (sql.includes('vw_DashboardResumo')) return [financialExpected] as T[];
    if (sql.includes('EXEC dbo.sp_ResumoFinanceiroServico')) {
      const row = financialRows.find(row => row.id_servico === parameters[0]?.value);
      return (row ? [financialSummary(row)] : []) as T[];
    }
    return financialRows as T[];
  } });
  const server = createTestApp(async () => {}, undefined, undefined, undefined, undefined, repository).listen(0, '127.0.0.1');
  await once(server, 'listening'); const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  try {
    assert.deepEqual(await (await authenticatedFetch(url + '/dashboard/resumo')).json(), financialExpected);
    assert.deepEqual(await (await authenticatedFetch(url + '/financeiro/servicos')).json(), financialRows);
    for (const row of financialRows) assert.deepEqual(await (await authenticatedFetch(url + `/servicos/${row.id_servico}/resumo-financeiro`)).json(), financialSummary(row));
    assert.equal((await authenticatedFetch(url + '/servicos/99999/resumo-financeiro')).status, 404);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});
