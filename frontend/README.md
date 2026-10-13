# DespachanteControl — Frontend

Interface administrativa local em React + TypeScript, com Vite. Esta etapa não possui backend, API, autenticação, token, sessão, banco adicional ou publicação. O banco oficial permanece SQL Server.

## Executar

Requer Node.js 22 e npm instalados.

```powershell
cd frontend
npm ci
npm run dev
```

Abra o endereço local exibido no terminal. Na tela de login, clique em **Entrar** sem informar credenciais. O formulário serve somente como entrada visual à demonstração.

## Verificar

```powershell
npm run build
npm test
npm run test:ui
```

Não há script de lint. O build inclui verificação estrita de TypeScript. `npm run format` formata os arquivos com Prettier.

Os testes de navegador usam Microsoft Edge instalado (`channel: msedge`) em modo headless. Iniciam ou reutilizam o Vite em `127.0.0.1:5173`. Capturas e traces ficam em `test-results/`, ignorado pelo Git. Caso use outro navegador, ajuste o canal em `playwright.config.ts`.

## Telas e comportamento

- Login visual, dashboard, clientes, veículos e serviços.
- Cadastros, edição, visualização e busca de clientes e veículos.
- Filtros de status, tipo de serviço, cliente e período da data de início.
- Cadastro e edição de serviços com solicitante independente do proprietário.
- Detalhe do serviço com inclusão, edição e remoção confirmada de despesas.
- Resumo financeiro calculado automaticamente, inclusive com resultado negativo.
- Layout responsivo, menu móvel, diálogos com foco gerenciado e fechamento por Escape.

Os dados são fictícios e as alterações permanecem **somente em memória**. Recarregar a página restaura os mocks e volta à tela de login. CPF/CNPJ e RENAVAM demonstrativos não representam documentos reais. A interface valida formato/tamanho e unicidade; não valida dígitos verificadores.

## Organização

- `src/App.tsx`: estado de navegação visual e coordenação das telas e diálogos.
- `src/layouts/Layout.tsx`: sidebar, barra superior e estrutura responsiva.
- `src/components/ui.tsx`: componentes compartilhados, indicadores de status e diálogo.
- `src/components/forms.tsx`: formulários de cliente, veículo, serviço e despesa.
- `src/pages/`: login, dashboard, listagens e detalhe operacional.
- `src/types/index.ts`: contratos TypeScript, alinhados às entidades existentes.
- `src/mocks/data.ts`: dados demonstrativos isolados dos componentes.
- `src/services/gestao.ts`: contrato `GestaoService`, adaptador em memória e validações.
- `src/services/financeiro.ts`: formatação e cálculos monetários em centavos.
- `src/styles.css`: estilos e breakpoints responsivos.
- `tests/gestao.test.ts`: regras de negócio e alterações financeiras.
- `tests/browser/fluxos.spec.ts`: fluxo completo no navegador e layout móvel.

## Regras financeiras

Custo total = soma das despesas do serviço.

Resultado líquido = valor recebido − custo total.

O status é operacional. Serviços cancelados continuam somando receita e despesas nos indicadores. O resultado não é editável nem armazenado. Sem despesas, o custo é zero. O serviço pode ter resultado negativo.

## Integração futura

A interface usa `GestaoService`, sem `fetch` nem chamadas reais. Na próxima etapa, um adaptador poderá implementar esse contrato consumindo a futura API Node.js + TypeScript, responsável pelo SQL Server e pela autenticação. Os identificadores string dos mocks e os nomes camelCase são contratos de apresentação e precisarão de mapeamento para os identificadores e campos SQL. Datas de serviço nesta interface têm precisão de dia; o banco comporta `DATETIME2`.

O README da raiz e os arquivos de `database/` não são modificados por este frontend.
