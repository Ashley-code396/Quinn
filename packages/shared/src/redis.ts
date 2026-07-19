import { Redis } from "ioredis";

let client: Redis | null = null;

function getRedisUrl(): string {
  return process.env.REDIS_URL ?? "redis://localhost:6379";
}

export function getRedis(): Redis {
  if (!client) {
    client = new Redis(getRedisUrl(), {
      maxRetriesPerRequest: null,
      connectTimeout: 10_000,
      retryStrategy(times) {
        if (times > 3) return null;
        return Math.min(times * 500, 3_000);
      },
      lazyConnect: true,
      enableOfflineQueue: false,
      keepAlive: 10_000,
    });
    client.on("error", (err) => {
      if (err.message !== "Stream is closed" && !err.message?.includes("ECONNRESET")) {
        console.error("⚠️ Redis error:", err.message);
      }
    });
  }
  return client;
}

export function getRedisClient(): Redis | null {
  return client;
}

export async function closeRedis(): Promise<void> {
  if (client) {
    await client.quit();
    client = null;
  }
}

export async function withRedis<T>(fn: (redis: Redis) => Promise<T>): Promise<T | null> {
  try {
    const r = getRedis();
    return await fn(r);
  } catch {
    return null;
  }
}
