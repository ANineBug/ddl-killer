import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';

// 业务代码只认这个接口，背后可以是真正的 PostgreSQL（服务器上），
// 也可以是 PGlite（编译成 WebAssembly 的 PostgreSQL，本机开发和测试用，不用装数据库）。
// 两者是同一套 SQL，所以测试通过就说明服务器上也能跑。
export interface Db {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  one<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | undefined>;
  // 事务：里面任何一步出错，整组改动都撤销。已经在事务里时直接复用，不再嵌套
  tx<T>(fn: (db: Db) => Promise<T>): Promise<T>;
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
}

type Runner = {
  query(sql: string, params?: unknown[]): Promise<{ rows: unknown[] }>;
  exec(sql: string): Promise<void>;
};

function wrap(run: Runner, tx: Db['tx'], close: () => Promise<void>): Db {
  const db: Db = {
    async query<T>(sql: string, params?: unknown[]) {
      return (await run.query(sql, params)).rows as T[];
    },
    async one<T>(sql: string, params?: unknown[]) {
      return (await run.query(sql, params)).rows[0] as T | undefined;
    },
    tx,
    exec: (sql) => run.exec(sql),
    close,
  };
  return db;
}

// PostgreSQL 的 int8 / numeric 在 node-pg 里默认是字符串。我们的 SQL 都把计数和求和转成 ::int，
// 这里再把 int8 也转成数字兜底，免得哪里漏了转换变成 "3" + 1 = "31"
pg.types.setTypeParser(20, (v) => Number(v));

export function postgres(url: string): Db {
  const pool = new pg.Pool({ connectionString: url, max: 10 });
  const runner = (c: pg.Pool | pg.PoolClient): Runner => ({
    query: (sql, params) => c.query(sql, params as unknown[]),
    exec: async (sql) => {
      await c.query(sql);
    },
  });
  const make = (c: pg.Pool | pg.PoolClient, inTx: boolean): Db =>
    wrap(
      runner(c),
      async (fn) => {
        if (inTx) return fn(make(c, true));
        const client = await pool.connect();
        try {
          await client.query('begin');
          const out = await fn(make(client, true));
          await client.query('commit');
          return out;
        } catch (e) {
          await client.query('rollback');
          throw e;
        } finally {
          client.release();
        }
      },
      () => pool.end(),
    );
  return make(pool, false);
}

// dataDir 不给就是纯内存（测试用），给了就存到那个文件夹（本机开发用）
export async function pglite(dataDir?: string): Promise<Db> {
  const lite = await PGlite.create(dataDir);
  const runnerOf = (r: { query: PGlite['query']; exec: PGlite['exec'] }): Runner => ({
    query: (sql, params) => r.query(sql, params),
    exec: async (sql) => {
      await r.exec(sql);
    },
  });
  const make = (r: Runner, inTx: boolean): Db =>
    wrap(
      r,
      async (fn) => {
        if (inTx) return fn(make(r, true));
        return lite.transaction(async (t) => fn(make(runnerOf(t), true)));
      },
      () => lite.close(),
    );
  return make(runnerOf(lite), false);
}

// 按文件名顺序执行 migrations/ 里还没跑过的 .sql，每个文件一个事务
export async function migrate(db: Db, dir = join(import.meta.dirname, '..', 'migrations')) {
  await db.exec('create table if not exists _migrations (name text primary key, at timestamptz not null default now())');
  const done = new Set((await db.query<{ name: string }>('select name from _migrations')).map((r) => r.name));
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) {
    if (done.has(f)) continue;
    const sql = await readFile(join(dir, f), 'utf8');
    await db.tx(async (t) => {
      await t.exec(sql);
      await t.query('insert into _migrations (name) values ($1)', [f]);
    });
  }
}
