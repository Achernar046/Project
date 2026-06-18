# WasteCoin Backend — API Test Report 2026-03-30

> เอกสารนี้ปรับปรุงจาก test report เดิม  
> อัปเดต: มิถุนายน 2026 — ปรับ response format ให้ตรงกับ source code จริง

## สรุปผลทดสอบ

| Module | Endpoints | ผลที่คาดหวัง |
|---|---|---|
| Auth | Register, Login, Refresh, Logout | ✅ Token pair |
| Waste | Submit, My-submissions, Pending, Approve | ✅ |
| Officer | Add-coins, Transactions, Rewards Report | ✅ |
| Wallet | Balance, Info, Transfer, Export | ✅ |
| Transactions | History | ✅ (limit 20) |
| Users | Profile, Update, Change-password, List | ✅ |
| App | Dashboard, Verify-identity, Change-password | ✅ |
| Rewards | List, Redeem, History, Add, Update, Delete | ✅ |
| Notifications | List, Read-all, Read-one | ✅ |

---

## Auth Endpoints

### POST /api/auth/register

**Request:**
```json
{
  "user_id": "65001",
  "name": "John Doe",
  "email": "john@example.com",
  "password": "Secret@123"
}
```

**Response 201:**
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
      "accessToken": "<jwt-15min>",
      "refreshToken": "<jwt-7d>",
      "expiresIn": 900000
    }
  },
  "meta": { "timestamp": "...", "path": "/register", "method": "POST" }
}
```

> **หมายเหตุ:** response คืน token pair (accessToken + refreshToken) ไม่ใช่ single token

**Error cases:**
```json
// Password อ่อนแอ (< 8 หรือขาด strength)
{ "error": { "code": "WEAK_PASSWORD", "message": "Weak password", "details": ["..."] } }

// user_id ซ้ำ
{ "error": { "code": "USER_ID_EXISTS", "message": "User ID already exists" } }

// email ซ้ำ
{ "error": { "code": "EMAIL_EXISTS", "message": "Email already exists" } }
```

---

### POST /api/auth/login

**Request:** `{"email":"john@example.com","password":"Secret@123"}`

**Response 200:**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": { "id": "...", "email": "...", "role": "user", "walletAddress": "0x..." },
    "tokens": { "accessToken": "...", "refreshToken": "...", "expiresIn": 900000 }
  },
  "meta": { ... }
}
```

**Error 401:**
```json
{ "error": { "code": "UNAUTHORIZED", "message": "Invalid email or password" } }
```

---

### POST /api/auth/refresh

**Request:** `{"refreshToken":"<refresh-token>"}`

**Response 200:** คืน token pair ใหม่ (old refresh token ถูก revoke ใน Redis)

---

### POST /api/auth/logout

**Request:** `{"refreshToken":"<refresh-token>"}`

**Response 200:** `{"success":true,"message":"Logged out successfully"}`

---

## Waste Endpoints

### POST /api/waste/submit

**Option A — File upload:**
```
Content-Type: multipart/form-data
Fields: waste_type, weight_kg, description (optional), image (JPEG/PNG/WebP)
```

**Option B — URL:**
```json
{"waste_type":"plastic","weight_kg":1.5,"description":"bottles","image_url":"https://..."}
```

**Response 201:**
```json
{
  "success": true,
  "message": "Waste submission created successfully",
  "data": {
    "id": "<objectId>",
    "waste_type": "plastic",
    "weight_kg": 1.5,
    "image_url": "/uploads/waste/<uuid>.jpg",
    "status": "pending",
    "created_at": "..."
  },
  "meta": { ... }
}
```

---

### GET /api/waste/my-submissions

**Query:** `?page=1&limit=20`

**Response 200 (paginated):**
```json
{
  "success": true,
  "data": [...],
  "pagination": { "page": 1, "limit": 20, "total": 5, "totalPages": 1, "hasNext": false, "hasPrev": false },
  "meta": { ... }
}
```

---

### POST /api/waste/approve (Officer)

**Request:** `{"submission_id":"<objectId>","coin_amount":25}`

**Response 200:**
```json
{
  "success": true,
  "message": "Submission approved and coins minted",
  "data": { "txHash": "0x...", "coin_amount": 25 },
  "meta": { ... }
}
```

---

## Wallet Endpoints (raw format)

### GET /api/wallet/balance

**Response 200:**
```json
{ "walletAddress": "0x...", "balance": "100.0", "symbol": "WST" }
```

### POST /api/wallet/transfer

**Request:** `{"to_address":"0x...","amount":5}`

**Response 200:**
```json
{ "message": "Transfer successful", "txHash": "0x..." }
```

---

## Transactions

### GET /api/transactions/history

**Response 200 (raw array, limit 20):**
```json
[
  {
    "_id": "<objectId>",
    "type": "transfer",
    "amount": 5,
    "blockchain_tx_hash": "0x...",
    "status": "confirmed",
    "created_at": "..."
  }
]
```

---

## Known Issues จากการทดสอบ

| Issue | Severity | Status |
|---|---|---|
| Password change min 6 chars (ต่างจาก register ที่ min 8) | Medium | ⚠️ ยังไม่แก้ |
| transactions/history limit 20 hardcoded (ไม่มี pagination) | Low | ⚠️ ยังไม่แก้ |
| officer/transactions limit 50 hardcoded | Low | ⚠️ ยังไม่แก้ |
| users/list ไม่ paginated | Low | ⚠️ ยังไม่แก้ |
| Response format ไม่สม่ำเสมอ (บาง routes ใช้ raw res.json()) | Low | ⚠️ Design decision |
| IP blocking ไม่ persistent (in-memory) | Low | ⚠️ ยังไม่แก้ |

---

## Test Environment

```
Node.js: ^22.x
TypeScript: ^5.8.2
Express: ^4.21.2
MongoDB: Atlas (cloud)
Redis: redis:7-alpine (Docker)
Blockchain: Ethereum Sepolia Testnet
```
