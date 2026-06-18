import { Db } from 'mongodb';
import { logger } from './logger';

/**
 * Drop an index by name if it exists (ignores error if not found).
 */
async function dropIndexIfExists(db: Db, collection: string, indexName: string): Promise<void> {
    try {
        await db.collection(collection).dropIndex(indexName);
        logger.info(`MongoDB: dropped old index "${indexName}" from "${collection}"`);
    } catch {
        // Index didn't exist — that's fine
    }
}

/**
 * Ensure all required MongoDB indexes exist.
 * Safe to call multiple times — MongoDB createIndex is idempotent.
 */
export async function ensureIndexes(db: Db): Promise<void> {
    logger.info('MongoDB: ensuring indexes...');

    try {
        // ── users: clean up dirty data before creating unique index ────────
        const nullUserIdCount = await db.collection('users').countDocuments({ user_id: null });
        if (nullUserIdCount > 0) {
            logger.warn(`MongoDB: found ${nullUserIdCount} user(s) with null user_id — removing them`);
            await db.collection('users').deleteMany({ user_id: null });
            logger.info('MongoDB: removed users with null user_id ✓');
        }

        // Drop & recreate potentially conflicting unique indexes
        await dropIndexIfExists(db, 'users', 'idx_users_user_id_unique');
        await dropIndexIfExists(db, 'users', 'idx_users_email_unique');

        // ── users ──────────────────────────────────────────────────────────
        await db.collection('users').createIndex(
            { email: 1 },
            { unique: true, sparse: true, name: 'idx_users_email_unique' }
        );
        await db.collection('users').createIndex(
            { user_id: 1 },
            { unique: true, sparse: true, name: 'idx_users_user_id_unique' }
        );

        // ── wallets ────────────────────────────────────────────────────────
        await db.collection('wallets').createIndex(
            { user_id: 1 },
            { unique: true, name: 'idx_wallets_user_id_unique' }
        );
        await db.collection('wallets').createIndex(
            { address: 1 },
            { unique: true, name: 'idx_wallets_address_unique' }
        );

        // ── waste_submissions ──────────────────────────────────────────────
        await db.collection('waste_submissions').createIndex(
            { user_id: 1, created_at: -1 },
            { name: 'idx_waste_user_date' }
        );
        await db.collection('waste_submissions').createIndex(
            { status: 1, created_at: -1 },
            { name: 'idx_waste_status_date' }
        );

        // ── transactions ───────────────────────────────────────────────────
        await db.collection('transactions').createIndex(
            { user_id: 1, created_at: -1 },
            { name: 'idx_txn_user_date' }
        );
        await db.collection('transactions').createIndex(
            { blockchain_tx_hash: 1 },
            { sparse: true, name: 'idx_txn_tx_hash' }
        );

        // ── notifications ──────────────────────────────────────────────────
        await db.collection('notifications').createIndex(
            { user_id: 1, is_read: 1, created_at: -1 },
            { name: 'idx_notif_user_read_date' }
        );

        // ── redemption_history ─────────────────────────────────────────────
        await db.collection('redemption_history').createIndex(
            { user_id: 1, created_at: -1 },
            { name: 'idx_redeem_user_date' }
        );

        // ── gas_topups ─────────────────────────────────────────────────────
        await db.collection('gas_topups').createIndex(
            { user_id: 1, created_at: -1 },
            { name: 'idx_gas_user_date' }
        );

        logger.info('MongoDB: all indexes ensured ✓');
    } catch (error) {
        // Log but don't crash — indexes are performance optimization, not required to boot
        logger.error('MongoDB: failed to create indexes:', error);
    }
}
