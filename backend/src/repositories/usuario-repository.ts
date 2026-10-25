import sql from 'mssql';
import type { QueryExecutor } from '../database/connection.js';

export interface UsuarioRecord {
  id_usuario: number; nome: string; email: string; senha_hash: string; ativo: boolean; data_cadastro: Date;
}
export type UsuarioPublico = Omit<UsuarioRecord, 'senha_hash'>;
export interface UsuarioRepository {
  byEmail(email: string): Promise<UsuarioRecord | undefined>;
  byId(id: number): Promise<UsuarioRecord | undefined>;
}
const fields = 'id_usuario, nome, email, senha_hash, ativo, data_cadastro';
export class SqlUsuarioRepository implements UsuarioRepository {
  constructor(private readonly database: QueryExecutor) {}
  async byEmail(email: string) {
    return (await this.database.query<UsuarioRecord>(`SELECT ${fields} FROM dbo.Usuario WHERE email = @email`,
      [{ name: 'email', type: sql.VarChar(150), value: email }]))[0];
  }
  async byId(id: number) {
    return (await this.database.query<UsuarioRecord>(`SELECT ${fields} FROM dbo.Usuario WHERE id_usuario = @id`,
      [{ name: 'id', type: sql.Int(), value: id }]))[0];
  }
}
