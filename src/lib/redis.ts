import { Redis } from '@upstash/redis';

// Create a lazy-initialized Redis client
let redis: Redis | null = null;
let isConfigured: boolean | null = null;

export function isRedisConfigured(): boolean {
    if (isConfigured === null) {
        const url = (process.env.UPSTASH_REDIS_REST_URL || '').trim();
        const token = (process.env.UPSTASH_REDIS_REST_TOKEN || '').trim();
        // If not set or pointing to unresolvable/default placeholder, mark unconfigured
        isConfigured = Boolean(url && token && !url.includes('willing-seasnail-16251.upstash.io'));
    }
    return isConfigured;
}

export function getRedis(): Redis | null {
    if (!isRedisConfigured()) {
        return null;
    }
    if (!redis) {
        redis = new Redis({
            url: (process.env.UPSTASH_REDIS_REST_URL || '').trim(),
            token: (process.env.UPSTASH_REDIS_REST_TOKEN || '').trim(),
        });
    }
    return redis;
}

