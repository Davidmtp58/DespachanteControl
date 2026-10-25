import { useSyncExternalStore } from "react";
import type { Pagina } from "./types";

const paginas: readonly Pagina[] = ["dashboard", "clientes", "veiculos", "servicos", "despesas"];
export function paginaFromPath(path: string): Pagina | undefined {
  return paginas.find((pagina) => path === `/${pagina}` || path === `/${pagina}/`);
}
export function loginDestination(search: string): string {
  const pagina = paginaFromPath(new URLSearchParams(search).get("next") ?? "");
  return `/${pagina ?? "dashboard"}`;
}
export function navigateUrl(path: string, replace = false) {
  if (window.location.pathname + window.location.search === path) return;
  window.history[replace ? "replaceState" : "pushState"](null, "", path);
  window.dispatchEvent(new Event("popstate"));
}
function subscribe(listener: () => void) {
  window.addEventListener("popstate", listener);
  return () => window.removeEventListener("popstate", listener);
}
export function useLocation() {
  const location = useSyncExternalStore(
    subscribe,
    () => window.location.pathname + window.location.search,
  );
  const [pathname, search = ""] = location.split("?");
  return { pathname, search };
}
