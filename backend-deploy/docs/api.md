# WasteCoin Backend API Reference

> อัปเดตล่าสุด: มิถุนายน 2026 (ตรวจสอบจาก source code จริง)

Base URL: `http://<host>:3000`

## Authentication

| Type | Header |
|---|---|
| Public | ไม่ต้องส่ง header |
| `auth` | `Authorization: Bearer <accessToken>` |
| `officer` | `Authorization: Bearer <accessToken>` (role = officer เท่านั้น) |

> Access Token อายุ **15 นาที** — ใช้ `/api/auth/refresh` เพื่อต่ออายุ

## Response Format

> **หมายเหตุ:** response format ไม่สม่ำเสมอทั้งระบบ

**Standardized** (auth, waste, rewards): มี `success`, `message`, `data`, `meta`

```json
{
  "success": true,
  "message": "...",
  "data": { ... },
  "meta": { "timestamp": "...", "path": "...", "method": "..." }
}
```

**Raw** (wallet, users, app, notifications, transactions): คืนค่าตรง

```json
{ "field": "value" }
```

**Error**:

```json
{
  "success": false,
  "message": "...",
  "error": { "code": "ERROR_CODE", "message": "...", "details": ... }
}
```

**Paginated** (waste/my-submissions, rewards/list, rewards/history, waste/pending):

```json
{
  "success": true,
  "data": [...],
  "pagination": {
    "page": 1, "limit": 20, "total": 100,
    "totalPages": 5, "hasNext": true, "hasPrev": false
  },
  "meta": { ... }
}
```

---

## Endpoint Summary

| Method | Path | Auth | หมายเหตุ |
|---|---|---|---|
| GET | `/health` | Public | Health check |
| GET | `/ready` | Public | Readiness check (ping MongoDB) |
| POST | `/api/auth/register` | Public | สมัครสมาชิก |
| POST | `/api/auth/login` | Public | เข้าสู่ระบบ |
| POST | `/api/auth/refresh` | Public | ต่ออายุ token |
| POST | `/api/auth/logout` | Public | ออกจากระบบ |
| POST | `/api/waste/submit` | `auth` | ส่งขยะ (multipart หรือ JSON) |
| GET | `/api/waste/my-submissions` | `auth` | รายการขยะของฉัน (paginated) |
| GET | `/api/waste/pending` | `officer` | รายการขยะ pending (paginated) |
| POST | `/api/waste/approve` | `officer` | อนุมัติขยะ + mint WST |
| POST | `/api/officer/add-coins` | `officer` | Mint WST ให้ user โดยตรง |
| GET | `/api/officer/transactions` | `officer` | ดู transactions ทั้งหมด (limit 50) |
| GET | `/api/officer/rewards/report` | `officer` | Report inventory + redemption |
| GET | `/api/wallet/balance` | `auth` | ยอด WST token |
| GET | `/api/wallet/info` | `auth` | ข้อมูล wallet/user |
| POST | `/api/wallet/transfer` | `auth` | โอน WST |
| GET | `/api/wallet/export` | `auth` | Export private key (ต้อง enable) |
| GET | `/api/transactions/history` | `auth` | ประวัติ transaction (limit 20) |
| GET | `/api/users/profile` | `auth` | โปรไฟล์ + stats |
| PUT | `/api/users/profile` | `auth` | แก้ไขโปรไฟล์ |
| POST | `/api/users/change-password` | `auth` | เปลี่ยนรหัสผ่าน |
| GET | `/api/users/list` | `officer` | รายชื่อ users ทั้งหมด |
| GET | `/api/app/dashboard` | `auth` | Dashboard (profile + 5 txns) |
| POST | `/api/app/verify-identity` | `auth` | ยืนยัน password |
| POST | `/api/app/change-password` | `auth` | เปลี่ยนรหัสผ่าน (app version) |
| GET | `/api/rewards/list` | `auth` | รายการรางวัล (paginated) |
| POST | `/api/rewards/redeem` | `auth` | แลกรางวัล |
| GET | `/api/rewards/history` | `auth` | ประวัติการแลก (paginated) |
| POST | `/api/rewards/add` | `officer` | เพิ่มรางวัล |
| PUT | `/api/rewards/update/:id` | `officer` | แก้ไขรางวัล |
| DELETE | `/api/rewards/delete/:id` | `officer` | ลบรางวัล |
| GET | `/api/notifications` | `auth` | รายการแจ้งเตือน |
| PUT | `/api/notifications/read-all` | `auth` | อ่านทั้งหมด |
| PUT | `/api/notifications/:id/read` | `auth` | อ่านแจ้งเตือนเดียว |

