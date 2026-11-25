import type { PoolClient } from 'pg';
import { AdminError, type AdminStage } from './admin-errors.js';

// No creation helper import; SELECT and transaction-local settings only.
export async function diagnosePostgresAdmin(client: Pick<PoolClient, 'query'>) {
  let stage: AdminStage = 'begin';
  try {
    await client.query('BEGIN READ ONLY');
    stage = 'identity';
    const identity = (await client.query(`SELECT current_database() AS database_name,
      current_user AS current_user, session_user AS session_user,
      current_setting('server_version') AS server_version,
      current_setting('transaction_read_only') AS read_only,
      pg_has_role(session_user, to_regrole('dc_migrator'), 'SET') AS can_set_migrator,
      to_regclass('app.usuario') IS NOT NULL AS table_exists`)).rows[0];
    if (identity?.database_name !== 'postgres' || identity.session_user !== 'postgres' || identity.read_only !== 'on') {
      throw new Error('identity');
    }
    stage = 'role';
    await client.query('SET LOCAL ROLE dc_migrator');
    stage = 'timeout';
    await client.query("SET LOCAL statement_timeout = '15s'");
    const timeout = (await client.query('SHOW statement_timeout')).rows[0]?.statement_timeout;
    if (timeout !== '15s') throw new Error('timeout');
    stage = 'permissions';
    const permissions = (await client.query(`SELECT
      current_user AS effective_role,
      has_schema_privilege(current_user, 'app', 'USAGE') AS schema_usage,
      has_table_privilege(current_user, 'app.usuario', 'SELECT') AS table_select,
      has_table_privilege(current_user, 'app.usuario', 'INSERT') AS table_insert,
      has_table_privilege(current_user, 'app.usuario', 'UPDATE') AS table_update,
      has_sequence_privilege(current_user, pg_get_serial_sequence('app.usuario','id_usuario'), 'USAGE') AS sequence_usage,
      (SELECT pg_get_userbyid(relowner) = current_user FROM pg_class WHERE oid = 'app.usuario'::regclass) AS owns_table,
      (SELECT count(*)::text FROM app.usuario) AS users_count,
      current_setting('transaction_read_only') AS read_only`)).rows[0];
    await client.query('ROLLBACK');
    const pick = (row: Record<string, unknown>, fields: string[]) => Object.fromEntries(fields.map(key => [key, row[key]]));
    return { identity: pick(identity, ['database_name','current_user','session_user','server_version','read_only','can_set_migrator','table_exists']),
      timeout, permissions: pick(permissions, ['effective_role','schema_usage','table_select','table_insert','table_update','sequence_usage','owns_table','users_count','read_only']) };
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* Client is closed by caller. */ }
    throw new AdminError(stage, error);
  }
}
