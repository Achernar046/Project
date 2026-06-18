# WasteCoin Backend — System Workflow

> อัปเดตล่าสุด: มิถุนายน 2026 (ตรวจสอบจาก source code จริง)

## Overview

เอกสารนี้อธิบายกระบวนการทำงานของระบบ WasteCoin Backend ในทุก workflow หลัก ตั้งแต่ระดับ request flow, auth flow ไปจนถึง business logic

---

## 1. Request Lifecycle

```
Client Request
    │
    ▼
[1] CORS Check
    │  Development: ยอมรับทุก origin
    │  Production: ตรวจ CORS_ORIGIN whitelist
    ▼
[2] Security Middleware Stack (createSecurityMiddleware)
    ├─ Helmet — inject 14+ security headers
    ├─ rateLimitHeadersMiddleware — X-Frame-Options, X-XSS-Protection, etc.
    ├─ sanitizeRequestMiddleware — XSS pattern removal (query + body)
    ├─ ipBlockMiddleware — ตรวจ IP blocklist
    ├─ requestLoggingMiddleware — log method/path/status/duration/ip
    └─ contentTypeValidationMiddleware — 415 ถ้าไม่ใช่ application/json
    │
    ▼
[3] Rate Limiting
    ├─ generalLimiter: 100 req/15min (ทุก request)
    ├─ authLimiter: 10 req/15min (/api/auth/*)
    └─ apiLimiter: 200 req/15min (/api/*)
    │
    ▼
[4] Body Parser
    ├─ express.json({ limit: '100kb' })
    └─ express.urlencoded({ extended: true, limit: '100kb' })
    │
    ▼
[5] Route Handler
    │
    ▼
[6] Auth Middleware (authMiddleware / officerMiddleware)
    ├─ ตรวจ Bearer token
    ├─ verifyAccessToken() → JWT + type check
    ├─ MongoDB query (ตรวจ user ยังมีอยู่)
    └─ attach req.user
    │
    ▼
[7] Business Logic
    │
    ▼
[8] Response
    ├─ successResponse / paginatedResponse (standardized)
    └─ res.json() (raw — wallet, users, app, notifications, transactions)
    │
    ▼ (ถ้า error)
[9] globalErrorHandler
    └─ map error type → HTTP status + error code
```

---

## 2. Server Startup Workflow

```
startServer()
    │
    ├─ validateConfig()
    │   └─ reject default secrets, require env vars
    │
    ├─ connectToDatabase()
    │   └─ MongoClient.connect(MONGODB_URI)
    │   └─ cache client + db (singleton)
    │
    ├─ ensureIndexes(db)
    │   └─ createIndex บน 8 collections (idempotent)
    │   └─ log error แต่ไม่ crash
    │
    ├─ initRedis()
    │   └─ new Redis(REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 3 })
    │   └─ redisClient.connect()
    │   └─ THROW + exit ถ้า fail (Redis เป็น mandatory)
    │
    ├─ app.listen(PORT)
    │
    └─ register signal handlers
        ├─ SIGTERM → graceful shutdown
        ├─ SIGINT → graceful shutdown
        ├─ uncaughtException → log + exit(1)
        └─ unhandledRejection → log only
```

**Graceful Shutdown:**
```
server.close()
    → closeRedis() (redis.quit())
    → process.exit(0)
[timeout 30s → force exit(1)]
```

---

## 3. Authentication Workflows

### 3.1 Register Flow

```
POST /api/auth/register
{user_id, name, email, password}
    │
    ├─ sanitize inputs (sanitizeString, normalizeEmail)
    ├─ validate required fields
    ├─ validatePasswordStrength() — ≥8, upper, lower, digit, special
    ├─ validate email format regex
    ├─ DB: ตรวจ user_id duplicate
    ├─ DB: ตรวจ email duplicate
    ├─ hashPassword(password, salt=12)
    ├─ generateWallet() → ethers.Wallet.createRandom()
    ├─ encryptPrivateKey(privateKey) → AES-256-CBC → {encryptedKey, iv}
    ├─ DB: insertOne(users)
    ├─ DB: insertOne(wallets)
    ├─ generateTokenPair({userId, email, role, walletAddress})
    │   ├─ accessToken (15m, JWT_SECRET)
    │   └─ refreshToken (7d, derived secret, + JTI)
    │
    ├─ Response 201: {user, tokens: {accessToken, refreshToken, expiresIn}}
    │
    └─ [async, non-blocking]
        ensureWalletHasGas(userId, address, 'register')
        └─ เติม ETH ถ้า balance < WALLET_MIN_GAS_BALANCE_ETH
```

### 3.2 Login Flow

```
POST /api/auth/login
{email, password}
    │
    ├─ normalizeEmail (lowercase + trim)
    ├─ DB: findOne(users, { email })
    ├─ comparePassword(password, user.password_hash) — bcrypt.compare()
    ├─ generateTokenPair({userId, email, role, walletAddress})
    └─ Response 200: {user, tokens}
```

