# WasteCoin Backend System Structure

> อัปเดตล่าสุด: มิถุนายน 2026 (ตรวจสอบจาก source code จริง)

## Overview

ระบบนี้เป็น Backend สำหรับแพลตฟอร์ม WasteCoin พัฒนาด้วย Node.js, TypeScript และ Express ทำหน้าที่จัดการผู้ใช้ การส่งข้อมูลขยะ การอนุมัติโดยเจ้าหน้าที่ การจัดการกระเป๋าเหรียญ การแลกรางวัล การแจ้งเตือน และการเชื่อมต่อกับ Smart Contract บน Ethereum Sepolia

## Runtime Architecture

- Runtime: Node.js
- Language: TypeScript ^5.8.2
- Web framework: Express ^4.21.2
- Entry point: `src/index.ts`
- Build output: `dist/index.js`
- Deployment: `Dockerfile` + `docker-compose.yml`

## Main Layers

### 1. Security Layer (Middleware Stack)

ลำดับ middleware ที่ใช้จริงใน `src/index.ts`:

1. **CORS** — allowlist จาก `CORS_ORIGIN` env (comma-separated), ใน development ยอมรับทุก origin
2. **Helmet + Custom Security** — `createSecurityMiddleware()` จาก `src/lib/security.ts`
3. **Rate Limiting** — 3 ระดับแยกกัน:
   - General limiter: `100 req / 15 min` ทุก request
   - Auth limiter: `10 req / 15 min` เฉพาะ `/api/auth/*`
   - API limiter: `200 req / 15 min` เฉพาะ `/api/*`
4. **Body Parser** — JSON + URL-encoded ขนาดสูงสุด `100kb`
5. **Static File Serving** — `/uploads` → `public/uploads/` (สำหรับ waste images)

### 2. API Layer

Express server รับ request ทั้งหมด routes หลัก:

| Mount Path | File | หมายเหตุ |
|---|---|---|
| `/api/auth` | `routes/auth.ts` | authLimiter ใช้งาน |
| `/api/waste` | `routes/waste.ts` | |
| `/api/officer` | `routes/officer.ts` | |
| `/api/wallet` | `routes/wallet.ts` | |
| `/api/transactions` | `routes/transactions.ts` | |
| `/api/users` | `routes/users.ts` | |
| `/api/app` | `routes/app.ts` | |
| `/api/rewards` | `routes/rewards.ts` | |
| `/api/notifications` | `routes/notifications.ts` | |
| `/health` | `index.ts` inline | Public |
| `/ready` | `index.ts` inline | Public, ping MongoDB |

### 3. Auth Layer

- **JWT Access Token** — อายุ `15 นาที`, signed ด้วย `JWT_SECRET`
- **JWT Refresh Token** — อายุ `7 วัน`, signed ด้วย derived secret (`SHA-256(JWT_SECRET + ENCRYPTION_SECRET)`), มี `jti` สำหรับ revocation
- **Redis Token Revocation** — revoked JTI เก็บใน Redis พร้อม TTL 7 วัน (ทน server restart)
- **RBAC** — role: `user` | `officer` ฝังใน JWT payload

### 4. Data Layer (MongoDB)

ใช้ MongoDB Native Driver (ไม่ใช้ Mongoose) collections หลัก:

| Collection | คำอธิบาย |
|---|---|
| `users` | ข้อมูลบัญชี, role, wallet_address |
| `wallets` | encrypted_private_key, encryption_iv (1:1 กับ user) |
| `waste_submissions` | ข้อมูลการส่งขยะ, status (pending/approved/rejected) |
| `transactions` | ประวัติ mint/transfer/exchange พร้อม blockchain_tx_hash |
| `rewards` | รายการของรางวัล, coin_price, stock, category |
| `redemption_history` | ประวัติแลกรางวัล, status (pending→delivered) |
| `notifications` | แจ้งเตือน per-user, is_read flag |
| `gas_topups` | log การเติม ETH gas อัตโนมัติ พร้อม balance_before/after |

