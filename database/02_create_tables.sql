USE DespachanteControl;
GO

/* =====================================================
   TABELA: Cliente
   Armazena clientes pessoa física ou jurídica.
   ===================================================== */
CREATE TABLE Cliente (
    id_cliente INT IDENTITY(1,1) PRIMARY KEY,
    tipo_pessoa VARCHAR(2) NOT NULL,
    nome_razao_social VARCHAR(150) NOT NULL,
    cpf_cnpj VARCHAR(14) NOT NULL UNIQUE,
    telefone VARCHAR(20) NOT NULL,
    email VARCHAR(150) NULL,
    data_nascimento DATE NULL,
    data_cadastro DATETIME2 NOT NULL DEFAULT SYSDATETIME(),

    CONSTRAINT CK_Cliente_TipoPessoa
        CHECK (tipo_pessoa IN ('PF', 'PJ'))
);
GO

/* =====================================================
   TABELA: Usuario
   Armazena usuários administrativos da aplicação.
   ===================================================== */
CREATE TABLE Usuario (
    id_usuario INT IDENTITY(1,1) PRIMARY KEY,
    nome VARCHAR(120) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    senha_hash VARCHAR(255) NOT NULL,
    ativo BIT NOT NULL DEFAULT 1,
    data_cadastro DATETIME2 NOT NULL DEFAULT SYSDATETIME()
);
GO

/* =====================================================
   TABELA: Veiculo
   Armazena os veículos vinculados aos clientes.
   ===================================================== */
CREATE TABLE Veiculo (
    id_veiculo INT IDENTITY(1,1) PRIMARY KEY,
    id_cliente_proprietario INT NOT NULL,
    placa VARCHAR(7) NOT NULL UNIQUE,
    tipo_veiculo VARCHAR(30) NOT NULL,
    marca VARCHAR(50) NOT NULL,
    modelo VARCHAR(80) NOT NULL,
    ano SMALLINT NULL,
    renavam VARCHAR(11) NOT NULL UNIQUE,
    data_cadastro DATETIME2 NOT NULL DEFAULT SYSDATETIME(),

    CONSTRAINT FK_Veiculo_Cliente
        FOREIGN KEY (id_cliente_proprietario)
        REFERENCES Cliente(id_cliente)
);
GO

/* =====================================================
   TABELA: TipoServico
   Catálogo dos tipos de serviço oferecidos.
   ===================================================== */
CREATE TABLE TipoServico (
    id_tipo_servico INT IDENTITY(1,1) PRIMARY KEY,
    nome VARCHAR(100) NOT NULL UNIQUE,
    descricao VARCHAR(200) NULL,
    ativo BIT NOT NULL DEFAULT 1
);
GO

/* =====================================================
   TABELA: Servico
   Entidade central do sistema.
   ===================================================== */
CREATE TABLE Servico (
    id_servico INT IDENTITY(1,1) PRIMARY KEY,
    id_cliente INT NOT NULL,
    id_veiculo INT NOT NULL,
    id_tipo_servico INT NOT NULL,

    data_inicio DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    data_conclusao DATETIME2 NULL,

    status VARCHAR(20) NOT NULL DEFAULT 'EM_ANDAMENTO',
    valor_recebido DECIMAL(10,2) NOT NULL,

    observacoes VARCHAR(500) NULL,
    data_cadastro DATETIME2 NOT NULL DEFAULT SYSDATETIME(),

    CONSTRAINT FK_Servico_Cliente
        FOREIGN KEY (id_cliente)
        REFERENCES Cliente(id_cliente),

    CONSTRAINT FK_Servico_Veiculo
        FOREIGN KEY (id_veiculo)
        REFERENCES Veiculo(id_veiculo),

    CONSTRAINT FK_Servico_TipoServico
        FOREIGN KEY (id_tipo_servico)
        REFERENCES TipoServico(id_tipo_servico),

    CONSTRAINT CK_Servico_Status
        CHECK (
            status IN (
                'EM_ANDAMENTO',
                'CONCLUIDO',
                'CANCELADO'
            )
        ),

    CONSTRAINT CK_Servico_ValorRecebido
        CHECK (valor_recebido >= 0),

    CONSTRAINT CK_Servico_DataConclusao
        CHECK (
            data_conclusao IS NULL
            OR data_conclusao >= data_inicio
        )
);
GO

/* =====================================================
   TABELA: DespesaServico
   Armazena os custos individuais de cada serviço.
   ===================================================== */
CREATE TABLE DespesaServico (
    id_despesa INT IDENTITY(1,1) PRIMARY KEY,
    id_servico INT NOT NULL,
    descricao VARCHAR(150) NOT NULL,
    valor DECIMAL(10,2) NOT NULL,
    data_despesa DATE NOT NULL DEFAULT CAST(GETDATE() AS DATE),
    observacoes VARCHAR(300) NULL,

    CONSTRAINT FK_DespesaServico_Servico
        FOREIGN KEY (id_servico)
        REFERENCES Servico(id_servico),

    CONSTRAINT CK_DespesaServico_Valor
        CHECK (valor > 0)
);
GO
