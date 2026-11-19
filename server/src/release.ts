// 最新的安卓版本：从 GitHub Release 读，缓存 10 分钟。app 打开时拿它和自己的版本比，决定要不要提示更新
export type LatestRelease = { version: string; notes: string; url: string };

const REPO = 'ANineBug/ddl-killer';
const CACHE_MS = 10 * 60_000;

export function githubLatest(fetcher: typeof fetch = fetch): () => Promise<LatestRelease | null> {
  let cached: { at: number; value: LatestRelease | null } | null = null;
  return async () => {
    if (cached && Date.now() - cached.at < CACHE_MS) return cached.value;
    try {
      const res = await fetcher(`https://api.github.com/repos/${REPO}/releases/latest`, {
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'ddl-killer-server' },
      });
      if (!res.ok) throw new Error(`GitHub ${res.status}`);
      const r = (await res.json()) as { tag_name: string; body?: string; assets?: { name: string; browser_download_url: string }[] };
      const apk = r.assets?.find((a) => a.name === 'ddl-killer.apk');
      const value = apk ? { version: r.tag_name.replace(/^v/, ''), notes: r.body ?? '', url: apk.browser_download_url } : null;
      cached = { at: Date.now(), value };
      return value;
    } catch (e) {
      console.error('latest release', e);
      // 失败了别一直重试：1 分钟后再试
      cached = { at: Date.now() - CACHE_MS + 60_000, value: cached?.value ?? null };
      return cached.value;
    }
  };
}
