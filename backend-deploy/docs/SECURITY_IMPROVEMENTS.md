# WasteCoin Backend — Security Improvements

> อัปเดตล่าสุด: มิถุนายน 2026 (ตรวจสอบจาก source code จริง)

## ภาพรวม

เอกสารนี้สรุปมาตรการความปลอดภัยที่ implement ใน WasteCoin Backend ครอบคลุม 5 layers ตั้งแต่ระดับ Network จนถึง Application

---

## 5-Layer Security Architecture

```
Layer 1 — CORS (Network)
Layer 2 — Helmet (HTTP Headers)
Layer 3 — Rate Limiting (DDoS/Brute-force)
Layer 4 — JWT + RBAC + Sanitization (Application)
Layer 5 — Redis Token Revocation (Session Management)
```

middleware stack ลำดับจาก `src/index.ts`:

```
cors() → createSecurityMiddleware() → generalLimiter → authLimiter (/api/auth) → apiLimiter (/api) → body parser → routes
```

และใน `createSecurityMiddleware()` (src/lib/security.ts):

```
securityHeadersMiddleware (Helmet) → rateLimitHeadersMiddleware → sanitizeRequestMiddleware → ipBlockMiddleware → requestLoggingMiddleware → contentTypeValidationMiddleware
```

---

## Layer 1 — CORS

**File:** `src/index.ts`

| Environment | พฤติกรรม |
|---|---|
| Development | ยอมรับทุก origin รวม requests ไม่มี Origin header |
| Production | ยอมรับเฉพาะ origins ใน `CORS_ORIGIN` env (comma-separated) |

```typescript
// Production: block unknown origins
if (!config.isProduction || config.corsOrigins.includes(origin)) {
    return callback(null, true);
}
// else: callback(new Error('Not allowed by CORS'))
```

- `credentials: config.isProduction` — ส่ง cookies เฉพาะ production
- `optionsSuccessStatus: 200` — รองรับ browser บางรุ่น

---

## Layer 2 — HTTP Security Headers (Helmet)

**File:** `src/lib/security.ts` → `securityHeadersMiddleware()`

