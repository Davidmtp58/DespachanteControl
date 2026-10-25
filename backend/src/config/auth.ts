export interface AuthConfig {
  secret: string;
  ttlMs: number;
  secureCookie: boolean;
  origins: string[];
  loginWindowMs: number;
  loginLimit: number;
}

export function readAuthConfig(env: NodeJS.ProcessEnv = process.env): AuthConfig {
  if (!/^[a-fA-F0-9]{64,}$/.test(env.SESSION_SECRET ?? '')) {
    throw new Error('Configure SESSION_SECRET com pelo menos 32 bytes aleatórios em hexadecimal.');
  }
  function positive(name: string, fallback: number, max: number) {
    const raw = env[name] ?? String(fallback);
    const value = Number(raw);
    if (!/^\d+$/.test(raw) || value < 1 || value > max) throw new Error(`Configuração ${name} inválida.`);
    return value;
  }
  const secure = env.SESSION_COOKIE_SECURE ?? 'false';
  if (!['true', 'false'].includes(secure)) throw new Error('SESSION_COOKIE_SECURE deve ser true ou false.');
  const origins = (env.AUTH_ALLOWED_ORIGINS ?? 'http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:3000,http://localhost:3000,http://127.0.0.1:3001,http://localhost:3001').split(',').map(s => s.trim());
  for (const origin of origins) {
    let url: URL;
    try { url = new URL(origin); } catch { throw new Error('AUTH_ALLOWED_ORIGINS inválido.'); }
    if (!['http:', 'https:'].includes(url.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.origin !== origin) {
      throw new Error('AUTH_ALLOWED_ORIGINS deve conter origens locais exatas, sem caminho.');
    }
  }
  return { secret: env.SESSION_SECRET!, ttlMs: positive('SESSION_TTL_MINUTES', 30, 1440) * 60000,
    secureCookie: secure === 'true', origins, loginWindowMs: positive('LOGIN_WINDOW_MINUTES', 15, 60) * 60000,
    loginLimit: positive('LOGIN_MAX_ATTEMPTS', 10, 100) };
}
