import { Router, Response } from 'express';
import { getDatabase } from '../lib/mongodb';
import { authMiddleware, officerMiddleware, AuthenticatedRequest } from '../lib/auth-middleware';
import { WasteSubmission, Transaction, User, Notification } from '../models/types';
import { ObjectId } from 'mongodb';
import { mintCoins } from '../lib/blockchain';
import { isValidObjectId, parsePositiveNumber, sanitizeString, isSafeUrl, paginationQuery } from '../lib/validation';
import { successResponse, errorResponse, paginatedResponse } from '../lib/response';
import { asyncHandler, ApiError } from '../lib/error-handler';
import { logger } from '../lib/logger';
import { createUploadMiddleware, saveUploadedFile } from '../lib/upload';

const router = Router();
const upload = createUploadMiddleware();

// POST /api/waste/submit — รับ multipart/form-data (image file) หรือ JSON (image_url)
router.post('/submit', authMiddleware, upload.single('image'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const wasteType = sanitizeString(req.body.waste_type, 80);
    const weightKg = parsePositiveNumber(req.body.weight_kg);
    const description = sanitizeString(req.body.description, 500);

    if (!wasteType || !weightKg) {
        throw ApiError.badRequest('Waste type and weight are required');
    }

    // Resolve image: uploaded file takes priority over image_url
    let imageUrl: string | undefined;
    if (req.file) {
        // Save uploaded image to disk
        imageUrl = await saveUploadedFile(req.file, 'waste');
    } else if (req.body.image_url) {
        const rawUrl = sanitizeString(req.body.image_url, 2048);
        if (rawUrl && !isSafeUrl(rawUrl)) {
            throw ApiError.badRequest('Invalid or unsafe image URL');
        }
        imageUrl = rawUrl || undefined;
    }

    const db = await getDatabase();

    const submission: WasteSubmission = {
        user_id: new ObjectId(req.user!.userId),
        waste_type: wasteType,
        weight_kg: weightKg,
        description: description || undefined,
        image_url: imageUrl,
        status: 'pending',
        created_at: new Date(),
        updated_at: new Date(),
    };

    const result = await db.collection<WasteSubmission>('waste_submissions').insertOne(submission);

    successResponse(res, {
        id: result.insertedId,
        ...submission,
    }, 'Waste submission created successfully', 201);
}));

// GET /api/waste/my-submissions
router.get('/my-submissions', authMiddleware, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    const db = await getDatabase();

    const [submissions, total] = await Promise.all([
        db.collection<WasteSubmission>('waste_submissions')
            .find({ user_id: new ObjectId(req.user!.userId) })
            .sort({ created_at: -1 })
            .skip(skip)
            .limit(limit)
            .toArray(),
        db.collection<WasteSubmission>('waste_submissions')
            .countDocuments({ user_id: new ObjectId(req.user!.userId) }),
    ]);

    paginatedResponse(
        res,
        submissions.map(s => ({ id: s._id, ...s })),
        total,
        page,
        limit,
        'Submissions retrieved successfully'
    );
}));

// GET /api/waste/pending
router.get('/pending', officerMiddleware, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    const db = await getDatabase();

    const [pendingSubmissions, total] = await Promise.all([
        db.collection('waste_submissions')
            .aggregate([
                { $match: { status: 'pending' } },
                {
                    $lookup: {
                        from: 'users',
                        localField: 'user_id',
                        foreignField: '_id',
                        as: 'user'
                    }
                },
                { $unwind: '$user' },
                { $sort: { created_at: -1 } },
                { $skip: skip },
                { $limit: limit },
                {
                    $project: {
                        _id: 1,
                        user_id: 1,
                        waste_type: 1,
                        weight_kg: 1,
                        description: 1,
                        image_url: 1,
                        status: 1,
                        coin_amount: 1,
                        reviewed_by: 1,
                        reviewed_at: 1,
                        blockchain_tx_hash: 1,
                        created_at: 1,
                        updated_at: 1,
                        'user._id': 1,
                        'user.user_id': 1,
                        'user.name': 1,
                        'user.email': 1,
                        'user.role': 1,
                        'user.wallet_address': 1,
                    }
                },
            ])
            .toArray(),
        db.collection('waste_submissions')
            .countDocuments({ status: 'pending' }),
    ]);

    paginatedResponse(
        res,
        pendingSubmissions,
        total,
        page,
        limit,
        'Pending submissions retrieved successfully'
    );
}));

// POST /api/waste/approve
router.post('/approve', officerMiddleware, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const submissionId = req.body.submission_id;
    const parsedCoinAmount = parsePositiveNumber(req.body.coin_amount);

    if (!submissionId || !parsedCoinAmount) {
        throw ApiError.badRequest('Submission ID and coin amount are required');
    }

    if (!isValidObjectId(submissionId)) {
        throw ApiError.badRequest('Invalid submission ID');
    }

    const db = await getDatabase();
    const submission = await db.collection<WasteSubmission>('waste_submissions')
        .findOne({ _id: new ObjectId(submissionId) });

    if (!submission) {
        throw ApiError.notFound('Submission not found');
    }

    if (submission.status !== 'pending') {
        throw ApiError.badRequest('Submission already processed');
    }

    const user = await db.collection<User>('users').findOne({ _id: submission.user_id });

    if (!user) {
        throw ApiError.notFound('User not found');
    }

    const { txHash } = await mintCoins(
        user.wallet_address,
        parsedCoinAmount,
        `Waste submission ${submissionId}`
    );

    await db.collection<WasteSubmission>('waste_submissions').updateOne(
        { _id: new ObjectId(submissionId) },
        {
            $set: {
                status: 'approved',
                coin_amount: parsedCoinAmount,
                reviewed_by: new ObjectId(req.user!.userId),
                reviewed_at: new Date(),
                blockchain_tx_hash: txHash,
                updated_at: new Date(),
            },
        }
    );

    const transaction: Transaction = {
        user_id: submission.user_id,
        type: 'mint',
        amount: parsedCoinAmount,
        to_address: user.wallet_address,
        blockchain_tx_hash: txHash,
        waste_submission_id: new ObjectId(submissionId),
        status: 'confirmed',
        created_at: new Date(),
    };

    await db.collection<Transaction>('transactions').insertOne(transaction);

    const notification: Notification = {
        user_id: submission.user_id,
        title: 'การส่งขยะถูกอนุมัติ!',
        message: `ขยะ ${submission.waste_type} ของคุณได้รับการตรวจสอบแล้ว และคุณได้รับ ${parsedCoinAmount} WST`,
        type: 'success',
        is_read: false,
        created_at: new Date(),
    };

    await db.collection<Notification>('notifications').insertOne(notification);

    logger.info(`Waste submission approved: ${submissionId}, user: ${user.user_id}, coins: ${parsedCoinAmount}`);

    successResponse(res, {
        txHash,
        coin_amount: parsedCoinAmount,
    }, 'Submission approved and coins minted');
}));

export default router;
