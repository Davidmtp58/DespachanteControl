import type { Cliente, Dados, DespesaServico, Servico, Veiculo } from "../types";
import { dadosIniciais } from "../mocks/data";
export interface GestaoService {
  carregar(): Promise<Dados>;
  salvarCliente(item: Cliente): Promise<void>;
  salvarVeiculo(item: Veiculo): Promise<void>;
  salvarServico(item: Servico): Promise<void>;
  salvarDespesa(item: DespesaServico): Promise<void>;
  removerDespesa(id: string): Promise<void>;
}
const digits = (s: string) => s.replace(/\D/g, "");
function exigir(condicao: boolean, mensagem: string): asserts condicao {
  if (!condicao) throw new Error(mensagem);
}
function validarValor(n: number, positivo = false) {
  exigir(
    Number.isFinite(n) && (positivo ? n > 0 : n >= 0) && n <= 99999999.99,
    positivo
      ? "A despesa deve ter valor maior que zero, até R$ 99.999.999,99."
      : "O valor recebido deve ser igual ou maior que zero, até R$ 99.999.999,99.",
  );
}
// Adaptador temporário em memória. Substituir por HTTP quando a API Node.js existir.
// Não cria token, sessão, armazenamento persistente ou chamada de rede.
export function criarMockService(): GestaoService {
  const dados = structuredClone(dadosIniciais);
  function salvar<T extends { id: string }>(lista: T[], item: T) {
    const indice = lista.findIndex((v) => v.id === item.id);
    if (indice < 0) lista.push(structuredClone(item));
    else lista[indice] = structuredClone(item);
  }
  return {
    async carregar() {
      return structuredClone(dados);
    },
    async salvarCliente(item) {
      exigir(
        item.nome.trim().length > 0 && item.telefone.trim().length > 0,
        "Informe o nome e o telefone.",
      );
      exigir(
        digits(item.documento).length === (item.tipoPessoa === "PF" ? 11 : 14),
        "Informe um CPF com 11 dígitos ou CNPJ com 14 dígitos, conforme o tipo de pessoa.",
      );
      exigir(
        !dados.clientes.some(
          (c) => c.id !== item.id && digits(c.documento) === digits(item.documento),
        ),
        "Já existe um cliente com este CPF/CNPJ.",
      );
      salvar(dados.clientes, item);
    },
    async salvarVeiculo(item) {
      exigir(
        dados.clientes.some((c) => c.id === item.proprietarioId),
        "Selecione um proprietário cadastrado.",
      );
      exigir(
        /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(item.placa),
        "Informe uma placa válida: ABC1234 ou ABC1D23.",
      );
      exigir(/^\d{11}$/.test(item.renavam), "O RENAVAM deve conter 11 dígitos.");
      exigir(
        !dados.veiculos.some((v) => v.id !== item.id && v.placa === item.placa),
        "Já existe um veículo com esta placa.",
      );
      exigir(
        !dados.veiculos.some((v) => v.id !== item.id && v.renavam === item.renavam),
        "Já existe um veículo com este RENAVAM.",
      );
      salvar(dados.veiculos, item);
    },
    async salvarServico(item) {
      validarValor(item.valorRecebido);
      exigir(
        Boolean(item.inicio) && (!item.conclusao || item.conclusao >= item.inicio),
        "A conclusão não pode ser anterior à data de início.",
      );
      exigir(
        ["EM_ANDAMENTO", "CONCLUIDO", "CANCELADO"].includes(item.status),
        "Selecione um status válido.",
      );
      exigir(
        dados.clientes.some((c) => c.id === item.clienteId) &&
          dados.veiculos.some((v) => v.id === item.veiculoId) &&
          dados.tiposServico.some((t) => t.id === item.tipoServicoId),
        "Selecione cliente, veículo e tipo de serviço cadastrados.",
      );
      salvar(dados.servicos, item);
    },
    async salvarDespesa(item) {
      validarValor(item.valor, true);
      exigir(
        Boolean(item.descricao.trim()) && Boolean(item.data),
        "Informe descrição e data da despesa.",
      );
      exigir(
        dados.servicos.some((s) => s.id === item.servicoId),
        "Serviço não encontrado.",
      );
      salvar(dados.despesas, item);
    },
    async removerDespesa(id) {
      dados.despesas = dados.despesas.filter((d) => d.id !== id);
    },
  };
}
export const gestaoService: GestaoService = criarMockService();