**MongoDB Indexes** (สร้างอัตโนมัติตอน startup ผ่าน `ensureIndexes()` — idempotent):

| Collection | Index |
|---|---|
| `users` | `email` (unique), `user_id` (unique) |
| `wallets` | `user_id` (unique), `address` (unique) |
| `waste_submissions` | `{user_id, created_at}`, `{status, created_at}` |
| `transactions` | `{user_id, created_at}`, `blockchain_tx_hash` (sparse) |
| `notifications` | `{user_id, is_read, created_at}` |
| `redemption_history` | `{user_id, created_at}` |
| `gas_topups` | `{user_id, created_at}` |

### 5. Blockchain Layer

เชื่อมกับ Ethereum Sepolia ผ่าน `ethers.js` v6

- Provider เชื่อมต่อผ่าน `SEPOLIA_RPC_URL` (Infura)
- Smart Contract WasteCoin — functions ที่ใช้: `balanceOf`, `transfer`, `mintCoins`
- Officer Wallet: mint เหรียญ + เติม ETH gas ให้ user
- User Wallet: custodial — สร้างตอน register, private key เข้ารหัสด้วย AES-256-CBC ก่อนเก็บ DB

## Core Modules

### Auth Module

**Files:** `routes/auth.ts`, `lib/auth.ts`, `lib/auth-middleware.ts`, `lib/wallet.ts`

| Endpoint | Action |
|---|---|
| `POST /api/auth/register` | validate input → hash password (bcrypt salt 12) → สร้าง ETH wallet → encrypt private key → save DB → async gas top-up → return token pair |
| `POST /api/auth/login` | normalize email → bcrypt compare → return token pair |
| `POST /api/auth/refresh` | verify refresh token (Redis revocation check) → verify user still exists → revoke old token → return new token pair |
| `POST /api/auth/logout` | verify + revoke refresh token JTI ใน Redis |

**Password Validation (register):**
- ≥ 8 ตัวอักษร
- ต้องมีตัวพิมพ์ใหญ่, ตัวพิมพ์เล็ก, ตัวเลข, อักขระพิเศษ

**หมายเหตุ:** `POST /api/users/change-password` ตรวจ min 6 chars เท่านั้น (ไม่มี strength check)  
`POST /api/app/change-password` ตรวจ min 6 chars เช่นกัน

### Waste Module

**File:** `routes/waste.ts`

| Endpoint | Action |
|---|---|
| `POST /api/waste/submit` | รับ multipart/form-data หรือ JSON — uploaded file บันทึกด้วย UUID filename; ถ้าส่ง image_url ต้องผ่าน `isSafeUrl()` validation |
| `GET /api/waste/my-submissions` | paginated (default page=1, limit=20), sort by created_at DESC |
| `GET /api/waste/pending` | officer only — aggregate JOIN users, paginated |
| `POST /api/waste/approve` | officer only — mintCoins() บน blockchain → update submission → save transaction → save notification |

### Wallet Module

**Files:** `routes/wallet.ts`, `lib/blockchain.ts`, `lib/wallet.ts`

| Endpoint | Action | Response Format |
|---|---|---|
| `GET /api/wallet/balance` | `balanceOf()` จาก contract | raw `res.json()` (ไม่ใช้ successResponse) |
| `GET /api/wallet/info` | ดูข้อมูล user จาก DB | raw `res.json()` |
| `POST /api/wallet/transfer` | ensureGas → decrypt key → transferCoins() → save transaction | raw `res.json()` |
| `GET /api/wallet/export` | ต้องเปิด `ENABLE_WALLET_EXPORT=true` — return privateKey พร้อม warning | raw `res.json()` |

> **Note:** wallet routes ยังใช้ raw `res.json()` ไม่ใช่ standardized `successResponse()` ต่างจาก routes อื่น

### Rewards Module

**File:** `routes/rewards.ts`

