import { ObjectId } from 'mongodb';
import { ethers } from 'ethers';
import { body, param, query, ValidationChain } from 'express-validator';

/**
 * Normalize email address
 */
export function normalizeEmail(value: unknown): string {
    return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

/**
 * Parse positive number
 */
export function parsePositiveNumber(value: unknown): number | null {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/**
 * Parse non-negative integer
 */
export function parseNonNegativeInteger(value: unknown): number | null {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

/**
 * Check if value is valid MongoDB ObjectId
 */
export function isValidObjectId(value: unknown): value is string {
    return typeof value === 'string' && ObjectId.isValid(value);
}

/**
 * Check if value is valid Ethereum address
 */
export function isValidEthereumAddress(value: unknown): value is string {
    return typeof value === 'string' && ethers.isAddress(value);
}

/**
 * Sanitize string with max length
 */
export function sanitizeString(value: unknown, maxLength: number): string | undefined {
    if (typeof value !== 'string') {
        return undefined;
    }

    const trimmed = value.trim();
    if (!trimmed) {
        return undefined;
    }

    return trimmed.slice(0, maxLength);
}

/**
 * Check if URL is safe (not internal network)
 */
export function isSafeUrl(value: unknown): boolean {
    if (typeof value !== 'string') {
        return false;
    }

    try {
        const url = new URL(value);

        // Only allow http and https
        if (!['http:', 'https:'].includes(url.protocol)) {
            return false;
        }

        // Block private IP ranges
        const hostname = url.hostname.toLowerCase();

        // Block localhost and internal domains
        const blockedDomains = [
            'localhost',
            '127.0.0.1',
            '0.0.0.0',
            '169.254.169.254', // AWS metadata
            'metadata.google.internal', // GCP metadata
        ];

        if (blockedDomains.some((domain) => hostname.includes(domain))) {
            return false;
        }

        // Block private IP ranges
        const privateIpPatterns = [
            /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/, // 10.0.0.0/8
            /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/, // 172.16.0.0/12
            /^192\.168\.\d{1,3}\.\d{1,3}$/, // 192.168.0.0/16
            /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/, // 127.0.0.0/8
            /^0\.0\.0\.0$/, // 0.0.0.0
            /^169\.254\.\d{1,3}\.\d{1,3}$/, // Link-local
        ];

        if (privateIpPatterns.some((pattern) => pattern.test(hostname))) {
            return false;
        }

        return true;
    } catch {
        return false;
    }
}

/**
 * Validate password strength
 */
export function isStrongPassword(password: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (password.length < 8) {
        errors.push('Password must be at least 8 characters long');
    }

    if (!/[A-Z]/.test(password)) {
        errors.push('Password must contain at least one uppercase letter');
    }

    if (!/[a-z]/.test(password)) {
        errors.push('Password must contain at least one lowercase letter');
    }

    if (!/\d/.test(password)) {
        errors.push('Password must contain at least one number');
    }

    if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
        errors.push('Password must contain at least one special character');
    }

    return {
        valid: errors.length === 0,
        errors,
    };
}

// ============ Express Validator Chains ============

/**
 * Common validation chains for ObjectId parameters
 */
export const objectIdParam = (paramName = 'id'): ValidationChain => {
    return param(paramName)
        .notEmpty().withMessage('ID is required')
        .isString().withMessage('ID must be a string')
        .matches(/^[0-9a-fA-F]{24}$/).withMessage('Invalid ObjectId format');
};

/**
 * Common validation chains for pagination
 */
export const paginationQuery = () => {
    return [
        query('page')
            .optional()
            .isInt({ min: 1 }).withMessage('Page must be at least 1')
            .toInt(),
        query('limit')
            .optional()
            .isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100')
            .toInt(),
    ];
};

/**
 * Validation chain for email
 */
export const emailValidation = (fieldName = 'email'): ValidationChain => {
    return body(fieldName)
        .notEmpty().withMessage('Email is required')
        .isString().withMessage('Email must be a string')
        .trim()
        .toLowerCase()
        .isEmail().withMessage('Invalid email format')
        .normalizeEmail();
};

/**
 * Validation chain for password
 */
export const passwordValidation = (fieldName = 'password'): ValidationChain => {
    return body(fieldName)
        .notEmpty().withMessage('Password is required')
        .isString().withMessage('Password must be a string')
        .isLength({ min: 8 }).withMessage('Password must be at least 8 characters long')
        .matches(/[A-Z]/).withMessage('Password must contain at least one uppercase letter')
        .matches(/[a-z]/).withMessage('Password must contain at least one lowercase letter')
        .matches(/\d/).withMessage('Password must contain at least one number');
};

/**
 * Validation chain for Ethereum address
 */
export const ethereumAddressValidation = (fieldName = 'address'): ValidationChain => {
    return body(fieldName)
        .notEmpty().withMessage('Ethereum address is required')
        .isString().withMessage('Address must be a string')
        .custom((value) => {
            if (!ethers.isAddress(value)) {
                throw new Error('Invalid Ethereum address format');
            }
            return true;
        });
};

/**
 * Validation chain for safe URL
 */
export const safeUrlValidation = (fieldName = 'url'): ValidationChain => {
    return body(fieldName)
        .optional()
        .isString().withMessage('URL must be a string')
        .custom((value) => {
            if (!isSafeUrl(value)) {
                throw new Error('Invalid or unsafe URL');
            }
            return true;
        });
};

/**
 * Validation chain for string with max length
 */
export const stringValidation = (fieldName: string, maxLength: number, required = true): ValidationChain => {
    const chain = body(fieldName)
        .isString().withMessage(`${fieldName} must be a string`);

    if (required) {
        chain.notEmpty().withMessage(`${fieldName} is required`);
    }

    return chain.trim().isLength({ max: maxLength }).withMessage(`${fieldName} must not exceed ${maxLength} characters`);
};

/**
 * Validation chain for positive integer
 */
export const positiveIntValidation = (fieldName: string): ValidationChain => {
    return body(fieldName)
        .notEmpty().withMessage(`${fieldName} is required`)
        .isInt({ min: 1 }).withMessage(`${fieldName} must be a positive integer`)
        .toInt();
};

/**
 * Validation chain for non-negative integer
 */
export const nonNegativeIntValidation = (fieldName: string): ValidationChain => {
    return body(fieldName)
        .optional()
        .isInt({ min: 0 }).withMessage(`${fieldName} must be a non-negative integer`)
        .toInt();
};
