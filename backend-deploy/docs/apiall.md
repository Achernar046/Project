# WasteCoin Backend — All API Quick Reference

> อัปเดตล่าสุด: มิถุนายน 2026 (ตรวจสอบจาก source code จริง)
> สำหรับรายละเอียด request/response เต็ม ดู [api.md](./api.md)

Base URL: `http://<host>:3000`

## Auth Header

```
Authorization: Bearer <accessToken>
```

Access Token: อายุ 15 นาที | Refresh Token: อายุ 7 วัน

---

## Public

| Method | Path | Body / Notes | Response |
|---|---|---|---|
| `GET` | `/health` | — | `{status, environment, message, timestamp}` |
| `GET` | `/ready` | — | `{status, database, timestamp}` / 503 |
| `POST` | `/api/auth/register` | `{user_id, name, email, password}` password≥8+upper+lower+digit+special | 201 `{user, tokens}` |
| `POST` | `/api/auth/login` | `{email, password}` | 200 `{user, tokens}` |
| `POST` | `/api/auth/refresh` | `{refreshToken}` | 200 `{tokens}` |
| `POST` | `/api/auth/logout` | `{refreshToken}` (optional) | 200 |

> **tokens** = `{accessToken, refreshToken, expiresIn}`

---

## User (auth required)

| Method | Path | Body / Query | Response | Notes |
|---|---|---|---|---|
| `POST` | `/api/waste/submit` | multipart `image` file หรือ JSON `image_url` + `waste_type` + `weight_kg` | 201 `{submission}` | Paginated route: ไม่ใช่ |
| `GET` | `/api/waste/my-submissions` | `?page=1&limit=20` | 200 paginated | |
| `GET` | `/api/wallet/balance` | — | `{walletAddress, balance, symbol}` | raw format |
| `GET` | `/api/wallet/info` | — | `{userId, name, email, role, walletAddress}` | raw format |
| `POST` | `/api/wallet/transfer` | `{to_address, amount}` | `{message, txHash}` | raw format |
| `GET` | `/api/wallet/export` | — | `{address, privateKey, warning}` | ENABLE_WALLET_EXPORT=true เท่านั้น |
| `GET` | `/api/transactions/history` | — | array (limit 20) | raw, ไม่ paginated |
| `GET` | `/api/users/profile` | — | `{...user, stats}` | raw, ไม่มี password_hash |
| `PUT` | `/api/users/profile` | `{name?, profile_image?, phone_number?}` | `{message}` | raw |
| `POST` | `/api/users/change-password` | `{currentPassword, newPassword}` min 6 | `{message}` | raw |
| `GET` | `/api/app/dashboard` | — | `{profile, wallet, recentTransactions}` (5 txns) | raw |
| `POST` | `/api/app/verify-identity` | `{password}` | `{message, verified}` | raw |
| `POST` | `/api/app/change-password` | `{old_password, new_password}` min 6 | `{message}` | raw |
| `GET` | `/api/rewards/list` | `?page=1&limit=20&category=<cat>` | paginated (stock>0) | |
| `POST` | `/api/rewards/redeem` | `{reward_id}` | `{reward_name, txHash}` | |
| `GET` | `/api/rewards/history` | `?page=1&limit=20` | paginated | |
| `GET` | `/api/notifications` | — | array (sort DESC) | raw, ไม่ paginated |
| `PUT` | `/api/notifications/read-all` | — | `{message}` | raw |
| `PUT` | `/api/notifications/:id/read` | — | `{message}` | raw, ตรวจ ownership |

---

## Officer (officer role required)

| Method | Path | Body / Notes | Response | Notes |
|---|---|---|---|---|
| `GET` | `/api/waste/pending` | `?page=1&limit=20` | paginated + user info | |
| `POST` | `/api/waste/approve` | `{submission_id, coin_amount}` | `{txHash, coin_amount}` | |
| `POST` | `/api/officer/add-coins` | `{user_id, amount}` | 201 `{message, transaction}` | |
| `GET` | `/api/officer/transactions` | — | array (limit 50, ไม่ paginated) | |
| `GET` | `/api/officer/rewards/report` | — | `{inventory, history}` | |
| `GET` | `/api/users/list` | — | array role=user only (ไม่ paginated) | |
| `POST` | `/api/rewards/add` | `{name, coin_price, stock, description?, image_url?, category?}` | 201 | |
| `PUT` | `/api/rewards/update/:id` | partial fields | 200 | |
| `DELETE` | `/api/rewards/delete/:id` | — | 200 | |

---

## Response Format Summary

| Routes | Format |
|---|---|
| auth, waste, rewards | `{success, message, data, meta}` / paginated |
| wallet, users, app, notifications, transactions, officer-add-coins | raw `{...}` |

**Pagination:**
```json
{
  "success": true,
  "data": [...],
  "pagination": { "page": 1, "limit": 20, "total": 100, "totalPages": 5, "hasNext": true, "hasPrev": false },
  "meta": { "timestamp": "...", "path": "...", "method": "..." }
}
```

---

## Rate Limits

| Target | Limit | Window |
|---|---|---|
| All requests | 100 req | 15 min |
| `/api/auth/*` | 10 req | 15 min |
| `/api/*` | 200 req | 15 min |

---

## Common Error Codes

| Code | HTTP | Description |
|---|---|---|
| `UNAUTHORIZED` | 401 | No/invalid token |
| `FORBIDDEN` | 403 | ไม่ใช่ officer |
| `NOT_FOUND` | 404 | Resource ไม่พบ |
| `BAD_REQUEST` | 400 | Input validation fail |
| `WEAK_PASSWORD` | 400 | Password ไม่ผ่าน strength |
| `USER_ID_EXISTS` | 409 | user_id ซ้ำ |
| `EMAIL_EXISTS` | 409 | email ซ้ำ |
| `RATE_LIMIT_EXCEEDED` | 429 | Rate limit เกิน |
| `UNSUPPORTED_MEDIA_TYPE` | 415 | Content-Type ไม่ถูก |
| `UPLOAD_ERROR` | 400 | ไฟล์ upload ผิดพลาด |
| `INTERNAL_ERROR` | 500 | Server error |
