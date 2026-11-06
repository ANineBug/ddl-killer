import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTs } from './load-ts.mjs';

const { createPersistence } = await loadTs('src/data/persistence.ts');

test('较慢的旧快照必须先完成，新导入快照不会被旧写入覆盖', async () => {
  const writes = [];
  let release;
  const blocked = new Promise((resolve) => { release = resolve; });
  const persistence = createPersistence({ setItem: async (key, value) => {
    if (value === 'old') await blocked;
    writes.push([key, value]);
  } }, 'store.v1');
  const old = persistence.save('old');
  const fresh = persistence.save('imported');
  await Promise.resolve();
  assert.equal(writes.length, 0);
  release();
  await Promise.all([old, fresh]);
  assert.deepEqual(writes, [['store.v1', 'old'], ['store.v1', 'imported']]);
});

test('写入失败返回给调用者，重试仍可成功，不把失败伪装成成功', async () => {
  let attempt = 0;
  const persistence = createPersistence({ setItem: async () => {
    if (++attempt === 1) throw new Error('storage full');
  } }, 'store.v1');
  await assert.rejects(persistence.save('first'), /storage full/);
  await persistence.save('retry');
  assert.equal(attempt, 2);
});
