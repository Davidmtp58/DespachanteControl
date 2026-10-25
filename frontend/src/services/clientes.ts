import type { Cliente } from "../types";

export class ClientesError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export interface ClientesAuth {
  getCsrfToken: () => string;
  expireSession: () => void;
}
export function clientePayload(item: Cliente) {
  return {
    tipo_pessoa: item.tipoPessoa,
    nome_razao_social: item.nome.trim(),
    cpf_cnpj: item.documento
      .trim()
      .replace(/[.\/-]/g, "")
      .toUpperCase(),
    telefone: item.telefone.trim(),
    email: item.email.trim() || null,
    data_nascimento: item.nascimento || null,
  };
}
export function clienteFromApi(value: unknown): Cliente {
  const data = value as Record<string, unknown> | null;
  if (
    !data ||
    !Number.isInteger(data.id_cliente) ||
    Number(data.id_cliente) <= 0 ||
    !["PF", "PJ"].includes(String(data.tipo_pessoa)) ||
    ![data.nome_razao_social, data.cpf_cnpj, data.telefone].every((v) => typeof v === "string") ||
    !(data.email === null || typeof data.email === "string") ||
    !(
      data.data_nascimento === null ||
      (typeof data.data_nascimento === "string" && /^\d{4}-\d{2}-\d{2}$/.test(data.data_nascimento))
    )
  ) {
    throw new ClientesError(
      502,
      "A API retornou dados de cliente inválidos. Tente atualizar a lista.",
    );
  }
  return {
    id: String(data.id_cliente),
    tipoPessoa: data.tipo_pessoa as "PF" | "PJ",
    nome: data.nome_razao_social as string,
    documento: data.cpf_cnpj as string,
    telefone: data.telefone as string,
    email: (data.email as string) ?? "",
    nascimento: (data.data_nascimento as string) ?? "",
  };
}
export function createClientesClient(auth: ClientesAuth, fetcher: typeof fetch = fetch) {
  async function request(path = "", method = "GET", item?: Cliente): Promise<unknown> {
    let response: Response;
    try {
      response = await fetcher(`/api/clientes${path}`, {
        method,
        credentials: "include",
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
        ...(item
          ? {
              headers: { "Content-Type": "application/json", "X-CSRF-Token": auth.getCsrfToken() },
              body: JSON.stringify(clientePayload(item)),
            }
          : {}),
      });
    } catch {
      throw new ClientesError(
        0,
        method === "GET"
          ? "Não foi possível conectar à API. Tente novamente."
          : "Não foi possível confirmar o salvamento. Confira a listagem antes de tentar salvar novamente.",
      );
    }
    if (!response.ok) {
      if (response.status === 401) auth.expireSession();
      const messages: Record<number, string> = {
        400: "Dados inválidos. Confira o tipo PF/PJ, CPF/CNPJ com dígitos verificadores válidos, nome, telefone, e-mail e data de nascimento.",
        401: "Sua sessão expirou. Entre novamente.",
        403: "Operação não autorizada. Recarregue a página para renovar a sessão antes de tentar novamente.",
        404: "Cliente não encontrado. Atualize a listagem.",
        409: "CPF/CNPJ já cadastrado. Confira o documento informado.",
      };
      throw new ClientesError(
        response.status,
        messages[response.status] ??
          "Não foi possível concluir a operação de Clientes. Tente novamente.",
      );
    }
    try {
      return await response.json();
    } catch {
      throw new ClientesError(
        502,
        "Resposta inválida da API. Confira a listagem antes de tentar novamente.",
      );
    }
  }
  function path(id: string) {
    if (!/^[1-9]\d*$/.test(id)) throw new ClientesError(400, "ID de cliente inválido.");
    return `/${id}`;
  }
  return {
    async list() {
      const data = await request();
      if (!Array.isArray(data)) throw new ClientesError(502, "A API retornou uma lista inválida.");
      return data.map(clienteFromApi);
    },
    async find(id: string) {
      return clienteFromApi(await request(path(id)));
    },
    async create(item: Cliente) {
      return clienteFromApi(await request("", "POST", item));
    },
    async update(id: string, item: Cliente) {
      return clienteFromApi(await request(path(id), "PUT", item));
    },
  };
}
