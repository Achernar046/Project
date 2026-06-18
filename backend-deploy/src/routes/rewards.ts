import { Router, Response } from 'express';
import { getDatabase } from '../lib/mongodb';
import { authMiddleware, officerMiddleware, AuthenticatedRequest } from '../lib/auth-middleware';
import { Reward, RedemptionHistory, Transaction, Notification } from '../models/types';
import { ObjectId } from 'mongodb';
import { ensureWalletHasGas, getOfficerWallet, transferCoins } from '../lib/blockchain';
import { getUserWalletSigner } from '../lib/wallet';
import { isValidObjectId, parseNonNegativeInteger, parsePositiveNumber, sanitizeString, isSafeUrl, paginationQuery } from '../lib/validation';
import { successResponse, errorResponse, paginatedResponse, notFoundResponse } from '../lib/response';
import { asyncHandler, ApiError } from '../lib/error-handler';
import { logger } from '../lib/logger';

const router = Router();

// GET /api/rewards/list
router.get('/list', authMiddleware, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;
    const category = req.query.category as string | undefined;

    const db = await getDatabase();
    const query = category
        ? { stock: { $gt: 0 }, category }
        : { stock: { $gt: 0 } };

    const [rewards, total] = await Promise.all([
        db.collection<Reward>('rewards')
            .find(query)
            .sort({ created_at: -1 })
            .skip(skip)
            .limit(limit)
            .toArray(),
        db.collection<Reward>('rewards')
            .countDocuments(query),
    ]);

    paginatedResponse(
        res,
        rewards.map(r => ({ id: r._id, ...r })),
        total,
        page,
        limit,
        'Rewards retrieved successfully'
    );
}));

// POST /api/rewards/redeem
router.post('/redeem', authMiddleware, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const rewardId = req.body.reward_id;

    if (!rewardId) {
        throw ApiError.badRequest('Reward ID is required');
    }

    if (!isValidObjectId(rewardId)) {
        throw ApiError.badRequest('Invalid reward ID');
    }

    const db = await getDatabase();
    const reward = await db.collection<Reward>('rewards').findOne({ _id: new ObjectId(rewardId) });

    if (!reward) {
        throw ApiError.notFound('Reward not found');
    }

    if (reward.stock <= 0) {
        throw ApiError.badRequest('Reward out of stock');
    }

    await ensureWalletHasGas(req.user!.userId, req.user!.walletAddress, 'reward_redeem');
    const userSigner = await getUserWalletSigner(req.user!.userId);
    const officerWallet = getOfficerWallet();

    const stockReservation = await db.collection<Reward>('rewards').updateOne(
        { _id: reward._id, stock: { $gt: 0 } },
        { $inc: { stock: -1 }, $set: { updated_at: new Date() } }
    );

    if (stockReservation.matchedCount === 0) {
        throw ApiError.badRequest('Reward out of stock');
    }

    let txHash: string;
    try {
        ({ txHash } = await transferCoins(userSigner, officerWallet.address, reward.coin_price));
    } catch (error) {
        // Rollback stock
        await db.collection<Reward>('rewards').updateOne(
            { _id: reward._id },
            { $inc: { stock: 1 }, $set: { updated_at: new Date() } }
        );
        logger.error('Transfer coins failed:', error);
        throw ApiError.internal('Failed to complete transaction');
    }

    const redemption: RedemptionHistory = {
        user_id: new ObjectId(req.user!.userId),
        reward_id: reward._id!,
        reward_name: reward.name,
        coin_price: reward.coin_price,
        status: 'pending',
        blockchain_tx_hash: txHash,
        created_at: new Date(),
        updated_at: new Date(),
    };

    await db.collection<RedemptionHistory>('redemption_history').insertOne(redemption);

    const transaction: Transaction = {
        user_id: new ObjectId(req.user!.userId),
        type: 'exchange',
        amount: reward.coin_price,
        to_address: officerWallet.address,
        blockchain_tx_hash: txHash,
        status: 'confirmed',
        created_at: new Date(),
    };

    await db.collection<Transaction>('transactions').insertOne(transaction);

    const notification: Notification = {
        user_id: new ObjectId(req.user!.userId),
        title: 'แลกรางวัลสำเร็จ!',
        message: `คุณได้แลก ${reward.name} เรียบร้อยแล้ว`,
        type: 'success',
        is_read: false,
        created_at: new Date(),
    };

    await db.collection<Notification>('notifications').insertOne(notification);

    logger.info(`Reward redeemed: ${reward.name}, user: ${req.user!.userId}, coins: ${reward.coin_price}`);

    successResponse(res, {
        reward_name: reward.name,
        txHash,
    }, 'Redemption successful');
}));