| Endpoint | Action |
|---|---|
| `GET /api/rewards/list` | paginated, filter by `?category=` เฉพาะ stock > 0 |
| `POST /api/rewards/redeem` | ตรวจ stock → atomic decrement → ensureGas → transferCoins(user→officer) → หาก fail rollback stock +1 → save redemption + transaction + notification |
| `GET /api/rewards/history` | paginated, sort by created_at DESC |
| `POST /api/rewards/add` | officer — name, coin_price, stock required; image_url optional |
| `PUT /api/rewards/update/:id` | officer — partial update ทุก field |
| `DELETE /api/rewards/delete/:id` | officer |

### User Module

**Files:** `routes/users.ts`, `routes/app.ts`

| Endpoint | Action | หมายเหตุ |
|---|---|---|
| `GET /api/users/profile` | profile + stats (total_submissions, approved_submissions, total_coins_earned) | |
| `PUT /api/users/profile` | update name, profile_image, phone_number | |
| `POST /api/users/change-password` | currentPassword + newPassword (min 6 chars) | ใน `users.ts` |
| `GET /api/users/list` | officer — list role=user only, sort by created_at DESC | ไม่ paginated |

### App Module

**File:** `routes/app.ts`

| Endpoint | Action |
|---|---|
| `GET /api/app/dashboard` | profile + wallet address + 5 recent transactions |
| `POST /api/app/verify-identity` | ตรวจ password ของ user ที่ login อยู่ |
| `POST /api/app/change-password` | old_password + new_password (min 6 chars) |

### Officer Module

**File:** `routes/officer.ts`

| Endpoint | Action | หมายเหตุ |
|---|---|---|
| `POST /api/officer/add-coins` | mintCoins() → save transaction | return 201 |
| `GET /api/officer/transactions` | aggregate JOIN users, limit 50 (hardcoded), sort DESC | ไม่ paginated |
| `GET /api/officer/rewards/report` | inventory (all rewards) + redemption history JOIN users | |

### Notification Module

**File:** `routes/notifications.ts`

| Endpoint | Action | หมายเหตุ |
|---|---|---|
| `GET /api/notifications` | list notifications ของ user, sort by created_at DESC | ไม่ paginated |
| `PUT /api/notifications/read-all` | updateMany is_read=true | |
| `PUT /api/notifications/:id/read` | updateOne is_read=true (ตรวจ ownership) | |

**Notification ถูกสร้างเมื่อ:**
- Officer อนุมัติ waste submission (`type: success`)
- User แลกรางวัลสำเร็จ (`type: success`)

### Transactions Module

**File:** `routes/transactions.ts`

| Endpoint | Action | หมายเหตุ |
|---|---|---|
| `GET /api/transactions/history` | list transactions ของ user, limit 20 (hardcoded), sort DESC | ไม่ paginated |

## Data Models (ตาม types.ts จริง)

### GasTopUpLog (ขยายจากเดิม)
```typescript
interface GasTopUpLog {
    user_id: ObjectId;
    wallet_address: string;
    funded_by_address: string;
    trigger: 'register' | 'wallet_transfer' | 'reward_redeem';
    amount_eth: string;
    min_required_eth: string;       // เพิ่มใหม่ — threshold ที่ใช้ตรวจสอบ
    balance_before_wei: string;     // เพิ่มใหม่ — balance ก่อน top-up
    balance_after_wei: string;      // เพิ่มใหม่ — balance หลัง top-up
    blockchain_tx_hash: string;
    status: 'confirmed';            // เสมอ 'confirmed' (only saved on success)
    created_at: Date;
}
```

## API Response Format

**Routes ที่ใช้ standardized response** (auth, waste, rewards, officer route บางส่วน):
```json
{
  "success": true,
  "message": "...",
  "data": { ... },
  "meta": { "timestamp": "...", "path": "...", "method": "..." }
}
```

**Routes ที่ใช้ raw response** (wallet, users, app, notifications, transactions):
```json
{ ... }
```

