import { validateFirstAccount } from './account-validation.js';
import bcrypt from 'bcryptjs';
import type { PoolClient } from 'pg';
import { AdminError, type AdminStage } from './admin-errors.js';

// Caller must supply a dedicated administrative client, never the API pool.
// No logging or SQL generation containing secrets; failure messages are sanitized.
export async function createPostgresFirstUser(client: Pick<PoolClient, 'query'>,
  nome: string, email: string, senha: string, confirmation: string): Promise<number> {
  nome = nome.normalize('NFC').trim(); email = email.normalize('NFC').trim().toLowerCase();
  validateFirstAccount(nome, email, senha, confirmation);
  let hash: string;
  try { hash = await bcrypt.hash(senha, 12); } catch (error) { throw new AdminError('hash', error); }
  let stage: AdminStage = 'begin';
  try {
    await client.query('BEGIN');
    stage = 'role';
    await client.query('SET LOCAL ROLE dc_migrator');
    stage = 'timeout';
    await client.query("SET LOCAL statement_timeout = '15s'");
    const timeout = await client.query('SHOW statement_timeout');
    if (timeout.rows[0]?.statement_timeout !== '15s') throw new Error('Timeout verification failed.');
    stage = 'lock';
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query('LOCK TABLE app.usuario IN EXCLUSIVE MODE');
    stage = 'existing_user';
    const existing = await client.query('SELECT 1 FROM app.usuario LIMIT 1');
    if (existing.rows.length) throw new Error('not empty');
    stage = 'insert';
    const result = await client.query('INSERT INTO app.usuario(nome,email,senha_hash,ativo) VALUES ($1,$2,$3,true) RETURNING id_usuario', [nome, email, hash]);
    stage = 'commit';
    await client.query('COMMIT');
    return result.rows[0].id_usuario;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* Preserve sanitized error. */ }
    throw new AdminError(stage, error);
  }
}
