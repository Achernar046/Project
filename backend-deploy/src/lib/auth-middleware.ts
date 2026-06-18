import { Request, Response, NextFunction } from 'express';
import { ObjectId } from 'mongodb';
import { verifyAccessToken, JWTPayload } from './auth';
import { getDatabase } from './mongodb';
import { User } from '../models/types';

export interface AuthenticatedRequest extends Request {
    user?: JWTPayload;
}

export async function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized: No token provided' });
    }

    const token = authHeader.substring(7);
    const decoded = verifyAccessToken(token);

    if (!decoded) {
        return res.status(401).json({ error: 'Unauthorized: Invalid token' });
    }

    if (!ObjectId.isValid(decoded.userId)) {
        return res.status(401).json({ error: 'Unauthorized: Invalid token payload' });
    }

    try {
        const db = await getDatabase();
        const user = await db.collection<User>('users').findOne({
            _id: new ObjectId(decoded.userId),
        });

        if (!user) {
            return res.status(401).json({ error: 'Unauthorized: User not found' });
        }

        req.user = {
            userId: user._id!.toString(),
            email: user.email,
            role: user.role,
            walletAddress: user.wallet_address,
        };

        next();
    } catch (error) {
        console.error('Auth middleware error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}

export async function officerMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    await authMiddleware(req, res, () => {
        if (req.user?.role !== 'officer') {
            return res.status(403).json({ error: 'Forbidden: Officer access only' });
        }
        next();
    });
}
