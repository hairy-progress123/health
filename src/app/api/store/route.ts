import { NextRequest, NextResponse } from 'next/server';
import { getRedis } from '@/lib/redis';

// In-memory fallback cache when Redis is not available or offline
const memoryStore = new Map<string, unknown>();

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const key = searchParams.get('key');
        if (!key) return NextResponse.json({ error: 'Missing key' }, { status: 400 });

        const redis = getRedis();
        if (redis) {
            try {
                const data = await redis.get(key);
                return NextResponse.json({ data: data ?? null });
            } catch (err) {
                console.warn('Redis unreachable, using memory fallback:', err);
            }
        }
        
        const fallbackData = memoryStore.get(key) ?? null;
        return NextResponse.json({ data: fallbackData });
    } catch (error) {
        console.error('Store GET error:', error);
        return NextResponse.json({ error: 'Failed to read data' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const { key, value } = await request.json();
        if (!key) return NextResponse.json({ error: 'Missing key' }, { status: 400 });

        const redis = getRedis();
        if (redis) {
            try {
                await redis.set(key, value);
            } catch (err) {
                console.warn('Redis unreachable, writing to memory fallback:', err);
            }
        }
        memoryStore.set(key, value);

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Store POST error:', error);
        return NextResponse.json({ error: 'Failed to write data' }, { status: 500 });
    }
}

export async function PATCH(request: NextRequest) {
    try {
        const { key, action, item, matchField, matchValue, updates } = await request.json();
        if (!key) return NextResponse.json({ error: 'Missing key' }, { status: 400 });

        const redis = getRedis();
        let raw: unknown = null;
        if (redis) {
            try {
                raw = await redis.get(key);
            } catch (err) {
                console.warn('Redis unreachable, reading from memory fallback:', err);
            }
        }
        if (!raw) {
            raw = memoryStore.get(key) ?? null;
        }

        let arr: unknown[] = [];
        if (Array.isArray(raw)) {
            arr = raw;
        } else if (typeof raw === 'string') {
            try { arr = JSON.parse(raw); } catch { arr = []; }
        }

        if (action === 'push') {
            arr.push(item);
        } else if (action === 'update') {
            arr = arr.map((entry: unknown) => {
                const obj = entry as Record<string, unknown>;
                if (obj[matchField] === matchValue) {
                    return { ...obj, ...updates };
                }
                return obj;
            });
        } else if (action === 'remove') {
            arr = arr.filter((entry: unknown) => {
                const obj = entry as Record<string, unknown>;
                return obj[matchField] !== matchValue;
            });
        }

        if (redis) {
            try {
                await redis.set(key, arr);
            } catch (err) {
                console.warn('Redis unreachable, saving to memory fallback:', err);
            }
        }
        memoryStore.set(key, arr);

        return NextResponse.json({ success: true, data: arr });
    } catch (error) {
        console.error('Store PATCH error:', error);
        return NextResponse.json({ error: 'Failed to update data' }, { status: 500 });
    }
}

