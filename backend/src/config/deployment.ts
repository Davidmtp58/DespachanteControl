type Environment = Record<string, string | undefined>;

export function isHosted(env: Environment = process.env): boolean {
  const mode = env.APP_MODE ?? 'local';
  if (mode !== 'local' && mode !== 'hosted') throw new Error('APP_MODE deve ser local ou hosted.');
  return mode === 'hosted';
}

export function readDeploymentConfig(env: Environment = process.env) {
  const hosted = isHosted(env);
  // One trusted ingress hop. Never trust the entire forwarded chain.
  if (hosted && env.TRUST_PROXY_HOPS !== '1') {
    throw new Error('Modo hosted exige TRUST_PROXY_HOPS=1 e ingresso exclusivo pelo proxy.');
  }
  return { hosted, trustProxy: hosted ? 1 as const : false as const };
}
