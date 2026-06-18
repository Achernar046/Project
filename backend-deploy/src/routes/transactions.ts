import { Router, Response } from 'express';
import { getDatabase } from '../lib/mongodb';
import { authMiddleware, AuthenticatedRequest } from '../lib/auth-middleware';
import { Transaction } from '../models/types';
import { ObjectId } from 'mongodb';

const router = Router();

// GET /api/transactions/history
router.get('/history', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const db = await getDatabase();
        const transactions = await db.collection<Transaction>('transactions')
            .find({ user_id: new ObjectId(req.user!.userId) })
            .sort({ created_at: -1 })
            .limit(20)
            .toArray();

        res.json(transactions);
    } catch (error) {
        console.error('Fetch transaction history error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

export default router;
