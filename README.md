# DespachanteControl

Sistema web desenvolvido como projeto de portfólio e extensão acadêmica para auxiliar um microempreendimento de despachante documentalista no controle de clientes, veículos, serviços e resultados financeiros.

## Problema

O controle atual é realizado principalmente em papel e arquivos físicos, dificultando o acompanhamento de:

- clientes;
- veículos;
- serviços em andamento;
- serviços concluídos;
- despesas;
- valores recebidos;
- resultado financeiro.

## Objetivo

Centralizar essas informações em uma aplicação web simples, permitindo acompanhar melhor a operação e o resultado financeiro do negócio.

## Stack

- SQL Server
- SQL Server Management Studio
- Node.js + TypeScript
- React + TypeScript

## Banco de Dados

A modelagem foi desenvolvida manualmente com foco em SQL Server, integridade dos dados e consultas analíticas.

### Entidades principais

- `Cliente`
- `Veiculo`
- `TipoServico`
- `Servico`
- `DespesaServico`

### Relacionamentos

- Cliente 1:N Veiculo
- Cliente 1:N Servico
- Veiculo 1:N Servico
- TipoServico 1:N Servico
- Servico 1:N DespesaServico

## Regras de Negócio

- O cliente pode ser pessoa física ou jurídica.
- O cliente que solicita o serviço não precisa ser o proprietário do veículo.
- Um serviço pode possuir várias despesas.
- Um serviço também pode existir sem despesas.
- O custo total não é armazenado diretamente.
- O resultado líquido não é armazenado diretamente.

### Cálculos

```text
Custo total = soma das despesas do serviço

Resultado líquido = valor recebido - custo total
