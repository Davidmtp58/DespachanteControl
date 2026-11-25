import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
for (const project of ['frontend', 'backend']) {
  const result = spawnSync(process.platform === 'win32' ? 'npm.cmd run build' : 'npm', process.platform === 'win32' ? [] : ['run', 'build'], {
    cwd: fileURLToPath(new URL('../' + project + '/', import.meta.url)),
    stdio: 'inherit', shell: process.platform === 'win32',
  });
  if (result.error || result.status !== 0) process.exit(result.status || 1);
}
