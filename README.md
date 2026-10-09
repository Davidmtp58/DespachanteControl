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

## DER

```mermaid
erDiagram

    CLIENTE {
        INT id_cliente PK
        VARCHAR tipo_pessoa
        VARCHAR nome_razao_social
        VARCHAR cpf_cnpj
        VARCHAR telefone
        VARCHAR email
        DATE data_nascimento
        DATETIME2 data_cadastro
    }

    VEICULO {
        INT id_veiculo PK
        INT id_cliente_proprietario FK
        VARCHAR placa
        VARCHAR tipo_veiculo
        VARCHAR marca
        VARCHAR modelo
        SMALLINT ano
        VARCHAR renavam
        DATETIME2 data_cadastro
    }

    TIPO_SERVICO {
        INT id_tipo_servico PK
        VARCHAR nome
        VARCHAR descricao
        BIT ativo
    }

    SERVICO {
        INT id_servico PK
        INT id_cliente FK
        INT id_veiculo FK
        INT id_tipo_servico FK
        DATETIME2 data_inicio
        DATETIME2 data_conclusao
        VARCHAR status
        DECIMAL valor_recebido
        VARCHAR observacoes
        DATETIME2 data_cadastro
    }

    DESPESA_SERVICO {
        INT id_despesa PK
        INT id_servico FK
        VARCHAR descricao
        DECIMAL valor
        DATE data_despesa
        VARCHAR observacoes
    }

    CLIENTE ||--o{ VEICULO : possui
    CLIENTE ||--o{ SERVICO : solicita
    VEICULO ||--o{ SERVICO : recebe
    TIPO_SERVICO ||--o{ SERVICO : classifica
    SERVICO ||--o{ DESPESA_SERVICO : gera
