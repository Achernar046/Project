# API Security Fixes — 2026-03-31

> เอกสารบันทึกการแก้ไขปัญหา Security ใน WasteCoin API  
> อัปเดต: มิถุนายน 2026 (ตรวจสอบจาก source code ปัจจุบัน)

## สรุปการแก้ไขทั้งหมด

เอกสารนี้สรุปการแก้ไขด้านความปลอดภัยที่ implement ในระบบ

---

## #1 — Token System: เปลี่ยนจาก Single Token เป็น Token Pair

**สถานะ:** ✅ Implemented (ตรวจสอบจาก source code)

### ปัญหาเดิม
- ใช้ JWT single token ไม่มี expiry ที่สั้น
- ไม่มีกลไก revoke token เมื่อ logout

### การแก้ไข
- **Access Token:** JWT อายุ **15 นาที** signed ด้วย `JWT_SECRET`
- **Refresh Token:** JWT อายุ **7 วัน** ที่มี JTI unique, signed ด้วย `SHA-256(JWT_SECRET + ENCRYPTION_SECRET)`
- **Redis Token Revocation:** revoked JTI เก็บใน Redis key `revoked:<jti>` พร้อม TTL 7 วัน
- Login/Register คืน `{accessToken, refreshToken, expiresIn}` แทน single token

**Files:** `src/lib/auth.ts`, `src/lib/redis.ts`, `src/routes/auth.ts`

---

## #2 — Password Strength Validation

**สถานะ:** ✅ Implemented (register) / ⚠️ Partial (change-password)

### ปัญหาเดิม
- ไม่มี password strength check
- ยอมรับ password สั้นหรืออ่อนแอ

### การแก้ไข (Register)

`validatePasswordStrength()` ใน `src/lib/auth.ts`:
- ≥ 8 ตัวอักษร
- มีตัวพิมพ์ใหญ่ A-Z
- มีตัวพิมพ์เล็ก a-z
- มีตัวเลข 0-9
- มีอักขระพิเศษ `!@#$%^&*(),.?":{}<>`

bcrypt salt rounds เพิ่มจาก 10 → **12**

Error response:
```json
{
  "error": {
    "code": "WEAK_PASSWORD",
    "message": "Weak password",
    "details": ["Password must be at least 8 characters long", ...]
  }
}
```

### ข้อจำกัดที่ยังมีอยู่

> ⚠️ `POST /api/users/change-password` และ `POST /api/app/change-password` ตรวจเพียง min 6 chars ไม่มี strength check

**Files:** `src/lib/auth.ts`, `src/routes/auth.ts`

---

## #3 — Input Sanitization (XSS Prevention)

**สถานะ:** ✅ Implemented

### ปัญหาเดิม
- ไม่มี sanitization ของ input จากผู้ใช้

### การแก้ไข

`sanitizeRequestMiddleware()` ใน `src/lib/security.ts` ทำงาน recursive:

```typescript
// ลบ patterns อันตรายจาก req.query และ req.body
.replace(/<script\b/gi, '')
.replace(/<\/script>/gi, '')
.replace(/javascript:/gi, '')
.replace(/on\w+=/gi, '')
.trim()
```

เพิ่มเติม:
- `sanitizeString(value, maxLength)` ใน `src/lib/validation.ts` — trim + max length
- `normalizeEmail()` — lowercase + trim

**File:** `src/lib/security.ts`, `src/lib/validation.ts`

---

## #4 — Rate Limiting (Brute-force Protection)

**สถานะ:** ✅ Implemented

### ปัญหาเดิม
- ไม่มี rate limiting → brute-force login ได้

### การแก้ไข

ใช้ `express-rate-limit` ^8.3.2 (จาก `src/index.ts`):

| Limiter | Target | Max | Window |
|---|---|---|---|
| General | ทุก request | 100 | 15 นาที |
| Auth | `/api/auth/*` | 10 | 15 นาที |
| API | `/api/*` | 200 | 15 นาที |

Response 429:
```json
{
  "success": false,
  "message": "Too many authentication attempts, please try again later",
  "error": { "code": "RATE_LIMIT_EXCEEDED", "message": "Too many authentication attempts" }
}
```

**File:** `src/index.ts`

---

## #5 — Security Headers (Helmet)

**สถานะ:** ✅ Implemented

### ปัญหาเดิม
- ไม่มี security headers

### การแก้ไข

`securityHeadersMiddleware()` ใน `src/lib/security.ts`:

| Header | ค่า |
|---|---|
| `X-Frame-Options` | `DENY` (Clickjacking) |
| `X-Content-Type-Options` | `nosniff` |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains; preload` |
| `X-XSS-Protection` | `1; mode=block` |
| `Referrer-Policy` | `no-referrer` |
| `Content-Security-Policy` | defaultSrc 'self', ห้าม iframe, object |
| `Permissions-Policy` | `geolocation=(), microphone=(), camera=()` |

**File:** `src/lib/security.ts`

---

## #6 — Content-Type Validation

**สถานะ:** ✅ Implemented

### ปัญหาเดิม
- รับ POST request ที่ไม่ใช่ JSON

### การแก้ไข

`contentTypeValidationMiddleware()` ใน `src/lib/security.ts`:
- POST/PUT/PATCH: ต้องส่ง `Content-Type: application/json`
- ยกเว้น `multipart/form-data` (file upload)

Response 415:
```json
{
  "success": false,
  "message": "Unsupported Media Type. Content-Type must be application/json",
  "error": { "code": "UNSUPPORTED_MEDIA_TYPE", "message": "Content-Type must be application/json" }
}
```

---

## #7 — URL Safety Validation (SSRF Prevention)

**สถานะ:** ✅ Implemented

### ปัญหาเดิม
- ผู้ใช้สามารถส่ง `image_url` ชี้ไปที่ internal services

### การแก้ไข

`isSafeUrl()` ใน `src/lib/validation.ts` block:
- non-HTTP/HTTPS protocols
- `localhost`, `127.0.0.1`, `0.0.0.0`
- `169.254.169.254` (AWS metadata endpoint)
- `metadata.google.internal` (GCP metadata)
- Private IP ranges: `10.x.x.x`, `172.16-31.x.x`, `192.168.x.x`, `127.x.x.x`, `169.254.x.x`

ใช้ใน:
- `POST /api/waste/submit` → `image_url`
- `POST /api/rewards/add`, `PUT /api/rewards/update/:id` → `image_url`

---

## #8 — MongoDB Indexes

**สถานะ:** ✅ Implemented

### ปัญหาเดิม
- ไม่มี index → Full Collection Scan ทุก query

### การแก้ไข

`ensureIndexes(db)` ใน `src/lib/db-indexes.ts` รันตอน startup:

```
users: email (unique), user_id (unique)
wallets: user_id (unique), address (unique)
waste_submissions: {user_id, created_at}, {status, created_at}
transactions: {user_id, created_at}, blockchain_tx_hash (sparse)
notifications: {user_id, is_read, created_at}
redemption_history: {user_id, created_at}
gas_topups: {user_id, created_at}
```

Idempotent — ไม่ crash ถ้า index มีอยู่แล้ว

---

## #9 — Image Upload Security

**สถานะ:** ✅ Implemented

### ปัญหาเดิม
- ไม่มีการ upload ไฟล์จริง รับแค่ URL string

### การแก้ไข

Multer middleware ใน `src/lib/upload.ts`:
- MIME type check: `image/jpeg`, `image/png`, `image/webp`
- Extension check: `.jpg`, `.jpeg`, `.png`, `.webp`
- Max size: `UPLOAD_MAX_SIZE_MB` MB (default 5)
- Max files: 1 ต่อ request
- Filename: `crypto.randomUUID()` + original extension (ป้องกัน path traversal)
- Memory storage → UUID filename → disk

---

## #10 — Config Validation at Startup

**สถานะ:** ✅ Implemented

### ปัญหาเดิม
- ไม่มีการตรวจ env vars ก่อน start

### การแก้ไข

`validateConfig()` ใน `src/lib/config.ts` — server ไม่ start ถ้า:
- `JWT_SECRET` ยังเป็น default value
- `ENCRYPTION_SECRET` ยังเป็น default value
- `SEPOLIA_RPC_URL` ยังเป็น placeholder
- `NODE_ENV=production` + `CORS_ORIGIN` ว่าง

---

## สถานะสรุป

| # | ปัญหา | สถานะ |
|---|---|---|
| 1 | Token pair + revocation | ✅ |
| 2 | Password strength (register) | ✅ |
| 2a | Password strength (change-password) | ⚠️ min 6 เท่านั้น |
| 3 | Input sanitization | ✅ |
| 4 | Rate limiting | ✅ |
| 5 | Security headers | ✅ |
| 6 | Content-Type validation | ✅ |
| 7 | SSRF prevention (isSafeUrl) | ✅ |
| 8 | MongoDB indexes | ✅ |
| 9 | Image upload security | ✅ |
| 10 | Config validation | ✅ |
| — | IP blocking (not persistent) | ⚠️ In-memory only |
| — | authMiddleware DB query per-request | ⚠️ Performance concern |
| — | Inconsistent response format | ⚠️ Some routes use raw res.json() |
