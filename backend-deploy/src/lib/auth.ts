import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { getConfig } from './config';
import { logger } from './logger';
import { redisRevokeToken, redisIsTokenRevoked } from './redis';

const { jwtSecret: JWT_SECRET, encryptionSecret } = getConfig();

// Access token: 15 minutes
const ACCESS_TOKEN_EXPIRES_IN = '15m';
// Refresh token: 7 days
const REFRESH_TOKEN_EXPIRES_IN = '7d';
// Refresh token secret derived from main secret
const REFRESH_TOKEN_SECRET = crypto.createHash('sha256').update(JWT_SECRET + encryptionSecret).digest('hex');

export interface JWTPayload {
    userId: string;
    email: string;
    role: 'user' | 'officer';
    walletAddress: string;
}

export interface AccessTokenPayload extends JWTPayload {
    type: 'access';
}

export interface RefreshTokenPayload extends Pick<JWTPayload, 'userId'> {
    type: 'refresh';
    jti: string; // Unique token ID for revocation
}

export interface TokenPair {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
}


/**
 * Generate access token
 */
function generateAccessToken(payload: JWTPayload): string {
    const tokenPayload: AccessTokenPayload = {
        ...payload,
        type: 'access',
    };
    return jwt.sign(tokenPayload, JWT_SECRET, {
        expiresIn: ACCESS_TOKEN_EXPIRES_IN,
    });
}

/**
 * Generate refresh token
 */
function generateRefreshToken(userId: string): { token: string; jti: string } {
    const jti = crypto.randomBytes(16).toString('hex');
    const tokenPayload: RefreshTokenPayload = {
        userId,
        type: 'refresh',
        jti,
    };
    const token = jwt.sign(tokenPayload, REFRESH_TOKEN_SECRET, {
        expiresIn: REFRESH_TOKEN_EXPIRES_IN,
    });
    return { token, jti };
}

/**
 * Generate token pair (access + refresh)
 */
export function generateTokenPair(payload: JWTPayload): TokenPair {
    const accessToken = generateAccessToken(payload);
    const { token: refreshToken, jti } = generateRefreshToken(payload.userId);

    // Calculate expiration time
    const decoded = jwt.decode(accessToken) as { exp?: number };
    const expiresIn = decoded.exp ? (decoded.exp - Math.floor(Date.now() / 1000)) * 1000 : 900000;

    return {
        accessToken,
        refreshToken,
        expiresIn,
    };
}

/**
 * Verify access token
 */
export function verifyAccessToken(token: string): JWTPayload | null {
    try {
        const decoded = jwt.verify(token, JWT_SECRET) as AccessTokenPayload;

        if (decoded.type !== 'access') {
            logger.warn('Token type mismatch: expected access token');
            return null;
        }

        return decoded;
    } catch (error) {
        logger.warn('Access token verification failed:', error instanceof Error ? error.message : error);
        return null;
    }
}

/**
 * Verify refresh token
 */
export async function verifyRefreshToken(token: string): Promise<RefreshTokenPayload | null> {
    try {
        const decoded = jwt.verify(token, REFRESH_TOKEN_SECRET) as RefreshTokenPayload;

        if (decoded.type !== 'refresh') {
            logger.warn('Token type mismatch: expected refresh token');
            return null;
        }

        // Check if token is revoked (via Redis)
        const isRevoked = await redisIsTokenRevoked(decoded.jti);
        if (isRevoked) {
            logger.warn(`Revoked token used: ${decoded.jti}`);
            return null;
        }

        return decoded;
    } catch (error) {
        logger.warn('Refresh token verification failed:', error instanceof Error ? error.message : error);
        return null;
    }
}

/**
 * Revoke refresh token JTI (stores in Redis with TTL)
 */
export async function revokeToken(jti: string): Promise<void> {
    await redisRevokeToken(jti);
}

/**
 * Refresh access token using refresh token
 */
export async function refreshAccessToken(
    refreshToken: string,
    userPayload: JWTPayload
): Promise<TokenPair | null> {
    const decoded = await verifyRefreshToken(refreshToken);

    if (!decoded || decoded.userId !== userPayload.userId) {
        return null;
    }

    // Revoke old refresh token and generate new pair
    await revokeToken(decoded.jti);
    return generateTokenPair({
        userId: userPayload.userId,
        email: userPayload.email,
        role: userPayload.role,
        walletAddress: userPayload.walletAddress,
    });
}

/**
 * Hash password using bcrypt with stronger salt
 */
export async function hashPassword(password: string): Promise<string> {
    const salt = await bcrypt.genSalt(12); // Increased from 10 to 12
    return bcrypt.hash(password, salt);
}

/**
 * Compare password with hash
 */
export async function comparePassword(
    password: string,
    hash: string
): Promise<boolean> {
    return bcrypt.compare(password, hash);
}

/**
 * Extract token from Authorization header
 */
export function extractTokenFromHeader(authHeader: string | null): string | null {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return null;
    }
    return authHeader.substring(7);
}

/**
 * Validate password strength
 */
export function validatePasswordStrength(password: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (password.length < 6) {
        errors.push('Password must be at least 6 characters long');
    }

    return {
        valid: errors.length === 0,
        errors,
    };
}
