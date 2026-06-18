import { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import { logger } from './logger';

/**
 * Security headers middleware using helmet
 */
export function securityHeadersMiddleware() {
    return helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'"],
                styleSrc: ["'self'", "'unsafe-inline'"],
                imgSrc: ["'self'", 'data:', 'https:'],
                connectSrc: ["'self'"],
                fontSrc: ["'self'"],
                objectSrc: ["'none'"],
                mediaSrc: ["'self'"],
                frameSrc: ["'none'"],
            },
        },
        crossOriginEmbedderPolicy: true,
        crossOriginOpenerPolicy: true,
        crossOriginResourcePolicy: { policy: 'same-site' },
        dnsPrefetchControl: { allow: false },
        frameguard: { action: 'deny' },
        hidePoweredBy: true,
        hsts: {
            maxAge: 31536000,
            includeSubDomains: true,
            preload: true,
        },
        ieNoOpen: true,
        noSniff: true,
        originAgentCluster: true,
        permittedCrossDomainPolicies: { permittedPolicies: 'none' },
        referrerPolicy: { policy: 'no-referrer' },
        xssFilter: true,
    });
}

/**
 * Rate limit headers middleware
 */
export function rateLimitHeadersMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    next();
}

/**
 * Request sanitization middleware
 */
export function sanitizeRequestMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
) {
    // Sanitize query parameters
    if (req.query) {
        Object.keys(req.query).forEach((key) => {
            const value = req.query[key];
            if (typeof value === 'string') {
                // Remove potential XSS patterns
                req.query[key] = value
                    .replace(/<script\b/gi, '')
                    .replace(/<\/script>/gi, '')
                    .replace(/javascript:/gi, '')
                    .replace(/on\w+=/gi, '')
                    .trim();
            }
        });
    }

    // Sanitize body
    if (req.body && typeof req.body === 'object') {
        sanitizeObject(req.body);
    }

    next();
}

/**
 * Recursively sanitize object properties
 */
function sanitizeObject(obj: Record<string, unknown>): void {
    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            const value = obj[key];
            if (typeof value === 'string') {
                obj[key] = value
                    .replace(/<script\b/gi, '')
                    .replace(/<\/script>/gi, '')
                    .replace(/javascript:/gi, '')
                    .replace(/on\w+=/gi, '')
                    .trim();
            } else if (typeof value === 'object' && value !== null) {
                sanitizeObject(value as Record<string, unknown>);
            }
        }
    }
}

/**
 * IP blocking middleware
 */
const blockedIPs = new Set<string>();

export function blockIP(ip: string): void {
    blockedIPs.add(ip);
    logger.warn(`IP blocked: ${ip}`);
}

export function unblockIP(ip: string): void {
    blockedIPs.delete(ip);
    logger.info(`IP unblocked: ${ip}`);
}

export function ipBlockMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
) {
    const ip = req.ip || req.socket.remoteAddress;

    if (ip && blockedIPs.has(ip)) {
        logger.warn(`Blocked IP attempt: ${ip}`);
        return res.status(403).json({
            success: false,
            message: 'Access denied',
            error: {
                code: 'IP_BLOCKED',
                message: 'Your IP has been blocked',
            },
        });
    }

    next();
}

/**
 * Request logging middleware
 */
export function requestLoggingMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
) {
    const start = Date.now();

    res.on('finish', () => {
        const duration = Date.now() - start;
        logger.info('Request completed', {
            method: req.method,
            path: req.path,
            status: res.statusCode,
            duration: `${duration}ms`,
            ip: req.ip,
        });
    });

    next();
}

/**
 * Validate content type for POST/PUT/PATCH requests
 */
export function contentTypeValidationMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
) {
    // Skip for routes that don't need body
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        return next();
    }

    // Skip for multipart/form-data (file uploads)
    if (req.is('multipart/form-data')) {
        return next();
    }

    // Require application/json for other body requests
    if (!req.is('application/json')) {
        return res.status(415).json({
            success: false,
            message: 'Unsupported Media Type. Content-Type must be application/json',
            error: {
                code: 'UNSUPPORTED_MEDIA_TYPE',
                message: 'Content-Type must be application/json',
            },
        });
    }

    next();
}

/**
 * Combined security middleware stack
 */
export function createSecurityMiddleware() {
    return [
        securityHeadersMiddleware(),
        rateLimitHeadersMiddleware,
        sanitizeRequestMiddleware,
        ipBlockMiddleware,
        requestLoggingMiddleware,
        contentTypeValidationMiddleware,
    ];
}
