import { test } from "node:test";
import assert from "node:assert/strict";
import { identificarServicos } from "../src/services/despesa-identificacao";
import type { DadosServicos } from "../src/services/servicos";

const dados: DadosServicos = {
  clientes: [
    {
      id: "9",
      nome: "Solicitante",
      tipoPessoa: "PF",
      documento: "",
      telefone: "",
      email: "",
      nascimento: "",
    },
  ],
  veiculos: [
    {
      id: "5",
      proprietarioId: "99",
      marca: "Volkswagen",
      modelo: "Gol",
      placa: "ABC1D23",
      tipo: "Automóvel",
      ano: 2020,
      renavam: "",
    },
  ],
  tiposServico: [{ id: "2", nome: "Transferência", ativo: true, descricao: "" }],
  servicos: [
    {
      id: "7",
      clienteId: "9",
      veiculoId: "5",
      tipoServicoId: "2",
      inicio: "2026-10-19",
      conclusao: "",
      status: "EM_ANDAMENTO",
      valorRecebido: "0.00",
      observacoes: "",
    },
  ],
};
test("compõe o solicitante do serviço sem confundir com proprietário", () => {
  assert.deepEqual(identificarServicos(dados).get("7"), {
    id: "7",
    tipo: "Transferência",
    cliente: "Solicitante",
    veiculo: "Volkswagen Gol · ABC1D23",
    status: "EM_ANDAMENTO",
    inicio: "2026-10-19",
  });
  assert.equal(dados.veiculos[0].proprietarioId, "99");
});
test("relações ausentes não inventam nomes nem substituem registros", () => {
  const index = identificarServicos({ ...dados, clientes: [], veiculos: [], tiposServico: [] });
  assert.equal(index.get("7")?.cliente, "Cliente solicitante #9 não encontrado");
  assert.equal(index.get("7")?.veiculo, "Veículo #5 não encontrado");
  assert.equal(index.get("7")?.tipo, "Tipo de serviço #2 não encontrado");
  assert.equal(index.get("999"), undefined);
});
test("serviços semelhantes mantêm identidade, data e status distintos", () => {
  const index = identificarServicos({
    ...dados,
    servicos: [
      ...dados.servicos,
      { ...dados.servicos[0], id: "8", status: "CANCELADO", inicio: "2026-10-20" },
    ],
  });
  assert.equal(index.size, 2);
  assert.equal(index.get("8")?.status, "CANCELADO");
  assert.equal(index.get("8")?.inicio, "2026-10-20");
});
