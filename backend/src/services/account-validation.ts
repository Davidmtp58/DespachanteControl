import { AccountValidationError } from './admin-errors.js';

// Passwords are never trimmed or normalized. Count Unicode code points.
// Shared by every current password-definition flow; login accepts existing hashes.
export function validateFirstAccount(nome: string, email: string, senha: string, confirmation: string): void {
  if (!nome || nome.length > 120 || /[\x00-\x1f\x7f]/.test(nome)) throw new AccountValidationError('INVALID_NAME');
  if (email.length > 150 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AccountValidationError('INVALID_EMAIL');
  const length = Array.from(senha).length;
  if (length < 8 || length > 12) throw new AccountValidationError('PASSWORD_LENGTH');
  if (senha !== confirmation) throw new AccountValidationError('PASSWORD_CONFIRMATION_MISMATCH');
}
