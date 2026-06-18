import Redis from 'ioredis';
import { getConfig } from './config';
import { logger } from './logger';

let redisClient: Redis | null = null;

/**
 * Initialize Redis connection
 */
export async function initRedis(): Promise<void> {
    const { redisUrl } = getConfig();

    redisClient = new Redis(redisUrl, {
        lazyConnect: true,
        enableReadyCheck: true,
        maxRetriesPerRequest: 3,
        retryStrategy(times) {
            if (times > 5) {
                logger.error('Redis: max retries reached, giving up');
                return null;
            }
            const delay = Math.min(times * 200, 2000);
            logger.warn(`Redis: reconnecting in ${delay}ms (attempt ${times})`);
            return delay;
        },
    });

    redisClient.on('connect', () => logger.info('Redis: connected'));
    redisClient.on('ready', () => logger.info('Redis: ready'));
    redisClient.on('error', (err) => logger.error('Redis error:', err.message));
    redisClient.on('close', () => logger.warn('Redis: connection closed'));

    await redisClient.connect();
}

/**
 * Close Redis connection (graceful shutdown)
 */
export async function closeRedis(): Promise<void> {
    if (redisClient) {
        await redisClient.quit();
        redisClient = null;
        logger.info('Redis: connection closed');
    }
}

/**
 * Get Redis client — throws if not initialized
 */
export function getRedis(): Redis {
    if (!redisClient) {
        throw new Error('Redis client not initialized. Call initRedis() first.');
    }
    return redisClient;
}

/**
 * Revoke a refresh token JTI in Redis
 * TTL = 7 days (same as refresh token lifetime)
 */
export async function redisRevokeToken(jti: string): Promise<void> {
    const client = getRedis();
    const TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days
    await client.set(`revoked:${jti}`, '1', 'EX', TTL_SECONDS);
    logger.info(`Redis: token revoked jti=${jti}`);
}

/**
 * Check if a refresh token JTI is revoked
 */
export async function redisIsTokenRevoked(jti: string): Promise<boolean> {
    const client = getRedis();
    const result = await client.exists(`revoked:${jti}`);
    return result === 1;
}
