import type { Dados, DespesaServico, Servico } from "../types";
export const moeda = (valor: number) =>
  valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const data = (valor: string) =>
  valor ? new Date(`${valor}T12:00:00`).toLocaleDateString("pt-BR") : "—";
export const centavos = (valor: number) => Math.round(valor * 100);
export function financeiro(servico: Servico, despesas: DespesaServico[]) {
  const custo = despesas
    .filter((d) => d.servicoId === servico.id)
    .reduce((s, d) => s + centavos(d.valor), 0);
  return {
    recebido: servico.valorRecebido,
    custo: custo / 100,
    resultado: (centavos(servico.valorRecebido) - custo) / 100,
  };
}
export function indicadores(dados: Dados) {
  const receita = dados.servicos.reduce((s, v) => s + centavos(v.valorRecebido), 0);
  const custos = dados.despesas.reduce((s, v) => s + centavos(v.valor), 0);
  return {
    receita: receita / 100,
    custos: custos / 100,
    resultado: (receita - custos) / 100,
    quantidade: dados.servicos.length,
    andamento: dados.servicos.filter((s) => s.status === "EM_ANDAMENTO").length,
  };
}
