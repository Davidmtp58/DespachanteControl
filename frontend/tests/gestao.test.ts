import test from "node:test";
import assert from "node:assert/strict";
import { criarMockService } from "../src/services/gestao";
import { financeiro, indicadores } from "../src/services/financeiro";
test("totais incluem receitas e despesas de cancelados", async () => {
  const dados = await criarMockService().carregar();
  assert.deepEqual(indicadores(dados), {
    receita: 3390,
    custos: 1600,
    resultado: 1790,
    quantidade: 6,
    andamento: 2,
  });
  assert.deepEqual(
    financeiro(
      dados.servicos.find((s) => s.id === "s5")!,
      dados.despesas,
    ),
    { recebido: 150, custo: 70, resultado: 80 },
  );
  assert.deepEqual(financeiro(dados.servicos[0], []), { recebido: 650, custo: 0, resultado: 650 });
});
test("despesas adicionadas, editadas e removidas atualizam o resultado", async () => {
  const service = criarMockService();
  const dados = await service.carregar();
  const despesa = {
    id: "teste",
    servicoId: "s1",
    descricao: "Taxa adicional",
    valor: 10.1,
    data: "2026-10-11",
    observacoes: "",
  };
  await service.salvarDespesa(despesa);
  assert.equal(financeiro(dados.servicos[0], (await service.carregar()).despesas).resultado, 354.9);
  await service.salvarDespesa({ ...despesa, valor: 20.2 });
  assert.equal(financeiro(dados.servicos[0], (await service.carregar()).despesas).resultado, 344.8);
  await service.removerDespesa(despesa.id);
  assert.equal(financeiro(dados.servicos[0], (await service.carregar()).despesas).resultado, 365);
});
test("solicitante pode diferir do proprietário e serviço pode gerar prejuízo", async () => {
  const service = criarMockService();
  const dados = await service.carregar();
  const servico = {
    ...dados.servicos[0],
    id: "novo",
    clienteId: "c3",
    veiculoId: "v1",
    valorRecebido: 0,
  };
  await service.salvarServico(servico);
  await service.salvarDespesa({
    id: "prejuizo",
    servicoId: "novo",
    descricao: "Taxa",
    valor: 12.34,
    data: "2026-10-11",
    observacoes: "",
  });
  assert.equal(financeiro(servico, (await service.carregar()).despesas).resultado, -12.34);
});
test("rejeita duplicidade de documentos, placas e RENAVAM", async () => {
  const service = criarMockService();
  const dados = await service.carregar();
  await assert.rejects(
    service.salvarCliente({ ...dados.clientes[0], id: "dup", documento: "00000000000" }),
    /CPF\/CNPJ/,
  );
  await assert.rejects(
    service.salvarVeiculo({ ...dados.veiculos[0], id: "dup", renavam: "99999999999" }),
    /placa/,
  );
  await assert.rejects(
    service.salvarVeiculo({ ...dados.veiculos[0], id: "dup", placa: "XYZ1A23" }),
    /RENAVAM/,
  );
});
test("rejeita valores inválidos e conclusão anterior ao início", async () => {
  const service = criarMockService();
  const dados = await service.carregar();
  await assert.rejects(service.salvarServico({ ...dados.servicos[0], valorRecebido: -1 }), /valor/);
  await assert.rejects(
    service.salvarServico({ ...dados.servicos[0], conclusao: "2026-01-01" }),
    /conclusão/,
  );
  await assert.rejects(service.salvarDespesa({ ...dados.despesas[0], valor: 0 }), /despesa/);
  await assert.rejects(service.salvarDespesa({ ...dados.despesas[0], valor: NaN }), /despesa/);
});
test("dados retornados não alteram o repositório em memória", async () => {
  const service = criarMockService();
  const dados = await service.carregar();
  dados.clientes[0].nome = "Alteração externa";
  assert.equal((await service.carregar()).clientes[0].nome, "João da Silva");
});
