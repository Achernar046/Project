import { Router, Request, Response } from 'express';
import { ObjectId } from 'mongodb';
import { validationResult } from 'express-validator';
import { getDatabase } from '../lib/mongodb';
import { hashPassword, comparePassword, generateTokenPair, validatePasswordStrength, verifyRefreshToken, refreshAccessToken, revokeToken } from '../lib/auth';
import { generateWallet, encryptPrivateKey } from '../lib/wallet';
import { User, Wallet } from '../models/types';
import { normalizeEmail, sanitizeString, emailValidation, passwordValidation } from '../lib/validation';
import { successResponse, errorResponse, conflictResponse, validationErrorResponse } from '../lib/response';
import { asyncHandler, ApiError } from '../lib/error-handler';
import { logger } from '../lib/logger';
import { ensureWalletHasGas } from '../lib/blockchain';

const router = Router();

// POST /api/auth/register
router.post('/register', asyncHandler(async (req: Request, res: Response) => {
    const userId = sanitizeString(req.body.user_id, 64);
    const name = sanitizeString(req.body.name, 120);
    const email = normalizeEmail(req.body.email);
    const password = typeof req.body.password === 'string' ? req.body.password : '';

    // Validation
    if (!userId || !name || !email || !password) {
        throw ApiError.badRequest('User ID, Name, Email and Password are required');
    }

    // Password strength validation
    const passwordStrength = validatePasswordStrength(password);
    if (!passwordStrength.valid) {
        throw ApiError.badRequest('Weak password', 'WEAK_PASSWORD', passwordStrength.errors);
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        throw ApiError.badRequest('Invalid email format');
    }

    const db = await getDatabase();

    // Check for existing user ID
    const existingUserId = await db.collection<User>('users').findOne({ user_id: userId });
    if (existingUserId) {
        throw ApiError.conflict('User ID already exists', 'USER_ID_EXISTS');
    }

    // Check for existing email
    const existingUser = await db.collection<User>('users').findOne({ email });
    if (existingUser) {
        throw ApiError.conflict('Email already exists', 'EMAIL_EXISTS');
    }

    // Create user
    const password_hash = await hashPassword(password);
    const wallet = generateWallet();
    const { encryptedKey, iv } = encryptPrivateKey(wallet.privateKey);

    const user: User = {
        user_id: userId,
        name,
        email,
        password_hash,
        role: 'user', // Security: role is always 'user' on registration, never trust client-supplied role
        wallet_address: wallet.address,
        created_at: new Date(),
        updated_at: new Date(),
    };

    const userResult = await db.collection<User>('users').insertOne(user);

    const walletDoc: Wallet = {
        user_id: userResult.insertedId,
        address: wallet.address,
        encrypted_private_key: encryptedKey,
        encryption_iv: iv,
        created_at: new Date(),
    };

    await db.collection<Wallet>('wallets').insertOne(walletDoc);

    // Ensure wallet has gas (non-blocking)
    ensureWalletHasGas(userResult.insertedId.toString(), wallet.address, 'register').catch((err) => {
        logger.warn('Failed to ensure wallet has gas:', err);
    });

    // Generate token pair
    const tokens = generateTokenPair({
        userId: userResult.insertedId.toString(),
        email: user.email,
        role: user.role,
        walletAddress: user.wallet_address,
    });

    successResponse(res, {
        user: {
            id: userResult.insertedId,
            userId: user.user_id,
            name: user.name,
            email: user.email,
            role: user.role,
            walletAddress: user.wallet_address,
        },
        tokens,
    }, 'User registered successfully', 201);
}));

// POST /api/auth/login
router.post('/login', asyncHandler(async (req: Request, res: Response) => {
    const email = normalizeEmail(req.body.email);
    const password = typeof req.body.password === 'string' ? req.body.password : '';

    if (!email || !password) {
        throw ApiError.badRequest('Email and password are required');
    }

    const db = await getDatabase();
    const user = await db.collection<User>('users').findOne({ email });

    if (!user) {
        logger.warn(`Failed login attempt for email: ${email}`);
        throw ApiError.unauthorized('Invalid email or password');
    }

    const isPasswordValid = await comparePassword(password, user.password_hash);

    if (!isPasswordValid) {
        logger.warn(`Failed login attempt for email: ${email}`);
        throw ApiError.unauthorized('Invalid email or password');
    }

    // Generate token pair
    const tokens = generateTokenPair({
        userId: user._id!.toString(),
        email: user.email,
        role: user.role,
        walletAddress: user.wallet_address,
    });

    successResponse(res, {
        user: {
            id: user._id,
            email: user.email,
            role: user.role,
            walletAddress: user.wallet_address,
        },
        tokens,
    }, 'Login successful');
}));

// POST /api/auth/refresh
router.post('/refresh', asyncHandler(async (req: Request, res: Response) => {
    const { refreshToken } = req.body;

    if (!refreshToken) {
        throw ApiError.badRequest('Refresh token is required');
    }

    const db = await getDatabase();

    const decoded = await verifyRefreshToken(refreshToken);
    if (!decoded) {
        throw ApiError.unauthorized('Invalid or expired refresh token');
    }

    // Verify user still exists
    const user = await db.collection<User>('users').findOne({
        _id: new ObjectId(decoded.userId),
    });

    if (!user) {
        throw ApiError.unauthorized('User not found');
    }

    // Generate new token pair (revokes old token in Redis internally)
    const tokens = await refreshAccessToken(refreshToken, {
        userId: user._id.toString(),
        email: user.email,
        role: user.role,
        walletAddress: user.wallet_address,
    });

    if (!tokens) {
        throw ApiError.unauthorized('Failed to refresh token');
    }

    successResponse(res, { tokens }, 'Token refreshed successfully');
}));

// POST /api/auth/logout
router.post('/logout', asyncHandler(async (req: Request, res: Response) => {
    const { refreshToken } = req.body;

    if (refreshToken) {
        const decoded = await verifyRefreshToken(refreshToken);
        if (decoded) {
            await revokeToken(decoded.jti);
        }
    }

    successResponse(res, null, 'Logged out successfully');
}));

export default router;
