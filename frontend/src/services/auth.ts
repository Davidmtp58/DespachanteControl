export interface Usuario {
  id_usuario: number;
  nome: string;
  email: string;
  ativo: boolean;
  data_cadastro: string;
}
export interface Sessao {
  usuario: Usuario;
  csrfToken: string;
}
export class AuthError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function createAuthClient(fetcher: typeof fetch = fetch) {
  async function request(path: string, init: RequestInit = {}) {
    let response: Response;
    try {
      response = await fetcher(`/api/auth/${path}`, {
        ...init,
        credentials: "include",
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
      });
    } catch {
      throw new AuthError(
        0,
        "Não foi possível acessar a API. Verifique a conexão e tente novamente.",
      );
    }
    if (!response.ok) {
      const message =
        response.status === 401
          ? path === "login"
            ? "E-mail ou senha inválidos."
            : "Sua sessão expirou. Entre novamente."
          : response.status === 429
            ? "Muitas tentativas. Aguarde alguns minutos antes de tentar novamente."
            : response.status === 403
              ? "Não foi possível autorizar a operação. Verifique a origem configurada da aplicação e tente novamente."
              : "Não foi possível concluir a operação. Tente novamente.";
      throw new AuthError(response.status, message);
    }
    return response;
  }
  async function session(response: Response): Promise<Sessao> {
    try {
      const data = await response.json();
      if (
        !data.usuario ||
        !Number.isInteger(data.usuario.id_usuario) ||
        typeof data.usuario.nome !== "string" ||
        typeof data.usuario.email !== "string" ||
        data.usuario.ativo !== true ||
        typeof data.usuario.data_cadastro !== "string" ||
        typeof data.csrfToken !== "string" ||
        !/^[a-f0-9]{64}$/.test(data.csrfToken)
      )
        throw new Error();
      const { id_usuario, nome, email, ativo, data_cadastro } = data.usuario;
      return {
        usuario: { id_usuario, nome, email, ativo, data_cadastro },
        csrfToken: data.csrfToken,
      };
    } catch {
      throw new AuthError(502, "A API retornou uma resposta inválida. Tente novamente.");
    }
  }
  return {
    async login(email: string, senha: string) {
      return session(
        await request("login", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Requested-With": "DespachanteControl",
          },
          body: JSON.stringify({ email, senha }),
        }),
      );
    },
    async me() {
      return session(await request("me"));
    },
    async logout(csrfToken: string) {
      await request("logout", { method: "POST", headers: { "X-CSRF-Token": csrfToken } });
    },
  };
}
export const authClient = createAuthClient();
