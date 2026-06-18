import multer, { FileFilterCallback } from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { Request } from 'express';
import { getConfig } from './config';
import { logger } from './logger';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];

/**
 * File filter — only JPEG / PNG / WebP
 */
function imageFileFilter(req: Request, file: Express.Multer.File, cb: FileFilterCallback) {
    const ext = path.extname(file.originalname).toLowerCase();
    const isMimeAllowed = ALLOWED_MIME_TYPES.includes(file.mimetype);
    const isExtAllowed = ALLOWED_EXTENSIONS.includes(ext);

    if (isMimeAllowed && isExtAllowed) {
        cb(null, true);
    } else {
        cb(new Error('Only JPEG, PNG, and WebP images are allowed'));
    }
}

/**
 * Multer instance — memory storage (buffer), max configurable via env
 */
export function createUploadMiddleware() {
    const { uploadMaxSizeMb } = getConfig();
    return multer({
        storage: multer.memoryStorage(),
        limits: {
            fileSize: uploadMaxSizeMb * 1024 * 1024,
            files: 1,
        },
        fileFilter: imageFileFilter,
    });
}

/**
 * Save uploaded file buffer to disk.
 * Returns the public URL path (e.g. /uploads/waste/uuid.jpg)
 */
export async function saveUploadedFile(
    file: Express.Multer.File,
    subdir: string = 'waste'
): Promise<string> {
    const { uploadDir } = getConfig();
    const targetDir = path.join(process.cwd(), uploadDir, subdir);

    // Ensure directory exists
    if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
    }

    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    const filename = `${crypto.randomUUID()}${ext}`;
    const filePath = path.join(targetDir, filename);

    await fs.promises.writeFile(filePath, file.buffer);
    logger.info(`Upload: saved file ${filename} (${file.size} bytes)`);

    // Return as URL path accessible via /uploads/waste/...
    return `/uploads/${subdir}/${filename}`;
}
