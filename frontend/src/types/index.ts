export type Status = "EM_ANDAMENTO" | "CONCLUIDO" | "CANCELADO";
export interface Cliente {
  id: string;
  tipoPessoa: "PF" | "PJ";
  nome: string;
  documento: string;
  telefone: string;
  email: string;
  nascimento: string;
}
export interface Veiculo {
  id: string;
  proprietarioId: string;
  placa: string;
  tipo: string;
  marca: string;
  modelo: string;
  ano: number | null;
  renavam: string;
}
export interface TipoServico {
  id: string;
  nome: string;
}
export interface Servico {
  id: string;
  clienteId: string;
  veiculoId: string;
  tipoServicoId: string;
  inicio: string;
  conclusao: string;
  status: Status;
  valorRecebido: number;
  observacoes: string;
}
export interface DespesaServico {
  id: string;
  servicoId: string;
  descricao: string;
  valor: number;
  data: string;
  observacoes: string;
}
export interface Dados {
  clientes: Cliente[];
  veiculos: Veiculo[];
  tiposServico: TipoServico[];
  servicos: Servico[];
  despesas: DespesaServico[];
}
export type Pagina = "dashboard" | "clientes" | "veiculos" | "servicos" | "despesas";
