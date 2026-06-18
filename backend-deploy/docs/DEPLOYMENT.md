# WasteCoin Backend — Deployment Guide

> อัปเดตล่าสุด: มิถุนายน 2026 (ตรวจสอบจาก docker-compose.yml และ Dockerfile จริง)

## Overview

WasteCoin Backend deploy ด้วย Docker Compose — ประกอบด้วย 3 services:

| Service | Image | Port | หมายเหตุ |
|---|---|---|---|
| `backend` | Custom Dockerfile | 3000 | Express API |
| `redis` | `redis:7-alpine` | internal only | Token revocation store |
| `frontend` | `../frontend/Dockerfile` | 3001 | Next.js app |

## Prerequisites

- Docker 20.10+
- Docker Compose 2.0+
- MongoDB Atlas หรือ MongoDB instance (external)
- Ethereum Sepolia RPC URL (Infura / Alchemy)

---

## Quick Start

### 1. สร้างไฟล์ `.env`

```bash
cp .env.example .env
```

แก้ไข `.env` ตาม section [Environment Variables](#environment-variables)

### 2. Build & Start

```bash
# Build และเริ่ม services ทั้งหมด
docker-compose up -d --build

# ดู logs
docker-compose logs -f

# ดู status
docker-compose ps
```

### 3. ตรวจสอบ

```bash
# Health check
curl http://localhost:3000/health

# Readiness (ping MongoDB)
curl http://localhost:3000/ready

# Frontend
curl http://localhost:3001
```

---

## Environment Variables

### Backend (Required)

| Variable | Required | Default | Description |
|---|---|---|---|
| `PORT` | ❌ | `3000` | Server port |
| `NODE_ENV` | ❌ | `development` | `production` / `development` |
| `MONGODB_URI` | ✅ | — | MongoDB connection string |
| `MONGODB_DB` | ❌ | `waste-coin-db` | Database name |
| `JWT_SECRET` | ✅ | — | ≥32 chars, ห้ามใช้ default |
| `ENCRYPTION_SECRET` | ✅ | — | ≥32 chars, ห้ามใช้ default |
| `SEPOLIA_RPC_URL` | ✅ | — | Infura/Alchemy Sepolia RPC |
| `OFFICER_PRIVATE_KEY` | ✅ | — | `0x...` private key ของ officer |
| `WASTE_COIN_CONTRACT_ADDRESS` | ✅ | — | WST contract address |
| `CORS_ORIGIN` | ✅ (prod) | — | Comma-separated origins (ใน prod) |
| `ENABLE_WALLET_EXPORT` | ❌ | `false` | เปิด/ปิด GET /api/wallet/export |
| `WALLET_MIN_GAS_BALANCE_ETH` | ❌ | `0.0003` | Threshold สำหรับ auto gas top-up |
| `WALLET_GAS_TOP_UP_AMOUNT_ETH` | ❌ | `0.001` | ETH ที่เติมให้ per top-up |
| `REDIS_URL` | ❌ | `redis://localhost:6379` | Redis URL (Docker: `redis://redis:6379`) |
| `UPLOAD_MAX_SIZE_MB` | ❌ | `5` | ขนาดสูงสุดของ image upload |
| `UPLOAD_DIR` | ❌ | `public/uploads` | Directory เก็บไฟล์ที่ upload |
| `LOG_LEVEL` | ❌ | `info` | `debug` / `info` / `warn` / `error` |

> ⚠️ **หมายเหตุ Docker Compose:** `REDIS_URL` ใน `docker-compose.yml` hardcoded เป็น `redis://redis:6379` — ค่าใน `.env` จะ override ได้เฉพาะนอก Docker

### Frontend

| Variable | Required | Default | Description |
|---|---|---|---|
| `FRONTEND_PORT` | ❌ | `3001` | Frontend port |
| `NEXT_PUBLIC_API_URL` | ❌ | `http://localhost:3000` | Backend URL สำหรับ frontend |

---

## Docker Compose Services

### backend

```yaml
container_name: waste-coin-backend
ports: "${PORT:-3000}:3000"
depends_on: redis (service_healthy)
healthcheck: GET http://localhost:3000/health (interval: 30s, timeout: 10s, retries: 3)
volumes: uploads_data:/app/public/uploads
```

- REDIS_URL hardcoded เป็น `redis://redis:6379` ใน compose
- UPLOAD_DIR hardcoded เป็น `public/uploads`

### redis

```yaml
image: redis:7-alpine
command: redis-server --appendonly yes
volumes: redis_data:/data
healthcheck: redis-cli ping (interval: 10s)
```

- Persistent volume สำหรับ token revocation data
- ไม่ expose port ออกนอก network

### frontend

```yaml
container_name: waste-coin-frontend
ports: "${FRONTEND_PORT:-3001}:3001"
depends_on: backend (service_healthy)
context: ../frontend
```

### Volumes

| Volume | ใช้สำหรับ |
|---|---|
| `redis_data` | Redis AOF data (token revocation JTI store) |
| `uploads_data` | Uploaded waste images (/app/public/uploads) |

### Network

```yaml
waste-coin-network: bridge
```

---

## Server Startup Sequence

สิ่งที่ backend ทำตอนเริ่ม (จาก `src/index.ts`):

```
1. validateConfig()      — ตรวจ env vars, reject default secrets
2. connectToDatabase()   — เชื่อม MongoDB
3. ensureIndexes(db)     — สร้าง indexes (idempotent, ไม่ crash ถ้า fail)
4. initRedis()           — เชื่อม Redis (throw + exit ถ้า fail)
5. app.listen(PORT)      — HTTP server พร้อม
6. register SIGTERM/SIGINT — graceful: server.close() → closeRedis() → exit(0)
7. uncaughtException     — log + exit(1)
8. unhandledRejection    — log only
```

> ⚠️ Redis เป็น **mandatory** — ถ้า `initRedis()` fail, server จะหยุดทำงาน

---

## Local Development (ไม่ใช้ Docker)

### Backend

```bash
# Install
npm install

# Copy env
cp .env.example .env
# แก้ไข .env ตามต้องการ

# Dev mode (ts-node + nodemon)
npm run dev

# Build + Production
npm run build
npm start
```

### Utility Scripts

```bash
# Seed rewards data
npm run seed:rewards

# Repair officer wallet
npm run repair:officer-wallet
```

### Redis (local dev)

ต้องมี Redis รันอยู่:
```bash
# Docker
docker run -d -p 6379:6379 redis:7-alpine

# หรือ local install
redis-server
```

---

## Health Checks

| Endpoint | Description | Success |
|---|---|---|
| `GET /health` | ตรวจ process ทำงาน | `{"status":"ok","environment":"...","timestamp":"..."}` |
| `GET /ready` | ตรวจ MongoDB connection | `{"status":"ready","database":"ok"}` |

Docker health check (`/health`) รันทุก 30 วิ, timeout 10 วิ, retry 3 ครั้ง

---

## Logging

Winston logger เขียน logs 3 ที่:
1. **Console** — colorized
2. **`logs/error.log`** — level error เท่านั้น (max 5MB × 3 files)
3. **`logs/combined.log`** — ทุก level (max 5MB × 3 files)

ระดับ log: `LOG_LEVEL` env (default: `info`)

---

## Security Configuration

### JWT Validation

ตอน startup `validateConfig()` จะ **reject** ถ้า:
- `JWT_SECRET` ยังเป็น default `"your-secret-key-change-in-production"`
- `ENCRYPTION_SECRET` ยังเป็น default `"default-secret-change-this"`
- `SEPOLIA_RPC_URL` ยังเป็น placeholder `"https://sepolia.infura.io/v3/"`
- `NODE_ENV=production` แต่ `CORS_ORIGIN` ว่าง

### Generate Secrets

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### CORS

- Development: ยอมรับทุก origin (no `origin` restriction)
- Production: ยอมรับเฉพาะ origins ใน `CORS_ORIGIN` (comma-separated)

```
CORS_ORIGIN=https://app.example.com,https://admin.example.com
```

---

## Troubleshooting

### Container ไม่เริ่ม

```bash
# ดู logs
docker-compose logs backend
docker-compose logs redis

# ดู health
docker inspect --format='{{.State.Health.Status}}' waste-coin-backend
docker inspect --format='{{.State.Health.Status}}' waste-coin-redis
```

### Redis connection failed

Server จะ exit ทันที — ตรวจสอบ:
1. Redis service up: `docker-compose ps redis`
2. `REDIS_URL` ถูกต้อง (Docker: `redis://redis:6379`)

### MongoDB connection failed

```bash
# ตรวจสอบ MONGODB_URI
# ตรวจสอบ IP whitelist ใน MongoDB Atlas
# ตรวจสอบ ping
curl http://localhost:3000/ready
```

### Image upload ไม่ทำงาน

1. ตรวจ volume `uploads_data` mount ถูก
2. ตรวจ `UPLOAD_MAX_SIZE_MB` (default 5MB)
3. ตรวจ Content-Type: `multipart/form-data`
4. ไฟล์ต้องเป็น JPEG / PNG / WebP เท่านั้น

### Build failed

```bash
docker-compose build --no-cache
docker-compose build backend
```

### Rate limit

```bash
# ดู headers
curl -I http://localhost:3000/api/auth/login

# X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset
```

---

## Production Checklist

- [ ] ตั้งค่า `CORS_ORIGIN` เป็น frontend domain จริง
- [ ] ใช้ JWT_SECRET และ ENCRYPTION_SECRET ที่ generate ใหม่ (≥32 chars)
- [ ] ตั้งค่า `ENABLE_WALLET_EXPORT=false` (default)
- [ ] ตั้งค่า `LOG_LEVEL=warn` หรือ `error` ใน production
- [ ] ใช้ Reverse proxy (nginx/traefik) สำหรับ SSL/TLS
- [ ] ตั้งค่า MongoDB Atlas IP whitelist
- [ ] Backup MongoDB data
- [ ] Monitor Redis memory usage

---

## File Structure

```
backend-deploy/
├── src/
│   ├── index.ts              # Entry point
│   ├── models/types.ts       # TypeScript interfaces
│   ├── lib/
│   │   ├── config.ts         # Env config + validation
│   │   ├── mongodb.ts        # MongoDB singleton
│   │   ├── db-indexes.ts     # Index definitions
│   │   ├── redis.ts          # Redis singleton
│   │   ├── auth.ts           # JWT logic
│   │   ├── auth-middleware.ts# authMiddleware, officerMiddleware
│   │   ├── blockchain.ts     # ethers.js integration
│   │   ├── wallet.ts         # Key management
│   │   ├── upload.ts         # Multer config
│   │   ├── security.ts       # Security middleware stack
│   │   ├── validation.ts     # Input helpers
│   │   ├── response.ts       # Standardized response helpers
│   │   ├── error-handler.ts  # ApiError class + global handler
│   │   ├── rate-limit.ts     # Custom rate limiter (legacy, not used in index.ts)
│   │   └── logger.ts         # Winston logger
│   └── routes/
│       ├── auth.ts           # /api/auth
│       ├── waste.ts          # /api/waste
│       ├── wallet.ts         # /api/wallet
│       ├── officer.ts        # /api/officer
│       ├── rewards.ts        # /api/rewards
│       ├── users.ts          # /api/users
│       ├── app.ts            # /api/app
│       ├── transactions.ts   # /api/transactions
│       └── notifications.ts  # /api/notifications
├── scripts/
│   ├── seed-rewards.ts
│   └── repair-officer-wallet.ts
├── docs/
├── Dockerfile
├── docker-compose.yml
├── .env.example
└── package.json
```
