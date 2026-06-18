import { Request, Response, NextFunction } from 'express';

interface RateLimitEntry {
    count: number;
    resetAt: number;
}

const buckets = new Map<string, RateLimitEntry>();

function cleanupExpiredEntries(now: number) {
    for (const [key, entry] of buckets.entries()) {
        if (entry.resetAt <= now) {
            buckets.delete(key);
        }
    }
}

export function createRateLimiter(windowMs: number, maxRequests: number) {
    return (req: Request, res: Response, next: NextFunction) => {
        const now = Date.now();
        const identifier = req.ip || req.socket.remoteAddress || 'unknown';
        const key = `${req.method}:${req.path}:${identifier}`;
        const current = buckets.get(key);

        cleanupExpiredEntries(now);

        if (!current || current.resetAt <= now) {
            buckets.set(key, {
                count: 1,
                resetAt: now + windowMs,
            });
            return next();
        }

        if (current.count >= maxRequests) {
            const retryAfterSeconds = Math.ceil((current.resetAt - now) / 1000);
            res.setHeader('Retry-After', retryAfterSeconds.toString());
            return res.status(429).json({ error: 'Too many requests, please try again later' });
        }

        current.count += 1;
        buckets.set(key, current);
        return next();
    };
}
