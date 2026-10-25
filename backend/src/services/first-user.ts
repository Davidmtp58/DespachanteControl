import bcrypt from 'bcryptjs';

export async function prepareFirstUser(nome: string, email: string, senha: string, confirmation: string): Promise<string> {
  nome = nome.trim(); email = email.trim().toLowerCase();
  if (!nome || nome.length > 120 || /[\x00-\x1f\x7f]/.test(nome) || email.length > 150 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Nome ou e-mail inválido.');
  }
  if (senha !== confirmation) throw new Error('As senhas não coincidem.');
  if (senha.length < 12 || Buffer.byteLength(senha, 'utf8') > 72) throw new Error('Use senha com pelo menos 12 caracteres e no máximo 72 bytes UTF-8.');
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
