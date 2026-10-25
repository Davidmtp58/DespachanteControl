import type { Veiculo } from "../types";
import type { ClientesAuth } from "./clientes";

export class VeiculosError extends Error {
  constructor(
    public status: number,
    message: string,
    public fields: Partial<Record<"placa" | "renavam", string>> = {},
  ) {
    super(message);
  }
}
function idValido(value: string) {
  return /^[1-9]\d*$/.test(value) && Number(value) <= 2147483647;
}
export function veiculoPayload(item: Veiculo) {
  const placa = item.placa.trim().toUpperCase();
  if (!idValido(item.proprietarioId))
    throw new VeiculosError(400, "Selecione um cliente proprietário cadastrado.");
  if (!/^(?:[A-Z]{3}-?\d{4}|[A-Z]{3}\d[A-Z]\d{2})$/.test(placa))
    throw new VeiculosError(400, "Informe uma placa válida: ABC1234, ABC-1234 ou ABC1D23.");
  if (!/^\d{11}$/.test(item.renavam.trim()))
    throw new VeiculosError(400, "RENAVAM deve conter exatamente 11 dígitos.");
  if (item.ano !== null && (!Number.isInteger(item.ano) || item.ano < 1000 || item.ano > 9999))
    throw new VeiculosError(400, "O ano deve ter quatro dígitos ou ficar vazio.");
  for (const [value, max, name] of [
    [item.tipo, 30, "tipo de veículo"],
    [item.marca, 50, "marca"],
    [item.modelo, 80, "modelo"],
  ] as const) {
    if (!value.trim() || value.trim().length > max)
      throw new VeiculosError(400, `Informe ${name} com até ${max} caracteres.`);
  }
  return {
    id_cliente_proprietario: Number(item.proprietarioId),
    placa: placa.replace("-", ""),
    tipo_veiculo: item.tipo.trim(),
    marca: item.marca.trim(),
    modelo: item.modelo.trim(),
    ano: item.ano,
    renavam: item.renavam.trim(),
  };
}
export function veiculoFromApi(value: unknown): Veiculo {
  const data = value as Record<string, unknown> | null;
  if (
    !data ||
    !Number.isInteger(data.id_veiculo) ||
    !idValido(String(data.id_veiculo)) ||
    !Number.isInteger(data.id_cliente_proprietario) ||
    !idValido(String(data.id_cliente_proprietario)) ||
    ![data.placa, data.tipo_veiculo, data.marca, data.modelo, data.renavam].every(
      (v) => typeof v === "string",
    ) ||
    !(
      data.ano === null ||
      (Number.isInteger(data.ano) && Number(data.ano) >= 1000 && Number(data.ano) <= 9999)
    )
  ) {
    throw new VeiculosError(502, "A API retornou dados de veículo inválidos. Atualize a listagem.");
  }
  return {
    id: String(data.id_veiculo),
    proprietarioId: String(data.id_cliente_proprietario),
    placa: data.placa as string,
    tipo: data.tipo_veiculo as string,
    marca: data.marca as string,
    modelo: data.modelo as string,
    ano: data.ano as number | null,
    renavam: data.renavam as string,
  };
}
export function createVeiculosClient(auth: ClientesAuth, fetcher: typeof fetch = fetch) {
  async function request(path = "", method = "GET", item?: Veiculo): Promise<unknown> {
    const body = item ? JSON.stringify(veiculoPayload(item)) : undefined;
    let response: Response;
    try {
      response = await fetcher(`/api/veiculos${path}`, {
        method,
        credentials: "include",
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
        ...(body
          ? {
              body,
              headers: {
                "Content-Type": "application/json",
                "X-CSRF-Token": auth.getCsrfToken(),
              },
            }
          : {}),
      });
    } catch {
      throw new VeiculosError(
        0,
        method === "GET"
          ? "Não foi possível conectar à API. Tente novamente."
          : "Não foi possível confirmar o salvamento. Confira a listagem antes de salvar novamente.",
      );
    }
    if (!response.ok) {
      if (response.status === 401) auth.expireSession();
      let code: unknown;
      try {
        code = (await response.json())?.error?.code;
      } catch {
        /* Generic safe message below. */
      }
      const messages: Record<number, string> = {
        400:
          code === "OWNER_NOT_FOUND"
            ? "Cliente proprietário não encontrado. Feche e reabra o formulário para atualizar os clientes."
            : "Dados inválidos. Confira proprietário, placa, RENAVAM, tipo, marca, modelo e ano.",
        401: "Sua sessão expirou. Entre novamente.",
        403: "Operação não autorizada. Recarregue a página para renovar a sessão.",
        404: "Veículo não encontrado. Atualize a listagem.",
        409: "Placa ou RENAVAM já cadastrado. Confira os dados informados.",
      };
      if (response.status === 409) {
        const fields: VeiculosError["fields"] = {};
        if (code === "DUPLICATE_PLATE" || code === "DUPLICATE_PLATE_AND_RENAVAM")
          fields.placa = "Esta placa já está cadastrada em outro veículo.";
        if (code === "DUPLICATE_RENAVAM" || code === "DUPLICATE_PLATE_AND_RENAVAM")
          fields.renavam = "Este RENAVAM já está cadastrado em outro veículo.";
        if (Object.keys(fields).length)
          throw new VeiculosError(409, Object.values(fields).join(" "), fields);
      }
      throw new VeiculosError(
        response.status,
        messages[response.status] ??
          "Não foi possível concluir a operação de Veículos. Tente novamente.",
      );
    }
    try {
      return await response.json();
    } catch {
      throw new VeiculosError(
        502,
        "Resposta inválida da API. Confira a listagem antes de tentar novamente.",
      );
    }
  }
  function path(id: string) {
    if (!idValido(id)) throw new VeiculosError(400, "ID de veículo inválido.");
    return `/${id}`;
  }
  return {
    async list() {
      const data = await request();
      if (!Array.isArray(data)) throw new VeiculosError(502, "A API retornou uma lista inválida.");
      return data.map(veiculoFromApi);
    },
    async find(id: string) {
      return veiculoFromApi(await request(path(id)));
    },
    async create(item: Veiculo) {
      return veiculoFromApi(await request("", "POST", item));
    },
    async update(id: string, item: Veiculo) {
      return veiculoFromApi(await request(path(id), "PUT", item));
    },
  };
}