### 3.3 Token Refresh Flow

```
POST /api/auth/refresh
{refreshToken}
    │
    ├─ verifyRefreshToken(refreshToken)
    │   ├─ jwt.verify(token, REFRESH_TOKEN_SECRET) → type = 'refresh'
    │   └─ Redis: EXISTS revoked:<jti> → return null ถ้าถูก revoke
    │
    ├─ DB: findOne(users, {_id: decoded.userId}) — ตรวจ user ยังมีอยู่
    │
    └─ refreshAccessToken(refreshToken, userPayload)
        ├─ Redis: SET revoked:<oldJti> '1' EX 604800 (revoke old)
        └─ generateTokenPair() — ออก token pair ใหม่
```

### 3.4 Logout Flow

```
POST /api/auth/logout
{refreshToken}
    │
    ├─ verifyRefreshToken(refreshToken) — ตรวจ validity
    └─ revokeToken(decoded.jti)
        └─ Redis: SET revoked:<jti> '1' EX 604800
```

---

## 4. Waste Management Workflow

### 4.1 Submit Waste

```
POST /api/waste/submit
multipart/form-data หรือ application/json
    │
    ├─ Multer middleware (upload.single('image'))
    ├─ sanitize: waste_type (max 80), description (max 500)
    ├─ parsePositiveNumber(weight_kg)
    │
    ├─ Image resolution:
    │   ├─ req.file (uploaded) → saveUploadedFile(file, 'waste')
    │   │   └─ UUID filename → /uploads/waste/<uuid>.ext
    │   └─ req.body.image_url → isSafeUrl() validation
    │
    ├─ DB: insertOne(waste_submissions, { status: 'pending' })
    └─ Response 201: submission
```

### 4.2 Approve Waste (Officer)

```
POST /api/waste/approve
{submission_id, coin_amount}
    │
    ├─ DB: findOne(waste_submissions, { _id: submissionId })
    ├─ ตรวจ status === 'pending'
    ├─ DB: findOne(users, { _id: submission.user_id })
    │
    ├─ Blockchain: mintCoins(user.wallet_address, coin_amount, reason)
    │   └─ officerWallet.contract.mintCoins() → wait receipt
    │
    ├─ DB: updateOne(waste_submissions, { status: 'approved', blockchain_tx_hash })
    ├─ DB: insertOne(transactions, { type: 'mint', status: 'confirmed' })
    ├─ DB: insertOne(notifications, { title: 'การส่งขยะถูกอนุมัติ!', type: 'success' })
    │
    └─ Response 200: { txHash, coin_amount }
```

---

## 5. Wallet & Token Transfer Workflow

### 5.1 Transfer WST

```
POST /api/wallet/transfer
{to_address, amount}
    │
    ├─ isValidEthereumAddress(to_address)
    ├─ ตรวจ self-transfer (to_address !== user wallet)
    │
    ├─ ensureWalletHasGas(userId, userWallet, 'wallet_transfer')  [BLOCKING]
    │   └─ see Gas Top-up Flow
    │
    ├─ getUserWalletSigner(userId)
    │   ├─ DB: findOne(wallets, { user_id })
    │   ├─ decryptPrivateKey(encrypted, iv) → AES-256-CBC decrypt
    │   └─ verify signer.address === walletDoc.address (guard)
    │
    ├─ transferCoins(signer, to_address, amount)
    │   └─ contract.transfer(to, amountInWei) → wait receipt
    │
    ├─ DB: insertOne(transactions, { type: 'transfer', status: 'confirmed' })
    └─ Response: { message: 'Transfer successful', txHash }
```

### 5.2 Gas Top-up Flow (ensureWalletHasGas)

```
ensureWalletHasGas(userId, address, trigger)
    │
    ├─ provider.getBalance(address)
    │
    ├─ ถ้า balance >= WALLET_MIN_GAS_BALANCE_ETH (default 0.0003 ETH)
    │   └─ return { funded: false }  [SKIP]
    │
    └─ ถ้า balance < threshold:
        ├─ officerWallet.sendTransaction({ to: address, value: TOP_UP_AMOUNT })
        ├─ รอ receipt.hash
        ├─ provider.getBalance(address) [balance after]
        ├─ DB: insertOne(gas_topups, {
        │       trigger, amount_eth, min_required_eth,
        │       balance_before_wei, balance_after_wei,
        │       blockchain_tx_hash, status: 'confirmed'
        │   })
        └─ return { funded: true, txHash }

Triggers:
  'register'        → non-blocking async (ไม่หยุดรอ)
  'wallet_transfer' → blocking (ต้องรอก่อนโอน)
  'reward_redeem'   → blocking (ต้องรอก่อนแลก)
```

---

## 6. Reward Redemption Workflow

