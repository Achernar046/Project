import { Router, Response } from 'express';
import { getDatabase } from '../lib/mongodb';
import { authMiddleware, AuthenticatedRequest } from '../lib/auth-middleware';
import { comparePassword, hashPassword } from '../lib/auth';
import { User, Wallet, Transaction } from '../models/types';
import { ObjectId } from 'mongodb';

const router = Router();

// GET /api/app/dashboard
// Aggregates user profile, wallet details, and the 5 most recent transactions
router.get('/dashboard', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const db = await getDatabase();
        const userIdObj = new ObjectId(req.user!.userId);

        const user = await db.collection<User>('users').findOne({ _id: userIdObj });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const wallet = await db.collection<Wallet>('wallets').findOne({ user_id: userIdObj });

        // Get recent transactions, limit to latest 5
        const transactions = await db.collection<Transaction>('transactions')
            .find({ user_id: userIdObj })
            .sort({ created_at: -1 })
            .limit(5)
            .toArray();

        // Build the profile response without sensitive data
        res.json({
            profile: {
                userId: user.user_id,
                name: user.name,
                email: user.email,
                role: user.role,
                walletAddress: user.wallet_address,
            },
            wallet: wallet ? {
                address: wallet.address,
                createdAt: wallet.created_at
            } : null,
            recentTransactions: transactions
        });
    } catch (error) {
        console.error('App Dashboard error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /api/app/verify-identity
// Verifies if the provided password matches the authenticated user
router.post('/verify-identity', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { password } = req.body;

        if (!password) {
            return res.status(400).json({ error: 'Password is required' });
        }

        const db = await getDatabase();
        const user = await db.collection<User>('users').findOne({
            _id: new ObjectId(req.user!.userId),
        });

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const isPasswordValid = await comparePassword(password, user.password_hash);
        if (!isPasswordValid) {
            return res.status(401).json({ error: 'Invalid password' });
        }

        res.json({ message: 'Identity verified successfully', verified: true });
    } catch (error) {
        console.error('Verify identity error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /api/app/change-password
// Allows user to update their password by confirming the old one
router.post('/change-password', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { old_password, new_password } = req.body;

        if (!old_password || !new_password) {
            return res.status(400).json({ error: 'old_password and new_password are required' });
        }

        if (new_password.length < 6) {
            return res.status(400).json({ error: 'New password must be at least 6 characters' });
        }

        const db = await getDatabase();
        const userIdObj = new ObjectId(req.user!.userId);

        const user = await db.collection<User>('users').findOne({ _id: userIdObj });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const isPasswordValid = await comparePassword(old_password, user.password_hash);
        if (!isPasswordValid) {
            return res.status(401).json({ error: 'Invalid old password' });
        }

        const newPasswordHash = await hashPassword(new_password);

        await db.collection<User>('users').updateOne(
            { _id: userIdObj },
            { $set: { password_hash: newPasswordHash, updated_at: new Date() } }
        );

        res.json({ message: 'Password updated successfully' });
    } catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

export default router;
