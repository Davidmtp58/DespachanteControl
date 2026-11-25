// Local-only regression probe. No pool, network, environment files or real data.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SessionData } from 'express-session';
import { PostgresSessionStore } from '../../src/services/auth-state.js';

test('pending session save must not recreate a session after logout', async () => {
  const rows = new Map<string, SessionData>();
  const revoked = new Set<string>();
  let pause = false;
  let release!: () => void;
  let entered!: () => void;
  const blocked = new Promise<void>(resolve => { entered = resolve; });
  const resume = new Promise<void>(resolve => { release = resolve; });
  const db = { async query<T>(sql: string, values: unknown[] = []): Promise<T[]> {
    const key = String(values[0]);
    if (sql.includes("interval '48 hours'")) {
      revoked.add(key); rows.delete(key);
    } else if (sql.startsWith('INSERT INTO dc_auth.sessions')) {
      if (pause) { entered(); await resume; }
      if (revoked.has(key)) return [];
      rows.set(key, JSON.parse(String(values[1])) as SessionData);
      return [{ key_hash: key }] as T[];
    } else if (sql === 'DELETE FROM dc_auth.sessions WHERE key_hash=$1') {
      rows.delete(key);
    } else if (sql.startsWith('SELECT data')) {
      return (rows.has(key) ? [{ data: rows.get(key) }] : []) as T[];
    } else if (!sql.startsWith('DELETE FROM dc_auth.sessions WHERE expires_at')) {
      throw new Error('Unexpected query in simulated executor');
    }
    return [];
  } };
  const writer = new PostgresSessionStore(db, 'synthetic-test-key');
  const logout = new PostgresSessionStore(db, 'synthetic-test-key');
  const data = { expiresAt: Date.now() + 60000 } as SessionData;
  const save = () => new Promise<void>((resolve, reject) => writer.set('synthetic-id', data, err => err ? reject(err) : resolve()));
  const read = () => new Promise<SessionData | null | undefined>((resolve, reject) => logout.get('synthetic-id', (err, value) => err ? reject(err) : resolve(value)));
  await save();
  pause = true;
  const pending = save().then(() => null, error => error);
  await blocked;
  await new Promise<void>((resolve, reject) => logout.destroy('synthetic-id', err => err ? reject(err) : resolve()));
  assert.equal(await read(), null);
  release();
  assert.equal((await pending)?.status, 503);
  assert.equal(Boolean(await read()), false, 'A delayed set recreated the deleted session');
});
