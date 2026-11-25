import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Pool } from 'pg';
import { PostgresDatabase } from '../src/database/postgres.js';

test('pool configures and verifies each checkout before business SQL; releases on success', async () => {
  const calls: string[] = []; const released: boolean[] = [];
  const pool = { on() {}, async end() {}, async connect() {
    return { release(discard: boolean) { released.push(discard); }, async query(sql: string, values?: unknown[]) {
      calls.push(sql);
      if (sql.includes('set_config')) assert.deepEqual(values, ['15000ms']);
      if (sql.includes('pg_settings')) return { rows: [{ setting: '15000' }] };
      return { rows: [{ ok: true }] };
    } };
  } } as unknown as Pool;
  const db = new PostgresDatabase(() => ({ statement_timeout: 15000 }), () => pool);
  await db.check(); await db.check(); await Promise.all([db.check(), db.check()]);
  assert.equal(calls.filter(sql => sql.includes('set_config')).length, 4);
  assert.equal(calls.filter(sql => sql.includes('pg_settings')).length, 4);
  assert.deepEqual(calls.slice(0, 3), ["SELECT set_config('statement_timeout', $1, false)", "SELECT setting FROM pg_settings WHERE name = 'statement_timeout'", 'SELECT 1']);
  assert.deepEqual(released, [false, false, false, false]); await db.close();
});

test('timeout setup failures discard client, prevent business SQL and never retry', async () => {
  for (const mode of ['acquire', 'set', 'verify', 'wrong', 'business']) {
    let connects = 0, business = 0; const releases: boolean[] = [];
    const pool = { on() {}, async end() {}, async connect() {
      connects++; if (mode === 'acquire') throw new Error('synthetic');
      return { release(discard: boolean) { releases.push(discard); }, async query(sql: string) {
        if (sql.includes('set_config')) { if (mode === 'set') throw new Error('synthetic'); return { rows: [] }; }
        if (sql.includes('pg_settings')) { if (mode === 'verify') throw new Error('synthetic'); return { rows: [{ setting: mode === 'wrong' ? '120000' : '15000' }] }; }
        business++; throw Object.assign(new Error('synthetic'), { code: '57014' });
      } };
    } } as unknown as Pool;
    const db = new PostgresDatabase(() => ({}), () => pool);
    await assert.rejects(db.check()); assert.equal(connects, 1);
    assert.equal(business, mode === 'business' ? 1 : 0);
    assert.deepEqual(releases, mode === 'acquire' ? [] : [true]); await db.close();
  }
});
