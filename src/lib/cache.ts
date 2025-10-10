"use client";

type Fetcher<T> = () => Promise<T>;

const memory = new Map<string, { at: number; data: any }>();

export const cacheManager = {
  delete(key: string) {
    memory.delete(key);
    try {
      if (typeof window !== "undefined") {
        window.localStorage.removeItem("__crc_cache__:" + key);
      }
    } catch {}
  },
};

export async function fetchWithCache<T>(key: string, fetcher: Fetcher<T>, ttlMs: number = 60000): Promise<T> {
  const now = Date.now();

  const mem = memory.get(key);
  if (mem && now - mem.at < ttlMs) return mem.data as T;

  try {
    if (typeof window !== "undefined") {
      const raw = window.localStorage.getItem("__crc_cache__:" + key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (now - parsed.at < ttlMs) {
          memory.set(key, { at: parsed.at, data: parsed.data });
          return parsed.data as T;
        }
      }
    }
  } catch {}

  const data = await fetcher();
  memory.set(key, { at: now, data });
  try {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("__crc_cache__:" + key, JSON.stringify({ at: now, data }));
    }
  } catch {}
  return data;
}