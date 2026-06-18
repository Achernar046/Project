import { Router, Response } from 'express';
import { getDatabase } from '../lib/mongodb';
import { authMiddleware, AuthenticatedRequest } from '../lib/auth-middleware';
import { Notification } from '../models/types';
import { ObjectId } from 'mongodb';
import { isValidObjectId } from '../lib/validation';

const router = Router();

// GET /api/notifications
router.get('/', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const db = await getDatabase();
        const notifications = await db.collection<Notification>('notifications')
            .find({ user_id: new ObjectId(req.user!.userId) })
            .sort({ created_at: -1 })
            .toArray();

        res.json(notifications);
    } catch (error) {
        console.error('Fetch notifications error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// PUT /api/notifications/read-all
router.put('/read-all', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const db = await getDatabase();
        await db.collection<Notification>('notifications').updateMany(
            { user_id: new ObjectId(req.user!.userId), is_read: false },
            { $set: { is_read: true } }
        );

        res.json({ message: 'All notifications marked as read' });
    } catch (error) {
        console.error('Mark all read error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// PUT /api/notifications/:id/read
router.put('/:id/read', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { id } = req.params;

        if (!isValidObjectId(id)) {
            return res.status(400).json({ error: 'Invalid notification ID' });
        }

        const db = await getDatabase();
        
        const result = await db.collection<Notification>('notifications').updateOne(
            { _id: new ObjectId(id), user_id: new ObjectId(req.user!.userId) },
            { $set: { is_read: true } }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({ error: 'Notification not found' });
        }

        res.json({ message: 'Notification marked as read' });
    } catch (error) {
        console.error('Mark read error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

export default router;
