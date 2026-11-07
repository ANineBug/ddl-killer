type Storage = { setItem: (key: string, value: string) => Promise<unknown> };

export function createPersistence(storage: Storage, key: string) {
  let pending: Promise<unknown> = Promise.resolve();
  return {
    save: (serialized: string): Promise<void> => {
      // 按调用顺序写入，避免较慢的旧快照覆盖刚导入的新课表。
      const write = pending.then(() => storage.setItem(key, serialized)).then(() => {});
      pending = write.catch(() => {});
      return write;
    },
  };
}
