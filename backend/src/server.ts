import 'dotenv/config';
import { createApp } from './app.js';
import { readServerConfig } from './config/env.js';
import { SqlDatabase } from './database/connection.js';
import { SqlClienteRepository } from './repositories/cliente-repository.js';
import { SqlVeiculoRepository } from './repositories/veiculo-repository.js';
import { SqlServicoRepository } from './repositories/servico-repository.js';
import { SqlDespesaRepository } from './repositories/despesa-repository.js';
import { SqlFinanceiroRepository } from './repositories/financeiro-repository.js';
import { SqlUsuarioRepository } from './repositories/usuario-repository.js';
import { readAuthConfig } from './config/auth.js';

const database = new SqlDatabase();
const { host, port } = readServerConfig();
const server = createApp(() => database.check(), new SqlClienteRepository(database), new SqlVeiculoRepository(database), new SqlServicoRepository(database), new SqlDespesaRepository(database), new SqlFinanceiroRepository(database), { config: readAuthConfig(), usuarios: new SqlUsuarioRepository(database) }).listen(port, host, () => {
  console.info(`API disponível em http://${host}:${port}`);
});

server.on('error', () => {
  console.error('Não foi possível iniciar o servidor HTTP. Verifique HOST e PORT.');
  process.exitCode = 1;
});

let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  const deadline = setTimeout(() => process.exit(1), 15000);
  deadline.unref();
  server.close(async (error) => {
    try {
      await database.close();
      process.exitCode = error ? 1 : 0;
    } catch {
      console.error('Erro ao encerrar o pool SQL Server.');
      process.exitCode = 1;
    } finally {
      clearTimeout(deadline);
    }
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
