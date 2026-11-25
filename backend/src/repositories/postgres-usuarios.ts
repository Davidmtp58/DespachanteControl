import type { PostgresExecutor } from '../database/postgres.js';
import type { UsuarioRecord, UsuarioRepository } from './usuario-repository.js';
const fields = 'id_usuario,nome,email,senha_hash,ativo,data_cadastro';
export class PostgresUsuarioRepository implements UsuarioRepository {
  constructor(private readonly database: PostgresExecutor) {}
  async byEmail(email: string) {
    return (await this.database.query<UsuarioRecord>(`SELECT ${fields} FROM app.usuario
      WHERE app.text_key(email) COLLATE app.ci_as = app.text_key($1::text) COLLATE app.ci_as`, [email.normalize('NFC')]))[0];
  }
  async byId(id: number) {
    return (await this.database.query<UsuarioRecord>(`SELECT ${fields} FROM app.usuario WHERE id_usuario=$1`, [id]))[0];
  }
}
