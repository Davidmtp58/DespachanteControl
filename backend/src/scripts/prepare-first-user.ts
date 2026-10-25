import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { prepareFirstUser } from '../services/first-user.js';

// Gera somente SQL no terminal. Não importa conexão, dotenv ou repositório.
if (!process.stdin.isTTY || !process.stdout.isTTY) {
  console.error('Execute em um terminal interativo; redirecionamento de entrada/saída não é permitido.');
  process.exitCode = 1;
} else {
  let hidden = false;
  const output = new Writable({ write(chunk, _encoding, callback) { if (!hidden) process.stdout.write(chunk); callback(); } });
  const rl = createInterface({ input: process.stdin, output, terminal: true, historySize: 0 });
  try {
    const nome = await rl.question('Nome: ');
    const email = await rl.question('E-mail: ');
    process.stdout.write('Senha (não será exibida): ');
    hidden = true;
    let senha = await rl.question('');
    process.stdout.write('\nConfirme a senha: ');
    let confirmation = await rl.question('');
    hidden = false;
    process.stdout.write('\n');
    const sql = await prepareFirstUser(nome, email, senha, confirmation);
    senha = ''; confirmation = '';
    console.log(sql);
    console.log('\nNenhum comando foi executado no banco. Não versione este conteúdo.');
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Não foi possível preparar o usuário.');
    process.exitCode = 1;
  } finally { hidden = false; rl.close(); }
}
