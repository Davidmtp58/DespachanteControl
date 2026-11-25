import { validateFirstAccount } from './account-validation.js';
import bcrypt from 'bcryptjs';

export async function prepareFirstUser(nome: string, email: string, senha: string, confirmation: string): Promise<string> {
  nome = nome.trim(); email = email.trim().toLowerCase();
  validateFirstAccount(nome, email, senha, confirmation);
  const hash = await bcrypt.hash(senha, 12);
  const quote = (value: string) => "N'" + value.replace(/'/g, "''") + "'";
  return `-- Execute somente no SSMS com sua conta administrativa, após revisão.
USE DespachanteControl;
SET XACT_ABORT ON;
BEGIN TRY
  BEGIN TRANSACTION;
  IF EXISTS (SELECT 1 FROM dbo.Usuario WITH (UPDLOCK, HOLDLOCK))
    THROW 50001, 'Já existem usuários. Procedimento reservado à primeira conta.', 1;
  INSERT INTO dbo.Usuario (nome, email, senha_hash, ativo)
    VALUES (${quote(nome)}, ${quote(email)}, ${quote(hash)}, 1);
  COMMIT TRANSACTION;
END TRY
BEGIN CATCH
  IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
  THROW;
END CATCH;`;
}
