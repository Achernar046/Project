import { Request, Response, NextFunction } from 'express';
import { StatusCodes } from 'http-status-codes';

/**
 * Standardized API response format
 */
export interface ApiResponse<T = unknown> {
    success: boolean;
    message: string;
    data?: T;
    error?: {
        code: string;
        message: string;
        details?: unknown;
    };
    meta?: {
        timestamp: string;
        path: string;
        method: string;
    };
}

/**
 * Paginated response format
 */
export interface PaginatedResponse<T> extends ApiResponse<T[]> {
    pagination?: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
        hasNext: boolean;
        hasPrev: boolean;
    };
}

/**
 * Success response helper
 */
export function successResponse<T>(
    res: Response,
    data: T,
    message = 'Success',
    statusCode = StatusCodes.OK
): void {
    const response: ApiResponse<T> = {
        success: true,
        message,
        data,
        meta: {
            timestamp: new Date().toISOString(),
            path: res.req.path,
            method: res.req.method,
        },
    };
    res.status(statusCode).json(response);
}

/**
 * Error response helper
 */
export function errorResponse(
    res: Response,
    message: string,
    code = 'INTERNAL_ERROR',
    statusCode = StatusCodes.INTERNAL_SERVER_ERROR,
    details?: unknown
): void {
    const response: ApiResponse = {
        success: false,
        message,
        error: {
            code,
            message,
            details,
        },
        meta: {
            timestamp: new Date().toISOString(),
            path: res.req.path,
            method: res.req.method,
        },
    };
    res.status(statusCode).json(response);
}

/**
 * Not found response helper
 */
export function notFoundResponse(
    res: Response,
    resource = 'Resource'
): void {
    errorResponse(
        res,
        `${resource} not found`,
        'NOT_FOUND',
        StatusCodes.NOT_FOUND
    );
}

/**
 * Validation error response helper
 */
export function validationErrorResponse(
    res: Response,
    errors: unknown
): void {
    errorResponse(
        res,
        'Validation failed',
        'VALIDATION_ERROR',
        StatusCodes.BAD_REQUEST,
        errors
    );
}

/**
 * Unauthorized response helper
 */
export function unauthorizedResponse(
    res: Response,
    message = 'Unauthorized'
): void {
    errorResponse(
        res,
        message,
        'UNAUTHORIZED',
        StatusCodes.UNAUTHORIZED
    );
}

/**
 * Forbidden response helper
 */
export function forbiddenResponse(
    res: Response,
    message = 'Forbidden'
): void {
    errorResponse(
        res,
        message,
        'FORBIDDEN',
        StatusCodes.FORBIDDEN
    );
}

/**
 * Too many requests response helper
 */
export function tooManyRequestsResponse(
    res: Response,
    retryAfter?: number
): void {
    if (retryAfter) {
        res.setHeader('Retry-After', retryAfter.toString());
    }
    errorResponse(
        res,
        'Too many requests, please try again later',
        'RATE_LIMIT_EXCEEDED',
        StatusCodes.TOO_MANY_REQUESTS
    );
}

/**
 * Conflict response helper
 */
export function conflictResponse(
    res: Response,
    message: string
): void {
    errorResponse(
        res,
        message,
        'CONFLICT',
        StatusCodes.CONFLICT
    );
}

/**
 * Paginated response helper
 */
export function paginatedResponse<T>(
    res: Response,
    data: T[],
    total: number,
    page: number,
    limit: number,
    message = 'Success'
): void {
    const totalPages = Math.ceil(total / limit);
    const response: PaginatedResponse<T> = {
        success: true,
        message,
        data,
        pagination: {
            page,
            limit,
            total,
            totalPages,
            hasNext: page < totalPages,
            hasPrev: page > 1,
        },
        meta: {
            timestamp: new Date().toISOString(),
            path: res.req.path,
            method: res.req.method,
        },
    };
    res.status(StatusCodes.OK).json(response);
}

/**
 * Middleware to handle 404 for undefined routes
 */
export function notFoundMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
): void {
    notFoundResponse(res, 'Endpoint');
}