---

## Health & Readiness

### GET /health

- Auth: Public

Response `200`:
```json
{
  "status": "ok",
  "environment": "production",
  "message": "WasteCoin Backend is running",
  "timestamp": "2026-06-17T05:00:00.000Z"
}
```

```bash
curl http://<host>:3000/health
```

---

### GET /ready

- Auth: Public
- Pings MongoDB — คืน 503 ถ้า DB ไม่พร้อม

Response `200`:
```json
{ "status": "ready", "database": "ok", "timestamp": "..." }
```

Response `503`:
```json
{ "status": "not_ready", "database": "error", "error": "...", "timestamp": "..." }
```

---

## Auth

### POST /api/auth/register

- Auth: Public
- Rate limit: **10 req / 15 min** (authLimiter)
- Success: `201`
- Errors: `400`, `409`

**Password requirements:** ≥8 ตัว, uppercase, lowercase, digit, special char

Request `application/json`:
```json
{
  "user_id": "65001",
  "name": "John Doe",
  "email": "john@example.com",
  "password": "Secret@123"
}
```

> หมายเหตุ: `role` ไม่รับจาก request — ระบบกำหนดเป็น `"user"` อัตโนมัติ

Response `201`:
```json
{
  "success": true,
  "message": "User registered successfully",
  "data": {
    "user": {
      "id": "<objectId>",
      "userId": "65001",
      "name": "John Doe",
      "email": "john@example.com",
      "role": "user",
      "walletAddress": "0x..."
    },
    "tokens": {
      "accessToken": "<jwt>",
      "refreshToken": "<jwt>",
      "expiresIn": 900000
    }
  },
  "meta": { "timestamp": "...", "path": "/register", "method": "POST" }
}
```

Errors:
```json
{ "error": { "code": "BAD_REQUEST", "message": "User ID, Name, Email and Password are required" } }
{ "error": { "code": "WEAK_PASSWORD", "message": "Weak password", "details": ["Password must be at least 8 characters long", ...] } }
{ "error": { "code": "USER_ID_EXISTS", "message": "User ID already exists" } }
{ "error": { "code": "EMAIL_EXISTS", "message": "Email already exists" } }
```

```bash
curl -X POST http://<host>:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"user_id":"65001","name":"John Doe","email":"john@example.com","password":"Secret@123"}'
```

---

### POST /api/auth/login

- Auth: Public
- Rate limit: **10 req / 15 min**
- Success: `200`
- Errors: `400`, `401`

Request:
```json
{ "email": "john@example.com", "password": "Secret@123" }
```