// GET /api/rewards/history
router.get('/history', authMiddleware, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    const db = await getDatabase();

    const [history, total] = await Promise.all([
        db.collection<RedemptionHistory>('redemption_history')
            .find({ user_id: new ObjectId(req.user!.userId) })
            .sort({ created_at: -1 })
            .skip(skip)
            .limit(limit)
            .toArray(),
        db.collection<RedemptionHistory>('redemption_history')
            .countDocuments({ user_id: new ObjectId(req.user!.userId) }),
    ]);

    paginatedResponse(
        res,
        history.map(h => ({ id: h._id, ...h })),
        total,
        page,
        limit,
        'Redemption history retrieved successfully'
    );
}));

// POST /api/rewards/add
router.post('/add', officerMiddleware, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const name = sanitizeString(req.body.name, 120);
    const description = sanitizeString(req.body.description, 1000) ?? '';
    const imageUrl = sanitizeString(req.body.image_url, 2048);
    const category = sanitizeString(req.body.category, 80);
    const parsedCoinPrice = parsePositiveNumber(req.body.coin_price);
    const parsedStock = parseNonNegativeInteger(req.body.stock);

    if (!name || !parsedCoinPrice || !parsedStock) {
        throw ApiError.badRequest('Name, coin price, and stock are required');
    }

    // Validate image URL if provided
    if (imageUrl && !isSafeUrl(imageUrl)) {
        throw ApiError.badRequest('Invalid or unsafe image URL');
    }

    const db = await getDatabase();
    const newReward: Reward = {
        name,
        description: description || '',
        image_url: imageUrl || '',
        coin_price: parsedCoinPrice,
        stock: parsedStock,
        category: category || '',
        created_at: new Date(),
        updated_at: new Date(),
    };

    const result = await db.collection<Reward>('rewards').insertOne(newReward);

    logger.info(`Reward added: ${name} by officer ${req.user!.userId}`);

    successResponse(res, {
        id: result.insertedId,
        ...newReward,
    }, 'Reward added successfully', 201);
}));

// PUT /api/rewards/update/:id
router.put('/update/:id', officerMiddleware, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const updates = req.body as Record<string, unknown>;

    if (!isValidObjectId(id)) {
        throw ApiError.badRequest('Invalid reward ID');
    }

    const updateData: Record<string, unknown> = {
        updated_at: new Date(),
    };

    if (updates.name !== undefined) {
        const name = sanitizeString(updates.name, 120);
        if (!name) {
            throw ApiError.badRequest('Name must not be empty');
        }
        updateData.name = name;
    }

    if (updates.description !== undefined) {
        updateData.description = sanitizeString(updates.description, 1000) ?? '';
    }

    if (updates.image_url !== undefined) {
        const imageUrl = sanitizeString(updates.image_url, 2048);
        if (imageUrl && !isSafeUrl(imageUrl)) {
            throw ApiError.badRequest('Invalid or unsafe image URL');
        }
        updateData.image_url = imageUrl ?? '';
    }

    if (updates.category !== undefined) {
        updateData.category = sanitizeString(updates.category, 80);
    }

    if (updates.coin_price !== undefined) {
        const parsedCoinPrice = parsePositiveNumber(updates.coin_price);
        if (!parsedCoinPrice) {
            throw ApiError.badRequest('Coin price must be greater than 0');
        }
        updateData.coin_price = parsedCoinPrice;
    }

    if (updates.stock !== undefined) {
        const parsedStock = parseNonNegativeInteger(updates.stock);
        if (parsedStock === null) {
            throw ApiError.badRequest('Stock must be a non-negative integer');
        }
        updateData.stock = parsedStock;
    }

    const db = await getDatabase();
    const result = await db.collection<Reward>('rewards').updateOne(
        { _id: new ObjectId(id) },
        { $set: updateData }
    );

    if (result.matchedCount === 0) {
        throw ApiError.notFound('Reward not found');
    }

    logger.info(`Reward updated: ${id} by officer ${req.user!.userId}`);

    successResponse(res, null, 'Reward updated successfully');
}));

// DELETE /api/rewards/delete/:id
router.delete('/delete/:id', officerMiddleware, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
        throw ApiError.badRequest('Invalid reward ID');
    }

    const db = await getDatabase();
    const result = await db.collection<Reward>('rewards').deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 0) {
        throw ApiError.notFound('Reward not found');
    }

    logger.info(`Reward deleted: ${id} by officer ${req.user!.userId}`);

    successResponse(res, null, 'Reward deleted successfully');
}));

export default router;
