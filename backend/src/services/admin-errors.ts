export type AdminStage = 'config' | 'confirmation' | 'input' | 'connect' | 'identity' | 'validation' | 'hash'
  | 'begin' | 'role' | 'timeout' | 'lock' | 'existing_user' | 'insert' | 'commit' | 'permissions' | 'close';
const codes = new Set(['28P01', '28000', '42501', '42704', '42P01', '23505', '23502', '23514', '22001',
  '25006', '57014', '55P03', '08006', '57P01', 'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND',
  'CERT_HAS_EXPIRED', 'ERR_TLS_CERT_ALTNAME_INVALID', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'SELF_SIGNED_CERT_IN_CHAIN']);
export class AdminError extends Error {
  readonly code: string;
  constructor(readonly stage: AdminStage, error?: unknown) {
    super(stage === 'validation' ? 'Senha inválida, confirmação diferente ou nome/e-mail inválido.' : 'Conta não criada ou resultado não confirmado. Diagnóstico administrativo interrompido.');
    const value = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
    this.code = typeof value === 'string' && codes.has(value) ? value : 'UNCLASSIFIED';
  }
}
const messages = {
  INVALID_NAME: 'Nome inválido. Informe de 1 a 120 caracteres, sem caracteres de controle.',
  INVALID_EMAIL: 'E-mail inválido. Informe um endereço válido com até 150 caracteres.',
  PASSWORD_LENGTH: 'Senha inválida. Use de 8 a 12 caracteres.',
  PASSWORD_CONFIRMATION_MISMATCH: 'As senhas não coincidem. Confira a confirmação.',
} as const;

export class AccountValidationError extends AdminError {
  override readonly code: keyof typeof messages;
  constructor(code: keyof typeof messages) {
    super('validation');
    this.code = code;
    this.message = messages[code];
  }
}

export function adminFailure(error: unknown, stage: AdminStage): string {
  const safe = error instanceof AdminError ? error : new AdminError(stage, error);
  return `Procedimento interrompido. Etapa=${safe.stage}; codigo=${safe.code}.${safe instanceof AccountValidationError ? ` ${safe.message}` : ''} Nao repita a criacao sem diagnostico.`;
}
