import { Request, Response, NextFunction } from 'express';
import { StatusCodes } from 'http-status-codes';
import { logger } from './logger';
import { errorResponse } from './response';

/**
 * Custom error class for API errors
 */
export class ApiError extends Error {
    public readonly statusCode: number;
    public readonly code: string;
    public readonly details?: unknown;
    public readonly isOperational: boolean;

    constructor(
        message: string,
        statusCode: number,
        code: string,
        details?: unknown,
        isOperational = true
    ) {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
        this.details = details;
        this.isOperational = isOperational;

        Error.captureStackTrace(this, this.constructor);
    }

    /**
     * Create a bad request error
     */
    static badRequest(message = 'Bad request', code = 'BAD_REQUEST', details?: unknown): ApiError {
        return new ApiError(message, StatusCodes.BAD_REQUEST, code, details);
    }

    /**
     * Create an unauthorized error
     */
    static unauthorized(message = 'Unauthorized', code = 'UNAUTHORIZED'): ApiError {
        return new ApiError(message, StatusCodes.UNAUTHORIZED, code);
    }

    /**
     * Create a forbidden error
     */
    static forbidden(message = 'Forbidden', code = 'FORBIDDEN'): ApiError {
        return new ApiError(message, StatusCodes.FORBIDDEN, code);
    }

    /**
     * Create a not found error
     */
    static notFound(message = 'Resource not found', code = 'NOT_FOUND'): ApiError {
        return new ApiError(message, StatusCodes.NOT_FOUND, code);
    }

    /**
     * Create a conflict error
     */
    static conflict(message = 'Resource conflict', code = 'CONFLICT'): ApiError {
        return new ApiError(message, StatusCodes.CONFLICT, code);
    }

    /**
     * Create a too many requests error
     */
    static tooManyRequests(message = 'Too many requests', code = 'RATE_LIMIT_EXCEEDED'): ApiError {
        return new ApiError(message, StatusCodes.TOO_MANY_REQUESTS, code);
    }

    /**
     * Create an internal server error
     */
    static internal(message = 'Internal server error', code = 'INTERNAL_ERROR', details?: unknown): ApiError {
        return new ApiError(message, StatusCodes.INTERNAL_SERVER_ERROR, code, details, false);
    }

    /**
     * Create a service unavailable error
     */
    static serviceUnavailable(message = 'Service unavailable', code = 'SERVICE_UNAVAILABLE'): ApiError {
        return new ApiError(message, StatusCodes.SERVICE_UNAVAILABLE, code);
    }
}

/**
 * Global error handler middleware
 */
export function globalErrorHandler(
    error: Error | ApiError,
    req: Request,
    res: Response,
    _next: NextFunction
): void {
    // Log the error
    logger.error('Error occurred:', {
        message: error.message,
        stack: error.stack,
        path: req.path,
        method: req.method,
        ip: req.ip,
        userAgent: req.get('user-agent'),
    });

    // Handle ApiError instances
    if (error instanceof ApiError) {
        errorResponse(
            res,
            error.message,
            error.code,
            error.statusCode,
            error.details
        );
        return;
    }

    // Handle Mongoose validation errors
    if (error.name === 'ValidationError') {
        errorResponse(
            res,
            'Validation failed',
            'VALIDATION_ERROR',
            StatusCodes.BAD_REQUEST,
            { message: error.message }
        );
        return;
    }

    // Handle Mongoose duplicate key errors
    if (error.name === 'MongoServerError' && (error as any).code === 11000) {
        const fields = Object.keys((error as any).keyValue || {});
        errorResponse(
            res,
            `Duplicate value for field(s): ${fields.join(', ')}`,
            'DUPLICATE_KEY',
            StatusCodes.CONFLICT
        );
        return;
    }

    // Handle Mongoose cast errors (invalid ObjectId)
    if (error.name === 'CastError') {
        errorResponse(
            res,
            'Invalid ID format',
            'INVALID_ID',
            StatusCodes.BAD_REQUEST
        );
        return;
    }

    // Handle JSON parsing errors
    if (error instanceof SyntaxError && 'type' in error && (error as any).type === 'entity.parse.failed') {
        errorResponse(
            res,
            'Invalid JSON payload',
            'PARSE_ERROR',
            StatusCodes.BAD_REQUEST
        );
        return;
    }

    // Handle payload too large
    if ('status' in error && (error as any).status === 413) {
        errorResponse(
            res,
            'Payload too large',
            'PAYLOAD_TOO_LARGE',
            413
        );
        return;
    }

    // Handle multer errors (file upload)
    if (error.name === 'MulterError') {
        errorResponse(
            res,
            'File upload error',
            'UPLOAD_ERROR',
            StatusCodes.BAD_REQUEST,
            { message: error.message }
        );
        return;
    }

    // Handle JWT errors
    if (error.name === 'JsonWebTokenError') {
        errorResponse(
            res,
            'Invalid token',
            'INVALID_TOKEN',
            StatusCodes.UNAUTHORIZED
        );
        return;
    }

    if (error.name === 'TokenExpiredError') {
        errorResponse(
            res,
            'Token expired',
            'TOKEN_EXPIRED',
            StatusCodes.UNAUTHORIZED
        );
        return;
    }

    // Default: Internal server error
    const isProduction = process.env.NODE_ENV === 'production';
    errorResponse(
        res,
        'Internal server error',
        'INTERNAL_ERROR',
        StatusCodes.INTERNAL_SERVER_ERROR,
        isProduction ? undefined : { message: error.message, stack: error.stack }
    );
}

/**
 * Async handler wrapper to catch errors
 */
export function asyncHandler(
    fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
    return (req: Request, res: Response, next: NextFunction) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}