```
POST /api/rewards/redeem
{reward_id}
    │
    ├─ DB: findOne(rewards, { _id: rewardId })
    ├─ ตรวจ reward.stock > 0
    │
    ├─ ensureWalletHasGas(userId, userWallet, 'reward_redeem')  [BLOCKING]
    │
    ├─ getUserWalletSigner(userId)
    ├─ getOfficerWallet()
    │
    ├─ DB: updateOne(rewards, stock: -1) [atomic reservation]
    │   └─ ถ้า stock = 0 → 400 out of stock
    │
    ├─ transferCoins(userSigner, officerWallet.address, reward.coin_price)
    │   │
    │   ├─ [SUCCESS]
    │   │   ├─ DB: insertOne(redemption_history, { status: 'pending' })
    │   │   ├─ DB: insertOne(transactions, { type: 'exchange' })
    │   │   ├─ DB: insertOne(notifications, { title: 'แลกรางวัลสำเร็จ!' })
    │   │   └─ Response 200: { reward_name, txHash }
    │   │
    │   └─ [FAIL]
    │       ├─ DB: updateOne(rewards, stock: +1) [ROLLBACK]
    │       └─ throw ApiError.internal('Failed to complete transaction')
```

---

## 7. Notification Flow

Notifications สร้างอัตโนมัติ 2 จุด:

| Event | Trigger | Title | Type |
|---|---|---|---|
| Waste approved | `POST /api/waste/approve` | `"การส่งขยะถูกอนุมัติ!"` | `success` |
| Reward redeemed | `POST /api/rewards/redeem` | `"แลกรางวัลสำเร็จ!"` | `success` |

User ดูได้ผ่าน:
- `GET /api/notifications` — list ทั้งหมด (ไม่ paginated, sort DESC)
- `PUT /api/notifications/read-all` — mark ทั้งหมดว่าอ่านแล้ว
- `PUT /api/notifications/:id/read` — mark เดียว (ตรวจ ownership)

---

## 8. Image Upload Flow

```
POST /api/waste/submit
Content-Type: multipart/form-data
    │
    ├─ Multer middleware:
    │   ├─ memory storage (buffer)
    │   ├─ fileFilter: MIME + extension check (jpeg/png/webp)
    │   └─ limit: UPLOAD_MAX_SIZE_MB MB, 1 file
    │
    └─ saveUploadedFile(file, 'waste')
        ├─ ตรวจ/สร้าง directory: {UPLOAD_DIR}/waste/
        ├─ filename = crypto.randomUUID() + extension
        ├─ fs.promises.writeFile(filePath, buffer)
        └─ return /uploads/waste/<uuid>.ext

Static serve:
    GET /uploads/* → public/uploads/ (express.static)
```

---

## 9. Officer Manual Operations

### Add Coins (Manual Mint)

```
POST /api/officer/add-coins
{user_id, amount}
    │
    ├─ DB: findOne(users, { _id: user_id })
    ├─ mintCoins(user.wallet_address, amount, reason)
    │   └─ officer wallet → contract.mintCoins()
    ├─ DB: insertOne(transactions, { type: 'mint' })
    └─ Response 201: { message, transaction }
```

### Rewards Report

```
GET /api/officer/rewards/report
    │
    ├─ DB: find(rewards, {}) → inventory (name, coin_price, stock)
    └─ DB: aggregate(redemption_history JOIN users) → history
```

---

## 10. Blockchain Integration Details

### Contract Functions Used

| Function | ใช้ใน | หมายเหตุ |
|---|---|---|
| `balanceOf(address)` | `GET /api/wallet/balance` | read-only, no gas |
| `transfer(to, amount)` | `POST /api/wallet/transfer`, `POST /api/rewards/redeem` | user signer |
| `mintCoins(to, amount, reason)` | `POST /api/waste/approve`, `POST /api/officer/add-coins` | officer signer |

### Amount Conversion

- ทุก amount ใช้ `ethers.parseEther(amount.toString())` → wei (18 decimals)
- คืนค่าด้วย `ethers.formatEther(balance)` → string

### Provider

```typescript
new ethers.JsonRpcProvider(SEPOLIA_RPC_URL)
```

สร้างใหม่ทุกครั้งที่ call (stateless) — ไม่มี singleton

---

## 11. Data Access Patterns

| Endpoint | Pattern | Index ที่ใช้ |
|---|---|---|
| `POST /api/auth/register` | findOne(email) + findOne(user_id) | `idx_users_email_unique`, `idx_users_user_id_unique` |
| `POST /api/auth/login` | findOne(email) | `idx_users_email_unique` |
| `GET /api/waste/my-submissions` | find({user_id}, sort created_at) | `idx_waste_user_date` |
| `GET /api/waste/pending` | aggregate({status:'pending'}, sort created_at) | `idx_waste_status_date` |
| `GET /api/transactions/history` | find({user_id}, sort, limit 20) | `idx_txn_user_date` |
| `GET /api/officer/transactions` | aggregate(JOIN users, sort, limit 50) | `idx_txn_user_date` |
| `GET /api/notifications` | find({user_id}, sort) | `idx_notif_user_read_date` |
| `GET /api/rewards/history` | find({user_id}, sort) | `idx_redeem_user_date` |