Response `200`:
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": {
      "id": "<objectId>",
      "email": "john@example.com",
      "role": "user",
      "walletAddress": "0x..."
    },
    "tokens": {
      "accessToken": "<jwt>",
      "refreshToken": "<jwt>",
      "expiresIn": 900000
    }
  },
  "meta": { ... }
}
```

Errors:
```json
{ "error": { "code": "BAD_REQUEST", "message": "Email and password are required" } }
{ "error": { "code": "UNAUTHORIZED", "message": "Invalid email or password" } }
```

```bash
curl -X POST http://<host>:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"john@example.com","password":"Secret@123"}'
```

---

### POST /api/auth/refresh

- Auth: Public (ส่ง refreshToken ใน body)
- Success: `200`
- Errors: `400`, `401`

Request:
```json
{ "refreshToken": "<refreshToken>" }
```

Response `200`:
```json
{
  "success": true,
  "message": "Token refreshed successfully",
  "data": {
    "tokens": {
      "accessToken": "<new-jwt>",
      "refreshToken": "<new-jwt>",
      "expiresIn": 900000
    }
  },
  "meta": { ... }
}
```

> ระบบ revoke old refresh token ใน Redis อัตโนมัติ และออก token pair ใหม่

```bash
curl -X POST http://<host>:3000/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"<refreshToken>"}'
```

---

### POST /api/auth/logout

- Auth: Public (ส่ง refreshToken ใน body — optional)
- Success: `200`

Request:
```json
{ "refreshToken": "<refreshToken>" }
```

Response `200`:
```json
{
  "success": true,
  "message": "Logged out successfully",
  "data": null,
  "meta": { ... }
}
```

> ถ้าส่ง refreshToken — JTI จะถูก revoke ใน Redis (TTL 7 วัน)

```bash
curl -X POST http://<host>:3000/api/auth/logout \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"<refreshToken>"}'
```

---

## Waste

### POST /api/waste/submit

- Auth: `auth`
- Content-Type: `multipart/form-data` หรือ `application/json`
- Success: `201`
- Errors: `400`, `401`, `415`

**Option A — Upload image file** (multipart/form-data):

| Field | Type | Required | หมายเหตุ |
|---|---|---|---|
| `waste_type` | string | ✅ | max 80 chars |
| `weight_kg` | number | ✅ | > 0 |
| `description` | string | ❌ | max 500 chars |
| `image` | file | ❌ | JPEG/PNG/WebP, max `UPLOAD_MAX_SIZE_MB` MB |

**Option B — ส่ง URL** (application/json):

```json
{
  "waste_type": "plastic",
  "weight_kg": 1.5,
  "description": "bottles",
  "image_url": "https://example.com/img.jpg"
}
```

> `image_url` ต้องผ่าน safe URL check (block localhost, private IPs, cloud metadata)

Response `201`:
```json
{
  "success": true,
  "message": "Waste submission created successfully",
  "data": {
    "id": "<objectId>",
    "user_id": "<objectId>",
    "waste_type": "plastic",
    "weight_kg": 1.5,
    "description": "bottles",
    "image_url": "/uploads/waste/<uuid>.jpg",
    "status": "pending",
    "created_at": "<date>",
    "updated_at": "<date>"
  },
  "meta": { ... }
}
```

```bash
# Upload file
curl -X POST http://<host>:3000/api/waste/submit \
  -H "Authorization: Bearer <jwt>" \
  -F "waste_type=plastic" -F "weight_kg=1.5" -F "image=@/path/to/photo.jpg"

