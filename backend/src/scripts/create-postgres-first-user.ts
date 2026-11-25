import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { Client } from 'pg';
import { readPostgresConfig } from '../config/postgres.js';
import { createPostgresFirstUser } from '../services/postgres-first-user.js';
import { diagnosePostgresAdmin } from '../services/postgres-admin-diagnostic.js';
import { adminFailure, type AdminStage } from '../services/admin-errors.js';

// Explicit administrative command. No dotenv, no shared runtime credentials.
if (!process.stdin.isTTY || !process.stdout.isTTY) {
  console.error('Use um terminal interativo privado, sem redirecionamento.');
  process.exitCode = 1;
} else {
  let hidden = false;
  const output = new Writable({ write(chunk, _encoding, callback) { if (!hidden) process.stdout.write(chunk); callback(); } });
  const rl = createInterface({ input: process.stdin, output, terminal: true, historySize: 0 });
  let client: Client | undefined;
  let stage: AdminStage = 'config';
  try {
    const args = process.argv.slice(2);
    const diagnostic = args.length === 1 && args[0] === '--diagnose-read-only';
    if (args.length && !diagnostic) throw new Error('arguments');
    const config = readPostgresConfig({ APP_MODE: 'hosted', PG_SSL_MODE: 'verify-full',
      PG_HOST: process.env.ADMIN_PG_HOST, PG_PORT: process.env.ADMIN_PG_PORT,
      PG_DATABASE: process.env.ADMIN_PG_DATABASE, PG_USER: process.env.ADMIN_PG_USER,
      PG_PASSWORD: 'prompt-only', PG_SSL_CA_FILE: process.env.ADMIN_PG_SSL_CA_FILE });
    const target = `${config.host}/${config.database}/${config.user}`;
    if (diagnostic && (config.host !== 'aws-0-us-east-2.pooler.supabase.com' || config.port !== 5432 ||
        config.database !== 'postgres' || config.user !== 'postgres.zhonseyahndqlzoygolr' || !process.env.ADMIN_PG_SSL_CA_FILE)) throw new Error('target');
    stage = 'confirmation';
    console.log('Confira no painel o projeto e este destino administrativo:', target);
    if (await rl.question(diagnostic ? 'Diagnostico SOMENTE LEITURA. Confirme o destino acima: ' : 'Digite exatamente o destino acima para autorizar a criação da primeira conta: ') !== target) {
      throw new Error('cancelled');
    }
    process.stdout.write('Senha administrativa do banco (oculta): '); hidden = true;
    const databasePassword = await rl.question(''); hidden = false; process.stdout.write('\n');
    stage = 'input';
    let nome = '', email = '', senha = '', confirmation = '';
    if (!diagnostic) {
      nome = await rl.question('Nome da primeira conta: ');
      email = await rl.question('E-mail: ');
      process.stdout.write('Senha da conta (oculta): '); hidden = true;
      senha = await rl.question(''); process.stdout.write('\nConfirme a senha (oculta): ');
      confirmation = await rl.question(''); hidden = false; process.stdout.write('\n');
    }
    if (diagnostic) config.options = '-c timezone=UTC -c default_transaction_read_only=on';
    stage = 'connect';
    client = new Client({ ...config, password: databasePassword });
    // Idle/network errors must not print the driver error or secrets.
    client.on('error', () => { process.exitCode = 1; });
    await client.connect();
    stage = 'identity';
    const identity = await client.query('SELECT current_database() AS db, session_user AS usr');
    // Supavisor uses role.project-ref for login but session_user is the role itself.
    if (identity.rows[0].db !== config.database || identity.rows[0].usr !== String(config.user).split('.')[0]) throw new Error('identity');
    if (diagnostic) {
      console.log(JSON.stringify(await diagnosePostgresAdmin(client), null, 2));
    } else {
      const id = await createPostgresFirstUser(client, nome, email, senha, confirmation);
      senha = ''; confirmation = '';
      console.log(`Primeira conta criada. ID: ${id}`);
    }
  } catch (error) {
    console.error(adminFailure(error, stage));
    process.exitCode = 1;
  } finally {
    hidden = false; rl.close();
    try { await client?.end(); } catch { process.exitCode = 1; }
  }
}
