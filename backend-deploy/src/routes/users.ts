import { Router, Response } from 'express';
import { getDatabase } from '../lib/mongodb';
import { officerMiddleware, authMiddleware, AuthenticatedRequest } from '../lib/auth-middleware';
import { ObjectId } from 'mongodb';
import { User, WasteSubmission } from '../models/types';
import { hashPassword, comparePassword } from '../lib/auth';

const router = Router();

// GET /api/users/profile
router.get('/profile', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const db = await getDatabase();
        const userId = new ObjectId(req.user!.userId);

        const user = await db.collection<User>('users').findOne(
            { _id: userId },
            { 
                projection: { 
                    password_hash: 0,
                } 
            }
        );

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Get stats for user dashboard/profile
        const submissionCount = await db.collection<WasteSubmission>('waste_submissions')
            .countDocuments({ user_id: userId });

        const approvedCount = await db.collection<WasteSubmission>('waste_submissions')
            .countDocuments({ user_id: userId, status: 'approved' });

        // Calculate total coins earned from submissions
        const totalCoinsResult = await db.collection<WasteSubmission>('waste_submissions')
            .aggregate([
                { $match: { user_id: userId, status: 'approved' } },
                { $group: { _id: null, total: { $sum: '$coin_amount' } } }
            ]).toArray();

        const total_coins_earned = totalCoinsResult.length > 0 ? totalCoinsResult[0].total : 0;

        res.json({
            ...user,
            stats: {
                total_submissions: submissionCount,
                approved_submissions: approvedCount,
                total_coins_earned: total_coins_earned
            }
        });
    } catch (error) {
        console.error('Fetch profile error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// PUT /api/users/profile
router.put('/profile', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { name, profile_image, phone_number } = req.body;
        const db = await getDatabase();

        const updateData: Record<string, unknown> = {
            updated_at: new Date()
        };

        if (name) updateData.name = name;
        if (profile_image) updateData.profile_image = profile_image;
        if (phone_number) updateData.phone_number = phone_number;

        const result = await db.collection<User>('users').updateOne(
            { _id: new ObjectId(req.user!.userId) },
            { $set: updateData }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({ message: 'Profile updated successfully' });
    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /api/users/change-password
router.post('/change-password', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ error: 'Current and new password are required' });
        }

        // BUG-005 fix: Use same policy as register (min 8 chars, was 6)
        if (newPassword.length < 8) {
            return res.status(400).json({ error: 'New password must be at least 8 characters' });
        }

        const db = await getDatabase();
        const user = await db.collection<User>('users').findOne({ _id: new ObjectId(req.user!.userId) });

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const isPasswordValid = await comparePassword(currentPassword, user.password_hash);
        if (!isPasswordValid) {
            return res.status(401).json({ error: 'Invalid current password' });
        }

        const newPasswordHash = await hashPassword(newPassword);
        await db.collection<User>('users').updateOne(
            { _id: user._id },
            { 
                $set: { 
                    password_hash: newPasswordHash,
                    updated_at: new Date()
                } 
            }
        );

        res.json({ message: 'Password changed successfully' });
    } catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/users/list
router.get('/list', officerMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const db = await getDatabase();
        const users = await db.collection('users')
            .find(
                { role: 'user' },
                { 
                    projection: { 
                        password_hash: 0,
                    } 
                }
            )
            .sort({ created_at: -1 })
            .toArray();

        res.json(users);
    } catch (error) {
        console.error('Fetch users error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

export default router;
