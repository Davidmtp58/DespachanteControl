import { loadDiagnosticConfig, runDiagnostic } from '../services/supabase-diagnostic.js';

try {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--env-file') throw new Error('Arguments');
  const config = loadDiagnosticConfig(args[1]);
  console.log(JSON.stringify(await runDiagnostic(config), null, 2));
} catch {
  // Never print raw filesystem, TLS, dotenv or PostgreSQL errors/configuration.
  console.error('Diagnostico interrompido. Confira arquivo privado, destino HML, PG_PASSWORD, CA, TLS e permissoes. Nenhuma tentativa automatica sera feita.');
  process.exitCode = 1;
}
