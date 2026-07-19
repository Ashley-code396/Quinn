import { getRedis } from "./redis.js";

const KEY_PREFIX = "quinn:cache";
const CACHE_TIMEOUT = 1_500;

function key(...segments: string[]): string {
  return `${KEY_PREFIX}:${segments.join(":")}`;
}

export function cacheKey(...segments: string[]): string {
  return key(...segments);
}

async function cacheOp<T>(fn: () => Promise<T>): Promise<T | undefined> {
  try {
    const result = await Promise.race([
      fn(),
      new Promise<undefined>((_, reject) =>
        setTimeout(() => reject(new Error("cache timeout")), CACHE_TIMEOUT),
      ),
    ]);
    return result;
  } catch {
    return undefined;
  }
}

export async function cacheGet<T>(
  segments: string[],
  fetch: () => Promise<T>,
  ttlSeconds: number = 60,
): Promise<T> {
  const k = key(...segments);

  const cached = await cacheOp<string>(async () => {
    const redis = getRedis();
    return (await redis.get(k)) ?? "";
  });
  if (cached) {
    try {
      return JSON.parse(cached) as T;
    } catch {
      // corrupted cache — fall through
    }
  }

  const value = await fetch();

  await cacheOp(async () => {
    const redis = getRedis();
    await redis.setex(k, ttlSeconds, JSON.stringify(value));
  });

  return value;
}

export async function cacheSet(
  segments: string[],
  value: unknown,
  ttlSeconds: number = 60,
): Promise<void> {
  await cacheOp(async () => {
    const redis = getRedis();
    await redis.setex(key(...segments), ttlSeconds, JSON.stringify(value));
  });
}

export async function cacheDel(...segments: string[]): Promise<void> {
  await cacheOp(async () => {
    const redis = getRedis();
    await redis.del(key(...segments));
  });
}

export async function cacheInvalidate(pattern: string): Promise<void> {
  await cacheOp(async () => {
    const redis = getRedis();
    const patternKey = `${KEY_PREFIX}:${pattern}`;
    let cursor = "0";
    do {
      const [next, keys] = await redis.scan(cursor, "MATCH", patternKey, "COUNT", 100);
      if (keys.length > 0) {
        await redis.del(...keys);
      }
      cursor = next;
    } while (cursor !== "0");
  });
}
