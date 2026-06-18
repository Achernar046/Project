import express, { Request, Response, NextFunction } from 'express';
import cors, { CorsOptions } from 'cors';
import rateLimit from 'express-rate-limit';
import path from 'path';
import authRoutes from './routes/auth';
import wasteRoutes from './routes/waste';
import officerRoutes from './routes/officer';
import walletRoutes from './routes/wallet';
import transactionRoutes from './routes/transactions';
import userRoutes from './routes/users';
import appRoutes from './routes/app';
import rewardRoutes from './routes/rewards';
import notificationRoutes from './routes/notifications';
import { connectToDatabase, pingDatabase, getDatabase } from './lib/mongodb';
import { validateConfig } from './lib/config';
import { logger } from './lib/logger';
import { createSecurityMiddleware } from './lib/security';
import { globalErrorHandler, ApiError } from './lib/error-handler';
import { notFoundMiddleware } from './lib/response';
import { initRedis, closeRedis } from './lib/redis';
import { ensureIndexes } from './lib/db-indexes';

const config = validateConfig();
const app = express();

// ============ Security Middleware ============
// CORS Configuration
const corsOptions: CorsOptions = {
    origin(origin, callback) {
        if (!origin) {
            return callback(null, true);
        }

        if (!config.isProduction || config.corsOrigins.includes(origin)) {
            return callback(null, true);
        }

        logger.warn(`CORS blocked: ${origin}`);
        return callback(new Error('Not allowed by CORS'));
    },
    credentials: config.isProduction,
    optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));

// Security headers (Helmet + custom)
app.use(createSecurityMiddleware());

// ============ Rate Limiting ============
// General rate limiter
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: {
        success: false,
        message: 'Too many requests, please try again later',
        error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many requests, please try again later',
        },
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// Auth rate limiter (stricter)
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // limit each IP to 10 auth requests per windowMs
    message: {
        success: false,
        message: 'Too many authentication attempts, please try again later',
        error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many authentication attempts',
        },
    },
    skipSuccessfulRequests: false,
});

// API rate limiter
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 200, // limit each IP to 200 requests per windowMs
    message: {
        success: false,
        message: 'Too many requests, please try again later',
        error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many requests',
        },
    },
    standardHeaders: true,
    legacyHeaders: false,
});

app.use(generalLimiter);
app.use('/api/auth', authLimiter);
app.use('/api', apiLimiter);

// ============ Body Parser ============
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

// ============ Static Files ============
// Serve uploaded images
app.use('/uploads', express.static(path.join(process.cwd(), config.uploadDir)));

// ============ Routes ============
app.use('/api/auth', authRoutes);
app.use('/api/waste', wasteRoutes);
app.use('/api/officer', officerRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/users', userRoutes);
app.use('/api/app', appRoutes);
app.use('/api/rewards', rewardRoutes);
app.use('/api/notifications', notificationRoutes);

// ============ Health & Readiness Endpoints ============
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        environment: config.nodeEnv,
        message: 'WasteCoin Backend is running',
        timestamp: new Date().toISOString(),
    });
});

app.get('/ready', async (req, res, next) => {
    try {
        await pingDatabase();
        res.json({
            status: 'ready',
            database: 'ok',
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        logger.error('Health check failed:', error);
        res.status(503).json({
            status: 'not_ready',
            database: 'error',
            error: (error as Error).message,
            timestamp: new Date().toISOString(),
        });
    }
});

// ============ 404 Handler ============
app.use(notFoundMiddleware);

// ============ Global Error Handler ============
app.use(globalErrorHandler);

// ============ Graceful Shutdown ============
let server: ReturnType<typeof app.listen>;

async function startServer() {
    try {
        // Connect to MongoDB
        await connectToDatabase();
        logger.info('Connected to MongoDB');

        // Ensure MongoDB indexes
        const db = await getDatabase();
        await ensureIndexes(db);

        // Connect to Redis
        await initRedis();

        server = app.listen(config.port, () => {
            logger.info(`Server running on http://localhost:${config.port}`);
            logger.info(`Environment: ${config.nodeEnv}`);
        });

        // Handle graceful shutdown
        const shutdown = async (signal: string) => {
            logger.info(`${signal} received. Starting graceful shutdown...`);

            // Close HTTP server
            server.close(async () => {
                logger.info('HTTP server closed');
                await closeRedis();
                process.exit(0);
            });

            // Force close after timeout
            setTimeout(() => {
                logger.error('Forced shutdown due to timeout');
                process.exit(1);
            }, 30000);
        };

        process.on('SIGTERM', () => shutdown('SIGTERM'));
        process.on('SIGINT', () => shutdown('SIGINT'));

        // Handle uncaught exceptions
        process.on('uncaughtException', (error) => {
            logger.error('Uncaught Exception:', error);
            process.exit(1);
        });

        process.on('unhandledRejection', (reason) => {
            logger.error('Unhandled Rejection:', reason);
        });

    } catch (error) {
        logger.error('Failed to start server:', error);
        process.exit(1);
    }
}

startServer();
