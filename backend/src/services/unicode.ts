export type InputNormalizer = (input: unknown) => unknown;
export const unchanged: InputNormalizer = input => input;
function fields(names: readonly string[]): InputNormalizer {
  return input => {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return input;
    const result = { ...input } as Record<string, unknown>;
    for (const name of names) if (typeof result[name] === 'string') result[name] = result[name].normalize('NFC');
    return result;
  };
}
export const normalizeCliente = fields(['tipo_pessoa', 'nome_razao_social', 'cpf_cnpj', 'telefone', 'email']);
// Senhas, hashes, tokens e datas nunca passam por normalização Unicode.
export const normalizeLogin = fields(['email']);
export const normalizeVeiculo = fields(['placa', 'tipo_veiculo', 'marca', 'modelo', 'renavam']);
export const normalizeServico = fields(['status', 'observacoes']);
export const normalizeDespesa = fields(['descricao', 'observacoes']);
