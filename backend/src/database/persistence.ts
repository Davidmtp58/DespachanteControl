import { readDatabaseProvider, readPostgresConfig } from '../config/postgres.js';
import { SqlDatabase } from './connection.js';
import { PostgresDatabase } from './postgres.js';
import { SqlClienteRepository } from '../repositories/cliente-repository.js';
import { SqlUsuarioRepository } from '../repositories/usuario-repository.js';
import { SqlVeiculoRepository } from '../repositories/veiculo-repository.js';
import { SqlServicoRepository } from '../repositories/servico-repository.js';
import { SqlDespesaRepository } from '../repositories/despesa-repository.js';
import { SqlFinanceiroRepository } from '../repositories/financeiro-repository.js';
import { PostgresClienteRepository } from '../repositories/postgres-clientes.js';
import { PostgresUsuarioRepository } from '../repositories/postgres-usuarios.js';
import { PostgresVeiculoRepository } from '../repositories/postgres-veiculos.js';
import { PostgresServicoRepository } from '../repositories/postgres-servicos.js';
import { PostgresDespesaRepository } from '../repositories/postgres-despesas.js';
import { PostgresFinanceiroRepository } from '../repositories/postgres-financeiro.js';

// Single selection: no fallback to the other database after any failure.
export function createPersistence(env = process.env) {
  const provider = readDatabaseProvider(env);
  if (provider === 'postgres') {
    const database = new PostgresDatabase(() => readPostgresConfig(env));
    return { provider, database, clientes: new PostgresClienteRepository(database), usuarios: new PostgresUsuarioRepository(database),
      veiculos: new PostgresVeiculoRepository(database), servicos: new PostgresServicoRepository(database), despesas: new PostgresDespesaRepository(database), financeiro: new PostgresFinanceiroRepository(database) };
  }
  const database = new SqlDatabase();
  return { provider, database, clientes: new SqlClienteRepository(database), usuarios: new SqlUsuarioRepository(database),
    veiculos: new SqlVeiculoRepository(database), servicos: new SqlServicoRepository(database),
    despesas: new SqlDespesaRepository(database), financeiro: new SqlFinanceiroRepository(database) };
}
