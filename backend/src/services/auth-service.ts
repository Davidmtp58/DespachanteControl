import bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import { HttpError } from '../middleware/error-handler.js';
import type { UsuarioPublico, UsuarioRecord, UsuarioRepository } from '../repositories/usuario-repository.js';

let dummyHash: Promise<string> | undefined;
const unauthorized = () => new HttpError(401, 'INVALID_CREDENTIALS', 'E-mail ou senha inválidos.');
export function publicUser(user: UsuarioRecord): UsuarioPublico {
  return { id_usuario: user.id_usuario, nome: user.nome, email: user.email, ativo: user.ativo, data_cadastro: user.data_cadastro };
}
export const credentialVersion = (user: UsuarioRecord) => createHash('sha256').update(user.senha_hash).digest('hex');

export class AuthService {
  constructor(private readonly repository: UsuarioRepository) {}
  async login(body: unknown): Promise<UsuarioRecord> {
    const data = body as { email?: unknown; senha?: unknown } | null;
    if (!data || typeof data.email !== 'string' || typeof data.senha !== 'string' ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email.trim()) || data.email.trim().length > 150 ||
        !data.senha.length || Buffer.byteLength(data.senha, 'utf8') > 72) throw unauthorized();
    const user = await this.repository.byEmail(data.email.trim().toLowerCase());
    const validHash = user && /^\$2[aby]\$(0[4-9]|1[0-4])\$[./A-Za-z0-9]{53}$/.test(user.senha_hash);
    dummyHash ??= bcrypt.hash(randomBytes(32).toString('hex'), 12);
    const matches = await bcrypt.compare(data.senha, validHash ? user.senha_hash : await dummyHash);
    if (!user || !validHash || !user.ativo || !matches) throw unauthorized();
    return user;
  }
  async current(id: number, version: string): Promise<UsuarioPublico | undefined> {
    const user = await this.repository.byId(id);
    if (!user || !user.ativo || credentialVersion(user) !== version) return undefined;
    return publicUser(user);
  }
}
