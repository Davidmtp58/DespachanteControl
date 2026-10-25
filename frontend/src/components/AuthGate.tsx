import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { authClient, AuthError, type Sessao, type Usuario } from "../services/auth";
import { Login } from "../pages/Login";
import { loginDestination, navigateUrl, paginaFromPath, useLocation } from "../navigation";

export interface AuthControls {
  usuario: Usuario;
  sair: () => void;
  saindo: boolean;
  getCsrfToken: () => string;
  expireSession: () => void;
}
export function AuthGate({ children }: { children: (auth: AuthControls) => ReactNode }) {
  const { pathname, search } = useLocation();
  const [sessao, setSessao] = useState<Sessao>();
  const [checking, setChecking] = useState(true);
  const [blocked, setBlocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const current = useRef<Sessao | undefined>(undefined);
  const generation = useRef(0);
  const pending = useRef(false);
  // Wait for the cookie check before deciding whether a URL is accessible.
  useEffect(() => {
    if (checking || blocked) return;
    if (!sessao && pathname !== "/login") {
      const pagina = paginaFromPath(pathname);
      navigateUrl(pagina ? `/login?next=/${pagina}` : "/login", true);
    } else if (sessao && !paginaFromPath(pathname)) {
      navigateUrl(pathname === "/login" ? loginDestination(search) : "/dashboard", true);
    }
  }, [checking, blocked, sessao, pathname, search]);
  function update(value?: Sessao) {
    current.current = value;
    setSessao(value);
  }
  const getCsrfToken = useCallback(() => current.current?.csrfToken ?? "", []);
  const expireSession = useCallback(() => {
    generation.current++;
    pending.current = false;
    update();
    setBlocked(false);
    setChecking(false);
    setMessage("Sua sessão expirou. Entre novamente.");
  }, []);
  async function check() {
    if (pending.current) return;
    pending.current = true;
    const version = ++generation.current;
    try {
      const result = await authClient.me();
      if (version !== generation.current) return;
      update(result);
      setBlocked(false);
      setMessage("");
    } catch (error) {
      if (version !== generation.current) return;
      if (error instanceof AuthError && error.status === 401) {
        setMessage(current.current ? "Sua sessão expirou. Entre novamente." : "");
        update();
        setBlocked(false);
      } else {
        setBlocked(true);
        setMessage((error as Error).message);
      }
    } finally {
      if (version === generation.current) {
        pending.current = false;
        setChecking(false);
      }
    }
  }
  useEffect(() => {
    void check();
    const recheck = () => {
      if (current.current && document.visibilityState === "visible") void check();
    };
    const timer = window.setInterval(recheck, 60000);
    window.addEventListener("focus", recheck);
    document.addEventListener("visibilitychange", recheck);
    return () => {
      generation.current++;
      pending.current = false;
      clearInterval(timer);
      window.removeEventListener("focus", recheck);
      document.removeEventListener("visibilitychange", recheck);
    };
  }, []);
  async function entrar(email: string, senha: string) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setMessage("");
    try {
      update(await authClient.login(email, senha));
      setBlocked(false);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  async function sair() {
    if (pending.current || !current.current) return;
    pending.current = true;
    setBusy(true);
    setMessage("");
    try {
      try {
        await authClient.logout(current.current.csrfToken);
      } catch (error) {
        if (!(error instanceof AuthError) || error.status !== 403) throw error;
        // Another tab may have renewed the cookie and CSRF token.
        const renewed = await authClient.me();
        update(renewed);
        await authClient.logout(renewed.csrfToken);
      }
      update();
      navigateUrl("/login", true);
    } catch (error) {
      if (error instanceof AuthError && error.status === 401) {
        update();
        navigateUrl("/login", true);
      } else setMessage("Não foi possível sair. Sua sessão pode continuar ativa. Tente novamente.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  if (checking)
    return (
      <div className="loading" role="status">
        Verificando sessão…
      </div>
    );
  if (blocked)
    return (
      <div className="loading">
        <p role="alert">{message}</p>
        <button
          className="primary"
          onClick={() => {
            setChecking(true);
            void check();
          }}
        >
          Tentar novamente
        </button>
      </div>
    );
  if (!sessao) return <Login entrar={entrar} busy={busy} message={message} />;
  if (!paginaFromPath(pathname))
    return (
      <div className="loading" role="status">
        Abrindo página…
      </div>
    );
  return (
    <>
      {message && (
        <div className="error" role="alert">
          {message}
        </div>
      )}
      {children({
        usuario: sessao.usuario,
        sair: () => void sair(),
        saindo: busy,
        getCsrfToken,
        expireSession,
      })}
    </>
  );
}