## Configuration (src/lib/config.ts)

| Variable | Required | Default | Description |
|---|---|---|---|
| `MONGODB_URI` | ✅ | — | MongoDB connection string |
| `MONGODB_DB` | ❌ | `waste-coin-db` | Database name |
| `JWT_SECRET` | ✅ | — | ห้ามใช้ค่า default |
| `ENCRYPTION_SECRET` | ✅ | — | สำหรับเข้ารหัส private key |
| `SEPOLIA_RPC_URL` | ✅ | — | ห้ามใช้ placeholder `https://sepolia.infura.io/v3/` |
| `WASTE_COIN_CONTRACT_ADDRESS` | ✅ | — | WST contract address |
| `OFFICER_PRIVATE_KEY` | ✅ | — | Private key ของ officer wallet |
| `CORS_ORIGIN` | ✅ (prod) | — | Comma-separated origins |
| `PORT` | ❌ | `3000` | Server port |
| `NODE_ENV` | ❌ | `development` | Environment |
| `ENABLE_WALLET_EXPORT` | ❌ | `false` | เปิด/ปิด export private key |
| `WALLET_MIN_GAS_BALANCE_ETH` | ❌ | `0.0003` | Threshold สำหรับ auto top-up |
| `WALLET_GAS_TOP_UP_AMOUNT_ETH` | ❌ | `0.001` | จำนวน ETH ที่เติมให้ |
| `REDIS_URL` | ❌ | `redis://localhost:6379` | Redis URL |
| `UPLOAD_MAX_SIZE_MB` | ❌ | `5` | ขนาดไฟล์สูงสุด |
| `UPLOAD_DIR` | ❌ | `public/uploads` | Path เก็บไฟล์ |
| `LOG_LEVEL` | ❌ | `info` | Winston log level |
| `FRONTEND_PORT` | ❌ | `3001` | Frontend container port |
| `NEXT_PUBLIC_API_URL` | ❌ | `http://localhost:3000` | Backend URL สำหรับ frontend |

## Docker Compose Services

| Service | Image | Port | หมายเหตุ |
|---|---|---|---|
| `backend` | Custom Dockerfile | `3000` | depends_on redis (healthy), health check /health |
| `redis` | `redis:7-alpine` | internal | `--appendonly yes`, persistent volume `redis_data` |
| `frontend` | `../frontend/Dockerfile` | `3001` | depends_on backend (healthy) |

Network: `waste-coin-network` (bridge)  
Volumes: `redis_data`, `uploads_data`

## Server Startup Sequence (src/index.ts)

```
1. validateConfig()          — ตรวจ env vars + reject default secrets
2. connectToDatabase()       — MongoDB connection
3. ensureIndexes(db)         — สร้าง indexes (idempotent)
4. initRedis()               — Redis connection (throw ถ้า fail)
5. app.listen(PORT)          — HTTP server ready
6. register SIGTERM/SIGINT   — graceful shutdown (closeRedis → process.exit)
7. register uncaughtException — log + exit(1)
```

## Key Design Notes (จากโค้ดจริง)

1. **Monolithic** — Express app เดียว แยก module ตาม domain
2. **Custodial Wallet** — backend ถือ private key (AES-256-CBC encrypted)
3. **MongoDB Native Driver** — ไม่ใช้ ORM
4. **Redis Token Revocation** — JTI blacklist พร้อม TTL ทน restart
5. **Optimistic Stock** — reserve stock ก่อน blockchain transfer, rollback ถ้า fail
6. **Auto Gas Top-up** — async ตอน register, synchronous ตอน transfer/redeem
7. **Inconsistent Response Format** — wallet/users/app/notifications ยังใช้ raw `res.json()` ไม่ใช่ `successResponse()`
8. **Hardcoded Limits** — transactions history: limit 20; officer transactions: limit 50
9. **Upload** — Multer memory storage → save ด้วย UUID filename → serve via `/uploads` static
