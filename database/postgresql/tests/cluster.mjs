import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { randomBytes } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, readFile, realpath, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import net from 'node:net';

const exec = promisify(execFile);
const root = fileURLToPath(new URL('../.test-clusters/', import.meta.url));
const bin = process.env.PG_TEST_BIN || (process.platform === 'win32' ? 'C:/Program Files/PostgreSQL/18/bin' : '/usr/lib/postgresql/18/bin');
const binary = name => path.join(bin, name + (process.platform === 'win32' ? '.exe' : ''));

// This harness cannot accept a connection URL, database name or remote host.
// It starts its own new cluster; existing PostgreSQL/SQL Server services are never used.
export async function startCluster() {
  await mkdir(root, { recursive: true });
  const directory = await mkdtemp(path.join(root, 'dc-pg-test-'));
  const marker = randomBytes(24).toString('hex');
  await writeFile(path.join(directory, '.owned-by-test'), marker);
  const password = randomBytes(32).toString('hex');
  const passwordFile = path.join(directory, 'password.tmp');
  await writeFile(passwordFile, password, { mode: 0o600 });
  const data = path.join(directory, 'data');
  const listener = net.createServer();
  await new Promise((resolve, reject) => { listener.once('error', reject); listener.listen(0, '127.0.0.1', resolve); });
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith('PG')));
  Object.assign(env, { PGPASSWORD: password, PGCLIENTENCODING: 'UTF8', PGCONNECT_TIMEOUT: '5' });
  const options = { windowsHide: true, env, maxBuffer: 4 * 1024 * 1024, timeout: 120000 };
  let stage = 'initdb';
  let started = false;
  const stop = async () => {
    if (started) {
      await exec(binary('pg_ctl'), ['-D', data, '-m', 'fast', '-w', 'stop'], options);
      started = false;
    }
    // Verify absolute real paths and the unique marker BEFORE any recursive delete.
    const absoluteRoot = await realpath(root);
    const absoluteDirectory = await realpath(directory);
    if (path.dirname(absoluteDirectory) !== absoluteRoot || !path.basename(absoluteDirectory).startsWith('dc-pg-test-') ||
      await readFile(path.join(absoluteDirectory, '.owned-by-test'), 'utf8') !== marker) {
      throw new Error('Refusing cleanup outside the cluster owned by this test.');
    }
    await rm(absoluteDirectory, { recursive: true, maxRetries: 10, retryDelay: 250 });
  };
  try {
    await exec(binary('initdb'), ['-D', data, '-U', 'dc_test_admin', '--pwfile', passwordFile,
      '--auth=scram-sha-256', '--encoding=UTF8', '--locale=C', '--no-sync'], options);
    await rm(passwordFile);
    stage = 'start';
    // Do not leave inherited stdout pipes open in the long-running Windows server.
    await new Promise((resolve, reject) => {
      const child = spawn(binary('pg_ctl'), ['-D', data, '-l', path.join(directory, 'postgres.log'),
        '-o', `-h 127.0.0.1 -p ${port}`, '-w', '-t', '60', 'start'],
      { windowsHide: true, env, stdio: 'ignore' });
      child.once('error', reject);
      child.once('exit', code => code === 0 ? resolve() : reject(new Error('pg_ctl startup failed')));
    });
    started = true;
    const args = ['-X', '-h', '127.0.0.1', '-p', String(port), '-U', 'dc_test_admin', '-d', 'postgres',
      '-v', 'ON_ERROR_STOP=1', '-A', '-t', '-q'];
    // Pass SQL through a file, not a shell. Every file belongs to this disposable cluster.
    let sequence = 0;
    const sql = async statement => {
      const filename = path.join(directory, `query-${sequence++}.sql`);
      await writeFile(filename, statement, 'utf8');
      try { return (await exec(binary('psql'), [...args, '-f', filename], options)).stdout.trim(); }
      finally { await rm(filename); }
    };
    // Only the freshly created disposable cluster. Never log these credentials.
    const connection = () => ({ host: '127.0.0.1', port, database: 'postgres', user: 'dc_test_admin', password, ssl: false });
    return { sql, stop, connection };
  } catch (error) {
    // If startup has an uncertain outcome, preserve the directory for inspection.
    // Never stop a cluster whose startup was not confirmed.
    const detail = String(error.stderr ?? '').replaceAll(password, '[redacted]').slice(-1500);
    throw new Error(`Disposable PostgreSQL ${stage} failed (${error.code ?? error.signal ?? 'unknown'}). Directory retained: ${directory}\n${detail}`);
  }
}