| Header | ค่า | ผล |
|---|---|---|
| `Content-Security-Policy` | `defaultSrc 'self'`, script/style/font/media 'self', img 'self' data: https: | ป้องกัน XSS injection |
| `Cross-Origin-Embedder-Policy` | `require-corp` | ป้องกัน side-channel |
| `Cross-Origin-Opener-Policy` | `same-origin` | isolate browsing context |
| `Cross-Origin-Resource-Policy` | `same-site` | ป้องกัน cross-site reads |
| `DNS-Prefetch-Control` | `off` | ลด DNS leakage |
| `X-Frame-Options` | `DENY` | ป้องกัน Clickjacking |
| `X-Powered-By` | ซ่อน | ไม่เปิดเผย technology stack |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains; preload` | บังคับ HTTPS 1 ปี |
| `X-IE-Open` | `noopen` | ป้องกัน IE file download |
| `X-Content-Type-Options` | `nosniff` | ป้องกัน MIME sniffing |
| `Origin-Agent-Cluster` | `?1` | process isolation |
| `X-Permitted-Cross-Domain-Policies` | `none` | ป้องกัน Flash/PDF policy |
| `Referrer-Policy` | `no-referrer` | ไม่ส่ง referrer |
| `X-XSS-Protection` | `1; mode=block` | XSS filter (legacy) |
| `Permissions-Policy` | `geolocation=(), microphone=(), camera=()` | disable sensors |

---

## Layer 3 — Rate Limiting

**File:** `src/index.ts` — ใช้ `express-rate-limit` ^8.3.2

| Limiter | Target | Max | Window |
|---|---|---|---|
| `generalLimiter` | ทุก request | 100 req | 15 นาที |
| `authLimiter` | `/api/auth/*` | 10 req | 15 นาที |
| `apiLimiter` | `/api/*` | 200 req | 15 นาที |

```
Request → generalLimiter (100) → [/api/auth] authLimiter (10) → [/api] apiLimiter (200)
```

- `standardHeaders: true` — return `X-RateLimit-*` headers
- `legacyHeaders: false` — ไม่ใช้ `X-RateLimit-*` แบบเก่า
- Rate limit response format:
  ```json
  {"success":false,"message":"Too many requests","error":{"code":"RATE_LIMIT_EXCEEDED","message":"..."}}
  ```

> **หมายเหตุ:** `src/lib/rate-limit.ts` มี custom in-memory rate limiter แต่ **ไม่ถูกใช้** ใน `index.ts` จริง — ใช้ `express-rate-limit` แทน

---

## Layer 4 — Application Security

### 4.1 Input Sanitization

**File:** `src/lib/security.ts` → `sanitizeRequestMiddleware()`

ทำงาน recursive บน `req.query` และ `req.body`:

```typescript
.replace(/<script\b/gi, '')
.replace(/<\/script>/gi, '')
.replace(/javascript:/gi, '')
.replace(/on\w+=/gi, '')
.trim()
```

### 4.2 Content-Type Validation

**File:** `src/lib/security.ts` → `contentTypeValidationMiddleware()`

- GET/HEAD/OPTIONS: ไม่ตรวจ
- `multipart/form-data`: skip (file upload)
- อื่นๆ: ต้องเป็น `application/json` มิฉะนั้นคืน 415

```json
{ "success": false, "message": "Unsupported Media Type. Content-Type must be application/json",
  "error": { "code": "UNSUPPORTED_MEDIA_TYPE", "message": "..." } }
```

### 4.3 Body Size Limit

```typescript
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));
```

Error: `{ "error": { "code": "PAYLOAD_TOO_LARGE", "message": "Payload too large" } }`

### 4.4 IP Blocking

**File:** `src/lib/security.ts` → `ipBlockMiddleware()`

- In-memory `Set<string>` blockedIPs
- `blockIP(ip)` / `unblockIP(ip)` functions (internal use)
- ⚠️ In-memory เท่านั้น — หาย เมื่อ server restart

```json
{ "success": false, "message": "Access denied", "error": { "code": "IP_BLOCKED", "message": "Your IP has been blocked" } }
```

### 4.5 Request Logging

**File:** `src/lib/security.ts` → `requestLoggingMiddleware()`

บันทึกทุก request เมื่อ response finish: `method`, `path`, `status`, `duration`, `ip`

### 4.6 URL Safety Validation

**File:** `src/lib/validation.ts` → `isSafeUrl()`

Block:
- non-HTTP/HTTPS protocols
- `localhost`, `127.0.0.1`, `0.0.0.0`
- `169.254.169.254` (AWS metadata)
- `metadata.google.internal` (GCP metadata)
- Private IP ranges: `10.x.x.x`, `172.16-31.x.x`, `192.168.x.x`, `127.x.x.x`, `169.254.x.x`

ใช้ใน:
- `POST /api/waste/submit` → image_url
- `POST /api/rewards/add`, `PUT /api/rewards/update/:id` → image_url

---

## Layer 5 — JWT + Redis Token Revocation

**Files:** `src/lib/auth.ts`, `src/lib/redis.ts`, `src/lib/auth-middleware.ts`

### JWT Token Architecture

| Token | Expires | Secret | ข้อมูลใน payload |
|---|---|---|---|
| Access Token | 15 นาที | `JWT_SECRET` | userId, email, role, walletAddress, type='access' |
| Refresh Token | 7 วัน | `SHA-256(JWT_SECRET + ENCRYPTION_SECRET)` | userId, jti (unique ID), type='refresh' |

### Token Revocation (Redis)

```typescript
// Revoke token
await client.set(`revoked:${jti}`, '1', 'EX', 604800); // 7 days TTL

// Check revocation
const result = await client.exists(`revoked:${jti}`);
return result === 1;
```

**Redis config:**
- `lazyConnect: true`
- `maxRetriesPerRequest: 3`
- Retry strategy: exponential backoff (max 5 retries, 200ms-2000ms delay)
- หลัง 5 retries: `return null` (ยอมแพ้)

**Triggers:**
- `/api/auth/logout` — revoke JTI ทันที
- `/api/auth/refresh` — revoke old JTI แล้วออก token pair ใหม่

### authMiddleware (src/lib/auth-middleware.ts)

```
1. ตรวจ Authorization header (Bearer <token>)
2. verifyAccessToken() — ตรวจ JWT signature + type='access'
3. ตรวจ ObjectId validity ของ userId ใน payload
4. query users collection — ตรวจว่า user ยังมีอยู่จริง
5. attach req.user = { userId, email, role, walletAddress }
```

> **หมายเหตุ:** authMiddleware ทำ MongoDB query **ทุก request** — ป้องกันกรณีลบ user แล้วยัง token ยังใช้งานได้

### officerMiddleware

```
authMiddleware → ตรวจ req.user.role === 'officer'
→ 403 Forbidden ถ้าไม่ใช่
```

---

## Password Security

**File:** `src/lib/auth.ts` → `validatePasswordStrength()`

### Register (`POST /api/auth/register`)

ต้องครบทุกข้อ:
- ≥ 8 ตัวอักษร
- มีตัวพิมพ์ใหญ่ (A-Z)
- มีตัวพิมพ์เล็ก (a-z)
- มีตัวเลข (0-9)
- มีอักขระพิเศษ `!@#$%^&*(),.?":{}<>`

bcrypt salt rounds: **12** (ปลอดภัยกว่า default 10)

### Change Password APIs

> ⚠️ **ความไม่สม่ำเสมอ:** password change endpoints มีมาตรฐานต่างกัน

| Endpoint | Validation |
|---|---|
| `POST /api/auth/register` | strength check ครบ (≥8 + upper/lower/digit/special) |
| `POST /api/users/change-password` | min 6 chars เท่านั้น |
| `POST /api/app/change-password` | min 6 chars เท่านั้น |

---

## Wallet Key Security

**File:** `src/lib/wallet.ts`

```
Private Key → AES-256-CBC encrypt → {encryptedKey, iv} → MongoDB wallets collection

Encryption key = SHA-256(ENCRYPTION_SECRET) → 32 bytes
IV = crypto.randomBytes(16) per wallet (unique per key)
```

**Decryption guard (getUserWalletSigner):**
```typescript
if (signer.address.toLowerCase() !== walletDoc.address.toLowerCase()) {
    throw new Error('Stored wallet key does not match wallet address');
}
```

**Export:** ต้อง `ENABLE_WALLET_EXPORT=true` — disable by default

---

## File Upload Security

**File:** `src/lib/upload.ts`

| Control | ค่า |
|---|---|
| MIME types allowed | `image/jpeg`, `image/png`, `image/webp` |
| Extensions allowed | `.jpg`, `.jpeg`, `.png`, `.webp` |
| Max file size | `UPLOAD_MAX_SIZE_MB` × 1MB (default: 5MB) |
| Max files | 1 ไฟล์ต่อ request |
| Storage | memory buffer → UUID filename → disk |
| Filename | `crypto.randomUUID()` + original extension (ป้องกัน path traversal) |

---

## Error Handling Security

**File:** `src/lib/error-handler.ts` → `globalErrorHandler()`

ใน Production:
- ไม่เปิดเผย stack trace หรือ error details ใน response
- `isProduction ? undefined : { message, stack }`

Error types handled:
- `ApiError` — structured error with code
- `MongoServerError (code 11000)` — duplicate key → 409
- `CastError` — invalid ObjectId → 400
- `SyntaxError (entity.parse.failed)` — JSON parse error → 400
- `MulterError` — file upload error → 400
- `JsonWebTokenError` — invalid JWT → 401
- `TokenExpiredError` — expired JWT → 401
- payload too large (status 413) → 413
- Unknown errors → 500

---

## Config Validation

**File:** `src/lib/config.ts` → `validateConfig()`

Server **จะไม่ start** ถ้า:
- `JWT_SECRET === "your-secret-key-change-in-production"`
- `ENCRYPTION_SECRET === "default-secret-change-this"`
- `SEPOLIA_RPC_URL === "https://sepolia.infura.io/v3/"` (placeholder)
- `NODE_ENV=production` แต่ `CORS_ORIGIN` ว่าง

---

## Security Summary Table

| Category | Implementation | Status |
|---|---|---|
| CORS | Origin allowlist, credentials control | ✅ |
| Security Headers | Helmet (14+ headers) | ✅ |
| Rate Limiting | 3 tiers (express-rate-limit) | ✅ |
| Input Sanitization | XSS pattern removal (recursive) | ✅ |
| Content-Type Validation | 415 for non-JSON POST/PUT/PATCH | ✅ |
| Body Size Limit | 100KB max | ✅ |
| IP Blocking | In-memory Set (not persistent) | ⚠️ |
| JWT Auth | Access 15m + Refresh 7d | ✅ |
| Token Revocation | Redis JTI blacklist (7d TTL) | ✅ |
| RBAC | role: user \| officer | ✅ |
| Password Hashing | bcrypt salt 12 | ✅ |
| Password Strength | Register: full check; Change: min 6 only | ⚠️ |
| Private Key Encryption | AES-256-CBC + random IV | ✅ |
| URL Safety | Block private IPs, metadata endpoints | ✅ |
| File Upload | MIME + extension check + UUID filename | ✅ |
| Error Handling | No stack trace in production | ✅ |
| Config Validation | Reject default secrets at startup | ✅ |
| Request Logging | Method + path + status + duration + IP | ✅ |

**⚠️ Known Weaknesses:**
1. IP blocking ไม่ persistent (หายตอน restart)
2. Password change ใช้ validation หละหลวมกว่า register
3. authMiddleware ทำ MongoDB query ทุก request (performance)
4. Wallet/users/app/notifications routes ใช้ raw `res.json()` ไม่ผ่าน standardized error handler