# JSON with URL
curl -X POST http://<host>:3000/api/waste/submit \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{"waste_type":"plastic","weight_kg":1.5,"image_url":"https://example.com/img.jpg"}'
```

---

### GET /api/waste/my-submissions

- Auth: `auth`
- Query: `?page=1&limit=20`
- Response: Paginated

Response `200`:
```json
{
  "success": true,
  "data": [
    {
      "id": "<objectId>",
      "user_id": "<objectId>",
      "waste_type": "plastic",
      "weight_kg": 1.5,
      "status": "pending",
      "created_at": "<date>",
      "updated_at": "<date>"
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 5, "totalPages": 1, "hasNext": false, "hasPrev": false },
  "meta": { ... }
}
```

```bash
curl http://<host>:3000/api/waste/my-submissions \
  -H "Authorization: Bearer <jwt>"
```

---

### GET /api/waste/pending

- Auth: `officer`
- Query: `?page=1&limit=20`
- Response: Paginated (ข้อมูล user แนบมาด้วย)
- Errors: `401`, `403`

Response `200`:
```json
{
  "success": true,
  "data": [
    {
      "_id": "<objectId>",
      "user_id": "<objectId>",
      "waste_type": "plastic",
      "weight_kg": 1.5,
      "status": "pending",
      "user": {
        "_id": "<objectId>",
        "user_id": "65001",
        "name": "John Doe",
        "email": "john@example.com",
        "role": "user",
        "wallet_address": "0x..."
      }
    }
  ],
  "pagination": { ... },
  "meta": { ... }
}
```

```bash
curl http://<host>:3000/api/waste/pending \
  -H "Authorization: Bearer <officer-jwt>"
```

---

### POST /api/waste/approve

- Auth: `officer`
- Success: `200`
- Errors: `400`, `401`, `403`, `404`

Request:
```json
{ "submission_id": "<objectId>", "coin_amount": 25 }
```

Response `200`:
```json
{
  "success": true,
  "message": "Submission approved and coins minted",
  "data": { "txHash": "0x...", "coin_amount": 25 },
  "meta": { ... }
}
```

Errors:
```json
{ "error": { "code": "BAD_REQUEST", "message": "Submission ID and coin amount are required" } }
{ "error": { "code": "NOT_FOUND", "message": "Submission not found" } }
{ "error": { "code": "BAD_REQUEST", "message": "Submission already processed" } }
```

```bash
curl -X POST http://<host>:3000/api/waste/approve \
  -H "Authorization: Bearer <officer-jwt>" \
  -H "Content-Type: application/json" \
  -d '{"submission_id":"<objectId>","coin_amount":25}'
```

---

## Officer

### POST /api/officer/add-coins

- Auth: `officer`
- Success: `201`
- Errors: `400`, `401`, `403`, `404`

Request:
```json
{ "user_id": "<objectId>", "amount": 100 }
```

Response `201` (raw format):
```json
{
  "message": "Coins added successfully",
  "transaction": {
    "id": "<objectId>",
    "amount": 100,
    "user": "john@example.com",
    "walletAddress": "0x...",
    "txHash": "0x..."
  }
}
```

```bash
curl -X POST http://<host>:3000/api/officer/add-coins \
  -H "Authorization: Bearer <officer-jwt>" \
  -H "Content-Type: application/json" \
  -d '{"user_id":"<objectId>","amount":100}'
```

---

### GET /api/officer/transactions

- Auth: `officer`
- **limit 50 (hardcoded)** — ไม่ paginated
- Response: raw array

Response `200`:
```json
[
  {
    "_id": "<objectId>",
    "user_id": "<objectId>",
    "type": "mint",
    "amount": 100,
    "to_address": "0x...",
    "blockchain_tx_hash": "0x...",
    "status": "confirmed",
    "created_at": "<date>",
    "user": {
      "_id": "<objectId>",
      "user_id": "65001",
      "name": "John Doe",
      "email": "john@example.com",
      "role": "user",
      "wallet_address": "0x..."
    }
  }
]
```

```bash
curl http://<host>:3000/api/officer/transactions \
  -H "Authorization: Bearer <officer-jwt>"
```

---

### GET /api/officer/rewards/report

- Auth: `officer`
- Response: raw JSON

Response `200`:
```json
{
  "inventory": [
    { "_id": "<objectId>", "name": "Reward A", "coin_price": 10, "stock": 5 }
  ],
  "history": [
    {
      "_id": "<objectId>",
      "user_id": "<objectId>",
      "user_name": "John Doe",
      "reward_name": "Reward A",
      "created_at": "<date>",
      "status": "pending"
    }
  ]
}
```

```bash
curl http://<host>:3000/api/officer/rewards/report \
  -H "Authorization: Bearer <officer-jwt>"
```

---

## Wallet

> Wallet routes ใช้ **raw `res.json()`** — ไม่ใช้ standardized response

### GET /api/wallet/balance

- Auth: `auth`

Response `200`:
```json
{ "walletAddress": "0x...", "balance": "100.0", "symbol": "WST" }
```

```bash
curl http://<host>:3000/api/wallet/balance \
  -H "Authorization: Bearer <jwt>"
```

---

### GET /api/wallet/info

- Auth: `auth`
- Errors: `401`, `404`

Response `200`:
```json
{
  "userId": "65001",
  "name": "John Doe",
  "email": "john@example.com",
  "role": "user",
  "walletAddress": "0x..."
}
```

```bash
curl http://<host>:3000/api/wallet/info \
  -H "Authorization: Bearer <jwt>"
```

---

### POST /api/wallet/transfer

- Auth: `auth`
- Errors: `400`, `401`, `500`

Request:
```json
{ "to_address": "0xabc...", "amount": 5 }
```

Response `200`:
```json
{ "message": "Transfer successful", "txHash": "0x..." }
```

Errors:
```json
{ "error": "Recipient address and amount are required" }
{ "error": "Invalid recipient wallet address" }
{ "error": "Cannot transfer to the same wallet address" }
{ "error": "Transfer failed" }
```

```bash
curl -X POST http://<host>:3000/api/wallet/transfer \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{"to_address":"0xabc...","amount":5}'
```

---

### GET /api/wallet/export

- Auth: `auth`
- ต้องเปิด `ENABLE_WALLET_EXPORT=true` ใน env
- Errors: `401`, `403`, `404`

Response `200`:
```json
{
  "address": "0x...",
  "privateKey": "0x...",
  "warning": "NEVER share your private key with anyone!"
}
```

Response `403` (disabled):
```json
{ "error": "Wallet export is disabled" }
```

```bash
curl http://<host>:3000/api/wallet/export \
  -H "Authorization: Bearer <jwt>"
```

---

## Transactions

### GET /api/transactions/history

- Auth: `auth`
- **limit 20 (hardcoded)** — ไม่ paginated
- Response: raw array

Response `200`:
```json
[
  {
    "_id": "<objectId>",
    "user_id": "<objectId>",
    "type": "transfer",
    "amount": 5,
    "to_address": "0x...",
    "blockchain_tx_hash": "0x...",
    "status": "confirmed",
    "created_at": "<date>"
  }
]
```

```bash
curl http://<host>:3000/api/transactions/history \
  -H "Authorization: Bearer <jwt>"
```

---

## Users

> Users routes ใช้ **raw `res.json()`**

### GET /api/users/profile

- Auth: `auth`
- Errors: `401`, `404`
- ไม่คืน `password_hash`

Response `200`:
```json
{
  "_id": "<objectId>",
  "user_id": "65001",
  "name": "John Doe",
  "email": "john@example.com",
  "role": "user",
  "wallet_address": "0x...",
  "profile_image": "https://...",
  "phone_number": "0812345678",
  "created_at": "<date>",
  "updated_at": "<date>",
  "stats": {
    "total_submissions": 3,
    "approved_submissions": 2,
    "total_coins_earned": 50
  }
}
```

```bash
curl http://<host>:3000/api/users/profile \
  -H "Authorization: Bearer <jwt>"
```

---

### PUT /api/users/profile

- Auth: `auth`
- Errors: `401`, `404`

Request (partial — ส่งเฉพาะ field ที่ต้องการแก้):
```json
{ "name": "John D", "profile_image": "https://...", "phone_number": "0812345678" }
```

Response `200`:
```json
{ "message": "Profile updated successfully" }
```

```bash
curl -X PUT http://<host>:3000/api/users/profile \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{"name":"John D","phone_number":"0812345678"}'
```

---

### POST /api/users/change-password

- Auth: `auth`
- Errors: `400`, `401`, `404`
- ⚠️ min 6 chars เท่านั้น (ไม่มี strength check เหมือน register)

Request:
```json
{ "currentPassword": "OldPass@1", "newPassword": "NewPass1" }
```

Response `200`:
```json
{ "message": "Password changed successfully" }
```

Errors:
```json
{ "error": "Current and new password are required" }
{ "error": "New password must be at least 6 characters" }
{ "error": "Invalid current password" }
```

```bash
curl -X POST http://<host>:3000/api/users/change-password \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{"currentPassword":"OldPass@1","newPassword":"NewPass1"}'
```

---

### GET /api/users/list

- Auth: `officer`
- คืนเฉพาะ role=user — ไม่คืน officer
- ไม่ paginated — sort by created_at DESC

Response `200` (raw array):
```json
[
  {
    "_id": "<objectId>",
    "user_id": "65001",
    "name": "John Doe",
    "email": "john@example.com",
    "role": "user",
    "wallet_address": "0x...",
    "created_at": "<date>",
    "updated_at": "<date>"
  }
]
```

```bash
curl http://<host>:3000/api/users/list \
  -H "Authorization: Bearer <officer-jwt>"
```

---

## App

> App routes ใช้ **raw `res.json()`**

### GET /api/app/dashboard

- Auth: `auth`
- Errors: `401`, `404`
- คืน profile + wallet + 5 recent transactions

Response `200`:
```json
{
  "profile": {
    "userId": "65001",
    "name": "John Doe",
    "email": "john@example.com",
    "role": "user",
    "walletAddress": "0x..."
  },
  "wallet": {
    "address": "0x...",
    "createdAt": "<date>"
  },
  "recentTransactions": [
    { "_id": "<objectId>", "type": "mint", "amount": 25, "blockchain_tx_hash": "0x...", "status": "confirmed", "created_at": "<date>" }
  ]
}
```

```bash
curl http://<host>:3000/api/app/dashboard \
  -H "Authorization: Bearer <jwt>"
```

---

### POST /api/app/verify-identity

- Auth: `auth`
- Errors: `400`, `401`, `404`

Request:
```json
{ "password": "Secret@123" }
```

Response `200`:
```json
{ "message": "Identity verified successfully", "verified": true }
```

Errors:
```json
{ "error": "Password is required" }
{ "error": "Invalid password" }
```

```bash
curl -X POST http://<host>:3000/api/app/verify-identity \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{"password":"Secret@123"}'
```

---

### POST /api/app/change-password

- Auth: `auth`
- Errors: `400`, `401`, `404`
- ⚠️ min 6 chars เท่านั้น

Request:
```json
{ "old_password": "OldPass@1", "new_password": "NewPass1" }
```

Response `200`:
```json
{ "message": "Password updated successfully" }
```

Errors:
```json
{ "error": "old_password and new_password are required" }
{ "error": "New password must be at least 6 characters" }
{ "error": "Invalid old password" }
```

```bash
curl -X POST http://<host>:3000/api/app/change-password \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{"old_password":"OldPass@1","new_password":"NewPass1"}'
```

---

## Rewards

### GET /api/rewards/list

- Auth: `auth`
- Query: `?page=1&limit=20&category=<category>`
- คืนเฉพาะ stock > 0

Response `200` (paginated):
```json
{
  "success": true,
  "data": [
    {
      "id": "<objectId>",
      "_id": "<objectId>",
      "name": "Reward A",
      "description": "...",
      "image_url": "https://...",
      "coin_price": 10,
      "stock": 5,
      "category": "food",
      "created_at": "<date>",
      "updated_at": "<date>"
    }
  ],
  "pagination": { ... },
  "meta": { ... }
}
```

```bash
curl "http://<host>:3000/api/rewards/list?page=1&limit=20&category=food" \
  -H "Authorization: Bearer <jwt>"
```

---

### POST /api/rewards/redeem

- Auth: `auth`
- Errors: `400`, `401`, `404`, `500`
- ใช้ optimistic stock: reserve → transfer → rollback ถ้า fail

Request:
```json
{ "reward_id": "<objectId>" }
```

Response `200`:
```json
{
  "success": true,
  "message": "Redemption successful",
  "data": { "reward_name": "Reward A", "txHash": "0x..." },
  "meta": { ... }
}
```

Errors:
```json
{ "error": { "code": "NOT_FOUND", "message": "Reward not found" } }
{ "error": { "code": "BAD_REQUEST", "message": "Reward out of stock" } }
{ "error": { "code": "INTERNAL_ERROR", "message": "Failed to complete transaction" } }
```

```bash
curl -X POST http://<host>:3000/api/rewards/redeem \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{"reward_id":"<objectId>"}'
```

---

### GET /api/rewards/history

- Auth: `auth`
- Query: `?page=1&limit=20`

Response `200` (paginated):
```json
{
  "success": true,
  "data": [
    {
      "id": "<objectId>",
      "user_id": "<objectId>",
      "reward_id": "<objectId>",
      "reward_name": "Reward A",
      "coin_price": 10,
      "status": "pending",
      "blockchain_tx_hash": "0x...",
      "created_at": "<date>",
      "updated_at": "<date>"
    }
  ],
  "pagination": { ... },
  "meta": { ... }
}
```

```bash
curl http://<host>:3000/api/rewards/history \
  -H "Authorization: Bearer <jwt>"
```

---

### POST /api/rewards/add

- Auth: `officer`
- Success: `201`
- Errors: `400`, `401`, `403`

Request:
```json
{
  "name": "Reward A",
  "description": "...",
  "image_url": "https://example.com/img.png",
  "coin_price": 10,
  "stock": 5,
  "category": "food"
}
```

| Field | Required | หมายเหตุ |
|---|---|---|
| `name` | ✅ | max 120 chars |
| `coin_price` | ✅ | > 0 |
| `stock` | ✅ | ≥ 0 (integer) |
| `description` | ❌ | max 1000 chars |
| `image_url` | ❌ | ต้องผ่าน isSafeUrl() |
| `category` | ❌ | max 80 chars |

Response `201`:
```json
{
  "success": true,
  "message": "Reward added successfully",
  "data": {
    "id": "<objectId>",
    "name": "Reward A",
    "description": "...",
    "image_url": "https://...",
    "coin_price": 10,
    "stock": 5,
    "category": "food",
    "created_at": "<date>",
    "updated_at": "<date>"
  },
  "meta": { ... }
}
```

```bash
curl -X POST http://<host>:3000/api/rewards/add \
  -H "Authorization: Bearer <officer-jwt>" \
  -H "Content-Type: application/json" \
  -d '{"name":"Reward A","coin_price":10,"stock":5}'
```

---

### PUT /api/rewards/update/:id

- Auth: `officer`
- Errors: `400`, `401`, `403`, `404`
- Partial update — ส่งเฉพาะ field ที่ต้องการแก้

Request (ตัวอย่าง):
```json
{ "stock": 10, "coin_price": 15, "name": "Reward B" }
```

Response `200`:
```json
{
  "success": true,
  "message": "Reward updated successfully",
  "data": null,
  "meta": { ... }
}
```

```bash
curl -X PUT http://<host>:3000/api/rewards/update/<id> \
  -H "Authorization: Bearer <officer-jwt>" \
  -H "Content-Type: application/json" \
  -d '{"stock":10,"coin_price":15}'
```

---

### DELETE /api/rewards/delete/:id

- Auth: `officer`
- Errors: `400`, `401`, `403`, `404`

Response `200`:
```json
{
  "success": true,
  "message": "Reward deleted successfully",
  "data": null,
  "meta": { ... }
}
```

```bash
curl -X DELETE http://<host>:3000/api/rewards/delete/<id> \
  -H "Authorization: Bearer <officer-jwt>"
```

---

## Notifications

> Notifications routes ใช้ **raw `res.json()`** — ไม่ paginated

### GET /api/notifications

- Auth: `auth`
- Sort: created_at DESC

Response `200` (raw array):
```json
[
  {
    "_id": "<objectId>",
    "user_id": "<objectId>",
    "title": "การส่งขยะถูกอนุมัติ!",
    "message": "ขยะ plastic ของคุณได้รับการตรวจสอบแล้ว และคุณได้รับ 25 WST",
    "type": "success",
    "is_read": false,
    "created_at": "<date>"
  }
]
```

**Notification triggers:**
- Officer อนุมัติ waste submission → `"การส่งขยะถูกอนุมัติ!"` (type: success)
- User แลกรางวัลสำเร็จ → `"แลกรางวัลสำเร็จ!"` (type: success)

```bash
curl http://<host>:3000/api/notifications \
  -H "Authorization: Bearer <jwt>"
```

---

### PUT /api/notifications/read-all

- Auth: `auth`

Response `200`:
```json
{ "message": "All notifications marked as read" }
```

```bash
curl -X PUT http://<host>:3000/api/notifications/read-all \
  -H "Authorization: Bearer <jwt>"
```

---

### PUT /api/notifications/:id/read

- Auth: `auth`
- Errors: `400`, `404`
- ตรวจ ownership (ต้องเป็น notification ของ user นั้น)

Response `200`:
```json
{ "message": "Notification marked as read" }
```

Errors:
```json
{ "error": "Invalid notification ID" }
{ "error": "Notification not found" }
```

```bash
curl -X PUT http://<host>:3000/api/notifications/<id>/read \
  -H "Authorization: Bearer <jwt>"
```

---

## Error Codes Reference

| Code | HTTP | Description |
|---|---|---|
| `BAD_REQUEST` | 400 | Input validation failed |
| `WEAK_PASSWORD` | 400 | Password ไม่ผ่าน strength check |
| `VALIDATION_ERROR` | 400 | express-validator ไม่ผ่าน |
| `PARSE_ERROR` | 400 | JSON parse failed |
| `PAYLOAD_TOO_LARGE` | 413 | Body > 100KB |
| `UPLOAD_ERROR` | 400 | Multer file upload error |
| `UNAUTHORIZED` | 401 | ไม่มี token / token ไม่ถูกต้อง |
| `INVALID_TOKEN` | 401 | JWT signature invalid |
| `TOKEN_EXPIRED` | 401 | JWT หมดอายุ |
| `FORBIDDEN` | 403 | ไม่มีสิทธิ์ (ไม่ใช่ officer) |
| `UNSUPPORTED_MEDIA_TYPE` | 415 | Content-Type ไม่ใช่ application/json |
| `NOT_FOUND` | 404 | Resource ไม่พบ |
| `CONFLICT` / `USER_ID_EXISTS` / `EMAIL_EXISTS` | 409 | Duplicate |
| `RATE_LIMIT_EXCEEDED` | 429 | Rate limit เกิน |
| `IP_BLOCKED` | 403 | IP ถูก block |
| `INTERNAL_ERROR` | 500 | Server error |
| `DUPLICATE_KEY` | 409 | MongoDB duplicate key |

---

## Rate Limits

| Target | Limit | Window |
|---|---|---|
| ทุก request (General) | 100 req | 15 นาที |
| `/api/auth/*` | 10 req | 15 นาที |
| `/api/*` | 200 req | 15 นาที |

> Rate limit มี `standardHeaders: true` — ดู `X-RateLimit-*` headers ใน response
